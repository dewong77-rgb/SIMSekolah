export type ItemMenu = {
  label: string
  to?: string
  anak?: { label: string; to: string }[]
}

export const menuUtama: ItemMenu[] = [
  { label: 'Beranda', to: '/' },
  {
    label: 'Profil Sekolah',
    anak: [
      { label: 'Profil dan Visi Misi', to: '/profil' },
      { label: 'Struktur Organisasi', to: '/struktur-organisasi' },
      { label: 'Jurusan', to: '/jurusan' },
      { label: 'Hubungan Industri', to: '/hubungan-industri' },
    ],
  },
  {
    label: 'Informasi Akademik',
    anak: [
      { label: 'Kalender Akademik', to: '/akademik' },
      { label: 'PPDB', to: '/ppdb' },
    ],
  },
  { label: 'LMS', to: '/lms' },
  { label: 'Perpustakaan', to: '/perpustakaan' },
  { label: 'Alumni', to: '/alumni' },
  { label: 'Berita', to: '/berita' },
  { label: 'Kontak', to: '/kontak' },
]
