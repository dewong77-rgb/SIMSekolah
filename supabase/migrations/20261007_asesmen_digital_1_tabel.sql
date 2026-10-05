-- Asesmen Digital, bagian 1: peran, tabel, helper
alter table public.profil_pengguna drop constraint profil_pengguna_peran_check;
alter table public.profil_pengguna add constraint profil_pengguna_peran_check
  check (peran in ('admin_tu','guru','staf','siswa','orang_tua','admin_ujian'));

create table public.ad_ujian (
  id uuid primary key default gen_random_uuid(),
  npsn text not null,
  nama text not null,
  jenis text not null default 'uts' check (jenis in ('uts','uas','lainnya')),
  durasi_menit int not null default 90 check (durasi_menit between 5 and 360),
  maks_pelanggaran int not null default 3 check (maks_pelanggaran between 1 and 20),
  kunci_otomatis boolean not null default false,
  acak_soal boolean not null default true,
  acak_opsi boolean not null default true,
  tampil_nilai boolean not null default false,
  status text not null default 'draf' check (status in ('draf','aktif','selesai')),
  dibuat_oleh uuid,
  dibuat_pada timestamptz not null default now()
);
create table public.ad_bank (
  id uuid primary key default gen_random_uuid(),
  npsn text not null,
  mapel text not null,
  tingkat int,
  judul text not null,
  pemilik uuid not null,
  dibuat_pada timestamptz not null default now()
);
create table public.ad_soal (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.ad_bank(id) on delete cascade,
  urut int not null default 0,
  tipe text not null check (tipe in ('pilgan','isian')),
  pertanyaan text not null,
  opsi jsonb not null default '[]',
  kunci text not null,
  bobot numeric not null default 1 check (bobot > 0),
  pembahasan text
);
create index on public.ad_soal(bank_id, urut);
create table public.ad_paket (
  id uuid primary key default gen_random_uuid(),
  ujian_id uuid not null references public.ad_ujian(id) on delete cascade,
  npsn text not null,
  nama text not null,
  dibuat_pada timestamptz not null default now()
);
create table public.ad_paket_soal (
  id uuid primary key default gen_random_uuid(),
  paket_id uuid not null references public.ad_paket(id) on delete cascade,
  urut int not null default 0,
  tipe text not null,
  pertanyaan text not null,
  opsi jsonb not null default '[]',
  kunci text not null,
  bobot numeric not null default 1,
  pembahasan text
);
create index on public.ad_paket_soal(paket_id, urut);
create table public.ad_ruang (
  id uuid primary key default gen_random_uuid(),
  npsn text not null,
  nama text not null,
  kapasitas int not null default 36 check (kapasitas > 0),
  unique (npsn, nama)
);
create table public.ad_sesi (
  id uuid primary key default gen_random_uuid(),
  ujian_id uuid not null references public.ad_ujian(id) on delete cascade,
  npsn text not null,
  nama text not null,
  paket_id uuid references public.ad_paket(id) on delete set null,
  mulai timestamptz not null,
  selesai timestamptz not null,
  check (selesai > mulai)
);
create table public.ad_sesi_ruang (
  id uuid primary key default gen_random_uuid(),
  sesi_id uuid not null references public.ad_sesi(id) on delete cascade,
  ruang_id uuid not null references public.ad_ruang(id),
  pengawas_ptk_id uuid references public.ptk(id) on delete set null,
  token text,
  token_dibuka boolean not null default false,
  unique (sesi_id, ruang_id)
);
create table public.ad_peserta (
  id uuid primary key default gen_random_uuid(),
  sesi_id uuid not null references public.ad_sesi(id) on delete cascade,
  sesi_ruang_id uuid not null references public.ad_sesi_ruang(id) on delete cascade,
  peserta_didik_id uuid not null references public.peserta_didik(id),
  no_kursi int,
  unique (sesi_ruang_id, peserta_didik_id),
  unique (sesi_id, peserta_didik_id)
);
create index on public.ad_peserta(peserta_didik_id);
create table public.ad_percobaan (
  id uuid primary key default gen_random_uuid(),
  peserta_id uuid not null unique references public.ad_peserta(id) on delete cascade,
  mulai timestamptz not null default now(),
  batas timestamptz not null,
  selesai timestamptz,
  urutan jsonb not null default '[]',
  nilai numeric,
  benar int,
  pelanggaran int not null default 0,
  dasar int not null default 0,
  terkunci boolean not null default false
);
create table public.ad_jawaban (
  percobaan_id uuid not null references public.ad_percobaan(id) on delete cascade,
  soal_id uuid not null,
  jawaban text,
  ragu boolean not null default false,
  diperbarui timestamptz not null default now(),
  primary key (percobaan_id, soal_id)
);
create table public.ad_pelanggaran (
  id bigserial primary key,
  percobaan_id uuid not null references public.ad_percobaan(id) on delete cascade,
  jenis text not null,
  waktu timestamptz not null default now()
);
create index on public.ad_pelanggaran(percobaan_id, waktu);

