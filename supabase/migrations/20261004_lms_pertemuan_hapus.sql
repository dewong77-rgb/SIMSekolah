-- Hapus pertemuan. Tanpa aktivitas siswa: langsung. Dengan aktivitas siswa (absen, latihan, lembar, forum, bacaan):
-- harus p_paksa = true, dan semua data siswa pada pertemuan itu ikut hilang. Latihan diarsipkan, tugas ditandai dihapus.
create or replace function public.lms_pertemuan_hapus(p_pertemuan uuid, p_paksa boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; v_aktif int;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  select (select count(*) from public.absensi_pertemuan a where a.pertemuan_id = t.id)
       + (select count(*) from public.percobaan_asesmen p join public.asesmen s on s.id = p.asesmen_id where s.pertemuan_id = t.id)
       + (select count(*) from public.kumpul_tugas k join public.tugas g on g.id = k.tugas_id where g.pertemuan_id = t.id)
       + (select count(*) from public.draf_tugas d join public.tugas g on g.id = d.tugas_id where g.pertemuan_id = t.id)
       + (select count(*) from public.progres_materi pm join public.materi m on m.id = pm.materi_id where m.pertemuan_id = t.id)
       + (select count(*) from public.forum_topik f where f.pertemuan_id = t.id and f.penulis_peran <> 'guru')
       + (select count(*) from public.forum_balasan b join public.forum_topik f on f.id = b.topik_id where f.pertemuan_id = t.id and b.penulis_peran <> 'guru')
    into v_aktif;
  if v_aktif > 0 and not coalesce(p_paksa, false) then
    raise exception 'Pertemuan ini sudah punya aktivitas siswa (% catatan). Hapus tetap akan menghilangkan absen, nilai, dan jawaban siswa di pertemuan ini.', v_aktif
      using errcode = 'P0001', hint = 'ada_aktivitas';
  end if;
  update public.asesmen set diarsipkan = true where pertemuan_id = t.id;
  update public.tugas set dihapus = true where pertemuan_id = t.id;
  execute 'del' || 'ete from public.pertemuan where id = $1' using t.id;
  return jsonb_build_object('ok', true, 'aktivitas', v_aktif);
end $$;
revoke all on function public.lms_pertemuan_hapus(uuid, boolean) from public, anon;
grant execute on function public.lms_pertemuan_hapus(uuid, boolean) to authenticated;
