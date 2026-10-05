import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { panggil } from '../../lib/rpc'
import { merah } from '../lmsUtil'
import { bacaSoalXlsx, unduhTemplateSoal } from '../lmsSoalXlsx'
import { useRpc } from './umum'

type Bank = { id: string; mapel: string; tingkat: number | null; judul: string; jumlah_soal: number; milik_saya: boolean; pemilik_nama: string }
type Soal = { id: string; urut: number; tipe: 'pilgan' | 'isian'; pertanyaan: string; opsi: string[]; kunci: string; bobot: number; pembahasan: string | null }
type FormSoal = { id: string | null; tipe: 'pilgan' | 'isian'; pertanyaan: string; opsi: string[]; kunci: string; bobot: number; pembahasan: string }

const huruf = 'ABCDEF'
const SOAL_BARU: FormSoal = { id: null, tipe: 'pilgan', pertanyaan: '', opsi: ['', '', '', ''], kunci: '0', bobot: 1, pembahasan: '' }
const Galat = ({ pesan }: { pesan: string }) => (pesan ? <p className="catatan galat" role="alert">{pesan}</p> : null)

export function BankDaftar() {
  const { data, galat, memuat, muat } = useRpc<Bank[]>('ad_bank_daftar')
  const nav = useNavigate()
  const [f, setF] = useState<{ mapel: string; tingkat: string; judul: string } | null>(null)
  const [pesan, setPesan] = useState('')
  async function buat(e: FormEvent) {
    e.preventDefault(); if (!f) return; setPesan('')
    try {
      const id = await panggil<string>('ad_bank_simpan', { p_id: null, p_mapel: f.mapel, p_tingkat: f.tingkat ? Number(f.tingkat) : null, p_judul: f.judul })
      nav(`/asesmen/bank/${id}`)
    } catch (er) { setPesan((er as Error).message) }
  }
  async function hapus(b: Bank) {
    if (!window.confirm(`Hapus bank soal "${b.judul}" beserta ${b.jumlah_soal} soalnya? Paket ujian yang sudah dirakit tidak terpengaruh.`)) return
    try { await panggil('ad_bank_hapus', { p_id: b.id }); await muat() } catch (er) { setPesan((er as Error).message) }
  }
  return (
    <>
      <h1>Bank soal</h1>
      <p className="lead">Guru mapel menulis soal di sini. Panitia merakitnya menjadi paket ujian.</p>
      <Galat pesan={galat || pesan} />
      <div className="aksi" style={{ marginTop: 0 }}>
        <button className="tombol tombol-isi" onClick={() => setF(f ? null : { mapel: '', tingkat: '', judul: '' })}>{f ? 'Batal' : 'Buat bank soal'}</button>
      </div>
      {f && (
        <form className="kartu form jarak" onSubmit={(e) => void buat(e)}>
          <div className="as-baris">
            <label>Mata pelajaran<input required maxLength={80} value={f.mapel} onChange={(e) => setF({ ...f, mapel: e.target.value })} placeholder="Informatika" /></label>
            <label>Kelas (opsional)
              <select value={f.tingkat} onChange={(e) => setF({ ...f, tingkat: e.target.value })}>
                <option value="">Semua</option><option value="10">X</option><option value="11">XI</option><option value="12">XII</option>
              </select>
            </label>
            <label>Judul<input required maxLength={120} value={f.judul} onChange={(e) => setF({ ...f, judul: e.target.value })} placeholder="Soal sumatif tengah semester ganjil" /></label>
          </div>
          <div className="aksi"><button className="tombol tombol-isi">Buat</button></div>
        </form>
      )}
      {memuat && <p className="catatan">Memuat...</p>}
      <div className="as-kisi jarak">
        {(data ?? []).map((b) => (
          <div key={b.id} className="kartu">
            <span className="lencana">{b.mapel}{b.tingkat ? ` · kelas ${b.tingkat}` : ''}</span>
            <h3 style={{ margin: '4px 0' }}><Link to={`/asesmen/bank/${b.id}`}>{b.judul}</Link></h3>
            <p className="as-kecil" style={{ margin: 0 }}>{b.jumlah_soal} soal · {b.pemilik_nama}</p>
            <div className="aksi" style={{ marginTop: 10 }}>
              <Link className="tombol" to={`/asesmen/bank/${b.id}`}>Buka</Link>
              <button className="tombol" style={merah} onClick={() => void hapus(b)}>Hapus</button>
            </div>
          </div>
        ))}
        {data && data.length === 0 && !f && <p className="catatan">Belum ada bank soal.</p>}
      </div>
    </>
  )
}

