-- Terpasang sebagai migrasi lms_fase7a_progres_siswa_ortu dan lms_fase7b_tautan_ortu.
-- Catatan: ortu_lepas (melepas tautan, memakai delete) ditolak oleh tool migrasi dan belum dibuat.
-- Bila perlu, buat lewat dashboard Supabase: hapus baris akun_anak untuk (user_id, peserta_didik_id) setelah memeriksa npsn.

-- 7a. Ringkasan belajar satu siswa. Nilai kuis mengikuti pengaturan guru (tampil_hasil), juga untuk orang tua.
create or replace function private.lms_kelas_ringkas(p_pd uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'kelas_id', k.id, 'mapel', k.mapel, 'rombel', r.nama, 'guru', g.nama,
      'sesi', (select count(*) from public.pertemuan t where t.kelas_ajar_id = k.id and t.status = 'terbit' and t.absen_buka is not null),
      'hadir', (select count(*) from public.absensi_pertemuan a join public.pertemuan t on t.id = a.pertemuan_id where t.kelas_ajar_id = k.id and a.peserta_didik_id = p_pd and a.status = 'hadir'),
      'izin', (select count(*) from public.absensi_pertemuan a join public.pertemuan t on t.id = a.pertemuan_id where t.kelas_ajar_id = k.id and a.peserta_didik_id = p_pd and a.status = 'izin'),
      'sakit', (select count(*) from public.absensi_pertemuan a join public.pertemuan t on t.id = a.pertemuan_id where t.kelas_ajar_id = k.id and a.peserta_didik_id = p_pd and a.status = 'sakit'),
      'alpa', (select count(*) from public.absensi_pertemuan a join public.pertemuan t on t.id = a.pertemuan_id where t.kelas_ajar_id = k.id and a.peserta_didik_id = p_pd and a.status = 'alpa'),
      'materi_total', (select count(*) from public.materi m join public.pertemuan t on t.id = m.pertemuan_id where t.kelas_ajar_id = k.id and t.status = 'terbit'),
      'materi_selesai', (select count(*) from public.progres_materi pm join public.materi m on m.id = pm.materi_id join public.pertemuan t on t.id = m.pertemuan_id
                         where t.kelas_ajar_id = k.id and t.status = 'terbit' and pm.peserta_didik_id = p_pd),
      'kuis', coalesce((select jsonb_agg(jsonb_build_object('judul', a.judul, 'jenis', a.jenis, 'kkm', a.kkm,
                'status', case
                  when not exists (select 1 from public.percobaan_asesmen p where p.asesmen_id = a.id and p.peserta_didik_id = p_pd and p.selesai is not null) then 'belum'
                  when not a.tampil_hasil then 'disembunyikan'
                  when (select max(p.nilai) from public.percobaan_asesmen p where p.asesmen_id = a.id and p.peserta_didik_id = p_pd and p.selesai is not null) is null then 'menunggu'
                  else 'nilai' end,
                'nilai', case when a.tampil_hasil then (select max(p.nilai) from public.percobaan_asesmen p where p.asesmen_id = a.id and p.peserta_didik_id = p_pd and p.selesai is not null) end
              ) order by a.dibuat_pada)
              from public.asesmen a where a.kelas_ajar_id = k.id and a.status = 'terbit' and not a.diarsipkan), '[]'::jsonb),
      'tugas', coalesce((select jsonb_agg(jsonb_build_object('judul', t.judul, 'tenggat', t.tenggat, 'nilai_maks', t.nilai_maks,
                'status', case when kt.tugas_id is null then 'belum' when kt.nilai is not null then 'dinilai' when kt.terlambat then 'terlambat' else 'terkumpul' end,
                'nilai', kt.nilai) order by t.dibuat_pada)
              from public.tugas t left join public.kumpul_tugas kt on kt.tugas_id = t.id and kt.peserta_didik_id = p_pd
              where t.kelas_ajar_id = k.id and t.status = 'terbit' and not t.dihapus), '[]'::jsonb)
    ) order by k.mapel), '[]'::jsonb)
  from public.kelas_ajar k
  join public.keanggotaan_rombel kr on kr.rombel_id = k.rombel_id and kr.peserta_didik_id = p_pd
  join public.rombel r on r.id = k.rombel_id
  join public.ptk g on g.id = k.ptk_id
  where k.aktif
$$;

create or replace function public.lms_anak_ringkasan() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('peserta_didik_id', pd.id, 'nama', pd.nama, 'kelas', private.lms_kelas_ringkas(pd.id)) order by pd.nama), '[]'::jsonb)
  from public.peserta_didik pd where pd.id in (select private.anak_saya())
$$;

create or replace function public.lms_progres_saya() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_pd uuid := private.pd_id_saya();
begin
  if v_pd is null then raise exception 'Hanya untuk siswa.' using errcode = '42501'; end if;
  return jsonb_build_object('nama', (select nama from public.peserta_didik where id = v_pd), 'kelas', private.lms_kelas_ringkas(v_pd));
end $$;

-- 7b. Admin TU menautkan akun orang tua ke anak, dalam satu sekolah.
create or replace function private.ortu_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.peran_saya() = 'admin_tu' or private.adalah_super()
$$;

create or replace function public.ortu_cari_siswa(p_q text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.ortu_admin() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_q, ''))) < 2 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('id', pd.id, 'nama', pd.nama, 'nisn', pd.nisn,
      'rombel', (select r.nama from public.keanggotaan_rombel kr join public.rombel r on r.id = kr.rombel_id where kr.peserta_didik_id = pd.id limit 1)) as x
    from public.peserta_didik pd
    where (private.adalah_super() or pd.npsn = private.npsn_saya())
      and (pd.nama ilike '%' || btrim(p_q) || '%' or pd.nisn = btrim(p_q))
    order by pd.nama limit 20) s), '[]'::jsonb);
end $$;

create or replace function public.ortu_tautan_daftar() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.ortu_admin() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'user_id', pp.user_id, 'email', u.email,
      'anak', coalesce((select jsonb_agg(jsonb_build_object('id', pd.id, 'nama', pd.nama, 'nisn', pd.nisn) order by pd.nama)
                from public.akun_anak aa join public.peserta_didik pd on pd.id = aa.peserta_didik_id where aa.user_id = pp.user_id), '[]'::jsonb)
    ) order by u.email)
    from public.profil_pengguna pp join auth.users u on u.id = pp.user_id
    where pp.peran = 'orang_tua' and (private.adalah_super() or pp.npsn = private.npsn_saya())), '[]'::jsonb);
end $$;

create or replace function public.ortu_tautkan(p_user uuid, p_pd uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_npsn text;
begin
  if not private.ortu_admin() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  select npsn into v_npsn from public.profil_pengguna where user_id = p_user and peran = 'orang_tua';
  if v_npsn is null then raise exception 'Akun bukan orang tua.' using errcode = '22023'; end if;
  if not (private.adalah_super() or v_npsn = private.npsn_saya()) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if not exists (select 1 from public.peserta_didik where id = p_pd and npsn = v_npsn) then
    raise exception 'Siswa bukan dari sekolah yang sama.' using errcode = '22023';
  end if;
  insert into public.akun_anak (user_id, peserta_didik_id) values (p_user, p_pd) on conflict do nothing;
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and (p.proname like 'lms\_%' or p.proname like 'ortu\_%')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
