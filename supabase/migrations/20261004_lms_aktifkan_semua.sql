-- Satu klik: forum pembuka dipastikan ada, pertemuan diterbitkan di semua kelas (materi, lembar kerja, latihan,
-- forum), lalu absen dibuka serentak dengan satu kode.
create or replace function public.lms_aktifkan_semua(p_pertemuan uuid, p_menit integer default 15, p_pakai_kode boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; v_forum boolean := false; r1 jsonb; r2 jsonb;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if not exists (select 1 from public.forum_topik f where f.pertemuan_id = t.id and not f.dihapus and f.penulis_peran = 'guru') then
    insert into public.forum_topik (pertemuan_id, kelas_ajar_id, penulis_user, penulis_nama, penulis_peran, judul, isi)
    values (t.id, t.kelas_ajar_id, auth.uid(), private.lms_nama_saya(), 'guru', 'Diskusi: ' || left(t.judul, 150),
            'Tulis satu hal yang sudah kamu pahami dari pertemuan ini dan satu hal yang masih membingungkan. Balas juga satu teman.');
    v_forum := true;
  end if;
  r1 := public.lms_terbitkan_serentak(p_pertemuan);
  r2 := public.lms_absen_serentak(p_pertemuan, p_menit, p_pakai_kode);
  return r1 || r2 || jsonb_build_object('forum_dibuat', v_forum);
end $$;
revoke all on function public.lms_aktifkan_semua(uuid, integer, boolean) from public, anon;
grant execute on function public.lms_aktifkan_semua(uuid, integer, boolean) to authenticated;
