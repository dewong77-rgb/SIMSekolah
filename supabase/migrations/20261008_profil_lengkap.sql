-- Profil lengkap setara formulir Dapodik (F-PTK dan F-PD), dapat dilengkapi sendiri oleh pemilik data.
--
-- Prinsip (selaras dengan alur ajuan):
--  * Dapodik tetap sumber kebenaran. Kolom yang SUDAH terisi hanya berubah lewat "ajuan perbaikan" ke operator.
--  * Kolom yang MASIH KOSONG boleh diisi sendiri oleh guru, tendik, siswa, atau orang tua. Nilainya langsung masuk SIMS
--    dan dicatat di antrean isian_mandiri supaya operator Dapodik tahu apa yang perlu diinput ke Dapodik.
--  * Unggahan Dapodik berikutnya tidak boleh menghapus isian mandiri yang belum masuk Dapodik (trigger di bawah).
--  * Bagian riwayat (anak, diklat, pendidikan formal, dan seterusnya) disimpan di riwayat_dapodik, juga dengan antrean operator.
--  * Semua akses lewat fungsi. Tabel baru tidak punya policy.

-- ---------------------------------------------------------------------------------------------
-- Kolom baru

alter table public.ptk
  add column if not exists niy_nigk text,
  add column if not exists nigb text,
  add column if not exists no_surat_tugas text,
  add column if not exists tgl_surat_tugas date,
  add column if not exists tmt_tugas date,
  add column if not exists sekolah_induk text,
  add column if not exists kode_program_keahlian text,
  add column if not exists ketunaan_ditangani text,
  add column if not exists spesialisasi_khusus text,
  add column if not exists keahlian_khusus text;

alter table public.peserta_didik
  add column if not exists npsn_sekolah_asal text,
  add column if not exists waktu_tempuh_menit integer,
  add column if not exists tanggal_masuk date;

alter table public.peserta_didik_sensitif
  add column if not exists alasan_menolak_kip text;

-- ---------------------------------------------------------------------------------------------
-- Daftar kolom yang boleh diisi atau diajukan (sumber tunggal untuk formulir dan validasi)

