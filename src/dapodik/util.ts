// Utilitas nilai. Port dari dapodik_import.py (bagian 2), perilaku dijaga sama.

export type Cell = string | number | boolean | null
export type Row = Cell[]
/** Map agar urutan lembar terjaga, apa pun namanya. */
export type Book = Map<string, Row[]>

export type Rec = Record<string, string | number | null>

/** Representasi string gaya Python, dipakai agar pesan isu identik dengan acuan. */
export function pyRepr(v: unknown): string {
  if (v === null || v === undefined) return 'None'
  if (typeof v !== 'string') return String(v)
  const adaPetik = v.includes("'")
  const adaGanda = v.includes('"')
  const q = adaPetik && !adaGanda ? '"' : "'"
  let s = v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
  if (q === "'") s = s.replace(/'/g, "\\'")
  return q + s + q
}

export function norm(s: unknown): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/:+$/, '')
    .trim()
}

const CP1252_KHUSUS: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
}

/** Ekspor Dapodik memuat 'â€“' (en dash yang salah encoding) pada kolom penghasilan. */
export function perbaikiMojibake(s: string): string {
  if (!s.includes('â') && !s.includes('Ã')) return s
  const bytes: number[] = []
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    if (CP1252_KHUSUS[cp] !== undefined) bytes.push(CP1252_KHUSUS[cp])
    else if (cp <= 0xff && !(cp >= 0x80 && cp <= 0x9f)) bytes.push(cp)
    else return s
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))
  } catch {
    return s
  }
}

/** String bersih atau null. Angka diubah ke teks, sel kosong dan '-' jadi null. */
export function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = perbaikiMojibake(String(v)).trim()
  return s === '' || s === '-' || s === '--' ? null : s
}

function tanggalValid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false
  const hari = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return d <= hari
}

const p2 = (n: number) => String(n).padStart(2, '0')

/** Hasil: [tanggal ISO atau null, pesan galat atau null]. */
export function toDate(v: unknown): [string | null, string | null] {
  const s = clean(v)
  if (s === null) return [null, null]
  let m: RegExpMatchArray | null
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)) || (m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2}) \d{1,2}:\d{1,2}:\d{1,2}$/))) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    if (tanggalValid(y, mo, d)) return [`${y}-${p2(mo)}-${p2(d)}`, null]
  } else if ((m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/))) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
    if (tanggalValid(y, mo, d)) return [`${y}-${p2(mo)}-${p2(d)}`, null]
  }
  return [null, 'tanggal tidak terbaca: ' + pyRepr(s)]
}

const POLA_ANGKA = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/

export function toNum(v: unknown, zeroNull = false): [number | null, string | null] {
  const s = clean(v)
  if (s === null) return [null, null]
  const t = s.replace(/,/g, '.')
  if (!POLA_ANGKA.test(t)) return [null, 'angka tidak terbaca: ' + pyRepr(s)]
  const n = Number(t)
  if (zeroNull && n === 0) return [null, null]
  return [n, null]
}

export function toInt(v: unknown): [number | null, string | null] {
  const [n, err] = toNum(v)
  if (err || n === null) return [null, err]
  return [Math.trunc(n), null]
}

export async function sha(...parts: unknown[]): Promise<string> {
  const data = new TextEncoder().encode(parts.map((p) => String(p)).join('|'))
  const h = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function nkey(s: unknown): string {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function tingkatDariNama(nama: string | null | undefined): number | null {
  const m = (nama ?? '').trim().toUpperCase().match(/^(XIII|XII|XI|X)\b/)
  if (!m) return null
  return { X: 10, XI: 11, XII: 12, XIII: 13 }[m[1] as 'X' | 'XI' | 'XII' | 'XIII']
}

/** Tahun ajaran mulai Juli. Juli sampai Desember = Ganjil, Januari sampai Juni = Genap. */
export function semesterDariTanggal(tglIso: string): { id: string; tahunAjaran: string; jenis: 'Ganjil' | 'Genap' } {
  const y = Number(tglIso.slice(0, 4))
  const mo = Number(tglIso.slice(5, 7))
  if (mo >= 7) return { id: `${y}1`, tahunAjaran: `${y}/${y + 1}`, jenis: 'Ganjil' }
  return { id: `${y - 1}2`, tahunAjaran: `${y - 1}/${y}`, jenis: 'Genap' }
}

export function semesterDariId(sid: string) {
  const y = Number(sid.slice(0, 4))
  return { id: sid, tahunAjaran: `${y}/${y + 1}`, jenis: sid[4] === '1' ? ('Ganjil' as const) : ('Genap' as const) }
}

export type Isu = { tingkat: 'info' | 'peringatan' | 'galat'; lembar: string | null; baris: number | null; kolom: string | null; pesan: string }

/** Pencatat isu. Isu identik dikumpulkan dan dihitung. */
export class Ctx {
  private isuMap = new Map<string, { n: number; baris: number | null; tingkat: Isu['tingkat']; lembar: string | null; kolom: string | null; pesan: string }>()
  diunduh: string | null = null
  pengunduh: string | null = null
  constructor(public jenis: string) {}

  isu(tingkat: Isu['tingkat'], pesan: string, lembar: string | null = null, baris: number | null = null, kolom: string | null = null) {
    const k = JSON.stringify([tingkat, lembar, kolom, pesan])
    const ada = this.isuMap.get(k)
    if (ada) ada.n += 1
    else this.isuMap.set(k, { n: 1, baris, tingkat, lembar, kolom, pesan })
  }

  daftar(): Isu[] {
    return [...this.isuMap.values()].map((e) => ({
      tingkat: e.tingkat,
      lembar: e.lembar,
      baris: e.baris,
      kolom: e.kolom,
      pesan: e.n > 1 ? `${e.pesan} (${e.n} baris)` : e.pesan,
    }))
  }
}

/** Ambil 'Tanggal Unduh' dan 'Pengunduh' dari 10 baris pertama. */
export function bacaMeta(rows: Row[], ctx: Ctx) {
  for (const r of rows.slice(0, 10)) {
    for (const c of r) {
      const s = clean(c)
      if (typeof s !== 'string') continue
      let m = s.match(/Tanggal Unduh:\s*(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?/)
      if (!m) m = s.match(/Per tanggal\s*:\s*(\d{4}-\d{2}-\d{2})()/)
      if (m && ctx.diunduh === null) ctx.diunduh = `${m[1]}T${m[2] || '00:00:00'}`
      const p = s.match(/Pengunduh:\s*([^(]+)/)
      if (p && ctx.pengunduh === null) ctx.pengunduh = p[1].trim()
    }
  }
}
