// Portal berita publik bergaya media: beranda berita, pencarian, tag, tema, dan halaman baca.
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import BeritaIsi from '../components/BeritaIsi'
import { panggil } from '../lib/rpc'
import {
  KATEGORI_BERITA, gambarAman, namaKategori, urlGambarBerita, tglJamBerita, tglRingkas, useBeritaPublik, usePenanda, waktuBaca,
  type BeritaDetail, type BeritaRingkas, type Penanda,
} from '../lib/berita'

const BATAS = 12
const NAMA_SEKOLAH = 'SMKN 1 Gunung Sindur'

function Gambar({ b, rasio = '16/9', muat = 'lazy' }: { b: { gambar_url: string | null; gambar_path?: string | null; judul: string }; rasio?: string; muat?: 'lazy' | 'eager' }) {
  const u = urlGambarBerita(b)
  return u
    ? <img className="bt-foto" src={u} alt="" loading={muat} referrerPolicy="no-referrer" style={{ aspectRatio: rasio }} />
    : <div className="bt-foto bt-tanpa-foto" style={{ aspectRatio: rasio }} aria-hidden="true"><span>SIMS</span></div>
}

const Penanda_ = ({ b }: { b: BeritaRingkas }) => (
  <span className="bt-kicker">
    <Link to={`/berita?kategori=${b.kategori}`}>{namaKategori(b.kategori)}</Link>
    {b.tema && <> <i>/</i> <Link to={`/berita?tema=${encodeURIComponent(b.tema)}`} className="bt-tema">{b.tema}</Link></>}
  </span>
)

/** Kartu standar. Dipakai juga di beranda sekolah. */
export function KartuBerita({ b }: { b: BeritaRingkas }) {
  return (
    <article className="bt-kartu">
      <Link to={`/berita/${b.slug}`} className="bt-kartu-gambar" tabIndex={-1} aria-hidden="true"><Gambar b={b} /></Link>
      <Penanda_ b={b} />
      <h3><Link to={`/berita/${b.slug}`}>{b.judul}</Link></h3>
      {b.ringkasan && <p>{b.ringkasan}</p>}
      <time dateTime={b.terbit_pada}>{tglRingkas(b.terbit_pada)}</time>
    </article>
  )
}

function Baris({ b }: { b: BeritaRingkas }) {
  return (
    <article className="bt-baris">
      <div>
        <Penanda_ b={b} />
        <h3><Link to={`/berita/${b.slug}`}>{b.judul}</Link></h3>
        {b.ringkasan && <p>{b.ringkasan}</p>}
        <time dateTime={b.terbit_pada}>{tglRingkas(b.terbit_pada)}</time>
      </div>
      <Link to={`/berita/${b.slug}`} tabIndex={-1} aria-hidden="true" className="bt-baris-gambar"><Gambar b={b} rasio="4/3" /></Link>
    </article>
  )
}

