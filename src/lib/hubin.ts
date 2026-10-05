// Modul Hubungan Industri dan Humas: tipe, pembantu RPC, dan hook izin.
import { useEffect, useState } from 'react'
import { panggil } from './rpc'

export type IzinHubin = 'hubin.kelola_dudi' | 'hubin.kelola_humas' | 'hubin.kelola_profil' | 'hubin.tulis_berita' | 'hubin.tracer'

export function useIzinHubin() {
  const [izin, setIzin] = useState<string[] | null>(null)
  useEffect(() => {
    let batal = false
    panggil<string[]>('hubin_izin').then((x) => { if (!batal) setIzin(x ?? []) }).catch(() => { if (!batal) setIzin([]) })
    return () => { batal = true }
  }, [])
  return { izin: izin ?? [], memuat: izin === null, punya: (...k: string[]) => (izin ?? []).some((i) => k.includes(i)) }
}

export const KATEGORI_BERITA = [
  ['kegiatan', 'Kegiatan'], ['prestasi', 'Prestasi'], ['pengumuman', 'Pengumuman'],
  ['kemitraan', 'Kemitraan'], ['akademik', 'Akademik'], ['lainnya', 'Lainnya'],
] as const
export const namaKategori = (k: string) => KATEGORI_BERITA.find((x) => x[0] === k)?.[1] ?? k

export type BeritaRingkas = {
  slug: string; judul: string; kategori: string; ringkasan: string | null; gambar_url: string | null; terbit_pada: string; unggulan: boolean
}
export type BeritaKelola = {
  id: string; slug: string; judul: string; kategori: string; ringkasan: string | null; status: string; unggulan: boolean
  terbit_pada: string | null; penulis_nama: string; diperbarui_pada: string; bisa_ubah: boolean
}

export function useBeritaPublik(batas = 12, kategori: string | null = null, mulai = 0) {
  const [hasil, setHasil] = useState<{ total: number; baris: BeritaRingkas[] } | null>(null)
  const [galat, setGalat] = useState(false)
  useEffect(() => {
    let batal = false
    setHasil(null); setGalat(false)
    panggil<{ total: number; baris: BeritaRingkas[] }>('berita_publik', { p_kategori: kategori, p_batas: batas, p_mulai: mulai })
      .then((x) => { if (!batal) setHasil(x) }).catch(() => { if (!batal) setGalat(true) })
    return () => { batal = true }
  }, [batas, kategori, mulai])
  return { hasil, galat }
}

export const STATUS_TRACER = [
  ['bekerja', 'Bekerja'], ['wirausaha', 'Wirausaha'], ['kuliah', 'Melanjutkan kuliah'], ['bekerja_kuliah', 'Bekerja dan kuliah'],
  ['mencari_kerja', 'Mencari kerja'], ['belum_bekerja', 'Belum bekerja'], ['lainnya', 'Lainnya'],
] as const
export const KESESUAIAN = [['sangat_sesuai', 'Sangat sesuai'], ['sesuai', 'Sesuai'], ['kurang_sesuai', 'Kurang sesuai'], ['tidak_sesuai', 'Tidak sesuai']] as const
export const PENGHASILAN = [
  ['dibawah_1jt', 'Kurang dari Rp1 juta'], ['1_2_5jt', 'Rp1 juta sampai Rp2,5 juta'], ['2_5_5jt', 'Rp2,5 juta sampai Rp5 juta'],
  ['5_8jt', 'Rp5 juta sampai Rp8 juta'], ['diatas_8jt', 'Lebih dari Rp8 juta'],
] as const
export const label = (daftar: readonly (readonly [string, string])[], k: string | null | undefined) =>
  daftar.find((x) => x[0] === k)?.[1] ?? (k ?? '-')

/** Unduh teks sebagai CSV (BOM agar Excel membaca UTF-8). */
export function unduhCsv(nama: string, baris: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    let s = v == null ? '' : String(v)
    if (/^[=+\-@]/.test(s)) s = "'" + s
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const blob = new Blob(['﻿' + baris.map((b) => b.map(esc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `${nama}.csv`; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Status MoU dari tanggal selesai. */
export function statusMou(selesai: string | null): 'berlaku' | 'segera' | 'berakhir' | 'tanpa_tanggal' {
  if (!selesai) return 'tanpa_tanggal'
  const hari = (new Date(selesai).getTime() - Date.now()) / 86400000
  return hari < 0 ? 'berakhir' : hari <= 90 ? 'segera' : 'berlaku'
}
export const NAMA_STATUS_MOU = { berlaku: 'Berlaku', segera: 'Segera berakhir', berakhir: 'Berakhir', tanpa_tanggal: 'Tanpa tanggal' } as const


export type Kerjasama = {
  jumlah_mitra: number; jumlah_mou: number; mou_berlaku: number; sejak_tahun: number | null
  jenis: { jenis: string; jumlah: number }[]
  mitra: { nama: string; bidang_usaha: string | null; wilayah: string | null; jenis: string[] | null; sejak: string | null; berlaku: boolean | null }[]
}
export function useKerjasama() {
  const [data, setData] = useState<Kerjasama | null>(null)
  const [galat, setGalat] = useState(false)
  useEffect(() => {
    let batal = false
    panggil<Kerjasama>('kerjasama_publik').then((x) => { if (!batal) setData(x) }).catch(() => { if (!batal) setGalat(true) })
    return () => { batal = true }
  }, [])
  return { data, galat }
}

export type JurusanLengkap = {
  kode: string; nama: string; bidang: string | null; program: string | null; ringkas: string | null; deskripsi: string | null
  kompetensi_lulusan: string | null; mapel_kejuruan: string | null; fasilitas: string | null; prospek: string[]; kepala_program: string | null; jumlah_siswa: number
}
