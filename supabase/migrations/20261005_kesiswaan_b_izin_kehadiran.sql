-- Modul Kesiswaan, bagian B: izin siswa (sakit, izin, dispensasi, izin keluar) dan kehadiran harian.
-- Kehadiran harian belum ada di sistem (absensi LMS hanya mencatat "hadir" per pertemuan), maka dicatat di sini.
-- Aturan: izin yang disetujui mengalahkan catatan petugas pada hari yang sama. Sabtu dan Minggu tidak dihitung.
-- Hari libur nasional belum dikecualikan; petugas cukup tidak mengisi kehadiran pada hari itu.

create table if not exists public.izin_siswa (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah (npsn),
  peserta_didik_id uuid not null references public.peserta_didik (id),
  rombel_id uuid references public.rombel (id),
  jenis text not null check (jenis in ('sakit','izin','dispensasi','izin_keluar')),
  tgl_mulai date not null,
  tgl_selesai date not null,
  jam_keluar time,
  jam_kembali time,
  alasan text not null check (char_length(alasan) between 3 and 500),
  lampiran_url text check (lampiran_url is null or lampiran_url ~* '^https://'),
  status text not null default 'diajukan' check (status in ('diajukan','disetujui','ditolak','dibatalkan')),
  diajukan_oleh uuid not null,
  diajukan_nama text,
  diputuskan_oleh uuid,
  diputuskan_pada timestamptz,
  catatan_keputusan text check (catatan_keputusan is null or char_length(catatan_keputusan) <= 500),
  dibuat_pada timestamptz not null default now(),
  check (tgl_selesai >= tgl_mulai and tgl_selesai - tgl_mulai <= 60),
  check (jenis <> 'izin_keluar' or (tgl_mulai = tgl_selesai and jam_keluar is not null))
);
alter table public.izin_siswa enable row level security;
create index if not exists izin_pd_idx on public.izin_siswa (peserta_didik_id, tgl_mulai);
create index if not exists izin_status_idx on public.izin_siswa (status, tgl_mulai);

create table if not exists public.kehadiran_harian (
  peserta_didik_id uuid not null references public.peserta_didik (id),
  tanggal date not null,
  rombel_id uuid references public.rombel (id),
  status text not null check (status in ('hadir','sakit','izin','dispensasi','alpa','terlambat')),
  dicatat_oleh uuid,
  diperbarui_pada timestamptz not null default now(),
  primary key (peserta_didik_id, tanggal)
);
alter table public.kehadiran_harian enable row level security;
create index if not exists kehadiran_tgl_idx on public.kehadiran_harian (tanggal, rombel_id);

-- Status akhir per siswa per hari: izin disetujui (hari kerja, selain izin keluar) mengalahkan catatan petugas.
create or replace function private.kes_status_hari(p_dari date, p_sampai date)
returns table (pd uuid, tanggal date, status text)
language sql stable security definer set search_path = '' as $$
  select distinct on (x.pd, x.tanggal) x.pd, x.tanggal, x.status
    from (
      select i.peserta_didik_id as pd, d::date as tanggal, i.jenis as status, 1 as pri
        from public.izin_siswa i
        cross join lateral generate_series(greatest(i.tgl_mulai, p_dari), least(i.tgl_selesai, p_sampai), interval '1 day') d
       where i.status = 'disetujui' and i.jenis <> 'izin_keluar' and extract(isodow from d) < 6
      union all
      select k.peserta_didik_id, k.tanggal, k.status, 2
        from public.kehadiran_harian k
       where k.tanggal between p_dari and p_sampai
    ) x
   order by x.pd, x.tanggal, x.pri
$$;

