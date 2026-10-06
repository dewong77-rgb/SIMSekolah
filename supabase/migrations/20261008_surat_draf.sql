-- Draf surat dan SK dari bidang (mulai dari Kurikulum): disusun dari data sistem, diajukan ke Kepala Sekolah, lalu didaftarkan Tata Usaha ke register Persuratan.
-- Tabel tanpa policy; semua akses lewat fungsi. Tidak ada penghapusan: draf dibatalkan lewat status.
-- Alur: draf -> diajukan -> (dikembalikan | disetujui) -> terdaftar. Lampiran adalah salinan data saat draf dibuat atau disegarkan.

insert into public.izin (kode, nama, bidang) values
  ('surat.draf', 'Menyusun draf surat dan SK dari bidang', 'Persuratan'),
  ('surat.setujui_draf', 'Menyetujui draf surat dan SK', 'Persuratan')
on conflict (kode) do nothing;
insert into public.jabatan_izin (jabatan_kode, izin_kode) values
  ('waka_kurikulum', 'surat.draf'), ('staf_kurikulum', 'surat.draf'), ('kepala_sekolah', 'surat.setujui_draf')
on conflict do nothing;

create table if not exists public.surat_draf (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah(npsn),
  jenis text not null check (jenis in ('sk_wali_kelas', 'sk_pembagian_tugas')),
  judul text not null check (char_length(btrim(judul)) between 3 and 300),
  tahun_ajaran text not null check (tahun_ajaran ~ '^\d{4}/\d{4}$'),
  nomor_surat text check (char_length(nomor_surat) <= 120),
  tanggal_surat date,
  isi jsonb not null default '{}'::jsonb,
  status text not null default 'draf' check (status in ('draf', 'diajukan', 'dikembalikan', 'disetujui', 'terdaftar', 'dibatalkan')),
  catatan text check (char_length(catatan) <= 1000),
  dibuat_oleh uuid not null default auth.uid(),
  dibuat_nama text,
  dibuat_pada timestamptz not null default now(),
  diubah_pada timestamptz not null default now(),
  diputuskan_oleh uuid,
  diputuskan_pada timestamptz,
  surat_id uuid references public.surat(id)
);
create index if not exists surat_draf_npsn_idx on public.surat_draf (npsn, diubah_pada desc);
alter table public.surat_draf enable row level security;

