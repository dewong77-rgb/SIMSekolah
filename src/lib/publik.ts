import { supabase } from './supabase'

/**
 * Membaca RPC publik lewat penyangga CDN (/api/publik). Jawabannya sama untuk semua pengunjung, jadi tidak perlu
 * menembus ke Supabase setiap kali. Bila penyangga tidak ada atau gagal (pengembangan lokal, gangguan),
 * jatuh ke panggilan langsung dengan bentuk hasil yang sama seperti supabase.rpc.
 */
export async function rpcPublik<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<{ data: T | null; error: { message: string } | null }> {
  const kendali = new AbortController()
  const pewaktu = window.setTimeout(() => kendali.abort(), 10_000)
  try {
    const q = new URLSearchParams({ fn })
    if (args && Object.keys(args).length) q.set('a', JSON.stringify(args))
    const r = await fetch(`/api/publik?${q}`, { signal: kendali.signal })
    // Tanpa fungsi di sisi server, aturan SPA mengembalikan HTML: anggap gagal dan pakai jalur langsung.
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) return { data: (await r.json()) as T, error: null }
  } catch { /* jatuh ke Supabase langsung */ } finally { window.clearTimeout(pewaktu) }
  const { data, error } = await supabase.rpc(fn, args)
  return { data: data as T | null, error: error ? { message: error.message } : null }
}
