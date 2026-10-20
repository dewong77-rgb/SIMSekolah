-- LMS: guru menghapus kelas ajarnya sendiri bila salah rombel atau salah mata pelajaran.
-- Penghapusan bersifat arsip (aktif = false): data pertemuan dan nilai tetap tersimpan, kelas hilang dari semua daftar.
-- Penyinkron penugasan (lms_sinkron_kelas) tidak mengaktifkan lagi kelas yang gurunya masih tercatat mengampu,
-- jadi kelas yang dihapus tidak muncul kembali. Membuat kelas dengan rombel dan mapel yang sama mengaktifkan kelas arsip itu.

create or replace function public.lms_hapus_kelas_ajar(p_kelas uuid, p_paksa boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare k public.kelas_ajar%rowtype; v_pertemuan int; v_aktivitas int;
begin
  select * into k from public.kelas_ajar where id = p_kelas;
  if not found or not k.aktif or not private.lms_kelola(p_kelas) then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  select count(*) into v_pertemuan from public.pertemuan where kelas_ajar_id = p_kelas;
  select (select count(*) from public.absensi_pertemuan a join public.pertemuan t on t.id = a.pertemuan_id where t.kelas_ajar_id = p_kelas)
       + (select count(*) from public.progres_materi pm join public.materi m on m.id = pm.materi_id
            join public.pertemuan t on t.id = m.pertemuan_id where t.kelas_ajar_id = p_kelas)
       + (select count(*) from public.kumpul_tugas ku join public.tugas g on g.id = ku.tugas_id where g.kelas_ajar_id = p_kelas)
       + (select count(*) from public.percobaan_asesmen pa join public.asesmen s on s.id = pa.asesmen_id where s.kelas_ajar_id = p_kelas)
    into v_aktivitas;
  if (v_pertemuan > 0 or v_aktivitas > 0) and not coalesce(p_paksa, false) then
    raise exception 'Kelas ini sudah punya % pertemuan dan % catatan aktivitas siswa. Kelas diarsipkan: tidak tampil lagi, data tidak dihapus.', v_pertemuan, v_aktivitas
      using errcode = 'P0001', hint = 'ada_aktivitas';
  end if;
  update public.kelas_ajar set aktif = false where id = p_kelas;
  return jsonb_build_object('ok', true, 'pertemuan', v_pertemuan, 'aktivitas', v_aktivitas);
end $$;
revoke all on function public.lms_hapus_kelas_ajar(uuid, boolean) from public, anon;
grant execute on function public.lms_hapus_kelas_ajar(uuid, boolean) to authenticated;

-- Membuat kelas yang pernah dihapus: aktifkan kembali, bukan galat duplikat.
create or replace function public.lms_buat_kelas_ajar(p_rombel uuid, p_mapel text, p_ptk uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.rombel%rowtype; v_ptk uuid; v_id uuid; v_peran text := private.peran_saya(); v_arsip uuid;
begin
  if auth.uid() is null then raise exception 'Perlu masuk.' using errcode = '28000'; end if;
  select * into r from public.rombel where id = p_rombel;
  if not found then raise exception 'Rombel tidak ditemukan.' using errcode = 'P0002'; end if;
  if r.jenis_rombel <> 'Kelas Utama' then raise exception 'Hanya rombel Kelas Utama.' using errcode = '22023'; end if;
  if not private.adalah_super() and r.npsn <> private.npsn_saya() then
    raise exception 'Rombel bukan milik sekolah Anda.' using errcode = '42501';
  end if;
  if private.adalah_super() or v_peran = 'admin_tu' then
    v_ptk := coalesce(p_ptk, private.ptk_id_saya());
    if v_ptk is null then raise exception 'Pilih guru pengampu.' using errcode = '22023'; end if;
  elsif v_peran = 'guru' then
    v_ptk := private.ptk_id_saya();
  else
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ptk where id = v_ptk and npsn = r.npsn) then
    raise exception 'Guru tidak ditemukan.' using errcode = 'P0002';
  end if;
  select id into v_arsip from public.kelas_ajar
   where semester_id = r.semester_id and rombel_id = p_rombel and lower(btrim(mapel)) = lower(btrim(p_mapel)) and not aktif
   limit 1;
  if v_arsip is not null then
    update public.kelas_ajar set aktif = true, ptk_id = v_ptk where id = v_arsip;
    return v_arsip;
  end if;
  insert into public.kelas_ajar (npsn, semester_id, rombel_id, ptk_id, mapel)
  values (r.npsn, r.semester_id, p_rombel, v_ptk, btrim(p_mapel))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Kelas ajar % untuk rombel ini sudah ada.', btrim(p_mapel) using errcode = '23505';
end $$;
revoke all on function public.lms_buat_kelas_ajar(uuid, text, uuid) from public, anon;
grant execute on function public.lms_buat_kelas_ajar(uuid, text, uuid) to authenticated;
