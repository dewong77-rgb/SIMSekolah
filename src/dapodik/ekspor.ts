// Ekspor biodata peserta didik dan PTK ke berkas Excel berformat Dapodik, sehingga admin yang tidak memegang berkas mentah
// Dapodik tetap punya salinan lengkap. Nama kolom, baris judul bertingkat (Data Ayah/Ibu/Wali), dan judul lembar mengikuti
// berkas Dapodik, jadi hasilnya bisa dibaca kembali oleh Unggah Dapodik. Data diambil lewat ekspor_peserta_didik dan ekspor_ptk.

import { PD_EXTRA, PD_MAIN, PD_ORTU, PD_SENS, PTK_MAIN, PTK_SENS, type Peta } from './peta'
import type { Cell, Row } from './util'

type Kolom = { label: string; ambil: (r: Record<string, unknown>) => Cell }

const norm = (s: string) => s.toLowerCase().trim()
const HUBUNGAN: [string, string][] = [['ayah', 'Data Ayah'], ['ibu', 'Data Ibu'], ['wali', 'Data Wali']]
const SUB_ORTU = ['Nama', 'Tahun Lahir', 'Jenjang Pendidikan', 'Pekerjaan', 'Penghasilan', 'NIK', 'Kebutuhan Khusus']

// Urutan kolom mengikuti ekspor Dapodik. Label dicocokkan ke peta pengurai (huruf kecil) untuk mendapat nama medan dan tipe.
const LABEL_PD = [
  'Nama', 'NIPD', 'JK', 'NISN', 'Tempat Lahir', 'Tanggal Lahir', 'NIK', 'Agama', 'Alamat', 'RT', 'RW', 'Dusun', 'Kelurahan', 'Kecamatan',
  'Kode Pos', 'Jenis Tinggal', 'Alat Transportasi', 'Telepon', 'HP', 'E-Mail', 'SKHUN', 'Penerima KPS', 'No. KPS',
  '@ORTU', 'Rombel Saat Ini', 'No Peserta Ujian Nasional', 'No Seri Ijazah', 'Penerima KIP', 'Nomor KIP', 'Nama di KIP', 'Nomor KKS',
  'No Registrasi Akta Lahir', 'Bank', 'Nomor Rekening Bank', 'Rekening Atas Nama', 'Layak PIP (Usulan dari Sekolah)', 'Alasan Layak PIP',
  'Kebutuhan Khusus', 'Sekolah Asal', 'Anak ke-berapa', 'Lintang', 'Bujur', 'No KK', 'Berat Badan', 'Tinggi Badan', 'Lingkar Kepala',
  'Jml. Saudara Kandung', 'Jarak Rumah ke Sekolah (km)',
]
const LABEL_PD_KELUAR = ['Keluar Karena', 'Tanggal Keluar']

const LABEL_PTK = [
  'Nama', 'NUPTK', 'JK', 'Tempat Lahir', 'Tanggal Lahir', 'NIP', 'Status Kepegawaian', 'Jenis PTK', 'Agama', 'Alamat Jalan', 'RT', 'RW',
  'Nama Dusun', 'Desa/Kelurahan', 'Kecamatan', 'Kode Pos', 'Telepon', 'HP', 'Email', 'Tugas Tambahan', 'SK CPNS', 'Tanggal CPNS',
  'SK Pengangkatan', 'TMT Pengangkatan', 'Lembaga Pengangkatan', 'Pangkat Golongan', 'Sumber Gaji', 'Nama Ibu Kandung', 'Status Perkawinan',
  'Nama Suami/Istri', 'NIP Suami/Istri', 'Pekerjaan Suami/Istri', 'TMT PNS', 'Sudah Lisensi Kepala Sekolah', 'Pernah Diklat Kepengawasan',
  'Keahlian Braille', 'Keahlian Bahasa Isyarat', 'NPWP', 'Nama Wajib Pajak', 'Kewarganegaraan', 'Bank', 'Nomor Rekening Bank',
  'Rekening Atas Nama', 'NIK', 'No KK', 'Karpeg', 'Karis/Karsu', 'Lintang', 'Bujur', 'NUKS',
]

function nilai(v: unknown, tipe: string): Cell {
  if (v === null || v === undefined || v === '') return null
  if ((tipe === 'int' || tipe === 'num' || tipe === 'geo') && (typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(String(v)))) return Number(v)
  return String(v)
}

function kolomDari(label: string, peta: Peta): Kolom {
  const e = peta.get(norm(label))
  if (!e) throw new Error(`Kolom ${label} tidak ada di peta Dapodik`)
  const [medan, tipe] = e
  return { label, ambil: (r) => nilai(r[medan], tipe) }
}

function kolomOrtu(hub: string, sub: string): Kolom {
  const e = PD_ORTU.get(`data ${hub}.${norm(sub)}`)
  if (!e) throw new Error(`Kolom ortu ${hub}.${sub} tidak ada di peta`)
  const [medan, tipe] = e
  const f = medan.split('|')[1]
  return { label: sub, ambil: (r) => nilai((r._ortu as Record<string, Record<string, unknown>> | undefined)?.[hub]?.[f], tipe) }
}

export type Susunan = { judul: string; baris: Row[]; lebarKolom: number; gabung: { baris: number; dari: number; sampai: number }[]; tinggiKepala: number }

