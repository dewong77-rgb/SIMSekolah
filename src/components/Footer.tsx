import { Link } from 'react-router-dom'
import { nomorWa, useSekolah } from '../lib/profilSekolah'

export default function Footer() {
  const sekolah = useSekolah()
  const wa = sekolah.data?.whatsapp
  return (
    <footer className="footer">
      <div className="wadah footer-grid">
        <div>
          <strong>{sekolah.nama}</strong>
          <p>
            NPSN {sekolah.npsn}
            <br />
            {sekolah.alamat ?? sekolah.wilayah}
          </p>
        </div>
        <div>
          <strong>Layanan</strong>
          <ul>
            <li><Link to="/portal">Portal sekolah</Link></li>
            <li><Link to="/lms">LMS</Link></li>
            <li><Link to="/akademik">Kalender Akademik</Link></li>
            <li><Link to="/hubungan-industri">Hubungan Industri</Link></li>
            <li><Link to="/alumni">Cek Data Alumni</Link></li>
            <li><Link to="/alumni/tracer">Tracer Study</Link></li>
          </ul>
        </div>
        <div>
          <strong>Kontak</strong>
          <p>
            {sekolah.telepon}
            {sekolah.telepon && <br />}
            {wa && <><a href={`https://wa.me/${nomorWa(wa)}`} rel="noopener noreferrer" target="_blank">WhatsApp {wa}</a><br /></>}
            {sekolah.email}
          </p>
          {sekolah.sosial.length > 0 && (
            <p className="footer-sosial">
              {sekolah.sosial.map(([n, u]) => <a key={n} href={u} rel="noopener noreferrer" target="_blank" style={{ marginRight: 12 }}>{n}</a>)}
            </p>
          )}
        </div>
      </div>
      <div className="wadah footer-bawah">
        <small>© {new Date().getFullYear()} {sekolah.nama} · <Link to="/privasi">Kebijakan Privasi</Link></small>
      </div>
    </footer>
  )
}
