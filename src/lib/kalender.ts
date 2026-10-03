// Kalender sekolah dan jam bel: pembacaan data publik, waktu WIB, posisi jam pelajaran saat ini, dan ekspor ke kalender pribadi.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Kategori = 'kalender_pendidikan' | 'kegiatan' | 'libur' | 'ujian'
export type Agenda = {
  id: string; judul: string; kategori: Kategori; mulai: string; selesai: string
  jam_mulai: string | null; jam_selesai: string | null; tempat: string | null; keterangan: string | null; tampil_beranda: boolean
}
export type JamBel = { kelompok: 'senin_kamis' | 'jumat'; urutan: number; label: string; jenis: 'pelajaran' | 'istirahat' | 'lainnya'; mulai: string; selesai: string }

export const KATEGORI: Record<Kategori, { label: string; warna: string }> = {
  kalender_pendidikan: { label: 'Kalender pendidikan', warna: '#1a3e6f' },
  kegiatan: { label: 'Kegiatan sekolah', warna: '#b7791f' },
  libur: { label: 'Libur', warna: '#b3261e' },
  ujian: { label: 'Ujian dan asesmen', warna: '#6b46c1' },
}
export const URUT_KATEGORI = Object.keys(KATEGORI) as Kategori[]

export const URL_ICS = `${import.meta.env.VITE_SUPABASE_URL ?? 'https://myjdtybkfgscerdhyemb.supabase.co'}/functions/v1/kalender-ics`

// ------------------------------------------------------------ waktu WIB
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' })
export type Wib = { tanggal: string; hari: number; jam: number; menit: number; detik: number; menitHari: number }
const HARI = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export function wib(d: Date = new Date()): Wib {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]))
  const jam = Number(p.hour), menit = Number(p.minute)
  return { tanggal: `${p.year}-${p.month}-${p.day}`, hari: HARI.indexOf(p.weekday), jam, menit, detik: Number(p.second), menitHari: jam * 60 + menit }
}
export const useSekarang = (ms = 1000) => {
  const [n, setN] = useState(() => wib())
  useEffect(() => { const t = setInterval(() => setN(wib()), ms); return () => clearInterval(t) }, [ms])
  return n
}
export const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
export const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
export const tanggalLengkap = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${NAMA_HARI[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d} ${NAMA_BULAN[m - 1]} ${y}` }
export const tanggalPendek = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${NAMA_BULAN[m - 1].slice(0, 3)} ${y}` }
export const tambahHari = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
export const selisihHari = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000)
export const jamTitik = (h: string | null) => (h ?? '').replace(':', '.')
export const menitDari = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + b }

/** Keterangan jarak: "Hari ini", "Besok", "3 hari lagi", atau "Berlangsung" bila rentang mencakup hari ini. */
export function jarak(a: Pick<Agenda, 'mulai' | 'selesai'>, hariIni: string) {
  if (a.mulai <= hariIni && a.selesai >= hariIni) return a.mulai === a.selesai ? 'Hari ini' : 'Berlangsung'
  const n = selisihHari(hariIni, a.mulai)
  return n === 1 ? 'Besok' : n > 1 ? `${n} hari lagi` : `${-n} hari lalu`
}

// ------------------------------------------------------------ jam pelajaran saat ini
export type Posisi =
  | { status: 'libur'; alasan: string }
  | { status: 'akhir_pekan' }
  | { status: 'belum_diatur' }
  | { status: 'sebelum'; berikutnya: JamBel; menitLagi: number }
  | { status: 'sesi'; slot: JamBel; sisaMenit: number; berikutnya: JamBel | null }
  | { status: 'selesai' }

export function posisiJam(bel: JamBel[], agenda: Agenda[], n: Wib): Posisi {
  const libur = agenda.find((a) => a.kategori === 'libur' && a.mulai <= n.tanggal && a.selesai >= n.tanggal)
  if (libur) return { status: 'libur', alasan: libur.judul }
  if (n.hari === 0 || n.hari === 6) return { status: 'akhir_pekan' }
  const set = bel.filter((b) => b.kelompok === (n.hari === 5 ? 'jumat' : 'senin_kamis')).sort((a, b) => menitDari(a.mulai) - menitDari(b.mulai))
  if (!set.length) return { status: 'belum_diatur' }
  const m = n.menitHari
  const i = set.findIndex((s) => m >= menitDari(s.mulai) && m < menitDari(s.selesai))
  if (i >= 0) return { status: 'sesi', slot: set[i], sisaMenit: menitDari(set[i].selesai) - m, berikutnya: set[i + 1] ?? null }
  const nxt = set.find((s) => menitDari(s.mulai) > m)
  if (nxt) return { status: 'sebelum', berikutnya: nxt, menitLagi: menitDari(nxt.mulai) - m }
  return { status: 'selesai' }
}
export function teksPosisi(p: Posisi): string {
  switch (p.status) {
    case 'libur': return `Libur: ${p.alasan}`
    case 'akhir_pekan': return 'Akhir pekan'
    case 'belum_diatur': return 'Jam pelajaran belum diatur'
    case 'sebelum': return `${p.berikutnya.label} mulai ${jamTitik(p.berikutnya.mulai)} (${p.menitLagi} menit lagi)`
    case 'sesi': return `${p.slot.label}, ${jamTitik(p.slot.mulai)} sampai ${jamTitik(p.slot.selesai)}, sisa ${p.sisaMenit} menit`
    case 'selesai': return 'Kegiatan belajar hari ini selesai'
  }
}