-- Nama dengan gelar belakang tanpa pengulangan dan tanpa tanda "-". Nama huruf kapital semua dijadikan huruf awal besar.
create or replace function private.nama_gelar(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when k.nama = upper(k.nama) then initcap(k.nama) else k.nama end
         || coalesce(', ' || nullif((select string_agg(q.g, ', ' order by q.o)
                                       from (select btrim(x) g, min(ord) o from unnest(string_to_array(coalesce(k.gelar_belakang, ''), ',')) with ordinality t(x, ord)
                                              group by btrim(x)) q where q.g not in ('', '-')), ''), '')
    from public.ptk k where k.id = p_id
$$;

create or replace function private.draf_lampiran(p_jenis text, p_ta text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_npsn text := private.npsn_saya(); v jsonb;
begin
  if p_jenis = 'sk_wali_kelas' then
    select coalesce(jsonb_agg(jsonb_build_object('kelas', r.nama, 'wali', private.nama_gelar(p.id), 'nip', p.nip) order by r.tingkat, r.nama), '[]'::jsonb) into v
      from public.kur_wali w
      join public.rombel r on r.id = w.rombel_id and r.npsn = v_npsn
      join public.semester s on s.semester_id = r.semester_id and s.tahun_ajaran = p_ta
      join public.ptk p on p.id = w.ptk_id
     where w.status = 'disetujui' and w.tahun_ajaran = p_ta;
    return jsonb_build_object('tipe', 'wali_kelas', 'baris', v);
  end if;
  with b as (
    select p.id pid, private.nama_gelar(p.id) nama, p.nip, r.tingkat, m.nama mapel, m.urutan,
           array_agg(substr(r.nama, length(split_part(r.nama, ' ', 1)) + 2) order by r.nama) kelas, count(*) n, sum(kb.jp)::int jm,
           (select count(*) from public.rombel r2 join public.semester s2 on s2.semester_id = r2.semester_id and s2.tahun_ajaran = p_ta
             where r2.tingkat = r.tingkat and r2.jenis_rombel = 'Kelas Utama' and r2.npsn = v_npsn) total
      from public.kur_beban kb
      join public.rombel r on r.id = kb.rombel_id and r.npsn = v_npsn
      join public.semester s on s.semester_id = r.semester_id and s.tahun_ajaran = p_ta
      join public.ptk p on p.id = kb.ptk_id
      join public.kur_mapel m on m.id = kb.mapel_id
     where kb.jp > 0
     group by p.id, p.nip, r.tingkat, m.id, m.nama, m.urutan
  )
  select coalesce(jsonb_agg(g.x order by g.nama), '[]'::jsonb) into v from (
    select b.nama, jsonb_build_object('nama', b.nama, 'nip', b.nip, 'jjm', sum(b.jm),
             'baris', jsonb_agg(jsonb_build_object('mapel', b.mapel, 'tingkat', case b.tingkat when 10 then 'X' when 11 then 'XI' else 'XII' end,
                        'kelas', case when b.n = b.total then 'Semua kelas' else '(' || array_to_string(b.kelas, ', ') || ')' end, 'jm', b.jm) order by b.tingkat, b.urutan, b.mapel)) x
      from b group by b.pid, b.nama, b.nip
  ) g;
  return jsonb_build_object('tipe', 'pembagian_tugas', 'guru', v, 'total_jam', (select coalesce(sum((e->>'jjm')::int), 0) from jsonb_array_elements(v) e));
end $$;
revoke execute on function private.draf_lampiran(text, text) from public, anon, authenticated;
revoke execute on function private.nama_gelar(uuid) from public, anon, authenticated;

create or replace function private.draf_ks() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('nama', private.nama_gelar(p.id), 'nip', p.nip)
    from public.penugasan x join public.ptk p on p.id = x.ptk_id
   where x.jabatan_kode = 'kepala_sekolah' and x.status = 'aktif' and x.tahun_ajaran = public.tahun_ajaran_sekarang() and p.npsn = private.npsn_saya()
   limit 1
$$;
revoke execute on function private.draf_ks() from public, anon, authenticated;

create or replace function private.draf_boleh_lihat(d public.surat_draf) returns boolean
language sql stable security definer set search_path = '' as $$
  select d.npsn = private.npsn_saya() and (
    private.adalah_super() or d.dibuat_oleh = (select auth.uid()) or private.punya_izin('surat.draf')
    or (private.punya_izin('surat.setujui_draf') and d.status <> 'draf')
    or (private.punya_izin('surat.catat') and d.status in ('disetujui', 'terdaftar')))
$$;
revoke execute on function private.draf_boleh_lihat(public.surat_draf) from public, anon, authenticated;

create or replace function public.surat_draf_izin() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when (select auth.uid()) is null then null else jsonb_build_object(
    'buat', private.punya_izin('surat.draf'), 'setujui', private.punya_izin('surat.setujui_draf'), 'daftarkan', private.punya_izin('surat.catat')) end
$$;

create or replace function public.surat_draf_daftar() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'jenis', d.jenis, 'judul', d.judul, 'tahun_ajaran', d.tahun_ajaran, 'status', d.status,
           'nomor_surat', d.nomor_surat, 'dibuat_nama', d.dibuat_nama, 'diubah_pada', d.diubah_pada) order by d.diubah_pada desc), '[]'::jsonb)
    from public.surat_draf d where private.draf_boleh_lihat(d)
$$;

create or replace function public.surat_draf_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d public.surat_draf; v_ubah boolean;
begin
  select * into d from public.surat_draf where id = p_id;
  if d.id is null or not private.draf_boleh_lihat(d) then return null; end if;
  v_ubah := d.status in ('draf', 'dikembalikan') and (d.dibuat_oleh = (select auth.uid()) or private.punya_izin('surat.draf'));
  return jsonb_build_object('draf', to_jsonb(d) - 'npsn', 'ks', private.draf_ks(),
    'boleh_ubah', v_ubah, 'boleh_ajukan', v_ubah,
    'boleh_putuskan', d.status = 'diajukan' and private.punya_izin('surat.setujui_draf'),
    'boleh_daftarkan', d.status = 'disetujui' and private.punya_izin('surat.catat'),
    'boleh_batal', d.status in ('draf', 'dikembalikan', 'diajukan') and (d.dibuat_oleh = (select auth.uid()) or private.punya_izin('surat.draf')));
