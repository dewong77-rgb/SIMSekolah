import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { panggil } from '../lib/rpc'

// Pilihan pindah kelas. Tetap di halaman yang sama (daftar pertemuan, rekap, buku nilai, jurnal) untuk kelas yang dipilih.

type KelasPilih = { id: string; mapel: string; rombel: string }

const urut = (a: KelasPilih, b: KelasPilih) =>
  a.mapel.localeCompare(b.mapel, 'id') || a.rombel.localeCompare(b.rombel, 'id', { numeric: true })

export default function PilihKelas({ kelasId, sub = '' }: { kelasId: string; sub?: '' | '/rekap' | '/nilai' | '/jurnal' }) {
  const arah = useNavigate()
  const [daftar, setDaftar] = useState<KelasPilih[]>([])
  useEffect(() => {
    panggil<KelasPilih[]>('lms_kelas_saya').then((d) => setDaftar([...d].sort(urut))).catch(() => undefined)
  }, [])
  if (daftar.length < 2) return null
  const mapel = [...new Set(daftar.map((k) => k.mapel))]
  return (
    <label className="pilih-kelas">
      <span>Pindah kelas</span>
      <select value={kelasId} onChange={(e) => arah(`/portal/lms/${e.target.value}${sub}`)}>
        {mapel.map((m) => (
          <optgroup key={m} label={m}>
            {daftar.filter((k) => k.mapel === m).map((k) => <option key={k.id} value={k.id}>{k.mapel} {k.rombel}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  )
}
