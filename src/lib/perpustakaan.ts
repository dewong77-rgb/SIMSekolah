// Perpustakaan digital: tipe, hook izin, tautan berkas bertanda tangan, dan unggah buku.
import { useEffect, useRef, useState } from 'react'
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
  kategori: string; jenis_buku: string; klasifikasi: string | null; nomor_panggil: string | null; nomor_induk: string | null
  edisi: string | null; kota_terbit: string | null; bahasa: string; subjek: string | null; harga: number | null; jumlah_lisensi: number | null
  mapel: string | null; tingkat: string | null; deskripsi: string | null; jumlah_halaman: number | null
  sampul_path: string | null; status: StatusBuku; lisensi_berakhir: string | null; ukuran_byte: number | null
  sumber_perolehan: string; nomor_lisensi: string | null; tanggal_perolehan: string | null
  berkas_path: string | null; halaman_terakhir: number | null; halaman_terjauh: number | null; dibuka: number | null; dibaca: number | null; pembaca: number | null; dirujuk: number | null
}
export type BukuBuka = { id: string; judul: string; penulis: string | null; penerbit: string | null; tahun_terbit: number | null; kategori: string; jumlah_halaman: number | null; berkas_path: string; halaman_terakhir: number }
export type Rujukan = { id: string; buku_id: string; judul: string; penulis: string | null; tahun_terbit: number | null; sampul_path: string | null; hal_mulai: number | null; hal_akhir: number | null; catatan: string | null }
export type Pengelola = { id: string; ptk_id: string; nama: string; peran: 'penanggung_jawab' | 'petugas'; aktif: boolean; sumber: 'manual' | 'otomatis' }

export const SUMBER = [['beli', 'Pembelian'], ['bos', 'Dana BOS'], ['hibah', 'Hibah'], ['lainnya', 'Lainnya']] as const
export const TINGKAT = ['Semua', 'X', 'XI', 'XII'] as const
export const JENIS_BUKU = [
  ['buku_teks', 'Buku teks pelajaran'], ['pengayaan', 'Buku pengayaan (nonteks)'], ['referensi', 'Referensi'], ['fiksi', 'Fiksi'],
  ['panduan_guru', 'Panduan guru'], ['periodikal', 'Majalah atau jurnal'], ['lainnya', 'Lainnya'],
] as const
export const labelJenis = (k: string) => JENIS_BUKU.find((x) => x[0] === k)?.[1] ?? k

/** Kelas utama Klasifikasi Desimal Dewey (DDC) untuk memilih nomor klasifikasi. */
export const DDC = [
  ['000', 'Karya umum, komputer, informasi'], ['100', 'Filsafat dan psikologi'], ['200', 'Agama'], ['300', 'Ilmu sosial'],
  ['400', 'Bahasa'], ['500', 'Sains dan matematika'], ['600', 'Teknologi dan ilmu terapan'], ['700', 'Seni dan rekreasi'],
  ['800', 'Sastra'], ['900', 'Sejarah dan geografi'],
] as const

/** Nomor panggil: klasifikasi, tiga huruf pertama penulis, dan huruf pertama judul. Contoh: 004 TIM i. */
export function nomorPanggil(klasifikasi: string, penulis: string, judul: string) {
  const huruf = (t: string) => t.normalize('NFD').replace(/[^A-Za-z]/g, '')
  const p = huruf(penulis).slice(0, 3).toUpperCase()
  const j = huruf(judul.replace(/^(the|a|an|buku|modul)\s+/i, '')).slice(0, 1).toLowerCase()
  return [klasifikasi.trim(), p, j].filter(Boolean).join(' ')
}

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

export type AsalBaca = { jenis: 'pertemuan' | 'tugas'; id: string }
export const alamatBaca = (id: string, hal?: number | null, asal?: AsalBaca) => {
  const q = new URLSearchParams()
  if (hal) q.set('hal', String(hal))
  if (asal) { q.set('dari', asal.jenis); q.set('ref', asal.id) }
  const t = q.toString()
  return `/portal/perpustakaan/baca/${id}${t ? `?${t}` : ''}`
}

/** Mencatat bahwa pembaca mengambil rujukan (kutipan ke tugas, salin rujukan, salin tautan). Kegagalan tidak mengganggu pembaca. */
export function catatKutipan(buku: string, cara: 'sisip_tugas' | 'salin_rujukan' | 'salin_tautan', tugas?: string | null, halaman?: string | number | null) {
  void panggil('perpus_kutipan_catat', { p_buku: buku, p_cara: cara, p_tugas: tugas ?? null, p_halaman: halaman == null ? null : String(halaman) }).catch(() => undefined)
}

/**
 * Mencatat durasi baca. Detik hanya bertambah saat tab terlihat dan pembaca beraktivitas dalam 60 detik terakhir.
 * Dikirim tiap 30 detik, dan saat tab disembunyikan atau ditinggalkan. Server membatasi tambahan detik agar tidak bisa digelembungkan.
 */
