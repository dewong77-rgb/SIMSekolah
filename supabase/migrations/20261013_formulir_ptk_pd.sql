-- Formulir resmi Dapodik F-PTK dan F-PD sebagai bentuk isian di SIMS (tahap 1).
--
-- Perubahan alur kerja, secara ringkas:
--  * Katalog kolom_ajuan kini mengikuti penomoran dan pengelompokan formulir (kolom butir dan bantuan).
--  * Tiap kolom punya jalur:
--      langsung : berlaku di SIMS saat disimpan, ajuan langsung masuk antrean operator Dapodik ("tagihan kerja").
--      tu       : butuh dokumen. TU bagian terkait memeriksa; saat disetujui nilainya berlaku di SIMS dan masuk antrean operator.
--      operator : kolom kunci identitas unggahan Dapodik (nama, tanggal lahir, NIK dan NUPTK guru, NISN).
--                 Tidak diubah di SIMS; nilainya masuk lewat unggahan Dapodik.
--  * Satu penyimpanan dipecah dua ajuan bila memuat jalur langsung dan jalur lain, supaya tiap ajuan seragam.
--  * Penutupan ajuan: operator mencentang selesai, atau unggahan Dapodik berikutnya membuktikan nilainya sudah ada
--    (hanya untuk kolom yang memang ikut terbaca dari berkas Dapodik: dari_dapodik).
--  * Kolom baru (niy_nigk, penugasan, waktu tempuh, registrasi, dan lainnya) belum dibaca oleh unggahan Dapodik,
--    jadi tidak tertimpa dan hanya bisa ditutup dengan centang operator.

-- ------------------------------------------------------------ kolom data baru
alter table public.ptk
  add column if not exists niy_nigk text,
  add column if not exists keahlian_laboratorium text,
  add column if not exists kebutuhan_khusus_ditangani text,
  add column if not exists nomor_surat_tugas text,
  add column if not exists tanggal_surat_tugas date,
  add column if not exists tmt_tugas date,
  add column if not exists sekolah_induk text;

alter table public.peserta_didik
  add column if not exists waktu_tempuh_menit integer check (waktu_tempuh_menit is null or waktu_tempuh_menit between 0 and 1440),
  add column if not exists tetap_menerima_kip text,
  add column if not exists alasan_menolak_pip text,
  add column if not exists kompetensi_keahlian text,
  add column if not exists jenis_pendaftaran text,
  add column if not exists tanggal_masuk_sekolah date;

-- ------------------------------------------------------------ katalog kolom
alter table public.kolom_ajuan
  add column if not exists butir text,
  add column if not exists bantuan text,
  add column if not exists jalur text not null default 'langsung' check (jalur in ('langsung', 'tu', 'operator')),
  add column if not exists dari_dapodik boolean not null default true,
  add column if not exists min_nilai numeric,
  add column if not exists maks_nilai numeric;

alter table public.ajuan_perubahan
  add column if not exists diterapkan_pada timestamptz;

insert into public.kolom_ajuan
  (jenis, kunci, tabel, kolom, hubungan, label, kelompok, tipe, tipe_sql, pilihan, pola, wajib, butuh_dokumen, urutan, butir, bantuan, jalur, dari_dapodik, min_nilai, maks_nilai)
