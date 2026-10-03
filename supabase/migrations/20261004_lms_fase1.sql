-- LMS fase 1: kelas ajar, pertemuan, materi, absensi per pertemuan, gerbang absen.
-- Sudah terpasang di Supabase sebagai migrasi lms_fase1_kerangka_ajar (20261004).
-- Tabel tanpa policy; semua akses lewat fungsi security definer (pola ajuan dan persuratan).

create table public.kelas_ajar (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah(npsn),
  semester_id text not null references public.semester(semester_id),
  rombel_id uuid not null references public.rombel(id),
  ptk_id uuid not null references public.ptk(id),
  mapel text not null check (length(btrim(mapel)) between 2 and 80),
  aktif boolean not null default true,
  dibuat_pada timestamptz not null default now(),
  unique (semester_id, rombel_id, mapel)
);

create table public.pertemuan (
  id uuid primary key default gen_random_uuid(),
  kelas_ajar_id uuid not null references public.kelas_ajar(id) on delete cascade,
  nomor integer not null check (nomor > 0),
  judul text not null check (length(btrim(judul)) > 0),
  tanggal date not null default ((now() at time zone 'Asia/Jakarta')::date),
  tujuan text,
  status text not null default 'draf' check (status in ('draf','terbit')),
  wajib_absen boolean not null default true,
  absen_buka timestamptz,
  absen_tutup timestamptz,
  kode_absen text check (kode_absen is null or kode_absen ~ '^[0-9]{4}$'),
  dibuat_pada timestamptz not null default now(),
  unique (kelas_ajar_id, nomor)
);

create table public.materi (
  id uuid primary key default gen_random_uuid(),
  pertemuan_id uuid not null references public.pertemuan(id) on delete cascade,
  urutan integer not null default 1,
  jenis text not null check (jenis in ('teks','video','tautan','berkas')),
  judul text not null check (length(btrim(judul)) > 0),
  isi text check (isi is null or length(isi) <= 20000),
  url text check (url is null or url ~* '^https://'),
  dibuat_pada timestamptz not null default now(),
  check (jenis <> 'teks' or isi is not null),
  check (jenis = 'teks' or url is not null)
);

create table public.absensi_pertemuan (
  pertemuan_id uuid not null references public.pertemuan(id) on delete cascade,
  peserta_didik_id uuid not null references public.peserta_didik(id),
  status text not null check (status in ('hadir','izin','sakit','alpa')),
  sumber text not null check (sumber in ('mandiri','guru')),
  catatan text,
  dicatat_pada timestamptz not null default now(),
  primary key (pertemuan_id, peserta_didik_id)
);

create table public.progres_materi (
  materi_id uuid not null references public.materi(id) on delete cascade,
  peserta_didik_id uuid not null references public.peserta_didik(id),
  selesai_pada timestamptz not null default now(),
  primary key (materi_id, peserta_didik_id)
);

create index kelas_ajar_ptk_idx on public.kelas_ajar(ptk_id);
create index kelas_ajar_rombel_idx on public.kelas_ajar(rombel_id);
create index kelas_ajar_npsn_idx on public.kelas_ajar(npsn);
create index kelas_ajar_semester_idx on public.kelas_ajar(semester_id);
create index materi_pertemuan_idx on public.materi(pertemuan_id);
create index absensi_pertemuan_pd_idx on public.absensi_pertemuan(peserta_didik_id);
create index progres_materi_pd_idx on public.progres_materi(peserta_didik_id);

alter table public.kelas_ajar enable row level security;
alter table public.pertemuan enable row level security;
alter table public.materi enable row level security;
alter table public.absensi_pertemuan enable row level security;
alter table public.progres_materi enable row level security;
revoke all on table public.kelas_ajar, public.pertemuan, public.materi, public.absensi_pertemuan, public.progres_materi from anon, authenticated;

-- Fungsi bantu
create or replace function private.lms_kelola(p_kelas uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select true from public.kelas_ajar k where k.id = p_kelas
    and (private.adalah_super()
         or (k.npsn = private.npsn_saya()
             and (k.ptk_id = private.ptk_id_saya() or private.peran_saya() = 'admin_tu')))), false)
$$;

