-- Pembagian peran bertingkat: Akun (profil_pengguna.peran) > Penugasan (jabatan + lingkup + tahun ajaran) > Izin.
-- Kode dan RLS hanya mengecek izin, bukan nama jabatan.

create or replace function public.tahun_ajaran_sekarang() returns text
language sql stable set search_path = public as $$
  select case when extract(month from (now() at time zone 'Asia/Jakarta')) >= 7
    then extract(year from (now() at time zone 'Asia/Jakarta'))::int || '/' || (extract(year from (now() at time zone 'Asia/Jakarta'))::int + 1)
    else (extract(year from (now() at time zone 'Asia/Jakarta'))::int - 1) || '/' || extract(year from (now() at time zone 'Asia/Jakarta'))::int end
$$;

create or replace function private.adalah_super() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.super_admin where user_id = auth.uid())
$$;

create or replace function private.ptk_id_saya() returns uuid
language sql stable security definer set search_path = public as $$
  select ptk_id from public.profil_pengguna where user_id = auth.uid()
$$;

create table if not exists public.jabatan (
  kode text primary key,
  nama text not null,
  kelompok text not null,
  lingkup text not null check (lingkup in ('sekolah','kompetensi','ruang','rombel','ekskul','siswa')),
  induk_kode text references public.jabatan(kode),
  urutan int not null default 100,
  tampil_publik boolean not null default true,
  satu_pemegang boolean not null default false,
  bagan boolean not null default true,
  keterangan text
);

create table if not exists public.izin (
  kode text primary key,
  nama text not null,
  bidang text not null
);

create table if not exists public.jabatan_izin (
  jabatan_kode text not null references public.jabatan(kode) on delete cascade,
  izin_kode text not null references public.izin(kode) on delete cascade,
  primary key (jabatan_kode, izin_kode)
);

create table if not exists public.penugasan (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah(npsn),
  ptk_id uuid not null references public.ptk(id) on delete cascade,
  jabatan_kode text not null references public.jabatan(kode),
  lingkup_id text,
  lingkup_label text,
  tahun_ajaran text not null,
  sumber text not null default 'manual' check (sumber in ('manual','dapodik')),
  status text not null default 'aktif' check (status in ('usulan','aktif','selesai','ditolak')),
  dibuat_oleh uuid,
  dibuat_pada timestamptz not null default now()
);
create unique index if not exists penugasan_unik on public.penugasan (ptk_id, jabatan_kode, coalesce(lingkup_id, ''), tahun_ajaran);
create index if not exists penugasan_aktif_idx on public.penugasan (tahun_ajaran, status, jabatan_kode);

create table if not exists public.audit_log (
  id bigserial primary key,
  waktu timestamptz not null default now(),
  user_id uuid,
  tabel text not null,
  aksi text not null,
  ringkasan jsonb
);

alter table public.jabatan enable row level security;
alter table public.izin enable row level security;
alter table public.jabatan_izin enable row level security;
alter table public.penugasan enable row level security;
alter table public.audit_log enable row level security;

create policy jabatan_baca on public.jabatan for select to authenticated using (true);
create policy jabatan_super on public.jabatan for all to authenticated using ((select private.adalah_super())) with check ((select private.adalah_super()));
create policy izin_baca on public.izin for select to authenticated using (true);
create policy izin_super on public.izin for all to authenticated using ((select private.adalah_super())) with check ((select private.adalah_super()));
create policy jabatan_izin_baca on public.jabatan_izin for select to authenticated using (true);
create policy jabatan_izin_super on public.jabatan_izin for all to authenticated using ((select private.adalah_super())) with check ((select private.adalah_super()));
create policy penugasan_baca on public.penugasan for select to authenticated using (
  (select private.adalah_super())
  or ((select private.peran_saya()) = 'admin_tu' and npsn = (select private.npsn_saya()))
  or ptk_id = (select private.ptk_id_saya())
);
create policy penugasan_super on public.penugasan for all to authenticated using ((select private.adalah_super())) with check ((select private.adalah_super()));
create policy audit_baca_super on public.audit_log for select to authenticated using ((select private.adalah_super()));