values
-- ===== F-PTK: Identitas
('ptk','nama','ptk','nama',null,'Nama lengkap (tanpa gelar)','Identitas PTK','teks','text',null,null,true,true,101,'1','Sesuai dokumen resmi, tanpa gelar. Hanya bisa diubah melalui vervalptk.data.kemdikbud.go.id.','operator',true,null,null),
('ptk','nik','ptk_sensitif','nik',null,'NIK / KITAS','Identitas PTK','teks','text',null,'^[0-9]{16}$',false,true,102,'2','NIK sesuai Kartu Keluarga atau KTP (16 digit). WNA mengisi nomor paspor yang berlaku.','operator',true,null,null),
('ptk','jk','ptk','jk',null,'Jenis kelamin','Identitas PTK','pilihan','text','["L","P"]',null,true,true,103,'3',null,'tu',true,null,null),
('ptk','tempat_lahir','ptk','tempat_lahir',null,'Tempat lahir','Identitas PTK','teks','text',null,null,true,true,104,'4','Sesuai dokumen resmi yang berlaku.','tu',true,null,null),
('ptk','tanggal_lahir','ptk','tanggal_lahir',null,'Tanggal lahir','Identitas PTK','tanggal','date',null,null,true,true,105,'5','Sesuai dokumen resmi. Hanya bisa diubah melalui vervalptk.data.kemdikbud.go.id.','operator',true,null,null),
('ptk','nama_ibu_kandung','ptk_sensitif','nama_ibu_kandung',null,'Nama ibu kandung','Identitas PTK','teks','text',null,null,false,true,106,'6','Sesuai dokumen resmi. Hanya bisa diubah melalui vervalptk.data.kemdikbud.go.id.','tu',true,null,null),
-- ===== F-PTK: Data pribadi
('ptk','alamat_jalan','ptk','alamat_jalan',null,'Alamat jalan','Data pribadi','teks','text',null,null,false,false,111,'7','Jalan, gang, kompleks, blok, nomor rumah. Contoh: Jl. Kemanggisan, Komp. Griya Adam, No. 4-C.','langsung',true,null,null),
('ptk','rt','ptk','rt',null,'RT','Data pribadi','teks','text',null,'^[0-9]{1,3}$',false,false,112,'8','Angka saja. RT 005 diisi 5.','langsung',true,null,null),
('ptk','rw','ptk','rw',null,'RW','Data pribadi','teks','text',null,'^[0-9]{1,3}$',false,false,113,'9','Angka saja. RW 011 diisi 11.','langsung',true,null,null),
('ptk','dusun','ptk','dusun',null,'Nama dusun','Data pribadi','teks','text',null,null,false,false,114,'10',null,'langsung',true,null,null),
('ptk','kelurahan','ptk','kelurahan',null,'Desa / kelurahan','Data pribadi','teks','text',null,null,false,false,115,'11',null,'langsung',true,null,null),
('ptk','kecamatan','ptk','kecamatan',null,'Kecamatan','Data pribadi','teks','text',null,null,false,false,116,'12',null,'langsung',true,null,null),
('ptk','lintang','ptk','lintang',null,'Lintang','Data pribadi','angka','numeric',null,null,false,false,117,'13','Titik koordinat rumah. Wilayah selatan khatulistiwa bernilai negatif, contoh -6.3012.','langsung',true,-90,90),
('ptk','bujur','ptk','bujur',null,'Bujur','Data pribadi','angka','numeric',null,null,false,false,118,'14','Titik koordinat rumah, contoh 106.7012.','langsung',true,-180,180),
('ptk','no_kk','ptk_sensitif','no_kk',null,'No. Kartu Keluarga','Data pribadi','teks','text',null,'^[0-9]{16}$',false,true,119,'15','16 digit. Jangan tertukar dengan NIK.','tu',true,null,null),
('ptk','kode_pos','ptk','kode_pos',null,'Kode pos','Data pribadi','teks','text',null,'^[0-9]{5}$',false,false,120,'16',null,'langsung',true,null,null),
('ptk','agama','ptk','agama',null,'Agama dan kepercayaan','Data pribadi','pilihan','text','["Islam","Kristen","Katholik","Hindu","Budha","Khonghucu","Kepercayaan kepada Tuhan YME"]',null,false,false,121,'17',null,'langsung',true,null,null),
('ptk','npwp','ptk_sensitif','npwp',null,'NPWP','Data pribadi','teks','text',null,'^[0-9.\-]{15,20}$',false,false,122,'18','Jika memiliki.','langsung',true,null,null),
('ptk','nama_wajib_pajak','ptk_sensitif','nama_wajib_pajak',null,'Nama wajib pajak','Data pribadi','teks','text',null,null,false,false,123,'19','Sesuai yang tercantum pada kartu NPWP.','langsung',true,null,null),
('ptk','status_perkawinan','ptk_sensitif','status_perkawinan',null,'Status perkawinan','Data pribadi','pilihan','text','["Belum Kawin","Kawin","Janda/Duda"]',null,false,true,124,'21',null,'tu',true,null,null),
('ptk','nama_pasangan','ptk_sensitif','nama_pasangan',null,'Nama suami / istri','Data pribadi','teks','text',null,null,false,false,125,'22',null,'langsung',true,null,null),
('ptk','nip_pasangan','ptk_sensitif','nip_pasangan',null,'NIP suami / istri','Data pribadi','teks','text',null,'^[0-9]{18}$',false,false,126,'23','Jika pasangan berstatus PNS (18 digit).','langsung',true,null,null),
('ptk','pekerjaan_pasangan','ptk_sensitif','pekerjaan_pasangan',null,'Pekerjaan suami / istri','Data pribadi','pilihan','text','["Tidak bekerja","Nelayan","Petani","Peternak","PNS/TNI/Polri","GTT/PTT","Pedagang Kecil","Pedagang Besar","Karyawan Swasta","Wiraswasta","Wirausaha","Pensiunan","Buruh","Sudah Meninggal","TKI","Tidak dapat diterapkan","Lainnya"]',null,false,false,127,'24',null,'langsung',true,null,null),
-- ===== F-PTK: Kepegawaian
('ptk','status_kepegawaian','ptk','status_kepegawaian',null,'Status kepegawaian','Kepegawaian','pilihan','text','["PNS","PNS Diperbantukan","PNS Depag","GTY/PTY","GTT/PTT Propinsi","GTT/PTT Kab/Kota","Guru Bantu Pusat","Guru Honor Sekolah","Tenaga Honor Sekolah","CPNS","PPPK","PPPK Paruh Waktu","PPNPN","Kontrak Kerja WNA"]',null,false,true,131,'25','Status saat ini. Harus sama antara sekolah induk dan bukan induk.','tu',true,null,null),
('ptk','nip','ptk','nip',null,'NIP','Kepegawaian','teks','text',null,'^[0-9]{18}$',false,true,132,'26','NIP baru 18 digit dari BKN. Hanya untuk PNS.','tu',true,null,null),
('ptk','niy_nigk','ptk','niy_nigk',null,'NIY / NIGK','Kepegawaian','teks','text',null,null,false,true,133,'27','Untuk PTK sekolah swasta. Kosongkan untuk sekolah negeri.','tu',false,null,null),
('ptk','nuptk','ptk','nuptk',null,'NUPTK','Kepegawaian','teks','text',null,'^[0-9]{16}$',false,true,134,'28','Nomor Unik Pendidik dan Tenaga Kependidikan, jika memiliki.','operator',true,null,null),
('ptk','jenis_ptk','ptk','jenis_ptk',null,'Jenis PTK','Kepegawaian','pilihan','text','["Kepala Sekolah","Guru","Tenaga Kependidikan"]',null,false,true,135,'29','Sesuai tugas utama di sekolah.','tu',true,null,null),
('ptk','sk_pengangkatan','ptk','sk_pengangkatan',null,'SK pengangkatan','Kepegawaian','teks','text',null,null,false,true,136,'30','Nomor SK sesuai status kepegawaian yang dipilih.','tu',true,null,null),
('ptk','tmt_pengangkatan','ptk','tmt_pengangkatan',null,'TMT pengangkatan','Kepegawaian','tanggal','date',null,null,false,true,137,'31','Tanggal SK pengangkatan.','tu',true,null,null),
('ptk','lembaga_pengangkatan','ptk','lembaga_pengangkatan',null,'Lembaga pengangkat','Kepegawaian','pilihan','text','["Pemerintah Pusat","Pemerintah Propinsi","Pemerintah Kab/Kota","Ketua Yayasan","Kepala Sekolah","Komite Sekolah","Lainnya"]',null,false,true,138,'32',null,'tu',true,null,null),
('ptk','sk_cpns','ptk','sk_cpns',null,'SK CPNS','Kepegawaian','teks','text',null,null,false,true,139,'33','Hanya jika CPNS atau PNS.','tu',true,null,null),
('ptk','tanggal_cpns','ptk','tanggal_cpns',null,'TMT CPNS','Kepegawaian','tanggal','date',null,null,false,true,140,'34','Kosongkan bila bukan CPNS atau PNS.','tu',true,null,null),
('ptk','tmt_pns','ptk','tmt_pns',null,'TMT PNS','Kepegawaian','tanggal','date',null,null,false,true,141,'35','Tanggal mulai bertugas sebagai PNS. Kosongkan bila bukan PNS.','tu',true,null,null),
('ptk','pangkat_golongan','ptk','pangkat_golongan',null,'Pangkat / golongan','Kepegawaian','teks','text',null,null,false,true,142,'36','Pangkat dan golongan terbaru.','tu',true,null,null),
('ptk','sumber_gaji','ptk','sumber_gaji',null,'Sumber gaji','Kepegawaian','pilihan','text','["APBN","APBD Provinsi","APBD Kabupaten/Kota","Yayasan","Sekolah","Lembaga Donor","Lainnya"]',null,false,true,143,'37',null,'tu',true,null,null),
('ptk','karpeg','ptk_sensitif','karpeg',null,'Kartu pegawai (KARPEG)','Kepegawaian','teks','text',null,null,false,true,144,'38','Tanpa spasi. Untuk PNS.','tu',true,null,null),
('ptk','karis_karsu','ptk_sensitif','karis_karsu',null,'Kartu istri / suami (KARIS / KARSU)','Kepegawaian','teks','text',null,null,false,true,145,'39','PTK suami mengisi KARIS; PTK istri mengisi KARSU.','tu',true,null,null),
-- ===== F-PTK: Kompetensi khusus
('ptk','sudah_lisensi_kepsek','ptk','sudah_lisensi_kepsek',null,'Punya lisensi kepala sekolah','Kompetensi khusus','pilihan','text','["Ya","Tidak"]',null,false,true,151,'40','Dibuktikan sertifikat lulus diklat pelatihan kepala sekolah.','tu',true,null,null),
('ptk','nuks','ptk','nuks',null,'Nomor Unik Kepala Sekolah (NUKS)','Kompetensi khusus','teks','text',null,null,false,true,152,'41',null,'tu',true,null,null),
('ptk','keahlian_laboratorium','ptk','keahlian_laboratorium',null,'Keahlian laboratorium','Kompetensi khusus','teks','text',null,null,false,false,153,'42','Sesuaikan dengan referensi aplikasi Dapodikdasmen.','langsung',false,null,null),
('ptk','kebutuhan_khusus_ditangani','ptk','kebutuhan_khusus_ditangani',null,'Mampu menangani kebutuhan khusus','Kompetensi khusus','teks','text',null,null,false,false,154,'43','Boleh lebih dari satu. Tulis dipisah koma, contoh: Netra (A), Rungu (B). Isi "Tidak" bila tidak ada.','langsung',false,null,null),
('ptk','keahlian_braille','ptk','keahlian_braille',null,'Keahlian braille','Kompetensi khusus','pilihan','text','["Ya","Tidak"]',null,false,false,155,'44',null,'langsung',true,null,null),
('ptk','keahlian_bahasa_isyarat','ptk','keahlian_bahasa_isyarat',null,'Keahlian bahasa isyarat','Kompetensi khusus','pilihan','text','["Ya","Tidak"]',null,false,false,156,'45',null,'langsung',true,null,null),
-- ===== F-PTK: Kontak
('ptk','telepon','ptk','telepon',null,'Nomor telepon rumah','Kontak','teks','text',null,'^[0-9+ -]{6,16}$',false,false,161,'46','Format kode area-nomor, contoh 021-775577.','langsung',true,null,null),
('ptk','hp','ptk','hp',null,'Nomor HP','Kontak','teks','text',null,'^[0-9+ -]{8,16}$',false,false,162,'47','Nomor seluler yang aktif.','langsung',true,null,null),
('ptk','email','ptk','email',null,'Email','Kontak','teks','text',null,'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$',false,false,163,'48','Alamat surel yang aktif.','langsung',true,null,null),
-- ===== F-PTK: Penugasan
('ptk','nomor_surat_tugas','ptk','nomor_surat_tugas',null,'Nomor surat tugas','Penugasan','teks','text',null,null,false,true,171,'P1','SK penugasan pertama di sekolah ini. Sekolah bukan induk: SK pengangkatan atau pembagian tugas tahun berjalan.','tu',false,null,null),
('ptk','tanggal_surat_tugas','ptk','tanggal_surat_tugas',null,'Tanggal surat tugas','Penugasan','tanggal','date',null,null,false,true,172,'P2',null,'tu',false,null,null),
('ptk','tmt_tugas','ptk','tmt_tugas',null,'TMT tugas','Penugasan','tanggal','date',null,null,false,true,173,'P3','Tanggal mulai berlaku bertugas di sekolah ini sesuai surat penugasan.','tu',false,null,null),
('ptk','sekolah_induk','ptk','sekolah_induk',null,'Status sekolah induk','Penugasan','pilihan','text','["Ya","Tidak"]',null,false,false,174,'P4','Penugasan di sekolah ini sebagai induk atau bukan.','tu',false,null,null),
-- ===== F-PTK: Pendidikan (ringkas, dari data rinci)
('ptk','gelar_depan','ptk','gelar_depan',null,'Gelar depan','Pendidikan (data rinci)','teks','text',null,null,false,true,181,null,null,'tu',true,null,null),
('ptk','gelar_belakang','ptk','gelar_belakang',null,'Gelar belakang','Pendidikan (data rinci)','teks','text',null,null,false,true,182,null,null,'tu',true,null,null),
('ptk','jenjang_pendidikan','ptk','jenjang_pendidikan',null,'Jenjang pendidikan terakhir','Pendidikan (data rinci)','pilihan','text','["SMA / sederajat","D3","D4","S1","S2","S3"]',null,false,true,183,null,null,'tu',true,null,null),
('ptk','jurusan_prodi','ptk','jurusan_prodi',null,'Program studi','Pendidikan (data rinci)','teks','text',null,null,false,true,184,null,null,'tu',true,null,null),

