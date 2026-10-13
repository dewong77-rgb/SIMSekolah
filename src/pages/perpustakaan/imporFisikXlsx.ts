// Template dan pembaca Excel untuk impor buku fisik. exceljs dimuat hanya saat dipakai.
import { JENIS_BUKU, SUMBER, TINGKAT } from '../../lib/perpustakaan'

export const BATAS_BARIS = 1000

type Kol = { kunci: string; judul: string; lebar: number; wajib?: boolean; catatan: string; contoh: [string | number, string | number] }
const KOLOM: Kol[] = [
  { kunci: 'judul', judul: 'Judul', lebar: 36, wajib: true, catatan: '3 sampai 200 huruf.', contoh: ['Matematika Kelas X', 'Informatika Kelas X'] },
  { kunci: 'penulis', judul: 'Penulis', lebar: 24, catatan: 'Dipakai bersama judul untuk mengenali buku yang sudah ada.', contoh: ['Tim Kemendikbud', 'Wahyono'] },
  { kunci: 'penerbit', judul: 'Penerbit', lebar: 22, catatan: '', contoh: ['Kemendikbud', 'Kemendikbud'] },
  { kunci: 'tahun_terbit', judul: 'Tahun terbit', lebar: 12, catatan: 'Empat angka, 1900 sampai 2100.', contoh: [2021, 2021] },
  { kunci: 'isbn', judul: 'ISBN', lebar: 18, catatan: 'Bila diisi, ISBN dipakai untuk mengenali buku yang sudah ada (tanda hubung diabaikan).', contoh: ['978-602-282-000-1', ''] },
  { kunci: 'jenis_buku', judul: 'Jenis buku', lebar: 22, catatan: 'Pilih dari daftar. Kosong berarti Buku teks pelajaran.', contoh: ['Buku teks pelajaran', 'Buku teks pelajaran'] },
  { kunci: 'kategori', judul: 'Kategori', lebar: 20, catatan: 'Bebas, misalnya Informatika atau Matematika. Kosong berarti Umum.', contoh: ['Matematika', 'Informatika'] },
  { kunci: 'klasifikasi', judul: 'Klasifikasi DDC', lebar: 14, catatan: 'Tiga angka, boleh diikuti titik dan perincian: 510 atau 005.133.', contoh: ['510', '004'] },
  { kunci: 'nomor_panggil', judul: 'Nomor panggil', lebar: 16, catatan: 'Contoh: 510 TIM m.', contoh: ['510 TIM m', '004 WAH i'] },
  { kunci: 'rak', judul: 'Letak rak', lebar: 12, catatan: 'Contoh: A-2.', contoh: ['A-2', 'A-3'] },
  { kunci: 'edisi', judul: 'Edisi', lebar: 16, catatan: '', contoh: ['', 'Edisi revisi'] },
  { kunci: 'kota_terbit', judul: 'Kota terbit', lebar: 16, catatan: '', contoh: ['Jakarta', 'Jakarta'] },
  { kunci: 'bahasa', judul: 'Bahasa', lebar: 12, catatan: 'Kosong berarti Indonesia.', contoh: ['Indonesia', 'Indonesia'] },
  { kunci: 'mapel', judul: 'Mata pelajaran', lebar: 18, catatan: '', contoh: ['Matematika', 'Informatika'] },
  { kunci: 'tingkat', judul: 'Tingkat', lebar: 10, catatan: 'Pilih: Semua, X, XI, atau XII.', contoh: ['X', 'X'] },
  { kunci: 'subjek', judul: 'Kata kunci', lebar: 26, catatan: 'Pisahkan dengan koma.', contoh: ['aljabar, fungsi', 'algoritma, data'] },
  { kunci: 'jumlah', judul: 'Jumlah eksemplar', lebar: 12, wajib: true, catatan: 'Bilangan 0 sampai 500. Nomor induk dibuat otomatis (FIS/tahun/0001). Isi 0 bila hanya mendata judul.', contoh: [10, 5] },
  { kunci: 'sumber_perolehan', judul: 'Sumber perolehan', lebar: 16, catatan: 'Pilih dari daftar. Kosong berarti Pembelian.', contoh: ['Dana BOS', 'Pembelian'] },
  { kunci: 'tanggal_perolehan', judul: 'Tanggal perolehan', lebar: 16, catatan: 'Format 2026-07-15 atau 15/07/2026.', contoh: ['2026-07-15', ''] },
  { kunci: 'harga', judul: 'Harga satuan (Rp)', lebar: 16, catatan: 'Angka saja, tanpa titik pemisah ribuan.', contoh: [75000, 80000] },
]

