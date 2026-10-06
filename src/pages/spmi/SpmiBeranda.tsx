// SPMI: standar mutu (8 SNP) beserta indikator, dan dokumen mutu. Siklus PPEPP, bagian Penetapan.
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { supabase } from '../../lib/supabase'
import { panggil } from '../../lib/rpc'
import { JENIS_DOKUMEN, type DokumenSpmi, type Indikator, type Standar } from '../../lib/spmi'
import GerbangSpmi from './GerbangSpmi'

const kosong = (s: string | null | undefined) => (s ?? '').trim() || null
const namaJenis = (k: string) => JENIS_DOKUMEN.find((j) => j[0] === k)?.[1] ?? k

function Isi({ izin }: { izin: string[] }) {
  const bolehTulis = izin.includes('catat') || izin.includes('kelola')
  const bolehKelola = izin.includes('kelola')
  const [tab, setTab] = useState<'standar' | 'dokumen'>('standar')
  const [standar, setStandar] = useState<Standar[]>([])
  const [indikator, setIndikator] = useState<Indikator[]>([])
  const [dokumen, setDokumen] = useState<DokumenSpmi[]>([])
  const [terbuka, setTerbuka] = useState<string | null>(null)
  const [formS, setFormS] = useState<Partial<Standar> | null>(null)
  const [formI, setFormI] = useState<Partial<Indikator> | null>(null)
  const [formD, setFormD] = useState<Partial<DokumenSpmi> | null>(null)
  const [arsip, setArsip] = useState(false)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [memuat, setMemuat] = useState(true)

  const baca = useCallback(async () => {
    const [s, i, d] = await Promise.all([
      supabase.from('spmi_standar').select('id,kode,nama,uraian,urutan,penanggung_jawab,aktif').order('urutan'),
      supabase.from('spmi_indikator').select('id,standar_id,uraian,target,satuan,sumber_data,aktif').order('dibuat_pada'),
      supabase.from('spmi_dokumen').select('id,jenis,judul,nomor,tahun,tautan,catatan,diarsipkan').order('tahun', { ascending: false, nullsFirst: false }).order('judul'),
    ])
    setMemuat(false)
    if (s.error || i.error || d.error) return setGalat((s.error ?? i.error ?? d.error)!.message)
    setStandar((s.data ?? []) as Standar[]); setIndikator((i.data ?? []) as Indikator[]); setDokumen((d.data ?? []) as DokumenSpmi[])
  }, [])
  useEffect(() => { void baca() }, [baca])

  async function siapkan() {
    setGalat(''); setInfo(''); setSibuk(true)
    try { const n = await panggil<number>('spmi_siapkan_standar'); setInfo(n ? `${n} standar ditambahkan.` : 'Standar sudah lengkap.'); await baca() }
    catch (e) { setGalat((e as Error).message) } finally { setSibuk(false) }
  }

  async function simpanS(e: FormEvent) {
    e.preventDefault(); if (!formS) return; setGalat(''); setInfo('')
    if (!formS.kode?.trim() || !formS.nama?.trim()) return setGalat('Kode dan nama standar wajib diisi.')
    const isi = { kode: formS.kode.trim().toUpperCase(), nama: formS.nama.trim(), uraian: kosong(formS.uraian), penanggung_jawab: kosong(formS.penanggung_jawab), urutan: Number(formS.urutan ?? 100) || 100, aktif: formS.aktif ?? true }
    setSibuk(true)
    const r = formS.id ? await supabase.from('spmi_standar').update(isi).eq('id', formS.id) : await supabase.from('spmi_standar').insert(isi)
    setSibuk(false)
    if (r.error) return setGalat(r.error.code === '23505' ? 'Kode standar sudah dipakai.' : r.error.message)
    setFormS(null); setInfo('Standar tersimpan.'); void baca()
  }

  async function simpanI(e: FormEvent) {
    e.preventDefault(); if (!formI) return; setGalat(''); setInfo('')
    if (!formI.uraian?.trim()) return setGalat('Uraian indikator wajib diisi.')
    const isi = { standar_id: formI.standar_id!, uraian: formI.uraian.trim(), target: kosong(formI.target), satuan: kosong(formI.satuan), sumber_data: kosong(formI.sumber_data), aktif: formI.aktif ?? true }
    setSibuk(true)
    const r = formI.id ? await supabase.from('spmi_indikator').update(isi).eq('id', formI.id) : await supabase.from('spmi_indikator').insert(isi)
    setSibuk(false)
    if (r.error) return setGalat(r.error.message)
    setFormI(null); setInfo('Indikator tersimpan.'); void baca()
  }

  async function simpanD(e: FormEvent) {
    e.preventDefault(); if (!formD) return; setGalat(''); setInfo('')
    if (!formD.judul?.trim()) return setGalat('Judul dokumen wajib diisi.')
    if (formD.tautan?.trim() && !/^https:\/\/\S+$/i.test(formD.tautan.trim())) return setGalat('Tautan harus diawali https://')
    const isi = { jenis: formD.jenis ?? 'kebijakan', judul: formD.judul.trim(), nomor: kosong(formD.nomor), tahun: formD.tahun ? Number(formD.tahun) : null, tautan: kosong(formD.tautan), catatan: kosong(formD.catatan), diarsipkan: formD.diarsipkan ?? false }
    setSibuk(true)
    const r = formD.id ? await supabase.from('spmi_dokumen').update(isi).eq('id', formD.id) : await supabase.from('spmi_dokumen').insert(isi)
    setSibuk(false)
    if (r.error) return setGalat(r.error.message)
    setFormD(null); setInfo('Dokumen tersimpan.'); void baca()
  }

  async function hapus(tabel: 'spmi_standar' | 'spmi_indikator' | 'spmi_dokumen', id: string, nm: string) {
    if (!window.confirm(`Hapus permanen ${nm}? Data tidak dapat dikembalikan.`)) return
    setGalat(''); setInfo('')
    const r = await supabase.from(tabel).delete().eq('id', id)
    if (r.error) return setGalat(r.error.message)
    setFormS(null); setFormI(null); setFormD(null); setInfo('Data dihapus.'); void baca()
  }

  const dokTampil = dokumen.filter((x) => x.diarsipkan === arsip)

  return (
    <Halaman judul="Penjaminan mutu internal (SPMI)" lead="Standar mutu, indikator, dan dokumen satuan pendidikan. Susunan tim SPMI diatur lewat menu Penugasan: jabatan Ketua dan Anggota SPMI.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
        <button className={tab === 'standar' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('standar')}>Standar dan indikator ({standar.length})</button>
        <button className={tab === 'dokumen' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('dokumen')}>Dokumen mutu ({dokumen.filter((x) => !x.diarsipkan).length})</button>
        {bolehKelola && tab === 'standar' && <button className="tombol" onClick={() => setFormS({ urutan: 100, aktif: true })}>Tambah standar</button>}
        {bolehTulis && tab === 'dokumen' && <button className="tombol" onClick={() => setFormD({ jenis: 'kebijakan' })}>Tambah dokumen</button>}
        {tab === 'dokumen' && <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={arsip} onChange={(e) => setArsip(e.target.checked)} /> Arsip</label>}
      </div>

      {tab === 'standar' && (
        <>
          {!memuat && standar.length === 0 && (
            <div className="kartu jarak">
              <h3>Belum ada standar mutu</h3>
              <p>{bolehKelola ? 'Mulai dari delapan Standar Nasional Pendidikan. Nama, urutan, dan penanggung jawab bisa diubah sesudahnya.' : 'Ketua SPMI belum menyiapkan standar mutu.'}</p>
              {bolehKelola && <button className="tombol tombol-isi" disabled={sibuk} onClick={siapkan}>Siapkan 8 Standar Nasional Pendidikan</button>}
            </div>
          )}
          {formS && (
            <form className="form kartu jarak" onSubmit={simpanS} style={{ display: 'grid', gap: 10, maxWidth: 720 }}>
              <h3>{formS.id ? 'Ubah standar' : 'Standar baru'}</h3>
              <div className="grid grid-2">
                <label>Kode<input value={formS.kode ?? ''} onChange={(e) => setFormS((x) => ({ ...x, kode: e.target.value }))} /></label>
                <label>Urutan<input type="number" value={formS.urutan ?? 100} onChange={(e) => setFormS((x) => ({ ...x, urutan: Number(e.target.value) }))} /></label>
              </div>
              <label>Nama standar<input value={formS.nama ?? ''} onChange={(e) => setFormS((x) => ({ ...x, nama: e.target.value }))} /></label>
              <label>Penanggung jawab<input value={formS.penanggung_jawab ?? ''} onChange={(e) => setFormS((x) => ({ ...x, penanggung_jawab: e.target.value }))} placeholder="Contoh: Waka Kurikulum" /></label>
              <label>Uraian<textarea rows={3} value={formS.uraian ?? ''} onChange={(e) => setFormS((x) => ({ ...x, uraian: e.target.value }))} /></label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={formS.aktif ?? true} onChange={(e) => setFormS((x) => ({ ...x, aktif: e.target.checked }))} /> Aktif</label>
              <div className="aksi">
                <button className="tombol tombol-isi" disabled={sibuk}>Simpan</button>
                <button type="button" className="tombol" onClick={() => setFormS(null)}>Batal</button>
                {formS.id && <button type="button" className="tombol" onClick={() => hapus('spmi_standar', formS.id!, `standar ${formS.nama} beserta indikatornya`)}>Hapus</button>}
              </div>
            </form>
          )}
          {formI && (
            <form className="form kartu jarak" onSubmit={simpanI} style={{ display: 'grid', gap: 10, maxWidth: 720 }}>
              <h3>{formI.id ? 'Ubah indikator' : 'Indikator baru'}</h3>
              <label>Uraian indikator<textarea rows={2} value={formI.uraian ?? ''} onChange={(e) => setFormI((x) => ({ ...x, uraian: e.target.value }))} placeholder="Contoh: Persentase guru bersertifikat pendidik" /></label>
              <div className="grid grid-2">
                <label>Target<input value={formI.target ?? ''} onChange={(e) => setFormI((x) => ({ ...x, target: e.target.value }))} placeholder="Contoh: 80" /></label>
                <label>Satuan<input value={formI.satuan ?? ''} onChange={(e) => setFormI((x) => ({ ...x, satuan: e.target.value }))} placeholder="Contoh: %" /></label>
              </div>
              <label>Sumber data<input value={formI.sumber_data ?? ''} onChange={(e) => setFormI((x) => ({ ...x, sumber_data: e.target.value }))} placeholder="Contoh: Dapodik, rapor mutu, hasil observasi" /></label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={formI.aktif ?? true} onChange={(e) => setFormI((x) => ({ ...x, aktif: e.target.checked }))} /> Aktif</label>
              <div className="aksi">
                <button className="tombol tombol-isi" disabled={sibuk}>Simpan</button>
                <button type="button" className="tombol" onClick={() => setFormI(null)}>Batal</button>
                {formI.id && bolehKelola && <button type="button" className="tombol" onClick={() => hapus('spmi_indikator', formI.id!, 'indikator ini')}>Hapus</button>}
              </div>
            </form>
          )}
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {standar.map((s) => {
              const ind = indikator.filter((x) => x.standar_id === s.id)
              const buka = terbuka === s.id
              return (
                <article key={s.id} className="kartu" style={s.aktif ? undefined : { opacity: 0.6 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="lencana">{s.kode}</span>
                    <h3 style={{ margin: 0, flex: 1 }}>{s.nama}</h3>
                    <span className="catatan">{ind.length} indikator</span>
                    <button className="tombol" onClick={() => setTerbuka(buka ? null : s.id)} aria-expanded={buka}>{buka ? 'Tutup' : 'Buka'}</button>
                    {bolehKelola && <button className="tombol" onClick={() => setFormS(s)}>Ubah</button>}
                  </div>
                  {s.penanggung_jawab && <p className="catatan" style={{ margin: '6px 0 0' }}>Penanggung jawab: {s.penanggung_jawab}</p>}
                  {buka && (
                    <div style={{ marginTop: 10 }}>
                      {s.uraian && <p>{s.uraian}</p>}
                      {ind.length === 0 && <p className="catatan">Belum ada indikator.</p>}
                      {ind.length > 0 && (
                        <div style={{ overflowX: 'auto' }}>
                          <table className="tabel">
                            <thead><tr><th>Indikator</th><th>Target</th><th>Sumber data</th><th /></tr></thead>
                            <tbody>
                              {ind.map((x) => (
                                <tr key={x.id} style={x.aktif ? undefined : { opacity: 0.6 }}>
                                  <td>{x.uraian}</td>
                                  <td>{x.target ? `${x.target}${x.satuan ? ' ' + x.satuan : ''}` : '-'}</td>
                                  <td>{x.sumber_data ?? '-'}</td>
                                  <td>{bolehTulis && <button className="tombol" onClick={() => setFormI(x)}>Ubah</button>}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {bolehTulis && <button className="tombol" style={{ marginTop: 8 }} onClick={() => setFormI({ standar_id: s.id, aktif: true })}>Tambah indikator</button>}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </>
      )}

      {tab === 'dokumen' && (
        <>
          {formD && (
            <form className="form kartu jarak" onSubmit={simpanD} style={{ display: 'grid', gap: 10, maxWidth: 720 }}>
              <h3>{formD.id ? 'Ubah dokumen' : 'Dokumen baru'}</h3>
              <label>Jenis
                <select value={formD.jenis ?? 'kebijakan'} onChange={(e) => setFormD((x) => ({ ...x, jenis: e.target.value }))}>
                  {JENIS_DOKUMEN.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label>Judul<input value={formD.judul ?? ''} onChange={(e) => setFormD((x) => ({ ...x, judul: e.target.value }))} /></label>
              <div className="grid grid-2">
                <label>Nomor<input value={formD.nomor ?? ''} onChange={(e) => setFormD((x) => ({ ...x, nomor: e.target.value }))} /></label>
                <label>Tahun<input type="number" value={formD.tahun ?? ''} onChange={(e) => setFormD((x) => ({ ...x, tahun: e.target.value ? Number(e.target.value) : null }))} /></label>
              </div>
              <label>Tautan berkas<input type="url" value={formD.tautan ?? ''} onChange={(e) => setFormD((x) => ({ ...x, tautan: e.target.value }))} placeholder="https://drive.google.com/..." /></label>
              <label>Catatan<textarea rows={2} value={formD.catatan ?? ''} onChange={(e) => setFormD((x) => ({ ...x, catatan: e.target.value }))} /></label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={formD.diarsipkan ?? false} onChange={(e) => setFormD((x) => ({ ...x, diarsipkan: e.target.checked }))} /> Arsipkan</label>
              <div className="aksi">
                <button className="tombol tombol-isi" disabled={sibuk}>Simpan</button>
                <button type="button" className="tombol" onClick={() => setFormD(null)}>Batal</button>
                {formD.id && bolehKelola && <button type="button" className="tombol" onClick={() => hapus('spmi_dokumen', formD.id!, formD.judul ?? 'dokumen ini')}>Hapus</button>}
              </div>
            </form>
          )}
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table className="tabel">
              <thead><tr><th>Jenis</th><th>Judul</th><th>Nomor</th><th>Tahun</th><th>Berkas</th><th /></tr></thead>
              <tbody>
                {dokTampil.length === 0 && <tr><td colSpan={6} className="catatan">Belum ada dokumen.</td></tr>}
                {dokTampil.map((x) => (
                  <tr key={x.id}>
                    <td>{namaJenis(x.jenis)}</td><td>{x.judul}</td><td>{x.nomor ?? '-'}</td><td>{x.tahun ?? '-'}</td>
                    <td>{x.tautan ? <a href={x.tautan} target="_blank" rel="noreferrer noopener">Buka</a> : '-'}</td>
                    <td>{bolehTulis && <button className="tombol" onClick={() => setFormD(x)}>Ubah</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="catatan jarak">Siklus SPMI: Penetapan (halaman ini), Pelaksanaan, Evaluasi, Pengendalian, Peningkatan. Audit mutu dan tindak lanjut menyusul. <Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

export default function SpmiBeranda() {
  return <GerbangSpmi judul="Penjaminan mutu internal (SPMI)">{(izin) => <Isi izin={izin} />}</GerbangSpmi>
}
