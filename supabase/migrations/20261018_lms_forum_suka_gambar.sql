-- Forum: tombol suka dan lampiran gambar (tangkapan layar) pada kiriman dan komentar.
-- Gambar disimpan di bucket privat "forum/{kelas_ajar_id}/{user_id}/{kode}.webp". Hanya anggota kelas dan pengelola kelas yang bisa melihat.
-- Satu gambar per tulisan. Gambar diperkecil menjadi WebP maksimal 2 MB di browser sebelum diunggah.

alter table public.forum_topik add column if not exists gambar text;
alter table public.forum_balasan add column if not exists gambar text;

-- Akses berkas: nama berkas harus berpola forum/{kelas}/{user}/{berkas}. Menulis hanya ke folder sendiri.
create or replace function private.forum_gambar_boleh(p_nama text, p_tulis boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_kelas uuid;
begin
  if auth.uid() is null or p_nama !~ '^forum/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]+$' then return false; end if;
  v_kelas := (storage.foldername(p_nama))[2]::uuid;
  if p_tulis and (storage.foldername(p_nama))[3] <> auth.uid()::text then return false; end if;
  return private.lms_kelola(v_kelas) or private.lms_anggota(v_kelas);
end $$;

create policy privat_forum_tulis on storage.objects for insert to authenticated
  with check (bucket_id = 'privat' and (storage.foldername(name))[1] = 'forum' and (select private.forum_gambar_boleh(name, true)));
create policy privat_forum_hapus on storage.objects for delete to authenticated
  using (bucket_id = 'privat' and (storage.foldername(name))[1] = 'forum' and (select private.forum_gambar_boleh(name, true)));
create policy privat_forum_baca on storage.objects for select to authenticated
  using (bucket_id = 'privat' and (storage.foldername(name))[1] = 'forum' and (select private.forum_gambar_boleh(name, false)));

-- Suka: satu pengguna satu suka per kiriman atau komentar.
create table if not exists public.forum_suka (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  topik_id uuid references public.forum_topik(id) on delete cascade,
  balasan_id uuid references public.forum_balasan(id) on delete cascade,
  dibuat_pada timestamptz not null default now(),
  check ((topik_id is null) <> (balasan_id is null))
);
create unique index if not exists forum_suka_topik_uq on public.forum_suka(user_id, topik_id) where topik_id is not null;
create unique index if not exists forum_suka_balasan_uq on public.forum_suka(user_id, balasan_id) where balasan_id is not null;
create index if not exists forum_suka_topik_idx on public.forum_suka(topik_id) where topik_id is not null;
create index if not exists forum_suka_balasan_idx on public.forum_suka(balasan_id) where balasan_id is not null;
alter table public.forum_suka enable row level security;
revoke all on table public.forum_suka from anon, authenticated;

create or replace function public.lms_forum_suka(p_jenis text, p_id uuid, p_suka boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_pert uuid; v_n integer;
begin
  if auth.uid() is null then raise exception 'Perlu masuk.' using errcode = '28000'; end if;
  if p_jenis = 'topik' then
    select pertemuan_id into v_pert from public.forum_topik where id = p_id and not dihapus;
  elsif p_jenis = 'balasan' then
    select t.pertemuan_id into v_pert from public.forum_balasan b join public.forum_topik t on t.id = b.topik_id
    where b.id = p_id and not b.dihapus and not t.dihapus;
  else
    raise exception 'Jenis tidak valid.' using errcode = '22023';
  end if;
  if v_pert is null or not private.lms_forum_akses(v_pert) then raise exception 'Tidak tersedia.' using errcode = '42501'; end if;
  if coalesce(p_suka, true) then
    if p_jenis = 'topik' then insert into public.forum_suka (user_id, topik_id) values (auth.uid(), p_id) on conflict do nothing;
    else insert into public.forum_suka (user_id, balasan_id) values (auth.uid(), p_id) on conflict do nothing; end if;
  else
    if p_jenis = 'topik' then delete from public.forum_suka where user_id = auth.uid() and topik_id = p_id;
    else delete from public.forum_suka where user_id = auth.uid() and balasan_id = p_id; end if;
  end if;
  select count(*) into v_n from public.forum_suka where (p_jenis = 'topik' and topik_id = p_id) or (p_jenis = 'balasan' and balasan_id = p_id);
  return jsonb_build_object('jumlah', v_n, 'saya', coalesce(p_suka, true));
end $$;

-- Daftar kiriman dan komentar ikut membawa gambar dan suka.
create or replace function public.lms_forum_daftar(p_pertemuan uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.lms_forum_akses(p_pertemuan) then
    raise exception 'Forum terbuka setelah Anda absen.' using errcode = 'P0001', hint = 'gerbang_absen';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', f.id, 'judul', f.judul, 'isi', f.isi, 'penulis_nama', f.penulis_nama, 'penulis_peran', f.penulis_peran,
      'dikunci', f.dikunci, 'dibuat_pada', f.dibuat_pada, 'gambar', f.gambar,
      'milik_saya', f.penulis_user = auth.uid(),
      'suka', (select count(*) from public.forum_suka s where s.topik_id = f.id),
      'suka_saya', exists (select 1 from public.forum_suka s where s.topik_id = f.id and s.user_id = auth.uid()),
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
      'dibuat_pada', b.dibuat_pada, 'milik_saya', b.penulis_user = auth.uid(),
      'induk_id', b.induk_id, 'balas_ke', b.balas_ke, 'gambar', b.gambar,
      'suka', (select count(*) from public.forum_suka s where s.balasan_id = b.id),
      'suka_saya', exists (select 1 from public.forum_suka s where s.balasan_id = b.id and s.user_id = auth.uid())
    ) order by b.dibuat_pada)
    from public.forum_balasan b where b.topik_id = p_topik and not b.dihapus), '[]'::jsonb);
