import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type ProfilPengguna } from '../lib/supabase'

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
  galatProfil: boolean
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
  const [galatProfil, setGalatProfil] = useState(false)
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
    setGalatProfil(false)
    // Batas waktu 20 detik: tanpa ini, satu permintaan yang menggantung membuat layar "Memuat..." selamanya.
    const batas = new Promise<never>((_, tolak) => window.setTimeout(() => tolak(new Error('waktu habis')), 20000))
    Promise.race([
      Promise.all([
        supabase.from('profil_pengguna').select('user_id, npsn, peran, ptk_id, peserta_didik_id').eq('user_id', userId).maybeSingle(),
        supabase.from('super_admin').select('user_id').eq('user_id', userId).maybeSingle(),
        supabase.rpc('penugasan_saya'),
      ]),
      batas,
    ])
      .then(([p, sa, pg]) => {
        if (batal) return
        if (p.error) throw p.error
        setProfil((p.data as ProfilPengguna | null) ?? null)
        setSuperAdmin(!!sa.data)
        setPenugasan((pg.data as PenugasanSaya[] | null) ?? [])
      })
      .catch(() => { if (!batal) setGalatProfil(true) })
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
