-- Penyimpanan gambar: logo sekolah, sampul dan galeri selayang pandang, gambar berita, foto profil.
-- Dua bucket. "publik": dibaca siapa saja lewat tautan (logo, sampul, galeri, gambar berita). "privat": hanya lewat tautan bertanda tangan
-- (foto profil siswa, guru, staf, pengelola, orang tua). Semua gambar diperkecil menjadi WebP di browser sebelum diunggah, maksimal 2 MB.
--
-- Struktur folder (nama berkas selalu unik agar tidak tertahan cache):
--   publik/sekolah/{npsn}/logo/logo-{tahun}-{kode}.webp
--   publik/sekolah/{npsn}/selayang-pandang/sampul-{kode}.webp
--   publik/sekolah/{npsn}/galeri/{tahun}/{kode}.webp
--   publik/berita/{tahun}/{user_id penulis}/{kode}.webp
--   privat/profil/{user_id}/foto-{kode}.webp

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('publik', 'publik', true, 2097152, array['image/webp', 'image/jpeg', 'image/png']),
  ('privat', 'privat', false, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Kolom penunjuk berkas.
alter table public.profil_sekolah_manual add column if not exists logo_path text check (logo_path is null or logo_path ~ '^sekolah/[0-9]+/logo/[A-Za-z0-9._-]+$');
alter table public.profil_sekolah_manual add column if not exists sampul_path text check (sampul_path is null or sampul_path ~ '^sekolah/[0-9]+/selayang-pandang/[A-Za-z0-9._-]+$');
alter table public.berita add column if not exists gambar_path text check (gambar_path is null or gambar_path ~ '^berita/[0-9]{4}/[0-9a-f-]{36}/[A-Za-z0-9._-]+$');
alter table public.profil_pengguna add column if not exists foto_path text check (foto_path is null or foto_path ~ '^profil/[0-9a-f-]{36}/[A-Za-z0-9._-]+$');

-- Galeri selayang pandang.
create table if not exists public.galeri_sekolah (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah (npsn),
  path text not null unique check (path ~ '^sekolah/[0-9]+/galeri/[0-9]{4}/[A-Za-z0-9._-]+$'),
  keterangan text check (char_length(keterangan) <= 200),
  urutan int not null default 0,
  dibuat_pada timestamptz not null default now(),
  dibuat_oleh uuid
);
alter table public.galeri_sekolah enable row level security;
-- Super admin dan pemegang izin hubin.kelola_profil (Waka Hubin, Pengelola Web dan Digitalisasi) mengelola gambar sekolah.
create or replace function private.boleh_kelola_gambar_sekolah() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (private.adalah_super() or private.punya_izin('hubin.kelola_profil', null))
$$;

drop policy if exists galeri_super on public.galeri_sekolah;
drop policy if exists galeri_kelola on public.galeri_sekolah;
create policy galeri_kelola on public.galeri_sekolah for all to authenticated
  using (npsn = (select private.npsn_saya()) and (select private.boleh_kelola_gambar_sekolah()))
  with check (npsn = (select private.npsn_saya()) and (select private.boleh_kelola_gambar_sekolah()));

create or replace function public.galeri_sekolah_publik() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('path', g.path, 'keterangan', g.keterangan) order by g.urutan, g.dibuat_pada desc), '[]'::jsonb)
  from public.galeri_sekolah g
$$;
revoke all on function public.galeri_sekolah_publik() from public;
grant execute on function public.galeri_sekolah_publik() to anon, authenticated;

