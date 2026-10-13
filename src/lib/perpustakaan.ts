// Perpustakaan digital: tipe, hook izin, tautan berkas bertanda tangan, dan unggah buku.
import { useEffect, useState } from 'react'
import { panggil } from './rpc'
import { kodeBerkas } from './gambar'
import { supabase } from './supabase'
import { bukaPdf, buatSampul, tutupPdf } from './pdf'

export const BUCKET = 'perpustakaan'
export const BATAS_BUKU = 50 * 1024 * 1024

export type IzinPerpus = { baca: boolean; kelola: boolean; atur_pengelola: boolean; peran: string | null }
export type StatusBuku = 'draf' | 'terbit' | 'arsip'
export type BukuPerpus = {
  id: string; judul: string; penulis: string | null; penerbit: string | null; tahun_terbit: number | null; isbn: string | null
  kategori: string; mapel: string | null; tingkat: string | null; deskripsi: string | null; jumlah_halaman: number | null
  sampul_path: string | null; status: StatusBuku; lisensi_berakhir: string | null; ukuran_byte: number | null
  sumber_perolehan: string; nomor_lisensi: string | null; tanggal_perolehan: string | null
  berkas_path: string | null; halaman_terakhir: number | null; halaman_terjauh: number | null; pembaca: number | null; dirujuk: number | null
}
export type BukuBuka = { id: string; judul: string; penulis: string | null; penerbit: string | null; tahun_terbit: number | null; kategori: string; jumlah_halaman: number | null; berkas_path: string; halaman_terakhir: number }
export type Rujukan = { id: string; buku_id: string; judul: string; penulis: string | null; tahun_terbit: number | null; sampul_path: string | null; hal_mulai: number | null; hal_akhir: number | null; catatan: string | null }
export type Pengelola = { id: string; ptk_id: string; nama: string; peran: 'penanggung_jawab' | 'petugas'; aktif: boolean; sumber: 'manual' | 'otomatis' }

export const SUMBER = [['beli', 'Pembelian'], ['bos', 'Dana BOS'], ['hibah', 'Hibah'], ['lainnya', 'Lainnya']] as const
export const TINGKAT = ['Semua', 'X', 'XI', 'XII'] as const
export const KATEGORI_UMUM = ['Umum', 'Buku teks pelajaran', 'Referensi', 'Fiksi', 'Nonfiksi', 'Kejuruan', 'Informatika', 'Bahasa', 'Panduan guru']

export function useIzinPerpus() {
  const [izin, setIzin] = useState<IzinPerpus | null>(null)
  useEffect(() => {
    let batal = false
    panggil<IzinPerpus>('perpus_izin').then((x) => { if (!batal) setIzin(x) }).catch(() => { if (!batal) setIzin({ baca: false, kelola: false, atur_pengelola: false, peran: null }) })
    return () => { batal = true }
  }, [])
  return izin
}

/** Tautan bertanda tangan ke berkas di bucket privat. Berlaku satu jam. */
export async function tautanBerkas(path: string, detik = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, detik)
  if (error || !data) throw new Error('Berkas tidak dapat dibuka. Anda mungkin tidak berwenang, atau buku belum tersedia.')
  return data.signedUrl
}

/** Tautan sampul untuk banyak buku sekaligus. */
export async function tautanSampul(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {}
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
  const hasil: Record<string, string> = {}
  for (const d of data ?? []) if (d.path && d.signedUrl) hasil[d.path] = d.signedUrl
  return hasil
}

/** Hook: peta path sampul ke tautan. */
export function useSampul(paths: (string | null | undefined)[]) {
  const [peta, setPeta] = useState<Record<string, string>>({})
  const kunci = paths.filter(Boolean).join('|')
  useEffect(() => {
    const daftar = kunci ? kunci.split('|') : []
    if (!daftar.length) return
    let batal = false
    tautanSampul(daftar).then((x) => { if (!batal) setPeta(x) }).catch(() => undefined)
    return () => { batal = true }
  }, [kunci])
  return peta
}

export function hapusDariPenyimpanan(paths: (string | null | undefined)[]) {
  const p = paths.filter((x): x is string => !!x)
  if (p.length) void supabase.storage.from(BUCKET).remove(p).catch(() => undefined)
}

export type HasilUnggah = { berkas_path: string; sampul_path: string | null; jumlah_halaman: number; ukuran_byte: number }

/** Memeriksa PDF, membuat sampul dari halaman pertama, lalu mengunggah keduanya ke bucket privat. */
export async function unggahBuku(file: File, npsn: string, onLangkah?: (t: string) => void): Promise<HasilUnggah> {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) throw new Error('Berkas harus PDF.')
  if (file.size <= 0) throw new Error('Berkas kosong.')
  if (file.size > BATAS_BUKU) throw new Error(`Ukuran berkas melebihi batas 50 MB. Kompres PDF dahulu atau bagi per jilid.`)
  onLangkah?.('Membaca PDF...')
  const data = await file.arrayBuffer()
  let doc
  try { doc = await bukaPdf({ data: data.slice(0) }) } catch (e) {
    const n = (e as { name?: string }).name
    throw new Error(n === 'PasswordException' ? 'PDF dikunci dengan kata sandi. Buka kuncinya dahulu.' : 'PDF tidak dapat dibaca. Pastikan berkas tidak rusak.')
  }
  const jumlah = doc.numPages
  onLangkah?.('Membuat sampul...')
  const sampul = await buatSampul(doc).catch(() => null)
  tutupPdf(doc)
  const kode = kodeBerkas()
  const berkasPath = `buku/${npsn}/${kode}.pdf`
  const sampulPath = sampul ? `sampul/${npsn}/${kode}.webp` : null
  onLangkah?.('Mengunggah berkas...')
  const a = await supabase.storage.from(BUCKET).upload(berkasPath, file, { contentType: 'application/pdf', upsert: false })
  if (a.error) throw new Error(/row-level|policy|not authorized/i.test(a.error.message) ? 'Anda tidak berwenang mengunggah buku.' : a.error.message)
  let sp: string | null = null
  if (sampul && sampulPath) {
    const b = await supabase.storage.from(BUCKET).upload(sampulPath, sampul, { contentType: 'image/webp', upsert: false })
    if (!b.error) sp = sampulPath
  }
  return { berkas_path: berkasPath, sampul_path: sp, jumlah_halaman: jumlah, ukuran_byte: file.size }
}

export const ukuranTeks = (b: number | null | undefined) =>
  b == null ? '' : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

/** Format rujukan siap tempel pada jawaban tugas. */
export function formatSitasi(b: { judul: string; penulis: string | null; penerbit?: string | null; tahun_terbit: number | null }, hal?: string | number | null) {
  const bagian = [b.penulis, b.tahun_terbit ? `(${b.tahun_terbit})` : null].filter(Boolean).join(' ')
  return `${bagian ? bagian + '. ' : ''}${b.judul}${b.penerbit ? `. ${b.penerbit}` : ''}${hal ? `, hlm. ${hal}` : ''}.`
}

export const rentangHalaman = (r: { hal_mulai: number | null; hal_akhir: number | null }) =>
  r.hal_mulai == null ? '' : r.hal_akhir && r.hal_akhir !== r.hal_mulai ? `hlm. ${r.hal_mulai}–${r.hal_akhir}` : `hlm. ${r.hal_mulai}`

export const alamatBaca = (id: string, hal?: number | null) => `/portal/perpustakaan/baca/${id}${hal ? `?hal=${hal}` : ''}`
