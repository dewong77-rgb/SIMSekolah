// Template Excel soal latihan: unduh, isi, unggah. Nilai otomatis lewat kunci pilihan ganda dan isian singkat,
// esai dinilai guru dengan rubrik. exceljs dimuat hanya saat dipakai.

export type SoalImpor = {
  tipe: 'pilgan' | 'isian' | 'esai'; pertanyaan: string; opsi: string[] | null; kunci: number | null
  kunci_isian: string[] | null; rubrik: { kriteria: string; skor_maks: number }[] | null; bobot: number; pembahasan: string | null
}

const KOLOM = ['No', 'Jenis', 'Pertanyaan', 'Pilihan A', 'Pilihan B', 'Pilihan C', 'Pilihan D', 'Pilihan E', 'Kunci', 'Bobot', 'Pembahasan']

function sel(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'object') {
    const o = v as { text?: string; richText?: { text: string }[]; result?: unknown }
    if (o.richText) return o.richText.map((x) => x.text).join('').trim()
    if (o.text != null) return String(o.text).trim()
    if (o.result != null) return String(o.result).trim()
  }
  return String(v).trim()
}

export async function unduhTemplateSoal(): Promise<void> {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  const ws = wb.addWorksheet('Soal')
  ws.addRow(KOLOM)
  ws.addRow([1, 'pilgan', 'Perangkat yang berfungsi sebagai otak komputer adalah...', 'Monitor', 'CPU', 'Keyboard', 'Printer', '', 'B', 1, 'CPU memproses semua instruksi.'])
  ws.addRow([2, 'isian', 'Singkatan dari CPU adalah...', '', '', '', '', '', 'Central Processing Unit; central processing unit', 1, ''])
  ws.addRow([3, 'esai', 'Jelaskan perbedaan RAM dan penyimpanan.', '', '', '', '', '', 'Ketepatan konsep:4; Kejelasan bahasa:2', 2, ''])
  const lebar = [6, 10, 55, 22, 22, 22, 22, 22, 36, 8, 40]
  lebar.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A4A4A' } }
    c.alignment = { vertical: 'middle', wrapText: true }
  })
  ws.eachRow((r, n) => r.eachCell({ includeEmpty: true }, (c) => {
    c.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } }
    if (n > 1) c.alignment = { vertical: 'top', wrapText: true }
  }))
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  const pt = wb.addWorksheet('Petunjuk')
  const baris = [
    ['Cara mengisi'],
    ['1. Isi sheet Soal, satu soal per baris. Hapus tiga baris contoh sebelum mengunggah.'],
    ['2. Jenis: pilgan (pilihan ganda), isian (isian singkat), atau esai.'],
    ['3. Pilihan ganda: isi Pilihan A sampai E (minimal dua), Kunci berupa satu huruf, misalnya B.'],
    ['4. Isian singkat: Kunci berisi jawaban yang diterima, pisahkan dengan titik koma. Huruf besar kecil tidak dibedakan.'],
    ['5. Esai: Kunci berisi rubrik dengan format kriteria:skor maksimum, pisahkan dengan titik koma. Kosong berarti satu kriteria, skor 4.'],
    ['6. Bobot: angka 1 sampai 100, kosong dianggap 1. Pembahasan boleh dikosongkan.'],
    ['7. Soal pilihan ganda dan isian dinilai otomatis. Esai dinilai guru dengan rubrik.'],
    ['8. Soal yang sudah dikerjakan siswa tidak bisa ditambah lagi, jadi unggah sebelum latihan dibuka.'],
  ]
  baris.forEach((b) => pt.addRow(b))
  pt.getColumn(1).width = 110
  pt.getRow(1).font = { bold: true }
  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url; a.download = 'template-soal-latihan.xlsx'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export async function bacaSoalXlsx(file: File): Promise<{ soal: SoalImpor[]; galat: string[] }> {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.getWorksheet('Soal') ?? wb.worksheets[0]
  const soal: SoalImpor[] = []
  const galat: string[] = []
  if (!ws) return { soal, galat: ['Sheet Soal tidak ditemukan.'] }
  ws.eachRow((row, n) => {
    if (n === 1) return
    const v = (i: number) => sel(row.getCell(i).value)
    const tanya = v(3)
    const jenis = v(2).toLowerCase()
    if (!tanya && !jenis && !v(9)) return
    const lokasi = `Baris ${n}`
    if (!tanya) { galat.push(`${lokasi}: pertanyaan kosong.`); return }
    const j = jenis === 'pilihan ganda' || jenis === 'pg' ? 'pilgan' : jenis === 'isian singkat' ? 'isian' : jenis
    if (j !== 'pilgan' && j !== 'isian' && j !== 'esai') { galat.push(`${lokasi}: jenis harus pilgan, isian, atau esai.`); return }
    const bobotMentah = v(10)
    const bobot = bobotMentah === '' ? 1 : Number(bobotMentah)
    if (!Number.isInteger(bobot) || bobot < 1 || bobot > 100) { galat.push(`${lokasi}: bobot harus angka bulat 1 sampai 100.`); return }
    const bahas = v(11) || null
    const kunci = v(9)
    if (j === 'pilgan') {
      const opsiPenuh = [4, 5, 6, 7, 8].map((i) => v(i))
      const opsi: string[] = []
      let indeksKunci = -1
      const huruf = kunci.toUpperCase()
      opsiPenuh.forEach((o, i) => { if (o) { if (String.fromCharCode(65 + i) === huruf) indeksKunci = opsi.length; opsi.push(o) } })
      if (opsi.length < 2) { galat.push(`${lokasi}: pilihan ganda butuh minimal dua pilihan.`); return }
      if (!/^[A-E]$/.test(huruf)) { galat.push(`${lokasi}: kunci harus satu huruf A sampai E.`); return }
      if (indeksKunci < 0) { galat.push(`${lokasi}: kunci ${huruf} menunjuk pilihan yang kosong.`); return }
      soal.push({ tipe: 'pilgan', pertanyaan: tanya, opsi, kunci: indeksKunci, kunci_isian: null, rubrik: null, bobot, pembahasan: bahas })
    } else if (j === 'isian') {
      const ka = kunci.split(';').map((x) => x.trim()).filter(Boolean)
      if (ka.length < 1 || ka.length > 10) { galat.push(`${lokasi}: isi 1 sampai 10 jawaban yang diterima pada kolom Kunci.`); return }
      soal.push({ tipe: 'isian', pertanyaan: tanya, opsi: null, kunci: null, kunci_isian: ka, rubrik: null, bobot, pembahasan: bahas })
    } else {
      let rub: { kriteria: string; skor_maks: number }[] = []
      if (!kunci) rub = [{ kriteria: 'Kualitas jawaban', skor_maks: 4 }]
      else {
        for (const bagian of kunci.split(';').map((x) => x.trim()).filter(Boolean)) {
          const i = bagian.lastIndexOf(':')
          const nama = i > 0 ? bagian.slice(0, i).trim() : ''
          const skor = i > 0 ? Number(bagian.slice(i + 1).trim()) : NaN
          if (!nama || !Number.isInteger(skor) || skor < 1 || skor > 100) { galat.push(`${lokasi}: rubrik "${bagian}" harus berformat kriteria:skor.`); return }
          rub.push({ kriteria: nama, skor_maks: skor })
        }
      }
      soal.push({ tipe: 'esai', pertanyaan: tanya, opsi: null, kunci: null, kunci_isian: null, rubrik: rub, bobot, pembahasan: bahas })
    }
  })
  if (soal.length === 0 && galat.length === 0) galat.push('Tidak ada soal yang terbaca. Pastikan data ada di sheet Soal mulai baris 2.')
  return { soal, galat }
}
