// Pengurai berkas Dapodik. Port dari dapodik_import.py (bagian 4 sampai 8), tanpa akses basis data.
// Keluaran: tabel siap unggah + ringkasan + daftar isu. Perilaku dijaga identik dengan acuan Python.

import {
  Ctx, bacaMeta, clean, nkey, norm, pyRepr, semesterDariTanggal, sha, tingkatDariNama,
  toDate, toInt, toNum,
  type Book, type Cell, type Isu, type Rec, type Row,
} from './util'
import {
  PD_EXTRA, PD_MAIN, PD_ORTU, PD_SENS, PROFIL_ROMBEL, PTK_MAIN, PTK_PROFIL, PTK_SENS, SEKOLAH_KV,
  SMK_DUDI, SMK_KOMPETENSI, SMK_MOU, SMK_PRAKTIK, SMK_UNIT_PRODUKSI, SNAPSHOT_PROFIL,
  type Peta, type Tipe,
} from './peta'

export type Jenis = 'profil' | 'sekolah_smk' | 'absensi' | 'pd_keluar' | 'pd_aktif' | 'guru' | 'tendik'

export type Hasil = {
  jenis: Jenis
  diunduh: string | null
  pengunduh: string | null
  /** Semester yang dipasang (null untuk berkas yang tidak bergantung semester). */
  semester: string | null
  semesterAbsensi: string[]
  ringkasan: Record<string, unknown>
  tabel: Record<string, Rec[]>
  isu: Isu[]
}

const NISN_RE = /^\d{10}$/
const NIK_RE = /^\d{16}$/

// ---------------------------------------------------------------- deteksi

export function detect(book: Book): Jenis | null {
  const names = [...book.keys()]
  if (names.some((n) => n.startsWith('Profil ')) && book.has('Rombongan Belajar')) return 'profil'
  if (book.has('Kompetensi Keahlian') && book.has('Relasi DUDI')) return 'sekolah_smk'
  const first = names.length ? book.get(names[0])! : []
  const a1 = first.length && first[0].length ? norm(first[0][0]) : ''
  if (a1 === 'daftar hadir siswa') return 'absensi'
  if (a1.startsWith('daftar peserta didik keluar')) return 'pd_keluar'
  if (a1.startsWith('daftar peserta didik')) return 'pd_aktif'
  if (a1 === 'daftar guru') return 'guru'
  if (a1.startsWith('daftar tenaga kependidikan')) return 'tendik'
  return null
}

// ---------------------------------------------------------------- header dan pemetaan

function subset(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (!b.has(x)) return false
  return true
}

export function cariHeader(rows: Row[], jangkar: string[]): number | null {
  const j = new Set(jangkar)
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const labels = new Set<string>()
    for (const c of rows[i]) {
      const n = norm(c)
      if (n) labels.add(n)
    }
    if (labels.size >= 2 && subset(j, labels)) return i
  }
  return null
}

export function labelGabungan(rows: Row[], h: number): { labels: string[]; mulai: number } {
  let top: Cell[] = [...rows[h]]
  let nxt: Cell[] = h + 1 < rows.length ? [...rows[h + 1]] : []
  const n = Math.max(top.length, nxt.length)
  while (top.length < n) top.push(null)
  while (nxt.length < n) nxt.push(null)
  const adaSub =
    !clean(nxt[0]) &&
    nxt.slice(1).some((x) => norm(x)) &&
    !nxt.slice(0, 1).some((x) => /^\d+$/.test(String(clean(x) ?? '')))
  const labels: string[] = []
  let grup: string | null = null
  for (let c = 0; c < n; c++) {
    const t = norm(top[c])
    const s = adaSub ? norm(nxt[c]) : ''
    if (t) {
      grup = s ? t : null
      labels.push(s ? `${t}.${s}` : t)
    } else if (s) {
      labels.push(grup ? `${grup}.${s}` : s)
    } else {
      labels.push('')
    }
  }
  return { labels, mulai: adaSub ? h + 2 : h + 1 }
}

function* barisData(rows: Row[], mulai: number, kolomKunci: number): Generator<[number, Row]> {
  for (let i = mulai; i < rows.length; i++) {
    const r = rows[i]
    if (kolomKunci < r.length && clean(r[kolomKunci]) !== null) yield [i + 1, r]
  }
}

