-- LMS: pantau per jam pelajaran. Untuk tiap jam: kelas yang terjadwal, apakah gurunya sudah masuk LMS, berapa siswa yang masuk,
-- dan tombol mengingatkan guru yang belum masuk. Bergantung pada jadwal pelajaran (kur_jadwal) dan jam bel (jam_bel).
-- Denyut LMS (lms_denyut) sekarang juga dicatat per jam pelajaran dan juga dari siswa.
-- Memerlukan 20261039_lms_kehadiran_guru.sql.

create table if not exists public.lms_denyut_jam (
  jenis text not null check (jenis in ('ptk', 'pd')),
  pelaku_id uuid not null,
  tanggal date not null,
  jam_ke integer not null,               -- urutan jam pelajaran pada hari itu; 0 = di luar jam pelajaran
  pertama timestamptz not null default now(),
  terakhir timestamptz not null default now(),
  jumlah integer not null default 1,
  primary key (jenis, pelaku_id, tanggal, jam_ke)
);
alter table public.lms_denyut_jam enable row level security;
revoke all on table public.lms_denyut_jam from anon, authenticated;

create table if not exists public.lms_peringatan (
  id uuid primary key default gen_random_uuid(),
  ptk_id uuid not null references public.ptk(id) on delete cascade,
  dari_nama text not null,
  pesan text not null check (length(btrim(pesan)) between 1 and 500),
  dibuat_pada timestamptz not null default now(),
  dibaca boolean not null default false
);
create index if not exists lms_peringatan_ptk_idx on public.lms_peringatan(ptk_id, dibaca);
alter table public.lms_peringatan enable row level security;
revoke all on table public.lms_peringatan from anon, authenticated;

-- Jam pelajaran ke berapa pada waktu tertentu (WIB). Hitung hanya baris berjenis pelajaran pada kelompok hari itu,
-- sama dengan cara jadwal pelajaran menomori jam_ke. 0 bila istirahat atau di luar jam sekolah.
create or replace function private.lms_jam_ke(p_waktu timestamptz default now()) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select x.r::integer from (
      select row_number() over (order by b.mulai) r, b.mulai, b.selesai
      from public.jam_bel b
      where b.aktif and b.jenis = 'pelajaran'
        and b.kelompok = private.kelompok_jam(extract(isodow from (p_waktu at time zone 'Asia/Jakarta'))::integer)
    ) x
    where (p_waktu at time zone 'Asia/Jakarta')::time >= x.mulai and (p_waktu at time zone 'Asia/Jakarta')::time < x.selesai
    limit 1), 0)
$$;
revoke execute on function private.lms_jam_ke(timestamptz) from public, anon, authenticated;

-- Denyut: guru dan siswa. Guru tetap dicatat harian (lms_kehadiran_guru) dan kini juga per jam.
create or replace function public.lms_denyut() returns void
language plpgsql security definer set search_path = '' as $$
declare v_ptk uuid := private.ptk_id_saya(); v_pd uuid := private.pd_id_saya();
        v_tgl date := (now() at time zone 'Asia/Jakarta')::date; v_jam integer;
begin
  if auth.uid() is null or (v_ptk is null and v_pd is null) then return; end if;
  v_jam := private.lms_jam_ke();
  if v_ptk is not null then
    insert into public.lms_kehadiran_guru (ptk_id) values (v_ptk)
    on conflict (ptk_id, tanggal) do update
      set terakhir_akses = now(), jumlah_denyut = public.lms_kehadiran_guru.jumlah_denyut + 1;
    insert into public.lms_denyut_jam (jenis, pelaku_id, tanggal, jam_ke) values ('ptk', v_ptk, v_tgl, v_jam)
    on conflict (jenis, pelaku_id, tanggal, jam_ke) do update
      set terakhir = now(), jumlah = public.lms_denyut_jam.jumlah + 1;
  end if;
  if v_pd is not null then
    insert into public.lms_denyut_jam (jenis, pelaku_id, tanggal, jam_ke) values ('pd', v_pd, v_tgl, v_jam)
    on conflict (jenis, pelaku_id, tanggal, jam_ke) do update
      set terakhir = now(), jumlah = public.lms_denyut_jam.jumlah + 1;
  end if;
end $$;
revoke all on function public.lms_denyut() from public, anon;
grant execute on function public.lms_denyut() to authenticated;

