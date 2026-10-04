-- Buku tamu: pengunjung sekolah dicatat petugas (satpam, guru piket, TU) atau mengisi sendiri lewat tautan gerbang.
-- Tabel tanpa policy; semua akses lewat fungsi. Isian mandiri (anon) wajib membawa kode gerbang dan dibatasi lajunya.

create table if not exists public.tamu_pengaturan (
  npsn text primary key references public.sekolah(npsn),
  kode_gerbang text not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  diganti_pada timestamptz not null default now()
);

create table if not exists public.tamu_kunjungan (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah(npsn),
  tanggal date not null default ((now() at time zone 'Asia/Jakarta')::date),
  urut int not null,
  nama text not null,
  asal text not null,
  kategori text not null check (kategori in ('orang_tua','dinas','mitra_industri','alumni','vendor','calon_siswa','lainnya')),
  tujuan text not null check (tujuan in ('bertemu_pimpinan','bertemu_guru','urusan_administrasi','jemput_siswa','kerja_sama','antar_barang','kunjungan_dinas','lainnya')),
  keperluan text,
  bertemu text,
  jumlah int not null default 1 check (jumlah between 1 and 200),
  telepon text,
  sumber text not null check (sumber in ('mandiri','petugas')),
  dicatat_oleh uuid,
  dicatat_nama text,
  jam_datang timestamptz not null default now(),
  jam_pulang timestamptz,
  pulang_dicatat_oleh uuid,
  unique (npsn, tanggal, urut)
);
create index if not exists tamu_kunjungan_tgl_idx on public.tamu_kunjungan (npsn, tanggal desc, jam_datang desc);
create index if not exists tamu_kunjungan_dalam_idx on public.tamu_kunjungan (npsn, tanggal) where jam_pulang is null;

create table if not exists public.tamu_nomor (
  npsn text not null, tanggal date not null, terakhir int not null default 0, primary key (npsn, tanggal)
);

alter table public.tamu_pengaturan enable row level security;
alter table public.tamu_kunjungan enable row level security;
alter table public.tamu_nomor enable row level security;

-- Izin dan jabatan.
insert into public.izin (kode, nama, bidang) values
 ('tamu.catat', 'Mencatat tamu dan jam pulang, melihat tamu hari ini', 'Keamanan dan tamu'),
 ('tamu.baca_semua', 'Melihat riwayat, rekap, dan kode gerbang buku tamu', 'Keamanan dan tamu')
on conflict (kode) do nothing;
insert into public.jabatan (kode, nama, kelompok, lingkup, induk_kode, urutan, tampil_publik, satu_pemegang, bagan) values
 ('satpam', 'Satpam', 'Sarpras', 'sekolah', 'waka_sarpras', 32, false, false, false)
on conflict (kode) do nothing;
insert into public.jabatan_izin (jabatan_kode, izin_kode) values
 ('satpam','tamu.catat'), ('guru_piket','tamu.catat'),
 ('kepala_sekolah','tamu.baca_semua'), ('kepala_tu','tamu.baca_semua'),
 ('waka_kesiswaan','tamu.baca_semua'), ('waka_sarpras','tamu.baca_semua'), ('waka_hubin','tamu.baca_semua')
on conflict do nothing;

-- Sekolah tunggal: npsn untuk jalur publik.
create or replace function private.npsn_tamu_publik() returns text
language sql stable security definer set search_path = '' as $$
  select npsn from public.sekolah order by npsn limit 1
$$;

