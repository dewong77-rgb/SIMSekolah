// Peta kolom Dapodik ke medan basis data. Port dari dapodik_import.py (bagian 6).

export type Tipe = 'text' | 'date' | 'int' | 'num' | 'geo' | 'intlead'
export type Peta = Map<string, [string, Tipe]>

const T: Tipe = 'text'

function peta(entri: [string, string, Tipe][]): Peta {
  return new Map(entri.map(([label, medan, tipe]) => [label, [medan, tipe]]))
}

export const PD_MAIN = peta([
  ['nama', 'nama', T], ['nipd', 'nipd', T], ['jk', 'jk', T], ['nisn', 'nisn', T],
  ['tempat lahir', 'tempat_lahir', T], ['tanggal lahir', 'tanggal_lahir', 'date'],
  ['agama', 'agama', T], ['alamat', 'alamat', T], ['rt', 'rt', T], ['rw', 'rw', T],
  ['dusun', 'dusun', T], ['kelurahan', 'kelurahan', T], ['keluarahan', 'kelurahan', T],
  ['kecamatan', 'kecamatan', T], ['kode pos', 'kode_pos', T], ['jenis tinggal', 'jenis_tinggal', T],
  ['alat transportasi', 'alat_transportasi', T], ['telepon', 'telepon', T], ['hp', 'hp', T],
  ['e-mail', 'email', T], ['skhun', 'skhun', T], ['penerima kps', 'penerima_kps', T],
  ['kebutuhan khusus', 'kebutuhan_khusus', T], ['sekolah asal', 'sekolah_asal', T],
  ['anak ke-berapa', 'anak_ke', 'int'], ['lintang', 'lintang', 'geo'], ['bujur', 'bujur', 'geo'],
  ['berat badan', 'berat_badan', 'num'], ['tinggi badan', 'tinggi_badan', 'num'],
  ['lingkar kepala', 'lingkar_kepala', 'num'], ['jml. saudara kandung', 'jml_saudara_kandung', 'int'],
  ['jarak rumah ke sekolah (km)', 'jarak_rumah_km', 'num'],
  ['layak pip (usulan dari sekolah)', 'layak_pip', T], ['alasan layak pip', 'alasan_layak_pip', T],
])

export const PD_SENS = peta([
  ['nik', 'nik', T], ['no kk', 'no_kk', T], ['no. kps', 'no_kps', T], ['penerima kip', 'penerima_kip', T],
  ['nomor kip', 'nomor_kip', T], ['nama di kip', 'nama_di_kip', T], ['nomor kks', 'nomor_kks', T],
  ['no registrasi akta lahir', 'no_registrasi_akta_lahir', T],
  ['no peserta ujian nasional', 'no_peserta_ujian_nasional', T], ['no seri ijazah', 'no_seri_ijazah', T],
  ['bank', 'bank', T], ['nomor rekening bank', 'nomor_rekening', T],
  ['rekening atas nama', 'rekening_atas_nama', T],
])

export const PD_EXTRA = peta([
  ['rombel saat ini', '_rombel', T], ['keluar karena', 'alasan_keluar', T], ['tanggal keluar', 'tanggal_keluar', 'date'],
])

export const PD_ORTU: Peta = (() => {
  const m: Peta = new Map()
  for (const h of ['ayah', 'ibu', 'wali']) {
    for (const [lb, f, t] of [
      ['nama', 'nama', T], ['tahun lahir', 'tahun_lahir', 'int'], ['jenjang pendidikan', 'jenjang_pendidikan', T],
      ['pekerjaan', 'pekerjaan', T], ['penghasilan', 'penghasilan', T], ['nik', 'nik', T],
      ['kebutuhan khusus', 'kebutuhan_khusus', T],
    ] as [string, string, Tipe][]) {
      m.set(`data ${h}.${lb}`, [`${h}|${f}`, t])
    }
  }
  return m
})()

