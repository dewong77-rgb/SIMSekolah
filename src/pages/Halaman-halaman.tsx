import Halaman, { Segera } from '../components/Halaman'
import { berita, jurusan, kalender, koleksiPerpustakaan, mitraIndustri, sekolah } from '../data/contoh'
import { tanggalPanjang } from '../lib/format'
import { Link } from 'react-router-dom'
import { useState, type FormEvent } from 'react'
import { cekDataAlumni, type HasilAlumni } from '../lib/alumni'

export function Profil() {
  return (
    <Halaman judul="Profil Sekolah" lead="Identitas, visi, dan misi sekolah. Teks di bawah masih contoh.">
      <div className="grid grid-2">
        <div className="kartu">
          <h3>Identitas</h3>
          <dl className="daftar">
            <dt>Nama</dt><dd>{sekolah.nama}</dd>
            <dt>NPSN</dt><dd>{sekolah.npsn}</dd>
            <dt>Wilayah</dt><dd>{sekolah.kabupaten}, {sekolah.provinsi}</dd>
            <dt>Jenjang</dt><dd>SMK</dd>
          </dl>
        </div>
        <div className="kartu">
          <h3>Visi</h3>
          <p>Contoh visi sekolah. Isi dengan visi resmi.</p>
          <h3>Misi</h3>
          <ul>
            <li>Contoh misi pertama.</li>
            <li>Contoh misi kedua.</li>
            <li>Contoh misi ketiga.</li>
          </ul>
        </div>
      </div>
      <div className="grid grid-3 jarak">
        <Segera nama="Sejarah sekolah" />
        <Segera nama="Guru dan tenaga kependidikan" />
        <Segera nama="Sarana dan prasarana" />
      </div>
    </Halaman>
  )
}

