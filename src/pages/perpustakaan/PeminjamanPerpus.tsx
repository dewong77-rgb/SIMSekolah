import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { unduhCsv } from '../../lib/hubin'
import { KONDISI, type Eksemplar, type Fisik, type PinjamBaris, type Peminjam } from '../../lib/perpustakaan'
import { panggil, tgl } from '../../lib/rpc'

// Sirkulasi: mencatat peminjaman dan pengembalian buku fisik. Siswa maksimal 3 buku, guru dan staf maksimal 5.

function FormPinjam({ selesai }: { selesai: () => Promise<void> }) {
  const [cari, setCari] = useState('')
  const [hasil, setHasil] = useState<Peminjam[]>([])
  const [orang, setOrang] = useState<Peminjam | null>(null)
  const [judul, setJudul] = useState<Fisik[]>([])
  const [fisik, setFisik] = useState('')
  const [eks, setEks] = useState<Eksemplar[]>([])
  const [eksId, setEksId] = useState('')
  const [hari, setHari] = useState('7')
  const [galat, setGalat] = useState('')
  const [pesan, setPesan] = useState('')
  const [sibuk, setSibuk] = useState(false)

  useEffect(() => { panggil<Fisik[]>('perpus_fisik_daftar', { p_q: null, p_semua: false }).then((d) => setJudul(d.filter((f) => Number(f.tersedia) > 0))).catch(() => undefined) }, [pesan])
  useEffect(() => {
    if (orang || cari.trim().length < 3) { setHasil([]); return }
    const t = window.setTimeout(() => { panggil<Peminjam[]>('perpus_peminjam_cari', { p_q: cari }).then(setHasil).catch(() => setHasil([])) }, 300)
    return () => window.clearTimeout(t)
  }, [cari, orang])
  useEffect(() => {
    setEksId(''); setEks([])
    if (!fisik) return
    panggil<Eksemplar[]>('perpus_eksemplar_daftar', { p_fisik: fisik }).then((d) => {
      const ada = d.filter((x) => x.status === 'tersedia' && x.kondisi !== 'rusak_berat'); setEks(ada); setEksId(ada[0]?.id ?? '')
    }).catch(() => undefined)
  }, [fisik, pesan])

  async function kirim(e: FormEvent) {
    e.preventDefault(); if (!orang || !eksId) return
    setGalat(''); setPesan(''); setSibuk(true)
    try {
      await panggil('perpus_pinjam_catat', { p_eksemplar: eksId, p_tipe: orang.tipe, p_orang: orang.id, p_hari: Number(hari) })
      setPesan(`Tercatat: ${orang.nama} meminjam ${judul.find((j) => j.id === fisik)?.judul ?? 'buku'} (${eks.find((x) => x.id === eksId)?.nomor_induk}).`)
      setOrang(null); setCari(''); setFisik(''); await selesai()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  return (
    <form className="kartu form jarak" onSubmit={kirim}>
      <h3>Catat peminjaman</h3>
      {orang
        ? <div className="aksi" style={{ marginTop: 0 }}><span style={{ flex: 1 }}><strong>{orang.nama}</strong> <small>{orang.ket}{orang.dipinjam ? ` · sedang meminjam ${orang.dipinjam}` : ''}</small></span><button type="button" className="tombol" onClick={() => setOrang(null)}>Ganti peminjam</button></div>
        : (
          <label>Cari peminjam (siswa aktif atau guru dan staf)
            <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Ketik minimal 3 huruf nama atau NISN" />
          </label>
        )}
      {!orang && hasil.map((h) => (
        <div key={`${h.tipe}-${h.id}`} className="aksi" style={{ marginTop: 0 }}>
          <span style={{ flex: 1 }}>{h.nama} <small>({h.tipe === 'siswa' ? 'Siswa' : 'PTK'}{h.ket ? ` · ${h.ket}` : ''}{h.dipinjam ? ` · meminjam ${h.dipinjam}` : ''})</small></span>
          <button type="button" className="tombol" onClick={() => setOrang(h)}>Pilih</button>
        </div>
      ))}
      <div className="grid grid-2">
        <label>Judul (hanya yang masih tersedia)
          <select value={fisik} onChange={(e) => setFisik(e.target.value)}>
            <option value="">Pilih judul</option>
            {judul.map((j) => <option key={j.id} value={j.id}>{j.judul} (tersedia {j.tersedia})</option>)}
          </select>
        </label>
        <label>Eksemplar
          <select value={eksId} onChange={(e) => setEksId(e.target.value)} disabled={!eks.length}>
            {eks.map((x) => <option key={x.id} value={x.id}>{x.nomor_induk}{x.kondisi !== 'baik' ? ` (${x.kondisi.replace('_', ' ')})` : ''}</option>)}
          </select>
        </label>
        <label>Lama pinjam (hari)<input inputMode="numeric" value={hari} onChange={(e) => setHari(e.target.value.replace(/\D/g, ''))} /></label>
      </div>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      {pesan && <p className="catatan" role="status"><strong>{pesan}</strong></p>}
      <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk || !orang || !eksId || !Number(hari)}>{sibuk ? 'Mencatat...' : 'Catat peminjaman'}</button></div>
    </form>
  )
}

export default function PeminjamanPerpus() {
  const [daftar, setDaftar] = useState<PinjamBaris[] | null>(null)
  const [galat, setGalat] = useState('')
  const [semua, setSemua] = useState(false)
  const [kondisi, setKondisi] = useState<Record<string, string>>({})
  const [cari, setCari] = useState('')
  const muat = useCallback(async () => {
    try { setDaftar(await panggil<PinjamBaris[]>('perpus_pinjam_daftar', { p_semua: semua })); setGalat('') } catch (e) { setGalat((e as Error).message) }
  }, [semua])
  useEffect(() => { void muat() }, [muat])

  async function kembali(p: PinjamBaris) {
    const k = kondisi[p.id] ?? 'baik'
    if (k === 'hilang' && !window.confirm('Tandai buku ini hilang? Eksemplar berstatus hilang dan tidak bisa dipinjam.')) return
    setGalat('')
    try { await panggil('perpus_kembali_catat', { p_pinjam: p.id, p_kondisi: k }); await muat() } catch (e) { setGalat((e as Error).message) }
  }
  async function perpanjang(p: PinjamBaris) {
    setGalat('')
    try { await panggil('perpus_pinjam_perpanjang', { p_pinjam: p.id, p_hari: 7 }); await muat() } catch (e) { setGalat((e as Error).message) }
  }
  const terbuka = (daftar ?? []).filter((p) => !p.kembali_pada)
  const terlambat = terbuka.filter((p) => p.terlambat)
  const kata = cari.trim().toLowerCase()
  const tampil = (daftar ?? []).filter((p) => !kata || [p.peminjam, p.kelas, p.judul, p.nomor_induk].some((x) => x?.toLowerCase().includes(kata)))

  function unduh() {
    unduhCsv('peminjaman-perpustakaan', [
      ['Peminjam', 'Kelas', 'Judul', 'Nomor induk', 'Tanggal pinjam', 'Jatuh tempo', 'Dikembalikan', 'Kondisi kembali', 'Hari terlambat'],
      ...(daftar ?? []).map((p) => [p.peminjam, p.kelas, p.judul, p.nomor_induk, p.pinjam_pada, p.jatuh_tempo, p.kembali_pada, p.kondisi_kembali, p.hari_terlambat]),
    ])
  }

  return (
    <div className="jarak">
      <div className="lencana-baris">
        <span className="lencana">{terbuka.length} sedang dipinjam</span>
        <span className="lencana" style={terlambat.length ? { background: '#fde3e3', color: '#8a1f1f' } : undefined}>{terlambat.length} terlambat</span>
      </div>
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      <FormPinjam selesai={muat} />

      <div className="form jarak" style={{ gridTemplateColumns: '2fr auto auto', alignItems: 'end' }}>
        <label>Cari peminjam, kelas, atau judul<input type="search" value={cari} onChange={(e) => setCari(e.target.value)} /></label>
        <label className="baris-centang"><input type="checkbox" checked={semua} onChange={(e) => setSemua(e.target.checked)} /> Termasuk riwayat</label>
        <button type="button" className="tombol" onClick={unduh} disabled={!daftar}>Unduh CSV</button>
      </div>
      <div className="tabel-bungkus"><table>
        <thead><tr><th>Peminjam</th><th>Buku</th><th>Dipinjam</th><th>Jatuh tempo</th><th>Aksi</th></tr></thead>
        <tbody>
          {!daftar && <tr><td colSpan={5}>Memuat...</td></tr>}
          {daftar && tampil.length === 0 && <tr><td colSpan={5} className="catatan">{semua ? 'Belum ada riwayat peminjaman.' : 'Tidak ada buku yang sedang dipinjam.'}</td></tr>}
          {tampil.map((p) => (
            <tr key={p.id}>
              <td>{p.peminjam}<br /><small>{p.tipe === 'siswa' ? (p.kelas ?? 'Siswa') : 'Guru atau staf'}</small></td>
              <td>{p.judul}<br /><small>{p.nomor_induk}</small></td>
              <td>{tgl(p.pinjam_pada)}</td>
              <td>
                {p.kembali_pada
                  ? <span className="status status-selesai">Kembali {tgl(p.kembali_pada)}{p.kondisi_kembali && p.kondisi_kembali !== 'baik' ? ` (${p.kondisi_kembali.replace('_', ' ')})` : ''}</span>
                  : <span className={`status ${p.terlambat ? 'status-ditolak' : 'status-menunggu'}`}>{tgl(p.jatuh_tempo)}{p.terlambat ? ` · terlambat ${p.hari_terlambat} hari` : ''}</span>}
              </td>
              <td>
                {!p.kembali_pada && (
                  <div className="aksi" style={{ marginTop: 0 }}>
                    <select value={kondisi[p.id] ?? 'baik'} onChange={(e) => setKondisi({ ...kondisi, [p.id]: e.target.value })} aria-label={`Kondisi saat kembali: ${p.judul}`}>
                      {KONDISI.map(([k, n]) => <option key={k} value={k}>{n}</option>)}<option value="hilang">Hilang</option>
                    </select>
                    <button type="button" className="tombol tombol-isi" onClick={() => void kembali(p)}>Kembalikan</button>
                    <button type="button" className="tombol" onClick={() => void perpanjang(p)}>Perpanjang 7 hari</button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  )
}
