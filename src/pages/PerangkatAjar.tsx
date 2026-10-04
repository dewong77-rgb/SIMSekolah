import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { panggil } from '../lib/rpc'
import { DaftarPerangkat } from './LmsGuru'
import type { BarisMinggu, BarisTp } from './lmsRencanaXlsx'

// Perangkat ajar guru: TP, ATP, Silabus, Prota, Promes disusun otomatis dari satu sumber (Rencana ajar).
// Modul Ajar dan RPP berupa dokumen (berkas, tautan, atau teks).

type Tp = BarisTp & { mapel: string; tingkat: string; urutan: number }
type Minggu = BarisMinggu & { id: string; mapel: string; tingkat: string; urutan: number }
type Data = { tp: Tp[]; minggu: Minggu[] }

const JENIS = [
  { k: 'tp', nama: 'TP', judul: 'Tujuan Pembelajaran (TP)', turunan: true, ket: 'Rumusan tujuan per elemen, disusun dari Rencana ajar.' },
  { k: 'atp', nama: 'ATP', judul: 'Alur Tujuan Pembelajaran (ATP)', turunan: true, ket: 'Urutan tujuan pembelajaran per semester beserta pertemuan yang memuatnya.' },
  { k: 'silabus', nama: 'Silabus', judul: 'Silabus', turunan: true, ket: 'Tujuan, materi pokok, asesmen (KKTP), dan alokasi waktu dalam satu tabel.' },
  { k: 'prota', nama: 'Prota', judul: 'Program Tahunan (Prota)', turunan: true, ket: 'Alokasi jam pelajaran per tujuan dan semester.' },
  { k: 'promes', nama: 'Promes', judul: 'Program Semester (Promes)', turunan: true, ket: 'Jadwal pertemuan per minggu dengan materi pokok dan TP.' },
  { k: 'modul_ajar', nama: 'Modul Ajar', judul: 'Modul Ajar', turunan: false, ket: 'Unggah berkas atau tautan modul ajar Anda.' },
  { k: 'rpp', nama: 'RPP', judul: 'Rencana Pelaksanaan Pembelajaran (RPP)', turunan: false, ket: 'Unggah berkas atau tautan RPP Anda.' },
] as const

const nomorPer = (m: Minggu[], kode: string) => m.filter((x) => x.efektif && x.nomor != null && (x.tp_kode ?? '').split(',').map((z) => z.trim()).includes(kode))

