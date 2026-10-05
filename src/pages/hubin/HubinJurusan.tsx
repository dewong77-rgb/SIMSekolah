// Profil jurusan (Waka Hubinmas): teks yang tampil di halaman Jurusan situs publik.
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import Gerbang from './Gerbang'

type J = {
  id: string; kode: string; nama: string; bidang: string | null; program: string | null; ringkas: string | null; deskripsi: string | null
  kompetensi_lulusan: string | null; mapel_kejuruan: string | null; fasilitas: string | null; prospek: string[]; kepala_program: string | null
  tampil: boolean; urutan: number
}
const TEKS = ['nama', 'bidang', 'program', 'ringkas', 'deskripsi', 'kompetensi_lulusan', 'mapel_kejuruan', 'fasilitas', 'kepala_program'] as const

type PK = { f: Record<string, string>; u: (k: string, v: string) => void; k: string; label: string; kecil?: string; baris?: number }
function Kol({ f, u, k, label, kecil, baris }: PK) {
  return (
    <label>{label}
      {baris ? <textarea rows={baris} value={f[k] ?? ''} onChange={(e) => u(k, e.target.value)} /> : <input value={f[k] ?? ''} onChange={(e) => u(k, e.target.value)} />}
      {kecil && <small className="catatan">{kecil}</small>}
    </label>
  )
}

function Isi() {
  const { profil } = useAuth()
  const npsn = profil?.npsn ?? ''
  const [daftar, setDaftar] = useState<J[]>([])
  const [pilih, setPilih] = useState<string | null>(null)
  const [f, setF] = useState<Record<string, string>>({})
  const [prospek, setProspek] = useState('')
  const [tampil, setTampil] = useState(true)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)

  const baca = useCallback(async () => {
    const { data, error } = await supabase.from('jurusan_profil').select('*').order('urutan').order('nama')
    if (error) return setGalat(error.message)
    setDaftar((data ?? []) as J[])
  }, [])
  useEffect(() => { void baca() }, [baca])

  function buka(j: J | null) {
    setInfo(''); setGalat('')
    setPilih(j ? j.id : 'baru')
    const a: Record<string, string> = { kode: j?.kode ?? '', urutan: String(j?.urutan ?? 100) }
    for (const k of TEKS) a[k] = (j?.[k] as string | null) ?? ''
    setF(a); setProspek((j?.prospek ?? []).join('\n')); setTampil(j?.tampil ?? true)
  }

  async function simpan(e: FormEvent) {
    e.preventDefault(); setGalat(''); setInfo('')
    const kode = (f.kode ?? '').trim().toUpperCase()
    if (!/^[A-Z0-9]{2,8}$/.test(kode)) return setGalat('Kode singkat 2 sampai 8 huruf atau angka, sama dengan penanda di nama rombel (contoh: TJKT untuk "X TJKT 1").')
    const baris: Record<string, unknown> = { npsn, kode, tampil, urutan: Number(f.urutan) || 100, prospek: prospek.split('\n').map((x) => x.trim()).filter(Boolean) }
    for (const k of TEKS) baris[k] = (f[k] ?? '').trim() || null
    if (!baris.nama) return setGalat('Nama kompetensi keahlian wajib diisi.')
    setSibuk(true)
    const { error } = await supabase.from('jurusan_profil').upsert(baris, { onConflict: 'npsn,kode' })
    setSibuk(false)
    if (error) return setGalat(error.code === '23514' ? 'Ada isian yang melebihi batas panjang.' : error.message)
    setInfo('Tersimpan. Halaman Jurusan di situs publik sudah memakai teks ini.')
    setPilih(null); void baca()
  }

  const u = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }))
  return (
    <Halaman judul="Profil jurusan" lead="Deskripsi, kompetensi lulusan, fasilitas, dan prospek karier tiap kompetensi keahlian. Tampil di halaman Jurusan situs publik.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}
      {!pilih && (
        <>
          <p className="catatan">Teks awal berasal dari tulisan lama di situs dan belum ditinjau. Mohon dilengkapi dan disetujui Waka Hubinmas.</p>
          <div className="grid grid-3">
            {daftar.map((j) => (
              <article key={j.id} className="kartu">
                <small>{j.kode}{!j.tampil && ' · disembunyikan'}</small>
                <h3>{j.nama}</h3>
                <p className="catatan">{j.deskripsi ? 'Deskripsi sudah diisi.' : 'Deskripsi lengkap belum diisi.'}</p>
                <button className="tombol tombol-isi" onClick={() => buka(j)}>Ubah</button>
              </article>
            ))}
          </div>
          <div className="aksi"><button className="tombol" onClick={() => buka(null)}>Tambah kompetensi keahlian</button><Link to="/jurusan" target="_blank">Lihat halaman Jurusan</Link></div>
        </>
      )}
      {pilih && (
        <form className="form kartu" onSubmit={simpan} style={{ display: 'grid', gap: 12, maxWidth: 760 }}>
          <div className="grid grid-2">
            <Kol f={f} u={u} k="kode" label="Kode singkat" kecil="Sama dengan penanda di nama rombel Dapodik, dipakai menghitung jumlah siswa aktif." />
            <Kol f={f} u={u} k="urutan" label="Urutan tampil" />
          </div>
          <Kol f={f} u={u} k="nama" label="Kompetensi keahlian" />
          <div className="grid grid-2"><Kol f={f} u={u} k="bidang" label="Bidang keahlian" /><Kol f={f} u={u} k="program" label="Program keahlian" /></div>
          <Kol f={f} u={u} k="ringkas" label="Ringkasan" baris={2} kecil="Maksimal 300 huruf. Tampil di kartu beranda." />
          <Kol f={f} u={u} k="deskripsi" label="Deskripsi" baris={5} />
          <Kol f={f} u={u} k="kompetensi_lulusan" label="Kompetensi lulusan" baris={4} kecil="Satu kompetensi per baris." />
          <Kol f={f} u={u} k="mapel_kejuruan" label="Mata pelajaran kejuruan" baris={3} />
          <Kol f={f} u={u} k="fasilitas" label="Fasilitas dan bengkel" baris={3} />
          <label>Prospek karier
            <textarea rows={4} value={prospek} onChange={(e) => setProspek(e.target.value)} />
            <small className="catatan">Satu prospek per baris.</small>
          </label>
          <Kol f={f} u={u} k="kepala_program" label="Kepala program keahlian" />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={tampil} onChange={(e) => setTampil(e.target.checked)} /> Tampilkan di situs publik</label>
          <div className="aksi">
            <button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
            <button type="button" className="tombol" onClick={() => setPilih(null)}>Batal</button>
          </div>
        </form>
      )}
      <p><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

export default function HubinJurusan() {
  return <Gerbang perlu={['hubin.kelola_profil']} judul="Profil jurusan">{() => <Isi />}</Gerbang>
}
