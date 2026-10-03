// Jam WIB berjalan, tanggal, dan posisi jam pelajaran (jam ke berapa, sisa menit, istirahat, libur).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { muatAgenda, posisiJam, tanggalLengkap, teksPosisi, useJamBel, useSekarang, type Agenda } from '../lib/kalender'

const dua = (n: number) => String(n).padStart(2, '0')

export default function JamSistem({ varian = 'kartu' }: { varian?: 'kartu' | 'ringkas' | 'hero' }) {
  const n = useSekarang(varian === 'ringkas' ? 15_000 : 1000)
  const bel = useJamBel()
  const [hariIni, setHariIni] = useState<Agenda[]>([])
  useEffect(() => {
    let b = false
    muatAgenda(n.tanggal, n.tanggal).then((x) => { if (!b) setHariIni(x) }).catch(() => {})
    return () => { b = true }
  }, [n.tanggal])

  const p = bel ? posisiJam(bel, hariIni, n) : null
  const teks = p ? teksPosisi(p) : ''
  const jam = varian === 'ringkas' ? `${dua(n.jam)}.${dua(n.menit)}` : `${dua(n.jam)}.${dua(n.menit)}.${dua(n.detik)}`
  const lain = hariIni.filter((a) => a.kategori !== 'libur')

  if (varian === 'ringkas') {
    return (
      <Link to="/akademik" className="jam-ringkas" title={`${tanggalLengkap(n.tanggal)}. ${teks}`} aria-label={`Waktu sekarang ${jam} WIB. ${teks}`}>
        <strong>{jam}</strong><small>WIB</small>
        {p && p.status === 'sesi' && <span className="jam-slot">{p.slot.label}</span>}
      </Link>
    )
  }
  return (
    <div className={'jam-sistem ' + varian} role="timer" aria-live="off">
      <div className="jam-angka" aria-label={`Pukul ${jam} WIB`}>{jam}<small> WIB</small></div>
      <div className="jam-tanggal">{tanggalLengkap(n.tanggal)}</div>
      {p && <div className={'jam-posisi ' + p.status}>{teks}</div>}
      {p && p.status === 'sesi' && p.berikutnya && <div className="jam-berikut">Berikutnya: {p.berikutnya.label}, {p.berikutnya.mulai.replace(':', '.')}</div>}
      {lain.length > 0 && <div className="jam-berikut">Hari ini: {lain.map((a) => a.judul).join(', ')}</div>}
    </div>
  )
}
