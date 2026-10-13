-- SIMS menjadi acuan koreksi data PTK dan siswa. Alur:
--   1. Dapodik adalah sumber awal. Unggahan mengisi SIMS.
--   2. Pengguna melihat, mengonfirmasi, dan memperbaiki datanya. Perbaikan langsung berlaku di SIMS (jalur 'langsung').
--      Menambah dan menghapus baris formulir rinci (tabel fr_*) sudah aman: unggahan Dapodik tidak membaca tabel itu.
--   3. Operator Dapodik menyalin perbaikan ke Dapodik berdasarkan antrean ajuan.
--   4. Unggahan Dapodik berikutnya TIDAK menimpa kolom yang sedang dikoreksi. Nilai Dapodik yang masuk dicatat di koreksi_data.
--      Bila nilai Dapodik sudah sama dengan koreksi, perlindungan selesai otomatis.
--   5. Tiap akhir semester operator mencocokkan: daftar koreksi yang nilainya belum sama di Dapodik (pencocokan_daftar),
--      lalu mencatatnya (pencocokan_catat).
-- koreksi_data: satu baris per kolom yang dikoreksi pengguna. selesai_pada kosong berarti koreksi masih dilindungi.
-- Baris tidak dihapus, hanya ditandai selesai, supaya riwayat koreksi tersimpan.

create table if not exists public.koreksi_data (
  id uuid primary key default gen_random_uuid(),
  npsn text not null,
  jenis text not null check (jenis in ('ptk', 'siswa')),
  subjek_id uuid not null,
  kunci text not null,
  nilai_sims text,
  nilai_dapodik text,
  dikoreksi_pada timestamptz not null default now(),
  dikoreksi_oleh uuid,
  dapodik_dilihat_pada timestamptz,
  selesai_pada timestamptz,
  selesai_alasan text,
  unique (jenis, subjek_id, kunci)
);
create index if not exists koreksi_data_npsn_idx on public.koreksi_data (npsn);
create index if not exists koreksi_data_aktif_idx on public.koreksi_data (jenis, subjek_id) where selesai_pada is null;
alter table public.koreksi_data enable row level security;
revoke all on table public.koreksi_data from anon, authenticated;

create table if not exists public.konfirmasi_data (
  id uuid primary key default gen_random_uuid(),
  npsn text not null,
  jenis text not null check (jenis in ('ptk', 'siswa')),
  subjek_id uuid not null,
  semester text not null,
  user_id uuid not null,
  user_peran text not null,
  dibuat_pada timestamptz not null default now(),
  unique (jenis, subjek_id, semester)
);
create index if not exists konfirmasi_data_npsn_idx on public.konfirmasi_data (npsn, semester);
alter table public.konfirmasi_data enable row level security;
revoke all on table public.konfirmasi_data from anon, authenticated;

create table if not exists public.pencocokan_semester (
  id uuid primary key default gen_random_uuid(),
  npsn text not null,
  semester text not null,
  dibuat_pada timestamptz not null default now(),
  dibuat_oleh uuid,
  belum_cocok integer not null,
  rincian jsonb not null,
  konfirmasi jsonb not null,
  catatan text
);
create index if not exists pencocokan_semester_npsn_idx on public.pencocokan_semester (npsn, dibuat_pada desc);
alter table public.pencocokan_semester enable row level security;
revoke all on table public.pencocokan_semester from anon, authenticated;

-- Semester berjalan dalam format semester_id Dapodik: 20251 ganjil, 20252 genap.
create or replace function private.semester_sekarang() returns text
language sql stable set search_path = '' as $fn$
  select case when extract(month from current_date) >= 7
              then extract(year from current_date)::int::text || '1'
              else (extract(year from current_date)::int - 1)::text || '2' end
$fn$;

