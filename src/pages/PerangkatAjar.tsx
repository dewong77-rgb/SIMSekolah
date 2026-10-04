import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { panggil } from '../lib/rpc'
import { DaftarPerangkat } from './LmsGuru'
import type { BarisMinggu, BarisTp, Profil } from './lmsRencanaXlsx'

// Perangkat ajar guru: TP, ATP, Silabus, Prota, Promes disusun otomatis dari satu sumber (Rencana ajar).
// Modul Ajar dan RPP berupa dokumen (berkas, tautan, atau teks).

type Tp = BarisTp & { mapel: string; tingkat: string; urutan: number }
type Minggu = BarisMinggu & { id: string; mapel: string; tingkat: string; urutan: number }
type Data = { tp: Tp[]; minggu: Minggu[]; profil?: { mapel: string; tingkat: string; data: Profil }[] }
type Ctx = { tp: Tp[]; mg: Minggu[]; pf: Profil; mapel: string; tingkat: string; rombel: string[]; tahun: string }

const JENIS = [
  { k: 'tp', nama: 'TP', judul: 'Tujuan Pembelajaran (TP)', turunan: true, ket: 'Rumusan tujuan per elemen, disusun dari Rencana ajar.' },
  { k: 'atp', nama: 'ATP', judul: 'Alur Tujuan Pembelajaran (ATP)', turunan: true, ket: 'Urutan tujuan pembelajaran per semester beserta pertemuan yang memuatnya.' },
  { k: 'kktp', nama: 'KKTP', judul: 'Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)', turunan: true, ket: 'Kriteria dan nilai tuntas per tujuan pembelajaran.' },
  { k: 'silabus', nama: 'Silabus', judul: 'Silabus', turunan: true, ket: 'Tujuan, materi pokok, asesmen (KKTP), dan alokasi waktu dalam satu tabel.' },
  { k: 'prota', nama: 'Prota', judul: 'Program Tahunan (Prota)', turunan: true, ket: 'Alokasi jam pelajaran per tujuan dan semester.' },
  { k: 'promes', nama: 'Promes', judul: 'Program Semester (Promes)', turunan: true, ket: 'Jadwal pertemuan per minggu dengan materi pokok dan TP.' },
  { k: 'modul_ajar', nama: 'Modul Ajar', judul: 'Modul Ajar', turunan: false, ket: 'Unggah berkas atau tautan modul ajar Anda.' },
  { k: 'rpp', nama: 'RPP', judul: 'Rencana Pelaksanaan Pembelajaran (RPP)', turunan: false, ket: 'Unggah berkas atau tautan RPP Anda.' },
] as const

const nomorPer = (m: Minggu[], kode: string) => m.filter((x) => x.efektif && x.nomor != null && (x.tp_kode ?? '').split(',').map((z) => z.trim()).includes(kode))

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const BLN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des']
const bulanDari = (t: string | null) => (t ? `${BULAN[Number(t.slice(5, 7)) - 1]} ${t.slice(0, 4)}` : '-')
function rentang(a: string | null, b: string | null) {
  if (!a) return '-'
  const f = (t: string) => `${Number(t.slice(8, 10))} ${BLN_PENDEK[Number(t.slice(5, 7)) - 1]}`
  if (!b || b === a) return f(a)
  return a.slice(5, 7) === b.slice(5, 7) ? `${Number(a.slice(8, 10))} s.d. ${f(b)}` : `${f(a)} s.d. ${f(b)}`
}
const semesterAda = (c: Ctx) => [...new Set([...c.tp.map((t) => t.semester ?? 1), ...c.mg.map((m) => m.semester ?? 1)])].sort()
const elemenDari = (tp: Tp[]) => {
  const peta = new Map<string, Tp[]>()
  for (const t of tp) peta.set(t.elemen_kode, [...(peta.get(t.elemen_kode) ?? []), t])
  return [...peta.entries()]
}
const jamTp = (c: Ctx, t: Tp) => t.alokasi_jp ?? nomorPer(c.mg, t.kode).reduce((a, x) => a + (x.jp ?? 0), 0)

