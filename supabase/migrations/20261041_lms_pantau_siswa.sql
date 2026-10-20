-- LMS: log masuk siswa per kelas. Untuk satu rombel pada satu tanggal dan jam pelajaran: siapa sudah masuk LMS, kapan pertama dan terakhir,
-- serta ringkasan sepanjang hari (masuk pertama jam berapa, aktif di jam pelajaran ke berapa saja). Memerlukan 20261040_lms_pantau_per_jam.sql.

create or replace function public.lms_pantau_siswa(p_rombel uuid, p_tanggal date default null, p_jam integer default 1) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_tgl date := coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date);
begin
  if not (private.adalah_super() or private.punya_izin('lms.pantau_guru')) then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.rombel r where r.id = p_rombel and (private.adalah_super() or r.npsn = private.npsn_saya())) then
    raise exception 'Rombel tidak ditemukan.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('tanggal', v_tgl, 'jam', p_jam, 'siswa', coalesce((
    select jsonb_agg(jsonb_build_object(
        'peserta_didik_id', pd.id, 'nama', pd.nama, 'nisn', pd.nisn, 'no_urut', kr.no_urut,
        'masuk', dj.pertama is not null, 'pertama', dj.pertama, 'terakhir', dj.terakhir, 'jumlah', dj.jumlah,
        'pertama_hari', hr.pertama, 'terakhir_hari', hr.terakhir, 'jam_aktif', coalesce(hr.jam_aktif, '[]'::jsonb)
      ) order by kr.no_urut nulls last, pd.nama)
    from public.keanggotaan_rombel kr
    join public.peserta_didik pd on pd.id = kr.peserta_didik_id and pd.status_peserta_didik = 'aktif'
    left join public.lms_denyut_jam dj on dj.jenis = 'pd' and dj.pelaku_id = pd.id and dj.tanggal = v_tgl and dj.jam_ke = p_jam
    left join lateral (
      select min(d.pertama) pertama, max(d.terakhir) terakhir,
             (select coalesce(jsonb_agg(x.jam_ke order by x.jam_ke), '[]'::jsonb)
                from public.lms_denyut_jam x
               where x.jenis = 'pd' and x.pelaku_id = pd.id and x.tanggal = v_tgl and x.jam_ke > 0) jam_aktif
        from public.lms_denyut_jam d
       where d.jenis = 'pd' and d.pelaku_id = pd.id and d.tanggal = v_tgl) hr on true
    where kr.rombel_id = p_rombel), '[]'::jsonb));
end $$;
revoke all on function public.lms_pantau_siswa(uuid, date, integer) from public, anon;
grant execute on function public.lms_pantau_siswa(uuid, date, integer) to authenticated;

notify pgrst, 'reload schema';
