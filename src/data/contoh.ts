// Data contoh untuk tahap prototipe. Diganti kueri Supabase saat disambung.

export const sekolah = {
  nama: 'SMKN 1 Gunung Sindur',
  npsn: '20271184',
  kabupaten: 'Kabupaten Bogor',
  provinsi: 'Jawa Barat',
  alamat: 'Alamat sekolah (isi dari profil Dapodik)',
  telepon: '(021) 0000 0000',
  email: 'info@smkn1gunungsindur.sch.id',
  jam: 'Senin sampai Jumat, 07.00 sampai 15.30 WIB',
}

// Angka berasal dari contoh unduhan Dapodik 30 September 2026.
export const ringkasan = [
  { label: 'Peserta didik aktif', nilai: '1.358' },
  { label: 'Guru dan tenaga kependidikan', nilai: '67' },
  { label: 'Rombongan belajar', nilai: '34' },
  { label: 'Alumni tercatat', nilai: '3.354' },
]

export type Jurusan = { slug: string; nama: string; ringkas: string; prospek: string[] }

export const jurusan: Jurusan[] = [
  {
    slug: 'teknik-otomotif',
    nama: 'Teknik Otomotif',
    ringkas: 'Perawatan, perbaikan, dan diagnosis kendaraan ringan dan sepeda motor.',
    prospek: ['Teknisi bengkel resmi', 'Wirausaha bengkel', 'Industri komponen otomotif'],
  },
  {
    slug: 'teknik-pemesinan',
    nama: 'Teknik Pemesinan',
    ringkas: 'Pengoperasian mesin bubut, frais, dan dasar CNC untuk pembuatan komponen.',
    prospek: ['Operator mesin CNC', 'Quality control', 'Industri manufaktur'],
  },
  {
    slug: 'elektronika-industri',
    nama: 'Elektronika Industri',
    ringkas: 'Instalasi, kontrol, dan perawatan sistem elektronika dan otomasi industri.',
    prospek: ['Teknisi otomasi', 'Teknisi instrumentasi', 'Industri elektronik'],
  },
]

export type Berita = { slug: string; judul: string; tanggal: string; kategori: string; ringkas: string }

export const berita: Berita[] = [
  {
    slug: 'contoh-1',
    judul: 'Contoh berita: kunjungan industri kelas XI',
    tanggal: '2026-09-26',
    kategori: 'Kegiatan',
    ringkas: 'Teks contoh. Ringkasan berita akan tampil di sini setelah modul berita tersambung.',
  },
  {
    slug: 'contoh-2',
    judul: 'Contoh berita: pengumuman jadwal asesmen',
    tanggal: '2026-09-22',
    kategori: 'Akademik',
    ringkas: 'Teks contoh. Pengumuman resmi sekolah akan dipublikasikan melalui halaman ini.',
  },
  {
    slug: 'contoh-3',
    judul: 'Contoh berita: prestasi siswa tingkat kabupaten',
    tanggal: '2026-09-15',
    kategori: 'Prestasi',
    ringkas: 'Teks contoh. Kabar prestasi siswa dan guru ditampilkan di bagian ini.',
  },
]

export const kalender = [
  { tanggal: '2026-10-12', kegiatan: 'Contoh: awal asesmen tengah semester' },
  { tanggal: '2026-10-23', kegiatan: 'Contoh: akhir asesmen tengah semester' },
  { tanggal: '2026-11-10', kegiatan: 'Contoh: peringatan Hari Pahlawan' },
  { tanggal: '2026-12-14', kegiatan: 'Contoh: awal asesmen akhir semester' },
]

export const mitraIndustri = [
  { nama: 'Contoh mitra industri A', bidang: 'Otomotif', status: 'MoU aktif' },
  { nama: 'Contoh mitra industri B', bidang: 'Manufaktur', status: 'MoU aktif' },
  { nama: 'Contoh mitra industri C', bidang: 'Elektronika', status: 'Praktik industri' },
]

export const koleksiPerpustakaan = [
  { judul: 'Contoh buku teks Informatika', kategori: 'Buku teks', tersedia: true },
  { judul: 'Contoh modul Teknik Pemesinan', kategori: 'Modul', tersedia: true },
  { judul: 'Contoh buku bacaan umum', kategori: 'Nonfiksi', tersedia: false },
]
