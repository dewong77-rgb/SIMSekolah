// Permintaan alat dan bahan: kepala bengkel mengajukan, kepala program meneruskan, Staf Sarpras menyiapkan dan menyerahkan.
import TombolIkon from '../../components/TombolIkon'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { panggil, tglJam, tgl } from '../../lib/rpc'
import { JENIS_PERMINTAAN, STATUS_PERMINTAAN, angka, label, type Barang, type Lab, type Permintaan, type RiwayatAlur } from '../../lib/sarpras'
import GerbangSarpras from './GerbangSarpras'

type FormMinta = {
  id?: string; lab_id?: string; jenis?: string; nama_barang?: string; spesifikasi?: string
  jumlah?: number | string; satuan?: string; keperluan?: string; dibutuhkan_tanggal?: string
}
const NAMA_AKSI: Record<string, string> = {
  ubah: 'Ubah', ajukan: 'Ajukan', batal: 'Batalkan', teruskan: 'Teruskan ke Staf Sarpras',
  kembalikan: 'Kembalikan untuk diperbaiki', tolak: 'Tolak', siapkan: 'Siapkan', serahkan: 'Serahkan ke bengkel',
}
const WAJIB_CATATAN = new Set(['kembalikan', 'tolak'])
const teks = (v: unknown) => (v == null ? '' : String(v))

