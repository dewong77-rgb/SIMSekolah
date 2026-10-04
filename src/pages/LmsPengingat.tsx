import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { panggil, tglJam } from '../lib/rpc'

// Pengingat LMS untuk siswa dan guru. Dihitung server saat dibuka, hilang sendiri setelah tindakan selesai.

type Butir = {
  jenis: 'absen' | 'tugas' | 'lembar' | 'latihan' | 'forum' | 'koreksi' | 'nilai' | 'absen_guru' | 'draf'
  judul: string; kelas_id: string; mapel: string; rombel: string
  pertemuan_id: string | null; tugas_id: string | null; asesmen_id: string | null; batas: string | null
  tingkat: 'lewat' | 'segera' | 'biasa'
}
type Hasil = { peran: 'siswa' | 'guru' | 'lain'; jumlah: number; butir: Butir[] }

const label: Record<Butir['jenis'], string> = {
  absen: 'Absen', tugas: 'Tugas', lembar: 'Lembar kerja', latihan: 'Latihan', forum: 'Diskusi',
  koreksi: 'Koreksi', nilai: 'Penilaian', absen_guru: 'Absen', draf: 'Persiapan',
}

function tujuan(b: Butir): string {
  const k = `/portal/lms/${b.kelas_id}`
  if ((b.jenis === 'latihan' || b.jenis === 'koreksi') && b.asesmen_id) return `${k}/kuis/${b.asesmen_id}`
  if (b.jenis === 'tugas' && b.tugas_id) return `${k}/tugas/${b.tugas_id}`
  if (b.jenis === 'nilai' && b.tugas_id) return `${k}/tugas/${b.tugas_id}`
  if (b.pertemuan_id) return `${k}/pertemuan/${b.pertemuan_id}`
  return k
}

function ket(b: Butir): string {
  if (!b.batas) return ''
  const lewat = new Date(b.batas).getTime() < Date.now()
  return `${b.jenis === 'absen' ? 'Ditutup' : lewat ? 'Tenggat lewat' : 'Sampai'} ${tglJam(b.batas)}`
}

export function usePengingat() {
  const [h, setH] = useState<Hasil | null>(null)
  useEffect(() => {
    let batal = false
    const muat = () => panggil<Hasil>('lms_pengingat_saya').then((r) => { if (!batal) setH(r) }).catch(() => undefined)
    void muat()
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void muat() }, 120_000)
    const v = () => { if (document.visibilityState === 'visible') void muat() }
    document.addEventListener('visibilitychange', v)
    return () => { batal = true; window.clearInterval(t); document.removeEventListener('visibilitychange', v) }
  }, [])
  return h
}

export default function PengingatLms({ maks = 6 }: { maks?: number }) {
  const h = usePengingat()
  const [semua, setSemua] = useState(false)
  if (!h || h.peran === 'lain' || h.jumlah === 0) return null
  const tampil = semua ? h.butir : h.butir.slice(0, maks)
  return (
    <section className="perhatian pengingat" aria-label="Pengingat belajar">
      <h2 className="menu-bagian-judul" style={{ margin: 0 }}>{h.peran === 'siswa' ? 'Yang perlu Anda kerjakan' : 'Yang perlu Anda tindak lanjuti'} ({h.jumlah})</h2>
      {tampil.map((b, i) => (
        <Link key={i} to={tujuan(b)} className={`perhatian-item pengingat-${b.tingkat}`}>
          <span className="lencana">{label[b.jenis]}</span>
          <span><strong>{b.judul}</strong><br /><small>{b.mapel} {b.rombel}{ket(b) ? `, ${ket(b)}` : ''}</small></span>
        </Link>
      ))}
      {h.jumlah > maks && <button type="button" className="tombol" onClick={() => setSemua(!semua)}>{semua ? 'Ringkas' : `Tampilkan semua (${h.jumlah})`}</button>}
    </section>
  )
}
