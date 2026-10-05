-- Ekstrakurikuler dan prestasi untuk situs publik.
-- Prestasi publik adalah daftar yang dikurasi Waka Kesiswaan: bisa ditulis langsung (termasuk prestasi GTK dan arsip situs lama)
-- atau diterbitkan dari prestasi siswa yang sudah terverifikasi. Nama siswa hanya tampil bila diisi di nama_tampil (butuh persetujuan).
-- Tabel tanpa policy, akses lewat fungsi security definer.

create table if not exists public.prestasi_publik (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah (npsn),
  judul text not null check (char_length(judul) between 3 and 200),
  kategori text not null check (kategori in ('siswa', 'gtk')),
  bidang text not null default 'lainnya' check (bidang in ('akademik', 'olahraga', 'seni', 'keterampilan_kejuruan', 'keagamaan', 'organisasi', 'lainnya')),
  tingkat text not null check (tingkat in ('sekolah', 'kecamatan', 'kabupaten', 'provinsi', 'nasional', 'internasional')),
  peringkat text check (peringkat is null or char_length(peringkat) <= 60),
  penyelenggara text check (penyelenggara is null or char_length(penyelenggara) <= 150),
  tahun int not null check (tahun between 2000 and 2100),
  nama_tampil text check (nama_tampil is null or char_length(nama_tampil) <= 150),
  deskripsi text check (deskripsi is null or char_length(deskripsi) <= 500),
  tampil boolean not null default true,
  sumber_prestasi_id uuid unique references public.prestasi_siswa (id),
  dihapus boolean not null default false,
  dibuat_oleh uuid,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);
alter table public.prestasi_publik enable row level security;
create index if not exists prestasi_publik_tampil_idx on public.prestasi_publik (tahun desc, dibuat_pada desc) where tampil and not dihapus;

-- ---------------------------------------------------------------- publik (anon)
create or replace function public.prestasi_publik_daftar() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'judul', p.judul, 'kategori', p.kategori, 'bidang', p.bidang, 'tingkat', p.tingkat,
    'peringkat', p.peringkat, 'penyelenggara', p.penyelenggara, 'tahun', p.tahun,
    'nama', p.nama_tampil, 'deskripsi', p.deskripsi
  ) order by p.tahun desc,
             case p.tingkat when 'internasional' then 1 when 'nasional' then 2 when 'provinsi' then 3 when 'kabupaten' then 4 when 'kecamatan' then 5 else 6 end,
             p.dibuat_pada desc), '[]'::jsonb)
    from public.prestasi_publik p
   where p.tampil and not p.dihapus
$$;
revoke all on function public.prestasi_publik_daftar() from public;
grant execute on function public.prestasi_publik_daftar() to anon, authenticated;

create or replace function public.ekskul_publik() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'nama', e.nama, 'jenis', e.jenis, 'deskripsi', e.deskripsi, 'jadwal', e.jadwal, 'pembina', p.nama,
    'anggota', (select count(*) from public.ekskul_anggota a where a.ekskul_id = e.id and a.aktif)
  ) order by e.jenis, e.nama), '[]'::jsonb)
    from public.ekskul e
    left join public.ptk p on p.id = e.pembina_ptk_id
   where e.aktif
$$;
revoke all on function public.ekskul_publik() from public;
grant execute on function public.ekskul_publik() to anon, authenticated;

-- ---------------------------------------------------------------- kelola (Waka Kesiswaan dan super admin)
create or replace function private.boleh_prestasi_publik() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.kes_semua(array['kesiswaan.verifikasi'])
$$;

create or replace function public.prestasi_publik_kelola() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.boleh_prestasi_publik() then raise exception 'Hanya Waka Kesiswaan yang mengelola prestasi publik.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg((to_jsonb(p) - 'npsn' - 'dibuat_oleh') order by p.tahun desc, p.dibuat_pada desc), '[]'::jsonb)
            from public.prestasi_publik p
           where p.npsn = private.npsn_saya() and not p.dihapus);
