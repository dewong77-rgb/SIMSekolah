import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { supabase } from '../lib/supabase'
import Pager, { efektif } from '../components/Pager'

type Pengguna = {
  user_id: string; peran: string; status_pd: string | null; sandi: 'belum' | 'awal' | 'diganti' | null; nama: string | null; nisn: string | null; email: string | null
  terakhir_masuk: string | null; nonaktif: boolean; super_admin: boolean; dibuat_pada: string
}
type Ringkasan = { siswa_aktif: number; alumni: number; guru_total: number; staf_total: number }
type Kelompok = 'aktif' | 'alumni'

const namaPeran: Record<string, string> = { admin_tu: 'Admin TU', guru: 'Guru', staf: 'Staf TU', siswa: 'Siswa', orang_tua: 'Orang tua' }

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
  const [filter, setFilter] = useState('semua')
  const [cari, setCari] = useState('')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [emailBaru, setEmailBaru] = useState('')
  const [peranBaru, setPeranBaru] = useState('admin_tu')
  const [hal, setHal] = useState(1)
  const [ukuran, setUkuran] = useState(10)
  const [progres, setProgres] = useState('')

  const muat = useCallback(async () => {
    try {
      const d = await panggil({ aksi: 'daftar' })
      setDaftar(d.pengguna)
      setRing(d.ringkasan)
      setGalat('')
    } catch (e) {
      setGalat((e as Error).message)
    }
  }, [])
  useEffect(() => { void muat() }, [muat])

  async function aksi(body: Record<string, unknown>, konfirmasi?: string) {
    if (konfirmasi && !window.confirm(konfirmasi)) return
    setSibuk(true)
    try {
      await panggil(body)
      await muat()
    } catch (e) {
      setGalat((e as Error).message)
    }
    setSibuk(false)
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
    const q = cari.trim().toLowerCase()
    if (!q) return true
    return [p.nama, p.email, p.nisn].some((x) => (x ?? '').toLowerCase().includes(q))
  })

  return (
    <Halaman judul="Kelola pengguna" lead="Semua akun yang sudah terdaftar. Hanya super admin yang melihat halaman ini.">
      <div className="grid grid-4">
        <div className="kartu"><small>Guru terdaftar</small><h3>{hitung.guru ?? 0} dari {ring?.guru_total ?? '...'}</h3></div>
        <div className="kartu"><small>Akun siswa aktif</small><h3>{hitung.siswa ?? 0} dari {ring?.siswa_aktif ?? '...'}</h3></div>
        <div className="kartu"><small>Akun alumni</small><h3>{hitung.alumni ?? 0} dari {ring?.alumni ?? '...'}</h3></div>
        <div className="kartu"><small>Staf TU (tendik)</small><h3>{hitung.staf ?? 0} dari {ring?.staf_total ?? '...'}</h3></div>
        <div className="kartu"><small>Admin TU</small><h3>{hitung.admin_tu ?? 0}</h3></div>
        <div className="kartu"><small>Orang tua</small><h3>{hitung.orang_tua ?? 0}</h3></div>
      </div>
      <p className="catatan jarak">
        Akun siswa dan alumni dibuat dari data Dapodik yang sudah diunggah. Siswa masuk dengan NISN dan tanggal lahir.
        Setelah unggahan baru, tekan tombol di bawah untuk membuat akun bagi siswa yang baru muncul.
        Untuk mendaftarkan guru, pakai <Link to="/portal/akun">Akun guru</Link>.
      </p>
      <div className="kartu jarak form">
        <h3>Buat akun massal</h3>
        <div className="aksi">
          <button className="tombol tombol-isi" disabled={sibuk || !ring} onClick={() => buatMassal('aktif')}>
            Buat akun siswa aktif ({Math.max((ring?.siswa_aktif ?? 0) - (hitung.siswa ?? 0), 0)} belum)
          </button>
          <button className="tombol tombol-isi" disabled={sibuk || !ring} onClick={() => buatMassal('alumni')}>
            Buat akun alumni ({Math.max((ring?.alumni ?? 0) - (hitung.alumni ?? 0), 0)} belum)
          </button>
        </div>
        <div className="aksi jarak">
          <button className="tombol tombol-isi" disabled={sibuk || !ring} onClick={() => putaran('Membuat akun staf', { aksi: 'buat_staf' }, 'dibuat', 'Buat akun untuk tenaga kependidikan yang belum punya akun? Username NIP atau NUPTK, password awal NPSN.')}>
            Buat akun staf TU ({Math.max((ring?.staf_total ?? 0) - (hitung.staf ?? 0), 0)} belum)
          </button>
        </div>
        <div className="aksi jarak">
          <button className="tombol tombol-isi" disabled={sibuk || !ring} onClick={() => void buatOrtu()}>Buat akun orang tua dari data ibu</button>
        </div>
        <p className="catatan">Satu akun per NIK ibu, ditautkan ke semua anak aktif dengan NIK ibu yang sama. Username NIK ibu, password awal NPSN, wajib diganti saat masuk pertama.</p>
        <h3 className="jarak">Password awal</h3>
        <p className="catatan">Siswa dan alumni: tanggal lahir DDMMYYYY. Guru dan staf: NPSN. Semua wajib mengganti password saat masuk pertama.</p>
        <div className="aksi">
          <button className="tombol tombol-isi" disabled={sibuk || !ring || belumSandi.siswa === 0} onClick={() => aturSandi('siswa')}>Siswa aktif ({belumSandi.siswa} belum)</button>
          <button className="tombol tombol-isi" disabled={sibuk || !ring || belumSandi.alumni === 0} onClick={() => aturSandi('alumni')}>Alumni ({belumSandi.alumni} belum)</button>
          <button className="tombol tombol-isi" disabled={sibuk || !ring || belumSandi.guru === 0} onClick={() => aturSandi('guru')}>Guru ({belumSandi.guru} belum)</button>
          <button className="tombol tombol-isi" disabled={sibuk || !ring || belumSandi.staf === 0} onClick={() => aturSandi('staf')}>Staf ({belumSandi.staf} belum)</button>
        </div>
        {progres && <p className="catatan" role="status">{progres}</p>}
      </div>
      {galat && <p className="kartu jarak" role="alert">Galat: {galat}</p>}

      <div className="kartu jarak form">
        <h3>Tambah akun manual</h3>
        <div className="aksi">
          <input
            type="email" placeholder="email@contoh.com" value={emailBaru}
            onChange={(e) => setEmailBaru(e.target.value)} style={{ minWidth: 260 }} aria-label="Email akun baru"
          />
          <select value={peranBaru} onChange={(e) => setPeranBaru(e.target.value)} aria-label="Peran akun baru">
            <option value="admin_tu">Admin TU</option>
            <option value="guru">Guru</option>
            <option value="orang_tua">Orang tua</option>
          </select>
          <button
            className="tombol tombol-isi" disabled={sibuk || !emailBaru}
            onClick={async () => { await aksi({ aksi: 'tambah', email: emailBaru, peran: peranBaru }); setEmailBaru('') }}
          >
            Tambah
          </button>
        </div>
      </div>

      <div className="aksi jarak">
        <select value={filter} onChange={(e) => { setFilter(e.target.value); setHal(1) }} aria-label="Filter peran">
          <option value="semua">Semua peran</option>
          <option value="siswa">Siswa aktif</option>
          <option value="alumni">Alumni</option>
          <option value="guru">Guru</option>
          <option value="staf">Staf TU</option>
          <option value="admin_tu">Admin TU</option>
          <option value="orang_tua">Orang tua</option>
        </select>
        <input type="search" placeholder="Cari nama, email, atau NISN" value={cari} onChange={(e) => { setCari(e.target.value); setHal(1) }} style={{ minWidth: 260 }} aria-label="Cari" />
        <span className="catatan">{tampil.length.toLocaleString('id-ID')} akun cocok</span>
      </div>

      <div className="tabel-bungkus jarak">
        <table>
          <thead>
            <tr><th>Nama</th><th>Peran</th><th>Email atau NISN</th><th>Terakhir masuk</th><th>Password</th><th>Status</th><th>Aksi</th></tr>
          </thead>
          <tbody>
            {!daftar && !galat && <tr><td colSpan={7}>Memuat...</td></tr>}
            {tampil.slice((hal - 1) * efektif(ukuran), hal * efektif(ukuran)).map((p) => (
              <tr key={p.user_id}>
                <td>{p.nama ?? '-'}{p.super_admin && <small> (super admin)</small>}</td>
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
                    </select>
                  )}
                </td>
                <td>{p.peran === 'siswa' ? p.nisn : p.email}</td>
                <td>{waktu(p.terakhir_masuk)}</td>
                <td>{p.sandi === 'belum' ? 'Belum disetel' : p.sandi === 'awal' ? 'Masih awal' : p.sandi === 'diganti' ? 'Sudah diganti' : '-'}</td>
                <td>{p.nonaktif ? 'Nonaktif' : 'Aktif'}</td>
                <td>
                  {p.super_admin ? '-' : (
                    <>
                      <button
                        className="tombol" style={{ padding: '4px 10px', color: 'var(--warna-utama)' }} disabled={sibuk}
                        onClick={() => aksi({ aksi: 'nonaktifkan', user_id: p.user_id, nonaktif: !p.nonaktif })}
                      >
                        {p.nonaktif ? 'Aktifkan' : 'Nonaktifkan'}
                      </button>{' '}
                      {p.sandi && (
                        <>
                          <button
                            className="tombol" style={{ padding: '4px 10px', color: 'var(--warna-utama)' }} disabled={sibuk}
                            onClick={() => aksi({ aksi: 'reset_sandi', user_id: p.user_id }, `Kembalikan password ${p.nama} ke password awal?`)}
                          >
                            Reset password
                          </button>{' '}
                        </>
                      )}
                      <button
                        className="tombol" style={{ padding: '4px 10px', color: '#a11' }} disabled={sibuk}
                        onClick={() => aksi({ aksi: 'hapus', user_id: p.user_id }, `Hapus akun ${p.nama ?? p.email}? Tidak dapat dibatalkan.`)}
                      >
                        Hapus
                      </button>
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
