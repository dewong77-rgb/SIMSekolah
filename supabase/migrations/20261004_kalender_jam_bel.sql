-- Kalender sekolah (kalender pendidikan, kegiatan, libur, ujian) dan jam bel (jam pelajaran).
-- Semua orang membaca lewat fungsi publik. Menulis lewat fungsi berizin; tabel tanpa policy.
-- Penghapusan agenda berupa arsip (dihapus_pada) agar bisa dipulihkan. Jam bel diganti dengan menonaktifkan baris lama.

create table if not exists public.kalender_kegiatan (
  id uuid primary key default gen_random_uuid(),
  judul text not null check (char_length(btrim(judul)) between 3 and 150),
  kategori text not null check (kategori in ('kalender_pendidikan','kegiatan','libur','ujian')),
  mulai date not null,
  selesai date not null,
  jam_mulai time,
  jam_selesai time,
  tempat text check (char_length(tempat) <= 150),
  keterangan text check (char_length(keterangan) <= 2000),
  tampil_beranda boolean not null default false,
  dibuat_oleh uuid default auth.uid(),
  dibuat_pada timestamptz not null default now(),
  diperbarui_oleh uuid,
  diperbarui_pada timestamptz not null default now(),
  dihapus_pada timestamptz,
  check (selesai >= mulai)
);
create index if not exists kalender_kegiatan_mulai_idx on public.kalender_kegiatan (mulai);
create index if not exists kalender_kegiatan_selesai_idx on public.kalender_kegiatan (selesai);
alter table public.kalender_kegiatan enable row level security;

create table if not exists public.jam_bel (
  id uuid primary key default gen_random_uuid(),
  kelompok text not null check (kelompok in ('senin_kamis','jumat')),
  urutan int not null check (urutan between 1 and 40),
  label text not null check (char_length(btrim(label)) between 1 and 40),
  jenis text not null default 'pelajaran' check (jenis in ('pelajaran','istirahat','lainnya')),
  mulai time not null,
  selesai time not null,
  aktif boolean not null default true,
  check (selesai > mulai),
  unique (kelompok, urutan)
);
alter table public.jam_bel enable row level security;

insert into public.izin (kode, nama, bidang) values ('kegiatan.kelola','Mengelola kegiatan di kalender sekolah','Kegiatan sekolah') on conflict (kode) do nothing;
insert into public.jabatan_izin (jabatan_kode, izin_kode)
select j, 'kegiatan.kelola' from unnest(array['kepala_sekolah','kepala_tu','waka_kurikulum','waka_kesiswaan','waka_sarpras','waka_hubin','staf_kurikulum','tu_persuratan','tu_kesiswaan','tu_kepegawaian']) j
on conflict do nothing;

-- Kategori yang boleh dikelola pengguna: kurikulum.kalender (atau super admin) semua, kegiatan.kelola hanya 'kegiatan'.
create or replace function private.kategori_kalender_boleh() returns text[]
language sql stable security definer set search_path = '' as $$
  select case
    when private.punya_izin('kurikulum.kalender', null) then array['kalender_pendidikan','kegiatan','libur','ujian']
    when private.punya_izin('kegiatan.kelola', null) then array['kegiatan']
    else array[]::text[] end
$$;
create or replace function public.kalender_boleh() returns text[]
language sql stable security definer set search_path = '' as $$ select private.kategori_kalender_boleh() $$;
create or replace function public.jam_bel_boleh() returns boolean
language sql stable security definer set search_path = '' as $$ select private.punya_izin('kurikulum.atur_jadwal', null) $$;

create or replace function public.kalender_publik(p_dari date, p_sampai date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.mulai, x.jam_mulai nulls first, x.judul), '[]'::jsonb)
  from (
    select id, judul, kategori, mulai, selesai,
           to_char(jam_mulai, 'HH24:MI') as jam_mulai, to_char(jam_selesai, 'HH24:MI') as jam_selesai,
           tempat, keterangan, tampil_beranda
      from public.kalender_kegiatan
     where dihapus_pada is null and selesai >= p_dari and mulai <= p_sampai
     order by mulai, jam_mulai nulls first, judul
     limit 1000
  ) x
$$;

create or replace function public.jam_bel_publik() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'kelompok', kelompok, 'urutan', urutan, 'label', label, 'jenis', jenis,
    'mulai', to_char(mulai, 'HH24:MI'), 'selesai', to_char(selesai, 'HH24:MI')) order by kelompok, mulai), '[]'::jsonb)
  from public.jam_bel where aktif
$$;