-- Nilai kolom menurut Dapodik: nilai terakhir yang terlihat di unggahan bila kolom sedang dikoreksi, selain itu nilai SIMS.
create or replace function private.nilai_dapodik(p_jenis text, p_kunci text, p_subjek uuid) returns text
language plpgsql stable security definer set search_path = '' as $fn$
declare d public.koreksi_data;
begin
  select * into d from public.koreksi_data where jenis = p_jenis and subjek_id = p_subjek and kunci = p_kunci and selesai_pada is null;
  if found then return d.nilai_dapodik; end if;
  return private.nilai_sekarang(p_jenis, p_kunci, p_subjek);
end $fn$;

-- Menulis satu kolom ke tabel sumbernya. Bendera sims.koreksi membuat pelindung unggahan membiarkan tulisan ini.
create or replace function private.tulis_butir(p_jenis text, p_kunci text, p_subjek uuid, p_npsn text, p_baru text) returns void
language plpgsql security definer set search_path = '' as $fn$
declare k public.kolom_ajuan; n integer;
begin
  select * into k from public.kolom_ajuan where jenis = p_jenis and kunci = p_kunci;
  if not found then raise exception 'Kolom "%" tidak dikenal.', p_kunci; end if;
  perform set_config('sims.koreksi', '1', true);
  if k.tabel = 'ptk' then
    execute format('update public.ptk set %I = $1::%s where id = $2 and npsn = $3', k.kolom, k.tipe_sql) using p_baru, p_subjek, p_npsn;
    get diagnostics n = row_count;
  elsif k.tabel = 'peserta_didik' then
    execute format('update public.peserta_didik set %I = $1::%s where id = $2 and npsn = $3', k.kolom, k.tipe_sql) using p_baru, p_subjek, p_npsn;
    get diagnostics n = row_count;
  elsif k.tabel = 'ptk_sensitif' then
    execute format('update public.ptk_sensitif set %I = $1::%s where ptk_id = $2', k.kolom, k.tipe_sql) using p_baru, p_subjek;
    get diagnostics n = row_count;
    if n = 0 then
      execute format('insert into public.ptk_sensitif (ptk_id, %I) values ($1, $2::%s)', k.kolom, k.tipe_sql) using p_subjek, p_baru;
      n := 1;
    end if;
  elsif k.tabel = 'peserta_didik_sensitif' then
    execute format('update public.peserta_didik_sensitif set %I = $1::%s where peserta_didik_id = $2', k.kolom, k.tipe_sql) using p_baru, p_subjek;
    get diagnostics n = row_count;
    if n = 0 then
      execute format('insert into public.peserta_didik_sensitif (peserta_didik_id, %I) values ($1, $2::%s)', k.kolom, k.tipe_sql) using p_subjek, p_baru;
      n := 1;
    end if;
  else
    execute format('update public.orang_tua_wali set %I = $1::%s where peserta_didik_id = $2 and hubungan = $3', k.kolom, k.tipe_sql) using p_baru, p_subjek, k.hubungan;
    get diagnostics n = row_count;
    if n = 0 then
      execute format('insert into public.orang_tua_wali (peserta_didik_id, hubungan, %I) values ($1, $2, $3::%s)', k.kolom, k.tipe_sql) using p_subjek, k.hubungan, p_baru;
      n := 1;
    end if;
  end if;
  perform set_config('sims.koreksi', '', true);
  if n = 0 then raise exception 'Baris data "%" tidak ditemukan, perubahan dibatalkan.', k.label; end if;
end $fn$;

