// Kelola prestasi yang tampil di situs publik. Terpisah dari catatan prestasi siswa agar nama siswa tidak bocor tanpa persetujuan.
import TombolIkon from '../../components/TombolIkon'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { panggil } from '../../lib/rpc'
import { BIDANG, TINGKAT, namaBidang, namaTingkat, type PrestasiCalon, type PrestasiKelola } from '../../lib/sekolahPublik'
import Gerbang from './Gerbang'

function Isi() {
  const [daftar, setDaftar] = useState<PrestasiKelola[]>([])
  const [calon, setCalon] = useState<PrestasiCalon[]>([])
  const [sunting, setSunting] = useState<PrestasiKelola | 'baru' | null>(null)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)

  const muat = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([panggil<PrestasiKelola[]>('prestasi_publik_kelola'), panggil<PrestasiCalon[]>('prestasi_publik_calon')])
      setDaftar(d ?? []); setCalon(c ?? []); setGalat('')
    } catch (e) { setGalat((e as Error).message) }
  }, [])
  useEffect(() => { void muat() }, [muat])

  async function jalan(fn: () => Promise<unknown>, pesan: string) {
    setSibuk(true); setGalat(''); setInfo('')
    try { await fn(); setInfo(pesan); await muat() } catch (e) { setGalat((e as Error).message) } finally { setSibuk(false) }
  }

  const simpan = (p: PrestasiKelola | null, f: FormData) => {
    const t = (k: string) => String(f.get(k) ?? '').trim() || null
    const thn = t('tahun')
    return jalan(async () => {
      await panggil('prestasi_publik_simpan', {
        p_id: p?.id ?? null, p_judul: t('judul'), p_kategori: t('kategori'), p_bidang: t('bidang'), p_tingkat: t('tingkat'),
        p_peringkat: t('peringkat'), p_penyelenggara: t('penyelenggara'), p_tahun: thn ? Number(thn) : null,
        p_nama_tampil: t('nama_tampil'), p_deskripsi: t('deskripsi'), p_tampil: f.get('tampil') === 'on',
      })
      setSunting(null)
    }, 'Tersimpan.')
  }

  return (
    <Halaman judul="Prestasi di situs publik" lead="Pilih prestasi yang ditampilkan di halaman Prestasi situs sekolah. Nama siswa hanya tampil bila diisi di sini.">
      <p><Link to="/portal/kesiswaan">Kembali ke Kesiswaan</Link></p>
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}

      {calon.length > 0 && (
        <div className="kartu jarak">
          <h3 style={{ marginTop: 0 }}>Prestasi terverifikasi yang belum diterbitkan ({calon.length})</h3>
          <p className="catatan">Menerbitkan menyalin judul, bidang, tingkat, peringkat, dan tahun. Nama siswa tidak ikut disalin.</p>
          <ul>
            {calon.map((c) => (
              <li key={c.id} style={{ marginBottom: 8 }}>
                {c.nama_prestasi}{c.peringkat ? `, ${c.peringkat}` : ''} <small className="catatan">({[namaTingkat(c.tingkat), c.tanggal?.slice(0, 4)].filter(Boolean).join(', ')}{c.siswa ? ` · ${c.siswa}` : ''})</small>{' '}
                <TombolIkon ikon="kirim" label="Terbitkan" disabled={sibuk} onClick={() => void jalan(() => panggil('prestasi_publik_terbitkan', { p_prestasi: c.id }), 'Diterbitkan. Periksa dan lengkapi di daftar bawah.')} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="aksi"><button className="tombol tombol-isi" onClick={() => setSunting('baru')}>Tambah prestasi</button></div>

      {sunting && (
        <form key={sunting === 'baru' ? 'baru' : sunting.id} className="kartu form jarak" style={{ maxWidth: 600 }} onSubmit={(ev) => { ev.preventDefault(); void simpan(sunting === 'baru' ? null : sunting, new FormData(ev.currentTarget)) }}>
          <h3>{sunting === 'baru' ? 'Prestasi baru' : 'Ubah prestasi'}</h3>
          {(() => {
            const p = sunting === 'baru' ? null : sunting
            return (
              <>
                <label>Judul<input name="judul" defaultValue={p?.judul ?? ''} minLength={3} maxLength={200} required /></label>
                <label>Kategori<select name="kategori" defaultValue={p?.kategori ?? 'siswa'}><option value="siswa">Siswa</option><option value="gtk">Guru dan tenaga kependidikan</option></select></label>
                <label>Bidang<select name="bidang" defaultValue={p?.bidang ?? ''}><option value="">-</option>{BIDANG.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
                <label>Tingkat<select name="tingkat" defaultValue={p?.tingkat ?? 'sekolah'} required>{TINGKAT.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
                <label>Peringkat<input name="peringkat" defaultValue={p?.peringkat ?? ''} maxLength={100} placeholder="Juara 1, Medali emas, Finalis" /></label>
                <label>Penyelenggara<input name="penyelenggara" defaultValue={p?.penyelenggara ?? ''} maxLength={200} /></label>
                <label>Tahun<input name="tahun" type="number" min={1990} max={2100} defaultValue={p?.tahun ?? new Date().getFullYear()} /></label>
                <label>Nama yang ditampilkan (isi hanya bila ada persetujuan)<input name="nama_tampil" defaultValue={p?.nama_tampil ?? ''} maxLength={200} /></label>
                <label>Keterangan<textarea name="deskripsi" rows={2} maxLength={500} defaultValue={p?.deskripsi ?? ''} /></label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input name="tampil" type="checkbox" defaultChecked={p?.tampil ?? true} style={{ width: 'auto' }} />Tampilkan di situs publik</label>
              </>
            )
          })()}
          <div className="aksi" style={{ marginTop: 0 }}><button className="tombol tombol-isi" disabled={sibuk}>Simpan</button><button type="button" className="tombol" onClick={() => setSunting(null)}>Batal</button></div>
        </form>
      )}

      <div className="jarak">
        <h2>Daftar ({daftar.length})</h2>
        {daftar.length === 0 ? <p className="catatan">Belum ada.</p> : (
          <div className="tabel-gulir">
            <table>
              <thead><tr><th>Judul</th><th>Bidang</th><th>Tingkat</th><th>Tahun</th><th>Status</th><th /></tr></thead>
              <tbody>
                {daftar.map((p) => (
                  <tr key={p.id}>
                    <td>{p.judul}{p.peringkat ? <small className="catatan"> · {p.peringkat}</small> : null}</td>
                    <td>{namaBidang(p.bidang)}</td><td>{namaTingkat(p.tingkat)}</td><td>{p.tahun ?? '-'}</td>
                    <td>{p.tampil ? 'Tampil' : 'Disembunyikan'}</td>
                    <td>
                      <TombolIkon ikon="pena" label="Ubah" onClick={() => setSunting(p)} />{' '}
                      <TombolIkon ikon="sampah" label="Hapus" varian="bahaya" disabled={sibuk} onClick={() => { if (window.confirm(`Hapus "${p.judul}" dari daftar?`)) void jalan(() => panggil('prestasi_publik_hapus', { p_id: p.id }), 'Dihapus.') }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Halaman>
  )
}

export default function PrestasiPublik() {
  return <Gerbang perlu={['kesiswaan.verifikasi']} judul="Prestasi di situs publik">{() => <Isi />}</Gerbang>
}
