import type { Peran } from '../lib/supabase'

export type ItemPortal = {
  to: string
  label: string
  ikon: string
  /** Satu kalimat untuk kartu di halaman utama portal. */
  ket?: string
  /** Kunci lencana (angka di samping menu), lihat PortalLayout. */
  lencana?: 'ajuan_masuk' | 'ajuan_saya' | 'disposisi' | 'surat'
}
export type KelompokPortal = { judul: string; item: ItemPortal[] }

export const namaPeran: Record<Peran, string> = {
  admin_tu: 'Admin TU',
  guru: 'Guru',
  staf: 'Staf TU',
  siswa: 'Siswa',
  orang_tua: 'Orang tua',
}

const ajuanSaya: ItemPortal = { to: '/portal/ajuan', label: 'Ajuan saya', ikon: 'kotak', ket: 'Perbaikan data yang diajukan dan keputusannya', lencana: 'ajuan_saya' }
const disposisi: ItemPortal = { to: '/portal/disposisi', label: 'Disposisi saya', ikon: 'surat', ket: 'Instruksi dari pimpinan untuk Anda', lencana: 'disposisi' }

const menuPeran: Record<Peran, KelompokPortal[]> = {
  siswa: [
    {
      judul: 'Belajar',
      item: [
        { to: '/portal/lms', label: 'Kelas saya', ikon: 'buku', ket: 'Materi, absen per pertemuan, kuis, dan tugas' },
        { to: '/portal/progres-lms', label: 'Progres belajar', ikon: 'grafik', ket: 'Kehadiran, materi, nilai kuis, dan tugas semua mapel' },
      ],
    },
    {
      judul: 'Data diri',
      item: [
        { to: '/portal/data-saya', label: 'Data saya', ikon: 'pengguna', ket: 'Identitas, alamat, orang tua, dan kelas' },
        ajuanSaya,
      ],
    },
  ],
  guru: [
    {
      judul: 'Mengajar',
      item: [
        { to: '/portal/lms', label: 'Ruang belajar', ikon: 'buku', ket: 'Kelas, materi, absensi per pertemuan, kuis, tugas' },
        { to: '/portal/absensi', label: 'Absensi', ikon: 'centang', ket: 'Jumlah siswa yang diajar dan rekap kehadiran per kelas' },
        { to: '/portal/lms/administrasi', label: 'Administrasi guru', ikon: 'dokumen', ket: 'ATP, modul ajar, program, dan perangkat ajar lain' },
      ],
    },
    {
      judul: 'Data sekolah',
      item: [
        { to: '/portal/rombel', label: 'Rombel', ikon: 'sekolah', ket: 'Kelas, wali kelas, dan anggota' },
        { to: '/portal/peserta-didik', label: 'Daftar siswa', ikon: 'kelompok', ket: 'Siswa aktif per kelas' },
        { to: '/portal/ptk', label: 'Data PTK', ikon: 'tas', ket: 'Pendidik dan tenaga kependidikan' },
      ],
    },
    { judul: 'Persuratan', item: [disposisi] },
    {
      judul: 'Data diri',
      item: [
        { to: '/portal/data-saya', label: 'Profil saya', ikon: 'pengguna', ket: 'Data pribadi dan kepegawaian seperti di Dapodik' },
        ajuanSaya,
      ],
    },
  ],
  staf: [
    { judul: 'Persuratan', item: [disposisi] },
    {
      judul: 'Data diri',
      item: [
        { to: '/portal/data-saya', label: 'Profil saya', ikon: 'pengguna', ket: 'Data pribadi dan kepegawaian seperti di Dapodik' },
        ajuanSaya,
      ],
    },
  ],
  orang_tua: [
    {
      judul: 'Anak saya',
      item: [
        { to: '/portal/anak', label: 'Data anak', ikon: 'pengguna', ket: 'Profil anak yang ditautkan ke akun Anda' },
        { to: '/portal/anak-lms', label: 'Belajar anak', ikon: 'grafik', ket: 'Kehadiran, nilai kuis, dan status tugas anak' },
        ajuanSaya,
      ],
    },
  ],
  admin_tu: [
    {
      judul: 'Data induk',
      item: [
        { to: '/portal/peserta-didik', label: 'Peserta didik', ikon: 'kelompok', ket: 'Aktif, lulus, dan mutasi, lengkap dengan pencarian' },
        { to: '/portal/ptk', label: 'Guru dan tendik', ikon: 'tas', ket: 'Pendidik dan tenaga kependidikan' },
        { to: '/portal/rombel', label: 'Rombel', ikon: 'sekolah', ket: 'Kelas, wali kelas, dan anggota' },
      ],
    },
    {
      judul: 'Dapodik',
      item: [
        { to: '/portal/unggah', label: 'Unggah Dapodik', ikon: 'unggah', ket: 'Unggah berkas ekspor Dapodik' },
        { to: '/portal/riwayat', label: 'Riwayat unggah', ikon: 'riwayat', ket: 'Berkas yang pernah diunggah dan ringkasannya' },
        { to: '/portal/ajuan-masuk', label: 'Ajuan perbaikan', ikon: 'kotak', ket: 'Periksa ajuan dan teruskan ke operator Dapodik', lencana: 'ajuan_masuk' },
      ],
    },
    {
      judul: 'Pembelajaran',
      item: [
        { to: '/portal/lms', label: 'Ruang belajar', ikon: 'buku', ket: 'Kelas, materi, absensi per pertemuan' },
        { to: '/portal/absensi', label: 'Absensi', ikon: 'centang', ket: 'Jumlah siswa yang diajar dan rekap kehadiran per kelas' },
        { to: '/portal/lms/administrasi', label: 'Administrasi guru', ikon: 'dokumen', ket: 'Perangkat ajar dan supervisi' },
      ],
    },
    {
      judul: 'Persuratan',
      item: [
        { to: '/portal/surat', label: 'Persuratan', ikon: 'surat', ket: 'Register surat masuk dan keluar, disposisi', lencana: 'surat' },
        disposisi,
      ],
    },
    {
      judul: 'Akun dan akses',
      item: [
        { to: '/portal/akun', label: 'Akun guru dan staf', ikon: 'pengguna', ket: 'Daftarkan akun dari data PTK' },
        { to: '/portal/tautan-ortu', label: 'Tautan orang tua', ikon: 'tautan', ket: 'Hubungkan akun orang tua ke anak' },
      ],
    },
  ],
}

