import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { panggil, tglJam } from '../lib/rpc'
import { biru, merah } from './lmsUtil'

// Forum diskusi per pertemuan. Teks biasa. Hanya yang sudah lolos gerbang absen yang bisa membuka.

type Topik = {
  id: string; judul: string; isi: string; penulis_nama: string; penulis_peran: string
  dikunci: boolean; dibuat_pada: string; milik_saya: boolean; jumlah_balasan: number; terakhir: string
}
type Balasan = { id: string; isi: string; penulis_nama: string; penulis_peran: string; dibuat_pada: string; milik_saya: boolean }

const peran = (p: string) => (p === 'guru' ? ' (guru)' : '')

function UtasTopik({ t, kelola, muat }: { t: Topik; kelola: boolean; muat: () => Promise<void> }) {
  const [buka, setBuka] = useState(false)
  const [balasan, setBalasan] = useState<Balasan[] | null>(null)
  const [isi, setIsi] = useState('')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const muatBalasan = useCallback(async () => {
    try { setBalasan(await panggil<Balasan[]>('lms_forum_balasan_daftar', { p_topik: t.id })) } catch (e) { setGalat((e as Error).message) }
  }, [t.id])
  useEffect(() => { if (buka) void muatBalasan() }, [buka, muatBalasan])

  async function balas(e: FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat('')
    try { await panggil('lms_forum_balas', { p_topik: t.id, p_isi: isi }); setIsi(''); await muatBalasan(); await muat() } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  async function hapus(jenis: 'topik' | 'balasan', id: string) {
    if (!window.confirm(jenis === 'topik' ? 'Hapus topik ini beserta balasannya dari tampilan?' : 'Hapus balasan ini?')) return
    setGalat('')
    try { await panggil('lms_forum_hapus', { p_jenis: jenis, p_id: id }); if (jenis === 'topik') await muat(); else { await muatBalasan(); await muat() } } catch (e) { setGalat((e as Error).message) }
  }
  async function kunci() {
    setGalat('')
    try { await panggil('lms_forum_kunci', { p_topik: t.id, p_kunci: !t.dikunci }); await muat() } catch (e) { setGalat((e as Error).message) }
  }
  return (
    <div className="kartu" style={{ marginTop: 8 }}>
      <p style={{ margin: 0 }}>
        <strong>{t.judul}</strong>{t.dikunci ? <> <span className="status status-dibatalkan">Dikunci</span></> : null}<br />
        <small>{t.penulis_nama}{peran(t.penulis_peran)}, {tglJam(t.dibuat_pada)}, {t.jumlah_balasan} balasan</small>
      </p>
      <p style={{ whiteSpace: 'pre-wrap' }}>{t.isi}</p>
      <div className="aksi">
        <button type="button" className="tombol" style={biru} onClick={() => setBuka(!buka)}>{buka ? 'Tutup diskusi' : 'Lihat dan balas'}</button>
        {kelola && <button type="button" className="tombol" style={biru} onClick={() => void kunci()}>{t.dikunci ? 'Buka kunci' : 'Kunci diskusi'}</button>}
        {(kelola || t.milik_saya) && <button type="button" className="tombol" style={merah} onClick={() => void hapus('topik', t.id)}>Hapus topik</button>}
      </div>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      {buka && (
        <div className="jarak">
          {!balasan && <p className="catatan">Memuat...</p>}
          {(balasan ?? []).map((b) => (
            <div key={b.id} style={{ borderLeft: '3px solid var(--warna-utama)', paddingLeft: 10, marginTop: 8 }}>
              <small><strong>{b.penulis_nama}</strong>{peran(b.penulis_peran)}, {tglJam(b.dibuat_pada)}</small>
              <p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{b.isi}</p>
              {(kelola || b.milik_saya) && <button type="button" className="tombol" style={merah} onClick={() => void hapus('balasan', b.id)}>Hapus</button>}
            </div>
          ))}
          {balasan && balasan.length === 0 && <p className="catatan">Belum ada balasan.</p>}
          {t.dikunci && !kelola
            ? <p className="catatan">Diskusi ini dikunci guru.</p>
            : (
              <form className="form jarak" onSubmit={balas}>
                <label>Balasan<textarea required rows={3} maxLength={5000} value={isi} onChange={(e) => setIsi(e.target.value)} /></label>
                <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Mengirim...' : 'Kirim balasan'}</button></div>
              </form>
            )}
        </div>
      )}
    </div>
  )
}

/** Forum satu pertemuan. */
export function Forum({ pertemuanId, kelola }: { pertemuanId: string; kelola: boolean }) {
  const [daftar, setDaftar] = useState<Topik[] | null>(null)
  const [galat, setGalat] = useState('')
  const [form, setForm] = useState(false)
  const [v, setV] = useState({ judul: '', isi: '' })
  const [sibuk, setSibuk] = useState(false)
  const muat = useCallback(async () => {
    try { setDaftar(await panggil<Topik[]>('lms_forum_daftar', { p_pertemuan: pertemuanId })) } catch (e) { setGalat((e as Error).message) }
  }, [pertemuanId])
  useEffect(() => { void muat() }, [muat])
  async function buat(e: FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat('')
    try { await panggil('lms_forum_buat', { p_pertemuan: pertemuanId, p_judul: v.judul, p_isi: v.isi }); setV({ judul: '', isi: '' }); setForm(false); await muat() } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  return (
    <>
      <div className="judul-bagian jarak"><h2>Forum diskusi</h2></div>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      <div className="aksi"><button className="tombol tombol-isi" onClick={() => setForm(!form)}>{form ? 'Tutup formulir' : 'Mulai topik diskusi'}</button></div>
      {form && (
        <form className="kartu form jarak" onSubmit={buat}>
          <label>Judul<input required maxLength={200} value={v.judul} onChange={(e) => setV({ ...v, judul: e.target.value })} /></label>
          <label>Pertanyaan atau pendapat<textarea required rows={4} maxLength={5000} value={v.isi} onChange={(e) => setV({ ...v, isi: e.target.value })} /></label>
          <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Mengirim...' : 'Kirim topik'}</button></div>
        </form>
      )}
      {!daftar && !galat && <p className="catatan">Memuat...</p>}
      {daftar && daftar.length === 0 && <div className="kartu jarak"><p className="catatan">Belum ada diskusi. Jadilah yang pertama bertanya.</p></div>}
      {(daftar ?? []).map((t) => <UtasTopik key={t.id} t={t} kelola={kelola} muat={muat} />)}
    </>
  )
}
