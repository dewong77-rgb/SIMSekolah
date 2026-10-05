import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { panggil, tglJam } from '../lib/rpc'
import { biru, nilaiTeks } from './lmsUtil'

// Progres belajar: untuk siswa (milik sendiri) dan orang tua (anak yang ditautkan). Hanya baca.
// Tambahan: halaman admin TU untuk menautkan akun orang tua ke anak.

export type KelasRingkas = {
  kelas_id: string; mapel: string; rombel: string; guru: string
  sesi: number; hadir: number; izin: number; sakit: number; alpa: number
  materi_total: number; materi_selesai: number
  kuis: { judul: string; jenis: string; kkm: number | null; status: 'belum' | 'disembunyikan' | 'menunggu' | 'nilai'; nilai: number | null }[]
  tugas: { judul: string; tenggat: string | null; nilai_maks: number; status: string; nilai: number | null }[]
}

/** Email teknis akun orang tua adalah <NIK>@ortu.invalid. Ditampilkan sebagian saja. */
const namaAkun = (email: string) => {
  const m = /^(\d{16})@ortu\.invalid$/.exec(email)
  return m ? `NIK ibu ${m[1].slice(0, 6)}******${m[1].slice(-4)}` : email
}

const labelTugas: Record<string, string> = { belum: 'Belum', terkumpul: 'Terkumpul', terlambat: 'Terlambat', dinilai: 'Dinilai' }
const labelJenis: Record<string, string> = { kuis: 'Kuis', ulangan_harian: 'Ulangan harian', ulangan_tengah: 'UTS', ulangan_semester: 'UAS' }

function teksKuis(q: KelasRingkas['kuis'][number]): string {
  if (q.status === 'belum') return 'Belum dikerjakan'
  if (q.status === 'disembunyikan') return 'Dikerjakan, nilai ditampilkan oleh guru'
  if (q.status === 'menunggu') return 'Menunggu koreksi guru'
  const lulus = q.kkm !== null && q.nilai !== null ? (Number(q.nilai) >= Number(q.kkm) ? ', mencapai KKM' : ', di bawah KKM') : ''
  return `${nilaiTeks(q.nilai)}${lulus}`
}

