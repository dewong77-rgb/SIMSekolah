// Template Excel rencana ajar: sheet TP (ATP dan KKTP digabung) dan sheet Minggu (Program Semester).
// Guru mengunduh template, mengisi, lalu mengunggah. exceljs dimuat hanya saat dipakai.

export type BarisTp = { elemen_kode: string; elemen_nama: string | null; capaian: string | null; semester: number | null; kode: string; rumusan: string; alokasi_jp: number | null; kriteria: string | null; nilai_tuntas: number }
export type BarisMinggu = { semester: number | null; nomor: number | null; tanggal_mulai: string | null; tanggal_selesai: string | null; elemen_kode: string | null; materi_pokok: string | null; jp: number | null; tp_kode: string | null; keterangan: string | null; efektif: boolean }

const KOL_TP = ['Semester', 'Kode Elemen', 'Nama Elemen', 'Capaian Pembelajaran Elemen', 'Kode TP', 'Rumusan Tujuan Pembelajaran', 'Alokasi JP', 'Kriteria Ketercapaian (KKTP)', 'Nilai Tuntas']
export type Profil = Record<string, string>
export const KUNCI_PROFIL: [string, string][] = [
  ['satuan', 'Satuan pendidikan'], ['fase', 'Fase'], ['program_keahlian', 'Program keahlian'], ['alokasi_waktu', 'Alokasi waktu'], ['penyusun', 'Penyusun'],
  ['dasar_hukum', 'Dasar hukum (satu per baris, tekan Alt+Enter di Excel)'], ['cp_umum', 'Capaian Pembelajaran umum fase'],
  ['catatan_1', 'Catatan Prota semester 1'], ['catatan_2', 'Catatan Prota semester 2'], ['catatan_prota', 'Catatan akhir Prota'],
  ['kepala', 'Nama kepala sekolah'], ['nip_kepala', 'NIP kepala sekolah'], ['nip_guru', 'NIP guru'], ['kota', 'Kota pengesahan'], ['tanggal', 'Waktu pengesahan (misalnya Juli 2026)'],
]
const KOL_MG = ['Semester', 'Pertemuan ke', 'Tanggal Mulai', 'Tanggal Selesai', 'Kode Elemen', 'Materi Pokok', 'JP', 'Kode TP (pisah koma)', 'Keterangan']

function sel(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    const o = v as { text?: string; richText?: { text: string }[]; result?: unknown }
    if (o.richText) return o.richText.map((x) => x.text).join('').trim()
    if (o.text != null) return String(o.text).trim()
    if (o.result != null) return o.result instanceof Date ? o.result.toISOString().slice(0, 10) : String(o.result).trim()
  }
  return String(v).trim()
}
function tanggal(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) return new Date(v.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10)
  const s = sel(v)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}
const angka = (s: string): number | null => (s !== '' && Number.isFinite(Number(s)) ? Math.round(Number(s)) : null)

function gaya(ws: import('exceljs').Worksheet, lebar: number[]) {
  lebar.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A4A4A' } }
    c.alignment = { vertical: 'middle', wrapText: true }
  })
  ws.eachRow((r, n) => r.eachCell({ includeEmpty: true }, (c) => {
    c.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } }
    if (n > 1) { c.alignment = { vertical: 'top', wrapText: true }; c.font = { name: 'Calibri', size: 10 } }
  }))
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