create or replace function private.lms_anggota(p_kelas uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.kelas_ajar k
    join public.keanggotaan_rombel kr on kr.rombel_id = k.rombel_id
    where k.id = p_kelas and k.aktif and kr.peserta_didik_id = private.pd_id_saya())
$$;

create or replace function private.lms_gerbang_lolos(p_pertemuan uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (not t.wajib_absen) or exists (
      select 1 from public.absensi_pertemuan a
      where a.pertemuan_id = t.id and a.peserta_didik_id = private.pd_id_saya() and a.status <> 'alpa')
    from public.pertemuan t where t.id = p_pertemuan), false)
$$;

-- Kelas ajar
create or replace function public.lms_kelas_saya() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(s.x order by s.x->>'rombel', s.x->>'mapel'), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', k.id, 'mapel', k.mapel, 'rombel', r.nama, 'rombel_id', r.id,
      'guru', p.nama, 'semester', k.semester_id,
      'peran', case when private.lms_kelola(k.id) then 'pengelola' else 'siswa' end,
      'jumlah_pertemuan', (select count(*) from public.pertemuan t
         where t.kelas_ajar_id = k.id and (private.lms_kelola(k.id) or t.status = 'terbit'))
    ) x
    from public.kelas_ajar k
    join public.rombel r on r.id = k.rombel_id
    join public.ptk p on p.id = k.ptk_id
    where k.aktif and (private.lms_kelola(k.id) or private.lms_anggota(k.id))
  ) s
$$;

create or replace function public.lms_buat_kelas_ajar(p_rombel uuid, p_mapel text, p_ptk uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.rombel%rowtype; v_ptk uuid; v_id uuid; v_peran text := private.peran_saya();
begin
  if auth.uid() is null then raise exception 'Perlu masuk.' using errcode = '28000'; end if;
  select * into r from public.rombel where id = p_rombel;
  if not found then raise exception 'Rombel tidak ditemukan.' using errcode = 'P0002'; end if;
  if r.jenis_rombel <> 'Kelas Utama' then raise exception 'Hanya rombel Kelas Utama.' using errcode = '22023'; end if;
  if not private.adalah_super() and r.npsn <> private.npsn_saya() then
    raise exception 'Rombel bukan milik sekolah Anda.' using errcode = '42501';
  end if;
  if private.adalah_super() or v_peran = 'admin_tu' then
    v_ptk := coalesce(p_ptk, private.ptk_id_saya());
    if v_ptk is null then raise exception 'Pilih guru pengampu.' using errcode = '22023'; end if;
  elsif v_peran = 'guru' then
    v_ptk := private.ptk_id_saya();
  else
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ptk where id = v_ptk and npsn = r.npsn) then
    raise exception 'Guru tidak ditemukan.' using errcode = 'P0002';
  end if;
  insert into public.kelas_ajar (npsn, semester_id, rombel_id, ptk_id, mapel)
  values (r.npsn, r.semester_id, p_rombel, v_ptk, btrim(p_mapel))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Kelas ajar % untuk rombel ini sudah ada.', btrim(p_mapel) using errcode = '23505';
end $$;

