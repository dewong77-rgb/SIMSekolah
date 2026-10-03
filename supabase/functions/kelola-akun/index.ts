// Kelola akun pengguna. Hanya super admin (tabel super_admin). Kunci service_role hanya di server.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const PERAN = ['admin_tu', 'guru', 'siswa', 'orang_tua']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ galat: 'metode tidak diizinkan' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: u } = await asUser.auth.getUser()
  if (!u.user) return json({ galat: 'belum masuk' }, 401)
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: sa } = await db.from('super_admin').select('user_id').eq('user_id', u.user.id).maybeSingle()
  if (!sa) return json({ galat: 'tidak berwenang' }, 403)
  const { data: me } = await db.from('profil_pengguna').select('npsn').eq('user_id', u.user.id).maybeSingle()
  if (!me) return json({ galat: 'profil tidak ditemukan' }, 403)

  let b: Record<string, unknown> = {}
  try { b = await req.json() } catch { return json({ galat: 'permintaan tidak valid' }, 400) }
  const aksi = String(b.aksi ?? '')
  const target = String(b.user_id ?? '')
  const diri = target === u.user.id

  async function semuaPengguna() {
    const peta = new Map<string, { email: string | null; terakhir_masuk: string | null; nonaktif: boolean }>()
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
      if (error || !data.users.length) break
      for (const x of data.users) {
        peta.set(x.id, {
          email: x.email ?? null,
          terakhir_masuk: x.last_sign_in_at ?? null,
          nonaktif: !!x.banned_until && new Date(x.banned_until) > new Date(),
        })
      }
      if (data.users.length < 1000) break
    }
    return peta
  }

  if (aksi === 'daftar') {
    const { data: prof, error } = await db.from('profil_pengguna').select('user_id,peran,ptk_id,peserta_didik_id,dibuat_pada').eq('npsn', me.npsn).limit(5000)
    if (error) return json({ galat: error.message }, 500)
    const rows = prof ?? []
    const ptkIds = rows.map((r) => r.ptk_id).filter(Boolean) as string[]
    const pdIds = rows.map((r) => r.peserta_didik_id).filter(Boolean) as string[]
    const nama = new Map<string, { nama: string; nisn?: string | null }>()
    for (let i = 0; i < ptkIds.length; i += 200) {
      const { data } = await db.from('ptk').select('id,nama').in('id', ptkIds.slice(i, i + 200))
      for (const p of data ?? []) nama.set(p.id, { nama: p.nama })
    }
    for (let i = 0; i < pdIds.length; i += 200) {
      const { data } = await db.from('peserta_didik').select('id,nama,nisn').in('id', pdIds.slice(i, i + 200))
      for (const p of data ?? []) nama.set(p.id, { nama: p.nama, nisn: p.nisn })
    }
    const au = await semuaPengguna()
    const { data: sas } = await db.from('super_admin').select('user_id')
    const superSet = new Set((sas ?? []).map((s) => s.user_id as string))
    const pengguna = rows.map((r) => {
      const n = nama.get((r.ptk_id ?? r.peserta_didik_id) as string)
      const a = au.get(r.user_id)
      return {
        user_id: r.user_id, peran: r.peran, nama: n?.nama ?? null, nisn: n?.nisn ?? null,
        email: a?.email ?? null, terakhir_masuk: a?.terakhir_masuk ?? null, nonaktif: a?.nonaktif ?? false,
        super_admin: superSet.has(r.user_id), dibuat_pada: r.dibuat_pada,
      }
    })
    const { count: aktif } = await db.from('peserta_didik').select('*', { count: 'exact', head: true }).eq('npsn', me.npsn).eq('status_peserta_didik', 'aktif')
    const { count: guru } = await db.from('ptk').select('*', { count: 'exact', head: true }).eq('npsn', me.npsn).in('jenis_ptk', ['Guru', 'Kepala Sekolah'])
    return json({ pengguna, ringkasan: { siswa_aktif: aktif ?? 0, guru_total: guru ?? 0 } })
  }

  if (aksi === 'ubah_peran') {
    const peran = String(b.peran ?? '')
    if (!PERAN.includes(peran)) return json({ galat: 'peran tidak dikenal' }, 400)
    if (diri) return json({ galat: 'tidak dapat mengubah akun sendiri' }, 400)
    if (peran === 'siswa') return json({ galat: 'peran siswa hanya terbentuk dari login siswa' }, 400)
    const { error } = await db.from('profil_pengguna').update({ peran }).eq('user_id', target).eq('npsn', me.npsn)
    return error ? json({ galat: error.message }, 400) : json({ ok: true })
  }

  if (aksi === 'nonaktifkan') {
    if (diri) return json({ galat: 'tidak dapat menonaktifkan akun sendiri' }, 400)
    const { data: ada } = await db.from('profil_pengguna').select('user_id').eq('user_id', target).eq('npsn', me.npsn).maybeSingle()
    if (!ada) return json({ galat: 'akun tidak ditemukan' }, 404)
    const nonaktif = b.nonaktif !== false
    const { error } = await db.auth.admin.updateUserById(target, { ban_duration: nonaktif ? '876000h' : 'none' })
    return error ? json({ galat: error.message }, 400) : json({ ok: true })
  }

  if (aksi === 'hapus') {
    if (diri) return json({ galat: 'tidak dapat menghapus akun sendiri' }, 400)
    const { data: ada } = await db.from('profil_pengguna').select('user_id').eq('user_id', target).eq('npsn', me.npsn).maybeSingle()
    if (!ada) return json({ galat: 'akun tidak ditemukan' }, 404)
    await db.from('akun_anak').delete().eq('user_id', target)
    const { error } = await db.auth.admin.deleteUser(target) // profil_pengguna ikut terhapus (cascade)
    return error ? json({ galat: error.message }, 400) : json({ ok: true })
  }

  if (aksi === 'tambah') {
    const email = String(b.email ?? '').trim().toLowerCase()
    const peran = String(b.peran ?? '')
    if (!EMAIL.test(email)) return json({ galat: 'email tidak valid' }, 400)
    if (!['admin_tu', 'guru', 'orang_tua'].includes(peran)) return json({ galat: 'peran tidak dapat ditambah manual' }, 400)
    const { data: c, error: ec } = await db.auth.admin.createUser({ email, email_confirm: true })
    if (ec || !c?.user) return json({ galat: ec?.message ?? 'akun tidak dapat dibuat' }, 400)
    const { error: ei } = await db.from('profil_pengguna').insert({ user_id: c.user.id, npsn: me.npsn, peran })
    if (ei) {
      await db.auth.admin.deleteUser(c.user.id)
      return json({ galat: ei.message }, 400)
    }
    return json({ ok: true })
  }

  return json({ galat: 'aksi tidak dikenal' }, 400)
})
