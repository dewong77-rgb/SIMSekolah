// Data publik: ekstrakurikuler dan prestasi sekolah. Dibaca tanpa login lewat RPC.
import { useEffect, useState } from 'react'
import { panggil } from './rpc'

export type EkskulPublik = { nama: string; jenis: string; deskripsi: string | null; jadwal: string | null; pembina: string | null; anggota: number }
export type PrestasiPublik = {
  id: string; judul: string; kategori: 'siswa' | 'gtk'; bidang: string | null; tingkat: string | null; peringkat: string | null
  penyelenggara: string | null; tahun: number | null; nama: string | null; deskripsi: string | null
}
export type PrestasiKelola = Omit<PrestasiPublik, 'nama'> & { tampil: boolean; nama_tampil: string | null }
export type PrestasiCalon = { id: string; nama_prestasi: string; bidang: string | null; tingkat: string | null; peringkat: string | null; penyelenggara: string | null; tanggal: string | null; siswa: string | null }

export const TINGKAT = [['sekolah', 'Sekolah'], ['kecamatan', 'Kecamatan'], ['kabupaten', 'Kabupaten/Kota'], ['provinsi', 'Provinsi'], ['nasional', 'Nasional'], ['internasional', 'Internasional']] as const
export const BIDANG = [['akademik', 'Akademik'], ['olahraga', 'Olahraga'], ['seni', 'Seni dan budaya'], ['keterampilan_kejuruan', 'Keterampilan kejuruan'], ['keagamaan', 'Keagamaan'], ['lainnya', 'Lainnya']] as const
export const namaTingkat = (k: string | null) => TINGKAT.find((x) => x[0] === k)?.[1] ?? k ?? ''
export const namaBidang = (k: string | null) => BIDANG.find((x) => x[0] === k)?.[1] ?? (k ? k.replace(/_/g, ' ') : '')

/** Dapodik menyimpan nama huruf besar semua. */
export const kapital = (n: string) => n.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())

function usePublik<T>(fn: string): { data: T | null; galat: boolean } {
  const [data, setData] = useState<T | null>(null)
  const [galat, setGalat] = useState(false)
  useEffect(() => {
    let batal = false
    panggil<T>(fn).then((x) => { if (!batal) setData(x ?? ([] as unknown as T)) }).catch(() => { if (!batal) setGalat(true) })
    return () => { batal = true }
  }, [fn])
  return { data, galat }
}
export const useEkskulPublik = () => usePublik<EkskulPublik[]>('ekskul_publik')
export const usePrestasiPublik = () => usePublik<PrestasiPublik[]>('prestasi_publik_daftar')
