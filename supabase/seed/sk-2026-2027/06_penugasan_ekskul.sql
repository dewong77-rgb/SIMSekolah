-- Penugasan dan pembina ekstrakurikuler dari SK 391 yang belum tercatat. Sudah dijalankan; berkas ini hanya catatan.
-- Kepala Bengkel Pemesinan: Mohamad Rizki Sabarudin (dikonfirmasi sekolah) menggantikan Arif Budiman.
update public.penugasan set status = 'selesai'
 where jabatan_kode = 'kepala_bengkel' and lingkup_id = 'Bengkel Pemesinan' and status = 'aktif' and tahun_ajaran = '2026/2027'
   and ptk_id = (select id from public.ptk where lower(nama) = 'arif budiman');
insert into public.penugasan (npsn, ptk_id, jabatan_kode, lingkup_id, lingkup_label, tahun_ajaran, sumber, status)
select p.npsn, p.id, 'kepala_bengkel', 'Bengkel Pemesinan', 'Bengkel Pemesinan', '2026/2027', 'manual', 'aktif'
  from public.ptk p where lower(p.nama) = 'mohamad rizki sabarudin' on conflict do nothing;
-- Kepala Lab. Informatika: Andika Pratama
insert into public.penugasan (npsn, ptk_id, jabatan_kode, lingkup_id, lingkup_label, tahun_ajaran, sumber, status)
select p.npsn, p.id, 'kepala_bengkel', 'Lab. Informatika', 'Lab. Informatika', '2026/2027', 'manual', 'aktif'
  from public.ptk p where lower(p.nama) = 'andika pratama' on conflict do nothing;
-- Jabatan koordinator: PKG/PKB/PMM (Novalia Hutabarat), Kokurikuler (Abdul Muttaqin), Perawatan Sarpras (Suryanto), Adiwiyata (Kusno Rahayu).
-- Pembina ekskul: Pramuka putra Joko Prihanto dan putri Jois Mayasari, Rohis Miftahudin, Paskibra Mohamad Syahroni,
-- Kesenian Yesri Hilal, UKS/KKR Sawitri Rosdiarti. Olahraga (Kusno Rahayu) sudah tercatat sebagai pembina Bola Voli.