export function useDenyutBaca(bukuId: string, halaman: number, siap: boolean, asal?: AsalBaca) {
  const sesi = useRef<string | null>(null)
  const detik = useRef(0)
  const terakhirAktif = useRef(Date.now())
  const hal = useRef(halaman)
  hal.current = halaman
  useEffect(() => { terakhirAktif.current = Date.now() }, [halaman])
  useEffect(() => {
    if (!siap) return
    let hidup = true
    let sedangKirim = false
    const kirim = async () => {
      if (sedangKirim) return
      sedangKirim = true
      const tambah = detik.current
      detik.current = 0
      try {
        const id = await panggil<string | null>('perpus_sesi_denyut', {
          p_sesi: sesi.current, p_buku: bukuId, p_halaman: hal.current, p_detik: tambah, p_asal: asal?.jenis ?? 'katalog', p_asal_id: asal?.id ?? null,
        })
        if (hidup && id) sesi.current = id
      } catch { detik.current += tambah }
      sedangKirim = false
    }
    const aktif = () => { terakhirAktif.current = Date.now() }
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - terakhirAktif.current < 60000) detik.current += 1
    }, 1000)
    const kirimBerkala = window.setInterval(() => { void kirim() }, 30000)
    const saatTersembunyi = () => { if (document.visibilityState === 'hidden') void kirim() }
    const ev = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'wheel', 'touchstart'] as const
    ev.forEach((e) => window.addEventListener(e, aktif, { passive: true }))
    document.addEventListener('visibilitychange', saatTersembunyi)
    window.addEventListener('pagehide', saatTersembunyi)
    void kirim()
    return () => {
      hidup = false
      window.clearInterval(tick); window.clearInterval(kirimBerkala)
      ev.forEach((e) => window.removeEventListener(e, aktif))
      document.removeEventListener('visibilitychange', saatTersembunyi)
      window.removeEventListener('pagehide', saatTersembunyi)
      if (detik.current > 0 || sesi.current) void kirim()
    }
  }, [bukuId, siap, asal?.jenis, asal?.id])
}

export type Laporan = {
  ringkasan: { judul_terbit: number; pembaca: number; sesi: number; detik: number; kutipan: number }
  per_buku: { id: string; judul: string; nomor_induk: string | null; status: StatusBuku; pembaca: number; sesi: number; detik: number; terakhir: string | null; kutipan: number; dirujuk: number }[]
  per_pembaca: { user_id: string; nama: string; kelas: string | null; peran: string | null; sesi: number; detik: number; buku: number; terakhir: string }[]
  sesi_terbaru: { nama: string; kelas: string | null; judul: string; mulai: string; detik: number; halaman_awal: number; halaman_akhir: number; halaman_dilihat: number; asal: string; asal_judul: string | null }[]
  kutipan_terbaru: { nama: string; kelas: string | null; judul: string; halaman: string | null; cara: string; waktu: string; tugas_judul: string | null }[]
  lampiran_guru: { guru: string; judul: string; hal_mulai: number | null; hal_akhir: number | null; waktu: string; jenis: string; target: string | null }[]
}

export function durasiTeks(detik: number | null | undefined) {
  const d = Math.max(0, Math.round(Number(detik ?? 0)))
  if (d < 60) return `${d} dtk`
  const m = Math.floor(d / 60)
  if (m < 60) return `${m} mnt`
  return `${Math.floor(m / 60)} j ${m % 60} mnt`
}

// ---------------------------------------------------------------- perpustakaan fisik
export type Fisik = {
  id: string; judul: string; penulis: string | null; penerbit: string | null; tahun_terbit: number | null; isbn: string | null
  kategori: string; jenis_buku: string; klasifikasi: string | null; nomor_panggil: string | null; edisi: string | null; kota_terbit: string | null
  bahasa: string; subjek: string | null; mapel: string | null; tingkat: string | null; deskripsi: string | null; rak: string | null; aktif: boolean
  jumlah: number; tersedia: number; dipinjam: number; rusak: number; hilang: number; saya_pinjam: boolean
}
export type Eksemplar = {
  id: string; nomor_induk: string; kondisi: 'baik' | 'rusak_ringan' | 'rusak_berat'; status: 'tersedia' | 'dipinjam' | 'rusak' | 'hilang' | 'dihapusbukukan'
  sumber_perolehan: string; tanggal_perolehan: string | null; harga: number | null; catatan: string | null
  pinjam_id: string | null; peminjam: string | null; jatuh_tempo: string | null; terlambat: boolean
}
export type PinjamBaris = {
  id: string; judul: string; nomor_induk: string; peminjam: string; tipe: 'siswa' | 'ptk'; kelas: string | null
  pinjam_pada: string; jatuh_tempo: string; kembali_pada: string | null; kondisi_kembali: string | null; terlambat: boolean; hari_terlambat: number | null
}
export type PinjamSaya = { id: string; judul: string; penulis: string | null; nomor_induk: string; rak: string | null; pinjam_pada: string; jatuh_tempo: string; kembali_pada: string | null; terlambat: boolean }
export type Peminjam = { tipe: 'siswa' | 'ptk'; id: string; nama: string; ket: string; dipinjam: number }

export const KONDISI = [['baik', 'Baik'], ['rusak_ringan', 'Rusak ringan'], ['rusak_berat', 'Rusak berat']] as const
export const STATUS_EKSEMPLAR = [['tersedia', 'Tersedia'], ['dipinjam', 'Dipinjam'], ['rusak', 'Rusak (tidak dipinjamkan)'], ['hilang', 'Hilang'], ['dihapusbukukan', 'Dihapusbukukan']] as const
export const labelDari = (daftar: readonly (readonly [string, string])[], k: string) => daftar.find((x) => x[0] === k)?.[1] ?? k
