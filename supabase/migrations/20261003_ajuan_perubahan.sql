-- Ajuan perubahan profil: guru, tendik, siswa, dan orang tua mengajukan, admin TU menyetujui atau menolak.
--
-- Prinsip:
--  * Semua lewat fungsi (security definer). Tabel ajuan tidak punya policy, jadi tidak bisa disentuh langsung.
--  * Daftar kolom yang boleh diajukan ada di tabel kolom_ajuan, satu sumber untuk formulir dan validasi.
--  * Nilai lama diambil server saat pengajuan, bukan dari kiriman pengguna.
--  * Kolom yang membentuk kunci identitas unggahan Dapodik (nama, tanggal lahir, NIK guru) TIDAK diterapkan
--    langsung ke SIMS saat disetujui. Mengubahnya di sini membuat unggahan Dapodik berikutnya
--    menghasilkan baris ganda. Ajuan itu hanya diteruskan ke operator Dapodik dan nilainya masuk lewat unggahan.
--  * Kolom lain diterapkan saat disetujui, lalu ditandai "belum di Dapodik" sampai admin menandainya selesai,
--    karena unggahan Dapodik berikutnya menimpa nilai SIMS dengan nilai Dapodik.

create table if not exists public.kolom_ajuan (
  jenis text not null check (jenis in ('ptk', 'siswa')),
  kunci text not null,
  tabel text not null check (tabel in ('ptk', 'ptk_sensitif', 'peserta_didik', 'peserta_didik_sensitif', 'orang_tua_wali')),
  kolom text not null,
  hubungan text,
  label text not null,
  kelompok text not null,
  tipe text not null check (tipe in ('teks', 'angka', 'tanggal', 'pilihan')),
  tipe_sql text not null check (tipe_sql in ('text', 'date', 'integer', 'numeric')),
  pilihan jsonb,
  pola text,
  wajib boolean not null default false,
  butuh_dokumen boolean not null default false,
  terapkan boolean not null default true,
  urutan integer not null,
  primary key (jenis, kunci)
);
alter table public.kolom_ajuan enable row level security;
drop policy if exists kolom_ajuan_baca on public.kolom_ajuan;
create policy kolom_ajuan_baca on public.kolom_ajuan for select to authenticated using (true);