function konversi(v: Cell, tipe: Tipe, ctx: Ctx, lembar: string, baris: number, kolom: string): string | number | null {
  let d: string | number | null
  let err: string | null = null
  if (tipe === 'text') return clean(v)
  if (tipe === 'date') [d, err] = toDate(v)
  else if (tipe === 'int') [d, err] = toInt(v)
  else if (tipe === 'num') [d, err] = toNum(v)
  else if (tipe === 'geo') [d, err] = toNum(v, true)
  else {
    // intlead
    const c = clean(v)
    const m = (c ?? '').match(/^\s*(\d+)/)
    if (m) [d, err] = [Number(m[1]), null]
    else [d, err] = [null, c ? 'angka tidak terbaca: ' + pyRepr(v) : null]
  }
  if (err) ctx.isu('peringatan', err, lembar, baris, kolom)
  return d
}

export function petakan(
  rows: Row[], h: number, peta: Peta, ctx: Ctx, lembar: string, wajib: string[] = [],
): [number, Rec][] {
  const { labels, mulai } = labelGabungan(rows, h)
  const idx = new Map<string, number>()
  labels.forEach((lb, i) => { if (lb && !idx.has(lb)) idx.set(lb, i) })
  for (const w of wajib) {
    if (!idx.has(w)) throw new Error(`Kolom wajib "${w}" tidak ada di lembar ${lembar}`)
  }
  const kunci = wajib.length ? idx.get(wajib[0])! : 1
  const hasil: [number, Rec][] = []
  const dipakai = new Set<number>()
  for (const [nomor, r] of barisData(rows, mulai, kunci)) {
    const rec: Rec = {}
    for (const [lb, [medan, tipe]] of peta) {
      const i = idx.get(lb)
      if (i === undefined) continue
      dipakai.add(i)
      const v = i < r.length ? r[i] : null
      rec[medan] = konversi(v, tipe, ctx, lembar, nomor, lb)
    }
    hasil.push([nomor, rec])
  }
  const adaIsi = (i: number) => {
    for (const [, r] of barisData(rows, mulai, kunci)) if (i < r.length && clean(r[i]) !== null) return true
    return false
  }
  for (const [lb, i] of idx) {
    if (lb === 'no' || peta.has(lb) || dipakai.has(i)) continue
    if (adaIsi(i)) ctx.isu('info', 'kolom tidak dikenal diabaikan', lembar, null, lb)
  }
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === '' && adaIsi(i)) {
      ctx.isu('info', `kolom ke-${i + 1} tanpa judul tetapi berisi data, diabaikan`, lembar)
    }
  }
  return hasil
}

// ---------------------------------------------------------------- peserta didik

export type RekamPD = {
  baris: number
  main: Rec
  sens: Rec
  ortu: Record<string, Rec>
  rombel: string | null
  kunci: string
}

async function kunciPd(rec: Rec, nisnGanda: Set<string>): Promise<string> {
  const nisn = rec.nisn as string | null
  if (nisn && NISN_RE.test(nisn) && !nisnGanda.has(nisn)) return sha('nisn', nisn)
  return sha('pd', nkey(rec.nama), (rec.tanggal_lahir as string | null) || '', (rec.nipd as string | null) || '')
}

function hitungNilai<T>(arr: T[]): Map<T, number> {
  const m = new Map<T, number>()
  for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1)
  return m
}

