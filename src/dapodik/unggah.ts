// Unggah hasil urai ke Supabase. Berjalan sebagai admin_tu yang sedang masuk (RLS berlaku).
// Idempoten: semua tulis memakai upsert pada kunci unik, jadi unggah ulang aman.
// Urutan dan aturan mengikuti dapodik_import.py (import_file dan handler).

import { supabase } from '../lib/supabase'
import type { Hasil } from './parser'
import type { Isu, Rec } from './util'
import { semesterDariId } from './util'

const UKURAN_BATCH = 500

export type Kemajuan = (pesan: string) => void

export type HasilUnggah = {
  status: 'selesai' | 'gagal' | 'dilewati'
  alasan?: string
  ringkasan: Record<string, unknown>
  isu: Isu[]
}

export async function sha256Berkas(data: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('')
}

function potong<T>(arr: T[], n = UKURAN_BATCH): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

function periksa<T>(r: { data: T; error: { message: string } | null }, konteks: string): T {
  if (r.error) throw new Error(`${konteks}: ${r.error.message}`)
  return r.data
}

function dedupe(rows: Rec[], kunci: string[]): Rec[] {
  const m = new Map<string, Rec>()
  for (const r of rows) m.set(JSON.stringify(kunci.map((k) => r[k] ?? null)), r)
  return [...m.values()]
}

async function hitung(tabel: string, npsn: string): Promise<number> {
  const r = await supabase.from(tabel).select('*', { count: 'exact', head: true }).eq('npsn', npsn)
  if (r.error) throw new Error(`hitung ${tabel}: ${r.error.message}`)
  return r.count ?? 0
}

async function upsertBatch(
  tabel: string, rows: Rec[], onConflict: string, opsi: { ignoreDuplicates?: boolean } = {},
  kemajuan?: Kemajuan,
) {
  let n = 0
  for (const b of potong(rows)) {
    periksa(await supabase.from(tabel).upsert(b, { onConflict, ...opsi }), `tulis ${tabel}`)
    n += b.length
    kemajuan?.(`${tabel}: ${n.toLocaleString('id-ID')} dari ${rows.length.toLocaleString('id-ID')}`)
  }
}

async function rpcAnak(tabel: string, rows: Rec[], kemajuan?: Kemajuan) {
  if (!rows.length) return
  const cols = Object.keys(rows[0]).filter((k) => k !== 'kunci_identitas')
  let n = 0
  for (const b of potong(rows)) {
    periksa(await supabase.rpc('dapodik_upsert_anak', { p_tabel: tabel, p_rows: b, p_cols: cols }), `tulis ${tabel}`)
    n += b.length
    kemajuan?.(`${tabel}: ${n.toLocaleString('id-ID')} dari ${rows.length.toLocaleString('id-ID')}`)
  }
}

async function pastikanSemester(sid: string) {
  const s = semesterDariId(sid)
  periksa(
    await supabase.from('semester').upsert(
      { semester_id: s.id, tahun_ajaran: s.tahunAjaran, jenis: s.jenis },
      { onConflict: 'semester_id', ignoreDuplicates: true },
    ),
    'tulis semester',
  )
}

/** Cek apakah berkas identik sudah pernah selesai diunggah. */
export async function cekDuplikat(npsn: string, sha: string): Promise<string | null> {
  const r = await supabase
    .from('import_batch').select('dibuat_pada').eq('npsn', npsn).eq('sha256', sha).eq('status', 'selesai').maybeSingle()
  if (r.error) throw new Error(`cek riwayat: ${r.error.message}`)
  return r.data ? (r.data.dibuat_pada as string) : null
}

