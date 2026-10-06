-- Redaksi berita, tahap 2: tag, tema (liputan khusus), subjudul, byline, galeri foto, unggah foto, pencarian.
-- Hak menulis dan menerbitkan tidak berubah (lihat 20261005_hubin_c_berita.sql).
-- Berkas satu gambar sampul memakai gambar_path dari 20261008_penyimpanan_gambar.sql. Foto tambahan disimpan di bucket "publik",
-- jalur berita/{tahun}/{id penulis}/, memakai kebijakan publik_berita_tulis yang sudah ada. Berkas ini harus berjalan SETELAH 20261008_penyimpanan_gambar.sql,
-- karena fungsi di bawah menggantikan versi di sana dan tetap membawa gambar_path.

alter table public.berita add column if not exists gambar_path text
  check (gambar_path is null or gambar_path ~ '^berita/[0-9]{4}/[0-9a-f-]{36}/[A-Za-z0-9._-]+$');

alter table public.berita
  add column if not exists subjudul text,
  add column if not exists tema text,
  add column if not exists tag text[] not null default '{}',
  add column if not exists byline text,
  add column if not exists kredit_foto text,
  add column if not exists foto jsonb not null default '[]'::jsonb;

alter table public.berita drop constraint if exists berita_gambar_url_check;
alter table public.berita add constraint berita_gambar_url_check
  check (gambar_url is null or gambar_url ~* '^https://' or gambar_url ~ '^/[A-Za-z0-9]');
alter table public.berita add constraint berita_subjudul_check check (char_length(subjudul) <= 200);
alter table public.berita add constraint berita_tema_check check (char_length(tema) <= 60);
alter table public.berita add constraint berita_byline_check check (char_length(byline) <= 80);
alter table public.berita add constraint berita_kredit_foto_check check (char_length(kredit_foto) <= 80);
alter table public.berita add constraint berita_tag_check check (cardinality(tag) <= 8);
alter table public.berita add constraint berita_foto_check check (jsonb_typeof(foto) = 'array' and jsonb_array_length(foto) <= 12);
create index if not exists berita_tag_idx on public.berita using gin (tag);
create index if not exists berita_tema_idx on public.berita (tema) where tema is not null;

-- Penyaring isian: tag huruf kecil tanpa spasi ganda, unik, maksimal 8, tiap tag 2 sampai 30 huruf.
create or replace function private.bersihkan_tag(p jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array(
    select t from (
      select t, min(o) as urut from (
        select left(regexp_replace(lower(btrim(x)), '\s+', ' ', 'g'), 30) as t, o
          from jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality as e(x, o)
      ) a where char_length(t) >= 2 group by t
    ) b order by urut limit 8
  ), '{}'::text[])
$$;

-- Foto galeri: hanya tautan https atau jalur lokal, keterangan dipangkas.
create or replace function private.bersihkan_foto(p jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('url', u, 'keterangan', k) order by o), '[]'::jsonb)
  from (
    select o, btrim(e ->> 'url') as u, left(coalesce(btrim(e ->> 'keterangan'), ''), 200) as k
      from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality as t(e, o)
     where o <= 12
  ) s
  where u ~* '^https://' or u ~ '^/[A-Za-z0-9]'
$$;

