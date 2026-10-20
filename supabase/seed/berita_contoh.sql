-- Berita CONTOH untuk mengisi tampilan portal berita. Jalankan manual di SQL Editor Supabase (bukan migrasi).
-- Isinya teks umum tanpa klaim tentang kegiatan, prestasi, atau tokoh nyata. Semua judul berawalan "[Contoh]" dan slug berawalan "contoh-".
-- Aman dijalankan ulang (slug yang sama dilewati).
--
-- Hapus semua berita contoh bila sudah tidak dipakai:
--   delete from public.berita where slug like 'contoh-%';

insert into public.berita (npsn, slug, judul, kategori, ringkasan, isi, status, unggulan, terbit_pada, penulis_user, penulis_nama)
select s.npsn, v.slug, v.judul, v.kategori, v.ringkasan, v.isi, 'terbit', v.unggulan,
       now() - make_interval(days => v.hari_lalu, hours => v.jam_lalu),
       (select u.id from auth.users u order by u.created_at limit 1), 'Redaksi (contoh)'
from (select npsn from public.sekolah limit 1) s
cross join (values
  ('contoh-kegiatan-1', '[Contoh] Kegiatan pembiasaan pagi berjalan tertib', 'kegiatan',
   'Contoh berita kegiatan sekolah untuk mengisi tampilan portal.',
   E'Ini adalah berita contoh untuk menguji tampilan portal berita sekolah.\n\nGanti atau hapus berita ini dari menu Berita dan kegiatan di portal. Teks ini tidak menggambarkan kegiatan yang sebenarnya.', true, 1, 2),
  ('contoh-kegiatan-2', '[Contoh] Jadwal kegiatan kebersihan lingkungan sekolah', 'kegiatan',
   'Contoh berita kegiatan kedua dengan ringkasan singkat.',
   E'Berita contoh kedua pada kategori Kegiatan.\n\nGunakan untuk melihat susunan kartu berita pada beranda dan halaman daftar berita.', false, 3, 5),
  ('contoh-prestasi-1', '[Contoh] Daftar capaian peserta didik semester berjalan', 'prestasi',
   'Contoh berita prestasi untuk melihat tampilan kategori Prestasi.',
   E'Berita contoh pada kategori Prestasi.\n\nIsi ini hanya pengisi tampilan dan tidak memuat nama atau capaian peserta didik yang sebenarnya.', false, 4, 1),
  ('contoh-prestasi-2', '[Contoh] Ucapan selamat untuk seluruh peserta kegiatan', 'prestasi',
   'Contoh berita prestasi kedua.',
   E'Berita contoh kedua pada kategori Prestasi.\n\nGanti dengan berita prestasi sekolah yang sebenarnya.', false, 6, 4),
  ('contoh-pengumuman-1', '[Contoh] Pengumuman jadwal pembelajaran daring pekan depan', 'pengumuman',
   'Contoh pengumuman untuk menguji kategori Pengumuman.',
   E'Pengumuman contoh.\n\nPengumuman sebenarnya tentang pembelajaran jarak jauh dapat ditulis dari menu Berita dan kegiatan di portal.', true, 0, 6),
  ('contoh-pengumuman-2', '[Contoh] Informasi tata tertib penggunaan LMS sekolah', 'pengumuman',
   'Contoh pengumuman kedua tentang tata tertib.',
   E'Pengumuman contoh kedua.\n\nTeks ini hanya pengisi dan perlu diganti dengan pengumuman resmi sekolah.', false, 2, 3),
  ('contoh-kemitraan-1', '[Contoh] Kerja sama dengan dunia usaha dan dunia industri', 'kemitraan',
   'Contoh berita kemitraan untuk melihat tampilan kategori Kemitraan.',
   E'Berita contoh pada kategori Kemitraan.\n\nTidak menyebut mitra industri tertentu. Ganti dengan informasi kemitraan yang sebenarnya.', false, 5, 2),
  ('contoh-kemitraan-2', '[Contoh] Peluang praktik kerja lapangan bagi peserta didik', 'kemitraan',
   'Contoh berita kemitraan kedua.',
   E'Berita contoh kedua pada kategori Kemitraan.\n\nIsi ini hanya untuk menguji tampilan.', false, 8, 5),
  ('contoh-akademik-1', '[Contoh] Panduan belajar mandiri melalui LMS', 'akademik',
   'Contoh berita akademik untuk menguji kategori Akademik.',
   E'Berita contoh pada kategori Akademik.\n\nGanti dengan panduan atau informasi akademik yang sebenarnya.', false, 7, 1),
  ('contoh-akademik-2', '[Contoh] Informasi kalender akademik dan asesmen', 'akademik',
   'Contoh berita akademik kedua tentang kalender dan asesmen.',
   E'Berita contoh kedua pada kategori Akademik.\n\nJadwal yang sebenarnya ada di menu Kalender Akademik.', false, 9, 3),
  ('contoh-lainnya-1', '[Contoh] Catatan redaksi portal berita sekolah', 'lainnya',
   'Contoh berita kategori Lainnya.',
   E'Berita contoh pada kategori Lainnya.\n\nHapus semua berita contoh bila portal sudah terisi berita sebenarnya.', false, 10, 2),
  ('contoh-lainnya-2', '[Contoh] Ruang untuk kabar sekolah lainnya', 'lainnya',
   'Contoh berita kedua pada kategori Lainnya.',
   E'Berita contoh kedua pada kategori Lainnya.\n\nGanti atau hapus.', false, 12, 4)
) as v(slug, judul, kategori, ringkasan, isi, unggulan, hari_lalu, jam_lalu)
on conflict (slug) do nothing;
