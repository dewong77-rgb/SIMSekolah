// Berita sekolah: tipe, pembantu tampilan, unggah foto, dan hook data publik.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { panggil } from './rpc'

export const KATEGORI_BERITA = [
  ['kegiatan', 'Kegiatan'], ['prestasi', 'Prestasi'], ['pengumuman', 'Pengumuman'],
  ['kemitraan', 'Kemitraan'], ['akademik', 'Akademik'], ['lainnya', 'Lainnya'],
] as const
export const namaKategori = (k: string) => KATEGORI_BERITA.find((x) => x[0] === k)?.[1] ?? k

export type Foto = { url: string; keterangan: string }
export type BeritaRingkas = {
  slug: string; judul: string; subjudul?: string | null; kategori: string; ringkasan: string | null; gambar_url: string | null; gambar_path?: string | null
  terbit_pada: string; unggulan?: boolean; tema?: string | null; tag?: string[]; byline?: string | null
}
export type BeritaDetail = {
  slug: string; judul: string; subjudul: string | null; kategori: string; ringkasan: string | null; isi: string
  tema: string | null; tag: string[]; foto: Foto[]; byline: string | null; kredit_foto: string | null
  gambar_url: string | null; gambar_path?: string | null; gambar_keterangan: string | null; terbit_pada: string; diperbarui_pada: string
  lainnya: { slug: string; judul: string; terbit_pada: string; gambar_url: string | null; gambar_path?: string | null; kategori: string }[]
  terbaru: { slug: string; judul: string; terbit_pada: string }[]
}
export type Penanda = {
  tag: { nama: string; jumlah: number }[]; tema: { nama: string; jumlah: number }[]; kategori: { nama: string; jumlah: number }[]
}
export type BeritaKelola = {
  id: string; slug: string; judul: string; kategori: string; ringkasan: string | null; status: string; unggulan: boolean
  terbit_pada: string | null; penulis_nama: string; diperbarui_pada: string; bisa_ubah: boolean
  gambar_url: string | null; gambar_path?: string | null; tema: string | null; tag: string[]
}

export const NAMA_BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** Tanggal dari cap waktu penuh (timestamptz). */
export const tglBerita = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
export const tglJamBerita = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(/\./g, ':') + ' WIB' : ''
export const tglRingkas = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  const selisih = (Date.now() - d.getTime()) / 3600000
  if (selisih >= 0 && selisih < 1) return 'Baru saja'
  if (selisih >= 1 && selisih < 24) return `${Math.floor(selisih)} jam lalu`
  return `${d.getDate()} ${NAMA_BULAN_PENDEK[d.getMonth()]} ${d.getFullYear()}`
}

export const waktuBaca = (isi: string) => Math.max(1, Math.round(isi.split(/\s+/).filter(Boolean).length / 200))

