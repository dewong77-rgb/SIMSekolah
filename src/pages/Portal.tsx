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

export default function Portal() {
  const { session, profil, keluar } = useAuth()
  if (!profil) return null

  return (
    <Halaman judul="Portal" lead={`Masuk sebagai ${namaPeran[profil.peran]}.`}>
      <div className="kartu">
        <dl className="daftar">
          <dt>Email</dt><dd>{session?.user.email}</dd>
          <dt>Peran</dt><dd>{namaPeran[profil.peran]}</dd>
          <dt>NPSN</dt><dd>{profil.npsn}</dd>
        </dl>
        <div className="aksi jarak">
          <button className="tombol tombol-isi" onClick={keluar}>Keluar</button>
          <Link to="/" className="tombol" style={{ color: 'var(--warna-utama)' }}>Ke beranda</Link>
        </div>
      </div>
      <div className="judul-bagian jarak"><h2>Menu {namaPeran[profil.peran]}</h2></div>
      <div className="grid grid-3">
        {menuPeran[profil.peran].map((m) =>
          m === 'Unggah Dapodik' ? (
            <Link key={m} to="/portal/unggah" className="kartu tautan"><h3>{m}</h3><small>Pratinjau berkas Dapodik</small></Link>
          ) : <Segera key={m} nama={m} />)}
      </div>
    </Halaman>
  )
}
