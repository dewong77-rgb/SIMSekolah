// Isi berita sebagai HTML terbatas. Disaring dengan DOMPurify saat disimpan dari penyunting dan saat ditampilkan,
// jadi isi yang diubah langsung di basis data pun tetap tidak bisa menjalankan skrip.
// Berita lama masih berupa teks biasa (format ringan: "## ", "> ", "- ", "[foto:N]"). Format itu dikenali dan diubah ke HTML saat dibuka di penyunting.
import DOMPurify from 'dompurify'
import type { Foto } from './berita'

const TAG = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'figure', 'img', 'figcaption', 'hr', 'span', 'div']
const KELAS = new Set(['ta-kiri', 'ta-tengah', 'ta-kanan', 'ta-penuh', 'bt-gambar', 'bt-lebar-penuh'])

export const adalahHtml = (isi: string) => /^\s*<(p|h2|h3|ul|ol|blockquote|figure|div|hr)[\s>]/i.test(isi)

const lurus = (s: string) => /^https:\/\//i.test(s) || /^\/[A-Za-z0-9]/.test(s)

/** Menyaring HTML: hanya tag dan atribut yang diizinkan, perataan lewat kelas (bukan gaya inline), tautan aman. */
export function bersihkanHtml(html: string): string {
  const bersih = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: TAG, ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style'], ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/(?!\/))/i,
  })
  const doc = new DOMParser().parseFromString(`<body>${bersih}</body>`, 'text/html')
  doc.body.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const kelas = new Set((el.getAttribute('class') ?? '').split(/\s+/).filter((k) => KELAS.has(k)))
    const rata = /text-align:\s*(left|center|right|justify)/i.exec(el.getAttribute('style') ?? '')?.[1]?.toLowerCase()
    if (rata) {
      for (const k of ['ta-kiri', 'ta-tengah', 'ta-kanan', 'ta-penuh']) kelas.delete(k)
      if (rata !== 'left') kelas.add(rata === 'center' ? 'ta-tengah' : rata === 'right' ? 'ta-kanan' : 'ta-penuh')
    }
    el.removeAttribute('style')
    if (kelas.size) el.setAttribute('class', [...kelas].join(' ')); else el.removeAttribute('class')
    if (el.tagName === 'A') {
      const h = el.getAttribute('href') ?? ''
      if (!/^(https?:|mailto:)/i.test(h)) el.removeAttribute('href')
      el.setAttribute('rel', 'noopener noreferrer nofollow'); el.setAttribute('target', '_blank')
    }
    if (el.tagName === 'IMG') {
      const s = el.getAttribute('src') ?? ''
      if (!lurus(s)) el.remove()
      else { el.setAttribute('loading', 'lazy'); el.setAttribute('referrerpolicy', 'no-referrer') }
    }
    if (el.tagName === 'DIV') { const p = doc.createElement('p'); p.innerHTML = el.innerHTML; for (const k of el.classList) p.classList.add(k); el.replaceWith(p) }
  })
  doc.body.querySelectorAll('p').forEach((el) => { if (!el.textContent?.trim() && !el.querySelector('img,figure')) el.remove() })
  return doc.body.innerHTML
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const sebaris = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')

/** Mengubah isi lama (teks ringan) menjadi HTML agar dapat disunting secara visual. */
export function teksKeHtml(isi: string, foto: Foto[] = []): string {
  if (adalahHtml(isi)) return isi
  const hasil: string[] = []
  for (const mentah of isi.replace(/\r/g, '').split(/\n{2,}/)) {
    const b = mentah.trim()
    if (!b) continue
    const f = /^\[foto:(\d{1,2})\]$/i.exec(b)
    if (f) {
      const x = foto[Number(f[1]) - 1]
      if (x && lurus(x.url)) hasil.push(`<figure class="bt-gambar"><img src="${esc(x.url)}" alt="${esc(x.keterangan)}">${x.keterangan ? `<figcaption>${esc(x.keterangan)}</figcaption>` : ''}</figure>`)
    } else if (/^##\s+/.test(b)) hasil.push(`<h2>${sebaris(b.replace(/^##\s+/, ''))}</h2>`)
    else if (/^>\s?/.test(b)) hasil.push(`<blockquote><p>${sebaris(b.split('\n').map((l) => l.replace(/^>\s?/, '')).join(' '))}</p></blockquote>`)
    else if (b.split('\n').every((l) => /^[-*]\s+/.test(l))) hasil.push(`<ul>${b.split('\n').map((l) => `<li>${sebaris(l.replace(/^[-*]\s+/, ''))}</li>`).join('')}</ul>`)
    else hasil.push(`<p>${b.split('\n').map(sebaris).join('<br>')}</p>`)
  }
  return hasil.join('')
}

/** Teks polos dari isi (HTML atau teks lama), untuk hitung kata dan lama baca. */
export function teksPolos(isi: string): string {
  if (!adalahHtml(isi)) return isi
  const d = new DOMParser().parseFromString(isi.replace(/<\/(p|h2|h3|li|blockquote|figcaption)>/gi, ' </$1>'), 'text/html')
  return (d.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}
