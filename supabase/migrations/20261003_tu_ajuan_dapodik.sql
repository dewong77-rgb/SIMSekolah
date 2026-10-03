-- Peran staf, jabatan TU per bagian, dan alur ajuan perbaikan data berbasis Dapodik.
-- Prinsip: Dapodik sumber kebenaran. SIMS tidak mengubah data saat ajuan disetujui.
-- Alur: menunggu -> diteruskan (disetujui bagian TU) -> dikerjakan (operator) -> selesai (otomatis saat unggahan cocok).

-- ------------------------------------------------------------ peran staf (tendik)
alter table public.profil_pengguna drop constraint profil_pengguna_peran_check;
alter table public.profil_pengguna add constraint profil_pengguna_peran_check
  check (peran in ('admin_tu','guru','staf','siswa','orang_tua'));

-- ------------------------------------------------------------ jabatan dan izin TU
insert into public.jabatan (kode, nama, kelompok, lingkup, induk_kode, urutan, tampil_publik, satu_pemegang, bagan) values
 ('tu_kepegawaian', 'Tata Usaha Bagian Kepegawaian', 'Tata usaha', 'sekolah', 'kepala_tu', 54, true,  false, true),
 ('tu_kesiswaan',   'Tata Usaha Bagian Kesiswaan',   'Tata usaha', 'sekolah', 'kepala_tu', 55, true,  false, true),
 ('tu_persuratan',  'Tata Usaha Bagian Persuratan',  'Tata usaha', 'sekolah', 'kepala_tu', 56, true,  false, true),
 ('tu_perpustakaan','Tata Usaha Bagian Perpustakaan','Tata usaha', 'sekolah', 'kepala_tu', 57, true,  false, true),
 ('caraka',         'Caraka',                        'Tata usaha', 'sekolah', 'kepala_tu', 58, false, false, true),
 ('satpam',         'Satpam',                        'Tata usaha', 'sekolah', 'kepala_tu', 59, false, false, true)
on conflict (kode) do nothing;

insert into public.izin (kode, nama, bidang) values
 ('profil.setujui_guru',  'Memutuskan ajuan perbaikan data guru dan tendik', 'Tata usaha'),
 ('profil.setujui_siswa', 'Memutuskan ajuan perbaikan data siswa', 'Tata usaha'),
 ('dapodik.kerjakan_ajuan','Mengerjakan antrean perbaikan data di Dapodik', 'Tata usaha'),
 ('dapodik.unggah',       'Mengunggah berkas Dapodik', 'Tata usaha'),
 ('surat.catat',          'Mencatat surat masuk dan keluar', 'Persuratan'),
 ('surat.baca_semua',     'Membaca register surat (kecuali rahasia)', 'Persuratan'),
 ('surat.disposisi',      'Membuat disposisi dan membaca semua surat', 'Persuratan'),
 ('surat.teruskan',       'Meneruskan disposisi yang diterima', 'Persuratan'),
 ('keuangan.kelola',      'Mengelola keuangan sekolah', 'Tata usaha')
on conflict (kode) do nothing;

insert into public.jabatan_izin (jabatan_kode, izin_kode) values
 ('tu_kepegawaian','profil.setujui_guru'),
 ('tu_kesiswaan','profil.setujui_siswa'), ('tu_kesiswaan','siswa.lihat_pribadi'),
 ('tu_persuratan','surat.catat'), ('tu_persuratan','surat.baca_semua'),
 ('tu_perpustakaan','perpus.kelola'),
 ('bendahara','keuangan.kelola'),
 ('operator_dapodik','dapodik.kerjakan_ajuan'), ('operator_dapodik','dapodik.unggah'),
 ('kepala_tu','profil.setujui_guru'), ('kepala_tu','profil.setujui_siswa'), ('kepala_tu','surat.baca_semua'), ('kepala_tu','surat.teruskan'),
 ('kepala_sekolah','surat.disposisi'), ('kepala_sekolah','surat.baca_semua'),
 ('waka_kurikulum','surat.disposisi'), ('waka_kesiswaan','surat.disposisi'), ('waka_sarpras','surat.disposisi'), ('waka_hubin','surat.disposisi'),
 ('kaprog','surat.teruskan'), ('kepala_bengkel','surat.teruskan'), ('kepala_perpustakaan','surat.teruskan')
