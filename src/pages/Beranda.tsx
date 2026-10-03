import { Link } from 'react-router-dom'
import { berita, sekolah } from '../data/contoh'
import { useJurusan, useStatistik } from '../lib/dataPublik'
import { tanggalPanjang } from '../lib/format'

const angka = (n: number | undefined) => (n === undefined ? '...' : n.toLocaleString('id-ID'))

export default function Beranda() {
  const { jurusan } = useJurusan()
  const st = useStatistik()
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
            Mencetak lulusan yang siap kerja, siap berwirausaha, dan siap melanjutkan pendidikan,
            melalui pembelajaran yang dekat dengan dunia industri.
          </p>
          <div className="aksi">
            <Link to="/ppdb" className="tombol tombol-isi">Informasi PPDB</Link>
            <Link to="/lms" className="tombol tombol-garis">Masuk ke LMS</Link>
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
        <div className="judul-bagian">
          <h2>Layanan cepat</h2>
        </div>
        <div className="grid grid-4">
          <Link to="/lms" className="kartu tautan">
            <h3>LMS</h3>
            <p>Ruang belajar daring untuk siswa dan guru.</p>
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
        <div className="grid grid-3">
          {berita.map((b) => (
            <article key={b.slug} className="kartu">
              <span className="lencana">{b.kategori}</span>
              <h3>{b.judul}</h3>
              <p>{b.ringkas}</p>
              <small>{tanggalPanjang(b.tanggal)}</small>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}
