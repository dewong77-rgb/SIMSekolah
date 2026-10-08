-- Formulir resmi Dapodik F-ROMBEL (SMK), F-EKSKUL, dan Jadwal Pembelajaran (tahap 2).
-- Pengisi: Waka/staf Kurikulum (rombel, SK mengajar) dan Waka/TU Kesiswaan (ekskul). Tidak ada isian mandiri guru atau siswa.
-- Setiap simpanan berlaku langsung di SIMS dan masuk antrean operator Dapodik sebagai tagihan kerja (tabel ajuan_perubahan,
-- jenis rombel / pembelajaran / ekskul). Penutupan hanya lewat centang operator, karena unggahan Dapodik tidak membaca kolom ini.

-- ------------------------------------------------------------ kolom baru
alter table public.rombel
  add column if not exists kompetensi_keahlian text,
  add column if not exists moving_class text check (moving_class is null or moving_class in ('Ya', 'Tidak')),
  add column if not exists melayani_kebutuhan_khusus text;

alter table public.ekskul
  add column if not exists prasarana text,
  add column if not exists moving_class text check (moving_class is null or moving_class in ('Ya', 'Tidak')),
  add column if not exists melayani_kebutuhan_khusus text;

alter table public.ekskul_anggota
  add column if not exists status_pendaftaran text;

alter table public.kur_beban
  add column if not exists sk_mengajar text,
  add column if not exists tanggal_sk date;

-- ------------------------------------------------------------ antrean operator menerima data kelompok
alter table public.ajuan_perubahan drop constraint if exists ajuan_perubahan_jenis_check;
alter table public.ajuan_perubahan add constraint ajuan_perubahan_jenis_check
  check (jenis in ('ptk', 'siswa', 'rombel', 'pembelajaran', 'ekskul'));

create or replace function private.set_bagian_ajuan() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.bagian := case new.jenis when 'ptk' then 'kepegawaian' when 'ekskul' then 'kesiswaan' when 'siswa' then 'kesiswaan' else 'kurikulum' end;
  return new;
end $$;

-- Ajuan jenis kelompok tidak punya nilai di tabel ptk/peserta_didik: hanya ditutup operator.
create or replace function public.cocokkan_ajuan() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare a public.ajuan_perubahan; it jsonb; ok boolean; v_upd timestamptz; v_semua boolean; n_ok int := 0; n_bt int := 0;
begin
  if not private.boleh_kerjakan() then raise exception 'Tidak berwenang.'; end if;
  for a in select * from public.ajuan_perubahan where npsn = private.npsn_saya() and status in ('diteruskan', 'dikerjakan') and jenis in ('ptk', 'siswa') loop
    if a.diterapkan_pada is not null then
      select coalesce(bool_and(k.dari_dapodik), false) into v_semua
        from jsonb_array_elements(a.perubahan) e
        join public.kolom_ajuan k on k.jenis = a.jenis and k.kunci = e->>'kunci';
      if not v_semua then continue; end if;
      if a.jenis = 'ptk' then select diperbarui_pada into v_upd from public.ptk where id = a.subjek_id;
      else select diperbarui_pada into v_upd from public.peserta_didik where id = a.subjek_id; end if;
      if v_upd is null or v_upd <= a.diterapkan_pada then continue; end if;
    end if;
    ok := true;
    for it in select * from jsonb_array_elements(a.perubahan) loop
      if nullif(btrim(coalesce(private.nilai_sekarang(a.jenis, it->>'kunci', a.subjek_id), '')), '')
         is distinct from nullif(btrim(coalesce(it->>'baru', '')), '') then ok := false; exit; end if;
    end loop;
    if ok then
      update public.ajuan_perubahan set status = 'selesai', selesai_pada = now(), belum_terbukti = false where id = a.id;
      n_ok := n_ok + 1;
    elsif a.status = 'dikerjakan' and not a.belum_terbukti then
      update public.ajuan_perubahan set belum_terbukti = true where id = a.id;
      n_bt := n_bt + 1;
    end if;
  end loop;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan) values ((select auth.uid()), 'ajuan_perubahan', 'COCOKKAN', jsonb_build_object('selesai', n_ok, 'belum_terbukti', n_bt));
  return jsonb_build_object('selesai', n_ok, 'belum_terbukti', n_bt);
end $$;

