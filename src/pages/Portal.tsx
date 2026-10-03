import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman, { Segera } from '../components/Halaman'
import { useAuth } from '../auth/AuthContext'
import { supabase, type Peran } from '../lib/supabase'

const namaPeran: Record<Peran, string> = {
  admin_tu: 'Admin TU',
  guru: 'Guru',
  siswa: 'Siswa',
  orang_tua: 'Orang tua',
}

// Menu tambahan dari izin penugasan. Halaman modul menyusul, kecuali yang sudah punya tautan.
const menuIzin: { izin: string; nama: string; bidang: string; to?: string }[] = [
  { izin: 'hubin.kelola_dudi', nama: 'Kelola DU/DI dan MoU', bidang: 'Hubungan industri' },
  { izin: 'hubin.kelola_humas', nama: 'Informasi dan kehumasan', bidang: 'Hubungan industri' },
  { izin: 'kurikulum.atur_jadwal', nama: 'Jadwal pelajaran', bidang: 'Kurikulum' },
  { izin: 'kurikulum.kalender', nama: 'Kalender akademik', bidang: 'Kurikulum' },
  { izin: 'kurikulum.kelola_info', nama: 'Informasi akademik', bidang: 'Kurikulum' },
  { izin: 'program.kelola', nama: 'Program keahlian', bidang: 'Kurikulum' },
  { izin: 'kesiswaan.kelola', nama: 'Kesiswaan', bidang: 'Kesiswaan' },
  { izin: 'kelas.kelola', nama: 'Kelas saya', bidang: 'Kelas' },
  { izin: 'ekskul.kelola', nama: 'Ekstrakurikuler saya', bidang: 'Kesiswaan' },
  { izin: 'sarpras.kelola', nama: 'Sarana dan prasarana', bidang: 'Sarpras' },
  { izin: 'lab.kelola', nama: 'Bengkel dan laboratorium', bidang: 'Sarpras' },
  { izin: 'perpus.kelola', nama: 'Perpustakaan', bidang: 'Perpustakaan' },
  { izin: 'laporan.lihat', nama: 'Laporan sekolah', bidang: 'Pimpinan' },
]

const menuPeran: Record<Peran, string[]> = {
  admin_tu: ['Ajuan perbaikan', 'Unggah Dapodik', 'Riwayat unggah', 'Peserta didik', 'Guru dan tendik', 'Rombel', 'Pengguna dan akun'],
  guru: ['Profil saya', 'Ajuan saya', 'Daftar siswa', 'Rombel', 'Data PTK', 'Absensi', 'LMS'],
  siswa: ['Data saya', 'Ajuan saya', 'Kelas saya', 'LMS'],
  orang_tua: ['Anak saya', 'Ajuan saya', 'Kelas anak'],
}

const tautanMenu: Record<string, [string, string | null, string]> = {
  'Profil saya': ['/portal/data-saya', null, 'Data pribadi dan kepegawaian seperti di Dapodik'],
  'Data saya': ['/portal/data-saya', null, 'Identitas, alamat, orang tua, dan kelas Anda'],
  'Ajuan saya': ['/portal/ajuan', null, 'Perbaikan data yang diajukan dan keputusannya'],
  'Ajuan perbaikan': ['/portal/ajuan-masuk', null, 'Setujui atau tolak ajuan perbaikan data'],
  'Anak saya': ['/portal/anak', null, 'Profil anak yang ditautkan ke akun Anda'],
  'Unggah Dapodik': ['/portal/unggah', null, 'Unggah berkas ekspor Dapodik'],
  'Riwayat unggah': ['/portal/riwayat', null, 'Berkas yang pernah diunggah dan ringkasannya'],
  'Peserta didik': ['/portal/peserta-didik', null, 'Aktif, lulus, dan mutasi, lengkap dengan pencarian'],
  'Daftar siswa': ['/portal/peserta-didik', null, 'Siswa aktif per kelas'],
  'Guru dan tendik': ['/portal/ptk', null, 'Pendidik dan tenaga kependidikan'],
  'Data PTK': ['/portal/ptk', null, 'Pendidik dan tenaga kependidikan'],
  'Rombel': ['/portal/rombel', null, 'Kelas, wali kelas, dan anggota'],
  'Pengguna dan akun': ['/portal/akun', 'Akun guru', 'Daftarkan akun dari data PTK'],
}

