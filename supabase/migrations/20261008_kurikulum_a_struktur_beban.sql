-- Kurikulum A: struktur kurikulum, durasi jam pelajaran (satu angka untuk semua hari), beban mengajar, dan linieritas dari Dapodik.
-- Tabel tanpa policy: semua akses lewat fungsi. Membaca: guru, staf, dan admin TU. Menulis: izin kurikulum.struktur (Waka dan Staf Kurikulum) atau super admin.
-- Linieritas dihitung dari data PTK hasil unggah Dapodik (kompetensi, sertifikasi, jurusan/prodi, mengajar). Koreksi manual per guru dan mapel menimpa hitungan otomatis.

insert into public.izin (kode, nama, bidang) values
  ('kurikulum.struktur', 'Mengatur struktur kurikulum dan beban mengajar', 'Kurikulum')
on conflict (kode) do nothing;
insert into public.jabatan_izin (jabatan_kode, izin_kode) values
  ('waka_kurikulum', 'kurikulum.struktur'), ('staf_kurikulum', 'kurikulum.struktur')
on conflict do nothing;

create table if not exists public.kur_pengaturan (
  id boolean primary key default true check (id),
  durasi_jp int not null default 45 check (durasi_jp between 30 and 60),
  jam_wajib int not null default 24 check (jam_wajib between 6 and 40),
  diubah_oleh uuid,
  diubah_pada timestamptz not null default now()
);
insert into public.kur_pengaturan (id) values (true) on conflict do nothing;
alter table public.kur_pengaturan enable row level security;

create table if not exists public.kur_mapel (
  id uuid primary key default gen_random_uuid(),
  nama text not null check (char_length(btrim(nama)) between 3 and 120),
  kelompok text not null default 'umum' check (kelompok in ('umum', 'kejuruan', 'muatan_lokal', 'projek', 'pkl', 'lainnya')),
  bidang_linier text[] not null default '{}',
  aktif boolean not null default true,
  urutan int not null default 100
);
create unique index if not exists kur_mapel_nama_unik on public.kur_mapel (lower(btrim(nama)));
alter table public.kur_mapel enable row level security;

create table if not exists public.kur_struktur (
  id uuid primary key default gen_random_uuid(),
  tahun_ajaran text not null check (tahun_ajaran ~ '^\d{4}/\d{4}$'),
  tingkat int not null check (tingkat in (10, 11, 12)),
  program text not null default '*' check (char_length(btrim(program)) between 1 and 20),
  mapel_id uuid not null references public.kur_mapel(id),
  jp_minggu int not null check (jp_minggu between 1 and 20),
  unique (tahun_ajaran, tingkat, program, mapel_id)
);
alter table public.kur_struktur enable row level security;

create table if not exists public.kur_beban (
  id uuid primary key default gen_random_uuid(),
  rombel_id uuid not null references public.rombel(id) on delete cascade,
  mapel_id uuid not null references public.kur_mapel(id),
  ptk_id uuid not null references public.ptk(id) on delete cascade,
  dibuat_oleh uuid default auth.uid(),
  dibuat_pada timestamptz not null default now(),
  unique (rombel_id, mapel_id)
);
create index if not exists kur_beban_ptk_idx on public.kur_beban (ptk_id);
alter table public.kur_beban enable row level security;

create table if not exists public.kur_linieritas_manual (
  ptk_id uuid not null references public.ptk(id) on delete cascade,
  mapel_id uuid not null references public.kur_mapel(id) on delete cascade,
  linier boolean not null,
  catatan text check (char_length(catatan) <= 300),
  diubah_oleh uuid default auth.uid(),
  diubah_pada timestamptz not null default now(),
  primary key (ptk_id, mapel_id)
);
alter table public.kur_linieritas_manual enable row level security;

