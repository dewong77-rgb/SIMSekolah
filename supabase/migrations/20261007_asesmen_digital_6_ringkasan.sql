-- Asesmen Digital, bagian 6: ringkasan beranda dan pengawasan semua sesi.
-- Hanya baca. Admin (super admin, Waka dan Staf Kurikulum) melihat seluruh sekolah, guru hanya miliknya.

create or replace function public.ad_ringkasan() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n text := private.npsn_saya(); adm boolean := private.ad_admin(); pk uuid := private.ptk_id_saya(); r jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Perlu masuk.' using errcode = '28000'; end if;
  if not private.ad_bisa_bank() then raise exception 'Tidak berwenang'; end if;
  r := jsonb_build_object(
    'admin', adm,
    'ujian_aktif', (select count(*) from public.ad_ujian where npsn = n and status = 'aktif'),
    'ujian_draf', (select count(*) from public.ad_ujian where npsn = n and status = 'draf'),
    'ujian_selesai', (select count(*) from public.ad_ujian where npsn = n and status = 'selesai'),
    'sesi_berlangsung', (select count(*) from public.ad_sesi s join public.ad_ujian u on u.id = s.ujian_id
                          where s.npsn = n and u.status = 'aktif' and now() between s.mulai and s.selesai),
    'sesi_berikut', (select to_jsonb(x) from (
        select s.nama as sesi, u.nama as ujian, s.mulai, s.selesai
        from public.ad_sesi s join public.ad_ujian u on u.id = s.ujian_id
        where s.npsn = n and u.status = 'aktif' and s.selesai > now() order by s.mulai limit 1) x),
    'guru', coalesce((select jsonb_agg(to_jsonb(g) order by g.guru, g.mapel) from (
        select p.id as ptk_id, p.nama as guru, k.mapel,
               (select count(*) from public.ad_bank b join public.profil_pengguna pp on pp.user_id = b.pemilik
                 where b.npsn = n and pp.ptk_id = p.id and lower(trim(b.mapel)) = lower(trim(k.mapel))) as bank,
               (select count(*) from public.ad_soal s join public.ad_bank b on b.id = s.bank_id
                 join public.profil_pengguna pp on pp.user_id = b.pemilik
                 where b.npsn = n and pp.ptk_id = p.id and lower(trim(b.mapel)) = lower(trim(k.mapel))) as soal
        from (select distinct ptk_id, mapel from public.kelas_ajar where aktif) k
        join public.ptk p on p.id = k.ptk_id and p.npsn = n
        where adm or k.ptk_id = pk) g), '[]'::jsonb)
  );
  if adm then
    r := r || jsonb_build_object(
      'ruang', (select count(*) from public.ad_ruang where npsn = n),
      'paket', (select count(*) from public.ad_paket pk2 join public.ad_ujian u on u.id = pk2.ujian_id where pk2.npsn = n and u.status <> 'selesai'),
      'sesi_tanpa_pengawas', (select count(*) from public.ad_sesi_ruang sr join public.ad_sesi s on s.id = sr.sesi_id
                               join public.ad_ujian u on u.id = s.ujian_id
                               where s.npsn = n and u.status <> 'selesai' and s.selesai > now() and sr.pengawas_ptk_id is null),
      'peserta', (select count(*) from public.ad_peserta pe join public.ad_sesi s on s.id = pe.sesi_id
                   join public.ad_ujian u on u.id = s.ujian_id where s.npsn = n and u.status = 'aktif'),
      'mengerjakan', (select count(*) from public.ad_percobaan pc join public.ad_peserta pe on pe.id = pc.peserta_id
                       join public.ad_sesi s on s.id = pe.sesi_id join public.ad_ujian u on u.id = s.ujian_id
                       where s.npsn = n and u.status = 'aktif' and pc.selesai is null and pc.batas > now()),
      'selesai', (select count(*) from public.ad_percobaan pc join public.ad_peserta pe on pe.id = pc.peserta_id
                   join public.ad_sesi s on s.id = pe.sesi_id join public.ad_ujian u on u.id = s.ujian_id
                   where s.npsn = n and u.status = 'aktif' and pc.selesai is not null),
      'bank_mapel', coalesce((select jsonb_agg(to_jsonb(m) order by m.mapel) from (
          select min(b.mapel) as mapel, count(distinct b.id) as bank, count(s.id) as soal
          from public.ad_bank b left join public.ad_soal s on s.bank_id = b.id
          where b.npsn = n group by lower(trim(b.mapel))) m), '[]'::jsonb)
    );
  end if;
  return r;
end $$;

-- Semua ruang dan sesi untuk admin: status token, pengawas, dan jumlah siswa per keadaan.
create or replace function public.ad_pengawasan_semua() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n text := private.ad_wajib_admin();
begin
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.mulai, x.ruang) from (
    select sr.id, u.id as ujian_id, u.nama as ujian, u.durasi_menit, s.id as sesi_id, s.nama as sesi, s.mulai, s.selesai,
           r.nama as ruang, (select nama from public.ad_paket where id = s.paket_id) as mapel,
           sr.pengawas_ptk_id, (select nama from public.ptk where id = sr.pengawas_ptk_id) as pengawas,
           sr.token, sr.token_dibuka,
           (select count(*) from public.ad_peserta pe where pe.sesi_ruang_id = sr.id) as peserta,
           (select count(*) from public.ad_peserta pe join public.ad_percobaan pc on pc.peserta_id = pe.id
             where pe.sesi_ruang_id = sr.id and pc.selesai is null and pc.batas > now()) as mengerjakan,
           (select count(*) from public.ad_peserta pe join public.ad_percobaan pc on pc.peserta_id = pe.id
             where pe.sesi_ruang_id = sr.id and pc.selesai is not null) as selesai_n,
           (select count(*) from public.ad_peserta pe join public.ad_percobaan pc on pc.peserta_id = pe.id
             where pe.sesi_ruang_id = sr.id and pc.terkunci and pc.selesai is null) as terkunci
    from public.ad_sesi_ruang sr join public.ad_sesi s on s.id = sr.sesi_id join public.ad_ujian u on u.id = s.ujian_id
    join public.ad_ruang r on r.id = sr.ruang_id
    where s.npsn = n and u.status = 'aktif' and s.selesai > now() - interval '1 day') x), '[]'::jsonb);
end $$;

revoke all on function public.ad_ringkasan() from public, anon;
revoke all on function public.ad_pengawasan_semua() from public, anon;
grant execute on function public.ad_ringkasan() to authenticated;
grant execute on function public.ad_pengawasan_semua() to authenticated;
