-- Modul Kesiswaan, bagian C: ekstrakurikuler dan organisasi siswa (OSIS, MPK).
-- Pembina memegang penugasan "pembina_ekskul" berlingkup nama ekskul, atau ditunjuk lewat kolom pembina_ptk_id.
-- Waka dan TU Kesiswaan (ekskul.kelola seluruh sekolah) mengatur daftar ekskul dan menunjuk pembina.

create table if not exists public.ekskul (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah (npsn),
  nama text not null check (char_length(nama) between 2 and 100),
  jenis text not null default 'ekskul' check (jenis in ('ekskul','organisasi')),
  deskripsi text check (deskripsi is null or char_length(deskripsi) <= 500),
  pembina_ptk_id uuid references public.ptk (id),
  jadwal text check (jadwal is null or char_length(jadwal) <= 150),
  aktif boolean not null default true,
  dibuat_pada timestamptz not null default now(),
  unique (npsn, nama)
);
alter table public.ekskul enable row level security;

create table if not exists public.ekskul_anggota (
  id uuid primary key default gen_random_uuid(),
  ekskul_id uuid not null references public.ekskul (id),
  peserta_didik_id uuid not null references public.peserta_didik (id),
  tahun_ajaran text not null,
  peran text not null default 'anggota' check (peran in ('anggota','ketua','wakil','sekretaris','bendahara','pengurus')),
  predikat text check (predikat is null or predikat in ('sangat_baik','baik','cukup','perlu_pembinaan')),
  catatan_nilai text check (catatan_nilai is null or char_length(catatan_nilai) <= 500),
  aktif boolean not null default true,
  dibuat_pada timestamptz not null default now(),
  unique (ekskul_id, peserta_didik_id, tahun_ajaran)
);
alter table public.ekskul_anggota enable row level security;
create index if not exists ekskul_anggota_pd_idx on public.ekskul_anggota (peserta_didik_id);

create table if not exists public.ekskul_pertemuan (
  id uuid primary key default gen_random_uuid(),
  ekskul_id uuid not null references public.ekskul (id),
  tanggal date not null,
  topik text check (topik is null or char_length(topik) <= 200),
  dicatat_oleh uuid,
  dibuat_pada timestamptz not null default now(),
  unique (ekskul_id, tanggal)
);
alter table public.ekskul_pertemuan enable row level security;

create table if not exists public.ekskul_kehadiran (
  pertemuan_id uuid not null references public.ekskul_pertemuan (id),
  anggota_id uuid not null references public.ekskul_anggota (id),
  hadir boolean not null,
  primary key (pertemuan_id, anggota_id)
);
alter table public.ekskul_kehadiran enable row level security;

insert into public.ekskul (npsn, nama, jenis, deskripsi)
select s.npsn, v.nama, 'organisasi', v.d
  from (select npsn from public.sekolah order by npsn limit 1) s,
  (values ('OSIS', 'Organisasi Siswa Intra Sekolah.'), ('MPK', 'Majelis Perwakilan Kelas.')) as v (nama, d)
on conflict (npsn, nama) do nothing;

-- Boleh mengelola satu ekskul: pemegang ekskul.kelola seluruh sekolah, pembina yang ditunjuk, atau pemegang penugasan berlingkup nama ekskul itu.
create or replace function private.kes_boleh_ekskul(p_ekskul uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.ekskul e
     where e.id = p_ekskul and e.npsn = private.npsn_saya()
       and (private.kes_semua(array['ekskul.kelola'])
            or (e.pembina_ptk_id is not null and e.pembina_ptk_id = private.ptk_id_saya())
            or private.punya_izin('ekskul.kelola', e.nama)
            or exists (
              select 1 from public.penugasan p join public.jabatan_izin ji on ji.jabatan_kode = p.jabatan_kode and ji.izin_kode = 'ekskul.kelola'
               where p.ptk_id = private.ptk_id_saya() and p.status = 'aktif' and p.tahun_ajaran = public.tahun_ajaran_sekarang()
                 and lower(btrim(p.lingkup_id)) = lower(btrim(e.nama))))
  )
