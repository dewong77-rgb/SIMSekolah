-- Terpasang sebagai migrasi lms_fase5b_buku_nilai_ortu, lalu diperbaiki oleh lms_fase5c (di bawah).

create or replace function public.lms_nilai_kelas(p_kelas uuid, p_bobot jsonb default '{"kuis":20,"tugas":20,"uh":30,"uas":30}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare w_kuis numeric := coalesce((p_bobot ->> 'kuis')::numeric, 0);
        w_tugas numeric := coalesce((p_bobot ->> 'tugas')::numeric, 0);
        w_uh numeric := coalesce((p_bobot ->> 'uh')::numeric, 0);
        w_uas numeric := coalesce((p_bobot ->> 'uas')::numeric, 0);
begin
  if not private.lms_kelola(p_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return (
    with komp as (
      select a.id, 'asesmen'::text as sumber,
             case a.jenis when 'kuis' then 'kuis' when 'ulangan_harian' then 'uh' else 'uas' end as grup,
             a.judul, a.dibuat_pada
      from public.asesmen a where a.kelas_ajar_id = p_kelas and a.status = 'terbit' and not a.diarsipkan
      union all
      select t.id, 'tugas', 'tugas', t.judul, t.dibuat_pada
      from public.tugas t where t.kelas_ajar_id = p_kelas and t.status = 'terbit' and not t.dihapus
    ),
    sis as (
      select pd.id, pd.nama, pd.nisn, kr.no_urut
      from public.kelas_ajar ka
      join public.keanggotaan_rombel kr on kr.rombel_id = ka.rombel_id
      join public.peserta_didik pd on pd.id = kr.peserta_didik_id
      where ka.id = p_kelas
    ),
    nil as (
      select s.id as pd, k.id as kid, k.grup,
             (select max(p.nilai) from public.percobaan_asesmen p
               where p.asesmen_id = k.id and p.peserta_didik_id = s.id and p.selesai is not null) as v
      from sis s join komp k on k.sumber = 'asesmen'
      union all
      select s.id, k.id, k.grup,
             (select kt.nilai / t.nilai_maks * 100 from public.kumpul_tugas kt join public.tugas t on t.id = kt.tugas_id
               where kt.tugas_id = k.id and kt.peserta_didik_id = s.id and kt.nilai is not null)
      from sis s join komp k on k.sumber = 'tugas'
    ),
    rata as (select pd, grup, avg(v) as r from nil where v is not null group by pd, grup)
    select jsonb_build_object(
      'komponen', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'sumber', sumber, 'grup', grup, 'judul', judul) order by dibuat_pada) from komp), '[]'::jsonb),
      'bobot', jsonb_build_object('kuis', w_kuis, 'tugas', w_tugas, 'uh', w_uh, 'uas', w_uas),
      'siswa', coalesce((select jsonb_agg(jsonb_build_object(
          'peserta_didik_id', s.id, 'nama', s.nama, 'nisn', s.nisn, 'no_urut', s.no_urut,
          'nilai', coalesce((select jsonb_object_agg(n.kid::text, round(n.v, 2)) from nil n where n.pd = s.id and n.v is not null), '{}'::jsonb),
          'rata', coalesce((select jsonb_object_agg(r.grup, round(r.r, 2)) from rata r where r.pd = s.id), '{}'::jsonb),
          'akhir', (select round(sum(r.r * w.b) / nullif(sum(w.b), 0), 2)
                    from rata r join (values ('kuis', w_kuis), ('tugas', w_tugas), ('uh', w_uh), ('uas', w_uas)) w(g, b) on w.g = r.grup
                    where r.pd = s.id and w.b > 0)
        ) order by s.no_urut nulls last, s.nama) from sis s), '[]'::jsonb)
    )
  );
end $$;

