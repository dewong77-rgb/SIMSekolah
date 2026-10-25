import { Link } from 'react-router-dom'
import { KartuBerita } from './Berita'
import { useBeritaPublik } from '../lib/hubin'
import { useSekolah } from '../lib/profilSekolah'
import JamSistem from '../components/JamSistem'
import { useAuth } from '../auth/AuthContext'
import Ikon from '../components/Ikon'
import { useStatistikKunjungan } from '../lib/kunjungan'

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

const angka = (n: number | undefined) => (n ?? 0).toLocaleString('id-ID')

function StatistikKunjungan() {
  const { data, galat } = useStatistikKunjungan()
  if (galat) return null
  const maks = Math.max(1, ...(data?.harian ?? []).map((h) => h.pengunjung))
  const hari = (t: string) => new Date(t + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short' })
  return (
    <section className="wadah bagian" aria-label="Statistik kunjungan">
      <Judul label="Kunjungan situs" judul="Pengunjung dan akun yang masuk" />
      <div className="pantau-ringkas">
        <div className="ringkas-kartu"><span className="ringkas-ikon"><Ikon nama="kelompok" ukuran={20} /></span><div><strong>{data ? angka(data.hari_ini.pengunjung) : '-'}</strong><span>Pengunjung hari ini{data ? `, kemarin ${angka(data.kemarin.pengunjung)}` : ''}</span></div></div>
        <div className="ringkas-kartu"><span className="ringkas-ikon"><Ikon nama="pengguna" ukuran={20} /></span><div><strong>{data ? angka(data.hari_ini.login) : '-'}</strong><span>Akun masuk hari ini{data ? `, kemarin ${angka(data.kemarin.login)}` : ''}</span></div></div>
        <div className="ringkas-kartu"><span className="ringkas-ikon"><Ikon nama="kalender" ukuran={20} /></span><div><strong>{data ? angka(data.bulan_ini.pengunjung) : '-'}</strong><span>Pengunjung bulan ini, {data ? angka(data.bulan_ini.login) : '-'} akun masuk</span></div></div>
        <div className="ringkas-kartu"><span className="ringkas-ikon"><Ikon nama="grafik" ukuran={20} /></span><div><strong>{data ? angka(data.total_pengunjung) : '-'}</strong><span>Pengunjung sejak pencatatan dimulai</span></div></div>
      </div>
      {data && data.harian.length > 0 && (
        <div className="kartu kunjungan-grafik" role="img" aria-label={`Pengunjung tujuh hari terakhir: ${data.harian.map((h) => `${hari(h.tanggal)} ${h.pengunjung}`).join(', ')}`}>
          {data.harian.map((h) => (
            <div key={h.tanggal} className="kunjungan-hari">
              <small>{angka(h.pengunjung)}</small>
              <div className="kunjungan-batang"><i style={{ height: `${Math.max(4, (h.pengunjung / maks) * 100)}%` }} /></div>
              <small>{hari(h.tanggal)}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default function Beranda() {
  const sekolah = useSekolah()
  const { hasil: hasilBerita } = useBeritaPublik(5)
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

      <StatistikKunjungan />

      <section className="wadah bagian">
        <Judul label="Kabar sekolah" judul="Berita terbaru" tautan="Semua berita" ke="/berita" />
        {hasilBerita && hasilBerita.baris.length === 0 && <p className="kartu kosong-berita">Belum ada berita yang diterbitkan.</p>}
        <div className="grid grid-3">
          {!hasilBerita && <Rangka n={5} />}
          {hasilBerita?.baris.map((b) => <KartuBerita key={b.slug} b={b} />)}
        </div>
        {hasilBerita && hasilBerita.total > 5 && (
          <div className="aksi" style={{ justifyContent: 'center', marginTop: 20 }}>
            <Link to="/berita" className="tombol tombol-isi">Lihat berita lainnya ({(hasilBerita.total - 5).toLocaleString('id-ID')})</Link>
          </div>
        )}
      </section>
    </>
  )
}
