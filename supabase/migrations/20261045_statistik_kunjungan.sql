-- Statistik kunjungan situs untuk beranda: pengunjung unik dan akun yang masuk, per hari (WIB).
-- Pengunjung dikenali dari kode acak yang dibuat peramban (bukan alamat IP, tanpa data pribadi).
-- Tabel tanpa policy; akses lewat fungsi security definer.

create table if not exists public.kunjungan_situs (
  tanggal date not null default ((now() at time zone 'Asia/Jakarta')::date),
  pengunjung text not null check (length(pengunjung) between 16 and 64),
  pertama timestamptz not null default now(),
  primary key (tanggal, pengunjung)
);
alter table public.kunjungan_situs enable row level security;
revoke all on table public.kunjungan_situs from anon, authenticated;

create table if not exists public.login_harian (
  tanggal date not null default ((now() at time zone 'Asia/Jakarta')::date),
  user_id uuid not null,
  peran text,
  pertama timestamptz not null default now(),
  primary key (tanggal, user_id)
);
alter table public.login_harian enable row level security;
revoke all on table public.login_harian from anon, authenticated;

-- Dipanggil peramban satu kali per hari. Kode pengunjung hanya dihitung sekali per tanggal.
create or replace function public.catat_kunjungan(p_pengunjung text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_pengunjung is null or length(p_pengunjung) not between 16 and 64 or p_pengunjung !~ '^[A-Za-z0-9-]+$' then return; end if;
  insert into public.kunjungan_situs (pengunjung) values (p_pengunjung) on conflict do nothing;
end $$;
revoke all on function public.catat_kunjungan(text) from public;
grant execute on function public.catat_kunjungan(text) to anon, authenticated;

-- Dipanggil setelah akun masuk. Satu akun dihitung sekali per hari, berapa kali pun masuk.
create or replace function public.catat_login() returns void
language plpgsql security definer set search_path = '' as $$
declare v_peran text;
begin
  if auth.uid() is null then return; end if;
  select peran into v_peran from public.profil_pengguna where user_id = auth.uid();
  if v_peran is null then return; end if;
  insert into public.login_harian (user_id, peran) values (auth.uid(), v_peran) on conflict do nothing;
end $$;
revoke all on function public.catat_login() from public, anon;
grant execute on function public.catat_login() to authenticated;

-- Angka untuk beranda. Hanya jumlah, tidak ada identitas.
create or replace function public.statistik_kunjungan() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_hari date := (now() at time zone 'Asia/Jakarta')::date;
        v_awal_bulan date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
begin
  return jsonb_build_object(
    'tanggal', v_hari,
    'hari_ini', jsonb_build_object(
      'pengunjung', (select count(*) from public.kunjungan_situs where tanggal = v_hari),
      'login', (select count(*) from public.login_harian where tanggal = v_hari)),
    'kemarin', jsonb_build_object(
      'pengunjung', (select count(*) from public.kunjungan_situs where tanggal = v_hari - 1),
      'login', (select count(*) from public.login_harian where tanggal = v_hari - 1)),
    'bulan_ini', jsonb_build_object(
      'pengunjung', (select count(distinct pengunjung) from public.kunjungan_situs where tanggal >= v_awal_bulan),
      'login', (select count(distinct user_id) from public.login_harian where tanggal >= v_awal_bulan)),
    'total_pengunjung', (select count(distinct pengunjung) from public.kunjungan_situs),
    'harian', (
      select jsonb_agg(jsonb_build_object(
        'tanggal', d.t,
        'pengunjung', (select count(*) from public.kunjungan_situs k where k.tanggal = d.t),
        'login', (select count(*) from public.login_harian l where l.tanggal = d.t)) order by d.t)
      from (select generate_series(v_hari - 6, v_hari, interval '1 day')::date t) d));
end $$;
revoke all on function public.statistik_kunjungan() from public;
grant execute on function public.statistik_kunjungan() to anon, authenticated;

notify pgrst, 'reload schema';
