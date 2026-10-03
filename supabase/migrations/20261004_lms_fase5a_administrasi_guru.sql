-- Terpasang sebagai migrasi lms_fase5a_administrasi_guru. Perangkat ajar dan jurnal mengajar.

create table public.perangkat_ajar (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah(npsn),
  ptk_id uuid not null references public.ptk(id),
  kelas_ajar_id uuid references public.kelas_ajar(id) on delete set null,
  jenis text not null check (jenis in ('cp','tp','atp','prota','promes','modul_ajar','rpp','kktp','bahan_ajar','lkpd','soal_asesmen','analisis_nilai','remedial_pengayaan','lainnya')),
  judul text not null check (length(btrim(judul)) between 1 and 200),
  isi text check (isi is null or length(isi) <= 50000),
  url text check (url is null or url ~* '^https://'),
  dihapus boolean not null default false,
  dibuat_pada timestamptz not null default now(),
  diubah_pada timestamptz not null default now(),
  check (isi is not null or url is not null)
);

create table public.jurnal_mengajar (
  id uuid primary key default gen_random_uuid(),
  kelas_ajar_id uuid not null references public.kelas_ajar(id) on delete cascade,
  pertemuan_id uuid references public.pertemuan(id) on delete set null,
  tanggal date not null default ((now() at time zone 'Asia/Jakarta')::date),
  materi text not null check (length(btrim(materi)) > 0),
  kegiatan text check (kegiatan is null or length(kegiatan) <= 5000),
  kendala text check (kendala is null or length(kendala) <= 3000),
  tindak_lanjut text check (tindak_lanjut is null or length(tindak_lanjut) <= 3000),
  dihapus boolean not null default false,
  dibuat_pada timestamptz not null default now()
);

create index perangkat_ptk_idx on public.perangkat_ajar(ptk_id);
create index perangkat_npsn_idx on public.perangkat_ajar(npsn);
create index perangkat_kelas_idx on public.perangkat_ajar(kelas_ajar_id);
create index jurnal_kelas_idx on public.jurnal_mengajar(kelas_ajar_id);
create index jurnal_pertemuan_idx on public.jurnal_mengajar(pertemuan_id);

alter table public.perangkat_ajar enable row level security;
alter table public.jurnal_mengajar enable row level security;
revoke all on table public.perangkat_ajar, public.jurnal_mengajar from anon, authenticated;

create or replace function public.lms_perangkat_simpan(
  p_id uuid, p_kelas uuid, p_jenis text, p_judul text, p_isi text, p_url text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_ptk uuid := private.ptk_id_saya(); v_id uuid;
begin
  if v_ptk is null then raise exception 'Hanya untuk guru.' using errcode = '42501'; end if;
  if btrim(coalesce(p_judul, '')) = '' then raise exception 'Judul wajib diisi.' using errcode = '22023'; end if;
  if btrim(coalesce(p_isi, '')) = '' and btrim(coalesce(p_url, '')) = '' then raise exception 'Isi dokumen atau tautan.' using errcode = '22023'; end if;
  if btrim(coalesce(p_url, '')) <> '' and btrim(p_url) !~* '^https://' then raise exception 'Tautan harus diawali https://.' using errcode = '22023'; end if;
  if p_kelas is not null and not exists (select 1 from public.kelas_ajar where id = p_kelas and ptk_id = v_ptk) then
    raise exception 'Kelas ajar bukan milik Anda.' using errcode = '42501';
  end if;
  if p_id is null then
    insert into public.perangkat_ajar (npsn, ptk_id, kelas_ajar_id, jenis, judul, isi, url)
    values (private.npsn_saya(), v_ptk, p_kelas, p_jenis, btrim(p_judul), nullif(btrim(coalesce(p_isi, '')), ''), nullif(btrim(coalesce(p_url, '')), ''))
    returning id into v_id;
  else
    update public.perangkat_ajar set kelas_ajar_id = p_kelas, jenis = p_jenis, judul = btrim(p_judul),
      isi = nullif(btrim(coalesce(p_isi, '')), ''), url = nullif(btrim(coalesce(p_url, '')), ''), diubah_pada = now()
    where id = p_id and ptk_id = v_ptk and not dihapus
    returning id into v_id;
    if v_id is null then raise exception 'Dokumen tidak ditemukan.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.lms_perangkat_hapus(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.perangkat_ajar set dihapus = true where id = p_id and ptk_id = private.ptk_id_saya();
  if not found then raise exception 'Dokumen tidak ditemukan.' using errcode = 'P0002'; end if;
end $$;

-- Guru melihat miliknya. Admin TU melihat semua guru di sekolahnya (supervisi), dapat disaring per guru.
create or replace function public.lms_perangkat_daftar(p_ptk uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_admin boolean := private.peran_saya() = 'admin_tu' or private.adalah_super();
        v_ptk uuid := private.ptk_id_saya();
begin
  if not v_admin and v_ptk is null then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id, 'jenis', d.jenis, 'judul', d.judul, 'isi', d.isi, 'url', d.url,
      'kelas_ajar_id', d.kelas_ajar_id,
      'kelas', (select k.mapel || ' ' || r.nama from public.kelas_ajar k join public.rombel r on r.id = k.rombel_id where k.id = d.kelas_ajar_id),
      'guru', p.nama, 'milik_saya', d.ptk_id = v_ptk, 'diubah_pada', d.diubah_pada
    ) order by d.jenis, d.diubah_pada desc)
    from public.perangkat_ajar d join public.ptk p on p.id = d.ptk_id
    where not d.dihapus
      and ((not v_admin and d.ptk_id = v_ptk)
        or (v_admin and (private.adalah_super() or d.npsn = private.npsn_saya()) and (p_ptk is null or d.ptk_id = p_ptk)))), '[]'::jsonb);
