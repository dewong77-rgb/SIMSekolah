import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import KelolaPertemuan, { AksesPertemuan } from './LmsKelola'
import Halaman from '../components/Halaman'
import { panggil, tgl, tglJam } from '../lib/rpc'

// Dashboard pembelajaran: satu pertemuan yang sama di semua kelas yang diampu, dipantau dan diabsen sekaligus.

type Grup = { pertemuan_id: string; judul: string; mapel: string; tanggal: string; jumlah_kelas: number; terbit: number }
type Kelas = {
  pertemuan_id: string; kelas_id: string; rombel: string; status: 'draf' | 'terbit'
  ditutup: boolean; buka_sampai: string | null; terbuka: boolean
  absen_terbuka: boolean; absen_tutup: string | null; kode_absen: string | null
  total: number; hadir: number; izin_sakit: number; alpa: number; belum: number
  total_materi: number; materi_mulai: number; materi_tuntas: number
  total_latihan: number; latihan_selesai: number; total_lembar: number; lembar_kumpul: number; forum_aktif: number
}
type MingguRencana = { id: string; nomor: number; semester: number | null; tanggal_mulai: string | null; materi_pokok: string | null; tp_kode: string | null; tujuan: string | null; terpakai: boolean }
type Data = { judul: string; kelas: Kelas[] }

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

function Sel({ a, b, ada = true }: { a: number; b: number; ada?: boolean }) {
  if (!ada) return <small>-</small>
  return (
    <div style={{ minWidth: 90 }}>
      <strong>{a}</strong><small> / {b} ({pct(a, b)}%)</small>
      <div style={{ height: 6, background: '#e6e9ef', borderRadius: 3, marginTop: 3 }}><div style={{ width: `${pct(a, b)}%`, height: 6, background: 'var(--warna-utama)', borderRadius: 3 }} /></div>
    </div>
  )
}

type Menunggu = { topik_id: string; pertemuan_id: string; kelas_id: string; mapel: string; rombel: string; pertemuan: string; topik: string; dari: string; cuplikan: string; waktu: string }
type KelasSaya = { id: string; mapel: string; rombel: string; peran: string }

