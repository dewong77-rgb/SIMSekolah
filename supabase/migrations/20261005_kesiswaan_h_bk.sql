-- Modul Bimbingan dan Konseling (BK), satu akar dengan Kesiswaan.
--   bk.kelola : Guru BK. Mencatat konseling, membuka dan menangani kasus pencegahan putus sekolah (ATS).
--   bk.baca   : Waka Kesiswaan. Membaca kasus dan catatan, tidak mengubah.
--   Wali kelas dan guru lain tidak membaca catatan konseling. Mereka hanya dapat merujuk siswa (bk_rujuk) lewat izin kesiswaan.catat.
-- Siswa dan orang tua tidak melihat catatan BK. Setiap pembukaan catatan konseling masuk audit_log tanpa isi.
-- Tabel tanpa kebijakan RLS, semua akses lewat fungsi security definer.

insert into public.izin (kode, nama, bidang) values
  ('bk.kelola', 'Mencatat konseling dan menangani kasus pencegahan putus sekolah', 'Kesiswaan'),
  ('bk.baca',   'Membaca catatan konseling dan kasus pencegahan putus sekolah', 'Kesiswaan')
on conflict (kode) do nothing;

insert into public.jabatan_izin (jabatan_kode, izin_kode) values
  ('guru_bk', 'bk.kelola'),
  ('waka_kesiswaan', 'bk.baca')
on conflict do nothing;

update public.jabatan set keterangan = 'Membuat catatan konseling, mencegah siswa berisiko putus sekolah agar tidak menjadi ATS, dan menindaklanjuti pelanggaran.'
 where kode = 'guru_bk';

-- ---------------------------------------------------------------- tabel
create table if not exists public.bk_kasus (
  id uuid primary key default gen_random_uuid(),
  npsn text not null,
  peserta_didik_id uuid not null references public.peserta_didik (id),
  rombel_id uuid,
  tahun_ajaran text not null,
  pemicu text not null check (pemicu in ('risiko','rujukan','orang_tua','manual')),
  alasan_utama text not null check (alasan_utama in ('ekonomi','kehadiran','perilaku','keluarga','bekerja','pernikahan','minat','lainnya')),
  ringkasan text check (ringkasan is null or char_length(ringkasan) <= 1000),
  rencana text check (rencana is null or char_length(rencana) <= 2000),
  status text not null default 'terbuka' check (status in ('rujukan','terbuka','pemantauan','selesai_bertahan','pindah','putus_sekolah','ditutup')),
  tinjau_tanggal date,
  hasil text check (hasil is null or char_length(hasil) <= 1000),
  ditutup_pada timestamptz,
  dibuat_oleh uuid,
  dibuat_nama text,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);
alter table public.bk_kasus enable row level security;
create unique index if not exists bk_kasus_aktif_uq on public.bk_kasus (peserta_didik_id) where status in ('rujukan','terbuka','pemantauan');
create index if not exists bk_kasus_status_idx on public.bk_kasus (npsn, status);

create table if not exists public.bk_catatan (
  id uuid primary key default gen_random_uuid(),
  npsn text not null,
  peserta_didik_id uuid not null references public.peserta_didik (id),
  kasus_id uuid references public.bk_kasus (id),
  tanggal date not null,
  jenis text not null check (jenis in ('konseling_individu','konseling_kelompok','kunjungan_rumah','panggilan_orang_tua','mediasi','observasi','koordinasi','lainnya')),
  bidang text not null check (bidang in ('pribadi','sosial','belajar','karier','keluarga')),
  uraian text not null check (char_length(uraian) between 3 and 3000),
  tindak_lanjut text check (tindak_lanjut is null or char_length(tindak_lanjut) <= 1000),
  dibuat_oleh uuid,
  dibuat_nama text,
  dihapus boolean not null default false,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);
alter table public.bk_catatan enable row level security;
create index if not exists bk_catatan_pd_idx on public.bk_catatan (peserta_didik_id, tanggal desc);
create index if not exists bk_catatan_kasus_idx on public.bk_catatan (kasus_id);