export const PTK_MAIN = peta([
  ['nama', 'nama', T], ['nuptk', 'nuptk', T], ['jk', 'jk', T], ['tempat lahir', 'tempat_lahir', T],
  ['tanggal lahir', 'tanggal_lahir', 'date'], ['nip', 'nip', T], ['status kepegawaian', 'status_kepegawaian', T],
  ['jenis ptk', 'jenis_ptk', T], ['agama', 'agama', T], ['alamat jalan', 'alamat_jalan', T],
  ['rt', 'rt', T], ['rw', 'rw', T], ['nama dusun', 'dusun', T], ['desa/kelurahan', 'kelurahan', T],
  ['kecamatan', 'kecamatan', T], ['kode pos', 'kode_pos', T], ['telepon', 'telepon', T], ['hp', 'hp', T],
  ['email', 'email', T], ['tugas tambahan', 'tugas_tambahan', T], ['sk cpns', 'sk_cpns', T],
  ['tanggal cpns', 'tanggal_cpns', 'date'], ['sk pengangkatan', 'sk_pengangkatan', T],
  ['tmt pengangkatan', 'tmt_pengangkatan', 'date'], ['lembaga pengangkatan', 'lembaga_pengangkatan', T],
  ['pangkat golongan', 'pangkat_golongan', T], ['sumber gaji', 'sumber_gaji', T],
  ['tmt pns', 'tmt_pns', 'date'], ['sudah lisensi kepala sekolah', 'sudah_lisensi_kepsek', T],
  ['pernah diklat kepengawasan', 'pernah_diklat_kepengawasan', T], ['keahlian braille', 'keahlian_braille', T],
  ['keahlian bahasa isyarat', 'keahlian_bahasa_isyarat', T], ['kewarganegaraan', 'kewarganegaraan', T],
  ['lintang', 'lintang', 'geo'], ['bujur', 'bujur', 'geo'], ['nuks', 'nuks', T],
])

export const PTK_SENS = peta([
  ['nik', 'nik', T], ['no kk', 'no_kk', T], ['npwp', 'npwp', T], ['nama wajib pajak', 'nama_wajib_pajak', T],
  ['bank', 'bank', T], ['nomor rekening bank', 'nomor_rekening', T],
  ['rekening atas nama', 'rekening_atas_nama', T], ['nama ibu kandung', 'nama_ibu_kandung', T],
  ['status perkawinan', 'status_perkawinan', T], ['nama suami/istri', 'nama_pasangan', T],
  ['nip suami/istri', 'nip_pasangan', T], ['pekerjaan suami/istri', 'pekerjaan_pasangan', T],
  ['karpeg', 'karpeg', T], ['karis/karsu', 'karis_karsu', T],
])

/** Lembar PTK di berkas profil. */
export const PTK_PROFIL = peta([
  ['nama', 'nama', T], ['nuptk', 'nuptk', T], ['jk', 'jk', T], ['tempat lahir', 'tempat_lahir', T],
  ['tanggal lahir', 'tanggal_lahir', 'date'], ['nip', 'nip', T], ['status kepegawaian', 'status_kepegawaian', T],
  ['jenis ptk', 'jenis_ptk', T],
  ['keterangan.gelar depan', 'gelar_depan', T], ['keterangan.gelar belakang', 'gelar_belakang', T],
  ['keterangan.jenjang', 'jenjang_pendidikan', T], ['keterangan.jurusan/prodi', 'jurusan_prodi', T],
  ['keterangan.sertifikasi', 'sertifikasi', T], ['keterangan.tmt kerja', 'tmt_kerja', 'date'],
  ['keterangan.tugas tambahan', 'tugas_tambahan', T], ['keterangan.mengajar', 'mengajar', T],
  ['keterangan.jam tugas tambahan', 'jam_tugas_tambahan', 'num'], ['keterangan.jjm', 'jjm', 'num'],
  ['keterangan.total jjm', 'total_jjm', 'num'], ['keterangan.siswa', 'jml_siswa', 'intlead'],
  ['keterangan.kompetensi', 'kompetensi', T], ['jabatan ptk', 'jabatan_ptk', T],
  ['nik', '_nik', T],
])

export const SEKOLAH_KV: Record<string, string> = {
  'nama sekolah': 'nama', npsn: 'npsn', 'jenjang pendidikan': 'jenjang', 'status sekolah': 'status_sekolah',
  'alamat sekolah': 'alamat', 'kode pos': 'kode_pos', kelurahan: 'kelurahan', kecamatan: 'kecamatan',
  'kabupaten/kota': 'kabupaten_kota', provinsi: 'provinsi', 'sk pendirian sekolah': 'sk_pendirian',
  'tanggal sk pendirian': 'tgl_sk_pendirian', 'status kepemilikan': 'status_kepemilikan',
  'sk izin operasional': 'sk_izin_operasional', 'tgl sk izin operasional': 'tgl_sk_izin_operasional',
  'nomor telepon': 'telepon', email: 'email', website: 'website',
  'waktu penyelenggaraan': 'waktu_penyelenggaraan', 'sumber listrik': 'sumber_listrik',
  'total daya listrik (watt)': 'daya_listrik_watt', 'akses internet': 'akses_internet',
}

export const PROFIL_ROMBEL = peta([
  ['nama rombel', 'nama', T], ['tingkat kelas', 'tingkat', 'int'], ['jumlah siswa.l', 'l', 'int'],
  ['jumlah siswa.p', 'p', 'int'], ['jumlah siswa.total', 'total', 'int'], ['wali kelas', 'wali', T],
  ['kurikulum', 'kurikulum', T], ['ruangan', 'ruangan', T],
])