// ------------------------------------------------------------ data
let janjiBel: Promise<JamBel[]> | null = null
export const muatJamBel = (segar = false) => {
  if (!janjiBel || segar) {
    janjiBel = Promise.resolve(supabase.rpc('jam_bel_publik')).then(({ data }) => (Array.isArray(data) ? (data as JamBel[]) : [])).catch(() => [])
  }
  return janjiBel
}
export function useJamBel() {
  const [d, setD] = useState<JamBel[] | null>(null)
  useEffect(() => { let b = false; muatJamBel().then((x) => { if (!b) setD(x) }); return () => { b = true } }, [])
  return d
}

export async function muatAgenda(dari: string, sampai: string): Promise<Agenda[]> {
  const { data, error } = await supabase.rpc('kalender_publik', { p_dari: dari, p_sampai: sampai })
  if (error) throw new Error(error.message)
  return (Array.isArray(data) ? data : []) as Agenda[]
}
export function useAgenda(dari: string, sampai: string, versi = 0) {
  const [d, setD] = useState<Agenda[] | null>(null)
  const [galat, setGalat] = useState('')
  useEffect(() => {
    let b = false
    muatAgenda(dari, sampai).then((x) => { if (!b) { setD(x); setGalat('') } }).catch((e: Error) => { if (!b) setGalat(e.message) })
    return () => { b = true }
  }, [dari, sampai, versi])
  return { agenda: d, galat }
}

// ------------------------------------------------------------ ekspor
const tglIcs = (iso: string) => iso.replaceAll('-', '')
const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

export function googleKalender(a: Agenda) {
  const awal = a.jam_mulai ? `${tglIcs(a.mulai)}T${a.jam_mulai.replace(':', '')}00` : tglIcs(a.mulai)
  const akhir = a.jam_mulai ? `${tglIcs(a.selesai)}T${(a.jam_selesai ?? a.jam_mulai).replace(':', '')}00` : tglIcs(tambahHari(a.selesai, 1))
  const q = new URLSearchParams({ action: 'TEMPLATE', text: a.judul, dates: `${awal}/${akhir}`, details: a.keterangan ?? '', location: a.tempat ?? '', ctz: 'Asia/Jakarta' })
  return `https://calendar.google.com/calendar/render?${q.toString()}`
}

export function unduhIcs(daftar: Agenda[], nama = 'kalender-sekolah') {
  const cap = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const b = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SIMS SMKN 1 Gunung Sindur//Kalender//ID', 'CALSCALE:GREGORIAN']
  for (const a of daftar) {
    b.push('BEGIN:VEVENT', `UID:${a.id}@simsekolah`, `DTSTAMP:${cap}`)
    if (a.jam_mulai) {
      b.push(`DTSTART:${tglIcs(a.mulai)}T${a.jam_mulai.replace(':', '')}00`, `DTEND:${tglIcs(a.selesai)}T${(a.jam_selesai ?? a.jam_mulai).replace(':', '')}00`)
    } else b.push(`DTSTART;VALUE=DATE:${tglIcs(a.mulai)}`, `DTEND;VALUE=DATE:${tglIcs(tambahHari(a.selesai, 1))}`)
    b.push(`SUMMARY:${esc(a.judul)}`)
    if (a.tempat) b.push(`LOCATION:${esc(a.tempat)}`)
    if (a.keterangan) b.push(`DESCRIPTION:${esc(a.keterangan)}`)
    if (a.kategori === 'kegiatan' || a.kategori === 'ujian') b.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc('Besok: ' + a.judul)}`, 'TRIGGER:-P1D', 'END:VALARM')
    b.push('END:VEVENT')
  }
  b.push('END:VCALENDAR')
  const url = URL.createObjectURL(new Blob([b.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' }))
  const el = document.createElement('a')
  el.href = url; el.download = `${nama}.ics`; document.body.appendChild(el); el.click(); el.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