export async function parsePd(book: Book, jenis: 'pd_aktif' | 'pd_keluar', ctx: Ctx) {
  const lembar = [...book.keys()][0]
  const rows = book.get(lembar)!
  bacaMeta(rows, ctx)
  const h = cariHeader(rows, ['nama', 'nisn', 'nipd'])
  if (h === null) throw new Error('Header (Nama, NISN, NIPD) tidak ditemukan')
  const peta: Peta = new Map()
  for (const d of [PD_MAIN, PD_SENS, PD_EXTRA, PD_ORTU]) for (const [k, v] of d) peta.set(k, v)
  const hasil = petakan(rows, h, peta, ctx, lembar, ['nama'])
  const { labels } = labelGabungan(rows, h)
  const ada = new Set(labels)
  const medanAda = (p: Peta, ambil: (f: string) => string = (f) => f) =>
    [...new Set([...p].filter(([lb]) => ada.has(lb)).map(([, [f]]) => ambil(f)))].sort()
  const kolomMain = medanAda(PD_MAIN)
  const kolomSens = medanAda(PD_SENS)
  const kolomOrtu = medanAda(PD_ORTU, (f) => f.split('|')[1])

  const cnt = hitungNilai(hasil.map(([, r]) => r.nisn as string | null).filter((x): x is string => !!x))
  const ganda = new Set([...cnt].filter(([, v]) => v > 1).map(([k]) => k))
  if (ganda.size) {
    ctx.isu('peringatan', `NISN kembar di dalam berkas (${ganda.size} nilai); baris dikenali lewat nama+tgl lahir+NIPD`, lembar, null, 'NISN')
  }

  const recs: RekamPD[] = []
  for (const [nomor, r] of hasil) {
    if (!r.nama) {
      ctx.isu('galat', 'baris tanpa nama dilewati', lembar, nomor, 'Nama')
      continue
    }
    const nisn = r.nisn as string | null
    if (nisn && !NISN_RE.test(nisn)) ctx.isu('peringatan', 'NISN bukan 10 digit', lembar, nomor, 'NISN')
    if (r.nik && !NIK_RE.test(r.nik as string)) ctx.isu('peringatan', 'NIK bukan 16 digit', lembar, nomor, 'NIK')
    if (r.jk && r.jk !== 'L' && r.jk !== 'P') {
      ctx.isu('peringatan', 'JK bukan L/P, dikosongkan', lembar, nomor, 'JK')
      r.jk = null
    }
    const main: Rec = Object.fromEntries(kolomMain.map((f) => [f, r[f] ?? null]))
    const sens: Rec = Object.fromEntries(kolomSens.map((f) => [f, r[f] ?? null]))
    const ortu: Record<string, Rec> = {}
    for (const hub of ['ayah', 'ibu', 'wali']) {
      const o: Rec = Object.fromEntries(kolomOrtu.map((f) => [f, r[`${hub}|${f}`] ?? null]))
      if (o.penghasilan) o.penghasilan = (o.penghasilan as string).replace(/\s*[–—]\s*/g, ' - ')
      if (Object.values(o).some((v) => v !== null)) ortu[hub] = o
    }
    if (jenis === 'pd_keluar') {
      const alasan = r.alasan_keluar as string | null
      const k = nkey(alasan)
      main.status_peserta_didik = k === 'lulus' ? 'lulus' : k === 'mutasi' ? 'mutasi' : 'lainnya'
      main.alasan_keluar = alasan
      main.tanggal_keluar = (r.tanggal_keluar as string | null) ?? null
      if (r.tanggal_keluar === null || r.tanggal_keluar === undefined) {
        ctx.isu('info', 'peserta didik keluar tanpa tanggal keluar', lembar, nomor, 'Tanggal keluar')
      }
    } else {
      main.status_peserta_didik = 'aktif'
      main.alasan_keluar = null
      main.tanggal_keluar = null
    }
    recs.push({ baris: nomor, main, sens, ortu, rombel: (r._rombel as string | null) ?? null, kunci: '' })
  }
  for (const rc of recs) rc.kunci = await kunciPd(rc.main, ganda)

  const grup = new Map<string, RekamPD[]>()
  for (const rc of recs) {
    const g = grup.get(rc.kunci)
    if (g) g.push(rc)
    else grup.set(rc.kunci, [rc])
  }
  const akhir: RekamPD[] = []
  let nDup = 0
  for (const g of grup.values()) {
    if (g.length === 1) {
      akhir.push(g[0])
      continue
    }
    nDup++
    // baris dengan tanggal keluar terbaru dipakai, kolom kosong diisi dari baris lain (sort stabil, menurun)
    g.sort((a, b) => {
      const x = (a.main.tanggal_keluar as string | null) || ''
      const y = (b.main.tanggal_keluar as string | null) || ''
      return x < y ? 1 : x > y ? -1 : 0
    })
    const base = g[0]
    for (const other of g.slice(1)) {
      for (const grp of ['main', 'sens'] as const) {
        for (const [f, v] of Object.entries(other[grp])) {
          if ((base[grp][f] ?? null) === null && v !== null) base[grp][f] = v
        }
      }
      for (const [hub, o] of Object.entries(other.ortu)) if (!(hub in base.ortu)) base.ortu[hub] = o
    }
    akhir.push(base)
  }
  if (nDup) {
    ctx.isu(
      'peringatan',
      `identitas kembar digabung: ${nDup} orang tercatat lebih dari sekali (dipakai baris dengan tanggal keluar terbaru, kolom kosong diisi dari baris lain)`,
      lembar, null, null,
    )
  }
  return { recs: akhir, kolomMain, kolomSens, kolomOrtu, jumlahBaris: recs.length }
}

