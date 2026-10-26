-- Percepat dua RPC yang paling sering dipanggil portal. Keluaran tidak berubah (diuji identik pada 17 pengguna).
--
-- lms_kelas_saya: sebelumnya memanggil private.lms_kelola/lms_anggota berkali-kali untuk tiap dari 372 kelas aktif,
-- dan tiap panggilan mengquery profil_pengguna lagi. Kini konteks pengguna dihitung sekali.
-- chat_ringkasan: sebelumnya memanggil private.chat_akses untuk semua ruang aktif. Kini hanya untuk ruang
-- yang punya pesan belum dibaca (hasil sama: ruang tanpa pesan baru selalu menyumbang 0).

create or replace function public.lms_kelas_saya()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  with me as materialized (
    select private.adalah_super() su, private.npsn_saya() npsn, private.ptk_id_saya() ptk,
           private.peran_saya() peran, private.pd_id_saya() pd
  ), k as (
    select k.*,
           coalesce(me.su or (k.npsn = me.npsn and (k.ptk_id = me.ptk or me.peran = 'admin_tu')), false) as kelola,
           me.pd as pd_saya
    from public.kelas_ajar k cross join me
    where k.aktif
  )
  select coalesce(jsonb_agg(s.x order by s.x->>'rombel', s.x->>'mapel'), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', k.id, 'mapel', k.mapel, 'rombel', r.nama, 'rombel_id', r.id,
      'guru', p.nama, 'semester', k.semester_id,
      'peran', case when k.kelola then 'pengelola' else 'siswa' end,
      'jumlah_pertemuan', (select count(*) from public.pertemuan t
         where t.kelas_ajar_id = k.id and (k.kelola or t.status = 'terbit'))
    ) x
    from k
    join public.rombel r on r.id = k.rombel_id
    join public.ptk p on p.id = k.ptk_id
    where k.kelola
       or exists (select 1 from public.keanggotaan_rombel kr
                  where kr.rombel_id = k.rombel_id and kr.peserta_didik_id = k.pd_saya)
  ) s
$$;

create or replace function public.chat_ringkasan()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null or private.npsn_saya() is null then return 0; end if;
  select coalesce(sum(case when u.cnt > 0
                           then (case when private.chat_akses(u.id) = 'peserta' then u.cnt else 0 end)
                           else 0 end), 0)::int
    into n from (
      select c.id,
             (select count(*) from public.chat_pesan m
               where m.ruang_id = c.id and m.pengirim_user_id <> uid and m.dihapus_pada is null
                 and m.dibuat_pada > coalesce((select b.terakhir_dibaca_pada from public.chat_baca b
                                               where b.ruang_id = c.id and b.user_id = uid), '-infinity')) cnt
      from public.chat_ruang c
      where c.aktif and c.npsn = private.npsn_saya()
    ) u;
  return n;
end $$;
