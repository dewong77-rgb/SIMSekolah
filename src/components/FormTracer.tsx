// Isian tracer study, dipakai alumni (halaman publik) dan petugas (portal).
import { useState, type FormEvent } from 'react'
import { KESESUAIAN, PENGHASILAN, STATUS_TRACER } from '../lib/hubin'

export type IsianTracer = Record<string, string | boolean>
const BEKERJA = ['bekerja', 'wirausaha', 'bekerja_kuliah']
const KULIAH = ['kuliah', 'bekerja_kuliah']

export default function FormTracer({ awal, kirim, sibuk, petugas = false, tombol = 'Simpan' }: {
  awal?: IsianTracer | null; kirim: (d: IsianTracer) => void; sibuk: boolean; petugas?: boolean; tombol?: string
}) {
  const [f, setF] = useState<IsianTracer>(() => ({ status_utama: '', bersedia_dihubungi: false, ...(awal ?? {}) }))
  const [galat, setGalat] = useState('')
  const s = (k: string) => (f[k] == null ? '' : String(f[k]))
  const u = (k: string, v: string | boolean) => setF((x) => ({ ...x, [k]: v }))
  const kerja = BEKERJA.includes(s('status_utama'))
  const kuliah = KULIAH.includes(s('status_utama'))

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!s('status_utama')) return setGalat('Pilih kegiatan utama saat ini.')
    if (s('hp') && !/^[0-9+\-\s]{8,20}$/.test(s('hp'))) return setGalat('Nomor HP tidak valid.')
    setGalat('')
    const d: IsianTracer = {}
    for (const [k, v] of Object.entries(f)) {
      if (['id', 'diperbarui_pada', 'dibuat_pada', 'tahun_lulus'].includes(k)) continue
      d[k] = typeof v === 'string' ? v.trim() : v
    }
    if (!kerja) for (const k of ['instansi', 'bidang_instansi', 'jabatan', 'kota', 'tahun_mulai', 'waktu_tunggu_bulan', 'kesesuaian', 'penghasilan']) d[k] = ''
    if (!kuliah) for (const k of ['perguruan_tinggi', 'program_studi']) d[k] = ''
    kirim(d)
  }

  const T = (k: string, label: string, tipe = 'text', kecil?: string) => (
    <label>{label}<input type={tipe} value={s(k)} onChange={(e) => u(k, e.target.value)} />{kecil && <small className="catatan">{kecil}</small>}</label>
  )
  const P = (k: string, label: string, opsi: readonly (readonly [string, string])[]) => (
    <label>{label}
      <select value={s(k)} onChange={(e) => u(k, e.target.value)}>
        <option value="">Pilih</option>
        {opsi.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
      </select>
    </label>
  )

  return (
    <form className="form" onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      {galat && <p className="galat kartu" role="alert">{galat}</p>}
      {P('status_utama', 'Kegiatan utama saat ini', STATUS_TRACER)}
      {T('kompetensi', 'Kompetensi keahlian saat di sekolah', 'text', 'Contoh: TJKT, Teknik Pemesinan, Produksi Film')}
      {kerja && (
        <fieldset className="kartu form" style={{ display: 'grid', gap: 10 }}>
          <legend>Pekerjaan atau usaha</legend>
          {T('instansi', 'Nama perusahaan atau usaha')}
          {T('bidang_instansi', 'Bidang usaha')}
          {T('jabatan', 'Jabatan')}
          {T('kota', 'Kota atau kabupaten')}
          <div className="grid grid-2">
            {T('tahun_mulai', 'Tahun mulai', 'number')}
            {T('waktu_tunggu_bulan', 'Lama menunggu kerja pertama (bulan)', 'number', 'Isi 0 bila langsung bekerja.')}
          </div>
          {P('kesesuaian', 'Kesesuaian pekerjaan dengan kompetensi keahlian', KESESUAIAN)}
          {P('penghasilan', 'Kisaran penghasilan per bulan', PENGHASILAN)}
        </fieldset>
      )}
      {kuliah && (
        <fieldset className="kartu form" style={{ display: 'grid', gap: 10 }}>
          <legend>Kuliah</legend>
          {T('perguruan_tinggi', 'Perguruan tinggi')}
          {T('program_studi', 'Program studi')}
        </fieldset>
      )}
      <label>Saran untuk sekolah<textarea rows={3} maxLength={1000} value={s('saran')} onChange={(e) => u('saran', e.target.value)} /></label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={!!f.bersedia_dihubungi} onChange={(e) => u('bersedia_dihubungi', e.target.checked)} /> Bersedia dihubungi sekolah untuk informasi lowongan atau kegiatan alumni
      </label>
      {(f.bersedia_dihubungi || petugas) && T('hp', 'Nomor HP atau WhatsApp')}
      <div><button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : tombol}</button></div>
    </form>
  )
}
