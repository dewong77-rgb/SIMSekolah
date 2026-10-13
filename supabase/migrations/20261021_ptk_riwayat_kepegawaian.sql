-- Delapan bagian riwayat F-PTK yang belum ada di katalog formulir rinci (sumber: lembar F-PTK resmi Dapodik):
-- tugas tambahan, penghargaan, nilai tes, riwayat gaji berkala, jabatan struktural, kepangkatan, jabatan fungsional, karir guru.
-- Memakai mesin yang sama dengan entitas lain (private.formulir_daftarkan): tampilan, hak akses, tagihan operator, dan cetak ikut otomatis.

select private.formulir_daftarkan('ptk_tugas_tambahan', 'ptk', 'Tugas tambahan', 'F-PTK', 'tabel', 'jabatan_ptk', 130, $dsl$
jabatan_ptk|Jabatan PTK|teks!|TT1||Contoh: Wakil Kepala Sekolah Kesiswaan, Guru wali, Pembina Ekstrakurikuler.
jam_per_minggu|Jam per minggu|angka|TT2|0..60|Jam tugas tambahan per minggu. Isi 0 bila tidak diperhitungkan jam.|jam
nomor_sk|Nomor SK|teks|TT3||Nomor surat keputusan penugasan.
tmt_tambahan|TMT tambahan|tanggal|TT4||Tanggal mulai tugas.
tst_tambahan|TST tambahan|tanggal|TT5||Tanggal selesai tugas. Kosongkan bila masih bertugas.
$dsl$);

select private.formulir_daftarkan('ptk_penghargaan', 'ptk', 'Penghargaan', 'F-PTK', 'tabel', 'nama', 140, $dsl$
tingkat|Tingkat penghargaan|pilihan|PH1|Sekolah;Kecamatan;Kabupaten/Kota;Provinsi;Nasional;Internasional|
jenis_penghargaan|Jenis penghargaan|teks!|PH2||Contoh: Guru berprestasi, Satyalancana Karya Satya.
nama|Nama penghargaan|teks!|PH3||
tahun|Tahun|bulat|PH4|1950..2100|
instansi|Instansi pemberi|teks|PH5||
$dsl$);

select private.formulir_daftarkan('ptk_nilai_tes', 'ptk', 'Nilai tes', 'F-PTK', 'tabel', 'nama', 150, $dsl$
jenis_tes|Jenis tes|teks!|NT1||Contoh: TOEFL, TPA, UKG, kompetensi teknis.
nama|Nama tes|teks!|NT2||
penyelenggara|Penyelenggara|teks|NT3||
tahun|Tahun|bulat|NT4|1950..2100|
skor|Skor|angka|NT5|0..|Nilai atau skor yang diperoleh.
$dsl$);

select private.formulir_daftarkan('ptk_gaji_berkala', 'ptk', 'Riwayat gaji berkala', 'F-PTK', 'tabel', 'no_sk', 160, $dsl$
pangkat_golongan|Pangkat / golongan|pilihan|GB1|I/a;I/b;I/c;I/d;II/a;II/b;II/c;II/d;III/a;III/b;III/c;III/d;IV/a;IV/b;IV/c;IV/d;IV/e|
no_sk|Nomor SK|teks!|GB2||Nomor SK kenaikan gaji berkala.
tanggal_sk|Tanggal SK|tanggal|GB3||
tmt_kgb|TMT KGB|tanggal|GB4||Terhitung mulai tanggal kenaikan gaji berkala.
masa_kerja_tahun|Masa kerja (tahun)|bulat|GB5|0..60|
masa_kerja_bulan|Masa kerja (bulan)|bulat|GB6|0..11|
gaji_pokok|Gaji pokok|angka|GB7|0..||Rp
$dsl$);

select private.formulir_daftarkan('ptk_jabatan_struktural', 'ptk', 'Riwayat jabatan struktural', 'F-PTK', 'tabel', 'jabatan_ptk', 170, $dsl$
jabatan_ptk|Jabatan PTK|teks!|JS1||Contoh: Kepala Sekolah, Kepala Tata Usaha.
sk_struktural|SK struktural|teks|JS2||Nomor SK pengangkatan dalam jabatan.
tmt_jabatan|TMT jabatan|tanggal|JS3||
$dsl$);

select private.formulir_daftarkan('ptk_kepangkatan', 'ptk', 'Riwayat kepangkatan', 'F-PTK', 'tabel', 'no_sk', 180, $dsl$
pangkat_golongan|Pangkat / golongan|pilihan!|KP1|I/a;I/b;I/c;I/d;II/a;II/b;II/c;II/d;III/a;III/b;III/c;III/d;IV/a;IV/b;IV/c;IV/d;IV/e|
no_sk|Nomor SK|teks!|KP2||
tanggal_sk|Tanggal SK|tanggal|KP3||
tmt_pangkat|TMT pangkat|tanggal|KP4||Terhitung mulai tanggal pangkat berlaku.
masa_kerja_tahun|Masa kerja (tahun)|bulat|KP5|0..60|
masa_kerja_bulan|Masa kerja (bulan)|bulat|KP6|0..11|
$dsl$);

select private.formulir_daftarkan('ptk_jabatan_fungsional', 'ptk', 'Riwayat jabatan fungsional', 'F-PTK', 'tabel', 'jabatan_fungsional', 190, $dsl$
jabatan_fungsional|Jabatan fungsional|teks!|JF1||Contoh: Guru Ahli Pertama, Guru Ahli Muda.
sk_jabatan_fungsional|SK jabatan fungsional|teks|JF2||
tmt_jabatan|TMT jabatan|tanggal|JF3||
$dsl$);

select private.formulir_daftarkan('ptk_karir', 'ptk', 'Riwayat karir guru', 'F-PTK', 'tabel', 'tempat_kerja', 200, $dsl$
jenjang|Jenjang|teks|KR1||Contoh: SMA / sederajat.
jenis_lembaga|Jenis lembaga|teks|KR2||Contoh: Sekolah.
status_kepegawaian|Status kepegawaian|teks|KR3||Contoh: Guru Honor Sekolah, PPPK.
jenis_ptk|Jenis PTK|teks|KR4||Contoh: Guru Mapel.
lembaga_pengangkat|Lembaga pengangkat|teks|KR5||
no_sk_kerja|No. SK kerja|teks|KR6||
tgl_sk_kerja|Tanggal SK kerja|tanggal|KR7||
tmt_kerja|TMT kerja|tanggal|KR8||Tanggal mulai bekerja.
tst_kerja|TST kerja|tanggal|KR9||Tanggal selesai bekerja. Kosongkan bila masih bekerja.
tempat_kerja|Tempat kerja|teks!|KR10||Nama satuan pendidikan atau instansi.
penandatangan_sk|Penandatangan SK|teks|KR11||Contoh: Kepala Sekolah.
mapel_diajarkan|Mapel diajarkan|teks|KR12||
$dsl$);