-- ---------------------------------------------------------------- pembantu
create or replace function private.bk_kelola() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and private.kes_semua(array['bk.kelola'])
$$;
create or replace function private.bk_baca() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and private.kes_semua(array['bk.baca','bk.kelola'])
$$;

-- ---------------------------------------------------------------- hak akses untuk menu
create or replace function public.bk_izin() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('baca', private.bk_baca(), 'kelola', private.bk_kelola())
$$;

create or replace function public.kesiswaan_izin() returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hasil text[] := '{}';
  k text;
begin
  if auth.uid() is null then return v_hasil; end if;
  foreach k in array array['kesiswaan.catat','kesiswaan.verifikasi','kesiswaan.pantau','kesiswaan.izin','kesiswaan.beasiswa','ekskul.kelola','bk.kelola','bk.baca'] loop
    if private.kes_semua(array[k]) or cardinality(private.kes_rombel_saya(array[k])) > 0 then
      v_hasil := v_hasil || k;
    end if;
  end loop;
  if not ('ekskul.kelola' = any (v_hasil)) and exists (
       select 1 from public.ekskul e where e.npsn = private.npsn_saya() and e.aktif and private.kes_boleh_ekskul(e.id)) then
    v_hasil := v_hasil || 'ekskul.kelola';
  end if;
  if not ('ekskul.kelola' = any (v_hasil)) and exists (
       select 1 from public.ekskul e where e.npsn = private.npsn_saya() and e.aktif and private.kes_lihat_ekskul(e.id)) then
    v_hasil := v_hasil || 'ekskul.lihat';
  end if;
  return v_hasil;
end $$;

-- ---------------------------------------------------------------- ringkasan
create or replace function public.bk_beranda() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_npsn text := private.npsn_saya();
  v_ta text := public.tahun_ajaran_sekarang();
  v_hari date := private.kes_hari();
begin
  if not private.bk_baca() then raise exception 'Anda tidak berwenang membuka data BK.'; end if;
  return jsonb_build_object(
    'tahun_ajaran', v_ta,
    'kelola', private.bk_kelola(),
    'aktif', jsonb_build_object(
      'rujukan', (select count(*) from public.bk_kasus where npsn = v_npsn and status = 'rujukan'),
      'terbuka', (select count(*) from public.bk_kasus where npsn = v_npsn and status = 'terbuka'),
      'pemantauan', (select count(*) from public.bk_kasus where npsn = v_npsn and status = 'pemantauan')),
    'tinjau_lewat', (select count(*) from public.bk_kasus where npsn = v_npsn and status in ('terbuka','pemantauan') and tinjau_tanggal < v_hari),
    'ditutup', jsonb_build_object(
      'selesai_bertahan', (select count(*) from public.bk_kasus where npsn = v_npsn and tahun_ajaran = v_ta and status = 'selesai_bertahan'),
      'pindah', (select count(*) from public.bk_kasus where npsn = v_npsn and tahun_ajaran = v_ta and status = 'pindah'),
      'putus_sekolah', (select count(*) from public.bk_kasus where npsn = v_npsn and tahun_ajaran = v_ta and status = 'putus_sekolah'),
      'ditutup', (select count(*) from public.bk_kasus where npsn = v_npsn and tahun_ajaran = v_ta and status = 'ditutup')),
    'catatan_30_hari', (select count(*) from public.bk_catatan where npsn = v_npsn and not dihapus and tanggal >= v_hari - 29));
end $$;