function Kop({ c, judul, lengkap }: { c: Ctx; judul: string; lengkap?: boolean }) {
  const baris: [string, string | undefined][] = [
    ['Satuan Pendidikan', c.pf.satuan], ['Mata Pelajaran', c.mapel], ['Fase / Kelas', [c.pf.fase, c.tingkat].filter(Boolean).join(' / ')],
    ...(lengkap ? ([['Program Keahlian', c.pf.program_keahlian], ['Rombel Diampu', c.rombel.join(', ')], ['Alokasi Waktu', c.pf.alokasi_waktu]] as [string, string | undefined][]) : []),
    ['Penyusun', c.pf.penyusun],
  ]
  return (
    <header style={{ marginBottom: 12 }}>
      <h2 style={{ textAlign: 'center', margin: 0 }}>{judul.toUpperCase()}</h2>
      {c.tahun && <h3 style={{ textAlign: 'center', margin: '4px 0 12px' }}>TAHUN PELAJARAN {c.tahun}</h3>}
      <table style={{ width: 'auto' }}><tbody>{baris.filter(([, v]) => v).map(([k, v]) => <tr key={k}><td>{k}</td><td>: {v}</td></tr>)}</tbody></table>
    </header>
  )
}

function Pengesahan({ c }: { c: Ctx }) {
  if (!c.pf.kepala && !c.pf.penyusun) return null
  return (
    <section className="jarak" style={{ breakInside: 'avoid' }}>
      <h3>Halaman Pengesahan</h3>
      <div className="grid grid-2">
        <div>Mengetahui,<br />Kepala {c.pf.satuan ?? 'Sekolah'}<br /><br /><br /><br /><strong>{c.pf.kepala}</strong>{c.pf.nip_kepala && <><br />NIP. {c.pf.nip_kepala}</>}</div>
        <div>{[c.pf.kota, c.pf.tanggal].filter(Boolean).join(', ')}<br />Guru Mata Pelajaran<br /><br /><br /><br /><strong>{c.pf.penyusun}</strong>{c.pf.nip_guru && <><br />NIP. {c.pf.nip_guru}</>}</div>
      </div>
    </section>
  )
}

const Catatan = ({ t }: { t?: string }) => (t ? <p className="catatan"><em>Catatan. {t}</em></p> : null)

function PerSemester({ c, kolom }: { c: Ctx; kolom: 'atp' | 'kktp' | 'tp' }) {
  return (
    <>
      {semesterAda(c).map((sem) => {
        const tps = c.tp.filter((t) => (t.semester ?? 1) === sem)
        if (!tps.length) return null
        return (
          <section key={sem} className="jarak">
            <h3>SEMESTER {sem}</h3>
            {elemenDari(tps).map(([kode, daftar]) => (
              <div key={kode} style={{ marginBottom: 14 }}>
                <h4 style={{ marginBottom: 4 }}>{daftar[0].elemen_nama ?? kode} ({kode})</h4>
                {kolom === 'atp' && daftar[0].capaian && <p><em>Capaian Pembelajaran Elemen. {daftar[0].capaian}</em></p>}
                {kolom === 'atp' && <p>Alokasi elemen ini, {daftar.reduce((a, t) => a + jamTp(c, t), 0)} JP.</p>}
                <div className="tabel-bungkus"><table>
                  <thead>
                    {kolom === 'atp' && <tr><th>Kode</th><th>Rumusan Tujuan Pembelajaran</th><th>Alokasi</th></tr>}
                    {kolom === 'kktp' && <tr><th>Kode TP</th><th>Kriteria Ketercapaian Tujuan Pembelajaran</th><th>Nilai Tuntas</th></tr>}
                    {kolom === 'tp' && <tr><th>Kode</th><th>Rumusan Tujuan Pembelajaran</th></tr>}
                  </thead>
                  <tbody>{daftar.map((t) => (
                    <tr key={t.kode}>
                      <td><strong>{t.kode}</strong></td>
                      {kolom === 'kktp' ? <td style={{ whiteSpace: 'pre-line' }}>{t.kriteria ?? '-'}</td> : <td>{t.rumusan}</td>}
                      {kolom === 'atp' && <td>{jamTp(c, t) || '-'}</td>}
                      {kolom === 'kktp' && <td>{t.nilai_tuntas}</td>}
                    </tr>
                  ))}</tbody>
                </table></div>
              </div>
            ))}
          </section>
        )
      })}
    </>
  )
}