-- Foto profil: pemilik menyimpan penunjuk berkasnya sendiri. Pengaturan hanya boleh menunjuk folder miliknya.
create or replace function public.foto_saya_simpan(p_path text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Belum masuk.'; end if;
  if p_path is not null and p_path !~ ('^profil/' || auth.uid()::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Lokasi foto tidak valid.';
  end if;
  update public.profil_pengguna set foto_path = p_path where user_id = auth.uid();
end $$;
revoke all on function public.foto_saya_simpan(text) from public;
grant execute on function public.foto_saya_simpan(text) to authenticated;

-- Pemilik foto, super admin, dan staf sekolah yang sama boleh melihat foto privat.
create or replace function private.boleh_lihat_foto(p_pemilik text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    p_pemilik = auth.uid()::text
    or private.adalah_super()
    or exists (
      select 1 from public.profil_pengguna me join public.profil_pengguna t on t.npsn = me.npsn
       where me.user_id = auth.uid() and me.peran in ('guru', 'staf', 'admin_tu') and t.user_id::text = p_pemilik)
  )
$$;

-- Kebijakan objek penyimpanan. Gambar sekolah: super admin atau pemegang hubin.kelola_profil.
drop policy if exists publik_sekolah_kelola on storage.objects;
create policy publik_sekolah_kelola on storage.objects for all to authenticated
  using (bucket_id = 'publik' and (storage.foldername(name))[1] = 'sekolah' and (storage.foldername(name))[2] = (select private.npsn_saya()) and (select private.boleh_kelola_gambar_sekolah()))
  with check (bucket_id = 'publik' and (storage.foldername(name))[1] = 'sekolah' and (storage.foldername(name))[2] = (select private.npsn_saya()) and (select private.boleh_kelola_gambar_sekolah()));

drop policy if exists publik_berita_tulis on storage.objects;
create policy publik_berita_tulis on storage.objects for all to authenticated
  using (bucket_id = 'publik' and (storage.foldername(name))[1] = 'berita' and (storage.foldername(name))[3] = (select auth.uid())::text and (select private.boleh_tulis_berita()))
  with check (bucket_id = 'publik' and (storage.foldername(name))[1] = 'berita' and (storage.foldername(name))[3] = (select auth.uid())::text and (select private.boleh_tulis_berita()));

drop policy if exists privat_profil_milik on storage.objects;
create policy privat_profil_milik on storage.objects for all to authenticated
  using (bucket_id = 'privat' and (storage.foldername(name))[1] = 'profil' and (storage.foldername(name))[2] = (select auth.uid())::text)
  with check (bucket_id = 'privat' and (storage.foldername(name))[1] = 'profil' and (storage.foldername(name))[2] = (select auth.uid())::text);

drop policy if exists privat_profil_baca on storage.objects;
create policy privat_profil_baca on storage.objects for select to authenticated
  using (bucket_id = 'privat' and (storage.foldername(name))[1] = 'profil' and (select private.boleh_lihat_foto((storage.foldername(name))[2])));

-- Fungsi yang diperbarui agar membawa penunjuk berkas.
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
      gambar_url = nullif(btrim(p_data ->> 'gambar_url'), ''), gambar_path = nullif(btrim(p_data ->> 'gambar_path'), ''), gambar_keterangan = nullif(btrim(p_data ->> 'gambar_keterangan'), ''),
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
    insert into public.berita (id, npsn, slug, judul, kategori, ringkasan, isi, gambar_url, gambar_path, gambar_keterangan, status, unggulan,
                               terbit_pada, penulis_user, penulis_nama, diterbitkan_oleh)
    values (v_id, private.npsn_saya(), v_slug, v_judul, p_data ->> 'kategori',
            nullif(btrim(p_data ->> 'ringkasan'), ''), btrim(coalesce(p_data ->> 'isi', '')),
            nullif(btrim(p_data ->> 'gambar_url'), ''), nullif(btrim(p_data ->> 'gambar_path'), ''), nullif(btrim(p_data ->> 'gambar_keterangan'), ''), v_status,
            v_terbit and coalesce((p_data ->> 'unggulan')::boolean, false),
            case when v_status = 'terbit' then now() end, auth.uid(),
            coalesce(public.nama_saya(), 'Tim Humas'), case when v_status = 'terbit' then auth.uid() end);
  end if;
  return v_id;
exception
  when check_violation or not_null_violation then
    raise exception 'Isian belum valid. Judul 5 sampai 150 huruf, isi minimal 20 huruf, ringkasan maksimal 300 huruf, gambar harus berkas unggahan.';
end $$;

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
                'gambar_url', x.gambar_url, 'gambar_path', x.gambar_path, 'terbit_pada', x.terbit_pada, 'unggulan', x.unggulan)), '[]'::jsonb)
               from (select * from b order by unggulan desc, terbit_pada desc
                      offset greatest(coalesce(p_mulai, 0), 0) limit least(greatest(coalesce(p_batas, 12), 1), 50)) x))
