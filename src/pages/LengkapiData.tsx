// Melengkapi kolom profil yang masih kosong. Hanya kolom kosong yang tampil; isian langsung masuk SIMS
// dan dicatat di antrean operator Dapodik. Kolom yang sudah terisi diperbaiki lewat ajuan perbaikan.
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import TombolIkon from '../components/TombolIkon'
import { supabase } from '../lib/supabase'
import { panggil } from '../lib/rpc'

type Kolom = {
  jenis: string; kunci: string; tabel: string; kolom: string; hubungan: string | null; label: string; kelompok: string
  tipe: 'teks' | 'angka' | 'tanggal' | 'pilihan'; pilihan: string[] | null; terapkan: boolean; urutan: number
}
type Profil = { data: Record<string, unknown>; sensitif: Record<string, unknown>; orang_tua?: Record<string, unknown>[] }

const kosong = (x: unknown) => x === null || x === undefined || String(x).trim() === '' || String(x).trim() === '-'

export default function LengkapiData() {
  const { jenis, id } = useParams()
  const nav = useNavigate()
  const valid = (jenis === 'ptk' || jenis === 'siswa') && !!id
  const [kolom, setKolom] = useState<Kolom[]>([])
  const [nilai, setNilai] = useState<Record<string, string>>({})
  const [nama, setNama] = useState('')
  const [totalKolom, setTotalKolom] = useState(0)
  const [galat, setGalat] = useState('')
  const [memuat, setMemuat] = useState(true)
  const [sibuk, setSibuk] = useState(false)

  useEffect(() => {
    if (!valid) return
    let batal = false
    Promise.all([
      supabase.from('kolom_ajuan').select('*').eq('jenis', jenis).eq('terapkan', true).order('urutan'),
      supabase.rpc('profil_dapodik', { p_jenis: jenis, p_id: id }),
    ]).then(([k, p]) => {
      if (batal) return
      if (k.error || p.error || !p.data) {
        setGalat(k.error?.message ?? p.error?.message ?? 'Profil tidak ditemukan, atau Anda tidak berhak melengkapinya.')
        setMemuat(false)
        return
      }
      const h = p.data as Profil
      const semua = (k.data as Kolom[]) ?? []
      // Sensitif disamarkan untuk orang tua, tetapi kolom kosong tetap terbaca kosong (null).
      const nilaiAsal = (c: Kolom): unknown =>
        c.tabel === 'ptk' || c.tabel === 'peserta_didik' ? h.data[c.kolom]
          : c.tabel.endsWith('_sensitif') ? h.sensitif[c.kolom]
            : (h.orang_tua ?? []).find((o) => o.hubungan === c.hubungan)?.[c.kolom]
      setKolom(semua.filter((c) => kosong(nilaiAsal(c))))
      setTotalKolom(semua.length)
      setNama(String(h.data.nama ?? ''))
      setMemuat(false)
    })
    return () => { batal = true }
  }, [valid, jenis, id])

  const grup = useMemo(() => {
    const m = new Map<string, Kolom[]>()
    for (const c of kolom) m.set(c.kelompok, [...(m.get(c.kelompok) ?? []), c])
    return [...m.entries()]
  }, [kolom])
  const terisi = kolom.filter((c) => (nilai[c.kunci] ?? '').trim() !== '')

  async function kirim(e: FormEvent) {
    e.preventDefault()
    setGalat('')
    if (terisi.length === 0) { setGalat('Belum ada kolom yang diisi.'); return }
    setSibuk(true)
    try {
      await panggil('isi_data_kosong', { p_jenis: jenis, p_subjek: id, p_isian: terisi.map((c) => ({ kunci: c.kunci, nilai: nilai[c.kunci].trim() })) })
      nav(-1)
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }

  if (!valid) return <Halaman judul="Lengkapi data"><p className="catatan">Alamat tidak valid.</p></Halaman>
  return (
    <Halaman judul="Lengkapi data" lead={nama ? `Untuk ${nama}. Hanya kolom yang masih kosong yang tampil.` : undefined}>
      {memuat && <p className="catatan">Memuat formulir...</p>}
      {!memuat && kolom.length === 0 && !galat && (
        <p className="catatan">Semua {totalKolom} kolom isian sudah terisi. Bagian riwayat (anak, diklat, prestasi, dan lainnya) dilengkapi di halaman profil. <Link to={`/portal/ajuan/baru/${jenis}/${id}`}>Ajukan perbaikan</Link> bila ada data yang keliru.</p>
      )}
      {!memuat && kolom.length > 0 && (
        <form onSubmit={kirim}>
          <p className="catatan">
            Isi yang Anda ketahui dan pastikan sesuai dokumen (KK, akta, SK, ijazah). Isian langsung tersimpan di SIMS dan diteruskan ke operator Dapodik untuk diinput ke Dapodik. Kolom yang dibiarkan kosong tidak diubah.
          </p>
          <div className="grid grid-2 jarak">
            {grup.map(([judul, daftar]) => (
              <section key={judul} className="kartu form bagian-profil">
                <h3>{judul}</h3>
                {daftar.map((c) => (
                  <label key={c.kunci} className={(nilai[c.kunci] ?? '').trim() ? 'diubah' : undefined}>
                    <span>{c.label}</span>
                    {c.tipe === 'pilihan' ? (
                      <select value={nilai[c.kunci] ?? ''} onChange={(e) => setNilai({ ...nilai, [c.kunci]: e.target.value })}>
                        <option value="">(kosongkan)</option>
                        {(c.pilihan ?? []).map((o) => <option key={o} value={o}>{c.kunci === 'jk' ? (o === 'L' ? 'Laki-laki' : 'Perempuan') : o}</option>)}
                      </select>
                    ) : (
                      <input
                        type={c.tipe === 'tanggal' ? 'date' : c.tipe === 'angka' ? 'number' : 'text'}
                        step={c.tipe === 'angka' ? 'any' : undefined} min={c.tipe === 'angka' ? 0 : undefined}
                        maxLength={c.tipe === 'teks' ? 200 : undefined} autoComplete="off"
                        value={nilai[c.kunci] ?? ''} onChange={(e) => setNilai({ ...nilai, [c.kunci]: e.target.value })}
                      />
                    )}
                  </label>
                ))}
              </section>
            ))}
          </div>
          <section className="kartu form jarak">
            <div aria-live="polite">{galat && <p className="catatan galat" role="alert">{galat}</p>}</div>
            <div className="aksi">
              <button className="tombol tombol-isi" disabled={sibuk || terisi.length === 0}>{sibuk ? 'Menyimpan...' : `Simpan${terisi.length ? ` (${terisi.length} kolom)` : ''}`}</button>
              <TombolIkon ikon="tutup" label="Batal" onClick={() => nav(-1)} />
            </div>
          </section>
        </form>
      )}
      {!memuat && kolom.length === 0 && galat && <p className="catatan galat" role="alert">{galat}</p>}
    </Halaman>
  )
}
