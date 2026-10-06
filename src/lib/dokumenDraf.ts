// Draf SK: isi bawaan, susunan blok dokumen, dan keluaran Word (.docx) serta HTML (pratinjau dan cetak).
// Satu susunan blok dipakai untuk ketiganya agar tampilannya selalu sama.
import { strToU8, zipSync } from 'fflate'

export type JenisDraf = 'sk_wali_kelas' | 'sk_pembagian_tugas'
export const NAMA_JENIS: Record<JenisDraf, string> = { sk_wali_kelas: 'SK Penetapan Wali Kelas', sk_pembagian_tugas: 'SK Pembagian Tugas Guru' }

export type LampiranWali = { tipe: 'wali_kelas'; baris: { kelas: string; wali: string; nip: string | null }[] }
export type LampiranTugas = {
  tipe: 'pembagian_tugas'; total_jam: number
  guru: { nama: string; nip: string | null; jjm: number; baris: { mapel: string; tingkat: string; kelas: string; jm: number }[] }[]
}
export type Diktum = { k: string; t: string }
export type IsiDraf = {
  kop: string[]; penerbit: string; tentang: string[]
  menimbang: string[]; mengingat: string[]; memperhatikan: string[]
  menetapkan: string; diktum: Diktum[]
  tempat: string; jabatan_ttd: string; nama_ttd: string; nip_ttd: string
  lampiran?: LampiranWali | LampiranTugas
}

const KOP = [
  'PEMERINTAH PROVINSI JAWA BARAT', 'SMK NEGERI 1 GUNUNG SINDUR',
  'Jln. SMPN 3 Gunungsindur, Gunungsindur, Kabupaten Bogor, Jawa Barat 16340',
  'Telepon/Whatsapp. 0821 2111 1252', 'Laman http://smkn1gunungsindur.sch.id, Pos-el info@smkn1gunungsindur.sch.id',
]
const PENERBIT = 'KEPALA SMK NEGERI 1 GUNUNG SINDUR'

