-- Ekskul: struktur organisasi per ekskul, tambah anggota per rombel, contoh ekskul standar.
-- Hak akses tetap: Waka dan TU Kesiswaan (seluruh sekolah), Pembina OSIS Internal (OSIS dan MPK), pembina ekskul (ekskulnya sendiri).

-- ---------------------------------------------------------------- struktur organisasi
create table if not exists public.ekskul_struktur (
  id uuid primary key default gen_random_uuid(),
  ekskul_id uuid not null references public.ekskul (id) on delete cascade,
  tahun_ajaran text not null,
  induk_id uuid references public.ekskul_struktur (id) on delete cascade,
  jabatan text not null check (char_length(jabatan) between 2 and 80),
  urutan int not null default 0,
  anggota_id uuid references public.ekskul_anggota (id) on delete set null,
  ptk_id uuid references public.ptk (id) on delete set null,
  dihapus_pada timestamptz,
  dibuat_pada timestamptz not null default now()
);
alter table public.ekskul_struktur enable row level security;
create index if not exists ekskul_struktur_ekskul_idx on public.ekskul_struktur (ekskul_id, tahun_ajaran);

-- ---------------------------------------------------------------- akses: Pembina OSIS Internal juga memegang organisasi siswa (OSIS, MPK)
create or replace function private.kes_boleh_ekskul(p_ekskul uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.ekskul e
     where e.id = p_ekskul and e.npsn = private.npsn_saya()
       and (private.kes_semua(array['ekskul.kelola'])
            or (e.pembina_ptk_id is not null and e.pembina_ptk_id = private.ptk_id_saya())
            or private.punya_izin('ekskul.kelola', e.nama)
            or exists (
              select 1 from public.penugasan p join public.jabatan_izin ji on ji.jabatan_kode = p.jabatan_kode and ji.izin_kode = 'ekskul.kelola'
               where p.ptk_id = private.ptk_id_saya() and p.status = 'aktif' and p.tahun_ajaran = public.tahun_ajaran_sekarang()
                 and (lower(btrim(p.lingkup_id)) = lower(btrim(e.nama))
                      or (p.jabatan_kode = 'pembina_osis_internal' and e.jenis = 'organisasi'))))
  )
$$;

