import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type ProfilPengguna } from '../lib/supabase'
import { catatKunjungan, catatLogin } from '../lib/kunjungan'

export type PenugasanSaya = {
  jabatan_kode: string; jabatan_nama: string; kelompok: string
  lingkup_id: string | null; lingkup_label: string | null; izin: string[]
}

type NilaiAuth = {
  session: Session | null
  profil: ProfilPengguna | null
  superAdmin: boolean
  penugasan: PenugasanSaya[]
  /** Super admin selalu true. Lingkup kosong pada penugasan berarti seluruh sekolah. */
  punyaIzin: (izin: string, lingkup?: string) => boolean
  memuat: boolean
  /** Terisi bila profil gagal dimuat (jaringan putus, server lambat). Berbeda dengan akun yang memang belum terdaftar. */
  galatProfil: string | null
  muatUlang: () => void
  keluar: () => Promise<void>
}

const Konteks = createContext<NilaiAuth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profil, setProfil] = useState<ProfilPengguna | null>(null)
  const [superAdmin, setSuperAdmin] = useState(false)
  const [penugasan, setPenugasan] = useState<PenugasanSaya[]>([])
  const [memuatSesi, setMemuatSesi] = useState(true)
  const [memuatProfil, setMemuatProfil] = useState(false)
  const [galatProfil, setGalatProfil] = useState<string | null>(null)
  const [ulang, setUlang] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setMemuatSesi(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // Profil dimuat di efek terpisah agar tidak memanggil Supabase di dalam callback auth.
  const userId = session?.user.id ?? null
  useEffect(() => { catatKunjungan() }, [])
  useEffect(() => { if (userId) catatLogin(userId) }, [userId])
  useEffect(() => {
    if (!userId) {
      setProfil(null)
      setSuperAdmin(false)
      setPenugasan([])
      setMemuatProfil(false)
      return
    }
    let batal = false
    setMemuatProfil(true)
    setGalatProfil(null)
    // Satu percobaan: batas waktu 15 detik, tanpa ini satu permintaan yang menggantung membuat layar "Memuat..." selamanya.
    const muatSekali = () => {
      let pewaktu = 0
      const batas = new Promise<never>((_, tolak) => { pewaktu = window.setTimeout(() => tolak(new Error('waktu habis (15 detik)')), 15000) })
      // Satu panggilan menggantikan tiga (profil, super admin, penugasan): tiap pengguna yang masuk hemat dua
      // permintaan ke server. Bila fungsinya belum ada (PGRST202/42883), jatuh ke tiga panggilan lama.
      const tigaPanggilan = () => Promise.all([
        supabase.from('profil_pengguna').select('user_id, npsn, peran, ptk_id, peserta_didik_id').eq('user_id', userId).maybeSingle(),
        supabase.from('super_admin').select('user_id').eq('user_id', userId).maybeSingle(),
        supabase.rpc('penugasan_saya'),
      ])
      const satuPanggilan = async () => {
        const r = await supabase.rpc('profil_saya')
        if (r.error) {
          if (r.error.code === 'PGRST202' || r.error.code === '42883') return tigaPanggilan()
          throw r.error
        }
        const d = r.data as { profil: ProfilPengguna | null; super_admin: boolean; penugasan: PenugasanSaya[] } | null
        return [
          { data: d?.profil ?? null, error: null },
          { data: d?.super_admin ? { user_id: userId } : null },
          { data: d?.penugasan ?? [] },
        ] as unknown as Awaited<ReturnType<typeof tigaPanggilan>>
      }
      return Promise.race([satuPanggilan(), batas]).finally(() => window.clearTimeout(pewaktu))
    }
    // Galat sementara (jaringan, waktu habis, 5xx) dicoba ulang sekali. Galat izin (401/403) tidak akan membaik dengan mengulang.
    const sementara = (e: unknown) => {
      const status = (e as { status?: number } | null)?.status
      return status === undefined || status >= 500 || status === 408 || status === 429
    }
    const rincian = (e: unknown) => {
      const g = e as { message?: string; code?: string; status?: number } | null
      return [g?.status, g?.code, g?.message ?? String(e)].filter(Boolean).join(' · ')
    }
    muatSekali()
      .catch(async (e) => {
        if (!sementara(e)) throw e
        await new Promise((r) => window.setTimeout(r, 1500))
        return muatSekali()
      })
      .then(([p, sa, pg]) => {
        if (batal) return
        if (p.error) throw p.error
        setProfil((p.data as ProfilPengguna | null) ?? null)
        setSuperAdmin(!!sa.data)
        setPenugasan((pg.data as PenugasanSaya[] | null) ?? [])
      })
      .catch((e) => {
        if (batal) return
        setGalatProfil(rincian(e))
        // Token ditolak server: masuk ulang adalah satu-satunya jalan, jadi tidak perlu menunggu pengguna menekan tombol.
        const status = (e as { status?: number } | null)?.status
        if (status === 401) void supabase.auth.signOut()
      })
      .finally(() => { if (!batal) setMemuatProfil(false) })
    return () => {
      batal = true
    }
  }, [userId, ulang])

  const nilai: NilaiAuth = {
    session,
    profil,
    superAdmin,
    penugasan,
    punyaIzin: (izin, lingkup) =>
      superAdmin ||
      penugasan.some((p) => p.izin.includes(izin) && (!lingkup || !p.lingkup_id || p.lingkup_id === lingkup)),
    memuat: memuatSesi || memuatProfil,
    galatProfil,
    muatUlang: () => setUlang((n) => n + 1),
    keluar: async () => {
      await supabase.auth.signOut()
    },
  }

  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>
}

export function useAuth(): NilaiAuth {
  const k = useContext(Konteks)
  if (!k) throw new Error('useAuth harus dipakai di dalam AuthProvider')
  return k
}