-- Pengecekan izin untuk pengguna yang sedang masuk. Lingkup kosong pada penugasan berarti seluruh sekolah.
create or replace function private.punya_izin(p_izin text, p_lingkup text default null) returns boolean
language sql stable security definer set search_path = public as $$
  select private.adalah_super() or exists (
    select 1 from public.penugasan p
    join public.jabatan_izin ji on ji.jabatan_kode = p.jabatan_kode
    where p.ptk_id = private.ptk_id_saya()
      and p.status = 'aktif'
      and p.tahun_ajaran = public.tahun_ajaran_sekarang()
      and ji.izin_kode = p_izin
      and (p_lingkup is null or coalesce(p.lingkup_id, '') = '' or p.lingkup_id = p_lingkup)
  )
$$;

-- Validasi penugasan: lingkup wajib untuk jabatan berlingkup, satu pemegang per jabatan dan lingkup.
create or replace function private.cek_penugasan() returns trigger
language plpgsql security definer set search_path = public as $$
declare j public.jabatan%rowtype;
begin
  select * into j from public.jabatan where kode = new.jabatan_kode;
  if new.status = 'aktif' then
    if j.lingkup in ('kompetensi','ruang','rombel','ekskul') and coalesce(new.lingkup_id, '') = '' then
      raise exception 'Jabatan "%" memerlukan lingkup (%).', j.nama, j.lingkup using errcode = '23514';
    end if;
    if j.satu_pemegang and exists (
      select 1 from public.penugasan p
      where p.id <> new.id and p.jabatan_kode = new.jabatan_kode
        and coalesce(p.lingkup_id, '') = coalesce(new.lingkup_id, '')
        and p.tahun_ajaran = new.tahun_ajaran and p.status = 'aktif' and p.ptk_id <> new.ptk_id
    ) then
      raise exception 'Jabatan "%" % sudah dipegang orang lain pada tahun ajaran %.', j.nama, coalesce(new.lingkup_label, ''), new.tahun_ajaran using errcode = '23505';
    end if;
  end if;
  return new;
end $$;
create trigger penugasan_cek before insert or update on public.penugasan for each row execute function private.cek_penugasan();

create or replace function private.catat_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.penugasan%rowtype;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan)
  values (auth.uid(), tg_table_name, tg_op, jsonb_build_object(
    'ptk_id', r.ptk_id, 'jabatan', r.jabatan_kode, 'lingkup', r.lingkup_label, 'tahun_ajaran', r.tahun_ajaran,
    'status', r.status, 'status_lama', case when tg_op = 'UPDATE' then old.status end, 'sumber', r.sumber));
  return null;
end $$;
create trigger penugasan_audit after insert or update or delete on public.penugasan for each row execute function private.catat_audit();

-- ---------------------------------------------------------------- data awal
insert into public.jabatan (kode, nama, kelompok, lingkup, induk_kode, urutan, tampil_publik, satu_pemegang, bagan) values
 ('kepala_sekolah',  'Kepala Sekolah', 'Pimpinan', 'sekolah', null, 1, true, true, true),
 ('kepala_tu',       'Kepala Tata Usaha', 'Tata usaha', 'sekolah', 'kepala_sekolah', 5, true, true, true),
 ('waka_kurikulum',  'Wakil Kepala Sekolah Bidang Kurikulum', 'Kurikulum', 'sekolah', 'kepala_sekolah', 10, true, true, true),
 ('waka_kesiswaan',  'Wakil Kepala Sekolah Bidang Kesiswaan', 'Kesiswaan', 'sekolah', 'kepala_sekolah', 20, true, true, true),
 ('waka_sarpras',    'Wakil Kepala Sekolah Bidang Sarana dan Prasarana', 'Sarpras', 'sekolah', 'kepala_sekolah', 30, true, true, true),
 ('waka_hubin',      'Wakil Kepala Sekolah Bidang Hubungan Industri dan Humas', 'Hubungan industri', 'sekolah', 'kepala_sekolah', 40, true, true, true),
 ('staf_kurikulum',  'Staf Kurikulum', 'Kurikulum', 'sekolah', 'waka_kurikulum', 11, true, false, true),
 ('kaprog',          'Kepala Program Keahlian', 'Kurikulum', 'kompetensi', 'waka_kurikulum', 12, true, true, true),
 ('koordinator_p5',  'Koordinator P5', 'Kurikulum', 'sekolah', 'waka_kurikulum', 13, true, false, true),
 ('kepala_perpustakaan', 'Kepala Perpustakaan', 'Perpustakaan', 'sekolah', 'waka_kurikulum', 14, true, true, true),
 ('wali_kelas',      'Wali Kelas', 'Kesiswaan', 'rombel', 'waka_kesiswaan', 21, true, true, false),
 ('pembina_ekskul',  'Pembina Ekstrakurikuler', 'Kesiswaan', 'ekskul', 'waka_kesiswaan', 22, true, false, false),
 ('guru_wali',       'Guru Wali', 'Kesiswaan', 'siswa', 'waka_kesiswaan', 23, false, false, false),
 ('guru_piket',      'Guru Piket', 'Kesiswaan', 'sekolah', 'waka_kesiswaan', 24, false, false, false),
 ('kepala_bengkel',  'Kepala Bengkel dan Laboratorium', 'Sarpras', 'ruang', 'waka_sarpras', 31, true, true, true),
 ('bendahara',       'Bendahara', 'Tata usaha', 'sekolah', 'kepala_tu', 51, true, true, true),
 ('operator_dapodik','Operator Dapodik', 'Tata usaha', 'sekolah', 'kepala_tu', 52, false, false, true)