end $$;

create or replace function public.lms_jurnal_simpan(
  p_kelas uuid, p_id uuid, p_pertemuan uuid, p_tanggal date, p_materi text, p_kegiatan text, p_kendala text, p_tindak text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.lms_kelola(p_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if btrim(coalesce(p_materi, '')) = '' then raise exception 'Materi wajib diisi.' using errcode = '22023'; end if;
  if p_pertemuan is not null and not exists (select 1 from public.pertemuan where id = p_pertemuan and kelas_ajar_id = p_kelas) then
    raise exception 'Pertemuan bukan milik kelas ini.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.jurnal_mengajar (kelas_ajar_id, pertemuan_id, tanggal, materi, kegiatan, kendala, tindak_lanjut)
    values (p_kelas, p_pertemuan, coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date), btrim(p_materi),
            nullif(btrim(coalesce(p_kegiatan, '')), ''), nullif(btrim(coalesce(p_kendala, '')), ''), nullif(btrim(coalesce(p_tindak, '')), ''))
    returning id into v_id;
  else
    update public.jurnal_mengajar set pertemuan_id = p_pertemuan, tanggal = coalesce(p_tanggal, tanggal), materi = btrim(p_materi),
      kegiatan = nullif(btrim(coalesce(p_kegiatan, '')), ''), kendala = nullif(btrim(coalesce(p_kendala, '')), ''),
      tindak_lanjut = nullif(btrim(coalesce(p_tindak, '')), '')
    where id = p_id and kelas_ajar_id = p_kelas and not dihapus
    returning id into v_id;
    if v_id is null then raise exception 'Jurnal tidak ditemukan.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.lms_jurnal_hapus(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_kelas uuid;
begin
  select kelas_ajar_id into v_kelas from public.jurnal_mengajar where id = p_id;
  if v_kelas is null or not private.lms_kelola(v_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  update public.jurnal_mengajar set dihapus = true where id = p_id;
end $$;

create or replace function public.lms_jurnal_daftar(p_kelas uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.lms_kelola(p_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', j.id, 'tanggal', j.tanggal, 'pertemuan_id', j.pertemuan_id,
      'pertemuan_nomor', (select t.nomor from public.pertemuan t where t.id = j.pertemuan_id),
      'materi', j.materi, 'kegiatan', j.kegiatan, 'kendala', j.kendala, 'tindak_lanjut', j.tindak_lanjut,
      'hadir', (select count(*) from public.absensi_pertemuan a where a.pertemuan_id = j.pertemuan_id and a.status = 'hadir'),
      'izin', (select count(*) from public.absensi_pertemuan a where a.pertemuan_id = j.pertemuan_id and a.status = 'izin'),
      'sakit', (select count(*) from public.absensi_pertemuan a where a.pertemuan_id = j.pertemuan_id and a.status = 'sakit'),
      'alpa', (select count(*) from public.absensi_pertemuan a where a.pertemuan_id = j.pertemuan_id and a.status = 'alpa')
    ) order by j.tanggal desc, j.dibuat_pada desc)
    from public.jurnal_mengajar j where j.kelas_ajar_id = p_kelas and not j.dihapus), '[]'::jsonb);
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
