import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import Halaman from '../../components/Halaman'
import { bukaPdf, gambarHalaman, tutupPdf } from '../../lib/pdf'
import { alamatBaca, formatSitasi, tautanBerkas, type BukuBuka } from '../../lib/perpustakaan'
import { panggil } from '../../lib/rpc'

// Pembaca buku di dalam aplikasi. Halaman digambar satu per satu; tidak ada tombol unduh.

export default function BacaBuku() {
  const { id = '' } = useParams()
  const [param, setParam] = useSearchParams()
  const [buku, setBuku] = useState<BukuBuka | null>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [galat, setGalat] = useState('')
  const [halaman, setHalaman] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [lompat, setLompat] = useState('1')
  const [menggambar, setMenggambar] = useState(false)
  const [pesan, setPesan] = useState('')
  const area = useRef<HTMLDivElement>(null)
  const kanvas = useRef<HTMLCanvasElement>(null)
  const [lebar, setLebar] = useState(0)
  const awal = useRef(Number(param.get('hal')) || 0)
  const halRef = useRef(1)
  const total = doc?.numPages ?? buku?.jumlah_halaman ?? 0

  useEffect(() => {
    let batal = false
    let dokumen: PDFDocumentProxy | null = null
    ;(async () => {
      try {
        const b = await panggil<BukuBuka>('perpus_buku_buka', { p_id: id })
        if (batal) return
        setBuku(b)
        const url = await tautanBerkas(b.berkas_path)
        dokumen = await bukaPdf({ url })
        if (batal) { tutupPdf(dokumen); return }
        setDoc(dokumen)
        const mulai = Math.min(Math.max(awal.current || b.halaman_terakhir || 1, 1), dokumen.numPages)
        setHalaman(mulai); setLompat(String(mulai))
      } catch (e) { if (!batal) setGalat((e as Error).message || 'Buku tidak dapat dibuka.') }
    })()
    return () => { batal = true; tutupPdf(dokumen) }
  }, [id])

  useEffect(() => {
    const el = area.current
    if (!el) return
    const ukur = () => setLebar(Math.max(240, el.clientWidth))
    ukur()
    const ro = new ResizeObserver(ukur)
    ro.observe(el)
    return () => ro.disconnect()
  }, [doc])

  useEffect(() => {
    if (!doc || !kanvas.current || !lebar) return
    let batal = false
    setMenggambar(true)
    gambarHalaman(doc, halaman, kanvas.current, lebar, zoom)
      .catch((e: Error) => { if (!batal && e.name !== 'RenderingCancelledException') setGalat('Halaman tidak dapat ditampilkan.') })
      .finally(() => { if (!batal) setMenggambar(false) })
    return () => { batal = true }
  }, [doc, halaman, lebar, zoom])

  // Simpan posisi baca setelah jeda singkat, dan saat meninggalkan halaman.
  halRef.current = halaman
  useEffect(() => {
    if (!doc) return
    const t = window.setTimeout(() => { void panggil('perpus_progres_simpan', { p_buku: id, p_halaman: halaman }).catch(() => undefined) }, 1500)
    return () => window.clearTimeout(t)
  }, [doc, halaman, id])
  useEffect(() => () => { if (halRef.current > 1) void panggil('perpus_progres_simpan', { p_buku: id, p_halaman: halRef.current }).catch(() => undefined) }, [id])

  const ke = useCallback((n: number) => {
    if (!doc) return
    const h = Math.min(Math.max(Math.round(n) || 1, 1), doc.numPages)
    setHalaman(h); setLompat(String(h)); setPesan('')
    setParam({ hal: String(h) }, { replace: true })
    area.current?.scrollTo({ top: 0 })
  }, [doc, setParam])

  useEffect(() => {
    function tombol(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') ke(halRef.current + 1)
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') ke(halRef.current - 1)
    }
    window.addEventListener('keydown', tombol)
    return () => window.removeEventListener('keydown', tombol)
  }, [ke])

  async function salin(teks: string, ket: string) {
    try { await navigator.clipboard.writeText(teks); setPesan(`${ket} disalin.`) } catch { setPesan(teks) }
  }

  if (galat) return <Halaman judul="Buku tidak dapat dibuka"><p className="kartu galat" role="alert">{galat}</p><p><Link to="/portal/perpustakaan">Kembali ke perpustakaan</Link></p></Halaman>

  return (
    <Halaman judul={buku?.judul ?? 'Membuka buku...'} lead={buku ? [buku.penulis, buku.penerbit, buku.tahun_terbit].filter(Boolean).join(' · ') || undefined : undefined}>
      <p className="catatan" style={{ marginTop: 0 }}><Link to="/portal/perpustakaan">Kembali ke perpustakaan</Link></p>
      {!doc && <p className="catatan">Memuat buku. Buku besar bisa memerlukan beberapa detik.</p>}
      {doc && buku && (
        <>
          <div className="baca-bar" role="toolbar" aria-label="Kontrol baca">
            <button type="button" className="tombol" onClick={() => ke(halaman - 1)} disabled={halaman <= 1}>Sebelumnya</button>
            <form onSubmit={(e) => { e.preventDefault(); ke(Number(lompat)) }} className="baca-lompat">
              <label className="sr-saja" htmlFor="lompat-hal">Ke halaman</label>
              <input id="lompat-hal" inputMode="numeric" value={lompat} onChange={(e) => setLompat(e.target.value.replace(/\D/g, ''))} aria-label="Nomor halaman" />
              <span>dari {total}</span>
            </form>
            <button type="button" className="tombol" onClick={() => ke(halaman + 1)} disabled={halaman >= total}>Berikutnya</button>
            <span className="baca-pemisah" />
            <button type="button" className="tombol" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))} aria-label="Perkecil">−</button>
            <button type="button" className="tombol" onClick={() => setZoom(1)} aria-label="Ukuran pas">{Math.round(zoom * 100)}%</button>
            <button type="button" className="tombol" onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(1)))} aria-label="Perbesar">+</button>
          </div>
          <div className="baca-bar">
            <button type="button" className="tombol" onClick={() => void salin(formatSitasi(buku, halaman), 'Rujukan')}>Salin rujukan halaman ini</button>
            <button type="button" className="tombol" onClick={() => void salin(window.location.origin + alamatBaca(id, halaman), 'Tautan halaman')}>Salin tautan halaman ini</button>
            {pesan && <span className="catatan" role="status">{pesan}</span>}
          </div>
          <div className="baca-area" ref={area} onContextMenu={(e) => e.preventDefault()} aria-busy={menggambar}>
            <canvas ref={kanvas} aria-label={`Halaman ${halaman} dari ${total}`} />
          </div>
          <p className="catatan">Bahan bacaan milik sekolah. Gunakan untuk belajar dan kutip dengan menyebut sumbernya.</p>
        </>
      )}
    </Halaman>
  )
}