export const SNAPSHOT_PROFIL: { lembar: string; tabel: string; jangkar: string[]; peta: Peta; kunci: string }[] = [
  {
    lembar: 'Prasarana', tabel: 'prasarana', jangkar: ['nama prasarana'], kunci: 'nama prasarana',
    peta: peta([
      ['nama prasarana', 'nama_prasarana', T], ['keterangan', 'keterangan', T], ['panjang', 'panjang', 'num'],
      ['lebar', 'lebar', 'num'], ['status kepemilikan', 'status_kepemilikan', T],
    ]),
  },
  {
    lembar: 'Sarana', tabel: 'sarana', jangkar: ['jenis sarana'], kunci: 'jenis sarana',
    peta: peta([
      ['jenis sarana', 'jenis_sarana', T], ['letak', 'letak', T], ['kepemilikan', 'kepemilikan', T],
      ['spesifikasi', 'spesifikasi', T], ['jumlah', 'jumlah', 'num'], ['laik', 'laik', 'num'],
      ['tidak laik', 'tidak_laik', 'num'],
    ]),
  },
  {
    lembar: 'Blockgrant', tabel: 'bantuan_sekolah', jangkar: ['jenis bantuan'], kunci: 'jenis bantuan',
    peta: peta([
      ['tahun', 'tahun', 'int'], ['jenis bantuan', 'jenis_bantuan', T], ['sumber bantuan', 'sumber_bantuan', T],
      ['besar bantuan', 'besar_bantuan', 'num'], ['dana pendamping', 'dana_pendamping', 'num'],
      ['peruntukan dana', 'peruntukan_dana', T],
    ]),
  },
]

export const SMK_KOMPETENSI = peta([
  ['bidang keahlian', 'bidang_keahlian', T], ['program keahlian', 'program_keahlian', T],
  ['kompetensi keahlian', 'kompetensi_keahlian', T], ['sk izin', 'sk_izin', T],
  ['tanggal izin', 'tanggal_izin', 'date'], ['jumlah pendaftar ppdb', 'jumlah_pendaftar_ppdb', 'int'],
])

export const SMK_DUDI = peta([
  ['nama', 'nama', T], ['bidang usaha', 'bidang_usaha', T], ['alamat', 'alamat', T], ['rt', 'rt', T], ['rw', 'rw', T],
  ['nama dusun', 'dusun', T], ['desa kelurahan', 'desa_kelurahan', T], ['kecamatan/ kabupaten', 'kecamatan_kabupaten', T],
  ['kode pos', 'kode_pos', T], ['lintang', 'lintang', 'geo'], ['bujur', 'bujur', 'geo'], ['no telpon', 'telepon', T],
  ['fax', 'fax', T], ['email', 'email', T], ['website', 'website', T], ['npwp', 'npwp', T],
])

export const SMK_MOU = peta([
  ['jenis kerjasama', 'jenis_kerjasama', T], ['dunia usaha/ industri', 'nama_dudi_sumber', T],
  ['nomor mou', 'nomor_mou', T], ['judul mou', 'judul_mou', T], ['tgl mulai', 'tgl_mulai', 'date'],
  ['tgl selesai', 'tgl_selesai', 'date'], ['npwp dudi', 'npwp_dudi', T], ['nama bidang usaha', 'nama_bidang_usaha', T],
  ['telp kantor', 'telp_kantor', T], ['fax', 'fax', T], ['contact person', 'contact_person', T],
  ['telpon contact person', 'telp_contact_person', T], ['jabatan contact person', 'jabatan_contact_person', T],
])

export const SMK_UNIT_PRODUKSI = peta([
  ['kompetensi keahlian', 'kompetensi_keahlian', T], ['kelompok produksi', 'kelompok_produksi', T],
  ['nama unit produksi', 'nama_unit_produksi', T],
])

export const SMK_PRAKTIK = peta([
  ['nama dudi', 'nama_dudi', T], ['no mou kerjasama', 'no_mou_kerjasama', T], ['tanggal mulai', 'tanggal_mulai', 'date'],
  ['tanggal selesai', 'tanggal_selesai', 'date'], ['jenis aktivitas', 'jenis_aktivitas', T],
  ['judul aktivitas', 'judul_aktivitas', T], ['sk tugas', 'sk_tugas', T], ['tanggal tugas', 'tanggal_tugas', 'date'],
  ['nama pembimbing i', 'nama_pembimbing_1', T], ['nama pembimbing ii', 'nama_pembimbing_2', T],
  ['nama siswa', 'nama_siswa', T], ['tingkat pendidikan', 'tingkat_pendidikan', T], ['rombel siswa', 'rombel_siswa', T],
])