on conflict (kode) do nothing;

insert into public.izin (kode, nama, bidang) values
 ('hubin.kelola_dudi',  'Mengelola data DU/DI, MoU, dan praktik industri', 'Hubungan industri'),
 ('hubin.kelola_humas', 'Mengelola informasi kehumasan dan berita', 'Hubungan industri'),
 ('kurikulum.atur_jadwal', 'Mengatur jadwal pelajaran', 'Kurikulum'),
 ('kurikulum.kalender', 'Mengatur kalender akademik', 'Kurikulum'),
 ('kurikulum.kelola_info', 'Mengelola informasi akademik', 'Kurikulum'),
 ('kesiswaan.kelola', 'Mengelola kegiatan dan tata tertib kesiswaan', 'Kesiswaan'),
 ('siswa.lihat_pribadi', 'Melihat data pribadi siswa dalam lingkupnya', 'Kesiswaan'),
 ('kelas.kelola', 'Mengelola kelas yang diampu (absensi, catatan, nilai)', 'Kelas'),
 ('ekskul.kelola', 'Mengelola ekstrakurikuler yang dibina', 'Kesiswaan'),
 ('program.kelola', 'Mengelola program keahlian', 'Kurikulum'),
 ('lab.kelola', 'Mengelola bengkel atau laboratorium', 'Sarpras'),
 ('sarpras.kelola', 'Mengelola sarana dan prasarana', 'Sarpras'),
 ('perpus.kelola', 'Mengelola perpustakaan', 'Perpustakaan'),
 ('laporan.lihat', 'Melihat laporan dan ringkasan sekolah', 'Pimpinan')
on conflict (kode) do nothing;

insert into public.jabatan_izin (jabatan_kode, izin_kode) values
 ('kepala_sekolah','laporan.lihat'), ('kepala_sekolah','siswa.lihat_pribadi'),
 ('waka_hubin','hubin.kelola_dudi'), ('waka_hubin','hubin.kelola_humas'),
 ('waka_kurikulum','kurikulum.atur_jadwal'), ('waka_kurikulum','kurikulum.kalender'), ('waka_kurikulum','kurikulum.kelola_info'),
 ('staf_kurikulum','kurikulum.atur_jadwal'), ('staf_kurikulum','kurikulum.kalender'),
 ('waka_kesiswaan','kesiswaan.kelola'), ('waka_kesiswaan','siswa.lihat_pribadi'),
 ('waka_sarpras','sarpras.kelola'),
 ('wali_kelas','kelas.kelola'), ('wali_kelas','siswa.lihat_pribadi'),
 ('guru_wali','siswa.lihat_pribadi'),
 ('pembina_ekskul','ekskul.kelola'),
 ('kaprog','program.kelola'),
 ('kepala_bengkel','lab.kelola'),
 ('kepala_perpustakaan','perpus.kelola')
on conflict do nothing;

