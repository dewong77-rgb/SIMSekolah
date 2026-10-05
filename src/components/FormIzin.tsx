import { useState } from 'react'
import { panggil } from '../lib/rpc'
import { JENIS_IZIN, hariIni, tambahHari } from '../lib/kesiswaan'

/** Form izin: dipakai siswa, orang tua (siswa tetap), dan petugas (siswa dipilih di luar form). Petugas langsung disetujui oleh basis data. */
export default function FormIzin({ pd, namaSiswa, mundur = 14, sesudah, tutup }: { pd: string | null; namaSiswa?: string; mundur?: number; sesudah: (pesan: string) => void; tutup?: () => void }) {
  const [d, setD] = useState({ jenis: 'sakit', mulai: hariIni(), selesai: hariIni(), alasan: '', keluar: '', kembali: '', lampiran: '' })
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const set = (k: keyof typeof d) => (e: { target: { value: string } }) => setD((x) => ({ ...x, [k]: e.target.value }))
  const keluarSekolah = d.jenis === 'izin_keluar'

  async function kirim(e: React.FormEvent) {
    e.preventDefault()
    if (!pd) { setGalat('Pilih siswa terlebih dahulu.'); return }
    setSibuk(true); setGalat('')
    try {
      await panggil('izin_ajukan', {
        p_pd: pd, p_jenis: d.jenis, p_mulai: d.mulai, p_selesai: keluarSekolah ? d.mulai : d.selesai, p_alasan: d.alasan.trim(),
        p_jam_keluar: keluarSekolah ? d.keluar || null : null, p_jam_kembali: keluarSekolah ? d.kembali || null : null, p_lampiran_url: d.lampiran.trim() || null,
      })
      sesudah(`Izin ${namaSiswa ?? ''} tercatat.`.replace('  ', ' '))
      setD((x) => ({ ...x, alasan: '', lampiran: '', keluar: '', kembali: '' }))
    } catch (x) { setGalat((x as Error).message) } finally { setSibuk(false) }
  }

  return (
    <form className="kartu form" style={{ maxWidth: 640 }} onSubmit={kirim}>
      <h3>Ajukan izin{namaSiswa ? ` untuk ${namaSiswa}` : ''}</h3>
      <label>Jenis
        <select value={d.jenis} onChange={set('jenis')}>{JENIS_IZIN.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
      </label>
      <div className="grid grid-2">
        <label>{keluarSekolah ? 'Tanggal' : 'Mulai'}<input type="date" value={d.mulai} min={tambahHari(hariIni(), -mundur)} onChange={(e) => setD((x) => ({ ...x, mulai: e.target.value, selesai: x.selesai < e.target.value ? e.target.value : x.selesai }))} required /></label>
        {!keluarSekolah && <label>Selesai<input type="date" value={d.selesai} min={d.mulai} onChange={set('selesai')} required /></label>}
        {keluarSekolah && <label>Jam keluar<input type="time" value={d.keluar} onChange={set('keluar')} required /></label>}
        {keluarSekolah && <label>Perkiraan kembali (boleh kosong)<input type="time" value={d.kembali} onChange={set('kembali')} /></label>}
      </div>
      <label>Alasan<textarea rows={3} minLength={3} maxLength={500} value={d.alasan} onChange={set('alasan')} required /></label>
      <label>Tautan surat atau bukti (boleh kosong, harus https)<input type="url" value={d.lampiran} onChange={set('lampiran')} placeholder="https://" /></label>
      {galat && <p className="galat" role="alert">{galat}</p>}
      <div className="aksi" style={{ marginTop: 0 }}>
        <button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Mengirim...' : 'Kirim'}</button>
        {tutup && <button type="button" className="tombol" onClick={tutup}>Tutup</button>}
      </div>
    </form>
  )
}
