-- SPMI, isian bawaan: indikator per standar (dengan berkas bukti di kolom sumber_data) dan daftar dokumen mutu.
-- Disesuaikan untuk SMK. Hanya Ketua SPMI (spmi.kelola) yang dapat memanggil. Aman dipanggil berulang: baris yang sudah ada tidak digandakan.

create or replace function public.spmi_siapkan_indikator() returns integer
language plpgsql security definer set search_path = '' as $fn$
declare v_n integer;
begin
  if not private.punya_izin('spmi.kelola', null) then
    raise exception 'Hanya Ketua SPMI yang dapat menyiapkan indikator.' using errcode = '42501';
  end if;

  with bawaan(kode, uraian, target, satuan, sumber_data) as (values
    ('SKL', 'Profil lulusan dan capaian kompetensi tiap program keahlian ditetapkan', 'Ada', null, 'SK profil lulusan; matriks capaian kompetensi'),
    ('SKL', 'Peserta didik tuntas kompetensi keahlian', '90', '%', 'Rekap nilai; sertifikat uji kompetensi (UKK/LSP)'),
    ('SKL', 'Lulusan terlacak (bekerja, studi lanjut, wirausaha)', '80', '%', 'Data tracer study; rekap BKK'),
    ('SKL', 'Profil Pelajar Pancasila tercapai', 'Ada', null, 'Rapor P5; catatan karakter'),
    ('SKL', 'Literasi dan numerasi peserta didik memadai', 'Naik per tahun', null, 'Rapor Pendidikan; hasil ANBK'),

    ('ISI', 'KOSP (kurikulum operasional satuan pendidikan) disusun dan disahkan', 'Ada', null, 'Dokumen KOSP; SK pengesahan'),
    ('ISI', 'Struktur kurikulum dan pembagian jam sesuai ketentuan', 'Sesuai', null, 'Struktur kurikulum; pembagian jam pelajaran'),
    ('ISI', 'Capaian Pembelajaran dipetakan ke Tujuan dan Alur Tujuan Pembelajaran', '100', '% mapel', 'Dokumen ATP; matriks CP'),
    ('ISI', 'Kurikulum disinkronkan dengan dunia usaha dan industri', '1', 'kali/tahun', 'Berita acara sinkronisasi; MoU DUDI'),
    ('ISI', 'Kalender pendidikan ditetapkan', 'Ada', null, 'Kalender sekolah'),

    ('PROS', 'Modul ajar tersedia untuk setiap guru dan mata pelajaran', '100', '%', 'Arsip modul ajar'),
    ('PROS', 'Jadwal pelajaran dan pembagian tugas mengajar ditetapkan', 'Ada', null, 'Jadwal pelajaran; SK pembagian tugas'),
    ('PROS', 'Pembelajaran berbasis proyek atau teaching factory berjalan', 'Berjalan', null, 'Jurnal mengajar; dokumentasi; laporan TEFA'),
    ('PROS', 'Supervisi pembelajaran terlaksana dan ditindaklanjuti', '1', 'kali/guru/semester', 'Instrumen supervisi; laporan; tindak lanjut'),
    ('PROS', 'PKL terlaksana sesuai prosedur', '100', '% peserta didik', 'Surat tugas; jurnal PKL; laporan PKL; MoU'),
    ('PROS', 'Presensi dan jurnal kelas terisi', '100', '%', 'Rekap presensi; jurnal harian'),

    ('PEN', 'Pedoman penilaian ditetapkan', 'Ada', null, 'SK atau pedoman penilaian'),
    ('PEN', 'Asesmen formatif dan sumatif dilaksanakan dan dianalisis', '100', '% mapel', 'Kisi-kisi; soal; analisis hasil'),
    ('PEN', 'Kriteria ketercapaian tujuan pembelajaran (KKTP) ditetapkan', '100', '% mapel', 'Dokumen KKTP'),
    ('PEN', 'Rapor disusun tepat waktu', '100', '%', 'Rapor; e-rapor; berita acara'),
    ('PEN', 'Uji kompetensi keahlian terlaksana', '1', 'kali/tahun', 'SK panitia; daftar peserta; laporan UKK'),
    ('PEN', 'Hasil asesmen ditindaklanjuti (remedial dan pengayaan)', '100', '%', 'Catatan remedial dan pengayaan'),

    ('GTK', 'Kualifikasi dan kompetensi guru sesuai bidang', '100', '%', 'Ijazah; sertifikat pendidik; Dapodik'),
    ('GTK', 'Guru produktif tercukupi untuk tiap program keahlian', 'Cukup', null, 'Analisis kebutuhan guru; rekap beban mengajar'),
    ('GTK', 'Beban kerja guru terpenuhi', '24', 'jam/minggu', 'SK pembagian tugas; rekap beban mengajar'),
    ('GTK', 'Guru mengikuti pengembangan kompetensi', '1', 'kali/guru/tahun', 'Sertifikat pelatihan; rekap PMM dan KKG'),
    ('GTK', 'Kinerja guru dievaluasi', '100', '%', 'Dokumen PMM atau PKG; hasil penilaian'),
    ('GTK', 'Tenaga kependidikan memadai (TU, laboran, pustakawan)', 'Cukup', null, 'SK penugasan; uraian tugas'),

    ('SAR', 'Inventaris sarana dan prasarana mutakhir', 'Ada', null, 'Buku inventaris; data sarpras Dapodik'),
    ('SAR', 'Lahan dan bangunan memiliki bukti kepemilikan dan perizinan', 'Ada', null, 'Sertifikat atau bukti kepemilikan; PBG'),
    ('SAR', 'Ruang praktik, bengkel, atau laboratorium sesuai program keahlian', 'Sesuai', null, 'Daftar peralatan; foto; rasio alat'),
    ('SAR', 'Perawatan dan perbaikan terjadwal', '100', '% terlaksana', 'Jadwal dan catatan pemeliharaan'),
    ('SAR', 'Keselamatan dan kesehatan kerja (K3) diterapkan', 'Ada', null, 'SOP K3; APAR; rambu; simulasi'),
    ('SAR', 'Akses internet dan perangkat digital tersedia', 'Tersedia', null, 'Data perangkat; kontrak internet'),

    ('KEL', 'Visi, misi, tujuan, dan program sekolah ditetapkan', 'Ada', null, 'Dokumen visi-misi; SK'),
    ('KEL', 'Rencana kerja jangka menengah dan tahunan disusun', 'Ada', null, 'RKJM; RKT; RKAS'),
    ('KEL', 'Struktur organisasi dan pedoman pengelolaan ditetapkan', 'Ada', null, 'Bagan organisasi; pedoman sekolah; SK'),
    ('KEL', 'Tata tertib dan kode etik ditetapkan', 'Ada', null, 'Dokumen tata tertib'),
    ('KEL', 'Komite sekolah dan kemitraan berfungsi', '2', 'rapat/tahun', 'SK komite; notulen rapat; MoU'),
    ('KEL', 'Evaluasi diri dan Rapor Pendidikan dipakai untuk perencanaan', '1', 'kali/tahun', 'Dokumen EDS; notulen pembahasan'),
    ('KEL', 'Arsip dan data satuan pendidikan terkelola', 'Tertib', null, 'Arsip surat; cadangan data Dapodik'),

    ('BIA', 'RKAS disusun dan disahkan', 'Ada', null, 'RKAS; SK pengesahan'),
    ('BIA', 'Penggunaan dana BOS sesuai petunjuk teknis', '100', '%', 'Laporan BOS; bukti belanja'),
    ('BIA', 'Laporan keuangan disampaikan tepat waktu dan transparan', '100', '%', 'Laporan realisasi; LPJ'),
    ('BIA', 'Anggaran mendukung prioritas mutu', 'Ada', null, 'Matriks RKAS terhadap prioritas Rapor Pendidikan'),
    ('BIA', 'Sumber dana lain (DUDI, alumni, hibah) tercatat', 'Tercatat', null, 'Catatan dan bukti penerimaan')
  )
  insert into public.spmi_indikator (npsn, standar_id, uraian, target, satuan, sumber_data)
  select private.npsn_saya(), s.id, b.uraian, b.target, b.satuan, b.sumber_data
  from bawaan b
  join public.spmi_standar s on s.npsn = private.npsn_saya() and s.kode = b.kode
  where not exists (
    select 1 from public.spmi_indikator i where i.standar_id = s.id and i.uraian = b.uraian
  );
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