create or replace function public.berita_simpan(p_id uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_terbit boolean := private.boleh_terbitkan_berita();
  v_status text := coalesce(nullif(p_data ->> 'status', ''), 'draf');
  v_judul text := btrim(coalesce(p_data ->> 'judul', ''));
  v_tag text[] := private.bersihkan_tag(p_data -> 'tag');
  v_foto jsonb := private.bersihkan_foto(p_data -> 'foto');
  v_id uuid := p_id;
  v_slug text;
  b public.berita;
begin
  if not private.boleh_tulis_berita() then raise exception 'Anda tidak berwenang mengelola berita.'; end if;
  if v_status not in ('draf','diajukan','terbit','diarsipkan') then raise exception 'Status berita tidak dikenal.'; end if;
  if not v_terbit and v_status not in ('draf','diajukan') then raise exception 'Hanya Waka Hubinmas atau Pengelola Web yang dapat menerbitkan atau mengarsipkan berita.'; end if;

  if p_id is not null then
    select * into b from public.berita where id = p_id and npsn = private.npsn_saya();
    if b.id is null then raise exception 'Berita tidak ditemukan.'; end if;
    if not v_terbit and (b.penulis_user <> auth.uid() or b.status not in ('draf','diajukan')) then
      raise exception 'Anda hanya dapat mengubah draf milik sendiri yang belum terbit.';
    end if;
    update public.berita set
      judul = v_judul, kategori = p_data ->> 'kategori',
      subjudul = nullif(btrim(p_data ->> 'subjudul'), ''),
      ringkasan = nullif(btrim(p_data ->> 'ringkasan'), ''), isi = btrim(coalesce(p_data ->> 'isi', '')),
      tema = nullif(btrim(p_data ->> 'tema'), ''), tag = v_tag, foto = v_foto,
      byline = nullif(btrim(p_data ->> 'byline'), ''), kredit_foto = nullif(btrim(p_data ->> 'kredit_foto'), ''),
      gambar_url = nullif(btrim(p_data ->> 'gambar_url'), ''), gambar_path = nullif(btrim(p_data ->> 'gambar_path'), ''),
      gambar_keterangan = nullif(btrim(p_data ->> 'gambar_keterangan'), ''),
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
    insert into public.berita (id, npsn, slug, judul, subjudul, kategori, ringkasan, isi, tema, tag, foto, byline, kredit_foto,
                               gambar_url, gambar_path, gambar_keterangan, status, unggulan, terbit_pada, penulis_user, penulis_nama, diterbitkan_oleh)
    values (v_id, private.npsn_saya(), v_slug, v_judul, nullif(btrim(p_data ->> 'subjudul'), ''), p_data ->> 'kategori',
            nullif(btrim(p_data ->> 'ringkasan'), ''), btrim(coalesce(p_data ->> 'isi', '')),
            nullif(btrim(p_data ->> 'tema'), ''), v_tag, v_foto,
            nullif(btrim(p_data ->> 'byline'), ''), nullif(btrim(p_data ->> 'kredit_foto'), ''),
            nullif(btrim(p_data ->> 'gambar_url'), ''), nullif(btrim(p_data ->> 'gambar_path'), ''), nullif(btrim(p_data ->> 'gambar_keterangan'), ''), v_status,
            v_terbit and coalesce((p_data ->> 'unggulan')::boolean, false),
            case when v_status = 'terbit' then now() end, auth.uid(),
            coalesce(public.nama_saya(), 'Tim Humas'), case when v_status = 'terbit' then auth.uid() end);
  end if;
  return v_id;
exception
  when check_violation or not_null_violation then
    raise exception 'Isian belum valid. Judul 5 sampai 150 huruf, isi minimal 20 huruf, ringkasan maksimal 300 huruf, tag maksimal 8, foto maksimal 12.';
end $$;

-- Daftar kelola: tambah gambar kecil dan tag agar penulis mengenali beritanya.
create or replace function public.berita_kelola_daftar(p_status text default 'semua') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_terbit boolean := private.boleh_terbitkan_berita();
begin
  if not private.boleh_tulis_berita() then raise exception 'Anda tidak berwenang mengelola berita.'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'slug', b.slug, 'judul', b.judul, 'kategori', b.kategori, 'ringkasan', b.ringkasan, 'status', b.status,
      'unggulan', b.unggulan, 'terbit_pada', b.terbit_pada, 'penulis_nama', b.penulis_nama, 'gambar_url', b.gambar_url, 'gambar_path', b.gambar_path,
      'tema', b.tema, 'tag', b.tag,
      'dibuat_pada', b.dibuat_pada, 'diperbarui_pada', b.diperbarui_pada,
      'bisa_ubah', v_terbit or (b.penulis_user = auth.uid() and b.status in ('draf','diajukan'))
    ) order by b.diperbarui_pada desc), '[]'::jsonb)
    from public.berita b
    where b.npsn = private.npsn_saya() and (coalesce(p_status, 'semua') = 'semua' or b.status = p_status)
  );
end $$;

-- Saran tag dan tema untuk penulis: yang sudah dipakai berita lain, paling sering di atas.
create or replace function public.berita_saran() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.boleh_tulis_berita() then raise exception 'Anda tidak berwenang mengelola berita.'; end if;
  return jsonb_build_object(
    'tag', (select coalesce(jsonb_agg(t order by n desc, t), '[]'::jsonb) from (
              select t, count(*) n from public.berita b, unnest(b.tag) t where b.npsn = private.npsn_saya() group by t limit 40) x),
    'tema', (select coalesce(jsonb_agg(t order by n desc, t), '[]'::jsonb) from (
              select tema as t, count(*) n from public.berita b where b.npsn = private.npsn_saya() and tema is not null group by tema limit 20) y));
end $$;

