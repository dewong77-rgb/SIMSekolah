import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { panggil, tgl, tglJam } from '../lib/rpc'

// Dashboard pembelajaran: satu pertemuan yang sama di semua kelas yang diampu, dipantau dan diabsen sekaligus.

type Grup = { pertemuan_id: string; judul: string; mapel: string; tanggal: string; jumlah_kelas: number; terbit: number }
type Kelas = {
  pertemuan_id: string; kelas_id: string; rombel: string; status: 'draf' | 'terbit'
  absen_terbuka: boolean; absen_tutup: string | null; kode_absen: string | null
  total: number; hadir: number; izin_sakit: number; alpa: number; belum: number
  total_materi: number; materi_mulai: number; materi_tuntas: number
  total_latihan: number; latihan_selesai: number; total_lembar: number; lembar_kumpul: number; forum_aktif: number
}
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

type KelasSaya = { id: string; mapel: string; rombel: string; peran: string }

export default function DashboardPembelajaran() {
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const [baru, setBaru] = useState(false)
  const [kelasSaya, setKelasSaya] = useState<KelasSaya[]>([])
  const [fb, setFb] = useState({ kelas: '', judul: '', tanggal: '', tujuan: '', wajib: true })
  useEffect(() => {
    panggil<KelasSaya[]>('lms_kelas_saya').then((k) => {
      const mine = k.filter((x) => x.peran === 'pengelola')
      setKelasSaya(mine); setFb((f) => ({ ...f, kelas: f.kelas || mine[0]?.id || '' }))
    }).catch(() => undefined)
  }, [])
  async function buatBaru(e: React.FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat('')
    try {
      const id = await panggil<string>('lms_simpan_pertemuan', { p_kelas: fb.kelas, p_id: null, p_judul: fb.judul, p_tanggal: fb.tanggal || null, p_tujuan: fb.tujuan || null, p_wajib_absen: fb.wajib, p_terbit: false })
      nav(`/portal/lms/${fb.kelas}/pertemuan/${id}`)
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  async function terbitSemua() {
    if (!pilih) return
    if (!window.confirm('Terbitkan pertemuan ini di semua kelas Anda sekarang? Siswa langsung bisa membukanya.')) return
    setSibuk(true); setGalat(''); setPesan('')
    try {
      const r = await panggil<{ dibagikan: number; diterbitkan: number; dilewati_tanpa_materi: number }>('lms_terbitkan_serentak', { p_pertemuan: pilih })
      setPesan(`Terbit di semua kelas. ${r.dibagikan ? `${r.dibagikan} kelas dibuatkan salinan. ` : ''}${r.dilewati_tanpa_materi ? `${r.dilewati_tanpa_materi} kelas dilewati karena belum punya materi.` : ''}`)
      await muat()
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
    <Halaman judul="Dashboard pembelajaran" lead="Satu pertemuan, semua kelas yang Anda ampu. Absen dibuka sekaligus dengan satu kode, kemajuan siswa dipantau langsung.">
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="aksi">
        <button type="button" className="tombol tombol-isi" onClick={() => setBaru(!baru)}>{baru ? 'Tutup formulir' : 'Pertemuan baru'}</button>
      </div>
      {baru && (
        <form className="kartu form jarak" onSubmit={buatBaru}>
          <h3>Pertemuan baru</h3>
          <div className="grid grid-2">
            <label>Judul pertemuan<input required maxLength={200} value={fb.judul} onChange={(e) => setFb({ ...fb, judul: e.target.value })} /></label>
            <label>Tanggal<input type="date" value={fb.tanggal} onChange={(e) => setFb({ ...fb, tanggal: e.target.value })} /><span className="petunjuk">Kosong berarti hari ini.</span></label>
          </div>
          <label>Isi di kelas
            <select value={fb.kelas} onChange={(e) => setFb({ ...fb, kelas: e.target.value })}>
              {kelasSaya.map((x) => <option key={x.id} value={x.id}>{x.mapel} {x.rombel}</option>)}
            </select>
            <span className="petunjuk">Materi, latihan, dan forum diisi sekali di sini. Saat diterbitkan, otomatis berlaku untuk semua kelas lain.</span>
          </label>
          <label>Tujuan pembelajaran (opsional)<textarea rows={2} maxLength={1000} value={fb.tujuan} onChange={(e) => setFb({ ...fb, tujuan: e.target.value })} /></label>
          <label className="baris-centang"><input type="checkbox" checked={fb.wajib} onChange={(e) => setFb({ ...fb, wajib: e.target.checked })} /> Siswa wajib absen sebelum membuka materi</label>
          <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk || !fb.kelas}>{sibuk ? 'Membuat...' : 'Buat dan isi pertemuan'}</button></div>
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
          {k.some((x) => x.status === 'draf') && (
            <div className="kartu jarak" style={{ borderLeft: '4px solid #e8a020' }}>
              <p style={{ margin: 0 }}><strong>{k.filter((x) => x.status === 'draf').length} dari {k.length} kelas masih draf.</strong> Siswa di kelas itu belum bisa membuka pertemuan dan absen belum bisa dibuka.</p>
              <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk} onClick={() => void terbitSemua()}>Terbitkan di semua kelas</button></div>
            </div>
          )}
          {k.length > 0 && <div className="aksi jarak"><Link className="tombol" style={{ color: 'var(--warna-utama)' }} to={`/portal/lms/${(k.find((x) => x.pertemuan_id === pilih) ?? k[0]).kelas_id}/pertemuan/${pilih ?? k[0].pertemuan_id}`}>Atur isi pertemuan ini (materi, latihan, forum)</Link></div>}
          <div className="kartu jarak">
            <h3>Absen semua kelas</h3>
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
          </div>

          <div className="grid grid-3 jarak">
            <div className="kartu"><small>Sudah absen</small><p style={{ margin: 0, fontSize: '1.4rem' }}>{jml((x) => x.hadir + x.izin_sakit)} dari {total}</p><small>{jml((x) => x.belum)} belum absen</small></div>
            <div className="kartu"><small>Materi dibaca tuntas</small><p style={{ margin: 0, fontSize: '1.4rem' }}>{adaMateri ? `${jml((x) => x.materi_tuntas)} siswa` : '-'}</p><small>{adaMateri ? `${jml((x) => x.materi_mulai)} sudah mulai membaca` : 'Belum ada materi'}</small></div>
            <div className="kartu"><small>Latihan selesai</small><p style={{ margin: 0, fontSize: '1.4rem' }}>{adaLatihan ? `${jml((x) => x.latihan_selesai)} siswa` : '-'}</p><small>{adaLembar ? `${jml((x) => x.lembar_kumpul)} lembar kerja terkumpul, ` : ''}{jml((x) => x.forum_aktif)} aktif di forum</small></div>
          </div>

          <div className="aksi jarak"><label className="baris-centang"><input type="checkbox" checked={langsung} onChange={(e) => setLangsung(e.target.checked)} /> Pantau langsung (segar tiap 15 detik)</label></div>
          <div className="tabel-bungkus">
            <table>
              <thead><tr><th>Kelas</th><th>Absen</th><th>Belum absen</th><th>Materi dibaca</th><th>Latihan</th><th>Lembar kerja</th><th>Forum</th></tr></thead>
              <tbody>
                {k.map((x) => (
                  <tr key={x.pertemuan_id}>
                    <td><Link to={`/portal/lms/${x.kelas_id}/pertemuan/${x.pertemuan_id}`}>{x.rombel}</Link><br />
                      {x.status !== 'terbit' ? <span className="status status-menunggu">Draf</span> : x.absen_terbuka ? <span className="status status-selesai">Absen dibuka</span> : <small>{x.total} siswa</small>}
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
    </Halaman>
  )
}