truncate public.kolom_ajuan;
insert into public.kolom_ajuan (jenis, kunci, tabel, kolom, hubungan, label, kelompok, tipe, tipe_sql, pilihan, pola, wajib, butuh_dokumen, terapkan, urutan) values
-- Guru dan tendik: identitas
('ptk','nama','ptk','nama',null,'Nama lengkap','Identitas','teks','text',null,null,true,true,false,10),
('ptk','nik','ptk_sensitif','nik',null,'NIK','Identitas','teks','text',null,'^[0-9]{16}$',false,true,false,11),
('ptk','jk','ptk','jk',null,'Jenis kelamin','Identitas','pilihan','text','["L","P"]',null,true,true,true,12),
('ptk','tempat_lahir','ptk','tempat_lahir',null,'Tempat lahir','Identitas','teks','text',null,null,true,true,true,13),
('ptk','tanggal_lahir','ptk','tanggal_lahir',null,'Tanggal lahir','Identitas','tanggal','date',null,null,true,true,false,14),
('ptk','nama_ibu_kandung','ptk_sensitif','nama_ibu_kandung',null,'Nama ibu kandung','Identitas','teks','text',null,null,false,true,true,15),
('ptk','agama','ptk','agama',null,'Agama','Identitas','pilihan','text','["Islam","Kristen","Katholik","Hindu","Budha","Khonghucu"]',null,false,false,true,16),
('ptk','gelar_depan','ptk','gelar_depan',null,'Gelar depan','Pendidikan','teks','text',null,null,false,true,true,20),
('ptk','gelar_belakang','ptk','gelar_belakang',null,'Gelar belakang','Pendidikan','teks','text',null,null,false,true,true,21),
('ptk','jenjang_pendidikan','ptk','jenjang_pendidikan',null,'Jenjang pendidikan terakhir','Pendidikan','pilihan','text','["SMA / sederajat","D3","D4","S1","S2","S3"]',null,false,true,true,22),
('ptk','jurusan_prodi','ptk','jurusan_prodi',null,'Program studi','Pendidikan','teks','text',null,null,false,true,true,23),
('ptk','status_perkawinan','ptk_sensitif','status_perkawinan',null,'Status kawin','Data pribadi','pilihan','text','["Belum Kawin","Kawin","Janda/Duda"]',null,false,true,true,30),
('ptk','nama_pasangan','ptk_sensitif','nama_pasangan',null,'Nama suami / istri','Data pribadi','teks','text',null,null,false,false,true,31),
('ptk','pekerjaan_pasangan','ptk_sensitif','pekerjaan_pasangan',null,'Pekerjaan suami / istri','Data pribadi','pilihan','text','["Karyawan Swasta","Lainnya","Nelayan","Pedagang Kecil","PNS/TNI/Polri","Tidak bekerja","Tidak dapat diterapkan","Wiraswasta"]',null,false,false,true,32),
('ptk','npwp','ptk_sensitif','npwp',null,'NPWP','Data pribadi','teks','text',null,'^[0-9.\-]{15,20}$',false,false,true,33),
('ptk','nama_wajib_pajak','ptk_sensitif','nama_wajib_pajak',null,'Nama wajib pajak','Data pribadi','teks','text',null,null,false,false,true,34),
('ptk','alamat_jalan','ptk','alamat_jalan',null,'Alamat','Alamat dan kontak','teks','text',null,null,false,false,true,40),
('ptk','rt','ptk','rt',null,'RT','Alamat dan kontak','teks','text',null,'^[0-9]{1,3}$',false,false,true,41),
('ptk','rw','ptk','rw',null,'RW','Alamat dan kontak','teks','text',null,'^[0-9]{1,3}$',false,false,true,42),
('ptk','dusun','ptk','dusun',null,'Dusun','Alamat dan kontak','teks','text',null,null,false,false,true,43),
('ptk','kelurahan','ptk','kelurahan',null,'Kelurahan / desa','Alamat dan kontak','teks','text',null,null,false,false,true,44),
('ptk','kecamatan','ptk','kecamatan',null,'Kecamatan','Alamat dan kontak','teks','text',null,null,false,false,true,45),
('ptk','kode_pos','ptk','kode_pos',null,'Kode pos','Alamat dan kontak','teks','text',null,'^[0-9]{5}$',false,false,true,46),
('ptk','hp','ptk','hp',null,'No. HP','Alamat dan kontak','teks','text',null,'^[0-9+ -]{8,16}$',false,false,true,47),
('ptk','telepon','ptk','telepon',null,'No. telepon','Alamat dan kontak','teks','text',null,'^[0-9+ -]{6,16}$',false,false,true,48),
('ptk','email','ptk','email',null,'Email','Alamat dan kontak','teks','text',null,'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$',false,false,true,49),
-- Siswa: identitas
('siswa','nama','peserta_didik','nama',null,'Nama lengkap','Identitas','teks','text',null,null,true,true,false,10),
('siswa','nik','peserta_didik_sensitif','nik',null,'NIK','Identitas','teks','text',null,'^[0-9]{16}$',false,true,true,11),
('siswa','no_kk','peserta_didik_sensitif','no_kk',null,'No. KK','Identitas','teks','text',null,'^[0-9]{16}$',false,true,true,12),
('siswa','jk','peserta_didik','jk',null,'Jenis kelamin','Identitas','pilihan','text','["L","P"]',null,true,true,true,13),
('siswa','tempat_lahir','peserta_didik','tempat_lahir',null,'Tempat lahir','Identitas','teks','text',null,null,true,true,true,14),
('siswa','tanggal_lahir','peserta_didik','tanggal_lahir',null,'Tanggal lahir','Identitas','tanggal','date',null,null,true,true,false,15),
('siswa','agama','peserta_didik','agama',null,'Agama','Identitas','pilihan','text','["Islam","Kristen","Katholik","Hindu","Budha","Khonghucu"]',null,false,false,true,16),
('siswa','no_registrasi_akta_lahir','peserta_didik_sensitif','no_registrasi_akta_lahir',null,'No. registrasi akta lahir','Identitas','teks','text',null,null,false,true,true,17),
('siswa','alamat','peserta_didik','alamat',null,'Alamat','Alamat dan kontak','teks','text',null,null,false,false,true,40),
('siswa','rt','peserta_didik','rt',null,'RT','Alamat dan kontak','teks','text',null,'^[0-9]{1,3}$',false,false,true,41),
('siswa','rw','peserta_didik','rw',null,'RW','Alamat dan kontak','teks','text',null,'^[0-9]{1,3}$',false,false,true,42),
('siswa','dusun','peserta_didik','dusun',null,'Dusun','Alamat dan kontak','teks','text',null,null,false,false,true,43),
('siswa','kelurahan','peserta_didik','kelurahan',null,'Kelurahan / desa','Alamat dan kontak','teks','text',null,null,false,false,true,44),
('siswa','kecamatan','peserta_didik','kecamatan',null,'Kecamatan','Alamat dan kontak','teks','text',null,null,false,false,true,45),
('siswa','kode_pos','peserta_didik','kode_pos',null,'Kode pos','Alamat dan kontak','teks','text',null,'^[0-9]{5}$',false,false,true,46),
('siswa','hp','peserta_didik','hp',null,'No. HP','Alamat dan kontak','teks','text',null,'^[0-9+ -]{8,16}$',false,false,true,47),
('siswa','telepon','peserta_didik','telepon',null,'No. telepon rumah','Alamat dan kontak','teks','text',null,'^[0-9+ -]{6,16}$',false,false,true,48),
('siswa','email','peserta_didik','email',null,'Email','Alamat dan kontak','teks','text',null,'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$',false,false,true,49),
('siswa','jenis_tinggal','peserta_didik','jenis_tinggal',null,'Jenis tinggal','Tempat tinggal','pilihan','text','["Bersama orang tua","Wali","Kost","Asrama","Panti asuhan","Pesantren","Lainnya"]',null,false,false,true,50),
('siswa','alat_transportasi','peserta_didik','alat_transportasi',null,'Alat transportasi','Tempat tinggal','pilihan','text','["Jalan kaki","Sepeda","Sepeda motor","Kendaraan pribadi","Mobil pribadi","Angkutan umum/bus/pete-pete","Mobil/bus antar jemput","Ojek","Kereta api","Perahu penyeberangan/rakit/getek","Lainnya"]',null,false,false,true,51),
('siswa','jarak_rumah_km','peserta_didik','jarak_rumah_km',null,'Jarak rumah ke sekolah (km)','Tempat tinggal','angka','numeric',null,null,false,false,true,52),
('siswa','tinggi_badan','peserta_didik','tinggi_badan',null,'Tinggi badan (cm)','Data periodik','angka','numeric',null,null,false,false,true,60),
('siswa','berat_badan','peserta_didik','berat_badan',null,'Berat badan (kg)','Data periodik','angka','numeric',null,null,false,false,true,61),
('siswa','jml_saudara_kandung','peserta_didik','jml_saudara_kandung',null,'Jumlah saudara kandung','Data periodik','angka','integer',null,null,false,false,true,62),
('siswa','anak_ke','peserta_didik','anak_ke',null,'Anak ke','Data periodik','angka','integer',null,null,false,false,true,63);

