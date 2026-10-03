import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { useAuth } from '../auth/AuthContext'
import { panggil, tgl, tglJam } from '../lib/rpc'
import { supabase } from '../lib/supabase'
import { DaftarKuis } from './LmsKuis'
import { DaftarTugas } from './LmsTugas'
import { Forum } from './LmsForum'
import { unduhCsv } from './lmsUtil'
import { unduhRekapKelas } from './lmsXlsx'

// Semua data lewat fungsi basis data lms_*. Tabel LMS tidak punya policy, jadi tidak dibaca langsung.

type Kelas = {
  id: string; mapel: string; rombel: string; rombel_id: string; guru: string; semester: string
  peran: 'pengelola' | 'siswa'; jumlah_pertemuan: number
}
type Pertemuan = {
  id: string; nomor: number; judul: string; tanggal: string; tujuan: string | null
  status: 'draf' | 'terbit'; wajib_absen: boolean; absen_terbuka: boolean; absen_tutup: string | null
  kode_absen: string | null; jumlah_materi: number; hadir: number | null; status_saya: string | null
}
type Materi = { id: string; urutan: number; jenis: 'teks' | 'video' | 'tautan' | 'berkas'; judul: string; isi: string | null; url: string | null; selesai: boolean }
type BarisAbsen = { peserta_didik_id: string; nama: string; nisn: string | null; no_urut: number | null; status: string; sumber: string | null; catatan: string | null }
type Progres = { total_materi: number; total_kuis: number; siswa: { peserta_didik_id: string; materi_selesai: number; kuis_selesai: number }[] }
type BarisRekap = { peserta_didik_id: string; nama: string; nisn: string | null; hadir: number; izin: number; sakit: number; alpa: number }

