// Penyangga baca untuk data publik. Beranda memanggil enam RPC yang hasilnya sama untuk semua pengunjung.
// Tanpa penyangga ini tiap kunjungan menembus ke Supabase (kolam koneksi PostgREST hanya 10), sehingga lonjakan
// pengunjung menghasilkan PGRST003 dan 504. Kini CDN Vercel menyimpan jawabannya dan Supabase menerima kira-kira
// satu permintaan per fungsi per menit. Bila Supabase gagal, jawaban lama tetap disajikan (stale-if-error).

declare const process: { env: Record<string, string | undefined> }

type Req = { query: Record<string, string | string[] | undefined> }
type Res = {
  status: (n: number) => Res
  setHeader: (k: string, v: string) => void
  send: (b: string) => void
}

// Hanya fungsi baca publik tanpa identitas pengguna. Nilai: detik penyimpanan di CDN.
const TTL: Record<string, number> = {
  profil_sekolah_publik: 300,
  jurusan_profil_publik: 300,
  jam_bel_publik: 300,
  kalender_publik: 120,
  berita_publik: 60,
  statistik_kunjungan: 120,
}

const URL_SUPABASE = process.env.VITE_SUPABASE_URL ?? 'https://myjdtybkfgscerdhyemb.supabase.co'
const KUNCI = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_3_nSHpyNyPTRIv2y0zD01A_dDeyGzB6'

// Rincian galat hulu (status dan pesan PostgREST) ikut dikirim: tanpanya, kegagalan di Supabase tampak sama dengan
// permintaan yang salah. Isinya hanya pesan galat publik, tanpa kunci atau data.
const tolak = (res: Res, kode: number, hulu?: { status?: number; pesan?: string }) => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(kode).send(JSON.stringify({ galat: true, ...hulu }))
}

export default async function handler(req: Req, res: Res) {
  const fn = String(req.query.fn ?? '')
  const ttl = TTL[fn]
  if (!ttl) return tolak(res, 400)

  const mentah = String(req.query.a ?? '{}')
  if (mentah.length > 400) return tolak(res, 400)
  let args: unknown
  try { args = JSON.parse(mentah) } catch { return tolak(res, 400) }
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return tolak(res, 400)

  const kendali = new AbortController()
  const pewaktu = setTimeout(() => kendali.abort(), 25_000)
  try {
    const r = await fetch(`${URL_SUPABASE}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: KUNCI, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: kendali.signal,
    })
    if (!r.ok) return tolak(res, r.status >= 500 || r.status === 429 ? 502 : 400, { status: r.status, pesan: (await r.text()).slice(0, 300) })
    const teks = await r.text()
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    // max-age pendek: pindah halaman di tab yang sama tidak perlu ke CDN lagi.
    res.setHeader('Cache-Control', `public, max-age=30, s-maxage=${ttl}, stale-while-revalidate=600, stale-if-error=86400`)
    res.status(200).send(teks)
  } catch (e) {
    const g = e as { name?: string; message?: string; cause?: { code?: string; message?: string } }
    tolak(res, 502, { pesan: `${g.name ?? 'Error'}: ${g.message ?? ''} ${g.cause?.code ?? ''} ${g.cause?.message ?? ''}`.trim().slice(0, 300) })
  } finally {
    clearTimeout(pewaktu)
  }
}
