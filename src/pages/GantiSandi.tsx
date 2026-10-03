import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'

// Dipakai dua cara: wajib saat masuk dengan password awal, dan sukarela dari menu portal.
export default function GantiSandi() {
  const { session, keluar } = useAuth()
  const nav = useNavigate()
  const wajib = !!(session?.user.app_metadata as Record<string, unknown> | undefined)?.wajib_ganti_sandi
  const [baru, setBaru] = useState('')
  const [ulang, setUlang] = useState('')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)

  async function kirim(e: FormEvent) {
    e.preventDefault()
    setGalat('')
    if (baru.length < 8) { setGalat('Password minimal 8 karakter.'); return }
    if (baru !== ulang) { setGalat('Pengulangan password tidak sama.'); return }
    setSibuk(true)
    const { data, error } = await supabase.functions.invoke('ganti-sandi', { body: { sandi_baru: baru } })
    if (error) {
      let pesan = error.message
      try { pesan = (await (error as unknown as { context: Response }).context.json()).galat ?? pesan } catch { /* biarkan */ }
      setGalat(pesan)
      setSibuk(false)
      return
    }
    if (!(data as { ok?: boolean } | null)?.ok) { setGalat('Password tidak dapat diubah.'); setSibuk(false); return }
    // Muat ulang sesi agar penanda wajib ganti hilang. Bila gagal, minta masuk ulang dengan password baru.
    const { error: er } = await supabase.auth.refreshSession()
    if (er) {
      await supabase.auth.signOut()
      nav('/masuk', { replace: true })
      return
    }
    nav('/portal', { replace: true })
  }

  return (
    <Halaman
      judul={wajib ? 'Buat password baru' : 'Ganti password'}
      lead={wajib ? 'Anda masuk dengan password awal. Ganti dulu sebelum melanjutkan.' : 'Password baru berlaku untuk masuk berikutnya.'}
    >
      <form className="kartu form" style={{ maxWidth: 480 }} onSubmit={kirim}>
        <label>Password baru<input type="password" autoComplete="new-password" value={baru} onChange={(e) => setBaru(e.target.value)} /></label>
        <label>Ulangi password<input type="password" autoComplete="new-password" value={ulang} onChange={(e) => setUlang(e.target.value)} /></label>
        <p className="catatan">Minimal 8 karakter. Jangan pakai tanggal lahir, NISN, NIP, atau NPSN.</p>
        <button className="tombol tombol-isi" disabled={sibuk || !baru || !ulang}>{sibuk ? 'Menyimpan...' : 'Simpan password'}</button>
        <div aria-live="polite">{galat && <p className="catatan" role="alert">{galat}</p>}</div>
        <div className="aksi">
          {!wajib && <Link to="/portal" className="tombol" style={{ color: 'var(--warna-utama)' }}>Kembali ke portal</Link>}
          {wajib && <button type="button" className="tombol" style={{ color: 'var(--warna-utama)' }} onClick={keluar}>Keluar</button>}
        </div>
      </form>
    </Halaman>
  )
}
