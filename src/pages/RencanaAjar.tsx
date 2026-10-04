import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Halaman from '../components/Halaman'
import { panggil } from '../lib/rpc'
import { bacaRencanaXlsx, unduhTemplateRencana, type BarisMinggu, type BarisTp } from './lmsRencanaXlsx'

// Rencana ajar: ATP + KKTP (sheet TP) dan Program Semester (sheet Minggu), satu set per mata pelajaran dan tingkat.

type Tp = BarisTp & { mapel: string; tingkat: string; urutan: number }
type Minggu = BarisMinggu & { id: string; mapel: string; tingkat: string; urutan: number; terpakai: boolean }
type Data = { tp: Tp[]; minggu: Minggu[]; profil?: { mapel: string; tingkat: string; data: Record<string, string> }[] }
type Kelompok = { mapel: string; tingkat: string }

export default function RencanaAjar() {
  const [d, setD] = useState<Data | null>(null)
  const [galat, setGalat] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [pilih, setPilih] = useState('')
  const [baru, setBaru] = useState({ mapel: '', tingkat: '' })
  const [sibuk, setSibuk] = useState(false)
  const berkas = useRef<HTMLInputElement>(null)

  const muat = useCallback(async () => {
    try { setD(await panggil<Data>('lms_rencana_saya')) } catch (e) { setGalat((e as Error).message) }
  }, [])
  useEffect(() => { void muat() }, [muat])

  const kelompok = useMemo<Kelompok[]>(() => {
    const s = new Map<string, Kelompok>()
    for (const t of d?.tp ?? []) s.set(`${t.mapel}|${t.tingkat}`, { mapel: t.mapel, tingkat: t.tingkat })
    for (const m of d?.minggu ?? []) s.set(`${m.mapel}|${m.tingkat}`, { mapel: m.mapel, tingkat: m.tingkat })
    return [...s.values()]
  }, [d])
  useEffect(() => { if (!pilih && kelompok.length) setPilih(`${kelompok[0].mapel}|${kelompok[0].tingkat}`) }, [kelompok, pilih])

  const [mapel, tingkat] = pilih ? pilih.split('|') : [baru.mapel.trim(), baru.tingkat.trim().toUpperCase()]
  const tp = (d?.tp ?? []).filter((t) => t.mapel === mapel && t.tingkat === tingkat)
  const mg = (d?.minggu ?? []).filter((m) => m.mapel === mapel && m.tingkat === tingkat)

  async function unduh(isi: boolean) {
    if (!mapel || !tingkat) { setGalat('Isi mata pelajaran dan tingkat dulu.'); return }
    setGalat(null)
    await unduhTemplateRencana(mapel, tingkat, isi ? { tp, minggu: mg, profil: d?.profil?.find((x) => x.mapel === mapel && x.tingkat === tingkat)?.data } : undefined)
  }

  async function unggah(f: File | undefined) {
    if (!f) return
    setGalat(null); setInfo(null)
    if (!mapel || !tingkat) { setGalat('Isi mata pelajaran dan tingkat dulu.'); return }
    setSibuk(true)
    try {
      const r = await bacaRencanaXlsx(f)
      if (r.galat.length) { setGalat(r.galat.slice(0, 8).join('\n')); return }
      if (!confirm(`Ganti seluruh rencana ${mapel} kelas ${tingkat} dengan isi berkas ini (${r.tp.length} TP, ${r.minggu.length} baris minggu)? Pertemuan yang sudah dibuat tetap ada, hanya tautan ke minggu lamanya dilepas.`)) return
      const h = await panggil<{ tp: number; minggu: number }>('lms_rencana_ganti', { p_mapel: mapel, p_tingkat: tingkat, p_tp: r.tp, p_minggu: r.minggu })
      if (r.profil && Object.keys(r.profil).length) await panggil('lms_rencana_profil_simpan', { p_mapel: mapel, p_tingkat: tingkat, p_data: r.profil })
      setInfo(`Tersimpan: ${h.tp} TP dan ${h.minggu} baris Program Semester.`)
      setPilih(`${mapel}|${tingkat}`)
      await muat()
    } catch (e) { setGalat((e as Error).message) } finally { setSibuk(false); if (berkas.current) berkas.current.value = '' }
  }

  if (!d && !galat) return <Halaman judul="Rencana ajar"><p>Memuat...</p></Halaman>
  return (
    <Halaman judul="Rencana ajar" lead="ATP, KKTP, dan Program Semester dalam satu tempat. Pertemuan baru bisa diambil dari rencana, sehingga tujuan dan kriteria ketuntasan ikut muncul di pertemuan.">
      {galat && <p className="catatan galat" role="alert" style={{ whiteSpace: 'pre-line' }}>{galat}</p>}
      {info && <p className="catatan" role="status">{info}</p>}

      <section className="kartu jarak">
        <h3>Mata pelajaran dan tingkat</h3>
        {kelompok.length > 0 && (
          <label>Rencana tersimpan
            <select value={pilih} onChange={(e) => setPilih(e.target.value)}>
              {kelompok.map((k) => <option key={`${k.mapel}|${k.tingkat}`} value={`${k.mapel}|${k.tingkat}`}>{k.mapel}, kelas {k.tingkat}</option>)}
              <option value="">+ Mata pelajaran lain</option>
            </select>
          </label>
        )}
        {(!pilih || !kelompok.length) && (
          <div className="form">
            <label>Mata pelajaran<input value={baru.mapel} onChange={(e) => setBaru({ ...baru, mapel: e.target.value })} placeholder="Informatika" /></label>
            <label>Tingkat<input value={baru.tingkat} onChange={(e) => setBaru({ ...baru, tingkat: e.target.value })} placeholder="X" style={{ maxWidth: 90 }} /></label>
          </div>
        )}
        <p className="catatan">Nama mata pelajaran harus sama dengan yang dipakai di kelas ajar. Tingkat diambil dari kata pertama nama rombel (X TE 1 menjadi X).</p>
        <div className="aksi">
          <button type="button" className="tombol" onClick={() => void unduh(false)}>Unduh template kosong</button>
          {tp.length + mg.length > 0 && <button type="button" className="tombol" onClick={() => void unduh(true)}>Unduh rencana saya</button>}
          <button type="button" className="tombol tombol-isi" disabled={sibuk} onClick={() => berkas.current?.click()}>{sibuk ? 'Memproses...' : 'Unggah Excel'}</button>
          <input ref={berkas} type="file" accept=".xlsx" hidden onChange={(e) => void unggah(e.target.files?.[0])} />
        </div>
      </section>

      {tp.length > 0 && (
        <section className="kartu jarak">
          <h3>Tujuan pembelajaran dan KKTP ({tp.length})</h3>
          <div className="tabel-bungkus">
            <table>
              <thead><tr><th>Kode</th><th>Elemen</th><th>Rumusan tujuan</th><th>JP</th><th>Kriteria ketercapaian</th><th>Tuntas</th></tr></thead>
              <tbody>
                {tp.map((t) => (
                  <tr key={t.kode}>
                    <td><strong>{t.kode}</strong></td><td>{t.elemen_kode}</td><td>{t.rumusan}</td><td>{t.alokasi_jp ?? '-'}</td>
                    <td style={{ whiteSpace: 'pre-line' }}>{t.kriteria ?? '-'}</td><td>{t.nilai_tuntas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {mg.length > 0 && (
        <section className="kartu jarak">
          <h3>Program Semester ({mg.filter((m) => m.efektif).length} pertemuan efektif)</h3>
          <div className="tabel-bungkus">
            <table>
              <thead><tr><th>Sem</th><th>M</th><th>Tanggal</th><th>Elemen</th><th>Materi pokok</th><th>JP</th><th>TP</th><th>Status</th></tr></thead>
              <tbody>
                {mg.map((m) => (
                  <tr key={m.id} style={m.efektif ? undefined : { opacity: 0.6 }}>
                    <td>{m.semester ?? '-'}</td><td>{m.efektif ? m.nomor : '-'}</td>
                    <td>{m.tanggal_mulai ?? '-'}{m.tanggal_selesai && m.tanggal_selesai !== m.tanggal_mulai ? ` s.d. ${m.tanggal_selesai}` : ''}</td>
                    <td>{m.elemen_kode ?? ''}</td>
                    <td>{m.materi_pokok ?? m.keterangan ?? ''}</td><td>{m.jp ?? ''}</td><td>{m.tp_kode ?? ''}</td>
                    <td>{!m.efektif ? (m.keterangan ?? 'Tidak efektif') : m.terpakai ? 'Sudah dibuat' : 'Belum'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {!tp.length && !mg.length && <p className="catatan">Belum ada rencana untuk pilihan ini. Unduh template, isi, lalu unggah.</p>}
    </Halaman>
  )
}