-- Ayah, ibu, wali. Penghasilan sengaja tidak masuk: skala lama dan baru Dapodik belum diseragamkan.
insert into public.kolom_ajuan (jenis, kunci, tabel, kolom, hubungan, label, kelompok, tipe, tipe_sql, pilihan, pola, wajib, butuh_dokumen, terapkan, urutan)
select 'siswa', h.hub || '.' || f.kolom, 'orang_tua_wali', f.kolom, h.hub, f.label, h.judul, f.tipe, f.tipe_sql, f.pilihan::jsonb, f.pola, false, false, true, h.urut + f.urut
from (values ('ayah','Data ayah kandung',70), ('ibu','Data ibu kandung',80), ('wali','Data wali',90)) as h(hub, judul, urut)
cross join (values
  ('nama','Nama','teks','text',null,null,1),
  ('tahun_lahir','Tahun lahir','angka','integer',null,'^(19|20)[0-9]{2}$',2),
  ('jenjang_pendidikan','Pendidikan','pilihan','text','["Tidak sekolah","Putus SD","SD / sederajat","SMP / sederajat","SMA / sederajat","Paket A","Paket B","Paket C","D1","D2","D3","D4","S1","S2","S3","Informal","Lainnya"]',null,3),
  ('pekerjaan','Pekerjaan','pilihan','text','["Tidak bekerja","Wiraswasta","Karyawan Swasta","Buruh","Petani","Peternak","Nelayan","Pedagang Kecil","Pedagang Besar","PNS/TNI/Polri","Pensiunan","Tenaga Kerja Indonesia","Sudah Meninggal","Lainnya"]',null,4)
) as f(kolom, label, tipe, tipe_sql, pilihan, pola, urut);

