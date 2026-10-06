// Usulan sarana dan prasarana bertingkat: kepala bengkel mengusulkan, kepala program memeriksa, Waka Sarpras memutuskan.
import TombolIkon from '../../components/TombolIkon'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { panggil, tglJam, tgl } from '../../lib/rpc'
import { JENIS_USULAN, PRIORITAS, STATUS_USULAN, angka, label, rupiah, type Barang, type Lab, type RiwayatUsulan, type Usulan } from '../../lib/sarpras'
import GerbangSarpras from './GerbangSarpras'

type FormUsulan = {
  id?: string; lab_id?: string; jenis?: string; barang_id?: string; nama_barang?: string; spesifikasi?: string
  jumlah?: number | string; satuan?: string; perkiraan_harga_satuan?: number | string; alasan?: string; prioritas?: string
}
const NAMA_AKSI: Record<string, string> = {
  ubah: 'Ubah', ajukan: 'Ajukan', batal: 'Batalkan', teruskan: 'Teruskan ke Waka Sarpras',
  kembalikan: 'Kembalikan untuk diperbaiki', tolak: 'Tolak', setujui: 'Setujui', selesai: 'Tandai selesai',
}
const WAJIB_CATATAN = new Set(['kembalikan', 'tolak'])
const teks = (v: unknown) => (v == null ? '' : String(v))

