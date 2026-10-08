-- Entitas Sarpras: F-TANAH, F-BANGUNAN, F-RUANG, dan lembar Alat, Angkutan, Buku.
-- Urutan pendaftaran penting: bangunan sebelum ruang, ruang sebelum alat dan buku (kolom rujukan).
-- Catatan: butir 1 "Jenis Prasarana" pada lembar F-BANGUNAN di berkas yang kami terima sama dengan F-TANAH (enam jenis lahan),
-- tampak salin-tempel, sehingga tidak dimasukkan ke entitas bangunan.
select private.formulir_daftarkan('sarpras_tanah', 'sarpras', 'Tanah', 'F-TANAH', 'lembar', 'nama', 210, $dsl$
jenis_prasarana|Jenis prasarana|pilihan!|1|Ruang Sirkulasi;Parkir;Lahan Kosong;Lapangan;Kantin;Tanah||
nama|Nama|teks!|2||Atas nama yayasan atau pemda.
no_sertifikat|No. sertifikat tanah|teks|3||
panjang|Panjang|angka|4|0..||m
lebar|Lebar|angka|5|0..||m
luas|Luas|angka|6|0..||m2
luas_tersedia|Luas lahan tersedia|angka|7|0..||m2
kepemilikan|Kepemilikan|pilihan|8|Milik;Pinjam;Sewa;Bukan Milik|Pilih salah satu.
njop|NJOP (Nilai Jual Objek Pajak)|angka|9|0..||Rp
keterangan|Keterangan tanah|teks|10||
$dsl$);

select private.formulir_daftarkan('sarpras_bangunan', 'sarpras', 'Bangunan', 'F-BANGUNAN', 'lembar', 'nama', 220, $dsl$
nama|Nama|teks!|2||
no_sertifikat_tanah|No. sertifikat tanah|teks|3||
panjang|Panjang|angka|4|0..||m
lebar|Lebar|angka|5|0..||m
luas_tapak|Luas tapak bangunan|angka|6|0..||m2
kepemilikan|Kepemilikan|pilihan|7|Milik;Pinjam;Sewa;Bukan Milik|Pilih salah satu.
peminjam|Peminjam / yang meminjamkan|teks|8||Diisi bila kepemilikan Pinjam atau Sewa.
nilai_perolehan|Nilai perolehan aset|angka|9|0..||Rp
jumlah_lantai|Jumlah lantai|bulat|10|1..100|
tahun_dibangun|Tahun dibangun|bulat|11|1900..2100|
keterangan|Keterangan bangunan|teks|12||
tanggal_sk_pemakai|Tanggal SK pemakai|tanggal|13||Format tahun/bulan/tanggal.
$dsl$);

