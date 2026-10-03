-- LMS fase 3: tugas dan pengumpulan. Penghapusan memakai penanda dihapus (bukan delete).

create table public.tugas (
  id uuid primary key default gen_random_uuid(),
  kelas_ajar_id uuid not null references public.kelas_ajar(id) on delete cascade,
  pertemuan_id uuid references public.pertemuan(id) on delete set null,
  judul text not null check (length(btrim(judul)) > 0),
  instruksi text check (instruksi is null or length(instruksi) <= 10000),
  tenggat timestamptz,
  terima_telat boolean not null default false,
  nilai_maks integer not null default 100 check (nilai_maks between 1 and 1000),
  status text not null default 'draf' check (status in ('draf','terbit')),
  dihapus boolean not null default false,
  dibuat_pada timestamptz not null default now()
);

create table public.kumpul_tugas (
  tugas_id uuid not null references public.tugas(id) on delete cascade,
  peserta_didik_id uuid not null references public.peserta_didik(id),
  teks text check (teks is null or length(teks) <= 10000),
  url text check (url is null or url ~* '^https://'),
  dikumpul_pada timestamptz not null default now(),
  diubah_pada timestamptz not null default now(),
  terlambat boolean not null default false,
  nilai numeric(7,2),
  umpan_balik text check (umpan_balik is null or length(umpan_balik) <= 2000),
  dinilai_pada timestamptz,
  primary key (tugas_id, peserta_didik_id),
  check (teks is not null or url is not null)
);

create index tugas_kelas_idx on public.tugas(kelas_ajar_id);
create index tugas_pertemuan_idx on public.tugas(pertemuan_id);
create index kumpul_pd_idx on public.kumpul_tugas(peserta_didik_id);

alter table public.tugas enable row level security;
alter table public.kumpul_tugas enable row level security;
revoke all on table public.tugas, public.kumpul_tugas from anon, authenticated;

