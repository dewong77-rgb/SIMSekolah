-- SPMI (Sistem Penjaminan Mutu Internal), bagian A: tim SPMI, standar mutu (8 SNP) beserta indikator, dan dokumen mutu.
-- Siklus PPEPP: Penetapan, Pelaksanaan, Evaluasi, Pengendalian, Peningkatan. Bagian A mencakup Penetapan.
-- Audit mutu internal dan tindak lanjut menyusul di bagian B dan C.

insert into public.jabatan (kode, nama, kelompok, lingkup, induk_kode, urutan, tampil_publik, satu_pemegang, bagan) values
  ('ketua_spmi',   'Ketua Satuan Penjamin Mutu Internal (SPMI)', 'Penjaminan mutu', 'sekolah', 'kepala_sekolah', 60, true, true, true),
  ('anggota_spmi', 'Anggota Satuan Penjamin Mutu Internal (SPMI)', 'Penjaminan mutu', 'sekolah', 'ketua_spmi', 61, true, false, true)
on conflict (kode) do nothing;

insert into public.izin (kode, nama, bidang) values
  ('spmi.kelola', 'Mengelola standar mutu, indikator, dan dokumen SPMI', 'Penjaminan mutu'),
  ('spmi.catat',  'Mencatat indikator dan dokumen SPMI sebagai anggota tim', 'Penjaminan mutu'),
  ('spmi.lihat',  'Melihat standar, indikator, dan dokumen SPMI', 'Penjaminan mutu')
on conflict (kode) do nothing;

insert into public.jabatan_izin (jabatan_kode, izin_kode) values
  ('ketua_spmi', 'spmi.kelola'), ('ketua_spmi', 'spmi.lihat'),
  ('anggota_spmi', 'spmi.catat'), ('anggota_spmi', 'spmi.lihat'),
  ('kepala_sekolah', 'spmi.lihat')
on conflict do nothing;

create table if not exists public.spmi_standar (
  id uuid primary key default gen_random_uuid(),
  npsn text not null default private.npsn_saya(),
  kode text not null,
  nama text not null,
  uraian text,
  urutan int not null default 100,
  penanggung_jawab text,
  aktif boolean not null default true,
  dibuat_pada timestamptz not null default now(),
  diubah_pada timestamptz not null default now(),
  unique (npsn, kode)
);

create table if not exists public.spmi_indikator (
  id uuid primary key default gen_random_uuid(),
  npsn text not null default private.npsn_saya(),
  standar_id uuid not null references public.spmi_standar(id) on delete cascade,
  uraian text not null,
  target text,
  satuan text,
  sumber_data text,
  aktif boolean not null default true,
  dibuat_pada timestamptz not null default now(),
  diubah_pada timestamptz not null default now()
);
create index if not exists spmi_indikator_standar_idx on public.spmi_indikator (standar_id);

create table if not exists public.spmi_dokumen (
  id uuid primary key default gen_random_uuid(),
  npsn text not null default private.npsn_saya(),
  jenis text not null check (jenis in ('kebijakan','manual','standar','formulir','laporan','lainnya')),
  judul text not null,
  nomor text,
  tahun int check (tahun between 2000 and 2100),
  tautan text check (tautan is null or tautan ~* '^https://\S+$'),
  catatan text,
  diarsipkan boolean not null default false,
  dibuat_pada timestamptz not null default now(),
  diubah_pada timestamptz not null default now()
);

create or replace function private.spmi_sentuh() returns trigger language plpgsql set search_path = '' as $fn$
begin new.diubah_pada := now(); return new; end $fn$;
create trigger spmi_standar_sentuh before update on public.spmi_standar for each row execute function private.spmi_sentuh();
create trigger spmi_indikator_sentuh before update on public.spmi_indikator for each row execute function private.spmi_sentuh();
create trigger spmi_dokumen_sentuh before update on public.spmi_dokumen for each row execute function private.spmi_sentuh();

create or replace function private.spmi_boleh_lihat() returns boolean
language sql stable security definer set search_path = '' as $fn$
  select auth.uid() is not null and (private.punya_izin('spmi.kelola', null) or private.punya_izin('spmi.catat', null) or private.punya_izin('spmi.lihat', null))
$fn$;
create or replace function private.spmi_boleh_tulis() returns boolean
language sql stable security definer set search_path = '' as $fn$
  select auth.uid() is not null and (private.punya_izin('spmi.kelola', null) or private.punya_izin('spmi.catat', null))
$fn$;

alter table public.spmi_standar enable row level security;
alter table public.spmi_indikator enable row level security;
alter table public.spmi_dokumen enable row level security;

-- Baca: semua pemegang izin SPMI di sekolahnya. Tulis: ketua dan anggota tim. Hapus: ketua saja.
do $do$
declare t text;
begin
  foreach t in array array['spmi_standar','spmi_indikator','spmi_dokumen'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select private.spmi_boleh_lihat()) and npsn = (select private.npsn_saya()))', t || '_baca', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.spmi_boleh_tulis()) and npsn = (select private.npsn_saya()))', t || '_tambah', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.spmi_boleh_tulis()) and npsn = (select private.npsn_saya())) with check ((select private.spmi_boleh_tulis()) and npsn = (select private.npsn_saya()))', t || '_ubah', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.punya_izin(''spmi.kelola'', null)) and npsn = (select private.npsn_saya()))', t || '_hapus', t);
  end loop;
end $do$;

create or replace function public.spmi_izin() returns text[]
language sql stable security definer set search_path = '' as $fn$
  select coalesce(array_remove(array[
    case when private.punya_izin('spmi.kelola', null) then 'kelola' end,
    case when private.spmi_boleh_tulis() then 'catat' end,
    case when private.spmi_boleh_lihat() then 'lihat' end
  ], null), array[]::text[])
  where auth.uid() is not null
$fn$;

-- Mengisi delapan Standar Nasional Pendidikan bila sekolah belum punya standar. Aman dipanggil berulang.
create or replace function public.spmi_siapkan_standar() returns integer
language plpgsql security definer set search_path = '' as $fn$
declare v_n integer;
begin
  if not private.punya_izin('spmi.kelola', null) then
    raise exception 'Hanya Ketua SPMI yang dapat menyiapkan standar.' using errcode = '42501';
  end if;
  insert into public.spmi_standar (npsn, kode, nama, urutan) values
    (private.npsn_saya(), 'SKL',  'Standar Kompetensi Lulusan', 1),
    (private.npsn_saya(), 'ISI',  'Standar Isi', 2),
    (private.npsn_saya(), 'PROS', 'Standar Proses', 3),
    (private.npsn_saya(), 'PEN',  'Standar Penilaian', 4),
    (private.npsn_saya(), 'GTK',  'Standar Pendidik dan Tenaga Kependidikan', 5),
    (private.npsn_saya(), 'SAR',  'Standar Sarana dan Prasarana', 6),
    (private.npsn_saya(), 'KEL',  'Standar Pengelolaan', 7),
    (private.npsn_saya(), 'BIA',  'Standar Pembiayaan', 8)
  on conflict (npsn, kode) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

revoke all on function public.spmi_siapkan_standar() from public, anon;
grant execute on function public.spmi_siapkan_standar() to authenticated;
revoke all on function public.spmi_izin() from public, anon;
grant execute on function public.spmi_izin() to authenticated;
