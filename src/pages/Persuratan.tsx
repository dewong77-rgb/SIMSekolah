import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import Pager from '../components/Pager'
import { panggil, tgl, tglJam } from '../lib/rpc'

type Ringkasan = { disposisi_menunggu: number; belum_disposisi: number; boleh_catat: boolean; boleh_baca: boolean }
type BarisSurat = {
  id: string; arah: 'masuk' | 'keluar'; kategori: string; sifat: string; nomor_agenda: string; nomor_surat: string | null
  tanggal_surat: string | null; tanggal_catat: string; pihak: string; perihal: string; status: string
  jml_disposisi: number; disposisi_terbuka: number
}
type Surat = BarisSurat & { ringkasan: string | null; tautan_berkas: string | null }
type Disposisi = {
  id: string; dari_nama: string; ke_nama: string; instruksi: string; urgensi: string; tenggat: string | null
  induk_id: string | null; status: string; tanggapan: string | null; dibuat_pada: string; selesai_pada: string | null; untuk_saya: boolean
}
type Penerima = { id: string; nama: string; jenis: string; jabatan: string | null }
type DisposisiSaya = {
  id: string; surat_id: string; dari_nama: string; instruksi: string; urgensi: string; tenggat: string | null; status: string
  tanggapan: string | null; dibuat_pada: string; perihal: string; nomor_agenda: string; sifat: string; pihak: string; kategori: string; arah: string
}

