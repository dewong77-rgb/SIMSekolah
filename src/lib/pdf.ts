// Pemuat PDF.js. Dimuat malas agar bundel halaman lain tidak membengkak.
import type { PDFDocumentProxy } from 'pdfjs-dist'

let modul: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null

export function muatPdfjs() {
  modul ??= Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]).then(([m, w]) => {
    m.GlobalWorkerOptions.workerSrc = w.default
    return m
  })
  return modul
}

/** Membuka PDF dari tautan bertanda tangan atau dari berkas lokal. */
const tugasMuat = new WeakMap<PDFDocumentProxy, { destroy: () => Promise<void> }>()

export async function bukaPdf(sumber: { url: string } | { data: ArrayBuffer }): Promise<PDFDocumentProxy> {
  const m = await muatPdfjs()
  const tugas = m.getDocument(sumber)
  const doc = await tugas.promise
  tugasMuat.set(doc, tugas)
  return doc
}

/** Melepas dokumen, menghentikan unduhan, dan mematikan worker. */
export function tutupPdf(doc: PDFDocumentProxy | null | undefined) {
  if (doc) void tugasMuat.get(doc)?.destroy().catch(() => undefined)
}

/** Menggambar satu halaman ke kanvas sesuai lebar yang tersedia. Mengembalikan fungsi pembatal. */
export async function gambarHalaman(doc: PDFDocumentProxy, nomor: number, kanvas: HTMLCanvasElement, lebarCss: number, zoom = 1) {
  const hal = await doc.getPage(nomor)
  const dasar = hal.getViewport({ scale: 1 })
  const skala = (lebarCss / dasar.width) * zoom
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const vp = hal.getViewport({ scale: skala * dpr })
  kanvas.width = Math.floor(vp.width)
  kanvas.height = Math.floor(vp.height)
  kanvas.style.width = `${Math.floor(vp.width / dpr)}px`
  kanvas.style.height = `${Math.floor(vp.height / dpr)}px`
  const tugas = hal.render({ canvas: kanvas, viewport: vp })
  await tugas.promise
}

/** Sampul dari halaman pertama, diperkecil menjadi WebP. */
export async function buatSampul(doc: PDFDocumentProxy, lebar = 360): Promise<Blob | null> {
  const c = document.createElement('canvas')
  await gambarHalaman(doc, 1, c, lebar, 1)
  return new Promise((ok) => c.toBlob(ok, 'image/webp', 0.8))
}