-- ---------------------------------------------------------------- templat struktur standar
create or replace function private.ekskul_struktur_buat(p_ekskul uuid, p_ta text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_e public.ekskul%rowtype;
  r record;
  v_map jsonb := '{}';
  v_id uuid;
begin
  select * into v_e from public.ekskul where id = p_ekskul;
  if not found then return; end if;
  for r in
    select * from (
      select * from (values
        ('pembina', null, 'Pembina', 1), ('ketua', 'pembina', 'Ketua', 2), ('wakil', 'ketua', 'Wakil Ketua', 3),
        ('sekretaris', 'ketua', 'Sekretaris', 4), ('bendahara', 'ketua', 'Bendahara', 5),
        ('sekbid1', 'wakil', 'Sekbid 1: Ketakwaan', 6), ('sekbid2', 'wakil', 'Sekbid 2: Kebangsaan dan Budi Pekerti', 7),
        ('sekbid3', 'wakil', 'Sekbid 3: Kepemimpinan dan Organisasi', 8), ('sekbid4', 'wakil', 'Sekbid 4: Seni dan Kreativitas', 9),
        ('sekbid5', 'wakil', 'Sekbid 5: Olahraga dan Kesehatan', 10), ('sekbid6', 'wakil', 'Sekbid 6: Teknologi Informasi dan Humas', 11)
      ) as t (k, induk, jabatan, urut) where v_e.nama = 'OSIS'
      union all
      select * from (values
        ('pembina', null, 'Pembina', 1), ('ketua', 'pembina', 'Ketua', 2), ('wakil', 'ketua', 'Wakil Ketua', 3),
        ('sekretaris', 'ketua', 'Sekretaris', 4), ('bendahara', 'ketua', 'Bendahara', 5),
        ('komisi_a', 'wakil', 'Komisi A: Aspirasi dan Advokasi', 6), ('komisi_b', 'wakil', 'Komisi B: Pengawasan Program OSIS', 7)
      ) as t (k, induk, jabatan, urut) where v_e.nama = 'MPK'
      union all
      select * from (values
        ('pembina', null, 'Pembina', 1), ('ketua', 'pembina', 'Ketua', 2), ('wakil', 'ketua', 'Wakil Ketua', 3),
        ('sekretaris', 'ketua', 'Sekretaris', 4), ('bendahara', 'ketua', 'Bendahara', 5),
        ('latihan', 'wakil', 'Seksi Latihan', 6), ('perlengkapan', 'wakil', 'Seksi Perlengkapan', 7),
        ('humas', 'wakil', 'Seksi Humas dan Dokumentasi', 8)
      ) as t (k, induk, jabatan, urut) where v_e.nama not in ('OSIS', 'MPK')
    ) x order by urut
  loop
    insert into public.ekskul_struktur (ekskul_id, tahun_ajaran, induk_id, jabatan, urutan, ptk_id)
    values (p_ekskul, p_ta, (v_map ->> r.induk)::uuid, r.jabatan, r.urut, case when r.k = 'pembina' then v_e.pembina_ptk_id end)
    returning id into v_id;
    v_map := v_map || jsonb_build_object(r.k, v_id);
  end loop;
end $$;

-- ---------------------------------------------------------------- struktur: buat standar, simpan, hapus
create or replace function public.ekskul_struktur_standar(p_ekskul uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_ta text := public.tahun_ajaran_sekarang();
begin
  if auth.uid() is null or not private.kes_boleh_ekskul(p_ekskul) then raise exception 'Anda tidak berwenang mengatur struktur ekstrakurikuler ini.'; end if;
  if exists (select 1 from public.ekskul_struktur where ekskul_id = p_ekskul and tahun_ajaran = v_ta and dihapus_pada is null) then
    raise exception 'Struktur tahun ajaran ini sudah ada. Hapus jabatan yang tidak perlu atau tambah jabatan baru.';
  end if;
  perform private.ekskul_struktur_buat(p_ekskul, v_ta);
  perform private.kes_audit('ekskul_struktur', 'STANDAR', jsonb_build_object('ekskul', p_ekskul));
end $$;

create or replace function public.ekskul_struktur_simpan(p_ekskul uuid, p_id uuid, p_induk uuid, p_jabatan text, p_urutan int default 0,
                                                         p_anggota uuid default null, p_ptk uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_ta text := public.tahun_ajaran_sekarang();
  v_jab text := btrim(coalesce(p_jabatan, ''));
  v_id uuid := p_id;
  v_cek uuid;
  v_n int := 0;
begin
  if auth.uid() is null or not private.kes_boleh_ekskul(p_ekskul) then raise exception 'Anda tidak berwenang mengatur struktur ekstrakurikuler ini.'; end if;
  if char_length(v_jab) < 2 or char_length(v_jab) > 80 then raise exception 'Nama jabatan 2 sampai 80 karakter.'; end if;
  if p_anggota is not null and p_ptk is not null then raise exception 'Pilih siswa atau guru, tidak keduanya.'; end if;
  if p_anggota is not null and not exists (select 1 from public.ekskul_anggota where id = p_anggota and ekskul_id = p_ekskul and aktif) then
    raise exception 'Pemegang jabatan harus anggota aktif ekstrakurikuler ini.';
  end if;
  if p_ptk is not null and not exists (select 1 from public.ptk where id = p_ptk and npsn = private.npsn_saya()) then raise exception 'Guru tidak ditemukan.'; end if;
  if p_induk is not null then
    if not exists (select 1 from public.ekskul_struktur where id = p_induk and ekskul_id = p_ekskul and tahun_ajaran = v_ta and dihapus_pada is null) then raise exception 'Jabatan atasan tidak ditemukan.'; end if;
    -- cegah lingkaran: atasan tidak boleh turunan jabatan ini
    v_cek := p_induk;
    while v_cek is not null and v_n < 50 loop
      if v_cek = v_id then raise exception 'Atasan tidak boleh berupa bawahan jabatan ini.'; end if;
      select induk_id into v_cek from public.ekskul_struktur where id = v_cek;
      v_n := v_n + 1;
    end loop;
  end if;
  if v_id is null then
    insert into public.ekskul_struktur (ekskul_id, tahun_ajaran, induk_id, jabatan, urutan, anggota_id, ptk_id)
    values (p_ekskul, v_ta, p_induk, v_jab, coalesce(p_urutan, 0), p_anggota, p_ptk) returning id into v_id;
  else
    update public.ekskul_struktur set induk_id = p_induk, jabatan = v_jab, urutan = coalesce(p_urutan, 0), anggota_id = p_anggota, ptk_id = p_ptk
     where id = v_id and ekskul_id = p_ekskul and dihapus_pada is null;
    if not found then raise exception 'Jabatan tidak ditemukan.'; end if;
  end if;
  perform private.kes_audit('ekskul_struktur', 'SIMPAN', jsonb_build_object('id', v_id, 'ekskul', p_ekskul, 'jabatan', v_jab));
  return v_id;
end $$;

create or replace function public.ekskul_struktur_hapus(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_e uuid;
begin
  select ekskul_id into v_e from public.ekskul_struktur where id = p_id and dihapus_pada is null;
  if v_e is null then raise exception 'Jabatan tidak ditemukan.'; end if;
  if auth.uid() is null or not private.kes_boleh_ekskul(v_e) then raise exception 'Anda tidak berwenang mengatur struktur ekstrakurikuler ini.'; end if;
  -- hapus lunak: jabatan dan seluruh bawahannya disembunyikan
  with recursive turunan as (
    select id from public.ekskul_struktur where id = p_id
    union all
    select s.id from public.ekskul_struktur s join turunan t on s.induk_id = t.id)
  update public.ekskul_struktur set dihapus_pada = now() where id in (select id from turunan);
  perform private.kes_audit('ekskul_struktur', 'HAPUS', jsonb_build_object('id', p_id, 'ekskul', v_e));
end $$;

-- ---------------------------------------------------------------- anggota per rombel
create or replace function public.ekskul_rombel(p_ekskul uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_ta text := public.tahun_ajaran_sekarang();
begin
  if auth.uid() is null or not private.kes_boleh_ekskul(p_ekskul) then raise exception 'Anda tidak berwenang mengelola anggota ekstrakurikuler ini.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'nama', r.nama, 'tingkat', r.tingkat,
            'jumlah', (select count(*) from public.keanggotaan_rombel k join public.peserta_didik pd on pd.id = k.peserta_didik_id and pd.status_peserta_didik = 'aktif' where k.rombel_id = r.id),
            'sudah', (select count(*) from public.keanggotaan_rombel k join public.ekskul_anggota a on a.peserta_didik_id = k.peserta_didik_id
                       and a.ekskul_id = p_ekskul and a.tahun_ajaran = v_ta and a.aktif where k.rombel_id = r.id))
            order by r.tingkat, r.nama), '[]'::jsonb)
          from public.rombel r
         where r.npsn = private.npsn_saya() and r.jenis_rombel ilike '%utama%'
           and r.semester_id = (select max(semester_id) from public.rombel where npsn = private.npsn_saya() and jenis_rombel ilike '%utama%'));
end $$;

-- Memasukkan seluruh siswa aktif satu rombel sebagai anggota. Yang sudah menjadi anggota dibiarkan (peran tidak berubah).
create or replace function public.ekskul_anggota_tambah_rombel(p_ekskul uuid, p_rombel uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_ta text := public.tahun_ajaran_sekarang();
  v_n int;
begin
  if auth.uid() is null or not private.kes_boleh_ekskul(p_ekskul) then raise exception 'Anda tidak berwenang mengelola anggota ekstrakurikuler ini.'; end if;
  if not exists (select 1 from public.rombel where id = p_rombel and npsn = private.npsn_saya()) then raise exception 'Rombel tidak ditemukan.'; end if;
  with baru as (
    insert into public.ekskul_anggota (ekskul_id, peserta_didik_id, tahun_ajaran, peran)
    select p_ekskul, pd.id, v_ta, 'anggota'
      from public.keanggotaan_rombel k join public.peserta_didik pd on pd.id = k.peserta_didik_id
     where k.rombel_id = p_rombel and pd.npsn = private.npsn_saya() and pd.status_peserta_didik = 'aktif'
    on conflict (ekskul_id, peserta_didik_id, tahun_ajaran) do update set aktif = true where not public.ekskul_anggota.aktif
    returning 1)
  select count(*) into v_n from baru;
  perform private.kes_audit('ekskul_anggota', 'TAMBAH_ROMBEL', jsonb_build_object('ekskul', p_ekskul, 'rombel', p_rombel, 'jumlah', v_n));
  return v_n;
end $$;

-- ---------------------------------------------------------------- detail: tambah struktur dan nama pembina
create or replace function public.ekskul_detail(p_id uuid, p_ta text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ta text := coalesce(nullif(btrim(coalesce(p_ta, '')), ''), public.tahun_ajaran_sekarang());
  v_e public.ekskul%rowtype;
begin
  if auth.uid() is null or not private.kes_lihat_ekskul(p_id) then raise exception 'Anda tidak berwenang membuka ekstrakurikuler ini.'; end if;
  select * into v_e from public.ekskul where id = p_id;
  return jsonb_build_object(
    'id', v_e.id, 'nama', v_e.nama, 'jenis', v_e.jenis, 'deskripsi', v_e.deskripsi, 'jadwal', v_e.jadwal, 'tahun_ajaran', v_ta,
    'pembina', (select p.nama from public.ptk p where p.id = v_e.pembina_ptk_id),
    'bisa_ubah', private.kes_boleh_ekskul(p_id),
    'anggota', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'pd', a.peserta_didik_id, 'nama', pd.nama, 'nisn', pd.nisn, 'rombel', private.kes_rombel_nama(a.peserta_didik_id),
        'peran', a.peran, 'predikat', a.predikat, 'catatan_nilai', a.catatan_nilai, 'aktif', a.aktif,
        'hadir', (select count(*) from public.ekskul_kehadiran h join public.ekskul_pertemuan t on t.id = h.pertemuan_id
                   where h.anggota_id = a.id and h.hadir and t.tanggal >= current_date - 365),
        'pertemuan', (select count(*) from public.ekskul_kehadiran h where h.anggota_id = a.id))
        order by a.aktif desc, a.peran = 'anggota', pd.nama), '[]'::jsonb)
        from public.ekskul_anggota a join public.peserta_didik pd on pd.id = a.peserta_didik_id
       where a.ekskul_id = p_id and a.tahun_ajaran = v_ta),
    'struktur', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'induk_id', s.induk_id, 'jabatan', s.jabatan, 'urutan', s.urutan, 'anggota_id', s.anggota_id, 'ptk_id', s.ptk_id,
        'pemegang', coalesce(pd.nama, pt.nama), 'rombel', case when pd.id is not null then private.kes_rombel_nama(pd.id) end,
        'jenis_pemegang', case when pd.id is not null then 'siswa' when pt.id is not null then 'guru' end)
        order by s.urutan, s.jabatan), '[]'::jsonb)
        from public.ekskul_struktur s
        left join public.ekskul_anggota a on a.id = s.anggota_id
        left join public.peserta_didik pd on pd.id = a.peserta_didik_id
        left join public.ptk pt on pt.id = s.ptk_id
       where s.ekskul_id = p_id and s.tahun_ajaran = v_ta and s.dihapus_pada is null),
    'pertemuan', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'tanggal', t.tanggal, 'topik', t.topik,
        'hadir', (select count(*) from public.ekskul_kehadiran h where h.pertemuan_id = t.id and h.hadir),
        'total', (select count(*) from public.ekskul_kehadiran h where h.pertemuan_id = t.id)) order by t.tanggal desc), '[]'::jsonb)
        from (select * from public.ekskul_pertemuan where ekskul_id = p_id order by tanggal desc limit 40) t));
