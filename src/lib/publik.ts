import { supabase } from './supabase'

const AWAL = 'sims_pub:'

function baca(kunci: string): unknown | undefined {
  try {
    const t = window.localStorage.getItem(AWAL + kunci)
    return t === null ? undefined : JSON.parse(t)
  } catch { return undefined }
}

function simpan(kunci: string, data: unknown) {
  try {
    const t = JSON.stringify(data)
    if (t.length < 200_000) window.localStorage.setItem(AWAL + kunci, t)
  } catch { /* penyimpanan penuh atau diblokir: abaikan */ }
}

/**
 * Membaca RPC publik lewat penyangga CDN (/api/publik). Jawabannya sama untuk semua pengunjung, jadi tidak perlu
 * menembus ke Supabase setiap kali.
 *
 * Saat server sibuk, penyangga menjawab galat JSON. Panggilan langsung ke Supabase TIDAK dicoba lagi (itu menambah
 * beban pada server yang sedang kewalahan). Yang dipakai adalah salinan terakhir yang berhasil dimuat di peramban ini.
 * Panggilan langsung hanya untuk keadaan penyangga memang tidak ada (pengembangan lokal): jawabannya bukan JSON.
 */
export async function rpcPublik<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<{ data: T | null; error: { message: string } | null }> {
  const kunci = fn + (args && Object.keys(args).length ? JSON.stringify(args) : '')
  const cadangan = (pesan: string) => {
    const lama = baca(kunci)
    return lama === undefined ? { data: null, error: { message: pesan } } : { data: lama as T, error: null }
  }

  const kendali = new AbortController()
  const pewaktu = window.setTimeout(() => kendali.abort(), 30_000)
  let adaPenyangga = false
  try {
    const q = new URLSearchParams({ fn })
    if (args && Object.keys(args).length) q.set('a', JSON.stringify(args))
    const r = await fetch(`/api/publik?${q}`, { signal: kendali.signal })
    if ((r.headers.get('content-type') ?? '').includes('json')) {
      adaPenyangga = true
      if (r.ok) {
        const data = (await r.json()) as T
        simpan(kunci, data)
        return { data, error: null }
      }
    }
  } catch (e) {
    // Waktu habis berarti penyangga ada tetapi hulunya lambat. Galat jaringan lain: coba jalur langsung.
    if ((e as { name?: string } | null)?.name === 'AbortError') adaPenyangga = true
  } finally { window.clearTimeout(pewaktu) }

  if (adaPenyangga) return cadangan('Server sedang sibuk. Coba lagi beberapa menit lagi.')

  const { data, error } = await supabase.rpc(fn, args)
  if (error) return cadangan(error.message)
  simpan(kunci, data)
  return { data: data as T, error: null }
}