-- ===== F-PD: Data pribadi
('siswa','nama','peserta_didik','nama',null,'Nama lengkap','Data pribadi','teks','text',null,null,true,true,101,'1','Sesuai akta atau ijazah sebelumnya. Hanya bisa diubah melalui vervalpd.data.kemdikbud.go.id.','operator',true,null,null),
('siswa','jk','peserta_didik','jk',null,'Jenis kelamin','Data pribadi','pilihan','text','["L","P"]',null,true,true,102,'2',null,'tu',true,null,null),
('siswa','nisn','peserta_didik','nisn',null,'NISN','Data pribadi','teks','text',null,'^[0-9]{10}$',false,true,103,'3','10 digit. Kosongkan bila belum memiliki. Cek di nisn.data.kemdikbud.go.id.','operator',true,null,null),
('siswa','nik','peserta_didik_sensitif','nik',null,'NIK / No. KITAS','Data pribadi','teks','text',null,'^[0-9]{16}$',false,true,104,'4','16 digit, sesuai KK, Kartu Identitas Anak, atau KTP. Jangan tertukar dengan No. KK.','tu',true,null,null),
('siswa','no_kk','peserta_didik_sensitif','no_kk',null,'No. Kartu Keluarga','Data pribadi','teks','text',null,'^[0-9]{16}$',false,true,105,'5',null,'tu',true,null,null),
('siswa','tempat_lahir','peserta_didik','tempat_lahir',null,'Tempat lahir','Data pribadi','teks','text',null,null,true,true,106,'6','Sesuai dokumen resmi.','tu',true,null,null),
('siswa','tanggal_lahir','peserta_didik','tanggal_lahir',null,'Tanggal lahir','Data pribadi','tanggal','date',null,null,true,true,107,'7','Hanya bisa diubah melalui vervalpd.data.kemdikbud.go.id.','operator',true,null,null),
('siswa','no_registrasi_akta_lahir','peserta_didik_sensitif','no_registrasi_akta_lahir',null,'No. registrasi akta lahir','Data pribadi','teks','text',null,null,false,true,108,'8','Tercantum di bagian tengah atas kutipan akta kelahiran.','tu',true,null,null),
('siswa','agama','peserta_didik','agama',null,'Agama dan kepercayaan','Data pribadi','pilihan','text','["Islam","Kristen","Katholik","Hindu","Budha","Khonghucu","Kepercayaan kepada Tuhan YME"]',null,false,false,109,'9',null,'langsung',true,null,null),
('siswa','kebutuhan_khusus','peserta_didik','kebutuhan_khusus',null,'Berkebutuhan khusus','Data pribadi','pilihan','text','["Tidak ada","A - Tuna Netra","B - Tuna Rungu","C - Tuna Grahita Ringan","C1 - Tuna Grahita Sedang","D - Tuna Daksa Ringan","D1 - Tuna Daksa Sedang","F - Tuna Wicara","G - Tuna Ganda","H - Hiper Aktif","I - Cerdas Istimewa","J - Bakat Istimewa","K - Kesulitan Belajar","N - Narkoba","O - Indigo","P - Down Sindrome","Q - Autis"]',null,false,true,110,'11','Pilih satu. Bila lebih dari satu, sampaikan ke TU kesiswaan.','tu',true,null,null),
-- ===== F-PD: Alamat dan tempat tinggal
('siswa','alamat','peserta_didik','alamat',null,'Alamat jalan','Alamat dan tempat tinggal','teks','text',null,null,false,false,121,'12','Jalan, gang, kompleks, blok, nomor rumah. Contoh: Jl. Kemanggisan, Komp. Griya Adam, No. 4-C.','langsung',true,null,null),
('siswa','rt','peserta_didik','rt',null,'RT','Alamat dan tempat tinggal','teks','text',null,'^[0-9]{1,3}$',false,false,122,'13','Angka saja. RT 005 diisi 5.','langsung',true,null,null),
('siswa','rw','peserta_didik','rw',null,'RW','Alamat dan tempat tinggal','teks','text',null,'^[0-9]{1,3}$',false,false,123,'14','Angka saja. RW 011 diisi 11.','langsung',true,null,null),
('siswa','dusun','peserta_didik','dusun',null,'Nama dusun','Alamat dan tempat tinggal','teks','text',null,null,false,false,124,'15',null,'langsung',true,null,null),
('siswa','kelurahan','peserta_didik','kelurahan',null,'Desa / kelurahan','Alamat dan tempat tinggal','teks','text',null,null,false,false,125,'16',null,'langsung',true,null,null),
('siswa','kecamatan','peserta_didik','kecamatan',null,'Kecamatan','Alamat dan tempat tinggal','teks','text',null,null,false,false,126,'17',null,'langsung',true,null,null),
('siswa','kode_pos','peserta_didik','kode_pos',null,'Kode pos','Alamat dan tempat tinggal','teks','text',null,'^[0-9]{5}$',false,false,127,'18',null,'langsung',true,null,null),
('siswa','lintang','peserta_didik','lintang',null,'Lintang','Alamat dan tempat tinggal','angka','numeric',null,null,false,false,128,'19','Titik koordinat tempat tinggal. Wilayah selatan khatulistiwa bernilai negatif, contoh -6.3012.','langsung',true,-90,90),
('siswa','bujur','peserta_didik','bujur',null,'Bujur','Alamat dan tempat tinggal','angka','numeric',null,null,false,false,129,'20','Contoh 106.7012.','langsung',true,-180,180),
('siswa','jenis_tinggal','peserta_didik','jenis_tinggal',null,'Tempat tinggal','Alamat dan tempat tinggal','pilihan','text','["Bersama orang tua","Wali","Kost","Asrama","Panti asuhan","Pesantren","Lainnya"]',null,false,false,130,'21',null,'langsung',true,null,null),
('siswa','alat_transportasi','peserta_didik','alat_transportasi',null,'Moda transportasi','Alamat dan tempat tinggal','pilihan','text','["Jalan kaki","Sepeda","Sepeda motor","Kendaraan pribadi","Mobil pribadi","Angkutan umum/bus/pete-pete","Mobil/bus antar jemput","Ojek","Kereta api","Perahu penyeberangan/rakit/getek","Lainnya"]',null,false,false,131,'22','Moda yang paling sering dipakai berangkat ke sekolah.','langsung',true,null,null),
('siswa','anak_ke','peserta_didik','anak_ke',null,'Anak keberapa','Alamat dan tempat tinggal','angka','integer',null,null,false,false,132,'23','Sesuai urutan pada Kartu Keluarga.','langsung',true,null,null),
-- ===== F-PD: Kesejahteraan
('siswa','penerima_kip','peserta_didik_sensitif','penerima_kip',null,'Punya KIP','Kesejahteraan','pilihan','text','["Ya","Tidak"]',null,false,false,141,'25','Kartu Indonesia Pintar.','tu',true,null,null),
('siswa','nomor_kip','peserta_didik_sensitif','nomor_kip',null,'No. KIP','Kesejahteraan','teks','text',null,null,false,false,142,'K9','Nomor kartu.','tu',true,null,null),
('siswa','nama_di_kip','peserta_didik_sensitif','nama_di_kip',null,'Nama di KIP','Kesejahteraan','teks','text',null,null,false,false,143,'K10','Nama yang tertera pada kartu.','tu',true,null,null),
('siswa','tetap_menerima_kip','peserta_didik','tetap_menerima_kip',null,'Tetap menerima KIP','Kesejahteraan','pilihan','text','["Ya","Tidak"]',null,false,false,144,'26','Sudah atau belum menerima kartu secara fisik.','tu',false,null,null),
('siswa','alasan_menolak_pip','peserta_didik','alasan_menolak_pip',null,'Alasan menolak PIP','Kesejahteraan','pilihan','text','["Dilarang pemda karena menerima bantuan serupa","Menolak","Sudah mampu"]',null,false,false,145,'27','Diisi bila layak PIP tetapi menolak.','tu',false,null,null),
-- ===== F-PD: Kontak
('siswa','telepon','peserta_didik','telepon',null,'Nomor telepon rumah','Kontak','teks','text',null,'^[0-9]{6,16}$',false,false,271,'48','Tanpa tanda baca.','langsung',true,null,null),
('siswa','hp','peserta_didik','hp',null,'Nomor HP','Kontak','teks','text',null,'^[0-9]{8,16}$',false,false,272,'49','Milik pribadi, orang tua, atau wali. Tanpa tanda baca.','langsung',true,null,null),
('siswa','email','peserta_didik','email',null,'Email','Kontak','teks','text',null,'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$',false,false,273,'50','Milik pribadi, orang tua, atau wali.','langsung',true,null,null),
-- ===== F-PD: Data periodik
('siswa','tinggi_badan','peserta_didik','tinggi_badan',null,'Tinggi badan (cm)','Data periodik','angka','numeric',null,null,false,false,301,'P1',null,'langsung',true,30,250),
('siswa','berat_badan','peserta_didik','berat_badan',null,'Berat badan (kg)','Data periodik','angka','numeric',null,null,false,false,302,'P2',null,'langsung',true,10,300),
('siswa','lingkar_kepala','peserta_didik','lingkar_kepala',null,'Lingkar kepala (cm)','Data periodik','angka','numeric',null,null,false,false,303,'P3',null,'langsung',true,20,100),
('siswa','jarak_rumah_km','peserta_didik','jarak_rumah_km',null,'Jarak rumah ke sekolah (km)','Data periodik','angka','numeric',null,null,false,false,304,'P4-5','Isi 0 bila kurang dari 1 km. Bila lebih, isi jarak sebenarnya dalam kilometer.','langsung',true,0,500),
('siswa','waktu_tempuh_menit','peserta_didik','waktu_tempuh_menit',null,'Waktu tempuh ke sekolah (menit)','Data periodik','angka','integer',null,null,false,false,305,'P6','Dalam menit. 1 jam 15 menit diisi 75.','langsung',false,0,1440),
('siswa','jml_saudara_kandung','peserta_didik','jml_saudara_kandung',null,'Jumlah saudara kandung','Data periodik','angka','integer',null,null,false,false,306,'P7','Tanpa menghitung peserta didik. Isi 0 bila anak tunggal.','langsung',true,0,30),
-- ===== F-PD: Registrasi
('siswa','kompetensi_keahlian','peserta_didik','kompetensi_keahlian',null,'Kompetensi keahlian','Registrasi peserta didik','teks','text',null,null,false,true,311,'R1','Kompetensi keahlian yang dipilih saat diterima di sekolah ini (SMK).','tu',false,null,null),
('siswa','jenis_pendaftaran','peserta_didik','jenis_pendaftaran',null,'Jenis pendaftaran','Registrasi peserta didik','pilihan','text','["Siswa baru","Pindahan","Kembali bersekolah"]',null,false,true,312,'R2','Status saat pertama kali diterima di sekolah ini.','tu',false,null,null),
('siswa','nipd','peserta_didik','nipd',null,'NIS / Nomor induk peserta didik','Registrasi peserta didik','teks','text',null,null,false,true,313,'R3','Sesuai buku induk.','tu',true,null,null),
('siswa','tanggal_masuk_sekolah','peserta_didik','tanggal_masuk_sekolah',null,'Tanggal masuk sekolah','Registrasi peserta didik','tanggal','date',null,null,false,true,314,'R4','Siswa baru: tanggal awal tahun pelajaran. Pindahan: tanggal diterima atau tanggal pada lembar mutasi masuk.','tu',false,null,null),
('siswa','sekolah_asal','peserta_didik','sekolah_asal',null,'Sekolah asal','Registrasi peserta didik','teks','text',null,null,false,true,315,'R5','Siswa baru: sekolah jenjang sebelumnya. Pindahan: sekolah sebelum pindah.','tu',true,null,null),
('siswa','no_peserta_ujian_nasional','peserta_didik_sensitif','no_peserta_ujian_nasional',null,'Nomor peserta ujian jenjang sebelumnya','Registrasi peserta didik','teks','text',null,null,false,true,316,'R6','20 digit sesuai SKHU. Peserta didik WNA: Luar Negeri.','tu',true,null,null),
('siswa','no_seri_ijazah','peserta_didik_sensitif','no_seri_ijazah',null,'No. seri ijazah jenjang sebelumnya','Registrasi peserta didik','teks','text',null,null,false,true,317,'R7',null,'tu',true,null,null),
('siswa','skhun','peserta_didik','skhun',null,'No. SKHUN jenjang sebelumnya','Registrasi peserta didik','teks','text',null,null,false,true,318,'R8','Jika memiliki.','tu',true,null,null)
on conflict (jenis, kunci) do update set
  tabel = excluded.tabel, kolom = excluded.kolom, hubungan = excluded.hubungan, label = excluded.label,
  kelompok = excluded.kelompok, tipe = excluded.tipe, tipe_sql = excluded.tipe_sql, pilihan = excluded.pilihan,
  pola = excluded.pola, wajib = excluded.wajib, butuh_dokumen = excluded.butuh_dokumen, urutan = excluded.urutan,
  butir = excluded.butir, bantuan = excluded.bantuan, jalur = excluded.jalur, dari_dapodik = excluded.dari_dapodik,
  min_nilai = excluded.min_nilai, maks_nilai = excluded.maks_nilai;