export default function DashboardPembelajaran() {
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const [baru, setBaru] = useState(false)
  const [kelasSaya, setKelasSaya] = useState<KelasSaya[]>([])
  const [fb, setFb] = useState<{ kelas: string[]; mapel: string; judul: string; tanggal: string; tujuan: string; wajib: boolean }>({ kelas: [], mapel: '', judul: '', tanggal: '', tujuan: '', wajib: true })
  useEffect(() => {
    panggil<KelasSaya[]>('lms_kelas_saya').then((k) => {
      const mine = k.filter((x) => x.peran === 'pengelola')
      setKelasSaya(mine)
      const m0 = mine[0]?.mapel ?? ''
      setFb((f) => ({ ...f, mapel: f.mapel || m0, kelas: f.kelas.length ? f.kelas : mine.filter((x) => x.mapel === m0).map((x) => x.id) }))
    }).catch(() => undefined)
  }, [])
  const [rencana, setRencana] = useState<MingguRencana[]>([])
  const [minggu, setMinggu] = useState('')
  const kelasPertama = fb.kelas[0] ?? ''
  useEffect(() => {
    setMinggu(''); setRencana([])
    if (!baru || !kelasPertama) return
    panggil<MingguRencana[]>('lms_rencana_untuk_kelas', { p_kelas: kelasPertama }).then(setRencana).catch(() => setRencana([]))
  }, [baru, kelasPertama])
  function pilihMinggu(id: string) {
    setMinggu(id)
    const m = rencana.find((x) => x.id === id)
    if (!m) return
    setFb((f) => ({ ...f, judul: `M${m.nomor}: ${m.materi_pokok ?? ''}`.slice(0, 200), tanggal: m.tanggal_mulai ?? f.tanggal, tujuan: (m.tujuan ?? '').slice(0, 1000) }))
  }
  async function buatBaru(e: React.FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat('')
    try {
      const r = await panggil<{ pertama: { kelas_id: string; id: string } }>(minggu ? 'lms_pertemuan_baru_rencana' : 'lms_pertemuan_baru_banyak', { ...(minggu ? { p_minggu: minggu } : {}), p_kelas: fb.kelas, p_judul: fb.judul, p_tanggal: fb.tanggal || null, p_tujuan: fb.tujuan || null, p_wajib_absen: fb.wajib })
      nav(`/portal/lms/${r.pertama.kelas_id}/pertemuan/${r.pertama.id}`)
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  const [daftar, setDaftar] = useState<Grup[] | null>(null)
  const [d, setD] = useState<Data | null>(null)
  const [galat, setGalat] = useState('')
  const [pesan, setPesan] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [menit, setMenit] = useState(15)
  const [kode, setKode] = useState(true)
  const [langsung, setLangsung] = useState(true)
  const pilih = sp.get('p')
  const [forum, setForum] = useState<Menunggu[]>([])
  const muatForum = useCallback(async () => { try { setForum(await panggil<Menunggu[]>('lms_forum_menunggu')) } catch { /* abaikan */ } }, [])
  useEffect(() => { void muatForum() }, [muatForum])

  useEffect(() => {
    panggil<Grup[]>('lms_dashboard_daftar').then((g) => {
      setDaftar(g)
      if (!sp.get('p') && g.length > 0) setSp({ p: g[0].pertemuan_id }, { replace: true })
    }).catch((e) => setGalat((e as Error).message))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const muat = useCallback(async () => {
    if (!pilih) return
    try { setD(await panggil<Data>('lms_dashboard_pertemuan', { p_pertemuan: pilih })); setGalat('') } catch (e) { setGalat((e as Error).message) }
  }, [pilih])
  useEffect(() => { setD(null); void muat() }, [muat])
  useEffect(() => {
    if (!langsung) return
    const j = window.setInterval(() => { if (document.visibilityState === 'visible') void muat() }, 15_000)
    return () => window.clearInterval(j)
  }, [langsung, muat])

  async function buka() {
    if (!pilih) return
    setSibuk(true); setGalat(''); setPesan('')
    try {
      const r = await panggil<{ kelas_dibuka: number; kelas_belum_terbit: number }>('lms_absen_serentak', { p_pertemuan: pilih, p_menit: menit, p_pakai_kode: kode })
      setPesan(`Absen dibuka di ${r.kelas_dibuka} kelas.${r.kelas_belum_terbit ? ` ${r.kelas_belum_terbit} kelas belum terbit, absennya tidak dibuka.` : ''}`)
      await muat()
    } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  async function tutup() {
    if (!pilih) return
    setSibuk(true); setGalat(''); setPesan('')
    try { const n = await panggil<number>('lms_tutup_absen_serentak', { p_pertemuan: pilih }); setPesan(`Absen ditutup di ${n} kelas.`); await muat() } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }

  const k = d?.kelas ?? []
  const jml = (f: (x: Kelas) => number) => k.reduce((j, x) => j + f(x), 0)
  const total = jml((x) => x.total)
  const terbuka = k.filter((x) => x.absen_terbuka)
  const kodeAktif = terbuka.find((x) => x.kode_absen)?.kode_absen ?? null
  const tutupAktif = terbuka[0]?.absen_tutup ?? null
  const adaMateri = k.some((x) => x.total_materi > 0)
  const adaLatihan = k.some((x) => x.total_latihan > 0)
  const adaLembar = k.some((x) => x.total_lembar > 0)

  return (
    <Halaman judul="Pantau semua kelas" lead="Satu pertemuan, semua kelas yang Anda ampu. Aktif otomatis saat bahan bacaan dan lembar kerja ada. Kehadiran dan kemajuan siswa dipantau langsung.">
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="aksi">
        <button type="button" className="tombol tombol-isi" onClick={() => setBaru(!baru)}>{baru ? 'Tutup formulir' : 'Pertemuan baru'}</button>
      </div>
      {baru && (
        <form className="kartu form jarak" onSubmit={buatBaru}>
          <h3>Pertemuan baru</h3>
          {rencana.length > 0 && (
            <label>Ambil dari rencana mengajar (opsional)
              <select value={minggu} onChange={(e) => pilihMinggu(e.target.value)}>
                <option value="">Tulis sendiri</option>
                {[...rencana].sort((a, b) => Number(a.terpakai) - Number(b.terpakai) || a.nomor - b.nomor).map((m) => (
                  <option key={m.id} value={m.id}>{m.terpakai ? '✓ ' : ''}M{m.nomor}: {(m.materi_pokok ?? '').slice(0, 70)}{m.tp_kode ? ` (${m.tp_kode})` : ''}</option>
                ))}
              </select>
              <span className="petunjuk">Judul, tanggal, dan tujuan terisi otomatis. Tanda ✓ berarti sudah dibuat di kelas ini.</span>
            </label>
          )}
          {rencana.length === 0 && <p className="catatan">Belum ada rencana mengajar. <Link to="/portal/lms/rencana">Isi dari template Excel</Link> agar pertemuan terhubung ke ATP dan KKTP.</p>}
          <div className="grid grid-2">
            <label>Judul pertemuan<input required maxLength={200} value={fb.judul} onChange={(e) => setFb({ ...fb, judul: e.target.value })} /></label>
            <label>Tanggal<input type="date" value={fb.tanggal} onChange={(e) => setFb({ ...fb, tanggal: e.target.value })} /><span className="petunjuk">Kosong berarti hari ini.</span></label>
          </div>
          <fieldset className="pilih-kelas">
            <legend>Berlaku untuk kelas</legend>
            {[...new Set(kelasSaya.map((x) => x.mapel))].length > 1 && (
              <select value={fb.mapel} onChange={(e) => setFb({ ...fb, mapel: e.target.value, kelas: kelasSaya.filter((x) => x.mapel === e.target.value).map((x) => x.id) })}>
                {[...new Set(kelasSaya.map((x) => x.mapel))].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            {(() => {
              const daftarK = kelasSaya.filter((x) => x.mapel === fb.mapel)
              const semua = daftarK.length > 0 && daftarK.every((x) => fb.kelas.includes(x.id))
              return (
                <>
                  <label className="baris-centang"><input type="checkbox" checked={semua} onChange={(e) => setFb({ ...fb, kelas: e.target.checked ? daftarK.map((x) => x.id) : [] })} /> <strong>Semua kelas ({daftarK.length})</strong></label>
                  {daftarK.map((x) => (
                    <label key={x.id} className="baris-centang">
                      <input type="checkbox" checked={fb.kelas.includes(x.id)} onChange={(e) => setFb({ ...fb, kelas: e.target.checked ? [...fb.kelas, x.id] : fb.kelas.filter((k) => k !== x.id) })} /> {x.rombel}
                    </label>
                  ))}
                </>
              )
            })()}
            <span className="petunjuk">Materi, latihan, dan forum diisi sekali. Saat diterbitkan, berlaku di semua kelas yang dicentang.</span>
          </fieldset>
          <label>Tujuan pembelajaran (opsional)<textarea rows={2} maxLength={1000} value={fb.tujuan} onChange={(e) => setFb({ ...fb, tujuan: e.target.value })} /></label>
          <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk || fb.kelas.length === 0}>{sibuk ? 'Membuat...' : 'Buat dan isi pertemuan'}</button></div>
        </form>
      )}
      {daftar && daftar.length === 0 && <div className="kartu"><p>Belum ada pertemuan. Buat pertemuan di Ruang belajar, lalu bagikan ke semua kelas.</p><p><Link to="/portal/lms">Ke Ruang belajar</Link></p></div>}
      {daftar && daftar.length > 0 && (
        <div className="kartu form">
          <label>Pertemuan
            <select value={pilih ?? ''} onChange={(e) => setSp({ p: e.target.value })}>
              {daftar.map((g) => <option key={g.pertemuan_id} value={g.pertemuan_id}>{g.judul} ({g.mapel}, {tgl(g.tanggal)}, {g.jumlah_kelas} kelas)</option>)}
            </select>
          </label>
        </div>
      )}

      {d && (
        <>
          {k.length > 0 && pilih && <AksesPertemuan key={`a${pilih}`} pertemuanId={pilih} status={k.some((x) => x.status === 'terbit') ? 'terbit' : 'draf'} ditutup={k.filter((x) => x.status === 'terbit').every((x) => x.ditutup)} bukaSampai={k.find((x) => x.status === 'terbit')?.buka_sampai ?? null} setelah={muat} />}
          {k.length > 0 && pilih && <KelolaPertemuan key={pilih} kelasId={(k.find((x) => x.pertemuan_id === pilih) ?? k[0]).kelas_id} pertemuanId={pilih} setelahUbah={async () => { const g = await panggil<Grup[]>('lms_dashboard_daftar'); setDaftar(g); await muat() }} setelahHapus={async () => { const g = await panggil<Grup[]>('lms_dashboard_daftar'); setDaftar(g); setD(null); setSp(g.length > 0 ? { p: g[0].pertemuan_id } : {}, { replace: true }) }} />}
          {k.length > 0 && <div className="aksi jarak"><Link className="tombol" style={{ color: 'var(--warna-utama)' }} to={`/portal/lms/${(k.find((x) => x.pertemuan_id === pilih) ?? k[0]).kelas_id}/pertemuan/${pilih ?? k[0].pertemuan_id}`}>Atur isi pertemuan ini (materi, latihan, forum)</Link></div>}
          <details className="kartu jarak">
            <summary><strong>Absen dengan kode (opsional)</strong></summary>
            <p className="catatan">Kehadiran sudah tercatat otomatis saat siswa membaca, mengumpulkan lembar kerja, atau menulis di forum. Kode hanya perlu bila Anda ingin absen tatap muka.</p>
            {terbuka.length > 0 ? (
              <>
                <p>Absen dibuka di {terbuka.length} dari {k.length} kelas{tutupAktif ? <>, sampai <strong>{tglJam(tutupAktif)}</strong></> : null}.</p>
                {kodeAktif && <p>Kode absen untuk semua kelas: <strong style={{ fontSize: '2.4rem', letterSpacing: '.25em' }}>{kodeAktif}</strong><br /><span className="catatan">Tulis di papan. Satu kode berlaku di semua kelas.</span></p>}
                <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk} onClick={() => void tutup()}>Tutup absen semua kelas</button></div>
              </>
            ) : (
              <div className="form">
                <div className="grid grid-2">
                  <label>Durasi (menit)<input type="number" min={1} max={240} value={menit} onChange={(e) => setMenit(Number(e.target.value))} /></label>
                  <label className="baris-centang" style={{ alignSelf: 'end' }}><input type="checkbox" checked={kode} onChange={(e) => setKode(e.target.checked)} /> Pakai kode 4 digit</label>
                </div>
                <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk} onClick={() => void buka()}>Buka absen semua kelas</button></div>
              </div>
            )}
            {pesan && <p className="catatan" role="status">{pesan}</p>}
          </details>

          <div className="grid grid-3 jarak">
            <div className="kartu"><small>Hadir (otomatis dari aktivitas)</small><p style={{ margin: 0, fontSize: '1.4rem' }}>{jml((x) => x.hadir + x.izin_sakit)} dari {total}</p><small>{jml((x) => x.belum)} belum hadir</small></div>
            <div className="kartu"><small>Materi dibaca tuntas</small><p style={{ margin: 0, fontSize: '1.4rem' }}>{adaMateri ? `${jml((x) => x.materi_tuntas)} siswa` : '-'}</p><small>{adaMateri ? `${jml((x) => x.materi_mulai)} sudah mulai membaca` : 'Belum ada materi'}</small></div>
            <div className="kartu"><small>Latihan selesai</small><p style={{ margin: 0, fontSize: '1.4rem' }}>{adaLatihan ? `${jml((x) => x.latihan_selesai)} siswa` : '-'}</p><small>{adaLembar ? `${jml((x) => x.lembar_kumpul)} lembar kerja terkumpul, ` : ''}{jml((x) => x.forum_aktif)} aktif di forum</small></div>
          </div>

          <div className="aksi jarak"><label className="baris-centang"><input type="checkbox" checked={langsung} onChange={(e) => setLangsung(e.target.checked)} /> Pantau langsung (segar tiap 15 detik)</label></div>
          <div className="tabel-bungkus">
            <table>
              <thead><tr><th>Kelas</th><th>Akses</th><th>Belum hadir</th><th>Materi dibaca</th><th>Latihan</th><th>Lembar kerja</th><th>Forum</th></tr></thead>
              <tbody>
                {k.map((x) => (
                  <tr key={x.pertemuan_id}>
                    <td><Link to={`/portal/lms/${x.kelas_id}/pertemuan/${x.pertemuan_id}`}>{x.rombel}</Link><br />
                      {x.status !== 'terbit' ? <span className="status status-menunggu">Menunggu bahan</span> : !x.terbuka ? <span className="status status-dibatalkan">Ditutup</span> : x.absen_terbuka ? <span className="status status-selesai">Absen dibuka</span> : <small>{x.total} siswa</small>}
                    </td>
                    <td><Sel a={x.hadir + x.izin_sakit} b={x.total} /></td>
                    <td>{x.belum}{x.alpa > 0 ? <><br /><small>{x.alpa} alpa</small></> : null}</td>
                    <td><Sel a={x.materi_tuntas} b={x.total} ada={x.total_materi > 0} /></td>
                    <td><Sel a={x.latihan_selesai} b={x.total} ada={x.total_latihan > 0} /></td>
                    <td><Sel a={x.lembar_kumpul} b={x.total} ada={x.total_lembar > 0} /></td>
                    <td><Sel a={x.forum_aktif} b={x.total} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="catatan">Kelas dengan judul pertemuan yang sama dihitung satu kelompok. Klik nama kelas untuk melihat siswa satu per satu.</p>
        </>
      )}
      <div className="kartu jarak">
        <h3 style={{ marginTop: 0 }}>Forum menunggu balasan guru ({forum.length})</h3>
        {forum.length === 0 ? <p className="catatan">Semua kiriman siswa sudah dibalas.</p> : (
          <div className="tabel-bungkus">
            <table>
              <thead><tr><th>Kelas</th><th>Kiriman terakhir</th><th>Waktu</th><th></th></tr></thead>
              <tbody>
                {forum.map((f) => (
                  <tr key={f.topik_id}>
                    <td>{f.rombel}<br /><small>{f.pertemuan}</small></td>
                    <td><strong>{f.dari}</strong>: {f.cuplikan}</td>
                    <td><small>{tglJam(f.waktu)}</small></td>
                    <td><Link to={`/portal/lms/${f.kelas_id}/pertemuan/${f.pertemuan_id}#forum`}>Balas</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Halaman>
  )
}