-- Situs publik.
-- Tanda tangan lama berita_publik(text, int, int) dibiarkan agar situs lama tetap jalan; klien baru selalu mengirim keenam argumen.
create or replace function public.berita_publik(
  p_kategori text, p_batas int, p_mulai int, p_tag text, p_tema text, p_cari text
) returns jsonb
language sql stable security definer set search_path = '' as $$
  with b as (
    select * from public.berita
     where status = 'terbit' and terbit_pada <= now()
       and (nullif(p_kategori, '') is null or kategori = p_kategori)
       and (nullif(p_tag, '') is null or lower(p_tag) = any (tag))
       and (nullif(p_tema, '') is null or tema = p_tema)
       and (nullif(btrim(p_cari), '') is null or judul ilike '%' || btrim(p_cari) || '%' or coalesce(ringkasan, '') ilike '%' || btrim(p_cari) || '%'
            or coalesce(subjudul, '') ilike '%' || btrim(p_cari) || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from b),
    'baris', (select coalesce(jsonb_agg(jsonb_build_object(
                'slug', x.slug, 'judul', x.judul, 'subjudul', x.subjudul, 'kategori', x.kategori, 'ringkasan', x.ringkasan,
                'gambar_url', x.gambar_url, 'gambar_path', x.gambar_path, 'terbit_pada', x.terbit_pada, 'unggulan', x.unggulan, 'tema', x.tema, 'tag', x.tag,
                'byline', x.byline) order by x.unggulan desc, x.terbit_pada desc), '[]'::jsonb)
               from (select * from b order by unggulan desc, terbit_pada desc
                      offset greatest(coalesce(p_mulai, 0), 0) limit least(greatest(coalesce(p_batas, 12), 1), 50)) x))
$$;

create or replace function public.berita_baca(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'slug', b.slug, 'judul', b.judul, 'subjudul', b.subjudul, 'kategori', b.kategori, 'ringkasan', b.ringkasan, 'isi', b.isi,
    'tema', b.tema, 'tag', b.tag, 'foto', b.foto, 'byline', b.byline, 'kredit_foto', b.kredit_foto,
    'gambar_url', b.gambar_url, 'gambar_path', b.gambar_path, 'gambar_keterangan', b.gambar_keterangan, 'terbit_pada', b.terbit_pada, 'diperbarui_pada', b.diperbarui_pada,
    'lainnya', (select coalesce(jsonb_agg(jsonb_build_object('slug', o.slug, 'judul', o.judul, 'terbit_pada', o.terbit_pada,
                                                              'gambar_url', o.gambar_url, 'gambar_path', o.gambar_path, 'kategori', o.kategori) order by o.sama desc, o.terbit_pada desc), '[]'::jsonb)
                  from (select slug, judul, terbit_pada, gambar_url, gambar_path, kategori,
                               (kategori = b.kategori or tag && b.tag or (tema is not null and tema = b.tema)) as sama
                          from public.berita
                         where status = 'terbit' and terbit_pada <= now() and slug <> b.slug
                         order by 7 desc, terbit_pada desc limit 4) o),
    'terbaru', (select coalesce(jsonb_agg(jsonb_build_object('slug', n.slug, 'judul', n.judul, 'terbit_pada', n.terbit_pada) order by n.terbit_pada desc), '[]'::jsonb)
                  from (select slug, judul, terbit_pada from public.berita
                         where status = 'terbit' and terbit_pada <= now() and slug <> b.slug order by terbit_pada desc limit 5) n))
  from public.berita b
  where b.slug = p_slug and b.status = 'terbit' and b.terbit_pada <= now()
$$;

-- Tag, tema, dan kategori yang punya berita terbit, untuk bilah samping dan penyaring.
create or replace function public.berita_penanda() returns jsonb
language sql stable security definer set search_path = '' as $$
  with t as (select * from public.berita where status = 'terbit' and terbit_pada <= now())
  select jsonb_build_object(
    'tag', (select coalesce(jsonb_agg(jsonb_build_object('nama', x.t, 'jumlah', x.n) order by x.n desc, x.t), '[]'::jsonb)
              from (select u as t, count(*) n from t, unnest(t.tag) u group by u order by 2 desc, 1 limit 24) x),
    'tema', (select coalesce(jsonb_agg(jsonb_build_object('nama', x.tema, 'jumlah', x.n) order by x.n desc, x.tema), '[]'::jsonb)
              from (select tema, count(*) n from t where tema is not null group by tema order by 2 desc, 1 limit 12) x),
    'kategori', (select coalesce(jsonb_agg(jsonb_build_object('nama', x.kategori, 'jumlah', x.n) order by x.n desc), '[]'::jsonb)
              from (select kategori, count(*) n from t group by kategori) x))
$$;

revoke all on function public.berita_saran() from public, anon;
revoke all on function public.berita_publik(text, int, int, text, text, text) from public;
revoke all on function public.berita_baca(text) from public;
revoke all on function public.berita_penanda() from public;
grant execute on function public.berita_saran() to authenticated;
grant execute on function public.berita_publik(text, int, int, text, text, text) to anon, authenticated;
grant execute on function public.berita_baca(text) to anon, authenticated;
grant execute on function public.berita_penanda() to anon, authenticated;
