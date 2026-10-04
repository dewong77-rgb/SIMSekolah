import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import Pager from '../components/Pager'
import { panggil, tgl } from '../lib/rpc'
import { jam, kategoriTamu, tujuanTamu, type Kunjungan } from '../lib/tamu'

type Ringkasan = { boleh_catat: boolean; boleh_baca: boolean; boleh_kode: boolean; di_sekolah: number; kode_gerbang: string | null }
type Daftar = { total: number; baris: Kunjungan[]; dari: string; sampai: string }
type Hitung = { kunci: string; n: number }
type Rekap = { kunjungan: number; orang: number; per_kategori: Hitung[]; per_tujuan: Hitung[]; per_asal: Hitung[]; per_hari: Hitung[] }

const hariIni = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)
const geser = (hari: number) => new Date(Date.now() + 7 * 3600e3 - hari * 86400e3).toISOString().slice(0, 10)
const kosong = { nama: '', asal: '', kategori: 'orang_tua', tujuan: 'bertemu_guru', bertemu: '', keperluan: '', jumlah: 1, telepon: '' }

type Tab = 'hari' | 'riwayat' | 'rekap' | 'gerbang'

export default function BukuTamuPortal() {
  const [ring, setRing] = useState<Ringkasan | null>(null)
  const [tab, setTab] = useState<Tab>('hari')
  const [galat, setGalat] = useState('')
  const muatRing = useCallback(() => { panggil<Ringkasan>('tamu_ringkasan').then(setRing).catch((e: Error) => setGalat(e.message)) }, [])
  useEffect(() => { muatRing() }, [muatRing])

  if (!ring) return <Halaman judul="Buku tamu">{galat ? <p className="catatan galat" role="alert">{galat}</p> : <p className="catatan">Memuat...</p>}</Halaman>
  if (!ring.boleh_catat && !ring.boleh_baca) {
    return <Halaman judul="Buku tamu"><p className="catatan">Anda belum memiliki penugasan untuk buku tamu. Hubungi super admin.</p></Halaman>
  }
  const tabs: [Tab, string][] = [['hari', 'Hari ini']]
  if (ring.boleh_baca) tabs.push(['riwayat', 'Riwayat'], ['rekap', 'Rekap'])
  tabs.push(['gerbang', 'Kode QR gerbang'])

  return (
    <Halaman judul="Buku tamu" lead={`${ring.di_sekolah} kunjungan masih tercatat di sekolah hari ini.`}>
      <div className="pilih-peran" role="tablist">
        {tabs.map(([k, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'aktif' : ''} onClick={() => setTab(k)}>{n}</button>
        ))}
      </div>
      {tab === 'hari' && <HariIni boleh={ring.boleh_catat} berubah={muatRing} />}
      {tab === 'riwayat' && <Riwayat />}
      {tab === 'rekap' && <RekapTamu />}
      {tab === 'gerbang' && <Gerbang ring={ring} berubah={muatRing} />}
      <p className="catatan jarak"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

function HariIni({ boleh, berubah }: { boleh: boolean; berubah: () => void }) {
  const [d, setD] = useState<Daftar | null>(null)
  const [form, setForm] = useState(false)
  const [v, setV] = useState(kosong)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [status, setStatus] = useState('')
  const [cari, setCari] = useState('')
  const [hal, setHal] = useState(1)
  const [ukuran, setUkuran] = useState(20)

  const muat = useCallback(async () => {
    try {
      setD(await panggil<Daftar>('tamu_daftar', { p_cari: cari || null, p_status: status || null, p_hal: hal, p_ukuran: ukuran === 0 ? 1000 : ukuran }))
    } catch (e) { setGalat((e as Error).message) }
  }, [cari, status, hal, ukuran])
  useEffect(() => { const t = setTimeout(() => { void muat() }, 250); return () => clearTimeout(t) }, [muat])

  async function catat(e: FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat('')
    try {
      await panggil('tamu_catat', {
        p_nama: v.nama, p_asal: v.asal, p_kategori: v.kategori, p_tujuan: v.tujuan, p_keperluan: v.keperluan || null,
        p_bertemu: v.bertemu || null, p_jumlah: v.jumlah, p_telepon: v.telepon || null,
      })
      setV(kosong); setForm(false); await muat(); berubah()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  async function pulang(id: string) {
    try { await panggil('tamu_pulang', { p_id: id }); await muat(); berubah() } catch (er) { setGalat((er as Error).message) }
  }

  return (
    <>
      {galat && <p className="catatan galat jarak" role="alert">Galat: {galat}</p>}
      <div className="aksi jarak">
        <input type="search" placeholder="Cari nama, asal, atau yang dituju" value={cari} onChange={(e) => { setCari(e.target.value); setHal(1) }} style={{ minWidth: 260 }} aria-label="Cari" />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setHal(1) }} aria-label="Status">
          <option value="">Semua</option><option value="di_sekolah">Masih di sekolah</option><option value="pulang">Sudah pulang</option>
        </select>
        {boleh && <button className="tombol tombol-isi" onClick={() => setForm(!form)}>{form ? 'Tutup formulir' : 'Catat tamu'}</button>}
      </div>
      {form && (
        <form className="kartu form jarak" onSubmit={catat}>
          <div className="grid grid-2">
            <label>Nama lengkap<input required value={v.nama} onChange={(e) => setV({ ...v, nama: e.target.value })} maxLength={120} /></label>
            <label>Asal instansi atau alamat<input required value={v.asal} onChange={(e) => setV({ ...v, asal: e.target.value })} maxLength={200} /></label>
          </div>
          <div className="grid grid-2">
            <label>Kategori<select value={v.kategori} onChange={(e) => setV({ ...v, kategori: e.target.value })}>{Object.entries(kategoriTamu).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
            <label>Tujuan<select value={v.tujuan} onChange={(e) => setV({ ...v, tujuan: e.target.value })}>{Object.entries(tujuanTamu).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          </div>
          <div className="grid grid-3">
            <label>Bertemu dengan<input value={v.bertemu} onChange={(e) => setV({ ...v, bertemu: e.target.value })} maxLength={150} /></label>
            <label>Jumlah orang<input type="number" min={1} max={200} value={v.jumlah} onChange={(e) => setV({ ...v, jumlah: Math.max(1, Number(e.target.value) || 1) })} /></label>
            <label>Nomor HP (opsional)<input type="tel" value={v.telepon} onChange={(e) => setV({ ...v, telepon: e.target.value })} maxLength={20} /></label>
          </div>
          <label>Keperluan (opsional)<input value={v.keperluan} onChange={(e) => setV({ ...v, keperluan: e.target.value })} maxLength={500} /></label>
          <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button></div>
        </form>
      )}
      <Tabel baris={d?.baris ?? null} aksi={boleh ? pulang : undefined} />
      <Pager halaman={hal} total={d?.total ?? 0} ukuran={ukuran} ke={setHal} ubahUkuran={setUkuran} server />
    </>
  )
}

function Tabel({ baris, aksi }: { baris: Kunjungan[] | null; aksi?: (id: string) => void }) {
  return (
    <div className="tabel-bungkus jarak">
      <table>
        <thead><tr><th>Waktu</th><th>Nama dan asal</th><th>Tujuan</th><th>Bertemu</th><th>Status</th></tr></thead>
        <tbody>
          {!baris && <tr><td colSpan={5}>Memuat...</td></tr>}
          {baris && baris.length === 0 && <tr><td colSpan={5}>Belum ada tamu.</td></tr>}
          {(baris ?? []).map((t) => (
            <tr key={t.id}>
              <td>{jam(t.jam_datang)}<br /><small>{tgl(t.tanggal)}</small></td>
              <td><strong>{t.nama}</strong>{t.jumlah > 1 ? ` (${t.jumlah} orang)` : ''}<br /><small>{t.asal}, {kategoriTamu[t.kategori]}</small>{t.telepon && <><br /><small>{t.telepon}</small></>}</td>
              <td>{tujuanTamu[t.tujuan]}{t.keperluan && <><br /><small>{t.keperluan}</small></>}</td>
              <td>{t.bertemu ?? '-'}<br /><small>{t.sumber === 'mandiri' ? 'Isi mandiri' : `Dicatat ${t.dicatat_nama ?? 'petugas'}`}</small></td>
              <td>
                {t.jam_pulang ? `Pulang ${jam(t.jam_pulang)}` : aksi ? <button className="tombol" onClick={() => aksi(t.id)}>Catat pulang</button> : 'Di sekolah'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Riwayat() {
  const [dari, setDari] = useState(geser(30))
  const [sampai, setSampai] = useState(hariIni())
  const [cari, setCari] = useState('')
  const [hal, setHal] = useState(1)
  const [ukuran, setUkuran] = useState(20)
  const [d, setD] = useState<Daftar | null>(null)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      panggil<Daftar>('tamu_daftar', { p_dari: dari, p_sampai: sampai, p_cari: cari || null, p_hal: hal, p_ukuran: ukuran === 0 ? 1000 : ukuran })
        .then((r) => { setD(r); setGalat('') }).catch((e: Error) => setGalat(e.message))
    }, 250)
    return () => clearTimeout(t)
  }, [dari, sampai, cari, hal, ukuran])

  async function unduh() {
    setSibuk(true)
    try {
      const r = await panggil<Daftar>('tamu_daftar', { p_dari: dari, p_sampai: sampai, p_cari: cari || null, p_hal: 1, p_ukuran: 1000 })
      const { default: ExcelJS } = await import('exceljs')
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Buku tamu')
      const kepala = ['Tanggal', 'Jam datang', 'Jam pulang', 'Nama', 'Jumlah', 'Asal', 'Kategori', 'Tujuan', 'Bertemu', 'Keperluan', 'Telepon', 'Sumber']
      ws.addRow(kepala)
      for (const t of r.baris) {
        ws.addRow([t.tanggal, jam(t.jam_datang), t.jam_pulang ? jam(t.jam_pulang) : '', t.nama, t.jumlah, t.asal, kategoriTamu[t.kategori], tujuanTamu[t.tujuan],
          t.bertemu ?? '', t.keperluan ?? '', t.telepon ?? '', t.sumber === 'mandiri' ? 'Mandiri' : 'Petugas'])
      }
      const garis = { style: 'thin' as const, color: { argb: 'FFCCCCCC' } }
      ws.eachRow((row, n) => {
        row.eachCell((c) => {
          c.font = n === 1 ? { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } } : { name: 'Calibri', size: 10 }
          if (n === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A4A4A' } }
          c.border = { top: garis, bottom: garis }
          c.alignment = { vertical: 'top', wrapText: true }
        })
      })
      const lebar = [12, 11, 11, 24, 8, 30, 26, 34, 22, 30, 16, 10]
      lebar.forEach((w, i) => { ws.getColumn(i + 1).width = w })
      ws.views = [{ state: 'frozen', ySplit: 1 }]
      const buf = await wb.xlsx.writeBuffer()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      a.download = `buku-tamu-${dari}-sd-${sampai}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }

  return (
    <>
      {galat && <p className="catatan galat jarak" role="alert">Galat: {galat}</p>}
      <div className="aksi jarak" style={{ alignItems: 'end' }}>
        <label className="catatan">Dari<br /><input type="date" value={dari} onChange={(e) => { setDari(e.target.value); setHal(1) }} /></label>
        <label className="catatan">Sampai<br /><input type="date" value={sampai} onChange={(e) => { setSampai(e.target.value); setHal(1) }} /></label>
        <input type="search" placeholder="Cari nama, asal, atau yang dituju" value={cari} onChange={(e) => { setCari(e.target.value); setHal(1) }} style={{ minWidth: 240 }} aria-label="Cari" />
        <button className="tombol" onClick={unduh} disabled={sibuk || !d || d.total === 0}>{sibuk ? 'Menyiapkan...' : 'Unduh Excel'}</button>
      </div>
      <Tabel baris={d?.baris ?? null} />
      <Pager halaman={hal} total={d?.total ?? 0} ukuran={ukuran} ke={setHal} ubahUkuran={setUkuran} server />
      <p className="catatan">Unduhan Excel memuat paling banyak 1.000 baris sesuai rentang dan pencarian.</p>
    </>
  )
}

function Batang({ judul, data, nama }: { judul: string; data: Hitung[]; nama?: Record<string, string> }) {
  const maks = Math.max(...data.map((x) => x.n), 1)
  return (
    <div className="kartu">
      <h3>{judul}</h3>
      {data.length === 0 && <p className="catatan">Belum ada data.</p>}
      {data.map((x) => (
        <div key={x.kunci} style={{ margin: '8px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{nama?.[x.kunci] ?? x.kunci}</span><strong>{x.n}</strong></div>
          <div style={{ height: 6, background: '#e8ecf2', borderRadius: 3 }}><div style={{ height: 6, width: `${(x.n / maks) * 100}%`, background: 'var(--warna-utama, #1a3e6f)', borderRadius: 3 }} /></div>
        </div>
      ))}
    </div>
  )
}

function RekapTamu() {
  const [dari, setDari] = useState(geser(30))
  const [sampai, setSampai] = useState(hariIni())
  const [r, setR] = useState<Rekap | null>(null)
  const [galat, setGalat] = useState('')
  useEffect(() => {
    panggil<Rekap>('tamu_rekap', { p_dari: dari, p_sampai: sampai }).then((x) => { setR(x); setGalat('') }).catch((e: Error) => setGalat(e.message))
  }, [dari, sampai])
  return (
    <>
      <div className="aksi jarak" style={{ alignItems: 'end' }}>
        <label className="catatan">Dari<br /><input type="date" value={dari} onChange={(e) => setDari(e.target.value)} /></label>
        <label className="catatan">Sampai<br /><input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} /></label>
      </div>
      {galat && <p className="catatan galat jarak" role="alert">{galat}</p>}
      {r && (
        <>
          <p className="jarak"><strong>{r.kunjungan.toLocaleString('id-ID')}</strong> kunjungan, <strong>{Number(r.orang).toLocaleString('id-ID')}</strong> orang, rata-rata{' '}
            <strong>{r.per_hari.length ? (r.kunjungan / r.per_hari.length).toLocaleString('id-ID', { maximumFractionDigits: 1 }) : 0}</strong> kunjungan per hari ada tamu.</p>
          <div className="grid grid-2">
            <Batang judul="Tamu dari mana" data={r.per_asal} />
            <Batang judul="Kategori tamu" data={r.per_kategori} nama={kategoriTamu} />
            <Batang judul="Tujuan kunjungan" data={r.per_tujuan} nama={tujuanTamu} />
          </div>
        </>
      )}
    </>
  )
}

function Gerbang({ ring, berubah }: { ring: Ringkasan; berubah: () => void }) {
  const [qr, setQr] = useState('')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const url = ring.kode_gerbang ? `${window.location.origin}/buku-tamu?k=${ring.kode_gerbang}` : ''
  useEffect(() => {
    if (!url) { setQr(''); return }
    import('qrcode').then((m) => m.toDataURL(url, { width: 320, margin: 2 })).then(setQr).catch(() => setQr(''))
  }, [url])
  async function ganti() {
    if (!window.confirm('Ganti kode? QR yang sudah dicetak tidak berlaku lagi dan harus dicetak ulang.')) return
    setSibuk(true); setGalat('')
    try { await panggil('tamu_kode_ganti'); berubah() } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  return (
    <div className="kartu jarak">
      <h3>Kode QR untuk isian mandiri</h3>
      <p>Cetak dan tempel di pos jaga atau meja piket. Tamu memindai, mengisi sendiri, tanpa akun.</p>
      {qr ? <img src={qr} alt="Kode QR buku tamu" width={240} height={240} /> : <p className="catatan">Kode belum tersedia.</p>}
      {url && <p className="catatan" style={{ wordBreak: 'break-all' }}>{url}</p>}
      <div className="aksi">
        {qr && <a className="tombol" href={qr} download="qr-buku-tamu.png">Unduh gambar QR</a>}
        {ring.boleh_kode && <button className="tombol" onClick={ganti} disabled={sibuk}>Ganti kode</button>}
      </div>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
    </div>
  )
}