-- Pertemuan
create or replace function public.lms_simpan_pertemuan(
  p_kelas uuid, p_id uuid, p_judul text, p_tanggal date, p_tujuan text, p_wajib_absen boolean, p_terbit boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.lms_kelola(p_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if btrim(coalesce(p_judul, '')) = '' then raise exception 'Judul wajib diisi.' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.pertemuan (kelas_ajar_id, nomor, judul, tanggal, tujuan, wajib_absen, status)
    values (p_kelas,
            (select coalesce(max(nomor), 0) + 1 from public.pertemuan where kelas_ajar_id = p_kelas),
            btrim(p_judul),
            coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date),
            nullif(btrim(coalesce(p_tujuan, '')), ''),
            coalesce(p_wajib_absen, true),
            case when coalesce(p_terbit, false) then 'terbit' else 'draf' end)
    returning id into v_id;
  else
    update public.pertemuan set
      judul = btrim(p_judul),
      tanggal = coalesce(p_tanggal, tanggal),
      tujuan = nullif(btrim(coalesce(p_tujuan, '')), ''),
      wajib_absen = coalesce(p_wajib_absen, wajib_absen),
      status = case when p_terbit is null then status when p_terbit then 'terbit' else 'draf' end
    where id = p_id and kelas_ajar_id = p_kelas
    returning id into v_id;
    if v_id is null then raise exception 'Pertemuan tidak ditemukan.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.lms_pertemuan_daftar(p_kelas uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_kelola boolean := private.lms_kelola(p_kelas);
begin
  if not v_kelola and not private.lms_anggota(p_kelas) then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'nomor', t.nomor, 'judul', t.judul, 'tanggal', t.tanggal, 'tujuan', t.tujuan,
      'status', t.status, 'wajib_absen', t.wajib_absen,
      'absen_terbuka', (t.absen_buka is not null and now() between t.absen_buka and t.absen_tutup),
      'absen_tutup', t.absen_tutup,
      'kode_absen', case when v_kelola then t.kode_absen end,
      'jumlah_materi', (select count(*) from public.materi m where m.pertemuan_id = t.id),
      'hadir', case when v_kelola then (select count(*) from public.absensi_pertemuan a
                 where a.pertemuan_id = t.id and a.status = 'hadir') end,
      'status_saya', case when not v_kelola then (select a.status from public.absensi_pertemuan a
                 where a.pertemuan_id = t.id and a.peserta_didik_id = private.pd_id_saya()) end
    ) order by t.nomor)
    from public.pertemuan t
    where t.kelas_ajar_id = p_kelas and (v_kelola or t.status = 'terbit')), '[]'::jsonb);
end $$;

