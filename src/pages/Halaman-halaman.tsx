import Halaman, { Segera } from '../components/Halaman'
import { koleksiPerpustakaan } from '../data/contoh'
import { useKerjasama } from '../lib/hubin'
import { bersihWilayah, nomorWa, useSekolah } from '../lib/profilSekolah'
import { tanggalPanjang } from '../lib/format'
import { useJurusan } from '../lib/dataPublik'
import { Link } from 'react-router-dom'
import { useState, type FormEvent } from 'react'
import { cekDataAlumni, type HasilAlumni } from '../lib/alumni'

export function Profil() {
  const { data: d } = useSekolah()
  const misi = (d?.misi ?? '').split('\n').map((x) => x.trim()).filter(Boolean)
  return (
    <Halaman judul="Profil Sekolah" lead={d?.slogan ?? 'Identitas, visi, dan misi sekolah.'}>
      <div className="grid grid-2">
        <div className="kartu">
          <h3>Identitas</h3>
          <dl className="daftar">
            <dt>Nama</dt><dd>{d?.nama ?? '-'}</dd>
            <dt>NPSN</dt><dd>{d?.npsn ?? '-'}</dd>
            <dt>Jenjang</dt><dd>{d?.jenjang ?? 'SMK'}{d?.status_sekolah ? `, ${d.status_sekolah}` : ''}</dd>
            <dt>Wilayah</dt><dd>{[bersihWilayah(d?.kecamatan) && `Kecamatan ${bersihWilayah(d?.kecamatan)}`, bersihWilayah(d?.kabupaten_kota) && `Kabupaten ${bersihWilayah(d?.kabupaten_kota)}`, bersihWilayah(d?.provinsi)].filter(Boolean).join(', ') || '-'}</dd>
            {d?.akreditasi && <><dt>Akreditasi</dt><dd>{d.akreditasi}</dd></>}
            {d?.tahun_berdiri && <><dt>Berdiri</dt><dd>{d.tahun_berdiri}</dd></>}
          </dl>
        </div>
        <div className="kartu">
          <h3>Visi</h3>
          <p>{d?.visi ?? 'Visi sekolah belum diisi.'}</p>
          <h3>Misi</h3>
          {misi.length > 0 ? <ul>{misi.map((m, i) => <li key={i}>{m}</li>)}</ul> : <p>Misi sekolah belum diisi.</p>}
        </div>
      </div>
      {(d?.tentang || d?.sejarah) && (
        <div className="grid grid-2 jarak">
          {d?.tentang && <div className="kartu"><h3>Tentang sekolah</h3><p style={{ whiteSpace: 'pre-line' }}>{d.tentang}</p></div>}
          {d?.sejarah && <div className="kartu"><h3>Sejarah</h3><p style={{ whiteSpace: 'pre-line' }}>{d.sejarah}</p></div>}
        </div>
      )}
      <div className="grid grid-3 jarak">
        <Segera nama="Guru dan tenaga kependidikan" />
        <Segera nama="Sarana dan prasarana" />
      </div>
    </Halaman>
  )
}


