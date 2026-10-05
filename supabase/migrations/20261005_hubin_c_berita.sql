-- Modul Hubungan Industri dan Humas, bagian C: portal berita dan publikasi kegiatan.
-- Menulis dan mengajukan: izin hubin.tulis_berita. Menerbitkan, mengarsipkan, dan mengubah berita terbit: izin hubin.kelola_humas.
-- Tabel tanpa kebijakan. Semua akses lewat fungsi. Tidak ada penghapusan permanen, berita yang ditarik berstatus diarsipkan.

create table if not exists public.berita (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah (npsn),
  slug text not null unique,
  judul text not null check (char_length(btrim(judul)) between 5 and 150),
  kategori text not null check (kategori in ('kegiatan','prestasi','pengumuman','kemitraan','akademik','lainnya')),
  ringkasan text check (char_length(ringkasan) <= 300),
  isi text not null check (char_length(isi) between 20 and 30000),
  gambar_url text check (gambar_url is null or gambar_url ~* '^https://'),
  gambar_keterangan text check (char_length(gambar_keterangan) <= 200),
  status text not null default 'draf' check (status in ('draf','diajukan','terbit','diarsipkan')),
  unggulan boolean not null default false,
  terbit_pada timestamptz,
  penulis_user uuid not null,
  penulis_nama text not null default '',
  diterbitkan_oleh uuid,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);
alter table public.berita enable row level security;
create index if not exists berita_terbit_idx on public.berita (status, terbit_pada desc);
create index if not exists berita_penulis_idx on public.berita (penulis_user);

create or replace function private.boleh_terbitkan_berita() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and private.punya_izin('hubin.kelola_humas', null)
$$;
create or replace function private.boleh_tulis_berita() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (private.punya_izin('hubin.tulis_berita', null) or private.punya_izin('hubin.kelola_humas', null))
$$;

create or replace function public.berita_boleh() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('tulis', private.boleh_tulis_berita(), 'terbitkan', private.boleh_terbitkan_berita())
$$;

-- Daftar untuk penulis dan penerbit. Isi lengkap tidak ikut, diambil lewat berita_ambil.
create or replace function public.berita_kelola_daftar(p_status text default 'semua') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_terbit boolean := private.boleh_terbitkan_berita();
begin
  if not private.boleh_tulis_berita() then raise exception 'Anda tidak berwenang mengelola berita.'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'slug', b.slug, 'judul', b.judul, 'kategori', b.kategori, 'ringkasan', b.ringkasan, 'status', b.status,
      'unggulan', b.unggulan, 'terbit_pada', b.terbit_pada, 'penulis_nama', b.penulis_nama,
      'dibuat_pada', b.dibuat_pada, 'diperbarui_pada', b.diperbarui_pada,
      'bisa_ubah', v_terbit or (b.penulis_user = auth.uid() and b.status in ('draf','diajukan'))
    ) order by b.diperbarui_pada desc), '[]'::jsonb)
    from public.berita b
    where b.npsn = private.npsn_saya() and (coalesce(p_status, 'semua') = 'semua' or b.status = p_status)
  );
end $$;

