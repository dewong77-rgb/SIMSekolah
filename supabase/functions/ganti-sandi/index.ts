// Ganti password sendiri. Juga mencabut penanda wajib_ganti_sandi (app_metadata, hanya bisa ditulis server).
// Password baru tidak boleh sama dengan password awal (tanggal lahir DDMMYYYY atau NPSN) maupun username (termasuk NIK ibu untuk orang tua).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ galat: 'metode tidak diizinkan' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: u } = await asUser.auth.getUser()
  if (!u.user) return json({ galat: 'belum masuk' }, 401)

  let sandi = ''
  try { sandi = String((await req.json()).sandi_baru ?? '') } catch { return json({ galat: 'permintaan tidak valid' }, 400) }
  if (sandi.length < 8) return json({ galat: 'Password minimal 8 karakter.' }, 400)
  if (sandi.length > 72) return json({ galat: 'Password terlalu panjang.' }, 400)
  if (/^(.)\1+$/.test(sandi)) return json({ galat: 'Password tidak boleh satu karakter berulang.' }, 400)

  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: prof } = await db.from('profil_pengguna').select('npsn,peran,ptk_id,peserta_didik_id').eq('user_id', u.user.id).maybeSingle()
  const terlarang = new Set<string>()
  if (prof) {
    terlarang.add(prof.npsn)
    if (prof.peserta_didik_id) {
      const { data: pd } = await db.from('peserta_didik').select('nisn,tanggal_lahir').eq('id', prof.peserta_didik_id).maybeSingle()
      if (pd?.nisn) terlarang.add(pd.nisn)
      if (pd?.tanggal_lahir) { const [y, m, d] = String(pd.tanggal_lahir).split('-'); terlarang.add(`${d}${m}${y}`); terlarang.add(`${y}${m}${d}`) }
    }
    if (prof.ptk_id) {
      const { data: pt } = await db.from('ptk').select('nip,nuptk').eq('id', prof.ptk_id).maybeSingle()
      if (pt?.nip) terlarang.add(pt.nip)
      if (pt?.nuptk) terlarang.add(pt.nuptk)
    }
  }
  const { data: pa } = await db.from('profil_admin').select('username').eq('user_id', u.user.id).maybeSingle()
  if (pa?.username) terlarang.add(pa.username)
  if (u.user.email) {
    terlarang.add(u.user.email.toLowerCase())
    // Akun orang tua: username adalah NIK ibu (bagian depan email teknis <NIK>@ortu.invalid).
    const m = /^(\d{16})@ortu\.invalid$/.exec(u.user.email.toLowerCase())
    if (m) terlarang.add(m[1])
  }
  if (terlarang.has(sandi) || terlarang.has(sandi.toLowerCase())) {
    return json({ galat: 'Password terlalu mudah ditebak (sama dengan password awal atau username). Pilih yang lain.' }, 400)
  }

  const { error } = await db.auth.admin.updateUserById(u.user.id, { password: sandi, app_metadata: { wajib_ganti_sandi: false } })
  if (error) return json({ galat: error.message }, 400)
  await db.from('profil_pengguna').update({ sandi_awal_diatur: true }).eq('user_id', u.user.id)
  return json({ ok: true })
})
