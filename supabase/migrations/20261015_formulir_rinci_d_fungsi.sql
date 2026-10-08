-- Fungsi akses mesin formulir rinci: katalog, daftar, simpan, hapus, dan impor ruang dari potret prasarana Dapodik.
-- Setiap simpan dan hapus berlaku langsung dan membuat tagihan kerja operator Dapodik (ajuan_perubahan, status diteruskan).

create or replace function private.formulir_akses(p_entitas text, p_owner uuid, p_tulis boolean) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare v_dom text; v_peran text := private.peran_saya(); v_npsn text := private.npsn_saya();
begin
  select domain into v_dom from public.formulir_entitas where kode = p_entitas;
  if v_dom is null or auth.uid() is null or v_npsn is null then return false; end if;
  if v_dom = 'sarpras' then
    if p_tulis then return coalesce(private.punya_izin('sarpras.kelola', null), false); end if;
    return coalesce(private.sarpras_boleh_lihat(), false);
  elsif v_dom = 'ptk' then
    if p_owner is null or not exists (select 1 from public.ptk where id = p_owner and npsn = v_npsn) then return false; end if;
    if v_peran in ('guru', 'staf') and p_owner = private.ptk_id_saya() then return true; end if;
    return not p_tulis and coalesce(private.boleh_putuskan('ptk'), false);
  else
    if p_owner is null or not exists (select 1 from public.peserta_didik where id = p_owner and npsn = v_npsn) then return false; end if;
    if v_peran = 'siswa' and p_owner = private.pd_id_saya() then return true; end if;
    if v_peran = 'orang_tua' and p_owner in (select private.anak_saya()) then return true; end if;
    return not p_tulis and coalesce(private.boleh_putuskan('siswa'), false);
  end if;
end $$;
revoke execute on function private.formulir_akses(text, uuid, boolean) from public, anon, authenticated;

create or replace function public.formulir_katalog() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when auth.uid() is not null then coalesce((
    select jsonb_agg(jsonb_build_object(
      'kode', e.kode, 'domain', e.domain, 'judul', e.judul, 'kode_formulir', e.kode_formulir, 'tampilan', e.tampilan, 'tampil_kolom', e.tampil_kolom,
      'kolom', coalesce((select jsonb_agg(to_jsonb(k) - 'entitas' order by k.urutan) from public.formulir_kolom k where k.entitas = e.kode), '[]'::jsonb))
      order by e.urutan) from public.formulir_entitas e), '[]'::jsonb) end
$$;

create or replace function public.formulir_daftar(p_entitas text, p_owner uuid default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_hasil jsonb;
begin
  if not private.formulir_akses(p_entitas, p_owner, false) then return null; end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t) - ''npsn'' - ''diubah_oleh'' order by t.dibuat_pada), ''[]''::jsonb) from public.%I t where t.npsn = $1 and t.owner_id is not distinct from $2 and t.dihapus_pada is null', 'fr_' || p_entitas)
    into v_hasil using private.npsn_saya(), p_owner;
  return v_hasil;
end $$;

