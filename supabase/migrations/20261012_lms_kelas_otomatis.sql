-- LMS: kelas ajar dibuat otomatis dari penugasan guru (kur_beban), satu kelas per rombel dan mata pelajaran.
-- Rombel dan guru sudah ada di penugasan, jadi menu "Kelas saya" langsung terisi tanpa guru membuat kelas satu per satu.
-- Guru pengelola kelas = guru dengan JP terbanyak pada rombel dan mapel itu. Kelas tidak pernah dihapus otomatis.
-- Kelas buatan manual dengan nama mapel yang sama dipakai ulang (tidak diduplikasi).

create or replace function private.lms_sinkron_kelas(p_rombel uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer := 0; b record; v_id uuid;
begin
  for b in
    select distinct on (kb.rombel_id, kb.mapel_id)
           kb.rombel_id, kb.mapel_id, kb.ptk_id, r.npsn, r.semester_id, btrim(m.nama) as mapel
      from public.kur_beban kb
      join public.rombel r on r.id = kb.rombel_id and r.jenis_rombel = 'Kelas Utama'
      join public.kur_mapel m on m.id = kb.mapel_id
      join public.ptk p on p.id = kb.ptk_id and p.npsn = r.npsn
     where (p_rombel is null or kb.rombel_id = p_rombel)
       and r.semester_id is not null
       and char_length(btrim(m.nama)) between 2 and 80
     order by kb.rombel_id, kb.mapel_id, kb.jp desc, kb.dibuat_pada, kb.ptk_id
  loop
    select id into v_id from public.kelas_ajar
     where semester_id = b.semester_id and rombel_id = b.rombel_id and lower(btrim(mapel)) = lower(b.mapel)
     limit 1;
    if v_id is null then
      insert into public.kelas_ajar (npsn, semester_id, rombel_id, ptk_id, mapel)
      values (b.npsn, b.semester_id, b.rombel_id, b.ptk_id, b.mapel)
      on conflict (semester_id, rombel_id, mapel) do nothing;
      if found then n := n + 1; end if;
    else
      -- Penugasan adalah sumber kebenaran: bila guru kelas tidak lagi tercatat mengampu, kelas pindah ke guru pengampu.
      update public.kelas_ajar set ptk_id = b.ptk_id, aktif = true
       where id = v_id
         and (ptk_id <> b.ptk_id or not aktif)
         and not exists (select 1 from public.kur_beban x
                          where x.rombel_id = b.rombel_id and x.mapel_id = b.mapel_id and x.ptk_id = kelas_ajar.ptk_id);
    end if;
  end loop;
  return n;
end $$;
revoke execute on function private.lms_sinkron_kelas(uuid) from public, anon, authenticated;

create or replace function private.lms_sinkron_kelas_pemicu() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.lms_sinkron_kelas(coalesce(new.rombel_id, old.rombel_id));
  return null;
end $$;
revoke execute on function private.lms_sinkron_kelas_pemicu() from public, anon, authenticated;

drop trigger if exists lms_sinkron_kelas on public.kur_beban;
create trigger lms_sinkron_kelas after insert or update or delete on public.kur_beban
  for each row execute function private.lms_sinkron_kelas_pemicu();

-- Isi awal untuk penugasan yang sudah ada.
select private.lms_sinkron_kelas();