-- Menerapkan koreksi pengguna: tulis ke SIMS, lalu catat sebagai koreksi sampai Dapodik memuat nilai yang sama.
create or replace function private.terapkan_butir(p_jenis text, p_kunci text, p_subjek uuid, p_npsn text, p_baru text) returns void
language plpgsql security definer set search_path = '' as $fn$
declare k public.kolom_ajuan; v_lama text; v_dapodik text; v_ada boolean := false;
begin
  select * into k from public.kolom_ajuan where jenis = p_jenis and kunci = p_kunci;
  if not found then raise exception 'Kolom "%" tidak dikenal.', p_kunci; end if;
  if k.jalur = 'operator' then raise exception 'Kolom "%" hanya berubah lewat unggahan Dapodik.', k.label; end if;

  v_lama := private.nilai_sekarang(p_jenis, p_kunci, p_subjek);
  perform private.tulis_butir(p_jenis, p_kunci, p_subjek, p_npsn, p_baru);

  select true, d.nilai_dapodik into v_ada, v_dapodik from public.koreksi_data d
   where d.jenis = p_jenis and d.subjek_id = p_subjek and d.kunci = p_kunci and d.selesai_pada is null;
  if not coalesce(v_ada, false) then v_dapodik := v_lama; end if;
  if nullif(btrim(coalesce(p_baru, '')), '') is not distinct from nullif(btrim(coalesce(v_dapodik, '')), '') then
    update public.koreksi_data set selesai_pada = now(), selesai_alasan = 'Kembali ke nilai Dapodik'
     where jenis = p_jenis and subjek_id = p_subjek and kunci = p_kunci and selesai_pada is null;
  else
    insert into public.koreksi_data (npsn, jenis, subjek_id, kunci, nilai_sims, nilai_dapodik, dikoreksi_oleh)
    values (p_npsn, p_jenis, p_subjek, p_kunci, p_baru, v_dapodik, auth.uid())
    on conflict (jenis, subjek_id, kunci) do update
      set nilai_sims = excluded.nilai_sims, nilai_dapodik = excluded.nilai_dapodik, dikoreksi_pada = now(),
          dikoreksi_oleh = excluded.dikoreksi_oleh, selesai_pada = null, selesai_alasan = null;
  end if;
end $fn$;

-- Membatalkan koreksi: nilai SIMS dikembalikan ke nilai Dapodik terakhir dan perlindungan selesai.
create or replace function private.balikkan_butir(p_jenis text, p_kunci text, p_subjek uuid, p_npsn text) returns boolean
language plpgsql security definer set search_path = '' as $fn$
declare d public.koreksi_data;
begin
  select * into d from public.koreksi_data where jenis = p_jenis and subjek_id = p_subjek and kunci = p_kunci and selesai_pada is null for update;
  if not found then return false; end if;
  perform private.tulis_butir(p_jenis, p_kunci, p_subjek, p_npsn, d.nilai_dapodik);
  update public.koreksi_data set selesai_pada = now(), selesai_alasan = 'Dikembalikan ke nilai Dapodik' where id = d.id;
  return true;
end $fn$;

-- Pelindung unggahan. Unggahan Dapodik (upsert) tidak boleh menimpa kolom yang sedang dikoreksi.
-- Nilai Dapodik yang masuk dicatat di koreksi_data.nilai_dapodik dan nilai SIMS dipertahankan.
-- Bila nilai masuk sudah sama dengan koreksi pada unggahan (kolom dari_dapodik), koreksi ditandai selesai.
-- Unggahan dikenali dari bendera sims.unggah (dapodik_upsert_anak) atau perubahan diperbarui_pada pada ptk dan peserta_didik.
create or replace function private.lindungi_koreksi() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare v_jenis text; v_subj uuid; v_hub text; k record; v_o jsonb; v_n jsonb; v_unggah boolean; v_baru text; v_lama text;
begin
  if current_setting('sims.koreksi', true) = '1' then return new; end if;
  v_jenis := case when tg_table_name in ('ptk', 'ptk_sensitif') then 'ptk' else 'siswa' end;
  v_n := to_jsonb(new);
  v_o := to_jsonb(old);
  v_subj := (v_n ->> case tg_table_name when 'ptk' then 'id' when 'peserta_didik' then 'id' when 'ptk_sensitif' then 'ptk_id' else 'peserta_didik_id' end)::uuid;
  if not exists (select 1 from public.koreksi_data where jenis = v_jenis and subjek_id = v_subj and selesai_pada is null) then return new; end if;
  v_hub := v_n ->> 'hubungan';
  v_unggah := current_setting('sims.unggah', true) = '1'
    or (tg_table_name in ('ptk', 'peserta_didik') and (v_n ->> 'diperbarui_pada') is distinct from (v_o ->> 'diperbarui_pada'));
  for k in
    select d.id, a.kolom, a.dari_dapodik
      from public.koreksi_data d
      join public.kolom_ajuan a on a.jenis = d.jenis and a.kunci = d.kunci
     where d.jenis = v_jenis and d.subjek_id = v_subj and d.selesai_pada is null
       and a.tabel = tg_table_name and (a.hubungan is null or a.hubungan = v_hub)
  loop
    v_baru := v_n ->> k.kolom;
    v_lama := v_o ->> k.kolom;
    if v_baru is distinct from v_lama then
      update public.koreksi_data set nilai_dapodik = v_baru, dapodik_dilihat_pada = now() where id = k.id;
      v_n := v_n || jsonb_build_object(k.kolom, v_o -> k.kolom);
    elsif v_unggah and k.dari_dapodik then
      update public.koreksi_data
         set nilai_dapodik = v_baru, dapodik_dilihat_pada = now(), selesai_pada = now(), selesai_alasan = 'Nilai sudah sama di Dapodik'
       where id = k.id;
    end if;
  end loop;
  new := jsonb_populate_record(new, v_n);
  return new;