/** Isi bawaan mengikuti SK sekolah (SK 390 dan 391 tahun ajaran 2026/2027). Semua dapat disunting. */
export function isiBawaan(jenis: JenisDraf, ta: string, ks: { nama: string; nip: string | null } | null): IsiDraf {
  const taStrip = ta.replace('/', '-')
  const dasar = { kop: KOP, penerbit: PENERBIT, tempat: 'Gunungsindur', jabatan_ttd: 'Kepala Sekolah', nama_ttd: ks?.nama ?? '', nip_ttd: ks?.nip ? `NIP. ${ks.nip}` : '' }
  if (jenis === 'sk_wali_kelas') {
    return {
      ...dasar,
      tentang: ['PENETAPAN WALI KELAS', `TAHUN AJARAN ${ta}`],
      menimbang: [
        'Bahwa SMK Negeri 1 Gunung Sindur sebagai lembaga pendidikan bertanggung jawab menyelenggarakan proses pendidikan yang terstandar sesuai dengan peraturan perundang-undangan yang berlaku;',
        `Berdasarkan pertimbangan sebagaimana tercantum pada huruf a, perlu menetapkan Keputusan Kepala SMK Negeri 1 Gunung Sindur tentang Penetapan Wali Kelas Tahun Ajaran ${ta}.`,
      ],
      mengingat: [
        'Undang-Undang Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional;',
        'Undang-Undang Nomor 14 Tahun 2005 tentang Guru dan Dosen;',
        'Peraturan Pemerintah Nomor 19 Tahun 2017 tentang Perubahan Peraturan Pemerintah Nomor 74 Tahun 2008 tentang Guru;',
        'Peraturan Pemerintah Nomor 4 Tahun 2022 tentang Perubahan Peraturan Pemerintah Nomor 57 Tahun 2021 tentang Standar Nasional Pendidikan;',
        'Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi Nomor 7 Tahun 2022 tentang Standar Isi pada Pendidikan Anak Usia Dini, Jenjang Pendidikan Dasar, dan Jenjang Pendidikan Menengah;',
        'Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi Nomor 16 Tahun 2022 tentang Standar Proses pada Pendidikan Anak Usia Dini, Jenjang Pendidikan Dasar, dan Jenjang Pendidikan Menengah;',
        'Peraturan Daerah Provinsi Jawa Barat Nomor 5 Tahun 2017 tentang Penyelenggaraan Pendidikan.',
      ],
      memperhatikan: [`Program Kerja SMKN 1 Gunung Sindur Tahun Ajaran ${ta}`, 'Rapat Kerja Tim Manajemen SMK Negeri 1 Gunung Sindur'],
      menetapkan: `Surat Keputusan Kepala SMK Negeri 1 Gunung Sindur tentang Penetapan Wali Kelas Tahun Ajaran ${ta}`,
      diktum: [
        { k: 'KESATU', t: `Guru-guru sebagaimana tercantum dalam lampiran ditetapkan sebagai wali kelas pada Tahun Ajaran ${ta};` },
        { k: 'KEDUA', t: 'Melaksanakan tugas dengan penuh rasa tanggung jawab;' },
        { k: 'KETIGA', t: 'Di akhir tahun ajaran atau pada kurun waktu yang ditentukan harus melaporkan kegiatannya secara lisan maupun tertulis kepada Kepala Sekolah;' },
        { k: 'KEEMPAT', t: `Segala biaya akibat dari keputusan ini dibebankan kepada RKAS SMK Negeri 1 Gunung Sindur Tahun Anggaran ${ta};` },
        { k: 'KELIMA', t: 'Keputusan ini mulai berlaku sejak tanggal ditetapkan dan apabila terdapat kekeliruan dalam keputusan ini akan diperbaiki sebagaimana mestinya.' },
      ],
    }
  }
  return {
    ...dasar,
    tentang: ['PEMBAGIAN TUGAS GURU DALAM PEMBELAJARAN', `SEMESTER 1 TAHUN AJARAN ${taStrip}`],
    menimbang: [
      `Dalam rangka menunjang kelancaran kegiatan belajar mengajar di SMK Negeri 1 Gunungsindur, perlu menetapkan pembagian tugas dalam pelaksanaan pembelajaran semester 1 tahun ajaran ${taStrip};`,
      `Berdasarkan pertimbangan sebagaimana tercantum pada huruf a, perlu menetapkan Keputusan Kepala Sekolah SMKN 1 Gunung Sindur tentang Pembagian Tugas Mengajar dalam Pembelajaran Semester 1 Tahun Ajaran ${taStrip}.`,
    ],
    mengingat: [
      'Undang-Undang Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional;',
      'Undang-Undang Nomor 14 Tahun 2005 tentang Guru dan Dosen;',
      'Peraturan Pemerintah Nomor 19 Tahun 2017 tentang Perubahan Peraturan Pemerintah Nomor 74 Tahun 2008 tentang Guru;',
      'Peraturan Pemerintah Nomor 4 Tahun 2022 tentang Perubahan Peraturan Pemerintah Nomor 57 Tahun 2021 tentang Standar Nasional Pendidikan;',
      'Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi Nomor 32 Tahun 2022 tentang Standar Teknis Pelayanan Minimal Pendidikan;',
      'Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi Nomor 7 Tahun 2022 tentang Standar Isi pada Pendidikan Anak Usia Dini, Jenjang Pendidikan Dasar, dan Jenjang Pendidikan Menengah;',
      'Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi Nomor 16 Tahun 2022 tentang Standar Proses pada Pendidikan Anak Usia Dini, Jenjang Pendidikan Dasar, dan Jenjang Pendidikan Menengah;',
      'Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi Nomor 21 Tahun 2022 tentang Standar Penilaian Pendidikan pada Pendidikan Anak Usia Dini, Jenjang Pendidikan Dasar, dan Jenjang Pendidikan Menengah;',
      'Peraturan Menteri Pendidikan Dasar dan Menengah Nomor 10 Tahun 2025 tentang Standar Kompetensi Lulusan pada Pendidikan Anak Usia Dini, Jenjang Pendidikan Dasar, dan Jenjang Pendidikan Menengah;',
      'Peraturan Menteri Pendidikan Dasar dan Menengah Nomor 11 Tahun 2025 tentang Pemenuhan Beban Kerja Guru;',
      'Peraturan Menteri Pendidikan Dasar dan Menengah Nomor 13 Tahun 2025 tentang Standar Kompetensi Lulusan pada Pendidikan Anak Usia Dini, Jenjang Pendidikan Dasar, dan Jenjang Pendidikan Menengah;',
      'Keputusan Menteri Pendidikan Nasional Nomor 125/U/2002 tentang Kalender Pendidikan dan Jumlah Jam Belajar Efektif di Sekolah;',
      'Peraturan Daerah Provinsi Jawa Barat Nomor 5 Tahun 2017 tentang Penyelenggaraan Pendidikan;',
      `Surat Kepala Cabang Dinas Pendidikan Wilayah I Provinsi Jawa Barat tentang Pedoman Penyusunan Kalender Pendidikan Tahun Pelajaran ${taStrip} (isi nomor dan tanggal surat).`,
    ],
    memperhatikan: [`Program Kerja SMK Negeri 1 Gunungsindur Tahun Ajaran ${taStrip}`, `Kalender Pendidikan SMK Negeri 1 Gunungsindur Tahun Ajaran ${taStrip}`, 'Surat Perjanjian Kerja (SPK)', 'Pemenuhan Kebutuhan Guru'],
    menetapkan: `Keputusan Kepala Sekolah SMKN 1 Gunung Sindur tentang Pembagian Tugas Mengajar dalam Pembelajaran Semester 1 Tahun Ajaran ${taStrip}`,
    diktum: [
      { k: 'KESATU', t: 'Pembagian tugas guru dalam pembelajaran sebagaimana terlampir dalam keputusan ini;' },
      { k: 'KEDUA', t: 'Menugaskan kepada masing-masing guru untuk menyusun perencanaan pembelajaran, melaksanakan proses pembelajaran, melakukan evaluasi, refleksi dan tindak lanjut sesuai dengan mata pelajaran yang diampunya;' },
      { k: 'KETIGA', t: `Biaya yang ditimbulkan akibat dikeluarkannya keputusan ini dibebankan pada RKAS Tahun Anggaran ${taStrip};` },
      { k: 'KEEMPAT', t: 'Keputusan ini berlaku sejak ditetapkan. Apabila terdapat kekeliruan dalam keputusan ini akan diperbaiki sebagaimana mestinya.' },
    ],
  }
}