export default function Portal() {
  const { session, profil, superAdmin, penugasan, keluar } = useAuth()
  const [menunggu, setMenunggu] = useState<number | null>(null)
  const tu = profil?.peran === 'admin_tu'
  useEffect(() => {
    if (!tu) return
    supabase.rpc('ajuan_daftar', { p_status: 'menunggu' }).then(({ data }) => setMenunggu(Array.isArray(data) ? data.length : null))
  }, [tu])
  if (!profil) return null
  const izinSaya = new Set(penugasan.flatMap((p) => p.izin))
  const tugasMenu = menuIzin.filter((m) => izinSaya.has(m.izin))

  return (
    <Halaman judul="Portal" lead={`Masuk sebagai ${namaPeran[profil.peran]}.`}>
      <div className="kartu">
        <dl className="daftar">
          <dt>Email</dt><dd>{session?.user.email}</dd>
          <dt>Peran</dt><dd>{namaPeran[profil.peran]}{superAdmin ? ' (super admin)' : ''}</dd>
          <dt>NPSN</dt><dd>{profil.npsn}</dd>
        </dl>
        <div className="aksi jarak">
          <button className="tombol tombol-isi" onClick={keluar}>Keluar</button>
          {profil.peran !== 'siswa'
            ? <Link to="/portal/profil" className="tombol" style={{ color: 'var(--warna-utama)' }}>Profil dan password</Link>
            : <Link to="/portal/ganti-sandi" className="tombol" style={{ color: 'var(--warna-utama)' }}>Ganti password</Link>}
          <Link to="/" className="tombol" style={{ color: 'var(--warna-utama)' }}>Ke beranda</Link>
        </div>
      </div>
      {penugasan.length > 0 && (
        <div className="kartu jarak">
          <h3>Tugas saya</h3>
          <ul className="label-tugas">
            {penugasan.map((p, i) => (
              <li key={i}><strong>{p.jabatan_nama}</strong>{p.lingkup_label ? <small>: {p.lingkup_label}</small> : null}</li>
            ))}
          </ul>
          <p className="catatan">Menu tugas muncul di bagian bawah halaman ini sesuai penugasan tahun ajaran berjalan.</p>
        </div>
      )}
      <div className="judul-bagian jarak"><h2>Menu {namaPeran[profil.peran]}</h2></div>
      <div className="grid grid-3">
        {superAdmin && (
          <Link to="/portal/pengguna" className="kartu tautan"><h3>Kelola pengguna</h3><small>Lihat akun guru dan siswa, ubah peran, nonaktifkan</small></Link>
        )}
        {superAdmin && (
          <Link to="/portal/penugasan" className="kartu tautan"><h3>Penugasan</h3><small>Jabatan tambahan, lingkup, dan struktur organisasi</small></Link>
        )}
        {menuPeran[profil.peran].map((m) => {
          const t = tautanMenu[m]
          return t ? (
            <Link key={m} to={t[0]} className="kartu tautan"><h3>{t[1] ?? m}</h3><small>{m === 'Ajuan perbaikan' && menunggu !== null ? (menunggu > 0 ? `${menunggu} ajuan menunggu keputusan` : 'Tidak ada ajuan yang menunggu') : t[2]}</small></Link>
          ) : <Segera key={m} nama={m} />
        })}
      </div>
      {tugasMenu.length > 0 && (
        <>
          <div className="judul-bagian jarak"><h2>Menu tugas</h2></div>
          <div className="grid grid-3">
            {tugasMenu.map((m) => m.to
              ? <Link key={m.izin} to={m.to} className="kartu tautan"><small>{m.bidang}</small><h3>{m.nama}</h3></Link>
              : <Segera key={m.izin} nama={`${m.nama} (${m.bidang})`} />)}
          </div>
        </>
      )}
    </Halaman>
  )
}
