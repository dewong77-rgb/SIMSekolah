-- Ekspor biodata peserta didik dan PTK dalam bentuk data mentah untuk dijadikan berkas Excel berformat Dapodik (disusun di peramban).
-- SECURITY INVOKER seperti fungsi unggah Dapodik: RLS tetap berlaku, hanya admin TU (atau super admin) untuk sekolahnya sendiri.
-- Setiap ekspor dicatat di audit_log karena memuat data pribadi (NIK, nomor rekening, dan sebagainya).

-- Pencatat audit dengan hak definer: pengguna biasa tidak punya hak tulis langsung ke audit_log.
create or replace function private.catat_ekspor(p_tabel text, p_ringkasan jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (user_id, tabel, aksi, ringkasan) values (auth.uid(), p_tabel, 'EKSPOR', p_ringkasan)
$$;
revoke execute on function private.catat_ekspor(text, jsonb) from public, anon;
grant execute on function private.catat_ekspor(text, jsonb) to authenticated;

create or replace function public.ekspor_peserta_didik(p_status text default 'aktif') returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_npsn text := private.npsn_saya(); v_hasil jsonb;
begin
  if not (private.adalah_super() or private.peran_saya() = 'admin_tu') then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if p_status not in ('aktif', 'keluar', 'semua') then raise exception 'Status tidak dikenal.' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(
           (to_jsonb(p) - 'kunci_identitas' - 'batch_id')
           || coalesce(to_jsonb(s) - 'peserta_didik_id' - 'kunci_identitas' - 'batch_id' - 'id', '{}'::jsonb)
           || jsonb_build_object(
                '_rombel', (select r.nama from public.keanggotaan_rombel kr join public.rombel r on r.id = kr.rombel_id
                             where kr.peserta_didik_id = p.id and r.jenis_rombel = 'Kelas Utama'
                             order by r.semester_id desc limit 1),
                '_ortu', coalesce((select jsonb_object_agg(o.hubungan, to_jsonb(o) - 'peserta_didik_id' - 'hubungan' - 'id' - 'kunci_identitas' - 'batch_id')
                                     from public.orang_tua_wali o where o.peserta_didik_id = p.id), '{}'::jsonb))
           order by p.nama), '[]'::jsonb)
    into v_hasil
    from public.peserta_didik p
    left join public.peserta_didik_sensitif s on s.peserta_didik_id = p.id
   where (private.adalah_super() or p.npsn = v_npsn)
     and (p_status = 'semua' or (p_status = 'aktif' and p.status_peserta_didik = 'aktif') or (p_status = 'keluar' and p.status_peserta_didik <> 'aktif'));
  perform private.catat_ekspor('peserta_didik', jsonb_build_object('status', p_status, 'jumlah', jsonb_array_length(v_hasil)));
  return v_hasil;
end $$;

-- p_jenis: 'guru' (jenis PTK Guru), 'tendik' (selain Guru), atau 'semua'.
create or replace function public.ekspor_ptk(p_jenis text default 'semua') returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_npsn text := private.npsn_saya(); v_hasil jsonb;
begin
  if not (private.adalah_super() or private.peran_saya() = 'admin_tu') then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if p_jenis not in ('guru', 'tendik', 'semua') then raise exception 'Jenis tidak dikenal.' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(
           (to_jsonb(k) - 'kunci_identitas' - 'batch_id')
           || coalesce(to_jsonb(s) - 'ptk_id' - 'kunci_identitas' - 'batch_id' - 'id', '{}'::jsonb)
           order by k.nama), '[]'::jsonb)
    into v_hasil
    from public.ptk k
    left join public.ptk_sensitif s on s.ptk_id = k.id
   where (private.adalah_super() or k.npsn = v_npsn)
     and (p_jenis = 'semua' or (p_jenis = 'guru' and k.jenis_ptk = 'Guru') or (p_jenis = 'tendik' and coalesce(k.jenis_ptk, '') <> 'Guru'));
  perform private.catat_ekspor('ptk', jsonb_build_object('jenis', p_jenis, 'jumlah', jsonb_array_length(v_hasil)));
  return v_hasil;
end $$;

revoke all on function public.ekspor_peserta_didik(text) from public, anon;
revoke all on function public.ekspor_ptk(text) from public, anon;
grant execute on function public.ekspor_peserta_didik(text) to authenticated;
grant execute on function public.ekspor_ptk(text) to authenticated;

notify pgrst, 'reload schema';
