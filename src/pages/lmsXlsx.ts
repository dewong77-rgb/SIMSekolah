import { panggil } from '../lib/rpc'

// Unduh rekap satu kelas sebagai satu berkas Excel dengan sheet terpisah.
// exceljs dimuat hanya saat tombol ditekan supaya halaman lain tidak ikut berat.

type Sel = string | number | null | undefined
type Info = { id: string; mapel: string; rombel: string; guru: string; semester: string }

type Pertemuan = { id: string; nomor: number; judul: string; tanggal: string; status: string }
type RekapKelas = { total_sesi: number; siswa: { peserta_didik_id: string; nama: string; nisn: string | null; hadir: number; izin: number; sakit: number; alpa: number }[] }
type AbsenPertemuan = { siswa: { peserta_didik_id: string; status: string }[] }
type Nilai = {
  komponen: { id: string; grup: string; judul: string }[]
  siswa: { peserta_didik_id: string; nama: string; nisn: string | null; no_urut: number | null; nilai: Record<string, number>; rata: Record<string, number>; akhir: number | null }[]
}
/** Nilai Asesmen digital (CBT) siswa kelas ini, dari lms_nilai_cbt. */
export type NilaiCbt = {
  kolom: { id: string; ujian: string; jenis: string; paket: string; cocok: boolean }[]
  nilai: { peserta_didik_id: string; kolom: string; nilai: number }[]
}
const jenisCbt: Record<string, string> = { uts: 'UTS', uas: 'UAS', lainnya: 'Ujian' }
type Asesmen = { id: string; judul: string; jenis: string; status: string; kkm: number | null; komposisi: { esai: number; isian: number }; terkunci: boolean }
type RekapAsesmen = { siswa: { peserta_didik_id: string; nama: string; nisn: string | null; no_urut: number | null; percobaan: number; status: string; nilai_terbaik: number | null }[] }
type Tugas = { id: string; judul: string; status: string; nilai_maks: number; tenggat: string | null }
type RekapTugas = { siswa: { peserta_didik_id: string; status: string; nilai: number | null; dikumpul_pada: string | null }[] }
type Rubrik = { kriteria: string; skor_maks: number }
type Koreksi = {
  soal_id: string; tipe: string; pertanyaan: string; bobot: number; rubrik: Rubrik[] | null
  jawaban: { nama: string; ke: number; teks: string; skor: number | null; skor_rubrik: number[] | null; catatan_guru: string | null; dikoreksi: boolean; skor_efektif: number }[]
}
type Jurnal = { tanggal: string; pertemuan_nomor: number | null; materi: string; kegiatan: string | null; kendala: string | null; tindak_lanjut: string | null; hadir: number; izin: number; sakit: number; alpa: number }

const kodeAbsen: Record<string, string> = { hadir: 'Sudah' }
const labelTugas: Record<string, string> = { belum: 'Belum', terkumpul: 'Terkumpul', terlambat: 'Terlambat', dinilai: 'Dinilai' }
const labelKuis: Record<string, string> = { belum: 'Belum', berjalan: 'Mengerjakan', perlu_koreksi: 'Menunggu koreksi', selesai: 'Selesai' }
const grupNama: Record<string, string> = { kuis: 'Kuis', tugas: 'Tugas', uh: 'Ulangan harian', uts: 'UTS', uas: 'UAS' }
const grupUrut = ['kuis', 'tugas', 'uh', 'uts', 'uas']

const bersih = (s: string) => s.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Sheet'