const labelStatus: Record<string, string> = { hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', alpa: 'Alpa', belum: 'Belum dicatat' }
const kelasStatus: Record<string, string> = { hadir: 'status-selesai', izin: 'status-diteruskan', sakit: 'status-diteruskan', alpa: 'status-ditolak', belum: 'status-dibatalkan' }
const labelJenis: Record<string, string> = { teks: 'Bacaan', video: 'Video', tautan: 'Tautan', berkas: 'Berkas' }

function Kembali({ ke, teks }: { ke: string; teks: string }) {
  return <p className="catatan jarak"><Link to={ke}>{teks}</Link></p>
}

/** Mengambil id video YouTube dari tautan biasa. Hanya pola 11 karakter yang diterima. */
function idYoutube(url: string): string | null {
  try {
    const u = new URL(url)
    let id: string | null = null
    if (u.hostname === 'youtu.be') id = u.pathname.slice(1)
    else if (u.hostname.endsWith('youtube.com')) id = u.searchParams.get('v') ?? (u.pathname.startsWith('/embed/') ? u.pathname.slice(7) : null)
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
  } catch { return null }
}

/** Daftar kelas ajar milik pengguna. Guru dan admin TU bisa membuat kelas ajar baru. */
export function DaftarKelas() {
  const { profil } = useAuth()
  const [kelas, setKelas] = useState<Kelas[] | null>(null)
  const [rombel, setRombel] = useState<{ id: string; nama: string }[]>([])
  const [galat, setGalat] = useState('')
  const [form, setForm] = useState(false)
  const [v, setV] = useState({ rombel: '', mapel: '' })
  const [sibuk, setSibuk] = useState(false)
  const bolehBuat = profil?.peran === 'guru' || profil?.peran === 'admin_tu'

  const muat = useCallback(async () => {
    try { setKelas(await panggil<Kelas[]>('lms_kelas_saya')) } catch (e) { setGalat((e as Error).message) }
  }, [])
  useEffect(() => { void muat() }, [muat])
  useEffect(() => {
    if (!form || rombel.length) return
    supabase.from('rombel').select('id, nama').eq('jenis_rombel', 'Kelas Utama').order('nama')
      .then(({ data }) => setRombel((data as { id: string; nama: string }[] | null) ?? []))
  }, [form, rombel.length])

  async function buat(e: FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat('')
    try {
      await panggil('lms_buat_kelas_ajar', { p_rombel: v.rombel, p_mapel: v.mapel })
      setV({ rombel: '', mapel: '' }); setForm(false)
      await muat()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }

  return (
    <Halaman judul="Ruang belajar" lead={profil?.peran === 'siswa' ? 'Kelas yang Anda ikuti semester ini.' : 'Kelas yang Anda ajar semester ini.'}>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {bolehBuat && (
        <div className="aksi">
          <button className="tombol tombol-isi" onClick={() => setForm(!form)}>{form ? 'Tutup formulir' : 'Buat kelas ajar'}</button>
          <Link to="/portal/lms/administrasi" className="tombol" style={{ color: 'var(--warna-utama)' }}>Administrasi guru</Link>
        </div>
      )}
      {form && (
        <form className="kartu form jarak" onSubmit={buat}>
          <div className="grid grid-2">
            <label>Rombel
              <select required value={v.rombel} onChange={(e) => setV({ ...v, rombel: e.target.value })}>
                <option value="">Pilih rombel</option>
                {rombel.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
              </select>
            </label>
            <label>Mata pelajaran
              <input required minLength={2} maxLength={80} value={v.mapel} onChange={(e) => setV({ ...v, mapel: e.target.value })} placeholder="Informatika" />
            </label>
          </div>
          <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan kelas ajar'}</button></div>
        </form>
      )}
      <div className="grid grid-3 jarak">
        {!kelas && <p className="catatan">Memuat...</p>}
        {kelas && kelas.length === 0 && <div className="kartu"><p>Belum ada kelas.</p><p className="catatan">{bolehBuat ? 'Buat kelas ajar dari tombol di atas.' : 'Kelas muncul setelah guru membuat kelas ajar untuk rombel Anda.'}</p></div>}
        {(kelas ?? []).map((k) => (
          <Link key={k.id} to={`/portal/lms/${k.id}`} className="kartu tautan">
            <small>{k.rombel}</small>
            <h3>{k.mapel}</h3>
            <small>{k.guru}<br />{k.jumlah_pertemuan} pertemuan{k.peran === 'pengelola' ? ' (Anda pengelola)' : ''}</small>
          </Link>
        ))}
      </div>
      <Kembali ke="/portal" teks="Kembali ke portal" />
    </Halaman>
  )
}

/** Daftar pertemuan satu kelas. Guru menyusun pertemuan di sini. */
export function DetailKelas() {
  const { kelasId = '' } = useParams()
  const [kelas, setKelas] = useState<Kelas | null>(null)
  const [daftar, setDaftar] = useState<Pertemuan[] | null>(null)
  const [galat, setGalat] = useState('')
  const [form, setForm] = useState(false)
  const [sibuk, setSibuk] = useState(false)
  const [v, setV] = useState({ judul: '', tanggal: '', tujuan: '', wajib: true, terbit: false })

  const muat = useCallback(async () => {
    try {
      const [k, p] = await Promise.all([panggil<Kelas[]>('lms_kelas_saya'), panggil<Pertemuan[]>('lms_pertemuan_daftar', { p_kelas: kelasId })])
      setKelas(k.find((x) => x.id === kelasId) ?? null)
      setDaftar(p)
    } catch (e) { setGalat((e as Error).message) }
  }, [kelasId])
  useEffect(() => { void muat() }, [muat])

  const kelola = kelas?.peran === 'pengelola'

  async function simpan(e: FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat('')
    try {
      await panggil('lms_simpan_pertemuan', {
        p_kelas: kelasId, p_id: null, p_judul: v.judul, p_tanggal: v.tanggal || null,
        p_tujuan: v.tujuan || null, p_wajib_absen: v.wajib, p_terbit: v.terbit,
      })
      setV({ judul: '', tanggal: '', tujuan: '', wajib: true, terbit: false }); setForm(false)
      await muat()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }

  const [mengunduh, setMengunduh] = useState(false)
  async function unduhSemua() {
    if (!kelas) return
    setMengunduh(true); setGalat('')
    try { await unduhRekapKelas(kelas) } catch (er) { setGalat('Gagal menyiapkan rekap. ' + (er as Error).message) }
    setMengunduh(false)
  }

  return (
    <Halaman judul={kelas ? `${kelas.mapel} ${kelas.rombel}` : 'Kelas'} lead={kelas ? `Pengampu: ${kelas.guru}` : undefined}>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {kelola && (
        <div className="aksi">
          <button className="tombol tombol-isi" onClick={() => setForm(!form)}>{form ? 'Tutup formulir' : 'Tambah pertemuan'}</button>
          <Link to={`/portal/lms/${kelasId}/rekap`} className="tombol" style={{ color: 'var(--warna-utama)' }}>Rekap kehadiran</Link>
          <Link to={`/portal/lms/${kelasId}/nilai`} className="tombol" style={{ color: 'var(--warna-utama)' }}>Buku nilai</Link>
          <Link to={`/portal/lms/${kelasId}/jurnal`} className="tombol" style={{ color: 'var(--warna-utama)' }}>Jurnal mengajar</Link>
          <button className="tombol" style={{ color: 'var(--warna-utama)' }} disabled={!kelas || mengunduh} onClick={() => void unduhSemua()}>
            {mengunduh ? 'Menyiapkan berkas...' : 'Unduh rekap (Excel)'}
          </button>
        </div>
      )}
      {form && (
        <form className="kartu form jarak" onSubmit={simpan}>
          <div className="grid grid-2">
            <label>Judul pertemuan<input required maxLength={200} value={v.judul} onChange={(e) => setV({ ...v, judul: e.target.value })} /></label>
            <label>Tanggal<input type="date" value={v.tanggal} onChange={(e) => setV({ ...v, tanggal: e.target.value })} /><span className="petunjuk">Kosong berarti hari ini.</span></label>
          </div>
          <label>Tujuan pembelajaran (opsional)<textarea rows={2} maxLength={1000} value={v.tujuan} onChange={(e) => setV({ ...v, tujuan: e.target.value })} /></label>
          <label className="centang" style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
            <input type="checkbox" checked={v.wajib} onChange={(e) => setV({ ...v, wajib: e.target.checked })} style={{ width: 'auto' }} />
            Siswa wajib absen sebelum membuka materi
          </label>
          <label className="centang" style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
            <input type="checkbox" checked={v.terbit} onChange={(e) => setV({ ...v, terbit: e.target.checked })} style={{ width: 'auto' }} />
            Terbitkan sekarang (siswa langsung melihat)
          </label>
          <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan pertemuan'}</button></div>
        </form>
      )}
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>No</th><th>Pertemuan</th><th>Tanggal</th><th>{kelola ? 'Kehadiran' : 'Status saya'}</th><th></th></tr></thead>
          <tbody>
            {!daftar && <tr><td colSpan={5}>Memuat...</td></tr>}
            {daftar && daftar.length === 0 && <tr><td colSpan={5}>Belum ada pertemuan.</td></tr>}
            {(daftar ?? []).map((p) => (
              <tr key={p.id}>
                <td>{p.nomor}</td>
                <td>
                  <Link to={`/portal/lms/${kelasId}/pertemuan/${p.id}`}>{p.judul}</Link><br />
                  <small>{p.jumlah_materi} materi{kelola && p.status === 'draf' ? ', draf' : ''}</small>
                </td>
                <td>{tgl(p.tanggal)}</td>
                <td>
                  {kelola
                    ? <>{p.hadir ?? 0} hadir{p.absen_terbuka ? <> <span className="status status-menunggu">Absen dibuka</span></> : null}</>
                    : p.absen_terbuka && !p.status_saya
                      ? <span className="status status-menunggu">Absen dibuka</span>
                      : <span className={`status ${kelasStatus[p.status_saya ?? 'belum']}`}>{labelStatus[p.status_saya ?? 'belum']}</span>}
                </td>
                <td><Link to={`/portal/lms/${kelasId}/pertemuan/${p.id}`}>Buka</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {kelas && <DaftarKuis kelasId={kelasId} kelola={kelola} pertemuan={(daftar ?? []).map((p) => ({ id: p.id, nomor: p.nomor, judul: p.judul }))} />}
      {kelas && <DaftarTugas kelasId={kelasId} kelola={kelola} pertemuan={(daftar ?? []).map((p) => ({ id: p.id, nomor: p.nomor, judul: p.judul }))} />}
      <Kembali ke="/portal/lms" teks="Kembali ke daftar kelas" />
    </Halaman>
  )
}

function IsiMateri({ m, siswa, selesai }: { m: Materi; siswa: boolean; selesai: (id: string) => Promise<void> }) {
  const yt = m.jenis === 'video' && m.url ? idYoutube(m.url) : null
  return (
    <div className="kartu jarak">
      <div className="lencana-baris"><span className="lencana">{labelJenis[m.jenis]}</span>{m.selesai && <span className="status status-selesai">Selesai dibaca</span>}</div>
      <h3>{m.judul}</h3>
      {m.jenis === 'teks' && <div style={{ whiteSpace: 'pre-wrap' }}>{m.isi}</div>}
      {yt && (
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
          <iframe
            title={m.judul}
            src={`https://www.youtube-nocookie.com/embed/${yt}`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, borderRadius: 8 }}
            allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}
      {m.jenis !== 'teks' && m.url && (!yt || m.jenis !== 'video') && <p><a href={m.url} target="_blank" rel="noopener noreferrer">Buka {m.jenis === 'video' ? 'video' : m.jenis === 'berkas' ? 'berkas' : 'tautan'}</a></p>}
      {siswa && !m.selesai && <div className="aksi"><button className="tombol" style={{ color: 'var(--warna-utama)' }} onClick={() => void selesai(m.id)}>Tandai sudah selesai</button></div>}
    </div>
  )
}

function KontrolAbsen({ p, muat }: { p: Pertemuan; muat: () => Promise<void> }) {
  const [menit, setMenit] = useState(15)
  const [kode, setKode] = useState(true)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  async function buka() {
    setSibuk(true); setGalat('')
    try { await panggil('lms_buka_absen', { p_pertemuan: p.id, p_menit: menit, p_pakai_kode: kode }); await muat() } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  async function tutup() {
    setSibuk(true); setGalat('')
    try { await panggil('lms_tutup_absen', { p_pertemuan: p.id }); await muat() } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  return (
    <div className="kartu jarak">
      <h3>Absen pertemuan</h3>
      {p.status !== 'terbit' && <p className="catatan">Terbitkan pertemuan dulu sebelum membuka absen.</p>}
      {p.absen_terbuka ? (
        <>
          <p>Absen dibuka sampai <strong>{tglJam(p.absen_tutup)}</strong>.</p>
          {p.kode_absen && <p>Kode absen: <strong style={{ fontSize: '2rem', letterSpacing: '.2em' }}>{p.kode_absen}</strong><br /><span className="catatan">Tuliskan di papan agar hanya siswa yang hadir di kelas yang tahu.</span></p>}
          <div className="aksi"><button className="tombol tombol-isi" onClick={tutup} disabled={sibuk}>Tutup absen sekarang</button></div>
        </>
      ) : (
        <div className="form">
          <div className="grid grid-2">
            <label>Durasi (menit)<input type="number" min={1} max={240} value={menit} onChange={(e) => setMenit(Number(e.target.value))} /></label>
            <label className="centang" style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400, alignSelf: 'end' }}>
              <input type="checkbox" checked={kode} onChange={(e) => setKode(e.target.checked)} style={{ width: 'auto' }} /> Pakai kode 4 digit
            </label>
          </div>
          <div className="aksi"><button className="tombol tombol-isi" onClick={buka} disabled={sibuk || p.status !== 'terbit'}>Buka absen</button></div>
        </div>
      )}
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
    </div>
  )
}

function RekapPertemuan({ pertemuanId, versi }: { pertemuanId: string; versi: number }) {
  const [baris, setBaris] = useState<BarisAbsen[] | null>(null)
  const [progres, setProgres] = useState<Progres | null>(null)
  const [galat, setGalat] = useState('')
  const muat = useCallback(async () => {
    try {
      const [r, g] = await Promise.all([
        panggil<{ siswa: BarisAbsen[] }>('lms_rekap_pertemuan', { p_pertemuan: pertemuanId }),
        panggil<Progres>('lms_progres_baca', { p_pertemuan: pertemuanId }),
      ])
      setBaris(r.siswa); setProgres(g)
    } catch (e) { setGalat((e as Error).message) }
  }, [pertemuanId])
  useEffect(() => { void muat() }, [muat, versi])
  async function ubah(pd: string, status: string) {
    setGalat('')
    try { await panggil('lms_absen_guru', { p_pertemuan: pertemuanId, p_pd: pd, p_status: status, p_catatan: null }); await muat() } catch (e) { setGalat((e as Error).message) }
  }
  const hitung = (s: string) => (baris ?? []).filter((b) => b.status === s).length
  return (
    <div className="kartu jarak">
      <h3>Kehadiran siswa</h3>
      {baris && <p className="catatan">{hitung('hadir')} hadir, {hitung('izin')} izin, {hitung('sakit')} sakit, {hitung('alpa')} alpa, {hitung('belum')} belum dicatat.</p>}
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>No</th><th>Nama</th><th>Status</th><th>Materi selesai</th><th>Kuis</th><th>Ubah</th></tr></thead>
          <tbody>
            {!baris && <tr><td colSpan={6}>Memuat...</td></tr>}
            {(baris ?? []).map((b, i) => (
              <tr key={b.peserta_didik_id}>
                <td>{b.no_urut ?? i + 1}</td>
                <td>{b.nama}<br /><small>{b.nisn ?? ''}</small></td>
                <td><span className={`status ${kelasStatus[b.status]}`}>{labelStatus[b.status]}</span>{b.sumber === 'guru' ? <small> (guru)</small> : null}</td>
                <td>{(() => { const g = progres?.siswa.find((x) => x.peserta_didik_id === b.peserta_didik_id); return progres && progres.total_materi > 0 ? `${g?.materi_selesai ?? 0}/${progres.total_materi}` : '-' })()}</td>
                <td>{(() => { const g = progres?.siswa.find((x) => x.peserta_didik_id === b.peserta_didik_id); return progres && progres.total_kuis > 0 ? `${g?.kuis_selesai ?? 0}/${progres.total_kuis}` : '-' })()}</td>
                <td>
                  <select aria-label={`Ubah status ${b.nama}`} value="" onChange={(e) => e.target.value && void ubah(b.peserta_didik_id, e.target.value)}>
                    <option value="">Pilih</option>
                    {['hadir', 'izin', 'sakit', 'alpa'].map((s) => <option key={s} value={s}>{labelStatus[s]}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FormMateri({ pertemuanId, muat, awal, selesai }: { pertemuanId: string; muat: () => Promise<void>; awal?: Materi | null; selesai?: () => void }) {
  const [v, setV] = useState<{ jenis: string; judul: string; isi: string; url: string }>({ jenis: awal?.jenis ?? 'teks', judul: awal?.judul ?? '', isi: awal?.isi ?? '', url: awal?.url ?? '' })
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  async function simpan(e: FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat('')
    try {
      await panggil('lms_simpan_materi', {
        p_pertemuan: pertemuanId, p_id: awal?.id ?? null, p_jenis: v.jenis, p_judul: v.judul,
        p_isi: v.jenis === 'teks' ? v.isi : null, p_url: v.jenis === 'teks' ? null : v.url, p_urutan: null,
      })
      if (!awal) setV({ jenis: v.jenis, judul: '', isi: '', url: '' })
      await muat()
      selesai?.()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  return (
    <form className="kartu form jarak" onSubmit={simpan}>
      <h3>{awal ? 'Ubah materi' : 'Tambah materi'}</h3>
      <div className="grid grid-2">
        <label>Jenis
          <select value={v.jenis} onChange={(e) => setV({ ...v, jenis: e.target.value })}>
            <option value="teks">Bacaan (teks)</option><option value="video">Video (YouTube tidak terdaftar)</option>
            <option value="berkas">Berkas (tautan Drive)</option><option value="tautan">Tautan referensi</option>
          </select>
        </label>
        <label>Judul<input required maxLength={200} value={v.judul} onChange={(e) => setV({ ...v, judul: e.target.value })} /></label>
      </div>
      {v.jenis === 'teks'
        ? <label>Isi bacaan<textarea required rows={8} maxLength={20000} value={v.isi} onChange={(e) => setV({ ...v, isi: e.target.value })} /><span className="petunjuk">Teks biasa. Baris kosong memisahkan paragraf.</span></label>
        : <label>Tautan<input required type="url" pattern="https://.*" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} placeholder="https://" /><span className="petunjuk">Harus diawali https://.</span></label>}
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan materi'}</button>{awal && <button type="button" className="tombol" style={{ color: 'var(--warna-utama)' }} onClick={() => selesai?.()}>Batal</button>}</div>
    </form>
  )
}

/** Ruang satu pertemuan. Siswa: absen lalu materi. Guru: kontrol absen, penyusun materi, rekap. */
export function RuangPertemuan() {
  const { kelasId = '', id = '' } = useParams()
  const [kelas, setKelas] = useState<Kelas | null>(null)
  const [p, setP] = useState<Pertemuan | null>(null)
  const [materi, setMateri] = useState<Materi[] | null>(null)
  const [terkunci, setTerkunci] = useState(false)
  const [galat, setGalat] = useState('')
  const [pesan, setPesan] = useState('')
  const [kode, setKode] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [versi, setVersi] = useState(0)
  const [ubahMateri, setUbahMateri] = useState<string | null>(null)

  const muat = useCallback(async () => {
    try {
      const [k, daftar] = await Promise.all([panggil<Kelas[]>('lms_kelas_saya'), panggil<Pertemuan[]>('lms_pertemuan_daftar', { p_kelas: kelasId })])
      setKelas(k.find((x) => x.id === kelasId) ?? null)
      const cari = daftar.find((x) => x.id === id) ?? null
      setP(cari)
      if (!cari) { setGalat('Pertemuan tidak ditemukan.'); return }
      try {
        const r = await panggil<{ materi: Materi[] }>('lms_materi_buka', { p_pertemuan: id })
        setMateri(r.materi); setTerkunci(false)
      } catch (e) {
        const m = (e as Error).message
        if (m.startsWith('Absen dulu')) { setTerkunci(true); setMateri(null) } else throw e
      }
      setVersi((x) => x + 1)
    } catch (e) { setGalat((e as Error).message) }
  }, [kelasId, id])
  useEffect(() => { void muat() }, [muat])

  const kelola = kelas?.peran === 'pengelola'

  async function absen(e: FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat(''); setPesan('')
    try {
      const r = await panggil<{ ok: boolean; pesan: string }>('lms_absen', { p_pertemuan: id, p_kode: kode || null })
      if (r.ok) { setPesan(r.pesan); setKode('') } else setGalat(r.pesan)
      await muat()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  async function selesai(materiId: string) {
    try { await panggil('lms_tandai_selesai', { p_materi: materiId }); await muat() } catch (e) { setGalat((e as Error).message) }
  }
  async function hapus(materiId: string) {
    if (!window.confirm('Hapus materi ini?')) return
    try { await panggil('lms_hapus_materi', { p_materi: materiId }); await muat() } catch (e) { setGalat((e as Error).message) }
  }
  async function terbitkan(terbit: boolean) {
    if (!p) return
    try {
      await panggil('lms_simpan_pertemuan', { p_kelas: kelasId, p_id: id, p_judul: p.judul, p_tanggal: null, p_tujuan: p.tujuan, p_wajib_absen: p.wajib_absen, p_terbit: terbit })
      await muat()
    } catch (e) { setGalat((e as Error).message) }
  }

  return (
    <Halaman judul={p ? `Pertemuan ${p.nomor}: ${p.judul}` : 'Pertemuan'} lead={kelas ? `${kelas.mapel} ${kelas.rombel}${p ? `, ${tgl(p.tanggal)}` : ''}` : undefined}>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      {pesan && <div className="kartu hasil"><strong>{pesan}</strong></div>}
      {p?.tujuan && <div className="kartu"><small>Tujuan pembelajaran</small><p style={{ marginBottom: 0 }}>{p.tujuan}</p></div>}

      {kelola && p && (
        <>
          <div className="aksi">
            <span className={`status ${p.status === 'terbit' ? 'status-selesai' : 'status-menunggu'}`}>{p.status === 'terbit' ? 'Terbit' : 'Draf'}</span>
            <button className="tombol" style={{ color: 'var(--warna-utama)' }} onClick={() => void terbitkan(p.status !== 'terbit')}>{p.status === 'terbit' ? 'Tarik jadi draf' : 'Terbitkan'}</button>
          </div>
          <KontrolAbsen p={p} muat={muat} />
        </>
      )}

      {!kelola && p && terkunci && (
        <form className="kartu form jarak" onSubmit={absen}>
          <h3>Absen dulu</h3>
          <p>Materi terbuka setelah Anda tercatat hadir.</p>
          {p.absen_terbuka ? (
            <>
              <label>Kode absen<input inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={kode} onChange={(e) => setKode(e.target.value)} placeholder="4 digit, dari papan atau guru" /><span className="petunjuk">Kosongkan bila guru tidak memakai kode.</span></label>
              <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Mengirim...' : 'Saya hadir'}</button></div>
            </>
          ) : <p className="catatan">Absen belum dibuka atau sudah ditutup. Tunggu guru, lalu segarkan halaman. Bila Anda sudah hadir tetapi terlewat, minta guru mencatat kehadiran.</p>}
          <div className="aksi"><button type="button" className="tombol" style={{ color: 'var(--warna-utama)' }} onClick={() => void muat()}>Segarkan</button></div>
        </form>
      )}

      {materi && (
        <>
          <div className="judul-bagian jarak"><h2>Materi</h2></div>
          {materi.length === 0 && <div className="kartu"><p className="catatan">Belum ada materi pada pertemuan ini.</p></div>}
          {materi.map((m) => (
            <div key={m.id}>
              {ubahMateri === m.id
                ? <FormMateri pertemuanId={id} muat={muat} awal={m} selesai={() => setUbahMateri(null)} />
                : <IsiMateri m={m} siswa={!kelola} selesai={selesai} />}
              {kelola && ubahMateri !== m.id && (
                <div className="aksi">
                  <button className="tombol" style={{ color: 'var(--warna-utama)' }} onClick={() => setUbahMateri(m.id)}>Ubah materi ini</button>
                  <button className="tombol" style={{ color: '#8a1f1f', borderColor: '#8a1f1f' }} onClick={() => void hapus(m.id)}>Hapus materi ini</button>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {p && !terkunci && (kelola || p.status === 'terbit') && <Forum pertemuanId={id} kelola={kelola} />}

      {kelola && p && (
        <>
          <FormMateri pertemuanId={id} muat={muat} />
          <RekapPertemuan pertemuanId={id} versi={versi} />
        </>
      )}
      <Kembali ke={`/portal/lms/${kelasId}`} teks="Kembali ke daftar pertemuan" />
    </Halaman>
  )
}

/** Rekap kehadiran semua pertemuan satu kelas. */
export function RekapKelas() {
  const { kelasId = '' } = useParams()
  const [data, setData] = useState<{ total_sesi: number; siswa: BarisRekap[] } | null>(null)
  const [galat, setGalat] = useState('')
  useEffect(() => {
    panggil<{ total_sesi: number; siswa: BarisRekap[] }>('lms_rekap_kelas', { p_kelas: kelasId }).then(setData).catch((e: Error) => setGalat(e.message))
  }, [kelasId])
  return (
    <Halaman judul="Rekap kehadiran" lead={data ? `${data.total_sesi} pertemuan dengan absen dibuka.` : undefined}>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="tabel-bungkus">
        <table>
          <thead><tr><th>Nama</th><th>Hadir</th><th>Izin</th><th>Sakit</th><th>Alpa</th><th>Kehadiran</th></tr></thead>
          <tbody>
            {!data && <tr><td colSpan={6}>Memuat...</td></tr>}
            {(data?.siswa ?? []).map((s) => (
              <tr key={s.peserta_didik_id}>
                <td>{s.nama}<br /><small>{s.nisn ?? ''}</small></td>
                <td>{s.hadir}</td><td>{s.izin}</td><td>{s.sakit}</td><td>{s.alpa}</td>
                <td>{data && data.total_sesi > 0 ? `${Math.round((s.hadir / data.total_sesi) * 100)}%` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="aksi jarak">
        <button className="tombol" style={{ color: 'var(--warna-utama)' }} disabled={!data} onClick={() => data && unduhCsv('rekap-kehadiran.csv', [
          ['Nama', 'NISN', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Persen hadir'],
          ...data.siswa.map((s) => [s.nama, s.nisn, s.hadir, s.izin, s.sakit, s.alpa, data.total_sesi > 0 ? Math.round((s.hadir / data.total_sesi) * 100) : null]),
        ])}>Unduh CSV</button>
      </div>
      <p className="catatan jarak">Pertemuan yang belum dicatat untuk seorang siswa tidak dihitung hadir.</p>
      <Kembali ke={`/portal/lms/${kelasId}`} teks="Kembali ke kelas" />
    </Halaman>
  )
}
