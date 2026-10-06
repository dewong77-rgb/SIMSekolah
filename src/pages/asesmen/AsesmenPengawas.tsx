import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { panggil } from '../../lib/rpc'
import { merah, nilaiTeks } from '../lmsUtil'
import { jam, jamSaja, useRpc } from './umum'
import { useAuth } from '../../auth/AuthContext'
import { TabSesi } from './AsesmenAdmin'

type Tugas = { id: string; ujian: string; durasi_menit: number; sesi: string; mulai: string; selesai: string; ruang: string; mapel: string | null; token: string | null; token_dibuka: boolean; peserta: number }
type Baris = {
  peserta_id: string; no_kursi: number | null; nama: string; nisn: string | null; percobaan_id: string | null; mulai: string | null; batas: string | null
  selesai: string | null; nilai: number | null; pelanggaran: number; terkunci: boolean; terjawab: number; status: 'belum' | 'mengerjakan' | 'selesai'
}

type Semua = {
  id: string; ujian_id: string; ujian: string; durasi_menit: number; sesi_id: string; sesi: string; mulai: string; selesai: string
  ruang: string; mapel: string | null; pengawas_ptk_id: string | null; pengawas: string | null; token: string | null; token_dibuka: boolean
  peserta: number; mengerjakan: number; selesai_n: number; terkunci: number
}
type UjianRingkas = { id: string; nama: string; status: string }
type Kartu = Semua & { pengawas: string | null }

const keadaan = (k: { mulai: string; selesai: string }, sekarang: number): 'berlangsung' | 'mendatang' | 'selesai' =>
  sekarang > new Date(k.selesai).getTime() ? 'selesai' : sekarang >= new Date(k.mulai).getTime() ? 'berlangsung' : 'mendatang'

function KartuRuang({ k, admin, muat }: { k: Kartu; admin: boolean; muat: () => Promise<void> }) {
  const [pesan, setPesan] = useState('')
  async function atur(aksi: 'buka' | 'tutup') {
    setPesan('')
    try { await panggil('ad_token_atur', { p_sr: k.id, p_aksi: aksi }); await muat() } catch (e) { setPesan((e as Error).message) }
  }
  const persen = k.peserta > 0 ? Math.round((k.selesai_n / k.peserta) * 100) : 0
  return (
    <div className="kartu ruang-kartu">
      <div className="ruang-kepala">
        <span className="lencana">{k.token_dibuka ? 'Token terbuka' : 'Token tertutup'}</span>
        {k.terkunci > 0 && <span className="status status-ditolak">{k.terkunci} terkunci</span>}
      </div>
      <h3 style={{ margin: '4px 0' }}>{k.ujian}{k.mapel ? `: ${k.mapel}` : ''}</h3>
      <p className="as-kecil" style={{ margin: 0 }}>{k.sesi} · ruang {k.ruang} · {jam(k.mulai)} sampai {jamSaja(k.selesai)} · {k.durasi_menit} menit</p>
      <p className="as-kecil" style={{ margin: '2px 0 8px' }}>Pengawas: {k.pengawas ?? <span className="as-awas">belum ada</span>}</p>
      <div className="belajar-bar" aria-hidden="true"><div style={{ width: `${persen}%` }} /></div>
      <p className="as-kecil" style={{ margin: '6px 0 0' }}>{k.mengerjakan} mengerjakan · {k.selesai_n} selesai · {Math.max(0, k.peserta - k.mengerjakan - k.selesai_n)} belum masuk · {k.peserta} peserta</p>
      {pesan && <p className="catatan galat" role="alert">{pesan}</p>}
      <div className="aksi" style={{ marginTop: 10 }}>
        <Link className="tombol tombol-isi" to={`/asesmen/pantau/${k.id}`}>Pantau ruang</Link>
        {admin && (k.token_dibuka
          ? <button className="tombol" onClick={() => void atur('tutup')}>Tutup token</button>
          : <button className="tombol" onClick={() => void atur('buka')}>Buka token</button>)}
      </div>
    </div>
  )
}

const ALUR = [
  ['Siapkan', 'Pastikan siswa sudah duduk dan perangkat tersambung internet.'],
  ['Buka token', 'Buka token di ruang Anda, lalu tulis atau bacakan di papan.'],
  ['Pantau', 'Lihat siapa yang sudah masuk, jumlah terjawab, dan pelanggaran layar.'],
  ['Tindak', 'Kunci layar siswa yang bermasalah, buka kunci, atau akhiri ujian bila perlu.'],
  ['Tutup', 'Setelah semua selesai, tutup token dan laporkan ke panitia.'],
] as const

