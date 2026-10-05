-- Modul Hubungan Industri dan Humas, bagian B: kerjasama mitra industri dan tracer study alumni.

-- ---------------------------------------------------------------- kerjasama
-- Tabel dudi dan mou_kerjasama sudah berisi data Dapodik dan sudah punya kebijakan hubin_kelola.
-- Kolom baru tidak ada di berkas unduhan Dapodik, jadi unggahan ulang tidak menimpanya.
alter table public.dudi
  add column if not exists tampil_publik boolean not null default true,
  add column if not exists catatan text check (catatan is null or char_length(catatan) <= 1000),
  add column if not exists diarsipkan boolean not null default false;
alter table public.mou_kerjasama
  add column if not exists catatan text check (catatan is null or char_length(catatan) <= 1000),
  add column if not exists berkas_url text check (berkas_url is null or berkas_url ~* '^https://'),
  add column if not exists diarsipkan boolean not null default false;

-- Ringkasan kemitraan untuk situs publik. Tanpa kontak, NPWP, atau nomor MoU.
create or replace function public.kerjasama_publik() returns jsonb
language sql stable security definer set search_path = '' as $$
  with hari as (select (now() at time zone 'Asia/Jakarta')::date as ini),
  d as (select * from public.dudi where tampil_publik and not diarsipkan),
  m as (select mk.* from public.mou_kerjasama mk join d on d.id = mk.dudi_id where not mk.diarsipkan)
  select jsonb_build_object(
    'jumlah_mitra', (select count(*) from d),
    'jumlah_mou', (select count(*) from m),
    'mou_berlaku', (select count(*) from m, hari where m.tgl_selesai >= hari.ini),
    'sejak_tahun', (select min(extract(year from tgl_mulai))::int from m),
    'jenis', (select coalesce(jsonb_agg(jsonb_build_object('jenis', x.jenis_kerjasama, 'jumlah', x.n) order by x.n desc), '[]'::jsonb)
                from (select jenis_kerjasama, count(*) n from m where coalesce(jenis_kerjasama, '') <> '' group by jenis_kerjasama) x),
    'mitra', (select coalesce(jsonb_agg(jsonb_build_object(
                'nama', d2.nama,
                'bidang_usaha', nullif(d2.bidang_usaha, ''),
                'wilayah', nullif(d2.kecamatan_kabupaten, ''),
                'jenis', (select coalesce(jsonb_agg(distinct m2.jenis_kerjasama), '[]'::jsonb) from m m2 where m2.dudi_id = d2.id and coalesce(m2.jenis_kerjasama, '') <> ''),
                'sejak', (select min(extract(year from m3.tgl_mulai))::int from m m3 where m3.dudi_id = d2.id),
                'berlaku', exists (select 1 from m m4, hari where m4.dudi_id = d2.id and m4.tgl_selesai >= hari.ini)
              ) order by d2.nama), '[]'::jsonb) from d d2)
  )
$$;
revoke all on function public.kerjasama_publik() from public;
grant execute on function public.kerjasama_publik() to anon, authenticated;

-- ---------------------------------------------------------------- tracer study
create table if not exists public.tracer_alumni (
  peserta_didik_id uuid primary key references public.peserta_didik (id),
  npsn text not null references public.sekolah (npsn),
  status_utama text not null check (status_utama in ('bekerja','wirausaha','kuliah','bekerja_kuliah','mencari_kerja','belum_bekerja','lainnya')),
  kompetensi text check (char_length(kompetensi) <= 120),
  instansi text check (char_length(instansi) <= 150),
  bidang_instansi text check (char_length(bidang_instansi) <= 100),
  jabatan text check (char_length(jabatan) <= 100),
  kota text check (char_length(kota) <= 100),
  tahun_mulai int check (tahun_mulai between 2000 and 2100),
  waktu_tunggu_bulan int check (waktu_tunggu_bulan between 0 and 120),
  kesesuaian text check (kesesuaian in ('sangat_sesuai','sesuai','kurang_sesuai','tidak_sesuai')),
  penghasilan text check (penghasilan in ('dibawah_1jt','1_2_5jt','2_5_5jt','5_8jt','diatas_8jt')),
  perguruan_tinggi text check (char_length(perguruan_tinggi) <= 150),
  program_studi text check (char_length(program_studi) <= 150),
  saran text check (char_length(saran) <= 1000),
  bersedia_dihubungi boolean not null default false,
  hp text check (hp is null or hp ~ '^[0-9+ -]{8,20}$'),
  sumber text not null default 'mandiri' check (sumber in ('mandiri','petugas')),
  dicatat_oleh uuid,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);
