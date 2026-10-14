// Kehadiran harian per rombel dan rekapnya. Izin yang disetujui mengalahkan isian petugas di hari yang sama.
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { panggil, tgl, tglJam } from '../../lib/rpc'
import { unduhCsv } from '../../lib/hubin'
import { PERIODE, STATUS_HADIR, akhirPekan, hariIni, label, rentangPeriode, tambahHari, type Periode, type RombelPilih } from '../../lib/kesiswaan'
import Gerbang from './Gerbang'

type Siswa = { pd: string; nama: string; nisn: string | null; no_urut: number | null; status: string | null; dari_izin: boolean; izin_keluar: { jam_keluar: string; jam_kembali: string | null; alasan: string } | null }

type Lompat = { rombel: string; tanggal: string }

function Harian({ rombels, awal }: { rombels: RombelPilih[]; awal: Lompat | null }) {
  const [rombel, setRombel] = useState(awal?.rombel ?? rombels[0]?.id ?? '')
  const [tanggal, setTanggal] = useState(awal?.tanggal ?? (akhirPekan(hariIni()) ? tambahHari(hariIni(), new Date().getDay() === 6 ? -1 : -2) : hariIni()))
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

type Kelengkapan = { awal: string; hari_ini: string; baris: { id: string; nama: string; jumlah: number; hari: { tgl: string; terisi: number }[] }[] }
const NAMA_HARI = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum']
const BATAS_HARI = 7

/** Matriks rombel x hari (Senin sampai Jumat): mana yang sudah, sebagian, atau belum terisi. Tenggat pengisian satu minggu. */
function KelengkapanTab({ pilih, bisaIsi }: { pilih: (l: Lompat) => void; bisaIsi: boolean }) {
  const [awal, setAwal] = useState(hariIni())
  const [data, setData] = useState<Kelengkapan | null>(null)
  const [galat, setGalat] = useState('')
  useEffect(() => {
    let batal = false
    setData(null)
    panggil<Kelengkapan>('kehadiran_kelengkapan', { p_awal: awal }).then((x) => { if (!batal) { setData(x); setGalat('') } }).catch((e: Error) => { if (!batal) setGalat(e.message) })
    return () => { batal = true }
  }, [awal])

  const hariIniIso = data?.hari_ini ?? hariIni()
  // Hanya hari yang sudah lewat atau hari ini yang dinilai.
  const dinilai = (t: string) => t <= hariIniIso
  const lewatBatas = (t: string) => t < tambahHari(hariIniIso, -BATAS_HARI)
  const rekap = data ? data.baris.flatMap((r) => r.hari.filter((h) => dinilai(h.tgl)).map((h) => ({ nama: r.nama, tgl: h.tgl, kurang: r.jumlah - h.terisi, jumlah: r.jumlah }))) : []
  const kosong = rekap.filter((x) => x.kurang > 0)
  const terlambat = kosong.filter((x) => lewatBatas(x.tgl)).length

  return (
    <div>
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
        <button className="tombol" onClick={() => setAwal(tambahHari(data?.awal ?? awal, -7))}>Minggu sebelumnya</button>
        <strong>{data ? `${tgl(data.awal)} sampai ${tgl(tambahHari(data.awal, 4))}` : '...'}</strong>
        <button className="tombol" disabled={!data || tambahHari(data.awal, 7) > hariIniIso} onClick={() => setAwal(tambahHari(data?.awal ?? awal, 7))}>Minggu berikutnya</button>
      </div>
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {data && <p className="catatan">
        {kosong.length === 0 ? 'Semua rombel sudah terisi untuk hari yang telah berjalan.' : `${kosong.length} kelas-hari belum lengkap${terlambat ? `, ${terlambat} di antaranya melewati batas ${BATAS_HARI} hari` : ''}.`}
        {' '}Tenggat pengisian satu minggu; idealnya setiap hari. Hari libur nasional belum dikecualikan: abaikan sel pada hari libur.
      </p>}
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Kelas</th><th>Siswa</th>{NAMA_HARI.map((h, i) => <th key={h}>{h}{data ? ` ${new Date(tambahHari(data.awal, i) + 'T00:00:00').getDate()}` : ''}</th>)}</tr></thead>
          <tbody>
            {!data && !galat && <tr><td colSpan={7} className="catatan">Memuat...</td></tr>}
            {data?.baris.map((r) => (
              <tr key={r.id}>
                <td>{r.nama}</td><td>{r.jumlah}</td>
                {r.hari.map((h) => {
                  if (!dinilai(h.tgl)) return <td key={h.tgl} className="catatan">-</td>
                  const kurang = r.jumlah - h.terisi
                  const teks = kurang <= 0 ? '✓ Lengkap' : h.terisi === 0 ? 'Belum' : `Kurang ${kurang}`
                  const gaya = kurang <= 0 ? undefined : { fontWeight: 700, textDecoration: lewatBatas(h.tgl) ? 'underline' : undefined }
                  return (
                    <td key={h.tgl}>
                      {kurang > 0 && bisaIsi
                        ? <button className="tombol" style={{ padding: '2px 8px', ...gaya }} onClick={() => pilih({ rombel: r.id, tanggal: h.tgl })} title={lewatBatas(h.tgl) ? 'Melewati batas satu minggu' : 'Isi kehadiran'}>{teks}</button>
                        : <span style={gaya}>{teks}</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type BarisKoreksi = { pd: string; nama: string; nisn: string | null; rombel_id: string; rombel: string; tanggal: string; status: string; dari_izin: boolean; koreksi: number }
type Riwayat = { id: string; nama: string; rombel: string | null; tanggal: string; dari: string | null; ke: string; alasan: string; dikonfirmasi_oleh: string; dicatat_nama: string | null; dicatat_pada: string }

function FormKoreksi({ b, selesai }: { b: BarisKoreksi; selesai: (pesan: string) => void }) {
  const [baru, setBaru] = useState('')
  const [alasan, setAlasan] = useState('')
  const [konf, setKonf] = useState('')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  async function simpan() {
    if (!baru) return setGalat('Pilih status yang benar.')
    setSibuk(true); setGalat('')
    try {
      const r = await panggil<{ pemanggilan_terjadwal: number }>('kehadiran_koreksi', { p_pd: b.pd, p_tanggal: b.tanggal, p_status: baru, p_alasan: alasan, p_konfirmasi: konf })
      selesai(`${b.nama}, ${tgl(b.tanggal)}: ${label(STATUS_HADIR, b.status)} menjadi ${label(STATUS_HADIR, baru)}.${r.pemanggilan_terjadwal > 0 ? ` Siswa ini punya ${r.pemanggilan_terjadwal} jadwal pemanggilan orang tua yang menunggu; periksa di menu Pemanggilan orang tua apakah masih perlu.` : ''}`)
    } catch (e) { setGalat((e as Error).message) } finally { setSibuk(false) }
  }
  return (
    <div className="jarak">
      <div className="aksi" style={{ marginTop: 0, gap: 4 }} role="group" aria-label="Status yang benar">
        {STATUS_HADIR.filter(([k]) => k !== b.status).map(([k, n]) => (
          <button key={k} type="button" aria-pressed={baru === k} className={baru === k ? 'tombol tombol-isi' : 'tombol'} style={{ padding: '4px 10px' }} onClick={() => setBaru(k)}>{n}</button>
        ))}
      </div>
      <input style={{ width: '100%', marginTop: 6 }} maxLength={300} placeholder="Alasan koreksi (wajib), mis. surat sakit menyusul" value={alasan} onChange={(e) => setAlasan(e.target.value)} aria-label="Alasan koreksi" />
      <input style={{ width: '100%', marginTop: 6 }} maxLength={100} placeholder="Dikonfirmasi oleh (wajib): nama wali kelas atau guru piket" value={konf} onChange={(e) => setKonf(e.target.value)} aria-label="Dikonfirmasi oleh" />
      {galat && <p className="galat" role="alert">{galat}</p>}
      <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk} onClick={simpan}>{sibuk ? 'Menyimpan...' : 'Simpan koreksi'}</button></div>
    </div>
  )
}

/** Koreksi status yang keliru, mis. alpa yang ternyata sakit atau terlambat. Wajib beralasan dan menyebut pengonfirmasi; riwayat tersimpan. */
function KoreksiTab({ rombels }: { rombels: RombelPilih[] }) {
  const [dari, setDari] = useState(tambahHari(hariIni(), -30))
  const [sampai, setSampai] = useState(hariIni())
  const [status, setStatus] = useState('alpa')
  const [rombel, setRombel] = useState('')
  const [cari, setCari] = useState('')
  const [q, setQ] = useState('')
  const [data, setData] = useState<{ total: number; baris: BarisKoreksi[] } | null>(null)
  const [riwayat, setRiwayat] = useState<Riwayat[] | null>(null)
  const [buka, setBuka] = useState<string | null>(null)
  const [info, setInfo] = useState('')
  const [galat, setGalat] = useState('')
  const [versi, setVersi] = useState(0)

  useEffect(() => { const t = setTimeout(() => setQ(cari.trim()), 300); return () => clearTimeout(t) }, [cari])
  useEffect(() => {
    let batal = false
    setData(null)
    panggil<{ total: number; baris: BarisKoreksi[] }>('kehadiran_koreksi_cari', { p_dari: dari, p_sampai: sampai, p_status: status, p_rombel: rombel || null, p_cari: q || null })
      .then((x) => { if (!batal) { setData(x); setGalat('') } }).catch((e: Error) => { if (!batal) setGalat(e.message) })
    panggil<Riwayat[]>('kehadiran_koreksi_riwayat', { p_batas: 30 }).then((x) => { if (!batal) setRiwayat(x) }).catch(() => undefined)
    return () => { batal = true }
  }, [dari, sampai, status, rombel, q, versi])

  const kunci = (b: BarisKoreksi) => `${b.pd}-${b.tanggal}`
  return (
    <div>
      <p className="catatan">Gunakan bila wali kelas atau guru piket mengonfirmasi status yang tercatat keliru, misalnya alpa yang ternyata sakit, izin, atau terlambat. Koreksi bisa dilakukan sampai 62 hari ke belakang. Tanggal yang tercakup izin yang disetujui tidak bisa dikoreksi di sini.</p>
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
        <label>Status tercatat <select value={status} onChange={(e) => setStatus(e.target.value)}>{STATUS_HADIR.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <input type="date" value={dari} max={sampai} min={tambahHari(sampai, -62)} onChange={(e) => e.target.value && setDari(e.target.value)} aria-label="Dari" />
        <input type="date" value={sampai} min={dari} max={hariIni()} onChange={(e) => e.target.value && setSampai(e.target.value)} aria-label="Sampai" />
        <select value={rombel} onChange={(e) => setRombel(e.target.value)} aria-label="Rombel">
          <option value="">Semua rombel saya</option>
          {rombels.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
        </select>
        <input type="search" placeholder="Cari nama atau NISN" value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari" />
      </div>
      {info && <p className="kartu" role="status">{info}</p>}
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {data && <p className="catatan">{data.total} catatan{data.total > data.baris.length ? `, ${data.baris.length} teratas ditampilkan; persempit rentang atau pilih rombel` : ''}.</p>}
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Tanggal</th><th>Nama</th><th>Kelas</th><th>Status</th><th /></tr></thead>
          <tbody>
            {!data && !galat && <tr><td colSpan={5} className="catatan">Memuat...</td></tr>}
            {data?.baris.length === 0 && <tr><td colSpan={5} className="catatan">Tidak ada catatan dengan status ini.</td></tr>}
            {data?.baris.map((b) => (
              <Fragment key={kunci(b)}>
                <tr>
                  <td>{tgl(b.tanggal)}</td><td>{b.nama}{b.koreksi > 0 && <small className="catatan"> · pernah dikoreksi</small>}</td><td>{b.rombel}</td>
                  <td><strong>{label(STATUS_HADIR, b.status)}</strong>{b.dari_izin && <small className="catatan"> dari izin</small>}</td>
                  <td>{b.dari_izin ? <small className="catatan">Tidak bisa</small> : <button className="tombol" onClick={() => setBuka(buka === kunci(b) ? null : kunci(b))}>Koreksi</button>}</td>
                </tr>
                {buka === kunci(b) && <tr><td colSpan={5}><FormKoreksi b={b} selesai={(m) => { setInfo(m); setBuka(null); setVersi((v) => v + 1) }} /></td></tr>}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {riwayat && riwayat.length > 0 && (
        <div className="jarak">
          <h3>Koreksi terakhir</h3>
          <div className="tabel-bungkus">
            <table>
              <thead><tr><th>Dikoreksi</th><th>Siswa</th><th>Tanggal</th><th>Perubahan</th><th>Alasan</th><th>Dikonfirmasi oleh</th></tr></thead>
              <tbody>{riwayat.map((r) => (
                <tr key={r.id}><td>{tglJam(r.dicatat_pada)}<br /><small className="catatan">{r.dicatat_nama ?? '-'}</small></td><td>{r.nama}<br /><small className="catatan">{r.rombel ?? '-'}</small></td><td>{tgl(r.tanggal)}</td>
                  <td>{label(STATUS_HADIR, r.dari)} → <strong>{label(STATUS_HADIR, r.ke)}</strong></td><td>{r.alasan}</td><td>{r.dikonfirmasi_oleh}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Isi({ izin }: { izin: string[] }) {
  const bisaIsi = izin.includes('kesiswaan.izin')
  const [tab, setTab] = useState<'harian' | 'kelengkapan' | 'koreksi' | 'rekap'>('kelengkapan')
  const [lompat, setLompat] = useState<Lompat | null>(null)
  const [rombels, setRombels] = useState<RombelPilih[] | null>(null)
  const [galat, setGalat] = useState('')
  useEffect(() => { panggil<RombelPilih[]>('kesiswaan_rombel', { p_untuk: bisaIsi ? 'izin' : 'pantau' }).then(setRombels).catch((e: Error) => { setGalat(e.message); setRombels([]) }) }, [bisaIsi])

  return (
    <Halaman judul="Kehadiran harian" lead="Kehadiran per hari sekolah, terpisah dari absensi per pertemuan di LMS. Sumber utama sinyal alpa dan keterlambatan pada dashboard risiko.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      <div className="aksi" style={{ marginTop: 0 }}>
        {bisaIsi && <button className={tab === 'harian' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('harian')}>Isi kehadiran</button>}
        <button className={tab === 'kelengkapan' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('kelengkapan')}>Kelengkapan mingguan</button>
        {bisaIsi && <button className={tab === 'koreksi' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('koreksi')}>Koreksi</button>}
        <button className={tab === 'rekap' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('rekap')}>Rekap</button>
      </div>
      <div className="jarak">
        {rombels === null ? <p className="catatan">Memuat rombel...</p> : tab === 'harian' ? <Harian key={`${lompat?.rombel}-${lompat?.tanggal}`} rombels={rombels} awal={lompat} /> : tab === 'koreksi' ? <KoreksiTab rombels={rombels} /> : tab === 'kelengkapan' ? <KelengkapanTab bisaIsi={bisaIsi} pilih={(l) => { setLompat(l); setTab('harian') }} /> : <RekapTab rombels={rombels} />}
      </div>
      <p><Link to="/portal/kesiswaan">Kembali ke Kesiswaan</Link></p>
    </Halaman>
  )
}

export default function KehadiranHarian() {
  return <Gerbang perlu={['kesiswaan.izin', 'kesiswaan.pantau']} judul="Kehadiran harian">{(izin) => <Isi izin={izin} />}</Gerbang>
}