-- ---------------------------------------------------------------- izin
create or replace function public.izin_ajukan(
  p_pd uuid, p_jenis text, p_mulai date, p_selesai date, p_alasan text,
  p_jam_keluar time default null, p_jam_kembali time default null, p_lampiran_url text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_hari date := private.kes_hari();
  v_petugas boolean := private.kes_pd_boleh(array['kesiswaan.izin'], p_pd);
  v_sendiri boolean := (p_pd is not null and (p_pd = private.pd_id_saya() or p_pd in (select private.anak_saya())));
  v_pd public.peserta_didik%rowtype;
  v_alasan text := btrim(coalesce(p_alasan, ''));
  v_lampiran text := nullif(btrim(coalesce(p_lampiran_url, '')), '');
  v_selesai date := coalesce(p_selesai, p_mulai);
  v_mundur int := case when private.kes_pd_boleh(array['kesiswaan.izin'], p_pd) then 60 else 14 end;
  v_id uuid;
begin
  if auth.uid() is null or not (v_petugas or v_sendiri) then raise exception 'Anda tidak berwenang mengajukan izin untuk siswa ini.'; end if;
  select * into v_pd from public.peserta_didik where id = p_pd;
  if not found or v_pd.status_peserta_didik <> 'aktif' then raise exception 'Siswa tidak ditemukan atau sudah tidak aktif.'; end if;
  if p_jenis not in ('sakit','izin','dispensasi','izin_keluar') then raise exception 'Jenis izin tidak dikenal.'; end if;
  if p_mulai is null then raise exception 'Tanggal mulai wajib diisi.'; end if;
  if v_selesai < p_mulai then raise exception 'Tanggal selesai tidak boleh sebelum tanggal mulai.'; end if;
  if v_selesai - p_mulai > 60 then raise exception 'Rentang izin maksimal 60 hari.'; end if;
  if p_mulai < v_hari - v_mundur then raise exception 'Tanggal terlalu lampau.'; end if;
  if p_mulai > v_hari + 90 then raise exception 'Tanggal terlalu jauh ke depan.'; end if;
  if char_length(v_alasan) < 3 or char_length(v_alasan) > 500 then raise exception 'Alasan 3 sampai 500 karakter.'; end if;
  if v_lampiran is not null and v_lampiran !~* '^https://' then raise exception 'Tautan lampiran harus diawali https://.'; end if;
  if p_jenis = 'izin_keluar' then
    if v_selesai <> p_mulai then raise exception 'Izin keluar hanya untuk satu hari.'; end if;
    if p_jam_keluar is null then raise exception 'Jam keluar wajib diisi.'; end if;
    if p_jam_kembali is not null and p_jam_kembali <= p_jam_keluar then raise exception 'Jam kembali harus setelah jam keluar.'; end if;
  elsif exists (
    select 1 from public.izin_siswa i
     where i.peserta_didik_id = p_pd and i.jenis <> 'izin_keluar' and i.status in ('diajukan','disetujui')
       and i.tgl_mulai <= v_selesai and i.tgl_selesai >= p_mulai) then
    raise exception 'Sudah ada izin pada tanggal yang beririsan.';
  end if;
  insert into public.izin_siswa (npsn, peserta_didik_id, rombel_id, jenis, tgl_mulai, tgl_selesai, jam_keluar, jam_kembali, alasan, lampiran_url,
                                 status, diajukan_oleh, diajukan_nama, diputuskan_oleh, diputuskan_pada)
  values (v_pd.npsn, p_pd, private.kes_rombel_pd(p_pd), p_jenis, p_mulai, v_selesai,
          case when p_jenis = 'izin_keluar' then p_jam_keluar end, case when p_jenis = 'izin_keluar' then p_jam_kembali end,
          v_alasan, v_lampiran,
          case when v_petugas then 'disetujui' else 'diajukan' end, auth.uid(), private.lms_nama_saya(),
          case when v_petugas then auth.uid() end, case when v_petugas then now() end)
  returning id into v_id;
  perform private.kes_audit('izin_siswa', 'AJUKAN', jsonb_build_object('id', v_id, 'pd', p_pd, 'jenis', p_jenis, 'mulai', p_mulai, 'selesai', v_selesai, 'petugas', v_petugas));
  return v_id;
end $$;

-- Izin milik siswa yang masuk, atau milik anak (semua anak bila p_pd kosong).
create or replace function public.izin_saya(p_pd uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Silakan masuk terlebih dahulu.'; end if;
  if p_pd is not null and not (p_pd = private.pd_id_saya() or p_pd in (select private.anak_saya())) then
    raise exception 'Anda tidak berwenang melihat izin siswa ini.';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', i.id, 'pd', i.peserta_didik_id, 'nama', pd.nama, 'jenis', i.jenis, 'tgl_mulai', i.tgl_mulai, 'tgl_selesai', i.tgl_selesai,
            'jam_keluar', i.jam_keluar, 'jam_kembali', i.jam_kembali, 'alasan', i.alasan, 'lampiran_url', i.lampiran_url, 'status', i.status,
            'catatan_keputusan', i.catatan_keputusan, 'dibuat_pada', i.dibuat_pada, 'bisa_batal', (i.status = 'diajukan'))
            order by i.tgl_mulai desc, i.dibuat_pada desc), '[]'::jsonb)
            from public.izin_siswa i join public.peserta_didik pd on pd.id = i.peserta_didik_id
           where (p_pd is null or i.peserta_didik_id = p_pd)
             and (i.peserta_didik_id = private.pd_id_saya() or i.peserta_didik_id in (select private.anak_saya())));