/** Alamat gambar yang sah: https atau jalur lokal situs sendiri. */
export const gambarAman = (u: string | null | undefined) => (u && (/^https:\/\//i.test(u) || /^\/[A-Za-z0-9]/.test(u)) ? u : null)

export const slugTanda = (s: string) => encodeURIComponent(s)

// ---------- Isi berita: teks biasa dengan beberapa penanda sederhana ----------

export type Blok =
  | { t: 'p'; teks: string }
  | { t: 'h'; teks: string }
  | { t: 'kutip'; teks: string }
  | { t: 'daftar'; butir: string[] }
  | { t: 'foto'; no: number }

/** Memecah isi menjadi blok. Format: baris kosong = paragraf baru; "## " = subjudul; "> " = kutipan; "- " = daftar; "[foto:2]" = foto ke-2 dari galeri. */
export function uraiIsi(isi: string): Blok[] {
  const hasil: Blok[] = []
  for (const mentah of isi.replace(/\r/g, '').split(/\n{2,}/)) {
    const b = mentah.trim()
    if (!b) continue
    const foto = /^\[foto:(\d{1,2})\]$/i.exec(b)
    if (foto) { hasil.push({ t: 'foto', no: Number(foto[1]) }); continue }
    if (/^##\s+/.test(b)) { hasil.push({ t: 'h', teks: b.replace(/^##\s+/, '') }); continue }
    if (/^>\s?/.test(b)) { hasil.push({ t: 'kutip', teks: b.split('\n').map((l) => l.replace(/^>\s?/, '')).join(' ') }); continue }
    if (b.split('\n').every((l) => /^[-*]\s+/.test(l))) { hasil.push({ t: 'daftar', butir: b.split('\n').map((l) => l.replace(/^[-*]\s+/, '')) }); continue }
    hasil.push({ t: 'p', teks: b })
  }
  return hasil
}

// ---------- Unggah foto ----------

export const MAKS_FOTO = 12
const SISI_MAKS = 1600
const BATAS_BYTE = 2 * 1024 * 1024

/** Alamat gambar berita: berkas unggahan (gambar_path, bucket "publik") didahulukan, lalu tautan https atau jalur lokal. */
export function urlGambarBerita(b: { gambar_path?: string | null; gambar_url?: string | null }): string | null {
  if (b.gambar_path) return supabase.storage.from('publik').getPublicUrl(b.gambar_path).data.publicUrl
  return gambarAman(b.gambar_url)
}

/** Mengecilkan foto ke sisi terpanjang 1600 px dan mengubahnya ke WebP agar ringan di ponsel pembaca. */
export async function kecilkanFoto(f: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(f.type)) throw new Error('Gunakan foto berformat JPG, PNG, atau WebP.')
  if (f.size > 25 * 1024 * 1024) throw new Error('Foto terlalu besar. Pilih foto di bawah 25 MB.')
  let bmp: ImageBitmap
  try { bmp = await createImageBitmap(f) } catch { throw new Error('Foto tidak dapat dibaca. Coba berkas lain.') }
  const skala = Math.min(1, SISI_MAKS / Math.max(bmp.width, bmp.height))
  const kanvas = document.createElement('canvas')
  kanvas.width = Math.max(1, Math.round(bmp.width * skala)); kanvas.height = Math.max(1, Math.round(bmp.height * skala))
  const ctx = kanvas.getContext('2d')
  if (!ctx) throw new Error('Peramban tidak dapat memproses foto.')
  ctx.drawImage(bmp, 0, 0, kanvas.width, kanvas.height)
  bmp.close()
  const blob = await new Promise<Blob | null>((r) => kanvas.toBlob(r, 'image/webp', 0.82))
  if (!blob || blob.type !== 'image/webp') throw new Error('Peramban ini tidak dapat memproses foto. Gunakan peramban yang lebih baru.')
  if (blob.size > BATAS_BYTE) throw new Error('Foto masih lebih dari 2 MB setelah dikecilkan. Pilih foto lain.')
  return blob
}

/** Mengunggah satu foto ke bucket publik, folder berita/{tahun}/{id penulis}/, dan mengembalikan alamat publiknya. */
export async function unggahFotoBerita(f: File): Promise<string> {
  const { data: u } = await supabase.auth.getUser()
  const uid = u.user?.id
  if (!uid) throw new Error('Sesi berakhir. Masuk kembali.')
  const blob = await kecilkanFoto(f)
  const jalur = `berita/${new Date().getFullYear()}/${uid}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.webp`
  const { error } = await supabase.storage.from('publik').upload(jalur, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false })
  if (error) throw new Error(/row-level|not authorized|policy/i.test(error.message) ? 'Anda tidak berwenang mengunggah foto berita.' : error.message)
  return supabase.storage.from('publik').getPublicUrl(jalur).data.publicUrl
}

// ---------- Data publik ----------

export type Saring = { kategori?: string | null; tag?: string | null; tema?: string | null; cari?: string | null }

export function useBeritaPublik(batas = 12, saring: Saring | string | null = null, mulai = 0) {
  const s: Saring = typeof saring === 'string' || saring === null ? { kategori: saring } : saring
  const [hasil, setHasil] = useState<{ total: number; baris: BeritaRingkas[] } | null>(null)
  const [galat, setGalat] = useState(false)
  const kunci = `${s.kategori ?? ''}|${s.tag ?? ''}|${s.tema ?? ''}|${s.cari ?? ''}`
  useEffect(() => {
    let batal = false
    setHasil(null); setGalat(false)
    panggil<{ total: number; baris: BeritaRingkas[] }>('berita_publik', {
      p_kategori: s.kategori ?? null, p_batas: batas, p_mulai: mulai, p_tag: s.tag ?? null, p_tema: s.tema ?? null, p_cari: s.cari ?? null,
    }).then((x) => { if (!batal) setHasil(x) }).catch(() => { if (!batal) setGalat(true) })
    return () => { batal = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batas, kunci, mulai])
  return { hasil, galat }
}

export function usePenanda() {
  const [p, setP] = useState<Penanda | null>(null)
  useEffect(() => {
    let batal = false
    panggil<Penanda>('berita_penanda').then((x) => { if (!batal) setP(x) }).catch(() => { if (!batal) setP({ tag: [], tema: [], kategori: [] }) })
    return () => { batal = true }
  }, [])
  return p
}
