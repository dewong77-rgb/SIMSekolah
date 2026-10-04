-- Terbitkan serentak: semua kelas yang punya pertemuan sama dibuka bersama. Kelas yang belum punya salinan
-- dibuatkan lebih dulu (bagikan), lalu semua salinan draf yang memuat minimal satu materi untuk siswa diterbitkan
-- beserta lembar kerja dan latihan bersoal.
create or replace function public.lms_terbitkan_serentak(p_pertemuan uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; r jsonb; v_dibagi int := 0; v_ids uuid[]; v_siap uuid[]; v_kosong int;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if not exists (select 1 from public.materi m where m.pertemuan_id = p_pertemuan and m.untuk = 'siswa') then
    raise exception 'Pertemuan sumber belum punya materi untuk siswa.' using errcode = 'P0001';
  end if;
  -- sumber ikut terbit
  update public.pertemuan set status = 'terbit' where id = p_pertemuan;
  update public.tugas set status = 'terbit' where pertemuan_id = p_pertemuan and not dihapus and status <> 'terbit'
    and id in (select tugas_id from public.materi where pertemuan_id = p_pertemuan and tugas_id is not null);
  update public.asesmen set status = 'terbit' where pertemuan_id = p_pertemuan and not diarsipkan and status <> 'terbit'
    and exists (select 1 from public.soal s where s.asesmen_id = asesmen.id and not s.dihapus);
  -- kelas yang belum punya salinan
  if exists (select 1 from jsonb_array_elements(public.lms_salin_tujuan(p_pertemuan)) e where not (e->>'sudah_ada')::boolean) then
    r := public.lms_bagikan_pertemuan(p_pertemuan);
    v_dibagi := coalesce((r->>'disalin')::int, 0);
  end if;
  -- salinan draf yang sudah ada
  select array_agg(x) into v_ids from private.lms_saudara(p_pertemuan) x;
  select array_agg(q.id) into v_siap from public.pertemuan q
    where q.id = any (v_ids) and q.status = 'draf'
      and exists (select 1 from public.materi m where m.pertemuan_id = q.id and m.untuk = 'siswa');
  select count(*) into v_kosong from public.pertemuan q
    where q.id = any (v_ids) and q.status = 'draf' and not exists (select 1 from public.materi m where m.pertemuan_id = q.id and m.untuk = 'siswa');
  if v_siap is not null then
    update public.tugas set status = 'terbit' where pertemuan_id = any (v_siap) and not dihapus and status <> 'terbit'
      and id in (select tugas_id from public.materi where pertemuan_id = any (v_siap) and tugas_id is not null);
    update public.asesmen set status = 'terbit' where pertemuan_id = any (v_siap) and not diarsipkan and status <> 'terbit'
      and exists (select 1 from public.soal s where s.asesmen_id = asesmen.id and not s.dihapus);
    update public.pertemuan set status = 'terbit' where id = any (v_siap);
  end if;
  return jsonb_build_object('dibagikan', v_dibagi, 'diterbitkan', coalesce(array_length(v_siap, 1), 0), 'dilewati_tanpa_materi', v_kosong);
end $$;
revoke all on function public.lms_terbitkan_serentak(uuid) from public, anon;
grant execute on function public.lms_terbitkan_serentak(uuid) to authenticated;
