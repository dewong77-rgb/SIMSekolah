// Mendaftarkan akun guru dari data PTK. Hanya admin_tu, hanya untuk NPSN-nya sendiri.
// Kunci service_role hanya ada di sini (lingkungan server), tidak pernah ke peramban.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const JENIS_BOLEH = ['Guru', 'Kepala Sekolah']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ galat: 'metode tidak diizinkan' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const auth = req.headers.get('Authorization') ?? ''
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
  const { data: u } = await asUser.auth.getUser()
  if (!u.user) return json({ galat: 'belum masuk' }, 401)
  const { data: me } = await asUser.from('profil_pengguna').select('peran,npsn').eq('user_id', u.user.id).maybeSingle()
  if (!me || me.peran !== 'admin_tu') return json({ galat: 'tidak berwenang' }, 403)

  let ids: string[] = []
  try {
    const b = await req.json()
    ids = Array.isArray(b.ptk_ids) ? b.ptk_ids.filter((x: unknown) => typeof x === 'string') : []
  } catch { /* abaikan */ }
  if (!ids.length || ids.length > 100) return json({ galat: 'pilih 1 sampai 100 PTK' }, 400)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  // PTK dibaca lewat sesi admin: RLS membatasi pada NPSN-nya sendiri.
  const { data: ptk, error: e1 } = await asUser.from('ptk').select('id,nama,email,jenis_ptk').in('id', ids)
  if (e1) return json({ galat: e1.message }, 500)
  const { data: sudah } = await asUser.from('profil_pengguna').select('ptk_id').in('ptk_id', ids)
  const terdaftar = new Set((sudah ?? []).map((r: { ptk_id: string }) => r.ptk_id))

  async function cariPengguna(email: string): Promise<string | null> {
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
      if (error || !data.users.length) return null
      const f = data.users.find((x) => (x.email ?? '').toLowerCase() === email)
      if (f) return f.id
      if (data.users.length < 1000) return null
    }
    return null
  }

  const hasil: { ptk_id: string; nama: string; status: 'dibuat' | 'sudah' | 'dilewati' | 'gagal'; pesan?: string }[] = []
  for (const p of ptk ?? []) {
    const nama = p.nama as string
    const r = (status: 'dibuat' | 'sudah' | 'dilewati' | 'gagal', pesan?: string) =>
      hasil.push({ ptk_id: p.id, nama, status, pesan })
    if (terdaftar.has(p.id)) { r('sudah', 'akun sudah terdaftar'); continue }
    if (!JENIS_BOLEH.includes(p.jenis_ptk)) { r('dilewati', 'hanya guru dan kepala sekolah'); continue }
    const email = String(p.email ?? '').trim().toLowerCase()
    if (!EMAIL.test(email)) { r('dilewati', 'email kosong atau tidak valid'); continue }

    let userId: string | null = null
    let baru = false
    const { data: c, error: ec } = await admin.auth.admin.createUser({ email, email_confirm: true })
    if (c?.user) { userId = c.user.id; baru = true }
    else if (ec && /already|registered|exists/i.test(ec.message)) userId = await cariPengguna(email)
    if (!userId) { r('gagal', ec?.message ?? 'akun tidak dapat dibuat'); continue }

    if (!baru) {
      const { data: ada } = await admin.from('profil_pengguna').select('user_id').eq('user_id', userId).maybeSingle()
      if (ada) { r('gagal', 'email ini sudah dipakai akun lain'); continue }
    }
    const { error: ei } = await asUser.from('profil_pengguna').insert({ user_id: userId, npsn: me.npsn, peran: 'guru', ptk_id: p.id })
    if (ei) {
      if (baru) await admin.auth.admin.deleteUser(userId)
      r('gagal', ei.message)
      continue
    }
    r('dibuat')
  }
  return json({ hasil })
})
