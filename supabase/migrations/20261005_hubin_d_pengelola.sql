-- Modul Hubinmas, bagian D: tiga jabatan pengelola di bawah Waka Hubinmas.
-- Waka memegang semua izin hubin.*. Tiap pengelola hanya memegang izin bagian kerjanya.
--   Pengelola Web dan Digitalisasi: profil sekolah, profil jurusan, menulis dan menerbitkan berita.
--   Pengelola Sosial Media: menulis dan mengajukan berita (terbit oleh Waka atau Pengelola Web).
--   Pengelola BKK dan Tracer Study: tracer study dan bursa kerja khusus.
-- Hapus data mitra dan MoU tetap hanya pada izin hubin.kelola_dudi, yang tidak dipegang ketiga jabatan ini.

insert into public.izin (kode, nama, bidang) values
  ('hubin.bkk', 'Mengelola bursa kerja khusus (BKK)', 'Hubungan industri')
on conflict (kode) do nothing;

insert into public.jabatan (kode, nama, kelompok, lingkup, induk_kode, urutan, tampil_publik, satu_pemegang, bagan, keterangan) values
  ('pengelola_web_hubin', 'Pengelola Web dan Digitalisasi', 'Hubungan industri', 'sekolah', 'waka_hubin', 42, true, false, true,
   'Mengelola profil sekolah, profil jurusan, dan penerbitan berita di situs sekolah.'),
  ('pengelola_medsos_hubin', 'Pengelola Sosial Media', 'Hubungan industri', 'sekolah', 'waka_hubin', 43, true, false, true,
   'Menulis dan mengajukan konten kegiatan sekolah.'),
  ('pengelola_bkk_hubin', 'Pengelola BKK dan Tracer Study', 'Hubungan industri', 'sekolah', 'waka_hubin', 44, true, false, true,
   'Mengelola bursa kerja khusus dan tracer study alumni.')
on conflict (kode) do nothing;

insert into public.jabatan_izin (jabatan_kode, izin_kode) values
  ('waka_hubin', 'hubin.bkk'),
  ('pengelola_web_hubin', 'hubin.kelola_profil'),
  ('pengelola_web_hubin', 'hubin.tulis_berita'),
  ('pengelola_web_hubin', 'hubin.kelola_humas'),
  ('pengelola_medsos_hubin', 'hubin.tulis_berita'),
  ('pengelola_bkk_hubin', 'hubin.tracer'),
  ('pengelola_bkk_hubin', 'hubin.bkk')
on conflict do nothing;

create or replace function public.hubin_izin() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(k order by k), array[]::text[])
    from unnest(array['hubin.kelola_dudi','hubin.kelola_humas','hubin.kelola_profil','hubin.tulis_berita','hubin.tracer','hubin.bkk']) k
   where auth.uid() is not null
     and (private.punya_izin(k, null)
          or (k in ('hubin.kelola_dudi','hubin.tracer') and private.peran_saya() = 'admin_tu'))
$$;
