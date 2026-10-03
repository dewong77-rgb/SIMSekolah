import { Link } from 'react-router-dom'
import { sekolah } from '../data/contoh'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wadah footer-grid">
        <div>
          <strong>{sekolah.nama}</strong>
          <p>
            NPSN {sekolah.npsn}
            <br />
            {sekolah.kabupaten}, {sekolah.provinsi}
          </p>
        </div>
        <div>
          <strong>Layanan</strong>
          <ul>
            <li><Link to="/lms">LMS</Link></li>
            <li><Link to="/perpustakaan">Perpustakaan</Link></li>
            <li><Link to="/alumni">Cek Data Alumni</Link></li>
            <li><Link to="/ppdb">PPDB</Link></li>
          </ul>
        </div>
        <div>
          <strong>Kontak</strong>
          <p>
            {sekolah.telepon}
            <br />
            {sekolah.email}
          </p>
        </div>
      </div>
      <div className="wadah footer-bawah">
        <small>© {new Date().getFullYear()} {sekolah.nama}. Tahap prototipe: data masih contoh.</small>
      </div>
    </footer>
  )
}
