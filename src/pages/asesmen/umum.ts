import { useCallback, useEffect, useState } from 'react'
import { panggil } from '../../lib/rpc'

/** Memuat data dari satu fungsi basis data dan menyediakan muat ulang. */
export function useRpc<T>(fn: string, args?: Record<string, unknown>, aktif = true) {
  const kunci = JSON.stringify(args ?? {})
  const [data, setData] = useState<T | null>(null)
  const [galat, setGalat] = useState('')
  const [memuat, setMemuat] = useState(aktif)
  const muat = useCallback(async () => {
    try { setData(await panggil<T>(fn, JSON.parse(kunci) as Record<string, unknown>)); setGalat('') } catch (e) { setGalat((e as Error).message) }
    setMemuat(false)
  }, [fn, kunci])
  useEffect(() => { if (aktif) void muat() }, [aktif, muat])
  return { data, galat, memuat, muat, setGalat }
}

export const jam = (x: string | null | undefined) =>
  x ? new Date(x).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'
export const jamSaja = (x: string | null | undefined) => (x ? new Date(x).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-')
export const labelJenis: Record<string, string> = { uts: 'UTS', uas: 'UAS', lainnya: 'Lainnya' }
export const labelStatus: Record<string, string> = { draf: 'Draf', aktif: 'Aktif', selesai: 'Selesai' }
