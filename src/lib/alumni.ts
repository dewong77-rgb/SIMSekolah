import { supabase } from './supabase'

export type HasilAlumni =
  | {
      ditemukan: true
      nama: string
      nisn: string
      nipd: string | null
      tempat_lahir: string | null
      tanggal_lahir: string
      status: string
      tanggal_keluar: string | null
      alasan_keluar: string | null
    }
  | { ditemukan: false; dibatasi?: boolean }

export async function cekDataAlumni(nisn: string, tanggalLahir: string): Promise<HasilAlumni> {
  const { data, error } = await supabase.rpc('cek_data_alumni', {
    p_nisn: nisn,
    p_tanggal_lahir: tanggalLahir,
  })
  if (error || !data) return { ditemukan: false }
  return data as HasilAlumni
}
