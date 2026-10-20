import { Link } from 'react-router-dom'
import { KartuBerita } from './Berita'
import { useBeritaPublik } from '../lib/hubin'
import { useSekolah } from '../lib/profilSekolah'
import JamSistem from '../components/JamSistem'
import { useAuth } from '../auth/AuthContext'
import Ikon from '../components/Ikon'

function Judul({ label, judul, tautan, ke }: { label: string; judul: string; tautan?: string; ke?: string }) {
  return (
    <div className="judul-bagian judul-beranda">
      <div>
        <span className="judul-label">{label}</span>
        <h2>{judul}</h2>
      </div>
      {tautan && ke && <Link to={ke} className="judul-tautan">{tautan} <Ikon nama="panah" ukuran={16} /></Link>}
    </div>
  )
}

const Rangka = ({ n }: { n: number }) => (
  <>{Array.from({ length: n }, (_, i) => <div key={i} className="kartu rangka" aria-hidden="true"><i /><i /><i /></div>)}</>
)

export default function Beranda() {
  const sekolah = useSekolah()
  const { hasil: hasilBerita } = useBeritaPublik(3)
  const { session } = useAuth()
  const pintuPortal = session ? '/portal' : '/masuk'
  return (
    <>
      <section className="hero">
        <div className="wadah hero-isi">
          <div className="hero-teks">
            <p className="atas">Sekolah Menengah Kejuruan Negeri</p>
            <h1>{sekolah.nama}</h1>
            <p className="lead">
              {sekolah.data?.slogan ?? 'Mencetak lulusan yang siap kerja, siap berwirausaha, dan siap melanjutkan pendidikan, melalui pembelajaran yang dekat dengan dunia industri.'}
            </p>
            <div className="aksi">
              <Link to={pintuPortal} className="tombol tombol-isi">{session ? 'Buka portal' : 'Masuk ke portal'}</Link>
              <Link to="/jurusan" className="tombol tombol-garis">Kenali kompetensi keahlian</Link>
            </div>
          </div>
          <div className="hero-panel">
            <JamSistem varian="hero" />
            <ul className="hero-pintas">
              <li><Link to="/akademik"><Ikon nama="kalender" ukuran={18} /><span>Kalender</span></Link></li>
              <li><Link to="/berita"><Ikon nama="dokumen" ukuran={18} /><span>Berita</span></Link></li>
              <li><Link to="/alumni"><Ikon nama="perisai" ukuran={18} /><span>Alumni</span></Link></li>
              <li><Link to="/kontak"><Ikon nama="surat" ukuran={18} /><span>Kontak</span></Link></li>
            </ul>
          </div>
        </div>
      </section>

      <section className="wadah bagian">
        <Judul label="Kabar sekolah" judul="Berita terbaru" tautan="Semua berita" ke="/berita" />
        {hasilBerita && hasilBerita.baris.length === 0 && <p className="kartu kosong-berita">Belum ada berita yang diterbitkan.</p>}
        <div className="grid grid-3">
          {!hasilBerita && <Rangka n={3} />}
          {hasilBerita?.baris.map((b) => <KartuBerita key={b.slug} b={b} />)}
        </div>
      </section>
    </>
  )
}