insert into public.kolom_ajuan (jenis, kunci, tabel, kolom, hubungan, label, kelompok, tipe, tipe_sql, pilihan, pola, wajib, butuh_dokumen, terapkan, urutan) values
-- Guru dan tendik: kepegawaian
('ptk','nip','ptk','nip',null,'NIP','Kepegawaian','teks','text',null,'^[0-9]{18}$',false,true,true,100),
('ptk','nuptk','ptk','nuptk',null,'NUPTK','Kepegawaian','teks','text',null,'^[0-9]{16}$',false,true,true,101),
('ptk','niy_nigk','ptk','niy_nigk',null,'NIY / NIGK','Kepegawaian','teks','text',null,null,false,true,true,102),
('ptk','nigb','ptk','nigb',null,'NIGB','Kepegawaian','teks','text',null,null,false,true,true,103),
('ptk','status_kepegawaian','ptk','status_kepegawaian',null,'Status pegawai','Kepegawaian','pilihan','text','["PNS","CPNS","PPPK","PPPK Paruh Waktu","GTY/PTY","Guru Honor Sekolah","Tenaga Honor Sekolah"]',null,false,true,true,104),
('ptk','sk_pengangkatan','ptk','sk_pengangkatan',null,'SK pengangkatan','Kepegawaian','teks','text',null,null,false,true,true,105),
('ptk','tmt_pengangkatan','ptk','tmt_pengangkatan',null,'TMT pengangkatan','Kepegawaian','tanggal','date',null,null,false,true,true,106),
('ptk','lembaga_pengangkatan','ptk','lembaga_pengangkatan',null,'Lembaga pengangkat','Kepegawaian','pilihan','text','["Pemerintah Pusat","Pemerintah Propinsi","Pemerintah Kab/Kota","Ketua Yayasan","Kepala Sekolah","Komite Sekolah","Lainnya"]',null,false,true,true,107),
('ptk','sk_cpns','ptk','sk_cpns',null,'SK CPNS','Kepegawaian','teks','text',null,null,false,true,true,108),
('ptk','tanggal_cpns','ptk','tanggal_cpns',null,'TMT CPNS','Kepegawaian','tanggal','date',null,null,false,true,true,109),
('ptk','tmt_pns','ptk','tmt_pns',null,'TMT PNS','Kepegawaian','tanggal','date',null,null,false,true,true,110),
('ptk','pangkat_golongan','ptk','pangkat_golongan',null,'Pangkat / golongan','Kepegawaian','pilihan','text','["I/a","I/b","I/c","I/d","II/a","II/b","II/c","II/d","III/a","III/b","III/c","III/d","IV/a","IV/b","IV/c","IV/d","IV/e"]',null,false,true,true,111),
('ptk','sumber_gaji','ptk','sumber_gaji',null,'Sumber gaji','Kepegawaian','pilihan','text','["APBN","APBD Provinsi","APBD Kabupaten/Kota","Yayasan","Sekolah","Lembaga Donor","Lainnya"]',null,false,false,true,112),
('ptk','karpeg','ptk_sensitif','karpeg',null,'Kartu pegawai','Kepegawaian','teks','text',null,null,false,false,true,113),
('ptk','karis_karsu','ptk_sensitif','karis_karsu',null,'Karis / Karsu','Kepegawaian','teks','text',null,null,false,false,true,114),
('ptk','tmt_kerja','ptk','tmt_kerja',null,'TMT kerja','Kepegawaian','tanggal','date',null,null,false,true,true,115),
-- Guru dan tendik: penugasan dan kompetensi khusus
('ptk','no_surat_tugas','ptk','no_surat_tugas',null,'No. surat tugas','Penugasan','teks','text',null,null,false,true,true,120),
('ptk','tgl_surat_tugas','ptk','tgl_surat_tugas',null,'Tanggal surat tugas','Penugasan','tanggal','date',null,null,false,true,true,121),
('ptk','tmt_tugas','ptk','tmt_tugas',null,'TMT tugas','Penugasan','tanggal','date',null,null,false,true,true,122),
('ptk','sekolah_induk','ptk','sekolah_induk',null,'Sekolah induk','Penugasan','pilihan','text','["Ya","Tidak"]',null,false,false,true,123),
('ptk','kode_program_keahlian','ptk','kode_program_keahlian',null,'Kode program keahlian (laboran)','Kompetensi khusus','teks','text',null,null,false,false,true,130),
('ptk','ketunaan_ditangani','ptk','ketunaan_ditangani',null,'Jenis ketunaan yang ditangani','Kompetensi khusus','teks','text',null,null,false,false,true,131),
('ptk','spesialisasi_khusus','ptk','spesialisasi_khusus',null,'Spesialisasi kebutuhan khusus','Kompetensi khusus','teks','text',null,null,false,false,true,132),
('ptk','keahlian_khusus','ptk','keahlian_khusus',null,'Keahlian kebutuhan khusus','Kompetensi khusus','teks','text',null,null,false,false,true,133),
('ptk','nip_pasangan','ptk_sensitif','nip_pasangan',null,'NIP suami / istri','Data pribadi','teks','text',null,'^[0-9]{18}$',false,false,true,35),
-- Siswa: identitas dan sekolah asal
('siswa','nisn','peserta_didik','nisn',null,'NISN','Identitas','teks','text',null,'^[0-9]{10}$',false,true,true,18),
('siswa','nipd','peserta_didik','nipd',null,'NIS / NIPD','Identitas','teks','text',null,null,false,false,true,19),
('siswa','kebutuhan_khusus','peserta_didik','kebutuhan_khusus',null,'Berkebutuhan khusus','Identitas','teks','text',null,null,false,false,true,20),
('siswa','tanggal_masuk','peserta_didik','tanggal_masuk',null,'Tanggal masuk sekolah','Sekolah asal','tanggal','date',null,null,false,true,true,25),
('siswa','sekolah_asal','peserta_didik','sekolah_asal',null,'Nama sekolah asal','Sekolah asal','teks','text',null,null,false,false,true,26),
('siswa','npsn_sekolah_asal','peserta_didik','npsn_sekolah_asal',null,'NPSN sekolah asal','Sekolah asal','teks','text',null,'^[0-9]{8}$',false,false,true,27),
('siswa','no_seri_ijazah','peserta_didik_sensitif','no_seri_ijazah',null,'No. seri ijazah jenjang sebelumnya','Sekolah asal','teks','text',null,null,false,true,true,28),
('siswa','skhun','peserta_didik','skhun',null,'No. seri SKHUN','Sekolah asal','teks','text',null,null,false,true,true,29),
('siswa','no_peserta_ujian_nasional','peserta_didik_sensitif','no_peserta_ujian_nasional',null,'No. peserta ujian nasional','Sekolah asal','teks','text',null,null,false,false,true,30),
('siswa','waktu_tempuh_menit','peserta_didik','waktu_tempuh_menit',null,'Waktu tempuh ke sekolah (menit)','Tempat tinggal','angka','integer',null,null,false,false,true,53),
('siswa','lingkar_kepala','peserta_didik','lingkar_kepala',null,'Lingkar kepala (cm)','Data periodik','angka','numeric',null,null,false,false,true,64),
-- Siswa: kesejahteraan
('siswa','no_kps','peserta_didik_sensitif','no_kps',null,'No. KPS','Kesejahteraan','teks','text',null,null,false,false,true,200),
('siswa','nomor_kks','peserta_didik_sensitif','nomor_kks',null,'No. KKS','Kesejahteraan','teks','text',null,null,false,false,true,201),
('siswa','penerima_kip','peserta_didik_sensitif','penerima_kip',null,'Penerima KIP','Kesejahteraan','pilihan','text','["Ya","Tidak"]',null,false,false,true,202),
('siswa','nomor_kip','peserta_didik_sensitif','nomor_kip',null,'No. KIP','Kesejahteraan','teks','text',null,null,false,false,true,203),
('siswa','nama_di_kip','peserta_didik_sensitif','nama_di_kip',null,'Nama tertera di KIP','Kesejahteraan','teks','text',null,null,false,false,true,204),
('siswa','alasan_menolak_kip','peserta_didik_sensitif','alasan_menolak_kip',null,'Alasan menolak KIP','Kesejahteraan','teks','text',null,null,false,false,true,205),
('siswa','layak_pip','peserta_didik','layak_pip',null,'Layak PIP','Kesejahteraan','pilihan','text','["Ya","Tidak"]',null,false,false,true,206),
('siswa','alasan_layak_pip','peserta_didik','alasan_layak_pip',null,'Alasan layak PIP','Kesejahteraan','teks','text',null,null,false,false,true,207)
on conflict (jenis, kunci) do nothing;

