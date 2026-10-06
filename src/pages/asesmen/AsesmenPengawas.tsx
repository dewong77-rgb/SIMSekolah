import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { panggil } from '../../lib/rpc'
import { merah, nilaiTeks } from '../lmsUtil'
import { jam, jamSaja, useRpc } from './umum'

type Tugas = { id: string; ujian: string; durasi_menit: number; sesi: string; mulai: string; selesai: string; ruang: string; mapel: string | null; token: string | null; token_dibuka: boolean; peserta: number }
type Baris = {
  peserta_id: string; no_kursi: number | null; nama: string; nisn: string | null; percobaan_id: string | null; mulai: string | null; batas: string | null
  selesai: string | null; nilai: number | null; pelanggaran: number; terkunci: boolean; terjawab: number; status: 'belum' | 'mengerjakan' | 'selesai'
}

export function PengawasDaftar() {
  const { data, galat, memuat } = useRpc<Tugas[]>('ad_pengawas_daftar')
  return (
    <>
      <h1>Pengawasan</h1>
      <p className="lead">Ruang dan sesi yang ditugaskan kepada Anda. Buka token saat siswa sudah duduk.</p>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      {memuat && <p className="catatan">Memuat...</p>}
      <div className="as-kisi">
        {(data ?? []).map((t) => (
          <Link key={t.id} to={`/asesmen/pantau/${t.id}`} className="kartu tautan">
            <span className="lencana">{t.token_dibuka ? 'Token terbuka' : 'Token tertutup'}</span>
            <h3 style={{ margin: '4px 0' }}>{t.ujian}{t.mapel ? `: ${t.mapel}` : ''}</h3>
            <p className="as-kecil" style={{ margin: 0 }}>{t.sesi} · ruang {t.ruang} · {jam(t.mulai)} · {t.peserta} siswa · {t.durasi_menit} menit</p>
          </Link>
        ))}
        {data && data.length === 0 && <p className="catatan">Belum ada tugas pengawasan untuk Anda, atau ujiannya belum diaktifkan.</p>}
      </div>
    </>
  )
}

export function Pantau() {
  const { sr = '' } = useParams()
  const { data, galat, muat, setGalat } = useRpc<Baris[]>('ad_pantau', { p_sr: sr })
  const { data: tugas, muat: muatTugas } = useRpc<Tugas[]>('ad_pengawas_daftar')
  const [token, setToken] = useState<{ token: string | null; token_dibuka: boolean } | null>(null)
  const [otomatis, setOtomatis] = useState(true)

  const info = tugas?.find((t) => t.id === sr)
  const tampil = token ?? (info ? { token: info.token, token_dibuka: info.token_dibuka } : null)

  useEffect(() => {
    if (!otomatis) return
    const t = window.setInterval(() => void muat(), 8000)
    return () => window.clearInterval(t)
  }, [otomatis, muat])

  async function atur(aksi: 'buka' | 'tutup' | 'baru') {
    setGalat('')
    try { setToken(await panggil('ad_token_atur', { p_sr: sr, p_aksi: aksi })); await muatTugas() } catch (e) { setGalat((e as Error).message) }
  }
  async function kunci(b: Baris, nilai: boolean) {
    if (!b.percobaan_id) return
    try { await panggil('ad_kunci', { p_percobaan: b.percobaan_id, p_kunci: nilai }); await muat() } catch (e) { setGalat((e as Error).message) }
  }
  async function akhiri(b: Baris) {
    if (!b.percobaan_id || !window.confirm(`Akhiri ujian ${b.nama} sekarang? Jawaban yang sudah masuk dinilai.`)) return
    try { await panggil('ad_akhiri', { p_percobaan: b.percobaan_id }); await muat() } catch (e) { setGalat((e as Error).message) }
  }
  const hitung = (s: string) => (data ?? []).filter((b) => b.status === s).length

  return (
    <>
      <p className="as-kecil"><Link to="/asesmen/pengawas">Pengawasan</Link> / Pantau ruang</p>
      <h1>{info ? `${info.ujian}: ruang ${info.ruang}` : 'Pantau ruang'}</h1>
      {info && <p className="lead">{info.sesi} · {jam(info.mulai)} sampai {jamSaja(info.selesai)}</p>}
      {galat && <p className="catatan galat" role="alert">{galat}</p>}

      <div className="kartu">
        {tampil?.token_dibuka && tampil.token
          ? <div className="as-token" aria-label="Token ujian">{tampil.token}</div>
          : <p style={{ margin: 0 }}>Token tertutup. Siswa belum bisa masuk.</p>}
        <div className="aksi">
          {tampil?.token_dibuka
            ? <><button className="tombol" onClick={() => void atur('tutup')}>Tutup token</button><button className="tombol" onClick={() => void atur('baru')}>Token baru</button></>
            : <button className="tombol tombol-isi" onClick={() => void atur('buka')}>Buka token</button>}
        </div>
        <p className="as-kecil" style={{ marginBottom: 0 }}>Bacakan atau tulis token di papan. Menutup token tidak mengeluarkan siswa yang sudah masuk.</p>
      </div>

      <p className="as-kecil jarak">{hitung('mengerjakan')} mengerjakan · {hitung('selesai')} selesai · {hitung('belum')} belum masuk</p>
      <div className="aksi" style={{ marginTop: 0 }}>
        <button className="tombol" onClick={() => void muat()}>Muat ulang</button>
        <label className="baris-centang" style={{ alignItems: 'center' }}><input type="checkbox" checked={otomatis} onChange={(e) => setOtomatis(e.target.checked)} /><span>Segarkan otomatis tiap 8 detik</span></label>
      </div>
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Kursi</th><th>Nama</th><th>Status</th><th>Terjawab</th><th>Pelanggaran</th><th /></tr></thead>
          <tbody>
            {(data ?? []).map((b) => (
              <tr key={b.peserta_id}>
                <td>{b.no_kursi ?? '-'}</td>
                <td>{b.nama}</td>
                <td className={`as-status-${b.status}`}>{b.status === 'belum' ? 'Belum masuk' : b.status === 'mengerjakan' ? (b.terkunci ? 'Terkunci' : 'Mengerjakan') : `Selesai, nilai ${nilaiTeks(b.nilai)}`}</td>
                <td>{b.percobaan_id ? b.terjawab : '-'}</td>
                <td className={b.pelanggaran > 0 ? 'as-awas' : ''}>{b.percobaan_id ? b.pelanggaran : '-'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {b.status === 'mengerjakan' && (b.terkunci
                    ? <button className="tombol tombol-isi" onClick={() => void kunci(b, false)}>Buka kunci</button>
                    : <button className="tombol" onClick={() => void kunci(b, true)}>Kunci</button>)}{' '}
                  {b.status === 'mengerjakan' && <button className="tombol" style={merah} onClick={() => void akhiri(b)}>Akhiri</button>}
                </td>
              </tr>
            ))}
            {data && data.length === 0 && <tr><td colSpan={6} className="as-kecil">Belum ada siswa di ruang ini.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
