import { supabase } from './supabase'

/** Fungsi baca berat yang dipanggil dari banyak halaman. Panggilan serentak digabung dan hasilnya dipakai ulang sebentar. */
const TTL_BERSAMA: Record<string, number> = { lms_kelas_saya: 10_000 }
const bersama = new Map<string, { sampai: number; janji: Promise<unknown> }>()
// Hasil terikat pada pengguna: kosongkan saat masuk atau keluar.
supabase.auth.onAuthStateChange((e) => { if (e === 'SIGNED_IN' || e === 'SIGNED_OUT') bersama.clear() })

/** Memanggil fungsi basis data dan melempar Error berpesan Indonesia bila gagal. */
export async function panggil<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const ttl = TTL_BERSAMA[fn]
  const kunci = ttl ? `${fn}:${JSON.stringify(args ?? null)}` : ''
  if (ttl) {
    const ada = bersama.get(kunci)
    if (ada && ada.sampai > Date.now()) return ada.janji as Promise<T>
  }
  const jalan = (async () => {
    const { data, error } = await supabase.rpc(fn, args)
    if (error) throw new Error(error.message)
    return data as T
  })()
  if (ttl) {
    bersama.set(kunci, { sampai: Date.now() + ttl, janji: jalan })
    jalan.catch(() => bersama.delete(kunci))
  }
  return jalan
}

export const tgl = (x: string | null | undefined) =>
  x ? new Date(x).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'

export const tglJam = (x: string | null | undefined) =>
  x ? new Date(x).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'