create or replace function public.lms_tugas_simpan(
  p_kelas uuid, p_id uuid, p_pertemuan uuid, p_judul text, p_instruksi text,
  p_tenggat timestamptz, p_terima_telat boolean, p_nilai_maks integer, p_terbit boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.lms_kelola(p_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if btrim(coalesce(p_judul, '')) = '' then raise exception 'Judul wajib diisi.' using errcode = '22023'; end if;
  if p_nilai_maks is null or p_nilai_maks not between 1 and 1000 then raise exception 'Nilai maksimum 1 sampai 1000.' using errcode = '22023'; end if;
  if p_pertemuan is not null and not exists (select 1 from public.pertemuan where id = p_pertemuan and kelas_ajar_id = p_kelas) then
    raise exception 'Pertemuan bukan milik kelas ini.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.tugas (kelas_ajar_id, pertemuan_id, judul, instruksi, tenggat, terima_telat, nilai_maks, status)
    values (p_kelas, p_pertemuan, btrim(p_judul), nullif(btrim(coalesce(p_instruksi, '')), ''), p_tenggat,
            coalesce(p_terima_telat, false), p_nilai_maks, case when coalesce(p_terbit, false) then 'terbit' else 'draf' end)
    returning id into v_id;
  else
    update public.tugas set pertemuan_id = p_pertemuan, judul = btrim(p_judul),
      instruksi = nullif(btrim(coalesce(p_instruksi, '')), ''), tenggat = p_tenggat,
      terima_telat = coalesce(p_terima_telat, terima_telat), nilai_maks = p_nilai_maks,
      status = case when p_terbit is null then status when p_terbit then 'terbit' else 'draf' end
    where id = p_id and kelas_ajar_id = p_kelas and not dihapus
    returning id into v_id;
    if v_id is null then raise exception 'Tugas tidak ditemukan.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.lms_tugas_hapus(p_tugas uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_kelas uuid;
begin
  select kelas_ajar_id into v_kelas from public.tugas where id = p_tugas;
  if v_kelas is null or not private.lms_kelola(v_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  update public.tugas set dihapus = true, status = 'draf' where id = p_tugas;
end $$;

create or replace function public.lms_tugas_daftar(p_kelas uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_kelola boolean := private.lms_kelola(p_kelas); v_pd uuid := private.pd_id_saya();
begin
  if not v_kelola and not private.lms_anggota(p_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'judul', t.judul, 'instruksi', t.instruksi, 'tenggat', t.tenggat, 'terima_telat', t.terima_telat,
      'nilai_maks', t.nilai_maks, 'status', t.status, 'pertemuan_id', t.pertemuan_id,
      'pertemuan_nomor', (select p.nomor from public.pertemuan p where p.id = t.pertemuan_id),
      'dikumpul', case when v_kelola then (select count(*) from public.kumpul_tugas k where k.tugas_id = t.id) end,
      'dinilai', case when v_kelola then (select count(*) from public.kumpul_tugas k where k.tugas_id = t.id and k.nilai is not null) end,
      'total_siswa', case when v_kelola then (select count(*) from public.kelas_ajar ka
                          join public.keanggotaan_rombel kr on kr.rombel_id = ka.rombel_id where ka.id = p_kelas) end,
      'saya', case when not v_kelola then (select jsonb_build_object(
                'teks', k.teks, 'url', k.url, 'dikumpul_pada', k.dikumpul_pada, 'terlambat', k.terlambat,
                'nilai', k.nilai, 'umpan_balik', case when k.nilai is not null then k.umpan_balik end)
              from public.kumpul_tugas k where k.tugas_id = t.id and k.peserta_didik_id = v_pd) end
    ) order by t.dibuat_pada)
    from public.tugas t
    where t.kelas_ajar_id = p_kelas and not t.dihapus and (v_kelola or t.status = 'terbit')), '[]'::jsonb);
end $$;

create or replace function public.lms_tugas_kumpul(p_tugas uuid, p_teks text, p_url text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tugas%rowtype; ex public.kumpul_tugas%rowtype; v_pd uuid := private.pd_id_saya(); v_telat boolean;
begin
  select * into t from public.tugas where id = p_tugas;
  if not found or t.dihapus or t.status <> 'terbit' or v_pd is null or not private.lms_anggota(t.kelas_ajar_id) then
    raise exception 'Tidak tersedia.' using errcode = '42501';
  end if;
  if t.pertemuan_id is not null and not private.lms_gerbang_lolos(t.pertemuan_id) then
    raise exception 'Absen dulu di pertemuan terkait sebelum mengumpulkan.' using errcode = 'P0001', hint = 'gerbang_absen';
  end if;
  if btrim(coalesce(p_teks, '')) = '' and btrim(coalesce(p_url, '')) = '' then
    raise exception 'Isi jawaban teks atau tautan.' using errcode = '22023';
  end if;
  if btrim(coalesce(p_url, '')) <> '' and btrim(p_url) !~* '^https://' then
    raise exception 'Tautan harus diawali https://.' using errcode = '22023';
  end if;
  v_telat := t.tenggat is not null and now() > t.tenggat;
  if v_telat and not t.terima_telat then raise exception 'Tenggat sudah lewat.' using errcode = 'P0001'; end if;
  select * into ex from public.kumpul_tugas where tugas_id = p_tugas and peserta_didik_id = v_pd;
  if found and ex.nilai is not null then raise exception 'Tugas sudah dinilai, tidak bisa diubah.' using errcode = 'P0001'; end if;
  insert into public.kumpul_tugas (tugas_id, peserta_didik_id, teks, url, terlambat)
  values (p_tugas, v_pd, nullif(btrim(coalesce(p_teks, '')), ''), nullif(btrim(coalesce(p_url, '')), ''), v_telat)
  on conflict (tugas_id, peserta_didik_id) do update
    set teks = excluded.teks, url = excluded.url, diubah_pada = now(), terlambat = excluded.terlambat;
  return jsonb_build_object('ok', true, 'terlambat', v_telat);
end $$;

create or replace function public.lms_tugas_rekap(p_tugas uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.tugas%rowtype;
begin
  select * into t from public.tugas where id = p_tugas;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'tugas', jsonb_build_object('id', t.id, 'judul', t.judul, 'nilai_maks', t.nilai_maks, 'tenggat', t.tenggat),
    'siswa', coalesce((select jsonb_agg(jsonb_build_object(
        'peserta_didik_id', pd.id, 'nama', pd.nama, 'nisn', pd.nisn, 'no_urut', kr.no_urut,
        'status', case when k.tugas_id is null then 'belum' when k.nilai is not null then 'dinilai'
                       when k.terlambat then 'terlambat' else 'terkumpul' end,
        'teks', k.teks, 'url', k.url, 'dikumpul_pada', k.diubah_pada, 'nilai', k.nilai, 'umpan_balik', k.umpan_balik)
        order by kr.no_urut nulls last, pd.nama)
      from public.keanggotaan_rombel kr
      join public.kelas_ajar ka on ka.rombel_id = kr.rombel_id
      join public.peserta_didik pd on pd.id = kr.peserta_didik_id
      left join public.kumpul_tugas k on k.tugas_id = t.id and k.peserta_didik_id = pd.id
      where ka.id = t.kelas_ajar_id), '[]'::jsonb));
end $$;

create or replace function public.lms_tugas_nilai(p_tugas uuid, p_pd uuid, p_nilai numeric, p_umpan text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tugas%rowtype;
begin
  select * into t from public.tugas where id = p_tugas;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if p_nilai is null or p_nilai < 0 or p_nilai > t.nilai_maks then
    raise exception 'Nilai harus 0 sampai %.', t.nilai_maks using errcode = '22023';
  end if;
  update public.kumpul_tugas set nilai = p_nilai, umpan_balik = nullif(btrim(coalesce(p_umpan, '')), ''), dinilai_pada = now()
  where tugas_id = p_tugas and peserta_didik_id = p_pd;
  if not found then raise exception 'Siswa belum mengumpulkan.' using errcode = 'P0002'; end if;
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
