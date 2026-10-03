import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'

const namaPeran = { admin_tu: 'Admin TU', guru: 'Guru', staf: 'Staf TU', siswa: 'Siswa', orang_tua: 'Orang tua' } as const
const POLA_USERNAME = /^[a-z0-9][a-z0-9._-]{3,31}$/

export default function ProfilSaya() {
  const { session, profil, superAdmin, keluar } = useAuth()
  const userId = session?.user.id ?? ''
  const [ada, setAda] = useState(false)
  const [muat, setMuat] = useState(true)
  const [username, setUsername] = useState('')
  const [nama, setNama] = useState('')
  const [telepon, setTelepon] = useState('')
  const [jabatan, setJabatan] = useState('')
  const [pesanProfil, setPesanProfil] = useState<{ ok: boolean; teks: string } | null>(null)
  const [sandiBaru, setSandiBaru] = useState('')
  const [ulangi, setUlangi] = useState('')
  const [pesanSandi, setPesanSandi] = useState<{ ok: boolean; teks: string } | null>(null)
  const [sibuk, setSibuk] = useState(false)

  useEffect(() => {
    if (!userId) return
    supabase.from('profil_admin').select('username,nama_lengkap,telepon,jabatan').eq('user_id', userId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setAda(true)
          setUsername(data.username ?? '')
          setNama(data.nama_lengkap ?? '')
          setTelepon(data.telepon ?? '')
          setJabatan(data.jabatan ?? '')
        }
        setMuat(false)
      })
  }, [userId])

  async function simpanProfil(e: FormEvent) {
    e.preventDefault()
    const u = username.trim().toLowerCase()
    if (!POLA_USERNAME.test(u)) {
      setPesanProfil({ ok: false, teks: 'Username 4 sampai 32 karakter: huruf kecil, angka, titik, garis bawah, atau strip. Awali dengan huruf atau angka.' })
      return
    }
    setSibuk(true)
    const nilai = { username: u, nama_lengkap: nama.trim() || null, telepon: telepon.trim() || null, jabatan: jabatan.trim() || null, diperbarui_pada: new Date().toISOString() }
    const { error } = ada
      ? await supabase.from('profil_admin').update(nilai).eq('user_id', userId)
      : await supabase.from('profil_admin').insert({ user_id: userId, ...nilai })
    setSibuk(false)
    if (error) {
      setPesanProfil({ ok: false, teks: error.code === '23505' ? 'Username sudah dipakai akun lain.' : error.message })
      return
    }
    setAda(true)
    setUsername(u)
    setPesanProfil({ ok: true, teks: 'Profil tersimpan.' })
  }

  async function gantiSandi(e: FormEvent) {
    e.preventDefault()
    if (sandiBaru.length < 8) { setPesanSandi({ ok: false, teks: 'Password minimal 8 karakter.' }); return }
    if (sandiBaru !== ulangi) { setPesanSandi({ ok: false, teks: 'Pengulangan password tidak sama.' }); return }
    setSibuk(true)
    const { error } = await supabase.functions.invoke('ganti-sandi', { body: { sandi_baru: sandiBaru } })
    setSibuk(false)
    if (error) {
      let pesan = error.message
      try { pesan = (await (error as unknown as { context: Response }).context.json()).galat ?? pesan } catch { /* biarkan */ }
      setPesanSandi({ ok: false, teks: pesan })
      return
    }
    setSandiBaru(''); setUlangi('')
    setPesanSandi({ ok: true, teks: ada ? 'Password diperbarui.' : 'Password tersimpan. Isi username di atas agar bisa masuk dengan username dan password.' })
  }

  if (!profil) return null
  return (
    <Halaman judul="Profil" lead="Data akun, username, dan password.">
      <div className="kartu">
        <dl className="daftar">
          <dt>Email</dt><dd>{session?.user.email}</dd>
          <dt>Peran</dt><dd>{namaPeran[profil.peran]}{superAdmin ? ' (super admin)' : ''}</dd>
          <dt>NPSN</dt><dd>{profil.npsn}</dd>
          <dt>Terakhir masuk</dt>
          <dd>{session?.user.last_sign_in_at ? new Date(session.user.last_sign_in_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-'}</dd>
        </dl>
      </div>

      <div className="grid grid-2 jarak">
        <form className="kartu form" onSubmit={simpanProfil}>
          <h3>Data profil</h3>
          <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoComplete="off" disabled={muat} /></label>
          <label>Nama lengkap<input value={nama} onChange={(e) => setNama(e.target.value)} disabled={muat} /></label>
          <label>Jabatan<input value={jabatan} onChange={(e) => setJabatan(e.target.value)} disabled={muat} /></label>
          <label>Telepon<input value={telepon} onChange={(e) => setTelepon(e.target.value)} inputMode="tel" disabled={muat} /></label>
          <button className="tombol tombol-isi" disabled={sibuk || muat || !username}>Simpan profil</button>
          <div aria-live="polite">{pesanProfil && <p className="catatan" role={pesanProfil.ok ? 'status' : 'alert'}>{pesanProfil.teks}</p>}</div>
        </form>
        <form className="kartu form" onSubmit={gantiSandi}>
          <h3>{ada ? 'Ganti password' : 'Atur password'}</h3>
          <label>Password baru<input type="password" autoComplete="new-password" value={sandiBaru} onChange={(e) => setSandiBaru(e.target.value)} /></label>
          <label>Ulangi password<input type="password" autoComplete="new-password" value={ulangi} onChange={(e) => setUlangi(e.target.value)} /></label>
          <button className="tombol tombol-isi" disabled={sibuk || !sandiBaru}>Simpan password</button>
          <div aria-live="polite">{pesanSandi && <p className="catatan" role={pesanSandi.ok ? 'status' : 'alert'}>{pesanSandi.teks}</p>}</div>
          <p className="catatan">Setelah username dan password tersimpan, masuk lewat tab Admin di halaman masuk. Tautan email tetap berfungsi.</p>
        </form>
      </div>
      <div className="aksi jarak">
        <button className="tombol tombol-isi" onClick={keluar}>Keluar</button>
        <Link to="/portal" className="tombol" style={{ color: 'var(--warna-utama)' }}>Kembali ke portal</Link>
      </div>
    </Halaman>
  )
}