create or replace function public.berita_ambil(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_hasil jsonb;
begin
  if not private.boleh_tulis_berita() then raise exception 'Anda tidak berwenang mengelola berita.'; end if;
  select to_jsonb(b) - array['npsn','penulis_user','diterbitkan_oleh'] into v_hasil
    from public.berita b where b.id = p_id and b.npsn = private.npsn_saya();
  return v_hasil;
end $$;

create or replace function public.berita_simpan(p_id uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_terbit boolean := private.boleh_terbitkan_berita();
  v_status text := coalesce(nullif(p_data ->> 'status', ''), 'draf');
  v_judul text := btrim(coalesce(p_data ->> 'judul', ''));
  v_id uuid := p_id;
  v_slug text;
  b public.berita;
begin
  if not private.boleh_tulis_berita() then raise exception 'Anda tidak berwenang mengelola berita.'; end if;
  if v_status not in ('draf','diajukan','terbit','diarsipkan') then raise exception 'Status berita tidak dikenal.'; end if;
  if not v_terbit and v_status not in ('draf','diajukan') then raise exception 'Hanya Waka Hubinmas yang dapat menerbitkan atau mengarsipkan berita.'; end if;

  if p_id is not null then
    select * into b from public.berita where id = p_id and npsn = private.npsn_saya();
    if b.id is null then raise exception 'Berita tidak ditemukan.'; end if;
    if not v_terbit and (b.penulis_user <> auth.uid() or b.status not in ('draf','diajukan')) then
      raise exception 'Anda hanya dapat mengubah draf milik sendiri yang belum terbit.';
    end if;
    update public.berita set
      judul = v_judul, kategori = p_data ->> 'kategori',
      ringkasan = nullif(btrim(p_data ->> 'ringkasan'), ''), isi = btrim(coalesce(p_data ->> 'isi', '')),
      gambar_url = nullif(btrim(p_data ->> 'gambar_url'), ''), gambar_keterangan = nullif(btrim(p_data ->> 'gambar_keterangan'), ''),
      unggulan = case when v_terbit then coalesce((p_data ->> 'unggulan')::boolean, false) else unggulan end,
      status = v_status,
      terbit_pada = case when v_status = 'terbit' then coalesce(terbit_pada, now()) else terbit_pada end,
      diterbitkan_oleh = case when v_status = 'terbit' then coalesce(diterbitkan_oleh, auth.uid()) else diterbitkan_oleh end,
      diperbarui_pada = now()
    where id = p_id;
  else
    v_id := gen_random_uuid();
    v_slug := trim(both '-' from regexp_replace(lower(v_judul), '[^a-z0-9]+', '-', 'g'));
    v_slug := left(case when v_slug = '' then 'berita' else v_slug end, 60) || '-' || substr(replace(v_id::text, '-', ''), 1, 6);
    insert into public.berita (id, npsn, slug, judul, kategori, ringkasan, isi, gambar_url, gambar_keterangan, status, unggulan,
                               terbit_pada, penulis_user, penulis_nama, diterbitkan_oleh)
    values (v_id, private.npsn_saya(), v_slug, v_judul, p_data ->> 'kategori',
            nullif(btrim(p_data ->> 'ringkasan'), ''), btrim(coalesce(p_data ->> 'isi', '')),
            nullif(btrim(p_data ->> 'gambar_url'), ''), nullif(btrim(p_data ->> 'gambar_keterangan'), ''), v_status,
            v_terbit and coalesce((p_data ->> 'unggulan')::boolean, false),
            case when v_status = 'terbit' then now() end, auth.uid(),
            coalesce(public.nama_saya(), 'Tim Humas'), case when v_status = 'terbit' then auth.uid() end);
  end if;
  return v_id;
exception
  when check_violation or not_null_violation then
    raise exception 'Isian belum valid. Judul 5 sampai 150 huruf, isi minimal 20 huruf, ringkasan maksimal 300 huruf, gambar harus tautan https.';
end $$;

-- Pindah status cepat: ajukan, tarik ke draf, terbitkan, arsipkan.
create or replace function public.berita_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_terbit boolean := private.boleh_terbitkan_berita();
  b public.berita;
begin
  if not private.boleh_tulis_berita() then raise exception 'Anda tidak berwenang mengelola berita.'; end if;
  if p_status not in ('draf','diajukan','terbit','diarsipkan') then raise exception 'Status berita tidak dikenal.'; end if;
  select * into b from public.berita where id = p_id and npsn = private.npsn_saya();
  if b.id is null then raise exception 'Berita tidak ditemukan.'; end if;
  if not v_terbit then
    if b.penulis_user <> auth.uid() or b.status not in ('draf','diajukan') or p_status not in ('draf','diajukan') then
      raise exception 'Hanya Waka Hubinmas yang dapat menerbitkan atau mengarsipkan berita.';
    end if;
  end if;
  update public.berita set
    status = p_status,
    terbit_pada = case when p_status = 'terbit' then coalesce(terbit_pada, now()) else terbit_pada end,
    diterbitkan_oleh = case when p_status = 'terbit' then coalesce(diterbitkan_oleh, auth.uid()) else diterbitkan_oleh end,
    diperbarui_pada = now()
  where id = p_id;
end $$;

revoke all on function public.berita_boleh() from public, anon;
revoke all on function public.berita_kelola_daftar(text) from public, anon;
revoke all on function public.berita_ambil(uuid) from public, anon;
revoke all on function public.berita_simpan(uuid, jsonb) from public, anon;
revoke all on function public.berita_status(uuid, text) from public, anon;
grant execute on function public.berita_boleh() to authenticated;
grant execute on function public.berita_kelola_daftar(text) to authenticated;
grant execute on function public.berita_ambil(uuid) to authenticated;
grant execute on function public.berita_simpan(uuid, jsonb) to authenticated;
grant execute on function public.berita_status(uuid, text) to authenticated;

-- Situs publik: hanya berita terbit. Tanpa nama penulis.
create or replace function public.berita_publik(p_kategori text default null, p_batas int default 12, p_mulai int default 0) returns jsonb
language sql stable security definer set search_path = '' as $$
  with b as (
    select * from public.berita
     where status = 'terbit' and terbit_pada <= now() and (p_kategori is null or p_kategori = '' or kategori = p_kategori)
  )
  select jsonb_build_object(
    'total', (select count(*) from b),
    'baris', (select coalesce(jsonb_agg(jsonb_build_object(
                'slug', x.slug, 'judul', x.judul, 'kategori', x.kategori, 'ringkasan', x.ringkasan,
                'gambar_url', x.gambar_url, 'terbit_pada', x.terbit_pada, 'unggulan', x.unggulan)), '[]'::jsonb)
               from (select * from b order by unggulan desc, terbit_pada desc
                      offset greatest(coalesce(p_mulai, 0), 0) limit least(greatest(coalesce(p_batas, 12), 1), 50)) x))
$$;

create or replace function public.berita_baca(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'slug', b.slug, 'judul', b.judul, 'kategori', b.kategori, 'ringkasan', b.ringkasan, 'isi', b.isi,
    'gambar_url', b.gambar_url, 'gambar_keterangan', b.gambar_keterangan, 'terbit_pada', b.terbit_pada,
    'lainnya', (select coalesce(jsonb_agg(jsonb_build_object('slug', o.slug, 'judul', o.judul, 'terbit_pada', o.terbit_pada)), '[]'::jsonb)
                  from (select slug, judul, terbit_pada from public.berita
                         where status = 'terbit' and terbit_pada <= now() and slug <> b.slug
                         order by (kategori = b.kategori) desc, terbit_pada desc limit 3) o))
  from public.berita b
  where b.slug = p_slug and b.status = 'terbit' and b.terbit_pada <= now()
$$;
revoke all on function public.berita_publik(text, int, int) from public;
revoke all on function public.berita_baca(text) from public;
grant execute on function public.berita_publik(text, int, int) to anon, authenticated;
grant execute on function public.berita_baca(text) to anon, authenticated;
