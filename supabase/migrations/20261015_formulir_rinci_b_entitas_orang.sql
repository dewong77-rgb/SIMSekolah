-- Entitas rinci F-PTK (data rinci) dan F-PD (prestasi, beasiswa). Sumber kebenaran isi: lembar formulir resmi Dapodik.
select private.formulir_daftarkan('ptk_sertifikasi', 'ptk', 'Riwayat sertifikasi', 'F-PTK', 'tabel', 'jenis_sertifikasi', 10, $dsl$
jenis_sertifikasi|Jenis sertifikasi|teks!|DR1||Jenis sertifikasi yang diterima.
nomor_sertifikasi|Nomor sertifikasi|teks|DR2||Nomor sertifikat sertifikasi.
tahun_sertifikasi|Tahun sertifikasi|bulat|DR3|1980..2100|Tahun lulus sertifikasi.
bidang_studi|Bidang studi|teks|DR4||Bidang studi sertifikasi.
nrg|NRG|teks|DR5||Nomor Registrasi Guru.
nomor_peserta|Nomor peserta|teks|DR6||Nomor peserta saat mengikuti sertifikasi.
$dsl$);

select private.formulir_daftarkan('ptk_pendidikan', 'ptk', 'Riwayat pendidikan formal', 'F-PTK', 'tabel', 'satuan_pendidikan', 20, $dsl$
jenjang|Jenjang pendidikan|pilihan!|DP1|SD;SMP;SMA/SMK;D1;D2;D3;D4;S1;S2;S3;Profesi|
gelar_akademik|Gelar akademik|teks|DP2||Diisi bila pendidikan telah selesai. Kosongkan bila belum selesai atau bukan perguruan tinggi.
satuan_pendidikan|Satuan pendidikan formal|teks!|DP3||Sesuai ijazah. Boleh disingkat, contoh IKIP-PGRI Pontianak.
fakultas|Fakultas|teks|DP4||Khusus perguruan tinggi. Boleh disingkat, contoh FKIP.
kependidikan|Kependidikan (LPTK)|pilihan|DP5|Ya;Tidak|Pilih Tidak bagi sekolah usia dini, dasar, dan menengah.
bidang_studi|Bidang studi|teks|DP6||Jurusan. Untuk pendidikan dasar dan menengah isi Umum.
tahun_masuk|Tahun masuk|bulat|DP7|1950..2100|
tahun_lulus|Tahun lulus|bulat|DP8|1950..2100|Kosongkan bila belum lulus.
nim|NIS / NISN / NIM|teks|DP9||
masih_studi|Masih studi / kuliah|pilihan|DP10|Ya;Tidak|
semester|Semester|bulat|DP11|0..30|Jumlah semester yang ditempuh. Sekolah 3 tahun diisi 9, kuliah 4 tahun diisi 8.
ipk|Rata-rata ujian akhir / IPK|angka|DP12|0..100|Nilai ujian akhir untuk dasar dan menengah, IPK atau GPA untuk pendidikan tinggi.
$dsl$);

select private.formulir_daftarkan('ptk_kompetensi', 'ptk', 'Kompetensi', 'F-PTK', 'tabel', 'bidang_studi', 30, $dsl$
bidang_studi|Bidang studi|teks!|DK1||Bidang studi yang diajarkan.
urutan_prioritas|Urutan|bulat|DK2|1..20|Isi 1 bila ini mata pelajaran utama yang diajarkan.
$dsl$);

select private.formulir_daftarkan('ptk_anak', 'ptk', 'Anak', 'F-PTK', 'tabel', 'nama', 40, $dsl$
nama|Nama anak|teks!|DA1||Sesuai dokumen resmi.
status_anak|Status|pilihan|DA2|Anak kandung;Anak tiri;Anak angkat|
jenjang|Jenjang pendidikan|pilihan|DA3|Belum sekolah;PAUD;SD;SMP;SMA/SMK;Perguruan tinggi|Jenjang pendidikan anak saat ini.
nisn|NISN|teks|DA4||Jika memiliki.
jenis_kelamin|Jenis kelamin|pilihan|DA5|L;P|
tempat_lahir|Tempat lahir|teks|DA6||
tanggal_lahir|Tanggal lahir|tanggal|DA7||
tahun_masuk|Tahun masuk|bulat|DA8|1990..2100|Tahun masuk sekolah pada jenjang saat ini.
$dsl$);

select private.formulir_daftarkan('ptk_beasiswa', 'ptk', 'Beasiswa', 'F-PTK', 'tabel', 'jenis_beasiswa', 50, $dsl$
jenis_beasiswa|Jenis beasiswa|teks!|DB1||Jenis beasiswa yang pernah diterima.
keterangan|Keterangan|teks|DB2||Biasanya nama program beasiswa.
tahun_mulai|Tahun mulai|bulat|DB3|1950..2100|
tahun_akhir|Tahun akhir|bulat|DB4|1950..2100|
masih_menerima|Masih menerima|pilihan|DB5|Ya;Tidak|
$dsl$);