end $fn$;

create or replace trigger trg_lindungi_koreksi before update on public.ptk for each row execute function private.lindungi_koreksi();
create or replace trigger trg_lindungi_koreksi before update on public.ptk_sensitif for each row execute function private.lindungi_koreksi();
create or replace trigger trg_lindungi_koreksi before update on public.peserta_didik for each row execute function private.lindungi_koreksi();
create or replace trigger trg_lindungi_koreksi before update on public.peserta_didik_sensitif for each row execute function private.lindungi_koreksi();
create or replace trigger trg_lindungi_koreksi before update on public.orang_tua_wali for each row execute function private.lindungi_koreksi();

-- dapodik_upsert_anak: tandai transaksi sebagai unggahan (lihat pelindung di atas). Selain bendera, isinya tidak berubah.
create or replace function public.dapodik_upsert_anak(p_tabel text, p_rows jsonb, p_cols text[])
 returns integer
 language plpgsql
 set search_path to 'public'
as $fn$
declare
  v_npsn text := private.npsn_saya();
  v_parent text; v_fk text; v_conf text;
  c text; v_ins text := ''; v_sel text := ''; v_upd text := ''; v_n integer;
begin
  if v_npsn is null or private.peran_saya() <> 'admin_tu' then raise exception 'tidak berwenang'; end if;
  if p_tabel = 'peserta_didik_sensitif' then v_parent := 'peserta_didik'; v_fk := 'peserta_didik_id'; v_conf := 'peserta_didik_id';
  elsif p_tabel = 'orang_tua_wali' then v_parent := 'peserta_didik'; v_fk := 'peserta_didik_id'; v_conf := 'peserta_didik_id, hubungan';
  elsif p_tabel = 'ptk_sensitif' then v_parent := 'ptk'; v_fk := 'ptk_id'; v_conf := 'ptk_id';
  else raise exception 'tabel tidak diizinkan: %', p_tabel; end if;
  foreach c in array p_cols loop
    if c in (v_fk, 'id') or not exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = p_tabel and column_name = c) then
      raise exception 'kolom tidak diizinkan: %', c;
    end if;
    v_ins := v_ins || ',' || quote_ident(c);
    v_sel := v_sel || ',r.' || quote_ident(c);
    if c <> 'hubungan' then v_upd := v_upd || ',' || quote_ident(c) || '=excluded.' || quote_ident(c); end if;
  end loop;
  if v_upd = '' then v_upd := ',' || quote_ident(v_fk) || '=excluded.' || quote_ident(v_fk); end if;
  perform set_config('sims.unggah', '1', true);
  execute format(
    'insert into public.%1$I (%2$I%3$s) select p.id%4$s from jsonb_array_elements($1) e '
    'cross join lateral jsonb_populate_record(null::public.%1$I, e) r '
    'join public.%5$I p on p.npsn = $2 and p.kunci_identitas = e->>''kunci_identitas'' '
    'on conflict (%6$s) do update set %7$s',
    p_tabel, v_fk, v_ins, v_sel, v_parent, v_conf, substr(v_upd, 2))
    using p_rows, v_npsn;
  get diagnostics v_n = row_count;
  perform set_config('sims.unggah', '', true);
  return v_n;
