// Kelola kalender sekolah di portal. Kategori yang boleh diubah mengikuti jabatan (server memeriksa ulang setiap simpan).
import TombolIkon from '../components/TombolIkon'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { supabase } from '../lib/supabase'
import { type Agenda, type Kategori, KATEGORI, URUT_KATEGORI, jamTitik, muatAgenda, tanggalPendek, wib } from '../lib/kalender'

type Isi = { judul: string; kategori: Kategori; mulai: string; selesai: string; jam_mulai: string; jam_selesai: string; tempat: string; keterangan: string; tampil_beranda: boolean }
const KOSONG = (k: Kategori): Isi => ({ judul: '', kategori: k, mulai: '', selesai: '', jam_mulai: '', jam_selesai: '', tempat: '', keterangan: '', tampil_beranda: false })

export default function KelolaKalender() {
  const hari = wib().tanggal
  const [tahun, setTahun] = useState(Number(hari.slice(0, 4)))
  const [boleh, setBoleh] = useState<Kategori[] | null>(null)
  const [daftar, setDaftar] = useState<Agenda[] | null>(null)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [form, setForm] = useState<{ id: string | null; isi: Isi } | null>(null)
  const [saring, setSaring] = useState<'semua' | Kategori>('semua')
  const [cari, setCari] = useState('')

  const muat = useCallback(async () => {
    try { setDaftar(await muatAgenda(`${tahun}-01-01`, `${tahun}-12-31`)) } catch (e) { setGalat((e as Error).message) }
  }, [tahun])
  useEffect(() => { void muat() }, [muat])
  useEffect(() => {
    void Promise.resolve(supabase.rpc('kalender_boleh')).then(({ data }) => setBoleh(Array.isArray(data) ? (data as Kategori[]) : []))
  }, [])

  const tampil = useMemo(() => {
    const k = cari.trim().toLowerCase()
    return (daftar ?? []).filter((a) => (saring === 'semua' || a.kategori === saring) && (!k || a.judul.toLowerCase().includes(k) || (a.tempat ?? '').toLowerCase().includes(k)))
  }, [daftar, saring, cari])

  const ubah = (k: keyof Isi, v: string | boolean) => setForm((f) => (f ? { ...f, isi: { ...f.isi, [k]: v } } : f))

  async function simpan(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    const i = form.isi
    setGalat(''); setInfo('')
    if (i.judul.trim().length < 3) return setGalat('Judul minimal 3 huruf.')
    if (!i.mulai) return setGalat('Tanggal mulai wajib diisi.')
    if (i.selesai && i.selesai < i.mulai) return setGalat('Tanggal selesai tidak boleh sebelum tanggal mulai.')
    if (i.jam_selesai && !i.jam_mulai) return setGalat('Isi jam mulai bila jam selesai diisi.')
    if (i.jam_mulai && i.jam_selesai && (i.selesai || i.mulai) === i.mulai && i.jam_selesai < i.jam_mulai) return setGalat('Jam selesai tidak boleh sebelum jam mulai.')
    setSibuk(true)
    const { error } = await supabase.rpc('kalender_simpan', { p_id: form.id, p_data: { ...i, selesai: i.selesai || i.mulai } })
    setSibuk(false)
    if (error) return setGalat(error.message)
    setInfo(form.id ? 'Agenda diperbarui.' : 'Agenda ditambahkan. Langsung tampil di kalender publik.')
    setForm(null)
    await muat()
  }

  async function hapus(a: Agenda) {
    if (!window.confirm(`Hapus agenda "${a.judul}"?`)) return
    setSibuk(true); setGalat(''); setInfo('')
    const { error } = await supabase.rpc('kalender_hapus', { p_id: a.id })
    setSibuk(false)
    if (error) return setGalat(error.message)
    setInfo('Agenda dihapus.')
    await muat()
  }

  const bolehKategori = URUT_KATEGORI.filter((k) => boleh?.includes(k))
  const bisa = (k: Kategori) => !!boleh?.includes(k)

  return (
    <Halaman judul="Kalender sekolah" lead="Kalender pendidikan dan kegiatan sekolah. Semua agenda tampil di halaman publik dan di langganan kalender.">
      {galat && <p className="kartu" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}
      {boleh && bolehKategori.length === 0 && <p className="kartu">Anda belum memiliki penugasan yang boleh mengisi kalender. Hubungi admin sekolah.</p>}

      <div className="aksi" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {bolehKategori.length > 0 && (
          <button type="button" className="tombol tombol-isi" disabled={sibuk} onClick={() => setForm({ id: null, isi: KOSONG(bolehKategori.includes('kegiatan') ? 'kegiatan' : bolehKategori[0]) })}>Tambah agenda</button>
        )}
        <select value={tahun} onChange={(e) => setTahun(Number(e.target.value))} aria-label="Tahun">
          {[tahun - 1, tahun, tahun + 1].filter((v, i, a) => a.indexOf(v) === i).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={saring} onChange={(e) => setSaring(e.target.value as 'semua' | Kategori)} aria-label="Kategori">
          <option value="semua">Semua kategori</option>
          {URUT_KATEGORI.map((k) => <option key={k} value={k}>{KATEGORI[k].label}</option>)}
        </select>
        <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari judul atau tempat" aria-label="Cari agenda" />
        <Link to="/akademik">Lihat tampilan publik</Link>
      </div>

      {form && (
        <form className="kartu form jarak" onSubmit={simpan} style={{ maxWidth: 640 }}>
          <h3>{form.id ? 'Ubah agenda' : 'Agenda baru'}</h3>
          <label>Judul<input value={form.isi.judul} maxLength={150} onChange={(e) => ubah('judul', e.target.value)} placeholder="Contoh: Lomba Kompetensi Siswa tingkat sekolah" /></label>
          <label>Kategori
            <select value={form.isi.kategori} onChange={(e) => ubah('kategori', e.target.value)}>
              {bolehKategori.map((k) => <option key={k} value={k}>{KATEGORI[k].label}</option>)}
            </select>
          </label>
          <div className="grid grid-2">
            <label>Tanggal mulai<input type="date" value={form.isi.mulai} onChange={(e) => ubah('mulai', e.target.value)} /></label>
            <label>Tanggal selesai<input type="date" value={form.isi.selesai} min={form.isi.mulai || undefined} onChange={(e) => ubah('selesai', e.target.value)} /><small className="catatan">Kosongkan bila satu hari.</small></label>
          </div>
          <div className="grid grid-2">
            <label>Jam mulai<input type="time" value={form.isi.jam_mulai} onChange={(e) => ubah('jam_mulai', e.target.value)} /></label>
            <label>Jam selesai<input type="time" value={form.isi.jam_selesai} onChange={(e) => ubah('jam_selesai', e.target.value)} /></label>
          </div>
          <label>Tempat<input value={form.isi.tempat} maxLength={150} onChange={(e) => ubah('tempat', e.target.value)} placeholder="Contoh: Aula sekolah" /></label>
          <label>Keterangan<textarea rows={3} value={form.isi.keterangan} maxLength={2000} onChange={(e) => ubah('keterangan', e.target.value)} /></label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={form.isi.tampil_beranda} onChange={(e) => ubah('tampil_beranda', e.target.checked)} /> Tampilkan di beranda sebagai agenda terdekat</label>
          <div className="aksi">
            <button className="tombol tombol-isi" type="submit" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan agenda'}</button>
            <TombolIkon ikon="tutup" label="Batal" onClick={() => setForm(null)} />
          </div>
        </form>
      )}

      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Tanggal</th><th>Agenda</th><th>Kategori</th><th>Waktu dan tempat</th><th>Aksi</th></tr></thead>
          <tbody>
            {daftar === null && <tr><td colSpan={5}>Memuat...</td></tr>}
            {daftar && tampil.length === 0 && <tr><td colSpan={5}>Belum ada agenda pada {tahun}.</td></tr>}
            {tampil.map((a) => (
              <tr key={a.id}>
                <td>{tanggalPendek(a.mulai)}{a.selesai !== a.mulai ? <><br /><small>sampai {tanggalPendek(a.selesai)}</small></> : null}</td>
                <td>{a.judul}{a.tampil_beranda && <><br /><small>Tampil di beranda</small></>}</td>
                <td><span className="lencana" style={{ background: KATEGORI[a.kategori].warna, color: '#fff' }}>{KATEGORI[a.kategori].label}</span></td>
                <td>{a.jam_mulai ? `${jamTitik(a.jam_mulai)}${a.jam_selesai ? ` sampai ${jamTitik(a.jam_selesai)}` : ''}` : 'Seharian'}{a.tempat ? <><br /><small>{a.tempat}</small></> : null}</td>
                <td>
                  {bisa(a.kategori) ? (
                    <>
                      <button className="tombol" style={{ padding: '4px 10px' }} disabled={sibuk} onClick={() => { setInfo(''); setGalat(''); setForm({ id: a.id, isi: { judul: a.judul, kategori: a.kategori, mulai: a.mulai, selesai: a.selesai === a.mulai ? '' : a.selesai, jam_mulai: a.jam_mulai ?? '', jam_selesai: a.jam_selesai ?? '', tempat: a.tempat ?? '', keterangan: a.keterangan ?? '', tampil_beranda: a.tampil_beranda } }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Ubah</button>{' '}
                      <button className="tombol" style={{ padding: '4px 10px', color: '#a11' }} disabled={sibuk} onClick={() => hapus(a)}>Hapus</button>
                    </>
                  ) : <small className="catatan">Hanya dilihat</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="catatan">Terdapat {daftar?.length ?? 0} agenda pada {tahun}. Hari ini {tanggalPendek(hari)}.</p>
    </Halaman>
  )
}