end $$;

create or replace function public.surat_draf_buat(p_jenis text, p_ta text, p_judul text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_nama text; v_judul text;
begin
  if not private.punya_izin('surat.draf') then raise exception 'Anda tidak berwenang menyusun draf surat.'; end if;
  if p_jenis not in ('sk_wali_kelas', 'sk_pembagian_tugas') then raise exception 'Jenis draf tidak dikenal.'; end if;
  if p_ta !~ '^\d{4}/\d{4}$' then raise exception 'Tahun ajaran tidak valid.'; end if;
  v_judul := coalesce(nullif(btrim(p_judul), ''), case p_jenis when 'sk_wali_kelas' then 'SK Penetapan Wali Kelas Tahun Ajaran ' else 'SK Pembagian Tugas Guru dalam Pembelajaran Tahun Ajaran ' end || p_ta);
  select coalesce(k.nama, 'Pengguna') into v_nama from public.ptk k where k.id = private.ptk_id_saya();
  insert into public.surat_draf (npsn, jenis, judul, tahun_ajaran, isi, dibuat_nama)
  values (private.npsn_saya(), p_jenis, v_judul, p_ta, jsonb_build_object('lampiran', private.draf_lampiran(p_jenis, p_ta)), v_nama)
  returning id into v_id;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan) values ((select auth.uid()), 'surat_draf', 'BUAT', jsonb_build_object('draf', v_id, 'jenis', p_jenis));
  return v_id;
end $$;

