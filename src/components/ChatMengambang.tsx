import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { panggil } from '../lib/rpc'
import Ikon from './Ikon'
import type { Jenis } from '../pages/Chat'

// Percakapan dimuat hanya saat satu ruang dibuka, supaya kode chat tidak ikut berat di setiap halaman portal.
const PercakapanMini = lazy(() => import('../pages/Chat').then((m) => ({ default: m.PercakapanMini })))

// Balon chat mengambang di pojok kanan bawah portal. Klik membuka daftar percakapan, klik satu ruang
// membuka percakapannya langsung di balon (baca dan kirim pesan). Pembaruan hanya saat panel terbuka dan tab terlihat.

type Ruang = {
  id: string; jenis: Jenis; judul: string; akses: 'peserta' | 'pemantau'
  pesan_terakhir_pada: string | null; pesan_terakhir: string | null; belum_dibaca: number
}

function waktu(iso: string): string {
  const d = new Date(iso)
  const hariIni = d.toDateString() === new Date().toDateString()
  return hariIni
    ? d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

export default function ChatMengambang({ jumlah }: { jumlah: number }) {
  const { pathname } = useLocation()
  const [buka, setBuka] = useState(false)
  const [daftar, setDaftar] = useState<Ruang[] | null>(null)
  const [galat, setGalat] = useState(false)
  const [ruangId, setRuangId] = useState<string | null>(null)
  const kotak = useRef<HTMLDivElement>(null)

  const muat = useCallback(async () => {
    try { setDaftar(await panggil<Ruang[]>('chat_ruang_daftar')); setGalat(false) } catch { setGalat(true) }
  }, [])

  // Daftar menutup saat pindah halaman. Percakapan yang sedang dibuka tetap terbuka, seperti chat di rapat daring.
  const ruangRef = useRef<string | null>(null)
  useEffect(() => { ruangRef.current = ruangId }, [ruangId])
  useEffect(() => { if (!ruangRef.current) setBuka(false) }, [pathname])

  useEffect(() => {
    if (!buka) return
    void muat()
    const id = window.setInterval(() => { if (!document.hidden) void muat() }, 20000)
    const tutupLuar = (e: MouseEvent) => { if (!ruangId && !kotak.current?.contains(e.target as Node)) setBuka(false) }
    const tutupEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setBuka(false) }
    document.addEventListener('mousedown', tutupLuar)
    document.addEventListener('keydown', tutupEsc)
    return () => { window.clearInterval(id); document.removeEventListener('mousedown', tutupLuar); document.removeEventListener('keydown', tutupEsc) }
  }, [buka, muat, ruangId])

  // Di halaman Chat sendiri balon tidak perlu.
  if (pathname.startsWith('/portal/chat')) return null

  const ruang = ruangId ? daftar?.find((r) => r.id === ruangId) ?? null : null
  const urut = [...(daftar ?? [])].sort((a, b) =>
    (b.belum_dibaca > 0 ? 1 : 0) - (a.belum_dibaca > 0 ? 1 : 0) ||
    (b.pesan_terakhir_pada ?? '').localeCompare(a.pesan_terakhir_pada ?? ''))

  return (
    <div className="chat-balon tanpa-cetak" ref={kotak}>
      {buka && (
        <section id="panel-chat-balon" className={'chat-balon-panel' + (ruang ? ' percakapan' : '')} role="dialog" aria-label={ruang ? `Percakapan ${ruang.judul}` : 'Percakapan terbaru'}>
          {ruang ? (
            <Suspense fallback={<p className="catatan" style={{ padding: 14 }}>Memuat...</p>}>
              <PercakapanMini ruang={ruang} muatDaftar={muat} kembali={() => setRuangId(null)} />
            </Suspense>
          ) : (
          <>
          <header>
            <strong>Chat</strong>
            <Link to="/portal/chat">Buka semua</Link>
          </header>
          <ul>
            {!daftar && !galat && <li className="catatan">Memuat...</li>}
            {galat && <li className="catatan galat" role="alert">Chat belum bisa dimuat. Coba lagi sebentar.</li>}
            {daftar && daftar.length === 0 && <li className="catatan">Belum ada percakapan.</li>}
            {urut.slice(0, 8).map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setRuangId(r.id)}>
                  <span className="chat-balon-atas">
                    <strong>{r.judul}</strong>
                    <small>{r.pesan_terakhir_pada ? waktu(r.pesan_terakhir_pada) : ''}</small>
                  </span>
                  <span className="chat-balon-cuplikan">
                    <span>{r.pesan_terakhir ?? 'Belum ada pesan'}</span>
                    {r.belum_dibaca > 0 && <b className="angka" aria-label={`${r.belum_dibaca} belum dibaca`}>{r.belum_dibaca > 99 ? '99+' : r.belum_dibaca}</b>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          </>
          )}
        </section>
      )}
      <button
        type="button"
        className="chat-balon-tombol"
        aria-expanded={buka}
        aria-controls="panel-chat-balon"
        aria-label={jumlah > 0 ? `Chat, ${jumlah} belum dibaca` : 'Chat'}
        onClick={() => setBuka(!buka)}
      >
        <Ikon nama={buka ? 'tutup' : 'chat'} ukuran={26} />
        {!buka && jumlah > 0 && <b className="angka">{jumlah > 99 ? '99+' : jumlah}</b>}
      </button>
    </div>
  )
}
