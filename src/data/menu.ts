export type ItemMenu = {
  label: string
  to?: string
  anak?: { label: string; to: string }[]
}

// Hanya fitur yang sudah berjalan dengan data sungguhan. Halaman contoh (PPDB, Perpustakaan) tidak ditautkan.
export const menuUtama: ItemMenu[] = [
  { label: 'Beranda', to: '/' },
  {
    label: 'Profil Sekolah',
    anak: [
      { label: 'Profil dan Visi Misi', to: '/profil' },
      { label: 'Struktur Organisasi', to: '/struktur-organisasi' },
      { label: 'Jurusan', to: '/jurusan' },
      { label: 'Ekstrakurikuler', to: '/ekstrakurikuler' },
      { label: 'Prestasi', to: '/prestasi' },
    ],
  },
  {
    label: 'Akademik',
    anak: [
      { label: 'Kalender Akademik', to: '/akademik' },
      { label: 'LMS', to: '/lms' },
    ],
  },
  { label: 'Asesmen CBT', to: '/asesmen' },
  {
    label: 'Industri dan Alumni',
    anak: [
      { label: 'Hubungan Industri', to: '/hubungan-industri' },
      { label: 'Cek Data Alumni', to: '/alumni' },
      { label: 'Tracer Study', to: '/alumni/tracer' },
    ],
  },
  { label: 'Berita', to: '/berita' },
  { label: 'Kontak', to: '/kontak' },
]
