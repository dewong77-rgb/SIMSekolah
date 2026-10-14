-- Nilai Asesmen digital (CBT: UTS, UAS) untuk siswa satu kelas ajar, dibaca guru pengelola kelas dari Rekap nilai.
-- Paket CBT tidak menyimpan mapel, jadi tiap kolom (ujian + paket) memuat penanda `cocok`:
-- nama paket atau ujian memuat nama mapel kelas. Antarmuka menampilkan yang cocok lebih dulu.
create or replace function public.lms_nilai_cbt(p_kelas uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_mapel text; v_rombel uuid;
begin
  if not private.lms_kelola(p_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  select k.mapel, k.rombel_id into v_mapel, v_rombel from public.kelas_ajar k where k.id = p_kelas;
  return (
    with sis as (
      select pd.id from public.keanggotaan_rombel kr
      join public.peserta_didik pd on pd.id = kr.peserta_didik_id
      where kr.rombel_id = v_rombel
    ),
    nil as (
      select u.id as ujian_id, u.nama as ujian, u.jenis, u.dibuat_pada, pk.id as paket_id, pk.nama as paket,
             pe.peserta_didik_id as pd, max(pc.nilai) as v
      from public.ad_ujian u
      join public.ad_sesi s on s.ujian_id = u.id
      join public.ad_paket pk on pk.id = s.paket_id
      join public.ad_peserta pe on pe.sesi_id = s.id and pe.peserta_didik_id in (select id from sis)
      left join public.ad_percobaan pc on pc.peserta_id = pe.id and pc.selesai is not null
      where u.status in ('aktif', 'selesai')
      group by u.id, u.nama, u.jenis, u.dibuat_pada, pk.id, pk.nama, pe.peserta_didik_id
    ),
    kol as (
      select distinct ujian_id, ujian, jenis, dibuat_pada, paket_id, paket,
             position(lower(btrim(v_mapel)) in lower(paket || ' ' || ujian)) > 0 as cocok
      from nil
    )
    select jsonb_build_object(
      'kolom', coalesce((select jsonb_agg(jsonb_build_object(
          'id', ujian_id::text || ':' || paket_id::text, 'ujian', ujian, 'jenis', jenis, 'paket', paket, 'cocok', cocok
        ) order by cocok desc, dibuat_pada, paket) from kol), '[]'::jsonb),
      'nilai', coalesce((select jsonb_agg(jsonb_build_object(
          'peserta_didik_id', n.pd, 'kolom', n.ujian_id::text || ':' || n.paket_id::text, 'nilai', n.v
        )) from nil n where n.v is not null), '[]'::jsonb)
    )
  );
end $$;
revoke execute on function public.lms_nilai_cbt(uuid) from public, anon;
grant execute on function public.lms_nilai_cbt(uuid) to authenticated;
