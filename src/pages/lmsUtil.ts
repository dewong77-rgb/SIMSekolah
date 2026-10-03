// Pembantu bersama halaman LMS.
export const dua = (n: number) => String(n).padStart(2, '0')

export function keInputLokal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}T${dua(d.getHours())}:${dua(d.getMinutes())}`
}
export const dariInputLokal = (s: string): string | null => (s ? new Date(s).toISOString() : null)

export const nilaiTeks = (n: number | string | null | undefined) =>
  n === null || n === undefined ? '-' : Number(n).toLocaleString('id-ID', { maximumFractionDigits: 2 })

export const biru = { color: 'var(--warna-utama)' }
export const merah = { color: '#8a1f1f', borderColor: '#8a1f1f' }

/** Unduh tabel sebagai CSV (titik koma, BOM agar Excel membaca UTF-8). */
export function unduhCsv(nama: string, baris: (string | number | null | undefined)[][]) {
  const esc = (x: string | number | null | undefined) => {
    const s = x === null || x === undefined ? '' : String(x)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const isi = '﻿' + baris.map((b) => b.map(esc).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([isi], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = nama; a.click()
  URL.revokeObjectURL(url)
}