-- Berkebutuhan khusus untuk ayah, ibu, wali
insert into public.kolom_ajuan (jenis, kunci, tabel, kolom, hubungan, label, kelompok, tipe, tipe_sql, pilihan, pola, wajib, butuh_dokumen, terapkan, urutan)
select 'siswa', h.hub || '.kebutuhan_khusus', 'orang_tua_wali', 'kebutuhan_khusus', h.hub, 'Berkebutuhan khusus', h.judul, 'teks', 'text', null, null, false, false, true, h.urut + 5
from (values ('ayah','Data ayah kandung',70), ('ibu','Data ibu kandung',80), ('wali','Data wali',90)) as h(hub, judul, urut)
on conflict (jenis, kunci) do nothing;

-- ---------------------------------------------------------------------------------------------
-- Antrean isian mandiri (kolom tunggal)

create table if not exists public.isian_mandiri (
  id uuid primary key default gen_random_uuid(),
  npsn text not null,
  jenis text not null check (jenis in ('ptk', 'siswa')),
  subjek_id uuid not null,
  subjek_nama text not null,
  kunci text not null,
  label text not null,
  kelompok text not null,
  tabel text not null,
  kolom text not null,
  hubungan text,
  nilai text not null,
  pengisi_user_id uuid not null,
  pengisi_peran text not null,
  status text not null default 'baru' check (status in ('baru', 'dientri', 'selesai')),
  dibuat_pada timestamptz not null default now(),
  dientri_pada timestamptz,
  dientri_oleh uuid
);
alter table public.isian_mandiri enable row level security;
revoke all on public.isian_mandiri from anon, authenticated;
create index if not exists isian_mandiri_antrean_idx on public.isian_mandiri (npsn, status, dibuat_pada desc);
create index if not exists isian_mandiri_subjek_idx on public.isian_mandiri (subjek_id, tabel) where status = 'baru';