create or replace function private.tamu_simpan(
  p_npsn text, p_sumber text, p_nama text, p_asal text, p_kategori text, p_tujuan text, p_keperluan text,
  p_bertemu text, p_jumlah int, p_telepon text, p_oleh uuid, p_oleh_nama text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_tgl date := (now() at time zone 'Asia/Jakarta')::date; v_n int; v_id uuid; v_hp text := nullif(regexp_replace(coalesce(p_telepon,''), '[^0-9+]', '', 'g'), '');
begin
  if length(btrim(coalesce(p_nama,''))) < 2 or length(p_nama) > 120 then raise exception 'Nama wajib diisi (2 sampai 120 karakter).'; end if;
  if length(btrim(coalesce(p_asal,''))) < 2 or length(p_asal) > 200 then raise exception 'Asal instansi atau alamat wajib diisi.'; end if;
  if length(coalesce(p_keperluan,'')) > 500 or length(coalesce(p_bertemu,'')) > 150 then raise exception 'Isian terlalu panjang.'; end if;
  if v_hp is not null and v_hp !~ '^\+?[0-9]{8,15}$' then raise exception 'Nomor telepon tidak valid.'; end if;
  if coalesce(p_jumlah,1) not between 1 and 200 then raise exception 'Jumlah tamu 1 sampai 200.'; end if;
  insert into public.tamu_nomor (npsn, tanggal, terakhir) values (p_npsn, v_tgl, 1)
    on conflict (npsn, tanggal) do update set terakhir = public.tamu_nomor.terakhir + 1 returning terakhir into v_n;
  insert into public.tamu_kunjungan (npsn, tanggal, urut, nama, asal, kategori, tujuan, keperluan, bertemu, jumlah, telepon, sumber, dicatat_oleh, dicatat_nama)
  values (p_npsn, v_tgl, v_n, btrim(p_nama), btrim(p_asal), p_kategori, p_tujuan, nullif(btrim(coalesce(p_keperluan,'')),''),
          nullif(btrim(coalesce(p_bertemu,'')),''), coalesce(p_jumlah,1), v_hp, p_sumber, p_oleh, p_oleh_nama)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'urut', v_n, 'nama', btrim(p_nama));
end $$;

