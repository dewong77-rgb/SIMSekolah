import type { Peran } from '../lib/supabase'

export type ItemPortal = {
  to: string
  label: string
  ikon: string
  /** Satu kalimat untuk kartu di halaman utama portal. */
  ket?: string
  /** Awalan alamat untuk penanda menu aktif bila satu menu mencakup beberapa halaman. Bawaan: `to`. */
  cocok?: string
  /** Kunci lencana (angka di samping menu), lihat PortalLayout. */
  lencana?: 'ajuan_masuk' | 'ajuan_saya' | 'disposisi' | 'surat' | 'sarpras' | 'kesiswaan'
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
        { to: '/portal/lms', label: 'Kelas saya', ikon: 'buku', ket: 'Materi, lembar kerja, dan diskusi per pertemuan' },
        { to: '/portal/penilaian/kuis', cocok: '/portal/penilaian', label: 'Kuis dan ulangan', ikon: 'centang', ket: 'Kuis, ulangan harian, UTS, dan UAS dari semua kelas' },
        { to: '/portal/progres-lms', label: 'Progres belajar', ikon: 'grafik', ket: 'Kehadiran, materi, nilai kuis, dan tugas semua mapel' },
      ],
    },
    {
      judul: 'Data diri',
      item: [
        { to: '/portal/data-saya', label: 'Data saya', ikon: 'pengguna', ket: 'Identitas, alamat, orang tua, dan kelas' },
        { to: '/portal/catatan-saya', label: 'Catatan kesiswaan', ikon: 'centang', ket: 'Kehadiran, prestasi, pelanggaran terverifikasi, ekskul, dan pengajuan izin' },
        ajuanSaya,
      ],
    },
  ],
  guru: [
    {
      judul: 'Mengajar',
      item: [
        { to: '/portal/lms', label: 'Ruang belajar', ikon: 'buku', ket: 'Kelas, pertemuan, materi, lembar kerja, dan tugas' },
        { to: '/portal/lms/dashboard', label: 'Dashboard pembelajaran', ikon: 'grafik', ket: 'Absen serentak dan pantauan semua kelas dalam satu layar' },
        { to: '/portal/penilaian/kuis', cocok: '/portal/penilaian', label: 'Kuis dan ulangan', ikon: 'centang', ket: 'Kuis, ulangan harian, UTS, dan UAS semua kelas' },
        { to: '/portal/absensi', label: 'Absensi', ikon: 'centang', ket: 'Jumlah siswa yang diajar dan rekap kehadiran per kelas' },
      ],
    },
    {
      judul: 'Perangkat ajar',
      item: [
        { to: '/portal/lms/rencana', label: 'Rencana ajar (Excel)', ikon: 'dokumen', ket: 'Sumber data TP, ATP, KKTP, dan Promes. Template bisa diunduh dan diunggah' },
        { to: '/portal/lms/perangkat/tp', cocok: '/portal/lms/perangkat', label: 'Dokumen perangkat ajar', ikon: 'dokumen', ket: 'TP, ATP, KKTP, Silabus, Prota, Promes, Modul Ajar, dan RPP' },
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
    {
      judul: 'Data diri',
      item: [
        { to: '/portal/data-saya', label: 'Profil saya', ikon: 'pengguna', ket: 'Data pribadi dan kepegawaian seperti di Dapodik' },
        disposisi,
        ajuanSaya,
      ],
    },
  ],
  staf: [
    {
      judul: 'Data diri',
      item: [
        disposisi,
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
        { to: '/portal/catatan-anak', label: 'Catatan kesiswaan anak', ikon: 'centang', ket: 'Kehadiran harian, prestasi, pelanggaran terverifikasi, dan pengajuan izin' },
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
    { judul: 'Kesiswaan', item: [{ to: '/portal/kesiswaan', label: 'Kesiswaan', ikon: 'kelompok', ket: 'Pelanggaran, prestasi, izin, kehadiran, ekskul, dan beasiswa', lencana: 'kesiswaan' }] },
    { judul: 'Layanan sekolah', item: [{ to: '/portal/buku-tamu', label: 'Buku tamu', ikon: 'kelompok', ket: 'Catat pengunjung, jam pulang, rekap asal dan tujuan' }] },
    {
      judul: 'Akun dan akses',
      item: [
        { to: '/portal/akun', label: 'Akun guru dan staf', ikon: 'pengguna', ket: 'Daftarkan akun dari data PTK' },
        { to: '/portal/tautan-ortu', label: 'Tautan orang tua', ikon: 'tautan', ket: 'Hubungkan akun orang tua ke anak' },
      ],
    },
  ],
}

const akunSuper: ItemPortal[] = [
  { to: '/portal/pengguna', label: 'Kelola pengguna', ikon: 'perisai', ket: 'Lihat akun guru dan siswa, ubah peran, nonaktifkan' },
  { to: '/portal/penugasan', label: 'Penugasan', ikon: 'tas', ket: 'Jabatan tambahan, lingkup, dan struktur organisasi' },
  { to: '/portal/sambungan-drive', label: 'Sambungan Drive', ikon: 'unggah', ket: 'Uji sambungan ke Google Drive sekolah dan lihat kuota' },
]
const pengaturanSuper: ItemPortal[] = [
  { to: '/portal/profil-sekolah', label: 'Profil sekolah', ikon: 'sekolah', ket: 'Alamat, koordinat, kontak, media sosial, visi dan misi' },
  { to: '/portal/kalender', label: 'Kalender sekolah', ikon: 'kalender', ket: 'Kalender pendidikan, kegiatan, libur, dan ujian' },
  { to: '/portal/jam-pelajaran', label: 'Jam pelajaran', ikon: 'kalender', ket: 'Jam masuk, jam pelajaran, dan istirahat' },
  { to: '/portal/sarpras/buku', label: 'Sarana dan prasarana', ikon: 'tas', ket: 'Inventaris, usulan bertingkat, dan pembukuan bengkel dan aset' },
]

/** Menu dari izin penugasan. Item tanpa `to` belum punya halaman. */
const menuIzin: { izin: string; nama: string; bidang: string; ikon: string; to?: string }[] = [
  { izin: 'hubin.kelola_dudi', nama: 'Mitra industri dan MoU', bidang: 'Hubungan industri', ikon: 'tas', to: '/portal/hubin/kerjasama' },
  { izin: 'hubin.kelola_profil', nama: 'Profil sekolah', bidang: 'Hubungan industri dan humas', ikon: 'sekolah', to: '/portal/profil-sekolah' },
  { izin: 'hubin.kelola_profil', nama: 'Profil jurusan', bidang: 'Hubungan industri dan humas', ikon: 'sekolah', to: '/portal/hubin/jurusan' },
  { izin: 'hubin.tulis_berita', nama: 'Berita dan kegiatan', bidang: 'Hubungan industri dan humas', ikon: 'dokumen', to: '/portal/hubin/berita' },
  { izin: 'hubin.kelola_humas', nama: 'Berita dan kegiatan', bidang: 'Hubungan industri dan humas', ikon: 'dokumen', to: '/portal/hubin/berita' },
  { izin: 'hubin.bkk', nama: 'Bursa kerja khusus (BKK)', bidang: 'Hubungan industri dan humas', ikon: 'tas' },
  { izin: 'hubin.tracer', nama: 'Tracer study alumni', bidang: 'Hubungan industri dan humas', ikon: 'grafik', to: '/portal/hubin/tracer' },
  { izin: 'kurikulum.atur_jadwal', nama: 'Jam pelajaran', bidang: 'Kurikulum', ikon: 'kalender', to: '/portal/jam-pelajaran' },
  { izin: 'kurikulum.kalender', nama: 'Kalender sekolah', bidang: 'Kurikulum', ikon: 'kalender', to: '/portal/kalender' },
  { izin: 'kegiatan.kelola', nama: 'Kalender sekolah', bidang: 'Kegiatan sekolah', ikon: 'kalender', to: '/portal/kalender' },
  { izin: 'kurikulum.kelola_info', nama: 'Informasi akademik', bidang: 'Kurikulum', ikon: 'dokumen' },
  { izin: 'program.kelola', nama: 'Program keahlian', bidang: 'Kurikulum', ikon: 'sekolah' },
  { izin: 'kesiswaan.catat', nama: 'Kesiswaan', bidang: 'Kesiswaan', ikon: 'kelompok', to: '/portal/kesiswaan' },
  { izin: 'kesiswaan.pantau', nama: 'Kesiswaan', bidang: 'Kesiswaan', ikon: 'kelompok', to: '/portal/kesiswaan' },
  { izin: 'kesiswaan.izin', nama: 'Kesiswaan', bidang: 'Kesiswaan', ikon: 'kelompok', to: '/portal/kesiswaan' },
  { izin: 'kesiswaan.verifikasi', nama: 'Kesiswaan', bidang: 'Kesiswaan', ikon: 'kelompok', to: '/portal/kesiswaan' },
  { izin: 'kesiswaan.beasiswa', nama: 'Kesiswaan', bidang: 'Kesiswaan', ikon: 'kelompok', to: '/portal/kesiswaan' },
  { izin: 'ekskul.kelola', nama: 'Kesiswaan', bidang: 'Kesiswaan', ikon: 'kelompok', to: '/portal/kesiswaan' },
  { izin: 'ekskul.lihat', nama: 'Kesiswaan', bidang: 'Kesiswaan', ikon: 'kelompok', to: '/portal/kesiswaan' },
  { izin: 'bk.kelola', nama: 'Kesiswaan', bidang: 'Kesiswaan', ikon: 'kelompok', to: '/portal/kesiswaan' },
  { izin: 'bk.baca', nama: 'Kesiswaan', bidang: 'Kesiswaan', ikon: 'kelompok', to: '/portal/kesiswaan' },
  { izin: 'kelas.kelola', nama: 'Kelas saya', bidang: 'Kelas', ikon: 'sekolah' },
  { izin: 'sarpras.kelola', nama: 'Inventaris sarpras', bidang: 'Sarana dan prasarana', ikon: 'tas', to: '/portal/sarpras/inventaris' },
  { izin: 'sarpras.catat_lab', nama: 'Inventaris sarpras', bidang: 'Sarana dan prasarana', ikon: 'tas', to: '/portal/sarpras/inventaris' },
  { izin: 'sarpras.lihat', nama: 'Inventaris sarpras', bidang: 'Sarana dan prasarana', ikon: 'tas', to: '/portal/sarpras/inventaris' },
  { izin: 'sarpras.kelola', nama: 'Usulan sarpras', bidang: 'Sarana dan prasarana', ikon: 'kotak', to: '/portal/sarpras/usulan' },
  { izin: 'sarpras.catat_lab', nama: 'Usulan sarpras', bidang: 'Sarana dan prasarana', ikon: 'kotak', to: '/portal/sarpras/usulan' },
  { izin: 'sarpras.verifikasi_program', nama: 'Usulan sarpras', bidang: 'Sarana dan prasarana', ikon: 'kotak', to: '/portal/sarpras/usulan' },
  { izin: 'sarpras.lihat', nama: 'Usulan sarpras', bidang: 'Sarana dan prasarana', ikon: 'kotak', to: '/portal/sarpras/usulan' },
  { izin: 'sarpras.kelola', nama: 'Pembukuan sarpras', bidang: 'Sarana dan prasarana', ikon: 'grafik', to: '/portal/sarpras/buku' },
  { izin: 'sarpras.lihat', nama: 'Pembukuan sarpras', bidang: 'Sarana dan prasarana', ikon: 'grafik', to: '/portal/sarpras/buku' },
  { izin: 'perpus.kelola', nama: 'Perpustakaan', bidang: 'Perpustakaan', ikon: 'buku' },
  { izin: 'laporan.lihat', nama: 'Laporan sekolah', bidang: 'Pimpinan', ikon: 'grafik' },
  { izin: 'profil.setujui_guru', nama: 'Ajuan perbaikan data', bidang: 'Tata usaha', ikon: 'kotak', to: '/portal/ajuan-masuk' },
  { izin: 'profil.setujui_siswa', nama: 'Ajuan perbaikan data', bidang: 'Tata usaha', ikon: 'kotak', to: '/portal/ajuan-masuk' },
  { izin: 'dapodik.kerjakan_ajuan', nama: 'Antrean perbaikan Dapodik', bidang: 'Tata usaha', ikon: 'kotak', to: '/portal/ajuan-masuk' },
  { izin: 'tamu.catat', nama: 'Buku tamu', bidang: 'Keamanan dan tamu', ikon: 'kelompok', to: '/portal/buku-tamu' },
  { izin: 'tamu.baca_semua', nama: 'Buku tamu', bidang: 'Keamanan dan tamu', ikon: 'kelompok', to: '/portal/buku-tamu' },
  { izin: 'surat.catat', nama: 'Persuratan', bidang: 'Persuratan', ikon: 'surat', to: '/portal/surat' },
  { izin: 'surat.baca_semua', nama: 'Persuratan', bidang: 'Persuratan', ikon: 'surat', to: '/portal/surat' },
  { izin: 'surat.disposisi', nama: 'Persuratan dan disposisi', bidang: 'Persuratan', ikon: 'surat', to: '/portal/surat' },
  { izin: 'surat.teruskan', nama: 'Persuratan', bidang: 'Persuratan', ikon: 'surat', to: '/portal/surat' },
  { izin: 'siswa.lihat_pribadi', nama: 'Daftar siswa', bidang: 'Kesiswaan', ikon: 'kelompok', to: '/portal/peserta-didik' },
  { izin: 'dapodik.unggah', nama: 'Unggah Dapodik (operator)', bidang: 'Dapodik', ikon: 'unggah' },
  { izin: 'keuangan.kelola', nama: 'Keuangan', bidang: 'Tata usaha', ikon: 'uang' },
]

export type MenuPortal = {
  kelompok: KelompokPortal[]
  /** Fitur dari penugasan yang halamannya belum dibangun. */
  segera: { nama: string; bidang: string }[]
}

/** Penugasan ringkas yang dibutuhkan menu: nama jabatan dan izin yang dibawanya. */
export type TugasMenu = { jabatan_nama: string; lingkup_label: string | null; izin: string[] }

/**
 * Menu dasar sesuai peran, lalu satu kelompok per tugas tambahan (jabatan) berisi halaman kerja dari izin jabatan itu.
 * Halaman yang sudah ada di menu peran atau di tugas sebelumnya tidak diulang. Izin tanpa halaman masuk daftar "segera".
 */
export function susunMenu(peran: Peran, superAdmin: boolean, tugas: TugasMenu[]): MenuPortal {
  const kelompok: KelompokPortal[] = menuPeran[peran].map((k) => ({ judul: k.judul, item: [...k.item] }))
  if (superAdmin) {
    const akun = kelompok.find((k) => k.judul === 'Akun dan akses')
    if (akun) akun.item.push(...akunSuper)
    else kelompok.push({ judul: 'Akun dan akses', item: [...akunSuper] })
    kelompok.push({ judul: 'Pengaturan sekolah', item: [...pengaturanSuper] })
  }
  const sudah = new Set(kelompok.flatMap((k) => k.item.map((i) => i.to)))
  const segera: { nama: string; bidang: string }[] = []
  const judulPakai = new Map<string, number>()
  for (const t of tugas) {
    const izin = new Set(t.izin)
    const item: ItemPortal[] = []
    for (const m of menuIzin) {
      if (!izin.has(m.izin)) continue
      if (m.to) {
        if (sudah.has(m.to)) continue
        sudah.add(m.to)
        const lencana = m.to === '/portal/ajuan-masuk' ? 'ajuan_masuk' : m.to === '/portal/surat' ? 'surat' : m.to === '/portal/sarpras/usulan' ? 'sarpras' : m.to === '/portal/kesiswaan' ? 'kesiswaan' : undefined
        item.push({ to: m.to, label: m.nama, ikon: m.ikon, ket: m.bidang, lencana })
      } else if (!segera.some((s) => s.nama === m.nama)) {
        segera.push({ nama: m.nama, bidang: m.bidang })
      }
    }
    if (!item.length) continue
    const dasar = `Tugas tambahan: ${t.jabatan_nama}${t.lingkup_label ? ` (${t.lingkup_label})` : ''}`
    const n = (judulPakai.get(dasar) ?? 0) + 1
    judulPakai.set(dasar, n)
    kelompok.push({ judul: n > 1 ? `${dasar} ${n}` : dasar, item })
  }
  return { kelompok, segera }
}

/** Menu yang paling cocok dengan alamat saat ini (tautan terpanjang yang menjadi awalan). */
export function itemAktif(kelompok: KelompokPortal[], pathname: string): ItemPortal | null {
  let terbaik: ItemPortal | null = null
  for (const k of kelompok)
    for (const i of k.item)
      if (pathname === i.to || pathname.startsWith((i.cocok ?? i.to) + '/') || pathname === i.cocok)
        if (!terbaik || (i.cocok ?? i.to).length > (terbaik.cocok ?? terbaik.to).length) terbaik = i
  return terbaik
}
