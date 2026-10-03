-- Pencatat percobaan login siswa (hanya diakses fungsi server).
create table if not exists public.percobaan_masuk (
  id bigint generated always as identity primary key,
  kunci text not null,
  berhasil boolean not null default false,
  dibuat_pada timestamptz not null default now()
);
create index if not exists percobaan_masuk_kunci_waktu on public.percobaan_masuk (kunci, dibuat_pada desc);
alter table public.percobaan_masuk enable row level security;
revoke all on public.percobaan_masuk from anon, authenticated;

-- Super admin: hanya dapat membaca baris sendiri, tidak ada kebijakan tulis.
-- Penambahan super admin hanya lewat SQL oleh pemilik proyek, mis.:
--   insert into public.super_admin (user_id) select id from auth.users where lower(email) = 'alamat@email';
create table if not exists public.super_admin (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dibuat_pada timestamptz not null default now()
);
alter table public.super_admin enable row level security;
revoke all on public.super_admin from anon, authenticated;
grant select on public.super_admin to authenticated;
create policy super_admin_baca_sendiri on public.super_admin for select to authenticated using (user_id = (select auth.uid()));
