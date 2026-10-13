// Kehadiran harian per rombel dan rekapnya. Izin yang disetujui mengalahkan isian petugas di hari yang sama.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { panggil, tgl } from '../../lib/rpc'
import { unduhCsv } from '../../lib/hubin'
import { PERIODE, STATUS_HADIR, akhirPekan, hariIni, label, rentangPeriode, tambahHari, type Periode, type RombelPilih } from '../../lib/kesiswaan'
import Gerbang from './Gerbang'

type Siswa = { pd: string; nama: string; nisn: string | null; no_urut: number | null; status: string | null; dari_izin: boolean; izin_keluar: { jam_keluar: string; jam_kembali: string | null; alasan: string } | null }

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

type Agregat = { nama: string; nisn?: string | null; rombel?: string; jurusan?: string; siswa: number; tercatat: number; hadir: number; terlambat: number; sakit: number; izin: number; dispensasi: number; alpa: number }
type Kelompok = 'rombel' | 'jurusan' | 'siswa'

const persen = (r: Agregat) => (r.tercatat ? Math.round(((r.hadir + r.terlambat) / r.tercatat) * 1000) / 10 : null)

function RekapTab({ rombels }: { rombels: RombelPilih[] }) {
  const [periode, setPeriode] = useState<Periode>('bulan')
  const [acuan, setAcuan] = useState(hariIni())
  const [kelompok, setKelompok] = useState<Kelompok>('rombel')
  const [rombel, setRombel] = useState('')
  const [data, setData] = useState<{ baris: Agregat[]; hari_kerja: number } | null>(null)
  const [galat, setGalat] = useState('')
  const [dari, sampai] = useMemo(() => rentangPeriode(periode, acuan), [periode, acuan])

  useEffect(() => {
    let batal = false
    setData(null)
    panggil<{ baris: Agregat[]; hari_kerja: number }>('kehadiran_rekap_agregat', { p_dari: dari, p_sampai: sampai, p_kelompok: kelompok, p_rombel: rombel || null })
      .then((x) => { if (!batal) { setData(x); setGalat('') } })
      .catch((e: Error) => { if (!batal) setGalat(e.message) })
    return () => { batal = true }
  }, [dari, sampai, kelompok, rombel])

  const baris = data?.baris ?? []
  const total = useMemo(() => baris.reduce((t, r) => ({ ...t, siswa: t.siswa + r.siswa, tercatat: t.tercatat + r.tercatat, hadir: t.hadir + r.hadir, terlambat: t.terlambat + r.terlambat, sakit: t.sakit + r.sakit, izin: t.izin + r.izin, dispensasi: t.dispensasi + r.dispensasi, alpa: t.alpa + r.alpa }),
    { nama: 'Jumlah', siswa: 0, tercatat: 0, hadir: 0, terlambat: 0, sakit: 0, izin: 0, dispensasi: 0, alpa: 0 } as Agregat), [baris])
  const judulKolom = kelompok === 'rombel' ? 'Kelas' : kelompok === 'jurusan' ? 'Jurusan' : 'Nama'
  const pct = (r: Agregat) => { const x = persen(r); return x === null ? '-' : `${x}%` }

  return (
    <div>
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
        <select value={periode} onChange={(e) => setPeriode(e.target.value as Periode)} aria-label="Periode">
          {PERIODE.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        <input type="date" value={acuan} max={hariIni()} onChange={(e) => e.target.value && setAcuan(e.target.value)} aria-label="Tanggal acuan" />
        <select value={kelompok} onChange={(e) => setKelompok(e.target.value as Kelompok)} aria-label="Kelompokkan per">
          <option value="rombel">Per kelas</option><option value="jurusan">Per jurusan</option><option value="siswa">Per siswa</option>
        </select>
        <select value={rombel} onChange={(e) => setRombel(e.target.value)} aria-label="Rombel">
          <option value="">Semua rombel saya</option>
          {rombels.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
        </select>
        <button className="tombol" disabled={!baris.length} onClick={() => unduhCsv(`rekap-kehadiran-${kelompok}-${dari}-${sampai}`, [
          [judulKolom, ...(kelompok === 'siswa' ? ['NISN'] : []), ...(kelompok !== 'jurusan' ? ['Jurusan'] : []), ...(kelompok === 'siswa' ? ['Kelas'] : []), 'Siswa', 'Hari tercatat', 'Hadir', 'Terlambat', 'Sakit', 'Izin', 'Dispensasi', 'Alpa', '% hadir'],
          ...[...baris, total].map((r) => [r.nama, ...(kelompok === 'siswa' ? [r.nisn] : []), ...(kelompok !== 'jurusan' ? [r.jurusan] : []), ...(kelompok === 'siswa' ? [r.rombel] : []), r.siswa, r.tercatat, r.hadir, r.terlambat, r.sakit, r.izin, r.dispensasi, r.alpa, pct(r)]),
        ])}>Unduh CSV</button>
      </div>
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      <p className="catatan">
        Periode {tgl(dari)} sampai {tgl(sampai)}{data ? `, ${data.hari_kerja} hari kerja` : ''}. Hanya hari yang tercatat yang dihitung; hari tanpa catatan tidak dianggap hadir.
        Persen hadir = (hadir + terlambat) dibagi hari tercatat. Kolom Tercatat adalah jumlah siswa-hari.
      </p>
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>{judulKolom}</th>{kelompok !== 'jurusan' && <th>Jurusan</th>}{kelompok === 'siswa' && <th>Kelas</th>}<th>Siswa</th><th>Tercatat</th><th>Hadir</th><th>Terlambat</th><th>Sakit</th><th>Izin</th><th>Dispensasi</th><th>Alpa</th><th>% hadir</th></tr></thead>
          <tbody>
            {data === null && !galat && <tr><td colSpan={12} className="catatan">Memuat...</td></tr>}
            {baris.map((r, i) => (
              <tr key={`${r.nama}-${i}`}>
                <td>{r.nama}</td>{kelompok !== 'jurusan' && <td>{r.jurusan}</td>}{kelompok === 'siswa' && <td>{r.rombel}</td>}
                <td>{r.siswa}</td><td>{r.tercatat}</td><td>{r.hadir}</td><td>{r.terlambat}</td><td>{r.sakit}</td><td>{r.izin}</td><td>{r.dispensasi}</td><td><strong>{r.alpa}</strong></td><td>{pct(r)}</td>
              </tr>
            ))}
            {data && baris.length === 0 && <tr><td colSpan={12} className="catatan">Tidak ada data.</td></tr>}
            {baris.length > 0 && (
              <tr><td><strong>Jumlah</strong></td>{kelompok !== 'jurusan' && <td />}{kelompok === 'siswa' && <td />}
                <td><strong>{total.siswa}</strong></td><td>{total.tercatat}</td><td>{total.hadir}</td><td>{total.terlambat}</td><td>{total.sakit}</td><td>{total.izin}</td><td>{total.dispensasi}</td><td><strong>{total.alpa}</strong></td><td><strong>{pct(total)}</strong></td></tr>
            )}
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
