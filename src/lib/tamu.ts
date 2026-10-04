// Pilihan buku tamu. Kunci sama dengan batasan check di tabel tamu_kunjungan.
export const kategoriTamu: Record<string, string> = {
  orang_tua: 'Orang tua atau wali siswa',
  dinas: 'Dinas atau instansi pemerintah',
  mitra_industri: 'Mitra industri (DU/DI)',
  alumni: 'Alumni',
  calon_siswa: 'Calon siswa atau pendaftar',
  vendor: 'Penyedia barang atau jasa',
  lainnya: 'Lainnya',
}

export const tujuanTamu: Record<string, string> = {
  bertemu_pimpinan: 'Bertemu pimpinan sekolah',
  bertemu_guru: 'Bertemu guru atau staf',
  urusan_administrasi: 'Urusan administrasi (surat, data, legalisir)',
  jemput_siswa: 'Menjemput atau menemui siswa',
  kerja_sama: 'Kerja sama atau kunjungan industri',
  kunjungan_dinas: 'Pembinaan, monitoring, atau kunjungan dinas',
  antar_barang: 'Mengantar atau mengambil barang',
  lainnya: 'Lainnya',
}

export type Kunjungan = {
  id: string; tanggal: string; urut: number; nama: string; asal: string; kategori: string; tujuan: string
  keperluan: string | null; bertemu: string | null; jumlah: number; telepon: string | null; sumber: string
  dicatat_nama: string | null; jam_datang: string; jam_pulang: string | null
}

export const jam = (x: string | null | undefined) =>
  x ? new Date(x).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).replace('.', ':') : '-'