create or replace function public.kalender_simpan(p_id uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_boleh text[] := private.kategori_kalender_boleh();
  v_kat text := p_data->>'kategori';
  v_lama text;
  v_id uuid := p_id;
begin
  if auth.uid() is null then raise exception 'Perlu masuk terlebih dahulu.'; end if;
  if v_kat is null or not (v_kat = any (v_boleh)) then raise exception 'Anda tidak berwenang mengelola kategori ini.'; end if;
  if p_id is not null then
    select kategori into v_lama from public.kalender_kegiatan where id = p_id;
    if v_lama is null then raise exception 'Agenda tidak ditemukan.'; end if;
    if not (v_lama = any (v_boleh)) then raise exception 'Anda tidak berwenang mengubah agenda kategori ini.'; end if;
    update public.kalender_kegiatan set
      judul = btrim(p_data->>'judul'), kategori = v_kat,
      mulai = (p_data->>'mulai')::date, selesai = coalesce(nullif(p_data->>'selesai', ''), p_data->>'mulai')::date,
      jam_mulai = nullif(p_data->>'jam_mulai', '')::time, jam_selesai = nullif(p_data->>'jam_selesai', '')::time,
      tempat = nullif(btrim(p_data->>'tempat'), ''), keterangan = nullif(btrim(p_data->>'keterangan'), ''),
      tampil_beranda = coalesce((p_data->>'tampil_beranda')::boolean, false),
      diperbarui_oleh = auth.uid(), diperbarui_pada = now()
    where id = p_id;
  else
    insert into public.kalender_kegiatan (judul, kategori, mulai, selesai, jam_mulai, jam_selesai, tempat, keterangan, tampil_beranda)
    values (btrim(p_data->>'judul'), v_kat, (p_data->>'mulai')::date,
            coalesce(nullif(p_data->>'selesai', ''), p_data->>'mulai')::date,
            nullif(p_data->>'jam_mulai', '')::time, nullif(p_data->>'jam_selesai', '')::time,
            nullif(btrim(p_data->>'tempat'), ''), nullif(btrim(p_data->>'keterangan'), ''),
            coalesce((p_data->>'tampil_beranda')::boolean, false))
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.kalender_hapus(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_kat text;
begin
  select kategori into v_kat from public.kalender_kegiatan where id = p_id and dihapus_pada is null;
  if v_kat is null then return; end if;
  if not (v_kat = any (private.kategori_kalender_boleh())) then raise exception 'Anda tidak berwenang menghapus agenda kategori ini.'; end if;
  update public.kalender_kegiatan set dihapus_pada = now(), diperbarui_oleh = auth.uid(), diperbarui_pada = now() where id = p_id;
end $$;

create or replace function public.jam_bel_simpan(p_kelompok text, p_baris jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.punya_izin('kurikulum.atur_jadwal', null) then
    raise exception 'Anda tidak berwenang mengatur jam pelajaran.';
  end if;
  if p_kelompok not in ('senin_kamis', 'jumat') then raise exception 'Kelompok hari tidak dikenal.'; end if;
  if jsonb_typeof(p_baris) <> 'array' then raise exception 'Data jam tidak valid.'; end if;
  if jsonb_array_length(p_baris) > 40 then raise exception 'Terlalu banyak baris.'; end if;
  if exists (
    select 1 from (
      select a.mulai, lag(a.selesai) over (order by a.mulai) as sebelumnya
        from (select (e->>'mulai')::time as mulai, (e->>'selesai')::time as selesai from jsonb_array_elements(p_baris) e) a
    ) b where b.sebelumnya > b.mulai
  ) then raise exception 'Rentang waktu saling tumpang tindih.'; end if;
  update public.jam_bel set aktif = false where kelompok = p_kelompok;
  insert into public.jam_bel (kelompok, urutan, label, jenis, mulai, selesai, aktif)
  select p_kelompok, row_number() over (order by c.mulai), c.label, c.jenis, c.mulai, c.selesai, true
    from (select btrim(e->>'label') as label, coalesce(nullif(e->>'jenis', ''), 'pelajaran') as jenis,
                 (e->>'mulai')::time as mulai, (e->>'selesai')::time as selesai
            from jsonb_array_elements(p_baris) e) c
  on conflict (kelompok, urutan) do update
    set label = excluded.label, jenis = excluded.jenis, mulai = excluded.mulai, selesai = excluded.selesai, aktif = true;
end $$;

revoke all on function public.kalender_publik(date, date) from public;
revoke all on function public.jam_bel_publik() from public;
revoke all on function public.kalender_boleh() from public;
revoke all on function public.jam_bel_boleh() from public;
revoke all on function public.kalender_simpan(uuid, jsonb) from public;
revoke all on function public.kalender_hapus(uuid) from public;
revoke all on function public.jam_bel_simpan(text, jsonb) from public;
grant execute on function public.kalender_publik(date, date) to anon, authenticated;
grant execute on function public.jam_bel_publik() to anon, authenticated;
grant execute on function public.kalender_boleh() to authenticated;
grant execute on function public.jam_bel_boleh() to authenticated;
grant execute on function public.kalender_simpan(uuid, jsonb) to authenticated;
grant execute on function public.kalender_hapus(uuid) to authenticated;
grant execute on function public.jam_bel_simpan(text, jsonb) to authenticated;