-- Nilai tampil sebuah baris (kolom tampil_kolom entitas), dipakai untuk judul tagihan.
create or replace function private.formulir_tampil(p_entitas text, p_id uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare v_kol text; v_hasil text;
begin
  select tampil_kolom into v_kol from public.formulir_entitas where kode = p_entitas;
  if v_kol is null or p_id is null then return null; end if;
  execute format('select %I::text from public.%I where id = $1 and npsn = $2', v_kol, 'fr_' || p_entitas) into v_hasil using p_id, private.npsn_saya();
  return v_hasil;
end $$;
revoke execute on function private.formulir_tampil(text, uuid) from public, anon, authenticated;

create or replace function public.formulir_simpan(p_entitas text, p_id uuid, p_owner uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  e public.formulir_entitas; k record; v_npsn text := private.npsn_saya(); v_tabel text;
  v_val jsonb := '{}'::jsonb; v_baru text; v_num numeric; v_lama_row jsonb; v_baru_row jsonb; v_butir jsonb := '[]'::jsonb;
  v_id uuid := p_id; v_jumlah integer; v_batas integer; v_lama_t text; v_baru_t text; v_ada boolean; v_cols text; v_sel text; v_set text;
  v_nama text; v_jenis text; v_subjek uuid; v_tampil text; v_luas_kol text;
begin
  select * into e from public.formulir_entitas where kode = p_entitas;
  if not found then raise exception 'Formulir tidak dikenal.'; end if;
  if e.domain = 'sarpras' then p_owner := null; end if;
  if not private.formulir_akses(p_entitas, p_owner, true) then raise exception 'Anda tidak berhak mengubah data ini.'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Isian tidak valid.'; end if;
  v_tabel := 'fr_' || p_entitas;

  if p_id is not null then
    execute format('select to_jsonb(t) from public.%I t where t.id = $1 and t.npsn = $2 and t.owner_id is not distinct from $3 and t.dihapus_pada is null', v_tabel)
      into v_lama_row using p_id, v_npsn, p_owner;
    if v_lama_row is null then raise exception 'Baris tidak ditemukan.'; end if;
  else
    execute format('select count(*) from public.%I t where t.npsn = $1 and t.owner_id is not distinct from $2 and t.dihapus_pada is null', v_tabel) into v_jumlah using v_npsn, p_owner;
    v_batas := case when e.domain = 'sarpras' then 3000 else 100 end;
    if v_jumlah >= v_batas then raise exception 'Jumlah baris sudah mencapai batas.'; end if;
  end if;

  for k in select * from public.formulir_kolom where entitas = p_entitas order by urutan loop
    if not (p_data ? k.kunci) then
      if p_id is null and k.wajib then raise exception '"%" wajib diisi.', k.label; end if;
      continue;
    end if;
    v_baru := nullif(btrim(coalesce(p_data->>k.kunci, '')), '');
    if v_baru is null and k.wajib then raise exception '"%" tidak boleh kosong.', k.label; end if;
    if v_baru is not null then
      if length(v_baru) > 300 then raise exception '"%" terlalu panjang.', k.label; end if;
      if k.tipe = 'pilihan' then
        if not (k.pilihan ? v_baru) then raise exception 'Pilihan "%" tidak valid untuk %.', v_baru, k.label; end if;
      elsif k.tipe in ('angka', 'bulat') then
        begin
          v_num := v_baru::numeric;
        exception when others then
          raise exception 'Nilai "%" bukan angka untuk %.', v_baru, k.label;
        end;
        if v_num < coalesce(k.min_nilai, 0) or (k.maks_nilai is not null and v_num > k.maks_nilai) or v_num > 100000000000000 then
          raise exception 'Nilai % di luar batas untuk %.', v_baru, k.label;
        end if;
        if k.tipe = 'bulat' and v_num <> trunc(v_num) then raise exception '% harus bilangan bulat.', k.label; end if;
      elsif k.tipe = 'tanggal' then
        begin
          if v_baru::date < date '1900-01-01' or v_baru::date > date '2100-12-31' then raise exception 'x'; end if;
        exception when others then
          raise exception 'Tanggal "%" tidak valid untuk %.', v_baru, k.label;
        end;
      elsif k.tipe = 'rujukan' then
        begin
          execute format('select exists (select 1 from public.%I where id = $1 and npsn = $2 and dihapus_pada is null)', 'fr_' || k.rujukan) into v_ada using v_baru::uuid, v_npsn;
        exception when others then
          v_ada := false;
        end;
        if not v_ada then raise exception '% tidak ditemukan.', k.label; end if;
      end if;
    end if;
    v_val := v_val || jsonb_build_object(k.kunci, v_baru);
  end loop;
  if v_val = '{}'::jsonb then raise exception 'Tidak ada isian.'; end if;

  -- Luas tanah, bangunan, dan ruang dihitung dari panjang x lebar bila luas dikosongkan.
  if p_entitas in ('sarpras_tanah', 'sarpras_bangunan', 'sarpras_ruang') then
    v_luas_kol := case when p_entitas = 'sarpras_bangunan' then 'luas_tapak' else 'luas' end;
    if nullif(v_val->>'panjang', '') is not null and nullif(v_val->>'lebar', '') is not null and (v_val ? v_luas_kol) and nullif(v_val->>v_luas_kol, '') is null then
      v_val := v_val || jsonb_build_object(v_luas_kol, round((v_val->>'panjang')::numeric * (v_val->>'lebar')::numeric, 2)::text);
    end if;
  end if;

  execute format('select to_jsonb(r) from jsonb_populate_record(null::public.%I, $1) r', v_tabel) into v_baru_row using v_val;

  for k in select * from public.formulir_kolom where entitas = p_entitas and v_val ? kunci order by urutan loop
    if p_id is null then
      if v_baru_row->k.kunci = 'null'::jsonb then continue; end if;
    elsif v_lama_row->k.kunci is not distinct from v_baru_row->k.kunci then
      continue;
    end if;
    v_lama_t := v_lama_row->>k.kunci;
    v_baru_t := v_baru_row->>k.kunci;
    if k.tipe = 'rujukan' then
      v_lama_t := coalesce(private.formulir_tampil(k.rujukan, nullif(v_lama_t, '')::uuid), v_lama_t);
      v_baru_t := coalesce(private.formulir_tampil(k.rujukan, nullif(v_baru_t, '')::uuid), v_baru_t);
    end if;
    v_butir := v_butir || private.butir_tagihan(p_entitas || '.' || k.kunci, e.judul || ': ' || k.label, e.judul, coalesce(e.kode_formulir || ' ' || k.butir, e.kode_formulir), v_lama_t, v_baru_t);
  end loop;

  if p_id is not null and jsonb_array_length(v_butir) = 0 then return p_id; end if;

  select string_agg(format('%I', key), ', '), string_agg(format('r.%I', key), ', '), string_agg(format('%I = r.%I', key, key), ', ')
    into v_cols, v_sel, v_set from jsonb_object_keys(v_val) key;
  if p_id is null then
    execute format('insert into public.%I (npsn, owner_id, diubah_oleh, %s) select $1, $2, $3, %s from jsonb_populate_record(null::public.%I, $4) r returning id', v_tabel, v_cols, v_sel, v_tabel)
      into v_id using v_npsn, p_owner, auth.uid(), v_val;
  else
    execute format('update public.%I t set %s, diperbarui_pada = now(), diubah_oleh = $3 from jsonb_populate_record(null::public.%I, $4) r where t.id = $1 and t.npsn = $2', v_tabel, v_set, v_tabel)
      using p_id, v_npsn, auth.uid(), v_val;
  end if;

  v_tampil := private.formulir_tampil(p_entitas, v_id);
  if e.domain = 'ptk' then
    select nama into v_nama from public.ptk where id = p_owner; v_jenis := 'ptk'; v_subjek := p_owner;
  elsif e.domain = 'siswa' then
    select nama into v_nama from public.peserta_didik where id = p_owner; v_jenis := 'siswa'; v_subjek := p_owner;
  else
    v_nama := e.judul || ': ' || coalesce(v_tampil, '-'); v_jenis := 'sarpras'; v_subjek := v_id;
  end if;
  perform private.tagihan_buat(v_jenis, v_subjek, coalesce(v_nama, e.judul), v_butir, null);
  return v_id;
end $$;

create or replace function public.formulir_hapus(p_entitas text, p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  e public.formulir_entitas; v_npsn text := private.npsn_saya(); v_tabel text; v_owner uuid; v_ada boolean;
  v_tampil text; v_nama text; v_jenis text; v_subjek uuid;
begin
  select * into e from public.formulir_entitas where kode = p_entitas;
  if not found then raise exception 'Formulir tidak dikenal.'; end if;
  v_tabel := 'fr_' || p_entitas;
  execute format('select owner_id, true from public.%I where id = $1 and npsn = $2 and dihapus_pada is null', v_tabel) into v_owner, v_ada using p_id, v_npsn;
  if v_ada is not true then raise exception 'Baris tidak ditemukan.'; end if;
  if not private.formulir_akses(p_entitas, v_owner, true) then raise exception 'Anda tidak berhak menghapus data ini.'; end if;
  v_tampil := private.formulir_tampil(p_entitas, p_id);
  -- Hapus lunak: baris tetap ada untuk jejak audit dan tagihan operator, tetapi tidak tampil lagi.
  execute format('update public.%I set dihapus_pada = now(), diubah_oleh = $3 where id = $1 and npsn = $2', v_tabel) using p_id, v_npsn, auth.uid();
  if e.domain = 'ptk' then
    select nama into v_nama from public.ptk where id = v_owner; v_jenis := 'ptk'; v_subjek := v_owner;
  elsif e.domain = 'siswa' then
    select nama into v_nama from public.peserta_didik where id = v_owner; v_jenis := 'siswa'; v_subjek := v_owner;
  else
    v_nama := e.judul || ': ' || coalesce(v_tampil, '-'); v_jenis := 'sarpras'; v_subjek := p_id;
  end if;
  perform private.tagihan_buat(v_jenis, v_subjek, coalesce(v_nama, e.judul),
    jsonb_build_array(private.butir_tagihan(p_entitas || '.hapus', e.judul || ': dihapus dari SIMS', e.judul, e.kode_formulir, v_tampil, null)), 'Hapus baris');
end $$;

-- Mengisi daftar ruang dari potret prasarana Dapodik (nama, panjang, lebar). Tidak membuat tagihan: datanya sudah ada di Dapodik.
create or replace function public.formulir_impor_ruang() returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_npsn text := private.npsn_saya(); n integer;
begin
  if not private.formulir_akses('sarpras_ruang', null, true) then raise exception 'Anda tidak berhak mengisi data sarpras.'; end if;
  insert into public.fr_sarpras_ruang (npsn, nama_ruang, panjang, lebar, luas, diubah_oleh)
  select p.npsn, p.nama_prasarana, p.panjang, p.lebar, case when p.panjang is not null and p.lebar is not null then round(p.panjang * p.lebar, 2) end, auth.uid()
    from public.prasarana p
   where p.npsn = v_npsn and p.nama_prasarana is not null
     and not exists (select 1 from public.fr_sarpras_ruang r where r.npsn = p.npsn and lower(r.nama_ruang) = lower(p.nama_prasarana));
  get diagnostics n = row_count;
  return n;
end $$;

do $do$
declare f text;
begin
  foreach f in array array[
    'public.formulir_katalog()', 'public.formulir_daftar(text,uuid)', 'public.formulir_simpan(text,uuid,uuid,jsonb)',
    'public.formulir_hapus(text,uuid)', 'public.formulir_impor_ruang()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $do$;
