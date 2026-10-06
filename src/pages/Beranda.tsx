import { Link } from 'react-router-dom'
import { KartuBerita } from './Berita'
import { useBeritaPublik } from '../lib/hubin'
import { useSekolah } from '../lib/profilSekolah'
import JamSistem from '../components/JamSistem'
import AgendaTerdekat from '../components/AgendaTerdekat'
import { useJurusan, useStatistik } from '../lib/dataPublik'
import { useAuth } from '../auth/AuthContext'
import Ikon from '../components/Ikon'

const angka = (n: number | undefined) => (n === undefined ? null : n.toLocaleString('id-ID'))

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
  const { jurusan } = useJurusan()
  const { hasil: hasilBerita } = useBeritaPublik(3)
  const st = useStatistik()
  const { session } = useAuth()
  const pintuPortal = session ? '/portal' : '/masuk'
  const ringkasan = [
    { label: 'Peserta didik aktif', nilai: angka(st?.peserta_didik_aktif), ikon: 'kelompok' },
    { label: 'Guru dan tenaga kependidikan', nilai: angka(st?.ptk), ikon: 'pengguna' },
    { label: 'Rombongan belajar', nilai: angka(st?.rombel), ikon: 'sekolah' },
    { label: 'Alumni tercatat', nilai: angka(st?.alumni), ikon: 'tas' },
  ]
  const layanan = [
    { to: pintuPortal, ikon: 'buku', judul: 'Portal dan LMS', isi: 'Kelas daring, lembar kerja, kuis, dan progres belajar untuk siswa, guru, dan orang tua. ' + (session ? 'Buka portal Anda.' : 'Masuk dengan akun sekolah.') },
    { to: session ? '/asesmen' : '/masuk', ikon: 'pena', judul: 'Asesmen Digital (CBT)', isi: 'Ujian sekolah berbasis komputer: UTS dan UAS dengan token, layar penuh, dan pengawasan.' },
    { to: '/akademik', ikon: 'kalender', judul: 'Kalender Akademik', isi: 'Jadwal kegiatan, libur, dan asesmen. Bisa dilanggan di Google Kalender.' },
    { to: '/hubungan-industri', ikon: 'tautan', judul: 'Hubungan Industri', isi: 'Mitra dunia usaha dan industri untuk praktik kerja dan penyerapan lulusan.' },
    { to: '/alumni', ikon: 'perisai', judul: 'Cek Data Alumni', isi: 'Periksa data kelulusan dengan NISN dan tanggal lahir.' },
    { to: '/alumni/tracer', ikon: 'grafik', judul: 'Tracer Study', isi: 'Alumni melaporkan kelanjutan studi dan pekerjaan untuk perbaikan pembelajaran.' },
    { to: '/struktur-organisasi', ikon: 'kelompok', judul: 'Struktur Organisasi', isi: 'Kepala sekolah, wakil kepala, dan pembagian tugas.' },
  ]
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

      <section className="wadah stat-melayang">
        <div className="statistik">
          {ringkasan.map((r) => (
            <div key={r.label} className="stat">
              <span className="stat-ikon"><Ikon nama={r.ikon} ukuran={22} /></span>
              {r.nilai === null ? <strong className="rangka-angka" aria-label="Memuat" /> : <strong>{r.nilai}</strong>}
              <span>{r.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="wadah bagian">
        <Judul label="Program pendidikan" judul="Kompetensi keahlian" tautan="Lihat semua" ke="/jurusan" />
        <div className="grid grid-3">
          {!jurusan && <Rangka n={3} />}
          {jurusan?.map((j, i) => (
            <Link key={j.slug} to={`/jurusan#${j.slug}`} className="kartu tautan kartu-jurusan">
              <span className="jurusan-no">{String(i + 1).padStart(2, '0')}</span>
              <h3>{j.nama}</h3>
              <p>{j.ringkas}</p>
              {j.prospek?.length > 0 && (
                <ul className="chip-prospek">{j.prospek.slice(0, 2).map((x) => <li key={x}>{x}</li>)}</ul>
              )}
            </Link>
          ))}
        </div>
      </section>

      <section className="wadah bagian">
        <Judul label="Satu pintu" judul="Layanan sekolah" />
        <div className="grid grid-3 grid-layanan">
          {layanan.map((l, i) => (
            <Link key={l.judul} to={l.to} className={'kartu tautan' + (i === 0 ? ' kartu-unggul' : '')}>
              <span className="kartu-ikon"><Ikon nama={l.ikon} ukuran={22} /></span>
              <h3>{l.judul}</h3>
              <p>{l.isi}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="wadah bagian">
        <AgendaTerdekat hari={30} judul="Agenda sekolah" />
      </section>

      <section className="wadah bagian">
        <Judul label="Kabar sekolah" judul="Berita terbaru" tautan="Semua berita" ke="/berita" />
        {hasilBerita && hasilBerita.baris.length === 0 && <p className="kartu kosong-berita">Belum ada berita yang diterbitkan.</p>}
        <div className="grid grid-3">
          {!hasilBerita && <Rangka n={3} />}
          {hasilBerita?.baris.map((b) => <KartuBerita key={b.slug} b={b} />)}
        </div>
      </section>

      <section className="ajakan">
        <div className="wadah ajakan-isi">
          <div>
            <span className="judul-label">Mulai dari sini</span>
            <h2>Siap belajar bersama {sekolah.nama}?</h2>
            <p>Masuk ke portal untuk mengakses kelas, tugas, nilai, dan pengumuman sekolah.</p>
          </div>
          <Link to={pintuPortal} className="tombol tombol-isi">{session ? 'Buka portal' : 'Masuk ke portal'}</Link>
        </div>
      </section>
    </>
  )
}
