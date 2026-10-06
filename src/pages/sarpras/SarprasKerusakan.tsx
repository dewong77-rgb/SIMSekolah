// Laporan kerusakan: kepala bengkel melapor, Staf atau Waka Sarpras memproses. Kondisi barang di inventaris bergeser otomatis.
import TombolIkon from '../../components/TombolIkon'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { panggil, tglJam, tgl } from '../../lib/rpc'
import { STATUS_KERUSAKAN, TINGKAT_RUSAK, angka, label, type Barang, type Kerusakan, type Lab, type RiwayatAlur } from '../../lib/sarpras'
import GerbangSarpras from './GerbangSarpras'

type FormLapor = { lab_id?: string; barang_id?: string; jumlah?: number | string; tingkat?: string; uraian?: string; tanggal_kejadian?: string }
const NAMA_AKSI: Record<string, string> = {
  batal: 'Batalkan', proses: 'Terima dan proses', tolak: 'Tolak laporan', selesai: 'Selesai (sudah baik atau ditemukan)', tidak_dapat: 'Tidak dapat diperbaiki',
}
const WAJIB_CATATAN = new Set(['tolak', 'tidak_dapat'])
const teks = (v: unknown) => (v == null ? '' : String(v))

function Isi() {
  const [daftar, setDaftar] = useState<Kerusakan[]>([])
  const [lab, setLab] = useState<Lab[]>([])
  const [barangLab, setBarangLab] = useState<Barang[]>([])
  const [status, setStatus] = useState('')
  const [perluSaya, setPerluSaya] = useState(false)
  const [form, setForm] = useState<FormLapor | null>(null)
  const [tindak, setTindak] = useState<{ id: string; aksi: string } | null>(null)
  const [catatan, setCatatan] = useState('')
  const [terbuka, setTerbuka] = useState<string | null>(null)
  const [riwayat, setRiwayat] = useState<RiwayatAlur[]>([])
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [memuat, setMemuat] = useState(true)

  const baca = useCallback(async () => {
    try {
      const [k, l] = await Promise.all([panggil<Kerusakan[]>('sarpras_kerusakan_daftar'), panggil<Lab[]>('sarpras_lab_daftar')])
      setDaftar(k ?? []); setLab(l ?? [])
    } catch (e) { setGalat((e as Error).message) }
    setMemuat(false)
  }, [])
  useEffect(() => { void baca() }, [baca])

  const labBisaCatat = useMemo(() => lab.filter((x) => x.boleh_catat && x.aktif), [lab])

  useEffect(() => {
    if (!form?.lab_id) { setBarangLab([]); return }
    let batal = false
    panggil<Barang[]>('sarpras_barang_daftar', { p_lab: form.lab_id }).then((x) => { if (!batal) setBarangLab((x ?? []).filter((b) => Number(b.jumlah_baik) > 0)) }).catch(() => { if (!batal) setBarangLab([]) })
    return () => { batal = true }
  }, [form?.lab_id])

  const butuhTindakan = (k: Kerusakan) => k.aksi.some((a) => ['proses', 'selesai'].includes(a))
  const tampil = daftar.filter((k) => (!status || k.status === status) && (!perluSaya || butuhTindakan(k)))
  const nPerlu = daftar.filter(butuhTindakan).length
  const barangDipilih = barangLab.find((b) => b.id === form?.barang_id)

  function laporBaru() {
    setTindak(null); setGalat(''); setInfo('')
    setForm({ lab_id: labBisaCatat.length === 1 ? labBisaCatat[0].id : '', jumlah: 1, tingkat: 'ringan', tanggal_kejadian: new Date().toISOString().slice(0, 10) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function kirim(e: FormEvent) {
    e.preventDefault(); if (!form) return; setGalat(''); setInfo('')
    if (!form.barang_id) return setGalat('Pilih barang yang rusak.')
    if (!form.uraian?.trim()) return setGalat('Uraian kerusakan wajib diisi.')
    const n = Number(form.jumlah ?? 0)
    if (!(n > 0)) return setGalat('Jumlah harus lebih dari nol.')
    if (barangDipilih && n > Number(barangDipilih.jumlah_baik)) return setGalat(`Jumlah melebihi barang berkondisi baik (${angka(barangDipilih.jumlah_baik)}).`)
    setSibuk(true)
    try {
      await panggil('sarpras_kerusakan_lapor', { p: { barang_id: form.barang_id, jumlah: n, tingkat: form.tingkat, uraian: form.uraian, tanggal_kejadian: form.tanggal_kejadian || null } })
      setForm(null); setInfo('Laporan terkirim ke Staf Sarpras.'); await baca()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }

  async function konfirmasi() {
    if (!tindak) return
    if (WAJIB_CATATAN.has(tindak.aksi) && !catatan.trim()) return setGalat('Catatan wajib diisi.')
    setSibuk(true); setGalat('')
    try {
      await panggil('sarpras_kerusakan_putuskan', { p_id: tindak.id, p_aksi: tindak.aksi, p_catatan: catatan || null })
      const id = tindak.id
      setTindak(null); setInfo('Keputusan tersimpan.'); await baca()
      if (terbuka === id) void bukaRiwayat(id, true)
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }

  async function jalankan(k: Kerusakan, aksi: string) {
    setGalat(''); setInfo('')
    if (aksi === 'proses') {
      setSibuk(true)
      try { await panggil('sarpras_kerusakan_putuskan', { p_id: k.id, p_aksi: 'proses' }); setInfo('Laporan diproses. Kondisi barang di inventaris sudah diperbarui.'); await baca() }
      catch (er) { setGalat((er as Error).message) }
      return setSibuk(false)
    }
    setTindak({ id: k.id, aksi }); setCatatan('')
  }

  async function bukaRiwayat(id: string, paksa = false) {
    if (terbuka === id && !paksa) return setTerbuka(null)
    setTerbuka(id)
    try { setRiwayat((await panggil<RiwayatAlur[]>('sarpras_alur_riwayat', { p_jenis: 'kerusakan', p_id: id })) ?? []) } catch { setRiwayat([]) }
  }

  if (memuat) return <Halaman judul="Laporan kerusakan"><p className="catatan">Memuat data...</p></Halaman>
  return (
    <Halaman judul="Laporan kerusakan" lead="Kepala bengkel melaporkan barang rusak atau hilang. Staf Sarpras menerima dan memproses: jumlah di inventaris langsung pindah dari kondisi baik ke rusak ringan, rusak berat, atau hilang. Perbaikan atau penghapusan besar diajukan lewat Usulan.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}

      <div className="aksi" style={{ marginTop: 0, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Semua status</option>
          {STATUS_KERUSAKAN.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={perluSaya} onChange={(e) => setPerluSaya(e.target.checked)} /> Perlu tindakan saya ({nPerlu})</label>
        {labBisaCatat.length > 0 && <button className="tombol tombol-isi" onClick={laporBaru}>Lapor kerusakan</button>}
      </div>

      {form && (
        <form className="form kartu jarak" onSubmit={kirim} style={{ display: 'grid', gap: 10, maxWidth: 760 }}>
          <h3>Laporan kerusakan baru</h3>
          <label>Bengkel atau laboratorium
            <select value={form.lab_id ?? ''} onChange={(e) => setForm((x) => ({ ...x, lab_id: e.target.value, barang_id: '' }))}>
              <option value="">Pilih</option>
              {labBisaCatat.map((x) => <option key={x.id} value={x.id}>{x.nama}</option>)}
            </select>
          </label>
          <label>Barang
            <select value={form.barang_id ?? ''} onChange={(e) => setForm((x) => ({ ...x, barang_id: e.target.value }))}>
              <option value="">Pilih barang di inventaris</option>
              {barangLab.map((b) => <option key={b.id} value={b.id}>{b.nama}{b.kode_barang ? ` (${b.kode_barang})` : ''} · baik {angka(b.jumlah_baik)} {b.satuan}</option>)}
            </select>
          </label>
          <div className="grid grid-2">
            <label>Jumlah<input type="number" min={0} step="any" value={teks(form.jumlah)} onChange={(e) => setForm((x) => ({ ...x, jumlah: e.target.value }))} /></label>
            <label>Tingkat
              <select value={form.tingkat ?? 'ringan'} onChange={(e) => setForm((x) => ({ ...x, tingkat: e.target.value }))}>
                {TINGKAT_RUSAK.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <label>Tanggal kejadian<input type="date" value={teks(form.tanggal_kejadian)} onChange={(e) => setForm((x) => ({ ...x, tanggal_kejadian: e.target.value }))} /></label>
          <label>Uraian kerusakan<textarea rows={3} value={teks(form.uraian)} onChange={(e) => setForm((x) => ({ ...x, uraian: e.target.value }))} /></label>
          <div className="aksi">
            <button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Mengirim...' : 'Kirim laporan'}</button>
            <TombolIkon ikon="tutup" label="Batal" onClick={() => setForm(null)} />
          </div>
        </form>
      )}

      <div className="jarak" style={{ display: 'grid', gap: 12 }}>
        {tampil.map((k) => (
          <article className="kartu" key={k.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>{k.nama_barang}</h3>
              <span className="lencana">{label(STATUS_KERUSAKAN, k.status)}</span>
            </div>
            <p className="catatan" style={{ margin: '4px 0' }}>
              {k.nomor} · {k.lab_nama}{k.program ? ` (${k.program})` : ''} · {label(TINGKAT_RUSAK, k.tingkat)} · {angka(k.jumlah)} unit · {tgl(k.tanggal_kejadian ?? k.dibuat_pada)}{k.pelapor_nama ? ` · dilaporkan ${k.pelapor_nama}` : ''}
            </p>
            <p style={{ margin: '4px 0' }}>{k.uraian}</p>
            <div className="aksi" style={{ marginTop: 8, flexWrap: 'wrap' }}>
              {k.aksi.map((a) => <button key={a} className={['proses', 'selesai'].includes(a) ? 'tombol tombol-isi' : 'tombol'} disabled={sibuk} onClick={() => jalankan(k, a)}>{NAMA_AKSI[a] ?? a}</button>)}
              <button className="tombol-ikon" onClick={() => bukaRiwayat(k.id)}>{terbuka === k.id ? 'Tutup riwayat' : 'Riwayat'}</button>
            </div>
            {tindak?.id === k.id && (
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
            {terbuka === k.id && (
              <ol className="jarak" style={{ paddingLeft: 18 }}>
                {riwayat.map((r, i) => <li key={i}><small>{tglJam(r.waktu)} · {label(STATUS_KERUSAKAN, r.ke)}{r.oleh ? ` · ${r.oleh}` : ''}{r.catatan ? ` · ${r.catatan}` : ''}</small></li>)}
                {riwayat.length === 0 && <li><small>Belum ada riwayat.</small></li>}
              </ol>
            )}
          </article>
        ))}
        {tampil.length === 0 && <p className="catatan">Tidak ada laporan yang cocok.</p>}
      </div>
      <p><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

export default function SarprasKerusakan() {
  return <GerbangSarpras perlu={['kelola', 'operasional', 'catat_lab', 'verifikasi_program', 'lihat']} judul="Laporan kerusakan" aktif="/portal/sarpras/kerusakan">{() => <Isi />}</GerbangSarpras>
}
