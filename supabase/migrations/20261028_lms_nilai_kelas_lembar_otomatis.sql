-- Rekap nilai: lembar kerja yang tertaut ke pertemuan memakai aturan nilai otomatis (lihat 20261004_lms_nilai_otomatis_kktp.sql).
-- Siswa tuntas (hadir, bacaan selesai, lembar kerja terkumpul) mendapat nilai dasar sebesar KKTP tanpa menunggu guru menilai.
-- Nilai yang diisi guru tetap dipakai bila lebih tinggi dari KKTP. Bonus kuis dan forum tidak dimasukkan ke kolom ini,
-- karena kuis sudah punya kolom sendiri. Tugas biasa (tidak tertaut pertemuan) tetap memakai nilai guru.
create or replace function public.lms_nilai_kelas(p_kelas uuid, p_bobot jsonb default '{"uh": 20, "uas": 20, "uts": 20, "kuis": 20, "tugas": 20}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare w_kuis numeric := coalesce((p_bobot ->> 'kuis')::numeric, 0);
        w_tugas numeric := coalesce((p_bobot ->> 'tugas')::numeric, 0);
        w_uh numeric := coalesce((p_bobot ->> 'uh')::numeric, 0);
        w_uas numeric := coalesce((p_bobot ->> 'uas')::numeric, 0);
        w_uts numeric := coalesce((p_bobot ->> 'uts')::numeric, 0);
begin
  if not private.lms_kelola(p_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return (
    with komp as (
      select a.id, 'asesmen'::text as sumber,
             case a.jenis when 'kuis' then 'kuis' when 'ulangan_harian' then 'uh' when 'ulangan_tengah' then 'uts' else 'uas' end as grup,
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
             (select case when x.auto is null then x.own else greatest(x.auto, coalesce(x.own, x.auto)) end
              from (select
                      (select kt.nilai / t.nilai_maks * 100 from public.kumpul_tugas kt join public.tugas t on t.id = kt.tugas_id
                        where kt.tugas_id = k.id and kt.peserta_didik_id = s.id and kt.nilai is not null) as own,
                      (select case when (z.j ->> 'tuntas')::boolean then (z.j ->> 'kktp')::numeric end
                         from (select private.lms_nilai_pertemuan_pd(m.pertemuan_id, s.id) as j
                                 from public.materi m
                                where m.tugas_id = k.id and m.untuk = 'siswa' and m.pertemuan_id is not null limit 1) z) as auto) x)
      from sis s join komp k on k.sumber = 'tugas'
    ),
    rata as (select pd, grup, avg(v) as r from nil where v is not null group by pd, grup)
    select jsonb_build_object(
      'komponen', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'sumber', sumber, 'grup', grup, 'judul', judul) order by dibuat_pada) from komp), '[]'::jsonb),
      'bobot', jsonb_build_object('kuis', w_kuis, 'tugas', w_tugas, 'uh', w_uh, 'uts', w_uts, 'uas', w_uas),
      'siswa', coalesce((select jsonb_agg(jsonb_build_object(
          'peserta_didik_id', s.id, 'nama', s.nama, 'nisn', s.nisn, 'no_urut', s.no_urut,
          'nilai', coalesce((select jsonb_object_agg(n.kid::text, round(n.v, 2)) from nil n where n.pd = s.id and n.v is not null), '{}'::jsonb),
          'rata', coalesce((select jsonb_object_agg(r.grup, round(r.r, 2)) from rata r where r.pd = s.id), '{}'::jsonb),
          'akhir', (select round(sum(r.r * w.b) / nullif(sum(w.b), 0), 2)
                    from rata r join (values ('kuis', w_kuis), ('tugas', w_tugas), ('uh', w_uh), ('uts', w_uts), ('uas', w_uas)) w(g, b) on w.g = r.grup
                    where r.pd = s.id and w.b > 0)
        ) order by s.no_urut nulls last, s.nama) from sis s), '[]'::jsonb)
    )
  );
end $$;