on conflict do nothing;

-- Usulan awal dari data Dapodik untuk tendik yang jabatannya jelas. Super admin tinggal menyetujui.
insert into public.penugasan (npsn, ptk_id, jabatan_kode, tahun_ajaran, sumber, status)
select npsn, id, 'satpam', public.tahun_ajaran_sekarang(), 'dapodik', 'usulan' from public.ptk where jabatan_ptk ilike '%keamanan%'
on conflict do nothing;
insert into public.penugasan (npsn, ptk_id, jabatan_kode, tahun_ajaran, sumber, status)
select npsn, id, 'caraka', public.tahun_ajaran_sekarang(), 'dapodik', 'usulan' from public.ptk where jabatan_ptk ilike 'pesuruh%'
on conflict do nothing;

-- ------------------------------------------------------------ ajuan: kolom dan status baru
alter table public.ajuan_perubahan drop constraint ajuan_perubahan_status_check;
update public.ajuan_perubahan set status = 'diteruskan' where status = 'disetujui';
alter table public.ajuan_perubahan add constraint ajuan_perubahan_status_check
  check (status in ('menunggu','diteruskan','dikerjakan','selesai','ditolak','dibatalkan'));
alter table public.ajuan_perubahan
  add column if not exists bagian text,
  add column if not exists diteruskan_pada timestamptz,
  add column if not exists operator_id uuid,
  add column if not exists dikerjakan_pada timestamptz,
  add column if not exists selesai_pada timestamptz,
  add column if not exists belum_terbukti boolean not null default false,
  add column if not exists catatan_operator text;

create or replace function private.set_bagian_ajuan() returns trigger
language plpgsql set search_path = '' as $$
begin new.bagian := case when new.jenis = 'ptk' then 'kepegawaian' else 'kesiswaan' end; return new; end $$;
drop trigger if exists ajuan_bagian on public.ajuan_perubahan;
create trigger ajuan_bagian before insert on public.ajuan_perubahan for each row execute function private.set_bagian_ajuan();

-- tendik (peran staf) boleh mengajukan perbaikan data dirinya
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.ajukan_perubahan(text,uuid,jsonb,text)'::regprocedure);
  d := replace(d, 'v_peran = ''guru''', 'v_peran in (''guru'',''staf'')');
  execute d;
end $do$;

create or replace function private.boleh_putuskan(p_jenis text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.adalah_super() or private.peran_saya() = 'admin_tu'
    or private.punya_izin(case when p_jenis = 'ptk' then 'profil.setujui_guru' else 'profil.setujui_siswa' end), false)
$$;
create or replace function private.boleh_kerjakan() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.adalah_super() or private.peran_saya() = 'admin_tu' or private.punya_izin('dapodik.kerjakan_ajuan'), false)
$$;

-- Persetujuan hanya meneruskan ke operator Dapodik. Data SIMS tidak diubah.
create or replace function public.putuskan_ajuan(p_id uuid, p_setuju boolean, p_catatan text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.ajuan_perubahan;
  v_catatan text := nullif(btrim(coalesce(p_catatan, '')), '');
begin
  select * into a from public.ajuan_perubahan where id = p_id and npsn = private.npsn_saya() for update;
  if not found then raise exception 'Ajuan tidak ditemukan.'; end if;
  if not private.boleh_putuskan(a.jenis) then raise exception 'Anda tidak berwenang memutuskan ajuan ini (bagian %).', a.bagian; end if;
  if a.status <> 'menunggu' then raise exception 'Ajuan ini sudah diputuskan.'; end if;

  if not p_setuju then
    if v_catatan is null then raise exception 'Tulis alasan penolakan agar pengaju tahu apa yang perlu dilengkapi.'; end if;
    update public.ajuan_perubahan set status = 'ditolak', catatan_admin = v_catatan, diputuskan_oleh = (select auth.uid()), diputuskan_pada = now() where id = p_id;
    insert into public.audit_log (user_id, tabel, aksi, ringkasan) values ((select auth.uid()), 'ajuan_perubahan', 'TOLAK', jsonb_build_object('ajuan', p_id));
    return jsonb_build_object('status', 'ditolak');
  end if;

  update public.ajuan_perubahan
     set status = 'diteruskan', catatan_admin = v_catatan, diputuskan_oleh = (select auth.uid()),
         diputuskan_pada = now(), diteruskan_pada = now()
   where id = p_id;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan) values ((select auth.uid()), 'ajuan_perubahan', 'TERUSKAN', jsonb_build_object('ajuan', p_id, 'bagian', a.bagian));
  return jsonb_build_object('status', 'diteruskan');