function meta(judul: string, pengunduh: string, sekolah: string | null): Row[] {
  const sekarang = new Date()
  const p2 = (n: number) => String(n).padStart(2, '0')
  const stempel = `${sekarang.getFullYear()}-${p2(sekarang.getMonth() + 1)}-${p2(sekarang.getDate())} ${p2(sekarang.getHours())}:${p2(sekarang.getMinutes())}:${p2(sekarang.getSeconds())}`
  return [[judul], [sekolah], [`Tanggal Unduh: ${stempel} Pengunduh: ${pengunduh}`], []]
}

function susun(judul: string, pengunduh: string, sekolah: string | null, kolom: (Kolom | { grup: string; anak: Kolom[] })[], data: Record<string, unknown>[]): Susunan {
  const atas: Cell[] = ['No']
  const bawah: Cell[] = [null]
  const gabung: Susunan['gabung'] = []
  const datar: Kolom[] = []
  for (const k of kolom) {
    if ('grup' in k) {
      const dari = atas.length
      atas.push(k.grup); bawah.push(k.anak[0].label)
      for (const a of k.anak.slice(1)) { atas.push(null); bawah.push(a.label) }
      gabung.push({ baris: 0, dari, sampai: atas.length - 1 })
      datar.push(...k.anak)
    } else {
      atas.push(k.label); bawah.push(null); datar.push(k)
    }
  }
  const bertingkat = bawah.some((x) => x !== null)
  const kepala = meta(judul, pengunduh, sekolah)
  const awal = kepala.length
  const baris: Row[] = [...kepala, atas, ...(bertingkat ? [bawah] : [])]
  data.forEach((r, i) => baris.push([i + 1, ...datar.map((k) => k.ambil(r))]))
  return { judul, baris, lebarKolom: atas.length, gabung: gabung.map((g) => ({ ...g, baris: awal })), tinggiKepala: bertingkat ? 2 : 1 }
}

export function susunPesertaDidik(data: Record<string, unknown>[], keluar: boolean, pengunduh: string, sekolah: string | null): Susunan {
  const peta: Peta = new Map([...PD_MAIN, ...PD_SENS, ...PD_EXTRA])
  const kolom: (Kolom | { grup: string; anak: Kolom[] })[] = []
  for (const l of [...LABEL_PD, ...(keluar ? LABEL_PD_KELUAR : [])]) {
    if (l === '@ORTU') for (const [h, g] of HUBUNGAN) kolom.push({ grup: g, anak: SUB_ORTU.map((s) => kolomOrtu(h, s)) })
    else if (l === 'Rombel Saat Ini') kolom.push({ label: l, ambil: (r) => nilai(r._rombel, 'text') })
    else kolom.push(kolomDari(l, peta))
  }
  return susun(keluar ? 'Daftar Peserta Didik Keluar' : 'Daftar Peserta Didik', pengunduh, sekolah, kolom, data)
}

export function susunPtk(data: Record<string, unknown>[], jenis: 'guru' | 'tendik', pengunduh: string, sekolah: string | null): Susunan {
  const peta: Peta = new Map([...PTK_MAIN, ...PTK_SENS])
  return susun(jenis === 'guru' ? 'Daftar Guru' : 'Daftar Tenaga Kependidikan', pengunduh, sekolah, LABEL_PTK.map((l) => kolomDari(l, peta)), data)
}

/** Menulis susunan ke berkas .xlsx (exceljs dimuat hanya saat dipakai). Mengembalikan isi berkas. */
export async function tulisXlsx(s: Susunan): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(s.judul.slice(0, 31))
  const kepala = s.baris.findIndex((r) => r[0] === 'No')
  s.baris.forEach((r) => ws.addRow(r.map((c) => (c === null ? null : c))))
  for (const g of s.gabung) ws.mergeCells(g.baris + 1, g.dari + 1, g.baris + 1, g.sampai + 1)
  ws.getRow(1).font = { bold: true, size: 13 }
  for (let i = 0; i < s.tinggiKepala; i++) {
    const r = ws.getRow(kepala + 1 + i)
    r.font = { bold: true }
    r.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  }
  ws.getColumn(1).width = 6
  for (let c = 2; c <= s.lebarKolom; c++) ws.getColumn(c).width = c === 2 ? 30 : 18
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: kepala + s.tinggiKepala }]
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

function unduh(isi: ArrayBuffer, nama: string) {
  const url = URL.createObjectURL(new Blob([isi], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url; a.download = nama
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

const hariIni = () => new Date().toLocaleDateString('sv-SE')

export async function eksporPesertaDidik(status: 'aktif' | 'keluar', pengunduh: string, sekolah: string | null): Promise<number> {
  const { panggil } = await import('../lib/rpc')
  const data = await panggil<Record<string, unknown>[]>('ekspor_peserta_didik', { p_status: status })
  unduh(await tulisXlsx(susunPesertaDidik(data, status === 'keluar', pengunduh, sekolah)), `Daftar Peserta Didik ${status === 'keluar' ? 'Keluar ' : ''}${hariIni()}.xlsx`)
  return data.length
}

export async function eksporPtk(jenis: 'guru' | 'tendik', pengunduh: string, sekolah: string | null): Promise<number> {
  const { panggil } = await import('../lib/rpc')
  const data = await panggil<Record<string, unknown>[]>('ekspor_ptk', { p_jenis: jenis })
  unduh(await tulisXlsx(susunPtk(data, jenis, pengunduh, sekolah)), `${jenis === 'guru' ? 'Daftar Guru' : 'Daftar Tenaga Kependidikan'} ${hariIni()}.xlsx`)
  return data.length
}
