-- Terpasang sebagai migrasi lms_fase4_forum. Forum diskusi per pertemuan; hapus memakai penanda dihapus.

create table public.forum_topik (
  id uuid primary key default gen_random_uuid(),
  pertemuan_id uuid not null references public.pertemuan(id) on delete cascade,
  kelas_ajar_id uuid not null references public.kelas_ajar(id) on delete cascade,
  penulis_user uuid not null,
  penulis_nama text not null,
  penulis_peran text not null,
  judul text not null check (length(btrim(judul)) between 1 and 200),
  isi text not null check (length(btrim(isi)) between 1 and 5000),
  dikunci boolean not null default false,
  dihapus boolean not null default false,
  dibuat_pada timestamptz not null default now()
);

create table public.forum_balasan (
  id uuid primary key default gen_random_uuid(),
  topik_id uuid not null references public.forum_topik(id) on delete cascade,
  penulis_user uuid not null,
  penulis_nama text not null,
  penulis_peran text not null,
  isi text not null check (length(btrim(isi)) between 1 and 5000),
  dihapus boolean not null default false,
  dibuat_pada timestamptz not null default now()
);

create index forum_topik_pertemuan_idx on public.forum_topik(pertemuan_id);
create index forum_topik_kelas_idx on public.forum_topik(kelas_ajar_id);
create index forum_balasan_topik_idx on public.forum_balasan(topik_id);
create index forum_topik_user_idx on public.forum_topik(penulis_user, dibuat_pada);
create index forum_balasan_user_idx on public.forum_balasan(penulis_user, dibuat_pada);

alter table public.forum_topik enable row level security;
alter table public.forum_balasan enable row level security;
revoke all on table public.forum_topik, public.forum_balasan from anon, authenticated;

create or replace function private.lms_nama_saya() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.nama from public.ptk p where p.id = private.ptk_id_saya()),
    (select d.nama from public.peserta_didik d where d.id = private.pd_id_saya()),
    'Pengguna')
$$;

create or replace function private.lms_forum_akses(p_pertemuan uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select private.lms_kelola(t.kelas_ajar_id)
      or (t.status = 'terbit' and private.lms_anggota(t.kelas_ajar_id) and private.lms_gerbang_lolos(t.id))
    from public.pertemuan t where t.id = p_pertemuan), false)
$$;

create or replace function public.lms_forum_daftar(p_pertemuan uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.lms_forum_akses(p_pertemuan) then
    raise exception 'Forum terbuka setelah Anda absen.' using errcode = 'P0001', hint = 'gerbang_absen';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', f.id, 'judul', f.judul, 'isi', f.isi, 'penulis_nama', f.penulis_nama, 'penulis_peran', f.penulis_peran,
      'dikunci', f.dikunci, 'dibuat_pada', f.dibuat_pada,
      'milik_saya', f.penulis_user = auth.uid(),
      'jumlah_balasan', (select count(*) from public.forum_balasan b where b.topik_id = f.id and not b.dihapus),
      'terakhir', coalesce((select max(b.dibuat_pada) from public.forum_balasan b where b.topik_id = f.id and not b.dihapus), f.dibuat_pada)
    ) order by coalesce((select max(b.dibuat_pada) from public.forum_balasan b where b.topik_id = f.id and not b.dihapus), f.dibuat_pada) desc)
    from public.forum_topik f where f.pertemuan_id = p_pertemuan and not f.dihapus), '[]'::jsonb);
end $$;

create or replace function public.lms_forum_balasan_daftar(p_topik uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_pert uuid;
begin
  select pertemuan_id into v_pert from public.forum_topik where id = p_topik and not dihapus;
  if v_pert is null or not private.lms_forum_akses(v_pert) then raise exception 'Tidak tersedia.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', b.id, 'isi', b.isi, 'penulis_nama', b.penulis_nama, 'penulis_peran', b.penulis_peran,
      'dibuat_pada', b.dibuat_pada, 'milik_saya', b.penulis_user = auth.uid()) order by b.dibuat_pada)
    from public.forum_balasan b where b.topik_id = p_topik and not b.dihapus), '[]'::jsonb);