// ---------------------------------------------------------------- blok dokumen
export type Blok =
  | { t: 'p'; teks: string; rata?: 'tengah' | 'kanan' | 'kiri'; tebal?: boolean; ukuran?: number; garis?: boolean; lekuk?: number; jarak?: number }
  | { t: 'daftar'; label: string; items: string[]; nomor: 'abjad' | 'angka' | 'tanpa' }
  | { t: 'tabel'; kepala: string[]; baris: string[][]; lebar: number[]; tebalBaris?: number[] }
  | { t: 'halaman' }

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
export function tanggalIndonesia(iso: string | null | undefined): string {
  if (!iso) return '.....................'
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${BULAN[m - 1]} ${y}`
}
const abjad = (i: number) => String.fromCharCode(97 + i) + '.'

export function susunBlok(draf: { judul: string; nomor_surat: string | null; tanggal_surat: string | null; tahun_ajaran: string }, isi: IsiDraf): Blok[] {
  const b: Blok[] = []
  isi.kop.forEach((k, i) => b.push({ t: 'p', teks: k, rata: 'tengah', tebal: i < 2, ukuran: i === 0 ? 13 : i === 1 ? 14 : 9, garis: i === isi.kop.length - 1, jarak: i === isi.kop.length - 1 ? 8 : 0 }))
  b.push({ t: 'p', teks: 'SURAT KEPUTUSAN', rata: 'tengah', tebal: true, ukuran: 12 })
  b.push({ t: 'p', teks: isi.penerbit, rata: 'tengah', tebal: true })
  b.push({ t: 'p', teks: `Nomor : ${draf.nomor_surat ?? '........................................'}`, rata: 'tengah', jarak: 6 })
  b.push({ t: 'p', teks: 'TENTANG', rata: 'tengah', tebal: true })
  isi.tentang.forEach((t) => b.push({ t: 'p', teks: t, rata: 'tengah', tebal: true }))
  b.push({ t: 'p', teks: `${isi.penerbit} KABUPATEN BOGOR,`, tebal: true, jarak: 6 })
  b.push({ t: 'daftar', label: 'Menimbang', items: isi.menimbang, nomor: 'abjad' })
  b.push({ t: 'daftar', label: 'Mengingat', items: isi.mengingat, nomor: 'angka' })
  b.push({ t: 'daftar', label: 'Memperhatikan', items: isi.memperhatikan, nomor: 'angka' })
  b.push({ t: 'p', teks: 'MEMUTUSKAN', rata: 'tengah', tebal: true, jarak: 6 })
  b.push({ t: 'daftar', label: 'Menetapkan', items: [isi.menetapkan], nomor: 'tanpa' })
  isi.diktum.forEach((d) => b.push({ t: 'daftar', label: d.k, items: [d.t], nomor: 'tanpa' }))
  b.push({ t: 'p', teks: `Ditetapkan di : ${isi.tempat}`, lekuk: 55, jarak: 10 })
  b.push({ t: 'p', teks: `Pada Tanggal : ${tanggalIndonesia(draf.tanggal_surat)}`, lekuk: 55 })
  b.push({ t: 'p', teks: `${isi.jabatan_ttd},`, lekuk: 55 })
  b.push({ t: 'p', teks: '\n\n\n', lekuk: 55 })
  b.push({ t: 'p', teks: isi.nama_ttd, lekuk: 55, tebal: true })
  if (isi.nip_ttd) b.push({ t: 'p', teks: isi.nip_ttd, lekuk: 55 })
  const lam = isi.lampiran
  if (lam) {
    b.push({ t: 'halaman' })
    b.push({ t: 'p', teks: `Lampiran Surat Keputusan ${isi.penerbit.replace('KEPALA ', 'Kepala ').replace('SMK NEGERI', 'SMK Negeri').replace('GUNUNG SINDUR', 'Gunung Sindur')}`, tebal: true })
    b.push({ t: 'p', teks: `Nomor : ${draf.nomor_surat ?? '........................................'}` })
    b.push({ t: 'p', teks: `Tentang : ${isi.tentang.join(' ')}`, jarak: 8 })
    if (lam.tipe === 'wali_kelas') {
      b.push({ t: 'tabel', kepala: ['No', 'Kelas', 'Nama Wali Kelas', 'NIP'], lebar: [8, 17, 45, 30],
        baris: lam.baris.map((r, i) => [String(i + 1), r.kelas, r.wali, r.nip ?? '-']) })
    } else {
      const baris: string[][] = []
      const tebal: number[] = []
      lam.guru.forEach((g, gi) => {
        g.baris.forEach((r, ri) => {
          baris.push([ri === 0 ? String(gi + 1) : '', ri === 0 ? `${g.nama}${g.nip ? `\nNIP. ${g.nip}` : ''}` : '', r.mapel, `${r.tingkat} ${r.kelas}`, String(r.jm), ri === 0 ? String(g.jjm) : ''])
        })
      })
      baris.push(['', 'TOTAL', '', '', String(lam.total_jam), String(lam.total_jam)])
      tebal.push(baris.length - 1)
      b.push({ t: 'tabel', kepala: ['No', 'Nama', 'Mata Pelajaran', 'Kelas', 'JM', 'JJM'], lebar: [6, 28, 30, 22, 7, 7], baris, tebalBaris: tebal })
    }
  }
  return b
}

// ---------------------------------------------------------------- HTML
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const nl = (s: string) => esc(s).replace(/\n/g, '<br>')
const nomorDaftar = (n: 'abjad' | 'angka' | 'tanpa', i: number) => (n === 'abjad' ? abjad(i) : n === 'angka' ? `${i + 1}.` : '')

export function blokKeHtml(blok: Blok[]): string {
  return blok.map((x) => {
    if (x.t === 'halaman') return '<div class="ganti-halaman"></div>'
    if (x.t === 'p') {
      const gaya = [`text-align:${x.rata === 'tengah' ? 'center' : x.rata === 'kanan' ? 'right' : 'left'}`, x.tebal ? 'font-weight:700' : '', x.ukuran ? `font-size:${x.ukuran}pt` : '',
        x.lekuk ? `margin-left:${x.lekuk}%` : '', x.jarak ? `margin-bottom:${x.jarak}pt` : '', x.garis ? 'border-bottom:2px solid #000;padding-bottom:4pt' : ''].filter(Boolean).join(';')
      return `<p style="${gaya}">${nl(x.teks)}</p>`
    }
    if (x.t === 'daftar') {
      const baris = x.items.map((it, i) => `<tr><td class="l">${i === 0 ? esc(x.label) : ''}</td><td class="t">${i === 0 ? ':' : ''}</td><td class="n">${nomorDaftar(x.nomor, i)}</td><td>${nl(it)}</td></tr>`).join('')
      return `<table class="daftar">${baris}</table>`
    }
    const lebar = x.lebar.map((w) => `<col style="width:${w}%">`).join('')
    const kepala = `<tr>${x.kepala.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`
    const isi = x.baris.map((r, i) => `<tr${x.tebalBaris?.includes(i) ? ' class="tebal"' : ''}>${r.map((c) => `<td>${nl(c)}</td>`).join('')}</tr>`).join('')
    return `<table class="data"><colgroup>${lebar}</colgroup><thead>${kepala}</thead><tbody>${isi}</tbody></table>`
  }).join('\n')
}

export const GAYA_DOKUMEN = `
.dokumen{font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.35;color:#000}
.dokumen p{margin:0 0 3pt}
.dokumen table.daftar{width:100%;border-collapse:collapse;margin-bottom:3pt}
.dokumen table.daftar td{vertical-align:top;padding:0 2pt}
.dokumen table.daftar td.l{width:21%}.dokumen table.daftar td.t{width:2%}.dokumen table.daftar td.n{width:4%}
.dokumen table.data{width:100%;border-collapse:collapse;font-size:10pt}
.dokumen table.data th,.dokumen table.data td{border:1px solid #000;padding:2pt 4pt;vertical-align:top}
.dokumen table.data th{background:#e8e8e8}
.dokumen table.data tr.tebal td{font-weight:700}
.dokumen .ganti-halaman{page-break-after:always;height:0}
`

export function dokumenHtml(blok: Blok[]): string {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Draf SK</title><style>@page{size:A4;margin:20mm 18mm}body{margin:0}${GAYA_DOKUMEN}</style></head><body><div class="dokumen">${blokKeHtml(blok)}</div></body></html>`
}

/** Cetak atau simpan sebagai PDF lewat dialog cetak peramban. */
export function cetakDokumen(blok: Blok[]) {
  const f = document.createElement('iframe')
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(f)
  const d = f.contentDocument
  if (!d || !f.contentWindow) { f.remove(); return }
  d.open(); d.write(dokumenHtml(blok)); d.close()
  const w = f.contentWindow
  setTimeout(() => { w.focus(); w.print(); setTimeout(() => f.remove(), 2000) }, 250)
}

// ---------------------------------------------------------------- Word (.docx)
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const exml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const LEBAR_HALAMAN = 9638 // A4 dikurangi margin 2 cm, dalam twip

function run(teks: string, o: { tebal?: boolean; ukuran?: number }): string {
  const sz = Math.round((o.ukuran ?? 11) * 2)
  const rpr = `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${o.tebal ? '<w:b/>' : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`
  return teks.split('\n').map((baris, i) => `<w:r>${rpr}${i > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${exml(baris)}</w:t></w:r>`).join('')
}
function para(teks: string, o: { rata?: string; tebal?: boolean; ukuran?: number; garis?: boolean; lekuk?: number; jarak?: number } = {}): string {
  const jc = o.rata === 'tengah' ? 'center' : o.rata === 'kanan' ? 'right' : 'left'
  const ind = o.lekuk ? `<w:ind w:left="${Math.round((LEBAR_HALAMAN * o.lekuk) / 100)}"/>` : ''
  const bdr = o.garis ? '<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="000000"/></w:pBdr>' : ''
  return `<w:p><w:pPr>${bdr}<w:spacing w:before="0" w:after="${Math.round((o.jarak ?? 3) * 20)}"/>${ind}<w:jc w:val="${jc}"/></w:pPr>${run(teks, o)}</w:p>`
}
function sel(teks: string, lebar: number, o: { tebal?: boolean; ukuran?: number; garis?: boolean; isi?: string } = {}): string {
  const batas = o.garis
    ? '<w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders>'
    : ''
  const warna = o.isi ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.isi}"/>` : ''
  return `<w:tc><w:tcPr><w:tcW w:w="${lebar}" w:type="dxa"/>${batas}${warna}</w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="20"/></w:pPr>${run(teks, o)}</w:p></w:tc>`
}
function tabelXml(kolom: number[], baris: string[]): string {
  const grid = kolom.map((w) => `<w:gridCol w:w="${w}"/>`).join('')
  return `<w:tbl><w:tblPr><w:tblW w:w="${LEBAR_HALAMAN}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${baris.join('')}</w:tbl>`
}

export function blokKeDocx(blok: Blok[]): Uint8Array {
  const isi: string[] = []
  for (const x of blok) {
    if (x.t === 'halaman') { isi.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'); continue }
    if (x.t === 'p') { isi.push(para(x.teks, x)); continue }
    if (x.t === 'daftar') {
      const kolom = [2000, 250, 450, LEBAR_HALAMAN - 2700]
      const baris = x.items.map((it, i) => `<w:tr>${sel(i === 0 ? x.label : '', kolom[0])}${sel(i === 0 ? ':' : '', kolom[1])}${sel(nomorDaftar(x.nomor, i), kolom[2])}${sel(it, kolom[3])}</w:tr>`)
      isi.push(tabelXml(kolom, baris), para('', { jarak: 2 }))
      continue
    }
    const kolom = x.lebar.map((p) => Math.round((LEBAR_HALAMAN * p) / 100))
    const kepala = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${x.kepala.map((h, i) => sel(h, kolom[i], { tebal: true, ukuran: 10, garis: true, isi: 'E8E8E8' })).join('')}</w:tr>`
    const baris = x.baris.map((r, ri) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c, i) => sel(c, kolom[i], { ukuran: 10, garis: true, tebal: x.tebalBaris?.includes(ri) })).join('')}</w:tr>`)
    isi.push(tabelXml(kolom, [kepala, ...baris]))
  }
  const dokumen = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${isi.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`
  const tipe = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  return zipSync({ '[Content_Types].xml': strToU8(tipe), '_rels/.rels': strToU8(rels), 'word/document.xml': strToU8(dokumen) })
}

export function unduhDocx(blok: Blok[], namaBerkas: string) {
  const bin = blokKeDocx(blok)
  const buf = new ArrayBuffer(bin.byteLength)
  new Uint8Array(buf).set(bin)
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))
  const a = document.createElement('a')
  a.href = url; a.download = `${namaBerkas.replace(/[^\w\-]+/g, '-').slice(0, 80)}.docx`; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