alter table public.tracer_alumni enable row level security;
create index if not exists tracer_alumni_status_idx on public.tracer_alumni (status_utama);

create or replace function private.boleh_tracer() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (private.punya_izin('hubin.tracer', null) or private.peran_saya() = 'admin_tu')
$$;
create or replace function private.boleh_lihat_tracer() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.boleh_tracer() or (auth.uid() is not null and private.punya_izin('laporan.lihat', null))
$$;

-- Verifikasi alumni (NISN + tanggal lahir) memakai pencatatan percobaan yang sama dengan cek_data_alumni.
create or replace function private.verifikasi_alumni(p_nisn text, p_lahir date, out p_id uuid, out p_dibatasi boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_nisn text := btrim(coalesce(p_nisn, ''));
  v_hdr jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip text := coalesce(nullif(btrim(split_part(coalesce(v_hdr ->> 'x-forwarded-for', ''), ',', 1)), ''), 'tidak-diketahui');
  v_n_ip int;
  v_n_nisn int;
  v_jml int;
begin
  p_id := null;
  p_dibatasi := false;
  select count(*) into v_n_ip from private.percobaan_alumni where ip = v_ip and not berhasil and waktu > now() - interval '1 hour';
  select count(*) into v_n_nisn from private.percobaan_alumni where nisn = v_nisn and not berhasil and waktu > now() - interval '1 hour';
  if v_n_ip >= 20 or v_n_nisn >= 10 then
    p_dibatasi := true;
    return;
  end if;
  if v_nisn !~ '^\d{10}$' or p_lahir is null then
    insert into private.percobaan_alumni (nisn, ip, berhasil) values (left(v_nisn, 20), v_ip, false);
    return;
  end if;
  select count(*) into v_jml from public.peserta_didik
   where nisn = v_nisn and tanggal_lahir = p_lahir and status_peserta_didik = 'lulus';
  if v_jml <> 1 then
    insert into private.percobaan_alumni (nisn, ip, berhasil) values (v_nisn, v_ip, false);
    return;
  end if;
  select id into p_id from public.peserta_didik
   where nisn = v_nisn and tanggal_lahir = p_lahir and status_peserta_didik = 'lulus';
  insert into private.percobaan_alumni (nisn, ip, berhasil) values (v_nisn, v_ip, true);
end $$;

create or replace function private.tracer_tulis(p_pd uuid, p_data jsonb, p_sumber text, p_oleh uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_npsn text;
begin
  select npsn into v_npsn from public.peserta_didik where id = p_pd;
  insert into public.tracer_alumni (
    peserta_didik_id, npsn, status_utama, kompetensi, instansi, bidang_instansi, jabatan, kota, tahun_mulai,
    waktu_tunggu_bulan, kesesuaian, penghasilan, perguruan_tinggi, program_studi, saran, bersedia_dihubungi, hp, sumber, dicatat_oleh)
  values (
    p_pd, v_npsn, p_data ->> 'status_utama', nullif(btrim(p_data ->> 'kompetensi'), ''), nullif(btrim(p_data ->> 'instansi'), ''),
    nullif(btrim(p_data ->> 'bidang_instansi'), ''), nullif(btrim(p_data ->> 'jabatan'), ''), nullif(btrim(p_data ->> 'kota'), ''),
    nullif(p_data ->> 'tahun_mulai', '')::int, nullif(p_data ->> 'waktu_tunggu_bulan', '')::int,
    nullif(p_data ->> 'kesesuaian', ''), nullif(p_data ->> 'penghasilan', ''),
    nullif(btrim(p_data ->> 'perguruan_tinggi'), ''), nullif(btrim(p_data ->> 'program_studi'), ''), nullif(btrim(p_data ->> 'saran'), ''),
    coalesce((p_data ->> 'bersedia_dihubungi')::boolean, false), nullif(btrim(p_data ->> 'hp'), ''), p_sumber, p_oleh)
  on conflict (peserta_didik_id) do update set
    status_utama = excluded.status_utama, kompetensi = excluded.kompetensi, instansi = excluded.instansi,
    bidang_instansi = excluded.bidang_instansi, jabatan = excluded.jabatan, kota = excluded.kota,
    tahun_mulai = excluded.tahun_mulai, waktu_tunggu_bulan = excluded.waktu_tunggu_bulan, kesesuaian = excluded.kesesuaian,
    penghasilan = excluded.penghasilan, perguruan_tinggi = excluded.perguruan_tinggi, program_studi = excluded.program_studi,
    saran = excluded.saran, bersedia_dihubungi = excluded.bersedia_dihubungi, hp = excluded.hp,
    sumber = excluded.sumber, dicatat_oleh = excluded.dicatat_oleh, diperbarui_pada = now();
exception
  when check_violation or invalid_text_representation or numeric_value_out_of_range or not_null_violation then
    raise exception 'Isian belum valid. Periksa kembali status, tahun, dan nomor HP.';
end $$;

-- Alumni mengecek jawaban sebelumnya. Jawaban gagal seragam supaya keberadaan data tidak bisa ditebak.
create or replace function public.tracer_cek(p_nisn text, p_tanggal_lahir date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v record;
  t record;
  p record;
begin
  select * into v from private.verifikasi_alumni(p_nisn, p_tanggal_lahir);
  if v.p_dibatasi then return jsonb_build_object('ditemukan', false, 'dibatasi', true); end if;
  if v.p_id is null then return jsonb_build_object('ditemukan', false); end if;
  select nama, extract(year from tanggal_keluar)::int as tahun into p from public.peserta_didik where id = v.p_id;
  select * into t from public.tracer_alumni where peserta_didik_id = v.p_id;
  return jsonb_build_object(
    'ditemukan', true, 'nama', p.nama, 'tahun_lulus', p.tahun,
    'jawaban', case when t.peserta_didik_id is null then null
                    else to_jsonb(t) - array['npsn','dicatat_oleh','peserta_didik_id','sumber'] end);
end $$;

create or replace function public.tracer_simpan_mandiri(p_nisn text, p_tanggal_lahir date, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  select * into v from private.verifikasi_alumni(p_nisn, p_tanggal_lahir);
  if v.p_dibatasi then return jsonb_build_object('tersimpan', false, 'dibatasi', true); end if;
  if v.p_id is null then return jsonb_build_object('tersimpan', false); end if;
  perform private.tracer_tulis(v.p_id, p_data, 'mandiri', null);
  return jsonb_build_object('tersimpan', true);
end $$;
revoke all on function public.tracer_cek(text, date) from public;
revoke all on function public.tracer_simpan_mandiri(text, date, jsonb) from public;
grant execute on function public.tracer_cek(text, date) to anon, authenticated;
grant execute on function public.tracer_simpan_mandiri(text, date, jsonb) to anon, authenticated;

-- Petugas mengisi atas nama alumni (hasil telepon, WhatsApp, atau kunjungan).
create or replace function public.tracer_simpan_petugas(p_peserta_didik_id uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.boleh_tracer() then raise exception 'Anda tidak berwenang mengelola tracer study.'; end if;
  if not exists (select 1 from public.peserta_didik where id = p_peserta_didik_id and status_peserta_didik = 'lulus' and npsn = private.npsn_saya()) then
    raise exception 'Alumni tidak ditemukan.';
  end if;
  perform private.tracer_tulis(p_peserta_didik_id, p_data, 'petugas', auth.uid());
end $$;

-- Daftar alumni beserta status pengisian. Memuat HP dari Dapodik untuk menghubungi yang belum mengisi.
create or replace function public.tracer_daftar(p_tahun int default null, p_status text default 'semua', p_cari text default null, p_batas int default 100, p_mulai int default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_batas int := least(greatest(coalesce(p_batas, 100), 1), 5000);
begin
  if not private.boleh_tracer() then raise exception 'Anda tidak berwenang mengelola tracer study.'; end if;
  return (
    with dasar as (
      select pd.id, pd.nama, pd.nisn, extract(year from pd.tanggal_keluar)::int as tahun_lulus,
             coalesce(t.hp, nullif(pd.hp, '')) as hp, (t.peserta_didik_id is not null) as sudah,
             t.status_utama, t.kompetensi, t.instansi, t.sumber, t.diperbarui_pada
        from public.peserta_didik pd
        left join public.tracer_alumni t on t.peserta_didik_id = pd.id
       where pd.status_peserta_didik = 'lulus' and pd.npsn = private.npsn_saya()
         and (p_tahun is null or extract(year from pd.tanggal_keluar)::int = p_tahun)
         and (p_cari is null or btrim(p_cari) = '' or pd.nama ilike '%' || btrim(p_cari) || '%' or pd.nisn = btrim(p_cari))
         and (coalesce(p_status, 'semua') = 'semua'
              or (p_status = 'sudah' and t.peserta_didik_id is not null)
              or (p_status = 'belum' and t.peserta_didik_id is null))
    )
    select jsonb_build_object(
      'total', (select count(*) from dasar),
      'baris', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
                  select * from dasar order by tahun_lulus desc nulls last, nama offset greatest(coalesce(p_mulai, 0), 0) limit v_batas) x))
  );
end $$;

-- Rekap tracer study untuk Waka Hubinmas dan pimpinan.
create or replace function public.tracer_rekap(p_dari int default null, p_sampai int default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.boleh_lihat_tracer() then raise exception 'Anda tidak berwenang melihat tracer study.'; end if;
  return (
    with a as (
      select pd.id, extract(year from pd.tanggal_keluar)::int as tahun
        from public.peserta_didik pd
       where pd.status_peserta_didik = 'lulus' and pd.npsn = private.npsn_saya()
         and (p_dari is null or extract(year from pd.tanggal_keluar)::int >= p_dari)
         and (p_sampai is null or extract(year from pd.tanggal_keluar)::int <= p_sampai)
    ),
    r as (select t.*, a.tahun from public.tracer_alumni t join a on a.id = t.peserta_didik_id),
    kerja as (select * from r where status_utama in ('bekerja','wirausaha','bekerja_kuliah'))
    select jsonb_build_object(
      'alumni', (select count(*) from a),
      'responden', (select count(*) from r),
      'per_tahun', (select coalesce(jsonb_agg(jsonb_build_object('tahun', x.tahun, 'alumni', x.n, 'responden', coalesce(y.n, 0)) order by x.tahun), '[]'::jsonb)
                      from (select tahun, count(*) n from a where tahun is not null group by tahun) x
                      left join (select tahun, count(*) n from r where tahun is not null group by tahun) y on y.tahun = x.tahun),
      'status', (select coalesce(jsonb_agg(jsonb_build_object('kode', status_utama, 'jumlah', n) order by n desc), '[]'::jsonb)
                   from (select status_utama, count(*) n from r group by status_utama) s),
      'kesesuaian', (select coalesce(jsonb_agg(jsonb_build_object('kode', kesesuaian, 'jumlah', n) order by n desc), '[]'::jsonb)
                       from (select kesesuaian, count(*) n from kerja where kesesuaian is not null group by kesesuaian) s),
      'penghasilan', (select coalesce(jsonb_agg(jsonb_build_object('kode', penghasilan, 'jumlah', n)), '[]'::jsonb)
                        from (select penghasilan, count(*) n from kerja where penghasilan is not null group by penghasilan) s),
      'waktu_tunggu', (select jsonb_build_object('jumlah', count(*), 'rata', round(avg(waktu_tunggu_bulan)::numeric, 1),
                         'median', percentile_cont(0.5) within group (order by waktu_tunggu_bulan))
                         from r where waktu_tunggu_bulan is not null),
      'per_kompetensi', (select coalesce(jsonb_agg(jsonb_build_object('kompetensi', k.kompetensi, 'total', k.total, 'status', k.st) order by k.total desc), '[]'::jsonb)
                           from (select kompetensi, sum(n)::int as total, jsonb_object_agg(status_utama, n) as st
                                   from (select coalesce(kompetensi, 'Tidak diisi') as kompetensi, status_utama, count(*) n from r group by 1, 2) q
                                  group by kompetensi) k),
      'instansi_teratas', (select coalesce(jsonb_agg(jsonb_build_object('instansi', i.nama, 'jumlah', i.n) order by i.n desc, i.nama), '[]'::jsonb)
                             from (select min(instansi) as nama, count(*) n from kerja where coalesce(btrim(instansi), '') <> ''
                                    group by lower(btrim(instansi)) order by count(*) desc, min(instansi) limit 15) i),
      'saran_terisi', (select count(*) from r where coalesce(btrim(saran), '') <> ''),
      'saran', (select coalesce(jsonb_agg(jsonb_build_object('saran', z.saran, 'tahun_lulus', z.tahun, 'kompetensi', z.kompetensi)), '[]'::jsonb)
                  from (select saran, tahun, kompetensi from r where coalesce(btrim(saran), '') <> '' order by diperbarui_pada desc limit 30) z)
    )
  );
end $$;

revoke all on function public.tracer_simpan_petugas(uuid, jsonb) from public, anon;
revoke all on function public.tracer_daftar(int, text, text, int, int) from public, anon;
revoke all on function public.tracer_rekap(int, int) from public, anon;
grant execute on function public.tracer_simpan_petugas(uuid, jsonb) to authenticated;
grant execute on function public.tracer_daftar(int, text, text, int, int) to authenticated;
grant execute on function public.tracer_rekap(int, int) to authenticated;