function tabelPd(recs: RekamPD[], kolomSens: string[], kolomOrtu: string[]) {
  const peserta: Rec[] = recs.map((rc) => ({ kunci_identitas: rc.kunci, ...rc.main }))
  const sens: Rec[] = kolomSens.length ? recs.map((rc) => ({ kunci_identitas: rc.kunci, ...rc.sens })) : []
  const ortu: Rec[] = []
  for (const rc of recs) for (const [hub, o] of Object.entries(rc.ortu)) ortu.push({ kunci_identitas: rc.kunci, hubungan: hub, ...o })
  return { peserta, sens, ortu, kolomOrtu }
}

function hitungStatus(recs: RekamPD[]) {
  const st: Record<string, number> = {}
  for (const rc of recs) {
    const s = rc.main.status_peserta_didik as string
    st[s] = (st[s] ?? 0) + 1
  }
  return st
}

// ---------------------------------------------------------------- PTK

async function kunciPtk(r: Rec, nikGanda: Set<string>): Promise<string> {
  const nik = r.nik as string | null
  if (nik && NIK_RE.test(nik) && !nikGanda.has(nik)) return sha('nik', nik)
  if (r.nuptk) return sha('nuptk', r.nuptk)
  return sha('ptk', nkey(r.nama), (r.tanggal_lahir as string | null) || '')
}

async function bentukPtk(
  ctx: Ctx, lembar: string, hasil: [number, Rec][], mainMap: Peta, sensMap: Peta, defaultJenis: string,
) {
  const unik = (p: Peta) => [...new Set([...p.values()].map(([f]) => f).filter((f) => !f.startsWith('_')))].sort()
  const unikSens = (p: Peta) => [...new Set([...p.values()].map(([f]) => f))].sort()
  const ada = new Set(hasil.length ? Object.keys(hasil[0][1]) : [])
  const mainF = unik(mainMap).filter((f) => ada.has(f))
  const sensF = unikSens(sensMap).filter((f) => ada.has(f))
  const cnt = hitungNilai(hasil.map(([, r]) => r.nik as string | null).filter((x): x is string => !!x))
  const ganda = new Set([...cnt].filter(([, v]) => v > 1).map(([k]) => k))
  const rows: Rec[] = []
  const sens: Rec[] = []
  for (const [nomor, r] of hasil) {
    if (!r.nama) {
      ctx.isu('galat', 'baris tanpa nama dilewati', lembar, nomor, 'Nama')
      continue
    }
    if (r.nik && !NIK_RE.test(r.nik as string)) ctx.isu('peringatan', 'NIK bukan 16 digit', lembar, nomor, 'NIK')
    if (r.nuptk && !NIK_RE.test(r.nuptk as string)) ctx.isu('peringatan', 'NUPTK bukan 16 digit', lembar, nomor, 'NUPTK')
    if (r.jk && r.jk !== 'L' && r.jk !== 'P') r.jk = null
    if (!r.jenis_ptk) r.jenis_ptk = defaultJenis
    const kunci = await kunciPtk(r, ganda)
    const d: Rec = Object.fromEntries(mainF.map((f) => [f, r[f] ?? null]))
    d.kunci_identitas = kunci
    d.jenis_ptk = r.jenis_ptk
    rows.push(d)
    sens.push({ kunci_identitas: kunci, ...Object.fromEntries(sensF.map((f) => [f, r[f] ?? null])) })
  }
  return { rows, sens: sensF.length ? sens : [] }
}

async function parsePtkFile(book: Book, jenis: 'guru' | 'tendik', ctx: Ctx) {
  const lembar = [...book.keys()][0]
  const rows = book.get(lembar)!
  bacaMeta(rows, ctx)
  const h = cariHeader(rows, ['nama', 'nuptk'])
  if (h === null) throw new Error('Header (Nama, NUPTK) tidak ditemukan')
  const peta: Peta = new Map([...PTK_MAIN, ...PTK_SENS])
  const hasil = petakan(rows, h, peta, ctx, lembar, ['nama'])
  return bentukPtk(ctx, lembar, hasil, PTK_MAIN, PTK_SENS, jenis === 'guru' ? 'Guru' : 'Tenaga Kependidikan')
}

// ---------------------------------------------------------------- profil sekolah