function Isi() {
  const [daftar, setDaftar] = useState<Usulan[]>([])
  const [lab, setLab] = useState<Lab[]>([])
  const [barangLab, setBarangLab] = useState<Barang[]>([])
  const [status, setStatus] = useState('')
  const [perluSaya, setPerluSaya] = useState(false)
  const [form, setForm] = useState<FormUsulan | null>(null)
  const [tindak, setTindak] = useState<{ id: string; aksi: string } | null>(null)
  const [catatan, setCatatan] = useState('')
  const [terbuka, setTerbuka] = useState<string | null>(null)
  const [riwayat, setRiwayat] = useState<RiwayatUsulan[]>([])
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [memuat, setMemuat] = useState(true)

  const baca = useCallback(async () => {
    try {
      const [u, l] = await Promise.all([panggil<Usulan[]>('sarpras_usulan_daftar'), panggil<Lab[]>('sarpras_lab_daftar')])
      setDaftar(u ?? []); setLab(l ?? [])
    } catch (e) { setGalat((e as Error).message) }
    setMemuat(false)
  }, [])
  useEffect(() => { void baca() }, [baca])

  const labBisaCatat = useMemo(() => lab.filter((x) => x.boleh_catat && x.aktif), [lab])

  // Barang di bengkel terpilih, untuk usulan perbaikan atau penghapusan.
  useEffect(() => {
    if (!form?.lab_id || form.jenis === 'pengadaan' || !form.jenis) { setBarangLab([]); return }
    let batal = false
    panggil<Barang[]>('sarpras_barang_daftar', { p_lab: form.lab_id }).then((x) => { if (!batal) setBarangLab(x ?? []) }).catch(() => { if (!batal) setBarangLab([]) })
    return () => { batal = true }
  }, [form?.lab_id, form?.jenis])

  const butuhTindakan = (u: Usulan) => u.aksi.some((a) => ['ajukan', 'teruskan', 'setujui', 'selesai'].includes(a)) || (u.status === 'dikembalikan' && u.aksi.includes('ubah'))
  const tampil = daftar.filter((u) => (!status || u.status === status) && (!perluSaya || butuhTindakan(u)))
  const nPerlu = daftar.filter(butuhTindakan).length

  function usulanBaru() {
    setTindak(null); setGalat(''); setInfo('')
    setForm({ lab_id: labBisaCatat.length === 1 ? labBisaCatat[0].id : '', jenis: 'pengadaan', jumlah: 1, satuan: 'unit', prioritas: 'sedang' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function ubah(u: Usulan) {
    setTindak(null); setGalat(''); setInfo('')
    setForm({
      id: u.id, lab_id: u.lab_id, jenis: u.jenis, barang_id: u.barang_id ?? '', nama_barang: u.nama_barang, spesifikasi: u.spesifikasi ?? '',
      jumlah: u.jumlah, satuan: u.satuan, perkiraan_harga_satuan: u.perkiraan_harga_satuan ?? '', alasan: u.alasan, prioritas: u.prioritas,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function simpan(e: FormEvent, langsungAjukan: boolean) {
    e.preventDefault(); if (!form) return; setGalat(''); setInfo('')
    if (!form.lab_id) return setGalat('Pilih bengkel atau laboratorium.')
    if (!form.alasan?.trim()) return setGalat('Alasan usulan wajib diisi.')
    if (form.jenis !== 'pengadaan' && !form.barang_id) return setGalat('Pilih barang yang diusulkan.')
    if (form.jenis === 'pengadaan' && !form.nama_barang?.trim()) return setGalat('Nama barang wajib diisi.')
    setSibuk(true)
    try {
      const r = await panggil<{ id: string }>('sarpras_usulan_simpan', {
        p_id: form.id ?? null,
        p: {
          lab_id: form.lab_id, jenis: form.jenis, barang_id: form.barang_id || null, nama_barang: form.nama_barang, spesifikasi: form.spesifikasi,
          jumlah: Number(form.jumlah ?? 1), satuan: form.satuan, perkiraan_harga_satuan: form.perkiraan_harga_satuan, alasan: form.alasan, prioritas: form.prioritas,
        },
      })
      if (langsungAjukan) await panggil('sarpras_usulan_ajukan', { p_id: r.id })
      setForm(null); setInfo(langsungAjukan ? 'Usulan diajukan.' : 'Usulan tersimpan sebagai draf.'); await baca()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }

  async function jalankan(u: Usulan, aksi: string) {
    setGalat(''); setInfo('')
    if (aksi === 'ubah') return ubah(u)
    if (aksi === 'ajukan') {
      setSibuk(true)
      try { await panggil('sarpras_usulan_ajukan', { p_id: u.id }); setInfo('Usulan diajukan.'); await baca() } catch (er) { setGalat((er as Error).message) }
      return setSibuk(false)
    }
    setTindak({ id: u.id, aksi }); setCatatan('')
  }

  async function konfirmasi() {
    if (!tindak) return
    if (WAJIB_CATATAN.has(tindak.aksi) && !catatan.trim()) return setGalat('Catatan wajib diisi.')
    setSibuk(true); setGalat('')
    try {
      await panggil('sarpras_usulan_putuskan', { p_id: tindak.id, p_aksi: tindak.aksi, p_catatan: catatan || null })
      setTindak(null); setInfo('Keputusan tersimpan.'); await baca()
      if (terbuka === tindak.id) void bukaRiwayat(tindak.id, true)
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }

  async function bukaRiwayat(id: string, paksa = false) {
    if (terbuka === id && !paksa) return setTerbuka(null)
    setTerbuka(id)
    try { setRiwayat((await panggil<RiwayatUsulan[]>('sarpras_usulan_riwayat', { p_id: id })) ?? []) } catch { setRiwayat([]) }
  }

  const F = (k: keyof FormUsulan, nm: string, tipe = 'text') => (
    <label>{nm}<input type={tipe} min={tipe === 'number' ? 0 : undefined} step={tipe === 'number' ? 'any' : undefined} value={teks(form?.[k])} onChange={(e) => setForm((x) => ({ ...x, [k]: e.target.value }))} /></label>
  )

  if (memuat) return <Halaman judul="Usulan sarana dan prasarana"><p className="catatan">Memuat data...</p></Halaman>
  return (
    <Halaman judul="Usulan sarana dan prasarana" lead="Alur: kepala bengkel mengusulkan, kepala program memeriksa dan meneruskan, Waka Sarpras memutuskan. Usulan yang dikembalikan dapat diperbaiki dan diajukan lagi.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}

      <div className="aksi" style={{ marginTop: 0, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Semua status</option>
          {STATUS_USULAN.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={perluSaya} onChange={(e) => setPerluSaya(e.target.checked)} /> Perlu tindakan saya ({nPerlu})</label>
        {labBisaCatat.length > 0 && <button className="tombol tombol-isi" onClick={usulanBaru}>Buat usulan</button>}
      </div>

      {form && (
        <form className="form kartu jarak" onSubmit={(e) => simpan(e, false)} style={{ display: 'grid', gap: 10, maxWidth: 760 }}>
          <h3>{form.id ? 'Ubah usulan' : 'Usulan baru'}</h3>
          <label>Bengkel atau laboratorium
            <select value={form.lab_id ?? ''} disabled={!!form.id} onChange={(e) => setForm((x) => ({ ...x, lab_id: e.target.value, barang_id: '' }))}>
              <option value="">Pilih</option>
              {labBisaCatat.map((x) => <option key={x.id} value={x.id}>{x.nama}</option>)}
            </select>
          </label>
          <label>Jenis usulan
            <select value={form.jenis ?? 'pengadaan'} onChange={(e) => setForm((x) => ({ ...x, jenis: e.target.value, barang_id: '' }))}>
              {JENIS_USULAN.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          {form.jenis !== 'pengadaan' ? (
            <label>Barang
              <select value={form.barang_id ?? ''} onChange={(e) => setForm((x) => ({ ...x, barang_id: e.target.value }))}>
                <option value="">Pilih barang di inventaris</option>
                {barangLab.map((b) => <option key={b.id} value={b.id}>{b.nama} (baik {angka(b.jumlah_baik)}, rusak {angka(b.jumlah_rusak)})</option>)}
              </select>
            </label>
          ) : F('nama_barang', 'Nama barang atau bahan')}
          <label>Spesifikasi yang dibutuhkan<textarea rows={2} value={teks(form.spesifikasi)} onChange={(e) => setForm((x) => ({ ...x, spesifikasi: e.target.value }))} /></label>
          <div className="grid grid-2">{F('jumlah', 'Jumlah', 'number')}{F('satuan', 'Satuan')}</div>
          <div className="grid grid-2">
            {F('perkiraan_harga_satuan', 'Perkiraan harga satuan (Rp)', 'number')}
            <label>Prioritas
              <select value={form.prioritas ?? 'sedang'} onChange={(e) => setForm((x) => ({ ...x, prioritas: e.target.value }))}>
                {PRIORITAS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <label>Alasan usulan<textarea rows={3} value={teks(form.alasan)} onChange={(e) => setForm((x) => ({ ...x, alasan: e.target.value }))} /></label>
          <div className="aksi">
            <button className="tombol" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan draf'}</button>
            <button type="button" className="tombol tombol-isi" disabled={sibuk} onClick={(e) => simpan(e, true)}>Simpan dan ajukan</button>
            <TombolIkon ikon="tutup" label="Batal" onClick={() => setForm(null)} />
          </div>
        </form>
      )}

      <div className="jarak" style={{ display: 'grid', gap: 12 }}>
        {tampil.map((u) => (
          <article className="kartu" key={u.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>{u.nama_barang}</h3>
              <span className="lencana">{label(STATUS_USULAN, u.status)}</span>
            </div>
            <p className="catatan" style={{ margin: '4px 0' }}>
              {u.nomor} · {label(JENIS_USULAN, u.jenis)} · {u.lab_nama}{u.program ? ` (${u.program})` : ''} · Prioritas {label(PRIORITAS, u.prioritas).toLowerCase()} · {tgl(u.dibuat_pada)}
            </p>
            <p style={{ margin: '4px 0' }}>{angka(u.jumlah)} {u.satuan}{u.perkiraan_total != null ? ` · perkiraan ${rupiah(u.perkiraan_total)}` : ''}{u.pengusul_nama ? ` · diusulkan ${u.pengusul_nama}` : ''}</p>
            {u.spesifikasi && <p style={{ margin: '4px 0' }}><small>Spesifikasi: {u.spesifikasi}</small></p>}
            <p style={{ margin: '4px 0' }}>{u.alasan}</p>
            <div className="aksi" style={{ marginTop: 8, flexWrap: 'wrap' }}>
              {u.aksi.map((a) => <button key={a} className={['setujui', 'ajukan', 'teruskan'].includes(a) ? 'tombol tombol-isi' : 'tombol'} disabled={sibuk} onClick={() => jalankan(u, a)}>{NAMA_AKSI[a] ?? a}</button>)}
              <button className="tombol-ikon" onClick={() => bukaRiwayat(u.id)}>{terbuka === u.id ? 'Tutup riwayat' : 'Riwayat'}</button>
            </div>
            {tindak?.id === u.id && (
              <div className="jarak" style={{ display: 'grid', gap: 8, maxWidth: 560 }}>
                <label>{NAMA_AKSI[tindak.aksi]}: catatan{WAJIB_CATATAN.has(tindak.aksi) ? ' (wajib)' : ' (opsional)'}
                  <textarea rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
                </label>
                <div className="aksi" style={{ marginTop: 0 }}>
                  <button className="tombol tombol-isi" disabled={sibuk} onClick={konfirmasi}>Konfirmasi</button>
                  <TombolIkon ikon="tutup" label="Batal" onClick={() => setTindak(null)} />
                </div>
              </div>
            )}
            {terbuka === u.id && (
              <ol className="jarak" style={{ paddingLeft: 18 }}>
                {riwayat.map((r, i) => (
                  <li key={i}><small>{tglJam(r.waktu)} · {label(STATUS_USULAN, r.ke)}{r.oleh ? ` · ${r.oleh}` : ''}{r.catatan ? ` · ${r.catatan}` : ''}</small></li>
                ))}
                {riwayat.length === 0 && <li><small>Belum ada riwayat.</small></li>}
              </ol>
            )}
          </article>
        ))}
        {tampil.length === 0 && <p className="catatan">Tidak ada usulan yang cocok.</p>}
      </div>
      <p><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

export default function SarprasUsulan() {
  return <GerbangSarpras perlu={['kelola', 'catat_lab', 'verifikasi_program', 'lihat']} judul="Usulan sarana dan prasarana" aktif="/portal/sarpras/usulan">{() => <Isi />}</GerbangSarpras>
}
