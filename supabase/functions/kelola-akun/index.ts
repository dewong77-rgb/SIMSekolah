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
const ddmmyyyy = (t: string) => { const [y, m, d] = t.split('-'); return `${d}${m}${y}` }
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
    const peta = new Map<string, { email: string | null; terakhir_masuk: string | null; nonaktif: boolean; wajib_ganti: boolean }>()
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
      if (error || !data.users.length) break
      for (const x of data.users) {
        peta.set(x.id, {
          email: x.email ?? null,
          terakhir_masuk: x.last_sign_in_at ?? null,
          nonaktif: !!x.banned_until && new Date(x.banned_until) > new Date(),
          wajib_ganti: !!(x.app_metadata as Record<string, unknown> | undefined)?.wajib_ganti_sandi,
        })
      }
      if (data.users.length < 1000) break
    }
    return peta
  }

  type Baris = {
    user_id: string; peran: string; dibuat_pada: string; sandi_awal_diatur: boolean
    ptk: { nama: string } | null
    peserta_didik: { nama: string; nisn: string | null; status_peserta_didik: string } | null
  }
  // PostgREST membatasi 1000 baris per permintaan, jadi dibaca berhalaman.
  async function semuaProfil(): Promise<Baris[]> {
    const out: Baris[] = []
    for (let dari = 0; dari < 20000; dari += 1000) {
      const { data, error } = await db.from('profil_pengguna')
        .select('user_id,peran,dibuat_pada,sandi_awal_diatur,ptk(nama),peserta_didik(nama,nisn,status_peserta_didik)')
        .eq('npsn', me.npsn).order('user_id').range(dari, dari + 999)
      if (error) throw new Error(error.message)
      out.push(...((data ?? []) as unknown as Baris[]))
      if (!data || data.length < 1000) break
    }
    return out
  }

  if (aksi === 'daftar') {
    let rows: Baris[]
    try { rows = await semuaProfil() } catch (e) { return json({ galat: (e as Error).message }, 500) }
    const au = await semuaPengguna()
    const { data: sas } = await db.from('super_admin').select('user_id')
    const superSet = new Set((sas ?? []).map((x) => x.user_id as string))
    const pengguna = rows.map((r) => {
      const a = au.get(r.user_id)
      const pd = r.peserta_didik
      return {
        user_id: r.user_id, peran: r.peran, status_pd: pd?.status_peserta_didik ?? null,
        nama: r.ptk?.nama ?? pd?.nama ?? null, nisn: pd?.nisn ?? null,
        email: a?.email ?? null, terakhir_masuk: a?.terakhir_masuk ?? null, nonaktif: a?.nonaktif ?? false,
        super_admin: superSet.has(r.user_id), dibuat_pada: r.dibuat_pada,
        sandi: r.peran !== 'siswa' && r.peran !== 'guru' ? null : !r.sandi_awal_diatur ? 'belum' : a?.wajib_ganti ? 'awal' : 'diganti',
      }
    })
    const hitung = async (status: string) => {
      const { count } = await db.from('peserta_didik').select('*', { count: 'exact', head: true }).eq('npsn', me.npsn).eq('status_peserta_didik', status)
      return count ?? 0
    }
    const { count: guru } = await db.from('ptk').select('*', { count: 'exact', head: true }).eq('npsn', me.npsn).in('jenis_ptk', ['Guru', 'Kepala Sekolah'])
    return json({ pengguna, ringkasan: { siswa_aktif: await hitung('aktif'), alumni: await hitung('lulus'), guru_total: guru ?? 0 } })
  }

  if (aksi === 'buat_massal') {
    // Membuat akun siswa (aktif) atau alumni (lulus) dari data peserta didik yang belum punya akun.
    // Dipanggil berulang dari peramban sampai sisa 0. Aman diulang.
    const status = b.kelompok === 'alumni' ? 'lulus' : 'aktif'
    const batas = Math.min(Math.max(Number(b.batas) || 100, 1), 150)
    const sudahPd = new Set<string>()
    for (let dari = 0; dari < 20000; dari += 1000) {
      const { data } = await db.from('profil_pengguna').select('peserta_didik_id').eq('npsn', me.npsn).not('peserta_didik_id', 'is', null).order('user_id').range(dari, dari + 999)
      for (const r of data ?? []) sudahPd.add(r.peserta_didik_id as string)
      if (!data || data.length < 1000) break
    }
    const belum: { id: string; nisn: string; lahir: string }[] = []
    let tanpaNisn = 0
    for (let dari = 0; dari < 20000; dari += 1000) {
      const { data } = await db.from('peserta_didik').select('id,nisn,tanggal_lahir').eq('npsn', me.npsn).eq('status_peserta_didik', status).order('id').range(dari, dari + 999)
      for (const p of data ?? []) {
        if (sudahPd.has(p.id)) continue
        if (!/^\d{10}$/.test(p.nisn ?? '') || !p.tanggal_lahir) { tanpaNisn++; continue }
        belum.push({ id: p.id, nisn: p.nisn, lahir: p.tanggal_lahir })
      }
      if (!data || data.length < 1000) break
    }
    const kerja = belum.slice(0, batas)
    const dibuat: { user_id: string; pd: string }[] = []
    const gagal: string[] = []
    for (let i = 0; i < kerja.length; i += 10) {
      await Promise.all(kerja.slice(i, i + 10).map(async (p) => {
        const { data: c, error } = await db.auth.admin.createUser({ email: `${p.nisn}@siswa.invalid`, password: ddmmyyyy(p.lahir), email_confirm: true, app_metadata: { wajib_ganti_sandi: true } })
        if (c?.user) dibuat.push({ user_id: c.user.id, pd: p.id })
        else gagal.push(`${p.nisn}: ${error?.message ?? 'gagal'}`)
      }))
    }
    if (dibuat.length) {
      const { error } = await db.from('profil_pengguna').insert(dibuat.map((d) => ({ user_id: d.user_id, npsn: me.npsn, peran: 'siswa', peserta_didik_id: d.pd, sandi_awal_diatur: true })))
      if (error) {
        for (const d of dibuat) await db.auth.admin.deleteUser(d.user_id)
        return json({ galat: error.message }, 500)
      }
    }
    // peserta didik yang gagal dibuat (mis. NISN kembar) tidak dihitung sebagai sisa agar putaran tidak berulang tanpa akhir
    const sisa = belum.length - kerja.length
    return json({ dibuat: dibuat.length, gagal, sisa, tanpa_nisn: tanpaNisn })
  }

  if (aksi === 'atur_sandi_awal') {
    // Menyetel password awal untuk akun yang belum: siswa/alumni = tanggal lahir DDMMYYYY, guru = NPSN.
    // Dipanggil berulang dari peramban sampai sisa 0. Aman diulang.
    const k = String(b.kelompok ?? '')
    if (!['siswa', 'alumni', 'guru'].includes(k)) return json({ galat: 'kelompok tidak dikenal' }, 400)
    const batas = Math.min(Math.max(Number(b.batas) || 100, 1), 150)
    const kolom = k === 'guru' ? 'user_id' : 'user_id,peserta_didik!inner(tanggal_lahir,status_peserta_didik)'
    const dasar = () => {
      let q = db.from('profil_pengguna').select(kolom, { count: 'exact' }).eq('npsn', me.npsn).eq('sandi_awal_diatur', false)
        .eq('peran', k === 'guru' ? 'guru' : 'siswa')
      if (k !== 'guru') q = q.eq('peserta_didik.status_peserta_didik', k === 'siswa' ? 'aktif' : 'lulus').not('peserta_didik.tanggal_lahir', 'is', null)
      return q
    }
    const { data, error, count } = await dasar().order('user_id').limit(batas)
    if (error) return json({ galat: error.message }, 500)
    const rows = (data ?? []) as unknown as { user_id: string; peserta_didik?: { tanggal_lahir: string } | null }[]
    const ok: string[] = []
    const gagal: string[] = []
    for (let i = 0; i < rows.length; i += 10) {
      await Promise.all(rows.slice(i, i + 10).map(async (r) => {
        const sandi = k === 'guru' ? me.npsn : ddmmyyyy(r.peserta_didik!.tanggal_lahir)
        const { error: e } = await db.auth.admin.updateUserById(r.user_id, { password: sandi, app_metadata: { wajib_ganti_sandi: true } })
        if (e) gagal.push(`${r.user_id}: ${e.message}`)
        else ok.push(r.user_id)
      }))
    }
    if (ok.length) await db.from('profil_pengguna').update({ sandi_awal_diatur: true }).in('user_id', ok)
    // yang gagal tetap dihitung di sisa; peramban berhenti bila satu putaran tidak menyetel apa pun
    return json({ diatur: ok.length, gagal, sisa: Math.max((count ?? 0) - ok.length, 0) })
  }

  if (aksi === 'reset_sandi') {
    // Kembalikan password siswa/alumni/guru ke password awal dan wajibkan ganti saat masuk berikutnya.
    const { data: pr } = await db.from('profil_pengguna').select('user_id,peran,peserta_didik(tanggal_lahir)').eq('user_id', target).eq('npsn', me.npsn).maybeSingle()
    if (!pr) return json({ galat: 'akun tidak ditemukan' }, 404)
    if (diri) return json({ galat: 'ganti password sendiri lewat menu Profil' }, 400)
    let sandi = ''
    const pd = pr.peserta_didik as unknown as { tanggal_lahir: string | null } | null
    if (pr.peran === 'guru') sandi = me.npsn
    else if (pr.peran === 'siswa' && pd?.tanggal_lahir) sandi = ddmmyyyy(pd.tanggal_lahir)
    else return json({ galat: 'reset hanya untuk siswa, alumni, dan guru' }, 400)
    const { error } = await db.auth.admin.updateUserById(target, { password: sandi, app_metadata: { wajib_ganti_sandi: true } })
    if (error) return json({ galat: error.message }, 400)
    await db.from('profil_pengguna').update({ sandi_awal_diatur: true }).eq('user_id', target)
    return json({ ok: true })
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
