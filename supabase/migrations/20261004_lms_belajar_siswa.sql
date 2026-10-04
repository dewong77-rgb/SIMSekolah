-- Langkah belajar siswa pada satu pertemuan (untuk tampilan sederhana), dan pantauan forum untuk guru:
-- utas yang kiriman terakhirnya dari siswa, artinya menunggu balasan guru.

create or replace function public.lms_langkah_siswa(p_pertemuan uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_pd uuid := private.pd_id_saya(); t public.pertemuan%rowtype; v_status text; r jsonb;
begin
  if v_pd is null then raise exception 'Khusus siswa.' using errcode = '42501'; end if;
  select * into t from public.pertemuan where id = p_pertemuan and status = 'terbit';
  if not found or not private.lms_anggota(t.kelas_ajar_id) then raise exception 'Pertemuan tidak ditemukan.' using errcode = '42501'; end if;
  select a.status into v_status from public.absensi_pertemuan a where a.pertemuan_id = t.id and a.peserta_didik_id = v_pd;
  r := jsonb_build_object(
    'absen', jsonb_build_object('perlu', t.wajib_absen or t.absen_buka is not null, 'status', v_status,
       'terbuka', t.absen_buka is not null and t.absen_buka <= now() and (t.absen_tutup is null or t.absen_tutup > now()),
       'pakai_kode', t.kode_absen is not null),
    'materi', jsonb_build_object(
       'total', (select count(*) from public.materi m where m.pertemuan_id = t.id and m.untuk = 'siswa' and m.tugas_id is null),
       'selesai', (select count(*) from public.materi m join public.progres_materi pm on pm.materi_id = m.id and pm.peserta_didik_id = v_pd
                    where m.pertemuan_id = t.id and m.untuk = 'siswa' and m.tugas_id is null)),
    'lembar', jsonb_build_object(
       'total', (select count(*) from public.materi m where m.pertemuan_id = t.id and m.untuk = 'siswa' and m.tugas_id is not null),
       'terkumpul', (select count(*) from public.materi m join public.kumpul_tugas c on c.tugas_id = m.tugas_id and c.peserta_didik_id = v_pd
                      where m.pertemuan_id = t.id and m.untuk = 'siswa' and m.tugas_id is not null)),
    'latihan', jsonb_build_object(
       'total', (select count(*) from public.asesmen a where a.pertemuan_id = t.id and a.status = 'terbit' and not a.diarsipkan),
       'selesai', (select count(*) from public.asesmen a where a.pertemuan_id = t.id and a.status = 'terbit' and not a.diarsipkan
                    and exists (select 1 from public.percobaan_asesmen p where p.asesmen_id = a.id and p.peserta_didik_id = v_pd and p.selesai is not null))),
    'forum', jsonb_build_object(
       'topik', (select count(*) from public.forum_topik f where f.pertemuan_id = t.id and not f.dihapus),
       'ikut', exists (select 1 from public.forum_topik f join public.profil_pengguna u on u.user_id = f.penulis_user
                        where f.pertemuan_id = t.id and not f.dihapus and u.peserta_didik_id = v_pd)
               or exists (select 1 from public.forum_balasan b join public.forum_topik f on f.id = b.topik_id join public.profil_pengguna u on u.user_id = b.penulis_user
                        where f.pertemuan_id = t.id and not b.dihapus and u.peserta_didik_id = v_pd)));
  return r;
end $$;
revoke all on function public.lms_langkah_siswa(uuid) from public, anon;
grant execute on function public.lms_langkah_siswa(uuid) to authenticated;

-- Beranda belajar siswa: pertemuan terbit terbaru per kelas beserta status singkat.
create or replace function public.lms_beranda_siswa()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_pd uuid := private.pd_id_saya();
begin
  if v_pd is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'mapel') from (
      select jsonb_build_object('kelas_id', ka.id, 'mapel', ka.mapel, 'rombel', r.nama, 'guru', (select g.nama from public.ptk g where g.id = ka.ptk_id),
        'pertemuan_id', p.id, 'judul', p.judul, 'nomor', p.nomor, 'tanggal', p.tanggal,
        'absen_terbuka', p.absen_buka is not null and p.absen_buka <= now() and (p.absen_tutup is null or p.absen_tutup > now()),
        'sudah_absen', exists (select 1 from public.absensi_pertemuan a where a.pertemuan_id = p.id and a.peserta_didik_id = v_pd),
        'perlu_absen', p.wajib_absen) x
      from public.kelas_ajar ka
      join public.keanggotaan_rombel kr on kr.rombel_id = ka.rombel_id and kr.peserta_didik_id = v_pd
      join public.rombel r on r.id = ka.rombel_id
      left join lateral (select * from public.pertemuan q where q.kelas_ajar_id = ka.id and q.status = 'terbit' order by q.tanggal desc, q.nomor desc limit 1) p on true
      where ka.aktif
    ) s), '[]'::jsonb);
end $$;
revoke all on function public.lms_beranda_siswa() from public, anon;
grant execute on function public.lms_beranda_siswa() to authenticated;

create or replace function public.lms_forum_menunggu()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_ptk uuid := private.ptk_id_saya();
begin
  if v_ptk is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('topik_id', f.id, 'pertemuan_id', f.pertemuan_id, 'kelas_id', ka.id, 'mapel', ka.mapel,
        'rombel', r.nama, 'pertemuan', p.judul, 'topik', f.judul, 'dari', l.nama, 'cuplikan', left(l.isi, 140), 'waktu', l.waktu,
        'jumlah_siswa_menulis', (select count(*) from public.forum_balasan b where b.topik_id = f.id and not b.dihapus and b.penulis_peran <> 'guru')
                                + (case when f.penulis_peran <> 'guru' then 1 else 0 end))
      order by l.waktu)
    from public.forum_topik f
    join public.pertemuan p on p.id = f.pertemuan_id
    join public.kelas_ajar ka on ka.id = f.kelas_ajar_id and ka.ptk_id = v_ptk and ka.aktif
    join public.rombel r on r.id = ka.rombel_id
    cross join lateral (
      select z.nama, z.isi, z.waktu, z.peran from (
        select f.penulis_nama nama, f.isi, f.dibuat_pada waktu, f.penulis_peran peran
        union all
        select b.penulis_nama, b.isi, b.dibuat_pada, b.penulis_peran from public.forum_balasan b where b.topik_id = f.id and not b.dihapus
      ) z order by z.waktu desc limit 1) l
    where not f.dihapus and l.peran <> 'guru' and p.dibuat_pada > now() - interval '60 days'
  ), '[]'::jsonb);
end $$;
revoke all on function public.lms_forum_menunggu() from public, anon;
grant execute on function public.lms_forum_menunggu() to authenticated;