export function kvProfil(rows: Row[]) {
  const kv: Record<string, Cell> = {}
  let lintang: Cell = null
  let bujur: Cell = null
  for (const r of rows) {
    const cells: (string | number | boolean | null)[] = r.map((c) => clean(c))
    if (!cells.some((c) => c !== null)) continue
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]
      if (typeof c === 'string' && (norm(c) === 'bujur' || norm(c) === 'lintang')) {
        for (let j = i - 1; j >= 0; j--) {
          if (cells[j] !== null && String(cells[j]).trim() !== ':' && toNum(cells[j])[0] !== null) {
            if (norm(c) === 'bujur') bujur = cells[j]
            else lintang = cells[j]
            break
          }
        }
      }
    }
    if (cells.length > 3 && cells[1] && typeof cells[1] === 'string') {
      const label = norm(cells[1])
      if (label === 'rt / rw') {
        kv.rt = cells[3]
        kv.rw = cells.length > 5 ? cells[5] : null
        continue
      }
      const vals = cells.slice(3).filter((c) => c !== null && ![':', '/'].includes(String(c).trim()))
      if (label === 'posisi geografis') continue
      if (vals.length === 1 || (vals.length === 2 && String(vals[1]) === '✓')) kv[label] = vals[0]
      else if (vals.length === 0 && cells[2] !== null && String(cells[2]).trim() !== ':' && cells.length > 2) kv[label] = cells[2]
    }
  }
  return { kv, lintang, bujur }
}

function parseSekolah(book: Book, ctx: Ctx): { sekolah: Rec; npsn: string } {
  const namaLembar = [...book.keys()].find((n) => n.startsWith('Profil '))!
  const { kv, lintang, bujur } = kvProfil(book.get(namaLembar)!)
  const sk: Rec = {}
  const atribut: Record<string, unknown> = {}
  for (const [label, val] of Object.entries(kv)) {
    if (label in SEKOLAH_KV) sk[SEKOLAH_KV[label]] = val as string | number | null
    else if (label === 'rt' || label === 'rw') sk[label] = val as string | number | null
    else atribut[label] = val
  }
  if (!sk.npsn) throw new Error('NPSN tidak ditemukan di berkas profil')
  for (const f of ['tgl_sk_pendirian', 'tgl_sk_izin_operasional']) {
    if (f in sk) sk[f] = toDate(sk[f])[0]
  }
  if ('daya_listrik_watt' in sk) sk.daya_listrik_watt = toNum(sk.daya_listrik_watt)[0]
  sk.lintang = toNum(lintang)[0]
  sk.bujur = toNum(bujur)[0]
  sk.npsn = String(sk.npsn)
  sk.atribut = JSON.stringify(atribut)
  void ctx
  return { sekolah: sk, npsn: sk.npsn as string }
}

function parseSnapshot(
  rows: Row[], lembar: string, jangkar: string[], peta: Peta, kunci: string, ctx: Ctx,
): Rec[] {
  const h = cariHeader(rows, jangkar)
  if (h === null) {
    ctx.isu('galat', 'header tidak ditemukan', lembar)
    return []
  }
  const hasil = petakan(rows, h, peta, ctx, lembar, [kunci])
  const cols = [...new Set([...peta.values()].map(([f]) => f))]
  return hasil.map(([, r]) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null])))
}

async function parseProfil(book: Book, ctx: Ctx, semester: string) {
  const tabel: Record<string, Rec[]> = {}
  const ring: Record<string, unknown> = {}
  const { sekolah, npsn } = parseSekolah(book, ctx)
  tabel.sekolah = [sekolah]
  ring.npsn = npsn
  if (book.has('Rombongan Belajar')) {
    const rows = book.get('Rombongan Belajar')!
    const h = cariHeader(rows, ['nama rombel'])
    if (h === null) throw new Error('Header rombel tidak ditemukan')
    const out: Rec[] = []
    for (const [, r] of petakan(rows, h, PROFIL_ROMBEL, ctx, 'Rombongan Belajar', ['nama rombel'])) {
      out.push({
        semester_id: semester, jenis_rombel: 'Kelas Utama', nama: r.nama,
        tingkat: (r.tingkat as number | null) || tingkatDariNama(r.nama as string),
        kurikulum: r.kurikulum ?? null, ruangan: r.ruangan ?? null, wali_kelas_nama: r.wali ?? null,
        jumlah_l_profil: r.l ?? null, jumlah_p_profil: r.p ?? null,
      })
    }
    tabel.rombel = out
    ring.rombel = out.length
    ctx.isu('info', `lembar Rombongan Belajar dipasang ke semester ${semester}, jenis Kelas Utama (asumsi)`)
  }
  if (book.has('PTK')) {
    const rows = book.get('PTK')!
    const h = cariHeader(rows, ['nama', 'nuptk'])
    if (h === null) throw new Error('Header PTK tidak ditemukan')
    const hasil = petakan(rows, h, PTK_PROFIL, ctx, 'PTK', ['nama'])
    for (const [, r] of hasil) {
      r.nik = (r._nik as string | null) ?? null
      delete r._nik
    }
    const mainMap: Peta = new Map([...PTK_PROFIL].filter(([, [f]]) => !f.startsWith('_')))
    const nikMap: Peta = new Map<string, [string, Tipe]>([['nik', ['nik', 'text']]])
    const p = await bentukPtk(ctx, 'PTK', hasil, mainMap, nikMap, 'Guru')
    tabel.ptk = p.rows
    tabel.ptk_sensitif = p.sens
    ring.ptk = p.rows.length
  }
  for (const s of SNAPSHOT_PROFIL) {
    if (book.has(s.lembar)) {
      const data = parseSnapshot(book.get(s.lembar)!, s.lembar, s.jangkar, s.peta, s.kunci, ctx)
      tabel[s.tabel] = data
      ring[s.tabel] = data.length
    }
  }
  return { tabel, ring, npsn }
}

