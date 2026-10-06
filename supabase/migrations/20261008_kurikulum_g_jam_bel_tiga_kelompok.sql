-- Jam bel dikelompokkan menjadi Senin, Selasa sampai Kamis, dan Jumat (jam pulang berbeda). 'senin_kamis' hanya warisan, tidak dipakai lagi.
-- Jam sekolah: mulai 07.10, istirahat 09.50-10.10 dan 12.10-12.50, tanpa istirahat ketiga. Senin pulang 15.30 (11 JP), Selasa-Kamis 14.50 (10 JP),
-- Jumat 6 JP sampai 11.30 lalu salat Jumat dan kegiatan sampai 13.00. Satu JP 40 menit.
alter table public.jam_bel drop constraint if exists jam_bel_kelompok_check;
alter table public.jam_bel add constraint jam_bel_kelompok_check check (kelompok in ('senin', 'selasa_kamis', 'jumat', 'senin_kamis'));

create or replace function private.kelompok_jam(p_hari int) returns text
language sql immutable set search_path = '' as $$ select case when p_hari = 1 then 'senin' when p_hari = 5 then 'jumat' else 'selasa_kamis' end $$;

create or replace function public.jam_bel_simpan(p_kelompok text, p_baris jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.punya_izin('kurikulum.atur_jadwal', null) then
    raise exception 'Anda tidak berwenang mengatur jam pelajaran.';
  end if;
  if p_kelompok not in ('senin', 'selasa_kamis', 'jumat') then raise exception 'Kelompok hari tidak dikenal.'; end if;
  if jsonb_typeof(p_baris) <> 'array' then raise exception 'Data jam tidak valid.'; end if;
  if jsonb_array_length(p_baris) > 40 then raise exception 'Terlalu banyak baris.'; end if;
  if exists (
    select 1 from (
      select a.mulai, lag(a.selesai) over (order by a.mulai) as sebelumnya
        from (select (e->>'mulai')::time as mulai, (e->>'selesai')::time as selesai from jsonb_array_elements(p_baris) e) a
    ) b where b.sebelumnya > b.mulai
  ) then raise exception 'Rentang waktu saling tumpang tindih.'; end if;
  update public.jam_bel set aktif = false where kelompok = p_kelompok;
  insert into public.jam_bel (kelompok, urutan, label, jenis, mulai, selesai, aktif)
  select p_kelompok, row_number() over (order by c.mulai), c.label, c.jenis, c.mulai, c.selesai, true
    from (select btrim(e->>'label') as label, coalesce(nullif(e->>'jenis', ''), 'pelajaran') as jenis,
                 (e->>'mulai')::time as mulai, (e->>'selesai')::time as selesai
            from jsonb_array_elements(p_baris) e) c
  on conflict (kelompok, urutan) do update
    set label = excluded.label, jenis = excluded.jenis, mulai = excluded.mulai, selesai = excluded.selesai, aktif = true;
end $$;

create or replace function public.kur_jadwal_pasang(p_rombel uuid, p_hari int, p_jam_ke int, p_mapel uuid, p_ptk uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.rombel; v_maks int; b public.kur_beban; v_pakai int; v_bentrok text;
begin
  if not private.kur_boleh() then raise exception 'Anda tidak berwenang menyusun jadwal.'; end if;
  select * into r from public.rombel where id = p_rombel and npsn = private.npsn_saya() and jenis_rombel = 'Kelas Utama';
  if r.id is null then raise exception 'Rombel tidak ditemukan.'; end if;
  if p_hari not between 1 and 6 then raise exception 'Hari tidak valid.'; end if;
  select count(*) into v_maks from public.jam_bel where aktif and jenis = 'pelajaran' and kelompok = private.kelompok_jam(p_hari);
  if p_jam_ke < 1 or p_jam_ke > v_maks then raise exception 'Jam ke-% tidak ada di jam bel hari itu (maksimal %).', p_jam_ke, v_maks; end if;
  if p_mapel is null then
    update public.kur_jadwal set mapel_id = null, ptk_id = null, diubah_oleh = auth.uid(), diubah_pada = now()
     where rombel_id = p_rombel and hari = p_hari and jam_ke = p_jam_ke;
    return;
  end if;
  select * into b from public.kur_beban where rombel_id = p_rombel and mapel_id = p_mapel and ptk_id = p_ptk;
  if b.id is null then raise exception 'Guru ini belum dibagi untuk mapel dan kelas tersebut. Atur dulu di Beban mengajar.'; end if;
  select count(*) into v_pakai from public.kur_jadwal
   where rombel_id = p_rombel and mapel_id = p_mapel and ptk_id = p_ptk and not (hari = p_hari and jam_ke = p_jam_ke);
  if v_pakai >= b.jp then raise exception 'Jam guru ini untuk mapel tersebut sudah penuh (% JP per minggu).', b.jp; end if;
  select rr.nama into v_bentrok from public.kur_jadwal j join public.rombel rr on rr.id = j.rombel_id
   where j.semester_id = r.semester_id and j.ptk_id = p_ptk and j.hari = p_hari and j.jam_ke = p_jam_ke and j.rombel_id <> p_rombel limit 1;
  if v_bentrok is not null then raise exception 'Guru sudah mengajar di kelas % pada jam itu.', v_bentrok; end if;
  insert into public.kur_jadwal (rombel_id, semester_id, hari, jam_ke, mapel_id, ptk_id)
  values (p_rombel, r.semester_id, p_hari, p_jam_ke, p_mapel, p_ptk)
  on conflict (rombel_id, hari, jam_ke) do update
    set mapel_id = excluded.mapel_id, ptk_id = excluded.ptk_id, semester_id = excluded.semester_id, diubah_oleh = auth.uid(), diubah_pada = now();
end $$;

-- Data jam bel sekolah.
update public.jam_bel set aktif = false where kelompok in ('senin_kamis', 'jumat');
insert into public.jam_bel (kelompok, urutan, label, jenis, mulai, selesai, aktif) values
  ('senin', 1, 'Jam ke-1', 'pelajaran', '07:10', '07:50', true), ('senin', 2, 'Jam ke-2', 'pelajaran', '07:50', '08:30', true),
  ('senin', 3, 'Jam ke-3', 'pelajaran', '08:30', '09:10', true), ('senin', 4, 'Jam ke-4', 'pelajaran', '09:10', '09:50', true),
  ('senin', 5, 'Istirahat 1', 'istirahat', '09:50', '10:10', true), ('senin', 6, 'Jam ke-5', 'pelajaran', '10:10', '10:50', true),
  ('senin', 7, 'Jam ke-6', 'pelajaran', '10:50', '11:30', true), ('senin', 8, 'Jam ke-7', 'pelajaran', '11:30', '12:10', true),
  ('senin', 9, 'Istirahat 2', 'istirahat', '12:10', '12:50', true), ('senin', 10, 'Jam ke-8', 'pelajaran', '12:50', '13:30', true),
  ('senin', 11, 'Jam ke-9', 'pelajaran', '13:30', '14:10', true), ('senin', 12, 'Jam ke-10', 'pelajaran', '14:10', '14:50', true),
  ('senin', 13, 'Jam ke-11', 'pelajaran', '14:50', '15:30', true),
  ('selasa_kamis', 1, 'Jam ke-1', 'pelajaran', '07:10', '07:50', true), ('selasa_kamis', 2, 'Jam ke-2', 'pelajaran', '07:50', '08:30', true),
  ('selasa_kamis', 3, 'Jam ke-3', 'pelajaran', '08:30', '09:10', true), ('selasa_kamis', 4, 'Jam ke-4', 'pelajaran', '09:10', '09:50', true),
  ('selasa_kamis', 5, 'Istirahat 1', 'istirahat', '09:50', '10:10', true), ('selasa_kamis', 6, 'Jam ke-5', 'pelajaran', '10:10', '10:50', true),
  ('selasa_kamis', 7, 'Jam ke-6', 'pelajaran', '10:50', '11:30', true), ('selasa_kamis', 8, 'Jam ke-7', 'pelajaran', '11:30', '12:10', true),
  ('selasa_kamis', 9, 'Istirahat 2', 'istirahat', '12:10', '12:50', true), ('selasa_kamis', 10, 'Jam ke-8', 'pelajaran', '12:50', '13:30', true),
  ('selasa_kamis', 11, 'Jam ke-9', 'pelajaran', '13:30', '14:10', true), ('selasa_kamis', 12, 'Jam ke-10', 'pelajaran', '14:10', '14:50', true),
  ('jumat', 1, 'Jam ke-1', 'pelajaran', '07:10', '07:50', true), ('jumat', 2, 'Jam ke-2', 'pelajaran', '07:50', '08:30', true),
  ('jumat', 3, 'Jam ke-3', 'pelajaran', '08:30', '09:10', true), ('jumat', 4, 'Jam ke-4', 'pelajaran', '09:10', '09:50', true),
  ('jumat', 5, 'Istirahat', 'istirahat', '09:50', '10:10', true), ('jumat', 6, 'Jam ke-5', 'pelajaran', '10:10', '10:50', true),
  ('jumat', 7, 'Jam ke-6', 'pelajaran', '10:50', '11:30', true), ('jumat', 8, 'Salat Jumat dan kegiatan', 'lainnya', '11:30', '13:00', true)
on conflict (kelompok, urutan) do update set label = excluded.label, jenis = excluded.jenis, mulai = excluded.mulai, selesai = excluded.selesai, aktif = true;

-- Sekolah masuk 06.30. Pukul 06.30 sampai 07.10 dipakai kegiatan pagi (literasi, numerasi, upacara) dan tidak dihitung sebagai JP.
insert into public.jam_bel (kelompok, urutan, label, jenis, mulai, selesai, aktif)
select v.k, (select coalesce(max(urutan), 0) + 1 from public.jam_bel where kelompok = v.k), 'Literasi, numerasi, upacara', 'lainnya', '06:30', '07:10', true
  from (values ('senin'), ('selasa_kamis'), ('jumat')) v(k)
 where not exists (select 1 from public.jam_bel x where x.kelompok = v.k and x.aktif and x.mulai = '06:30');