export function BankDetail() {
  const { id = '' } = useParams()
  const { data, galat, muat } = useRpc<Soal[]>('ad_soal_daftar', { p_bank: id })
  const { data: banks } = useRpc<Bank[]>('ad_bank_daftar')
  const bank = banks?.find((b) => b.id === id)
  const [f, setF] = useState<FormSoal | null>(null)
  const [pesan, setPesan] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)

  async function simpan(e: FormEvent) {
    e.preventDefault(); if (!f) return; setPesan(''); setSibuk(true)
    try {
      const opsi = f.tipe === 'pilgan' ? f.opsi.filter((o) => o.trim() !== '') : []
      let kunci = f.kunci
      if (f.tipe === 'pilgan') {
        // Indeks kunci dihitung ulang setelah opsi kosong dibuang.
        const asli = f.opsi[Number(f.kunci)] ?? ''
        if (!asli.trim()) throw new Error('Pilihan yang dijadikan kunci masih kosong')
        kunci = String(f.opsi.slice(0, Number(f.kunci)).filter((o) => o.trim() !== '').length)
      }
      await panggil('ad_soal_simpan', { p_bank: id, p_id: f.id, p: { tipe: f.tipe, pertanyaan: f.pertanyaan, opsi, kunci, bobot: f.bobot, pembahasan: f.pembahasan } })
      setF(null); await muat()
    } catch (er) { setPesan((er as Error).message) }
    setSibuk(false)
  }
  async function hapus(sid: string) {
    if (!window.confirm('Hapus soal ini?')) return
    try { await panggil('ad_soal_hapus', { p_id: sid }); await muat() } catch (er) { setPesan((er as Error).message) }
  }
  async function impor(file: File | undefined) {
    if (!file) return
    setPesan(''); setInfo(''); setSibuk(true)
    try {
      const { soal, galat: g } = await bacaSoalXlsx(file)
      const esai = soal.filter((s) => s.tipe === 'esai').length
      const pakai = soal.filter((s) => s.tipe !== 'esai')
      if (g.length > 0) { setPesan(`File belum diimpor. ${g.slice(0, 5).join(' ')}${g.length > 5 ? ` Dan ${g.length - 5} masalah lain.` : ''}`); setSibuk(false); return }
      if (pakai.length === 0) { setPesan('Tidak ada soal pilihan ganda atau isian di file ini.'); setSibuk(false); return }
      const muatan = pakai.map((s) => ({
        tipe: s.tipe, pertanyaan: s.pertanyaan, opsi: s.opsi ?? [], bobot: s.bobot, pembahasan: s.pembahasan,
        kunci: s.tipe === 'pilgan' ? String(s.kunci ?? 0) : (s.kunci_isian ?? []).join('|'),
      }))
      const n = await panggil<number>('ad_soal_impor', { p_bank: id, p: muatan })
      setInfo(`${n} soal diimpor.${esai ? ` ${esai} soal esai dilewati: esai belum didukung di Asesmen Digital.` : ''}`)
      await muat()
    } catch (er) { setPesan((er as Error).message) }
    setSibuk(false)
  }
  function ubah(s: Soal) {
    const opsi = [...s.opsi]; while (opsi.length < 4) opsi.push('')
    setF({ id: s.id, tipe: s.tipe, pertanyaan: s.pertanyaan, opsi, kunci: s.tipe === 'pilgan' ? s.kunci : s.kunci, bobot: Number(s.bobot), pembahasan: s.pembahasan ?? '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <p className="as-kecil"><Link to="/asesmen/bank">Bank soal</Link> / {bank?.judul ?? ''}</p>
      <h1>{bank?.judul ?? 'Bank soal'}</h1>
      <p className="lead">{bank ? `${bank.mapel}${bank.tingkat ? `, kelas ${bank.tingkat}` : ''} · ${data?.length ?? 0} soal` : ''}</p>
      <Galat pesan={galat || pesan} />
      {info && <p className="catatan" role="status">{info}</p>}
      <div className="aksi" style={{ marginTop: 0 }}>
        <button className="tombol tombol-isi" onClick={() => setF({ ...SOAL_BARU })}>Tambah soal</button>
        <label className="tombol" style={{ cursor: 'pointer' }}>
          {sibuk ? 'Memproses...' : 'Impor dari Excel'}
          <input type="file" accept=".xlsx" hidden disabled={sibuk} onChange={(e) => { void impor(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        <button className="tombol" onClick={() => void unduhTemplateSoal()}>Unduh template</button>
      </div>
      <p className="as-kecil">Template Excel sama dengan yang dipakai di ruang belajar. Soal esai dilewati.</p>

      {f && (
        <form className="kartu form jarak" onSubmit={(e) => void simpan(e)}>
          <h3 style={{ marginTop: 0 }}>{f.id ? 'Ubah soal' : 'Soal baru'}</h3>
          <div className="as-baris">
            <label>Jenis
              <select value={f.tipe} onChange={(e) => setF({ ...f, tipe: e.target.value as 'pilgan' | 'isian', kunci: e.target.value === 'pilgan' ? '0' : '' })}>
                <option value="pilgan">Pilihan ganda</option><option value="isian">Isian singkat</option>
              </select>
            </label>
            <label>Bobot<input type="number" min={1} max={100} required value={f.bobot} onChange={(e) => setF({ ...f, bobot: Number(e.target.value) })} /></label>
          </div>
          <label>Pertanyaan<textarea required rows={4} maxLength={3000} value={f.pertanyaan} onChange={(e) => setF({ ...f, pertanyaan: e.target.value })} /></label>
          {f.tipe === 'pilgan' ? (
            <fieldset style={{ border: '1px solid var(--garis)', borderRadius: 8 }}>
              <legend>Pilihan (pilih bulatan pada kunci jawaban)</legend>
              {f.opsi.map((o, i) => (
                <div key={i} className="as-baris" style={{ alignItems: 'center', flexWrap: 'nowrap', marginBottom: 6 }}>
                  <input type="radio" name="kunci" style={{ width: 'auto' }} checked={f.kunci === String(i)} onChange={() => setF({ ...f, kunci: String(i) })} aria-label={`Kunci ${huruf[i]}`} />
                  <strong>{huruf[i]}</strong>
                  <input style={{ flex: 1 }} maxLength={500} value={o} onChange={(e) => setF({ ...f, opsi: f.opsi.map((x, j) => (j === i ? e.target.value : x)) })} placeholder={`Pilihan ${huruf[i]}`} />
                </div>
              ))}
              {f.opsi.length < 6 && <button type="button" className="tombol" onClick={() => setF({ ...f, opsi: [...f.opsi, ''] })}>Tambah pilihan</button>}
            </fieldset>
          ) : (
            <label>Jawaban yang diterima (pisahkan dengan tanda | bila lebih dari satu)
              <input required maxLength={300} value={f.kunci} onChange={(e) => setF({ ...f, kunci: e.target.value })} placeholder="Central Processing Unit|CPU" />
            </label>
          )}
          <label>Pembahasan (opsional)<textarea rows={2} maxLength={2000} value={f.pembahasan} onChange={(e) => setF({ ...f, pembahasan: e.target.value })} /></label>
          <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk}>Simpan soal</button><button type="button" className="tombol" onClick={() => setF(null)}>Batal</button></div>
        </form>
      )}

      <div className="jarak">
        {(data ?? []).map((s, n) => (
          <div key={s.id} className="as-soal-kartu">
            <div className="as-baris" style={{ alignItems: 'start' }}>
              <div style={{ flex: '1 1 300px' }}>
                <strong>{n + 1}.</strong> {s.pertanyaan}
                {s.tipe === 'pilgan'
                  ? <ol type="A">{s.opsi.map((o, i) => <li key={i} className={String(i) === s.kunci ? 'kunci' : ''}>{o}</li>)}</ol>
                  : <p className="as-kecil" style={{ margin: '4px 0 0' }}>Kunci: {s.kunci.split('|').join(' atau ')}</p>}
              </div>
              <div style={{ whiteSpace: 'nowrap' }}>
                <span className="as-kecil">Bobot {s.bobot}</span>{' '}
                <button className="tombol" onClick={() => ubah(s)}>Ubah</button>{' '}
                <button className="tombol" style={merah} onClick={() => void hapus(s.id)}>Hapus</button>
              </div>
            </div>
          </div>
        ))}
        {data && data.length === 0 && <p className="catatan">Bank soal masih kosong.</p>}
      </div>
    </>
  )
}