export async function unduhRekapKelas(kelas: Info, bobot: Record<string, number> = { kuis: 20, tugas: 20, uh: 20, uts: 20, uas: 20 }) {
  const id = kelas.id
  const [pertemuan, rekap, nilai, asesmen, tugas, jurnal, cbt] = await Promise.all([
    panggil<Pertemuan[]>('lms_pertemuan_daftar', { p_kelas: id }),
    panggil<RekapKelas>('lms_rekap_kelas', { p_kelas: id }),
    panggil<Nilai>('lms_nilai_kelas', { p_kelas: id, p_bobot: bobot }),
    panggil<Asesmen[]>('lms_asesmen_daftar', { p_kelas: id }),
    panggil<Tugas[]>('lms_tugas_daftar', { p_kelas: id }),
    panggil<Jurnal[]>('lms_jurnal_daftar', { p_kelas: id }),
    panggil<NilaiCbt>('lms_nilai_cbt', { p_kelas: id }).catch(() => null),
  ])
  const sesi = pertemuan.filter((p) => p.status === 'terbit')
  const [absen, rekapAsesmen, rekapTugas, koreksi] = await Promise.all([
    Promise.all(sesi.map((p) => panggil<AbsenPertemuan>('lms_rekap_pertemuan', { p_pertemuan: p.id }))),
    Promise.all(asesmen.map((a) => panggil<RekapAsesmen>('lms_asesmen_rekap', { p_asesmen: a.id }))),
    Promise.all(tugas.map((t) => panggil<RekapTugas>('lms_tugas_rekap', { p_tugas: t.id }))),
    Promise.all(asesmen.map((a) => (a.terkunci && a.komposisi.esai > 0
      ? panggil<Koreksi[]>('lms_koreksi_daftar', { p_asesmen: a.id }) : Promise.resolve([] as Koreksi[])))),
  ])

  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  wb.creator = 'SIMS SMKN 1 Gunung Sindur'
  const garis = { style: 'thin' as const, color: { argb: 'FFCCCCCC' } }

  function sheet(nama: string, kepala: string[], baris: Sel[][], lebarMin = 10) {
    const ws = wb.addWorksheet(bersih(nama), { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.addRow(kepala)
    baris.forEach((b) => ws.addRow(b.map((x) => (x === undefined ? null : x))))
    ws.eachRow((row, n) => {
      row.eachCell({ includeEmpty: true }, (c) => {
        c.font = n === 1 ? { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } } : { name: 'Calibri', size: 11 }
        if (n === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A4A4A' } }
        c.border = { bottom: garis }
        c.alignment = { vertical: 'top', wrapText: n === 1 }
      })
    })
    kepala.forEach((h, i) => {
      const panjang = Math.max(h.length, ...baris.map((b) => String(b[i] ?? '').split('\n')[0].length))
      ws.getColumn(i + 1).width = Math.min(60, Math.max(lebarMin, panjang + 2))
    })
    return ws
  }

  const urut = nilai.siswa.map((s, i) => ({ ...s, no: s.no_urut ?? i + 1 }))
  const identitas = (s: { no: number; nama: string; nisn: string | null }): Sel[] => [s.no, s.nama, s.nisn]
  const pangkal = ['No', 'Nama', 'NISN']

  // 1. Ringkasan
  sheet('Ringkasan', ['Keterangan', 'Isi'], [
    ['Mata pelajaran', kelas.mapel], ['Rombel', kelas.rombel], ['Guru', kelas.guru], ['Semester', kelas.semester],
    ['Jumlah siswa', urut.length], ['Pertemuan terbit', sesi.length], ['Pertemuan terbit (penyebut rekap pengerjaan)', rekap.total_sesi],
    ['Kuis dan ulangan', asesmen.length], ['Tugas', tugas.length],
    ['Bobot nilai akhir', grupUrut.map((g) => `${grupNama[g]} ${bobot[g] ?? 0}%`).join(', ')],
    ['Diunduh', new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB'],
  ], 30)

  // 2. Kehadiran
  const rk = new Map(rekap.siswa.map((s) => [s.peserta_didik_id, s]))
  sheet('Pengerjaan LMS', [...pangkal, 'Dikerjakan', 'Belum dikerjakan', 'Total pertemuan', 'Persen dikerjakan'],
    urut.map((s) => {
      const r = rk.get(s.peserta_didik_id)
      return [...identitas(s), r?.hadir ?? 0, Math.max(rekap.total_sesi - (r?.hadir ?? 0), 0), rekap.total_sesi,
        rekap.total_sesi > 0 && r ? Math.round((r.hadir / rekap.total_sesi) * 100) : null]
    }))

  // 3. Pengerjaan per pertemuan (Sudah = dikerjakan di LMS, kosong = belum)
  sheet('Pengerjaan per pertemuan', [...pangkal, ...sesi.map((p) => `P${p.nomor}`)],
    urut.map((s) => [...identitas(s), ...absen.map((a) => kodeAbsen[a.siswa.find((x) => x.peserta_didik_id === s.peserta_didik_id)?.status ?? ''] ?? '')]), 6)

  // 4. Nilai akhir
  sheet('Buku nilai', [...pangkal, ...nilai.komponen.map((k) => `${grupNama[k.grup]}: ${k.judul}`), ...grupUrut.map((g) => `Rata ${grupNama[g]}`), 'Nilai akhir'],
    urut.map((s) => [...identitas(s), ...nilai.komponen.map((k) => s.nilai[k.id] ?? null), ...grupUrut.map((g) => s.rata[g] ?? null), s.akhir]))

  // 4b. Nilai CBT (UTS, UAS). Semua paket yang diikuti siswa kelas ini; kolom 'Sesuai mapel' menandai paket bernama mapel kelas.
  if (cbt && cbt.kolom.length) {
    const cb = new Map(cbt.nilai.map((n) => [`${n.peserta_didik_id}|${n.kolom}`, n.nilai]))
    sheet('Nilai CBT', [...pangkal, ...cbt.kolom.map((k) => `${jenisCbt[k.jenis] ?? k.jenis}: ${k.ujian} / ${k.paket}${k.cocok ? '' : ' (bukan mapel ini?)'}`)],
      urut.map((s) => [...identitas(s), ...cbt.kolom.map((k) => cb.get(`${s.peserta_didik_id}|${k.id}`) ?? null)]), 16)
  }

  // 5. Kuis dan ulangan
  if (asesmen.length) {
    sheet('Kuis dan ulangan', [...pangkal, ...asesmen.map((a) => `${a.judul}${a.kkm !== null ? ` (KKM ${a.kkm})` : ''}`)],
      urut.map((s) => [...identitas(s), ...rekapAsesmen.map((r) => {
        const b = r.siswa.find((x) => x.peserta_didik_id === s.peserta_didik_id)
        if (!b) return ''
        if (b.nilai_terbaik !== null) return b.nilai_terbaik
        return labelKuis[b.status] ?? b.status
      })]), 14)
  }

  // 6. Tugas
  if (tugas.length) {
    sheet('Tugas', [...pangkal, ...tugas.map((t) => `${t.judul} (maks ${t.nilai_maks})`)],
      urut.map((s) => [...identitas(s), ...rekapTugas.map((r) => {
        const b = r.siswa.find((x) => x.peserta_didik_id === s.peserta_didik_id)
        if (!b) return ''
        return b.nilai !== null ? b.nilai : (labelTugas[b.status] ?? b.status)
      })]), 14)
  }

  // 7. Koreksi esai per kriteria
  const baris: Sel[][] = []
  let maksKriteria = 0
  asesmen.forEach((a, i) => koreksi[i].filter((s) => s.tipe === 'esai').forEach((s) => {
    maksKriteria = Math.max(maksKriteria, s.rubrik?.length ?? 0)
    s.jawaban.forEach((j) => baris.push([
      a.judul, s.pertanyaan.slice(0, 120), j.nama, j.ke, j.dikoreksi ? 'Sudah' : 'Belum', j.skor,
      s.bobot, j.catatan_guru, ...(s.rubrik ?? []).map((_, n) => j.skor_rubrik?.[n] ?? null),
    ]))
  }))
  if (baris.length) {
    sheet('Koreksi esai', ['Asesmen', 'Soal', 'Siswa', 'Percobaan', 'Dikoreksi', 'Skor soal', 'Bobot soal', 'Catatan guru',
      ...Array.from({ length: maksKriteria }, (_, n) => `Kriteria ${n + 1}`)],
      baris, 12)
  }

  // 8. Jurnal
  if (jurnal.length) {
    sheet('Jurnal mengajar', ['Tanggal', 'Pertemuan', 'Materi', 'Kegiatan', 'Kendala', 'Tindak lanjut', 'Hadir', 'Izin', 'Sakit', 'Alpa'],
      jurnal.map((j) => [j.tanggal, j.pertemuan_nomor, j.materi, j.kegiatan, j.kendala, j.tindak_lanjut, j.hadir, j.izin, j.sakit, j.alpa]), 14)
  }

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  const nama = `rekap-${kelas.mapel}-${kelas.rombel}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  a.href = url; a.download = `${nama}.xlsx`; a.click()
  URL.revokeObjectURL(url)
}

type RekapPengerjaan = {
  total_sesi: number
  pertemuan: { id: string; nomor: number; judul: string }[]
  siswa: { peserta_didik_id: string; nama: string; nisn: string | null; hadir: number; per_pertemuan: Record<string, string> }[]
}

/** Rekap pengerjaan satu kelas sebagai Excel yang rapi dan siap dibagikan: matriks siswa x pertemuan, plus daftar judul pertemuan. */
export async function unduhRekapPengerjaan(kelas: { mapel: string; rombel: string }, rekap: RekapPengerjaan) {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  wb.creator = 'SIMS SMKN 1 Gunung Sindur'
  const total = rekap.total_sesi
  const judul = `Rekap pengerjaan LMS ${kelas.mapel} ${kelas.rombel}`
  const garis = { style: 'thin' as const, color: { argb: 'FFCCCCCC' } }
  const tengah = { horizontal: 'center' as const, vertical: 'middle' as const }

  const ws = wb.addWorksheet('Pengerjaan', { views: [{ state: 'frozen', xSplit: 3, ySplit: 4 }] })
  const kolom = 3 + rekap.pertemuan.length + 3
  ws.mergeCells(1, 1, 1, kolom)
  ws.getCell(1, 1).value = judul
  ws.getCell(1, 1).font = { name: 'Calibri', size: 14, bold: true }
  ws.mergeCells(2, 1, 2, kolom)
  ws.getCell(2, 1).value = `${total} pertemuan terbit. Diunduh ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB. ✓ = sudah dikerjakan, kosong = belum.`
  ws.getCell(2, 1).font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF666666' } }

  const kepala = ['No', 'Nama', 'NISN', ...rekap.pertemuan.map((p) => `P${p.nomor}`), 'Dikerjakan', 'Belum', 'Persen']
  const hr = ws.getRow(4)
  kepala.forEach((h, i) => {
    const c = hr.getCell(i + 1)
    c.value = h
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A4A4A' } }
    c.alignment = i >= 3 ? tengah : { vertical: 'middle' }
    c.border = { bottom: garis }
  })

  rekap.siswa.forEach((s, i) => {
    const belum = Math.max(total - s.hadir, 0)
    const baris = ws.getRow(5 + i)
    const isi: (string | number | null)[] = [
      i + 1, s.nama, s.nisn,
      ...rekap.pertemuan.map((p) => (s.per_pertemuan[p.id] === 'hadir' ? '✓' : '')),
      s.hadir, belum, total > 0 ? s.hadir / total : null,
    ]
    isi.forEach((v, j) => {
      const c = baris.getCell(j + 1)
      c.value = v
      c.font = { name: 'Calibri', size: 11 }
      c.border = { bottom: garis }
      if (j >= 3) c.alignment = tengah
      const p = j - 3
      if (p >= 0 && p < rekap.pertemuan.length) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: v === '✓' ? 'FFD9EAD3' : 'FFF4CCCC' } }
      }
      if (j === isi.length - 1) c.numFmt = '0%'
    })
  })

  ws.getColumn(1).width = 5
  ws.getColumn(2).width = Math.min(40, Math.max(12, ...rekap.siswa.map((s) => s.nama.length + 2)))
  ws.getColumn(3).width = 13
  rekap.pertemuan.forEach((_, i) => { ws.getColumn(4 + i).width = 5 })
  ws.getColumn(4 + rekap.pertemuan.length).width = 12
  ws.getColumn(5 + rekap.pertemuan.length).width = 8
  ws.getColumn(6 + rekap.pertemuan.length).width = 9

  const wp = wb.addWorksheet('Daftar pertemuan')
  wp.addRow(['Kode', 'Judul pertemuan'])
  rekap.pertemuan.forEach((p) => wp.addRow([`P${p.nomor}`, p.judul]))
  wp.getRow(1).font = { name: 'Calibri', size: 11, bold: true }
  wp.getColumn(1).width = 8
  wp.getColumn(2).width = 80

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  const nama = judul.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  a.href = url; a.download = `${nama}.xlsx`; a.click()
  URL.revokeObjectURL(url)
}
