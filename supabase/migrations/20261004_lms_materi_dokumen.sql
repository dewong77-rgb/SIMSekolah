-- Materi dari dokumen Word: tampil di halaman siswa (format html) atau khusus guru (untuk guru).
-- Kolom: materi.untuk ('siswa' | 'guru'), materi.format ('teks' | 'html'). Batas isi html 300000 karakter.

-- 1. Fungsi yang sudah ada diubah lewat penggantian teks tetap, supaya hanya bagian terkait yang berubah.
do $$
declare
  r record;
  src text;
begin
  for r in
    select * from (values
      ('private.lms_kelas_ringkas(uuid)', $a$where t.kelas_ajar_id = k.id and t.status = 'terbit'),
      'materi_selesai'$a$, $b$where t.kelas_ajar_id = k.id and t.status = 'terbit' and m.untuk = 'siswa'),
      'materi_selesai'$b$),
      ('public.lms_materi_buka(uuid)', $a$'isi', m.isi, 'url', m.url,$a$, $b$'isi', m.isi, 'url', m.url, 'format', m.format, 'untuk', m.untuk,$b$),
      ('public.lms_materi_buka(uuid)', $a$from public.materi m where m.pertemuan_id = p_pertemuan)$a$, $b$from public.materi m where m.pertemuan_id = p_pertemuan and (v_kelola or m.untuk = 'siswa'))$b$),
      ('public.lms_tandai_selesai(uuid)', $a$where m.id = p_materi;$a$, $b$where m.id = p_materi and m.untuk = 'siswa';$b$),
      ('public.lms_pertemuan_daftar(uuid)', $a$'jumlah_materi', (select count(*) from public.materi m where m.pertemuan_id = t.id),$a$, $b$'jumlah_materi', (select count(*) from public.materi m where m.pertemuan_id = t.id and m.untuk = 'siswa'),$b$),
      ('private.lms_kelengkapan(uuid)', $a$(select count(*) from public.materi m where m.pertemuan_id = p_pertemuan) materi,$a$, $b$(select count(*) from public.materi m where m.pertemuan_id = p_pertemuan and m.untuk = 'siswa') materi,$b$),
      ('public.lms_pertemuan_rekap_terpadu(uuid)', $a$mat as (select m.id from public.materi m where m.pertemuan_id = t.id)$a$, $b$mat as (select m.id from public.materi m where m.pertemuan_id = t.id and m.untuk = 'siswa')$b$),
      ('public.lms_salin_pertemuan(uuid,uuid[])', $a$insert into public.materi (pertemuan_id, urutan, jenis, judul, isi, url, berkas_id)$a$, $b$insert into public.materi (pertemuan_id, urutan, jenis, judul, isi, url, berkas_id, untuk, format)$b$),
      ('public.lms_salin_pertemuan(uuid,uuid[])', $a$select baru, m.urutan, m.jenis, m.judul, m.isi, m.url, m.berkas_id from$a$, $b$select baru, m.urutan, m.jenis, m.judul, m.isi, m.url, m.berkas_id, m.untuk, m.format from$b$)
    ) as x(fn, lama, baru)
  loop
    src := pg_get_functiondef(r.fn::regprocedure);
    if strpos(src, r.lama) = 0 then raise exception 'Bagian tidak ditemukan di %', r.fn; end if;
    execute replace(src, r.lama, r.baru);
  end loop;
end $$;

-- 2. Menulis materi, termasuk dokumen html dan tujuan (siswa atau khusus guru).
create or replace function public.lms_materi_tulis(
  p_pertemuan uuid, p_id uuid, p_jenis text, p_judul text, p_isi text, p_url text, p_format text, p_untuk text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; v_id uuid; v_format text := coalesce(p_format, 'teks'); v_untuk text := coalesce(p_untuk, 'siswa');
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if p_jenis not in ('teks','video','tautan','berkas') then raise exception 'Jenis materi tidak valid.' using errcode = '22023'; end if;
  if v_format not in ('teks','html') or (v_format = 'html' and p_jenis <> 'teks') then raise exception 'Format materi tidak valid.' using errcode = '22023'; end if;
  if v_untuk not in ('siswa','guru') then raise exception 'Tujuan materi tidak valid.' using errcode = '22023'; end if;
  if btrim(coalesce(p_judul, '')) = '' then raise exception 'Judul wajib diisi.' using errcode = '22023'; end if;
  if p_jenis = 'teks' and btrim(coalesce(p_isi, '')) = '' then raise exception 'Isi materi kosong.' using errcode = '22023'; end if;
  if p_jenis <> 'teks' and coalesce(p_url, '') !~* '^https://' then raise exception 'Tautan harus diawali https://.' using errcode = '22023'; end if;
  if v_format = 'html' then
    if length(p_isi) > 300000 then raise exception 'Dokumen terlalu besar.' using errcode = '22023'; end if;
    if p_isi ~* '<\s*(script|iframe|object|embed|form|style|link|meta|base)\y' or p_isi ~* 'javascript\s*:' or p_isi ~* '\son[a-z]+\s*=' then
      raise exception 'Dokumen memuat elemen yang tidak diizinkan.' using errcode = '22023';
    end if;
  elsif p_jenis = 'teks' and length(p_isi) > 20000 then
    raise exception 'Isi bacaan terlalu panjang.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.materi (pertemuan_id, urutan, jenis, judul, isi, url, format, untuk)
    values (p_pertemuan, (select coalesce(max(urutan), 0) + 1 from public.materi where pertemuan_id = p_pertemuan),
            p_jenis, btrim(p_judul), case when p_jenis = 'teks' then p_isi end,
            case when p_jenis <> 'teks' then btrim(p_url) end, v_format, v_untuk)
    returning id into v_id;
  else
    update public.materi set jenis = p_jenis, judul = btrim(p_judul),
      isi = case when p_jenis = 'teks' then p_isi end,
      url = case when p_jenis <> 'teks' then btrim(p_url) end,
      format = v_format, untuk = v_untuk
    where id = p_id and pertemuan_id = p_pertemuan
    returning id into v_id;
    if v_id is null then raise exception 'Materi tidak ditemukan.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

do $$
declare f text;
begin
  for f in select unnest(array['public.lms_materi_tulis(uuid,uuid,text,text,text,text,text,text)',
    'public.lms_materi_buka(uuid)', 'public.lms_tandai_selesai(uuid)', 'public.lms_pertemuan_daftar(uuid)',
    'public.lms_pertemuan_rekap_terpadu(uuid)', 'public.lms_salin_pertemuan(uuid,uuid[])']) loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  revoke all on function private.lms_kelas_ringkas(uuid) from public, anon, authenticated;
  revoke all on function private.lms_kelengkapan(uuid) from public, anon, authenticated;
end $$;
