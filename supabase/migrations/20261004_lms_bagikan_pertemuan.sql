-- Sekali buat, berlaku untuk semua kelas yang diampu: salin ke seluruh kelas ajar yang memenuhi syarat
-- (mapel dan semester sama, dikelola guru yang sama) dan, bila pertemuan sumber sudah terbit,
-- langsung menerbitkan salinannya beserta latihan, lembar kerja, dan forum pembuka.
create or replace function public.lms_bagikan_pertemuan(p_pertemuan uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; v_ids uuid[]; v_baru uuid[]; r jsonb; v_terbit boolean;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  select array_agg((e->>'kelas_id')::uuid) into v_ids
    from jsonb_array_elements(public.lms_salin_tujuan(p_pertemuan)) e where not (e->>'sudah_ada')::boolean;
  if v_ids is null then raise exception 'Tidak ada kelas lain yang bisa menerima pertemuan ini.' using errcode = 'P0001'; end if;
  r := public.lms_salin_pertemuan(p_pertemuan, v_ids);
  v_terbit := t.status = 'terbit';
  select array_agg(x.id) into v_baru from public.pertemuan x
    where x.kelas_ajar_id = any (v_ids) and lower(btrim(x.judul)) = lower(btrim(t.judul)) and x.status = 'draf';
  if v_terbit and v_baru is not null then
    update public.tugas set status = 'terbit' where pertemuan_id = any (v_baru) and not dihapus and status <> 'terbit'
      and id in (select tugas_id from public.materi where pertemuan_id = any (v_baru) and tugas_id is not null);
    update public.asesmen set status = 'terbit' where pertemuan_id = any (v_baru) and not diarsipkan and status <> 'terbit'
      and exists (select 1 from public.soal s where s.asesmen_id = asesmen.id and not s.dihapus);
    update public.pertemuan set status = 'terbit' where id = any (v_baru);
  end if;
  return r || jsonb_build_object('diterbitkan', v_terbit and v_baru is not null);
end $$;
revoke all on function public.lms_bagikan_pertemuan(uuid) from public, anon;
grant execute on function public.lms_bagikan_pertemuan(uuid) to authenticated;
