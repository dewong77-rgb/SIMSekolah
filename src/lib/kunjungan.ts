import { useEffect, useState } from 'react'
import { panggil } from './rpc'
import { rpcPublik } from './publik'

// Pengunjung dikenali dari kode acak di peramban, bukan IP. Dicatat paling banyak satu kali per hari per peramban.

type Angka = { pengunjung: number; login: number }
export type StatistikKunjungan = {
  tanggal: string
  hari_ini: Angka
  kemarin: Angka
  bulan_ini: Angka
  total_pengunjung: number
  harian: { tanggal: string; pengunjung: number; login: number }[]
}

const hariWib = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })

function simpan(kunci: string, nilai?: string): string | null {
  try {
    if (nilai === undefined) return window.localStorage.getItem(kunci)
    window.localStorage.setItem(kunci, nilai)
  } catch { /* peramban memblokir penyimpanan: abaikan */ }
  return null
}

function kodePengunjung(): string {
  let id = simpan('sims_pengunjung')
  if (!id || !/^[A-Za-z0-9-]{16,64}$/.test(id)) {
    id = crypto.randomUUID()
    simpan('sims_pengunjung', id)
  }
  return id
}

export function catatKunjungan() {
  const hari = hariWib()
  if (simpan('sims_kunjungan_hari') === hari) return
  // Pencatatan bukan prioritas: ditunda beberapa detik agar tidak berebut koneksi dengan data yang sedang ditunggu pengunjung.
  window.setTimeout(() => {
    panggil('catat_kunjungan', { p_pengunjung: kodePengunjung() })
      .then(() => simpan('sims_kunjungan_hari', hari))
      .catch(() => undefined)
  }, 4000 + Math.floor(Math.random() * 8000))
}

export function catatLogin(userId: string) {
  const hari = hariWib()
  const kunci = `sims_login_${userId}`
  if (simpan(kunci) === hari) return
  panggil('catat_login')
    .then(() => simpan(kunci, hari))
    .catch(() => undefined)
}

export function useStatistikKunjungan() {
  const [data, setData] = useState<StatistikKunjungan | null>(null)
  const [galat, setGalat] = useState(false)
  useEffect(() => {
    let batal = false
    rpcPublik<StatistikKunjungan>('statistik_kunjungan')
      .then(({ data: d, error }) => {
        if (batal) return
        if (error || !d) setGalat(true); else setData(d)
      })
    return () => { batal = true }
  }, [])
  return { data, galat }
}
