// Feed kalender sekolah dalam format iCalendar. Bisa dilanggan dari Google Calendar, Apple Calendar, atau Outlook
// ("Tambah kalender dari URL"), sehingga agenda dan pengingat muncul di kalender pribadi dan ikut diperbarui otomatis.
// Dipanggil tanpa sesi (verify_jwt mati). Hanya data publik dari fungsi kalender_publik.
// Parameter opsional: ?kategori=kegiatan,ujian (saring kategori).
import { createClient } from 'npm:@supabase/supabase-js@2'

type Agenda = {
  id: string; judul: string; kategori: string; mulai: string; selesai: string
  jam_mulai: string | null; jam_selesai: string | null; tempat: string | null; keterangan: string | null
}

const KATEGORI: Record<string, string> = {
  kalender_pendidikan: 'Kalender pendidikan', kegiatan: 'Kegiatan', libur: 'Libur', ujian: 'Ujian dan asesmen',
}

const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const lipat = (baris: string) => {
  const enc = new TextEncoder()
  if (enc.encode(baris).length <= 74) return baris
  const hasil: string[] = []
  let sisa = baris
  let batas = 74
  while (enc.encode(sisa).length > batas) {
    let n = Math.min(sisa.length, batas)
    while (enc.encode(sisa.slice(0, n)).length > batas) n--
    hasil.push(sisa.slice(0, n))
    sisa = sisa.slice(n)
    batas = 73
  }
  hasil.push(sisa)
  return hasil.join('\r\n ')
}
const tgl = (iso: string) => iso.replaceAll('-', '')
const hariBerikut = (iso: string) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
const cap = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Metode tidak didukung', { status: 405 })
  const url = new URL(req.url)
  const saring = new Set((url.searchParams.get('kategori') ?? '').split(',').map((x) => x.trim()).filter((x) => x in KATEGORI))

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } })
  const dari = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10)
  const sampai = new Date(Date.now() + 500 * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await db.rpc('kalender_publik', { p_dari: dari, p_sampai: sampai })
  if (error) return new Response('Kalender belum dapat dimuat', { status: 502 })

  const sekarang = cap(new Date())
  const b: string[] = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SIMS SMKN 1 Gunung Sindur//Kalender//ID', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Kalender SMKN 1 Gunung Sindur', 'X-WR-TIMEZONE:Asia/Jakarta', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H',
    'BEGIN:VTIMEZONE', 'TZID:Asia/Jakarta', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0700', 'TZOFFSETTO:+0700', 'TZNAME:WIB', 'END:STANDARD', 'END:VTIMEZONE',
  ]
  for (const a of ((data ?? []) as Agenda[])) {
    if (saring.size && !saring.has(a.kategori)) continue
    b.push('BEGIN:VEVENT', `UID:${a.id}@simsekolah`, `DTSTAMP:${sekarang}`)
    if (a.jam_mulai) {
      const akhir = a.jam_selesai ?? a.jam_mulai
      b.push(`DTSTART;TZID=Asia/Jakarta:${tgl(a.mulai)}T${a.jam_mulai.replace(':', '')}00`)
      b.push(`DTEND;TZID=Asia/Jakarta:${tgl(a.selesai)}T${akhir.replace(':', '')}00`)
    } else {
      b.push(`DTSTART;VALUE=DATE:${tgl(a.mulai)}`, `DTEND;VALUE=DATE:${tgl(hariBerikut(a.selesai))}`)
    }
    b.push(`SUMMARY:${esc(a.judul)}`, `CATEGORIES:${esc(KATEGORI[a.kategori] ?? a.kategori)}`)
    if (a.tempat) b.push(`LOCATION:${esc(a.tempat)}`)
    const ket = [a.keterangan, `Kategori: ${KATEGORI[a.kategori] ?? a.kategori}`].filter(Boolean).join('\n')
    b.push(`DESCRIPTION:${esc(ket)}`)
    if (a.kategori === 'kegiatan' || a.kategori === 'ujian') {
      b.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc('Besok: ' + a.judul)}`, 'TRIGGER:-P1D', 'END:VALARM')
    }
    b.push('END:VEVENT')
  }
  b.push('END:VCALENDAR')

  return new Response(req.method === 'HEAD' ? null : b.map(lipat).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="kalender-smkn1gunungsindur.ics"',
      'Cache-Control': 'public, max-age=900',
      'Access-Control-Allow-Origin': '*',
    },
  })
})