end $fn$;

-- cocokkan_ajuan: ajuan selesai bila nilai menurut Dapodik (bukan nilai SIMS yang sudah dikoreksi) sama dengan usulan.
create or replace function public.cocokkan_ajuan()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $fn$
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
      if nullif(btrim(coalesce(private.nilai_dapodik(a.jenis, it->>'kunci', a.subjek_id), '')), '')
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
end $fn$;

-- kerjakan_ajuan: bila operator mengembalikan ajuan yang sudah berlaku di SIMS, nilai SIMS kembali ke nilai Dapodik.
create or replace function public.kerjakan_ajuan(p_id uuid, p_aksi text, p_catatan text default null)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare a public.ajuan_perubahan; v_catatan text := nullif(btrim(coalesce(p_catatan, '')), ''); it jsonb; v_balik integer := 0;
begin
  if not private.boleh_kerjakan() then raise exception 'Hanya operator Dapodik yang dapat mengerjakan antrean ini.'; end if;
  select * into a from public.ajuan_perubahan where id = p_id and npsn = private.npsn_saya() for update;
  if not found then raise exception 'Ajuan tidak ditemukan.'; end if;
  if p_aksi = 'mulai' then
    if a.status <> 'diteruskan' then raise exception 'Ajuan ini tidak berada di antrean operator.'; end if;
    update public.ajuan_perubahan set status = 'dikerjakan', operator_id = (select auth.uid()), dikerjakan_pada = now(), catatan_operator = v_catatan where id = p_id;
  elsif p_aksi = 'selesai' then
    if a.status not in ('diteruskan', 'dikerjakan') then raise exception 'Ajuan ini tidak berada di antrean operator.'; end if;
    update public.ajuan_perubahan
       set status = 'selesai', operator_id = (select auth.uid()), selesai_pada = now(), belum_terbukti = false,
           dikerjakan_pada = coalesce(dikerjakan_pada, now()), catatan_operator = coalesce(v_catatan, catatan_operator)
     where id = p_id;
  elsif p_aksi = 'kembalikan' then
    if a.status not in ('diteruskan', 'dikerjakan') then raise exception 'Ajuan ini tidak berada di antrean operator.'; end if;
    if v_catatan is null then raise exception 'Tulis alasan pengembalian.'; end if;
    if a.diterapkan_pada is not null and a.jenis in ('ptk', 'siswa') then
      for it in select * from jsonb_array_elements(a.perubahan) loop
        if exists (select 1 from public.koreksi_data d where d.jenis = a.jenis and d.subjek_id = a.subjek_id and d.kunci = it->>'kunci'
                    and d.selesai_pada is null and d.nilai_sims is not distinct from nullif(it->>'baru', '')) then
          if private.balikkan_butir(a.jenis, it->>'kunci', a.subjek_id, a.npsn) then v_balik := v_balik + 1; end if;
        end if;
      end loop;
    end if;
    update public.ajuan_perubahan set status = 'ditolak', operator_id = (select auth.uid()), catatan_operator = v_catatan, selesai_pada = now() where id = p_id;
  else
    raise exception 'Aksi tidak dikenal.';
  end if;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan) values ((select auth.uid()), 'ajuan_perubahan', upper(p_aksi), jsonb_build_object('ajuan', p_id, 'dikembalikan', v_balik));
end $fn$;