-- ---------------------------------------------------------------------------------------------

create table if not exists public.ajuan_perubahan (
  id uuid primary key default gen_random_uuid(),
  npsn text not null,
  jenis text not null check (jenis in ('ptk', 'siswa')),
  subjek_id uuid not null,
  subjek_nama text not null,
  pengaju_user_id uuid not null,
  pengaju_peran text not null,
  perubahan jsonb not null,
  alasan text not null,
  butuh_dokumen boolean not null default false,
  status text not null default 'menunggu' check (status in ('menunggu', 'disetujui', 'ditolak', 'dibatalkan')),
  catatan_admin text,
  diputuskan_oleh uuid,
  diputuskan_pada timestamptz,
  sudah_di_dapodik boolean not null default false,
  sudah_di_dapodik_pada timestamptz,
  dibuat_pada timestamptz not null default now()
);
alter table public.ajuan_perubahan enable row level security;  -- tanpa policy: hanya lewat fungsi
create index if not exists ajuan_npsn_status_idx on public.ajuan_perubahan (npsn, status, dibuat_pada desc);
create index if not exists ajuan_pengaju_idx on public.ajuan_perubahan (pengaju_user_id, dibuat_pada desc);
create index if not exists ajuan_subjek_idx on public.ajuan_perubahan (subjek_id);

-- ---------------------------------------------------------------------------------------------

