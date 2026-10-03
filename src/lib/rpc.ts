import { supabase } from './supabase'

/** Memanggil fungsi basis data dan melempar Error berpesan Indonesia bila gagal. */
export async function panggil<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const tgl = (x: string | null | undefined) =>
  x ? new Date(x).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'

export const tglJam = (x: string | null | undefined) =>
  x ? new Date(x).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'