end $$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (array[
       'ekskul_detail','ekskul_struktur_standar','ekskul_struktur_simpan','ekskul_struktur_hapus','ekskul_rombel','ekskul_anggota_tambah_rombel'])
  loop
    execute format('revoke all on function %s from public, anon', r.f);
    execute format('grant execute on function %s to authenticated', r.f);
  end loop;
end $$;

-- ---------------------------------------------------------------- contoh ekskul standar
insert into public.ekskul (npsn, nama, jenis, deskripsi, jadwal)
select s.npsn, v.nama, 'ekskul', v.d, v.j
  from (select npsn from public.sekolah order by npsn limit 1) s,
  (values
    ('Pramuka', 'Pendidikan kepanduan, kemandirian, dan kepemimpinan.', 'Jumat 14.00 sampai 16.00, lapangan upacara'),
    ('Palang Merah Remaja (PMR)', 'Pertolongan pertama, kesehatan remaja, dan kepedulian sosial.', 'Rabu 14.00 sampai 16.00, UKS'),
    ('Paskibra', 'Pasukan pengibar bendera dan baris-berbaris.', 'Selasa 14.00 sampai 16.00, lapangan upacara'),
    ('Rohis', 'Kerohanian Islam: kajian, tilawah, dan kegiatan keagamaan.', 'Kamis 14.00 sampai 15.30, musala'),
    ('Basket', 'Ekstrakurikuler bidang olahraga.', 'Senin 14.00 sampai 16.00, lapangan basket'),
    ('Futsal', 'Ekstrakurikuler bidang olahraga.', 'Rabu 14.00 sampai 16.00, lapangan futsal'),
    ('Pencak Silat', 'Bela diri dan pembinaan prestasi pencak silat.', 'Sabtu 08.00 sampai 10.00, aula'),
    ('Robotik', 'Rancang bangun robot, mikrokontroler, dan lomba robotik.', 'Kamis 14.00 sampai 16.00, laboratorium'),
    ('Jurnalistik', 'Menulis berita, fotografi, dan media sekolah.', 'Selasa 14.00 sampai 15.30, perpustakaan'),
    ('Paduan Suara', 'Olah vokal dan tampil pada acara sekolah.', 'Senin 14.00 sampai 15.30, ruang musik')
  ) as v (nama, d, j)
on conflict (npsn, nama) do nothing;

-- Struktur standar untuk semua ekskul tahun ajaran berjalan yang belum punya struktur.
do $$
declare r record;
begin
  for r in select e.id from public.ekskul e
            where not exists (select 1 from public.ekskul_struktur s where s.ekskul_id = e.id and s.tahun_ajaran = public.tahun_ajaran_sekarang())
  loop
    perform private.ekskul_struktur_buat(r.id, public.tahun_ajaran_sekarang());
  end loop;
end $$;
