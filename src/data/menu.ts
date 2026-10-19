export type ItemMenu = {
  label: string
  to?: string
  /** `luar`: tautan ke aplikasi di luar SIMS, dibuka di tab baru. */
  anak?: { label: string; to: string; luar?: boolean }[]
}

// Hanya fitur yang sudah berjalan dengan data sungguhan. Halaman contoh (PPDB) tidak ditautkan.
export const menuUtama: ItemMenu[] = [
  { label: 'Beranda', to: '/' },
  {
    label: 'Aplikasi',
    anak: [
      { label: 'Dapodik Sekolah', to: '/dapodik', luar: true },
      { label: 'e-Rapor SMK', to: '/erapor', luar: true },
    ],
  },
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
      { label: 'Asesmen Digital (CBT)', to: '/asesmen' },
      { label: 'LMS', to: '/lms' },
      { label: 'Perpustakaan', to: '/perpustakaan' },
    ],
  },
  {
    label: 'Industri dan Alumni',
    anak: [
      { label: 'Hubungan Industri', to: '/hubungan-industri' },
      { label: 'Cek Data Alumni', to: '/alumni' },
      { label: 'Tracer Study', to: '/alumni/tracer' },
    ],
  },
  {
    label: 'Informasi',
    anak: [
      { label: 'Berita', to: '/berita' },
      { label: 'Kontak', to: '/kontak' },
    ],
  },
]
