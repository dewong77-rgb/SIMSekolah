import { createClient } from '@supabase/supabase-js'

// Kunci publik (publishable) memang aman di browser. Akses data dijaga RLS di basis data.
// Jangan pernah memasukkan kunci service_role ke sini.
const URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://myjdtybkfgscerdhyemb.supabase.co'
const KUNCI =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_3_nSHpyNyPTRIv2y0zD01A_dDeyGzB6'

export const supabase = createClient(URL, KUNCI)

export type Peran = 'admin_tu' | 'guru' | 'siswa' | 'orang_tua'

export type ProfilPengguna = {
  user_id: string
  npsn: string
  peran: Peran
  ptk_id: string | null
  peserta_didik_id: string | null
}
