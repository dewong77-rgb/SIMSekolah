// Modul SPMI (Sistem Penjaminan Mutu Internal): tipe, konstanta, dan hook izin.
import { useEffect, useState } from 'react'
import { panggil } from './rpc'

export type IzinSpmi = 'kelola' | 'catat' | 'lihat'

export function useIzinSpmi() {
  const [izin, setIzin] = useState<string[] | null>(null)
  useEffect(() => {
    let batal = false
    panggil<string[]>('spmi_izin').then((x) => { if (!batal) setIzin(x ?? []) }).catch(() => { if (!batal) setIzin([]) })
    return () => { batal = true }
  }, [])
  return { izin: izin ?? [], memuat: izin === null, punya: (...k: IzinSpmi[]) => (izin ?? []).some((i) => (k as string[]).includes(i)) }
}

export const JENIS_DOKUMEN = [
  ['kebijakan', 'Kebijakan mutu'], ['manual', 'Manual mutu'], ['standar', 'Dokumen standar'],
  ['formulir', 'Formulir'], ['laporan', 'Laporan'], ['lainnya', 'Lainnya'],
] as const

export type Standar = {
  id: string; kode: string; nama: string; uraian: string | null; urutan: number; penanggung_jawab: string | null; aktif: boolean
}
export type Indikator = {
  id: string; standar_id: string; uraian: string; target: string | null; satuan: string | null; sumber_data: string | null; aktif: boolean
}
export type DokumenSpmi = {
  id: string; jenis: string; judul: string; nomor: string | null; tahun: number | null; tautan: string | null; catatan: string | null; diarsipkan: boolean
}
