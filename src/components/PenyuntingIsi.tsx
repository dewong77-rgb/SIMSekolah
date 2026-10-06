// Penyunting isi berita seperti menulis di blog: tebal, miring, garis bawah, subjudul, rata kiri/tengah/kanan/penuh,
// daftar berpoin dan bernomor otomatis, kutipan, tautan, sisip foto. Menghasilkan HTML yang disaring lagi saat disimpan dan ditampilkan.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Foto } from '../lib/berita'

export type PenyuntingRef = { sisipFoto: (f: Foto) => void; fokus: () => void }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const jalankan = (perintah: string, nilai?: string) => { document.execCommand(perintah, false, nilai) }

/** Ikon rata teks: empat garis dengan panjang berbeda. */
const Rata = ({ r }: { r: 'kiri' | 'tengah' | 'kanan' | 'penuh' }) => {
  const g = (y: number, pj: number) => { const x = r === 'kiri' || r === 'penuh' ? 2 : r === 'tengah' ? (16 - pj) / 2 : 14 - pj; return <line key={y} x1={x} x2={x + pj} y1={y} y2={y} /> }
  const l = r === 'penuh' ? [12, 12, 12, 12] : [12, 7, 12, 8]
  return <svg width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">{[3, 6.5, 10, 13.5].map((y, i) => g(y, l[i]))}</svg>
}
const Poin = () => <svg width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="3" cy="4" r="1" fill="currentColor" stroke="none" /><circle cx="3" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="3" cy="12" r="1" fill="currentColor" stroke="none" /><line x1="6.5" x2="14" y1="4" y2="4" /><line x1="6.5" x2="14" y1="8" y2="8" /><line x1="6.5" x2="14" y1="12" y2="12" /></svg>
const Nomor = () => <svg width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><text x="0.5" y="5.6" fontSize="5" fill="currentColor" stroke="none" fontWeight="700">1</text><text x="0.5" y="9.6" fontSize="5" fill="currentColor" stroke="none" fontWeight="700">2</text><text x="0.5" y="13.6" fontSize="5" fill="currentColor" stroke="none" fontWeight="700">3</text><line x1="6.5" x2="14" y1="4" y2="4" /><line x1="6.5" x2="14" y1="8" y2="8" /><line x1="6.5" x2="14" y1="12" y2="12" /></svg>

type Alat = { perintah: string; nilai?: string; label: string; isi: React.ReactNode; status?: string }
const GAYA: Alat[] = [
  { perintah: 'bold', label: 'Tebal (Ctrl+B)', isi: <b>B</b>, status: 'bold' },
  { perintah: 'italic', label: 'Miring (Ctrl+I)', isi: <i>I</i>, status: 'italic' },
  { perintah: 'underline', label: 'Garis bawah (Ctrl+U)', isi: <u>U</u>, status: 'underline' },
]
const RATA: Alat[] = [
  { perintah: 'justifyLeft', label: 'Rata kiri', isi: <Rata r="kiri" />, status: 'justifyLeft' },
  { perintah: 'justifyCenter', label: 'Rata tengah', isi: <Rata r="tengah" />, status: 'justifyCenter' },
  { perintah: 'justifyRight', label: 'Rata kanan', isi: <Rata r="kanan" />, status: 'justifyRight' },
  { perintah: 'justifyFull', label: 'Rata kiri-kanan', isi: <Rata r="penuh" />, status: 'justifyFull' },
]
const DAFTAR: Alat[] = [
  { perintah: 'insertUnorderedList', label: 'Daftar berpoin', isi: <Poin />, status: 'insertUnorderedList' },
  { perintah: 'insertOrderedList', label: 'Penomoran otomatis', isi: <Nomor />, status: 'insertOrderedList' },
]