-- Data ayah, ibu, wali: penomoran formulir (28-32, 35-39, 42-46). NIK orang tua (butir 29, 36, 43) dan penghasilan (33, 40, 47) belum masuk:
-- NIK sengaja tidak ditampilkan oleh profil_dapodik, dan skala penghasilan di data (dua versi Dapodik) belum seragam dengan formulir.
insert into public.kolom_ajuan
  (jenis, kunci, tabel, kolom, hubungan, label, kelompok, tipe, tipe_sql, pilihan, pola, wajib, butuh_dokumen, urutan, butir, bantuan, jalur, dari_dapodik)
select 'siswa', h.hub || '.' || f.kolom, 'orang_tua_wali', f.kolom, h.hub, f.label, h.judul, f.tipe, f.tipe_sql, f.pilihan::jsonb, f.pola,
       false, false, h.urut + f.urut, (h.awal + f.urut - 1)::text, f.bantuan, 'langsung', true
from (values ('ayah','Data ayah kandung',200,28), ('ibu','Data ibu kandung',220,35), ('wali','Data wali',240,42)) as h(hub, judul, urut, awal)
cross join (values
  ('nama','Nama','teks','text',null,null,1,'Sesuai dokumen resmi, tanpa gelar. Isi nama ayah/ibu/wali dengan huruf apa adanya.'),
  ('tahun_lahir','Tahun lahir','angka','integer',null,'^(19|20)[0-9]{2}$',3,null),
  ('jenjang_pendidikan','Pendidikan','pilihan','text','["Tidak sekolah","Putus SD","SD / sederajat","SMP / sederajat","SMA / sederajat","D1","D2","D3","D4","S1","S2","S3"]',null,4,'Pendidikan terakhir.'),
  ('pekerjaan','Pekerjaan','pilihan','text','["Tidak bekerja","Nelayan","Petani","Peternak","PNS/TNI/Polri","Karyawan Swasta","Pedagang Kecil","Pedagang Besar","Wiraswasta","Wirausaha","Buruh","Pensiunan","Sudah Meninggal","Tenaga Kerja Indonesia","Tidak dapat diterapkan","Lainnya"]',null,5,'Pilih "Sudah Meninggal" bila telah wafat.')
) as f(kolom, label, tipe, tipe_sql, pilihan, pola, urut, bantuan)
on conflict (jenis, kunci) do update set
  label = excluded.label, kelompok = excluded.kelompok, tipe = excluded.tipe, tipe_sql = excluded.tipe_sql,
  pilihan = excluded.pilihan, pola = excluded.pola, urutan = excluded.urutan, butir = excluded.butir,
  bantuan = excluded.bantuan, jalur = excluded.jalur, dari_dapodik = excluded.dari_dapodik;