const khususSuper: ItemPortal[] = [
  { to: '/portal/pengguna', label: 'Kelola pengguna', ikon: 'perisai', ket: 'Lihat akun guru dan siswa, ubah peran, nonaktifkan' },
  { to: '/portal/penugasan', label: 'Penugasan', ikon: 'tas', ket: 'Jabatan tambahan, lingkup, dan struktur organisasi' },
]

/** Menu dari izin penugasan. Item tanpa `to` belum punya halaman. */
const menuIzin: { izin: string; nama: string; bidang: string; ikon: string; to?: string }[] = [
  { izin: 'hubin.kelola_dudi', nama: 'Kelola DU/DI dan MoU', bidang: 'Hubungan industri', ikon: 'tas' },
  { izin: 'hubin.kelola_humas', nama: 'Informasi dan kehumasan', bidang: 'Hubungan industri', ikon: 'tas' },
  { izin: 'kurikulum.atur_jadwal', nama: 'Jadwal pelajaran', bidang: 'Kurikulum', ikon: 'kalender' },
  { izin: 'kurikulum.kalender', nama: 'Kalender akademik', bidang: 'Kurikulum', ikon: 'kalender' },
  { izin: 'kurikulum.kelola_info', nama: 'Informasi akademik', bidang: 'Kurikulum', ikon: 'dokumen' },
  { izin: 'program.kelola', nama: 'Program keahlian', bidang: 'Kurikulum', ikon: 'sekolah' },
  { izin: 'kesiswaan.kelola', nama: 'Kesiswaan', bidang: 'Kesiswaan', ikon: 'kelompok' },
  { izin: 'kelas.kelola', nama: 'Kelas saya', bidang: 'Kelas', ikon: 'sekolah' },
  { izin: 'ekskul.kelola', nama: 'Ekstrakurikuler saya', bidang: 'Kesiswaan', ikon: 'kelompok' },
  { izin: 'sarpras.kelola', nama: 'Sarana dan prasarana', bidang: 'Sarpras', ikon: 'tas' },
  { izin: 'lab.kelola', nama: 'Bengkel dan laboratorium', bidang: 'Sarpras', ikon: 'tas' },
  { izin: 'perpus.kelola', nama: 'Perpustakaan', bidang: 'Perpustakaan', ikon: 'buku' },
  { izin: 'laporan.lihat', nama: 'Laporan sekolah', bidang: 'Pimpinan', ikon: 'grafik' },
  { izin: 'profil.setujui_guru', nama: 'Ajuan perbaikan data', bidang: 'Tata usaha', ikon: 'kotak', to: '/portal/ajuan-masuk' },
  { izin: 'profil.setujui_siswa', nama: 'Ajuan perbaikan data', bidang: 'Tata usaha', ikon: 'kotak', to: '/portal/ajuan-masuk' },
  { izin: 'dapodik.kerjakan_ajuan', nama: 'Antrean perbaikan Dapodik', bidang: 'Tata usaha', ikon: 'kotak', to: '/portal/ajuan-masuk' },
  { izin: 'surat.catat', nama: 'Persuratan', bidang: 'Persuratan', ikon: 'surat', to: '/portal/surat' },
  { izin: 'surat.baca_semua', nama: 'Persuratan', bidang: 'Persuratan', ikon: 'surat', to: '/portal/surat' },
  { izin: 'surat.disposisi', nama: 'Persuratan dan disposisi', bidang: 'Persuratan', ikon: 'surat', to: '/portal/surat' },
  { izin: 'keuangan.kelola', nama: 'Keuangan', bidang: 'Tata usaha', ikon: 'uang' },
]