create or replace function private.nilai_sekarang(p_jenis text, p_kunci text, p_subjek uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare k public.kolom_ajuan; v text;
begin
  select * into k from public.kolom_ajuan where jenis = p_jenis and kunci = p_kunci;
  if not found then return null; end if;
  if k.tabel = 'ptk' then
    execute format('select %I::text from public.ptk where id = $1', k.kolom) into v using p_subjek;
  elsif k.tabel = 'ptk_sensitif' then
    execute format('select %I::text from public.ptk_sensitif where ptk_id = $1', k.kolom) into v using p_subjek;
  elsif k.tabel = 'peserta_didik' then
    execute format('select %I::text from public.peserta_didik where id = $1', k.kolom) into v using p_subjek;
  elsif k.tabel = 'peserta_didik_sensitif' then
    execute format('select %I::text from public.peserta_didik_sensitif where peserta_didik_id = $1', k.kolom) into v using p_subjek;
  else
    execute format('select %I::text from public.orang_tua_wali where peserta_didik_id = $1 and hubungan = $2 limit 1', k.kolom) into v using p_subjek, k.hubungan;
  end if;
  return v;
end $$;

create or replace function public.ajukan_perubahan(p_jenis text, p_subjek uuid, p_perubahan jsonb, p_alasan text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_peran text := private.peran_saya();
  v_npsn text := private.npsn_saya();
  v_nama text;
  v_alasan text := btrim(coalesce(p_alasan, ''));
  v_item jsonb; k public.kolom_ajuan; v_baru text; v_lama text;
  v_hasil jsonb := '[]'::jsonb; v_dok boolean := false; v_id uuid;
begin
  if v_peran is null then raise exception 'Anda belum masuk.'; end if;

  if p_jenis = 'ptk' and v_peran = 'guru' and p_subjek = private.ptk_id_saya() then
    select nama into v_nama from public.ptk where id = p_subjek and npsn = v_npsn;
  elsif p_jenis = 'siswa' and (
          (v_peran = 'siswa' and p_subjek = private.pd_id_saya())
          or (v_peran = 'orang_tua' and p_subjek in (select private.anak_saya()))) then
    select nama into v_nama from public.peserta_didik where id = p_subjek and npsn = v_npsn;
  end if;
  if v_nama is null then raise exception 'Anda tidak berhak mengajukan perubahan untuk data ini.'; end if;

  if length(v_alasan) < 5 then raise exception 'Tulis alasan perubahan, minimal 5 karakter.'; end if;
  if length(v_alasan) > 500 then raise exception 'Alasan terlalu panjang (maksimal 500 karakter).'; end if;
  if jsonb_typeof(p_perubahan) <> 'array' or jsonb_array_length(p_perubahan) = 0 then raise exception 'Tidak ada perubahan yang diajukan.'; end if;
  if jsonb_array_length(p_perubahan) > 30 then raise exception 'Terlalu banyak kolom dalam satu ajuan.'; end if;
  if (select count(*) from public.ajuan_perubahan where pengaju_user_id = (select auth.uid()) and status = 'menunggu') >= 5 then
    raise exception 'Masih ada 5 ajuan yang menunggu keputusan. Tunggu atau batalkan salah satunya.';
  end if;

  for v_item in select * from jsonb_array_elements(p_perubahan) loop
    select * into k from public.kolom_ajuan where jenis = p_jenis and kunci = v_item->>'kunci';
    if not found then raise exception 'Kolom "%" tidak dapat diajukan.', coalesce(v_item->>'kunci', '?'); end if;
    if exists (select 1 from jsonb_array_elements(v_hasil) e where e->>'kunci' = k.kunci) then
      raise exception 'Kolom "%" muncul dua kali.', k.label;
    end if;
    v_baru := nullif(btrim(coalesce(v_item->>'baru', '')), '');
    if v_baru is not null and length(v_baru) > 200 then raise exception '"%" terlalu panjang.', k.label; end if;
    if v_baru is null and k.wajib then raise exception '"%" tidak boleh dikosongkan.', k.label; end if;
    if v_baru is not null then
      if k.tipe = 'pilihan' and not (k.pilihan ? v_baru) then raise exception 'Pilihan "%" tidak valid untuk %.', v_baru, k.label; end if;
      if k.pola is not null and v_baru !~ k.pola then raise exception 'Format "%" tidak sesuai.', k.label; end if;
      begin
        if k.tipe = 'tanggal' then
          if v_baru::date < date '1940-01-01' or v_baru::date > current_date then raise exception 'x'; end if;
        elsif k.tipe = 'angka' then
          if v_baru::numeric < 0 or v_baru::numeric > 100000 then raise exception 'x'; end if;
          if k.tipe_sql = 'integer' and v_baru::numeric <> trunc(v_baru::numeric) then raise exception 'x'; end if;
        end if;
      exception when others then
        raise exception 'Nilai "%" tidak valid untuk %.', v_baru, k.label;
      end;
    end if;
    v_lama := private.nilai_sekarang(p_jenis, k.kunci, p_subjek);
    if v_baru is not distinct from nullif(btrim(coalesce(v_lama, '')), '') then continue; end if;
    v_dok := v_dok or k.butuh_dokumen;
    v_hasil := v_hasil || jsonb_build_array(jsonb_build_object(
      'kunci', k.kunci, 'label', k.label, 'kelompok', k.kelompok, 'lama', v_lama, 'baru', v_baru,
      'butuh_dokumen', k.butuh_dokumen, 'terapkan', k.terapkan));
  end loop;

  if jsonb_array_length(v_hasil) = 0 then raise exception 'Tidak ada yang berbeda dari data saat ini.'; end if;

  insert into public.ajuan_perubahan (npsn, jenis, subjek_id, subjek_nama, pengaju_user_id, pengaju_peran, perubahan, alasan, butuh_dokumen)
  values (v_npsn, p_jenis, p_subjek, v_nama, (select auth.uid()), v_peran, v_hasil, v_alasan, v_dok)
  returning id into v_id;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan)
  values ((select auth.uid()), 'ajuan_perubahan', 'AJUKAN', jsonb_build_object('ajuan', v_id, 'jenis', p_jenis, 'jumlah_kolom', jsonb_array_length(v_hasil)));
  return v_id;
end $$;

create or replace function public.ajuan_saya() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(a) - 'npsn' - 'pengaju_user_id' - 'diputuskan_oleh' order by a.dibuat_pada desc), '[]'::jsonb)
  from (select * from public.ajuan_perubahan where pengaju_user_id = (select auth.uid()) order by dibuat_pada desc limit 100) a