end $$;

create or replace function private.lms_forum_batas() returns void
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  select (select count(*) from public.forum_topik where penulis_user = auth.uid() and dibuat_pada > now() - interval '10 minutes')
       + (select count(*) from public.forum_balasan where penulis_user = auth.uid() and dibuat_pada > now() - interval '10 minutes')
    into v_n;
  if v_n >= 15 then raise exception 'Terlalu banyak kiriman. Tunggu beberapa menit.' using errcode = 'P0001'; end if;
end $$;

create or replace function public.lms_forum_buat(p_pertemuan uuid, p_judul text, p_isi text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_kelas uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Perlu masuk.' using errcode = '28000'; end if;
  select kelas_ajar_id into v_kelas from public.pertemuan where id = p_pertemuan;
  if v_kelas is null or not private.lms_forum_akses(p_pertemuan) then raise exception 'Tidak tersedia.' using errcode = '42501'; end if;
  if btrim(coalesce(p_judul, '')) = '' or btrim(coalesce(p_isi, '')) = '' then raise exception 'Judul dan isi wajib diisi.' using errcode = '22023'; end if;
  perform private.lms_forum_batas();
  insert into public.forum_topik (pertemuan_id, kelas_ajar_id, penulis_user, penulis_nama, penulis_peran, judul, isi)
  values (p_pertemuan, v_kelas, auth.uid(), private.lms_nama_saya(),
          case when private.lms_kelola(v_kelas) then 'guru' else 'siswa' end, btrim(p_judul), btrim(p_isi))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.lms_forum_balas(p_topik uuid, p_isi text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare f public.forum_topik%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Perlu masuk.' using errcode = '28000'; end if;
  select * into f from public.forum_topik where id = p_topik and not dihapus;
  if not found or not private.lms_forum_akses(f.pertemuan_id) then raise exception 'Tidak tersedia.' using errcode = '42501'; end if;
  if f.dikunci and not private.lms_kelola(f.kelas_ajar_id) then raise exception 'Diskusi ini dikunci guru.' using errcode = 'P0001'; end if;
  if btrim(coalesce(p_isi, '')) = '' then raise exception 'Isi balasan kosong.' using errcode = '22023'; end if;
  perform private.lms_forum_batas();
  insert into public.forum_balasan (topik_id, penulis_user, penulis_nama, penulis_peran, isi)
  values (p_topik, auth.uid(), private.lms_nama_saya(),
          case when private.lms_kelola(f.kelas_ajar_id) then 'guru' else 'siswa' end, btrim(p_isi))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.lms_forum_kunci(p_topik uuid, p_kunci boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_kelas uuid;
begin
  select kelas_ajar_id into v_kelas from public.forum_topik where id = p_topik;
  if v_kelas is null or not private.lms_kelola(v_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  update public.forum_topik set dikunci = coalesce(p_kunci, true) where id = p_topik;
end $$;

create or replace function public.lms_forum_hapus(p_jenis text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_kelas uuid; v_penulis uuid;
begin
  if p_jenis = 'topik' then
    select kelas_ajar_id, penulis_user into v_kelas, v_penulis from public.forum_topik where id = p_id;
  elsif p_jenis = 'balasan' then
    select t.kelas_ajar_id, b.penulis_user into v_kelas, v_penulis
    from public.forum_balasan b join public.forum_topik t on t.id = b.topik_id where b.id = p_id;
  else
    raise exception 'Jenis tidak valid.' using errcode = '22023';
  end if;
  if v_kelas is null or not (private.lms_kelola(v_kelas) or v_penulis = auth.uid()) then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  if p_jenis = 'topik' then update public.forum_topik set dihapus = true where id = p_id;
  else update public.forum_balasan set dihapus = true where id = p_id; end if;
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.proname like 'lms\_%'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