export function PengawasDaftar() {
  const { punyaIzin } = useAuth()
  const admin = punyaIzin('asesmen.kelola')
  const { data: semua, galat: g1, memuat: m1, muat: muat1 } = useRpc<Semua[]>('ad_pengawasan_semua', undefined, admin)
  const { data: saya, galat: g2, memuat: m2, muat: muat2 } = useRpc<Tugas[]>('ad_pengawas_daftar', undefined, !admin)
  const { data: ujian } = useRpc<UjianRingkas[]>('ad_ujian_daftar', undefined, admin)
  const [tab, setTab] = useState<'hari' | 'mendatang' | 'selesai' | 'atur'>('hari')
  const [pilihUjian, setPilihUjian] = useState('')
  const sekarang = Date.now()

  const daftar: Kartu[] = admin
    ? (semua ?? [])
    : (saya ?? []).map((t) => ({ ...t, ujian_id: '', sesi_id: '', pengawas_ptk_id: null, pengawas: 'Anda', mengerjakan: 0, selesai_n: 0, terkunci: 0 }) as unknown as Kartu)
  const muat = admin ? muat1 : muat2
  const galat = admin ? g1 : g2
  const memuat = admin ? m1 : m2
  const kelompok = { hari: daftar.filter((k) => keadaan(k, sekarang) === 'berlangsung'), mendatang: daftar.filter((k) => keadaan(k, sekarang) === 'mendatang'), selesai: daftar.filter((k) => keadaan(k, sekarang) === 'selesai') }
  const utama = admin && ujian ? (pilihUjian || ujian.find((u) => u.status === 'aktif')?.id || ujian[0]?.id || '') : ''

  const tabs: { id: typeof tab; label: string; n?: number }[] = [
    { id: 'hari', label: 'Sedang berlangsung', n: kelompok.hari.length },
    { id: 'mendatang', label: 'Mendatang', n: kelompok.mendatang.length },
    { id: 'selesai', label: 'Selesai', n: kelompok.selesai.length },
    ...(admin ? [{ id: 'atur' as const, label: 'Pengaturan sesi' }] : []),
  ]
  const tampilKartu = tab === 'atur' ? [] : kelompok[tab]

  return (
    <>
      <h1>Pengawasan</h1>
      <p className="lead">{admin ? 'Semua ruang dan sesi ujian aktif: token, pengawas, dan kemajuan siswa.' : 'Ruang dan sesi yang ditugaskan kepada Anda. Buka token saat siswa sudah duduk.'}</p>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      {memuat && <p className="catatan">Memuat...</p>}
      <div className="as-ringkas">
        <div><strong>{kelompok.hari.length}</strong><span>ruang berlangsung</span></div>
        <div><strong>{daftar.filter((k) => k.token_dibuka).length}</strong><span>token terbuka</span></div>
        <div><strong>{daftar.reduce((j, k) => j + k.mengerjakan, 0)}</strong><span>siswa mengerjakan</span></div>
        <div><strong>{daftar.reduce((j, k) => j + k.terkunci, 0)}</strong><span>layar terkunci</span></div>
      </div>

      <div className="tab-bar" role="tablist" aria-label="Bagian pengawasan">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={'tab-item' + (tab === t.id ? ' aktif' : '')} onClick={() => setTab(t.id)}>
            {t.label}{t.n ? <span className="angka">{t.n}</span> : null}
          </button>
        ))}
      </div>

      {tab !== 'atur' && (
        <div className="as-kisi">
          {tampilKartu.map((k) => <KartuRuang key={k.id} k={k} admin={admin} muat={async () => { await muat() }} />)}
        </div>
      )}
      {tab !== 'atur' && tampilKartu.length === 0 && !memuat && (
        <div className="kartu kosong-info">
          <h3 style={{ marginTop: 0 }}>{tab === 'hari' ? 'Belum ada ruang yang berlangsung' : tab === 'mendatang' ? 'Belum ada sesi mendatang' : 'Belum ada sesi yang selesai'}</h3>
          <p className="catatan">
            {admin
              ? 'Ruang muncul di sini setelah ujian diaktifkan dan sesi diberi ruang. Atur sesi, ruang, dan pengawas di tab Pengaturan sesi.'
              : 'Tugas pengawasan muncul setelah panitia mengaktifkan ujian dan menugaskan Anda sebagai pengawas ruang.'}
          </p>
          {admin && <div className="aksi"><button className="tombol tombol-isi" onClick={() => setTab('atur')}>Buka pengaturan sesi</button></div>}
        </div>
      )}

      {tab === 'atur' && admin && (
        <div>
          {(ujian ?? []).length === 0
            ? <div className="kartu"><p className="catatan">Belum ada ujian. <Link to="/asesmen">Buat ujian</Link> dulu, lalu atur sesi dan ruangnya di sini.</p></div>
            : (
              <>
                <div className="pantau-bar">
                  <label className="pantau-pilih"><span>Ujian</span>
                    <select value={utama} onChange={(e) => setPilihUjian(e.target.value)}>
                      {(ujian ?? []).map((u) => <option key={u.id} value={u.id}>{u.nama} ({u.status})</option>)}
                    </select>
                  </label>
                  <Link className="tombol" to={`/asesmen/ujian/${utama}`}>Pengaturan ujian (durasi, acak, batas pelanggaran)</Link>
                </div>
                {utama && <TabSesi key={utama} ujian={utama} onUbah={async () => { await muat() }} />}
              </>
            )}
        </div>
      )}

      <div className="kartu jarak">
        <h3 style={{ marginTop: 0 }}>Alur pengawasan</h3>
        <ol className="alur-daftar">
          {ALUR.map(([j, t]) => <li key={j}><strong>{j}</strong><span>{t}</span></li>)}
        </ol>
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
