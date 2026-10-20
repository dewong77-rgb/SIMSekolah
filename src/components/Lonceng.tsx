import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Ikon from './Ikon'
import { panggil, tglJam } from '../lib/rpc'
import { labelPengingat, tujuan, usePengingat, type Butir } from '../pages/LmsPengingat'

// Lonceng notifikasi di pojok kanan atas portal. Menggabungkan pesan dari kurikulum, hal yang menunggu tindakan, dan pengingat LMS.
// Pesan dan pengingat bisa ditandai sudah dibaca. Hal yang menunggu tindakan hilang sendiri setelah dikerjakan.

export type Tindakan = { label: string; to: string; n: number }
type Pesan = { id: string; dari: string; pesan: string; waktu: string }

const kunciButir = (b: Butir) => `${b.jenis}:${b.kelas_id}:${b.pertemuan_id ?? ''}:${b.tugas_id ?? ''}:${b.asesmen_id ?? ''}`
const MAKS_TAMPIL = 15

export default function Lonceng({ tindakan, guru }: { tindakan: Tindakan[]; guru: boolean }) {
  const [buka, setBuka] = useState(false)
  const [dibaca, setDibaca] = useState<Set<string>>(new Set())
  const [pesan, setPesan] = useState<Pesan[]>([])
  const [galat, setGalat] = useState('')
  const kotak = useRef<HTMLDivElement>(null)
  const pengingat = usePengingat()

  useEffect(() => {
    panggil<string[]>('notif_dibaca_saya').then((k) => setDibaca(new Set(k))).catch(() => undefined)
  }, [])
  useEffect(() => {
    if (!guru) return
    const muat = () => panggil<Pesan[]>('lms_peringatan_saya').then(setPesan).catch(() => undefined)
    void muat()
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void muat() }, 60_000)
    return () => window.clearInterval(t)
  }, [guru])
  useEffect(() => {
    if (!buka) return
    const luar = (e: MouseEvent) => { if (!kotak.current?.contains(e.target as Node)) setBuka(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setBuka(false) }
    document.addEventListener('mousedown', luar)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', luar); document.removeEventListener('keydown', esc) }
  }, [buka])

  const butir = useMemo(() => (pengingat?.butir ?? []).filter((b) => !dibaca.has(kunciButir(b))), [pengingat, dibaca])
  const nTindakan = tindakan.reduce((j, t) => j + t.n, 0)
  const total = pesan.length + nTindakan + butir.length

  const tandaiPengingat = useCallback(async (daftar: Butir[]) => {
    const k = daftar.map(kunciButir)
    setDibaca((d) => new Set([...d, ...k]))
    try { await panggil('notif_tandai', { p_kunci: k }) } catch (e) { setGalat((e as Error).message) }
  }, [])
  async function tandaiPesan(daftar: Pesan[]) {
    const id = new Set(daftar.map((p) => p.id))
    setPesan((p) => p.filter((x) => !id.has(x.id)))
    try { await Promise.all(daftar.map((p) => panggil('lms_peringatan_baca', { p_id: p.id }))) } catch (e) { setGalat((e as Error).message) }
  }
  async function tandaiSemua() {
    setGalat('')
    await Promise.all([pesan.length ? tandaiPesan(pesan) : Promise.resolve(), butir.length ? tandaiPengingat(butir) : Promise.resolve()])
  }

  const bisaDitandai = pesan.length + butir.length > 0
  return (
    <div className="lonceng-menu" ref={kotak}>
      <button type="button" className="ikon-tombol lonceng" aria-expanded={buka} aria-haspopup="true" aria-controls="notifikasi-kotak"
        aria-label={total > 0 ? `Notifikasi, ${total} belum dibaca` : 'Notifikasi'} title="Notifikasi" onClick={() => setBuka(!buka)}>
        <Ikon nama="lonceng" />{total > 0 && <b className="angka">{total > 99 ? '99+' : total}</b>}
      </button>
      {buka && (
        <div className="lonceng-kotak" id="notifikasi-kotak" role="region" aria-label="Notifikasi">
          <div className="lonceng-kepala">
            <strong>Notifikasi</strong>
            {bisaDitandai && <button type="button" className="lonceng-aksi" onClick={() => void tandaiSemua()}><Ikon nama="centang" ukuran={14} /> Tandai semua dibaca</button>}
          </div>
          {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
          {total === 0 && <p className="lonceng-kosong">Tidak ada notifikasi baru.</p>}
          <ul className="lonceng-daftar">
            {pesan.map((p) => (
              <li key={p.id} className="lonceng-item tingkat-lewat">
                <Link to="/portal/lms" onClick={() => setBuka(false)}><span className="lencana">Kurikulum</span><strong>{p.pesan}</strong><small>{p.dari}, {tglJam(p.waktu)}</small></Link>
                <button type="button" className="lonceng-aksi" onClick={() => void tandaiPesan([p])} aria-label="Tandai sudah dibaca"><Ikon nama="centang" ukuran={14} /> Tandai dibaca</button>
              </li>
            ))}
            {tindakan.filter((t) => t.n > 0).map((t) => (
              <li key={t.to} className="lonceng-item tingkat-segera">
                <Link to={t.to} onClick={() => setBuka(false)}><span className="lencana">Tindakan</span><strong>{t.n} {t.label}</strong><small>Hilang sendiri setelah dikerjakan</small></Link>
              </li>
            ))}
            {butir.slice(0, MAKS_TAMPIL).map((b) => (
              <li key={kunciButir(b)} className={`lonceng-item tingkat-${b.tingkat}`}>
                <Link to={tujuan(b)} onClick={() => setBuka(false)}>
                  <span className="lencana">{labelPengingat[b.jenis]}</span><strong>{b.judul}</strong>
                  <small>{b.mapel} {b.rombel}{b.batas ? `, ${new Date(b.batas).getTime() < Date.now() ? 'tenggat lewat' : 'sampai'} ${tglJam(b.batas)}` : ''}</small>
                </Link>
                <button type="button" className="lonceng-aksi" onClick={() => void tandaiPengingat([b])} aria-label={`Tandai sudah dibaca: ${b.judul}`}><Ikon nama="centang" ukuran={14} /> Tandai dibaca</button>
              </li>
            ))}
          </ul>
          {butir.length > MAKS_TAMPIL && <p className="lonceng-kosong">Masih ada {butir.length - MAKS_TAMPIL} pengingat lain. Tandai yang sudah dibaca untuk melihatnya.</p>}
        </div>
      )}
    </div>
  )
}