-- ---------------------------------------------------------------------------------------------
-- Riwayat berbaris (anak, diklat, pendidikan formal, prestasi, dan seterusnya)

create table if not exists public.riwayat_dapodik (
  id uuid primary key default gen_random_uuid(),
  npsn text not null,
  jenis text not null check (jenis in ('ptk', 'siswa')),
  subjek_id uuid not null,
  subjek_nama text not null,
  bagian text not null,
  data jsonb not null,
  sumber text not null default 'mandiri' check (sumber in ('mandiri', 'dapodik')),
  status text not null default 'baru' check (status in ('baru', 'dientri')),
  pengisi_user_id uuid not null,
  pengisi_peran text not null,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now(),
  dientri_pada timestamptz,
  dientri_oleh uuid
);
alter table public.riwayat_dapodik enable row level security;
revoke all on public.riwayat_dapodik from anon, authenticated;
create index if not exists riwayat_dapodik_subjek_idx on public.riwayat_dapodik (subjek_id, bagian, dibuat_pada);
create index if not exists riwayat_dapodik_antrean_idx on public.riwayat_dapodik (npsn, status, dibuat_pada desc);

-- ---------------------------------------------------------------------------------------------
-- Siapa yang boleh mengisi

create or replace function private.boleh_isi(p_jenis text, p_subjek uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    case
      when p_jenis = 'ptk' then private.peran_saya() in ('guru', 'staf') and p_subjek = private.ptk_id_saya()
      when p_jenis = 'siswa' then (private.peran_saya() = 'siswa' and p_subjek = private.pd_id_saya())
                                  or (private.peran_saya() = 'orang_tua' and p_subjek in (select private.anak_saya()))
    end, false)
$$;