function Tabel({ jenis, tp, mg }: { jenis: string; tp: Tp[]; mg: Minggu[] }) {
  if (jenis === 'tp') {
    return (
      <div className="tabel-bungkus"><table>
        <thead><tr><th>Kode</th><th>Elemen</th><th>Rumusan tujuan pembelajaran</th></tr></thead>
        <tbody>{tp.map((t) => <tr key={t.kode}><td><strong>{t.kode}</strong></td><td>{t.elemen_nama ?? t.elemen_kode}</td><td>{t.rumusan}</td></tr>)}</tbody>
      </table></div>
    )
  }
  if (jenis === 'atp') {
    return (
      <div className="tabel-bungkus"><table>
        <thead><tr><th>No</th><th>Sem</th><th>Elemen</th><th>Kode</th><th>Tujuan pembelajaran</th><th>JP</th><th>Pertemuan</th></tr></thead>
        <tbody>{tp.map((t, i) => (
          <tr key={t.kode}><td>{i + 1}</td><td>{t.semester ?? '-'}</td><td>{t.elemen_kode}</td><td><strong>{t.kode}</strong></td><td>{t.rumusan}</td><td>{t.alokasi_jp ?? '-'}</td>
            <td>{nomorPer(mg, t.kode).map((x) => `M${x.nomor}`).join(', ') || '-'}</td></tr>
        ))}</tbody>
      </table></div>
    )
  }
  if (jenis === 'silabus') {
    return (
      <div className="tabel-bungkus"><table>
        <thead><tr><th>Elemen dan capaian</th><th>Tujuan pembelajaran</th><th>Materi pokok</th><th>Asesmen (KKTP)</th><th>JP</th></tr></thead>
        <tbody>{tp.map((t) => {
          const materi = [...new Set(nomorPer(mg, t.kode).map((x) => x.materi_pokok).filter(Boolean))]
          return (
            <tr key={t.kode}>
              <td><strong>{t.elemen_nama ?? t.elemen_kode}</strong>{t.capaian ? <><br /><small>{t.capaian}</small></> : null}</td>
              <td><strong>{t.kode}</strong><br />{t.rumusan}</td>
              <td>{materi.length ? <ul style={{ margin: 0, paddingLeft: 16 }}>{materi.map((x) => <li key={x}>{x}</li>)}</ul> : '-'}</td>
              <td style={{ whiteSpace: 'pre-line' }}>{t.kriteria ?? '-'}<br /><small>Tuntas {t.nilai_tuntas}</small></td>
              <td>{t.alokasi_jp ?? '-'}</td>
            </tr>
          )
        })}</tbody>
      </table></div>
    )
  }
  if (jenis === 'prota') {
    const sem = [...new Set(tp.map((t) => t.semester ?? 0))].sort()
    return (
      <div className="tabel-bungkus"><table>
        <thead><tr><th>Semester</th><th>Elemen</th><th>Kode</th><th>Tujuan pembelajaran</th><th>JP</th></tr></thead>
        <tbody>
          {sem.flatMap((s) => {
            const baris = tp.filter((t) => (t.semester ?? 0) === s)
            const jam = (t: Tp) => t.alokasi_jp ?? nomorPer(mg, t.kode).reduce((a, x) => a + (x.jp ?? 0), 0)
            const total = baris.reduce((a, t) => a + jam(t), 0)
            return [
              ...baris.map((t) => <tr key={t.kode}><td>{s || '-'}</td><td>{t.elemen_kode}</td><td><strong>{t.kode}</strong></td><td>{t.rumusan}</td><td>{jam(t) || '-'}</td></tr>),
              <tr key={`j${s}`}><td colSpan={4}><strong>Jumlah semester {s || '-'}</strong></td><td><strong>{total}</strong></td></tr>,
            ]
          })}
        </tbody>
      </table></div>
    )
  }
  return (
    <div className="tabel-bungkus"><table>
      <thead><tr><th>Sem</th><th>M</th><th>Tanggal</th><th>Elemen</th><th>Materi pokok</th><th>JP</th><th>TP</th></tr></thead>
      <tbody>{mg.map((m) => (
        <tr key={m.id} style={m.efektif ? undefined : { opacity: 0.6 }}>
          <td>{m.semester ?? '-'}</td><td>{m.efektif ? m.nomor : '-'}</td>
          <td>{m.tanggal_mulai ?? '-'}{m.tanggal_selesai && m.tanggal_selesai !== m.tanggal_mulai ? ` s.d. ${m.tanggal_selesai}` : ''}</td>
          <td>{m.elemen_kode ?? ''}</td><td>{m.efektif ? m.materi_pokok : (m.keterangan ?? 'Tidak efektif')}</td><td>{m.jp ?? ''}</td><td>{m.tp_kode ?? ''}</td>
        </tr>
      ))}</tbody>
    </table></div>
  )
}

export default function PerangkatAjar() {
  const { jenis = '' } = useParams()
  const def = JENIS.find((j) => j.k === jenis)
  const [d, setD] = useState<Data | null>(null)
  const [galat, setGalat] = useState('')
  const [pilih, setPilih] = useState('')
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

  return (
    <Halaman judul={def.judul} lead={def.ket}>
      <nav className="aksi" aria-label="Jenis perangkat ajar" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
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
                <label>Mata pelajaran dan tingkat
                  <select value={aktif} onChange={(e) => setPilih(e.target.value)}>{kelompok.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
                </label>
              )}
              <Tabel jenis={jenis} tp={tp} mg={mg} />
              <p className="catatan">Disusun otomatis dari <Link to="/portal/lms/rencana">Rencana ajar</Link>. Ubah di sana (unduh Excel, edit, unggah), semua jenis ikut berubah.</p>
            </>
          )}
          <h3 className="jarak">Dokumen pendukung</h3>
          <DaftarPerangkat jenis={jenis} />
        </>
      ) : <DaftarPerangkat jenis={jenis} />}
    </Halaman>
  )
}
