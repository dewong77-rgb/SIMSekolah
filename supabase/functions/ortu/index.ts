// Akun orang tua.
//   aksi "masuk": username NIK ibu (16 digit), password awal NPSN. Publik (tanpa JWT), dengan batas percobaan.
//   aksi "buat" : super admin membuat akun orang tua dari data ibu peserta didik aktif. Satu akun per NIK ibu,
//                 ditautkan ke semua anak aktif dengan NIK ibu yang sama. Aman diulang, dipanggil berulang sampai sisa 0.
// Email teknis akun: <NIK>@ortu.invalid (tidak pernah dikirimi surat).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const BATAS_USERNAME = 5
const BATAS_IP = 30
const JENDELA_MENIT = 15
const NIK_VALID = (n: string | null | undefined) => /^\d{16}$/.test(n ?? '') && !/^(\d)\1+$/.test(n ?? '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false }, 405)

  let b: Record<string, unknown> = {}
  try { b = await req.json() } catch { return json({ ok: false }, 400) }
  const aksi = String(b.aksi ?? '')

  const url = Deno.env.get('SUPABASE_URL')!
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // ---------- masuk ----------
  if (aksi === 'masuk') {
    const username = String(b.username ?? '').trim()
    const password = String(b.password ?? '')
    if (!/^\d{16}$/.test(username) || !password || password.length > 200) return json({ ok: false }, 400)
    const ip = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? 'tidak-diketahui').split(',')[0].trim()
    const kUser = `orang_tua:${username}`
    const kIp = `ip:${ip}`
    const sejak = new Date(Date.now() - JENDELA_MENIT * 60_000).toISOString()
    const hitungGagal = async (kunci: string) => {
      const { count } = await db.from('percobaan_masuk').select('*', { count: 'exact', head: true })
        .eq('kunci', kunci).eq('berhasil', false).gte('dibuat_pada', sejak)
      return count ?? 0
    }
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
    const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await anon.auth.signInWithPassword({ email: `${username}@ortu.invalid`, password })
    if (error || !data.session) {
      if (error && (error.code === 'user_banned' || /banned/i.test(error.message))) return json({ ok: false, nonaktif: true })
      await db.from('percobaan_masuk').insert([{ kunci: kUser }, { kunci: kIp }])
      return json({ ok: false, sisa: Math.max(0, BATAS_USERNAME - gagalUser - 1) })
    }
    await db.from('percobaan_masuk').insert({ kunci: kUser, berhasil: true })
    return json({
      ok: true,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      wajib_ganti: !!(data.user.app_metadata as Record<string, unknown> | undefined)?.wajib_ganti_sandi,
    })
  }

  // ---------- buat (super admin) ----------
  if (aksi === 'buat') {
    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: u } = await asUser.auth.getUser()
    if (!u.user) return json({ galat: 'belum masuk' }, 401)
    const { data: sa } = await db.from('super_admin').select('user_id').eq('user_id', u.user.id).maybeSingle()
    if (!sa) return json({ galat: 'tidak berwenang' }, 403)
    const { data: me } = await db.from('profil_pengguna').select('npsn').eq('user_id', u.user.id).maybeSingle()
    if (!me) return json({ galat: 'profil tidak ditemukan' }, 403)
    const batas = Math.min(Math.max(Number(b.batas) || 100, 1), 150)

    // Siswa aktif beserta NIK ibu.
    const nikKeAnak = new Map<string, Set<string>>()
    const adaIbu = new Set<string>()
    for (let dari = 0; dari < 20000; dari += 1000) {
      const { data, error } = await db.from('orang_tua_wali')
        .select('peserta_didik_id,nik,peserta_didik!inner(npsn,status_peserta_didik)')
        .eq('hubungan', 'ibu').eq('peserta_didik.npsn', me.npsn).eq('peserta_didik.status_peserta_didik', 'aktif')
        .order('id').range(dari, dari + 999)
      if (error) return json({ galat: error.message }, 500)
      for (const r of data ?? []) {
        const pd = r.peserta_didik_id as string
        adaIbu.add(pd)
        const nik = r.nik as string | null
        if (!NIK_VALID(nik)) continue
        if (!nikKeAnak.has(nik!)) nikKeAnak.set(nik!, new Set())
        nikKeAnak.get(nik!)!.add(pd)
      }
      if (!data || data.length < 1000) break
    }
    const denganNik = new Set<string>()
    for (const s of nikKeAnak.values()) for (const p of s) denganNik.add(p)
    const tanpaNik = adaIbu.size - denganNik.size

    // Akun orang tua yang sudah ada, dari email teknisnya.
    const ada = new Map<string, string>()
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
      if (error || !data.users.length) break
      for (const x of data.users) {
        const m = /^(\d{16})@ortu\.invalid$/.exec(x.email ?? '')
        if (m) ada.set(m[1], x.id)
      }
      if (data.users.length < 1000) break
    }

    // Tautan: lengkapi untuk akun yang sudah ada.
    const tautanAda = new Set<string>()
    const idAkun = [...ada.values()]
    for (let i = 0; i < idAkun.length; i += 200) {
      const { data } = await db.from('akun_anak').select('user_id,peserta_didik_id').in('user_id', idAkun.slice(i, i + 200))
      for (const r of data ?? []) tautanAda.add(`${r.user_id}:${r.peserta_didik_id}`)
    }
    const tautanBaru: { user_id: string; peserta_didik_id: string }[] = []
    for (const [nik, uid] of ada) {
      for (const pd of nikKeAnak.get(nik) ?? []) if (!tautanAda.has(`${uid}:${pd}`)) tautanBaru.push({ user_id: uid, peserta_didik_id: pd })
    }

    // Akun baru, satu per NIK.
    const belum = [...nikKeAnak.keys()].filter((n) => !ada.has(n))
    const kerja = belum.slice(0, batas)
    const dibuat: { user_id: string; nik: string }[] = []
    const gagal: string[] = []
    for (let i = 0; i < kerja.length; i += 10) {
      await Promise.all(kerja.slice(i, i + 10).map(async (nik) => {
        const { data: c, error } = await db.auth.admin.createUser({
          email: `${nik}@ortu.invalid`, password: me.npsn, email_confirm: true, app_metadata: { wajib_ganti_sandi: true },
        })
        if (c?.user) dibuat.push({ user_id: c.user.id, nik })
        else gagal.push(`${nik.slice(0, 6)}...${nik.slice(-4)}: ${error?.message ?? 'gagal'}`)
      }))
    }
    if (dibuat.length) {
      const { error } = await db.from('profil_pengguna').insert(dibuat.map((d) => ({ user_id: d.user_id, npsn: me.npsn, peran: 'orang_tua', sandi_awal_diatur: true })))
      if (error) {
        for (const d of dibuat) await db.auth.admin.deleteUser(d.user_id)
        return json({ galat: error.message }, 500)
      }
      for (const d of dibuat) for (const pd of nikKeAnak.get(d.nik) ?? []) tautanBaru.push({ user_id: d.user_id, peserta_didik_id: pd })
    }
    for (let i = 0; i < tautanBaru.length; i += 500) {
      const { error } = await db.from('akun_anak').upsert(tautanBaru.slice(i, i + 500), { onConflict: 'user_id,peserta_didik_id', ignoreDuplicates: true })
      if (error) return json({ galat: error.message }, 500)
    }
    return json({ dibuat: dibuat.length, tautan: tautanBaru.length, gagal, sisa: belum.length - kerja.length, tanpa_nik: tanpaNik, total_akun: ada.size + dibuat.length })
  }

  return json({ ok: false }, 400)
})
