-- A. mapel (nama disesuaikan dengan SK)
update public.kur_mapel set nama='Pendidikan Agama Islam dan Budi Pekerti' where nama='Pendidikan Agama dan Budi Pekerti';
update public.kur_mapel set nama='Kreativitas, Inovasi, dan Kewirausahaan' where nama='Projek Kreatif dan Kewirausahaan';
update public.kur_mapel set nama='Seni Budaya' where nama='Seni dan Budaya';
update public.kur_mapel set aktif=false where nama in ('Muatan Lokal','Konsentrasi Keahlian','Dasar-dasar Program Keahlian','Praktik Kerja Lapangan');
insert into public.kur_mapel (nama,kelompok,bidang_linier,urutan)
select v.* from (values
('Dasar-Dasar Teknik Elektronika','kejuruan',array['elektronika','elektro','listrik']::text[],110),
('Teknik Elektronika','kejuruan',array['elektronika','elektro','listrik']::text[],120),
('Kreativitas, Inovasi, dan Kewirausahaan','projek',array['kewirausahaan','kreativitas','inovasi','ekonomi']::text[],130),
('Mata Pelajaran Pilihan','kejuruan',array[]::text[],140),
('Dasar-Dasar Teknik Mesin','kejuruan',array['mesin','pemesinan']::text[],150),
('Teknik Pemesinan','kejuruan',array['mesin','pemesinan']::text[],160),
('Teknik Komputer dan Jaringan','kejuruan',array['komputer','jaringan','informatika','telekomunikasi','sistem informasi']::text[],170),
('Bahasa Sunda','muatan_lokal',array['sunda','bahasa daerah']::text[],180),
('Dasar-Dasar Broadcasting dan Perfilman','kejuruan',array['film','broadcasting','perfilman','multimedia','televisi','animasi']::text[],190),
('Teknik Kendaraan Ringan','kejuruan',array['otomotif','kendaraan']::text[],200),
('Dasar-Dasar Teknik Jaringan Komputer dan Telekomunikasi','kejuruan',array['komputer','jaringan','informatika','telekomunikasi','sistem informasi']::text[],210),
('Produksi Film','kejuruan',array['film','broadcasting','perfilman','multimedia','televisi','animasi']::text[],220),
('Dasar-Dasar Teknik Otomotif','kejuruan',array['otomotif','kendaraan']::text[],230),
('Seni Musik Karawitan Sunda','umum',array['seni','musik','karawitan']::text[],240)
) v(nama,kelompok,bidang_linier,urutan)
where not exists (select 1 from public.kur_mapel x where lower(btrim(x.nama))=lower(btrim(v.nama)));
update public.kur_mapel set bidang_linier=array['kewirausahaan','kreativitas','inovasi','ekonomi']::text[] where nama='Kreativitas, Inovasi, dan Kewirausahaan';