-- Pantau satu jam pelajaran. p_jam kosong = jam yang sedang berjalan (atau jam 1 bila di luar jam pelajaran).
create or replace function public.lms_pantau_jam(p_tanggal date default null, p_jam integer default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_hariini date := (now() at time zone 'Asia/Jakarta')::date;
        v_tgl date; v_hari integer; v_kel text; v_now integer; v_pilih integer;
begin
  if not (private.adalah_super() or private.punya_izin('lms.pantau_guru')) then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  v_tgl := coalesce(p_tanggal, v_hariini);
  v_hari := extract(isodow from v_tgl)::integer;
  v_kel := private.kelompok_jam(v_hari);
  v_now := case when v_tgl = v_hariini then private.lms_jam_ke() else 0 end;
  v_pilih := coalesce(p_jam, nullif(v_now, 0), 1);
  return jsonb_build_object(
    'tanggal', v_tgl, 'hari', v_hari, 'hari_ini', v_tgl = v_hariini,
    'menit_sekarang', (extract(hour from (now() at time zone 'Asia/Jakarta'))::integer * 60 + extract(minute from (now() at time zone 'Asia/Jakarta'))::integer),
    'jam_sekarang', v_now, 'jam_dipilih', v_pilih,
    'jam', coalesce((
      select jsonb_agg(jsonb_build_object('ke', j.r, 'label', j.label, 'mulai', to_char(j.mulai, 'HH24:MI'), 'selesai', to_char(j.selesai, 'HH24:MI'),
                                          'mulai_menit', extract(hour from j.mulai)::integer * 60 + extract(minute from j.mulai)::integer,
                                          'selesai_menit', extract(hour from j.selesai)::integer * 60 + extract(minute from j.selesai)::integer) order by j.r)
      from (select row_number() over (order by b.mulai) r, b.label, b.mulai, b.selesai
              from public.jam_bel b where b.aktif and b.jenis = 'pelajaran' and b.kelompok = v_kel) j), '[]'::jsonb),
    'baris', coalesce((
      select jsonb_agg(jsonb_build_object(
          'rombel_id', jd.rombel_id, 'rombel', r.nama, 'mapel', coalesce(m.nama, '-'), 'ptk_id', jd.ptk_id, 'guru', p.nama,
          'guru_masuk', gd.pertama is not null, 'guru_pertama', gd.pertama, 'guru_terakhir', gd.terakhir,
          'guru_online', coalesce(v_tgl = v_hariini and gh.terakhir_akses > now() - interval '5 minutes', false),
          'siswa_total', st.total, 'siswa_masuk', st.masuk,
          'ada_kelas', exists (select 1 from public.kelas_ajar k where k.rombel_id = jd.rombel_id and k.aktif
                                 and lower(btrim(k.mapel)) = lower(btrim(coalesce(m.nama, '')))),
          'ada_pertemuan', exists (select 1 from public.kelas_ajar k join public.pertemuan t on t.kelas_ajar_id = k.id
                                    where k.rombel_id = jd.rombel_id and k.aktif and lower(btrim(k.mapel)) = lower(btrim(coalesce(m.nama, '')))
                                      and t.tanggal = v_tgl and t.status = 'terbit')
        ) order by r.nama)
      from public.kur_jadwal jd
      join public.rombel r on r.id = jd.rombel_id and jd.semester_id = r.semester_id
                          and (private.adalah_super() or r.npsn = private.npsn_saya())
      left join public.kur_mapel m on m.id = jd.mapel_id
      left join public.ptk p on p.id = jd.ptk_id
      left join lateral (select d.pertama, d.terakhir from public.lms_denyut_jam d
                          where d.jenis = 'ptk' and d.pelaku_id = jd.ptk_id and d.tanggal = v_tgl and d.jam_ke = v_pilih) gd on true
      left join lateral (select h.terakhir_akses from public.lms_kehadiran_guru h
                          where h.ptk_id = jd.ptk_id and h.tanggal = v_tgl) gh on true
      left join lateral (select count(pd.id) total, count(d.pelaku_id) masuk
                           from public.keanggotaan_rombel kr
                           join public.peserta_didik pd on pd.id = kr.peserta_didik_id and pd.status_peserta_didik = 'aktif'
                           left join public.lms_denyut_jam d on d.jenis = 'pd' and d.pelaku_id = pd.id and d.tanggal = v_tgl and d.jam_ke = v_pilih
                          where kr.rombel_id = jd.rombel_id) st on true
      where jd.hari = v_hari and jd.jam_ke = v_pilih), '[]'::jsonb));
end $$;
revoke all on function public.lms_pantau_jam(date, integer) from public, anon;
grant execute on function public.lms_pantau_jam(date, integer) to authenticated;

-- Peringatan dari Waka Kurikulum ke guru. Satu pesan per guru per 10 menit supaya tidak membanjiri.
create or replace function public.lms_ingatkan(p_ptk uuid, p_pesan text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_dari text;
begin
  if not (private.adalah_super() or private.punya_izin('lms.pantau_guru')) then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_pesan, '')) = '' then raise exception 'Pesan kosong.' using errcode = '22023'; end if;
  if not exists (select 1 from public.ptk where id = p_ptk and (private.adalah_super() or npsn = private.npsn_saya())) then
    raise exception 'Guru tidak ditemukan.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.lms_peringatan where ptk_id = p_ptk and dibuat_pada > now() - interval '10 minutes') then
    return false;
  end if;
  select coalesce((select p.nama from public.ptk p where p.id = private.ptk_id_saya()), 'Waka Kurikulum') into v_dari;
  insert into public.lms_peringatan (ptk_id, dari_nama, pesan) values (p_ptk, v_dari, left(btrim(p_pesan), 500));
  return true;
end $$;
revoke all on function public.lms_ingatkan(uuid, text) from public, anon;
grant execute on function public.lms_ingatkan(uuid, text) to authenticated;

create or replace function public.lms_peringatan_saya() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'dari', w.dari_nama, 'pesan', w.pesan, 'waktu', w.dibuat_pada) order by w.dibuat_pada desc), '[]'::jsonb)
  from public.lms_peringatan w
  where w.ptk_id = private.ptk_id_saya() and not w.dibaca and w.dibuat_pada > now() - interval '24 hours'
$$;
revoke all on function public.lms_peringatan_saya() from public, anon;
grant execute on function public.lms_peringatan_saya() to authenticated;

create or replace function public.lms_peringatan_baca(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.lms_peringatan set dibaca = true where id = p_id and ptk_id = private.ptk_id_saya()
$$;
revoke all on function public.lms_peringatan_baca(uuid) from public, anon;
grant execute on function public.lms_peringatan_baca(uuid) to authenticated;

notify pgrst, 'reload schema';
