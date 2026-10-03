-- Profil dan username untuk akun non-siswa (super admin, admin TU, guru).
-- Username dipakai untuk masuk dengan username dan password lewat fungsi masuk-admin.
create table if not exists public.profil_admin (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  nama_lengkap text,
  telepon text,
  jabatan text,
  diperbarui_pada timestamptz not null default now(),
  constraint profil_admin_username_format check (username ~ '^[a-z0-9][a-z0-9._-]{3,31}$')
);
create unique index if not exists profil_admin_username_uq on public.profil_admin (username);
alter table public.profil_admin enable row level security;

create policy profil_admin_baca_sendiri on public.profil_admin for select to authenticated
  using (user_id = (select auth.uid()));
create policy profil_admin_tambah_sendiri on public.profil_admin for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.peran_saya()) <> 'siswa');
create policy profil_admin_ubah_sendiri on public.profil_admin for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
