-- Staf Kesiswaan: pembina OSIS (internal dan eksternal) dan pembina GDS (Gerakan Disiplin Siswa).
-- Pembina OSIS: kelola ekskul.kelola terbatas pada OSIS (lingkup nama ekskul).
-- Pembina GDS: catat pelanggaran (menunggu verifikasi Waka) dan pantau siswa seluruh sekolah.

insert into public.jabatan (kode, nama, kelompok, lingkup, induk_kode, urutan, tampil_publik, satu_pemegang, bagan, keterangan) values
  ('pembina_osis_internal', 'Pembina OSIS Internal', 'Kesiswaan', 'ekskul', 'waka_kesiswaan', 26, true, false, false,
   'Membina pengurus dan kegiatan OSIS dari lingkungan sekolah.'),
  ('pembina_osis_eksternal', 'Pembina OSIS Eksternal', 'Kesiswaan', 'ekskul', 'waka_kesiswaan', 27, true, false, false,
   'Mendampingi pembinaan OSIS dari luar struktur sekolah.'),
  ('pembina_gds', 'Pembina Gerakan Disiplin Siswa (GDS)', 'Kesiswaan', 'sekolah', 'waka_kesiswaan', 28, true, false, false,
   'Membina kedisiplinan siswa, mencatat pelanggaran, dan memantau siswa yang perlu pembinaan.')
on conflict (kode) do nothing;

insert into public.jabatan_izin (jabatan_kode, izin_kode) values
  ('pembina_osis_internal', 'ekskul.kelola'),
  ('pembina_osis_eksternal', 'ekskul.kelola'),
  ('pembina_gds', 'kesiswaan.catat'),
  ('pembina_gds', 'kesiswaan.pantau')
on conflict do nothing;

-- Penugasan tahun ajaran berjalan.
insert into public.penugasan (npsn, ptk_id, jabatan_kode, lingkup_id, lingkup_label, tahun_ajaran, sumber, status)
select p.npsn, p.id, x.jabatan, x.lingkup, x.lingkup, public.tahun_ajaran_sekarang(), 'manual', 'aktif'
  from (values
    ('55e026b9-e1c4-458c-9b41-efeb883788dd'::uuid, 'pembina_osis_eksternal', 'OSIS'),
    ('730a2404-999d-4651-9536-a53017be46fa'::uuid, 'pembina_osis_internal', 'OSIS'),
    ('d569dfa9-e90c-42a9-aeb0-87556ec551d1'::uuid, 'pembina_gds', null)
  ) as x(ptk, jabatan, lingkup)
  join public.ptk p on p.id = x.ptk
 where not exists (
   select 1 from public.penugasan e
    where e.ptk_id = p.id and e.jabatan_kode = x.jabatan and e.tahun_ajaran = public.tahun_ajaran_sekarang());