-- Siswa berisiko (dari dashboard risiko) yang belum punya kasus aktif.
create or replace function public.bk_berisiko(p_level text default 'tinggi') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_r jsonb;
begin
  if not private.bk_baca() then raise exception 'Anda tidak berwenang membuka data BK.'; end if;
  if p_level not in ('tinggi','sedang') then raise exception 'Level tidak dikenal.'; end if;
  if not private.kes_semua(array['kesiswaan.pantau']) then return jsonb_build_object('tersedia', false, 'baris', '[]'::jsonb); end if;
  v_r := public.risiko_daftar(null, p_level, null, 200, 0, false);
  return jsonb_build_object(
    'tersedia', true, 'total', (v_r->>'total')::int,
    'baris', coalesce((
      select jsonb_agg(b order by (b->>'skor')::int desc, b->>'nama')
        from jsonb_array_elements(v_r->'baris') b
       where not exists (select 1 from public.bk_kasus k
                          where k.peserta_didik_id = (b->>'pd')::uuid and k.status in ('rujukan','terbuka','pemantauan'))), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- kasus
create or replace function public.bk_kasus_daftar(p_status text default 'aktif', p_cari text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_npsn text := private.npsn_saya();
  v_hari date := private.kes_hari();
  v_cari text := nullif(btrim(coalesce(p_cari, '')), '');
begin
  if not private.bk_baca() then raise exception 'Anda tidak berwenang membuka data BK.'; end if;
  if p_status not in ('aktif','selesai','semua') then raise exception 'Filter status tidak dikenal.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', k.id, 'pd', k.peserta_didik_id, 'nama', pd.nama, 'nisn', pd.nisn, 'rombel', private.kes_rombel_nama(k.peserta_didik_id),
      'status', k.status, 'alasan_utama', k.alasan_utama, 'pemicu', k.pemicu, 'tinjau_tanggal', k.tinjau_tanggal,
      'lewat_tinjau', (k.status in ('terbuka','pemantauan') and k.tinjau_tanggal < v_hari),
      'dibuat_pada', k.dibuat_pada, 'ditutup_pada', k.ditutup_pada,
      'catatan', (select count(*) from public.bk_catatan c where c.kasus_id = k.id and not c.dihapus),
      'terakhir', (select max(c.tanggal) from public.bk_catatan c where c.kasus_id = k.id and not c.dihapus))
      order by (k.status = 'rujukan') desc, (k.status in ('terbuka','pemantauan') and k.tinjau_tanggal < v_hari) desc, k.dibuat_pada desc)
      from (select * from public.bk_kasus
             where npsn = v_npsn
               and (p_status = 'semua'
                    or (p_status = 'aktif' and status in ('rujukan','terbuka','pemantauan'))
                    or (p_status = 'selesai' and status not in ('rujukan','terbuka','pemantauan')))
             order by dibuat_pada desc limit 300) k
      join public.peserta_didik pd on pd.id = k.peserta_didik_id
     where v_cari is null or pd.nama ilike '%' || v_cari || '%' or pd.nisn = v_cari), '[]'::jsonb);
end $$;

create or replace function public.bk_kasus_buka(p_pd uuid, p_alasan text, p_ringkasan text default null, p_rencana text default null,
                                                p_tinjau date default null, p_pemicu text default 'manual') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_pd public.peserta_didik%rowtype;
  v_hari date := private.kes_hari();
  v_id uuid;
begin
  if not private.bk_kelola() then raise exception 'Hanya Guru BK yang membuka kasus.'; end if;
  if p_pemicu not in ('risiko','orang_tua','manual') then raise exception 'Pemicu tidak dikenal.'; end if;
  select * into v_pd from public.peserta_didik where id = p_pd;
  if not found or v_pd.status_peserta_didik <> 'aktif' or v_pd.npsn <> private.npsn_saya() then raise exception 'Siswa tidak ditemukan atau sudah tidak aktif.'; end if;
  if p_tinjau is not null and (p_tinjau < v_hari or p_tinjau > v_hari + 180) then raise exception 'Tanggal tinjau harus dalam 180 hari ke depan.'; end if;
  if exists (select 1 from public.bk_kasus where peserta_didik_id = p_pd and status in ('rujukan','terbuka','pemantauan')) then
    raise exception 'Siswa ini sudah punya kasus aktif.';
  end if;
  insert into public.bk_kasus (npsn, peserta_didik_id, rombel_id, tahun_ajaran, pemicu, alasan_utama, ringkasan, rencana, status, tinjau_tanggal, dibuat_oleh, dibuat_nama)
  values (v_pd.npsn, p_pd, private.kes_rombel_pd(p_pd), public.tahun_ajaran_sekarang(), p_pemicu, p_alasan,
          nullif(btrim(coalesce(p_ringkasan, '')), ''), nullif(btrim(coalesce(p_rencana, '')), ''), 'terbuka', coalesce(p_tinjau, v_hari + 14), auth.uid(), public.nama_saya())
  returning id into v_id;
  perform private.kes_audit('bk_kasus', 'buka', jsonb_build_object('kasus', v_id));
  return v_id;