create or replace function public.surat_draf_simpan(p_id uuid, p_judul text, p_nomor text, p_tanggal date, p_isi jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.surat_draf;
begin
  select * into d from public.surat_draf where id = p_id and npsn = private.npsn_saya();
  if d.id is null then raise exception 'Draf tidak ditemukan.'; end if;
  if d.status not in ('draf', 'dikembalikan') then raise exception 'Draf yang sudah diajukan tidak dapat diubah.'; end if;
  if not (d.dibuat_oleh = (select auth.uid()) or private.punya_izin('surat.draf')) then raise exception 'Anda tidak berwenang mengubah draf ini.'; end if;
  if char_length(btrim(coalesce(p_judul, ''))) < 3 then raise exception 'Judul draf wajib diisi.'; end if;
  if jsonb_typeof(p_isi) <> 'object' or length(p_isi::text) > 400000 then raise exception 'Isi draf tidak valid atau terlalu besar.'; end if;
  update public.surat_draf set judul = btrim(p_judul), nomor_surat = nullif(btrim(coalesce(p_nomor, '')), ''), tanggal_surat = p_tanggal,
         isi = p_isi || jsonb_build_object('lampiran', d.isi->'lampiran'), diubah_pada = now()
   where id = p_id;
end $$;

create or replace function public.surat_draf_segarkan(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.surat_draf;
begin
  select * into d from public.surat_draf where id = p_id and npsn = private.npsn_saya();
  if d.id is null then raise exception 'Draf tidak ditemukan.'; end if;
  if d.status not in ('draf', 'dikembalikan') then raise exception 'Draf yang sudah diajukan tidak dapat disegarkan.'; end if;
  if not (d.dibuat_oleh = (select auth.uid()) or private.punya_izin('surat.draf')) then raise exception 'Anda tidak berwenang mengubah draf ini.'; end if;
  update public.surat_draf set isi = d.isi || jsonb_build_object('lampiran', private.draf_lampiran(d.jenis, d.tahun_ajaran)), diubah_pada = now() where id = p_id;
end $$;

create or replace function public.surat_draf_ajukan(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.surat_draf;
begin
  select * into d from public.surat_draf where id = p_id and npsn = private.npsn_saya();
  if d.id is null then raise exception 'Draf tidak ditemukan.'; end if;
  if d.status not in ('draf', 'dikembalikan') then raise exception 'Draf ini sudah diajukan.'; end if;
  if not (d.dibuat_oleh = (select auth.uid()) or private.punya_izin('surat.draf')) then raise exception 'Anda tidak berwenang mengajukan draf ini.'; end if;
  update public.surat_draf set status = 'diajukan', catatan = null, diubah_pada = now() where id = p_id;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan) values ((select auth.uid()), 'surat_draf', 'AJUKAN', jsonb_build_object('draf', p_id));
end $$;

create or replace function public.surat_draf_putuskan(p_id uuid, p_setuju boolean, p_catatan text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.surat_draf;
begin
  if not private.punya_izin('surat.setujui_draf') then raise exception 'Hanya Kepala Sekolah yang dapat memutuskan draf.'; end if;
  select * into d from public.surat_draf where id = p_id and npsn = private.npsn_saya();
  if d.id is null then raise exception 'Draf tidak ditemukan.'; end if;
  if d.status <> 'diajukan' then raise exception 'Draf ini tidak sedang menunggu keputusan.'; end if;
  if not p_setuju and nullif(btrim(coalesce(p_catatan, '')), '') is null then raise exception 'Catatan pengembalian wajib diisi.'; end if;
  update public.surat_draf set status = case when p_setuju then 'disetujui' else 'dikembalikan' end, catatan = nullif(left(btrim(coalesce(p_catatan, '')), 1000), ''),
         diputuskan_oleh = (select auth.uid()), diputuskan_pada = now(), diubah_pada = now() where id = p_id;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan) values ((select auth.uid()), 'surat_draf', case when p_setuju then 'SETUJUI' else 'KEMBALIKAN' end, jsonb_build_object('draf', p_id));
end $$;

create or replace function public.surat_draf_batal(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.surat_draf;
begin
  select * into d from public.surat_draf where id = p_id and npsn = private.npsn_saya();
  if d.id is null then raise exception 'Draf tidak ditemukan.'; end if;
  if d.status not in ('draf', 'dikembalikan', 'diajukan') then raise exception 'Draf ini tidak dapat dibatalkan.'; end if;
  if not (d.dibuat_oleh = (select auth.uid()) or private.punya_izin('surat.draf')) then raise exception 'Anda tidak berwenang membatalkan draf ini.'; end if;
  update public.surat_draf set status = 'dibatalkan', diubah_pada = now() where id = p_id;
end $$;

-- Tata Usaha mendaftarkan draf yang disetujui ke register surat keluar: nomor agenda otomatis, nomor surat diisi di sini.
create or replace function public.surat_draf_daftarkan(p_id uuid, p_nomor text, p_tanggal date, p_tautan text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare d public.surat_draf; v_surat uuid;
begin
  if not private.punya_izin('surat.catat') then raise exception 'Anda tidak berwenang mencatat surat.'; end if;
  select * into d from public.surat_draf where id = p_id and npsn = private.npsn_saya();
  if d.id is null then raise exception 'Draf tidak ditemukan.'; end if;
  if d.status <> 'disetujui' then raise exception 'Hanya draf yang sudah disetujui Kepala Sekolah yang dapat didaftarkan.'; end if;
  if nullif(btrim(coalesce(p_nomor, '')), '') is null then raise exception 'Nomor surat wajib diisi.'; end if;
  v_surat := public.surat_catat('keluar', 'pemberitahuan', 'biasa', btrim(p_nomor), coalesce(p_tanggal, d.tanggal_surat),
                                'Seluruh guru dan tenaga kependidikan', d.judul, 'Dibuat dari draf SIMS (' || d.jenis || ', ' || d.tahun_ajaran || ').', p_tautan);
  update public.surat_draf set status = 'terdaftar', surat_id = v_surat, nomor_surat = btrim(p_nomor), tanggal_surat = coalesce(p_tanggal, tanggal_surat), diubah_pada = now() where id = p_id;
  return v_surat;
end $$;

do $$
declare f text;
begin
  foreach f in array array['surat_draf_izin()', 'surat_draf_daftar()', 'surat_draf_detail(uuid)', 'surat_draf_buat(text,text,text)',
    'surat_draf_simpan(uuid,text,text,date,jsonb)', 'surat_draf_segarkan(uuid)', 'surat_draf_ajukan(uuid)', 'surat_draf_putuskan(uuid,boolean,text)',
    'surat_draf_batal(uuid)', 'surat_draf_daftarkan(uuid,text,date,text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
