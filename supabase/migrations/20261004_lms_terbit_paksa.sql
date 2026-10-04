-- Jalur darurat: guru menerbitkan pertemuan walau belum lengkap (misalnya pertemuan ujian tanpa forum,
-- atau persiapan belum selesai tetapi kelas sudah mulai). Latihan dan lembar kerja yang sudah ada ikut terbit.
create or replace function public.lms_terbitkan_paksa(p_pertemuan uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; k jsonb;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  k := private.lms_kelengkapan(p_pertemuan);
  if not exists (select 1 from public.materi m where m.pertemuan_id = p_pertemuan and m.untuk = 'siswa') then
    raise exception 'Belum ada materi untuk siswa. Tambahkan minimal satu materi.' using errcode = 'P0001';
  end if;
  update public.tugas set status = 'terbit' where pertemuan_id = p_pertemuan and not dihapus and status <> 'terbit'
    and id in (select tugas_id from public.materi where pertemuan_id = p_pertemuan and tugas_id is not null);
  update public.asesmen set status = 'terbit' where pertemuan_id = p_pertemuan and not diarsipkan and status <> 'terbit'
    and exists (select 1 from public.soal s where s.asesmen_id = asesmen.id and not s.dihapus);
  update public.pertemuan set status = 'terbit' where id = p_pertemuan;
  return jsonb_build_object('ok', true, 'belum_lengkap', not (k->>'lengkap')::boolean, 'kurang', k->'kurang');
end $$;
revoke all on function public.lms_terbitkan_paksa(uuid) from public, anon;
grant execute on function public.lms_terbitkan_paksa(uuid) to authenticated;