end $$;

-- Wali kelas atau guru merujuk siswa ke BK. Hanya alasan dan ringkasan singkat, tidak membuka catatan BK.
create or replace function public.bk_rujuk(p_pd uuid, p_alasan text, p_ringkasan text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_pd public.peserta_didik%rowtype;
  v_id uuid;
begin
  if auth.uid() is null or not private.kes_pd_boleh(array['kesiswaan.catat'], p_pd) then raise exception 'Anda tidak berwenang merujuk siswa ini.'; end if;
  select * into v_pd from public.peserta_didik where id = p_pd;
  if not found or v_pd.status_peserta_didik <> 'aktif' then raise exception 'Siswa tidak ditemukan atau sudah tidak aktif.'; end if;
  if (select count(*) from public.bk_kasus where dibuat_oleh = auth.uid() and dibuat_pada > now() - interval '1 hour') >= 20 then
    raise exception 'Terlalu banyak rujukan dalam satu jam. Coba lagi nanti.';
  end if;
  if exists (select 1 from public.bk_kasus where peserta_didik_id = p_pd and status in ('rujukan','terbuka','pemantauan')) then
    raise exception 'Siswa ini sudah ditangani BK.';
  end if;
  insert into public.bk_kasus (npsn, peserta_didik_id, rombel_id, tahun_ajaran, pemicu, alasan_utama, ringkasan, status, dibuat_oleh, dibuat_nama)
  values (v_pd.npsn, p_pd, private.kes_rombel_pd(p_pd), public.tahun_ajaran_sekarang(), 'rujukan', p_alasan,
          nullif(btrim(coalesce(p_ringkasan, '')), ''), 'rujukan', auth.uid(), public.nama_saya())
  returning id into v_id;
  perform private.kes_audit('bk_kasus', 'rujuk', jsonb_build_object('kasus', v_id));
  return v_id;
end $$;

create or replace function public.bk_kasus_ubah(p_id uuid, p_status text, p_alasan text, p_ringkasan text default null, p_rencana text default null,
                                                p_tinjau date default null, p_hasil text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.bk_kasus%rowtype;
  v_hasil text := nullif(btrim(coalesce(p_hasil, '')), '');
  v_tutup boolean;
begin
  if not private.bk_kelola() then raise exception 'Hanya Guru BK yang mengubah kasus.'; end if;
  select * into v from public.bk_kasus where id = p_id and npsn = private.npsn_saya();
  if not found then raise exception 'Kasus tidak ditemukan.'; end if;
  if p_status not in ('rujukan','terbuka','pemantauan','selesai_bertahan','pindah','putus_sekolah','ditutup') then raise exception 'Status tidak dikenal.'; end if;
  v_tutup := p_status in ('selesai_bertahan','pindah','putus_sekolah','ditutup');
  if v_tutup and v_hasil is null then raise exception 'Isi hasil penanganan sebelum menutup kasus.'; end if;
  if p_status = 'rujukan' and v.status <> 'rujukan' then raise exception 'Kasus yang sudah diterima tidak kembali ke rujukan.'; end if;
  update public.bk_kasus set
    status = p_status, alasan_utama = p_alasan,
    ringkasan = nullif(btrim(coalesce(p_ringkasan, '')), ''), rencana = nullif(btrim(coalesce(p_rencana, '')), ''),
    tinjau_tanggal = case when v_tutup then null else p_tinjau end,
    hasil = case when v_tutup then v_hasil else hasil end,
    ditutup_pada = case when v_tutup then coalesce(ditutup_pada, now()) else null end,
    diperbarui_pada = now()
   where id = p_id;
  perform private.kes_audit('bk_kasus', 'ubah', jsonb_build_object('kasus', p_id, 'status', p_status));
end $$;

-- Rincian kasus: kasus, catatan, dan konteks (sinyal risiko, poin, beasiswa). Pembukaan masuk audit.
create or replace function public.bk_kasus_detail(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.bk_kasus%rowtype;
  v_pd public.peserta_didik%rowtype;
  v_ta text := public.tahun_ajaran_sekarang();
  v_risiko jsonb := null;
begin
  if not private.bk_baca() then raise exception 'Anda tidak berwenang membuka data BK.'; end if;
  select * into v from public.bk_kasus where id = p_id and npsn = private.npsn_saya();
  if not found then raise exception 'Kasus tidak ditemukan.'; end if;
  select * into v_pd from public.peserta_didik where id = v.peserta_didik_id;
  if private.kes_semua(array['kesiswaan.pantau']) and v_pd.nisn is not null then
    select b into v_risiko from jsonb_array_elements(public.risiko_daftar(null, null, v_pd.nisn, 5, 0, true)->'baris') b
     where (b->>'pd')::uuid = v.peserta_didik_id limit 1;
  end if;
  perform private.kes_audit('bk_kasus', 'baca', jsonb_build_object('kasus', p_id));
  return jsonb_build_object(
    'kasus', to_jsonb(v) - 'npsn',
    'kelola', private.bk_kelola(),
    'siswa', jsonb_build_object('pd', v_pd.id, 'nama', v_pd.nama, 'nisn', v_pd.nisn, 'rombel', private.kes_rombel_nama(v_pd.id)),
    'risiko', v_risiko,
    'poin', (select coalesce(sum(poin), 0)::int from public.pelanggaran_siswa where peserta_didik_id = v.peserta_didik_id and status = 'terverifikasi' and not dihapus and tahun_ajaran = v_ta),
    'beasiswa', (select coalesce(jsonb_agg(jsonb_build_object('program', p.nama, 'status', b.status)), '[]'::jsonb)
                   from public.beasiswa_siswa b join public.beasiswa_program p on p.id = b.program_id where b.peserta_didik_id = v.peserta_didik_id),
    'catatan', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'tanggal', c.tanggal, 'jenis', c.jenis, 'bidang', c.bidang, 'uraian', c.uraian, 'tindak_lanjut', c.tindak_lanjut,
        'oleh', c.dibuat_nama, 'milik_saya', (c.dibuat_oleh = auth.uid())) order by c.tanggal desc, c.dibuat_pada desc), '[]'::jsonb)
        from public.bk_catatan c where c.kasus_id = p_id and not c.dihapus));