export function Jurusan() {
  return (
    <Halaman judul="Jurusan" lead="Kompetensi keahlian yang tersedia di sekolah.">
      <div className="grid grid-3">
        {jurusan.map((j) => (
          <article key={j.slug} id={j.slug} className="kartu">
            <h3>{j.nama}</h3>
            <p>{j.ringkas}</p>
            <strong>Prospek</strong>
            <ul>
              {j.prospek.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </Halaman>
  )
}

export function HubunganIndustri() {
  return (
    <Halaman judul="Hubungan Industri" lead="Mitra dunia usaha dan dunia industri (DUDI), MoU, dan praktik industri.">
      <div className="tabel-bungkus">
        <table>
          <thead>
            <tr><th>Mitra</th><th>Bidang</th><th>Status</th></tr>
          </thead>
          <tbody>
            {mitraIndustri.map((m) => (
              <tr key={m.nama}><td>{m.nama}</td><td>{m.bidang}</td><td>{m.status}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="jarak"><Segera nama="Bursa kerja" /></div>
    </Halaman>
  )
}

export function Akademik() {
  return (
    <Halaman judul="Informasi Akademik" lead="Kalender kegiatan dan pengumuman akademik.">
      <div className="tabel-bungkus">
        <table>
          <thead>
            <tr><th>Tanggal</th><th>Kegiatan</th></tr>
          </thead>
          <tbody>
            {kalender.map((k) => (
              <tr key={k.tanggal}><td>{tanggalPanjang(k.tanggal)}</td><td>{k.kegiatan}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-2 jarak">
        <Segera nama="Jadwal pelajaran" />
        <Segera nama="Pengumuman" />
      </div>
    </Halaman>
  )
}

export function Ppdb() {
  return (
    <Halaman judul="PPDB" lead="Informasi penerimaan peserta didik baru. Pendaftaran daring belum tersedia.">
      <div className="grid grid-3">
        <div className="kartu"><h3>Jadwal</h3><p>Contoh: jadwal tahap pendaftaran, seleksi, dan pengumuman.</p></div>
        <div className="kartu"><h3>Syarat</h3><p>Contoh: syarat usia, berkas, dan jalur penerimaan.</p></div>
        <div className="kartu"><h3>Alur</h3><p>Contoh: langkah dari pendaftaran sampai daftar ulang.</p></div>
      </div>
    </Halaman>
  )
}

export function Lms() {
  return (
    <Halaman judul="LMS" lead="Ruang belajar daring untuk siswa dan guru. Perlu masuk dengan akun sekolah.">
      <div className="kartu segera">
        <span className="lencana">Segera hadir</span>
        <h3>Ruang belajar</h3>
        <p>Kelas, materi, tugas, dan nilai akan tersedia di sini. Rancangannya dibahas terpisah.</p>
        <Link to="/masuk" className="tombol tombol-isi">Masuk</Link>
      </div>
    </Halaman>
  )
}

export function Perpustakaan() {
  return (
    <Halaman judul="Perpustakaan" lead="Telusuri koleksi dan panduan layanan perpustakaan.">
      <div className="tabel-bungkus">
        <table>
          <thead>
            <tr><th>Judul</th><th>Kategori</th><th>Ketersediaan</th></tr>
          </thead>
          <tbody>
            {koleksiPerpustakaan.map((b) => (
              <tr key={b.judul}>
                <td>{b.judul}</td>
                <td>{b.kategori}</td>
                <td>{b.tersedia ? 'Tersedia' : 'Dipinjam'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="catatan">Koleksi di atas contoh. Katalog sungguhan menyusul.</p>
    </Halaman>
  )
}

export function Alumni() {
  const [nisn, setNisn] = useState('')
  const [lahir, setLahir] = useState('')
  const [memuat, setMemuat] = useState(false)
  const [hasil, setHasil] = useState<HasilAlumni | null>(null)

  async function kirim(e: FormEvent) {
    e.preventDefault()
    setMemuat(true)
    setHasil(null)
    try {
      setHasil(await cekDataAlumni(nisn.trim(), lahir))
    } finally {
      setMemuat(false)
    }
  }

  return (
    <Halaman judul="Cek Data Alumni" lead="Masukkan NISN dan tanggal lahir untuk memeriksa data kelulusan Anda.">
      <div className="grid grid-2">
        <form className="kartu form" onSubmit={kirim}>
          <label>
            NISN
            <input
              inputMode="numeric"
              pattern="\d{10}"
              maxLength={10}
              required
              value={nisn}
              onChange={(e) => setNisn(e.target.value.replace(/\D/g, ''))}
              placeholder="10 digit"
            />
          </label>
          <label>
            Tanggal lahir
            <input type="date" required value={lahir} onChange={(e) => setLahir(e.target.value)} />
          </label>
          <button className="tombol tombol-isi" disabled={memuat || nisn.length !== 10 || !lahir}>
            {memuat ? 'Memeriksa...' : 'Periksa data'}
          </button>
          <p className="catatan">Pemeriksaan dibatasi jumlah percobaannya demi keamanan data.</p>
        </form>

        <div aria-live="polite">
          {hasil && hasil.ditemukan && (
            <div className="kartu hasil">
              <h3>{hasil.nama}</h3>
              <dl className="daftar">
                <dt>NISN</dt><dd>{hasil.nisn}</dd>
                <dt>NIPD</dt><dd>{hasil.nipd ?? '-'}</dd>
                <dt>Tempat, tanggal lahir</dt>
                <dd>{hasil.tempat_lahir ?? '-'}, {tanggalPanjang(hasil.tanggal_lahir)}</dd>
                <dt>Status</dt><dd>{hasil.status}</dd>
                <dt>Tanggal keluar</dt>
                <dd>{hasil.tanggal_keluar ? tanggalPanjang(hasil.tanggal_keluar) : '-'}</dd>
                <dt>Keterangan</dt><dd>{hasil.alasan_keluar ?? '-'}</dd>
              </dl>
            </div>
          )}
          {hasil && !hasil.ditemukan && (
            <div className="kartu galat">
              {hasil.dibatasi ? (
                <p>Terlalu banyak percobaan. Coba lagi satu jam lagi.</p>
              ) : (
                <p>Data tidak ditemukan. Periksa kembali NISN dan tanggal lahir.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </Halaman>
  )
}

export function BeritaHalaman() {
  return (
    <Halaman judul="Berita" lead="Kabar kegiatan, prestasi, dan pengumuman sekolah.">
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
    </Halaman>
  )
}

export function Kontak() {
  return (
    <Halaman judul="Kontak" lead="Hubungi sekolah.">
      <div className="grid grid-2">
        <div className="kartu">
          <h3>Alamat dan layanan</h3>
          <dl className="daftar">
            <dt>Alamat</dt><dd>{sekolah.alamat}</dd>
            <dt>Telepon</dt><dd>{sekolah.telepon}</dd>
            <dt>Email</dt><dd>{sekolah.email}</dd>
            <dt>Jam layanan</dt><dd>{sekolah.jam}</dd>
          </dl>
        </div>
        <Segera nama="Peta lokasi" />
      </div>
    </Halaman>
  )
}

export function TidakAda() {
  return (
    <Halaman judul="Halaman tidak ditemukan" lead="Alamat yang dibuka tidak ada.">
      <Link to="/" className="tombol tombol-isi">Kembali ke beranda</Link>
    </Halaman>
  )
}
