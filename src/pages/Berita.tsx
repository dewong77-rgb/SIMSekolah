// Portal berita publik: daftar dan baca.
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { tanggalPanjang } from '../lib/format'
import { panggil } from '../lib/rpc'
import { KATEGORI_BERITA, namaKategori, useBeritaPublik } from '../lib/hubin'

const BATAS = 12

export function BeritaDaftar() {
  const [sp, setSp] = useSearchParams()
  const kategori = sp.get('kategori')
  const hal = Math.max(0, Number(sp.get('hal') ?? 0) || 0)
  const { hasil, galat } = useBeritaPublik(BATAS, kategori, hal * BATAS)
  const ubah = (k: string | null, h = 0) => { const n = new URLSearchParams(); if (k) n.set('kategori', k); if (h) n.set('hal', String(h)); setSp(n) }
  return (
    <Halaman judul="Berita" lead="Kabar kegiatan, prestasi, kemitraan, dan pengumuman sekolah.">
      <div className="lencana-baris" style={{ marginBottom: 16 }}>
        <button className={!kategori ? 'tombol tombol-isi' : 'tombol'} onClick={() => ubah(null)}>Semua</button>
        {KATEGORI_BERITA.map(([k, v]) => <button key={k} className={kategori === k ? 'tombol tombol-isi' : 'tombol'} onClick={() => ubah(k)}>{v}</button>)}
      </div>
      {galat && <p className="catatan">Berita belum dapat dimuat. Coba muat ulang halaman.</p>}
      {!hasil && !galat && <p className="catatan" aria-live="polite">Memuat...</p>}
      {hasil && hasil.baris.length === 0 && <p className="kartu">Belum ada berita{kategori ? ' pada kategori ini' : ''}.</p>}
      <div className="grid grid-3">
        {hasil?.baris.map((b) => <KartuBerita key={b.slug} b={b} />)}
      </div>
      {hasil && hasil.total > BATAS && (
        <div className="aksi" style={{ alignItems: 'center' }}>
          <button className="tombol" disabled={hal === 0} onClick={() => ubah(kategori, hal - 1)}>Lebih baru</button>
          <span className="catatan">Halaman {hal + 1} dari {Math.ceil(hasil.total / BATAS)}</span>
          <button className="tombol" disabled={(hal + 1) * BATAS >= hasil.total} onClick={() => ubah(kategori, hal + 1)}>Lebih lama</button>
        </div>
      )}
    </Halaman>
  )
}

export function KartuBerita({ b }: { b: { slug: string; judul: string; kategori: string; ringkasan: string | null; gambar_url: string | null; terbit_pada: string } }) {
  return (
    <article className="kartu">
      {b.gambar_url && <img src={b.gambar_url} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />}
      <span className="lencana">{namaKategori(b.kategori)}</span>
      <h3><Link to={`/berita/${b.slug}`}>{b.judul}</Link></h3>
      {b.ringkasan && <p>{b.ringkasan}</p>}
      <small>{tanggalPanjang(b.terbit_pada)}</small>
    </article>
  )
}

type Detail = {
  slug: string; judul: string; kategori: string; ringkasan: string | null; isi: string; gambar_url: string | null; gambar_keterangan: string | null
  terbit_pada: string; lainnya: { slug: string; judul: string; terbit_pada: string }[]
}
export function BeritaBaca() {
  const { slug = '' } = useParams()
  const [d, setD] = useState<Detail | null | undefined>(undefined)
  useEffect(() => {
    let batal = false
    setD(undefined)
    panggil<Detail | null>('berita_baca', { p_slug: slug }).then((x) => { if (!batal) setD(x) }).catch(() => { if (!batal) setD(null) })
    return () => { batal = true }
  }, [slug])
  useEffect(() => { if (d) document.title = `${d.judul} | Berita` }, [d])
  if (d === undefined) return <Halaman judul="Berita"><p className="catatan" aria-live="polite">Memuat...</p></Halaman>
  if (d === null) return <Halaman judul="Berita tidak ditemukan" lead="Berita ini tidak ada atau sudah ditarik."><Link to="/berita" className="tombol tombol-isi">Semua berita</Link></Halaman>
  return (
    <Halaman judul={d.judul} lead={`${namaKategori(d.kategori)} · ${tanggalPanjang(d.terbit_pada)}`}>
      <article style={{ maxWidth: 760 }}>
        {d.gambar_url && (
          <figure style={{ margin: '0 0 16px' }}>
            <img src={d.gambar_url} alt={d.gambar_keterangan ?? ''} referrerPolicy="no-referrer" style={{ width: '100%', borderRadius: 8 }} />
            {d.gambar_keterangan && <figcaption className="catatan">{d.gambar_keterangan}</figcaption>}
          </figure>
        )}
        {d.isi.split(/\n{2,}/).map((p, i) => <p key={i} style={{ whiteSpace: 'pre-line' }}>{p}</p>)}
      </article>
      {d.lainnya.length > 0 && (
        <div className="kartu jarak" style={{ maxWidth: 760 }}>
          <h3>Berita lainnya</h3>
          <ul>{d.lainnya.map((o) => <li key={o.slug}><Link to={`/berita/${o.slug}`}>{o.judul}</Link> <small className="catatan">{tanggalPanjang(o.terbit_pada)}</small></li>)}</ul>
        </div>
      )}
      <p><Link to="/berita">Semua berita</Link></p>
    </Halaman>
  )
}
