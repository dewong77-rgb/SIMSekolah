// Masuk satu pintu dengan username dan password, per peran.
//   guru   : username NIP (atau NUPTK), password awal NPSN (juga untuk tenaga kependidikan)
//   siswa  : username NISN (siswa aktif), password awal tanggal lahir DDMMYYYY
//   alumni : username NISN (status lulus), password awal tanggal lahir DDMMYYYY
//   admin  : username dari profil_admin (hanya admin TU)
// Dipanggil tanpa sesi (verify_jwt mati). Pencarian username dan verifikasi password terjadi di server,
// email tidak pernah dikirim ke peramban. Jawaban gagal seragam, dengan batas percobaan per username dan per IP.
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

  let peran = ''
  let username = ''
  let password = ''
  try {
    const b = await req.json()
    peran = String(b.peran ?? '')
    username = String(b.username ?? '').trim().toLowerCase()
    password = String(b.password ?? '')
  } catch { return json(GAGAL, 400) }
  if (!['guru', 'siswa', 'alumni', 'admin'].includes(peran)) return json(GAGAL, 400)
  if (!username || username.length > 40 || !password || password.length > 200) return json(GAGAL, 400)
  if ((peran === 'siswa' || peran === 'alumni') && !/^\d{10}$/.test(username)) return json(GAGAL, 400)
  if (peran === 'guru' && !/^\d{8,20}$/.test(username)) return json(GAGAL, 400)
  if (peran === 'admin' && !/^[a-z0-9][a-z0-9._-]{3,31}$/.test(username)) return json(GAGAL, 400)

  const url = Deno.env.get('SUPABASE_URL')!
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const ip = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? 'tidak-diketahui').split(',')[0].trim()
  const kUser = `${peran}:${username}`
  const kIp = `ip:${ip}`
  const sejak = new Date(Date.now() - JENDELA_MENIT * 60_000).toISOString()

  const hitungGagal = async (kunci: string) => {
    const { count } = await db.from('percobaan_masuk').select('*', { count: 'exact', head: true })
      .eq('kunci', kunci).eq('berhasil', false).gte('dibuat_pada', sejak)
    return count ?? 0
  }
  // Menit sampai kunci terbuka: saat catatan gagal tertua dari deretan BATAS terbaru keluar dari jendela.
  const menitTunggu = async (kunci: string, batas: number) => {
    const { data } = await db.from('percobaan_masuk').select('dibuat_pada').eq('kunci', kunci).eq('berhasil', false)
      .gte('dibuat_pada', sejak).order('dibuat_pada', { ascending: false }).limit(batas)
    const t = data?.[batas - 1]?.dibuat_pada as string | undefined
    if (!t) return JENDELA_MENIT
    return Math.min(JENDELA_MENIT, Math.max(1, Math.ceil(JENDELA_MENIT - (Date.now() - new Date(t).getTime()) / 60_000)))
  }
  const gagalUser = await hitungGagal(kUser)
  const gagalIp = await hitungGagal(kIp)
  if (gagalUser >= BATAS_USERNAME || gagalIp >= BATAS_IP) {
    const tunggu = Math.max(gagalUser >= BATAS_USERNAME ? await menitTunggu(kUser, BATAS_USERNAME) : 0, gagalIp >= BATAS_IP ? await menitTunggu(kIp, BATAS_IP) : 0)
    return json({ ok: false, dibatasi: true, tunggu_menit: tunggu }, 429)
  }
  const catatGagal = () => db.from('percobaan_masuk').insert([{ kunci: kUser }, { kunci: kIp }])
  // Jawaban gagal tetap seragam, ditambah sisa percobaan. Username yang tidak ada ikut dihitung sama, jadi tidak membocorkan apa pun.
  const sisa = Math.max(0, BATAS_USERNAME - gagalUser - 1)
  const gagal = async () => { await catatGagal(); return json({ ok: false, sisa }) }

  // Cari akun yang cocok dengan username pada peran yang dipilih.
  const { data: sk } = await db.from('sekolah').select('npsn').limit(1).maybeSingle()
  if (!sk) { return await gagal() }
  let userIds: string[] = []
  if (peran === 'siswa' || peran === 'alumni') {
    const { data: pds } = await db.from('peserta_didik').select('id').eq('npsn', sk.npsn).eq('nisn', username)
      .eq('status_peserta_didik', peran === 'siswa' ? 'aktif' : 'lulus')
    const ids = (pds ?? []).map((p) => p.id as string)
    if (ids.length) {
      const { data } = await db.from('profil_pengguna').select('user_id').in('peserta_didik_id', ids).eq('peran', 'siswa')
      userIds = (data ?? []).map((r) => r.user_id as string)
    }
  } else if (peran === 'guru') {
    const { data: pt } = await db.from('ptk').select('id').eq('npsn', sk.npsn).or(`nip.eq.${username},nuptk.eq.${username}`)
    const ids = (pt ?? []).map((p) => p.id as string)
    if (ids.length) {
      const { data } = await db.from('profil_pengguna').select('user_id').in('ptk_id', ids).in('peran', ['guru', 'staf'])
      userIds = (data ?? []).map((r) => r.user_id as string)
    }
  } else {
    const { data: pa } = await db.from('profil_admin').select('user_id').eq('username', username).maybeSingle()
    if (pa) {
      const { data } = await db.from('profil_pengguna').select('user_id').eq('user_id', pa.user_id).eq('peran', 'admin_tu')
      userIds = (data ?? []).map((r) => r.user_id as string)
    }
  }
  userIds = userIds.slice(0, 3)
  if (!userIds.length) { return await gagal() }

  const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
  let nonaktif = false
  for (const id of userIds) {
    const { data: u } = await db.auth.admin.getUserById(id)
    const email = u?.user?.email
    if (!email) continue
    const { data, error } = await anon.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.code === 'user_banned' || /banned/i.test(error.message)) nonaktif = true
      continue
    }
    if (!data.session) continue
    await db.from('percobaan_masuk').insert({ kunci: kUser, berhasil: true })
    if (Math.random() < 0.02) await db.from('percobaan_masuk').delete().lt('dibuat_pada', new Date(Date.now() - 86_400_000).toISOString())
    return json({
      ok: true,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      wajib_ganti: !!(u.user.app_metadata as Record<string, unknown> | undefined)?.wajib_ganti_sandi,
    })
  }
  if (nonaktif) return json({ ok: false, nonaktif: true })
  return await gagal()
})
