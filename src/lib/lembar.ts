import { htmlAman } from './dokumen'

// Mengubah dokumen Word (sudah jadi HTML) menjadi lembar yang bisa diisi.
// Kolom isian dikenali dari bentuk dokumen, bukan dari penanda khusus:
//   sel tabel kosong        -> kotak teks
//   paragraf garis/titik    -> kotak teks beberapa baris
//   garis/titik di kalimat  -> isian satu baris
//   kotak centang (☐ □)     -> kotak centang
// Tabel yang memuat "Diperiksa oleh" (kolom penilaian guru) dibiarkan.
// Setiap kolom diberi kunci f0, f1, ... menurut urutan di dokumen.

const KOSONG_PARAGRAF = /^[\s_.…\-–—]{4,}$/
const PENANDA = /(_{3,}|…{2,}|\.{6,}|[☐□])/
const PENANDA_SEMUA = /(_{3,}|…{2,}|\.{6,}|[☐□])/g

export type HasilLembar = { html: string; jumlah: number }

export function jadikanIsian(htmlMentah: string): HasilLembar {
  const doc = new DOMParser().parseFromString(`<body>${htmlAman(htmlMentah)}</body>`, 'text/html')
  let n = 0

  const kotak = (baris: number) => {
    const t = doc.createElement('textarea')
    t.className = 'isian'; t.rows = baris; t.setAttribute('data-f', `f${n++}`); t.maxLength = 5000
    t.setAttribute('aria-label', `Isian ${n}`)
    return t
  }
  const baris1 = () => {
    const i = doc.createElement('input')
    i.className = 'isian isian-baris'; i.type = 'text'; i.setAttribute('data-f', `f${n++}`); i.maxLength = 500
    i.setAttribute('aria-label', `Isian ${n}`)
    return i
  }
  const centang = () => {
    const i = doc.createElement('input')
    i.className = 'isian-centang'; i.type = 'checkbox'; i.setAttribute('data-f', `f${n++}`)
    i.setAttribute('aria-label', `Pilihan ${n}`)
    return i
  }

  const kosong = (el: Element) => (el.textContent ?? '').trim() === '' && !el.querySelector('img,table')
  const satuSel = (el: Element) => el.closest('table')?.querySelectorAll('td,th').length === 1

  function pecahTeks(t: Text) {
    const isi = t.data
    if (!PENANDA.test(isi)) return
    const bagian = isi.split(PENANDA_SEMUA)
    const frag = doc.createDocumentFragment()
    for (const b of bagian) {
      if (b === '') continue
      if (PENANDA.test(b) && (b === '☐' || b === '□')) frag.appendChild(centang())
      else if (PENANDA.test(b)) frag.appendChild(baris1())
      else frag.appendChild(doc.createTextNode(b))
    }
    t.replaceWith(frag)
  }

  function jalan(node: Node) {
    for (const anak of Array.from(node.childNodes)) {
      if (anak.nodeType === Node.TEXT_NODE) { pecahTeks(anak as Text); continue }
      if (anak.nodeType !== Node.ELEMENT_NODE) continue
      const el = anak as Element
      const tag = el.tagName
      if (tag === 'TABLE' && /diperiksa\s+oleh/i.test(el.textContent ?? '')) continue
      if (tag === 'TD' && kosong(el)) {
        const label = (el.previousElementSibling?.textContent ?? '').trim()
        // sel di samping label pendek (Nama, Kelas, angka soal) cukup satu baris
        if (label !== '' && label.length <= 12 && !satuSel(el)) { const i = baris1(); i.classList.add('isian-penuh'); el.replaceChildren(i) }
        else el.replaceChildren(kotak(satuSel(el) ? 6 : 3))
        continue
      }
      if (tag === 'P' && KOSONG_PARAGRAF.test(el.textContent ?? '') && !el.querySelector('img')) {
        const sel = el.parentElement
        const label = (sel?.tagName === 'TD' ? sel.previousElementSibling?.textContent ?? '' : '').trim()
        if (sel && sel.children.length === 1 && label !== '' && label.length <= 12 && !satuSel(sel)) { const i = baris1(); i.classList.add('isian-penuh'); el.replaceChildren(i) }
        else el.replaceChildren(kotak(3))
        continue
      }
      jalan(el)
    }
  }
  jalan(doc.body)
  return { html: doc.body.innerHTML, jumlah: n }
}