end $$;

create or replace function public.prestasi_publik_calon() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.boleh_prestasi_publik() then raise exception 'Hanya Waka Kesiswaan yang mengelola prestasi publik.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', ps.id, 'nama_prestasi', ps.nama_prestasi, 'bidang', ps.bidang, 'tingkat', ps.tingkat, 'peringkat', ps.peringkat,
            'penyelenggara', ps.penyelenggara, 'tanggal', ps.tanggal, 'siswa', pd.nama) order by ps.tanggal desc), '[]'::jsonb)
            from public.prestasi_siswa ps
            join public.peserta_didik pd on pd.id = ps.peserta_didik_id
           where ps.npsn = private.npsn_saya() and ps.status = 'terverifikasi' and not ps.dihapus
             and not exists (select 1 from public.prestasi_publik pp where pp.sumber_prestasi_id = ps.id));
end $$;

create or replace function public.prestasi_publik_simpan(
  p_id uuid, p_judul text, p_kategori text, p_bidang text, p_tingkat text, p_peringkat text,
  p_penyelenggara text, p_tahun int, p_nama_tampil text, p_deskripsi text, p_tampil boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.boleh_prestasi_publik() then raise exception 'Hanya Waka Kesiswaan yang mengelola prestasi publik.' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.prestasi_publik (npsn, judul, kategori, bidang, tingkat, peringkat, penyelenggara, tahun, nama_tampil, deskripsi, tampil, dibuat_oleh)
    values (private.npsn_saya(), btrim(p_judul), p_kategori, coalesce(nullif(p_bidang, ''), 'lainnya'), p_tingkat,
            nullif(btrim(coalesce(p_peringkat, '')), ''), nullif(btrim(coalesce(p_penyelenggara, '')), ''), p_tahun,
            nullif(btrim(coalesce(p_nama_tampil, '')), ''), nullif(btrim(coalesce(p_deskripsi, '')), ''), coalesce(p_tampil, true), auth.uid())
    returning id into v_id;
  else
    update public.prestasi_publik set
      judul = btrim(p_judul), kategori = p_kategori, bidang = coalesce(nullif(p_bidang, ''), 'lainnya'), tingkat = p_tingkat,
      peringkat = nullif(btrim(coalesce(p_peringkat, '')), ''), penyelenggara = nullif(btrim(coalesce(p_penyelenggara, '')), ''), tahun = p_tahun,
      nama_tampil = nullif(btrim(coalesce(p_nama_tampil, '')), ''), deskripsi = nullif(btrim(coalesce(p_deskripsi, '')), ''),
      tampil = coalesce(p_tampil, true), diperbarui_pada = now()
     where id = p_id and npsn = private.npsn_saya() and not dihapus
     returning id into v_id;
    if v_id is null then raise exception 'Prestasi tidak ditemukan.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.prestasi_publik_hapus(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.boleh_prestasi_publik() then raise exception 'Hanya Waka Kesiswaan yang mengelola prestasi publik.' using errcode = '42501'; end if;
  update public.prestasi_publik set dihapus = true, tampil = false, diperbarui_pada = now()
   where id = p_id and npsn = private.npsn_saya() and not dihapus;
  if not found then raise exception 'Prestasi tidak ditemukan.'; end if;
end $$;

-- Menerbitkan prestasi siswa terverifikasi. Nama siswa tidak ikut tampil sampai diisi di nama_tampil.
create or replace function public.prestasi_publik_terbitkan(p_prestasi uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.boleh_prestasi_publik() then raise exception 'Hanya Waka Kesiswaan yang mengelola prestasi publik.' using errcode = '42501'; end if;
  if exists (select 1 from public.prestasi_publik where sumber_prestasi_id = p_prestasi) then raise exception 'Prestasi ini sudah pernah diterbitkan.'; end if;
  insert into public.prestasi_publik (npsn, judul, kategori, bidang, tingkat, peringkat, penyelenggara, tahun, sumber_prestasi_id, dibuat_oleh)
  select ps.npsn, ps.nama_prestasi, 'siswa', ps.bidang, ps.tingkat, ps.peringkat, ps.penyelenggara, extract(year from ps.tanggal)::int, ps.id, auth.uid()
    from public.prestasi_siswa ps
   where ps.id = p_prestasi and ps.npsn = private.npsn_saya() and ps.status = 'terverifikasi' and not ps.dihapus
  returning id into v_id;
  if v_id is null then raise exception 'Hanya prestasi terverifikasi yang dapat diterbitkan.'; end if;
  return v_id;
end $$;

revoke all on function public.prestasi_publik_kelola() from public;
revoke all on function public.prestasi_publik_calon() from public;
revoke all on function public.prestasi_publik_simpan(uuid, text, text, text, text, text, text, int, text, text, boolean) from public;
revoke all on function public.prestasi_publik_hapus(uuid) from public;
revoke all on function public.prestasi_publik_terbitkan(uuid) from public;
grant execute on function public.prestasi_publik_kelola() to authenticated;
grant execute on function public.prestasi_publik_calon() to authenticated;
grant execute on function public.prestasi_publik_simpan(uuid, text, text, text, text, text, text, int, text, text, boolean) to authenticated;
grant execute on function public.prestasi_publik_hapus(uuid) to authenticated;
grant execute on function public.prestasi_publik_terbitkan(uuid) to authenticated;

-- ---------------------------------------------------------------- data awal dari situs resmi lama (5 Okt 2026)
-- Periksa peringkat, penyelenggara, dan nama peraih sebelum dipakai sebagai arsip resmi.
insert into public.prestasi_publik (npsn, judul, kategori, bidang, tingkat, tahun)
select s.npsn, v.judul, v.kat, v.bid, v.tk, v.th
  from (select npsn from public.sekolah order by npsn limit 1) s,
       (values ('Enjoy Robotic (Enjoyboy) 2025', 'siswa', 'keterampilan_kejuruan', 'kabupaten', 2025),
               ('Guru Seni Terbaik', 'gtk', 'seni', 'sekolah', 2025),
               ('Pencak Silat Ganda Putra', 'siswa', 'olahraga', 'sekolah', 2025),
               ('Pakansari Open Championship', 'siswa', 'olahraga', 'sekolah', 2026),
               ('Kejuaraan Pencak Silat', 'siswa', 'olahraga', 'kabupaten', 2025)) as v (judul, kat, bid, tk, th)
 where not exists (select 1 from public.prestasi_publik x where x.judul = v.judul);

insert into public.ekskul (npsn, nama, jenis, deskripsi, pembina_ptk_id)
select s.npsn, v.nama, 'ekskul', v.d, (select p.id from public.ptk p where p.npsn = s.npsn and p.nama ilike v.pembina || '%' order by p.nama limit 1)
  from (select npsn from public.sekolah order by npsn limit 1) s,
       (values ('Marching Band', 'Ekstrakurikuler bidang seni dan budaya.', 'Yesri Hilal'),
               ('Dance', 'Ekstrakurikuler bidang seni dan budaya.', 'Yesri Hilal'),
               ('Bola Voli', 'Ekstrakurikuler bidang olahraga.', 'Kusno Rahayu')) as v (nama, d, pembina)
on conflict (npsn, nama) do nothing;

-- Fungsi kelola hanya untuk pengguna masuk (default Supabase memberi anon hak eksekusi).
revoke execute on function public.prestasi_publik_kelola() from anon;
revoke execute on function public.prestasi_publik_calon() from anon;
revoke execute on function public.prestasi_publik_hapus(uuid) from anon;
revoke execute on function public.prestasi_publik_terbitkan(uuid) from anon;
revoke execute on function public.prestasi_publik_simpan(uuid, text, text, text, text, text, text, int, text, text, boolean) from anon;