create or replace function public.lms_anak_ringkasan() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'peserta_didik_id', pd.id, 'nama', pd.nama,
      'kelas', coalesce((select jsonb_agg(jsonb_build_object(
          'mapel', k.mapel, 'rombel', r.nama, 'guru', g.nama,
          'sesi', (select count(*) from public.pertemuan t where t.kelas_ajar_id = k.id and t.status = 'terbit' and t.absen_buka is not null),
          'hadir', (select count(*) from public.absensi_pertemuan a join public.pertemuan t on t.id = a.pertemuan_id where t.kelas_ajar_id = k.id and a.peserta_didik_id = pd.id and a.status = 'hadir'),
          'izin', (select count(*) from public.absensi_pertemuan a join public.pertemuan t on t.id = a.pertemuan_id where t.kelas_ajar_id = k.id and a.peserta_didik_id = pd.id and a.status = 'izin'),
          'sakit', (select count(*) from public.absensi_pertemuan a join public.pertemuan t on t.id = a.pertemuan_id where t.kelas_ajar_id = k.id and a.peserta_didik_id = pd.id and a.status = 'sakit'),
          'alpa', (select count(*) from public.absensi_pertemuan a join public.pertemuan t on t.id = a.pertemuan_id where t.kelas_ajar_id = k.id and a.peserta_didik_id = pd.id and a.status = 'alpa'),
          'kuis', coalesce((select jsonb_agg(jsonb_build_object('judul', a.judul, 'jenis', a.jenis,
                    'nilai', (select max(p.nilai) from public.percobaan_asesmen p where p.asesmen_id = a.id and p.peserta_didik_id = pd.id and p.selesai is not null)) order by a.dibuat_pada)
                  from public.asesmen a where a.kelas_ajar_id = k.id and a.status = 'terbit' and not a.diarsipkan), '[]'::jsonb),
          'tugas', coalesce((select jsonb_agg(jsonb_build_object('judul', t.judul, 'tenggat', t.tenggat, 'nilai_maks', t.nilai_maks,
                    'status', case when kt.tugas_id is null then 'belum' when kt.nilai is not null then 'dinilai' when kt.terlambat then 'terlambat' else 'terkumpul' end,
                    'nilai', kt.nilai) order by t.dibuat_pada)
                  from public.tugas t left join public.kumpul_tugas kt on kt.tugas_id = t.id and kt.peserta_didik_id = pd.id
                  where t.kelas_ajar_id = k.id and t.status = 'terbit' and not t.dihapus), '[]'::jsonb)
        ) order by k.mapel)
        from public.kelas_ajar k
        join public.keanggotaan_rombel kr on kr.rombel_id = k.rombel_id and kr.peserta_didik_id = pd.id
        join public.rombel r on r.id = k.rombel_id
        join public.ptk g on g.id = k.ptk_id
        where k.aktif), '[]'::jsonb)
    ) order by pd.nama)
    from public.peserta_didik pd where pd.id in (select private.anak_saya())), '[]'::jsonb);
end $$;

-- lms_fase5c: perbaikan, nilai tidak lagi menghitung soal yang sudah dihapus.
create or replace function private.lms_selesaikan(p_percobaan uuid) returns numeric
language plpgsql security definer set search_path = '' as $$
declare p public.percobaan_asesmen%rowtype; v_nilai numeric;
begin
  select * into p from public.percobaan_asesmen where id = p_percobaan for update;
  if not found then return null; end if;
  if p.selesai is not null then return p.nilai; end if;
  select coalesce(round(100.0 * sum(case when j.pilihan = s.kunci then s.bobot else 0 end) / nullif(sum(s.bobot), 0), 2), 0)
    into v_nilai
  from public.soal s
  left join public.jawaban_asesmen j on j.soal_id = s.id and j.percobaan_id = p.id
  where s.asesmen_id = p.asesmen_id and not s.dihapus;
  update public.percobaan_asesmen set selesai = now(), nilai = v_nilai where id = p.id;
  return v_nilai;
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