const statusSurat: Record<string, string> = { baru: 'Baru', didisposisi: 'Didisposisi', selesai: 'Selesai', diarsipkan: 'Diarsipkan' }
const statusDisp: Record<string, string> = { menunggu: 'Menunggu', dibaca: 'Dibaca', dikerjakan: 'Dikerjakan', selesai: 'Selesai' }
const urgensi: Record<string, string> = { biasa: 'Biasa', segera: 'Segera', sangat_segera: 'Sangat segera' }
const kategori = ['permintaan', 'undangan', 'edaran', 'pemberitahuan', 'lainnya']
const nm = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Register surat masuk dan keluar. */
export function RegisterSurat() {
  const [ring, setRing] = useState<Ringkasan | null>(null)
  const [data, setData] = useState<{ total: number; baris: BarisSurat[] } | null>(null)
  const [arah, setArah] = useState('')
  const [status, setStatus] = useState('')
  const [cari, setCari] = useState('')
  const [cariTunda, setCariTunda] = useState('')
  const [hal, setHal] = useState(1)
  const [ukuran, setUkuran] = useState(10)
  const [form, setForm] = useState(false)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [v, setV] = useState({ arah: 'masuk', kategori: 'permintaan', sifat: 'biasa', nomor: '', tanggal: '', pihak: '', perihal: '', ringkasan: '', tautan: '' })

  useEffect(() => { panggil<Ringkasan>('surat_ringkasan').then(setRing).catch((e: Error) => setGalat(e.message)) }, [])
  useEffect(() => { const t = setTimeout(() => { setCari(cariTunda); setHal(1) }, 300); return () => clearTimeout(t) }, [cariTunda])

  const muat = useCallback(async () => {
    try {
      setData(await panggil('surat_daftar', {
        p_arah: arah || null, p_status: status || null, p_cari: cari || null, p_hal: hal, p_ukuran: ukuran === 0 ? 1000 : ukuran,
      }))
    } catch (e) { setGalat((e as Error).message) }
  }, [arah, status, cari, hal, ukuran])
  useEffect(() => { void muat() }, [muat])

  async function catat(e: FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat('')
    try {
      await panggil('surat_catat', {
        p_arah: v.arah, p_kategori: v.kategori, p_sifat: v.sifat, p_nomor_surat: v.nomor || null, p_tanggal_surat: v.tanggal || null,
        p_pihak: v.pihak, p_perihal: v.perihal, p_ringkasan: v.ringkasan || null, p_tautan: v.tautan || null,
      })
      setV({ ...v, nomor: '', tanggal: '', pihak: '', perihal: '', ringkasan: '', tautan: '' })
      setForm(false)
      await muat()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }

  return (
    <Halaman judul="Persuratan" lead="Register surat masuk dan keluar, lengkap dengan disposisi pimpinan.">
      {galat && <p className="catatan" role="alert">Galat: {galat}</p>}
      {ring && ring.belum_disposisi > 0 && <div className="kartu"><strong>{ring.belum_disposisi} surat masuk menunggu disposisi.</strong></div>}
      <div className="aksi jarak">
        <input type="search" placeholder="Cari perihal, pengirim, atau nomor" value={cariTunda} onChange={(e) => setCariTunda(e.target.value)} style={{ minWidth: 260 }} aria-label="Cari" />
        <select value={arah} onChange={(e) => { setArah(e.target.value); setHal(1) }} aria-label="Arah surat">
          <option value="">Masuk dan keluar</option><option value="masuk">Surat masuk</option><option value="keluar">Surat keluar</option>
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setHal(1) }} aria-label="Status">
          <option value="">Semua status</option>
          {Object.entries(statusSurat).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        {ring?.boleh_catat && <button className="tombol tombol-isi" onClick={() => setForm(!form)}>{form ? 'Tutup formulir' : 'Catat surat'}</button>}
        <Link to="/portal/disposisi" className="tombol" style={{ color: 'var(--warna-utama)' }}>Disposisi saya{ring && ring.disposisi_menunggu > 0 ? ` (${ring.disposisi_menunggu})` : ''}</Link>
        <Link to="/portal/surat/draf" className="tombol" style={{ color: 'var(--warna-utama)' }}>Draf surat dan SK</Link>
      </div>

      {form && (
        <form className="kartu form jarak" onSubmit={catat}>
          <div className="grid grid-3">
            <label>Arah<select value={v.arah} onChange={(e) => setV({ ...v, arah: e.target.value })}><option value="masuk">Surat masuk</option><option value="keluar">Surat keluar</option></select></label>
            <label>Jenis<select value={v.kategori} onChange={(e) => setV({ ...v, kategori: e.target.value })}>{kategori.map((k) => <option key={k} value={k}>{nm(k)}</option>)}</select></label>
            <label>Sifat<select value={v.sifat} onChange={(e) => setV({ ...v, sifat: e.target.value })}><option value="biasa">Biasa</option><option value="penting">Penting</option><option value="rahasia">Rahasia</option></select></label>
          </div>
          <div className="grid grid-3">
            <label>Nomor surat<input value={v.nomor} onChange={(e) => setV({ ...v, nomor: e.target.value })} maxLength={100} /></label>
            <label>Tanggal surat<input type="date" value={v.tanggal} onChange={(e) => setV({ ...v, tanggal: e.target.value })} /></label>
            <label>{v.arah === 'masuk' ? 'Pengirim' : 'Tujuan'}<input required value={v.pihak} onChange={(e) => setV({ ...v, pihak: e.target.value })} maxLength={200} /></label>
          </div>
          <label>Perihal<input required value={v.perihal} onChange={(e) => setV({ ...v, perihal: e.target.value })} maxLength={300} /></label>
          <label>Ringkasan isi (opsional)<input value={v.ringkasan} onChange={(e) => setV({ ...v, ringkasan: e.target.value })} maxLength={2000} /></label>
          <label>Tautan berkas (opsional, https)<input type="url" value={v.tautan} onChange={(e) => setV({ ...v, tautan: e.target.value })} placeholder="https://drive.google.com/..." /></label>
          <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan dan beri nomor agenda'}</button></div>
          {v.sifat === 'rahasia' && <p className="catatan">Surat rahasia hanya terlihat oleh pencatat, pimpinan, dan penerima disposisi.</p>}
        </form>
      )}

      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Agenda</th><th>Perihal</th><th>Pengirim atau tujuan</th><th>Status</th><th>Disposisi</th></tr></thead>
          <tbody>
            {!data && <tr><td colSpan={5}>Memuat...</td></tr>}
            {data && data.baris.length === 0 && <tr><td colSpan={5}>Belum ada surat.</td></tr>}
            {(data?.baris ?? []).map((s) => (
              <tr key={s.id}>
                <td>{s.nomor_agenda}<br /><small>{tgl(s.tanggal_catat)}</small></td>
                <td><Link to={`/portal/surat/${s.id}`}>{s.perihal}</Link><br /><small>{nm(s.kategori)}{s.sifat !== 'biasa' ? `, ${s.sifat}` : ''}{s.nomor_surat ? `, ${s.nomor_surat}` : ''}</small></td>
                <td>{s.pihak}</td>
                <td>{statusSurat[s.status]}</td>
                <td>{s.jml_disposisi === 0 ? '-' : `${s.jml_disposisi - s.disposisi_terbuka} dari ${s.jml_disposisi} selesai`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager halaman={hal} total={data?.total ?? 0} ukuran={ukuran} ke={setHal} ubahUkuran={setUkuran} server />
      <p className="catatan jarak"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

function Tanggapan({ d, muat }: { d: { id: string; status: string }; muat: () => Promise<void> }) {
  const [t, setT] = useState('')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  async function kirim(status: string) {
    setSibuk(true); setGalat('')
    try { await panggil('disposisi_tanggapi', { p_id: d.id, p_status: status, p_tanggapan: t || null }); setT(''); await muat() } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  if (d.status === 'selesai') return null
  return (
    <div className="form jarak">
      <label>Tanggapan atau hasil tindak lanjut<input value={t} onChange={(e) => setT(e.target.value)} maxLength={1000} /></label>
      <div className="aksi">
        {d.status === 'menunggu' && <button className="tombol" disabled={sibuk} onClick={() => kirim('dibaca')}>Tandai dibaca</button>}
        {d.status !== 'dikerjakan' && <button className="tombol" disabled={sibuk} onClick={() => kirim('dikerjakan')}>Sedang dikerjakan</button>}
        <button className="tombol tombol-isi" disabled={sibuk || t.trim().length < 3} onClick={() => kirim('selesai')}>Selesai</button>
      </div>
      {galat && <p className="catatan" role="alert">Galat: {galat}</p>}
    </div>
  )
}

function FormDisposisi({ suratId, induk, penerima, selesai }: { suratId: string; induk: string | null; penerima: Penerima[]; selesai: () => Promise<void> }) {
  const [pilih, setPilih] = useState<string[]>([])
  const [cari, setCari] = useState('')
  const [instruksi, setInstruksi] = useState('')
  const [urg, setUrg] = useState('biasa')
  const [tenggat, setTenggat] = useState('')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const k = cari.trim().toLowerCase()
  const kandidat = useMemo(
    () => penerima.filter((p) => !k || p.nama.toLowerCase().includes(k) || (p.jabatan ?? '').toLowerCase().includes(k)).slice(0, 8),
    [penerima, k],
  )
  const tukar = (id: string) => setPilih((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 20 ? [...s, id] : s))
  async function kirim() {
    setSibuk(true); setGalat('')
    try {
      await panggil('disposisi_buat', { p_surat: suratId, p_ke: pilih, p_instruksi: instruksi, p_urgensi: urg, p_tenggat: tenggat || null, p_induk: induk })
      setPilih([]); setInstruksi(''); setTenggat(''); await selesai()
    } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  return (
    <div className="form jarak">
      <label>Cari penerima (nama atau jabatan)<input type="search" value={cari} onChange={(e) => setCari(e.target.value)} /></label>
      <div>
        {kandidat.map((p) => (
          <label key={p.id} style={{ display: 'flex', gap: 8, fontWeight: 400, alignItems: 'center' }}>
            <input type="checkbox" checked={pilih.includes(p.id)} onChange={() => tukar(p.id)} />
            <span>{p.nama}{p.jabatan ? <small> ({p.jabatan})</small> : <small> ({p.jenis})</small>}</span>
          </label>
        ))}
        {kandidat.length === 0 && <p className="catatan">Tidak ada yang cocok.</p>}
      </div>
      {pilih.length > 0 && <p className="catatan">Terpilih: {pilih.map((id) => penerima.find((p) => p.id === id)?.nama).join(', ')}</p>}
      <label>Instruksi<input value={instruksi} onChange={(e) => setInstruksi(e.target.value)} maxLength={1000} placeholder="Contoh: Mohon ditindaklanjuti dan dilaporkan sebelum tenggat" /></label>
      <div className="grid grid-3">
        <label>Urgensi<select value={urg} onChange={(e) => setUrg(e.target.value)}>{Object.entries(urgensi).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></label>
        <label>Tenggat (opsional)<input type="date" value={tenggat} onChange={(e) => setTenggat(e.target.value)} /></label>
      </div>
      <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk || pilih.length === 0 || instruksi.trim().length < 3} onClick={kirim}>{sibuk ? 'Mengirim...' : induk ? 'Teruskan' : 'Kirim disposisi'}</button></div>
      {galat && <p className="catatan" role="alert">Galat: {galat}</p>}
    </div>
  )
}

/** Detail surat beserta jejak disposisinya. */
export function DetailSurat() {
  const { id = '' } = useParams()
  const [d, setD] = useState<{ surat: Surat; disposisi: Disposisi[]; boleh_disposisi: boolean; boleh_teruskan: boolean } | null>(null)
  const [ring, setRing] = useState<Ringkasan | null>(null)
  const [penerima, setPenerima] = useState<Penerima[]>([])
  const [teruskan, setTeruskan] = useState<string | null>(null)
  const [galat, setGalat] = useState('')

  const muat = useCallback(async () => {
    try {
      const r = await panggil<NonNullable<typeof d>>('surat_detail', { p_id: id })
      setD(r)
      setTeruskan(null)
      if ((r.boleh_disposisi || r.boleh_teruskan) && penerima.length === 0) setPenerima(await panggil<Penerima[]>('disposisi_penerima'))
    } catch (e) { setGalat((e as Error).message) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  useEffect(() => { void muat(); panggil<Ringkasan>('surat_ringkasan').then(setRing).catch(() => undefined) }, [muat])

  async function arsip() {
    try { await panggil('surat_arsipkan', { p_id: id }); await muat() } catch (e) { setGalat((e as Error).message) }
  }
  if (galat && !d) return <Halaman judul="Surat"><p className="catatan" role="alert">{galat}</p><Link to="/portal/surat">Kembali ke register</Link></Halaman>
  if (!d) return <Halaman judul="Surat"><p className="catatan">Memuat...</p></Halaman>
  const s = d.surat
  return (
    <Halaman judul={s.perihal} lead={`${s.nomor_agenda}, ${s.arah === 'masuk' ? 'surat masuk' : 'surat keluar'}`}>
      {galat && <p className="catatan" role="alert">Galat: {galat}</p>}
      <div className="kartu">
        <dl className="daftar">
          <dt>Status</dt><dd>{statusSurat[s.status]}</dd>
          <dt>Jenis dan sifat</dt><dd>{nm(s.kategori)}, {s.sifat}</dd>
          <dt>{s.arah === 'masuk' ? 'Pengirim' : 'Tujuan'}</dt><dd>{s.pihak}</dd>
          <dt>Nomor surat</dt><dd>{s.nomor_surat ?? '-'}</dd>
          <dt>Tanggal surat</dt><dd>{tgl(s.tanggal_surat)}</dd>
          <dt>Dicatat</dt><dd>{tgl(s.tanggal_catat)}</dd>
          {s.ringkasan && <><dt>Ringkasan</dt><dd>{s.ringkasan}</dd></>}
          {s.tautan_berkas && <><dt>Berkas</dt><dd><a href={s.tautan_berkas} target="_blank" rel="noopener noreferrer">Buka berkas</a></dd></>}
        </dl>
        {(s.status === 'baru' || s.status === 'selesai') && (ring?.boleh_catat || d.boleh_disposisi) && (
          <div className="aksi jarak"><button className="tombol" onClick={arsip}>Arsipkan</button></div>
        )}
      </div>

      <div className="judul-bagian jarak"><h2>Jejak disposisi</h2></div>
      {d.disposisi.length === 0 && <p className="catatan">Belum ada disposisi.</p>}
      {d.disposisi.map((x) => (
        <div className="kartu jarak" key={x.id} style={x.induk_id ? { marginLeft: 24 } : undefined}>
          <span className="lencana">{statusDisp[x.status]}</span>{' '}
          <strong>{x.dari_nama}</strong> kepada <strong>{x.ke_nama}</strong>{x.induk_id ? <small> (diteruskan)</small> : null}
          <p>{x.instruksi}</p>
          <small>{urgensi[x.urgensi]}{x.tenggat ? `, tenggat ${tgl(x.tenggat)}` : ''}, {tglJam(x.dibuat_pada)}</small>
          {x.tanggapan && <p className="catatan jarak">Tanggapan: {x.tanggapan}{x.selesai_pada ? ` (${tglJam(x.selesai_pada)})` : ''}</p>}
          {x.untuk_saya && <Tanggapan d={x} muat={muat} />}
          {x.untuk_saya && d.boleh_teruskan && x.status !== 'selesai' && (
            <div className="jarak">
              <button className="tombol" onClick={() => setTeruskan(teruskan === x.id ? null : x.id)}>{teruskan === x.id ? 'Batal teruskan' : 'Teruskan'}</button>
              {teruskan === x.id && <FormDisposisi suratId={id} induk={x.id} penerima={penerima} selesai={muat} />}
            </div>
          )}
        </div>
      ))}

      {d.boleh_disposisi && s.status !== 'diarsipkan' && (
        <div className="kartu jarak">
          <h3>Buat disposisi</h3>
          <FormDisposisi suratId={id} induk={null} penerima={penerima} selesai={muat} />
        </div>
      )}
      <p className="catatan jarak"><Link to="/portal/surat">Kembali ke register</Link></p>
    </Halaman>
  )
}

/** Kotak masuk disposisi untuk penerima. */
export function KotakDisposisi() {
  const [daftar, setDaftar] = useState<DisposisiSaya[] | null>(null)
  const [aktif, setAktif] = useState(true)
  const [galat, setGalat] = useState('')
  const muat = useCallback(async () => {
    try { setDaftar(await panggil<DisposisiSaya[]>('disposisi_saya')) } catch (e) { setGalat((e as Error).message) }
  }, [])
  useEffect(() => { void muat() }, [muat])
  const tampil = (daftar ?? []).filter((d) => (aktif ? d.status !== 'selesai' : d.status === 'selesai'))
  return (
    <Halaman judul="Disposisi saya" lead="Instruksi dari pimpinan yang ditujukan kepada Anda.">
      <div className="pilih-peran" role="tablist">
        <button role="tab" aria-selected={aktif} className={aktif ? 'aktif' : ''} onClick={() => setAktif(true)}>Perlu ditindaklanjuti ({(daftar ?? []).filter((d) => d.status !== 'selesai').length})</button>
        <button role="tab" aria-selected={!aktif} className={!aktif ? 'aktif' : ''} onClick={() => setAktif(false)}>Selesai</button>
      </div>
      {galat && <p className="catatan jarak" role="alert">Galat: {galat}</p>}
      {daftar && tampil.length === 0 && <p className="catatan jarak">Tidak ada disposisi.</p>}
      {tampil.map((d) => (
        <div className="kartu jarak" key={d.id}>
          <span className="lencana">{statusDisp[d.status]}</span>{' '}
          {d.urgensi !== 'biasa' && <span className="lencana">{urgensi[d.urgensi]}</span>}
          <h3><Link to={`/portal/surat/${d.surat_id}`}>{d.perihal}</Link></h3>
          <small>{d.nomor_agenda}, {d.pihak}{d.sifat === 'rahasia' ? ', rahasia' : ''}</small>
          <p>{d.instruksi}</p>
          <small>Dari {d.dari_nama}{d.tenggat ? `, tenggat ${tgl(d.tenggat)}` : ''}, {tglJam(d.dibuat_pada)}</small>
          {d.tanggapan && <p className="catatan jarak">Tanggapan: {d.tanggapan}</p>}
          <Tanggapan d={d} muat={muat} />
        </div>
      ))}
      <p className="catatan jarak"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}
