import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type ProfilPengguna } from '../lib/supabase'

type NilaiAuth = {
  session: Session | null
  profil: ProfilPengguna | null
  superAdmin: boolean
  memuat: boolean
  keluar: () => Promise<void>
}

const Konteks = createContext<NilaiAuth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profil, setProfil] = useState<ProfilPengguna | null>(null)
  const [superAdmin, setSuperAdmin] = useState(false)
  const [memuatSesi, setMemuatSesi] = useState(true)
  const [memuatProfil, setMemuatProfil] = useState(false)

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
      setMemuatProfil(false)
      return
    }
    let batal = false
    setMemuatProfil(true)
    Promise.all([
      supabase
        .from('profil_pengguna')
        .select('user_id, npsn, peran, ptk_id, peserta_didik_id')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase.from('super_admin').select('user_id').eq('user_id', userId).maybeSingle(),
    ]).then(([p, sa]) => {
      if (batal) return
      setProfil((p.data as ProfilPengguna | null) ?? null)
      setSuperAdmin(!!sa.data)
      setMemuatProfil(false)
    })
    return () => {
      batal = true
    }
  }, [userId])

  const nilai: NilaiAuth = {
    session,
    profil,
    superAdmin,
    memuat: memuatSesi || memuatProfil,
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
