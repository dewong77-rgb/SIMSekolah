-- Admin Asesmen Digital: hanya super admin, Waka Kurikulum, dan Staf Kurikulum (penugasan aktif tahun ini).
-- Peran akun admin_ujian tidak lagi memberi hak admin.
insert into public.izin (kode, nama, bidang) values
  ('asesmen.kelola', 'Mengelola Asesmen Digital (CBT)', 'Kurikulum')
on conflict (kode) do nothing;

insert into public.jabatan_izin (jabatan_kode, izin_kode) values
  ('waka_kurikulum', 'asesmen.kelola'),
  ('staf_kurikulum', 'asesmen.kelola')
on conflict do nothing;

create or replace function private.ad_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.adalah_super() or private.punya_izin('asesmen.kelola')
$$;
