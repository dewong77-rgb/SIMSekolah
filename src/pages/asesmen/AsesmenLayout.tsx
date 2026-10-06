import { Link, Navigate, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { namaPeran } from '../../data/menuPortal'
import { sekolah } from '../../data/contoh'
import FormMasuk from '../../components/FormMasuk'

// Kerangka modul Asesmen Digital. Terpisah dari portal: menu, peran, dan halamannya sendiri.
// Masuk memakai akun yang sama dengan portal. Admin asesmen: super admin, Waka Kurikulum, dan Staf Kurikulum.
export default function AsesmenLayout() {
  const { session, profil, superAdmin, punyaIzin, memuat, keluar, galatProfil, muatUlang } = useAuth()
  const admin = punyaIzin('asesmen.kelola')
  const siswa = profil?.peran === 'siswa'
  const boleh = !!profil && ['admin_tu', 'guru', 'staf', 'siswa', 'admin_ujian'].includes(profil.peran)

  const wajibGanti = !!(session?.user.app_metadata as Record<string, unknown> | undefined)?.wajib_ganti_sandi
  if (session && wajibGanti) return <Navigate to="/portal/ganti-sandi" replace />

  const menu: { to: string; label: string; akhir?: boolean }[] = siswa
    ? [{ to: '/asesmen', label: 'Jadwal ujian', akhir: true }]
    : admin
      ? [
          { to: '/asesmen', label: 'Ujian', akhir: true },
          { to: '/asesmen/ruang', label: 'Ruang' },
          { to: '/asesmen/bank', label: 'Bank soal' },
          { to: '/asesmen/pengawas', label: 'Pengawasan' },
        ]
      : [
          { to: '/asesmen', label: 'Beranda', akhir: true },
          { to: '/asesmen/bank', label: 'Bank soal' },
          { to: '/asesmen/pengawas', label: 'Pengawasan' },
        ]

  let isi
  if (memuat) {
    isi = <p className="catatan">Memeriksa sesi masuk.</p>
  } else if (!session) {
    isi = (
      <div className="as-masuk">
        <h1>Masuk ke Asesmen Digital</h1>
        <p className="lead">Pakai akun yang sama dengan portal sekolah. Siswa masuk dengan NISN, guru dan staf dengan NIP atau NUPTK.</p>
        <FormMasuk peranTersedia={['siswa', 'guru', 'admin']} tujuan="/asesmen" />
      </div>
    )
  } else if (galatProfil && !profil) {
    isi = (
      <div className="kartu">
        <p>Koneksi ke server terputus atau terlalu lambat. Akun Anda tidak bermasalah.</p>
        <div className="aksi"><button className="tombol tombol-isi" onClick={muatUlang}>Coba lagi</button></div>
      </div>
    )
  } else if (!boleh && !superAdmin) {
    isi = (
      <div className="kartu">
        <h3>Tidak ada akses</h3>
        <p>Peran akun Anda tidak dapat membuka Asesmen Digital.</p>
        <Link to="/portal" className="tombol tombol-isi">Kembali ke portal</Link>
      </div>
    )
  } else {
    isi = <Outlet />
  }

  return (
    <div className="as-kerangka">
      <header className="as-atas">
        <div className="wadah as-atas-isi">
          <div className="as-merek">
            <strong>Asesmen Digital</strong>
            <small>{sekolah.nama}</small>
          </div>
          {session && profil && (
            <nav className="as-menu" aria-label="Menu asesmen">
              {menu.map((m) => <NavLink key={m.to} to={m.to} end={m.akhir} className={({ isActive }) => (isActive ? 'aktif' : '')}>{m.label}</NavLink>)}
            </nav>
          )}
          <div className="as-akun">
            {profil && <small>{superAdmin ? 'Super admin' : namaPeran[profil.peran]}</small>}
            <Link to="/">Situs sekolah</Link>
            {session && profil?.peran !== 'admin_ujian' && <NavLink to="/portal">Portal</NavLink>}
            {session && <button type="button" className="tombol" onClick={() => void keluar()}>Keluar</button>}
          </div>
        </div>
      </header>
      <main className="wadah as-isi">{isi}</main>
    </div>
  )
}