end $$;

-- Menulis dengan gambar. Path gambar harus milik pemanggil dan kelas yang sama dengan pertemuan.
create or replace function private.forum_gambar_sah(p_gambar text, p_kelas uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_gambar is null or btrim(p_gambar) = '' then return null; end if;
  if p_gambar !~ ('^forum/' || p_kelas::text || '/' || auth.uid()::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Gambar tidak valid.' using errcode = '22023';
  end if;
  return p_gambar;
end $$;

-- Tanda tangan baru tanpa nilai bawaan, jadi tidak bentrok dengan versi lama (uuid, text, text) dan (uuid, text).
-- Pemanggil selalu mengirim semua parameter. Versi lama tidak dipakai lagi dan boleh dibuang.
create or replace function public.lms_forum_buat(p_pertemuan uuid, p_judul text, p_isi text, p_gambar text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_kelas uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Perlu masuk.' using errcode = '28000'; end if;
  select kelas_ajar_id into v_kelas from public.pertemuan where id = p_pertemuan;
  if v_kelas is null or not private.lms_forum_akses(p_pertemuan) then raise exception 'Tidak tersedia.' using errcode = '42501'; end if;
  if btrim(coalesce(p_judul, '')) = '' or btrim(coalesce(p_isi, '')) = '' then raise exception 'Judul dan isi wajib diisi.' using errcode = '22023'; end if;
  perform private.lms_forum_batas();
  insert into public.forum_topik (pertemuan_id, kelas_ajar_id, penulis_user, penulis_nama, penulis_peran, judul, isi, gambar)
  values (p_pertemuan, v_kelas, auth.uid(), private.lms_nama_saya(),
          case when private.lms_kelola(v_kelas) then 'guru' else 'siswa' end, btrim(p_judul), btrim(p_isi),
          private.forum_gambar_sah(p_gambar, v_kelas))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.lms_forum_balas(p_topik uuid, p_isi text, p_induk uuid, p_gambar text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare f public.forum_topik%rowtype; v_id uuid; v_induk uuid; v_nama text;
begin
  if auth.uid() is null then raise exception 'Perlu masuk.' using errcode = '28000'; end if;
  select * into f from public.forum_topik where id = p_topik and not dihapus;
  if not found or not private.lms_forum_akses(f.pertemuan_id) then raise exception 'Tidak tersedia.' using errcode = '42501'; end if;
  if f.dikunci and not private.lms_kelola(f.kelas_ajar_id) then raise exception 'Diskusi ini dikunci guru.' using errcode = 'P0001'; end if;
  if btrim(coalesce(p_isi, '')) = '' then raise exception 'Isi balasan kosong.' using errcode = '22023'; end if;
  if p_induk is not null then
    select coalesce(b.induk_id, b.id), b.penulis_nama into v_induk, v_nama
    from public.forum_balasan b where b.id = p_induk and b.topik_id = p_topik and not b.dihapus;
    if v_induk is null then raise exception 'Komentar yang dibalas sudah tidak ada.' using errcode = 'P0001'; end if;
  end if;
  perform private.lms_forum_batas();
  insert into public.forum_balasan (topik_id, penulis_user, penulis_nama, penulis_peran, isi, induk_id, balas_ke, gambar)
  values (p_topik, auth.uid(), private.lms_nama_saya(),
          case when private.lms_kelola(f.kelas_ajar_id) then 'guru' else 'siswa' end, btrim(p_isi), v_induk, v_nama,
          private.forum_gambar_sah(p_gambar, f.kelas_ajar_id))
  returning id into v_id;
  return v_id;
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.proname like 'lms\_forum\_%'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

-- Fungsi bantu pada kebijakan penyimpanan harus bisa dipanggil peran authenticated.
revoke all on function private.forum_gambar_boleh(text, boolean), private.forum_gambar_sah(text, uuid) from public, anon;
grant execute on function private.forum_gambar_boleh(text, boolean), private.forum_gambar_sah(text, uuid) to authenticated;
