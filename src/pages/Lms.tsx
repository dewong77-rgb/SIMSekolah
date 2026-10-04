import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { useAuth } from '../auth/AuthContext'
import { panggil, tgl, tglJam } from '../lib/rpc'
import { supabase } from '../lib/supabase'
import { DaftarKuis, LatihanPertemuan } from './LmsKuis'
import { DaftarTugas } from './LmsTugas'
import { Forum } from './LmsForum'
import { nilaiTeks, unduhCsv } from './lmsUtil'
import { LembarPratinjau, LembarSiswa } from './LmsLembar'
import PengingatLms from './LmsPengingat'
import { htmlAman, wordKeHtml, judulDariNama, BATAS_HTML } from '../lib/dokumen'
import { unduhRekapKelas } from './lmsXlsx'

// Semua data lewat fungsi basis data lms_*. Tabel LMS tidak punya policy, jadi tidak dibaca langsung.

type Kelas = {
  id: string; mapel: string; rombel: string; rombel_id: string; guru: string; semester: string
  peran: 'pengelola' | 'siswa'; jumlah_pertemuan: number
}
type Pertemuan = {
  id: string; nomor: number; judul: string; tanggal: string; tujuan: string | null
  status: 'draf' | 'terbit'; wajib_absen: boolean; absen_terbuka: boolean; absen_tutup: string | null
  kode_absen: string | null; jumlah_materi: number; jumlah_latihan: number; hadir: number | null; status_saya: string | null
  kelengkapan: Kelengkapan | null
}
type Kelengkapan = { materi: number; latihan: number; forum: number; lengkap: boolean; kurang: string[] }
type Materi = { id: string; urutan: number; jenis: 'teks' | 'video' | 'tautan' | 'berkas'; judul: string; isi: string | null; url: string | null; selesai: boolean; format: 'teks' | 'html'; untuk: 'siswa' | 'guru'; tugas_id?: string | null }
type BarisAbsen = { peserta_didik_id: string; nama: string; nisn: string | null; no_urut: number | null; status: string; sumber: string | null; catatan: string | null }
type BarisTerpadu = {
  peserta_didik_id: string; nama: string; nisn: string | null; no_urut: number | null; absen: string
  materi_selesai: number; latihan_selesai: number; latihan_nilai: number | null
  lembar_status?: 'terkumpul' | 'dinilai' | null; lembar_nilai?: number | null
  forum_topik: number; forum_balasan: number; forum_total: number
}
type Terpadu = { total_lembar?: number; total_materi: number; total_latihan: number; total_topik: number; siswa: BarisTerpadu[] }
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
      <PengingatLms maks={4} />
      <p className="catatan"><Link to="/portal/panduan-lms">Panduan singkat ruang belajar</Link></p>
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
  const [v, setV] = useState({ judul: '', tanggal: '', tujuan: '', wajib: true })

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
        p_tujuan: v.tujuan || null, p_wajib_absen: v.wajib, p_terbit: false,
      })
      setV({ judul: '', tanggal: '', tujuan: '', wajib: true }); setForm(false)
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
          <p className="catatan">Pertemuan baru berstatus draf. Isi materi, latihan soal, dan forum diskusi, lalu terbitkan dari ruang pertemuan.</p>
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
                  {kelola && p.kelengkapan
                    ? <small>
                        <span className={`status ${p.kelengkapan.materi > 0 ? 'status-selesai' : 'status-dibatalkan'}`}>Materi {p.kelengkapan.materi}</span>{' '}
                        <span className={`status ${p.kelengkapan.latihan > 0 ? 'status-selesai' : 'status-dibatalkan'}`}>Latihan {p.kelengkapan.latihan}</span>{' '}
                        <span className={`status ${p.kelengkapan.forum > 0 ? 'status-selesai' : 'status-dibatalkan'}`}>Forum {p.kelengkapan.forum}</span>
                        {p.status === 'draf' ? <> <span className="status status-menunggu">Draf</span></> : null}
                      </small>
                    : <small>{p.jumlah_materi} materi, {p.jumlah_latihan} latihan</small>}
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