-- Konfirmasi: pengguna menyatakan datanya sudah benar untuk semester berjalan.
create or replace function private.boleh_atas_nama(p_jenis text, p_subjek uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select coalesce(case
    when p_jenis = 'ptk' then private.peran_saya() in ('guru', 'staf') and p_subjek = private.ptk_id_saya()
    when p_jenis = 'siswa' then (private.peran_saya() = 'siswa' and p_subjek = private.pd_id_saya())
                              or (private.peran_saya() = 'orang_tua' and p_subjek in (select private.anak_saya()))
    else false end, false)
$fn$;

create or replace function public.konfirmasi_status(p_jenis text, p_subjek uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare v_sem text := private.semester_sekarang(); d public.konfirmasi_data;
begin
  if not private.boleh_atas_nama(p_jenis, p_subjek) then raise exception 'Anda tidak berhak atas data ini.'; end if;
  select * into d from public.konfirmasi_data where jenis = p_jenis and subjek_id = p_subjek and semester = v_sem;
  return jsonb_build_object('semester', v_sem, 'sudah', found, 'pada', d.dibuat_pada,
    'koreksi_aktif', (select count(*) from public.koreksi_data k where k.jenis = p_jenis and k.subjek_id = p_subjek and k.selesai_pada is null));
end $fn$;

create or replace function public.konfirmasi_data_saya(p_jenis text, p_subjek uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare v_sem text := private.semester_sekarang(); v_npsn text := private.npsn_saya();
begin
  if not private.boleh_atas_nama(p_jenis, p_subjek) then raise exception 'Anda tidak berhak atas data ini.'; end if;
  insert into public.konfirmasi_data (npsn, jenis, subjek_id, semester, user_id, user_peran)
  values (v_npsn, p_jenis, p_subjek, v_sem, (select auth.uid()), private.peran_saya())
  on conflict (jenis, subjek_id, semester) do update set dibuat_pada = now(), user_id = excluded.user_id, user_peran = excluded.user_peran;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan)
  values ((select auth.uid()), 'konfirmasi_data', 'KONFIRMASI', jsonb_build_object('jenis', p_jenis, 'subjek', p_subjek, 'semester', v_sem));
  return public.konfirmasi_status(p_jenis, p_subjek);
end $fn$;

-- Pencocokan akhir semester untuk operator.
create or replace function private.ringkas_pencocokan(p_npsn text) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object(
    'semester', private.semester_sekarang(),
    'belum_cocok', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'jenis', d.jenis, 'subjek_id', d.subjek_id, 'nama', coalesce(p.nama, s.nama), 'kunci', d.kunci,
        'label', a.label, 'kelompok', a.kelompok, 'butir', a.butir, 'nilai_sims', d.nilai_sims, 'nilai_dapodik', d.nilai_dapodik,
        'dikoreksi_pada', d.dikoreksi_pada, 'dapodik_dilihat_pada', d.dapodik_dilihat_pada,
        'sudah_dilihat', d.dapodik_dilihat_pada is not null) order by coalesce(p.nama, s.nama), a.urutan)
      from public.koreksi_data d
      join public.kolom_ajuan a on a.jenis = d.jenis and a.kunci = d.kunci
      left join public.ptk p on d.jenis = 'ptk' and p.id = d.subjek_id
      left join public.peserta_didik s on d.jenis = 'siswa' and s.id = d.subjek_id
      where d.npsn = p_npsn and d.selesai_pada is null), '[]'::jsonb),
    'sudah_sama', (select count(*) from public.koreksi_data d where d.npsn = p_npsn and d.selesai_pada is not null),
    'konfirmasi', jsonb_build_object(
      'ptk_sudah', (select count(*) from public.konfirmasi_data c where c.npsn = p_npsn and c.jenis = 'ptk' and c.semester = private.semester_sekarang()),
      'ptk_total', (select count(*) from public.ptk t where t.npsn = p_npsn),
      'siswa_sudah', (select count(*) from public.konfirmasi_data c where c.npsn = p_npsn and c.jenis = 'siswa' and c.semester = private.semester_sekarang()),
      'siswa_total', (select count(*) from public.peserta_didik t where t.npsn = p_npsn and t.status_peserta_didik = 'aktif')))
