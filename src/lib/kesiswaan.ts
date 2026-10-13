// Modul Kesiswaan: hook izin, label, dan pembantu bersama untuk halaman Waka Kesiswaan.
import { useEffect, useState } from 'react'
import { panggil } from './rpc'

export type IzinKes = 'kesiswaan.catat' | 'kesiswaan.verifikasi' | 'kesiswaan.pantau' | 'kesiswaan.izin' | 'kesiswaan.beasiswa' | 'ekskul.kelola' | 'ekskul.lihat' | 'bk.kelola' | 'bk.baca'

/** Izin kesiswaan yang berlaku bagi pengguna (seluruh sekolah atau rombel sendiri). Basis data tetap memeriksa ulang. */
export function useIzinKes() {
  const [izin, setIzin] = useState<string[] | null>(null)
  useEffect(() => {
    let batal = false
    panggil<string[]>('kesiswaan_izin').then((x) => { if (!batal) setIzin(x ?? []) }).catch(() => { if (!batal) setIzin([]) })
    return () => { batal = true }
  }, [])
  return { izin: izin ?? [], memuat: izin === null, punya: (...k: string[]) => (izin ?? []).some((i) => k.includes(i)) }
}

/** Akses tambahan: 'biodata', 'keluar' (mengusulkan pengeluaran siswa), 'keluar.tanggapi' (operator). Basis data tetap memeriksa ulang. */
export function useAksesKes() {
  const [akses, setAkses] = useState<string[] | null>(null)
  useEffect(() => {
    let batal = false
    panggil<string[]>('kesiswaan_akses_tambahan').then((x) => { if (!batal) setAkses(x ?? []) }).catch(() => { if (!batal) setAkses([]) })
    return () => { batal = true }
  }, [])
  return { akses: akses ?? [], memuat: akses === null, punya: (k: string) => (akses ?? []).includes(k) }
}

export const ALASAN_KELUAR = ['Mutasi', 'Dikeluarkan', 'Mengundurkan diri', 'Putus sekolah', 'Wafat', 'Hilang', 'Lainnya'] as const
export const STATUS_KELUAR = [['diajukan', 'Menunggu operator'], ['selesai', 'Selesai'], ['ditolak', 'Ditolak'], ['dibatalkan', 'Dibatalkan']] as const

type Daftar = readonly (readonly [string, string])[]
export const label = (d: Daftar, k: string | null | undefined) => d.find((x) => x[0] === k)?.[1] ?? (k ?? '-')

export const KATEGORI = [['ringan', 'Ringan'], ['sedang', 'Sedang'], ['berat', 'Berat']] as const
export const STATUS_CATATAN = [['diajukan', 'Menunggu verifikasi'], ['terverifikasi', 'Terverifikasi'], ['ditolak', 'Ditolak']] as const
export const BIDANG_PRESTASI = [
  ['akademik', 'Akademik'], ['olahraga', 'Olahraga'], ['seni', 'Seni'], ['keterampilan_kejuruan', 'Keterampilan kejuruan'],
  ['keagamaan', 'Keagamaan'], ['organisasi', 'Organisasi'], ['lainnya', 'Lainnya'],
] as const
export const TINGKAT = [
  ['sekolah', 'Sekolah'], ['kecamatan', 'Kecamatan'], ['kabupaten', 'Kabupaten atau kota'], ['provinsi', 'Provinsi'],
  ['nasional', 'Nasional'], ['internasional', 'Internasional'],
] as const
export const TINDAK_LANJUT = [
  ['teguran_lisan', 'Teguran lisan'], ['teguran_tertulis', 'Teguran tertulis'], ['panggilan_orang_tua', 'Panggilan orang tua'],
  ['pembinaan_bk', 'Pembinaan BK'], ['kunjungan_rumah', 'Kunjungan rumah'], ['surat_peringatan_1', 'Surat peringatan 1'],
  ['surat_peringatan_2', 'Surat peringatan 2'], ['surat_peringatan_3', 'Surat peringatan 3'], ['skorsing', 'Skorsing'],
  ['dikembalikan_ke_orang_tua', 'Dikembalikan ke orang tua'], ['lainnya', 'Lainnya'],
] as const
export const JENIS_IZIN = [['sakit', 'Sakit'], ['izin', 'Izin'], ['dispensasi', 'Dispensasi'], ['izin_keluar', 'Izin keluar sekolah']] as const
export const STATUS_IZIN = [['diajukan', 'Menunggu'], ['disetujui', 'Disetujui'], ['ditolak', 'Ditolak'], ['dibatalkan', 'Dibatalkan']] as const
export const STATUS_HADIR = [
  ['hadir', 'Hadir'], ['terlambat', 'Terlambat'], ['sakit', 'Sakit'], ['izin', 'Izin'], ['dispensasi', 'Dispensasi'], ['alpa', 'Alpa'],
] as const
export const PERAN_EKSKUL = [['anggota', 'Anggota'], ['ketua', 'Ketua'], ['wakil', 'Wakil ketua'], ['sekretaris', 'Sekretaris'], ['bendahara', 'Bendahara'], ['pengurus', 'Pengurus']] as const
export const PREDIKAT = [['sangat_baik', 'Sangat baik'], ['baik', 'Baik'], ['cukup', 'Cukup'], ['perlu_pembinaan', 'Perlu pembinaan']] as const
export const JENIS_BEASISWA = [['pip', 'PIP'], ['bantuan_pemerintah', 'Bantuan pemerintah'], ['swasta', 'Beasiswa swasta'], ['internal', 'Internal sekolah'], ['lainnya', 'Lainnya']] as const
export const STATUS_BEASISWA = [
  ['calon', 'Calon'], ['diusulkan', 'Diusulkan'], ['verifikasi_berkas', 'Verifikasi berkas'], ['ditetapkan', 'Ditetapkan'],
  ['dicairkan', 'Dicairkan'], ['tidak_lolos', 'Tidak lolos'], ['mundur', 'Mundur'],
] as const