$$;

-- Nama rombel kelas utama siswa (untuk tampilan).
create or replace function private.kes_rombel_nama(p_pd uuid) returns text
language sql stable security definer set search_path = '' as $$
  select r.nama from public.rombel r where r.id = private.kes_rombel_pd(p_pd)
$$;

create or replace function public.ekskul_daftar() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_semua boolean := private.kes_semua(array['ekskul.kelola']);
  v_ta text := public.tahun_ajaran_sekarang();
  v_ada boolean;
begin
  if auth.uid() is null then raise exception 'Silakan masuk terlebih dahulu.'; end if;
  select exists (select 1 from public.ekskul e where e.npsn = private.npsn_saya() and private.kes_boleh_ekskul(e.id)) into v_ada;
  if not (v_semua or v_ada) then raise exception 'Anda tidak berwenang membuka data ekstrakurikuler.'; end if;
  return jsonb_build_object(
    'bisa_atur', v_semua,
    'tahun_ajaran', v_ta,
    'ekskul', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'nama', e.nama, 'jenis', e.jenis, 'deskripsi', e.deskripsi, 'jadwal', e.jadwal, 'aktif', e.aktif,
        'pembina_ptk_id', e.pembina_ptk_id, 'pembina', p.nama,
        'anggota', (select count(*) from public.ekskul_anggota a where a.ekskul_id = e.id and a.tahun_ajaran = v_ta and a.aktif),
        'pertemuan', (select count(*) from public.ekskul_pertemuan t where t.ekskul_id = e.id and t.tanggal >= current_date - 120))
        order by e.jenis desc, e.nama), '[]'::jsonb)
        from public.ekskul e left join public.ptk p on p.id = e.pembina_ptk_id
       where e.npsn = private.npsn_saya() and (e.aktif or v_semua) and (v_semua or private.kes_boleh_ekskul(e.id))));
end $$;

create or replace function public.ekskul_simpan(p_id uuid, p_nama text, p_jenis text, p_deskripsi text default null,
                                                p_pembina_ptk uuid default null, p_jadwal text default null, p_aktif boolean default true) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_nama text := btrim(coalesce(p_nama, ''));
  v_id uuid := p_id;
