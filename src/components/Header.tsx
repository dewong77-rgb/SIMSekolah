import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { menuUtama } from '../data/menu'
import { sekolah } from '../data/contoh'
import { useAuth } from '../auth/AuthContext'

export default function Header() {
  const [terbuka, setTerbuka] = useState(false)
  const [sub, setSub] = useState<string | null>(null)
  const lokasi = useLocation()
  const { session, keluar } = useAuth()

  useEffect(() => {
    setTerbuka(false)
    setSub(null)
    // lepas fokus agar submenu menutup setelah tautan diklik
    ;(document.activeElement as HTMLElement | null)?.blur?.()
  }, [lokasi.pathname])

  return (
    <header className="header">
      <div className="wadah header-baris">
        <Link to="/" className="merek" aria-label="Beranda">
          <span className="logo" aria-hidden="true">S1</span>
          <span className="merek-teks">
            <strong>{sekolah.nama}</strong>
            <small>Sistem Informasi Sekolah</small>
          </span>
        </Link>

        <button
          className="tombol-menu"
          aria-expanded={terbuka}
          aria-controls="navigasi"
          onClick={() => setTerbuka(!terbuka)}
        >
          {terbuka ? 'Tutup' : 'Menu'}
        </button>

        <nav id="navigasi" className={'nav' + (terbuka ? ' buka' : '')} aria-label="Menu utama">
          <ul>
            {menuUtama.map((m) =>
              m.anak ? (
                <li
                  key={m.label}
                  className={'punya-anak' + (sub === m.label ? ' aktif' : '')}
                >
                  <button
                    className="nav-tautan"
                    aria-expanded={sub === m.label}
                    onClick={() => setSub(sub === m.label ? null : m.label)}
                  >
                    {m.label}
                    <span aria-hidden="true"> ▾</span>
                  </button>
                  <ul className="submenu">
                    {m.anak.map((a) => (
                      <li key={a.to}>
                        <NavLink to={a.to}>{a.label}</NavLink>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : (
                <li key={m.label}>
                  <NavLink to={m.to!} end={m.to === '/'} className="nav-tautan">
                    {m.label}
                  </NavLink>
                </li>
              ),
            )}
            {session ? (
              <>
                <li className="nav-masuk">
                  <Link to="/portal" className="tombol tombol-isi">Buka portal</Link>
                </li>
                <li>
                  <button className="nav-tautan" onClick={keluar}>Keluar</button>
                </li>
              </>
            ) : (
              <li className="nav-masuk">
                <Link to="/masuk" className="tombol tombol-isi">Masuk</Link>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </header>
  )
}
