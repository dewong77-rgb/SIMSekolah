// Mitra industri (DU/DI) dan MoU kerja sama. Data awal dari Dapodik, dapat dilengkapi dan ditambah manual.
import TombolIkon from '../../components/TombolIkon'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { tgl } from '../../lib/rpc'
import { NAMA_STATUS_MOU, statusMou } from '../../lib/hubin'
import Gerbang from './Gerbang'

type Dudi = {
  id: string; kunci: string; nama: string; bidang_usaha: string | null; alamat: string | null; kecamatan_kabupaten: string | null
  telepon: string | null; email: string | null; website: string | null; catatan: string | null; tampil_publik: boolean; diarsipkan: boolean
}
type Mou = {
  id: string; kunci: string; dudi_id: string | null; nama_dudi_sumber: string; jenis_kerjasama: string | null; nomor_mou: string | null
  judul_mou: string | null; tgl_mulai: string | null; tgl_selesai: string | null; contact_person: string | null; telp_contact_person: string | null
  berkas_url: string | null; catatan: string | null; diarsipkan: boolean
}
const DAPODIK = (k: string) => !k.startsWith('manual:')
const kosong = (s: string | undefined) => (s ?? '').trim() || null

function Isi({ bolehHapus }: { bolehHapus: boolean }) {
  const { profil } = useAuth()
  const npsn = profil?.npsn ?? ''
  const [tab, setTab] = useState<'mitra' | 'mou'>('mitra')
  const [dudi, setDudi] = useState<Dudi[]>([])
  const [mou, setMou] = useState<Mou[]>([])
  const [cari, setCari] = useState('')
  const [filter, setFilter] = useState('semua')
  const [arsip, setArsip] = useState(false)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [formD, setFormD] = useState<Partial<Dudi> | null>(null)
  const [formM, setFormM] = useState<Partial<Mou> | null>(null)

  const baca = useCallback(async () => {
    const [d, m] = await Promise.all([
      supabase.from('dudi').select('id,kunci,nama,bidang_usaha,alamat,kecamatan_kabupaten,telepon,email,website,catatan,tampil_publik,diarsipkan').order('nama').range(0, 4999),
      supabase.from('mou_kerjasama').select('id,kunci,dudi_id,nama_dudi_sumber,jenis_kerjasama,nomor_mou,judul_mou,tgl_mulai,tgl_selesai,contact_person,telp_contact_person,berkas_url,catatan,diarsipkan').order('tgl_selesai', { ascending: true, nullsFirst: false }).range(0, 4999),
    ])
    if (d.error || m.error) return setGalat((d.error ?? m.error)!.message)
    setDudi((d.data ?? []) as Dudi[]); setMou((m.data ?? []) as Mou[])
  }, [])
  useEffect(() => { void baca() }, [baca])

  const nama = useMemo(() => new Map(dudi.map((x) => [x.id, x.nama])), [dudi])
  const q = cari.trim().toLowerCase()
  const dudiTampil = dudi.filter((x) => x.diarsipkan === arsip && (!q || `${x.nama} ${x.bidang_usaha ?? ''}`.toLowerCase().includes(q)))
  const mouTampil = mou.filter((x) => x.diarsipkan === arsip
    && (filter === 'semua' || statusMou(x.tgl_selesai) === filter)
    && (!q || `${x.nama_dudi_sumber} ${x.judul_mou ?? ''} ${x.nomor_mou ?? ''}`.toLowerCase().includes(q)))
  const hitung = (s: string) => mou.filter((x) => !x.diarsipkan && statusMou(x.tgl_selesai) === s).length

  async function simpanDudi(e: FormEvent) {
    e.preventDefault(); if (!formD) return; setGalat(''); setInfo('')
    const f = formD
    if (!f.nama?.trim()) return setGalat('Nama mitra wajib diisi.')
    if (f.website?.trim() && !/^https?:\/\/\S+$/i.test(f.website.trim())) return setGalat('Situs web harus diawali https://')
    const isi = {
      nama: f.nama.trim(), bidang_usaha: kosong(f.bidang_usaha ?? undefined), alamat: kosong(f.alamat ?? undefined),
      kecamatan_kabupaten: kosong(f.kecamatan_kabupaten ?? undefined), telepon: kosong(f.telepon ?? undefined),
      email: kosong(f.email ?? undefined), website: kosong(f.website ?? undefined), catatan: kosong(f.catatan ?? undefined),
      tampil_publik: f.tampil_publik ?? true, diarsipkan: f.diarsipkan ?? false,
    }
    setSibuk(true)
    const r = f.id ? await supabase.from('dudi').update(isi).eq('id', f.id) : await supabase.from('dudi').insert({ ...isi, npsn, kunci: 'manual:' + crypto.randomUUID() })
    setSibuk(false)
    if (r.error) return setGalat(r.error.message)
    setFormD(null); setInfo('Data mitra tersimpan.'); void baca()
  }

  async function simpanMou(e: FormEvent) {
    e.preventDefault(); if (!formM) return; setGalat(''); setInfo('')
    const f = formM
    const mitra = dudi.find((x) => x.id === f.dudi_id)
    if (!mitra) return setGalat('Pilih mitra industri.')
    if (f.tgl_mulai && f.tgl_selesai && f.tgl_selesai < f.tgl_mulai) return setGalat('Tanggal selesai tidak boleh sebelum tanggal mulai.')
    if (f.berkas_url?.trim() && !/^https:\/\/\S+$/i.test(f.berkas_url.trim())) return setGalat('Tautan berkas harus diawali https://')
    const isi = {
      dudi_id: mitra.id, nama_dudi_sumber: mitra.nama, jenis_kerjasama: kosong(f.jenis_kerjasama ?? undefined), nomor_mou: kosong(f.nomor_mou ?? undefined),
      judul_mou: kosong(f.judul_mou ?? undefined), tgl_mulai: f.tgl_mulai || null, tgl_selesai: f.tgl_selesai || null,
      contact_person: kosong(f.contact_person ?? undefined), telp_contact_person: kosong(f.telp_contact_person ?? undefined),
      berkas_url: kosong(f.berkas_url ?? undefined), catatan: kosong(f.catatan ?? undefined), diarsipkan: f.diarsipkan ?? false,
    }
    setSibuk(true)
    const r = f.id ? await supabase.from('mou_kerjasama').update(isi).eq('id', f.id) : await supabase.from('mou_kerjasama').insert({ ...isi, npsn, kunci: 'manual:' + crypto.randomUUID() })
    setSibuk(false)
    if (r.error) return setGalat(r.error.message)
    setFormM(null); setInfo('MoU tersimpan.'); void baca()
  }

  async function hapus(jenis: 'dudi' | 'mou', id: string, nm: string) {
    if (!window.confirm(`Hapus permanen ${nm}? Data tidak dapat dikembalikan. Gunakan Arsip bila hanya ingin menyembunyikan.`)) return
    setGalat(''); setInfo('')
    const r = await supabase.from(jenis === 'dudi' ? 'dudi' : 'mou_kerjasama').delete().eq('id', id)
    if (r.error) return setGalat(r.error.code === '23503' ? 'Mitra ini masih memiliki MoU. Hapus MoU-nya lebih dulu, atau arsipkan mitra.' : r.error.message)
    setFormD(null); setFormM(null); setInfo('Data dihapus.'); void baca()
  }

  const D = (k: keyof Dudi, label: string, tipe = 'text') => (
    <label>{label}<input type={tipe} value={(formD?.[k] as string | null | undefined) ?? ''} onChange={(e) => setFormD((x) => ({ ...x, [k]: e.target.value }))} /></label>
  )
  const M = (k: keyof Mou, label: string, tipe = 'text') => (
    <label>{label}<input type={tipe} value={(formM?.[k] as string | null | undefined) ?? ''} onChange={(e) => setFormM((x) => ({ ...x, [k]: e.target.value }))} /></label>
  )

  return (
    <Halaman judul="Mitra industri dan MoU" lead="Daftar DU/DI dan perjanjian kerja sama. Mitra yang dicentang tampil akan muncul di halaman Hubungan Industri situs publik, tanpa kontak dan nomor MoU.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}
      <div className="lencana-baris" style={{ marginBottom: 12 }}>
        <span className="lencana">Berlaku {hitung('berlaku')}</span>
        <span className="lencana">Segera berakhir {hitung('segera')}</span>
        <span className="lencana">Berakhir {hitung('berakhir')}</span>
        <span className="lencana">Tanpa tanggal {hitung('tanpa_tanggal')}</span>
      </div>
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
        <button className={tab === 'mitra' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('mitra')}>Mitra ({dudi.filter((x) => !x.diarsipkan).length})</button>
        <button className={tab === 'mou' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('mou')}>MoU ({mou.filter((x) => !x.diarsipkan).length})</button>
        <input type="search" placeholder="Cari..." value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari" />
        {tab === 'mou' && (
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Status MoU">
            <option value="semua">Semua status</option>
            {Object.entries(NAMA_STATUS_MOU).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={arsip} onChange={(e) => setArsip(e.target.checked)} /> Arsip</label>
        <button className="tombol" onClick={() => (tab === 'mitra' ? setFormD({ tampil_publik: true }) : setFormM({}))}>{tab === 'mitra' ? 'Tambah mitra' : 'Tambah MoU'}</button>
      </div>

      {formD && (
        <form className="form kartu jarak" onSubmit={simpanDudi} style={{ display: 'grid', gap: 10, maxWidth: 720 }}>
          <h3>{formD.id ? 'Ubah mitra' : 'Mitra baru'}</h3>
          {formD.kunci && DAPODIK(formD.kunci) && <p className="catatan">Data ini berasal dari Dapodik. Perubahan pada nama, alamat, dan kontak dapat tertimpa saat unggahan Dapodik berikutnya. Tampil publik, catatan, dan arsip aman.</p>}
          {D('nama', 'Nama mitra')}{D('bidang_usaha', 'Bidang usaha')}{D('alamat', 'Alamat')}{D('kecamatan_kabupaten', 'Kecamatan dan kabupaten')}
          <div className="grid grid-2">{D('telepon', 'Telepon')}{D('email', 'Email', 'email')}</div>
          {D('website', 'Situs web', 'url')}
          <label>Catatan internal<textarea rows={2} value={formD.catatan ?? ''} onChange={(e) => setFormD((x) => ({ ...x, catatan: e.target.value }))} /></label>
          <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={formD.tampil_publik ?? true} onChange={(e) => setFormD((x) => ({ ...x, tampil_publik: e.target.checked }))} /> Tampilkan di situs publik</label>
          <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={formD.diarsipkan ?? false} onChange={(e) => setFormD((x) => ({ ...x, diarsipkan: e.target.checked }))} /> Arsipkan (sembunyikan dari daftar dan situs)</label>
          <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button><button type="button" className="tombol" onClick={() => setFormD(null)}>Batal</button>{bolehHapus && formD.id && <TombolIkon ikon="sampah" label="Hapus" varian="bahaya" onClick={() => hapus('dudi', formD.id!, formD.nama ?? 'mitra')} />}</div>
        </form>
      )}

      {formM && (
        <form className="form kartu jarak" onSubmit={simpanMou} style={{ display: 'grid', gap: 10, maxWidth: 720 }}>
          <h3>{formM.id ? 'Ubah MoU' : 'MoU baru'}</h3>
          {formM.kunci && DAPODIK(formM.kunci) && <p className="catatan">Data ini berasal dari Dapodik. Isian dasar dapat tertimpa saat unggahan Dapodik berikutnya. Catatan, tautan berkas, dan arsip aman.</p>}
          <label>Mitra
            <select value={formM.dudi_id ?? ''} onChange={(e) => setFormM((x) => ({ ...x, dudi_id: e.target.value }))}>
              <option value="">Pilih mitra</option>
              {dudi.filter((x) => !x.diarsipkan || x.id === formM.dudi_id).map((x) => <option key={x.id} value={x.id}>{x.nama}</option>)}
            </select>
          </label>
          {M('jenis_kerjasama', 'Jenis kerja sama')}{M('judul_mou', 'Judul MoU')}{M('nomor_mou', 'Nomor MoU')}
          <div className="grid grid-2">{M('tgl_mulai', 'Mulai', 'date')}{M('tgl_selesai', 'Berakhir', 'date')}</div>
          <div className="grid grid-2">{M('contact_person', 'Narahubung')}{M('telp_contact_person', 'Telepon narahubung')}</div>
          {M('berkas_url', 'Tautan berkas MoU (https)', 'url')}
          <label>Catatan internal<textarea rows={2} value={formM.catatan ?? ''} onChange={(e) => setFormM((x) => ({ ...x, catatan: e.target.value }))} /></label>
          <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={formM.diarsipkan ?? false} onChange={(e) => setFormM((x) => ({ ...x, diarsipkan: e.target.checked }))} /> Arsipkan</label>
          <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button><button type="button" className="tombol" onClick={() => setFormM(null)}>Batal</button>{bolehHapus && formM.id && <TombolIkon ikon="sampah" label="Hapus" varian="bahaya" onClick={() => hapus('mou', formM.id!, 'MoU ini')} />}</div>
        </form>
      )}

      <div className="tabel-bungkus jarak">
        {tab === 'mitra' ? (
          <table>
            <thead><tr><th>Mitra</th><th>Bidang</th><th>Publik</th><th>Sumber</th><th /></tr></thead>
            <tbody>
              {dudiTampil.map((x) => (
                <tr key={x.id}>
                  <td>{x.nama}</td><td>{x.bidang_usaha ?? '-'}</td><td>{x.tampil_publik ? 'Ya' : 'Tidak'}</td>
                  <td>{DAPODIK(x.kunci) ? 'Dapodik' : 'Manual'}</td>
                  <td><TombolIkon ikon="pena" label="Ubah" onClick={() => { setFormM(null); setFormD(x); window.scrollTo({ top: 0, behavior: 'smooth' }) }} /></td>
                </tr>
              ))}
              {dudiTampil.length === 0 && <tr><td colSpan={5} className="catatan">Tidak ada data.</td></tr>}
            </tbody>
          </table>
        ) : (
          <table>
            <thead><tr><th>Mitra</th><th>Judul atau jenis</th><th>Periode</th><th>Status</th><th /></tr></thead>
            <tbody>
              {mouTampil.map((x) => (
                <tr key={x.id}>
                  <td>{(x.dudi_id && nama.get(x.dudi_id)) || x.nama_dudi_sumber}</td>
                  <td>{x.judul_mou || x.jenis_kerjasama || '-'}</td>
                  <td>{tgl(x.tgl_mulai)} sampai {tgl(x.tgl_selesai)}</td>
                  <td>{NAMA_STATUS_MOU[statusMou(x.tgl_selesai)]}</td>
                  <td><TombolIkon ikon="pena" label="Ubah" onClick={() => { setFormD(null); setFormM(x); window.scrollTo({ top: 0, behavior: 'smooth' }) }} /></td>
                </tr>
              ))}
              {mouTampil.length === 0 && <tr><td colSpan={5} className="catatan">Tidak ada data.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <p><Link to="/hubungan-industri" target="_blank">Lihat halaman Hubungan Industri</Link> · <Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

export default function HubinKerjasama() {
  return <Gerbang perlu={['hubin.kelola_dudi']} judul="Mitra industri dan MoU">{(izin) => <Isi bolehHapus={izin.includes('hubin.kelola_dudi') && izin.includes('hubin.kelola_humas')} />}</Gerbang>
}