end $$;

-- Operator Dapodik: mulai mengerjakan, atau mengembalikan dengan alasan (data sudah benar di Dapodik, dokumen kurang, dll).
create or replace function public.kerjakan_ajuan(p_id uuid, p_aksi text, p_catatan text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.ajuan_perubahan; v_catatan text := nullif(btrim(coalesce(p_catatan, '')), '');
begin
  if not private.boleh_kerjakan() then raise exception 'Hanya operator Dapodik yang dapat mengerjakan antrean ini.'; end if;
  select * into a from public.ajuan_perubahan where id = p_id and npsn = private.npsn_saya() for update;
  if not found then raise exception 'Ajuan tidak ditemukan.'; end if;
  if p_aksi = 'mulai' then
    if a.status <> 'diteruskan' then raise exception 'Ajuan ini tidak berada di antrean operator.'; end if;
    update public.ajuan_perubahan set status = 'dikerjakan', operator_id = (select auth.uid()), dikerjakan_pada = now(), catatan_operator = v_catatan where id = p_id;
  elsif p_aksi = 'kembalikan' then
    if a.status not in ('diteruskan','dikerjakan') then raise exception 'Ajuan ini tidak berada di antrean operator.'; end if;
    if v_catatan is null then raise exception 'Tulis alasan pengembalian.'; end if;
    update public.ajuan_perubahan set status = 'ditolak', operator_id = (select auth.uid()), catatan_operator = v_catatan, selesai_pada = now() where id = p_id;
  else
    raise exception 'Aksi tidak dikenal.';
  end if;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan) values ((select auth.uid()), 'ajuan_perubahan', upper(p_aksi), jsonb_build_object('ajuan', p_id));
end $$;

-- Dipanggil setelah unggahan Dapodik. Ajuan selesai bila semua nilai usulan sudah ada di data.
create or replace function public.cocokkan_ajuan() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.ajuan_perubahan; it jsonb; ok boolean; n_ok int := 0; n_bt int := 0;
begin
  if not private.boleh_kerjakan() then raise exception 'Tidak berwenang.'; end if;
  for a in select * from public.ajuan_perubahan where npsn = private.npsn_saya() and status in ('diteruskan','dikerjakan') loop
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