-- Hak nyata pertama: pemegang izin hubin boleh membaca dan mengubah data DU/DI di sekolahnya.
create policy hubin_kelola on public.dudi for all to authenticated
  using ((select private.punya_izin('hubin.kelola_dudi')) and npsn = (select private.npsn_saya()))
  with check ((select private.punya_izin('hubin.kelola_dudi')) and npsn = (select private.npsn_saya()));
create policy hubin_kelola on public.mou_kerjasama for all to authenticated
  using ((select private.punya_izin('hubin.kelola_dudi')) and npsn = (select private.npsn_saya()))
  with check ((select private.punya_izin('hubin.kelola_dudi')) and npsn = (select private.npsn_saya()));
create policy hubin_kelola on public.praktik_industri for all to authenticated
  using ((select private.punya_izin('hubin.kelola_dudi')) and npsn = (select private.npsn_saya()))
  with check ((select private.punya_izin('hubin.kelola_dudi')) and npsn = (select private.npsn_saya()));

-- Tugas saya: penugasan aktif beserta izinnya.
create or replace function public.penugasan_saya() returns table (
  jabatan_kode text, jabatan_nama text, kelompok text, lingkup_id text, lingkup_label text, izin text[]
) language sql stable security definer set search_path = public as $$
  select p.jabatan_kode, j.nama, j.kelompok, p.lingkup_id, p.lingkup_label,
         coalesce(array_agg(ji.izin_kode order by ji.izin_kode) filter (where ji.izin_kode is not null), '{}')
  from public.penugasan p
  join public.jabatan j on j.kode = p.jabatan_kode
  left join public.jabatan_izin ji on ji.jabatan_kode = p.jabatan_kode
  where p.ptk_id = private.ptk_id_saya() and p.status = 'aktif' and p.tahun_ajaran = public.tahun_ajaran_sekarang()
  group by p.id, p.jabatan_kode, j.nama, j.kelompok, p.lingkup_id, p.lingkup_label, j.urutan
  order by j.urutan, p.lingkup_label
$$;

-- Struktur organisasi publik: hanya nama, gelar, jabatan. Tanpa NIP, kontak, atau data pribadi.
create or replace function public.struktur_publik() returns table (
  kode text, nama text, induk_kode text, urutan int, lingkup text, bagan boolean, lingkup_label text, pemegang text
) language sql stable security definer set search_path = public as $$
  select j.kode, j.nama, j.induk_kode, j.urutan, j.lingkup, j.bagan, p.lingkup_label,
         case when t.id is null then null else
           trim(concat_ws(' ', nullif(trim(t.gelar_depan), ''), t.nama)) || coalesce(', ' || nullif(trim(t.gelar_belakang), ''), '') end
  from public.jabatan j
  left join public.penugasan p on p.jabatan_kode = j.kode and p.status = 'aktif' and p.tahun_ajaran = public.tahun_ajaran_sekarang()
  left join public.ptk t on t.id = p.ptk_id
  where j.tampil_publik
  order by j.urutan, p.lingkup_label, t.nama
$$;

-- Usulan dan sinkron dari Dapodik. Wali kelas langsung aktif dari rombel, tugas tambahan masuk sebagai usulan.
create or replace function public.sinkron_penugasan_dapodik() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ta text := public.tahun_ajaran_sekarang();
  npsn_ text;
  r record; n int; w int := 0; s int := 0; u int := 0;
  t text; kode text; lingk text;