export function KartuKelas({ k, tautan }: { k: KelasRingkas; tautan: boolean }) {
  const persen = k.sesi > 0 ? Math.round((k.hadir / k.sesi) * 100) : null
  const tugasSelesai = k.tugas.filter((t) => t.status !== 'belum').length
  return (
    <div className="kartu" style={{ marginTop: 8 }}>
      <h3 style={{ marginTop: 0 }}>
        {tautan ? <Link to={`/portal/lms/${k.kelas_id}`}>{k.mapel}</Link> : k.mapel} <small>{k.rombel}, {k.guru}</small>
      </h3>
      <div className="grid grid-3">
        <div><small>Kehadiran</small><p style={{ margin: 0, fontSize: '1.2rem' }}>{persen === null ? '-' : `${persen}%`}</p>
          <small>{k.hadir} hadir, {k.izin} izin, {k.sakit} sakit, {k.alpa} alpa dari {k.sesi} pertemuan</small></div>
        <div><small>Materi dibaca</small><p style={{ margin: 0, fontSize: '1.2rem' }}>{k.materi_selesai} dari {k.materi_total}</p>
          <small>Materi yang ditandai selesai</small></div>
        <div><small>Tugas dikumpulkan</small><p style={{ margin: 0, fontSize: '1.2rem' }}>{tugasSelesai} dari {k.tugas.length}</p>
          <small>Tugas yang sudah terbit</small></div>
      </div>
      {k.kuis.length > 0 && (
        <div className="tabel-bungkus jarak"><table>
          <thead><tr><th>Kuis dan ulangan</th><th>Hasil</th></tr></thead>
          <tbody>{k.kuis.map((q, n) => <tr key={n}><td>{q.judul}<br /><small>{labelJenis[q.jenis] ?? q.jenis}</small></td><td>{teksKuis(q)}</td></tr>)}</tbody>
        </table></div>
      )}
      {k.tugas.length > 0 && (
        <div className="tabel-bungkus jarak"><table>
          <thead><tr><th>Tugas</th><th>Tenggat</th><th>Status</th><th>Nilai</th></tr></thead>
          <tbody>{k.tugas.map((t, n) => (
            <tr key={n}><td>{t.judul}</td><td>{t.tenggat ? tglJam(t.tenggat) : '-'}</td><td>{labelTugas[t.status] ?? t.status}</td>
              <td>{t.nilai === null ? '-' : `${nilaiTeks(t.nilai)}/${t.nilai_maks}`}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  )
}

/** Progres belajar siswa sendiri, lintas mata pelajaran. */
export function ProgresSaya() {
  const [data, setData] = useState<{ nama: string; kelas: KelasRingkas[] } | null>(null)
  const [galat, setGalat] = useState('')
  useEffect(() => { panggil<{ nama: string; kelas: KelasRingkas[] }>('lms_progres_saya').then(setData).catch((e: Error) => setGalat(e.message)) }, [])
  return (
    <Halaman judul="Progres saya" lead="Kehadiran, materi, nilai kuis, dan tugas di semua mata pelajaran.">
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {!data && !galat && <p className="catatan">Memuat...</p>}
      {data && data.kelas.length === 0 && <div className="kartu"><p>Belum ada kelas ajar untuk rombel Anda.</p></div>}
      {(data?.kelas ?? []).map((k) => <KartuKelas key={k.kelas_id} k={k} tautan />)}
      <p className="catatan jarak"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

type Ortu = { user_id: string; email: string; anak: { id: string; nama: string; nisn: string | null }[] }
type Siswa = { id: string; nama: string; nisn: string | null; rombel: string | null }

/** Admin TU: tautkan akun orang tua ke anak. Akun orang tua dibuat dulu di Pengguna dan akun. */
export function TautanOrtu() {
  const [daftar, setDaftar] = useState<Ortu[] | null>(null)
  const [galat, setGalat] = useState('')
  const [pilih, setPilih] = useState('')
  const [q, setQ] = useState('')
  const [hasil, setHasil] = useState<Siswa[] | null>(null)
  const [sibuk, setSibuk] = useState(false)
  const muat = useCallback(async () => {
    try { setDaftar(await panggil<Ortu[]>('ortu_tautan_daftar')) } catch (e) { setGalat((e as Error).message) }
  }, [])
  useEffect(() => { void muat() }, [muat])
  async function cari(e: FormEvent) {
    e.preventDefault()
    setGalat('')
    try { setHasil(await panggil<Siswa[]>('ortu_cari_siswa', { p_q: q })) } catch (er) { setGalat((er as Error).message) }
  }
  async function tautkan(pd: string) {
    if (!pilih) { setGalat('Pilih akun orang tua dulu.'); return }
    setSibuk(true); setGalat('')
    try { await panggil('ortu_tautkan', { p_user: pilih, p_pd: pd }); await muat() } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  return (
    <Halaman judul="Tautan orang tua" lead="Hubungkan akun orang tua ke anaknya supaya bisa melihat profil dan progres belajar.">
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="kartu form">
        <h3>Tautkan anak</h3>
        <label>Akun orang tua
          <select value={pilih} onChange={(e) => setPilih(e.target.value)}>
            <option value="">Pilih akun</option>
            {(daftar ?? []).map((o) => <option key={o.user_id} value={o.user_id}>{namaAkun(o.email)} ({o.anak.length} anak)</option>)}
          </select>
          {daftar && daftar.length === 0 && <span className="petunjuk">Belum ada akun orang tua. Buat dulu di Pengguna dan akun, peran Orang tua.</span>}
        </label>
        <form onSubmit={(e) => void cari(e)} className="aksi">
          <input aria-label="Cari siswa" placeholder="Nama atau NISN siswa" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
          <button className="tombol tombol-isi">Cari</button>
        </form>
        {hasil && hasil.length === 0 && <p className="catatan">Siswa tidak ditemukan. Ketik minimal 2 huruf nama atau NISN lengkap.</p>}
        {hasil && hasil.length > 0 && (
          <div className="tabel-bungkus"><table>
            <thead><tr><th>Nama</th><th>NISN</th><th>Rombel</th><th></th></tr></thead>
            <tbody>{hasil.map((s) => (
              <tr key={s.id}><td>{s.nama}</td><td>{s.nisn ?? '-'}</td><td>{s.rombel ?? '-'}</td>
                <td><button className="tombol" style={biru} disabled={sibuk} onClick={() => void tautkan(s.id)}>Tautkan</button></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      <div className="judul-bagian jarak"><h2>Tautan yang ada</h2></div>
      {!daftar && <p className="catatan">Memuat...</p>}
      {(daftar ?? []).map((o) => (
        <div key={o.user_id} className="kartu" style={{ marginTop: 8 }}>
          <p style={{ margin: 0 }}><strong>{namaAkun(o.email)}</strong></p>
          {o.anak.length === 0
            ? <p className="catatan">Belum ditautkan ke anak.</p>
            : <ul style={{ margin: '4px 0 0' }}>{o.anak.map((a) => <li key={a.id}>{a.nama} <small>{a.nisn ?? ''}</small></li>)}</ul>}
        </div>
      ))}
      <p className="catatan jarak">Melepas tautan belum tersedia di aplikasi. Hubungi pengembang bila ada tautan yang keliru.</p>
      <p className="catatan"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}
