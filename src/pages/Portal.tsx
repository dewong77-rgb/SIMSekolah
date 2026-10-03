import { Link } from 'react-router-dom'
import Halaman, { Segera } from '../components/Halaman'
import { useAuth } from '../auth/AuthContext'
import type { Peran } from '../lib/supabase'

const namaPeran: Record<Peran, string> = {
  admin_tu: 'Admin TU',
  guru: 'Guru',
  siswa: 'Siswa',
  orang_tua: 'Orang tua',
}

const menuPeran: Record<Peran, string[]> = {
  admin_tu: ['Unggah Dapodik', 'Riwayat unggah', 'Peserta didik', 'Guru dan tendik', 'Rombel', 'Pengguna dan akun'],
  guru: ['Daftar siswa', 'Rombel', 'Data PTK', 'Absensi', 'LMS'],
  siswa: ['Data saya', 'Kelas saya', 'LMS'],
  orang_tua: ['Anak saya', 'Kelas anak'],
}

const tautanMenu: Record<string, [string, string | null, string]> = {
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
  const { session, profil, superAdmin, keluar } = useAuth()
  if (!profil) return null

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
          {profil.peran !== 'siswa' && <Link to="/portal/profil" className="tombol" style={{ color: 'var(--warna-utama)' }}>Profil dan password</Link>}
          <Link to="/" className="tombol" style={{ color: 'var(--warna-utama)' }}>Ke beranda</Link>
        </div>
      </div>
      <div className="judul-bagian jarak"><h2>Menu {namaPeran[profil.peran]}</h2></div>
      <div className="grid grid-3">
        {superAdmin && (
          <Link to="/portal/pengguna" className="kartu tautan"><h3>Kelola pengguna</h3><small>Lihat akun guru dan siswa, ubah peran, nonaktifkan</small></Link>
        )}
        {menuPeran[profil.peran].map((m) => {
          const t = tautanMenu[m]
          return t ? (
            <Link key={m} to={t[0]} className="kartu tautan"><h3>{t[1] ?? m}</h3><small>{t[2]}</small></Link>
          ) : <Segera key={m} nama={m} />
        })}
      </div>
    </Halaman>
  )
}