$$;

create or replace function public.batalkan_ajuan(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.ajuan_perubahan set status = 'dibatalkan', diputuskan_pada = now()
   where id = p_id and pengaju_user_id = (select auth.uid()) and status = 'menunggu';
  if not found then raise exception 'Ajuan tidak ditemukan atau sudah diputuskan.'; end if;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan) values ((select auth.uid()), 'ajuan_perubahan', 'BATAL', jsonb_build_object('ajuan', p_id));
end $$;

-- ---------------------------------------------------------------------------------------------
-- Admin TU (termasuk super admin)

create or replace function public.ajuan_daftar(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if private.peran_saya() is distinct from 'admin_tu' then return null; end if;
  return (select coalesce(jsonb_agg(to_jsonb(a) - 'npsn' - 'pengaju_user_id' - 'diputuskan_oleh' order by a.dibuat_pada desc), '[]'::jsonb)
          from (select * from public.ajuan_perubahan
                 where npsn = private.npsn_saya() and (p_status is null or status = p_status)
                 order by dibuat_pada desc limit 500) a);
end $$;

create or replace function public.putuskan_ajuan(p_id uuid, p_setuju boolean, p_catatan text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a public.ajuan_perubahan; it jsonb; k public.kolom_ajuan; v text; n integer;
  v_catatan text := nullif(btrim(coalesce(p_catatan, '')), '');
  v_terap integer := 0; v_teruskan integer := 0; v_berubah integer := 0;
begin
  if private.peran_saya() is distinct from 'admin_tu' then raise exception 'Hanya admin TU yang dapat memutuskan ajuan.'; end if;
  select * into a from public.ajuan_perubahan where id = p_id and npsn = private.npsn_saya() for update;
  if not found then raise exception 'Ajuan tidak ditemukan.'; end if;
  if a.status <> 'menunggu' then raise exception 'Ajuan ini sudah diputuskan.'; end if;

  if not p_setuju then
    if v_catatan is null then raise exception 'Tulis alasan penolakan agar pengaju tahu apa yang perlu dilengkapi.'; end if;
    update public.ajuan_perubahan set status = 'ditolak', catatan_admin = v_catatan, diputuskan_oleh = (select auth.uid()), diputuskan_pada = now() where id = p_id;
    insert into public.audit_log (user_id, tabel, aksi, ringkasan) values ((select auth.uid()), 'ajuan_perubahan', 'TOLAK', jsonb_build_object('ajuan', p_id));
    return jsonb_build_object('status', 'ditolak');
  end if;

  for it in select * from jsonb_array_elements(a.perubahan) loop
    select * into k from public.kolom_ajuan where jenis = a.jenis and kunci = it->>'kunci';
    if not found then raise exception 'Kolom "%" tidak lagi dapat diubah.', it->>'kunci'; end if;
    if not k.terapkan then v_teruskan := v_teruskan + 1; continue; end if;
    if private.nilai_sekarang(a.jenis, k.kunci, a.subjek_id) is distinct from nullif(it->>'lama', '') then v_berubah := v_berubah + 1; end if;
    v := nullif(it->>'baru', '');
    if k.tabel = 'ptk' then
      execute format('update public.ptk set %I = $1::%s where id = $2 and npsn = $3', k.kolom, k.tipe_sql) using v, a.subjek_id, a.npsn;
    elsif k.tabel = 'ptk_sensitif' then
      execute format('update public.ptk_sensitif set %I = $1::%s where ptk_id = $2', k.kolom, k.tipe_sql) using v, a.subjek_id;
    elsif k.tabel = 'peserta_didik' then
      execute format('update public.peserta_didik set %I = $1::%s where id = $2 and npsn = $3', k.kolom, k.tipe_sql) using v, a.subjek_id, a.npsn;
    elsif k.tabel = 'peserta_didik_sensitif' then
      execute format('update public.peserta_didik_sensitif set %I = $1::%s where peserta_didik_id = $2', k.kolom, k.tipe_sql) using v, a.subjek_id;
    else
      execute format('update public.orang_tua_wali set %I = $1::%s where peserta_didik_id = $2 and hubungan = $3', k.kolom, k.tipe_sql) using v, a.subjek_id, k.hubungan;
    end if;
    get diagnostics n = row_count;
    if n = 0 and k.tabel = 'orang_tua_wali' then
      execute format('insert into public.orang_tua_wali (peserta_didik_id, hubungan, %I) values ($1, $2, $3::%s)', k.kolom, k.tipe_sql) using a.subjek_id, k.hubungan, v;
      n := 1;
    end if;
    if n = 0 then raise exception 'Baris data "%" tidak ditemukan, perubahan dibatalkan.', k.label; end if;
    v_terap := v_terap + 1;
  end loop;

  update public.ajuan_perubahan set status = 'disetujui', catatan_admin = v_catatan, diputuskan_oleh = (select auth.uid()), diputuskan_pada = now() where id = p_id;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan)
  values ((select auth.uid()), 'ajuan_perubahan', 'SETUJU', jsonb_build_object('ajuan', p_id, 'diterapkan', v_terap, 'diteruskan', v_teruskan));
  return jsonb_build_object('status', 'disetujui', 'diterapkan', v_terap, 'diteruskan_ke_dapodik', v_teruskan, 'berubah_sejak_ajuan', v_berubah);
end $$;

create or replace function public.tandai_dapodik(p_id uuid, p_nilai boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if private.peran_saya() is distinct from 'admin_tu' then raise exception 'Hanya admin TU yang dapat menandai.'; end if;
  update public.ajuan_perubahan
     set sudah_di_dapodik = p_nilai, sudah_di_dapodik_pada = case when p_nilai then now() end
   where id = p_id and npsn = private.npsn_saya() and status = 'disetujui';
  if not found then raise exception 'Ajuan tidak ditemukan atau belum disetujui.'; end if;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan) values ((select auth.uid()), 'ajuan_perubahan', 'TANDAI_DAPODIK', jsonb_build_object('ajuan', p_id, 'nilai', p_nilai));
end $$;

revoke execute on function private.nilai_sekarang(text, text, uuid) from public, anon;
revoke execute on function public.ajukan_perubahan(text, uuid, jsonb, text) from public, anon;
revoke execute on function public.ajuan_saya() from public, anon;
revoke execute on function public.batalkan_ajuan(uuid) from public, anon;
revoke execute on function public.ajuan_daftar(text) from public, anon;
revoke execute on function public.putuskan_ajuan(uuid, boolean, text) from public, anon;
revoke execute on function public.tandai_dapodik(uuid, boolean) from public, anon;
grant execute on function public.ajukan_perubahan(text, uuid, jsonb, text) to authenticated;
grant execute on function public.ajuan_saya() to authenticated;
grant execute on function public.batalkan_ajuan(uuid) to authenticated;
grant execute on function public.ajuan_daftar(text) to authenticated;
grant execute on function public.putuskan_ajuan(uuid, boolean, text) to authenticated;
grant execute on function public.tandai_dapodik(uuid, boolean) to authenticated;
revoke all on public.kolom_ajuan from anon;
