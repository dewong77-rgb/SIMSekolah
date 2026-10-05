// Tracer study: rekap, daftar alumni, dan pengisian oleh petugas.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import FormTracer, { type IsianTracer } from '../../components/FormTracer'
import { panggil, tglJam } from '../../lib/rpc'
import { KESESUAIAN, PENGHASILAN, STATUS_TRACER, label, unduhCsv } from '../../lib/hubin'
import Gerbang from './Gerbang'

type Rekap = {
  alumni: number; responden: number
  per_tahun: { tahun: number; alumni: number; responden: number }[]
  status: { kode: string; jumlah: number }[]; kesesuaian: { kode: string; jumlah: number }[]; penghasilan: { kode: string; jumlah: number }[]
  waktu_tunggu: { jumlah: number; rata: number | null; median: number | null }
  per_kompetensi: { kompetensi: string; total: number; status: Record<string, number> }[]
  instansi_teratas: { instansi: string; jumlah: number }[]
  saran_terisi: number; saran: { saran: string; tahun_lulus: number | null; kompetensi: string | null }[]
}
type Baris = {
  id: string; nama: string; nisn: string | null; tahun_lulus: number | null; hp: string | null; sudah: boolean
  status_utama: string | null; kompetensi: string | null; instansi: string | null; sumber: string | null; diperbarui_pada: string | null
}
const persen = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

function Batang({ judul, data, total, daftar }: { judul: string; data: { kode: string; jumlah: number }[]; total: number; daftar: readonly (readonly [string, string])[] }) {
  return (
    <div className="kartu">
      <h3>{judul}</h3>
      {data.length === 0 && <p className="catatan">Belum ada data.</p>}
      {data.map((d) => (
        <div key={d.kode} style={{ margin: '8px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.9rem' }}><span>{label(daftar, d.kode)}</span><span>{d.jumlah} ({persen(d.jumlah, total)}%)</span></div>
          <div style={{ background: '#e8edf3', borderRadius: 4, height: 8 }}><div style={{ width: `${persen(d.jumlah, total)}%`, background: 'var(--warna-utama, #1a3e6f)', height: 8, borderRadius: 4 }} /></div>
        </div>
      ))}
    </div>
  )
}

