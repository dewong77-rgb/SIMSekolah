-- Penyempurnaan formulir Dapodik (setelah tahap 1b dan 3):
--  * rombel_formulir_data memuat NIP wali kelas, untuk cetakan Jadwal Pembelajaran.
--  * Penghasilan bulanan ayah, ibu, dan wali (F-PD butir 33, 40, 47) masuk katalog dengan skala formulir resmi.
--    Data hidup memakai dua skala Dapodik yang berbeda; nilai lama tetap boleh dibiarkan, dan kolom ini hanya bisa
--    ditutup operator dengan centang (dari_dapodik = false).
--  * Luas tanah, bangunan, dan ruang dihitung otomatis dari panjang x lebar di formulir_simpan (lihat 20261015_formulir_rinci_d_fungsi.sql).

create or replace function public.rombel_formulir_data(p_ta text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when private.kur_boleh_lihat() then coalesce((
    select jsonb_agg(jsonb_build_object(
             'rombel_id', r.id, 'rombel', r.nama, 'tingkat', r.tingkat, 'kurikulum', r.kurikulum, 'ruangan', r.ruangan,
             'wali', coalesce(pd.nama, r.wali_kelas_nama), 'wali_nip', pd.nip,
             'jumlah_siswa', coalesce(r.jumlah_l_profil, 0) + coalesce(r.jumlah_p_profil, 0),
             'program', private.kur_program(r.nama),
             'kompetensi_keahlian', r.kompetensi_keahlian, 'moving_class', r.moving_class, 'melayani_kebutuhan_khusus', r.melayani_kebutuhan_khusus,
             'pembelajaran', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'beban_id', b.id, 'mapel', m.nama, 'kelompok', m.kelompok, 'ptk', p.nama, 'jp', b.jp,
                        'sk_mengajar', b.sk_mengajar, 'tanggal_sk', b.tanggal_sk) order by m.urutan, m.nama, p.nama)
                 from public.kur_beban b
                 join public.kur_mapel m on m.id = b.mapel_id
                 join public.ptk p on p.id = b.ptk_id
                where b.rombel_id = r.id), '[]'::jsonb))
           order by r.tingkat, r.nama)
      from public.rombel r
      join public.semester s on s.semester_id = r.semester_id and s.tahun_ajaran = p_ta
      left join public.ptk pd on pd.id = r.wali_kelas_ptk_id
     where r.jenis_rombel = 'Kelas Utama' and r.npsn = private.npsn_saya()), '[]'::jsonb) else null end
$$;

insert into public.kolom_ajuan
  (jenis, kunci, tabel, kolom, hubungan, label, kelompok, tipe, tipe_sql, pilihan, pola, wajib, butuh_dokumen, urutan, butir, bantuan, jalur, dari_dapodik, terapkan)
select 'siswa', h.hub || '.penghasilan', 'orang_tua_wali', 'penghasilan', h.hub, 'Penghasilan bulanan', h.judul, 'pilihan', 'text',
       '["Tidak Berpenghasilan","< Rp 500.000","Rp 500.000 - Rp 999.999","Rp 1.000.000 - Rp 1.999.999","Rp 2.000.000 - Rp 4.999.999","Rp 5.000.000 - Rp 20.000.000","> Rp 20.000.000"]'::jsonb,
       null, false, false, h.urut + 6, (h.awal + 5)::text,
       'Rentang penghasilan menurut formulir Dapodik. Kosongkan bila tidak bekerja. Nilai lama dari Dapodik yang memakai skala berbeda tetap boleh dibiarkan.',
       'langsung', false, true
from (values ('ayah','Data ayah kandung',200,28), ('ibu','Data ibu kandung',220,35), ('wali','Data wali',240,42)) as h(hub, judul, urut, awal)
on conflict (jenis, kunci) do update set label = excluded.label, kelompok = excluded.kelompok, pilihan = excluded.pilihan, urutan = excluded.urutan,
  butir = excluded.butir, bantuan = excluded.bantuan, jalur = excluded.jalur, dari_dapodik = excluded.dari_dapodik;
