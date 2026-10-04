import DOMPurify from 'dompurify'

// Dokumen Word (.docx) dijadikan HTML bersih untuk materi. Pembersihan dilakukan dua kali:
// saat impor (yang disimpan) dan saat ditampilkan (yang dilihat siswa). Server juga menolak elemen berbahaya.

export const BATAS_HTML = 300000

const KONFIG = {
  ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'img', 'blockquote', 'sup', 'sub', 'hr'],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'colspan', 'rowspan'],
  ALLOW_DATA_ATTR: false,
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|data:image\/(?:png|jpe?g|gif|webp);base64,)/i,
}

let terpasang = false
function pasangKait() {
  if (terpasang) return
  terpasang = true
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

/** HTML aman untuk ditampilkan. Dipakai di halaman siswa dan guru. */
export function htmlAman(html: string): string {
  pasangKait()
  return DOMPurify.sanitize(html, KONFIG) as unknown as string
}

/** Paragraf yang seluruhnya tebal dan pendek dianggap judul bagian. Yang pertama menjadi judul dokumen. */
function jadikanJudul(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  let pertama = true
  for (const p of Array.from(doc.body.children)) {
    if (p.tagName !== 'P' || p.children.length !== 1 || p.firstElementChild?.tagName !== 'STRONG') continue
    const teks = (p.textContent ?? '').trim()
    if (!teks || teks.length > 120 || (p.firstElementChild.textContent ?? '').trim() !== teks) continue
    const h = doc.createElement(pertama ? 'h2' : 'h3')
    h.textContent = teks
    p.replaceWith(h)
    pertama = false
  }
  return doc.body.innerHTML
}

export type HasilWord = { html: string; judul: string; ukuran: number }

/** Judul dari nama berkas: Bahan_Bacaan_M4.docx menjadi "Bahan Bacaan M4". */
export function judulDariNama(nama: string): string {
  return nama.replace(/\.docx$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function wordKeHtml(file: File): Promise<HasilWord> {
  if (!/\.docx$/i.test(file.name)) throw new Error('Hanya berkas .docx yang bisa diimpor. Simpan dokumen sebagai .docx dari Word.')
  if (file.size > 8 * 1024 * 1024) throw new Error('Berkas terlalu besar (maksimal 8 MB).')
  const mammoth = await import('mammoth/mammoth.browser.js')
  const hasil = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
  const html = htmlAman(jadikanJudul(hasil.value))
  if (!html.replace(/<[^>]*>/g, '').trim() && !html.includes('<img')) throw new Error('Dokumen kosong atau tidak bisa dibaca.')
  if (html.length > BATAS_HTML) throw new Error('Dokumen terlalu besar setelah diubah (kemungkinan banyak gambar). Kecilkan gambar atau pecah jadi beberapa dokumen.')
  return { html, judul: judulDariNama(file.name), ukuran: html.length }
}