// ---------------------------------------------------------------- absensi

type Anggota = { baris: number; urut: number; nama: string | null; jk: string | null; nisn: string | null; nipd: string | null }

async function parseAbsensi(book: Book, ctx: Ctx) {
  const perRombel = new Map<string, { sid: string; jenis: string; nama: string; wali: string | null; anggota: Anggota[] }>()
  const semesters = new Set<string>()
  const gabung = (r: Row | undefined) => (r ? r.filter((c) => c).map((c) => String(c)).join(' ') : '')
  for (const [lembar, rows] of book) {
    if (rows.length < 10) continue
    const judul = rows.length > 2 ? gabung(rows[2]) : ''
    const info = rows.length > 3 ? gabung(rows[3]) : ''
    const mta = judul.match(/TAHUN PELAJARAN\s+(\d{4})\/(\d{4})/i)
    const m = info.match(/Jenis Rombel:\s*(.*?)\s*-\s*Nama Rombel:\s*(.*?)\s*-\s*Semester\s+(\w+)\s*-\s*Wali Kelas:\s*(.*)$/)
    if (!(mta && m)) {
      ctx.isu('peringatan', 'judul lembar tidak sesuai pola daftar hadir, dilewati', lembar)
      continue
    }
    const [jenisR, namaR, semTxt, wali] = [m[1], m[2], m[3], m[4]].map((x) => x.trim())
    const sid = `${mta[1]}${semTxt.toLowerCase() === 'ganjil' ? 1 : 2}`
    semesters.add(sid)
    const rid = JSON.stringify([sid, jenisR, namaR])
    const entri = { sid, jenis: jenisR, nama: namaR, wali: wali || null, anggota: [] as Anggota[] }
    perRombel.set(rid, entri)
    let h: number | null = null
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const r = rows[i]
      if (norm(r.length ? r[0] : '') === 'urut' || r.some((c) => norm(c) === 'nama siswa')) h = i
    }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (r.length > 3 && r[0] && /^\d+$/.test(String(r[0]).trim()) && clean(r[2]) && (h === null || i > h)) {
        const nisnNipd = String(r[1] || '').split('/')
        const jk = clean(r[3])
        const nm = clean(r[2])
        entri.anggota.push({
          baris: i + 1,
          urut: Number(String(r[0]).trim()),
          nama: nm === null ? null : String(nm),
          jk: jk === 'L' || jk === 'P' ? jk : null,
          nisn: clean(nisnNipd[0]) as string | null,
          nipd: nisnNipd.length > 1 ? (clean(nisnNipd[1]) as string | null) : null,
        })
      }
    }
  }
  if (!perRombel.size) throw new Error('Tidak ada lembar daftar hadir yang dapat dibaca')
  const sems = [...semesters].sort()
  const stub = new Map<string, Rec>()
  const keanggotaan: Rec[] = []
  const rombel: Rec[] = []
  let tot = 0
  for (const e of perRombel.values()) {
    rombel.push({
      semester_id: e.sid, jenis_rombel: e.jenis, nama: e.nama, tingkat: tingkatDariNama(e.nama), wali_kelas_nama: e.wali,
    })
    for (const a of e.anggota) {
      if (!a.nisn || !NISN_RE.test(a.nisn)) {
        ctx.isu('peringatan', 'NISN kosong atau tidak 10 digit pada daftar hadir', e.nama, a.baris, 'NISN / NIS')
        continue
      }
      const k = await sha('nisn', a.nisn)
      if (!stub.has(k)) {
        stub.set(k, { kunci_identitas: k, nama: a.nama, jk: a.jk, nisn: a.nisn, nipd: a.nipd, status_peserta_didik: 'aktif' })
      }
      keanggotaan.push({ semester_id: e.sid, jenis_rombel: e.jenis, rombel: e.nama, kunci_identitas: k, no_urut: a.urut })
      tot++
    }
  }
  const jr: Record<string, number> = {}
  for (const e of perRombel.values()) jr[e.jenis] = (jr[e.jenis] ?? 0) + 1
  return {
    tabel: { peserta_didik_stub: [...stub.values()], rombel, keanggotaan_rombel: keanggotaan } as Record<string, Rec[]>,
    ring: { lembar_rombel: perRombel.size, keanggotaan: tot, siswa_unik: stub.size, semester: sems, jenis_rombel: jr },
    sems,
  }
}