do $$
declare t text;
begin
  foreach t in array array['ad_ujian','ad_bank','ad_soal','ad_paket','ad_paket_soal','ad_ruang','ad_sesi','ad_sesi_ruang','ad_peserta','ad_percobaan','ad_jawaban','ad_pelanggaran'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

create or replace function private.ad_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select peran = 'admin_ujian' from public.profil_pengguna where user_id = (select auth.uid())), false)
      or private.adalah_super()
$$;

create or replace function private.ad_wajib_admin() returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.ad_admin() then raise exception 'Hanya admin ujian'; end if;
  return private.npsn_saya();
end $$;

create or replace function private.ad_kelola_sr(p_sr uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ad_sesi_ruang sr join public.ad_sesi s on s.id = sr.sesi_id
    where sr.id = p_sr and s.npsn = private.npsn_saya()
      and (private.ad_admin() or (sr.pengawas_ptk_id is not null and sr.pengawas_ptk_id = private.ptk_id_saya())))
$$;

create or replace function private.ad_norm(p text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(btrim(coalesce(p,'')), '\s+', ' ', 'g'))
$$;

create or replace function private.ad_hitung(p_percobaan uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_total numeric; v_dapat numeric; v_benar int;
begin
  select coalesce(sum(ps.bobot),0),
         coalesce(sum(case when j.jawaban is not null and (
              (ps.tipe = 'pilgan' and j.jawaban = ps.kunci)
           or (ps.tipe = 'isian' and exists (select 1 from unnest(string_to_array(ps.kunci, '|')) k where private.ad_norm(k) = private.ad_norm(j.jawaban) and btrim(k) <> '')))
           then ps.bobot else 0 end),0),
         coalesce(sum(case when j.jawaban is not null and (
              (ps.tipe = 'pilgan' and j.jawaban = ps.kunci)
           or (ps.tipe = 'isian' and exists (select 1 from unnest(string_to_array(ps.kunci, '|')) k where private.ad_norm(k) = private.ad_norm(j.jawaban) and btrim(k) <> '')))
           then 1 else 0 end),0)
    into v_total, v_dapat, v_benar
  from public.ad_percobaan pc
  join public.ad_peserta pe on pe.id = pc.peserta_id
  join public.ad_sesi s on s.id = pe.sesi_id
  join public.ad_paket_soal ps on ps.paket_id = s.paket_id
  left join public.ad_jawaban j on j.percobaan_id = pc.id and j.soal_id = ps.id
  where pc.id = p_percobaan;
  update public.ad_percobaan
     set nilai = case when v_total > 0 then round(v_dapat / v_total * 100, 2) else 0 end,
         benar = v_benar,
         selesai = coalesce(selesai, now())
   where id = p_percobaan;
end $$;

create or replace function private.ad_tutup_kadaluarsa(p_ujian uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select pc.id from public.ad_percobaan pc
             join public.ad_peserta pe on pe.id = pc.peserta_id
             join public.ad_sesi s on s.id = pe.sesi_id
            where s.ujian_id = p_ujian and pc.selesai is null and pc.batas < now() - interval '6 seconds'
  loop perform private.ad_hitung(r.id); end loop;
end $$;