begin
  if not private.kes_semua(array['ekskul.kelola']) then raise exception 'Hanya Waka atau TU Kesiswaan yang mengatur daftar ekstrakurikuler.'; end if;
  if char_length(v_nama) < 2 or char_length(v_nama) > 100 then raise exception 'Nama 2 sampai 100 karakter.'; end if;
  if p_jenis not in ('ekskul','organisasi') then raise exception 'Jenis harus ekskul atau organisasi.'; end if;
  if p_pembina_ptk is not null and not exists (select 1 from public.ptk where id = p_pembina_ptk and npsn = private.npsn_saya()) then
    raise exception 'Pembina tidak ditemukan.';
  end if;
  if v_id is null then
    insert into public.ekskul (npsn, nama, jenis, deskripsi, pembina_ptk_id, jadwal, aktif)
    values (private.npsn_saya(), v_nama, p_jenis, nullif(btrim(coalesce(p_deskripsi, '')), ''), p_pembina_ptk, nullif(btrim(coalesce(p_jadwal, '')), ''), coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.ekskul set nama = v_nama, jenis = p_jenis, deskripsi = nullif(btrim(coalesce(p_deskripsi, '')), ''), pembina_ptk_id = p_pembina_ptk,
           jadwal = nullif(btrim(coalesce(p_jadwal, '')), ''), aktif = coalesce(p_aktif, true)
     where id = v_id and npsn = private.npsn_saya();
    if not found then raise exception 'Ekstrakurikuler tidak ditemukan.'; end if;
  end if;
  perform private.kes_audit('ekskul', 'SIMPAN', jsonb_build_object('id', v_id, 'nama', v_nama, 'aktif', p_aktif));
  return v_id;
exception when unique_violation then
  raise exception 'Nama itu sudah dipakai.';
end $$;

create or replace function public.ekskul_detail(p_id uuid, p_ta text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ta text := coalesce(nullif(btrim(coalesce(p_ta, '')), ''), public.tahun_ajaran_sekarang());
  v_e public.ekskul%rowtype;
begin
  if auth.uid() is null or not private.kes_boleh_ekskul(p_id) then raise exception 'Anda tidak berwenang membuka ekstrakurikuler ini.'; end if;
  select * into v_e from public.ekskul where id = p_id;
  return jsonb_build_object(
    'id', v_e.id, 'nama', v_e.nama, 'jenis', v_e.jenis, 'deskripsi', v_e.deskripsi, 'jadwal', v_e.jadwal, 'tahun_ajaran', v_ta,
    'anggota', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'pd', a.peserta_didik_id, 'nama', pd.nama, 'nisn', pd.nisn, 'rombel', private.kes_rombel_nama(a.peserta_didik_id),
        'peran', a.peran, 'predikat', a.predikat, 'catatan_nilai', a.catatan_nilai, 'aktif', a.aktif,
        'hadir', (select count(*) from public.ekskul_kehadiran h join public.ekskul_pertemuan t on t.id = h.pertemuan_id
                   where h.anggota_id = a.id and h.hadir and t.tanggal >= current_date - 365),
        'pertemuan', (select count(*) from public.ekskul_kehadiran h where h.anggota_id = a.id))
        order by a.aktif desc, a.peran = 'anggota', pd.nama), '[]'::jsonb)
        from public.ekskul_anggota a join public.peserta_didik pd on pd.id = a.peserta_didik_id
       where a.ekskul_id = p_id and a.tahun_ajaran = v_ta),
    'pertemuan', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'tanggal', t.tanggal, 'topik', t.topik,
        'hadir', (select count(*) from public.ekskul_kehadiran h where h.pertemuan_id = t.id and h.hadir),
        'total', (select count(*) from public.ekskul_kehadiran h where h.pertemuan_id = t.id)) order by t.tanggal desc), '[]'::jsonb)
        from (select * from public.ekskul_pertemuan where ekskul_id = p_id order by tanggal desc limit 40) t));
end $$;

create or replace function public.ekskul_anggota_tambah(p_ekskul uuid, p_pd uuid, p_peran text default 'anggota') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_ta text := public.tahun_ajaran_sekarang();
  v_id uuid;
begin
  if auth.uid() is null or not private.kes_boleh_ekskul(p_ekskul) then raise exception 'Anda tidak berwenang mengelola anggota ekstrakurikuler ini.'; end if;
  if p_peran not in ('anggota','ketua','wakil','sekretaris','bendahara','pengurus') then raise exception 'Peran tidak dikenal.'; end if;
  if not exists (select 1 from public.peserta_didik where id = p_pd and npsn = private.npsn_saya() and status_peserta_didik = 'aktif') then
    raise exception 'Siswa tidak ditemukan atau sudah tidak aktif.';
  end if;
  insert into public.ekskul_anggota (ekskul_id, peserta_didik_id, tahun_ajaran, peran)
  values (p_ekskul, p_pd, v_ta, p_peran)
  on conflict (ekskul_id, peserta_didik_id, tahun_ajaran) do update set aktif = true, peran = excluded.peran
  returning id into v_id;
  perform private.kes_audit('ekskul_anggota', 'TAMBAH', jsonb_build_object('ekskul', p_ekskul, 'pd', p_pd, 'peran', p_peran));
  return v_id;
end $$;