-- Kolom lama di luar formulir kepegawaian/identitas yang masih ada di katalog tetap berlaku (tidak ada yang dihapus).
update public.kolom_ajuan set terapkan = (jalur <> 'operator');

-- ------------------------------------------------------------ menerapkan satu butir ke tabel data
create or replace function private.terapkan_butir(p_jenis text, p_kunci text, p_subjek uuid, p_npsn text, p_baru text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare k public.kolom_ajuan; n integer;
begin
  select * into k from public.kolom_ajuan where jenis = p_jenis and kunci = p_kunci;
  if not found then raise exception 'Kolom "%" tidak dikenal.', p_kunci; end if;
  if k.jalur = 'operator' then raise exception 'Kolom "%" hanya berubah lewat unggahan Dapodik.', k.label; end if;

  if k.tabel = 'ptk' then
    execute format('update public.ptk set %I = $1::%s where id = $2 and npsn = $3', k.kolom, k.tipe_sql) using p_baru, p_subjek, p_npsn;
    get diagnostics n = row_count;
  elsif k.tabel = 'peserta_didik' then
    execute format('update public.peserta_didik set %I = $1::%s where id = $2 and npsn = $3', k.kolom, k.tipe_sql) using p_baru, p_subjek, p_npsn;
    get diagnostics n = row_count;
  elsif k.tabel = 'ptk_sensitif' then
    execute format('update public.ptk_sensitif set %I = $1::%s where ptk_id = $2', k.kolom, k.tipe_sql) using p_baru, p_subjek;
    get diagnostics n = row_count;
    if n = 0 then
      execute format('insert into public.ptk_sensitif (ptk_id, %I) values ($1, $2::%s)', k.kolom, k.tipe_sql) using p_subjek, p_baru;
      n := 1;
    end if;
  elsif k.tabel = 'peserta_didik_sensitif' then
    execute format('update public.peserta_didik_sensitif set %I = $1::%s where peserta_didik_id = $2', k.kolom, k.tipe_sql) using p_baru, p_subjek;
    get diagnostics n = row_count;
    if n = 0 then
      execute format('insert into public.peserta_didik_sensitif (peserta_didik_id, %I) values ($1, $2::%s)', k.kolom, k.tipe_sql) using p_subjek, p_baru;
      n := 1;
    end if;
  else
    execute format('update public.orang_tua_wali set %I = $1::%s where peserta_didik_id = $2 and hubungan = $3', k.kolom, k.tipe_sql) using p_baru, p_subjek, k.hubungan;
    get diagnostics n = row_count;
    if n = 0 then
      execute format('insert into public.orang_tua_wali (peserta_didik_id, hubungan, %I) values ($1, $2, $3::%s)', k.kolom, k.tipe_sql) using p_subjek, k.hubungan, p_baru;
      n := 1;
    end if;
  end if;
  if n = 0 then raise exception 'Baris data "%" tidak ditemukan, perubahan dibatalkan.', k.label; end if;
end $$;
revoke execute on function private.terapkan_butir(text, text, uuid, text, text) from public, anon, authenticated;

-- ------------------------------------------------------------ pengajuan: langsung berlaku bila jalurnya langsung
create or replace function public.ajukan_perubahan(p_jenis text, p_subjek uuid, p_perubahan jsonb, p_alasan text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_peran text := private.peran_saya();
  v_npsn text := private.npsn_saya();
  v_nama text;
  v_alasan text := btrim(coalesce(p_alasan, ''));
  v_item jsonb; k public.kolom_ajuan; v_baru text; v_lama text;
  v_langsung jsonb := '[]'::jsonb; v_tinjau jsonb := '[]'::jsonb; v_butir jsonb;
  v_dok boolean := false; v_id uuid; v_id2 uuid;
begin
  if v_peran is null then raise exception 'Anda belum masuk.'; end if;

  if p_jenis = 'ptk' and v_peran in ('guru', 'staf') and p_subjek = private.ptk_id_saya() then
    select nama into v_nama from public.ptk where id = p_subjek and npsn = v_npsn;
  elsif p_jenis = 'siswa' and (
          (v_peran = 'siswa' and p_subjek = private.pd_id_saya())
          or (v_peran = 'orang_tua' and p_subjek in (select private.anak_saya()))) then
    select nama into v_nama from public.peserta_didik where id = p_subjek and npsn = v_npsn;
  end if;
  if v_nama is null then raise exception 'Anda tidak berhak mengajukan perubahan untuk data ini.'; end if;

  if length(v_alasan) > 500 then raise exception 'Alasan terlalu panjang (maksimal 500 karakter).'; end if;
  if jsonb_typeof(p_perubahan) <> 'array' or jsonb_array_length(p_perubahan) = 0 then raise exception 'Tidak ada perubahan yang diajukan.'; end if;
  if jsonb_array_length(p_perubahan) > 60 then raise exception 'Terlalu banyak kolom dalam satu pengiriman.'; end if;
  if (select count(*) from public.ajuan_perubahan where pengaju_user_id = (select auth.uid()) and status = 'menunggu') >= 5 then
    raise exception 'Masih ada 5 ajuan yang menunggu keputusan. Tunggu atau batalkan salah satunya.';
  end if;

  for v_item in select * from jsonb_array_elements(p_perubahan) loop
    select * into k from public.kolom_ajuan where jenis = p_jenis and kunci = v_item->>'kunci';
    if not found then raise exception 'Kolom "%" tidak dapat diubah.', coalesce(v_item->>'kunci', '?'); end if;
    if exists (select 1 from jsonb_array_elements(v_langsung || v_tinjau) e where e->>'kunci' = k.kunci) then
      raise exception 'Kolom "%" muncul dua kali.', k.label;
    end if;
    v_baru := nullif(btrim(coalesce(v_item->>'baru', '')), '');
    if v_baru is not null and length(v_baru) > 200 then raise exception '"%" terlalu panjang.', k.label; end if;
    if v_baru is null and k.wajib then raise exception '"%" tidak boleh dikosongkan.', k.label; end if;
    if v_baru is not null then
      if k.tipe = 'pilihan' and not (k.pilihan ? v_baru) then
        -- nilai lama yang sudah ada di data (hasil Dapodik) tetap boleh dikirim ulang
        if v_baru is distinct from nullif(btrim(coalesce(private.nilai_sekarang(p_jenis, k.kunci, p_subjek), '')), '') then
          raise exception 'Pilihan "%" tidak valid untuk %.', v_baru, k.label;
        end if;
      end if;
      if k.pola is not null and v_baru !~ k.pola then raise exception 'Format "%" tidak sesuai.', k.label; end if;
      begin
        if k.tipe = 'tanggal' then
          if v_baru::date < date '1940-01-01' or v_baru::date > current_date then raise exception 'x'; end if;
        elsif k.tipe = 'angka' then
          if v_baru::numeric < coalesce(k.min_nilai, 0) or v_baru::numeric > coalesce(k.maks_nilai, 100000) then raise exception 'x'; end if;
          if k.tipe_sql = 'integer' and v_baru::numeric <> trunc(v_baru::numeric) then raise exception 'x'; end if;
        end if;
      exception when others then
        raise exception 'Nilai "%" tidak valid untuk %.', v_baru, k.label;
      end;
    end if;
    v_lama := private.nilai_sekarang(p_jenis, k.kunci, p_subjek);
    if v_baru is not distinct from nullif(btrim(coalesce(v_lama, '')), '') then continue; end if;
    v_butir := jsonb_build_object(
      'kunci', k.kunci, 'label', k.label, 'kelompok', k.kelompok, 'butir', k.butir, 'lama', v_lama, 'baru', v_baru,
      'butuh_dokumen', k.butuh_dokumen, 'terapkan', k.jalur <> 'operator', 'jalur', k.jalur,
      'diterapkan', k.jalur = 'langsung');
    if k.jalur = 'langsung' then
      v_langsung := v_langsung || jsonb_build_array(v_butir);
    else
      v_tinjau := v_tinjau || jsonb_build_array(v_butir);
      v_dok := v_dok or k.butuh_dokumen;
    end if;
  end loop;

  if jsonb_array_length(v_langsung) + jsonb_array_length(v_tinjau) = 0 then raise exception 'Tidak ada yang berbeda dari data saat ini.'; end if;
  if jsonb_array_length(v_tinjau) > 0 and length(v_alasan) < 5 then raise exception 'Tulis alasan perubahan, minimal 5 karakter.'; end if;
  if v_alasan = '' then v_alasan := 'Pengisian formulir'; end if;

  if jsonb_array_length(v_langsung) > 0 then
    for v_item in select * from jsonb_array_elements(v_langsung) loop
      perform private.terapkan_butir(p_jenis, v_item->>'kunci', p_subjek, v_npsn, nullif(v_item->>'baru', ''));
    end loop;
    insert into public.ajuan_perubahan
      (npsn, jenis, subjek_id, subjek_nama, pengaju_user_id, pengaju_peran, perubahan, alasan, butuh_dokumen,
       status, catatan_admin, diputuskan_pada, diteruskan_pada, diterapkan_pada)
    values (v_npsn, p_jenis, p_subjek, v_nama, (select auth.uid()), v_peran, v_langsung, v_alasan, false,
            'diteruskan', 'Diisi langsung oleh pengaju. Sudah berlaku di SIMS.', now(), now(), now())
    returning id into v_id;
    insert into public.audit_log (user_id, tabel, aksi, ringkasan)
    values ((select auth.uid()), 'ajuan_perubahan', 'ISI_LANGSUNG', jsonb_build_object('ajuan', v_id, 'jenis', p_jenis, 'jumlah_kolom', jsonb_array_length(v_langsung)));
  end if;

  if jsonb_array_length(v_tinjau) > 0 then
    insert into public.ajuan_perubahan (npsn, jenis, subjek_id, subjek_nama, pengaju_user_id, pengaju_peran, perubahan, alasan, butuh_dokumen)
    values (v_npsn, p_jenis, p_subjek, v_nama, (select auth.uid()), v_peran, v_tinjau, v_alasan, v_dok)
    returning id into v_id2;
    insert into public.audit_log (user_id, tabel, aksi, ringkasan)
    values ((select auth.uid()), 'ajuan_perubahan', 'AJUKAN', jsonb_build_object('ajuan', v_id2, 'jenis', p_jenis, 'jumlah_kolom', jsonb_array_length(v_tinjau)));
  end if;
  return coalesce(v_id2, v_id);
end $$;

-- ------------------------------------------------------------ keputusan TU: butir jalur "tu" berlaku di SIMS saat disetujui
create or replace function public.putuskan_ajuan(p_id uuid, p_setuju boolean, p_catatan text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a public.ajuan_perubahan;
  v_catatan text := nullif(btrim(coalesce(p_catatan, '')), '');
  it jsonb; v_baru jsonb; v_terap integer := 0;
begin
  select * into a from public.ajuan_perubahan where id = p_id and npsn = private.npsn_saya() for update;
  if not found then raise exception 'Ajuan tidak ditemukan.'; end if;
  if not private.boleh_putuskan(a.jenis) then raise exception 'Anda tidak berwenang memutuskan ajuan ini (bagian %).', a.bagian; end if;
  if a.status <> 'menunggu' then raise exception 'Ajuan ini sudah diputuskan.'; end if;

  if not p_setuju then
    if v_catatan is null then raise exception 'Tulis alasan penolakan agar pengaju tahu apa yang perlu dilengkapi.'; end if;
    update public.ajuan_perubahan set status = 'ditolak', catatan_admin = v_catatan, diputuskan_oleh = (select auth.uid()), diputuskan_pada = now() where id = p_id;
    insert into public.audit_log (user_id, tabel, aksi, ringkasan) values ((select auth.uid()), 'ajuan_perubahan', 'TOLAK', jsonb_build_object('ajuan', p_id));
    return jsonb_build_object('status', 'ditolak');
  end if;

  for it in select * from jsonb_array_elements(a.perubahan) loop
    if it->>'jalur' = 'tu' and coalesce(it->>'diterapkan', 'false') <> 'true' then
      perform private.terapkan_butir(a.jenis, it->>'kunci', a.subjek_id, a.npsn, nullif(it->>'baru', ''));
      v_terap := v_terap + 1;
    end if;
  end loop;
  select coalesce(jsonb_agg(case when e->>'jalur' = 'tu' then e || '{"diterapkan": true}'::jsonb else e end order by n), '[]'::jsonb)
    into v_baru from jsonb_array_elements(a.perubahan) with ordinality as t(e, n);

  update public.ajuan_perubahan
     set status = 'diteruskan', perubahan = v_baru, catatan_admin = v_catatan, diputuskan_oleh = (select auth.uid()),
         diputuskan_pada = now(), diteruskan_pada = now(),
         diterapkan_pada = case when v_terap > 0 then now() else diterapkan_pada end
   where id = p_id;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan)
  values ((select auth.uid()), 'ajuan_perubahan', 'TERUSKAN', jsonb_build_object('ajuan', p_id, 'bagian', a.bagian, 'diterapkan', v_terap));
  return jsonb_build_object('status', 'diteruskan', 'diterapkan', v_terap);
end $$;

-- ------------------------------------------------------------ operator: mulai, kembalikan, atau centang selesai
create or replace function public.kerjakan_ajuan(p_id uuid, p_aksi text, p_catatan text default null) returns void
language plpgsql security definer set search_path = ''
as $$
declare a public.ajuan_perubahan; v_catatan text := nullif(btrim(coalesce(p_catatan, '')), '');
begin
  if not private.boleh_kerjakan() then raise exception 'Hanya operator Dapodik yang dapat mengerjakan antrean ini.'; end if;
  select * into a from public.ajuan_perubahan where id = p_id and npsn = private.npsn_saya() for update;
  if not found then raise exception 'Ajuan tidak ditemukan.'; end if;
  if p_aksi = 'mulai' then
    if a.status <> 'diteruskan' then raise exception 'Ajuan ini tidak berada di antrean operator.'; end if;
    update public.ajuan_perubahan set status = 'dikerjakan', operator_id = (select auth.uid()), dikerjakan_pada = now(), catatan_operator = v_catatan where id = p_id;
  elsif p_aksi = 'selesai' then
    if a.status not in ('diteruskan', 'dikerjakan') then raise exception 'Ajuan ini tidak berada di antrean operator.'; end if;
    update public.ajuan_perubahan
       set status = 'selesai', operator_id = (select auth.uid()), selesai_pada = now(), belum_terbukti = false,
           dikerjakan_pada = coalesce(dikerjakan_pada, now()), catatan_operator = coalesce(v_catatan, catatan_operator)
     where id = p_id;
  elsif p_aksi = 'kembalikan' then
    if a.status not in ('diteruskan', 'dikerjakan') then raise exception 'Ajuan ini tidak berada di antrean operator.'; end if;
    if v_catatan is null then raise exception 'Tulis alasan pengembalian.'; end if;
    update public.ajuan_perubahan set status = 'ditolak', operator_id = (select auth.uid()), catatan_operator = v_catatan, selesai_pada = now() where id = p_id;
  else
    raise exception 'Aksi tidak dikenal.';
  end if;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan) values ((select auth.uid()), 'ajuan_perubahan', upper(p_aksi), jsonb_build_object('ajuan', p_id));
end $$;

-- ------------------------------------------------------------ pencocokan setelah unggahan Dapodik
-- Ajuan berpenerapan (diterapkan_pada terisi): nilai SIMS sudah sama dengan usulan sejak awal, jadi kecocokan baru
-- berarti bila ada unggahan sesudahnya (diperbarui_pada subjek lebih baru) dan semua butirnya memang terbaca dari berkas Dapodik.
-- Selain itu hanya bisa ditutup operator dengan centang selesai.
create or replace function public.cocokkan_ajuan() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare a public.ajuan_perubahan; it jsonb; ok boolean; v_upd timestamptz; v_semua boolean; n_ok int := 0; n_bt int := 0;
begin
  if not private.boleh_kerjakan() then raise exception 'Tidak berwenang.'; end if;
  for a in select * from public.ajuan_perubahan where npsn = private.npsn_saya() and status in ('diteruskan', 'dikerjakan') loop
    if a.diterapkan_pada is not null then
      select coalesce(bool_and(k.dari_dapodik), false) into v_semua
        from jsonb_array_elements(a.perubahan) e
        join public.kolom_ajuan k on k.jenis = a.jenis and k.kunci = e->>'kunci';
      if not v_semua then continue; end if;
      if a.jenis = 'ptk' then select diperbarui_pada into v_upd from public.ptk where id = a.subjek_id;
      else select diperbarui_pada into v_upd from public.peserta_didik where id = a.subjek_id; end if;
      if v_upd is null or v_upd <= a.diterapkan_pada then continue; end if;
    end if;
    ok := true;
    for it in select * from jsonb_array_elements(a.perubahan) loop
      if nullif(btrim(coalesce(private.nilai_sekarang(a.jenis, it->>'kunci', a.subjek_id), '')), '')
         is distinct from nullif(btrim(coalesce(it->>'baru', '')), '') then ok := false; exit; end if;
    end loop;
    if ok then
      update public.ajuan_perubahan set status = 'selesai', selesai_pada = now(), belum_terbukti = false where id = a.id;
      n_ok := n_ok + 1;
    elsif a.status = 'dikerjakan' and not a.belum_terbukti then
      update public.ajuan_perubahan set belum_terbukti = true where id = a.id;
      n_bt := n_bt + 1;
    end if;
  end loop;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan) values ((select auth.uid()), 'ajuan_perubahan', 'COCOKKAN', jsonb_build_object('selesai', n_ok, 'belum_terbukti', n_bt));
  return jsonb_build_object('selesai', n_ok, 'belum_terbukti', n_bt);
end $$;

do $do$
declare f text;
begin
  foreach f in array array[
    'public.ajukan_perubahan(text,uuid,jsonb,text)', 'public.putuskan_ajuan(uuid,boolean,text)',
    'public.kerjakan_ajuan(uuid,text,text)', 'public.cocokkan_ajuan()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $do$;