-- Satu butir perubahan untuk tagihan kelompok.
create or replace function private.butir_tagihan(p_kunci text, p_label text, p_kelompok text, p_butir text, p_lama text, p_baru text) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('kunci', p_kunci, 'label', p_label, 'kelompok', p_kelompok, 'butir', p_butir, 'lama', p_lama, 'baru', p_baru,
                            'butuh_dokumen', false, 'terapkan', true, 'jalur', 'langsung', 'diterapkan', true)
$$;

-- Membuat tagihan (ajuan berstatus diteruskan) bila ada butir yang berubah.
create or replace function private.tagihan_buat(p_jenis text, p_subjek uuid, p_nama text, p_butir jsonb, p_alasan text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if p_butir is null or jsonb_array_length(p_butir) = 0 then return null; end if;
  insert into public.ajuan_perubahan
    (npsn, jenis, subjek_id, subjek_nama, pengaju_user_id, pengaju_peran, perubahan, alasan, butuh_dokumen,
     status, catatan_admin, diputuskan_pada, diteruskan_pada, diterapkan_pada)
  values (private.npsn_saya(), p_jenis, p_subjek, p_nama, (select auth.uid()), coalesce(private.peran_saya(), 'staf'), p_butir,
          coalesce(nullif(btrim(p_alasan), ''), 'Pengisian formulir'), false,
          'diteruskan', 'Diisi langsung. Sudah berlaku di SIMS.', now(), now(), now())
  returning id into v_id;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan)
  values ((select auth.uid()), 'ajuan_perubahan', 'ISI_LANGSUNG', jsonb_build_object('ajuan', v_id, 'jenis', p_jenis, 'jumlah_kolom', jsonb_array_length(p_butir)));
  return v_id;
end $$;
revoke execute on function private.butir_tagihan(text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function private.tagihan_buat(text, uuid, text, jsonb, text) from public, anon, authenticated;

-- ------------------------------------------------------------ F-ROMBEL: data dan simpan
create or replace function public.rombel_formulir_data(p_ta text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when private.kur_boleh_lihat() then coalesce((
    select jsonb_agg(jsonb_build_object(
             'rombel_id', r.id, 'rombel', r.nama, 'tingkat', r.tingkat, 'kurikulum', r.kurikulum, 'ruangan', r.ruangan,
             'wali', coalesce(pd.nama, r.wali_kelas_nama),
             'jumlah_siswa', coalesce(r.jumlah_l_profil, 0) + coalesce(r.jumlah_p_profil, 0),
             'program', private.kur_program(r.nama),
             'kompetensi_keahlian', r.kompetensi_keahlian, 'moving_class', r.moving_class, 'melayani_kebutuhan_khusus', r.melayani_kebutuhan_khusus,
             'pembelajaran', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'beban_id', b.id, 'mapel', m.nama, 'kelompok', m.kelompok, 'ptk', p.nama, 'jp', b.jp,
                        'sk_mengajar', b.sk_mengajar, 'tanggal_sk', b.tanggal_sk) order by m.urutan, m.nama, p.nama)
                 from public.kur_beban b
                 join public.kur_mapel m on m.id = b.mapel_id
                 join public.ptk p on p.id = b.ptk_id
                where b.rombel_id = r.id), '[]'::jsonb))
           order by r.tingkat, r.nama)
      from public.rombel r
      join public.semester s on s.semester_id = r.semester_id and s.tahun_ajaran = p_ta
      left join public.ptk pd on pd.id = r.wali_kelas_ptk_id
     where r.jenis_rombel = 'Kelas Utama' and r.npsn = private.npsn_saya()), '[]'::jsonb) else null end
$$;