export type BarisImpor = { baris: number; data: Record<string, string>; galat: string | null }

export async function unduhTemplate() {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  const ws = wb.addWorksheet('Buku fisik', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = KOLOM.map((k) => ({ header: k.judul + (k.wajib ? ' *' : ''), key: k.kunci, width: k.lebar }))
  const kepala = ws.getRow(1)
  kepala.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  kepala.alignment = { vertical: 'middle', wrapText: true }
  kepala.height = 32
  kepala.eachCell((c, i) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KOLOM[i - 1].wajib ? 'FFB45309' : 'FF1F4E8C' } } })
  for (const n of [0, 1]) ws.addRow(Object.fromEntries(KOLOM.map((k) => [k.kunci, k.contoh[n]])))
  const daftar = (kunci: string, nilai: string[]) => {
    const kol = KOLOM.findIndex((k) => k.kunci === kunci) + 1
    for (let r = 2; r <= BATAS_BARIS + 1; r++) ws.getCell(r, kol).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${nilai.join(',')}"`] }
  }
  daftar('jenis_buku', JENIS_BUKU.map((j) => j[1]))
  daftar('sumber_perolehan', SUMBER.map((s) => s[1]))
  daftar('tingkat', [...TINGKAT])

  const pt = wb.addWorksheet('Petunjuk')
  pt.columns = [{ width: 24 }, { width: 100 }]
  pt.addRow(['Cara mengisi']).font = { bold: true, size: 14 }
  for (const t of [
    'Isi sheet "Buku fisik". Dua baris contoh boleh dihapus. Satu baris sama dengan satu judul beserta jumlah eksemplarnya.',
    'Kolom bertanda * wajib. Sisanya boleh kosong.',
    'Judul yang sudah ada tidak digandakan. Dikenali dari ISBN, atau dari judul dan penulis yang sama. Jumlah eksemplar baru ditambahkan ke judul itu.',
    `Maksimal ${BATAS_BARIS} baris per berkas. Baris yang salah dilewati dan dilaporkan, baris lain tetap masuk.`,
    'Jangan mengubah nama kolom di baris pertama.',
  ]) pt.addRow(['', t])
  pt.addRow([])
  pt.addRow(['Kolom', 'Keterangan']).font = { bold: true }
  for (const k of KOLOM) pt.addRow([k.judul + (k.wajib ? ' *' : ''), k.catatan || '-'])
  pt.addRow([])
  pt.addRow(['Pilihan jenis buku', JENIS_BUKU.map((j) => j[1]).join(' · ')])
  pt.addRow(['Pilihan sumber', SUMBER.map((s) => s[1]).join(' · ')])
  pt.addRow(['Pilihan tingkat', TINGKAT.join(' · ')])
  pt.eachRow((r) => { r.alignment = { vertical: 'top', wrapText: true } })

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url; a.download = 'template-impor-buku-fisik.xlsx'; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function teks(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) return new Date(v.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10)
  if (typeof v === 'object') {
    const o = v as { text?: string; richText?: { text: string }[]; result?: unknown; hyperlink?: string }
    if (o.richText) return o.richText.map((x) => x.text).join('').trim()
    if (o.text != null) return String(o.text).trim()
    if (o.result != null) return teks(o.result)
    return ''
  }
  return String(v).trim()
}
const norm = (s: string) => s.toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim()
const cocok = (daftar: readonly (readonly [string, string])[], v: string) => {
  const x = norm(v)
  return daftar.find((d) => norm(d[0]) === x || norm(d[1]) === x)?.[0]
}