function Samping({ p, aktifTag, aktifTema }: { p: Penanda | null; aktifTag?: string | null; aktifTema?: string | null }) {
  if (!p) return null
  return (
    <aside className="bt-samping" aria-label="Telusur berita">
      {p.tema.length > 0 && (
        <section>
          <h2>Liputan khusus</h2>
          <ul className="bt-tema-daftar">
            {p.tema.map((t) => <li key={t.nama}><Link to={`/berita?tema=${encodeURIComponent(t.nama)}`} aria-current={aktifTema === t.nama ? 'true' : undefined}>{t.nama}<small>{t.jumlah}</small></Link></li>)}
          </ul>
        </section>
      )}
      {p.tag.length > 0 && (
        <section>
          <h2>Tag populer</h2>
          <div className="bt-tag-awan">
            {p.tag.map((t) => <Link key={t.nama} to={`/berita?tag=${encodeURIComponent(t.nama)}`} className={aktifTag === t.nama ? 'bt-tag aktif' : 'bt-tag'}>#{t.nama}</Link>)}
          </div>
        </section>
      )}
    </aside>
  )
}

export function BeritaDaftar() {
  const [sp, setSp] = useSearchParams()
  const kategori = sp.get('kategori'), tag = sp.get('tag'), tema = sp.get('tema'), cari = sp.get('cari')
  const hal = Math.max(0, Number(sp.get('hal') ?? 0) || 0)
  const { hasil, galat } = useBeritaPublik(BATAS, { kategori, tag, tema, cari }, hal * BATAS)
  const penanda = usePenanda()
  const [kata, setKata] = useState(cari ?? '')
  useEffect(() => { setKata(cari ?? '') }, [cari])
  useEffect(() => { document.title = `Berita | ${NAMA_SEKOLAH}` }, [])

  const ubah = (n: Record<string, string | null>) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(n)) if (v) q.set(k, v)
    setSp(q)
  }
  const cariSubmit = (e: FormEvent) => { e.preventDefault(); ubah({ cari: kata.trim() || null }) }
  const disaring = !!(kategori || tag || tema || cari)
  const judulSaring = tema ? `Liputan khusus: ${tema}` : tag ? `#${tag}` : cari ? `Hasil pencarian: “${cari}”` : kategori ? namaKategori(kategori) : null
  const baris = hasil?.baris ?? []
  const utama = !disaring && hal === 0 ? baris[0] : undefined
  const sisi = utama ? baris.slice(1, 4) : []
  const lainnya = utama ? baris.slice(4) : baris

  return (
    <>
      <section className="bt-kepala">
        <div className="wadah">
          <p className="bt-atas">{NAMA_SEKOLAH}</p>
          <h1>Berita</h1>
          <form className="bt-cari" role="search" onSubmit={cariSubmit}>
            <input type="search" value={kata} onChange={(e) => setKata(e.target.value)} placeholder="Cari berita" aria-label="Cari berita" maxLength={80} />
            <button className="tombol tombol-isi">Cari</button>
          </form>
          <nav className="bt-rubrik" aria-label="Rubrik">
            <button className={!kategori ? 'aktif' : ''} onClick={() => ubah({})}>Terbaru</button>
            {KATEGORI_BERITA.map(([k, v]) => <button key={k} className={kategori === k ? 'aktif' : ''} onClick={() => ubah({ kategori: k })}>{v}</button>)}
          </nav>
        </div>
      </section>

      <div className="wadah bt-tata">
        <div>
          {judulSaring && (
            <div className="bt-saring">
              <h2>{judulSaring}</h2>
              <button className="bt-hapus" onClick={() => ubah({})}>Hapus penyaring</button>
            </div>
          )}
          {galat && <p className="catatan">Berita belum dapat dimuat. Coba muat ulang halaman.</p>}
          {!hasil && !galat && <p className="catatan" aria-live="polite">Memuat...</p>}
          {hasil && baris.length === 0 && <p className="kartu">Belum ada berita{disaring ? ' yang cocok' : ''}.</p>}

          {utama && (
            <section className="bt-utama" aria-label="Berita utama">
              <article className="bt-utama-besar">
                <Link to={`/berita/${utama.slug}`} tabIndex={-1} aria-hidden="true"><Gambar b={utama} muat="eager" /></Link>
                <Penanda_ b={utama} />
                <h2><Link to={`/berita/${utama.slug}`}>{utama.judul}</Link></h2>
                {(utama.subjudul || utama.ringkasan) && <p>{utama.subjudul || utama.ringkasan}</p>}
                <time dateTime={utama.terbit_pada}>{tglRingkas(utama.terbit_pada)}</time>
              </article>
              {sisi.length > 0 && (
                <div className="bt-utama-sisi">
                  {sisi.map((b) => (
                    <article key={b.slug}>
                      <Penanda_ b={b} />
                      <h3><Link to={`/berita/${b.slug}`}>{b.judul}</Link></h3>
                      <time dateTime={b.terbit_pada}>{tglRingkas(b.terbit_pada)}</time>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {lainnya.length > 0 && (
            <section aria-label="Daftar berita">
              {utama && <h2 className="bt-judul-bagian">Berita lainnya</h2>}
              <div className="bt-daftar">{lainnya.map((b) => <Baris key={b.slug} b={b} />)}</div>
            </section>
          )}

          {hasil && hasil.total > BATAS && (
            <div className="aksi" style={{ alignItems: 'center' }}>
              <button className="tombol" disabled={hal === 0} onClick={() => ubah({ kategori, tag, tema, cari, hal: hal > 1 ? String(hal - 1) : null })}>Lebih baru</button>
              <span className="catatan">Halaman {hal + 1} dari {Math.ceil(hasil.total / BATAS)}</span>
              <button className="tombol" disabled={(hal + 1) * BATAS >= hasil.total} onClick={() => ubah({ kategori, tag, tema, cari, hal: String(hal + 1) })}>Lebih lama</button>
            </div>
          )}
        </div>
        <Samping p={penanda} aktifTag={tag} aktifTema={tema} />
      </div>
    </>
  )
}

function Bagikan({ judul, slug }: { judul: string; slug: string }) {
  const [salin, setSalin] = useState(false)
  const alamat = `${window.location.origin}/berita/${slug}`
  const q = encodeURIComponent
  async function salinTautan() {
    try { await navigator.clipboard.writeText(alamat); setSalin(true); setTimeout(() => setSalin(false), 2000) } catch { window.prompt('Salin tautan ini:', alamat) }
  }
  return (
    <div className="bt-bagikan" role="group" aria-label="Bagikan berita">
      <span>Bagikan</span>
      <a href={`https://wa.me/?text=${q(`${judul} ${alamat}`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
      <a href={`https://www.facebook.com/sharer/sharer.php?u=${q(alamat)}`} target="_blank" rel="noopener noreferrer">Facebook</a>
      <a href={`https://twitter.com/intent/tweet?text=${q(judul)}&url=${q(alamat)}`} target="_blank" rel="noopener noreferrer">X</a>
      <button type="button" onClick={salinTautan}>{salin ? 'Tersalin' : 'Salin tautan'}</button>
    </div>
  )
}

function aturMeta(nama: string, isi: string) {
  let m = document.head.querySelector<HTMLMetaElement>(`meta[name="${nama}"]`)
  if (!m) { m = document.createElement('meta'); m.name = nama; document.head.appendChild(m) }
  m.content = isi
}

export function BeritaBaca() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const [d, setD] = useState<BeritaDetail | null | undefined>(undefined)
  const penanda = usePenanda()
  useEffect(() => {
    let batal = false
    setD(undefined)
    panggil<BeritaDetail | null>('berita_baca', { p_slug: slug }).then((x) => { if (!batal) setD(x) }).catch(() => { if (!batal) setD(null) })
    return () => { batal = true }
  }, [slug])
  useEffect(() => {
    if (!d) return
    document.title = `${d.judul} | ${NAMA_SEKOLAH}`
    aturMeta('description', d.ringkasan ?? d.subjudul ?? d.judul)
    return () => { document.title = NAMA_SEKOLAH }
  }, [d])

  if (d === undefined) return <div className="wadah bagian"><p className="catatan" aria-live="polite">Memuat...</p></div>
  if (d === null) {
    return (
      <div className="wadah bagian">
        <h1>Berita tidak ditemukan</h1>
        <p>Berita ini tidak ada atau sudah ditarik.</p>
        <Link to="/berita" className="tombol tombol-isi">Semua berita</Link>
      </div>
    )
  }
  const sampul = urlGambarBerita(d)
  const dipakaiDiIsi = new Set([...d.isi.matchAll(/\[foto:(\d{1,2})\]/gi)].map((m) => Number(m[1])))
  const sisaFoto = d.foto.filter((f, i) => !dipakaiDiIsi.has(i + 1) && f.url !== sampul && gambarAman(f.url))
  const penulis = d.byline || 'Redaksi'

  return (
    <div className="wadah bt-baca">
      <nav className="bt-remah" aria-label="Jalur halaman">
        <Link to="/">Beranda</Link> <i>/</i> <Link to="/berita">Berita</Link> <i>/</i> <Link to={`/berita?kategori=${d.kategori}`}>{namaKategori(d.kategori)}</Link>
      </nav>
      <div className="bt-tata bt-tata-baca">
        <article className="bt-artikel">
          <header>
            <p className="bt-kicker">
              <Link to={`/berita?kategori=${d.kategori}`}>{namaKategori(d.kategori)}</Link>
              {d.tema && <> <i>/</i> <Link to={`/berita?tema=${encodeURIComponent(d.tema)}`} className="bt-tema">{d.tema}</Link></>}
            </p>
            <h1>{d.judul}</h1>
            {d.subjudul && <p className="bt-dek">{d.subjudul}</p>}
            <p className="bt-byline">
              <strong>{penulis}</strong>
              <span><time dateTime={d.terbit_pada}>{tglJamBerita(d.terbit_pada)}</time> · {waktuBaca(d.isi)} menit baca</span>
            </p>
            <Bagikan judul={d.judul} slug={d.slug} />
          </header>

          {sampul && (
            <figure className="bt-sampul">
              <img src={sampul} alt={d.gambar_keterangan ?? ''} referrerPolicy="no-referrer" />
              {(d.gambar_keterangan || d.kredit_foto) && (
                <figcaption>{d.gambar_keterangan}{d.gambar_keterangan && d.kredit_foto ? ' ' : ''}{d.kredit_foto && <span className="bt-kredit">Foto: {d.kredit_foto}</span>}</figcaption>
              )}
            </figure>
          )}

          <BeritaIsi isi={d.isi} foto={d.foto} kredit={d.kredit_foto} />

          {sisaFoto.length > 0 && (
            <section className="bt-galeri" aria-label="Galeri foto">
              <h2>Galeri foto</h2>
              <div>
                {sisaFoto.map((f) => (
                  <figure key={f.url}>
                    <img src={f.url} alt={f.keterangan || ''} loading="lazy" referrerPolicy="no-referrer" />
                    {f.keterangan && <figcaption>{f.keterangan}</figcaption>}
                  </figure>
                ))}
              </div>
            </section>
          )}

          {d.tag.length > 0 && (
            <p className="bt-tag-baris">
              <span>Tag:</span> {d.tag.map((t) => <Link key={t} to={`/berita?tag=${encodeURIComponent(t)}`} className="bt-tag">#{t}</Link>)}
            </p>
          )}
          <Bagikan judul={d.judul} slug={d.slug} />

          {d.lainnya.length > 0 && (
            <section className="bt-bacajuga" aria-label="Baca juga">
              <h2 className="bt-judul-bagian">Baca juga</h2>
              <div className="bt-bacajuga-grid">
                {d.lainnya.slice(0, 3).map((o) => (
                  <article key={o.slug}>
                    <Link to={`/berita/${o.slug}`} tabIndex={-1} aria-hidden="true"><Gambar b={{ gambar_url: o.gambar_url, gambar_path: o.gambar_path, judul: o.judul }} rasio="3/2" /></Link>
                    <span className="bt-kicker">{namaKategori(o.kategori)}</span>
                    <h3><Link to={`/berita/${o.slug}`}>{o.judul}</Link></h3>
                    <time dateTime={o.terbit_pada}>{tglRingkas(o.terbit_pada)}</time>
                  </article>
                ))}
              </div>
            </section>
          )}
          <p><button className="bt-hapus" onClick={() => navigate('/berita')}>Kembali ke semua berita</button></p>
        </article>

        <div>
          {d.terbaru.length > 0 && (
            <aside className="bt-samping" aria-label="Berita terbaru">
              <section>
                <h2>Terbaru</h2>
                <ol className="bt-nomor">
                  {d.terbaru.map((o) => <li key={o.slug}><Link to={`/berita/${o.slug}`}>{o.judul}</Link><small>{tglRingkas(o.terbit_pada)}</small></li>)}
                </ol>
              </section>
            </aside>
          )}
          <Samping p={penanda} aktifTema={d.tema} />
        </div>
      </div>
    </div>
  )
}