function Prota({ c }: { c: Ctx }) {
  const sems = semesterAda(c)
  const huruf = (i: number) => String.fromCharCode(65 + i)
  let n = 0
  const bagian: React.ReactNode[] = []
  if (c.pf.dasar_hukum) bagian.push(<section key="dh" className="jarak"><h3>{huruf(n++)}. Dasar Hukum</h3><ol>{c.pf.dasar_hukum.split('\n').filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}</ol></section>)
  if (c.pf.cp_umum) bagian.push(<section key="cp" className="jarak"><h3>{huruf(n++)}. Capaian Pembelajaran Umum, Fase {c.pf.fase ?? ''}</h3><p>{c.pf.cp_umum}</p></section>)
  const rekap: { sem: number; minggu: number; jp: number }[] = []
  for (const sem of sems) {
    const mg = c.mg.filter((m) => (m.semester ?? 1) === sem)
    const bulan = new Map<string, Minggu[]>()
    for (const m of mg) { const k = bulanDari(m.tanggal_mulai); bulan.set(k, [...(bulan.get(k) ?? []), m]) }
    const efektif = mg.filter((m) => m.efektif).length
    const tps = c.tp.filter((t) => (t.semester ?? 1) === sem)
    const jp = tps.reduce((a, t) => a + jamTp(c, t), 0)
    rekap.push({ sem, minggu: efektif, jp })
    if (mg.length) bagian.push(
      <section key={`m${sem}`} className="jarak">
        <h3>{huruf(n++)}. Analisis Minggu Efektif, Semester {sem}</h3>
        <div className="tabel-bungkus"><table>
          <thead><tr><th>Bulan</th><th>Jml Minggu</th><th>Minggu Efektif</th><th>Keterangan</th></tr></thead>
          <tbody>
            {[...bulan.entries()].map(([b, daftar]) => <tr key={b}><td>{b}</td><td>{daftar.length}</td><td>{daftar.filter((m) => m.efektif).length}</td><td>{[...new Set(daftar.filter((m) => !m.efektif).map((m) => m.keterangan).filter(Boolean))].join(' ')}</td></tr>)}
            <tr><td><strong>Jumlah</strong></td><td><strong>{mg.length}</strong></td><td><strong>{efektif}</strong></td><td><strong>{efektif} minggu efektif{c.pf.alokasi_waktu ? '' : ''}</strong></td></tr>
          </tbody>
        </table></div>
      </section>)
    if (tps.length) bagian.push(
      <section key={`d${sem}`} className="jarak">
        <h3>{huruf(n++)}. Distribusi Alokasi Waktu per Elemen, Semester {sem}</h3>
        <div className="tabel-bungkus"><table>
          <thead><tr><th>No</th><th>Elemen</th><th>Fokus Materi</th><th>JP</th></tr></thead>
          <tbody>
            {elemenDari(tps).map(([kode, daftar], i) => <tr key={kode}><td>{i + 1}</td><td>{daftar[0].elemen_nama ?? kode} ({kode})</td><td>{c.pf[`fokus_${kode}_${sem}`] ?? daftar[0].capaian ?? ''}</td><td>{daftar.reduce((a, t) => a + jamTp(c, t), 0)}</td></tr>)}
            <tr><td></td><td colSpan={2}><strong>Jumlah</strong></td><td><strong>{jp}</strong></td></tr>
          </tbody>
        </table></div>
        <Catatan t={c.pf[`catatan_${sem}`]} />
      </section>)
  }
  if (rekap.length > 1) bagian.push(
    <section key="rk" className="jarak">
      <h3>{huruf(n++)}. Rekapitulasi Satu Tahun Pelajaran</h3>
      <div className="tabel-bungkus"><table>
        <thead><tr><th>Keterangan</th>{rekap.map((r) => <th key={r.sem}>Semester {r.sem}</th>)}</tr></thead>
        <tbody>
          <tr><td>Minggu efektif</td>{rekap.map((r) => <td key={r.sem}>{r.minggu}</td>)}</tr>
          <tr><td>Jam Pelajaran (JP)</td>{rekap.map((r) => <td key={r.sem}>{r.jp}</td>)}</tr>
          <tr><td><strong>Jumlah JP satu tahun pelajaran</strong></td><td colSpan={rekap.length}><strong>{rekap.reduce((a, r) => a + r.jp, 0)}</strong></td></tr>
        </tbody>
      </table></div>
      <Catatan t={c.pf.catatan_prota} />
    </section>)
  return <>{bagian}</>
}

