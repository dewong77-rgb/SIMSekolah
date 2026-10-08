// Definisi bagian riwayat pada formulir Dapodik (F-PTK dan F-PD). Dipakai editor di profil dan tampilan cetak.
// Nama bagian harus sama dengan private.bagian_riwayat_sah di basis data.
export type TipeIsi = 'teks' | 'tanggal' | 'angka' | 'pilihan'
export type KolomRiwayat = { kunci: string; label: string; tipe?: TipeIsi; pilihan?: string[] }
export type BagianRiwayat = { kunci: string; judul: string; kolom: KolomRiwayat[] }

const yaTidak = ['Ya', 'Tidak']
const k = (kunci: string, label: string, tipe: TipeIsi = 'teks', pilihan?: string[]): KolomRiwayat => ({ kunci, label, tipe, pilihan })

export const bagianPtk: BagianRiwayat[] = [
  { kunci: 'anak', judul: 'Anak', kolom: [
    k('status', 'Status', 'pilihan', ['Anak Kandung', 'Anak Tiri', 'Anak Angkat']), k('jenjang', 'Jenjang'), k('nisn', 'NISN'),
    k('nama', 'Nama anak'), k('jk', 'L/P', 'pilihan', ['L', 'P']), k('tempat_lahir', 'Tempat lahir'), k('tanggal_lahir', 'Tanggal lahir', 'tanggal'), k('tahun_masuk', 'Tahun masuk', 'angka'),
  ] },
  { kunci: 'pendidikan_formal', judul: 'Riwayat pendidikan formal', kolom: [
    k('bidang_studi', 'Bidang studi'), k('jenjang', 'Jenjang', 'pilihan', ['SMA / sederajat', 'D1', 'D2', 'D3', 'D4', 'S1', 'S2', 'S3']), k('gelar', 'Gelar'),
    k('satuan', 'Satuan pendidikan'), k('fakultas', 'Fakultas'), k('kependidikan', 'Kependidikan', 'pilihan', yaTidak),
    k('tahun_masuk', 'Tahun masuk', 'angka'), k('tahun_lulus', 'Tahun lulus', 'angka'), k('nim', 'NIM'), k('masih', 'Masih kuliah', 'pilihan', yaTidak),
    k('semester', 'Semester', 'angka'), k('ipk', 'IPK'),
  ] },
  { kunci: 'sertifikasi', judul: 'Riwayat sertifikasi', kolom: [
    k('jenis', 'Jenis sertifikasi'), k('nomor', 'No. sertifikasi'), k('tahun', 'Tahun sertifikasi'), k('bidang_studi', 'Bidang studi'),
    k('no_registrasi', 'No. registrasi'), k('no_peserta', 'No. peserta'),
  ] },
  { kunci: 'diklat', judul: 'Diklat', kolom: [k('jenis', 'Jenis diklat'), k('nama', 'Nama'), k('penyelenggara', 'Penyelenggara'), k('tahun', 'Tahun', 'angka'), k('peran', 'Peran')] },
  { kunci: 'tugas_tambahan', judul: 'Tugas tambahan', kolom: [
    k('jabatan', 'Jabatan PTK'), k('jam_per_minggu', 'Jam per minggu', 'angka'), k('nomor_sk', 'Nomor SK'), k('tmt', 'TMT tambahan', 'tanggal'), k('tst', 'TST tambahan', 'tanggal'),
  ] },
  { kunci: 'jabatan_struktural', judul: 'Riwayat jabatan struktural', kolom: [k('jabatan', 'Jabatan PTK'), k('sk', 'SK struktural'), k('tmt', 'TMT jabatan', 'tanggal')] },
  { kunci: 'jabatan_fungsional', judul: 'Riwayat jabatan fungsional', kolom: [k('jabatan', 'Jabatan fungsional'), k('sk', 'SK jabatan fungsional'), k('tmt', 'TMT jabatan', 'tanggal')] },
  { kunci: 'kepangkatan', judul: 'Riwayat kepangkatan', kolom: [
    k('pangkat', 'Pangkat / golongan'), k('no_sk', 'No. SK'), k('tanggal_sk', 'Tanggal SK', 'tanggal'), k('tmt', 'TMT pangkat', 'tanggal'),
    k('masa_kerja_tahun', 'Masa kerja (tahun)', 'angka'), k('masa_kerja_bulan', 'Masa kerja (bulan)', 'angka'),
  ] },
  { kunci: 'gaji_berkala', judul: 'Riwayat gaji berkala', kolom: [
    k('pangkat', 'Pangkat / golongan'), k('no_sk', 'No. SK'), k('tanggal_sk', 'Tanggal SK', 'tanggal'), k('tmt_kgb', 'TMT KGB', 'tanggal'),
    k('masa_kerja_tahun', 'Masa kerja (tahun)', 'angka'), k('masa_kerja_bulan', 'Masa kerja (bulan)', 'angka'), k('gaji_pokok', 'Gaji pokok', 'angka'),
  ] },
  { kunci: 'karir', judul: 'Riwayat karir guru', kolom: [
    k('jenjang', 'Jenjang'), k('jenis_lembaga', 'Jenis lembaga'), k('status_kepegawaian', 'Status kepegawaian'), k('jenis_ptk', 'Jenis PTK'),
    k('lembaga_pengangkat', 'Lembaga pengangkat'), k('no_sk', 'No. SK kerja'), k('tanggal_sk', 'Tanggal SK kerja', 'tanggal'),
    k('tmt', 'TMT kerja', 'tanggal'), k('tst', 'TST kerja', 'tanggal'), k('tempat_kerja', 'Tempat kerja'), k('penandatangan', 'Penandatangan SK'), k('mapel', 'Mapel diajarkan'),
  ] },
  { kunci: 'tunjangan', judul: 'Tunjangan', kolom: [
    k('jenis', 'Jenis'), k('nama', 'Nama'), k('instansi', 'Instansi'), k('sumber_dana', 'Sumber dana'), k('dari_tahun', 'Dari tahun', 'angka'),
    k('sampai_tahun', 'Sampai tahun', 'angka'), k('nominal', 'Nominal', 'angka'), k('status', 'Status'),
  ] },
  { kunci: 'kesejahteraan', judul: 'Kesejahteraan', kolom: [
    k('jenis', 'Jenis kesejahteraan'), k('nama', 'Nama'), k('penyelenggara', 'Penyelenggara'), k('dari_tahun', 'Dari tahun', 'angka'), k('sampai_tahun', 'Sampai tahun', 'angka'), k('status', 'Status'),
  ] },
  { kunci: 'beasiswa', judul: 'Beasiswa', kolom: [k('jenis', 'Jenis'), k('penyelenggara', 'Penyelenggara'), k('dari_tahun', 'Dari tahun', 'angka'), k('sampai_tahun', 'Sampai tahun', 'angka'), k('masih_menerima', 'Masih menerima', 'pilihan', yaTidak)] },
  { kunci: 'penghargaan', judul: 'Penghargaan', kolom: [k('tingkat', 'Tingkat'), k('jenis', 'Jenis penghargaan'), k('nama', 'Nama'), k('tahun', 'Tahun', 'angka'), k('instansi', 'Instansi')] },
  { kunci: 'nilai_tes', judul: 'Nilai tes', kolom: [k('jenis', 'Jenis tes'), k('nama', 'Nama'), k('penyelenggara', 'Penyelenggara'), k('tahun', 'Tahun', 'angka'), k('skor', 'Skor')] },
  { kunci: 'karya_tulis', judul: 'Karya tulis', kolom: [k('judul', 'Judul'), k('tahun', 'Tahun', 'angka'), k('publikasi', 'Publikasi'), k('keterangan', 'Keterangan')] },
  { kunci: 'buku', judul: 'Buku', kolom: [k('judul', 'Judul buku'), k('tahun', 'Tahun', 'angka'), k('penerbit', 'Penerbit')] },
]