const PenyuntingIsi = forwardRef<PenyuntingRef, { nilai: string; onUbah: (html: string) => void }>(function PenyuntingIsi({ nilai, onUbah }, ref) {
  const area = useRef<HTMLDivElement>(null)
  const simpanPilihan = useRef<Range | null>(null)
  const [aktif, setAktif] = useState<Record<string, boolean>>({})
  const [blok, setBlok] = useState('p')

  // Isi awal dipasang sekali. Setelah itu perubahan datang dari pengetikan, bukan dari properti, agar kursor tidak melompat.
  useEffect(() => {
    if (!area.current) return
    area.current.innerHTML = nilai || '<p><br></p>'
    try { jalankan('defaultParagraphSeparator', 'p') } catch { /* peramban tanpa dukungan */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const keluarkan = useCallback(() => {
    const el = area.current
    if (!el) return
    let h = el.innerHTML
    if (!/^\s*<(p|h2|h3|ul|ol|blockquote|figure|div|hr)[\s>]/i.test(h)) h = h.trim() ? `<p>${h}</p>` : ''
    onUbah(h === '<p><br></p>' ? '' : h)
  }, [onUbah])

  const bacaStatus = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || !area.current || !sel.anchorNode || !area.current.contains(sel.anchorNode)) return
    simpanPilihan.current = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null
    const s: Record<string, boolean> = {}
    for (const a of [...GAYA, ...RATA, ...DAFTAR]) { try { s[a.perintah] = document.queryCommandState(a.perintah) } catch { /* abaikan */ } }
    setAktif(s)
    let n: Node | null = sel.anchorNode
    while (n && n !== area.current) { if (n.nodeType === 1 && /^(H2|H3|BLOCKQUOTE|P)$/.test((n as HTMLElement).tagName)) { setBlok((n as HTMLElement).tagName.toLowerCase()); return } n = n.parentNode }
    setBlok('p')
  }, [])
  useEffect(() => { document.addEventListener('selectionchange', bacaStatus); return () => document.removeEventListener('selectionchange', bacaStatus) }, [bacaStatus])

  const pulihkanPilihan = () => {
    area.current?.focus()
    const sel = window.getSelection()
    if (sel && simpanPilihan.current && !(sel.anchorNode && area.current?.contains(sel.anchorNode))) { sel.removeAllRanges(); sel.addRange(simpanPilihan.current) }
  }
  const perintah = (p: string, v?: string) => { pulihkanPilihan(); jalankan(p, v); keluarkan(); bacaStatus() }

  useImperativeHandle(ref, () => ({
    fokus: () => area.current?.focus(),
    sisipFoto: (f) => {
      pulihkanPilihan()
      jalankan('insertHTML', `<figure class="bt-gambar"><img src="${esc(f.url)}" alt="${esc(f.keterangan)}">${f.keterangan ? `<figcaption>${esc(f.keterangan)}</figcaption>` : ''}</figure><p><br></p>`)
      keluarkan()
    },
  }), [keluarkan])

  function tautan() {
    pulihkanPilihan()
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) { window.alert('Blok dulu kata yang ingin dijadikan tautan.'); return }
    const u = window.prompt('Alamat tautan (diawali https://)', 'https://')?.trim()
    if (!u) return
    if (!/^https?:\/\/\S+$/i.test(u)) { window.alert('Alamat harus diawali http:// atau https://'); return }
    jalankan('createLink', u); keluarkan()
  }

  // Tempel sebagai teks polos: menghindari gaya dan sampah dari Word atau situs lain. Baris kosong menjadi paragraf baru.
  function tempel(e: React.ClipboardEvent) {
    e.preventDefault()
    const t = e.clipboardData.getData('text/plain').replace(/\r/g, '').trim()
    if (!t) return
    const html = t.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')
    jalankan('insertHTML', html); keluarkan()
  }

  const tombol = (a: Alat) => (
    <button key={a.perintah} type="button" className={aktif[a.perintah] ? 'aktif' : ''} title={a.label} aria-label={a.label} aria-pressed={!!aktif[a.perintah]}
      onMouseDown={(e) => e.preventDefault()} onClick={() => perintah(a.perintah, a.nilai)}>{a.isi}</button>
  )

  return (
    <div className="ed-wys">
      <div className="ed-alat" role="toolbar" aria-label="Pemformatan teks">
        <select value={blok} aria-label="Gaya paragraf" onChange={(e) => perintah('formatBlock', e.target.value)}>
          <option value="p">Paragraf</option>
          <option value="h2">Subjudul besar</option>
          <option value="h3">Subjudul kecil</option>
          <option value="blockquote">Kutipan</option>
        </select>
        <span className="ed-grup">{GAYA.map(tombol)}</span>
        <span className="ed-grup">{RATA.map(tombol)}</span>
        <span className="ed-grup">{DAFTAR.map(tombol)}</span>
        <span className="ed-grup">
          <button type="button" title="Tautan" aria-label="Tautan" onMouseDown={(e) => e.preventDefault()} onClick={tautan}>🔗</button>
          <button type="button" title="Hapus tautan" aria-label="Hapus tautan" onMouseDown={(e) => e.preventDefault()} onClick={() => perintah('unlink')}>⛓︎×</button>
          <button type="button" title="Garis pemisah" aria-label="Garis pemisah" onMouseDown={(e) => e.preventDefault()} onClick={() => perintah('insertHorizontalRule')}>―</button>
          <button type="button" title="Bersihkan format" aria-label="Bersihkan format" onMouseDown={(e) => e.preventDefault()} onClick={() => perintah('removeFormat')}>Tx</button>
        </span>
        <span className="ed-grup">
          <button type="button" title="Urungkan (Ctrl+Z)" aria-label="Urungkan" onMouseDown={(e) => e.preventDefault()} onClick={() => perintah('undo')}>↶</button>
          <button type="button" title="Ulangi (Ctrl+Y)" aria-label="Ulangi" onMouseDown={(e) => e.preventDefault()} onClick={() => perintah('redo')}>↷</button>
        </span>
      </div>
      <div ref={area} className="ed-isi bt-isi" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Isi berita"
        data-kosong="Mulai menulis di sini. Paragraf pertama sebaiknya menjawab: apa, siapa, kapan, di mana."
        onInput={keluarkan} onBlur={keluarkan} onPaste={tempel} onKeyUp={bacaStatus} onMouseUp={bacaStatus} />
    </div>
  )
})
export default PenyuntingIsi