// ---------------------------------------------------------------- sekolah_smk

async function parseSekolahSmk(book: Book, ctx: Ctx) {
  const tabel: Record<string, Rec[]> = {}
  const ring: Record<string, unknown> = {}
  const rowsK = book.get('Kompetensi Keahlian')!
  bacaMeta(rowsK, ctx)
  let h = cariHeader(rowsK, ['kompetensi keahlian'])
  if (h === null) throw new Error('Header Kompetensi Keahlian tidak ditemukan')
  const ks: Rec[] = []
  for (const [, r] of petakan(rowsK, h, SMK_KOMPETENSI, ctx, 'Kompetensi Keahlian', ['program keahlian'])) {
    r.kompetensi_keahlian = r.kompetensi_keahlian || ''
    r.sk_izin = r.sk_izin || ''
    ks.push(r)
  }
  tabel.kompetensi_keahlian = ks
  ring.kompetensi_keahlian = ks.length

  const rowsD = book.get('Relasi DUDI')!
  h = cariHeader(rowsD, ['nama', 'bidang usaha'])
  if (h === null) throw new Error('Header Relasi DUDI tidak ditemukan')
  const dd = new Map<string, Rec>()
  const namaDudi = new Set<string>()
  for (const [nomor, r] of petakan(rowsD, h, SMK_DUDI, ctx, 'Relasi DUDI', ['nama'])) {
    const kunci = await sha(nkey(r.nama), nkey(r.alamat as string | null))
    if (dd.has(kunci)) ctx.isu('peringatan', 'DUDI dengan nama+alamat sama muncul lebih dari sekali', 'Relasi DUDI', nomor, 'Nama')
    dd.set(kunci, { kunci, ...r })
    namaDudi.add(nkey(r.nama))
  }
  tabel.dudi = [...dd.values()]
  ring.dudi = dd.size

  const rowsM = book.get('MoU Kerjasama')!
  h = cariHeader(rowsM, ['jenis kerjasama'])
  if (h === null) throw new Error('Header MoU Kerjasama tidak ditemukan')
  const hm = petakan(rowsM, h, SMK_MOU, ctx, 'MoU Kerjasama', ['jenis kerjasama'])
  const mm = new Map<string, Rec>()
  let tanpaDudi = 0
  for (const [nomor, r] of hm) {
    if (!r.nama_dudi_sumber) {
      ctx.isu('peringatan', 'MoU tanpa nama DUDI dilewati', 'MoU Kerjasama', nomor)
      continue
    }
    const kunci = await sha((r.nomor_mou as string | null) || '', nkey(r.judul_mou as string | null), nkey(r.nama_dudi_sumber as string), (r.tgl_mulai as string | null) || '')
    const cocok = namaDudi.has(nkey(r.nama_dudi_sumber as string))
    if (!cocok) tanpaDudi++
    mm.set(kunci, { kunci, dudi_cocok: cocok ? 1 : 0, ...r })
  }
  if (tanpaDudi) ctx.isu('info', `MoU yang namanya tidak cocok dengan tabel DUDI (dudi_id dikosongkan): ${tanpaDudi}`, 'MoU Kerjasama')
  tabel.mou_kerjasama = [...mm.values()]
  ring.mou_kerjasama = mm.size
  ring.mou_dilewati_duplikat = hm.length - mm.size

  tabel.unit_produksi = book.has('Unit Produksi')
    ? parseSnapshot(book.get('Unit Produksi')!, 'Unit Produksi', ['nama unit produksi'], SMK_UNIT_PRODUKSI, 'nama unit produksi', ctx)
    : []
  ring.unit_produksi = tabel.unit_produksi.length
  tabel.praktik_industri = book.has('Praktek Industri')
    ? parseSnapshot(book.get('Praktek Industri')!, 'Praktek Industri', ['nama dudi'], SMK_PRAKTIK, 'nama dudi', ctx)
    : []
  ring.praktik_industri = tabel.praktik_industri.length
  return { tabel, ring }
}