create or replace function public.rombel_formulir_simpan(p_rombel uuid, p_kompetensi text, p_moving text, p_kk text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r public.rombel;
  v_k text := nullif(btrim(coalesce(p_kompetensi, '')), '');
  v_m text := nullif(btrim(coalesce(p_moving, '')), '');
  v_kk text := nullif(btrim(coalesce(p_kk, '')), '');
  v_b jsonb := '[]'::jsonb;
begin
  if not private.kur_boleh() then raise exception 'Anda tidak berwenang mengatur data rombel.'; end if;
  select * into r from public.rombel where id = p_rombel and npsn = private.npsn_saya() and jenis_rombel = 'Kelas Utama' for update;
  if r.id is null then raise exception 'Rombel tidak ditemukan.'; end if;
  if v_k is not null and length(v_k) > 100 then raise exception 'Kompetensi keahlian terlalu panjang.'; end if;
  if v_m is not null and v_m not in ('Ya', 'Tidak') then raise exception 'Moving class harus Ya atau Tidak.'; end if;
  if v_kk is not null and length(v_kk) > 200 then raise exception 'Keterangan kebutuhan khusus terlalu panjang.'; end if;

  if v_k is distinct from r.kompetensi_keahlian then v_b := v_b || private.butir_tagihan('kompetensi_keahlian', 'Jurusan / kompetensi keahlian', 'Rombongan belajar', 'F-ROMBEL', r.kompetensi_keahlian, v_k); end if;
  if v_m is distinct from r.moving_class then v_b := v_b || private.butir_tagihan('moving_class', 'Moving class', 'Rombongan belajar', 'F-ROMBEL', r.moving_class, v_m); end if;
  if v_kk is distinct from r.melayani_kebutuhan_khusus then v_b := v_b || private.butir_tagihan('melayani_kebutuhan_khusus', 'Melayani kebutuhan khusus', 'Rombongan belajar', 'F-ROMBEL', r.melayani_kebutuhan_khusus, v_kk); end if;
  if jsonb_array_length(v_b) = 0 then return; end if;

  update public.rombel set kompetensi_keahlian = v_k, moving_class = v_m, melayani_kebutuhan_khusus = v_kk where id = p_rombel;
  perform private.tagihan_buat('rombel', p_rombel, r.nama, v_b, null);
end $$;

create or replace function public.beban_sk_simpan(p_beban uuid, p_sk text, p_tanggal date) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  b public.kur_beban; r public.rombel; v_mapel text; v_guru text;
  v_sk text := nullif(btrim(coalesce(p_sk, '')), '');
  v_b jsonb := '[]'::jsonb;
begin
  if not private.kur_boleh() then raise exception 'Anda tidak berwenang mengatur beban mengajar.'; end if;
  select * into b from public.kur_beban where id = p_beban for update;
  if b.id is null then raise exception 'Beban mengajar tidak ditemukan.'; end if;
  select * into r from public.rombel where id = b.rombel_id and npsn = private.npsn_saya();
  if r.id is null then raise exception 'Rombel tidak ditemukan.'; end if;
  if v_sk is not null and length(v_sk) > 100 then raise exception 'Nomor SK terlalu panjang.'; end if;
  if p_tanggal is not null and (p_tanggal < date '2000-01-01' or p_tanggal > current_date + 366) then raise exception 'Tanggal SK tidak wajar.'; end if;
  select nama into v_mapel from public.kur_mapel where id = b.mapel_id;
  select nama into v_guru from public.ptk where id = b.ptk_id;

  if v_sk is distinct from b.sk_mengajar then v_b := v_b || private.butir_tagihan('sk_mengajar', 'SK mengajar: ' || coalesce(v_mapel, '-') || ' (' || coalesce(v_guru, '-') || ')', 'Pembelajaran', 'F-ROMBEL', b.sk_mengajar, v_sk); end if;
  if p_tanggal is distinct from b.tanggal_sk then v_b := v_b || private.butir_tagihan('tanggal_sk', 'Tanggal SK: ' || coalesce(v_mapel, '-') || ' (' || coalesce(v_guru, '-') || ')', 'Pembelajaran', 'F-ROMBEL', b.tanggal_sk::text, p_tanggal::text); end if;
  if jsonb_array_length(v_b) = 0 then return; end if;

  update public.kur_beban set sk_mengajar = v_sk, tanggal_sk = p_tanggal where id = p_beban;
  perform private.tagihan_buat('pembelajaran', r.id, r.nama, v_b, null);
end $$;

-- ------------------------------------------------------------ F-EKSKUL: baca dan simpan
create or replace function public.ekskul_formulir_baca(p_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when auth.uid() is not null and private.npsn_saya() is not null then (
    select jsonb_build_object('prasarana', e.prasarana, 'moving_class', e.moving_class, 'melayani_kebutuhan_khusus', e.melayani_kebutuhan_khusus)
      from public.ekskul e where e.id = p_id and e.npsn = private.npsn_saya()) end
$$;

create or replace function public.ekskul_formulir_simpan(p_id uuid, p_prasarana text, p_moving text, p_kk text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  e public.ekskul;
  v_p text := nullif(btrim(coalesce(p_prasarana, '')), '');
  v_m text := nullif(btrim(coalesce(p_moving, '')), '');
  v_kk text := nullif(btrim(coalesce(p_kk, '')), '');
  v_b jsonb := '[]'::jsonb;
begin
  if not private.kes_semua(array['ekskul.kelola']) then raise exception 'Hanya Waka atau TU Kesiswaan yang mengatur ekstrakurikuler.'; end if;
  select * into e from public.ekskul where id = p_id and npsn = private.npsn_saya() for update;
  if e.id is null then raise exception 'Ekstrakurikuler tidak ditemukan.'; end if;
  if v_p is not null and length(v_p) > 100 then raise exception 'Nama prasarana terlalu panjang.'; end if;
  if v_m is not null and v_m not in ('Ya', 'Tidak') then raise exception 'Moving class harus Ya atau Tidak.'; end if;
  if v_kk is not null and length(v_kk) > 200 then raise exception 'Keterangan kebutuhan khusus terlalu panjang.'; end if;

  if v_p is distinct from e.prasarana then v_b := v_b || private.butir_tagihan('prasarana', 'Prasarana', 'Ekstrakurikuler', 'F-EKSKUL', e.prasarana, v_p); end if;
  if v_m is distinct from e.moving_class then v_b := v_b || private.butir_tagihan('moving_class', 'Moving class', 'Ekstrakurikuler', 'F-EKSKUL', e.moving_class, v_m); end if;
  if v_kk is distinct from e.melayani_kebutuhan_khusus then v_b := v_b || private.butir_tagihan('melayani_kebutuhan_khusus', 'Melayani kebutuhan khusus', 'Ekstrakurikuler', 'F-EKSKUL', e.melayani_kebutuhan_khusus, v_kk); end if;
  if jsonb_array_length(v_b) = 0 then return; end if;

  update public.ekskul set prasarana = v_p, moving_class = v_m, melayani_kebutuhan_khusus = v_kk where id = p_id;
  perform private.tagihan_buat('ekskul', p_id, e.nama, v_b, null);
end $$;

-- Status pendaftaran anggota (formulir: "Status Pendaftaran"). Tidak membuat tagihan per anggota; operator memakai daftar anggota di cetakan.
create or replace function public.ekskul_anggota_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_s text := nullif(btrim(coalesce(p_status, '')), '');
begin
  if not private.kes_semua(array['ekskul.kelola']) then raise exception 'Hanya Waka atau TU Kesiswaan yang mengatur anggota ekstrakurikuler.'; end if;
  if v_s is not null and v_s not in ('Siswa baru', 'Pindahan', 'Kembali bersekolah', 'Lainnya') then raise exception 'Status pendaftaran tidak dikenal.'; end if;
  update public.ekskul_anggota a set status_pendaftaran = v_s
   where a.id = p_id and exists (select 1 from public.ekskul e where e.id = a.ekskul_id and e.npsn = private.npsn_saya());
  if not found then raise exception 'Anggota tidak ditemukan.'; end if;
end $$;

-- Status pendaftaran per anggota, untuk ditampilkan di layar dan cetakan F-EKSKUL.
create or replace function public.ekskul_anggota_status_daftar(p_ekskul uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when auth.uid() is not null and private.npsn_saya() is not null then coalesce((
    select jsonb_object_agg(a.id::text, a.status_pendaftaran)
      from public.ekskul_anggota a join public.ekskul e on e.id = a.ekskul_id
     where a.ekskul_id = p_ekskul and e.npsn = private.npsn_saya() and a.status_pendaftaran is not null), '{}'::jsonb) end
$$;
revoke execute on function public.ekskul_anggota_status_daftar(uuid) from public, anon;
grant execute on function public.ekskul_anggota_status_daftar(uuid) to authenticated;

do $do$
declare f text;
begin
  foreach f in array array[
    'public.cocokkan_ajuan()', 'public.rombel_formulir_data(text)', 'public.rombel_formulir_simpan(uuid,text,text,text)',
    'public.beban_sk_simpan(uuid,text,date)', 'public.ekskul_formulir_baca(uuid)', 'public.ekskul_formulir_simpan(uuid,text,text,text)',
    'public.ekskul_anggota_status(uuid,text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $do$;