-- Isian mandiri tanpa login. Penjaga: kode gerbang, kolom jebakan, dan batas laju (20 isian per 10 menit untuk seluruh sekolah).
create or replace function public.tamu_isi_mandiri(
  p_kode text, p_nama text, p_asal text, p_kategori text, p_tujuan text, p_keperluan text default null,
  p_bertemu text default null, p_jumlah int default 1, p_telepon text default null, p_jebakan text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_npsn text := private.npsn_tamu_publik();
begin
  if coalesce(p_jebakan,'') <> '' then return jsonb_build_object('urut', 0, 'nama', coalesce(p_nama,'')); end if;
  if not exists (select 1 from public.tamu_pengaturan where npsn = v_npsn and kode_gerbang = btrim(coalesce(p_kode,''))) then
    raise exception 'Tautan buku tamu tidak berlaku. Pindai kode QR di pos jaga atau minta bantuan petugas.';
  end if;
  if (select count(*) from public.tamu_kunjungan where npsn = v_npsn and sumber = 'mandiri' and jam_datang > now() - interval '10 minutes') >= 20 then
    raise exception 'Terlalu banyak isian dalam waktu singkat. Silakan minta bantuan petugas.';
  end if;
  if p_kategori not in ('orang_tua','dinas','mitra_industri','alumni','vendor','calon_siswa','lainnya') then raise exception 'Kategori tidak valid.'; end if;
  if p_tujuan not in ('bertemu_pimpinan','bertemu_guru','urusan_administrasi','jemput_siswa','kerja_sama','antar_barang','kunjungan_dinas','lainnya') then raise exception 'Tujuan tidak valid.'; end if;
  return private.tamu_simpan(v_npsn, 'mandiri', p_nama, p_asal, p_kategori, p_tujuan, p_keperluan, p_bertemu, p_jumlah, p_telepon, null, null);
end $$;

-- Pengecekan kode untuk halaman publik (tanpa membuka data apa pun).
create or replace function public.tamu_kode_valid(p_kode text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tamu_pengaturan where npsn = private.npsn_tamu_publik() and kode_gerbang = btrim(coalesce(p_kode,'')))
$$;

create or replace function public.tamu_catat(
  p_nama text, p_asal text, p_kategori text, p_tujuan text, p_keperluan text default null,
  p_bertemu text default null, p_jumlah int default 1, p_telepon text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_nama text;
begin
  if not private.punya_izin('tamu.catat') then raise exception 'Anda tidak berwenang mencatat tamu.'; end if;
  if p_kategori not in ('orang_tua','dinas','mitra_industri','alumni','vendor','calon_siswa','lainnya') then raise exception 'Kategori tidak valid.'; end if;
  if p_tujuan not in ('bertemu_pimpinan','bertemu_guru','urusan_administrasi','jemput_siswa','kerja_sama','antar_barang','kunjungan_dinas','lainnya') then raise exception 'Tujuan tidak valid.'; end if;
  select coalesce((select nama from public.ptk where id = private.ptk_id_saya()), (select nama_lengkap from public.profil_admin where user_id = (select auth.uid())), 'Petugas') into v_nama;
  return private.tamu_simpan(private.npsn_saya(), 'petugas', p_nama, p_asal, p_kategori, p_tujuan, p_keperluan, p_bertemu, p_jumlah, p_telepon, (select auth.uid()), v_nama);
end $$;

create or replace function public.tamu_pulang(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.punya_izin('tamu.catat') then raise exception 'Anda tidak berwenang.'; end if;
  update public.tamu_kunjungan set jam_pulang = now(), pulang_dicatat_oleh = (select auth.uid())
   where id = p_id and npsn = private.npsn_saya() and jam_pulang is null
     and (tanggal = (now() at time zone 'Asia/Jakarta')::date or private.punya_izin('tamu.baca_semua'));
  if not found then raise exception 'Kunjungan tidak ditemukan atau sudah dicatat pulang.'; end if;
end $$;

-- Petugas tanpa izin baca_semua hanya melihat tamu hari ini.
create or replace function public.tamu_daftar(
  p_dari date default null, p_sampai date default null, p_cari text default null, p_status text default null, p_hal int default 1, p_ukuran int default 10
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_hari date := (now() at time zone 'Asia/Jakarta')::date;
  v_semua boolean := private.punya_izin('tamu.baca_semua');
  v_dari date; v_sampai date; v_k text := nullif(btrim(coalesce(p_cari,'')),'');
  v_ukuran int := least(greatest(coalesce(p_ukuran,10),1),1000); v_hal int := greatest(coalesce(p_hal,1),1); v_total int; v_baris jsonb;
begin
  if not (v_semua or private.punya_izin('tamu.catat')) then raise exception 'Anda tidak berwenang melihat buku tamu.'; end if;
  v_dari := case when v_semua then coalesce(p_dari, v_hari) else v_hari end;
  v_sampai := case when v_semua then coalesce(p_sampai, v_hari) else v_hari end;
  select count(*) into v_total from public.tamu_kunjungan t
   where t.npsn = private.npsn_saya() and t.tanggal between v_dari and v_sampai
     and (p_status is null or (p_status = 'di_sekolah' and t.jam_pulang is null) or (p_status = 'pulang' and t.jam_pulang is not null))
     and (v_k is null or t.nama ilike '%'||v_k||'%' or t.asal ilike '%'||v_k||'%' or coalesce(t.bertemu,'') ilike '%'||v_k||'%' or coalesce(t.keperluan,'') ilike '%'||v_k||'%');
  select coalesce(jsonb_agg(to_jsonb(x) order by x.jam_datang desc), '[]'::jsonb) into v_baris from (
    select t.id, t.tanggal, t.urut, t.nama, t.asal, t.kategori, t.tujuan, t.keperluan, t.bertemu, t.jumlah, t.telepon, t.sumber, t.dicatat_nama, t.jam_datang, t.jam_pulang
      from public.tamu_kunjungan t
     where t.npsn = private.npsn_saya() and t.tanggal between v_dari and v_sampai
       and (p_status is null or (p_status = 'di_sekolah' and t.jam_pulang is null) or (p_status = 'pulang' and t.jam_pulang is not null))
       and (v_k is null or t.nama ilike '%'||v_k||'%' or t.asal ilike '%'||v_k||'%' or coalesce(t.bertemu,'') ilike '%'||v_k||'%' or coalesce(t.keperluan,'') ilike '%'||v_k||'%')
     order by t.jam_datang desc offset (v_hal-1)*v_ukuran limit v_ukuran) x;
  return jsonb_build_object('total', v_total, 'baris', v_baris, 'dari', v_dari, 'sampai', v_sampai);
end $$;

-- Rekap: asal tamu dan tujuan kunjungan.
create or replace function public.tamu_rekap(p_dari date, p_sampai date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_npsn text := private.npsn_saya();
begin
  if not private.punya_izin('tamu.baca_semua') then raise exception 'Anda tidak berwenang melihat rekap.'; end if;
  if p_dari is null or p_sampai is null or p_sampai < p_dari or p_sampai - p_dari > 400 then raise exception 'Rentang tanggal tidak valid (maksimal 400 hari).'; end if;
  return jsonb_build_object(
    'kunjungan', (select count(*) from public.tamu_kunjungan where npsn = v_npsn and tanggal between p_dari and p_sampai),
    'orang', (select coalesce(sum(jumlah),0) from public.tamu_kunjungan where npsn = v_npsn and tanggal between p_dari and p_sampai),
    'per_kategori', (select coalesce(jsonb_agg(jsonb_build_object('kunci', kategori, 'n', n) order by n desc), '[]'::jsonb)
                       from (select kategori, count(*) n from public.tamu_kunjungan where npsn = v_npsn and tanggal between p_dari and p_sampai group by 1) a),
    'per_tujuan', (select coalesce(jsonb_agg(jsonb_build_object('kunci', tujuan, 'n', n) order by n desc), '[]'::jsonb)
                     from (select tujuan, count(*) n from public.tamu_kunjungan where npsn = v_npsn and tanggal between p_dari and p_sampai group by 1) a),
    'per_asal', (select coalesce(jsonb_agg(jsonb_build_object('kunci', asal, 'n', n) order by n desc), '[]'::jsonb)
                   from (select initcap(lower(btrim(asal))) asal, count(*) n from public.tamu_kunjungan where npsn = v_npsn and tanggal between p_dari and p_sampai group by 1 order by 2 desc limit 15) a),
    'per_hari', (select coalesce(jsonb_agg(jsonb_build_object('kunci', tanggal, 'n', n) order by tanggal), '[]'::jsonb)
                   from (select tanggal, count(*) n from public.tamu_kunjungan where npsn = v_npsn and tanggal between p_dari and p_sampai group by 1) a));
end $$;

create or replace function public.tamu_ringkasan() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'boleh_catat', private.punya_izin('tamu.catat'),
    'boleh_baca', private.punya_izin('tamu.baca_semua'),
    'boleh_kode', private.adalah_super(),
    'di_sekolah', case when private.punya_izin('tamu.catat') or private.punya_izin('tamu.baca_semua')
        then (select count(*) from public.tamu_kunjungan where npsn = private.npsn_saya() and tanggal = (now() at time zone 'Asia/Jakarta')::date and jam_pulang is null) else 0 end,
    'kode_gerbang', case when private.punya_izin('tamu.catat') or private.punya_izin('tamu.baca_semua')
        then (select kode_gerbang from public.tamu_pengaturan where npsn = private.npsn_saya()) end)
$$;

-- Ganti kode gerbang (membatalkan QR lama). Hanya super admin.
create or replace function public.tamu_kode_ganti() returns text
language plpgsql security definer set search_path = '' as $$
declare v text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10); v_npsn text := private.npsn_saya();
begin
  if not private.adalah_super() then raise exception 'Hanya super admin yang dapat mengganti kode gerbang.'; end if;
  insert into public.tamu_pengaturan (npsn, kode_gerbang) values (v_npsn, v)
    on conflict (npsn) do update set kode_gerbang = excluded.kode_gerbang, diganti_pada = now();
  insert into public.audit_log (user_id, tabel, aksi, ringkasan) values ((select auth.uid()), 'tamu_pengaturan', 'GANTI_KODE', '{}'::jsonb);
  return v;
end $$;

insert into public.tamu_pengaturan (npsn) select npsn from public.sekolah on conflict do nothing;

do $do$
declare f text;
begin
  foreach f in array array[
    'public.tamu_catat(text,text,text,text,text,text,int,text)','public.tamu_pulang(uuid)',
    'public.tamu_daftar(date,date,text,text,int,int)','public.tamu_rekap(date,date)','public.tamu_ringkasan()','public.tamu_kode_ganti()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- Jalur publik: hanya dua fungsi ini yang boleh dipanggil tanpa login.
  revoke execute on function public.tamu_isi_mandiri(text,text,text,text,text,text,text,int,text,text) from public;
  grant execute on function public.tamu_isi_mandiri(text,text,text,text,text,text,text,int,text,text) to anon, authenticated;
  revoke execute on function public.tamu_kode_valid(text) from public;
  grant execute on function public.tamu_kode_valid(text) to anon, authenticated;
end $do$;
