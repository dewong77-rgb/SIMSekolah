-- Pembina GDS: ikut mengisi kehadiran dan terlambat (kesiswaan.izin).
-- Pembina OSIS Eksternal: hanya melihat (izin baru ekskul.lihat), tanpa mengubah anggota atau pertemuan.

insert into public.izin (kode, nama, bidang) values
  ('ekskul.lihat', 'Melihat ekstrakurikuler yang didampingi (tanpa mengubah)', 'Kesiswaan')
on conflict (kode) do nothing;

insert into public.jabatan_izin (jabatan_kode, izin_kode) values
  ('pembina_gds', 'kesiswaan.izin'),
  ('pembina_osis_eksternal', 'ekskul.lihat')
on conflict do nothing;
delete from public.jabatan_izin where jabatan_kode = 'pembina_osis_eksternal' and izin_kode = 'ekskul.kelola';

-- Boleh melihat satu ekskul: yang boleh mengelola, atau pemegang ekskul.lihat berlingkup nama ekskul itu.
create or replace function private.kes_lihat_ekskul(p_ekskul uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    private.kes_boleh_ekskul(p_ekskul)
    or exists (
      select 1 from public.ekskul e
       where e.id = p_ekskul and e.npsn = private.npsn_saya()
         and (private.punya_izin('ekskul.lihat', e.nama)
              or exists (
                select 1 from public.penugasan p join public.jabatan_izin ji on ji.jabatan_kode = p.jabatan_kode and ji.izin_kode = 'ekskul.lihat'
                 where p.ptk_id = private.ptk_id_saya() and p.status = 'aktif' and p.tahun_ajaran = public.tahun_ajaran_sekarang()
                   and lower(btrim(p.lingkup_id)) = lower(btrim(e.nama)))))
  )
$$;

create or replace function public.ekskul_daftar() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_semua boolean := private.kes_semua(array['ekskul.kelola']);
  v_ta text := public.tahun_ajaran_sekarang();
  v_ada boolean;
begin
  if auth.uid() is null then raise exception 'Silakan masuk terlebih dahulu.'; end if;
  select exists (select 1 from public.ekskul e where e.npsn = private.npsn_saya() and private.kes_lihat_ekskul(e.id)) into v_ada;
  if not (v_semua or v_ada) then raise exception 'Anda tidak berwenang membuka data ekstrakurikuler.'; end if;
  return jsonb_build_object(
    'bisa_atur', v_semua,
    'tahun_ajaran', v_ta,
    'ekskul', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'nama', e.nama, 'jenis', e.jenis, 'deskripsi', e.deskripsi, 'jadwal', e.jadwal, 'aktif', e.aktif,
        'pembina_ptk_id', e.pembina_ptk_id, 'pembina', p.nama,
        'bisa_ubah', private.kes_boleh_ekskul(e.id),
        'anggota', (select count(*) from public.ekskul_anggota a where a.ekskul_id = e.id and a.tahun_ajaran = v_ta and a.aktif),
        'pertemuan', (select count(*) from public.ekskul_pertemuan t where t.ekskul_id = e.id and t.tanggal >= current_date - 120))
        order by e.jenis desc, e.nama), '[]'::jsonb)
        from public.ekskul e left join public.ptk p on p.id = e.pembina_ptk_id
       where e.npsn = private.npsn_saya() and (e.aktif or v_semua) and (v_semua or private.kes_lihat_ekskul(e.id))));
end $$;

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
    'pertemuan', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'tanggal', t.tanggal, 'topik', t.topik,
        'hadir', (select count(*) from public.ekskul_kehadiran h where h.pertemuan_id = t.id and h.hadir),
        'total', (select count(*) from public.ekskul_kehadiran h where h.pertemuan_id = t.id)) order by t.tanggal desc), '[]'::jsonb)
        from (select * from public.ekskul_pertemuan where ekskul_id = p_id order by tanggal desc limit 40) t));
end $$;

create or replace function public.ekskul_pertemuan_buka(p_pertemuan uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v public.ekskul_pertemuan%rowtype;
begin
  select * into v from public.ekskul_pertemuan where id = p_pertemuan;
  if not found then raise exception 'Pertemuan tidak ditemukan.'; end if;
  if auth.uid() is null or not private.kes_lihat_ekskul(v.ekskul_id) then raise exception 'Anda tidak berwenang membuka pertemuan ini.'; end if;
  return jsonb_build_object('id', v.id, 'tanggal', v.tanggal, 'topik', v.topik,
    'anggota', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'nama', pd.nama, 'hadir', h.hadir) order by pd.nama), '[]'::jsonb)
                  from public.ekskul_kehadiran h join public.ekskul_anggota a on a.id = h.anggota_id
                  join public.peserta_didik pd on pd.id = a.peserta_didik_id where h.pertemuan_id = v.id));
end $$;

-- Daftar izin untuk menu: tambahkan ekskul.lihat bila hanya boleh melihat.
create or replace function public.kesiswaan_izin() returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hasil text[] := '{}';
  k text;
begin
  if auth.uid() is null then return v_hasil; end if;
  foreach k in array array['kesiswaan.catat','kesiswaan.verifikasi','kesiswaan.pantau','kesiswaan.izin','kesiswaan.beasiswa','ekskul.kelola'] loop
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

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (array['ekskul_daftar','ekskul_detail','ekskul_pertemuan_buka','kesiswaan_izin'])
  loop
    execute format('revoke all on function %s from public, anon', r.f);
    execute format('grant execute on function %s to authenticated', r.f);
  end loop;
end $$;