create or replace function private.nama_subjek(p_jenis text, p_subjek uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when p_jenis = 'ptk' then (select nama from public.ptk where id = p_subjek and npsn = private.npsn_saya())
              else (select nama from public.peserta_didik where id = p_subjek and npsn = private.npsn_saya()) end
$$;

-- ---------------------------------------------------------------------------------------------
-- Mengisi kolom yang masih kosong

create or replace function public.isi_data_kosong(p_jenis text, p_subjek uuid, p_isian jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_npsn text := private.npsn_saya();
  v_peran text := private.peran_saya();
  v_nama text;
  v_item jsonb; k public.kolom_ajuan; v_baru text; v_lama text; n integer; v_jumlah integer := 0;
  v_dipakai text[] := '{}';
begin
  if v_peran is null then raise exception 'Anda belum masuk.'; end if;
  if p_jenis not in ('ptk', 'siswa') or not private.boleh_isi(p_jenis, p_subjek) then
    raise exception 'Anda tidak berhak melengkapi data ini.';
  end if;
  v_nama := private.nama_subjek(p_jenis, p_subjek);
  if v_nama is null then raise exception 'Data tidak ditemukan.'; end if;
  if jsonb_typeof(p_isian) <> 'array' or jsonb_array_length(p_isian) = 0 then raise exception 'Tidak ada isian.'; end if;
  if jsonb_array_length(p_isian) > 80 then raise exception 'Terlalu banyak kolom dalam satu kiriman.'; end if;

  for v_item in select * from jsonb_array_elements(p_isian) loop
    select * into k from public.kolom_ajuan where jenis = p_jenis and kunci = v_item->>'kunci';
    if not found or not k.terapkan then raise exception 'Kolom "%" tidak dapat diisi langsung.', coalesce(v_item->>'kunci', '?'); end if;
    if k.kunci = any(v_dipakai) then raise exception 'Kolom "%" muncul dua kali.', k.label; end if;
    v_dipakai := v_dipakai || k.kunci;
    v_baru := nullif(btrim(coalesce(v_item->>'nilai', '')), '');
    if v_baru is null then continue; end if;
    if length(v_baru) > 200 then raise exception '"%" terlalu panjang.', k.label; end if;
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
    v_lama := private.nilai_sekarang(p_jenis, k.kunci, p_subjek);
    if nullif(btrim(coalesce(v_lama, '')), '') is not null then
      raise exception '"%" sudah terisi. Gunakan "Ajukan perbaikan data" untuk mengubahnya.', k.label;
    end if;

    if k.tabel = 'ptk' then
      execute format('update public.ptk set %I = $1::%s where id = $2 and npsn = $3', k.kolom, k.tipe_sql) using v_baru, p_subjek, v_npsn;
    elsif k.tabel = 'peserta_didik' then
      execute format('update public.peserta_didik set %I = $1::%s where id = $2 and npsn = $3', k.kolom, k.tipe_sql) using v_baru, p_subjek, v_npsn;
    elsif k.tabel = 'ptk_sensitif' then
      execute format('update public.ptk_sensitif set %I = $1::%s where ptk_id = $2', k.kolom, k.tipe_sql) using v_baru, p_subjek;
    elsif k.tabel = 'peserta_didik_sensitif' then
      execute format('update public.peserta_didik_sensitif set %I = $1::%s where peserta_didik_id = $2', k.kolom, k.tipe_sql) using v_baru, p_subjek;
    else
      execute format('update public.orang_tua_wali set %I = $1::%s where peserta_didik_id = $2 and hubungan = $3', k.kolom, k.tipe_sql) using v_baru, p_subjek, k.hubungan;
    end if;
    get diagnostics n = row_count;
    if n = 0 then
      -- baris anak belum ada (misalnya data sensitif atau wali yang belum pernah terisi)
      if k.tabel = 'ptk_sensitif' then
        execute format('insert into public.ptk_sensitif (ptk_id, %I) values ($1, $2::%s)', k.kolom, k.tipe_sql) using p_subjek, v_baru;
      elsif k.tabel = 'peserta_didik_sensitif' then
        execute format('insert into public.peserta_didik_sensitif (peserta_didik_id, %I) values ($1, $2::%s)', k.kolom, k.tipe_sql) using p_subjek, v_baru;
      elsif k.tabel = 'orang_tua_wali' then
        execute format('insert into public.orang_tua_wali (peserta_didik_id, hubungan, %I) values ($1, $2, $3::%s)', k.kolom, k.tipe_sql) using p_subjek, k.hubungan, v_baru;
      else
        raise exception 'Data "%" tidak ditemukan.', k.label;
      end if;
    end if;

    insert into public.isian_mandiri (npsn, jenis, subjek_id, subjek_nama, kunci, label, kelompok, tabel, kolom, hubungan, nilai, pengisi_user_id, pengisi_peran)
    values (v_npsn, p_jenis, p_subjek, v_nama, k.kunci, k.label, k.kelompok, k.tabel, k.kolom, k.hubungan, v_baru, (select auth.uid()), v_peran);
    v_jumlah := v_jumlah + 1;
  end loop;

  if v_jumlah = 0 then raise exception 'Belum ada kolom yang diisi.'; end if;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan)
  values ((select auth.uid()), 'isian_mandiri', 'ISI', jsonb_build_object('jenis', p_jenis, 'subjek', p_subjek, 'jumlah_kolom', v_jumlah));
  return v_jumlah;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Unggahan Dapodik tidak boleh menghapus isian mandiri yang belum masuk Dapodik.
-- Bila Dapodik kini memiliki nilai (batch unggahan berganti), isian ditandai selesai dan nilai Dapodik yang berlaku.

create or replace function private.jaga_isian_mandiri() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record; nj jsonb := to_jsonb(new); oj jsonb := to_jsonb(old); v_sub uuid;
begin
  v_sub := case tg_table_name
    when 'ptk' then (nj->>'id')::uuid
    when 'peserta_didik' then (nj->>'id')::uuid
    when 'ptk_sensitif' then (nj->>'ptk_id')::uuid
    else (nj->>'peserta_didik_id')::uuid end;
  for r in select * from public.isian_mandiri
            where subjek_id = v_sub and tabel = tg_table_name and status = 'baru' loop
    if r.hubungan is not null and nj->>'hubungan' is distinct from r.hubungan then continue; end if;
    if nullif(btrim(coalesce(nj->>r.kolom, '')), '') is null then
      nj := nj || jsonb_build_object(r.kolom, oj->r.kolom);
    elsif tg_table_name in ('ptk', 'peserta_didik') and nj->>'batch_id' is distinct from oj->>'batch_id' then
      update public.isian_mandiri set status = 'selesai', dientri_pada = now() where id = r.id;
    end if;
  end loop;
  new := jsonb_populate_record(new, nj);
  return new;
end $$;

drop trigger if exists jaga_isian_ptk on public.ptk;
create trigger jaga_isian_ptk before update on public.ptk for each row execute function private.jaga_isian_mandiri();
drop trigger if exists jaga_isian_pd on public.peserta_didik;
create trigger jaga_isian_pd before update on public.peserta_didik for each row execute function private.jaga_isian_mandiri();
drop trigger if exists jaga_isian_ptk_s on public.ptk_sensitif;
create trigger jaga_isian_ptk_s before update on public.ptk_sensitif for each row execute function private.jaga_isian_mandiri();
drop trigger if exists jaga_isian_pd_s on public.peserta_didik_sensitif;
create trigger jaga_isian_pd_s before update on public.peserta_didik_sensitif for each row execute function private.jaga_isian_mandiri();
drop trigger if exists jaga_isian_otw on public.orang_tua_wali;
create trigger jaga_isian_otw before update on public.orang_tua_wali for each row execute function private.jaga_isian_mandiri();

-- ---------------------------------------------------------------------------------------------
-- Riwayat: baca, simpan, hapus

create or replace function private.bagian_riwayat_sah(p_jenis text, p_bagian text) returns boolean
language sql immutable set search_path = '' as $$
  select case when p_jenis = 'ptk' then p_bagian in (
      'anak','beasiswa','buku','diklat','karya_tulis','kesejahteraan','tunjangan','tugas_tambahan','penghargaan','nilai_tes',
      'gaji_berkala','jabatan_struktural','kepangkatan','pendidikan_formal','sertifikasi','jabatan_fungsional','karir')
    else p_bagian in ('prestasi', 'beasiswa') end
$$;

create or replace function public.riwayat_baca(p_jenis text, p_subjek uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_ok boolean;
begin
  if p_jenis not in ('ptk', 'siswa') then return null; end if;
  v_ok := private.boleh_isi(p_jenis, p_subjek) or (private.peran_saya() = 'admin_tu' and private.nama_subjek(p_jenis, p_subjek) is not null);
  if not v_ok then return null; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'bagian', x.bagian, 'data', x.data, 'sumber', x.sumber,
                                                        'status', x.status, 'dibuat_pada', x.dibuat_pada) order by x.bagian, x.dibuat_pada)
                     from public.riwayat_dapodik x where x.subjek_id = p_subjek and x.jenis = p_jenis and x.npsn = private.npsn_saya()), '[]'::jsonb);
