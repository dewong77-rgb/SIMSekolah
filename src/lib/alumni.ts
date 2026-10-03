// Tahap prototipe: belum memanggil Supabase.
// Saat disambung, ganti isi cekDataAlumni dengan:
//   supabase.rpc('cek_data_alumni', { p_nisn, p_tanggal_lahir })

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
  await new Promise((r) => setTimeout(r, 500))
  if (nisn === '0000000000' && tanggalLahir === '2000-01-01') {
    return {
      ditemukan: true,
      nama: 'Contoh Alumni',
      nisn,
      nipd: '0000',
      tempat_lahir: 'Bogor',
      tanggal_lahir: tanggalLahir,
      status: 'lulus',
      tanggal_keluar: '2018-06-01',
      alasan_keluar: 'Lulus',
    }
  }
  return { ditemukan: false }
}