begin
  if not private.adalah_super() then raise exception 'tidak berwenang' using errcode = '42501'; end if;
  select npsn into npsn_ from public.profil_pengguna where user_id = auth.uid();

  for r in select id, nama, wali_kelas_ptk_id from public.rombel
           where npsn = npsn_ and jenis_rombel = 'Kelas Utama' and wali_kelas_ptk_id is not null
             and left(semester_id, 4) = split_part(ta, '/', 1) loop
    begin
      insert into public.penugasan (npsn, ptk_id, jabatan_kode, lingkup_id, lingkup_label, tahun_ajaran, sumber, status)
      values (npsn_, r.wali_kelas_ptk_id, 'wali_kelas', r.id::text, r.nama, ta, 'dapodik', 'aktif')
      on conflict do nothing;
      get diagnostics n = row_count; w := w + n;
    exception when others then null;
    end;
  end loop;

  update public.penugasan p set status = 'selesai'
  where p.npsn = npsn_ and p.sumber = 'dapodik' and p.jabatan_kode = 'wali_kelas' and p.tahun_ajaran = ta and p.status = 'aktif'
    and not exists (select 1 from public.rombel x where x.id::text = p.lingkup_id and x.wali_kelas_ptk_id = p.ptk_id);
  get diagnostics s = row_count;

  for r in select id, tugas_tambahan from public.ptk where npsn = npsn_ and nullif(trim(tugas_tambahan), '') is not null loop
    t := lower(trim(r.tugas_tambahan)); kode := null; lingk := null;
    if t like 'wakil kepala sekolah%' or t like 'wakil kepala%' then
      kode := case
        when t like '%kurikulum%' then 'waka_kurikulum'
        when t like '%kesiswaan%' then 'waka_kesiswaan'
        when t like '%sarana%' or t like '%sarpras%' then 'waka_sarpras'
        when t like '%humas%' or t like '%hubin%' or t like '%hubungan industri%' then 'waka_hubin' end;
    elsif t = 'kepala sekolah' then kode := 'kepala_sekolah';
    elsif t like 'kepala program%' then kode := 'kaprog';
    elsif t like 'kepala bengkel%' or t like 'kepala laboratorium%' or t like 'kepala lab%' then kode := 'kepala_bengkel';
    elsif t like 'guru wali%' then kode := 'guru_wali';
    elsif t like 'kepala perpustakaan%' then kode := 'kepala_perpustakaan';
    elsif t like 'pembina osis%' then kode := 'pembina_ekskul'; lingk := 'OSIS';
    elsif t like 'koordinator p5%' then kode := 'koordinator_p5';
    elsif t like 'guru piket%' then kode := 'guru_piket';
    elsif t like 'kepala tata usaha%' or t = 'kepala tu' then kode := 'kepala_tu';
    elsif t like 'bendahara%' then kode := 'bendahara';
    end if;
    if kode is not null then
      insert into public.penugasan (npsn, ptk_id, jabatan_kode, lingkup_id, lingkup_label, tahun_ajaran, sumber, status)
      values (npsn_, r.id, kode, lingk, lingk, ta, 'dapodik', 'usulan')
      on conflict do nothing;
      get diagnostics n = row_count; u := u + n;
    end if;
  end loop;

  return jsonb_build_object('wali_kelas_baru', w, 'wali_kelas_selesai', s, 'usulan_baru', u);
end $$;

revoke execute on function public.sinkron_penugasan_dapodik() from public, anon;
revoke execute on function public.penugasan_saya() from public, anon;
grant execute on function public.sinkron_penugasan_dapodik() to authenticated;
grant execute on function public.penugasan_saya() to authenticated;
grant execute on function public.struktur_publik() to anon, authenticated;
grant execute on function public.tahun_ajaran_sekarang() to anon, authenticated;

-- Pembersih gelar Dapodik ("-, -, -" dan sejenisnya) untuk tampilan publik.
create or replace function private.gelar_bersih(g text) returns text language sql immutable set search_path = public as $$
  select nullif(array_to_string(array(select trim(x) from unnest(regexp_split_to_array(coalesce(g, ''), '\s*,\s*')) x where x ~ '[A-Za-z]'), ', '), '')
$$;
create or replace function public.struktur_publik() returns table (
  kode text, nama text, induk_kode text, urutan int, lingkup text, bagan boolean, lingkup_label text, pemegang text
) language sql stable security definer set search_path = public as $$
  select j.kode, j.nama, j.induk_kode, j.urutan, j.lingkup, j.bagan, p.lingkup_label,
         case when t.id is null then null else
           trim(concat_ws(' ', private.gelar_bersih(t.gelar_depan), t.nama)) || coalesce(', ' || private.gelar_bersih(t.gelar_belakang), '') end
  from public.jabatan j
  left join public.penugasan p on p.jabatan_kode = j.kode and p.status = 'aktif' and p.tahun_ajaran = public.tahun_ajaran_sekarang()
  left join public.ptk t on t.id = p.ptk_id
  where j.tampil_publik
  order by j.urutan, p.lingkup_label, t.nama
$$;
grant execute on function public.struktur_publik() to anon, authenticated;