function Promes({ c }: { c: Ctx }) {
  return (
    <>
      {semesterAda(c).map((sem) => {
        const mg = c.mg.filter((m) => (m.semester ?? 1) === sem)
        if (!mg.length) return null
        const jp = mg.filter((m) => m.efektif).reduce((a, m) => a + (m.jp ?? 0), 0)
        return (
          <section key={sem} className="jarak">
            <h3>Semester {sem}, {jp} JP</h3>
            <div className="tabel-bungkus"><table>
              <thead><tr><th>Bulan</th><th>Tanggal</th><th>Elemen</th><th>Materi Pokok</th><th>JP</th><th>Ket.</th></tr></thead>
              <tbody>{mg.map((m) => (
                <tr key={m.id} style={m.efektif ? undefined : { background: '#eee', fontStyle: 'italic' }}>
                  <td>{bulanDari(m.tanggal_mulai)}</td><td>{rentang(m.tanggal_mulai, m.tanggal_selesai)}</td>
                  <td>{m.efektif ? <strong>{m.elemen_kode}</strong> : ''}</td>
                  <td>{m.efektif ? <>M{m.nomor}: {m.materi_pokok}</> : (m.keterangan ?? 'Tidak efektif')}</td>
                  <td>{m.efektif ? m.jp : ''}</td><td>{m.efektif ? (m.tp_kode ?? '') : ''}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </section>
        )
      })}
      <Catatan t={c.pf.catatan_prota} />
    </>
  )
}

function Silabus({ c }: { c: Ctx }) {
  return (
    <div className="tabel-bungkus"><table>
      <thead><tr><th>Elemen dan capaian</th><th>Tujuan pembelajaran</th><th>Materi pokok</th><th>Asesmen (KKTP)</th><th>JP</th></tr></thead>
      <tbody>{c.tp.map((t) => {
        const materi = [...new Set(nomorPer(c.mg, t.kode).map((x) => x.materi_pokok).filter(Boolean))]
        return (
          <tr key={t.kode}>
            <td><strong>{t.elemen_nama ?? t.elemen_kode}</strong>{t.capaian ? <><br /><small>{t.capaian}</small></> : null}</td>
            <td><strong>{t.kode}</strong><br />{t.rumusan}</td>
            <td>{materi.length ? <ul style={{ margin: 0, paddingLeft: 16 }}>{materi.map((x) => <li key={x}>{x}</li>)}</ul> : '-'}</td>
            <td style={{ whiteSpace: 'pre-line' }}>{t.kriteria ?? '-'}<br /><small>Tuntas {t.nilai_tuntas}</small></td>
            <td>{jamTp(c, t) || '-'}</td>
          </tr>
        )
      })}</tbody>
    </table></div>
  )
}

export function Dokumen({ jenis, c }: { jenis: string; c: Ctx }) {
  const judul = JENIS.find((j) => j.k === jenis)?.judul.replace(/ \(.*\)$/, '') ?? ''
  return (
    <article className="dokumen-ajar">
      <Kop c={c} judul={judul} lengkap={jenis === 'prota'} />
      {jenis === 'tp' && <PerSemester c={c} kolom="tp" />}
      {jenis === 'atp' && <PerSemester c={c} kolom="atp" />}
      {jenis === 'kktp' && <PerSemester c={c} kolom="kktp" />}
      {jenis === 'silabus' && <Silabus c={c} />}
      {jenis === 'prota' && <Prota c={c} />}
      {jenis === 'promes' && <Promes c={c} />}
      <Pengesahan c={c} />
    </article>
  )
}

export default function PerangkatAjar() {
  const { jenis = '' } = useParams()
  const def = JENIS.find((j) => j.k === jenis)
  const [d, setD] = useState<Data | null>(null)
  const [galat, setGalat] = useState('')
  const [pilih, setPilih] = useState('')
  const [kelasSaya, setKelasSaya] = useState<{ mapel: string; rombel: string; peran: string }[]>([])
  useEffect(() => { panggil<{ mapel: string; rombel: string; peran: string }[]>('lms_kelas_saya').then(setKelasSaya).catch(() => undefined) }, [])
  useEffect(() => { if (def?.turunan) panggil<Data>('lms_rencana_saya').then(setD).catch((e) => setGalat((e as Error).message)) }, [def?.turunan])
  const kelompok = useMemo(() => {
    const s = new Map<string, string>()
    for (const t of d?.tp ?? []) s.set(`${t.mapel}|${t.tingkat}`, `${t.mapel}, kelas ${t.tingkat}`)
    for (const m of d?.minggu ?? []) s.set(`${m.mapel}|${m.tingkat}`, `${m.mapel}, kelas ${m.tingkat}`)
    return [...s.entries()]
  }, [d])
  const aktif = pilih || kelompok[0]?.[0] || ''
  if (!def) return <Navigate to="/portal/lms/perangkat/tp" replace />
  const [mapel, tingkat] = aktif.split('|')
  const tp = (d?.tp ?? []).filter((t) => t.mapel === mapel && t.tingkat === tingkat)
  const mg = (d?.minggu ?? []).filter((m) => m.mapel === mapel && m.tingkat === tingkat)
  const rombel = kelasSaya.filter((k) => k.peran === 'pengelola' && k.mapel.toLowerCase() === (mapel ?? '').toLowerCase() && k.rombel.split(' ')[0].toUpperCase() === tingkat).map((k) => k.rombel)
  const pf = d?.profil?.find((x) => x.mapel === mapel && x.tingkat === tingkat)?.data ?? {}
  const awal = mg.map((m) => m.tanggal_mulai).filter((x): x is string => !!x).sort()[0]
  const th = awal ? (Number(awal.slice(5, 7)) >= 7 ? Number(awal.slice(0, 4)) : Number(awal.slice(0, 4)) - 1) : null
  const ctx: Ctx = { tp, mg, pf, mapel, tingkat, rombel, tahun: th ? `${th}/${th + 1}` : '' }

  return (
    <Halaman judul={def.judul} lead={def.ket}>
      <nav className="aksi tanpa-cetak" aria-label="Jenis perangkat ajar" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        {JENIS.map((j) => <Link key={j.k} to={`/portal/lms/perangkat/${j.k}`} className={`tombol${j.k === jenis ? ' tombol-isi' : ''}`}>{j.nama}</Link>)}
      </nav>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      {def.turunan ? (
        <>
          {!d && !galat && <p className="catatan">Memuat...</p>}
          {d && kelompok.length === 0 && <p className="catatan">Belum ada data. Isi dari template Excel di <Link to="/portal/lms/rencana">Rencana ajar</Link>, maka TP, ATP, Silabus, Prota, dan Promes tersusun sendiri.</p>}
          {kelompok.length > 0 && (
            <>
              {kelompok.length > 1 && (
                <label className="tanpa-cetak">Mata pelajaran dan tingkat
                  <select value={aktif} onChange={(e) => setPilih(e.target.value)}>{kelompok.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
                </label>
              )}
              <Dokumen jenis={jenis} c={ctx} />
              <div className="aksi tanpa-cetak"><button type="button" className="tombol" onClick={() => window.print()}>Cetak atau simpan PDF</button></div>
              <p className="catatan tanpa-cetak">Disusun otomatis dari <Link to="/portal/lms/rencana">Rencana ajar</Link>. Ubah di sana (unduh Excel, edit, unggah), semua jenis ikut berubah.</p>
            </>
          )}
          <div className="tanpa-cetak"><h3 className="jarak">Dokumen pendukung</h3>
          <DaftarPerangkat jenis={jenis} /></div>
        </>
      ) : <DaftarPerangkat jenis={jenis} />}
    </Halaman>
  )
}