function IsiMateri({ m, siswa, selesai, pratinjau }: { m: Materi; siswa: boolean; selesai: (id: string) => Promise<void>; pratinjau?: boolean }) {
  if (pratinjau && m.tugas_id && m.format === 'html') return <LembarPratinjau html={m.isi ?? ''} judul={m.judul} />
  if (siswa && m.tugas_id && m.format === 'html') return <LembarSiswa tugasId={m.tugas_id} html={m.isi ?? ''} judul={m.judul} />
  const yt = m.jenis === 'video' && m.url ? idYoutube(m.url) : null
  return (
    <div className="kartu jarak">
      <div className="lencana-baris">
        <span className="lencana">{m.jenis === 'teks' && m.format === 'html' ? 'Dokumen' : labelJenis[m.jenis]}</span>
        {m.untuk === 'guru' && <span className="status status-menunggu">Khusus guru, siswa tidak melihat</span>}
        {m.tugas_id && !siswa && <span className="status status-selesai">Lembar kerja, siswa mengisi di sini</span>}
        {m.selesai && <span className="status status-selesai">Selesai dibaca</span>}
      </div>
      <h3>{m.judul}</h3>
      {m.jenis === 'teks' && m.format === 'html' && <div className="dokumen" dangerouslySetInnerHTML={{ __html: htmlAman(m.isi ?? '') }} />}
      {m.jenis === 'teks' && m.format !== 'html' && <div style={{ whiteSpace: 'pre-wrap' }}>{m.isi}</div>}
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
      {siswa && !pratinjau && !m.selesai && <div className="aksi"><button className="tombol" style={{ color: 'var(--warna-utama)' }} onClick={() => void selesai(m.id)}>Tandai sudah selesai</button></div>}
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

function RekapPertemuan({ pertemuanId, nomor, versi }: { pertemuanId: string; nomor: number; versi: number }) {
  const [baris, setBaris] = useState<BarisAbsen[] | null>(null)
  const [t, setT] = useState<Terpadu | null>(null)
  const [galat, setGalat] = useState('')
  const muat = useCallback(async () => {
    try {
      const [r, g] = await Promise.all([
        panggil<{ siswa: BarisAbsen[] }>('lms_rekap_pertemuan', { p_pertemuan: pertemuanId }),
        panggil<Terpadu>('lms_pertemuan_rekap_terpadu', { p_pertemuan: pertemuanId }),
      ])
      setBaris(r.siswa); setT(g)
    } catch (e) { setGalat((e as Error).message) }
  }, [pertemuanId])
  useEffect(() => { void muat() }, [muat, versi])
  const [langsung, setLangsung] = useState(true)
  const [saring, setSaring] = useState('semua')
  useEffect(() => {
    if (!langsung) return
    const j = window.setInterval(() => { if (document.visibilityState === 'visible') void muat() }, 20_000)
    return () => window.clearInterval(j)
  }, [langsung, muat])
  async function ubah(pd: string, status: string) {
    setGalat('')
    try { await panggil('lms_absen_guru', { p_pertemuan: pertemuanId, p_pd: pd, p_status: status, p_catatan: null }); await muat() } catch (e) { setGalat((e as Error).message) }
  }
  const hitung = (s: string) => (baris ?? []).filter((b) => b.status === s).length
  const sumber = (pd: string) => baris?.find((b) => b.peserta_didik_id === pd)?.sumber
  const n = t?.siswa.length ?? 0
  const pct = (x: number) => (n > 0 ? Math.round((x / n) * 100) : 0)
  const bacaSemua = t ? t.siswa.filter((x) => t.total_materi > 0 && x.materi_selesai >= t.total_materi).length : 0
  const latihanSemua = t ? t.siswa.filter((x) => t.total_latihan > 0 && x.latihan_selesai >= t.total_latihan).length : 0
  const aktifForum = t ? t.siswa.filter((x) => x.forum_total > 0).length : 0
  const kiriman = t ? t.siswa.reduce((j, x) => j + x.forum_total, 0) : 0
  function unduh() {
    if (!t) return
    unduhCsv(`rekap-pertemuan-${nomor}.csv`, [
      ['No', 'Nama', 'NISN', 'Kehadiran', 'Materi selesai', 'Total materi', 'Latihan selesai', 'Total latihan', 'Nilai latihan', 'Lembar kerja', 'Nilai lembar', 'Topik forum', 'Balasan forum', 'Total kiriman forum'],
      ...t.siswa.map((x, i) => [x.no_urut ?? i + 1, x.nama, x.nisn, labelStatus[x.absen] ?? x.absen, x.materi_selesai, t.total_materi, x.latihan_selesai, t.total_latihan, x.latihan_nilai, (t.total_lembar ?? 0) > 0 ? (x.lembar_status ?? 'belum') : '', x.lembar_nilai ?? '', x.forum_topik, x.forum_balasan, x.forum_total]),
    ])
  }
  return (
    <div className="kartu jarak">
      <h3>Rekap pertemuan ini</h3>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {baris && t && (
        <div className="grid grid-3">
          <div><small>Kehadiran</small><p style={{ margin: 0, fontSize: '1.2rem' }}>{hitung('hadir')} dari {n}</p><small>{hitung('izin')} izin, {hitung('sakit')} sakit, {hitung('alpa')} alpa, {hitung('belum')} belum dicatat</small></div>
          <div><small>Materi dibaca tuntas</small><p style={{ margin: 0, fontSize: '1.2rem' }}>{t.total_materi > 0 ? `${bacaSemua} siswa (${pct(bacaSemua)}%)` : '-'}</p><small>{t.total_materi} materi pada pertemuan ini</small></div>
          <div><small>Latihan soal selesai</small><p style={{ margin: 0, fontSize: '1.2rem' }}>{t.total_latihan > 0 ? `${latihanSemua} siswa (${pct(latihanSemua)}%)` : '-'}</p><small>{t.total_latihan} latihan terbit</small></div>
          <div><small>Aktif di forum</small><p style={{ margin: 0, fontSize: '1.2rem' }}>{aktifForum} siswa ({pct(aktifForum)}%)</p><small>{kiriman} kiriman siswa, {t.total_topik} topik</small></div>
        </div>
      )}
      <div className="aksi jarak">
        <button className="tombol" style={{ color: 'var(--warna-utama)' }} disabled={!t} onClick={unduh}>Unduh CSV</button>
        <label className="baris-centang"><input type="checkbox" checked={langsung} onChange={(e) => setLangsung(e.target.checked)} /> Pantau langsung (segar tiap 20 detik)</label>
        <label>Tampilkan
          <select value={saring} onChange={(e) => setSaring(e.target.value)}>
            <option value="semua">Semua siswa</option><option value="belum_absen">Belum absen</option>
            <option value="belum_lembar">Belum mengumpulkan lembar</option><option value="belum_latihan">Belum menyelesaikan latihan</option>
            <option value="belum_forum">Belum ikut forum</option>
          </select>
        </label>
      </div>
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>No</th><th>Nama</th><th>Kehadiran</th><th>Materi</th><th>Latihan</th>{(t?.total_lembar ?? 0) > 0 && <th>Lembar kerja</th>}<th>Forum</th><th>Ubah absen</th></tr></thead>
          <tbody>
            {!t && <tr><td colSpan={8}>Memuat...</td></tr>}
            {(t?.siswa ?? []).filter((x) => saring === 'semua' || (saring === 'belum_absen' && x.absen === 'belum') || (saring === 'belum_lembar' && !x.lembar_status) || (saring === 'belum_latihan' && t!.total_latihan > 0 && x.latihan_selesai < t!.total_latihan) || (saring === 'belum_forum' && x.forum_total === 0)).map((x, i) => (
              <tr key={x.peserta_didik_id}>
                <td>{x.no_urut ?? i + 1}</td>
                <td>{x.nama}<br /><small>{x.nisn ?? ''}</small></td>
                <td><span className={`status ${kelasStatus[x.absen]}`}>{labelStatus[x.absen]}</span>{sumber(x.peserta_didik_id) === 'guru' ? <small> (guru)</small> : null}</td>
                <td>{t && t.total_materi > 0 ? `${x.materi_selesai}/${t.total_materi}` : '-'}</td>
                <td>{t && t.total_latihan > 0 ? <>{x.latihan_selesai}/{t.total_latihan}{x.latihan_nilai !== null ? <><br /><small>nilai {nilaiTeks(x.latihan_nilai)}</small></> : null}</> : '-'}</td>
                {(t?.total_lembar ?? 0) > 0 && <td>{x.lembar_status ? <>{x.lembar_status === 'dinilai' ? 'Dinilai' : 'Terkumpul'}{x.lembar_nilai != null ? <><br /><small>nilai {nilaiTeks(x.lembar_nilai)}</small></> : null}</> : <small>Belum</small>}</td>}
                <td>{x.forum_total > 0 ? <>{x.forum_total} kiriman<br /><small>{x.forum_topik} topik, {x.forum_balasan} balasan</small></> : <small>Belum ikut</small>}</td>
                <td>
                  <select aria-label={`Ubah status ${x.nama}`} value="" onChange={(e) => e.target.value && void ubah(x.peserta_didik_id, e.target.value)}>
                    <option value="">Pilih</option>
                    {['hadir', 'izin', 'sakit', 'alpa'].map((st) => <option key={st} value={st}>{labelStatus[st]}</option>)}
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

type Tujuan = { kelas_id: string; rombel: string; mapel: string; jumlah_siswa: number; sudah_ada: boolean }

/** Salin pertemuan (materi, latihan soal, topik forum pembuka) ke kelas lain dengan mata pelajaran yang sama. */
function SalinPertemuan({ pertemuanId, versi }: { pertemuanId: string; versi: number }) {
  const [tujuan, setTujuan] = useState<Tujuan[] | null>(null)
  const [pilih, setPilih] = useState<string[]>([])
  const [galat, setGalat] = useState('')
  const [hasil, setHasil] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const muat = useCallback(async () => {
    try { setTujuan(await panggil<Tujuan[]>('lms_salin_tujuan', { p_pertemuan: pertemuanId })) } catch (e) { setGalat((e as Error).message) }
  }, [pertemuanId])
  useEffect(() => { void muat() }, [muat, versi])
  const bisa = (tujuan ?? []).filter((t) => !t.sudah_ada)
  const alih = (id: string) => setPilih((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))
  async function salin() {
    setSibuk(true); setGalat(''); setHasil('')
    try {
      const r = await panggil<{ disalin: number; dilewati: string[] }>('lms_salin_pertemuan', { p_pertemuan: pertemuanId, p_kelas: pilih })
      setHasil(`Disalin ke ${r.disalin} kelas sebagai draf.${r.dilewati.length ? ` Dilewati karena sudah ada: ${r.dilewati.join(', ')}.` : ''}`)
      setPilih([]); await muat()
    } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  if (tujuan && tujuan.length === 0 && !hasil) return null
  return (
    <div className="kartu jarak">
      <h3>Salin ke kelas lain</h3>
      <p className="catatan">Materi, latihan soal, dan topik forum pembuka ikut disalin sebagai draf. Absen, balasan forum, nilai, jadwal latihan, dan tanggal terbit tetap terpisah per kelas.</p>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {hasil && <div className="kartu hasil"><strong>{hasil}</strong><br /><small>Buka tiap kelas untuk mengatur jadwal latihan, membuka absen, lalu menerbitkan.</small></div>}
      {!tujuan && !galat && <p className="catatan">Memuat...</p>}
      {tujuan && tujuan.length > 0 && (
        <>
          <div className="aksi">
            <button type="button" className="tombol" style={{ color: 'var(--warna-utama)' }} onClick={() => setPilih(pilih.length === bisa.length ? [] : bisa.map((t) => t.kelas_id))} disabled={bisa.length === 0}>
              {pilih.length === bisa.length && bisa.length > 0 ? 'Kosongkan pilihan' : 'Pilih semua'}
            </button>
          </div>
          {tujuan.map((t) => (
            <label key={t.kelas_id} className="centang" style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400, margin: '6px 0' }}>
              <input type="checkbox" style={{ width: 'auto' }} disabled={t.sudah_ada} checked={pilih.includes(t.kelas_id)} onChange={() => alih(t.kelas_id)} />
              {t.rombel} <small>{t.jumlah_siswa} siswa{t.sudah_ada ? ', sudah ada pertemuan berjudul sama' : ''}</small>
            </label>
          ))}
          <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk || pilih.length === 0} onClick={() => void salin()}>{sibuk ? 'Menyalin...' : `Salin ke ${pilih.length} kelas`}</button></div>
        </>
      )}
    </div>
  )
}

/** Tiga isian wajib satu pertemuan. Pertemuan baru bisa diterbitkan setelah ketiganya ada. */
function PanelKelengkapan({ k }: { k: Kelengkapan | null }) {
  if (!k) return null
  const baris: [string, number, string, string][] = [
    ['Materi', k.materi, '#materi', k.materi > 0 ? `${k.materi} materi` : 'Belum ada materi'],
    ['Latihan soal', k.latihan, '#latihan', k.latihan > 0 ? `${k.latihan} latihan dengan soal` : 'Belum ada latihan dengan soal'],
    ['Forum diskusi', k.forum, '#forum', k.forum > 0 ? `${k.forum} topik` : 'Belum ada topik diskusi'],
  ]
  return (
    <div className="kartu jarak">
      <h3>Kelengkapan pertemuan</h3>
      <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
        {baris.map(([nama, jml, tuju, teks]) => (
          <li key={nama}>
            <span className={`status ${jml > 0 ? 'status-selesai' : 'status-ditolak'}`}>{jml > 0 ? 'Lengkap' : 'Belum'}</span>{' '}
            <a href={tuju}><strong>{nama}</strong></a>: {teks}
          </li>
        ))}
      </ul>
      <p className="catatan">{k.lengkap ? 'Ketiganya sudah ada. Pertemuan siap diterbitkan.' : `Lengkapi dulu ${k.kurang.join(', ')} sebelum menerbitkan.`}</p>
    </div>
  )
}

function FormMateri({ pertemuanId, muat, awal, selesai }: { pertemuanId: string; muat: () => Promise<void>; awal?: Materi | null; selesai?: () => void }) {
  const [v, setV] = useState<{ jenis: string; judul: string; isi: string; url: string; untuk: string }>({ jenis: awal?.jenis ?? 'teks', judul: awal?.judul ?? '', isi: awal?.isi ?? '', url: awal?.url ?? '', untuk: awal?.untuk ?? 'siswa' })
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const dokumen = awal?.format === 'html'
  async function ubahLembar(aktif: boolean) {
    if (!awal) return
    setSibuk(true); setGalat('')
    try { await panggil('lms_materi_lembar', { p_materi: awal.id, p_aktif: aktif }); await muat(); selesai?.() } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  async function simpan(e: FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat('')
    try {
      await panggil('lms_materi_tulis', {
        p_pertemuan: pertemuanId, p_id: awal?.id ?? null, p_jenis: v.jenis, p_judul: v.judul,
        p_isi: v.jenis === 'teks' ? v.isi : null, p_url: v.jenis === 'teks' ? null : v.url,
        p_format: dokumen ? 'html' : 'teks', p_untuk: v.untuk,
      })
      if (!awal) setV({ jenis: v.jenis, judul: '', isi: '', url: '', untuk: v.untuk })
      await muat()
      selesai?.()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  return (
    <form className="kartu form jarak" onSubmit={simpan}>
      <h3>{awal ? 'Ubah materi' : 'Tambah materi manual'}</h3>
      <div className="grid grid-2">
        <label>Jenis
          <select value={v.jenis} disabled={dokumen} onChange={(e) => setV({ ...v, jenis: e.target.value })}>
            <option value="teks">{dokumen ? 'Dokumen (hasil impor Word)' : 'Bacaan (teks)'}</option><option value="video">Video (YouTube tidak terdaftar)</option>
            <option value="berkas">Berkas (tautan Drive)</option><option value="tautan">Tautan referensi</option>
          </select>
        </label>
        <label>Judul<input required maxLength={200} value={v.judul} onChange={(e) => setV({ ...v, judul: e.target.value })} /></label>
      </div>
      <label>Terlihat oleh
        <select value={v.untuk} onChange={(e) => setV({ ...v, untuk: e.target.value })}>
          <option value="siswa">Siswa dan guru</option><option value="guru">Guru saja</option>
        </select>
      </label>
      {dokumen && awal && (
        <label className="baris-centang"><input type="checkbox" checked={!!awal.tugas_id} disabled={sibuk || v.untuk !== 'siswa'} onChange={(e) => void ubahLembar(e.target.checked)} /> Lembar kerja: siswa mengisi langsung di aplikasi dan melampirkan foto</label>
      )}
      {dokumen
        ? <p className="catatan">Isi dokumen tidak diubah di sini. Untuk mengganti isinya, impor ulang dari Word lalu hapus yang lama.</p>
        : v.jenis === 'teks'
          ? <label>Isi bacaan<textarea required rows={8} maxLength={20000} value={v.isi} onChange={(e) => setV({ ...v, isi: e.target.value })} /><span className="petunjuk">Teks biasa. Baris kosong memisahkan paragraf.</span></label>
          : <label>Tautan<input required type="url" pattern="https://.*" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} placeholder="https://" /><span className="petunjuk">Harus diawali https://.</span></label>}
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan materi'}</button>{awal && <button type="button" className="tombol" style={{ color: 'var(--warna-utama)' }} onClick={() => selesai?.()}>Batal</button>}</div>
    </form>
  )
}

type BarisImpor = { nama: string; judul: string; untuk: 'siswa' | 'guru' | 'lembar'; html: string; ukuran: number; galat: string }

/** Perkiraan tujuan dari nama berkas: file pertemuan, modul, RPP, ATP untuk guru. Lainnya untuk siswa. */
const tebakUntuk = (nama: string): 'siswa' | 'guru' | 'lembar' => (/pertemuan|modul|rpp|atp|kktp|rubrik|kunci/i.test(nama) ? 'guru' : /lembar|lks|worksheet|kerja/i.test(nama) ? 'lembar' : 'siswa')
const urutanImpor = (nama: string) => (/bacaan|materi/i.test(nama) ? 0 : /lembar|kerja|tutorial|latihan/i.test(nama) ? 1 : tebakUntuk(nama) === 'guru' ? 3 : 2)

/** Impor satu atau beberapa dokumen Word sebagai materi. Yang untuk siswa langsung tampil di halaman siswa. */
function ImporDokumen({ pertemuanId, muat }: { pertemuanId: string; muat: () => Promise<void> }) {
  const [baris, setBaris] = useState<BarisImpor[]>([])
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [membaca, setMembaca] = useState(false)
  const [hasil, setHasil] = useState('')
  async function pilih(files: FileList | null) {
    if (!files || files.length === 0) return
    setMembaca(true); setGalat(''); setHasil('')
    const daftar = Array.from(files).sort((a, b) => urutanImpor(a.name) - urutanImpor(b.name))
    const baru: BarisImpor[] = []
    for (const f of daftar) {
      try {
        const r = await wordKeHtml(f)
        baru.push({ nama: f.name, judul: r.judul || judulDariNama(f.name), untuk: tebakUntuk(f.name), html: r.html, ukuran: r.ukuran, galat: '' })
      } catch (e) { baru.push({ nama: f.name, judul: judulDariNama(f.name), untuk: 'siswa', html: '', ukuran: 0, galat: (e as Error).message }) }
    }
    setBaris(baru); setMembaca(false)
  }
  const siap = baris.filter((b) => !b.galat && b.html && b.ukuran <= BATAS_HTML)
  async function impor() {
    setSibuk(true); setGalat(''); setHasil('')
    let n = 0
    try {
      for (const b of siap) {
        const idM = await panggil<string>('lms_materi_tulis', { p_pertemuan: pertemuanId, p_id: null, p_jenis: 'teks', p_judul: b.judul, p_isi: b.html, p_url: null, p_format: 'html', p_untuk: b.untuk === 'guru' ? 'guru' : 'siswa' })
        if (b.untuk === 'lembar') await panggil('lms_materi_lembar', { p_materi: idM, p_aktif: true })
        n++
      }
      setHasil(`${n} dokumen diimpor.`); setBaris([])
      await muat()
    } catch (e) { setGalat(`${(e as Error).message}${n ? ` (${n} dokumen sebelumnya sudah masuk)` : ''}`); await muat() }
    setSibuk(false)
  }
  return (
    <div className="kartu form jarak">
      <h3>Impor dari Word</h3>
      <p className="catatan">Pilih satu atau beberapa berkas .docx sekaligus. Isinya langsung tampil di halaman siswa sebagai bacaan, tabel dan tautan ikut terbawa. Pilih Lembar kerja bila siswa harus mengisinya langsung: sel kosong, garis isian, dan kotak centang menjadi kolom yang bisa diisi, lengkap dengan lampiran foto. Berkas untuk guru (misalnya File Pertemuan) ditandai Guru saja, tidak terlihat siswa.</p>
      <label>Berkas Word (.docx)<input type="file" multiple accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => { void pilih(e.target.files); e.target.value = '' }} /></label>
      {membaca && <p className="catatan">Membaca dokumen...</p>}
      {baris.length > 0 && (
        <div className="tabel-bungkus">
          <table>
            <thead><tr><th>Berkas</th><th>Judul materi</th><th>Terlihat oleh</th></tr></thead>
            <tbody>
              {baris.map((b, i) => (
                <tr key={b.nama + i}>
                  <td>{b.nama}{b.galat ? <><br /><small className="galat">{b.galat}</small></> : <><br /><small>{Math.round(b.ukuran / 1000)} KB</small></>}</td>
                  <td><input aria-label={`Judul ${b.nama}`} maxLength={200} value={b.judul} disabled={!!b.galat} onChange={(e) => setBaris(baris.map((x, j) => (j === i ? { ...x, judul: e.target.value } : x)))} /></td>
                  <td>
                    <select aria-label={`Tujuan ${b.nama}`} value={b.untuk} disabled={!!b.galat} onChange={(e) => setBaris(baris.map((x, j) => (j === i ? { ...x, untuk: e.target.value as 'siswa' | 'guru' | 'lembar' } : x)))}>
                      <option value="siswa">Bacaan siswa</option><option value="lembar">Lembar kerja (siswa mengisi)</option><option value="guru">Guru saja</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {hasil && <div className="kartu hasil"><strong>{hasil}</strong></div>}
      {siap.length > 0 && <div className="aksi"><button type="button" className="tombol tombol-isi" disabled={sibuk} onClick={() => void impor()}>{sibuk ? 'Mengimpor...' : `Impor ${siap.length} dokumen`}</button></div>}
    </div>
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
  const [pratinjau, setPratinjau] = useState(false)

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
  async function terbitPaksa() {
    if (!window.confirm('Pertemuan belum lengkap. Tetap diterbitkan sekarang? Siswa langsung bisa membukanya.')) return
    try { await panggil('lms_terbitkan_paksa', { p_pertemuan: id }); await muat() } catch (e) { setGalat((e as Error).message) }
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
            <button className="tombol" style={{ color: 'var(--warna-utama)' }} disabled={p.status !== 'terbit' && !p.kelengkapan?.lengkap} onClick={() => void terbitkan(p.status !== 'terbit')}>{p.status === 'terbit' ? 'Tarik jadi draf' : 'Terbitkan'}</button>
          </div>
          <PanelKelengkapan k={p.kelengkapan} />
          {p.status !== 'terbit' && p.kelengkapan && !p.kelengkapan.lengkap && (
            <div className="aksi"><button type="button" className="tombol" onClick={() => void terbitPaksa()}>Terbitkan sekarang walau belum lengkap</button></div>
          )}
          <div className="aksi"><label className="baris-centang"><input type="checkbox" checked={pratinjau} onChange={(e) => setPratinjau(e.target.checked)} /> Lihat sebagai siswa (pratinjau, tidak ada yang tersimpan)</label></div>
          <SalinPertemuan pertemuanId={id} versi={versi} />
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
          <div className="judul-bagian jarak" id="materi"><h2>Materi</h2></div>
          {materi.length === 0 && <div className="kartu"><p className="catatan">Belum ada materi pada pertemuan ini.</p></div>}
          {pratinjau && <p className="catatan">Pratinjau tampilan siswa. Materi Guru saja disembunyikan, lembar kerja bisa dicoba tetapi tidak tersimpan.</p>}
          {materi.filter((m) => !pratinjau || m.untuk === 'siswa').map((m) => (
            <div key={m.id}>
              {ubahMateri === m.id
                ? <FormMateri pertemuanId={id} muat={muat} awal={m} selesai={() => setUbahMateri(null)} />
                : <IsiMateri m={m} siswa={!kelola} selesai={selesai} pratinjau={pratinjau} />}
              {kelola && !pratinjau && ubahMateri !== m.id && (
                <div className="aksi">
                  <button className="tombol" style={{ color: 'var(--warna-utama)' }} onClick={() => setUbahMateri(m.id)}>Ubah materi ini</button>
                  <button className="tombol" style={{ color: '#8a1f1f', borderColor: '#8a1f1f' }} onClick={() => void hapus(m.id)}>Hapus materi ini</button>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {kelola && p && materi && <><ImporDokumen pertemuanId={id} muat={muat} /><FormMateri pertemuanId={id} muat={muat} /></>}

      {p && !terkunci && (kelola || p.status === 'terbit') && (
        <>
          <LatihanPertemuan kelasId={kelasId} pertemuanId={id} judul={p.judul} kelola={kelola} perbarui={() => void muat()} versi={versi} />
          <div id="forum"><Forum pertemuanId={id} kelola={kelola} setelah={kelola ? () => void muat() : undefined} /></div>
        </>
      )}

      {kelola && p && (
        <>
          <RekapPertemuan pertemuanId={id} nomor={p.nomor} versi={versi} />
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