-- Contoh awal daftar mapel SMK dan kata kunci bidang yang dianggap linier. Wajib diperiksa dan disesuaikan sekolah.
insert into public.kur_mapel (nama, kelompok, bidang_linier, urutan)
select * from (values
  ('Pendidikan Agama dan Budi Pekerti', 'umum', array['agama'], 10),
  ('Pendidikan Pancasila', 'umum', array['pancasila', 'kewarganegaraan', 'pkn'], 20),
  ('Bahasa Indonesia', 'umum', array['bahasa indonesia', 'sastra indonesia'], 30),
  ('Pendidikan Jasmani, Olahraga, dan Kesehatan', 'umum', array['jasmani', 'olahraga'], 40),
  ('Sejarah', 'umum', array['sejarah'], 50),
  ('Seni dan Budaya', 'umum', array['seni'], 60),
  ('Muatan Lokal', 'muatan_lokal', array['muatan lokal'], 70),
  ('Matematika', 'umum', array['matematika'], 80),
  ('Bahasa Inggris', 'umum', array['inggris'], 90),
  ('Informatika', 'umum', array['informatika', 'komputer', 'teknologi informasi', 'tik', 'sistem informasi'], 100),
  ('Projek IPAS', 'projek', array['ipas', 'ipa', 'ips', 'fisika', 'kimia', 'biologi', 'ilmu pengetahuan'], 110),
  ('Dasar-dasar Program Keahlian', 'kejuruan', array[]::text[], 120),
  ('Konsentrasi Keahlian', 'kejuruan', array[]::text[], 130),
  ('Projek Kreatif dan Kewirausahaan', 'projek', array['kewirausahaan', 'ekonomi', 'kreativitas'], 140),
  ('Praktik Kerja Lapangan', 'pkl', array[]::text[], 150)
) v(nama, kelompok, bidang_linier, urutan)
where not exists (select 1 from public.kur_mapel);

-- ---------------------------------------------------------------- bantu
create or replace function private.kur_boleh() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and private.punya_izin('kurikulum.struktur', null)
$$;
create or replace function private.kur_boleh_lihat() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (private.adalah_super() or private.peran_saya() in ('admin_tu', 'guru', 'staf'))
$$;
create or replace function public.kur_boleh() returns boolean
language sql stable security definer set search_path = '' as $$ select private.kur_boleh() $$;

-- Program keahlian dibaca dari nama rombel, misalnya "X TJKT 2" menjadi TJKT.
create or replace function private.kur_program(p_nama text) returns text
language sql immutable set search_path = '' as $$ select upper(btrim(split_part(btrim(p_nama), ' ', 2))) $$;

