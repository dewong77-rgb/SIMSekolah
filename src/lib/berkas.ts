// Unggah dan unduh berkas lewat Edge Function "drive". Berkas disimpan di Google Drive sekolah,
// metadata dan izin dijaga basis data. Browser tidak memegang kunci Google.
import { SUPABASE_KUNCI, SUPABASE_URL, supabase } from './supabase'

export const BATAS_BYTE = 25 * 1024 * 1024
export const AKSEPTASI = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.txt'

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  txt: 'text/plain',
}

export const ukuranTeks = (b: number | null | undefined) =>
  b == null ? '' : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

export function mimeBerkas(f: File): string | null {
  if (f.type && Object.values(MIME).includes(f.type)) return f.type
  return MIME[f.name.split('.').pop()?.toLowerCase() ?? ''] ?? null
}

/** Pesan galat bila berkas tidak boleh diunggah, atau null bila boleh. */
export function periksaBerkas(f: File): string | null {
  if (!mimeBerkas(f)) return 'Jenis berkas tidak didukung. Gunakan PDF, Word, Excel, PowerPoint, gambar, atau teks.'
  if (f.size <= 0) return 'Berkas kosong.'
  if (f.size > BATAS_BYTE) return `Ukuran berkas ${ukuranTeks(f.size)} melebihi batas 25 MB.`
  return null
}

export async function panggilDrive<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('drive', { body })
  if (error) {
    let pesan = error.message
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = await ctx.json()
        if (j?.error) pesan = j.error
      } catch { /* pakai pesan bawaan */ }
    }
    throw new Error(pesan)
  }
  return data as T
}

function kirimKeDrive(url: string, file: File, mime: string, onProgres?: (persen: number) => void) {
  return new Promise<{ id?: string }>((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open('PUT', url)
    x.setRequestHeader('Content-Type', mime)
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgres?.(Math.round((e.loaded / e.total) * 100)) }
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) {
        try { resolve(JSON.parse(x.responseText)) } catch { reject(new Error('Jawaban Drive tidak terbaca.')) }
      } else reject(new Error(`Drive menolak unggahan (kode ${x.status}).`))
    }
    x.onerror = () => reject(new Error('Koneksi ke Drive terputus. Coba lagi.'))
    x.send(file)
  })
}

export type BerkasTersimpan = { id: string; nama: string; ukuran: number }

export async function hapusBerkas(id: string) {
  await panggilDrive({ aksi: 'hapus', berkas_id: id })
}

/** Alur lengkap: minta sesi, unggah langsung ke Drive, verifikasi di server. */
export async function unggahBerkas(
  file: File, kategori: string, rujukan?: string | null, onProgres?: (persen: number) => void,
): Promise<BerkasTersimpan> {
  const salah = periksaBerkas(file)
  if (salah) throw new Error(salah)
  const mime = mimeBerkas(file)!
  const sesi = await panggilDrive<{ berkas_id: string; sesi_url: string }>({
    aksi: 'mulai', kategori, nama: file.name, mime, ukuran: file.size, rujukan: rujukan ?? null,
  })
  let hasil: { id?: string }
  try {
    hasil = await kirimKeDrive(sesi.sesi_url, file, mime, onProgres)
    if (!hasil.id) throw new Error('Drive tidak mengembalikan id berkas.')
  } catch (e) {
    await hapusBerkas(sesi.berkas_id).catch(() => undefined)
    throw e
  }
  try {
    await panggilDrive({ aksi: 'selesai', berkas_id: sesi.berkas_id, drive_file_id: hasil.id })
  } catch (e) {
    await hapusBerkas(sesi.berkas_id).catch(() => undefined)
    throw e
  }
  return { id: sesi.berkas_id, nama: file.name, ukuran: file.size }
}

/** Mengambil isi berkas sebagai Blob. Izin diperiksa server, bukan tautan publik. */
export async function ambilBlobBerkas(id: string): Promise<Blob> {
  const { data } = await supabase.auth.getSession()
  const r = await fetch(`${SUPABASE_URL}/functions/v1/drive`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}`, apikey: SUPABASE_KUNCI, 'Content-Type': 'application/json' },
    body: JSON.stringify({ aksi: 'unduh', berkas_id: id }),
  })
  if (!r.ok) {
    let pesan = `Unduh gagal (kode ${r.status}).`
    try { const j = await r.json(); if (j?.error) pesan = j.error } catch { /* abaikan */ }
    throw new Error(pesan)
  }
  return r.blob()
}

/** Mengunduh berkas ke perangkat. */
export async function unduhBerkas(id: string, nama: string) {
  const url = URL.createObjectURL(await ambilBlobBerkas(id))
  const a = document.createElement('a')
  a.href = url
  a.download = nama
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Memperkecil foto kamera (sisi terpanjang 1600 px, JPEG). Berkas non-gambar dikembalikan apa adanya. */
export async function perkecilFoto(f: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size < 300 * 1024) return f
  try {
    const bmp = await createImageBitmap(f)
    const skala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * skala); c.height = Math.round(bmp.height * skala)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    bmp.close()
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.8))
    if (!blob || blob.size >= f.size) return f
    return new File([blob], f.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch { return f }
}
