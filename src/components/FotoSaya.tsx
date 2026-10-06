// Foto profil milik sendiri, untuk semua peran. Disimpan di bucket privat: privat/profil/{user_id}/foto-{kode}.webp
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { hapusGambar, kodeBerkas, UKURAN, unggahGambar, useUrlPrivat } from '../lib/gambar'
import PilihGambar from './PilihGambar'

export default function FotoSaya() {
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const [path, setPath] = useState<string | null>(null)
  const [sibuk, setSibuk] = useState(false)
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null)
  const saatIni = path ?? null
  useEffect(() => {
    if (!userId) return
    supabase.from('profil_pengguna').select('foto_path').eq('user_id', userId).maybeSingle().then(({ data }) => setPath((data?.foto_path as string | null | undefined) ?? null))
  }, [userId])
  const url = useUrlPrivat(saatIni)

  async function ganti(f: File) {
    if (!userId) return
    setSibuk(true); setPesan(null)
    const lama = saatIni
    try {
      const baru = await unggahGambar('privat', `profil/${userId}/foto-${kodeBerkas()}.webp`, f, UKURAN.foto)
      const { error } = await supabase.rpc('foto_saya_simpan', { p_path: baru })
      if (error) { await hapusGambar('privat', baru); throw new Error(error.message) }
      await hapusGambar('privat', lama)
      setPath(baru)
      setPesan({ ok: true, teks: 'Foto profil tersimpan.' })
    } catch (e) { setPesan({ ok: false, teks: (e as Error).message }) }
    setSibuk(false)
  }

  async function hapus() {
    setSibuk(true); setPesan(null)
    const lama = saatIni
    const { error } = await supabase.rpc('foto_saya_simpan', { p_path: null })
    if (error) setPesan({ ok: false, teks: error.message })
    else { await hapusGambar('privat', lama); setPath(null); setPesan({ ok: true, teks: 'Foto profil dihapus.' }) }
    setSibuk(false)
  }

  return (
    <div className="kartu form">
      <h3>Foto profil</h3>
      <PilihGambar label="Foto" bentuk="bulat" saatIni={url} sibuk={sibuk} onPilih={ganti} onHapus={saatIni ? hapus : undefined}
        petunjuk="Foto wajah, tampak depan. Hanya Anda, guru, staf, dan admin sekolah yang dapat melihatnya." />
      <div aria-live="polite">{pesan && <p className="catatan" role={pesan.ok ? 'status' : 'alert'}>{pesan.teks}</p>}</div>
    </div>
  )
}
