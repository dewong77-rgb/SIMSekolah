// Pembaca berkas. xlsx dibaca langsung dari XML di dalam zip, xls Dapodik (SpreadsheetML)
// dibaca dengan regex karena Dapodik tidak meng-escape "<" dan "&" sehingga parser XML baku gagal.
// Tanpa DOMParser, jadi jalan sama di browser dan di Node.

import { strFromU8, unzipSync } from 'fflate'
import type { Book, Cell, Row } from './util'

export class BerkasTidakDikenali extends Error {}

/** Urai entitas XML yang sah saja. "&" yang berdiri sendiri dibiarkan apa adanya. */
export function dekodeEntitas(s: string): string {
  if (!s.includes('&')) return s
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_m, e: string) => {
    switch (e) {
      case 'amp': return '&'
      case 'lt': return '<'
      case 'gt': return '>'
      case 'quot': return '"'
      case 'apos': return "'"
      default: {
        const cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
        try { return String.fromCodePoint(cp) } catch { return '' }
      }
    }
  })
}

function atribut(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of s.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = dekodeEntitas(m[2])
  return out
}

// ---------------------------------------------------------------- xlsx

function kolomKeIndeks(huruf: string): number {
  let n = 0
  for (const ch of huruf) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function teksDalam(xml: string, tag: string): string {
  let out = ''
  const re = new RegExp(`<${tag}\\b[^>]*?(?:/>|>([\\s\\S]*?)</${tag}>)`, 'g')
  for (const m of xml.matchAll(re)) out += dekodeEntitas(m[1] ?? '')
  return out
}

function bacaSharedStrings(xml: string): string[] {
  const hasil: string[] = []
  for (const m of xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) {
    const isi = (m[1] ?? '').replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
    hasil.push(teksDalam(isi, 't'))
  }
  return hasil
}

function bacaSheet(xml: string, shared: string[]): Row[] {
  const sel = new Map<number, Map<number, Cell>>()
  let maxBaris = 0
  let maxKolom = 0
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const attrBaris = atribut(rm[1])
    const isiBaris = rm[2] ?? ''
    let kolomBerjalan = 0
    for (const cm of isiBaris.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = atribut(cm[1])
      let kolom = kolomBerjalan
      let baris = attrBaris.r ? Number(attrBaris.r) : maxBaris + 1
      if (a.r) {
        const rr = a.r.match(/^([A-Z]+)(\d+)$/)
        if (rr) {
          kolom = kolomKeIndeks(rr[1])
          baris = Number(rr[2])
        }
      }
      kolomBerjalan = kolom + 1
      maxBaris = Math.max(maxBaris, baris)
      maxKolom = Math.max(maxKolom, kolom + 1)
      const inner = cm[2] ?? ''
      let nilai: Cell = null
      const v = inner.match(/<v\b[^>]*?>([\s\S]*?)<\/v>/)
      const tipe = a.t ?? 'n'
      if (tipe === 'inlineStr') {
        nilai = teksDalam(inner.replace(/<rPh\b[\s\S]*?<\/rPh>/g, ''), 't')
      } else if (v) {
        const mentah = v[1]
        if (tipe === 's') nilai = shared[Number(mentah)] ?? null
        else if (tipe === 'str' || tipe === 'e') nilai = dekodeEntitas(mentah)
        else if (tipe === 'b') nilai = mentah === '1'
        else nilai = Number(mentah)
      }
      if (!sel.has(baris)) sel.set(baris, new Map())
      sel.get(baris)!.set(kolom, nilai)
    }
  }
  // Susun seperti openpyxl: baris 1 sampai baris terakhir, lebar sama untuk semua baris.
  const rows: Row[] = []
  for (let b = 1; b <= maxBaris; b++) {
    const baris: Row = new Array(maxKolom).fill(null)
    const isi = sel.get(b)
    if (isi) for (const [k, val] of isi) baris[k] = val
    rows.push(baris)
  }
  return rows
}

export function bacaXlsx(data: Uint8Array): Book {
  const files = unzipSync(data, {
    filter: (f) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(f.name),
  })
  const teks = (nama: string) => (files[nama] ? strFromU8(files[nama]) : '')
  const wb = teks('xl/workbook.xml')
  const rels = teks('xl/_rels/workbook.xml.rels')
  const targetPerId = new Map<string, string>()
  for (const m of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const a = atribut(m[1])
    if (a.Id && a.Target) {
      const t = a.Target.startsWith('/') ? a.Target.slice(1) : 'xl/' + a.Target
      targetPerId.set(a.Id, t)
    }
  }
  const shared = bacaSharedStrings(teks('xl/sharedStrings.xml'))
  const book: Book = new Map()
  for (const m of wb.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const a = atribut(m[1])
    const target = targetPerId.get(a['r:id'])
    if (!a.name || !target || !files[target]) continue
    book.set(a.name, bacaSheet(strFromU8(files[target]), shared))
  }
  if (book.size === 0) throw new BerkasTidakDikenali('Berkas xlsx tidak berisi lembar yang dapat dibaca.')
  return book
}

// ---------------------------------------------------------------- SpreadsheetML (.xls XML)

export function bacaSpreadsheetML(teksAsli: string): Book {
  const txt = teksAsli.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
  const book: Book = new Map()
  for (const wm of txt.matchAll(/<Worksheet\b([^>]*)>([\s\S]*?)<\/Worksheet>/g)) {
    const nama = atribut(wm[1])['ss:Name'] ?? atribut(wm[1]).Name
    const tabel = wm[2].match(/<Table\b[^>]*>([\s\S]*?)<\/Table>/)
    if (!tabel) continue
    const rows: Row[] = []
    for (const rm of tabel[1].matchAll(/<Row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Row>)/g)) {
      const ar = atribut(rm[1])
      const idxBaris = ar['ss:Index']
      if (idxBaris) while (rows.length < Number(idxBaris) - 1) rows.push([])
      const row: Row = []
      for (const cm of (rm[2] ?? '').matchAll(/<Cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Cell>)/g)) {
        const ac = atribut(cm[1])
        if (ac['ss:Index']) while (row.length < Number(ac['ss:Index']) - 1) row.push(null)
        const d = (cm[2] ?? '').match(/<Data\b[^>]*>([\s\S]*?)<\/Data>/)
        row.push(d ? dekodeEntitas(d[1]) : null)
        for (let i = 0; i < Number(ac['ss:MergeAcross'] || 0); i++) row.push(null)
      }
      rows.push(row)
    }
    book.set(nama, rows)
  }
  if (book.size === 0) throw new BerkasTidakDikenali('Berkas xls XML tidak berisi lembar yang dapat dibaca.')
  return book
}

// ---------------------------------------------------------------- pintu masuk

export function bacaBerkas(data: Uint8Array): Book {
  const head = data.subarray(0, 512)
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 3 && head[3] === 4) return bacaXlsx(data)
  const lama = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
  if (lama.every((b, i) => head[i] === b)) {
    throw new BerkasTidakDikenali('Berkas .xls biner lama. Simpan ulang sebagai .xlsx lalu unggah lagi.')
  }
  const kepala = new TextDecoder('utf-8').decode(head)
  if (kepala.includes('urn:schemas-microsoft-com:office:spreadsheet') || kepala.trimStart().startsWith('<?xml')) {
    return bacaSpreadsheetML(new TextDecoder('utf-8').decode(data))
  }
  throw new BerkasTidakDikenali('Format berkas tidak dikenali (bukan xlsx maupun xls XML).')
}
