// Gambar: perkecil di browser, unggah ke Supabase Storage, dan bentuk tautannya.
// Bucket "publik" dibaca siapa saja (logo, sampul, galeri, berita). Bucket "privat" hanya lewat tautan bertanda tangan (foto profil).
import { useEffect, useState } from 'react'
import { SUPABASE_URL, supabase } from './supabase'

export const BATAS_GAMBAR = 2 * 1024 * 1024
export const AKSEPTASI_GAMBAR = 'image/jpeg,image/png,image/webp'
const JENIS_OK = ['image/jpeg', 'image/png', 'image/webp']

export const urlPublik = (path: string | null | undefined) =>
  path ? `${SUPABASE_URL}/storage/v1/object/public/publik/${path.split('/').map(encodeURIComponent).join('/')}` : null

/** Kode pendek acak untuk nama berkas. Nama selalu baru, jadi tidak tertahan cache. */
export const kodeBerkas = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
export const tahunIni = () => new Date().getFullYear()

export type UkuranGambar = { sisi: number; kualitas?: number }
export const UKURAN = {
  foto: { sisi: 480, kualitas: 0.85 },
  logo: { sisi: 512, kualitas: 0.9 },
  sampul: { sisi: 1600, kualitas: 0.82 },
  berita: { sisi: 1600, kualitas: 0.82 },
  galeri: { sisi: 1600, kualitas: 0.82 },
} satisfies Record<string, UkuranGambar>

/** Memeriksa dan memperkecil gambar menjadi WebP. SVG dan jenis lain ditolak. */
export async function siapkanGambar(f: File, u: UkuranGambar): Promise<Blob> {
  if (!JENIS_OK.includes(f.type)) throw new Error('Gunakan gambar JPG, PNG, atau WebP.')
  if (f.size > 25 * 1024 * 1024) throw new Error('Gambar terlalu besar. Pilih gambar di bawah 25 MB.')
  let bmp: ImageBitmap
  try { bmp = await createImageBitmap(f) } catch { throw new Error('Gambar tidak dapat dibaca. Coba berkas lain.') }
  const skala = Math.min(1, u.sisi / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * skala)); c.height = Math.max(1, Math.round(bmp.height * skala))
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/webp', u.kualitas ?? 0.85))
  if (!blob || blob.type !== 'image/webp') throw new Error('Peramban ini tidak dapat memproses gambar. Gunakan peramban yang lebih baru.')
  if (blob.size > BATAS_GAMBAR) throw new Error('Gambar masih lebih dari 2 MB setelah diperkecil. Pilih gambar lain.')
  return blob
}

/** Perkecil lalu unggah. Mengembalikan path di dalam bucket. */
export async function unggahGambar(bucket: 'publik' | 'privat', path: string, f: File, u: UkuranGambar): Promise<string> {
  const blob = await siapkanGambar(f, u)
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false })
  if (error) throw new Error(pesanStorage(error.message))
  return path
}

export async function hapusGambar(bucket: 'publik' | 'privat', path: string | null | undefined) {
  if (path) await supabase.storage.from(bucket).remove([path]).catch(() => undefined)
}

function pesanStorage(m: string) {
  if (/row-level security|not authorized|policy/i.test(m)) return 'Anda tidak berwenang mengunggah gambar ini.'
  if (/mime|invalid/i.test(m)) return 'Jenis gambar tidak diterima.'
  if (/size|exceed/i.test(m)) return 'Ukuran gambar melebihi 2 MB.'
  return m
}

const cacheTtd = new Map<string, { url: string; sampai: number }>()
/** Tautan bertanda tangan untuk gambar privat, berlaku satu jam dan disimpan sementara di memori. */
export async function urlPrivat(path: string): Promise<string | null> {
  const ada = cacheTtd.get(path)
  if (ada && ada.sampai > Date.now()) return ada.url
  const { data, error } = await supabase.storage.from('privat').createSignedUrl(path, 3600)
  if (error || !data) return null
  cacheTtd.set(path, { url: data.signedUrl, sampai: Date.now() + 50 * 60_000 })
  return data.signedUrl
}

export function useUrlPrivat(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let batal = false
    setUrl(null)
    if (path) urlPrivat(path).then((u) => { if (!batal) setUrl(u) })
    return () => { batal = true }
  }, [path])
  return url
}

/** Galeri selayang pandang untuk situs publik. */
export function useGaleri() {
  const [daftar, setDaftar] = useState<{ path: string; keterangan: string | null }[]>([])
  useEffect(() => {
    let batal = false
    Promise.resolve(supabase.rpc('galeri_publik')).then(({ data }) => { if (!batal && Array.isArray(data)) setDaftar(data) }).catch(() => undefined)
    return () => { batal = true }
  }, [])
  return daftar
}
