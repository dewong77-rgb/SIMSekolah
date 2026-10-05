// Modul Sarana dan Prasarana: tipe, konstanta, dan hook izin.
import { useEffect, useState } from 'react'
import { panggil } from './rpc'

export type IzinSarpras = 'kelola' | 'catat_lab' | 'verifikasi_program' | 'lihat'

export function useIzinSarpras() {
  const [izin, setIzin] = useState<string[] | null>(null)
  useEffect(() => {
    let batal = false
    panggil<string[]>('sarpras_izin').then((x) => { if (!batal) setIzin(x ?? []) }).catch(() => { if (!batal) setIzin([]) })
    return () => { batal = true }
  }, [])
  return { izin: izin ?? [], memuat: izin === null, punya: (...k: IzinSarpras[]) => (izin ?? []).some((i) => (k as string[]).includes(i)) }
}

export const KATEGORI = [
  ['alat', 'Alat'], ['bahan', 'Bahan'], ['aset', 'Aset'], ['bangunan', 'Bangunan'], ['lainnya', 'Lainnya'],
] as const
export const JENIS_LAB = [
  ['bengkel', 'Bengkel'], ['laboratorium', 'Laboratorium'], ['ruang_praktik', 'Ruang praktik'], ['gudang', 'Gudang'], ['lainnya', 'Lainnya'],
] as const
export const JENIS_USULAN = [['pengadaan', 'Pengadaan'], ['perbaikan', 'Perbaikan'], ['penghapusan', 'Penghapusan']] as const
export const PRIORITAS = [['tinggi', 'Tinggi'], ['sedang', 'Sedang'], ['rendah', 'Rendah']] as const
export const STATUS_USULAN = [
  ['draf', 'Draf'], ['menunggu_kaprog', 'Menunggu Kepala Program'], ['menunggu_waka', 'Menunggu Waka Sarpras'],
  ['dikembalikan', 'Dikembalikan'], ['disetujui', 'Disetujui'], ['selesai', 'Selesai'], ['ditolak', 'Ditolak'], ['dibatalkan', 'Dibatalkan'],
] as const
export const label = (daftar: readonly (readonly [string, string])[], k: string | null | undefined) =>
  daftar.find((x) => x[0] === k)?.[1] ?? (k ?? '-')

export const rupiah = (n: number | null | undefined) =>
  n == null ? '-' : 'Rp' + Math.round(n).toLocaleString('id-ID')
export const angka = (n: number | null | undefined) => (n == null ? '-' : Number(n).toLocaleString('id-ID'))

export type Lab = {
  id: string; kode: string | null; nama: string; jenis: string; program: string | null; keterangan: string | null; aktif: boolean
  prasarana_id: string | null; jenis_barang: number; baik: number; rusak: number; boleh_catat: boolean
}
export type Barang = {
  id: string; lab_id: string | null; lab_nama: string | null; kategori: string; kode_barang: string | null; nama: string
  merek_tipe: string | null; spesifikasi: string | null; satuan: string; jumlah_baik: number; jumlah_rusak: number; jumlah_total: number
  tahun_perolehan: number | null; sumber_dana: string | null; harga_satuan: number | null; luas_m2: number | null
  keterangan: string | null; diubah_pada: string; boleh_ubah: boolean
}
export type Usulan = {
  id: string; nomor: string | null; lab_id: string; lab_nama: string; program: string | null; jenis: string; barang_id: string | null
  nama_barang: string; spesifikasi: string | null; jumlah: number; satuan: string; perkiraan_harga_satuan: number | null
  perkiraan_total: number | null; alasan: string; prioritas: string; status: string; pengusul_nama: string | null
  dibuat_pada: string; diubah_pada: string; aksi: string[]
}
export type RiwayatUsulan = { waktu: string; dari: string | null; ke: string; oleh: string | null; catatan: string | null }
export type Buku = {
  per_kategori: { kategori: string; jenis_barang: number; baik: number; rusak: number; nilai: number }[]
  per_lab: { lab_nama: string; program: string | null; jenis_barang: number; baik: number; rusak: number; nilai: number }[]
  usulan: Record<string, number>
  dapodik: { ruang: number; luas_m2: number; jenis_sarana: number; sarana_laik: number; sarana_tidak_laik: number }
}
