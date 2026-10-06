// Modul Kurikulum: tipe, label linieritas, dan pembantu tahun ajaran.
import { useEffect, useState } from 'react'
import { panggil } from './rpc'
import { wib } from './kalender'

export type Pengaturan = { durasi_jp: number; jam_wajib: number; boleh: boolean }
export type Mapel = { id: string; nama: string; kelompok: string; bidang_linier: string[]; aktif: boolean; urutan: number }
export type BarisStruktur = { id: string; tingkat: number; program: string; mapel_id: string; mapel: string; kelompok: string; jp_minggu: number }
export type ProgramRombel = { program: string; tingkat: number; rombel: number }
export type GuruBeban = { ptk_id: string; guru: string; jp: number; status: string }
/** Satu mapel pada satu rombel: kebutuhan JP dari struktur dan guru yang mengampu (bisa lebih dari satu). */
export type BebanMapel = {
  rombel_id: string; rombel: string; tingkat: number; program: string; mapel_id: string; mapel: string; kelompok: string
  jp: number; jp_terbagi: number; guru: GuruBeban[]
}
export type Guru = {
  ptk_id: string; nama: string; jenis_ptk: string | null; status_kepegawaian: string | null
  kompetensi: string | null; sertifikasi: string | null; jurusan_prodi: string | null; mengajar: string | null
  jjm_dapodik: number | null; tugas_tambahan: string | null; jam_tugas_tambahan: number | null
  jp_total: number; jumlah_rombel: number; jp_tidak_linier: number; status: Record<string, string>
}

export type BarisWali = {
  rombel_id: string; rombel: string; tingkat: number; program: string; jumlah_siswa: number
  wali_dapodik_id: string | null; wali_dapodik: string | null
  usulan_id: string | null; ptk_id: string | null; wali: string | null
  status: 'usulan' | 'disetujui' | 'ditolak' | null; catatan: string | null; diputuskan_pada: string | null
}

export const KELOMPOK_MAPEL = [
  ['umum', 'Umum'], ['kejuruan', 'Kejuruan'], ['muatan_lokal', 'Muatan lokal'], ['projek', 'Projek'], ['pkl', 'PKL'], ['lainnya', 'Lainnya'],
] as const
export const namaKelompok = (k: string) => KELOMPOK_MAPEL.find((x) => x[0] === k)?.[1] ?? k

/** Status linieritas dari basis data. `nada` memilih warna lencana. */
export const STATUS_LINIER: Record<string, { label: string; nada: 'baik' | 'sedang' | 'buruk' | 'netral'; ket: string }> = {
  linier: { label: 'Linier', nada: 'baik', ket: 'Bidang sertifikasi atau kompetensi di Dapodik sesuai mapel.' },
  manual_linier: { label: 'Linier (koreksi)', nada: 'baik', ket: 'Ditetapkan linier secara manual oleh kurikulum.' },
  ijazah: { label: 'Sesuai ijazah', nada: 'sedang', ket: 'Hanya jurusan atau prodi ijazah yang sesuai.' },
  dapodik: { label: 'Mengajar di Dapodik', nada: 'sedang', ket: 'Tercatat mengajar mapel ini di Dapodik, bidang belum sesuai.' },
  tidak_linier: { label: 'Tidak linier', nada: 'buruk', ket: 'Bidang di Dapodik tidak sesuai mapel.' },
  manual_tidak: { label: 'Tidak linier (koreksi)', nada: 'buruk', ket: 'Ditetapkan tidak linier secara manual.' },
  tanpa_data: { label: 'Data Dapodik kosong', nada: 'netral', ket: 'Kompetensi dan prodi guru belum terisi di Dapodik.' },
  belum_dipetakan: { label: 'Mapel belum dipetakan', nada: 'netral', ket: 'Mapel belum punya kata kunci bidang. Isi di daftar mapel.' },
}
export const WARNA_NADA = {
  baik: { background: '#e3f4e7', color: '#1d6b34' },
  sedang: { background: '#fdf1d8', color: '#7a5200' },
  buruk: { background: '#fbe4e4', color: '#8a1f1f' },
  netral: { background: '#eceff3', color: '#4a5565' },
} as const

/** Tahun ajaran berjalan menurut WIB, sama dengan `tahun_ajaran_sekarang()` di basis data. */
export function tahunAjaranSekarang(): string {
  const t = wib().tanggal
  const y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7))
  return m >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`
}
export function pilihanTahunAjaran(): string[] {
  const [a] = tahunAjaranSekarang().split('/').map(Number)
  return [-1, 0, 1].map((d) => `${a + d}/${a + d + 1}`)
}

/** Pengaturan kurikulum (durasi JP dan jam wajib). `null` bila akun tidak boleh melihat. */
export function usePengaturanKurikulum() {
  const [p, setP] = useState<Pengaturan | null>(null)
  const [memuat, setMemuat] = useState(true)
  const [versi, setVersi] = useState(0)
  useEffect(() => {
    let batal = false
    panggil<Pengaturan | null>('kur_pengaturan_baca')
      .then((x) => { if (!batal) setP(x) })
      .catch(() => { if (!batal) setP(null) })
      .finally(() => { if (!batal) setMemuat(false) })
    return () => { batal = true }
  }, [versi])
  return { pengaturan: p, memuat, muatUlang: () => setVersi((v) => v + 1) }
}

export type SlotJadwal = {
  rombel_id: string; rombel: string; hari: number; jam_ke: number
  mapel_id: string; mapel: string; ptk_id: string | null; guru: string | null; valid: boolean
}
export const NAMA_HARI_JADWAL = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'] as const
