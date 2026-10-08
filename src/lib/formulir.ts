// Katalog formulir rinci Dapodik (tabel anak F-PTK dan F-PD, formulir Sarpras). Definisi tinggal di basis data (formulir_entitas, formulir_kolom).
import { panggil } from './rpc'

export type TipeKolom = 'teks' | 'angka' | 'bulat' | 'tanggal' | 'pilihan' | 'rujukan'
export type KolomF = {
  kunci: string; label: string; butir: string | null; tipe: TipeKolom; pilihan: string[] | null; rujukan: string | null
  wajib: boolean; bantuan: string | null; satuan: string | null; min_nilai: number | null; maks_nilai: number | null; urutan: number
}
export type EntitasF = {
  kode: string; domain: 'ptk' | 'siswa' | 'sarpras'; judul: string; kode_formulir: string; tampilan: 'tabel' | 'lembar'; tampil_kolom: string; kolom: KolomF[]
}
export type BarisF = { id: string; owner_id: string | null; dibuat_pada: string } & Record<string, unknown>

let katalog: Promise<EntitasF[]> | null = null
export function muatKatalog(): Promise<EntitasF[]> {
  if (!katalog) katalog = panggil<EntitasF[] | null>('formulir_katalog').then((x) => x ?? []).catch((e) => { katalog = null; throw e })
  return katalog
}

export const tglPanjang = (t: unknown) =>
  t ? new Date(String(t).slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

/** Nilai sel untuk tabel dan cetakan. Rujukan diganti nama baris induk. */
export function tampilNilai(k: KolomF, b: BarisF, rujukan: Record<string, BarisF[]>, induk: EntitasF[]): string {
  const v = b[k.kunci]
  if (v === null || v === undefined || v === '') return ''
  if (k.tipe === 'tanggal') return tglPanjang(v)
  if (k.tipe === 'rujukan') {
    const kolom = induk.find((e) => e.kode === k.rujukan)?.tampil_kolom
    const baris = (rujukan[k.rujukan ?? ''] ?? []).find((x) => x.id === v)
    return baris && kolom ? String(baris[kolom] ?? '') : ''
  }
  if (k.tipe === 'angka') {
    const n = Number(v).toLocaleString('id-ID', { maximumFractionDigits: 2 })
    return k.satuan === 'Rp' ? `Rp ${n}` : k.satuan ? `${n} ${k.satuan}` : n
  }
  return String(v) + (k.satuan && k.tipe === 'bulat' ? ` ${k.satuan}` : '')
}