function Isi() {
  const [daftar, setDaftar] = useState<Permintaan[]>([])
  const [lab, setLab] = useState<Lab[]>([])
  const [semuaBarang, setSemuaBarang] = useState<Barang[]>([])
  const [status, setStatus] = useState('')
  const [perluSaya, setPerluSaya] = useState(false)
  const [form, setForm] = useState<FormMinta | null>(null)
  const [tindak, setTindak] = useState<{ id: string; aksi: string } | null>(null)
  const [catatan, setCatatan] = useState('')
  const [sumber, setSumber] = useState('')
  const [terbuka, setTerbuka] = useState<string | null>(null)
  const [riwayat, setRiwayat] = useState<RiwayatAlur[]>([])
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [memuat, setMemuat] = useState(true)

  const baca = useCallback(async () => {
    try {
      const [m, l] = await Promise.all([panggil<Permintaan[]>('sarpras_permintaan_daftar'), panggil<Lab[]>('sarpras_lab_daftar')])
      setDaftar(m ?? []); setLab(l ?? [])
    } catch (e) { setGalat((e as Error).message) }
    setMemuat(false)
  }, [])
  useEffect(() => { void baca() }, [baca])

  const labBisaCatat = useMemo(() => lab.filter((x) => x.boleh_catat && x.aktif), [lab])
  const butuhTindakan = (m: Permintaan) => m.aksi.some((a) => ['ajukan', 'teruskan', 'siapkan', 'serahkan'].includes(a)) || (m.status === 'dikembalikan' && m.aksi.includes('ubah'))
  const tampil = daftar.filter((m) => (!status || m.status === status) && (!perluSaya || butuhTindakan(m)))
  const nPerlu = daftar.filter(butuhTindakan).length

  // Daftar barang untuk memilih sumber stok saat menyiapkan (hanya Staf atau Waka yang punya aksi 'siapkan').
  const bisaSiapkan = daftar.some((m) => m.aksi.includes('siapkan'))
  useEffect(() => {
    if (!bisaSiapkan) return
    panggil<Barang[]>('sarpras_barang_daftar').then((x) => setSemuaBarang(x ?? [])).catch(() => setSemuaBarang([]))
  }, [bisaSiapkan])

  function mintaBaru() {
    setTindak(null); setGalat(''); setInfo('')
    setForm({ lab_id: labBisaCatat.length === 1 ? labBisaCatat[0].id : '', jenis: 'bahan', jumlah: 1, satuan: 'unit' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function ubah(m: Permintaan) {
    setTindak(null); setGalat(''); setInfo('')
    setForm({ id: m.id, lab_id: m.lab_id, jenis: m.jenis, nama_barang: m.nama_barang, spesifikasi: m.spesifikasi ?? '', jumlah: m.jumlah, satuan: m.satuan, keperluan: m.keperluan, dibutuhkan_tanggal: m.dibutuhkan_tanggal ?? '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function simpan(e: FormEvent, langsungAjukan: boolean) {
    e.preventDefault(); if (!form) return; setGalat(''); setInfo('')
    if (!form.lab_id) return setGalat('Pilih bengkel atau laboratorium.')
    if (!form.nama_barang?.trim()) return setGalat('Nama alat atau bahan wajib diisi.')
    if (!form.keperluan?.trim()) return setGalat('Keperluan wajib diisi.')
    if (!(Number(form.jumlah) > 0)) return setGalat('Jumlah harus lebih dari nol.')
    setSibuk(true)
    try {
      const r = await panggil<{ id: string }>('sarpras_permintaan_simpan', {
        p_id: form.id ?? null,
        p: { lab_id: form.lab_id, jenis: form.jenis, nama_barang: form.nama_barang, spesifikasi: form.spesifikasi, jumlah: Number(form.jumlah), satuan: form.satuan, keperluan: form.keperluan, dibutuhkan_tanggal: form.dibutuhkan_tanggal || null },
      })
      if (langsungAjukan) await panggil('sarpras_permintaan_ajukan', { p_id: r.id })
      setForm(null); setInfo(langsungAjukan ? 'Permintaan diajukan.' : 'Permintaan tersimpan sebagai draf.'); await baca()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }

  async function jalankan(m: Permintaan, aksi: string) {
    setGalat(''); setInfo('')
    if (aksi === 'ubah') return ubah(m)
    if (aksi === 'ajukan' || aksi === 'teruskan' || aksi === 'serahkan') {
      setSibuk(true)
      try {
        if (aksi === 'ajukan') await panggil('sarpras_permintaan_ajukan', { p_id: m.id })
        else await panggil('sarpras_permintaan_putuskan', { p_id: m.id, p_aksi: aksi })
        setInfo(aksi === 'serahkan' ? 'Diserahkan. Stok bengkel sudah bertambah di inventaris.' : aksi === 'ajukan' ? 'Permintaan diajukan.' : 'Diteruskan ke Staf Sarpras.')
        await baca()
      } catch (er) { setGalat((er as Error).message) }
      return setSibuk(false)
    }
    setTindak({ id: m.id, aksi }); setCatatan(''); setSumber(m.sumber_barang_id ?? '')
  }

  async function konfirmasi() {
    if (!tindak) return
    if (WAJIB_CATATAN.has(tindak.aksi) && !catatan.trim()) return setGalat('Catatan wajib diisi.')
    setSibuk(true); setGalat('')
    try {
      await panggil('sarpras_permintaan_putuskan', { p_id: tindak.id, p_aksi: tindak.aksi, p_catatan: catatan || null, p_sumber: tindak.aksi === 'siapkan' && sumber ? sumber : null })
      const id = tindak.id
      setTindak(null); setInfo('Keputusan tersimpan.'); await baca()
      if (terbuka === id) void bukaRiwayat(id, true)
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }

  async function bukaRiwayat(id: string, paksa = false) {
    if (terbuka === id && !paksa) return setTerbuka(null)
    setTerbuka(id)
    try { setRiwayat((await panggil<RiwayatAlur[]>('sarpras_alur_riwayat', { p_jenis: 'permintaan', p_id: id })) ?? []) } catch { setRiwayat([]) }
  }

  const F = (k: keyof FormMinta, nm: string, tipe = 'text') => (
    <label>{nm}<input type={tipe} min={tipe === 'number' ? 0 : undefined} step={tipe === 'number' ? 'any' : undefined} value={teks(form?.[k])} onChange={(e) => setForm((x) => ({ ...x, [k]: e.target.value }))} /></label>
  )

  if (memuat) return <Halaman judul="Permintaan alat dan bahan"><p className="catatan">Memuat data...</p></Halaman>
  return (
    <Halaman judul="Permintaan alat dan bahan" lead="Kebutuhan praktik sehari-hari. Alur: kepala bengkel mengajukan, kepala program meneruskan, Staf Sarpras menyiapkan dan menyerahkan. Saat diserahkan, stok sumber berkurang dan stok bengkel bertambah otomatis. Pengadaan baru di luar stok diajukan lewat Usulan.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}

      <div className="aksi" style={{ marginTop: 0, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Semua status</option>
          {STATUS_PERMINTAAN.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={perluSaya} onChange={(e) => setPerluSaya(e.target.checked)} /> Perlu tindakan saya ({nPerlu})</label>
        {labBisaCatat.length > 0 && <button className="tombol tombol-isi" onClick={mintaBaru}>Buat permintaan</button>}
      </div>

      {form && (
        <form className="form kartu jarak" onSubmit={(e) => simpan(e, false)} style={{ display: 'grid', gap: 10, maxWidth: 760 }}>
          <h3>{form.id ? 'Ubah permintaan' : 'Permintaan baru'}</h3>
          <label>Bengkel atau laboratorium
            <select value={form.lab_id ?? ''} disabled={!!form.id} onChange={(e) => setForm((x) => ({ ...x, lab_id: e.target.value }))}>
              <option value="">Pilih</option>
              {labBisaCatat.map((x) => <option key={x.id} value={x.id}>{x.nama}</option>)}
            </select>
          </label>
          <div className="grid grid-2">
            <label>Jenis
              <select value={form.jenis ?? 'bahan'} onChange={(e) => setForm((x) => ({ ...x, jenis: e.target.value }))}>
                {JENIS_PERMINTAAN.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            {F('dibutuhkan_tanggal', 'Dibutuhkan tanggal', 'date')}
          </div>
          {F('nama_barang', 'Nama alat atau bahan')}
          <label>Spesifikasi<textarea rows={2} value={teks(form.spesifikasi)} onChange={(e) => setForm((x) => ({ ...x, spesifikasi: e.target.value }))} /></label>
          <div className="grid grid-2">{F('jumlah', 'Jumlah', 'number')}{F('satuan', 'Satuan')}</div>
          <label>Keperluan (kegiatan praktik atau kelas yang memakai)<textarea rows={2} value={teks(form.keperluan)} onChange={(e) => setForm((x) => ({ ...x, keperluan: e.target.value }))} /></label>
          <div className="aksi">
            <button className="tombol" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan draf'}</button>
            <button type="button" className="tombol tombol-isi" disabled={sibuk} onClick={(e) => simpan(e, true)}>Simpan dan ajukan</button>
            <TombolIkon ikon="tutup" label="Batal" onClick={() => setForm(null)} />
          </div>
        </form>
      )}

      <div className="jarak" style={{ display: 'grid', gap: 12 }}>
        {tampil.map((m) => (
          <article className="kartu" key={m.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>{m.nama_barang}</h3>
              <span className="lencana">{label(STATUS_PERMINTAAN, m.status)}</span>
            </div>
            <p className="catatan" style={{ margin: '4px 0' }}>
              {m.nomor} · {label(JENIS_PERMINTAAN, m.jenis)} · {m.lab_nama}{m.program ? ` (${m.program})` : ''} · {tgl(m.dibuat_pada)}{m.dibutuhkan_tanggal ? ` · dibutuhkan ${tgl(m.dibutuhkan_tanggal)}` : ''}
            </p>
            <p style={{ margin: '4px 0' }}>{angka(m.jumlah)} {m.satuan}{m.pengusul_nama ? ` · diminta ${m.pengusul_nama}` : ''}{m.sumber_nama ? ` · sumber stok: ${m.sumber_nama}` : ''}</p>
            {m.spesifikasi && <p style={{ margin: '4px 0' }}><small>Spesifikasi: {m.spesifikasi}</small></p>}
            <p style={{ margin: '4px 0' }}>{m.keperluan}</p>
            <div className="aksi" style={{ marginTop: 8, flexWrap: 'wrap' }}>
              {m.aksi.map((a) => <button key={a} className={['ajukan', 'teruskan', 'siapkan', 'serahkan'].includes(a) ? 'tombol tombol-isi' : 'tombol'} disabled={sibuk} onClick={() => jalankan(m, a)}>{NAMA_AKSI[a] ?? a}</button>)}
              <button className="tombol-ikon" onClick={() => bukaRiwayat(m.id)}>{terbuka === m.id ? 'Tutup riwayat' : 'Riwayat'}</button>
            </div>
            {tindak?.id === m.id && (
              <div className="jarak" style={{ display: 'grid', gap: 8, maxWidth: 560 }}>
                {tindak.aksi === 'siapkan' && (
                  <label>Ambil dari stok (opsional)
                    <select value={sumber} onChange={(e) => setSumber(e.target.value)}>
                      <option value="">Tanpa stok sumber (pengadaan di luar inventaris)</option>
                      {semuaBarang.filter((b) => b.kategori === m.jenis && Number(b.jumlah_baik) > 0).map((b) => (
                        <option key={b.id} value={b.id}>{b.nama} · {b.lab_nama ?? 'Umum'} · tersedia {angka(b.jumlah_baik)} {b.satuan}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label>{NAMA_AKSI[tindak.aksi]}: catatan{WAJIB_CATATAN.has(tindak.aksi) ? ' (wajib)' : ' (opsional)'}
                  <textarea rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
                </label>
                <div className="aksi" style={{ marginTop: 0 }}>
                  <button className="tombol tombol-isi" disabled={sibuk} onClick={konfirmasi}>Konfirmasi</button>
                  <TombolIkon ikon="tutup" label="Batal" onClick={() => setTindak(null)} />
                </div>
              </div>
            )}
            {terbuka === m.id && (
              <ol className="jarak" style={{ paddingLeft: 18 }}>
                {riwayat.map((r, i) => <li key={i}><small>{tglJam(r.waktu)} · {label(STATUS_PERMINTAAN, r.ke)}{r.oleh ? ` · ${r.oleh}` : ''}{r.catatan ? ` · ${r.catatan}` : ''}</small></li>)}
                {riwayat.length === 0 && <li><small>Belum ada riwayat.</small></li>}
              </ol>
            )}
          </article>
        ))}
        {tampil.length === 0 && <p className="catatan">Tidak ada permintaan yang cocok.</p>}
      </div>
      <p><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

export default function SarprasPermintaan() {
  return <GerbangSarpras perlu={['kelola', 'operasional', 'catat_lab', 'verifikasi_program', 'lihat']} judul="Permintaan alat dan bahan" aktif="/portal/sarpras/permintaan">{() => <Isi />}</GerbangSarpras>
}
