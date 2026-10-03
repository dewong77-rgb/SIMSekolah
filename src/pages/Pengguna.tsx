import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { supabase } from '../lib/supabase'

type Pengguna = {
  user_id: string; peran: string; nama: string | null; nisn: string | null; email: string | null
  terakhir_masuk: string | null; nonaktif: boolean; super_admin: boolean; dibuat_pada: string
}
type Ringkasan = { siswa_aktif: number; guru_total: number }

const namaPeran: Record<string, string> = { admin_tu: 'Admin TU', guru: 'Guru', siswa: 'Siswa', orang_tua: 'Orang tua' }

async function panggil(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('kelola-akun', { body })
  if (error) {
    let pesan = error.message
    try { pesan = (await (error as unknown as { context: Response }).context.json()).galat ?? pesan } catch { /* biarkan */ }
    throw new Error(pesan)
  }
  return data
}

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
    for (const p of daftar ?? []) h[p.peran] = (h[p.peran] ?? 0) + 1
    return h
  }, [daftar])

  const tampil = (daftar ?? []).filter((p) => {
    if (filter !== 'semua' && p.peran !== filter) return false
    const q = cari.trim().toLowerCase()
    if (!q) return true
    return [p.nama, p.email, p.nisn].some((x) => (x ?? '').toLowerCase().includes(q))
  })

  return (
    <Halaman judul="Kelola pengguna" lead="Semua akun yang sudah terdaftar. Hanya super admin yang melihat halaman ini.">
      <div className="grid grid-4">
        <div className="kartu"><small>Guru terdaftar</small><h3>{hitung.guru ?? 0} dari {ring?.guru_total ?? '...'}</h3></div>
        <div className="kartu"><small>Siswa pernah masuk</small><h3>{hitung.siswa ?? 0} dari {ring?.siswa_aktif ?? '...'}</h3></div>
        <div className="kartu"><small>Admin TU</small><h3>{hitung.admin_tu ?? 0}</h3></div>
        <div className="kartu"><small>Orang tua</small><h3>{hitung.orang_tua ?? 0}</h3></div>
      </div>
      <p className="catatan jarak">
        Akun siswa dibuat otomatis saat siswa pertama kali masuk dengan NISN dan tanggal lahir. Siswa yang belum pernah masuk belum punya akun.
        Untuk mendaftarkan guru, pakai <Link to="/portal/akun">Akun guru</Link>.
      </p>
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
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter peran">
          <option value="semua">Semua peran</option>
          {Object.entries(namaPeran).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="search" placeholder="Cari nama, email, atau NISN" value={cari} onChange={(e) => setCari(e.target.value)} style={{ minWidth: 260 }} aria-label="Cari" />
        <span className="catatan">{tampil.length} akun</span>
      </div>

      <div className="tabel-bungkus jarak">
        <table>
          <thead>
            <tr><th>Nama</th><th>Peran</th><th>Email atau NISN</th><th>Terakhir masuk</th><th>Status</th><th>Aksi</th></tr>
          </thead>
          <tbody>
            {!daftar && !galat && <tr><td colSpan={6}>Memuat...</td></tr>}
            {tampil.map((p) => (
              <tr key={p.user_id}>
                <td>{p.nama ?? '-'}{p.super_admin && <small> (super admin)</small>}</td>
                <td>
                  {p.peran === 'siswa' || p.super_admin ? namaPeran[p.peran] : (
                    <select
                      value={p.peran} disabled={sibuk} aria-label={`Peran ${p.nama ?? p.email}`}
                      onChange={(e) => aksi({ aksi: 'ubah_peran', user_id: p.user_id, peran: e.target.value }, `Ubah peran menjadi ${namaPeran[e.target.value]}?`)}
                    >
                      <option value="admin_tu">Admin TU</option>
                      <option value="guru">Guru</option>
                      <option value="orang_tua">Orang tua</option>
                    </select>
                  )}
                </td>
                <td>{p.peran === 'siswa' ? p.nisn : p.email}</td>
                <td>{waktu(p.terakhir_masuk)}</td>
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
      <p className="catatan jarak"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}
