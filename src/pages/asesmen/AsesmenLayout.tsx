import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { namaPeran } from '../../data/menuPortal'
import { sekolah } from '../../data/contoh'

// Kerangka modul Asesmen Digital. Terpisah dari portal: menu, peran, dan halamannya sendiri.
export default function AsesmenLayout() {
  const { profil, superAdmin, keluar } = useAuth()
  const admin = profil?.peran === 'admin_ujian' || superAdmin
  const siswa = profil?.peran === 'siswa'
  const menu: { to: string; label: string; akhir?: boolean }[] = siswa
    ? [{ to: '/asesmen', label: 'Jadwal ujian', akhir: true }]
    : admin
      ? [
          { to: '/asesmen', label: 'Ujian', akhir: true },
          { to: '/asesmen/ruang', label: 'Ruang' },
          { to: '/asesmen/bank', label: 'Bank soal' },
        ]
      : [
          { to: '/asesmen', label: 'Beranda', akhir: true },
          { to: '/asesmen/bank', label: 'Bank soal' },
          { to: '/asesmen/pengawas', label: 'Pengawasan' },
        ]
  return (
    <div className="as-kerangka">
      <header className="as-atas">
        <div className="wadah as-atas-isi">
          <div className="as-merek">
            <strong>Asesmen Digital</strong>
            <small>{sekolah.nama}</small>
          </div>
          <nav className="as-menu" aria-label="Menu asesmen">
            {menu.map((m) => <NavLink key={m.to} to={m.to} end={m.akhir} className={({ isActive }) => (isActive ? 'aktif' : '')}>{m.label}</NavLink>)}
          </nav>
          <div className="as-akun">
            <small>{profil ? namaPeran[profil.peran] : ''}</small>
            {profil?.peran !== 'admin_ujian' && <NavLink to="/portal">Portal</NavLink>}
            <button type="button" className="tombol" onClick={() => void keluar()}>Keluar</button>
          </div>
        </div>
      </header>
      <main className="wadah as-isi"><Outlet /></main>
    </div>
  )
}