$$;

create or replace function public.berita_baca(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'slug', b.slug, 'judul', b.judul, 'kategori', b.kategori, 'ringkasan', b.ringkasan, 'isi', b.isi,
    'gambar_url', b.gambar_url, 'gambar_path', b.gambar_path, 'gambar_keterangan', b.gambar_keterangan, 'terbit_pada', b.terbit_pada,
    'lainnya', (select coalesce(jsonb_agg(jsonb_build_object('slug', o.slug, 'judul', o.judul, 'terbit_pada', o.terbit_pada)), '[]'::jsonb)
                  from (select slug, judul, terbit_pada from public.berita
                         where status = 'terbit' and terbit_pada <= now() and slug <> b.slug
                         order by (kategori = b.kategori) desc, terbit_pada desc limit 3) o))
  from public.berita b
  where b.slug = p_slug and b.status = 'terbit' and b.terbit_pada <= now()
$$;

create or replace function public.profil_sekolah_publik()
returns jsonb language sql security definer stable set search_path = '' as $$
  select jsonb_build_object(
    'npsn', s.npsn, 'logo_path', nullif(p.logo_path, ''), 'sampul_path', nullif(p.sampul_path, ''),
    'nama', s.nama,
    'singkatan', nullif(p.singkatan, ''),
    'slogan', nullif(p.slogan, ''),
    'tentang', nullif(p.tentang, ''),
    'visi', nullif(p.visi, ''),
    'misi', nullif(p.misi, ''),
    'sejarah', nullif(p.sejarah, ''),
    'akreditasi', nullif(p.akreditasi, ''),
    'tahun_berdiri', p.tahun_berdiri,
    'jenjang', s.jenjang,
    'status_sekolah', s.status_sekolah,
    'alamat', coalesce(nullif(p.alamat_tampil, ''), nullif(concat_ws(', ',
        nullif(s.alamat, ''),
        case when coalesce(s.rt, '') <> '' or coalesce(s.rw, '') <> '' then 'RT ' || coalesce(s.rt, '-') || ' RW ' || coalesce(s.rw, '-') end,
        nullif(s.kelurahan, ''), nullif(s.kecamatan, ''), nullif(s.kabupaten_kota, ''), nullif(s.provinsi, ''), nullif(s.kode_pos, '')), '')),
    'kecamatan', s.kecamatan,
    'kabupaten_kota', s.kabupaten_kota,
    'provinsi', s.provinsi,
    'telepon', coalesce(nullif(p.telepon, ''), nullif(s.telepon, '')),
    'email', coalesce(nullif(p.email, ''), nullif(s.email, '')),
    'website', coalesce(nullif(p.website, ''), nullif(s.website, '')),
    'whatsapp', nullif(p.whatsapp, ''),
    'jam_layanan', nullif(p.jam_layanan, ''),
    'lintang', coalesce(p.lintang, s.lintang),
    'bujur', coalesce(p.bujur, s.bujur),
    'instagram', p.instagram, 'facebook', p.facebook, 'youtube', p.youtube, 'tiktok', p.tiktok, 'x_twitter', p.x_twitter
  )
  from public.sekolah s
  left join public.profil_sekolah_manual p on p.npsn = s.npsn
  order by s.diperbarui_pada desc nulls last
  limit 1
$$;

revoke all on function public.berita_simpan(uuid, jsonb) from public;
grant execute on function public.berita_simpan(uuid, jsonb) to authenticated;
revoke all on function public.berita_publik(text, int, int) from public;
revoke all on function public.berita_baca(text) from public;
grant execute on function public.berita_publik(text, int, int) to anon, authenticated;
grant execute on function public.berita_baca(text) to anon, authenticated;
revoke all on function public.profil_sekolah_publik() from public;
grant execute on function public.profil_sekolah_publik() to anon, authenticated;