function Isi({ lihatSaja }: { lihatSaja: boolean }) {
  const [tab, setTab] = useState<'rekap' | 'daftar'>('rekap')
  const [rekap, setRekap] = useState<Rekap | null>(null)
  const [daftar, setDaftar] = useState<{ total: number; baris: Baris[] } | null>(null)
  const [tahun, setTahun] = useState('')
  const [status, setStatus] = useState('belum')
  const [cari, setCari] = useState('')
  const [halaman, setHalaman] = useState(0)
  const [isi, setIsi] = useState<Baris | null>(null)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const BATAS = 50
  const thn = tahun ? Number(tahun) : null
  const tahunIni = new Date().getFullYear()

  const muatRekap = useCallback(async () => {
    try { setRekap(await panggil<Rekap>('tracer_rekap', { p_dari: thn, p_sampai: thn })) } catch (e) { setGalat((e as Error).message) }
  }, [thn])
  const muatDaftar = useCallback(async () => {
    try { setDaftar(await panggil('tracer_daftar', { p_tahun: thn, p_status: status, p_cari: cari.trim() || null, p_batas: BATAS, p_mulai: halaman * BATAS })) } catch (e) { setGalat((e as Error).message) }
  }, [thn, status, cari, halaman])
  useEffect(() => { void muatRekap() }, [muatRekap])
  useEffect(() => { if (tab === 'daftar') void muatDaftar() }, [tab, muatDaftar])

  async function simpan(d: IsianTracer) {
    if (!isi) return
    setSibuk(true); setGalat(''); setInfo('')
    try { await panggil('tracer_simpan_petugas', { p_peserta_didik_id: isi.id, p_data: d }); setInfo(`Jawaban ${isi.nama} tersimpan.`); setIsi(null); void muatDaftar(); void muatRekap() }
    catch (e) { setGalat((e as Error).message) } finally { setSibuk(false) }
  }

  async function ekspor() {
    setGalat('')
    try {
      const h = await panggil<{ total: number; baris: Baris[] }>('tracer_daftar', { p_tahun: thn, p_status: status, p_cari: cari.trim() || null, p_batas: 5000, p_mulai: 0 })
      unduhCsv(`tracer-alumni-${tahun || 'semua'}`, [
        ['Nama', 'NISN', 'Tahun lulus', 'HP', 'Sudah mengisi', 'Kegiatan utama', 'Kompetensi', 'Instansi', 'Sumber'],
        ...h.baris.map((b) => [b.nama, b.nisn, b.tahun_lulus, b.hp, b.sudah ? 'Ya' : 'Belum', b.status_utama ? label(STATUS_TRACER, b.status_utama) : '', b.kompetensi, b.instansi, b.sumber]),
      ])
    } catch (e) { setGalat((e as Error).message) }
  }

  const bekerja = rekap ? rekap.status.filter((s) => ['bekerja', 'wirausaha', 'bekerja_kuliah'].includes(s.kode)).reduce((a, s) => a + s.jumlah, 0) : 0
  const kuliah = rekap ? rekap.status.filter((s) => ['kuliah', 'bekerja_kuliah'].includes(s.kode)).reduce((a, s) => a + s.jumlah, 0) : 0
  const kerjaTotal = rekap ? rekap.kesesuaian.reduce((a, s) => a + s.jumlah, 0) : 0

  return (
    <Halaman judul="Tracer study alumni" lead="Jejak lulusan: bekerja, kuliah, wirausaha, dan kesesuaiannya dengan kompetensi keahlian. Alumni mengisi sendiri di halaman Tracer Study situs publik, atau dicatat petugas.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
        <button className={tab === 'rekap' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('rekap')}>Rekap</button>
        <button className={tab === 'daftar' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('daftar')}>Daftar alumni</button>
        <select value={tahun} onChange={(e) => { setTahun(e.target.value); setHalaman(0) }} aria-label="Tahun lulus">
          <option value="">Semua angkatan</option>
          {Array.from({ length: 12 }, (_, i) => tahunIni - i).map((t) => <option key={t} value={t}>Lulus {t}</option>)}
        </select>
        <a href="/alumni/tracer" target="_blank" rel="noopener noreferrer">Tautan untuk alumni</a>
      </div>

      {tab === 'rekap' && rekap && (
        <div className="jarak">
          <div className="grid grid-3">
            <div className="kartu"><small>Alumni tercatat</small><h2>{rekap.alumni}</h2></div>
            <div className="kartu"><small>Sudah mengisi</small><h2>{rekap.responden} <small>({persen(rekap.responden, rekap.alumni)}%)</small></h2></div>
            <div className="kartu"><small>Bekerja atau berwirausaha / kuliah</small><h2>{persen(bekerja, rekap.responden)}% / {persen(kuliah, rekap.responden)}%</h2><p className="catatan">Dari responden. Responden bukan seluruh alumni, baca sebagai gambaran, bukan angka pasti.</p></div>
          </div>
          <div className="grid grid-2 jarak">
            <Batang judul="Kegiatan utama" data={rekap.status} total={rekap.responden} daftar={STATUS_TRACER} />
            <Batang judul="Kesesuaian pekerjaan dengan kompetensi" data={rekap.kesesuaian} total={kerjaTotal} daftar={KESESUAIAN} />
            <Batang judul="Kisaran penghasilan" data={rekap.penghasilan} total={kerjaTotal} daftar={PENGHASILAN} />
            <div className="kartu">
              <h3>Waktu tunggu kerja pertama</h3>
              {rekap.waktu_tunggu.jumlah ? <p>Rata-rata {rekap.waktu_tunggu.rata} bulan, median {rekap.waktu_tunggu.median} bulan ({rekap.waktu_tunggu.jumlah} responden).</p> : <p className="catatan">Belum ada data.</p>}
              <h3>Perusahaan tempat alumni bekerja</h3>
              {rekap.instansi_teratas.length ? <ol>{rekap.instansi_teratas.map((i) => <li key={i.instansi}>{i.instansi} ({i.jumlah})</li>)}</ol> : <p className="catatan">Belum ada data.</p>}
            </div>
          </div>
          <div className="tabel-bungkus jarak">
            <table>
              <thead><tr><th>Kompetensi</th><th>Responden</th>{STATUS_TRACER.map((s) => <th key={s[0]}>{s[1]}</th>)}</tr></thead>
              <tbody>{rekap.per_kompetensi.map((k) => <tr key={k.kompetensi}><td>{k.kompetensi}</td><td>{k.total}</td>{STATUS_TRACER.map((s) => <td key={s[0]}>{k.status[s[0]] ?? 0}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <div className="tabel-bungkus jarak">
            <table>
              <thead><tr><th>Angkatan</th><th>Alumni</th><th>Mengisi</th><th>Tingkat</th></tr></thead>
              <tbody>{rekap.per_tahun.map((t) => <tr key={t.tahun}><td>{t.tahun}</td><td>{t.alumni}</td><td>{t.responden}</td><td>{persen(t.responden, t.alumni)}%</td></tr>)}</tbody>
            </table>
          </div>
          {rekap.saran.length > 0 && (
            <div className="kartu jarak"><h3>Saran dari alumni ({rekap.saran_terisi})</h3>
              <ul>{rekap.saran.map((s, i) => <li key={i}>{s.saran} <small className="catatan">({[s.kompetensi, s.tahun_lulus && `lulus ${s.tahun_lulus}`].filter(Boolean).join(', ')})</small></li>)}</ul>
            </div>
          )}
        </div>
      )}

      {tab === 'daftar' && (
        <div className="jarak">
          <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setHalaman(0) }} aria-label="Status pengisian">
              <option value="belum">Belum mengisi</option><option value="sudah">Sudah mengisi</option><option value="semua">Semua</option>
            </select>
            <input type="search" placeholder="Cari nama atau NISN" value={cari} onChange={(e) => { setCari(e.target.value); setHalaman(0) }} />
            <button className="tombol" onClick={ekspor}>Unduh CSV</button>
          </div>
          {isi && !lihatSaja && (
            <div className="kartu jarak" style={{ maxWidth: 720 }}>
              <h3>Catat jawaban {isi.nama}</h3>
              <p className="catatan">Dicatat petugas dari telepon, WhatsApp, atau kunjungan.{isi.sudah && ' Alumni ini sudah mengisi. Menyimpan akan menggantikan jawaban sebelumnya seluruhnya.'}</p>
              <FormTracer petugas kirim={simpan} sibuk={sibuk} />
              <button className="tombol jarak" onClick={() => setIsi(null)}>Batal</button>
            </div>
          )}
          <div className="tabel-bungkus jarak">
            <table>
              <thead><tr><th>Nama</th><th>NISN</th><th>Lulus</th><th>HP</th><th>Status</th><th>Kegiatan</th><th>Instansi</th><th /></tr></thead>
              <tbody>
                {daftar?.baris.map((b) => (
                  <tr key={b.id}>
                    <td>{b.nama}</td><td>{b.nisn ?? '-'}</td><td>{b.tahun_lulus ?? '-'}</td><td>{b.hp ?? '-'}</td>
                    <td>{b.sudah ? `Sudah (${b.sumber === 'petugas' ? 'petugas' : 'mandiri'}) ${tglJam(b.diperbarui_pada)}` : 'Belum'}</td>
                    <td>{b.status_utama ? label(STATUS_TRACER, b.status_utama) : '-'}</td><td>{b.instansi ?? '-'}</td>
                    <td>{!lihatSaja && <button className="tombol-ikon" onClick={() => { setIsi(b); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>{b.sudah ? 'Ganti' : 'Catat'}</button>}</td>
                  </tr>
                ))}
                {daftar && daftar.baris.length === 0 && <tr><td colSpan={8} className="catatan">Tidak ada alumni.</td></tr>}
              </tbody>
            </table>
          </div>
          {daftar && (
            <div className="aksi" style={{ alignItems: 'center' }}>
              <button className="tombol" disabled={halaman === 0} onClick={() => setHalaman((h) => h - 1)}>Sebelumnya</button>
              <span className="catatan">{daftar.total ? `${halaman * BATAS + 1} sampai ${Math.min((halaman + 1) * BATAS, daftar.total)} dari ${daftar.total}` : '0'}</span>
              <button className="tombol" disabled={(halaman + 1) * BATAS >= daftar.total} onClick={() => setHalaman((h) => h + 1)}>Berikutnya</button>
            </div>
          )}
        </div>
      )}
      <p><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

export default function HubinTracer() {
  return <Gerbang perlu={['hubin.tracer']} judul="Tracer study alumni">{() => <Isi lihatSaja={false} />}</Gerbang>
}