select private.formulir_daftarkan('sarpras_ruang', 'sarpras', 'Ruang', 'F-RUANG', 'lembar', 'nama_ruang', 230, $dsl$
jenis_prasarana|Jenis prasarana|pilihan!|1|Ruang Kelas/Teori;Ruang Kepsek;Ruang Guru;Laboratorium Bahari;Laboratorium Bahasa;Laboratorium Biologi;Laboratorium Fisika;Laboratorium IPA;Laboratorium IPS;Laboratorium Komputer;Laboratorium Kimia;Laboratorium Multimedia;Laboratorium Nautika;Ruang Perpustakaan;Ruang Perpustakaan Multimedia;Bengkel;Ruang Praktik Kerja;Ruang Keterampilan;Ruang Serba Guna/Aula;Ruang UKS;Ruang Diesel;Ruang Pameran;Ruang Gambar;Koperasi/Toko;Ruang BP/BK;Ruang TU;Ruang OSIS;Kamar Mandi/WC Guru Laki-laki;Kamar Mandi/WC Guru Perempuan;Kamar Mandi/WC Siswa Laki-laki;Kamar Mandi/WC Siswa Perempuan;Gudang;Ruang Ibadah;Rumah Dinas Kepala Sekolah;Rumah Dinas Guru;Rumah Penjaga Sekolah;Sanggar MGMP;Sanggar PKG;Asrama Siswa;Unit Produksi;Ruang Multimedia;Ruang Pusat Belajar Guru;Ruang Olahraga;Ruang Orientasi dan Mobilitas (OM);Ruang Bina Wicara;Ruang Bina Persepsi Bunyi dan Irama;Ruang Bina Diri;Ruang Bina Diri dan Bina Gerak;Ruang Bina Pribadi dan Sosial;Ruang Konseling/Asesmen;Ruang Terapi;Ruang Sirkulasi;Kantin|
bangunan_id|Bangunan|rujukan|2|sarpras_bangunan|Sesuaikan dengan bangunan yang sudah diisi pada formulir Bangunan.
kode_ruang|Kode ruang|teks|3||Sesuaikan dengan kode ruang yang sudah ada di sekolah.
nama_ruang|Nama ruang|teks!|4||
registrasi_ruang|Registrasi ruang|teks|5||
lantai_ke|Lantai ke-|bulat|6|0..100|
panjang|Panjang|angka|7|0..||m
lebar|Lebar|angka|8|0..||m
luas|Luas ruang|angka|9|0..||m2
kapasitas|Kapasitas|bulat|10|0..10000||orang
luas_plester|Luas plester|angka|11|0..||m2
luas_plafon|Luas plafon|angka|12|0..||m2
luas_dinding|Luas dinding|angka|13|0..||m2
luas_daun_jendela|Luas daun jendela|angka|14|0..||m2
luas_daun_pintu|Luas daun pintu|angka|15|0..||m2
panjang_kusen|Panjang kusen|angka|16|0..||m
luas_tutup_lantai|Luas tutup lantai|angka|17|0..||m2
luas_instalasi_listrik|Luas instalasi listrik|angka|18|0..||m
jumlah_instalasi_listrik|Jumlah instalasi listrik|bulat|19|0..10000|
panjang_instalasi_air|Panjang instalasi air|angka|20|0..||m
jumlah_instalasi_air|Jumlah instalasi air|bulat|21|0..10000|
panjang_drainase|Panjang drainase|angka|22|0..||m
luas_finish_struktur|Luas finish struktur|angka|23|0..||m2
luas_finish_plafon|Luas finish plafon|angka|24|0..||m2
luas_finish_dinding|Luas finish dinding|angka|25|0..||m2
luas_finish_kpj|Luas finish KPJ|angka|26|0..||m2
kerusakan|Kerusakan|pilihan|28|Tidak ada kerusakan;Rusak ringan;Rusak sedang;Rusak berat|Rusak ringan 1-30%, sedang 31-45%, berat 46-100%.
nilai_kerusakan|Nilai kerusakan|angka|29|0..100|Isi nilai 1 sampai 100.
$dsl$);

select private.formulir_daftarkan('sarpras_alat', 'sarpras', 'Alat', 'F-ALAT', 'tabel', 'nama', 240, $dsl$
ruang_id|Ruang|rujukan|1|sarpras_ruang|Sesuaikan dengan ruang tempat alat berada.
jenis_sarana|Jenis sarana|teks!|2||Sesuaikan dengan referensi aplikasi Dapodikdasmen.
nama|Nama|teks!|3||
spesifikasi|Spesifikasi|teks|4||
kepemilikan|Kepemilikan|pilihan|5|Milik;Pinjam;Sewa;Bukan Milik|
$dsl$);

select private.formulir_daftarkan('sarpras_angkutan', 'sarpras', 'Angkutan', 'F-ANGKUTAN', 'tabel', 'nama', 250, $dsl$
jenis_sarana|Jenis sarana|pilihan!|6|Bis Sekolah;Mobil Bak Terbuka;Mobil Dinas;Mobil Truck;Motor;Perahu;Sepeda|Pilih sesuai transportasi yang digunakan sekolah.
nama|Nama|teks!|7||
spesifikasi|Spesifikasi|teks|8||
merk|Merk|teks|9||
no_polisi|No. polisi|teks|10||
no_bpkb|No. BPKB|teks|11||
alamat|Alamat|teks|12||Disesuaikan dengan alamat pada surat kendaraan.
kepemilikan|Kepemilikan|pilihan|13|Milik;Pinjam;Sewa;Bukan Milik|
$dsl$);

select private.formulir_daftarkan('sarpras_buku', 'sarpras', 'Buku', 'F-BUKU', 'tabel', 'nama_buku', 260, $dsl$
ruang_id|Ruang|rujukan|14|sarpras_ruang|Sesuaikan dengan letak buku berdasarkan ruang.
buku_pustaka|Buku pustaka|teks|15||
mata_pelajaran|Mata pelajaran|teks|16||
tingkat_pendidikan|Tingkat pendidikan|pilihan|17|Tingkat 1;Tingkat 2;Tingkat 3;Tingkat 4;Tingkat 5;Tingkat 6;Tingkat 7;Tingkat 8;Tingkat 9;Tingkat 10;Tingkat 11;Tingkat 12;Tingkat 13;Kelompok A;Kelompok B|
nama_buku|Nama buku|teks!|18||
$dsl$);
