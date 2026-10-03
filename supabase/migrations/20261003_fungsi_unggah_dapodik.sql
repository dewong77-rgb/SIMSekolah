-- Fungsi bantu unggah Dapodik. Semua SECURITY INVOKER: RLS tetap berlaku,
-- hanya admin_tu untuk NPSN-nya sendiri yang dapat memanggilnya.

create or replace function public.dapodik_upsert_anak(p_tabel text, p_rows jsonb, p_cols text[])
returns integer language plpgsql security invoker set search_path = public as $$
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
  execute format(
    'insert into public.%1$I (%2$I%3$s) select p.id%4$s from jsonb_array_elements($1) e '
    'cross join lateral jsonb_populate_record(null::public.%1$I, e) r '
    'join public.%5$I p on p.npsn = $2 and p.kunci_identitas = e->>''kunci_identitas'' '
    'on conflict (%6$s) do update set %7$s',
    p_tabel, v_fk, v_ins, v_sel, v_parent, v_conf, substr(v_upd, 2))
    using p_rows, v_npsn;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.dapodik_pasang_rombel(p_rows jsonb, p_extra text[], p_batch uuid)
returns integer language plpgsql security invoker set search_path = public as $$
declare
  v_npsn text := private.npsn_saya();
  c text; v_upd text := ''; v_n integer;
begin
  if v_npsn is null or private.peran_saya() <> 'admin_tu' then raise exception 'tidak berwenang'; end if;
  foreach c in array coalesce(p_extra, '{}') loop
    if c not in ('tingkat','kurikulum','ruangan','wali_kelas_nama','jumlah_l_profil','jumlah_p_profil') then
      raise exception 'kolom tidak diizinkan: %', c;
    end if;
    v_upd := v_upd || ',' || quote_ident(c) || '=excluded.' || quote_ident(c);
  end loop;
  execute format(
    'insert into public.rombel (npsn, semester_id, jenis_rombel, nama, tingkat, kurikulum, ruangan, wali_kelas_nama, jumlah_l_profil, jumlah_p_profil, batch_id) '
    'select $2, r.semester_id, r.jenis_rombel, r.nama, r.tingkat, r.kurikulum, r.ruangan, r.wali_kelas_nama, r.jumlah_l_profil, r.jumlah_p_profil, $3 '
    'from jsonb_populate_recordset(null::public.rombel, $1) r '
    'on conflict (npsn, semester_id, jenis_rombel, nama) do update set batch_id = excluded.batch_id, diperbarui_pada = now()%s',
    v_upd) using p_rows, v_npsn, p_batch;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.dapodik_pasang_keanggotaan(p_rows jsonb, p_ganti_roster boolean)
returns integer language plpgsql security invoker set search_path = public as $$
declare
  v_npsn text := private.npsn_saya();
  v_n integer;
begin
  if v_npsn is null or private.peran_saya() <> 'admin_tu' then raise exception 'tidak berwenang'; end if;
  create temp table _m on commit drop as
    select ro.id as rombel_id, pd.id as pd_id, (e->>'no_urut')::integer as no_urut,
           ro.semester_id, ro.jenis_rombel
    from jsonb_array_elements(p_rows) e
    join public.rombel ro on ro.npsn = v_npsn and ro.semester_id = e->>'semester_id'
         and ro.jenis_rombel = e->>'jenis_rombel' and ro.nama = e->>'rombel'
    join public.peserta_didik pd on pd.npsn = v_npsn and pd.kunci_identitas = e->>'kunci_identitas';
  -- siswa pindah rombel utama: hapus keanggotaan utama lamanya pada semester yang sama
  delete from public.keanggotaan_rombel k using public.rombel ro
   where k.rombel_id = ro.id and ro.npsn = v_npsn and ro.jenis_rombel = 'Kelas Utama'
     and exists (select 1 from _m where _m.pd_id = k.peserta_didik_id and _m.jenis_rombel = 'Kelas Utama'
                 and _m.semester_id = ro.semester_id)
     and not exists (select 1 from _m where _m.rombel_id = k.rombel_id and _m.pd_id = k.peserta_didik_id);
  if p_ganti_roster then
    delete from public.keanggotaan_rombel k
     where k.rombel_id in (select distinct rombel_id from _m)
       and not exists (select 1 from _m where _m.rombel_id = k.rombel_id and _m.pd_id = k.peserta_didik_id);
  end if;
  insert into public.keanggotaan_rombel (rombel_id, peserta_didik_id, no_urut)
    select rombel_id, pd_id, no_urut from _m
    on conflict (rombel_id, peserta_didik_id) do update set no_urut = excluded.no_urut;
  get diagnostics v_n = row_count;
  drop table _m;
  return v_n;
end $$;

create or replace function public.dapodik_ganti_snapshot(p_tabel text, p_rows jsonb, p_batch uuid)
returns integer language plpgsql security invoker set search_path = public as $$
declare
  v_npsn text := private.npsn_saya();
  v_cols text; v_n integer;
begin
  if v_npsn is null or private.peran_saya() <> 'admin_tu' then raise exception 'tidak berwenang'; end if;
  if p_tabel not in ('prasarana','sarana','bantuan_sekolah','unit_produksi','praktik_industri') then
    raise exception 'tabel tidak diizinkan: %', p_tabel;
  end if;
  select string_agg(quote_ident(column_name), ',' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = p_tabel and column_name not in ('id','npsn','batch_id');
  execute format('delete from public.%I where npsn = $1', p_tabel) using v_npsn;
  execute format('insert into public.%1$I (npsn, batch_id, %2$s) select $1, $2, %2$s from jsonb_populate_recordset(null::public.%1$I, $3)',
                 p_tabel, v_cols) using v_npsn, p_batch, p_rows;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.dapodik_resolve_wali()
returns integer language plpgsql security invoker set search_path = public as $$
declare
  v_npsn text := private.npsn_saya();
  v_belum integer;
begin
  if v_npsn is null or private.peran_saya() <> 'admin_tu' then raise exception 'tidak berwenang'; end if;
  update public.rombel r set wali_kelas_ptk_id = p.id
    from public.ptk p
   where r.npsn = v_npsn and p.npsn = r.npsn and r.wali_kelas_ptk_id is null and r.wali_kelas_nama is not null
     and lower(regexp_replace(trim(p.nama), '\s+', ' ', 'g')) = lower(regexp_replace(trim(r.wali_kelas_nama), '\s+', ' ', 'g'));
  select count(*) into v_belum from public.rombel
   where npsn = v_npsn and wali_kelas_nama is not null and wali_kelas_ptk_id is null;
  return v_belum;
end $$;

revoke all on function public.dapodik_upsert_anak(text, jsonb, text[]) from public, anon;
revoke all on function public.dapodik_pasang_rombel(jsonb, text[], uuid) from public, anon;
revoke all on function public.dapodik_pasang_keanggotaan(jsonb, boolean) from public, anon;
revoke all on function public.dapodik_ganti_snapshot(text, jsonb, uuid) from public, anon;
revoke all on function public.dapodik_resolve_wali() from public, anon;
grant execute on function public.dapodik_upsert_anak(text, jsonb, text[]) to authenticated;
grant execute on function public.dapodik_pasang_rombel(jsonb, text[], uuid) to authenticated;
grant execute on function public.dapodik_pasang_keanggotaan(jsonb, boolean) to authenticated;
grant execute on function public.dapodik_ganti_snapshot(text, jsonb, uuid) to authenticated;
grant execute on function public.dapodik_resolve_wali() to authenticated;
