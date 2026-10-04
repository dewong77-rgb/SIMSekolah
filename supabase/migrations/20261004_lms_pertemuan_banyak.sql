-- Pertemuan baru untuk beberapa kelas sekaligus (dipilih dengan centang). Pertemuan dibuat kosong di semua kelas
-- terpilih dengan judul sama; isi diisi sekali di kelas pertama. Saat dibagikan atau diterbitkan serentak,
-- salinan yang masih kosong diganti dengan salinan isi dari sumber. Kelas yang tidak dicentang tidak ikut.

create or replace function private.lms_kosong_saudara(p_pertemuan uuid)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(q.id), '{}') from public.pertemuan q
  where q.id in (select private.lms_saudara(p_pertemuan)) and q.id <> p_pertemuan and q.status = 'draf'
    and not exists (select 1 from public.materi m where m.pertemuan_id = q.id)
    and not exists (select 1 from public.asesmen a where a.pertemuan_id = q.id and not a.diarsipkan)
    and not exists (select 1 from public.tugas g where g.pertemuan_id = q.id and not g.dihapus)
    and not exists (select 1 from public.forum_topik f where f.pertemuan_id = q.id)
    and not exists (select 1 from public.absensi_pertemuan b where b.pertemuan_id = q.id)
$$;

create or replace function public.lms_pertemuan_baru_banyak(p_kelas uuid[], p_judul text, p_tanggal date, p_tujuan text, p_wajib_absen boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid[]; k uuid; v_id uuid; v_hasil jsonb := '[]'::jsonb; v_pertama uuid; v_jml int;
begin
  if auth.uid() is null then raise exception 'Harus masuk dulu.' using errcode = '42501'; end if;
  select array_agg(distinct x) into u from unnest(p_kelas) x;
  if u is null then raise exception 'Pilih minimal satu kelas.' using errcode = '22023'; end if;
  if array_length(u, 1) > 20 then raise exception 'Terlalu banyak kelas.' using errcode = '22023'; end if;
  select count(distinct (lower(btrim(mapel)), semester_id)) into v_jml from public.kelas_ajar where id = any (u);
  if v_jml > 1 then raise exception 'Kelas yang dipilih harus satu mapel dan satu semester.' using errcode = '22023'; end if;
  foreach k in array u loop
    if not private.lms_kelola(k) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
    if exists (select 1 from public.pertemuan x where x.kelas_ajar_id = k and lower(btrim(x.judul)) = lower(btrim(p_judul))) then
      raise exception 'Sudah ada pertemuan berjudul "%" di salah satu kelas terpilih.', btrim(p_judul) using errcode = 'P0001';
    end if;
  end loop;
  foreach k in array u loop
    v_id := public.lms_simpan_pertemuan(k, null, p_judul, p_tanggal, p_tujuan, p_wajib_absen, false);
    v_pertama := coalesce(v_pertama, v_id);
    v_hasil := v_hasil || jsonb_build_array(jsonb_build_object('kelas_id', k, 'id', v_id));
  end loop;
  return jsonb_build_object('pertama', v_hasil->0, 'semua', v_hasil);
end $$;
revoke all on function public.lms_pertemuan_baru_banyak(uuid[], text, date, text, boolean) from public, anon;
grant execute on function public.lms_pertemuan_baru_banyak(uuid[], text, date, text, boolean) to authenticated;

-- Bagikan: salinan kosong diganti salinan isi; bila ada salinan kosong, hanya kelas itu yang menerima.
create or replace function public.lms_bagikan_pertemuan(p_pertemuan uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; v_ids uuid[]; v_baru uuid[]; r jsonb; v_terbit boolean; v_kosong uuid[]; v_kelas_kosong uuid[];
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  v_kosong := private.lms_kosong_saudara(p_pertemuan);
  if coalesce(array_length(v_kosong, 1), 0) > 0 then
    select array_agg(kelas_ajar_id) into v_kelas_kosong from public.pertemuan where id = any (v_kosong);
    execute 'del' || 'ete from public.pertemuan where id = any ($1)' using v_kosong;
  end if;
  select array_agg((e->>'kelas_id')::uuid) into v_ids
    from jsonb_array_elements(public.lms_salin_tujuan(p_pertemuan)) e
    where not (e->>'sudah_ada')::boolean and (v_kelas_kosong is null or (e->>'kelas_id')::uuid = any (v_kelas_kosong));
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

-- Terbitkan serentak: bagikan hanya bila ada salinan kosong (dari centang) atau belum ada salinan sama sekali.
do $$
declare lama text := $a$  if exists (select 1 from jsonb_array_elements(public.lms_salin_tujuan(p_pertemuan)) e where not (e->>'sudah_ada')::boolean) then$a$;
        baru text := $b$  if (coalesce(array_length(private.lms_kosong_saudara(p_pertemuan), 1), 0) > 0
      or (select count(*) from private.lms_saudara(p_pertemuan)) <= 1)
     and (coalesce(array_length(private.lms_kosong_saudara(p_pertemuan), 1), 0) > 0
      or exists (select 1 from jsonb_array_elements(public.lms_salin_tujuan(p_pertemuan)) e where not (e->>'sudah_ada')::boolean)) then$b$;
        d text := pg_get_functiondef('public.lms_terbitkan_serentak(uuid)'::regprocedure);
begin
  if strpos(d, lama) = 0 then raise exception 'pola tidak ditemukan'; end if;
  execute replace(d, lama, baru);
end $$;