select private.formulir_daftarkan('ptk_buku', 'ptk', 'Buku yang pernah ditulis', 'F-PTK', 'tabel', 'judul', 60, $dsl$
judul|Judul buku|teks!|DU1||
tahun|Tahun|bulat|DU2|1950..2100|
penerbit|Penerbit|teks|DU3||Isi Independen bila diterbitkan mandiri.
isbn|ISBN|teks|DU4||Jika ada.
$dsl$);

select private.formulir_daftarkan('ptk_diklat', 'ptk', 'Diklat', 'F-PTK', 'tabel', 'nama', 70, $dsl$
jenis_diklat|Jenis diklat|teks!|DD1||Jenis diklat yang pernah diikuti.
nama|Nama diklat|teks!|DD2||Nama acara diklat.
no_sertifikat|No. sertifikat diklat|teks|DD3||
penyelenggara|Penyelenggara|teks|DD4||
tahun|Tahun|bulat|DD5|1950..2100|
peran|Peran|pilihan|DD6|Peserta;Pemateri;Narasumber;Panitia;Lainnya|
tingkat|Tingkat|pilihan|DD7|Sekolah;Kecamatan;Kabupaten/Kota;Provinsi;Nasional;Internasional|
jam|Berapa jam|bulat|DD8|0..2000|Lama penyelenggaraan dalam jam, sesuai sertifikat.
$dsl$);

select private.formulir_daftarkan('ptk_karya_tulis', 'ptk', 'Karya tulis', 'F-PTK', 'tabel', 'judul', 80, $dsl$
judul|Judul|teks!|DT1||
tahun_pembuatan|Tahun pembuatan|bulat|DT2|1950..2100|
publikasi|Publikasi|teks|DT3||Tempat dipublikasikan. Skripsi dan tesis: nama universitas.
keterangan|Keterangan|teks|DT4||
url_publikasi|URL publikasi|teks|DT5||Tautan bila dipublikasikan daring.
$dsl$);

select private.formulir_daftarkan('ptk_kesejahteraan', 'ptk', 'Kesejahteraan', 'F-PTK', 'tabel', 'jenis_kesejahteraan', 90, $dsl$
jenis_kesejahteraan|Jenis kesejahteraan|teks!|DS1||Jenis kesejahteraan atau santunan.
nama|Nama|teks|DS2||Nama santunan.
penyelenggara|Penyelenggara|teks|DS3||
dari_tahun|Dari tahun|bulat|DS4|1950..2100|
sampai_tahun|Sampai tahun|bulat|DS5|1950..2100|
status|Status|pilihan|DS6|Masih menerima;Sudah selesai|
$dsl$);

select private.formulir_daftarkan('ptk_tunjangan', 'ptk', 'Tunjangan', 'F-PTK', 'tabel', 'nama_tunjangan', 100, $dsl$
jenis_tunjangan|Jenis tunjangan|teks!|DN1||
nama_tunjangan|Nama tunjangan|teks|DN2||
instansi|Instansi|teks|DN3||
sk_tunjangan|SK tunjangan|teks|DN4||
tanggal_sk|Tanggal SK|tanggal|DN5||
semester|Semester|teks|DN6||Contoh 2025/2026 Ganjil.
sumber_dana|Sumber dana|teks|DN7||
dari_tahun|Dari tahun|bulat|DN8|1950..2100|
sampai_tahun|Sampai tahun|bulat|DN9|1950..2100|
nominal|Nominal|angka|DN10|0..|Rupiah.
status|Status|pilihan|DN11|Masih menerima;Sudah selesai|
$dsl$);

select private.formulir_daftarkan('pd_prestasi', 'siswa', 'Prestasi', 'F-PD', 'tabel', 'nama_prestasi', 110, $dsl$
jenis|Jenis prestasi|pilihan!|PR1|Sains;Seni;Olahraga;Lain-lain|
tingkat|Tingkat prestasi|pilihan|PR2|Sekolah;Kecamatan;Kabupaten;Provinsi;Nasional;Internasional|
nama_prestasi|Nama prestasi|teks!|PR3||Nama kegiatan atau acara, sesuai piagam. Contoh: Lomba Cerdas Cermat Bahasa Indonesia Tingkat SMP.
tahun|Tahun prestasi|bulat|PR4|2000..2100|
penyelenggara|Penyelenggara|teks|PR5||Panitia kegiatan, sesuai piagam.
peringkat|Peringkat|bulat|PR6|0..1000|Angka peringkat.
$dsl$);

select private.formulir_daftarkan('pd_beasiswa', 'siswa', 'Beasiswa', 'F-PD', 'tabel', 'keterangan', 120, $dsl$
jenis|Jenis beasiswa|pilihan!|BS1|Anak berprestasi;Anak miskin;Pendidikan;Unggulan|
keterangan|Keterangan|teks|BS2||Nama beasiswa, contoh Beasiswa Murid Berprestasi Tahun 2025.
tahun_mulai|Tahun mulai|bulat|BS3|2000..2100|
tahun_selesai|Tahun selesai|bulat|BS4|2000..2100|Bila hanya diterima sekali, samakan dengan tahun mulai.
$dsl$);