end $$;

create or replace function public.riwayat_simpan(p_jenis text, p_subjek uuid, p_bagian text, p_data jsonb, p_id uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_npsn text := private.npsn_saya(); v_nama text; v_data jsonb := '{}'::jsonb; e record; v_id uuid;
begin
  if not private.boleh_isi(p_jenis, p_subjek) then raise exception 'Anda tidak berhak melengkapi data ini.'; end if;
  v_nama := private.nama_subjek(p_jenis, p_subjek);
  if v_nama is null then raise exception 'Data tidak ditemukan.'; end if;
  if not private.bagian_riwayat_sah(p_jenis, p_bagian) then raise exception 'Bagian "%" tidak dikenal.', p_bagian; end if;
  if jsonb_typeof(p_data) <> 'object' then raise exception 'Isian tidak valid.'; end if;
  if (select count(*) from jsonb_object_keys(p_data)) > 30 then raise exception 'Terlalu banyak kolom.'; end if;
  for e in select key, value from jsonb_each(p_data) loop
    if jsonb_typeof(e.value) <> 'string' then raise exception 'Isian "%" harus berupa teks.', e.key; end if;
    if length(e.key) > 40 or e.key !~ '^[a-z0-9_]+$' then raise exception 'Nama kolom tidak valid.'; end if;
    if length(btrim(e.value #>> '{}')) > 200 then raise exception 'Isian "%" terlalu panjang (maksimal 200 karakter).', e.key; end if;
    if btrim(e.value #>> '{}') <> '' then v_data := v_data || jsonb_build_object(e.key, btrim(e.value #>> '{}')); end if;
  end loop;
  if v_data = '{}'::jsonb then raise exception 'Isi minimal satu kolom.'; end if;

  if p_id is null then
    if (select count(*) from public.riwayat_dapodik where subjek_id = p_subjek and jenis = p_jenis and bagian = p_bagian) >= 50 then
      raise exception 'Jumlah baris pada bagian ini sudah mencapai batas (50).';
    end if;
    insert into public.riwayat_dapodik (npsn, jenis, subjek_id, subjek_nama, bagian, data, pengisi_user_id, pengisi_peran)
    values (v_npsn, p_jenis, p_subjek, v_nama, p_bagian, v_data, (select auth.uid()), private.peran_saya())
    returning id into v_id;
  else
    update public.riwayat_dapodik
       set data = v_data, status = 'baru', dientri_pada = null, dientri_oleh = null, diperbarui_pada = now()
     where id = p_id and subjek_id = p_subjek and jenis = p_jenis and bagian = p_bagian and sumber = 'mandiri'
    returning id into v_id;
    if v_id is null then raise exception 'Baris tidak ditemukan, atau berasal dari Dapodik (ajukan perbaikan lewat TU).'; end if;
  end if;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan)
  values ((select auth.uid()), 'riwayat_dapodik', case when p_id is null then 'TAMBAH' else 'UBAH' end, jsonb_build_object('id', v_id, 'bagian', p_bagian));
  return v_id;
end $$;

create or replace function public.riwayat_hapus(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare x public.riwayat_dapodik;
begin
  select * into x from public.riwayat_dapodik where id = p_id and npsn = private.npsn_saya();
  if not found or not private.boleh_isi(x.jenis, x.subjek_id) then raise exception 'Baris tidak ditemukan.'; end if;
  if x.sumber <> 'mandiri' then raise exception 'Baris dari Dapodik tidak dapat dihapus di sini.'; end if;
  if x.status <> 'baru' then raise exception 'Baris ini sudah diinput operator ke Dapodik. Hubungi TU untuk menghapusnya.'; end if;
  delete from public.riwayat_dapodik where id = p_id;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan) values ((select auth.uid()), 'riwayat_dapodik', 'HAPUS', jsonb_build_object('id', p_id, 'bagian', x.bagian));
end $$;

-- ---------------------------------------------------------------------------------------------
-- Antrean operator Dapodik

create or replace function public.isian_antrean(p_status text default 'baru') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.boleh_kerjakan() then return null; end if;
  if p_status not in ('baru', 'dientri') then raise exception 'Status tidak dikenal.'; end if;
  return jsonb_build_object(
    'isian', coalesce((select jsonb_agg(to_jsonb(i) - 'npsn' - 'pengisi_user_id' - 'dientri_oleh' - 'tabel' - 'kolom' - 'hubungan' order by i.subjek_nama, i.dibuat_pada)
                         from (select * from public.isian_mandiri
                                where npsn = private.npsn_saya() and (case when p_status = 'baru' then status = 'baru' else status in ('dientri', 'selesai') end)
                                order by dibuat_pada desc limit 1000) i), '[]'::jsonb),
    'riwayat', coalesce((select jsonb_agg(to_jsonb(r) - 'npsn' - 'pengisi_user_id' - 'dientri_oleh' order by r.subjek_nama, r.bagian, r.dibuat_pada)
                           from (select * from public.riwayat_dapodik
                                  where npsn = private.npsn_saya() and status = p_status
                                  order by dibuat_pada desc limit 1000) r), '[]'::jsonb));
end $$;

create or replace function public.isian_tandai(p_tipe text, p_ids uuid[], p_dientri boolean default true) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not private.boleh_kerjakan() then raise exception 'Hanya operator Dapodik yang dapat menandai.'; end if;
  if p_tipe = 'isian' then
    update public.isian_mandiri
       set status = case when p_dientri then 'dientri' else 'baru' end,
           dientri_pada = case when p_dientri then now() end, dientri_oleh = case when p_dientri then (select auth.uid()) end
     where id = any(p_ids) and npsn = private.npsn_saya() and status in ('baru', 'dientri');
  elsif p_tipe = 'riwayat' then
    update public.riwayat_dapodik
       set status = case when p_dientri then 'dientri' else 'baru' end,
           dientri_pada = case when p_dientri then now() end, dientri_oleh = case when p_dientri then (select auth.uid()) end
     where id = any(p_ids) and npsn = private.npsn_saya();
  else
    raise exception 'Jenis tidak dikenal.';
  end if;
  get diagnostics n = row_count;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan) values ((select auth.uid()), 'isian_mandiri', 'TANDAI', jsonb_build_object('tipe', p_tipe, 'jumlah', n, 'dientri', p_dientri));
  return n;
end $$;

-- Satu angka untuk lencana antrean operator: ajuan perbaikan ditambah isian baru.
create or replace function public.isian_ringkasan() returns integer
language sql stable security definer set search_path = '' as $$
  select case when private.boleh_kerjakan() then
    (select count(*) from public.isian_mandiri where npsn = private.npsn_saya() and status = 'baru')::integer
    + (select count(*) from public.riwayat_dapodik where npsn = private.npsn_saya() and status = 'baru')::integer
  else 0 end
$$;

revoke execute on function private.boleh_isi(text, uuid) from public, anon;
revoke execute on function private.nama_subjek(text, uuid) from public, anon;
revoke execute on function private.jaga_isian_mandiri() from public, anon;
revoke execute on function private.bagian_riwayat_sah(text, text) from public, anon;
revoke execute on function public.isi_data_kosong(text, uuid, jsonb) from public, anon;
revoke execute on function public.riwayat_baca(text, uuid) from public, anon;
revoke execute on function public.riwayat_simpan(text, uuid, text, jsonb, uuid) from public, anon;
revoke execute on function public.riwayat_hapus(uuid) from public, anon;
revoke execute on function public.isian_antrean(text) from public, anon;
revoke execute on function public.isian_tandai(text, uuid[], boolean) from public, anon;
revoke execute on function public.isian_ringkasan() from public, anon;
grant execute on function public.isi_data_kosong(text, uuid, jsonb) to authenticated;
grant execute on function public.riwayat_baca(text, uuid) to authenticated;
grant execute on function public.riwayat_simpan(text, uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.riwayat_hapus(uuid) to authenticated;
grant execute on function public.isian_antrean(text) to authenticated;
grant execute on function public.isian_tandai(text, uuid[], boolean) to authenticated;
grant execute on function public.isian_ringkasan() to authenticated;
