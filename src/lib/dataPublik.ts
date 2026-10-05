import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { JurusanLengkap } from './hubin'

export type Jurusan = {
  slug: string
  nama: string
  bidang: string
  program: string
  ringkas: string
  prospek: string[]
  /** Dari profil jurusan yang dikelola Waka Hubinmas. Kosong bila memakai data cadangan Dapodik. */
  deskripsi?: string | null
  kompetensi_lulusan?: string | null
  mapel_kejuruan?: string | null
  fasilitas?: string | null
  kepala_program?: string | null
  jumlah_siswa?: number
}

type Baris = { bidang_keahlian: string; program_keahlian: string; kompetensi_keahlian: string }

// Uraian dan prospek adalah teks editorial, bukan data Dapodik. Kunci: nama kompetensi keahlian.
const uraian: Record<string, { ringkas: string; prospek: string[] }> = {
  'Teknik Kendaraan Ringan': {
    ringkas: 'Perawatan, perbaikan, dan diagnosis kendaraan ringan.',
    prospek: ['Teknisi bengkel resmi', 'Wirausaha bengkel', 'Industri komponen otomotif'],
  },
  'Teknik Pemesinan': {
    ringkas: 'Pengoperasian mesin bubut, frais, dan dasar CNC untuk pembuatan komponen.',
    prospek: ['Operator mesin CNC', 'Quality control', 'Industri manufaktur'],
  },
  'Teknik Elektronika Industri': {
    ringkas: 'Instalasi, kontrol, dan perawatan sistem elektronika dan otomasi industri.',
    prospek: ['Teknisi otomasi', 'Teknisi instrumentasi', 'Industri elektronik'],
  },
  'Teknik Komputer dan Jaringan': {
    ringkas: 'Perakitan komputer, jaringan, server, dan keamanan jaringan.',
    prospek: ['Teknisi jaringan', 'Administrator sistem', 'Penyedia layanan internet'],
  },
  'Produksi Film': {
    ringkas: 'Praproduksi, produksi, dan pascaproduksi film serta konten siaran.',
    prospek: ['Kamerawan dan editor', 'Produksi konten digital', 'Rumah produksi dan stasiun siaran'],
  },
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function useJurusan() {
  const [data, setData] = useState<Jurusan[] | null>(null)
  const [galat, setGalat] = useState(false)
  useEffect(() => {
    let batal = false
    const cadangan = () => supabase.rpc('jurusan_publik').then(({ data: d, error }) => {
      if (batal) return
      if (error || !d) return setGalat(true)
      setData(
        (d as Baris[]).map((b) => ({
          slug: slug(b.kompetensi_keahlian),
          nama: b.kompetensi_keahlian,
          bidang: b.bidang_keahlian,
          program: b.program_keahlian,
          ringkas: uraian[b.kompetensi_keahlian]?.ringkas ?? '',
          prospek: uraian[b.kompetensi_keahlian]?.prospek ?? [],
        })),
      )
    })
    // Profil jurusan dari Waka Hubinmas didahulukan. Bila kosong atau gagal, pakai data Dapodik.
    supabase.rpc('jurusan_profil_publik').then(({ data: d, error }) => {
      if (batal) return
      const baris = (d ?? []) as JurusanLengkap[]
      if (error || baris.length === 0) return void cadangan()
      setData(baris.map((b) => ({
        slug: slug(b.nama), nama: b.nama, bidang: b.bidang ?? '', program: b.program ?? '', ringkas: b.ringkas ?? '', prospek: b.prospek ?? [],
        deskripsi: b.deskripsi, kompetensi_lulusan: b.kompetensi_lulusan, mapel_kejuruan: b.mapel_kejuruan, fasilitas: b.fasilitas,
        kepala_program: b.kepala_program, jumlah_siswa: b.jumlah_siswa,
      })))
    })
    return () => { batal = true }
  }, [])
  return { jurusan: data, galat }
}

export type Statistik = { peserta_didik_aktif: number; alumni: number; ptk: number; rombel: number }

export function useStatistik() {
  const [data, setData] = useState<Statistik | null>(null)
  useEffect(() => {
    let batal = false
    supabase.rpc('statistik_publik').then(({ data: d, error }) => {
      if (!batal && !error && d) setData(d as Statistik)
    })
    return () => { batal = true }
  }, [])
  return data
}