-- Status linieritas satu guru untuk satu mapel:
-- linier (bidang sertifikasi/kompetensi cocok), ijazah (hanya prodi ijazah cocok), dapodik (tercatat mengajar mapel itu di Dapodik),
-- tidak_linier, tanpa_data (kompetensi dan prodi kosong), belum_dipetakan (mapel belum punya kata kunci), manual_linier, manual_tidak.
create or replace function private.kur_status(p_ptk uuid, p_mapel uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  m public.kur_mapel; k public.ptk; o boolean; bidang text; ijazah text; kata text;
begin
  select linier into o from public.kur_linieritas_manual where ptk_id = p_ptk and mapel_id = p_mapel;
  if found then return case when o then 'manual_linier' else 'manual_tidak' end; end if;
  select * into m from public.kur_mapel where id = p_mapel;
  select * into k from public.ptk where id = p_ptk;
  if m.id is null or k.id is null then return 'tanpa_data'; end if;
  bidang := lower(btrim(coalesce(k.kompetensi, '') || ' ' || coalesce(k.sertifikasi, '')));
  ijazah := lower(btrim(coalesce(k.jurusan_prodi, '')));
  if bidang = '' and ijazah = '' then return 'tanpa_data'; end if;
  if coalesce(array_length(m.bidang_linier, 1), 0) = 0 then
    return case when position(lower(btrim(m.nama)) in lower(coalesce(k.mengajar, ''))) > 0 then 'dapodik' else 'belum_dipetakan' end;
  end if;
  -- Kata kunci dicocokkan per kata utuh agar "tik" tidak cocok dengan "praktik".
  foreach kata in array m.bidang_linier loop
    if kata <> '' and bidang ~ ('\m' || regexp_replace(lower(kata), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M') then return 'linier'; end if;
  end loop;
  foreach kata in array m.bidang_linier loop
    if kata <> '' and ijazah ~ ('\m' || regexp_replace(lower(kata), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M') then return 'ijazah'; end if;
  end loop;
  if position(lower(btrim(m.nama)) in lower(coalesce(k.mengajar, ''))) > 0 then return 'dapodik'; end if;
  return 'tidak_linier';
end $$;
revoke execute on function private.kur_status(uuid, uuid) from public, anon, authenticated;

-- Kebutuhan mengajar: tiap rombel Kelas Utama pada tahun ajaran itu dikalikan mapel dalam strukturnya.
-- Baris program khusus menimpa baris '*' untuk mapel yang sama.
create or replace function private.kur_kebutuhan(p_ta text)
returns table (rombel_id uuid, rombel text, tingkat int, program text, mapel_id uuid, mapel text, kelompok text, urutan int, jp int, ptk_id uuid)
language sql stable security definer set search_path = '' as $$
  select distinct on (r.id, st.mapel_id)
         r.id, r.nama, r.tingkat, private.kur_program(r.nama), st.mapel_id, m.nama, m.kelompok, m.urutan, st.jp_minggu, b.ptk_id
    from public.rombel r
    join public.semester s on s.semester_id = r.semester_id and s.tahun_ajaran = p_ta
    join public.kur_struktur st on st.tahun_ajaran = p_ta and st.tingkat = r.tingkat
                               and (st.program = '*' or upper(st.program) = private.kur_program(r.nama))
    join public.kur_mapel m on m.id = st.mapel_id
    left join public.kur_beban b on b.rombel_id = r.id and b.mapel_id = st.mapel_id
   where r.jenis_rombel = 'Kelas Utama' and r.npsn = private.npsn_saya()
   order by r.id, st.mapel_id, (st.program = '*')
$$;
revoke execute on function private.kur_kebutuhan(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- pengaturan
create or replace function public.kur_pengaturan_baca() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.kur_boleh_lihat()
    then (select jsonb_build_object('durasi_jp', durasi_jp, 'jam_wajib', jam_wajib, 'boleh', private.kur_boleh()) from public.kur_pengaturan)
    else null end
$$;

create or replace function public.kur_pengaturan_simpan(p_durasi int, p_jam_wajib int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.kur_boleh() then raise exception 'Anda tidak berwenang mengatur kurikulum.'; end if;
  if p_durasi is null or p_durasi not between 30 and 60 then raise exception 'Durasi satu jam pelajaran harus 30 sampai 60 menit.'; end if;
  if p_jam_wajib is null or p_jam_wajib not between 6 and 40 then raise exception 'Jam wajib mengajar harus 6 sampai 40 jam per minggu.'; end if;
  update public.kur_pengaturan set durasi_jp = p_durasi, jam_wajib = p_jam_wajib, diubah_oleh = auth.uid(), diubah_pada = now() where id;
end $$;

-- ---------------------------------------------------------------- mata pelajaran
create or replace function public.kur_mapel_daftar() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.kur_boleh_lihat() then coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'nama', nama, 'kelompok', kelompok, 'bidang_linier', to_jsonb(bidang_linier),
                                        'aktif', aktif, 'urutan', urutan) order by urutan, nama)
      from public.kur_mapel), '[]'::jsonb) else null end
$$;

create or replace function public.kur_mapel_simpan(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_nama text := btrim(coalesce(p->>'nama', ''));
  v_kata text[];
begin
  if not private.kur_boleh() then raise exception 'Anda tidak berwenang mengatur kurikulum.'; end if;
  if char_length(v_nama) < 3 then raise exception 'Nama mapel minimal 3 huruf.'; end if;
  v_kata := coalesce((select array_agg(distinct lower(btrim(x))) from jsonb_array_elements_text(coalesce(p->'bidang_linier', '[]'::jsonb)) x where btrim(x) <> ''), '{}');
  if v_id is null then
    insert into public.kur_mapel (nama, kelompok, bidang_linier, urutan)
    values (v_nama, coalesce(nullif(p->>'kelompok', ''), 'umum'), v_kata, coalesce((p->>'urutan')::int, 100))
    returning id into v_id;
  else
    update public.kur_mapel set nama = v_nama, kelompok = coalesce(nullif(p->>'kelompok', ''), kelompok), bidang_linier = v_kata,
           urutan = coalesce((p->>'urutan')::int, urutan), aktif = coalesce((p->>'aktif')::boolean, aktif)
     where id = v_id;
    if not found then raise exception 'Mapel tidak ditemukan.'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Mapel dengan nama itu sudah ada.';
end $$;

-- Mapel tidak pernah dihapus keras: dinonaktifkan agar struktur dan pembagian guru lama tetap utuh.
create or replace function public.kur_mapel_hapus(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not private.kur_boleh() then raise exception 'Anda tidak berwenang mengatur kurikulum.'; end if;
  update public.kur_mapel set aktif = false where id = p_id;
  if not found then raise exception 'Mapel tidak ditemukan.'; end if;
  return 'dinonaktifkan';
end $$;

-- ---------------------------------------------------------------- struktur kurikulum
create or replace function public.kur_program_daftar(p_ta text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.kur_boleh_lihat() then coalesce((
    select jsonb_agg(jsonb_build_object('program', x.program, 'rombel', x.n, 'tingkat', x.tingkat) order by x.program, x.tingkat)
      from (select private.kur_program(r.nama) program, r.tingkat, count(*) n
              from public.rombel r join public.semester s on s.semester_id = r.semester_id
             where r.jenis_rombel = 'Kelas Utama' and r.npsn = private.npsn_saya()
               and s.tahun_ajaran = coalesce(p_ta, public.tahun_ajaran_sekarang())
             group by 1, 2) x), '[]'::jsonb) else null end
$$;

create or replace function public.kur_struktur_daftar(p_ta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.kur_boleh_lihat() then coalesce((
    select jsonb_agg(jsonb_build_object('id', st.id, 'tingkat', st.tingkat, 'program', st.program, 'mapel_id', st.mapel_id,
                                        'mapel', m.nama, 'kelompok', m.kelompok, 'jp_minggu', st.jp_minggu)
                     order by st.tingkat, st.program, m.urutan, m.nama)
      from public.kur_struktur st join public.kur_mapel m on m.id = st.mapel_id
     where st.tahun_ajaran = p_ta), '[]'::jsonb) else null end
$$;

-- Mengganti seluruh isi satu kelompok (tahun ajaran, tingkat, program). p_baris: [{mapel_id, jp_minggu}].
create or replace function public.kur_struktur_simpan(p_ta text, p_tingkat int, p_program text, p_baris jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if not private.kur_boleh() then raise exception 'Anda tidak berwenang mengatur kurikulum.'; end if;
  if p_ta !~ '^\d{4}/\d{4}$' then raise exception 'Tahun ajaran tidak valid.'; end if;
  if p_tingkat not in (10, 11, 12) then raise exception 'Tingkat harus 10, 11, atau 12.'; end if;
  p_program := upper(btrim(coalesce(nullif(p_program, ''), '*')));
  if jsonb_typeof(p_baris) <> 'array' then raise exception 'Data struktur tidak valid.'; end if;
  if jsonb_array_length(p_baris) > 60 then raise exception 'Terlalu banyak mapel dalam satu struktur.'; end if;
  if exists (select 1 from jsonb_array_elements(p_baris) e group by e->>'mapel_id' having count(*) > 1) then
    raise exception 'Ada mapel yang dipilih dua kali.';
  end if;
  delete from public.kur_struktur where tahun_ajaran = p_ta and tingkat = p_tingkat and program = p_program;
  insert into public.kur_struktur (tahun_ajaran, tingkat, program, mapel_id, jp_minggu)
  select p_ta, p_tingkat, p_program, (e->>'mapel_id')::uuid, (e->>'jp_minggu')::int from jsonb_array_elements(p_baris) e;
  get diagnostics v_n = row_count;
  -- Pembagian guru untuk mapel yang keluar dari struktur tidak berlaku lagi.
  delete from public.kur_beban b using public.rombel r, public.semester s
   where b.rombel_id = r.id and s.semester_id = r.semester_id and s.tahun_ajaran = p_ta and r.tingkat = p_tingkat
     and (p_program = '*' or private.kur_program(r.nama) = p_program)
     and not exists (select 1 from public.kur_struktur st where st.tahun_ajaran = p_ta and st.tingkat = r.tingkat
                       and st.mapel_id = b.mapel_id and (st.program = '*' or upper(st.program) = private.kur_program(r.nama)));
  return v_n;
end $$;

create or replace function public.kur_struktur_salin(p_dari text, p_ke text) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if not private.kur_boleh() then raise exception 'Anda tidak berwenang mengatur kurikulum.'; end if;
  if p_dari = p_ke then raise exception 'Tahun ajaran asal dan tujuan sama.'; end if;
  if p_ke !~ '^\d{4}/\d{4}$' then raise exception 'Tahun ajaran tujuan tidak valid.'; end if;
  if exists (select 1 from public.kur_struktur where tahun_ajaran = p_ke) then raise exception 'Tahun ajaran tujuan sudah punya struktur.'; end if;
  insert into public.kur_struktur (tahun_ajaran, tingkat, program, mapel_id, jp_minggu)
  select p_ke, tingkat, program, mapel_id, jp_minggu from public.kur_struktur where tahun_ajaran = p_dari;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------- beban mengajar
create or replace function public.kur_beban_data(p_ta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.kur_boleh_lihat() then coalesce((
    select jsonb_agg(jsonb_build_object(
             'rombel_id', k.rombel_id, 'rombel', k.rombel, 'tingkat', k.tingkat, 'program', k.program,
             'mapel_id', k.mapel_id, 'mapel', k.mapel, 'kelompok', k.kelompok, 'jp', k.jp,
             'ptk_id', k.ptk_id, 'guru', p.nama,
             'status', case when k.ptk_id is null then null else private.kur_status(k.ptk_id, k.mapel_id) end)
           order by k.tingkat, k.rombel, k.urutan, k.mapel)
      from private.kur_kebutuhan(p_ta) k left join public.ptk p on p.id = k.ptk_id), '[]'::jsonb) else null end
$$;

-- Daftar guru dengan total JP, status linieritas per mapel, dan catatan Dapodik.
create or replace function public.kur_guru_daftar(p_ta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.kur_boleh_lihat() then coalesce((
    select jsonb_agg(jsonb_build_object(
             'ptk_id', p.id, 'nama', p.nama, 'jenis_ptk', p.jenis_ptk, 'status_kepegawaian', p.status_kepegawaian,
             'kompetensi', p.kompetensi, 'sertifikasi', p.sertifikasi, 'jurusan_prodi', p.jurusan_prodi, 'mengajar', p.mengajar,
             'jjm_dapodik', p.jjm, 'tugas_tambahan', p.tugas_tambahan, 'jam_tugas_tambahan', p.jam_tugas_tambahan,
             'jp_total', coalesce(b.jp, 0), 'jumlah_rombel', coalesce(b.rombel, 0),
             'jp_tidak_linier', coalesce(b.tidak_linier, 0),
             'status', (select jsonb_object_agg(m.id, private.kur_status(p.id, m.id)) from public.kur_mapel m where m.aktif))
           order by p.nama)
      from public.ptk p
      left join (select kk.ptk_id, sum(kk.jp) jp, count(distinct kk.rombel_id) rombel,
                        sum(kk.jp) filter (where private.kur_status(kk.ptk_id, kk.mapel_id) in ('tidak_linier', 'manual_tidak', 'tanpa_data')) tidak_linier
                   from private.kur_kebutuhan(p_ta) kk where kk.ptk_id is not null group by kk.ptk_id) b on b.ptk_id = p.id
     where p.npsn = private.npsn_saya()
       and (p.jenis_ptk in ('Guru', 'Kepala Sekolah') or b.ptk_id is not null)), '[]'::jsonb) else null end
$$;

create or replace function public.kur_beban_set(p_rombel uuid, p_mapel uuid, p_ptk uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rombel; v_ta text;
begin
  if not private.kur_boleh() then raise exception 'Anda tidak berwenang mengatur kurikulum.'; end if;
  select * into r from public.rombel where id = p_rombel and npsn = private.npsn_saya() and jenis_rombel = 'Kelas Utama';
  if r.id is null then raise exception 'Rombel tidak ditemukan.'; end if;
  select tahun_ajaran into v_ta from public.semester where semester_id = r.semester_id;
  if not exists (select 1 from private.kur_kebutuhan(v_ta) k where k.rombel_id = p_rombel and k.mapel_id = p_mapel) then
    raise exception 'Mapel ini belum ada dalam struktur kurikulum untuk kelas tersebut.';
  end if;
  if p_ptk is null then
    delete from public.kur_beban where rombel_id = p_rombel and mapel_id = p_mapel;
  else
    if not exists (select 1 from public.ptk where id = p_ptk and npsn = r.npsn) then raise exception 'Guru tidak ditemukan.'; end if;
    insert into public.kur_beban (rombel_id, mapel_id, ptk_id) values (p_rombel, p_mapel, p_ptk)
    on conflict (rombel_id, mapel_id) do update set ptk_id = excluded.ptk_id, dibuat_oleh = auth.uid(), dibuat_pada = now();
  end if;
end $$;

create or replace function public.kur_linieritas_set(p_ptk uuid, p_mapel uuid, p_linier boolean, p_catatan text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.kur_boleh() then raise exception 'Anda tidak berwenang mengatur kurikulum.'; end if;
  if p_linier is null then
    delete from public.kur_linieritas_manual where ptk_id = p_ptk and mapel_id = p_mapel;
  else
    insert into public.kur_linieritas_manual (ptk_id, mapel_id, linier, catatan) values (p_ptk, p_mapel, p_linier, left(btrim(p_catatan), 300))
    on conflict (ptk_id, mapel_id) do update set linier = excluded.linier, catatan = excluded.catatan, diubah_oleh = auth.uid(), diubah_pada = now();
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'kur_boleh()', 'kur_pengaturan_baca()', 'kur_pengaturan_simpan(int,int)', 'kur_mapel_daftar()', 'kur_mapel_simpan(jsonb)',
    'kur_mapel_hapus(uuid)', 'kur_program_daftar(text)', 'kur_struktur_daftar(text)', 'kur_struktur_simpan(text,int,text,jsonb)',
    'kur_struktur_salin(text,text)', 'kur_beban_data(text)', 'kur_guru_daftar(text)', 'kur_beban_set(uuid,uuid,uuid)',
    'kur_linieritas_set(uuid,uuid,boolean,text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