-- Penanda lama diganti alur operator.
create or replace function public.tandai_dapodik(p_id uuid, p_nilai boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin raise exception 'Diganti: gunakan kerjakan_ajuan dan unggahan Dapodik.'; end $$;

create or replace function public.ajuan_daftar(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_ker boolean := private.boleh_kerjakan(); v_ptk boolean := private.boleh_putuskan('ptk'); v_pd boolean := private.boleh_putuskan('siswa');
begin
  if not (v_ker or v_ptk or v_pd) then return null; end if;
  return (select coalesce(jsonb_agg(
      (to_jsonb(a) - 'npsn' - 'pengaju_user_id' - 'diputuskan_oleh' - 'operator_id')
      || jsonb_build_object('aksi', to_jsonb(array_remove(array[
           case when a.status = 'menunggu' and ((a.jenis = 'ptk' and v_ptk) or (a.jenis = 'siswa' and v_pd)) then 'putuskan' end,
           case when a.status in ('diteruskan','dikerjakan') and v_ker then 'kerjakan' end], null)))
      order by a.dibuat_pada desc), '[]'::jsonb)
    from (select * from public.ajuan_perubahan x
           where x.npsn = private.npsn_saya()
             and (p_status is null or x.status = p_status)
             and (((x.jenis = 'ptk' and v_ptk) or (x.jenis = 'siswa' and v_pd))
                  or (v_ker and x.status in ('diteruskan','dikerjakan','selesai')))
           order by x.dibuat_pada desc limit 500) a);
end $$;

create or replace function public.ajuan_ringkasan() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'boleh_putuskan', private.boleh_putuskan('ptk') or private.boleh_putuskan('siswa'),
    'boleh_kerjakan', private.boleh_kerjakan(),
    'menunggu', (select count(*) from public.ajuan_perubahan x where x.npsn = private.npsn_saya() and x.status = 'menunggu'
                  and ((x.jenis = 'ptk' and private.boleh_putuskan('ptk')) or (x.jenis = 'siswa' and private.boleh_putuskan('siswa')))),
    'antrean', case when private.boleh_kerjakan() then (select count(*) from public.ajuan_perubahan x where x.npsn = private.npsn_saya() and x.status in ('diteruskan','dikerjakan')) else 0 end,
    'saya', (select count(*) from public.ajuan_perubahan x where x.pengaju_user_id = (select auth.uid()) and x.status in ('menunggu','diteruskan','dikerjakan')))
$$;

create or replace function public.ajuan_subjek_saya() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_peran text := private.peran_saya();
begin
  if v_peran in ('guru','staf') then
    return (select coalesce(jsonb_agg(jsonb_build_object('jenis','ptk','id',p.id,'nama',p.nama)), '[]'::jsonb) from public.ptk p where p.id = private.ptk_id_saya());
  elsif v_peran = 'siswa' then
    return (select coalesce(jsonb_agg(jsonb_build_object('jenis','siswa','id',p.id,'nama',p.nama)), '[]'::jsonb) from public.peserta_didik p where p.id = private.pd_id_saya());
  elsif v_peran = 'orang_tua' then
    return (select coalesce(jsonb_agg(jsonb_build_object('jenis','siswa','id',p.id,'nama',p.nama)), '[]'::jsonb) from public.peserta_didik p where p.id in (select private.anak_saya()));
  end if;
  return '[]'::jsonb;
end $$;

-- Data yang ditampilkan untuk dicek mandiri, beserta definisi kolom yang boleh diajukan.
create or replace function public.ajuan_data_saya(p_jenis text, p_subjek uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_peran text := private.peran_saya();
begin
  if not exists (select 1 from jsonb_array_elements(public.ajuan_subjek_saya()) e where e->>'id' = p_subjek::text and e->>'jenis' = p_jenis) then
    raise exception 'Anda tidak berhak melihat data ini.';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'kunci', k.kunci, 'label', k.label, 'kelompok', k.kelompok, 'tipe', k.tipe, 'pilihan', k.pilihan, 'pola', k.pola,
      'wajib', k.wajib, 'butuh_dokumen', k.butuh_dokumen, 'terapkan', k.terapkan,
      'nilai', case when v_peran = 'orang_tua' and k.tabel like '%\_sensitif'
                    then private.samar(private.nilai_sekarang(p_jenis, k.kunci, p_subjek))
                    else private.nilai_sekarang(p_jenis, k.kunci, p_subjek) end) order by k.urutan), '[]'::jsonb)
    from public.kolom_ajuan k where k.jenis = p_jenis);
end $$;

do $do$
declare f text;
begin
  foreach f in array array[
    'public.putuskan_ajuan(uuid,boolean,text)','public.kerjakan_ajuan(uuid,text,text)','public.cocokkan_ajuan()',
    'public.tandai_dapodik(uuid,boolean)','public.ajuan_daftar(text)','public.ajuan_ringkasan()',
    'public.ajuan_subjek_saya()','public.ajuan_data_saya(text,uuid)','public.ajukan_perubahan(text,uuid,jsonb,text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $do$;
