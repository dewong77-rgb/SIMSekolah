// Masuk siswa dengan NISN dan tanggal lahir. Dipanggil tanpa sesi (verify_jwt mati), jadi seluruh
// pengamanan ada di sini: batas percobaan per NISN dan per IP, hanya siswa aktif, jawaban gagal seragam.
// Hasil sukses: token_hash sekali pakai yang ditukar peramban menjadi sesi lewat auth.verifyOtp.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const GAGAL = { ok: false }
const BATAS_NISN = 5
const BATAS_IP = 30
const JENDELA_MENIT = 15

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false }, 405)

  let nisn = ''
  let lahir = ''
  try {
    const b = await req.json()
    nisn = String(b.nisn ?? '').trim()
    lahir = String(b.tanggal_lahir ?? '').trim()
  } catch { return json(GAGAL, 400) }
  if (!/^\d{10}$/.test(nisn) || !/^\d{4}-\d{2}-\d{2}$/.test(lahir)) return json(GAGAL, 400)

  const url = Deno.env.get('SUPABASE_URL')!
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const ip = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? 'tidak-diketahui').split(',')[0].trim()
  const kNisn = `nisn:${nisn}`
  const kIp = `ip:${ip}`
  const sejak = new Date(Date.now() - JENDELA_MENIT * 60_000).toISOString()

  const hitungGagal = async (kunci: string) => {
    const { count } = await db.from('percobaan_masuk').select('*', { count: 'exact', head: true })
      .eq('kunci', kunci).eq('berhasil', false).gte('dibuat_pada', sejak)
    return count ?? 0
  }
  if ((await hitungGagal(kNisn)) >= BATAS_NISN || (await hitungGagal(kIp)) >= BATAS_IP) {
    return json({ ok: false, dibatasi: true }, 429)
  }
  const catatGagal = () => db.from('percobaan_masuk').insert([{ kunci: kNisn }, { kunci: kIp }])

  const { data: sk } = await db.from('sekolah').select('npsn').limit(1).maybeSingle()
  if (!sk) { await catatGagal(); return json(GAGAL) }
  const { data: pds } = await db.from('peserta_didik').select('id,tanggal_lahir,status_peserta_didik')
    .eq('npsn', sk.npsn).eq('nisn', nisn).eq('status_peserta_didik', 'aktif')
  const pd = (pds ?? []).filter((p) => p.tanggal_lahir === lahir)
  if (pd.length !== 1) { await catatGagal(); return json(GAGAL) }
  const pdId = pd[0].id as string

  // akun dibuat saat masuk pertama
  let userId: string | null = null
  const { data: prof } = await db.from('profil_pengguna').select('user_id').eq('peserta_didik_id', pdId).maybeSingle()
  const email = `${nisn}@siswa.invalid`
  if (prof) userId = prof.user_id as string
  else {
    const { data: c, error: ec } = await db.auth.admin.createUser({ email, email_confirm: true })
    if (ec || !c?.user) { console.error('buat akun siswa:', ec?.message); return json({ ok: false, galat: 'akun tidak dapat dibuat' }, 500) }
    userId = c.user.id
    const { error: ei } = await db.from('profil_pengguna').insert({ user_id: userId, npsn: sk.npsn, peran: 'siswa', peserta_didik_id: pdId })
    if (ei) {
      await db.auth.admin.deleteUser(userId)
      console.error('profil siswa:', ei.message)
      return json({ ok: false, galat: 'akun tidak dapat dibuat' }, 500)
    }
  }
  const { data: u } = await db.auth.admin.getUserById(userId!)
  const { data: link, error: el } = await db.auth.admin.generateLink({ type: 'magiclink', email: u?.user?.email ?? email })
  if (el || !link?.properties?.hashed_token) { console.error('tautan:', el?.message); return json({ ok: false, galat: 'sesi tidak dapat dibuat' }, 500) }

  await db.from('percobaan_masuk').insert({ kunci: kNisn, berhasil: true })
  if (Math.random() < 0.02) await db.from('percobaan_masuk').delete().lt('dibuat_pada', new Date(Date.now() - 86_400_000).toISOString())
  return json({ ok: true, token_hash: link.properties.hashed_token })
})