export async function unggah(
  h: Hasil, nama: string, sha: string, npsn: string, kemajuan: Kemajuan, paksa = false,
): Promise<HasilUnggah> {
  if (h.isu.some((i) => i.tingkat === 'galat')) {
    return { status: 'gagal', alasan: 'Berkas memuat galat, tidak diunggah.', ringkasan: {}, isu: h.isu }
  }
  if (!paksa) {
    const ada = await cekDuplikat(npsn, sha)
    if (ada) {
      return { status: 'dilewati', alasan: `Berkas identik sudah diunggah pada ${ada.slice(0, 16).replace('T', ' ')}.`, ringkasan: {}, isu: h.isu }
    }
  }

  const isu: Isu[] = [...h.isu]
  const sems = h.jenis === 'absensi' ? h.semesterAbsensi : h.semester ? [h.semester] : []

  if (h.jenis === 'profil') {
    const s = h.tabel.sekolah[0]
    if (s.npsn !== npsn) {
      return { status: 'gagal', alasan: `NPSN pada berkas (${s.npsn}) berbeda dengan NPSN akun Anda (${npsn}).`, ringkasan: {}, isu }
    }
  }
  for (const s of sems) await pastikanSemester(s)

  kemajuan('Mencatat batch unggah')
  const diunduh = h.diunduh ? `${h.diunduh}+07:00` : null
  const batch = periksa(
    await supabase.from('import_batch').upsert(
      {
        npsn, jenis_berkas: h.jenis, nama_file: nama, sha256: sha, diunduh_pada: diunduh, pengunduh: h.pengunduh,
        semester_id: h.jenis === 'absensi' ? null : h.semester, status: 'berjalan', dibuat_pada: new Date().toISOString(),
      },
      { onConflict: 'npsn,sha256' },
    ).select('id').single(),
    'catat batch',
  )!.id as string

  let ring: Record<string, unknown> = {}
  let status: 'selesai' | 'gagal' = 'selesai'
  const sekarang = new Date().toISOString()
  const tambah = (rows: Rec[], ekstra: Rec = {}) => rows.map((r) => ({ ...r, npsn, batch_id: batch, ...ekstra }))

  try {
    if (h.jenis === 'profil') {
      const s = { ...h.tabel.sekolah[0] } as Record<string, unknown>
      s.atribut = JSON.parse(s.atribut as string)
      s.diperbarui_pada = sekarang
      periksa(await supabase.from('sekolah').upsert(s, { onConflict: 'npsn' }), 'tulis sekolah')
    }

    if (h.jenis === 'pd_aktif' || h.jenis === 'pd_keluar') {
      const sebelum = await hitung('peserta_didik', npsn)
      await upsertBatch('peserta_didik', tambah(h.tabel.peserta_didik, { diperbarui_pada: sekarang }), 'npsn,kunci_identitas', {}, kemajuan)
      const baru = (await hitung('peserta_didik', npsn)) - sebelum
      await rpcAnak('peserta_didik_sensitif', h.tabel.peserta_didik_sensitif, kemajuan)
      await rpcAnak('orang_tua_wali', h.tabel.orang_tua_wali, kemajuan)
      ring = { baris_dibaca: h.tabel.peserta_didik.length, baru, diperbarui: h.tabel.peserta_didik.length - baru }
      if (h.jenis === 'pd_aktif') {
        kemajuan('Memasang rombel dan keanggotaan')
        periksa(await supabase.rpc('dapodik_pasang_rombel', { p_rows: h.tabel.rombel, p_extra: [], p_batch: batch }), 'tulis rombel')
        const n = periksa(await supabase.rpc('dapodik_pasang_keanggotaan', { p_rows: h.tabel.keanggotaan_rombel, p_ganti_roster: false }), 'tulis keanggotaan')
        ring = { ...ring, rombel: h.tabel.rombel.length, keanggotaan: n, semester: h.semester }
      } else {
        ring = { ...ring, status: h.ringkasan.status }
      }
    }

    if (h.jenis === 'guru' || h.jenis === 'tendik' || (h.jenis === 'profil' && h.tabel.ptk)) {
      const sebelum = await hitung('ptk', npsn)
      const ptk = dedupe(h.tabel.ptk, ['kunci_identitas'])
      await upsertBatch('ptk', tambah(ptk, { diperbarui_pada: sekarang }), 'npsn,kunci_identitas', {}, kemajuan)
      const baru = (await hitung('ptk', npsn)) - sebelum
      await rpcAnak('ptk_sensitif', dedupe(h.tabel.ptk_sensitif, ['kunci_identitas']), kemajuan)
      ring = { ...ring, ptk: { baris_dibaca: ptk.length, baru, diperbarui: ptk.length - baru } }
    }

    if (h.jenis === 'profil') {
      if (h.tabel.rombel) {
        const extra = ['tingkat', 'kurikulum', 'ruangan', 'wali_kelas_nama', 'jumlah_l_profil', 'jumlah_p_profil']
        periksa(await supabase.rpc('dapodik_pasang_rombel', { p_rows: h.tabel.rombel, p_extra: extra, p_batch: batch }), 'tulis rombel')
        ring = { ...ring, rombel: h.tabel.rombel.length }
      }
      for (const t of ['prasarana', 'sarana', 'bantuan_sekolah']) {
        if (h.tabel[t]) {
          kemajuan(`Mengganti ${t}`)
          ring[t] = periksa(await supabase.rpc('dapodik_ganti_snapshot', { p_tabel: t, p_rows: h.tabel[t], p_batch: batch }), `tulis ${t}`)
        }
      }
    }

    if (h.jenis === 'absensi') {
      const sebelum = await hitung('peserta_didik', npsn)
      // siswa yang belum ada: data minimal, tidak menimpa data lengkap dari daftar peserta didik
      await upsertBatch('peserta_didik', tambah(h.tabel.peserta_didik_stub), 'npsn,kunci_identitas', { ignoreDuplicates: true }, kemajuan)
      const stubBaru = (await hitung('peserta_didik', npsn)) - sebelum
      const perSem = new Map<string, Rec[]>()
      for (const r of h.tabel.rombel) {
        const a = perSem.get(r.semester_id as string) ?? []
        a.push(r)
        perSem.set(r.semester_id as string, a)
      }
      for (const rows of perSem.values()) {
        periksa(await supabase.rpc('dapodik_pasang_rombel', { p_rows: rows, p_extra: ['wali_kelas_nama'], p_batch: batch }), 'tulis rombel')
      }
      let n = 0
      for (const sid of h.semesterAbsensi) {
        const ang = h.tabel.keanggotaan_rombel.filter((r) => r.semester_id === sid)
        kemajuan(`Keanggotaan rombel semester ${sid}`)
        n += periksa(await supabase.rpc('dapodik_pasang_keanggotaan', { p_rows: ang, p_ganti_roster: true }), 'tulis keanggotaan') as number
      }
      ring = { ...h.ringkasan, siswa_stub_baru: stubBaru, keanggotaan_ditulis: n }
    }

    if (h.jenis === 'sekolah_smk') {
      const kk = dedupe(h.tabel.kompetensi_keahlian, ['program_keahlian', 'kompetensi_keahlian', 'sk_izin'])
      await upsertBatch('kompetensi_keahlian', tambah(kk), 'npsn,program_keahlian,kompetensi_keahlian,sk_izin', {}, kemajuan)
      const dudiRows = h.tabel.dudi.map((r) => ({ ...r }))
      await upsertBatch('dudi', tambah(dudiRows), 'npsn,kunci', {}, kemajuan)
      // petakan nama DUDI ke id, seperti resolusi dudi_id pada skrip Python
      const idDudi = new Map<string, string>()
      const dr = periksa(await supabase.from('dudi').select('id,nama').eq('npsn', npsn).limit(5000), 'baca dudi')
      for (const d of dr as { id: string; nama: string }[]) {
        const k = d.nama.trim().toLowerCase().replace(/\s+/g, ' ')
        if (!idDudi.has(k)) idDudi.set(k, d.id)
      }
      const mou = h.tabel.mou_kerjasama.map((r) => {
        const { dudi_cocok, ...sisa } = r
        void dudi_cocok
        const k = String(r.nama_dudi_sumber).trim().toLowerCase().replace(/\s+/g, ' ')
        return { ...sisa, dudi_id: idDudi.get(k) ?? null }
      })
      await upsertBatch('mou_kerjasama', tambah(mou), 'npsn,kunci', {}, kemajuan)
      for (const t of ['unit_produksi', 'praktik_industri']) {
        ring[t] = periksa(await supabase.rpc('dapodik_ganti_snapshot', { p_tabel: t, p_rows: h.tabel[t] ?? [], p_batch: batch }), `tulis ${t}`)
      }
      ring = { ...ring, ...h.ringkasan }
    }

    if (['guru', 'tendik', 'profil', 'absensi'].includes(h.jenis)) {
      const belum = periksa(await supabase.rpc('dapodik_resolve_wali'), 'cocokkan wali kelas') as number
      if (belum) isu.push({ tingkat: 'info', lembar: null, baris: null, kolom: null, pesan: `rombel yang wali kelasnya belum cocok dengan tabel PTK: ${belum}` })
    }
  } catch (e) {
    status = 'gagal'
    isu.push({ tingkat: 'galat', lembar: null, baris: null, kolom: null, pesan: `unggah dibatalkan: ${(e as Error).message}` })
    ring = {}
  }

  kemajuan('Menyimpan riwayat')
  const hitungIsu: Record<string, number> = {}
  for (const i of isu) hitungIsu[i.tingkat] = (hitungIsu[i.tingkat] ?? 0) + 1
  ring.isu = hitungIsu
  try {
    await supabase.from('import_isu').delete().eq('batch_id', batch)
    for (const b of potong(isu.map((i) => ({ batch_id: batch, tingkat: i.tingkat, lembar: i.lembar, baris: i.baris, kolom: i.kolom, pesan: i.pesan })), 200)) {
      periksa(await supabase.from('import_isu').insert(b), 'tulis isu')
    }
    periksa(await supabase.from('import_batch').update({ status, ringkasan: ring }).eq('id', batch), 'tutup batch')
  } catch (e) {
    isu.push({ tingkat: 'peringatan', lembar: null, baris: null, kolom: null, pesan: `riwayat tidak tersimpan: ${(e as Error).message}` })
  }
  return { status, ringkasan: ring, isu }
}