-- Daftar dokumen mutu yang perlu ada. Dibuat tanpa tautan; Ketua atau anggota tim melengkapi nomor, tahun, dan tautan berkas.
create or replace function public.spmi_siapkan_dokumen() returns integer
language plpgsql security definer set search_path = '' as $fn$
declare v_n integer;
begin
  if not private.punya_izin('spmi.kelola', null) then
    raise exception 'Hanya Ketua SPMI yang dapat menyiapkan daftar dokumen.' using errcode = '42501';
  end if;

  with bawaan(jenis, judul, catatan) as (values
    ('kebijakan', 'SK kebijakan mutu satuan pendidikan', 'Komitmen kepala sekolah; memuat visi, misi, dan sasaran mutu'),
    ('kebijakan', 'SK Tim Penjaminan Mutu Internal', 'Susunan Ketua dan Anggota SPMI beserta uraian tugas'),
    ('manual', 'Manual pemetaan mutu', 'Prosedur analisis Rapor Pendidikan, Dapodik, dan evaluasi diri'),
    ('manual', 'Manual perencanaan pemenuhan mutu', 'Prosedur menetapkan prioritas masalah, akar masalah, dan target ke RKT dan RKAS'),
    ('manual', 'Manual pelaksanaan pemenuhan mutu', 'Prosedur pelaksanaan program perbaikan dan pencatatan bukti'),
    ('manual', 'Manual monitoring dan evaluasi', 'Prosedur pengukuran capaian terhadap target dan audit mutu internal'),
    ('manual', 'Manual penetapan standar baru', 'Prosedur peningkatan standar dan revisi target'),
    ('standar', 'Standar Kompetensi Lulusan', null),
    ('standar', 'Standar Isi', null),
    ('standar', 'Standar Proses', null),
    ('standar', 'Standar Penilaian', null),
    ('standar', 'Standar Pendidik dan Tenaga Kependidikan', null),
    ('standar', 'Standar Sarana dan Prasarana', null),
    ('standar', 'Standar Pengelolaan', null),
    ('standar', 'Standar Pembiayaan', null),
    ('formulir', 'Instrumen evaluasi diri sekolah', null),
    ('formulir', 'Formulir monitoring dan evaluasi', null),
    ('formulir', 'Formulir audit mutu internal', null),
    ('formulir', 'Formulir tindak lanjut dan rekomendasi', null),
    ('laporan', 'Laporan pemetaan mutu', 'Peta mutu dan daftar kesenjangan'),
    ('laporan', 'Laporan monitoring dan evaluasi mutu', 'Capaian indikator terhadap target'),
    ('laporan', 'Notulen rapat tinjauan mutu', 'Bukti pembahasan hasil dan penetapan standar baru')
  )
  insert into public.spmi_dokumen (npsn, jenis, judul, catatan)
  select private.npsn_saya(), b.jenis, b.judul,
         trim(both ' ' from concat_ws('. ', b.catatan, 'Belum diunggah: lengkapi nomor, tahun, dan tautan berkas'))
  from bawaan b
  where not exists (
    select 1 from public.spmi_dokumen d where d.npsn = private.npsn_saya() and d.jenis = b.jenis and d.judul = b.judul
  );
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

revoke all on function public.spmi_siapkan_indikator() from public, anon;
grant execute on function public.spmi_siapkan_indikator() to authenticated;
revoke all on function public.spmi_siapkan_dokumen() from public, anon;
grant execute on function public.spmi_siapkan_dokumen() to authenticated;
