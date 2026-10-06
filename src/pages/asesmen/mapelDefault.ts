// Kerangka mata pelajaran SMK (Kurikulum Merdeka). Hanya daftar tampilan: tidak tersimpan di basis data.
// Bank soal baru tetap dibuat guru. Mapel yang belum punya bank soal tampil sebagai "Belum ada".

export type KelompokMapel = 'Umum' | 'Kejuruan' | 'Muatan lokal'
export type MapelKerangka = { nama: string; kelompok: KelompokMapel }

const umum = [
  'Pendidikan Agama dan Budi Pekerti',
  'Pendidikan Pancasila',
  'Bahasa Indonesia',
  'Matematika',
  'Bahasa Inggris',
  'Pendidikan Jasmani, Olahraga, dan Kesehatan',
  'Sejarah',
  'Seni Budaya',
]
const kejuruan = [
  'Informatika',
  'Projek IPAS',
  'Dasar-dasar Program Keahlian',
  'Projek Kreatif dan Kewirausahaan',
  'Mata Pelajaran Pilihan',
]
const lokal = ['Bahasa Sunda']

/** Kerangka mapel sekolah: umum, kejuruan, muatan lokal, ditambah satu Konsentrasi Keahlian per kompetensi keahlian sekolah. */
export function kerangkaMapel(kompetensi: string[]): MapelKerangka[] {
  return [
    ...umum.map((nama) => ({ nama, kelompok: 'Umum' as const })),
    ...kejuruan.map((nama) => ({ nama, kelompok: 'Kejuruan' as const })),
    ...kompetensi.map((k) => ({ nama: `Konsentrasi Keahlian ${k}`, kelompok: 'Kejuruan' as const })),
    ...lokal.map((nama) => ({ nama, kelompok: 'Muatan lokal' as const })),
  ]
}

/** Dua nama mapel dianggap sama bila hurufnya sama setelah dipangkas dan dikecilkan. */
export const kunciMapel = (m: string) => m.trim().toLowerCase()