// ---------------------------------------------------------------- pintu masuk

export class JenisTidakDikenali extends Error {}

export async function uraiBook(book: Book): Promise<Hasil> {
  const jenis = detect(book)
  if (jenis === null) throw new JenisTidakDikenali('Jenis berkas tidak dikenali dari isinya.')
  const ctx = new Ctx(jenis)
  bacaMeta(book.get([...book.keys()][0])!, ctx)

  let semester: string | null = null
  if (jenis !== 'absensi') {
    const tgl = ctx.diunduh ? ctx.diunduh.slice(0, 10) : new Date().toISOString().slice(0, 10)
    semester = semesterDariTanggal(tgl).id
  }

  let tabel: Record<string, Rec[]> = {}
  let ring: Record<string, unknown> = {}
  let semesterAbsensi: string[] = []

  try {
    if (jenis === 'pd_aktif' || jenis === 'pd_keluar') {
      const p = await parsePd(book, jenis, ctx)
      const t = tabelPd(p.recs, p.kolomSens, p.kolomOrtu)
      tabel = { peserta_didik: t.peserta, peserta_didik_sensitif: t.sens, orang_tua_wali: t.ortu }
      ring = { baris_dibaca: p.jumlahBaris, orang_unik: p.recs.length }
      if (jenis === 'pd_aktif') {
        const rombelSet = new Map<string, Rec>()
        const keanggotaan: Rec[] = []
        for (const rc of p.recs) {
          if (!rc.rombel) {
            ctx.isu('peringatan', 'peserta didik aktif tanpa Rombel Saat Ini', null, rc.baris, 'Rombel Saat Ini')
            continue
          }
          if (!rombelSet.has(rc.rombel)) {
            rombelSet.set(rc.rombel, { semester_id: semester, jenis_rombel: 'Kelas Utama', nama: rc.rombel, tingkat: tingkatDariNama(rc.rombel) })
          }
          keanggotaan.push({ semester_id: semester, jenis_rombel: 'Kelas Utama', rombel: rc.rombel, kunci_identitas: rc.kunci, no_urut: null })
        }
        tabel.rombel = [...rombelSet.values()]
        tabel.keanggotaan_rombel = keanggotaan
        ring = { ...ring, rombel: rombelSet.size, keanggotaan: keanggotaan.length, semester }
        ctx.isu('info', `Rombel Saat Ini dipasang ke semester ${semester} (diturunkan dari tanggal unduh)`)
      } else {
        ring = { ...ring, status: hitungStatus(p.recs) }
      }
    } else if (jenis === 'guru' || jenis === 'tendik') {
      const p = await parsePtkFile(book, jenis, ctx)
      tabel = { ptk: p.rows, ptk_sensitif: p.sens }
      ring = { baris_dibaca: p.rows.length }
    } else if (jenis === 'absensi') {
      const p = await parseAbsensi(book, ctx)
      tabel = p.tabel
      ring = p.ring
      semesterAbsensi = p.sems
    } else if (jenis === 'profil') {
      const p = await parseProfil(book, ctx, semester!)
      tabel = p.tabel
      ring = p.ring
    } else {
      const p = await parseSekolahSmk(book, ctx)
      tabel = p.tabel
      ring = p.ring
    }
  } catch (e) {
    ctx.isu('galat', `berkas tidak dapat diurai: ${(e as Error).message}`)
    tabel = {}
    ring = {}
  }

  const isu = ctx.daftar()
  const hitungIsu: Record<string, number> = {}
  for (const i of isu) hitungIsu[i.tingkat] = (hitungIsu[i.tingkat] ?? 0) + 1
  ring.isu = hitungIsu
  return { jenis, diunduh: ctx.diunduh, pengunduh: ctx.pengunduh, semester, semesterAbsensi, ringkasan: ring, tabel, isu }
}
