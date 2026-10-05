// Kehadiran harian per rombel dan rekapnya. Izin yang disetujui mengalahkan isian petugas di hari yang sama.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { panggil } from '../../lib/rpc'
import { unduhCsv } from '../../lib/hubin'
import { STATUS_HADIR, akhirPekan, hariIni, label, tambahHari, type RombelPilih } from '../../lib/kesiswaan'
import Gerbang from './Gerbang'

type Siswa = { pd: string; nama: string; nisn: string | null; no_urut: number | null; status: string | null; dari_izin: boolean; izin_keluar: { jam_keluar: string; jam_kembali: string | null; alasan: string } | null }
type Rekap = { pd: string; nama: string; nisn: string | null; rombel: string; tercatat: number; hadir: number; terlambat: number; sakit: number; izin: number; dispensasi: number; alpa: number }

function Harian({ rombels }: { rombels: RombelPilih[] }) {
  const [rombel, setRombel] = useState(rombels[0]?.id ?? '')
  const [tanggal, setTanggal] = useState(akhirPekan(hariIni()) ? tambahHari(hariIni(), new Date().getDay() === 6 ? -1 : -2) : hariIni())
  const [siswa, setSiswa] = useState<Siswa[]>([])
  const [isian, setIsian] = useState<Record<string, string>>({})
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)

  const muat = useCallback(async () => {
    if (!rombel) return
    try {
      const h = await panggil<{ siswa: Siswa[] }>('kehadiran_rombel', { p_rombel: rombel, p_tanggal: tanggal })
      setSiswa(h.siswa); setIsian({}); setGalat('')
    } catch (e) { setGalat((e as Error).message) }
  }, [rombel, tanggal])
  useEffect(() => { void muat() }, [muat])

  const nilai = (s: Siswa) => isian[s.pd] ?? s.status ?? ''
  const belum = siswa.filter((s) => !nilai(s)).length

  function semuaHadir() {
    setIsian((x) => { const n = { ...x }; for (const s of siswa) if (!s.dari_izin && !(n[s.pd] ?? s.status)) n[s.pd] = 'hadir'; return n })
  }
  async function simpan() {
    const baris = siswa.filter((s) => !s.dari_izin && isian[s.pd]).map((s) => ({ pd: s.pd, status: isian[s.pd] }))
    if (!baris.length) { setGalat('Belum ada perubahan untuk disimpan.'); return }
    setSibuk(true); setGalat(''); setInfo('')
    try { const n = await panggil<number>('kehadiran_simpan', { p_rombel: rombel, p_tanggal: tanggal, p_baris: baris }); setInfo(`${n} siswa tersimpan.`); await muat() }
    catch (e) { setGalat((e as Error).message) } finally { setSibuk(false) }
  }

  return (
    <div>
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
        <select value={rombel} onChange={(e) => setRombel(e.target.value)} aria-label="Rombel">
          {rombels.map((r) => <option key={r.id} value={r.id}>{r.nama} ({r.jumlah})</option>)}
        </select>
        <input type="date" value={tanggal} max={hariIni()} onChange={(e) => setTanggal(e.target.value)} aria-label="Tanggal" />
        <button className="tombol" onClick={semuaHadir}>Tandai sisanya hadir</button>
        <button className="tombol tombol-isi" disabled={sibuk} onClick={simpan}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
      {akhirPekan(tanggal) && <p className="kartu galat">Sabtu dan Minggu bukan hari sekolah, kehadiran tidak dapat disimpan.</p>}
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}
      {belum > 0 && <p className="catatan">{belum} siswa belum terisi. Siswa yang dibiarkan kosong tidak dihitung sebagai hadir atau alpa.</p>}
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>No</th><th>Nama</th><th>Status</th></tr></thead>
          <tbody>
            {siswa.map((s, i) => (
              <tr key={s.pd}>
                <td>{s.no_urut ?? i + 1}</td>
                <td>{s.nama}{s.izin_keluar && <><br /><small className="catatan">Izin keluar {s.izin_keluar.jam_keluar.slice(0, 5)}{s.izin_keluar.jam_kembali && `, kembali ${s.izin_keluar.jam_kembali.slice(0, 5)}`}: {s.izin_keluar.alasan}</small></>}</td>
                <td>
                  {s.dari_izin ? <span><strong>{label(STATUS_HADIR, s.status)}</strong> <small className="catatan">dari izin yang disetujui</small></span> : (
                    <div className="aksi" style={{ marginTop: 0, gap: 4 }}>
                      {STATUS_HADIR.map(([k, n]) => (
                        <button key={k} type="button" aria-pressed={nilai(s) === k} className={nilai(s) === k ? 'tombol tombol-isi' : 'tombol'} style={{ padding: '4px 10px' }} onClick={() => setIsian((x) => ({ ...x, [s.pd]: k }))}>{n}</button>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {siswa.length === 0 && <tr><td colSpan={3} className="catatan">Tidak ada siswa aktif di rombel ini.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RekapTab({ rombels }: { rombels: RombelPilih[] }) {
  const [rombel, setRombel] = useState('')
  const [dari, setDari] = useState(tambahHari(hariIni(), -29))
  const [sampai, setSampai] = useState(hariIni())
  const [data, setData] = useState<Rekap[] | null>(null)
  const [galat, setGalat] = useState('')

  const muat = useCallback(async () => {
    try { setData(await panggil<Rekap[]>('kehadiran_rekap', { p_dari: dari, p_sampai: sampai, p_rombel: rombel || null })); setGalat('') }
    catch (e) { setGalat((e as Error).message) }
  }, [dari, sampai, rombel])
  useEffect(() => { void muat() }, [muat])

  const urut = useMemo(() => [...(data ?? [])].sort((a, b) => b.alpa - a.alpa || b.sakit + b.izin - (a.sakit + a.izin) || a.nama.localeCompare(b.nama)), [data])

  return (
    <div>
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
        <select value={rombel} onChange={(e) => setRombel(e.target.value)} aria-label="Rombel">
          <option value="">Semua rombel saya</option>
          {rombels.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
        </select>
        <input type="date" value={dari} max={sampai} onChange={(e) => setDari(e.target.value)} aria-label="Dari" />
        <input type="date" value={sampai} min={dari} max={hariIni()} onChange={(e) => setSampai(e.target.value)} aria-label="Sampai" />
        <button className="tombol" disabled={!data?.length} onClick={() => data && unduhCsv(`rekap-kehadiran-${dari}-${sampai}`, [
          ['Nama', 'NISN', 'Rombel', 'Hari tercatat', 'Hadir', 'Terlambat', 'Sakit', 'Izin', 'Dispensasi', 'Alpa'],
          ...urut.map((r) => [r.nama, r.nisn, r.rombel, r.tercatat, r.hadir, r.terlambat, r.sakit, r.izin, r.dispensasi, r.alpa]),
        ])}>Unduh CSV</button>
      </div>
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      <p className="catatan">Maksimal 93 hari. Hanya hari yang tercatat yang dihitung; hari tanpa catatan tidak dianggap hadir.</p>
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Nama</th><th>Rombel</th><th>Tercatat</th><th>Hadir</th><th>Terlambat</th><th>Sakit</th><th>Izin</th><th>Dispensasi</th><th>Alpa</th></tr></thead>
          <tbody>
            {urut.map((r) => (
              <tr key={r.pd}><td>{r.nama}</td><td>{r.rombel}</td><td>{r.tercatat}</td><td>{r.hadir}</td><td>{r.terlambat}</td><td>{r.sakit}</td><td>{r.izin}</td><td>{r.dispensasi}</td><td><strong>{r.alpa}</strong></td></tr>
            ))}
            {data && data.length === 0 && <tr><td colSpan={9} className="catatan">Tidak ada data.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Isi({ izin }: { izin: string[] }) {
  const bisaIsi = izin.includes('kesiswaan.izin')
  const [tab, setTab] = useState<'harian' | 'rekap'>(bisaIsi ? 'harian' : 'rekap')
  const [rombels, setRombels] = useState<RombelPilih[] | null>(null)
  const [galat, setGalat] = useState('')
  useEffect(() => { panggil<RombelPilih[]>('kesiswaan_rombel', { p_untuk: bisaIsi ? 'izin' : 'pantau' }).then(setRombels).catch((e: Error) => { setGalat(e.message); setRombels([]) }) }, [bisaIsi])

  return (
    <Halaman judul="Kehadiran harian" lead="Kehadiran per hari sekolah, terpisah dari absensi per pertemuan di LMS. Sumber utama sinyal alpa dan keterlambatan pada dashboard risiko.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      <div className="aksi" style={{ marginTop: 0 }}>
        {bisaIsi && <button className={tab === 'harian' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('harian')}>Isi kehadiran</button>}
        <button className={tab === 'rekap' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('rekap')}>Rekap</button>
      </div>
      <div className="jarak">
        {rombels === null ? <p className="catatan">Memuat rombel...</p> : tab === 'harian' ? <Harian rombels={rombels} /> : <RekapTab rombels={rombels} />}
      </div>
      <p><Link to="/portal/kesiswaan">Kembali ke Kesiswaan</Link></p>
    </Halaman>
  )
}

export default function KehadiranHarian() {
  return <Gerbang perlu={['kesiswaan.izin', 'kesiswaan.pantau']} judul="Kehadiran harian">{(izin) => <Isi izin={izin} />}</Gerbang>
}
