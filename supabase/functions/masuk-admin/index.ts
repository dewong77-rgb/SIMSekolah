// Masuk dengan username dan password untuk akun non-siswa. Dipanggil tanpa sesi (verify_jwt mati).
// Username dicari di server agar email tidak pernah dikirim ke peramban. Jawaban gagal seragam.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const GAGAL = { ok: false }
const BATAS_USERNAME = 5
const BATAS_IP = 30
const JENDELA_MENIT = 15

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(GAGAL, 405)

  let username = ''
  let password = ''
  try {
    const b = await req.json()
    username = String(b.username ?? '').trim().toLowerCase()
    password = String(b.password ?? '')
  } catch { return json(GAGAL, 400) }
  if (!/^[a-z0-9][a-z0-9._-]{3,31}$/.test(username) || password.length < 1 || password.length > 200) return json(GAGAL, 400)

  const url = Deno.env.get('SUPABASE_URL')!
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const ip = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? 'tidak-diketahui').split(',')[0].trim()
  const kUser = `adm:${username}`
  const kIp = `ip:${ip}`
  const sejak = new Date(Date.now() - JENDELA_MENIT * 60_000).toISOString()

  const hitungGagal = async (kunci: string) => {
    const { count } = await db.from('percobaan_masuk').select('*', { count: 'exact', head: true })
      .eq('kunci', kunci).eq('berhasil', false).gte('dibuat_pada', sejak)
    return count ?? 0
  }
  if ((await hitungGagal(kUser)) >= BATAS_USERNAME || (await hitungGagal(kIp)) >= BATAS_IP) {
    return json({ ok: false, dibatasi: true }, 429)
  }
  const catatGagal = () => db.from('percobaan_masuk').insert([{ kunci: kUser }, { kunci: kIp }])

  const { data: pa } = await db.from('profil_admin').select('user_id').eq('username', username).maybeSingle()
  let email: string | null = null
  if (pa) {
    const { data: prof } = await db.from('profil_pengguna').select('peran').eq('user_id', pa.user_id).maybeSingle()
    if (prof && prof.peran !== 'siswa') {
      const { data: u } = await db.auth.admin.getUserById(pa.user_id as string)
      email = u?.user?.email ?? null
    }
  }
  if (!email) { await catatGagal(); return json(GAGAL) }

  const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  if (error || !data.session) { await catatGagal(); return json(GAGAL) }

  await db.from('percobaan_masuk').insert({ kunci: kUser, berhasil: true })
  return json({ ok: true, access_token: data.session.access_token, refresh_token: data.session.refresh_token })
})