-- Absensi
create or replace function public.lms_buka_absen(p_pertemuan uuid, p_menit integer, p_pakai_kode boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; v_kode text; v_tutup timestamptz;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  if t.status <> 'terbit' then raise exception 'Terbitkan pertemuan dulu.' using errcode = '22023'; end if;
  if p_menit is null or p_menit not between 1 and 240 then
    raise exception 'Durasi absen 1 sampai 240 menit.' using errcode = '22023';
  end if;
  v_kode := case when coalesce(p_pakai_kode, true) then lpad(floor(random() * 10000)::int::text, 4, '0') end;
  v_tutup := now() + make_interval(mins => p_menit);
  update public.pertemuan set absen_buka = now(), absen_tutup = v_tutup, kode_absen = v_kode where id = p_pertemuan;
  return jsonb_build_object('kode', v_kode, 'tutup', v_tutup);
end $$;

create or replace function public.lms_tutup_absen(p_pertemuan uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.pertemuan%rowtype;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  update public.pertemuan set absen_tutup = now() where id = p_pertemuan and absen_buka is not null;
end $$;

create or replace function public.lms_absen(p_pertemuan uuid, p_kode text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; ex public.absensi_pertemuan%rowtype;
        v_pd uuid := private.pd_id_saya(); v_kunci text; v_gagal integer;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or v_pd is null or t.status <> 'terbit' or not private.lms_anggota(t.kelas_ajar_id) then
    return jsonb_build_object('ok', false, 'pesan', 'Pertemuan tidak tersedia.');
  end if;
  if t.absen_buka is null or now() < t.absen_buka or now() > t.absen_tutup then
    return jsonb_build_object('ok', false, 'pesan', 'Absen belum dibuka atau sudah ditutup.');
  end if;
  select * into ex from public.absensi_pertemuan where pertemuan_id = p_pertemuan and peserta_didik_id = v_pd;
  if found then
    if ex.sumber = 'guru' then
      return jsonb_build_object('ok', false, 'pesan', 'Kehadiran sudah dicatat guru.');
    end if;
    return jsonb_build_object('ok', true, 'pesan', 'Sudah tercatat hadir.');
  end if;
  if t.kode_absen is not null then
    v_kunci := 'absen:' || p_pertemuan::text || ':' || v_pd::text;
    select count(*) into v_gagal from public.percobaan_masuk
      where kunci = v_kunci and berhasil = false and dibuat_pada > now() - interval '10 minutes';
    if v_gagal >= 5 then
      return jsonb_build_object('ok', false, 'pesan', 'Terlalu banyak salah. Tunggu 10 menit atau minta guru mencatat.');
    end if;
    if coalesce(btrim(p_kode), '') <> t.kode_absen then
      insert into public.percobaan_masuk (kunci, berhasil) values (v_kunci, false);
      return jsonb_build_object('ok', false, 'pesan', 'Kode salah.');
    end if;
  end if;
  insert into public.absensi_pertemuan (pertemuan_id, peserta_didik_id, status, sumber)
  values (p_pertemuan, v_pd, 'hadir', 'mandiri');
  return jsonb_build_object('ok', true, 'pesan', 'Hadir tercatat.');
end $$;

create or replace function public.lms_absen_guru(p_pertemuan uuid, p_pd uuid, p_status text, p_catatan text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.pertemuan%rowtype;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  if p_status not in ('hadir','izin','sakit','alpa') then
    raise exception 'Status tidak valid.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.kelas_ajar k
      join public.keanggotaan_rombel kr on kr.rombel_id = k.rombel_id
      where k.id = t.kelas_ajar_id and kr.peserta_didik_id = p_pd) then
    raise exception 'Siswa bukan anggota rombel ini.' using errcode = '22023';
  end if;
  insert into public.absensi_pertemuan (pertemuan_id, peserta_didik_id, status, sumber, catatan)
  values (p_pertemuan, p_pd, p_status, 'guru', nullif(btrim(coalesce(p_catatan, '')), ''))
  on conflict (pertemuan_id, peserta_didik_id) do update
    set status = excluded.status, sumber = 'guru', catatan = excluded.catatan, dicatat_pada = now();
end $$;

create or replace function public.lms_rekap_pertemuan(p_pertemuan uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.pertemuan%rowtype;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'pertemuan', jsonb_build_object('id', t.id, 'nomor', t.nomor, 'judul', t.judul),
    'siswa', coalesce((select jsonb_agg(jsonb_build_object(
        'peserta_didik_id', pd.id, 'nama', pd.nama, 'nisn', pd.nisn, 'no_urut', kr.no_urut,
        'status', coalesce(a.status, 'belum'), 'sumber', a.sumber, 'catatan', a.catatan)
        order by kr.no_urut nulls last, pd.nama)
      from public.kelas_ajar k
      join public.keanggotaan_rombel kr on kr.rombel_id = k.rombel_id
      join public.peserta_didik pd on pd.id = kr.peserta_didik_id
      left join public.absensi_pertemuan a on a.pertemuan_id = t.id and a.peserta_didik_id = pd.id
      where k.id = t.kelas_ajar_id), '[]'::jsonb));
end $$;

create or replace function public.lms_rekap_kelas(p_kelas uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.lms_kelola(p_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return (
    with sesi as (
      select id from public.pertemuan
      where kelas_ajar_id = p_kelas and status = 'terbit' and absen_buka is not null)
    select jsonb_build_object(
      'total_sesi', (select count(*) from sesi),
      'siswa', coalesce(jsonb_agg(jsonb_build_object(
        'peserta_didik_id', pd.id, 'nama', pd.nama, 'nisn', pd.nisn,
        'hadir', (select count(*) from public.absensi_pertemuan a where a.peserta_didik_id = pd.id and a.pertemuan_id in (select id from sesi) and a.status = 'hadir'),
        'izin',  (select count(*) from public.absensi_pertemuan a where a.peserta_didik_id = pd.id and a.pertemuan_id in (select id from sesi) and a.status = 'izin'),
        'sakit', (select count(*) from public.absensi_pertemuan a where a.peserta_didik_id = pd.id and a.pertemuan_id in (select id from sesi) and a.status = 'sakit'),
        'alpa',  (select count(*) from public.absensi_pertemuan a where a.peserta_didik_id = pd.id and a.pertemuan_id in (select id from sesi) and a.status = 'alpa')
      ) order by kr.no_urut nulls last, pd.nama), '[]'::jsonb))
    from public.kelas_ajar k
    join public.keanggotaan_rombel kr on kr.rombel_id = k.rombel_id
    join public.peserta_didik pd on pd.id = kr.peserta_didik_id
    where k.id = p_kelas);
end $$;

-- Materi dan gerbang absen
create or replace function public.lms_simpan_materi(
  p_pertemuan uuid, p_id uuid, p_jenis text, p_judul text, p_isi text, p_url text, p_urutan integer default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; v_id uuid;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  if p_jenis not in ('teks','video','tautan','berkas') then raise exception 'Jenis materi tidak valid.' using errcode = '22023'; end if;
  if btrim(coalesce(p_judul, '')) = '' then raise exception 'Judul wajib diisi.' using errcode = '22023'; end if;
  if p_jenis = 'teks' and btrim(coalesce(p_isi, '')) = '' then raise exception 'Isi materi kosong.' using errcode = '22023'; end if;
  if p_jenis <> 'teks' and coalesce(p_url, '') !~* '^https://' then
    raise exception 'Tautan harus diawali https://.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.materi (pertemuan_id, urutan, jenis, judul, isi, url)
    values (p_pertemuan,
            coalesce(p_urutan, (select coalesce(max(urutan), 0) + 1 from public.materi where pertemuan_id = p_pertemuan)),
            p_jenis, btrim(p_judul),
            case when p_jenis = 'teks' then p_isi end,
            case when p_jenis <> 'teks' then btrim(p_url) end)
    returning id into v_id;
  else
    update public.materi set
      urutan = coalesce(p_urutan, urutan), jenis = p_jenis, judul = btrim(p_judul),
      isi = case when p_jenis = 'teks' then p_isi end,
      url = case when p_jenis <> 'teks' then btrim(p_url) end
    where id = p_id and pertemuan_id = p_pertemuan
    returning id into v_id;
    if v_id is null then raise exception 'Materi tidak ditemukan.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.lms_hapus_materi(p_materi uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_kelas uuid;
begin
  select t.kelas_ajar_id into v_kelas from public.materi m
    join public.pertemuan t on t.id = m.pertemuan_id where m.id = p_materi;
  if v_kelas is null or not private.lms_kelola(v_kelas) then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  delete from public.materi where id = p_materi;
end $$;

create or replace function public.lms_materi_buka(p_pertemuan uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; v_kelola boolean;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found then raise exception 'Tidak tersedia.' using errcode = '42501'; end if;
  v_kelola := private.lms_kelola(t.kelas_ajar_id);
  if not v_kelola then
    if t.status <> 'terbit' or not private.lms_anggota(t.kelas_ajar_id) then
      raise exception 'Tidak tersedia.' using errcode = '42501';
    end if;
    if not private.lms_gerbang_lolos(p_pertemuan) then
      raise exception 'Absen dulu sebelum membuka materi.' using errcode = 'P0001', hint = 'gerbang_absen';
    end if;
  end if;
  return jsonb_build_object(
    'pertemuan', jsonb_build_object('id', t.id, 'nomor', t.nomor, 'judul', t.judul, 'tujuan', t.tujuan),
    'materi', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'urutan', m.urutan, 'jenis', m.jenis, 'judul', m.judul, 'isi', m.isi, 'url', m.url,
        'selesai', exists (select 1 from public.progres_materi pm
                           where pm.materi_id = m.id and pm.peserta_didik_id = private.pd_id_saya()))
        order by m.urutan, m.dibuat_pada)
      from public.materi m where m.pertemuan_id = p_pertemuan), '[]'::jsonb));
end $$;

create or replace function public.lms_tandai_selesai(p_materi uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_pert uuid; v_kelas uuid; v_pd uuid := private.pd_id_saya(); v_status text;
begin
  select m.pertemuan_id, t.kelas_ajar_id, t.status into v_pert, v_kelas, v_status
  from public.materi m join public.pertemuan t on t.id = m.pertemuan_id where m.id = p_materi;
  if v_pert is null or v_pd is null or v_status <> 'terbit' or not private.lms_anggota(v_kelas) then
    raise exception 'Tidak tersedia.' using errcode = '42501';
  end if;
  if not private.lms_gerbang_lolos(v_pert) then
    raise exception 'Absen dulu sebelum membuka materi.' using errcode = 'P0001', hint = 'gerbang_absen';
  end if;
  insert into public.progres_materi (materi_id, peserta_didik_id) values (p_materi, v_pd)
  on conflict do nothing;
end $$;

-- Hak eksekusi: hanya pengguna masuk
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname like 'lms\_%') or (n.nspname = 'private' and p.proname like 'lms\_%')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
