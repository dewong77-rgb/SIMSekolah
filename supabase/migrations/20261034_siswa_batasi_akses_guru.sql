-- Pembatasan akses guru ke data siswa (prinsip: hanya yang perlu tahu).
-- Sebelumnya policy guru_baca mengizinkan setiap guru membaca semua siswa aktif sekolahnya.
-- Kini guru hanya membaca siswa pada rombel yang (a) ia ajar (kelas_ajar aktif), (b) ia walikan (rombel.wali_kelas_ptk_id),
-- atau (c) dicakup izin siswa.lihat_pribadi dari jabatan selain guru_wali (kepala sekolah, waka kesiswaan, TU kesiswaan: semua siswa;
-- wali_kelas: sesuai lingkup rombel). Jabatan guru_wali belum dipakai efektif di sekolah dan tidak dihitung.
-- Admin TU tidak berubah (policy tu_semua). Fungsi LMS dan kesiswaan berjalan sebagai definer sehingga tidak terpengaruh.
-- Pemulihan bila perlu:
--   drop policy guru_baca on public.peserta_didik;
--   create policy guru_baca on public.peserta_didik for select to authenticated
--     using (((select private.peran_saya()) = 'guru') and npsn = (select private.npsn_saya()) and status_peserta_didik = 'aktif');

create or replace function private.guru_boleh_lihat_siswa(p_pd uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.adalah_super()
    or exists (
      select 1 from public.keanggotaan_rombel kr
      where kr.peserta_didik_id = p_pd
        and (exists (select 1 from public.kelas_ajar k
                     where k.rombel_id = kr.rombel_id and k.ptk_id = private.ptk_id_saya() and k.aktif)
          or exists (select 1 from public.rombel r
                     where r.id = kr.rombel_id and r.wali_kelas_ptk_id = private.ptk_id_saya())))
    or exists (
      select 1 from public.penugasan p
      join public.jabatan_izin ji on ji.jabatan_kode = p.jabatan_kode
      where p.ptk_id = private.ptk_id_saya()
        and p.status = 'aktif'
        and p.tahun_ajaran = public.tahun_ajaran_sekarang()
        and ji.izin_kode = 'siswa.lihat_pribadi'
        and p.jabatan_kode <> 'guru_wali'
        and (coalesce(p.lingkup_id, '') = ''
             or exists (select 1 from public.keanggotaan_rombel k2
                        where k2.peserta_didik_id = p_pd and k2.rombel_id::text = p.lingkup_id)))
$$;
revoke all on function private.guru_boleh_lihat_siswa(uuid) from public, anon;
grant execute on function private.guru_boleh_lihat_siswa(uuid) to authenticated;

-- Memakai alter policy: policy guru_baca sudah ada. (drop lalu create policy pada tabel ini menggantung lewat alat migrasi MCP.)
alter policy guru_baca on public.peserta_didik
  using (((select private.peran_saya()) = 'guru')
         and npsn = (select private.npsn_saya())
         and status_peserta_didik = 'aktif'
         and private.guru_boleh_lihat_siswa(id));