export function Jurusan() {
  const { jurusan, galat } = useJurusan()
  return (
    <Halaman judul="Jurusan" lead="Kompetensi keahlian yang tersedia di sekolah.">
      {galat && <p className="catatan">Data jurusan belum dapat dimuat. Coba muat ulang halaman.</p>}
      {!jurusan && !galat && <p className="catatan" aria-live="polite">Memuat...</p>}
      <div className="grid grid-3">
        {jurusan?.map((j) => (
          <article key={j.slug} id={j.slug} className="kartu">
            <small>{j.bidang}</small>
            <h3>{j.nama}</h3>
            <p className="catatan">Program keahlian: {j.program}</p>
            {j.ringkas && <p>{j.ringkas}</p>}
            {j.deskripsi && <p style={{ whiteSpace: 'pre-line' }}>{j.deskripsi}</p>}
            {j.jumlah_siswa ? <p className="catatan">{j.jumlah_siswa} siswa aktif</p> : null}
            {j.kompetensi_lulusan && <><strong>Kompetensi lulusan</strong><ul>{j.kompetensi_lulusan.split('\n').map((x) => x.trim()).filter(Boolean).map((x) => <li key={x}>{x}</li>)}</ul></>}
            {j.mapel_kejuruan && <><strong>Mata pelajaran kejuruan</strong><p style={{ whiteSpace: 'pre-line' }}>{j.mapel_kejuruan}</p></>}
            {j.fasilitas && <><strong>Fasilitas</strong><p style={{ whiteSpace: 'pre-line' }}>{j.fasilitas}</p></>}
            {j.kepala_program && <p className="catatan">Kepala program keahlian: {j.kepala_program}</p>}
            {j.prospek.length > 0 && (
              <>
                <strong>Prospek</strong>
                <ul>
                  {j.prospek.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </>
            )}
          </article>
        ))}
      </div>
    </Halaman>
  )
}

export function HubunganIndustri() {
  const { data: k, galat } = useKerjasama()
  return (
    <Halaman judul="Hubungan Industri" lead="Mitra dunia usaha dan dunia industri (DUDI) yang bekerja sama dengan sekolah untuk praktik kerja, kunjungan industri, dan penyerapan lulusan.">
      {galat && <p className="catatan">Data mitra belum dapat dimuat. Coba muat ulang halaman.</p>}
      {!k && !galat && <p className="catatan" aria-live="polite">Memuat...</p>}
      {k && (
        <>
          <div className="grid grid-3">
            <div className="kartu"><small>Mitra industri</small><h2>{k.jumlah_mitra}</h2></div>
            <div className="kartu"><small>Perjanjian kerja sama</small><h2>{k.jumlah_mou}</h2></div>
            <div className="kartu"><small>Bermitra sejak</small><h2>{k.sejak_tahun ?? '-'}</h2></div>
          </div>
          {k.jenis.length > 0 && (
            <div className="lencana-baris jarak">
              {k.jenis.map((j) => <span key={j.jenis} className="lencana">{j.jenis} ({j.jumlah})</span>)}
            </div>
          )}
          <div className="tabel-bungkus jarak">
            <table>
              <thead><tr><th>Mitra</th><th>Bidang usaha</th><th>Wilayah</th><th>Bentuk kerja sama</th></tr></thead>
              <tbody>
                {k.mitra.map((m) => (
                  <tr key={m.nama}><td>{m.nama}</td><td>{m.bidang_usaha ?? '-'}</td><td>{m.wilayah ?? '-'}</td><td>{m.jenis?.length ? m.jenis.join(', ') : '-'}</td></tr>
                ))}
                {k.mitra.length === 0 && <tr><td colSpan={4} className="catatan">Daftar mitra belum dipublikasikan.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="jarak"><Segera nama="Bursa kerja" /></div>
    </Halaman>
  )
}

export function Ppdb() {
  return (
    <Halaman judul="Penerimaan Peserta Didik Baru" lead="Pendaftaran SMA dan SMK negeri di Jawa Barat dikelola Pemerintah Provinsi lewat satu portal, bukan oleh masing-masing sekolah.">
      <div className="kartu">
        <h3>SPMB Jawa Barat</h3>
        <p>Jadwal, syarat, jalur, dan pendaftaran resmi diumumkan di portal SPMB Jabar. Pilih SMKN 1 Gunung Sindur dan kompetensi keahlian saat mendaftar.</p>
        <a className="tombol tombol-isi" href="https://spmb.jabarprov.go.id/" rel="noopener noreferrer" target="_blank">Buka portal SPMB Jabar</a>
      </div>
      <p className="catatan jarak">Pertanyaan tentang kompetensi keahlian atau kunjungan ke sekolah dapat disampaikan lewat halaman <Link to="/kontak">Kontak</Link>.</p>
    </Halaman>
  )
}

export function Lms() {
  return (
    <Halaman judul="LMS" lead="Ruang belajar daring untuk siswa dan guru. Perlu masuk dengan akun sekolah.">
      <div className="kartu">
        <h3>Ruang belajar</h3>
        <p>Setiap pertemuan berisi bahan bacaan, lembar kerja, dan diskusi, dilengkapi kuis, ulangan, dan tugas. Kehadiran tercatat dari aktivitas belajar. Orang tua dapat memantau kehadiran dan progres anak.</p>
        <Link to="/portal/lms" className="tombol tombol-isi">Buka ruang belajar</Link>
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
          <p><Link to="/alumni/tracer">Isi Tracer Study alumni</Link></p>
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

export function Kontak() {
  const sekolah = useSekolah()
  const d = sekolah.data
  const ada = d?.lintang != null && d?.bujur != null
  const peta = ada ? (() => {
    const lat = Number(d!.lintang), lon = Number(d!.bujur), g = 0.004
    return `https://www.openstreetmap.org/export/embed.html?bbox=${lon - g}%2C${lat - g}%2C${lon + g}%2C${lat + g}&layer=mapnik&marker=${lat}%2C${lon}`
  })() : null
  return (
    <Halaman judul="Kontak" lead="Hubungi sekolah.">
      <div className="grid grid-2">
        <div className="kartu">
          <h3>Alamat dan layanan</h3>
          <dl className="daftar">
            <dt>Alamat</dt><dd>{sekolah.alamat ?? '-'}</dd>
            <dt>Telepon</dt><dd>{sekolah.telepon ?? '-'}</dd>
            {d?.whatsapp && <><dt>WhatsApp</dt><dd><a href={`https://wa.me/${nomorWa(d.whatsapp)}`} rel="noopener noreferrer" target="_blank">{d.whatsapp}</a></dd></>}
            <dt>Email</dt><dd>{sekolah.email ? <a href={`mailto:${sekolah.email}`}>{sekolah.email}</a> : '-'}</dd>
            <dt>Jam layanan</dt><dd>{d?.jam_layanan ?? '-'}</dd>
          </dl>
          {sekolah.sosial.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>Media sosial</h3>
              <ul className="label-tugas" style={{ margin: 0 }}>
                {sekolah.sosial.map(([n, u]) => <li key={n}><a href={u} rel="noopener noreferrer" target="_blank">{n}</a></li>)}
              </ul>
            </>
          )}
        </div>
        {peta ? (
          <div className="kartu">
            <h3>Peta lokasi</h3>
            <iframe title="Peta lokasi sekolah" src={peta} loading="lazy" style={{ width: '100%', height: 320, border: 0, borderRadius: 8 }} />
            <p style={{ margin: '8px 0 0' }}>
              <a href={`https://www.google.com/maps?q=${d!.lintang},${d!.bujur}`} rel="noopener noreferrer" target="_blank">Buka di Google Maps</a>
            </p>
          </div>
        ) : <Segera nama="Peta lokasi" />}
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