export const bagianSiswa: BagianRiwayat[] = [
  { kunci: 'prestasi', judul: 'Prestasi', kolom: [k('jenis', 'Jenis prestasi'), k('tingkat', 'Tingkat'), k('nama', 'Nama prestasi'), k('tahun', 'Tahun', 'angka'), k('penyelenggara', 'Penyelenggara')] },
  { kunci: 'beasiswa', judul: 'Beasiswa', kolom: [k('jenis', 'Jenis'), k('penyelenggara', 'Penyelenggara / sumber'), k('tahun_mulai', 'Tahun mulai', 'angka'), k('tahun_selesai', 'Tahun selesai', 'angka')] },
]

export type BarisRiwayat = {
  id: string; bagian: string; data: Record<string, string>; sumber: 'mandiri' | 'dapodik'; status: 'baru' | 'dientri'; dibuat_pada: string
}

export const bagianUntuk = (jenis: 'ptk' | 'siswa') => (jenis === 'ptk' ? bagianPtk : bagianSiswa)

/** Nilai tanggal ISO menjadi "5 Mei 2024"; selain itu apa adanya. */
export const tampilIsi = (x: string | undefined) =>
  !x ? '' : /^\d{4}-\d{2}-\d{2}$/.test(x) ? new Date(x + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : x
