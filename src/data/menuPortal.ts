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
  lencana?: 'ajuan_masuk' | 'ajuan_saya' | 'disposisi' | 'surat' | 'sarpras' | 'sarpras_kerusakan' | 'sarpras_permintaan' | 'kesiswaan' | 'chat'
}
export type KelompokPortal = { judul: string; item: ItemPortal[] }

export const namaPeran: Record<Peran, string> = {
  admin_tu: 'Admin TU',
  guru: 'Guru',
  staf: 'Staf TU',
  siswa: 'Siswa',
  orang_tua: 'Orang tua',
  admin_ujian: 'Admin ujian',
}

const ajuanSaya: ItemPortal = { to: '/portal/ajuan', label: 'Ajuan saya', ikon: 'kotak', ket: 'Perbaikan data yang diajukan dan keputusannya', lencana: 'ajuan_saya' }
const chat: ItemPortal = { to: '/portal/chat', label: 'Chat', ikon: 'chat', ket: 'Percakapan kelas, tanya guru, dan ruang guru', lencana: 'chat' }
const disposisi: ItemPortal = { to: '/portal/disposisi', label: 'Disposisi saya', ikon: 'surat', ket: 'Instruksi dari pimpinan untuk Anda', lencana: 'disposisi' }

const menuPeran: Record<Peran, KelompokPortal[]> = {
  siswa: [
    {
      judul: 'Belajar',
      item: [
        { to: '/portal/lms', label: 'Kelas saya', ikon: 'buku', ket: 'Materi, lembar kerja, dan diskusi per pertemuan' },
        { to: '/portal/penilaian/kuis', cocok: '/portal/penilaian', label: 'Kuis dan ulangan', ikon: 'centang', ket: 'Kuis, ulangan harian, UTS, dan UAS dari semua kelas' },
        { to: '/portal/progres-lms', label: 'Nilai dan progres', ikon: 'grafik', ket: 'Kehadiran, materi, nilai kuis, dan tugas semua mapel' },
        { to: '/asesmen', label: 'Ujian digital (CBT)', ikon: 'pena', ket: 'Jadwal dan ruang ujian sekolah. Masuk dengan token dari pengawas' },
        chat,
        { to: '/portal/panduan-lms', label: 'Panduan belajar', ikon: 'info', ket: 'Cara mengikuti pertemuan langkah demi langkah' },
      ],
    },
    {
      judul: 'Data diri',
      item: [
        { to: '/portal/data-saya', label: 'Data saya', ikon: 'pengguna', ket: 'Identitas, catatan kesiswaan, dan ajuan perbaikan data', lencana: 'ajuan_saya' },
      ],
    },
  ],
  guru: [
    {
      judul: 'Mengajar',
      item: [
        { to: '/portal/lms', label: 'Kelas saya', ikon: 'buku', ket: 'Kelas, pertemuan, materi, lembar kerja, dan tugas' },
        { to: '/portal/lms/dashboard', label: 'Pantau semua kelas', ikon: 'grafik', ket: 'Siapa sudah hadir dan mengumpulkan, semua kelas dalam satu layar' },
        { to: '/portal/penilaian/kuis', cocok: '/portal/penilaian', label: 'Kuis dan ulangan', ikon: 'centang', ket: 'Kuis, ulangan harian, UTS, dan UAS semua kelas' },
        { to: '/portal/absensi', label: 'Rekap kehadiran', ikon: 'centang', ket: 'Jumlah siswa yang diajar dan rekap kehadiran per kelas' },
        { to: '/asesmen', label: 'Asesmen digital (CBT)', ikon: 'pena', ket: 'Bank soal dan pengawasan ujian sekolah (UTS, UAS)' },
        chat,
        { to: '/portal/panduan-lms', label: 'Panduan mengajar', ikon: 'info', ket: 'Urutan menyiapkan dan menjalankan satu pertemuan' },
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
    { judul: 'Komunikasi', item: [chat] },
    { judul: 'Ujian', item: [{ to: '/asesmen', label: 'Asesmen digital (CBT)', ikon: 'pena', ket: 'Bank soal dan pengawasan ujian sekolah' }] },
    {
      judul: 'Data diri',
      item: [
        disposisi,
        { to: '/portal/data-saya', label: 'Profil saya', ikon: 'pengguna', ket: 'Data pribadi dan kepegawaian seperti di Dapodik' },
        ajuanSaya,
      ],
    },
  ],
  admin_ujian: [],
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
        { to: '/portal/lms', label: 'Kelas ajar', ikon: 'buku', ket: 'Kelas, materi, absensi per pertemuan' },
        { to: '/portal/absensi', label: 'Absensi', ikon: 'centang', ket: 'Jumlah siswa yang diajar dan rekap kehadiran per kelas' },
        { to: '/portal/lms/administrasi', label: 'Administrasi guru', ikon: 'dokumen', ket: 'Perangkat ajar dan supervisi' },
        chat,
        { to: '/asesmen', label: 'Asesmen digital (CBT)', ikon: 'pena', ket: 'Kelola ujian, ruang, bank soal, dan pengawas' },
      ],
    },
    {
      judul: 'Persuratan',
      item: [
        { to: '/portal/surat', label: 'Persuratan', ikon: 'surat', ket: 'Register surat masuk dan keluar, disposisi', lencana: 'surat' },
        { to: '/portal/surat/draf', label: 'Draf surat dan SK', ikon: 'dokumen', ket: 'Draf SK dari bidang yang sudah disetujui Kepala Sekolah, siap didaftarkan' },
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
  { to: '/portal/kurikulum/struktur', label: 'Struktur kurikulum', ikon: 'buku', ket: 'Durasi jam pelajaran, daftar mapel, dan jam per minggu per tingkat dan program' },
  { to: '/portal/kurikulum/beban', label: 'Beban mengajar', ikon: 'kelompok', ket: 'Pembagian guru per mapel dan kelas, linieritas dari Dapodik, dan rekap jam per guru' },
  { to: '/portal/kurikulum/jadwal', label: 'Jadwal pelajaran', ikon: 'kalender', ket: 'Susun jadwal per kelas dengan penjagaan bentrok guru dan kuota jam mapel' },
  { to: '/portal/kurikulum/wali-kelas', label: 'Wali kelas', ikon: 'sekolah', ket: 'Usulan wali kelas, persetujuan Kepala Sekolah, dan lampiran SK' },
  { to: '/portal/kurikulum/formulir', label: 'Formulir rombel', ikon: 'dokumen', ket: 'F-ROMBEL: jurusan, moving class, SK mengajar, dan cetak format Dapodik' },
  { to: '/portal/sarpras/buku', label: 'Sarana dan prasarana', ikon: 'tas', ket: 'Inventaris, kerusakan, permintaan, usulan bertingkat, kartu inventaris, dan pembukuan' },
  { to: '/portal/spmi', label: 'Penjaminan mutu (SPMI)', ikon: 'centang', ket: 'Standar mutu, indikator, dan dokumen satuan penjamin mutu internal' },
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
  { izin: 'kurikulum.struktur', nama: 'Struktur kurikulum', bidang: 'Kurikulum', ikon: 'buku', to: '/portal/kurikulum/struktur' },
  { izin: 'kurikulum.struktur', nama: 'Beban mengajar', bidang: 'Kurikulum', ikon: 'kelompok', to: '/portal/kurikulum/beban' },
  { izin: 'kurikulum.struktur', nama: 'Jadwal pelajaran', bidang: 'Kurikulum', ikon: 'kalender', to: '/portal/kurikulum/jadwal' },
  { izin: 'kurikulum.struktur', nama: 'Wali kelas', bidang: 'Kurikulum', ikon: 'sekolah', to: '/portal/kurikulum/wali-kelas' },
  { izin: 'kurikulum.struktur', nama: 'Formulir rombel', bidang: 'Kurikulum', ikon: 'dokumen', to: '/portal/kurikulum/formulir' },
  { izin: 'kurikulum.setujui', nama: 'Persetujuan wali kelas', bidang: 'Kurikulum', ikon: 'centang', to: '/portal/kurikulum/wali-kelas' },
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
  { izin: 'sarpras.operasional', nama: 'Inventaris sarpras', bidang: 'Sarana dan prasarana', ikon: 'tas', to: '/portal/sarpras/inventaris' },
  { izin: 'sarpras.catat_lab', nama: 'Inventaris sarpras', bidang: 'Sarana dan prasarana', ikon: 'tas', to: '/portal/sarpras/inventaris' },
  { izin: 'sarpras.lihat', nama: 'Inventaris sarpras', bidang: 'Sarana dan prasarana', ikon: 'tas', to: '/portal/sarpras/inventaris' },
  { izin: 'sarpras.kelola', nama: 'Formulir Dapodik sarpras', bidang: 'Sarana dan prasarana', ikon: 'dokumen', to: '/portal/sarpras/formulir' },
  { izin: 'sarpras.kelola', nama: 'Laporan kerusakan', bidang: 'Sarana dan prasarana', ikon: 'kotak', to: '/portal/sarpras/kerusakan' },
  { izin: 'sarpras.operasional', nama: 'Laporan kerusakan', bidang: 'Sarana dan prasarana', ikon: 'kotak', to: '/portal/sarpras/kerusakan' },
  { izin: 'sarpras.catat_lab', nama: 'Laporan kerusakan', bidang: 'Sarana dan prasarana', ikon: 'kotak', to: '/portal/sarpras/kerusakan' },
  { izin: 'sarpras.verifikasi_program', nama: 'Laporan kerusakan', bidang: 'Sarana dan prasarana', ikon: 'kotak', to: '/portal/sarpras/kerusakan' },
  { izin: 'sarpras.lihat', nama: 'Laporan kerusakan', bidang: 'Sarana dan prasarana', ikon: 'kotak', to: '/portal/sarpras/kerusakan' },
  { izin: 'sarpras.kelola', nama: 'Permintaan alat dan bahan', bidang: 'Sarana dan prasarana', ikon: 'kotak', to: '/portal/sarpras/permintaan' },
  { izin: 'sarpras.operasional', nama: 'Permintaan alat dan bahan', bidang: 'Sarana dan prasarana', ikon: 'kotak', to: '/portal/sarpras/permintaan' },
  { izin: 'sarpras.catat_lab', nama: 'Permintaan alat dan bahan', bidang: 'Sarana dan prasarana', ikon: 'kotak', to: '/portal/sarpras/permintaan' },
  { izin: 'sarpras.verifikasi_program', nama: 'Permintaan alat dan bahan', bidang: 'Sarana dan prasarana', ikon: 'kotak', to: '/portal/sarpras/permintaan' },
  { izin: 'sarpras.lihat', nama: 'Permintaan alat dan bahan', bidang: 'Sarana dan prasarana', ikon: 'kotak', to: '/portal/sarpras/permintaan' },
  { izin: 'sarpras.kelola', nama: 'Usulan sarpras', bidang: 'Sarana dan prasarana', ikon: 'kotak', to: '/portal/sarpras/usulan' },
  { izin: 'sarpras.operasional', nama: 'Usulan sarpras', bidang: 'Sarana dan prasarana', ikon: 'kotak', to: '/portal/sarpras/usulan' },
  { izin: 'sarpras.catat_lab', nama: 'Usulan sarpras', bidang: 'Sarana dan prasarana', ikon: 'kotak', to: '/portal/sarpras/usulan' },
  { izin: 'sarpras.verifikasi_program', nama: 'Usulan sarpras', bidang: 'Sarana dan prasarana', ikon: 'kotak', to: '/portal/sarpras/usulan' },
  { izin: 'sarpras.lihat', nama: 'Usulan sarpras', bidang: 'Sarana dan prasarana', ikon: 'kotak', to: '/portal/sarpras/usulan' },
  { izin: 'sarpras.kelola', nama: 'Kartu inventaris', bidang: 'Sarana dan prasarana', ikon: 'cetak', to: '/portal/sarpras/kartu' },
  { izin: 'sarpras.operasional', nama: 'Kartu inventaris', bidang: 'Sarana dan prasarana', ikon: 'cetak', to: '/portal/sarpras/kartu' },
  { izin: 'sarpras.catat_lab', nama: 'Kartu inventaris', bidang: 'Sarana dan prasarana', ikon: 'cetak', to: '/portal/sarpras/kartu' },
  { izin: 'sarpras.verifikasi_program', nama: 'Kartu inventaris', bidang: 'Sarana dan prasarana', ikon: 'cetak', to: '/portal/sarpras/kartu' },
  { izin: 'sarpras.lihat', nama: 'Kartu inventaris', bidang: 'Sarana dan prasarana', ikon: 'cetak', to: '/portal/sarpras/kartu' },
  { izin: 'sarpras.kelola', nama: 'Pembukuan sarpras', bidang: 'Sarana dan prasarana', ikon: 'grafik', to: '/portal/sarpras/buku' },
  { izin: 'sarpras.operasional', nama: 'Pembukuan sarpras', bidang: 'Sarana dan prasarana', ikon: 'grafik', to: '/portal/sarpras/buku' },
  { izin: 'sarpras.lihat', nama: 'Pembukuan sarpras', bidang: 'Sarana dan prasarana', ikon: 'grafik', to: '/portal/sarpras/buku' },
  { izin: 'perpus.kelola', nama: 'Perpustakaan', bidang: 'Perpustakaan', ikon: 'buku' },
  { izin: 'spmi.kelola', nama: 'Penjaminan mutu (SPMI)', bidang: 'Penjaminan mutu', ikon: 'centang', to: '/portal/spmi' },
  { izin: 'spmi.catat', nama: 'Penjaminan mutu (SPMI)', bidang: 'Penjaminan mutu', ikon: 'centang', to: '/portal/spmi' },
  { izin: 'spmi.lihat', nama: 'Penjaminan mutu (SPMI)', bidang: 'Penjaminan mutu', ikon: 'centang', to: '/portal/spmi' },
  { izin: 'laporan.lihat', nama: 'Laporan sekolah', bidang: 'Pimpinan', ikon: 'grafik' },
  { izin: 'profil.setujui_guru', nama: 'Ajuan perbaikan data', bidang: 'Tata usaha', ikon: 'kotak', to: '/portal/ajuan-masuk' },
  { izin: 'profil.setujui_siswa', nama: 'Ajuan perbaikan data', bidang: 'Tata usaha', ikon: 'kotak', to: '/portal/ajuan-masuk' },
  { izin: 'dapodik.kerjakan_ajuan', nama: 'Antrean perbaikan Dapodik', bidang: 'Tata usaha', ikon: 'kotak', to: '/portal/ajuan-masuk' },
  { izin: 'tamu.catat', nama: 'Buku tamu', bidang: 'Keamanan dan tamu', ikon: 'kelompok', to: '/portal/buku-tamu' },
  { izin: 'tamu.baca_semua', nama: 'Buku tamu', bidang: 'Keamanan dan tamu', ikon: 'kelompok', to: '/portal/buku-tamu' },
  { izin: 'surat.catat', nama: 'Persuratan', bidang: 'Persuratan', ikon: 'surat', to: '/portal/surat' },
  { izin: 'surat.baca_semua', nama: 'Persuratan', bidang: 'Persuratan', ikon: 'surat', to: '/portal/surat' },
  { izin: 'surat.draf', nama: 'Draf surat dan SK', bidang: 'Persuratan', ikon: 'dokumen', to: '/portal/surat/draf' },
  { izin: 'surat.setujui_draf', nama: 'Draf surat dan SK', bidang: 'Persuratan', ikon: 'dokumen', to: '/portal/surat/draf' },
  { izin: 'surat.catat', nama: 'Draf surat dan SK', bidang: 'Persuratan', ikon: 'dokumen', to: '/portal/surat/draf' },
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
        const lencana = m.to === '/portal/ajuan-masuk' ? 'ajuan_masuk' : m.to === '/portal/surat' ? 'surat' : m.to === '/portal/sarpras/usulan' ? 'sarpras' : m.to === '/portal/sarpras/kerusakan' ? 'sarpras_kerusakan' : m.to === '/portal/sarpras/permintaan' ? 'sarpras_permintaan' : m.to === '/portal/kesiswaan' ? 'kesiswaan' : undefined
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
