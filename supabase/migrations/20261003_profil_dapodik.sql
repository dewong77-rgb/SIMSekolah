-- Profil lengkap bergaya formulir Dapodik (F-PTK dan F-PD), hanya baca.
-- Satu pintu: public.profil_dapodik(p_jenis, p_id). Data sensitif tidak dibuka lewat RLS tabel,
-- tetapi lewat fungsi ini yang memeriksa siapa penanyanya.
--
--   guru / tendik : profilnya sendiri (p_jenis kosong)
--   siswa / alumni: profilnya sendiri (p_jenis kosong)
--   orang tua     : p_jenis kosong -> daftar anak yang ditautkan; p_jenis 'siswa' + p_id -> profil anak (NIK dan KK disamarkan)
--   admin TU      : siapa pun di sekolahnya (p_jenis 'ptk' atau 'siswa' + p_id)
-- Akses ditolak dan data tidak ada sama-sama mengembalikan null. Rekening bank tidak pernah ikut.

create or replace function private.samar(t text) returns text
language sql immutable set search_path = '' as $$
  select case when t is null or btrim(t) = '' then null
              else repeat('•', greatest(length(t) - 4, 0)) || right(t, 4) end
$$;

create or replace function public.profil_dapodik(p_jenis text default null, p_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_peran text := private.peran_saya();
  v_npsn  text := private.npsn_saya();
  v_jenis text := p_jenis;
  v_id    uuid := p_id;
  v_sens  jsonb;
  v_hasil jsonb;
begin
  if v_peran is null then return null; end if;

  -- Tanpa parameter: pemilik akun melihat dirinya sendiri.
  if v_jenis is null then
    if v_peran = 'guru' then v_jenis := 'ptk'; v_id := private.ptk_id_saya();
    elsif v_peran = 'siswa' then v_jenis := 'siswa'; v_id := private.pd_id_saya();
    elsif v_peran = 'orang_tua' then
      return jsonb_build_object('jenis', 'daftar_anak', 'anak', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', p.id, 'nama', p.nama, 'nisn', p.nisn, 'status', p.status_peserta_didik,
                 'rombel', (select r.nama from public.keanggotaan_rombel k join public.rombel r on r.id = k.rombel_id
                            where k.peserta_didik_id = p.id and r.jenis_rombel = 'Kelas Utama'
                            order by r.semester_id desc limit 1)) order by p.nama)
        from public.peserta_didik p where p.id in (select private.anak_saya())), '[]'::jsonb));
    else return null; end if;
  end if;

  if v_id is null then return null; end if;

  if v_jenis = 'ptk' then
    if not ((v_peran = 'admin_tu') or (v_peran = 'guru' and v_id = private.ptk_id_saya())) then return null; end if;
    select to_jsonb(k) - 'kunci_identitas' - 'batch_id' - 'dibuat_pada' into v_hasil
      from public.ptk k where k.id = v_id and k.npsn = v_npsn;
    if v_hasil is null then return null; end if;
    select to_jsonb(s) - 'ptk_id' - 'bank' - 'nomor_rekening' - 'rekening_atas_nama' into v_sens
      from public.ptk_sensitif s where s.ptk_id = v_id;
    return jsonb_build_object(
      'jenis', 'ptk', 'data', v_hasil, 'sensitif', coalesce(v_sens, '{}'::jsonb), 'disamarkan', false,
      'wali_kelas_dari', coalesce((select jsonb_agg(r.nama order by r.nama) from public.rombel r
                                    where r.wali_kelas_ptk_id = v_id and r.jenis_rombel = 'Kelas Utama'
                                      and r.semester_id = (select max(semester_id) from public.rombel)), '[]'::jsonb));
  end if;

  if v_jenis = 'siswa' then
    if not (v_peran = 'admin_tu'
            or (v_peran = 'siswa' and v_id = private.pd_id_saya())
            or (v_peran = 'orang_tua' and v_id in (select private.anak_saya()))) then return null; end if;
    select to_jsonb(p) - 'kunci_identitas' - 'batch_id' - 'dibuat_pada' into v_hasil
      from public.peserta_didik p where p.id = v_id and p.npsn = v_npsn;
    if v_hasil is null then return null; end if;
    select to_jsonb(s) - 'peserta_didik_id' - 'bank' - 'nomor_rekening' - 'rekening_atas_nama' into v_sens
      from public.peserta_didik_sensitif s where s.peserta_didik_id = v_id;
    v_sens := coalesce(v_sens, '{}'::jsonb);
    if v_peran = 'orang_tua' then
      v_sens := coalesce((select jsonb_object_agg(key, case when key = 'penerima_kip' then to_jsonb(value) else to_jsonb(private.samar(value)) end)
                          from jsonb_each_text(v_sens)), '{}'::jsonb);
    end if;
    return jsonb_build_object(
      'jenis', 'siswa', 'data', v_hasil, 'sensitif', v_sens, 'disamarkan', v_peran = 'orang_tua',
      'orang_tua', coalesce((select jsonb_agg(to_jsonb(o) - 'id' - 'peserta_didik_id' - 'nik'
                                  order by case o.hubungan when 'ayah' then 1 when 'ibu' then 2 else 3 end)
                             from public.orang_tua_wali o where o.peserta_didik_id = v_id), '[]'::jsonb),
      'rombel', (select jsonb_build_object('nama', r.nama, 'tingkat', r.tingkat, 'kurikulum', r.kurikulum,
                                           'ruangan', r.ruangan, 'wali_kelas', r.wali_kelas_nama, 'semester', r.semester_id)
                 from public.keanggotaan_rombel k join public.rombel r on r.id = k.rombel_id
                 where k.peserta_didik_id = v_id and r.jenis_rombel = 'Kelas Utama'
                 order by r.semester_id desc limit 1));
  end if;

  return null;
end $$;

revoke execute on function public.profil_dapodik(text, uuid) from public, anon;
grant execute on function public.profil_dapodik(text, uuid) to authenticated;
revoke execute on function private.samar(text) from public, anon;