async function simpan(wb: import('exceljs').Workbook, nama: string) {
  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url; a.download = nama
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** Unduh template. Bila data diberikan, isinya ikut (ekspor rencana sendiri), bila tidak, berisi contoh singkat. */
export async function unduhTemplateRencana(mapel: string, tingkat: string, data?: { tp: BarisTp[]; minggu: BarisMinggu[]; profil?: Profil }): Promise<void> {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  const info = wb.addWorksheet('Petunjuk')
  const baris = [
    [`Rencana ajar ${mapel} kelas ${tingkat}`],
    ['Isi tiga sheet: TP (Tujuan Pembelajaran beserta kriteria ketercapaian), Minggu (rencana per pertemuan), dan Profil (kop, dasar hukum, pengesahan; boleh dikosongkan). Satu baris per TP dan satu baris per minggu. Kolom Kunci di sheet Profil jangan diubah.'],
    ['Sheet TP: Kode TP harus unik, misalnya BK.1. Alokasi JP angka. Nilai Tuntas angka 0 sampai 100 (bawaan 70). Kolom Semester, Nama Elemen, dan Capaian boleh diisi sekali per elemen lalu disalin ke bawah.'],
    ['Sheet Minggu: minggu tidak efektif (libur, ujian, MPLS) cukup isi Semester, tanggal, dan Keterangan, kosongkan Pertemuan ke. Minggu efektif wajib punya nomor Pertemuan ke (1, 2, 3 dan seterusnya) dan Materi Pokok.'],
    ['Kode TP di sheet Minggu mengacu ke Kode TP di sheet TP. Boleh lebih dari satu, pisahkan dengan koma, misalnya BK.1, BK.2.'],
    ['Tanggal ditulis 2026-08-03 atau 03/08/2026.'],
    ['Setelah diunggah, rencana ini muncul di menu Rencana ajar dan bisa dipilih saat membuat pertemuan baru. Mengunggah lagi akan mengganti seluruh rencana mapel dan tingkat yang sama.'],
  ]
  baris.forEach((b) => info.addRow(b))
  info.getColumn(1).width = 120; info.getRow(1).font = { bold: true, size: 12 }
  info.eachRow((r) => { r.alignment = { wrapText: true, vertical: 'top' } })
  const t = wb.addWorksheet('TP'); t.addRow(KOL_TP)
  const m = wb.addWorksheet('Minggu'); m.addRow(KOL_MG)
  if (data) {
    data.tp.forEach((x) => t.addRow([x.semester, x.elemen_kode, x.elemen_nama, x.capaian, x.kode, x.rumusan, x.alokasi_jp, x.kriteria, x.nilai_tuntas]))
    data.minggu.forEach((x) => m.addRow([x.semester, x.nomor, x.tanggal_mulai, x.tanggal_selesai, x.elemen_kode, x.materi_pokok, x.jp, x.tp_kode, x.keterangan]))
  } else {
    t.addRow([1, 'SK', 'Sistem Komputer', 'Peserta didik mampu menjelaskan cara kerja komputer beserta komponennya.', 'SK.1', 'Peserta didik mampu menjelaskan fungsi komponen utama komputer.', 4, 'Peserta didik dapat menjelaskan fungsi minimal lima komponen utama komputer.', 70])
    t.addRow([1, 'SK', 'Sistem Komputer', '', 'SK.2', 'Peserta didik mampu menjelaskan representasi data biner.', 4, 'Peserta didik dapat mengonversi bilangan desimal ke biner dan sebaliknya dengan benar.', 70])
    m.addRow([1, '', '2026-07-20', '2026-07-22', '', '', '', '', 'MPLS, belum ada KBM'])
    m.addRow([1, 1, '2026-08-03', '2026-08-05', 'SK', 'Arsitektur komputer dan komponen utama', 4, 'SK.1', ''])
    m.addRow([1, 2, '2026-08-10', '2026-08-12', 'SK', 'Representasi data biner', 4, 'SK.2', ''])
  }
  const pf = wb.addWorksheet('Profil'); pf.addRow(['Kunci', 'Isi', 'Keterangan'])
  const nilaiPf = data?.profil ?? {}
  for (const [k, ket] of KUNCI_PROFIL) pf.addRow([k, nilaiPf[k] ?? '', ket])
  const elemenSem = new Map<string, string>()
  for (const x of (data?.tp ?? [])) elemenSem.set(`${x.elemen_kode}_${x.semester ?? 1}`, x.elemen_nama ?? x.elemen_kode)
  if (!data) elemenSem.set('SK_1', 'Sistem Komputer')
  for (const [k, nm] of elemenSem) pf.addRow([`fokus_${k}`, nilaiPf[`fokus_${k}`] ?? '', `Fokus materi elemen ${nm} (tampil di Prota)`])
  gaya(pf, [22, 90, 50])
  gaya(t, [10, 12, 28, 50, 10, 55, 10, 55, 12])
  gaya(m, [10, 12, 14, 14, 12, 60, 8, 22, 50])
  await simpan(wb, data ? `rencana-ajar-${mapel}-${tingkat}.xlsx`.replace(/\s+/g, '-') : 'template-rencana-ajar.xlsx')
}

export async function bacaRencanaXlsx(file: File): Promise<{ tp: BarisTp[]; minggu: BarisMinggu[]; profil: Profil | null; galat: string[] }> {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const galat: string[] = []
  const tp: BarisTp[] = []
  const minggu: BarisMinggu[] = []
  const t = wb.getWorksheet('TP')
  const m = wb.getWorksheet('Minggu')
  if (!t) galat.push('Sheet TP tidak ditemukan.')
  if (!m) galat.push('Sheet Minggu tidak ditemukan.')
  if (!t || !m) return { tp, minggu, profil: null, galat }
  const kodeAda = new Set<string>()
  let elemenTerakhir = { kode: '', nama: '', capaian: '', semester: '' }
  t.eachRow((row, n) => {
    if (n === 1) return
    const v = (i: number) => sel(row.getCell(i).value)
    const kode = v(5); const rumusan = v(6)
    if (!kode && !rumusan) return
    if (!kode || !rumusan) { galat.push(`Sheet TP baris ${n}: Kode TP dan Rumusan wajib diisi.`); return }
    if (kodeAda.has(kode)) { galat.push(`Sheet TP baris ${n}: Kode TP ${kode} dobel.`); return }
    kodeAda.add(kode)
    const nt = v(9) === '' ? 70 : angka(v(9))
    if (nt == null || nt < 0 || nt > 100) { galat.push(`Sheet TP baris ${n}: Nilai Tuntas harus 0 sampai 100.`); return }
    const ek = v(2) || elemenTerakhir.kode
    elemenTerakhir = { kode: ek, nama: v(3) || (v(2) ? '' : elemenTerakhir.nama), capaian: v(4) || (v(2) ? '' : elemenTerakhir.capaian), semester: v(1) || elemenTerakhir.semester }
    tp.push({ elemen_kode: ek || kode.split('.')[0], elemen_nama: elemenTerakhir.nama || null, capaian: elemenTerakhir.capaian || null, semester: angka(elemenTerakhir.semester), kode, rumusan, alokasi_jp: angka(v(7)), kriteria: v(8) || null, nilai_tuntas: nt })
  })
  const nomorAda = new Set<number>()
  m.eachRow((row, n) => {
    if (n === 1) return
    const v = (i: number) => sel(row.getCell(i).value)
    const nomor = angka(v(2)); const mp = v(6); const ket = v(9)
    if (!v(1) && nomor == null && !mp && !ket && !v(3)) return
    const efektif = nomor != null
    if (efektif && !mp) { galat.push(`Sheet Minggu baris ${n}: Materi Pokok wajib diisi untuk pertemuan efektif.`); return }
    if (efektif && nomorAda.has(nomor)) { galat.push(`Sheet Minggu baris ${n}: Pertemuan ke ${nomor} dobel.`); return }
    if (efektif) nomorAda.add(nomor)
    const tpk = v(8)
    if (tpk) {
      const hilang = tpk.split(',').map((x) => x.trim()).filter((x) => x && !kodeAda.has(x))
      if (hilang.length) { galat.push(`Sheet Minggu baris ${n}: Kode TP ${hilang.join(', ')} tidak ada di sheet TP.`); return }
    }
    minggu.push({
      semester: angka(v(1)), nomor, tanggal_mulai: tanggal(row.getCell(3).value), tanggal_selesai: tanggal(row.getCell(4).value),
      elemen_kode: v(5) || null, materi_pokok: mp || null, jp: angka(v(7)), tp_kode: tpk ? tpk.split(',').map((x) => x.trim()).filter(Boolean).join(', ') : null,
      keterangan: ket || (efektif ? null : mp || null), efektif,
    })
  })
  if (tp.length === 0 && galat.length === 0) galat.push('Sheet TP kosong.')
  if (minggu.length === 0 && galat.length === 0) galat.push('Sheet Minggu kosong.')
  let profil: Profil | null = null
  const pf = wb.getWorksheet('Profil')
  if (pf) {
    profil = {}
    pf.eachRow((row, n) => {
      if (n === 1) return
      const k = sel(row.getCell(1).value); const v = sel(row.getCell(2).value)
      if (k && v && /^[a-z0-9_]+$/i.test(k)) profil![k] = v
    })
  }
  return { tp, minggu, profil, galat }
}