export type MenuPortal = {
  kelompok: KelompokPortal[]
  /** Fitur dari penugasan yang halamannya belum dibangun. */
  segera: { nama: string; bidang: string }[]
}

export function susunMenu(peran: Peran, superAdmin: boolean, izin: Set<string>): MenuPortal {
  const kelompok: KelompokPortal[] = menuPeran[peran].map((k) => ({ judul: k.judul, item: [...k.item] }))
  if (superAdmin) {
    const akun = kelompok.find((k) => k.judul === 'Akun dan akses')
    if (akun) akun.item.push(...khususSuper)
    else kelompok.push({ judul: 'Akun dan akses', item: [...khususSuper] })
  }
  const sudah = new Set(kelompok.flatMap((k) => k.item.map((i) => i.to)))
  const tambahan: ItemPortal[] = []
  const segera: { nama: string; bidang: string }[] = []
  for (const m of menuIzin) {
    if (!izin.has(m.izin)) continue
    if (m.to) {
      if (sudah.has(m.to)) continue
      sudah.add(m.to)
      const lencana = m.to === '/portal/ajuan-masuk' ? 'ajuan_masuk' : m.to === '/portal/surat' ? 'surat' : undefined
      tambahan.push({ to: m.to, label: m.nama, ikon: m.ikon, ket: m.bidang, lencana })
    } else if (!segera.some((s) => s.nama === m.nama)) {
      segera.push({ nama: m.nama, bidang: m.bidang })
    }
  }
  if (tambahan.length) kelompok.push({ judul: 'Tugas jabatan', item: tambahan })
  return { kelompok, segera }
}

/** Menu yang paling cocok dengan alamat saat ini (tautan terpanjang yang menjadi awalan). */
export function itemAktif(kelompok: KelompokPortal[], pathname: string): ItemPortal | null {
  let terbaik: ItemPortal | null = null
  for (const k of kelompok)
    for (const i of k.item)
      if (pathname === i.to || pathname.startsWith(i.to + '/'))
        if (!terbaik || i.to.length > terbaik.to.length) terbaik = i
  return terbaik
}