end $$;

-- ---------------------------------------------------------------- catatan konseling
create or replace function public.bk_catatan_simpan(p_id uuid, p_pd uuid, p_kasus uuid, p_tanggal date, p_jenis text, p_bidang text,
                                                    p_uraian text, p_tindak_lanjut text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_hari date := private.kes_hari();
  v_pd public.peserta_didik%rowtype;
  v_c public.bk_catatan%rowtype;
  v_id uuid;
begin
  if not private.bk_kelola() then raise exception 'Hanya Guru BK yang mencatat konseling.'; end if;
  if p_tanggal is null or p_tanggal > v_hari or p_tanggal < v_hari - 365 then raise exception 'Tanggal tidak valid.'; end if;
  if p_id is not null then
    select * into v_c from public.bk_catatan where id = p_id and not dihapus and npsn = private.npsn_saya();
    if not found then raise exception 'Catatan tidak ditemukan.'; end if;
    if v_c.dibuat_oleh is distinct from auth.uid() and not private.adalah_super() then raise exception 'Catatan hanya dapat diubah penulisnya.'; end if;
    update public.bk_catatan set tanggal = p_tanggal, jenis = p_jenis, bidang = p_bidang, uraian = btrim(p_uraian),
           tindak_lanjut = nullif(btrim(coalesce(p_tindak_lanjut, '')), ''), diperbarui_pada = now()
     where id = p_id;
    perform private.kes_audit('bk_catatan', 'ubah', jsonb_build_object('catatan', p_id));
    return p_id;
  end if;
  select * into v_pd from public.peserta_didik where id = p_pd;
  if not found or v_pd.npsn <> private.npsn_saya() then raise exception 'Siswa tidak ditemukan.'; end if;
  if p_kasus is not null and not exists (select 1 from public.bk_kasus where id = p_kasus and peserta_didik_id = p_pd) then
    raise exception 'Kasus tidak cocok dengan siswa.';
  end if;
  if (select count(*) from public.bk_catatan where dibuat_oleh = auth.uid() and dibuat_pada > now() - interval '1 hour') >= 60 then
    raise exception 'Terlalu banyak catatan dalam satu jam. Coba lagi nanti.';
  end if;
  insert into public.bk_catatan (npsn, peserta_didik_id, kasus_id, tanggal, jenis, bidang, uraian, tindak_lanjut, dibuat_oleh, dibuat_nama)
  values (v_pd.npsn, p_pd, p_kasus, p_tanggal, p_jenis, p_bidang, btrim(p_uraian), nullif(btrim(coalesce(p_tindak_lanjut, '')), ''), auth.uid(), public.nama_saya())
  returning id into v_id;
  perform private.kes_audit('bk_catatan', 'tambah', jsonb_build_object('catatan', v_id));
  return v_id;
end $$;

create or replace function public.bk_catatan_hapus(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.bk_catatan%rowtype;
begin
  if not private.bk_kelola() then raise exception 'Hanya Guru BK yang menghapus catatan.'; end if;
  select * into v from public.bk_catatan where id = p_id and not dihapus and npsn = private.npsn_saya();
  if not found then raise exception 'Catatan tidak ditemukan.'; end if;
  if v.dibuat_oleh is distinct from auth.uid() and not private.adalah_super() then raise exception 'Catatan hanya dapat dihapus penulisnya.'; end if;
  update public.bk_catatan set dihapus = true, diperbarui_pada = now() where id = p_id;
  perform private.kes_audit('bk_catatan', 'hapus', jsonb_build_object('catatan', p_id));
end $$;

-- Riwayat BK satu siswa (semua kasus dan catatan). Untuk membuka dari halaman lain, masuk audit.
create or replace function public.bk_siswa_riwayat(p_pd uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.bk_baca() then raise exception 'Anda tidak berwenang membuka data BK.'; end if;
  if not exists (select 1 from public.peserta_didik where id = p_pd and npsn = private.npsn_saya()) then raise exception 'Siswa tidak ditemukan.'; end if;
  perform private.kes_audit('bk_catatan', 'baca_riwayat', jsonb_build_object('pd', p_pd));
  return jsonb_build_object(
    'kasus', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'status', k.status, 'alasan_utama', k.alasan_utama, 'dibuat_pada', k.dibuat_pada, 'ditutup_pada', k.ditutup_pada) order by k.dibuat_pada desc), '[]'::jsonb)
                from public.bk_kasus k where k.peserta_didik_id = p_pd),
    'catatan', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kasus_id', c.kasus_id, 'tanggal', c.tanggal, 'jenis', c.jenis, 'bidang', c.bidang, 'uraian', c.uraian, 'tindak_lanjut', c.tindak_lanjut, 'oleh', c.dibuat_nama) order by c.tanggal desc), '[]'::jsonb)
                from public.bk_catatan c where c.peserta_didik_id = p_pd and not c.dihapus));
end $$;

-- ---------------------------------------------------------------- hak eksekusi
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (array[
       'bk_izin','kesiswaan_izin','bk_beranda','bk_berisiko','bk_kasus_daftar','bk_kasus_buka','bk_rujuk','bk_kasus_ubah',
       'bk_kasus_detail','bk_catatan_simpan','bk_catatan_hapus','bk_siswa_riwayat'])
  loop
    execute format('revoke all on function %s from public, anon', r.f);
    execute format('grant execute on function %s to authenticated', r.f);
  end loop;
end $$;
