-- Perangkat ajar boleh berisi berkas unggahan di Google Drive (lewat tabel berkas).
-- Dijalankan sekali di Supabase SQL Editor. Aman diulang? Tidak: baris drop function akan gagal bila sudah pernah dijalankan.

alter table public.perangkat_ajar drop constraint perangkat_ajar_check;
alter table public.perangkat_ajar add constraint perangkat_ajar_check
  check (isi is not null or url is not null or berkas_id is not null);

drop index if exists public.perangkat_ajar_berkas_idx;
create unique index perangkat_ajar_berkas_uniq on public.perangkat_ajar (berkas_id) where berkas_id is not null;

drop function public.lms_perangkat_simpan(uuid, uuid, text, text, text, text);

create function public.lms_perangkat_simpan(
  p_id uuid, p_kelas uuid, p_jenis text, p_judul text, p_isi text, p_url text, p_berkas uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_ptk uuid := private.ptk_id_saya(); v_id uuid;
begin
  if v_ptk is null then raise exception 'Hanya untuk guru.' using errcode = '42501'; end if;
  if btrim(coalesce(p_judul, '')) = '' then raise exception 'Judul wajib diisi.' using errcode = '22023'; end if;
  if btrim(coalesce(p_isi, '')) = '' and btrim(coalesce(p_url, '')) = '' and p_berkas is null then
    raise exception 'Isi dokumen, tautan, atau unggah berkas.' using errcode = '22023'; end if;
  if btrim(coalesce(p_url, '')) <> '' and btrim(p_url) !~* '^https://' then raise exception 'Tautan harus diawali https://.' using errcode = '22023'; end if;
  if p_kelas is not null and not exists (select 1 from public.kelas_ajar where id = p_kelas and ptk_id = v_ptk) then
    raise exception 'Kelas ajar bukan milik Anda.' using errcode = '42501';
  end if;
  if p_berkas is not null and not exists (
      select 1 from public.berkas b
      where b.id = p_berkas and b.pemilik_user_id = auth.uid() and b.kategori = 'perangkat_ajar' and b.status = 'tersimpan'
        and not exists (select 1 from public.perangkat_ajar x where x.berkas_id = p_berkas and x.id is distinct from p_id)) then
    raise exception 'Berkas tidak valid atau sudah dipakai dokumen lain.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.perangkat_ajar (npsn, ptk_id, kelas_ajar_id, jenis, judul, isi, url, berkas_id)
    values (private.npsn_saya(), v_ptk, p_kelas, p_jenis, btrim(p_judul), nullif(btrim(coalesce(p_isi, '')), ''), nullif(btrim(coalesce(p_url, '')), ''), p_berkas)
    returning id into v_id;
  else
    update public.perangkat_ajar set kelas_ajar_id = p_kelas, jenis = p_jenis, judul = btrim(p_judul),
      isi = nullif(btrim(coalesce(p_isi, '')), ''), url = nullif(btrim(coalesce(p_url, '')), ''), berkas_id = p_berkas, diubah_pada = now()
    where id = p_id and ptk_id = v_ptk and not dihapus
    returning id into v_id;
    if v_id is null then raise exception 'Dokumen tidak ditemukan.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

revoke execute on function public.lms_perangkat_simpan(uuid, uuid, text, text, text, text, uuid) from public, anon;
grant execute on function public.lms_perangkat_simpan(uuid, uuid, text, text, text, text, uuid) to authenticated;

create or replace function public.lms_perangkat_daftar(p_ptk uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_admin boolean := private.peran_saya() = 'admin_tu' or private.adalah_super();
        v_ptk uuid := private.ptk_id_saya();
begin
  if not v_admin and v_ptk is null then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id, 'jenis', d.jenis, 'judul', d.judul, 'isi', d.isi, 'url', d.url,
      'kelas_ajar_id', d.kelas_ajar_id,
      'kelas', (select k.mapel || ' ' || r.nama from public.kelas_ajar k join public.rombel r on r.id = k.rombel_id where k.id = d.kelas_ajar_id),
      'guru', p.nama, 'milik_saya', d.ptk_id = v_ptk, 'diubah_pada', d.diubah_pada,
      'berkas_id', b.id, 'berkas_nama', b.nama_asli, 'berkas_ukuran', b.ukuran
    ) order by d.jenis, d.diubah_pada desc)
    from public.perangkat_ajar d join public.ptk p on p.id = d.ptk_id
    left join public.berkas b on b.id = d.berkas_id and b.status = 'tersimpan'
    where not d.dihapus
      and ((not v_admin and d.ptk_id = v_ptk)
        or (v_admin and (private.adalah_super() or d.npsn = private.npsn_saya()) and (p_ptk is null or d.ptk_id = p_ptk)))), '[]'::jsonb);
end $$;