$fn$;

create or replace function public.pencocokan_daftar() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not private.boleh_kerjakan() then raise exception 'Tidak berwenang.'; end if;
  return private.ringkas_pencocokan(private.npsn_saya()) || jsonb_build_object('riwayat', coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'semester', r.semester, 'dibuat_pada', r.dibuat_pada, 'belum_cocok', r.belum_cocok, 'catatan', r.catatan) order by r.dibuat_pada desc)
    from (select * from public.pencocokan_semester where npsn = private.npsn_saya() order by dibuat_pada desc limit 12) r), '[]'::jsonb));
end $fn$;

create or replace function public.pencocokan_catat(p_catatan text default null) returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare v_r jsonb; v_id uuid;
begin
  if not private.boleh_kerjakan() then raise exception 'Tidak berwenang.'; end if;
  v_r := private.ringkas_pencocokan(private.npsn_saya());
  insert into public.pencocokan_semester (npsn, semester, dibuat_oleh, belum_cocok, rincian, konfirmasi, catatan)
  values (private.npsn_saya(), v_r ->> 'semester', (select auth.uid()), jsonb_array_length(v_r -> 'belum_cocok'), v_r -> 'belum_cocok', v_r -> 'konfirmasi', nullif(btrim(coalesce(p_catatan, '')), ''))
  returning id into v_id;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan)
  values ((select auth.uid()), 'pencocokan_semester', 'CATAT', jsonb_build_object('id', v_id, 'belum_cocok', jsonb_array_length(v_r -> 'belum_cocok')));
  return v_id;
end $fn$;

revoke all on function private.semester_sekarang(), private.nilai_dapodik(text, text, uuid), private.tulis_butir(text, text, uuid, text, text),
  private.terapkan_butir(text, text, uuid, text, text), private.balikkan_butir(text, text, uuid, text), private.lindungi_koreksi(),
  private.boleh_atas_nama(text, uuid), private.ringkas_pencocokan(text),
  public.konfirmasi_status(text, uuid), public.konfirmasi_data_saya(text, uuid), public.pencocokan_daftar(), public.pencocokan_catat(text) from public, anon;
grant execute on function private.semester_sekarang(), private.nilai_dapodik(text, text, uuid), private.tulis_butir(text, text, uuid, text, text),
  private.terapkan_butir(text, text, uuid, text, text), private.balikkan_butir(text, text, uuid, text), private.lindungi_koreksi(),
  private.boleh_atas_nama(text, uuid), private.ringkas_pencocokan(text),
  public.konfirmasi_status(text, uuid), public.konfirmasi_data_saya(text, uuid), public.pencocokan_daftar(), public.pencocokan_catat(text) to authenticated;

-- Ajuan aktif yang sudah berlaku di SIMS sebelum migrasi ini ikut dilindungi.
insert into public.koreksi_data (npsn, jenis, subjek_id, kunci, nilai_sims, nilai_dapodik, dikoreksi_pada)
select a.npsn, a.jenis, a.subjek_id, e->>'kunci', nullif(e->>'baru', ''), nullif(e->>'lama', ''), coalesce(a.diterapkan_pada, a.dibuat_pada)
from public.ajuan_perubahan a cross join lateral jsonb_array_elements(a.perubahan) e
where a.status in ('diteruskan', 'dikerjakan') and a.diterapkan_pada is not null and a.jenis in ('ptk', 'siswa')
  and coalesce(e->>'diterapkan', 'false') = 'true'
  and nullif(btrim(coalesce(private.nilai_sekarang(a.jenis, e->>'kunci', a.subjek_id), '')), '') is not distinct from nullif(btrim(coalesce(e->>'baru', '')), '')
  and nullif(btrim(coalesce(e->>'lama', '')), '') is distinct from nullif(btrim(coalesce(e->>'baru', '')), '')
on conflict (jenis, subjek_id, kunci) do nothing;
