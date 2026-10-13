import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { supabase } from '../lib/supabase'
import Pager, { efektif } from '../components/Pager'

type Pengguna = {
  user_id: string; peran: string; status_pd: string | null; sandi: 'belum' | 'awal' | 'diganti' | null; nama: string | null; nisn: string | null; email: string | null; kelas: string | null
  terakhir_masuk: string | null; nonaktif: boolean; super_admin: boolean; dibuat_pada: string
}
type Ringkasan = { siswa_aktif: number; alumni: number; guru_total: number; staf_total: number }
type Kelompok = 'aktif' | 'alumni'

const namaPeran: Record<string, string> = { admin_tu: 'Admin TU', guru: 'Guru', staf: 'Staf TU', siswa: 'Siswa', orang_tua: 'Orang tua', admin_ujian: 'Admin ujian' }

async function panggil(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('kelola-akun', { body })
  if (error) {
    let pesan = error.message
    try { pesan = (await (error as unknown as { context: Response }).context.json()).galat ?? pesan } catch { /* biarkan */ }
    throw new Error(pesan)
  }
  return data
}

const labelPeran = (p: Pengguna) => (p.peran === 'siswa' && p.status_pd === 'lulus' ? 'Alumni' : namaPeran[p.peran])

const waktu = (t: string | null) =>
  t ? new Date(t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'Belum pernah'

export default function PenggunaHalaman() {
  const [daftar, setDaftar] = useState<Pengguna[] | null>(null)
  const [ring, setRing] = useState<Ringkasan | null>(null)
  const [filter, setFilter] = useState('siswa')
  const [kelas, setKelas] = useState('')
  const [cari, setCari] = useState('')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [emailBaru, setEmailBaru] = useState('')
  const [peranBaru, setPeranBaru] = useState('admin_tu')
  const [hal, setHal] = useState(1)
  const [ukuran, setUkuran] = useState(10)
  const [progres, setProgres] = useState('')
  const [bolehHapus, setBolehHapus] = useState(true)

  const muat = useCallback(async () => {
    try {
      const d = await panggil({ aksi: 'daftar' })
      setDaftar(d.pengguna)
      setRing(d.ringkasan)
      setBolehHapus(d.boleh_hapus !== false)
      setGalat('')
    } catch (e) {
      setGalat((e as Error).message)
    }
  }, [])
  useEffect(() => { void muat() }, [muat])

  async function aksi(body: Record<string, unknown>, konfirmasi?: string): Promise<boolean> {
    if (konfirmasi && !window.confirm(konfirmasi)) return false
    setSibuk(true)
    let ok = true
    try {
      await panggil(body)
      await muat()
    } catch (e) {
      setGalat((e as Error).message)
      ok = false
    }
    setSibuk(false)
    return ok
  }

  const hitung = useMemo(() => {
    const h: Record<string, number> = {}
    for (const p of daftar ?? []) {
      const k = p.peran === 'siswa' && p.status_pd === 'lulus' ? 'alumni' : p.peran
      h[k] = (h[k] ?? 0) + 1
    }
    return h
  }, [daftar])

  async function putaran(judul: string, body: Record<string, unknown>, kunciHasil: 'dibuat' | 'diatur', konfirmasi: string) {
    if (!window.confirm(konfirmasi)) return
    setSibuk(true)
    setGalat('')
    let total = 0
    let gagal: string[] = []
    let tanpa = 0
    try {
      for (let i = 0; i < 100; i++) {
        setProgres(`${judul}... ${total} selesai`)
        const r = await panggil({ ...body, batas: 100 })
        total += r[kunciHasil]
        gagal = r.gagal
        tanpa = r.tanpa_nisn ?? 0
        if (r.sisa <= 0 || r[kunciHasil] === 0) break
      }
      setProgres(`Selesai: ${total} akun. ${gagal.length ? `${gagal.length} gagal (mis. NISN kembar): ${gagal.slice(0, 3).join('; ')}. ` : ''}${tanpa ? `${tanpa} dilewati karena NISN atau tanggal lahir tidak lengkap.` : ''}`)
    } catch (e) {
      setGalat((e as Error).message)
      setProgres(`Terhenti setelah ${total} akun. Jalankan lagi untuk melanjutkan.`)
    }
    await muat()
    setSibuk(false)
  }

  const nama = (k: Kelompok) => (k === 'aktif' ? 'siswa aktif' : 'alumni')
  const buatMassal = (k: Kelompok) =>
    putaran(`Membuat akun ${nama(k)}`, { aksi: 'buat_massal', kelompok: k }, 'dibuat',
      `Buat akun untuk ${nama(k)} yang belum punya akun? Password awal adalah tanggal lahir (DDMMYYYY). Jangan tutup halaman selama berjalan.`)
  async function buatOrtu() {
    if (!window.confirm('Buat akun orang tua dari NIK ibu siswa aktif? Username NIK ibu, password awal NPSN. Aman diulang. Jangan tutup halaman selama berjalan.')) return
    setSibuk(true); setGalat('')
    let total = 0; let tautan = 0; let tanpa = 0; let akun = 0
    let gagal: string[] = []
    try {
      for (let i = 0; i < 100; i++) {
        setProgres(`Membuat akun orang tua... ${total} selesai`)
        const { data, error } = await supabase.functions.invoke('ortu', { body: { aksi: 'buat', batas: 100 } })
        if (error) {
          let pesan = error.message
          try { pesan = (await (error as unknown as { context: Response }).context.json()).galat ?? pesan } catch { /* biarkan */ }
          throw new Error(pesan)
        }
        total += data.dibuat; tautan += data.tautan; tanpa = data.tanpa_nik; akun = data.total_akun; gagal = data.gagal
        if (data.sisa <= 0 || data.dibuat === 0) break
      }
      setProgres(`Selesai: ${total} akun baru, total ${akun} akun orang tua, ${tautan} tautan anak. ${tanpa} siswa dilewati karena NIK ibu tidak ada atau tidak valid. ${gagal.length ? `${gagal.length} gagal: ${gagal.slice(0, 3).join('; ')}.` : ''}`)
    } catch (e) {
      setGalat((e as Error).message)
      setProgres(`Terhenti setelah ${total} akun. Jalankan lagi untuk melanjutkan.`)
    }
    await muat()
    setSibuk(false)
  }
  const aturSandi = (k: 'siswa' | 'alumni' | 'guru' | 'staf') =>
    putaran(`Menyetel password awal ${k === 'siswa' ? 'siswa aktif' : k}`, { aksi: 'atur_sandi_awal', kelompok: k }, 'diatur',
      `Setel password awal untuk akun ${k === 'siswa' ? 'siswa aktif' : k} yang belum disetel (${k === 'guru' || k === 'staf' ? 'NPSN' : 'tanggal lahir DDMMYYYY'})? Mereka wajib menggantinya saat masuk pertama. Jangan tutup halaman selama berjalan.`)

  const belumSandi = useMemo(() => {
    const h = { siswa: 0, alumni: 0, guru: 0, staf: 0 }
    for (const p of daftar ?? []) {
      if (p.sandi !== 'belum') continue
      if (p.peran === 'guru') h.guru++
      else if (p.peran === 'staf') h.staf++
      else if (p.status_pd === 'lulus') h.alumni++
      else h.siswa++
    }
    return h
  }, [daftar])

  const tampil = (daftar ?? []).filter((p) => {
    if (filter === 'alumni') { if (!(p.peran === 'siswa' && p.status_pd === 'lulus')) return false }
    else if (filter === 'siswa') { if (!(p.peran === 'siswa' && p.status_pd !== 'lulus')) return false }
    else if (filter !== 'semua' && p.peran !== filter) return false
    if (kelas && p.kelas !== kelas) return false
    const q = cari.trim().toLowerCase()
    if (!q) return true
    return q.split(/\s+/).every((kata) => [p.nama, p.email, p.nisn, p.kelas].some((x) => (x ?? '').toLowerCase().includes(kata)))
  }).sort((a, c) => (a.kelas ?? '').localeCompare(c.kelas ?? '', 'id', { numeric: true }) || (a.nama ?? '').localeCompare(c.nama ?? '', 'id'))

  const modeSiswa = filter === 'siswa' || filter === 'alumni'
  const daftarKelas = useMemo(() => {
    const k = new Set<string>()
    for (const p of daftar ?? []) {
      if (p.peran !== 'siswa' || !p.kelas) continue
      if (filter === 'alumni' ? p.status_pd === 'lulus' : p.status_pd !== 'lulus') k.add(p.kelas)
    }
    return [...k].sort((a, c) => a.localeCompare(c, 'id', { numeric: true }))
  }, [daftar, filter])
  const tab = (nilai: string, label: string, n?: number) => (
    <button key={nilai} className={`tab-pengguna${filter === nilai ? ' aktif' : ''}`} onClick={() => { setFilter(nilai); setKelas(''); setHal(1) }}>
      {label}{n !== undefined ? ` (${n})` : ''}
    </button>
  )

  return (
    <Halaman judul="Kelola pengguna" lead="Semua akun yang sudah terdaftar. Hanya super admin yang melihat halaman ini.">
      <div className="ringkas">
        <span><b>{hitung.guru ?? 0}</b>/{ring?.guru_total ?? '...'} guru</span>
        <span><b>{hitung.siswa ?? 0}</b>/{ring?.siswa_aktif ?? '...'} siswa aktif</span>
        <span><b>{hitung.alumni ?? 0}</b>/{ring?.alumni ?? '...'} alumni</span>
        <span><b>{hitung.staf ?? 0}</b>/{ring?.staf_total ?? '...'} staf TU</span>
        <span><b>{hitung.admin_tu ?? 0}</b> admin TU</span>
        <span><b>{hitung.orang_tua ?? 0}</b> orang tua</span>
      </div>

      <details className="kartu jarak lipat">
        <summary>Buat akun dan setel password massal</summary>
        <p className="catatan">
          Akun siswa dan alumni dibuat dari data Dapodik. Siswa masuk dengan NISN dan tanggal lahir. Setelah unggahan baru, buat akun untuk yang baru muncul. Guru didaftarkan lewat <Link to="/portal/akun">Akun guru</Link>.
        </p>
        <div className="aksi rapat">
          <button className="tombol tombol-isi" disabled={sibuk || !ring} onClick={() => buatMassal('aktif')}>
            Akun siswa aktif ({Math.max((ring?.siswa_aktif ?? 0) - (hitung.siswa ?? 0), 0)} belum)
          </button>
          <button className="tombol tombol-isi" disabled={sibuk || !ring} onClick={() => buatMassal('alumni')}>
            Akun alumni ({Math.max((ring?.alumni ?? 0) - (hitung.alumni ?? 0), 0)} belum)
          </button>
          <button className="tombol tombol-isi" disabled={sibuk || !ring} onClick={() => putaran('Membuat akun staf', { aksi: 'buat_staf' }, 'dibuat', 'Buat akun untuk tenaga kependidikan yang belum punya akun? Username NIP atau NUPTK, password awal NPSN.')}>
            Akun staf TU ({Math.max((ring?.staf_total ?? 0) - (hitung.staf ?? 0), 0)} belum)
          </button>
          <button className="tombol tombol-isi" disabled={sibuk || !ring} onClick={() => void buatOrtu()}>Akun orang tua dari data ibu</button>
        </div>
        <p className="catatan">Orang tua: satu akun per NIK ibu, ditautkan ke semua anak aktif. Username NIK ibu, password awal NPSN.</p>
        <p className="catatan">Password awal: siswa dan alumni tanggal lahir DDMMYYYY, guru dan staf NPSN. Semua wajib menggantinya saat masuk pertama.</p>
        <div className="aksi rapat">
          <button className="tombol tombol-isi" disabled={sibuk || !ring || belumSandi.siswa === 0} onClick={() => aturSandi('siswa')}>Setel siswa aktif ({belumSandi.siswa})</button>
          <button className="tombol tombol-isi" disabled={sibuk || !ring || belumSandi.alumni === 0} onClick={() => aturSandi('alumni')}>Setel alumni ({belumSandi.alumni})</button>
          <button className="tombol tombol-isi" disabled={sibuk || !ring || belumSandi.guru === 0} onClick={() => aturSandi('guru')}>Setel guru ({belumSandi.guru})</button>
          <button className="tombol tombol-isi" disabled={sibuk || !ring || belumSandi.staf === 0} onClick={() => aturSandi('staf')}>Setel staf ({belumSandi.staf})</button>
        </div>
        {progres && <p className="catatan" role="status">{progres}</p>}
      </details>
      {galat && <p className="kartu jarak" role="alert">Galat: {galat}</p>}

      <details className="kartu jarak lipat">
        <summary>Tambah akun manual</summary>
        <div className="aksi rapat">
          <input
            type="email" placeholder="email@contoh.com" value={emailBaru}
            onChange={(e) => setEmailBaru(e.target.value)} style={{ minWidth: 260 }} aria-label="Email akun baru"
          />
          <select value={peranBaru} onChange={(e) => setPeranBaru(e.target.value)} aria-label="Peran akun baru">
            <option value="admin_tu">Admin TU</option>
            <option value="guru">Guru</option>
            <option value="orang_tua">Orang tua</option>
            <option value="admin_ujian">Admin ujian</option>
          </select>
          <button
            className="tombol tombol-isi" disabled={sibuk || !emailBaru}
            onClick={async () => { await aksi({ aksi: 'tambah', email: emailBaru, peran: peranBaru }); setEmailBaru('') }}
          >
            Tambah
          </button>
        </div>
      </details>

      <div className="tab-bar jarak">
        {tab('siswa', 'Siswa', hitung.siswa ?? 0)}
        {tab('alumni', 'Alumni', hitung.alumni ?? 0)}
        {tab('guru', 'Guru', hitung.guru ?? 0)}
        {tab('staf', 'Staf TU', hitung.staf ?? 0)}
        {tab('admin_tu', 'Admin TU', hitung.admin_tu ?? 0)}
        {tab('orang_tua', 'Orang tua', hitung.orang_tua ?? 0)}
        {tab('admin_ujian', 'Admin ujian', hitung.admin_ujian ?? 0)}
        {tab('semua', 'Semua')}
      </div>
      <div className="aksi rapat">
        {modeSiswa && (
          <select value={kelas} onChange={(e) => { setKelas(e.target.value); setHal(1) }} aria-label="Filter kelas">
            <option value="">Semua kelas</option>
            {daftarKelas.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        )}
        <input type="search" placeholder={modeSiswa ? 'Cari nama, kelas, atau NISN' : 'Cari nama atau email'} value={cari} onChange={(e) => { setCari(e.target.value); setHal(1) }} style={{ minWidth: 240 }} aria-label="Cari" />
        <span className="catatan">{tampil.length.toLocaleString('id-ID')} akun cocok</span>
      </div>

      <div className="tabel-bungkus tabel-padat jarak">
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              {modeSiswa && <th>Kelas</th>}
              {filter === 'semua' && <th>Peran</th>}
              <th>{modeSiswa ? 'NISN' : filter === 'semua' ? 'Email atau NISN' : 'Email'}</th>
              <th>Terakhir masuk</th><th>Password</th><th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {!daftar && !galat && <tr><td colSpan={7}>Memuat...</td></tr>}
            {tampil.slice((hal - 1) * efektif(ukuran), hal * efektif(ukuran)).map((p) => (
              <tr key={p.user_id} className={p.nonaktif ? 'nonaktif' : undefined}>
                <td>
                  {p.nama ?? '-'}{p.super_admin && <small> (super admin)</small>}
                  {p.nonaktif && <small className="lencana"> nonaktif</small>}
                </td>
                {modeSiswa && <td>{p.kelas ?? '-'}</td>}
                {filter === 'semua' && (
                  <td>
                    {p.peran === 'siswa' || p.super_admin ? labelPeran(p) : (
                      <select
                        value={p.peran} disabled={sibuk} aria-label={`Peran ${p.nama ?? p.email}`}
                        onChange={(e) => aksi({ aksi: 'ubah_peran', user_id: p.user_id, peran: e.target.value }, `Ubah peran menjadi ${namaPeran[e.target.value]}?`)}
                      >
                        <option value="admin_tu">Admin TU</option>
                        <option value="guru">Guru</option>
                        <option value="staf">Staf TU</option>
                        <option value="orang_tua">Orang tua</option>
                        <option value="admin_ujian">Admin ujian</option>
                      </select>
                    )}
                  </td>
                )}
                <td>{p.peran === 'siswa' ? p.nisn : p.email}</td>
                <td>{waktu(p.terakhir_masuk)}</td>
                <td>{p.sandi === 'belum' ? 'Belum disetel' : p.sandi === 'awal' ? 'Masih awal' : p.sandi === 'diganti' ? 'Sudah diganti' : '-'}</td>
                <td className="aksi-baris">
                  {p.super_admin ? '-' : (
                    <>
                      <button className="tombol" disabled={sibuk} onClick={() => aksi({ aksi: 'nonaktifkan', user_id: p.user_id, nonaktif: !p.nonaktif })}>
                        {p.nonaktif ? 'Aktifkan' : 'Nonaktifkan'}
                      </button>
                      {p.sandi && (
                        <>
                          <button className="tombol" disabled={sibuk}
                            onClick={async () => { if (await aksi({ aksi: 'buka_kunci', user_id: p.user_id })) window.alert(`Kunci masuk ${p.nama ?? 'akun ini'} sudah dibuka. Silakan coba masuk lagi.`) }}>
                            Buka kunci
                          </button>
                          <button className="tombol" disabled={sibuk}
                            onClick={() => aksi({ aksi: 'reset_sandi', user_id: p.user_id }, `Kembalikan password ${p.nama}${p.kelas ? ` (${p.kelas})` : ''} ke password awal?`)}>
                            Reset
                          </button>
                        </>
                      )}
                      {bolehHapus && (
                        <button className="tombol bahaya" disabled={sibuk}
                          onClick={() => aksi({ aksi: 'hapus', user_id: p.user_id }, `Hapus akun ${p.nama ?? p.email}${p.kelas ? ` (${p.kelas})` : ''}? Tidak dapat dibatalkan.`)}>
                          Hapus
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager halaman={hal} total={tampil.length} ukuran={ukuran} ke={setHal} ubahUkuran={setUkuran} />
      <p className="catatan jarak"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}