function sahTanggal(t: string, m: string, h: string): string | null {
  const y = Number(t), mo = Number(m), d = Number(h)
  const x = new Date(Date.UTC(y, mo - 1, d))
  return y >= 1900 && y <= 2100 && x.getUTCFullYear() === y && x.getUTCMonth() === mo - 1 && x.getUTCDate() === d
    ? `${t}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null
}
function tanggal(s: string): string | null {
  if (!s) return ''
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return sahTanggal(m[1], m[2], m[3])
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  return m ? sahTanggal(m[3], m[2], m[1]) : null
}

/** Angka rupiah: "Rp 50.000", "50.000,50", "50000", "50000.5". Titik ribuan gaya Indonesia dikenali. */
function rupiah(s: string): number | null {
  let x = s.replace(/rp\.?/i, '').replace(/\s/g, '')
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(x)) x = x.replace(/\./g, '').replace(',', '.')
  else if (/^\d+,\d+$/.test(x)) x = x.replace(',', '.')
  return /^\d+(\.\d+)?$/.test(x) ? Number(x) : null
}

/** Membaca berkas Excel menjadi baris yang sudah diperiksa. Pemeriksaan akhir tetap dilakukan basis data. */
export async function bacaBerkas(file: File): Promise<BarisImpor[]> {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  try { await wb.xlsx.load(await file.arrayBuffer()) } catch { throw new Error('Berkas tidak dapat dibaca. Gunakan berkas .xlsx, sebaiknya dari template.') }
  const ws = wb.getWorksheet('Buku fisik') ?? wb.worksheets[0]
  if (!ws) throw new Error('Berkas tidak berisi lembar kerja.')
  const peta: Record<string, number> = {}
  ws.getRow(1).eachCell((c, i) => {
    const t = norm(teks(c.value))
    const k = KOLOM.find((x) => norm(x.judul) === t)
    if (k) peta[k.kunci] = i
  })
  for (const w of KOLOM.filter((k) => k.wajib)) if (!peta[w.kunci]) throw new Error(`Kolom "${w.judul}" tidak ditemukan di baris pertama. Pakai template terbaru.`)

  const hasil: BarisImpor[] = []
  ws.eachRow((row, nomor) => {
    if (nomor === 1) return
    const mentah: Record<string, string> = {}
    for (const k of KOLOM) mentah[k.kunci] = peta[k.kunci] ? teks(row.getCell(peta[k.kunci]).value) : ''
    if (Object.values(mentah).every((v) => v === '')) return
    const d: Record<string, string> = { ...mentah }
    let galat: string | null = null
    const salah = (m: string) => { galat ??= m }
    if (d.judul.length < 3 || d.judul.length > 200) salah('Judul wajib diisi, 3 sampai 200 huruf.')
    if (d.tahun_terbit) { const t = Number(d.tahun_terbit); if (!Number.isInteger(t) || t < 1900 || t > 2100) salah('Tahun terbit harus empat angka antara 1900 dan 2100.') }
    if (d.klasifikasi && !/^[0-9]{3}(\.[0-9]{1,8})?$/.test(d.klasifikasi)) salah('Klasifikasi DDC berbentuk 510 atau 005.133.')
    if (d.jenis_buku) { const j = cocok(JENIS_BUKU, d.jenis_buku); if (j) d.jenis_buku = j; else salah(`Jenis buku "${mentah.jenis_buku}" tidak dikenal. Pilih dari daftar.`) }
    if (d.sumber_perolehan) { const s = cocok(SUMBER, d.sumber_perolehan); if (s) d.sumber_perolehan = s; else salah(`Sumber "${mentah.sumber_perolehan}" tidak dikenal. Pilih dari daftar.`) }
    if (d.tingkat) { const t = TINGKAT.find((x) => norm(x) === norm(d.tingkat)); if (t) d.tingkat = t; else salah('Tingkat harus Semua, X, XI, atau XII.') }
    const jumlah = d.jumlah === '' ? 1 : Number(d.jumlah)
    if (!Number.isInteger(jumlah) || jumlah < 0 || jumlah > 500) salah('Jumlah eksemplar harus bilangan 0 sampai 500.')
    d.jumlah = String(Number.isInteger(jumlah) ? jumlah : 1)
    if (d.tanggal_perolehan) { const t = tanggal(d.tanggal_perolehan); if (t === null) salah('Tanggal perolehan berformat 2026-07-15 atau 15/07/2026.'); else d.tanggal_perolehan = t }
    if (d.harga) { const h = rupiah(d.harga); if (h === null) salah('Harga harus berupa angka, misalnya 75000 atau Rp 75.000.'); else d.harga = String(h) }
    if (d.kategori === '') d.kategori = 'Umum'
    for (const k of Object.keys(d)) if (d[k] === '') delete d[k]
    hasil.push({ baris: nomor, data: d, galat })
    if (hasil.length > BATAS_BARIS) throw new Error(`Berkas memuat lebih dari ${BATAS_BARIS} baris. Bagi menjadi beberapa berkas.`)
  })
  if (!hasil.length) throw new Error('Tidak ada baris data di berkas ini.')
  return hasil
}