end $$;

create or replace function public.izin_batalkan(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.izin_siswa%rowtype;
begin
  select * into v from public.izin_siswa where id = p_id;
  if not found then raise exception 'Izin tidak ditemukan.'; end if;
  if auth.uid() is null or not (
       (v.diajukan_oleh = auth.uid() and v.status = 'diajukan')
       or (v.status in ('diajukan','disetujui') and private.kes_pd_boleh(array['kesiswaan.izin'], v.peserta_didik_id))) then
    raise exception 'Izin ini tidak dapat Anda batalkan.';
  end if;
  update public.izin_siswa set status = 'dibatalkan', diputuskan_oleh = coalesce(diputuskan_oleh, auth.uid()), diputuskan_pada = coalesce(diputuskan_pada, now()) where id = p_id;
  perform private.kes_audit('izin_siswa', 'BATAL', jsonb_build_object('id', p_id));
end $$;

create or replace function public.izin_daftar(p_status text default null, p_rombel uuid default null, p_hari_ini boolean default false,
                                              p_cari text default null, p_batas int default 100, p_mulai int default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_semua boolean := private.kes_semua(array['kesiswaan.izin']);
  v_rombel uuid[] := private.kes_rombel_saya(array['kesiswaan.izin']);
  v_hari date := private.kes_hari();
  v_cari text := nullif(btrim(coalesce(p_cari, '')), '');
  v_batas int := least(greatest(coalesce(p_batas, 100), 1), 300);
begin
  if auth.uid() is null or not (v_semua or cardinality(v_rombel) > 0) then raise exception 'Anda tidak berwenang membuka daftar izin siswa.'; end if;
  if p_status is not null and p_status not in ('diajukan','disetujui','ditolak','dibatalkan') then raise exception 'Status tidak dikenal.'; end if;
  return (
    with f as (
      select i.*, pd.nama as pd_nama, pd.nisn as pd_nisn, r.nama as r_nama
        from public.izin_siswa i
        join public.peserta_didik pd on pd.id = i.peserta_didik_id
        left join public.rombel r on r.id = i.rombel_id
       where i.npsn = private.npsn_saya()
         and (v_semua or i.rombel_id = any (v_rombel))
         and (p_status is null or i.status = p_status)
         and (p_rombel is null or i.rombel_id = p_rombel)
         and (not coalesce(p_hari_ini, false) or (i.tgl_mulai <= v_hari and i.tgl_selesai >= v_hari))
         and (v_cari is null or pd.nama ilike '%' || v_cari || '%' or pd.nisn = v_cari)),
    hal as (
      select * from f order by (status = 'diajukan') desc, tgl_mulai desc, dibuat_pada desc
       limit v_batas offset greatest(coalesce(p_mulai, 0), 0))
    select jsonb_build_object(
      'total', (select count(*) from f),
      'baris', coalesce((select jsonb_agg(jsonb_build_object(
          'id', h.id, 'pd', h.peserta_didik_id, 'nama', h.pd_nama, 'nisn', h.pd_nisn, 'rombel', h.r_nama, 'rombel_id', h.rombel_id,
          'jenis', h.jenis, 'tgl_mulai', h.tgl_mulai, 'tgl_selesai', h.tgl_selesai, 'jam_keluar', h.jam_keluar, 'jam_kembali', h.jam_kembali,
          'alasan', h.alasan, 'lampiran_url', h.lampiran_url, 'status', h.status, 'diajukan_nama', h.diajukan_nama,
          'catatan_keputusan', h.catatan_keputusan, 'dibuat_pada', h.dibuat_pada)
          order by (h.status = 'diajukan') desc, h.tgl_mulai desc, h.dibuat_pada desc) from hal h), '[]'::jsonb)));
end $$;

create or replace function public.izin_putuskan(p_id uuid, p_setuju boolean, p_catatan text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.izin_siswa%rowtype;
  v_c text := nullif(btrim(coalesce(p_catatan, '')), '');
begin
  select * into v from public.izin_siswa where id = p_id for update;
  if not found then raise exception 'Izin tidak ditemukan.'; end if;
  if auth.uid() is null or not private.kes_pd_boleh(array['kesiswaan.izin'], v.peserta_didik_id) then raise exception 'Anda tidak berwenang memutuskan izin ini.'; end if;
  if v.status <> 'diajukan' then raise exception 'Izin ini sudah diputuskan.'; end if;
  if p_setuju is null then raise exception 'Keputusan wajib dipilih.'; end if;
  if not p_setuju and v_c is null then raise exception 'Alasan penolakan wajib diisi.'; end if;
  if v_c is not null and char_length(v_c) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  update public.izin_siswa set status = case when p_setuju then 'disetujui' else 'ditolak' end, diputuskan_oleh = auth.uid(), diputuskan_pada = now(), catatan_keputusan = v_c where id = p_id;
  perform private.kes_audit('izin_siswa', case when p_setuju then 'SETUJU' else 'TOLAK' end, jsonb_build_object('id', p_id));
end $$;

-- ---------------------------------------------------------------- kehadiran harian
create or replace function public.kehadiran_rombel(p_rombel uuid, p_tanggal date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tgl date := coalesce(p_tanggal, private.kes_hari());
begin
  if auth.uid() is null or not (private.kes_semua(array['kesiswaan.izin']) or p_rombel = any (private.kes_rombel_saya(array['kesiswaan.izin']))) then
    raise exception 'Anda tidak berwenang membuka kehadiran rombel ini.';
  end if;
  if not exists (select 1 from public.rombel where id = p_rombel and npsn = private.npsn_saya()) then raise exception 'Rombel tidak ditemukan.'; end if;
  return jsonb_build_object(
    'tanggal', v_tgl,
    'hari_kerja', extract(isodow from v_tgl) < 6,
    'siswa', (select coalesce(jsonb_agg(jsonb_build_object(
        'pd', pd.id, 'nama', pd.nama, 'nisn', pd.nisn, 'no_urut', k.no_urut,
        'status', s.status,
        'dari_izin', exists (select 1 from public.izin_siswa i where i.peserta_didik_id = pd.id and i.status = 'disetujui' and i.jenis <> 'izin_keluar'
                              and i.tgl_mulai <= v_tgl and i.tgl_selesai >= v_tgl),
        'izin_keluar', (select jsonb_build_object('jam_keluar', i.jam_keluar, 'jam_kembali', i.jam_kembali, 'alasan', i.alasan)
                          from public.izin_siswa i where i.peserta_didik_id = pd.id and i.status = 'disetujui' and i.jenis = 'izin_keluar' and i.tgl_mulai = v_tgl
                         order by i.jam_keluar limit 1))
        order by k.no_urut nulls last, pd.nama), '[]'::jsonb)
        from public.keanggotaan_rombel k join public.peserta_didik pd on pd.id = k.peserta_didik_id and pd.status_peserta_didik = 'aktif'
        left join private.kes_status_hari(v_tgl, v_tgl) s on s.pd = pd.id
       where k.rombel_id = p_rombel));
end $$;

create or replace function public.kehadiran_simpan(p_rombel uuid, p_tanggal date, p_baris jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_hari date := private.kes_hari();
  v_n int := 0;
  v_mundur int := case when private.kes_waka() then 90 else 14 end;
  e jsonb;
  v_pd uuid;
  v_st text;
begin
  if auth.uid() is null or not (private.kes_semua(array['kesiswaan.izin']) or p_rombel = any (private.kes_rombel_saya(array['kesiswaan.izin']))) then
    raise exception 'Anda tidak berwenang mengisi kehadiran rombel ini.';
  end if;
  if not exists (select 1 from public.rombel where id = p_rombel and npsn = private.npsn_saya()) then raise exception 'Rombel tidak ditemukan.'; end if;
  if p_tanggal is null or p_tanggal > v_hari then raise exception 'Tanggal tidak boleh di masa depan.'; end if;
  if p_tanggal < v_hari - v_mundur then raise exception 'Tanggal terlalu lampau untuk diubah.'; end if;
  if extract(isodow from p_tanggal) >= 6 then raise exception 'Sabtu dan Minggu bukan hari sekolah.'; end if;
  if p_baris is null or jsonb_typeof(p_baris) <> 'array' or jsonb_array_length(p_baris) = 0 or jsonb_array_length(p_baris) > 60 then
    raise exception 'Data kehadiran tidak valid.';
  end if;
  for e in select * from jsonb_array_elements(p_baris) loop
    begin
      v_pd := (e->>'pd')::uuid;
    exception when others then raise exception 'Data kehadiran tidak valid.';
    end;
    v_st := e->>'status';
    if v_st is null or v_st not in ('hadir','sakit','izin','dispensasi','alpa','terlambat') then raise exception 'Status kehadiran tidak dikenal.'; end if;
    if not exists (select 1 from public.keanggotaan_rombel where rombel_id = p_rombel and peserta_didik_id = v_pd) then
      raise exception 'Ada siswa yang bukan anggota rombel ini.';
    end if;
    insert into public.kehadiran_harian (peserta_didik_id, tanggal, rombel_id, status, dicatat_oleh)
    values (v_pd, p_tanggal, p_rombel, v_st, auth.uid())
    on conflict (peserta_didik_id, tanggal) do update set status = excluded.status, rombel_id = excluded.rombel_id, dicatat_oleh = excluded.dicatat_oleh, diperbarui_pada = now();
    v_n := v_n + 1;
  end loop;
  perform private.kes_audit('kehadiran_harian', 'SIMPAN', jsonb_build_object('rombel', p_rombel, 'tanggal', p_tanggal, 'jumlah', v_n));
  return v_n;
end $$;

-- Rekap per siswa pada rentang tanggal (maksimal 93 hari). Tanpa p_rombel: semua rombel dalam jangkauan pemanggil.
create or replace function public.kehadiran_rekap(p_dari date, p_sampai date, p_rombel uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_semua boolean := private.kes_semua(array['kesiswaan.izin','kesiswaan.pantau']);
  v_rombel uuid[] := private.kes_rombel_saya(array['kesiswaan.izin','kesiswaan.pantau']);
begin
  if auth.uid() is null or not (v_semua or cardinality(v_rombel) > 0) then raise exception 'Anda tidak berwenang membuka rekap kehadiran.'; end if;
  if p_dari is null or p_sampai is null or p_sampai < p_dari or p_sampai - p_dari > 93 then raise exception 'Rentang tanggal 1 sampai 93 hari.'; end if;
  if p_rombel is not null and not (v_semua or p_rombel = any (v_rombel)) then raise exception 'Anda tidak berwenang membuka rombel ini.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'pd', t.pd, 'nama', t.nama, 'nisn', t.nisn, 'rombel', t.rombel, 'tercatat', t.tercatat, 'hadir', t.hadir, 'terlambat', t.terlambat,
      'sakit', t.sakit, 'izin', t.izin, 'dispensasi', t.dispensasi, 'alpa', t.alpa) order by t.rombel, t.nama), '[]'::jsonb)
    from (
      select pd.id as pd, pd.nama, pd.nisn, r.nama as rombel,
             count(s.status) as tercatat,
             count(*) filter (where s.status = 'hadir') as hadir, count(*) filter (where s.status = 'terlambat') as terlambat,
             count(*) filter (where s.status = 'sakit') as sakit, count(*) filter (where s.status = 'izin') as izin,
             count(*) filter (where s.status = 'dispensasi') as dispensasi, count(*) filter (where s.status = 'alpa') as alpa
        from public.keanggotaan_rombel k
        join public.rombel r on r.id = k.rombel_id and r.npsn = private.npsn_saya()
        join public.peserta_didik pd on pd.id = k.peserta_didik_id and pd.status_peserta_didik = 'aktif'
        left join private.kes_status_hari(p_dari, p_sampai) s on s.pd = pd.id
       where (p_rombel is null or k.rombel_id = p_rombel) and (v_semua or k.rombel_id = any (v_rombel))
         and (p_rombel is not null or r.jenis_rombel ilike '%utama%')
       group by pd.id, pd.nama, pd.nisn, r.nama) t);
end $$;

-- ---------------------------------------------------------------- hak eksekusi
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (array[
       'izin_ajukan','izin_saya','izin_batalkan','izin_daftar','izin_putuskan','kehadiran_rombel','kehadiran_simpan','kehadiran_rekap'])
  loop
    execute format('revoke all on function %s from public, anon', r.f);
    execute format('grant execute on function %s to authenticated', r.f);
  end loop;
end $$;