export const hariIni = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export const tambahHari = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export type Periode = 'minggu' | 'bulan' | 'triwulan' | 'tahun'
export const PERIODE = [['minggu', 'Mingguan'], ['bulan', 'Bulanan'], ['triwulan', 'Tiga bulanan'], ['tahun', 'Tahun ajaran']] as const
/** Rentang tanggal (ISO) periode yang memuat tanggal acuan. Tiga bulanan: bulan acuan dan dua bulan sebelumnya. Tahun ajaran: 1 Juli sampai 30 Juni. */
export function rentangPeriode(periode: Periode, acuan: string): [string, string] {
  const d = new Date(acuan + 'T00:00:00')
  const p = (x: number) => String(x).padStart(2, '0')
  const iso = (t: Date) => `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
  if (periode === 'minggu') {
    const senin = new Date(d); senin.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const minggu = new Date(senin); minggu.setDate(senin.getDate() + 6)
    return [iso(senin), iso(minggu)]
  }
  if (periode === 'bulan') return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))]
  if (periode === 'triwulan') return [iso(new Date(d.getFullYear(), d.getMonth() - 2, 1)), iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))]
  const th = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1
  return [`${th}-07-01`, `${th + 1}-06-30`]
}
export const akhirPekan = (iso: string) => { const h = new Date(iso + 'T00:00:00').getDay(); return h === 0 || h === 6 }

export type SiswaCari = { id: string; nama: string; nisn: string | null; rombel: string | null }
export type RombelPilih = { id: string; nama: string; tingkat: number; jumlah: number }

export const STATUS_KASUS = [
  ['rujukan', 'Rujukan baru'], ['terbuka', 'Ditangani'], ['pemantauan', 'Dipantau'], ['selesai_bertahan', 'Selesai, siswa bertahan'],
  ['pindah', 'Pindah sekolah'], ['putus_sekolah', 'Putus sekolah (ATS)'], ['ditutup', 'Ditutup'],
] as const
export const STATUS_KASUS_TUTUP = ['selesai_bertahan', 'pindah', 'putus_sekolah', 'ditutup']
export const ALASAN_KASUS = [
  ['ekonomi', 'Kesulitan ekonomi'], ['kehadiran', 'Kehadiran rendah'], ['perilaku', 'Perilaku'], ['keluarga', 'Masalah keluarga'],
  ['bekerja', 'Bekerja'], ['pernikahan', 'Pernikahan'], ['minat', 'Kurang minat belajar'], ['lainnya', 'Lainnya'],
] as const
export const PEMICU_KASUS = [['risiko', 'Dashboard risiko'], ['rujukan', 'Rujukan guru'], ['orang_tua', 'Orang tua'], ['manual', 'Temuan BK']] as const
export const JENIS_BK = [
  ['konseling_individu', 'Konseling individu'], ['konseling_kelompok', 'Konseling kelompok'], ['kunjungan_rumah', 'Kunjungan rumah'],
  ['panggilan_orang_tua', 'Panggilan orang tua'], ['mediasi', 'Mediasi'], ['observasi', 'Observasi'], ['koordinasi', 'Koordinasi'], ['lainnya', 'Lainnya'],
] as const
export const BIDANG_BK = [['pribadi', 'Pribadi'], ['sosial', 'Sosial'], ['belajar', 'Belajar'], ['karier', 'Karier'], ['keluarga', 'Keluarga']] as const
