// Menampilkan isi berita dari teks biasa. Tidak memakai HTML mentah, jadi aman dari penyisipan skrip.
import { Fragment, type ReactNode } from 'react'
import { gambarAman, uraiIsi, type Foto } from '../lib/berita'

/** **tebal** dan *miring* di dalam satu baris. */
function Sebaris({ teks }: { teks: string }) {
  const bagian: ReactNode[] = []
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g
  let akhir = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(teks))) {
    if (m.index > akhir) bagian.push(teks.slice(akhir, m.index))
    bagian.push(m[1] ? <strong key={m.index}>{m[1]}</strong> : <em key={m.index}>{m[2]}</em>)
    akhir = m.index + m[0].length
  }
  if (akhir < teks.length) bagian.push(teks.slice(akhir))
  return <>{bagian.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</>
}

const Baris = ({ teks }: { teks: string }) => (
  <>{teks.split('\n').map((l, i) => <Fragment key={i}>{i > 0 && <br />}<Sebaris teks={l} /></Fragment>)}</>
)

export default function BeritaIsi({ isi, foto, kredit }: { isi: string; foto: Foto[]; kredit?: string | null }) {
  return (
    <div className="bt-isi">
      {uraiIsi(isi).map((b, i) => {
        if (b.t === 'h') return <h2 key={i}>{b.teks}</h2>
        if (b.t === 'kutip') return <blockquote key={i}><p><Sebaris teks={b.teks} /></p></blockquote>
        if (b.t === 'daftar') return <ul key={i}>{b.butir.map((x, j) => <li key={j}><Sebaris teks={x} /></li>)}</ul>
        if (b.t === 'foto') {
          const f = foto[b.no - 1]
          const u = gambarAman(f?.url)
          if (!u) return null
          return (
            <figure key={i} className="bt-gambar">
              <img src={u} alt={f.keterangan || ''} loading="lazy" referrerPolicy="no-referrer" />
              {(f.keterangan || kredit) && <figcaption>{f.keterangan}{f.keterangan && kredit ? ' ' : ''}{kredit && <span className="bt-kredit">Foto: {kredit}</span>}</figcaption>}
            </figure>
          )
        }
        return <p key={i}><Baris teks={b.teks} /></p>
      })}
    </div>
  )
}
