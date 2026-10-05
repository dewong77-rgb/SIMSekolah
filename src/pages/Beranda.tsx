import { Link } from 'react-router-dom'
import { KartuBerita } from './Berita'
import { useBeritaPublik } from '../lib/hubin'
import { useSekolah } from '../lib/profilSekolah'
import JamSistem from '../components/JamSistem'
import AgendaTerdekat from '../components/AgendaTerdekat'
import { useJurusan, useStatistik } from '../lib/dataPublik'
import { useAuth } from '../auth/AuthContext'

const angka = (n: number | undefined) => (n === undefined ? '...' : n.toLocaleString('id-ID'))

export default function Beranda() {
  const sekolah = useSekolah()
  const { jurusan } = useJurusan()
  const { hasil: hasilBerita } = useBeritaPublik(3)
  const st = useStatistik()
  const { session } = useAuth()
  const pintuPortal = session ? '/portal' : '/masuk'
  const ringkasan = [
    { label: 'Peserta didik aktif', nilai: angka(st?.peserta_didik_aktif) },
    { label: 'Guru dan tenaga kependidikan', nilai: angka(st?.ptk) },
    { label: 'Rombongan belajar', nilai: angka(st?.rombel) },
    { label: 'Alumni tercatat', nilai: angka(st?.alumni) },
  ]
  return (
    <>
      <section className="hero">
        <div className="wadah hero-isi">
          <p className="atas">Sekolah Menengah Kejuruan Negeri</p>
          <h1>{sekolah.nama}</h1>
          <p className="lead">
            {sekolah.data?.slogan ?? 'Mencetak lulusan yang siap kerja, siap berwirausaha, dan siap melanjutkan pendidikan, melalui pembelajaran yang dekat dengan dunia industri.'}
          </p>
          <JamSistem varian="hero" />
          <div className="aksi">
            <Link to="/ppdb" className="tombol tombol-isi">Informasi PPDB</Link>
            <Link to={pintuPortal} className="tombol tombol-garis">{session ? 'Buka portal' : 'Masuk ke portal'}</Link>
          </div>
        </div>
      </section>

      <section className="wadah bagian">
        <div className="statistik">
          {ringkasan.map((r) => (
            <div key={r.label} className="stat">
              <strong>{r.nilai}</strong>
              <span>{r.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="wadah bagian">
        <AgendaTerdekat hari={30} judul="Agenda sekolah" />
      </section>

      <section className="wadah bagian">
        <div className="judul-bagian">
          <h2>Layanan cepat</h2>
        </div>
        <div className="grid grid-4">
          <Link to={session ? '/portal/lms' : '/masuk'} className="kartu tautan">
            <h3>LMS</h3>
            <p>Ruang belajar daring untuk siswa dan guru. {session ? 'Buka kelas Anda.' : 'Masuk untuk membuka kelas.'}</p>
          </Link>
          <Link to="/perpustakaan" className="kartu tautan">
            <h3>Perpustakaan</h3>
            <p>Telusuri koleksi dan panduan layanan.</p>
          </Link>
          <Link to="/alumni" className="kartu tautan">
            <h3>Cek Data Alumni</h3>
            <p>Periksa data kelulusan dengan NISN dan tanggal lahir.</p>
          </Link>
          <Link to="/akademik" className="kartu tautan">
            <h3>Kalender Akademik</h3>
            <p>Jadwal kegiatan dan asesmen sepanjang tahun ajaran.</p>
          </Link>
        </div>
      </section>

      <section className="wadah bagian">
        <div className="judul-bagian">
          <h2>Kompetensi keahlian</h2>
          <Link to="/jurusan">Lihat semua</Link>
        </div>
        <div className="grid grid-3">
          {jurusan?.map((j) => (
            <Link key={j.slug} to={`/jurusan#${j.slug}`} className="kartu tautan">
              <h3>{j.nama}</h3>
              <p>{j.ringkas}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="wadah bagian">
        <div className="judul-bagian">
          <h2>Berita terbaru</h2>
          <Link to="/berita">Semua berita</Link>
        </div>
        {hasilBerita && hasilBerita.baris.length === 0 && <p className="kartu">Belum ada berita yang diterbitkan.</p>}
        <div className="grid grid-3">
          {hasilBerita?.baris.map((b) => <KartuBerita key={b.slug} b={b} />)}
        </div>
      </section>
    </>
  )
}