create or replace function public.ekskul_anggota_ubah(p_id uuid, p_peran text, p_predikat text default null, p_catatan_nilai text default null, p_aktif boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_e uuid;
  v_c text := nullif(btrim(coalesce(p_catatan_nilai, '')), '');
begin
  select ekskul_id into v_e from public.ekskul_anggota where id = p_id;
  if v_e is null then raise exception 'Anggota tidak ditemukan.'; end if;
  if auth.uid() is null or not private.kes_boleh_ekskul(v_e) then raise exception 'Anda tidak berwenang mengelola anggota ekstrakurikuler ini.'; end if;
  if p_peran not in ('anggota','ketua','wakil','sekretaris','bendahara','pengurus') then raise exception 'Peran tidak dikenal.'; end if;
  if p_predikat is not null and p_predikat not in ('sangat_baik','baik','cukup','perlu_pembinaan') then raise exception 'Predikat tidak dikenal.'; end if;
  if v_c is not null and char_length(v_c) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  update public.ekskul_anggota set peran = p_peran, predikat = p_predikat, catatan_nilai = v_c, aktif = coalesce(p_aktif, true) where id = p_id;
  perform private.kes_audit('ekskul_anggota', 'UBAH', jsonb_build_object('id', p_id, 'peran', p_peran, 'aktif', p_aktif));
end $$;

-- Mencatat pertemuan; p_hadir berisi id anggota yang hadir, anggota aktif lainnya dicatat tidak hadir.
create or replace function public.ekskul_pertemuan_simpan(p_ekskul uuid, p_tanggal date, p_topik text default null, p_hadir uuid[] default '{}') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_hari date := private.kes_hari();
  v_ta text := public.tahun_ajaran_sekarang();
  v_topik text := nullif(btrim(coalesce(p_topik, '')), '');
  v_id uuid;
begin
  if auth.uid() is null or not private.kes_boleh_ekskul(p_ekskul) then raise exception 'Anda tidak berwenang mencatat pertemuan ekstrakurikuler ini.'; end if;
  if p_tanggal is null or p_tanggal > v_hari or p_tanggal < v_hari - 60 then raise exception 'Tanggal pertemuan tidak valid.'; end if;
  if v_topik is not null and char_length(v_topik) > 200 then raise exception 'Topik maksimal 200 karakter.'; end if;
  insert into public.ekskul_pertemuan (ekskul_id, tanggal, topik, dicatat_oleh)
  values (p_ekskul, p_tanggal, v_topik, auth.uid())
  on conflict (ekskul_id, tanggal) do update set topik = excluded.topik, dicatat_oleh = excluded.dicatat_oleh
  returning id into v_id;
  insert into public.ekskul_kehadiran (pertemuan_id, anggota_id, hadir)
  select v_id, a.id, a.id = any (coalesce(p_hadir, '{}'))
    from public.ekskul_anggota a where a.ekskul_id = p_ekskul and a.tahun_ajaran = v_ta and a.aktif
  on conflict (pertemuan_id, anggota_id) do update set hadir = excluded.hadir;
  perform private.kes_audit('ekskul_pertemuan', 'SIMPAN', jsonb_build_object('ekskul', p_ekskul, 'tanggal', p_tanggal));
  return v_id;
end $$;

create or replace function public.ekskul_pertemuan_buka(p_pertemuan uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v public.ekskul_pertemuan%rowtype;
begin
  select * into v from public.ekskul_pertemuan where id = p_pertemuan;
  if not found then raise exception 'Pertemuan tidak ditemukan.'; end if;
  if auth.uid() is null or not private.kes_boleh_ekskul(v.ekskul_id) then raise exception 'Anda tidak berwenang membuka pertemuan ini.'; end if;
  return jsonb_build_object('id', v.id, 'tanggal', v.tanggal, 'topik', v.topik,
    'anggota', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'nama', pd.nama, 'hadir', h.hadir) order by pd.nama), '[]'::jsonb)
                  from public.ekskul_kehadiran h join public.ekskul_anggota a on a.id = h.anggota_id
                  join public.peserta_didik pd on pd.id = a.peserta_didik_id where h.pertemuan_id = v.id));
end $$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (array[
       'ekskul_daftar','ekskul_simpan','ekskul_detail','ekskul_anggota_tambah','ekskul_anggota_ubah','ekskul_pertemuan_simpan','ekskul_pertemuan_buka'])
  loop
    execute format('revoke all on function %s from public, anon', r.f);
    execute format('grant execute on function %s to authenticated', r.f);
  end loop;
end $$;
