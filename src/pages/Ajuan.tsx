import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import Pager, { efektif } from '../components/Pager'
import { useAuth } from '../auth/AuthContext'
import { panggil, tglJam } from '../lib/rpc'

type Subjek = { jenis: 'ptk' | 'siswa'; id: string; nama: string }
type Kolom = {
  kunci: string; label: string; kelompok: string; tipe: 'teks' | 'pilihan' | 'tanggal' | 'angka'
  pilihan: string[] | null; pola: string | null; wajib: boolean; butuh_dokumen: boolean; nilai: string | null
}
type Perubahan = { kunci: string; label: string; kelompok: string; lama: string | null; baru: string | null; butuh_dokumen?: boolean }
type Ajuan = {
  id: string; jenis: 'ptk' | 'siswa'; subjek_nama: string; perubahan: Perubahan[]; alasan: string; status: string
  catatan_admin: string | null; catatan_operator: string | null; bagian: string | null; butuh_dokumen: boolean
  dibuat_pada: string; diteruskan_pada: string | null; dikerjakan_pada: string | null; selesai_pada: string | null
  belum_terbukti: boolean; pengaju_peran: string; aksi?: string[]
}

const namaBagian: Record<string, string> = { kepegawaian: 'TU Kepegawaian', kesiswaan: 'TU Kesiswaan' }

function labelStatus(a: Ajuan): string {
  switch (a.status) {
    case 'menunggu': return `Menunggu keputusan ${namaBagian[a.bagian ?? ''] ?? 'TU'}`
    case 'diteruskan': return 'Disetujui, menunggu operator Dapodik'
    case 'dikerjakan': return a.belum_terbukti ? 'Dikerjakan operator, belum tampak di unggahan terakhir' : 'Sedang diperbaiki operator Dapodik'
    case 'selesai': return 'Selesai, data sudah diperbarui dari Dapodik'
    case 'ditolak': return 'Ditolak'
    case 'dibatalkan': return 'Dibatalkan'
    default: return a.status
  }
}

function Rincian({ p }: { p: Perubahan[] }) {
  return (
    <div className="tabel-bungkus jarak">
      <table>
        <thead><tr><th>Data</th><th>Sekarang</th><th>Seharusnya</th></tr></thead>
        <tbody>
          {p.map((x) => (
            <tr key={x.kunci}><td>{x.label}</td><td>{x.lama ?? '-'}</td><td>{x.baru ?? '(dikosongkan)'}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Cek data mandiri dan ajuan perbaikan oleh guru, tendik, siswa, atau orang tua. */
export function AjuanSaya() {
  const [subjek, setSubjek] = useState<Subjek[] | null>(null)
  const [pilih, setPilih] = useState<Subjek | null>(null)
  const [kolom, setKolom] = useState<Kolom[] | null>(null)
  const [isi, setIsi] = useState<Record<string, string>>({})
  const [alasan, setAlasan] = useState('')
  const [riwayat, setRiwayat] = useState<Ajuan[] | null>(null)
  const [galat, setGalat] = useState('')
  const [pesan, setPesan] = useState('')
  const [sibuk, setSibuk] = useState(false)

  const muatRiwayat = useCallback(async () => {
    try { setRiwayat(await panggil<Ajuan[]>('ajuan_saya')) } catch (e) { setGalat((e as Error).message) }
  }, [])
  useEffect(() => {
    void muatRiwayat()
    panggil<Subjek[]>('ajuan_subjek_saya').then((s) => { setSubjek(s); if (s.length === 1) setPilih(s[0]) }).catch((e: Error) => setGalat(e.message))
  }, [muatRiwayat])

  useEffect(() => {
    setKolom(null); setIsi({})
    if (!pilih) return
    panggil<Kolom[]>('ajuan_data_saya', { p_jenis: pilih.jenis, p_subjek: pilih.id }).then(setKolom).catch((e: Error) => setGalat(e.message))
  }, [pilih])

  const berubah = useMemo(
    () => (kolom ?? []).filter((k) => isi[k.kunci] !== undefined && isi[k.kunci].trim() !== (k.nilai ?? '').trim()),
    [kolom, isi],
  )
  const kelompok = useMemo(() => {
    const m = new Map<string, Kolom[]>()
    for (const k of kolom ?? []) m.set(k.kelompok, [...(m.get(k.kelompok) ?? []), k])
    return [...m.entries()]
  }, [kolom])

  async function kirim() {
    if (!pilih) return
    setSibuk(true); setGalat(''); setPesan('')
    try {
      await panggil('ajukan_perubahan', {
        p_jenis: pilih.jenis, p_subjek: pilih.id, p_alasan: alasan,
        p_perubahan: berubah.map((k) => ({ kunci: k.kunci, baru: isi[k.kunci].trim() })),
      })
      setPesan('Ajuan terkirim. Pantau statusnya di bawah.')
      setIsi({}); setAlasan('')
      await muatRiwayat()
    } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }

  async function batal(id: string) {
    if (!confirm('Batalkan ajuan ini?')) return
    try { await panggil('batalkan_ajuan', { p_id: id }); await muatRiwayat() } catch (e) { setGalat((e as Error).message) }
  }

  return (
    <Halaman judul="Cek data dan ajuan perbaikan" lead="Data di sini berasal dari Dapodik. Jika ada yang keliru, ajukan perbaikan.">
      <div className="kartu">
        <p className="catatan">
          Alurnya: Anda mengajukan, TU bagian terkait memeriksa, operator Dapodik memperbaiki di Dapodik, lalu mengunggah ulang datanya ke sini.
          Ajuan selesai otomatis ketika data baru terbaca. Data di halaman ini tidak berubah sampai saat itu.
        </p>
      </div>
      {galat && <p className="catatan jarak" role="alert">Galat: {galat}</p>}
      {pesan && <p className="catatan jarak" aria-live="polite">{pesan}</p>}

      {subjek && subjek.length === 0 && <div className="kartu jarak"><p>Akun ini tidak tertaut ke data Dapodik, jadi belum ada yang dapat dicek.</p></div>}
      {subjek && subjek.length > 1 && (
        <div className="aksi jarak">
          <select value={pilih?.id ?? ''} onChange={(e) => setPilih(subjek.find((s) => s.id === e.target.value) ?? null)} aria-label="Pilih data">
            <option value="">Pilih anak</option>
            {subjek.map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}
          </select>
        </div>
      )}

      {pilih && (
        <div className="kartu jarak">
          <h3>Data {pilih.nama}</h3>
          {!kolom && <p className="catatan">Memuat...</p>}
          {kelompok.map(([nama, ks]) => (
            <div key={nama} className="jarak">
              <strong>{nama}</strong>
              <div className="tabel-bungkus jarak">
                <table>
                  <thead><tr><th>Data</th><th>Isi sekarang</th><th>Ajukan perubahan</th></tr></thead>
                  <tbody>
                    {ks.map((k) => (
                      <tr key={k.kunci}>
                        <td>{k.label}{k.butuh_dokumen ? <small> (perlu dokumen)</small> : null}</td>
                        <td>{k.nilai ?? '-'}</td>
                        <td>
                          {k.tipe === 'pilihan' ? (
                            <select value={isi[k.kunci] ?? k.nilai ?? ''} onChange={(e) => setIsi({ ...isi, [k.kunci]: e.target.value })} aria-label={k.label}>
                              {!k.wajib && <option value="">(kosong)</option>}
                              {(k.pilihan ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input
                              type={k.tipe === 'tanggal' ? 'date' : k.tipe === 'angka' ? 'number' : 'text'}
                              value={isi[k.kunci] ?? ''}
                              placeholder="Biarkan kosong bila benar"
                              onChange={(e) => setIsi({ ...isi, [k.kunci]: e.target.value })}
                              aria-label={k.label}
                              style={{ width: '100%', minWidth: 160 }}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {kolom && (
            <div className="form jarak">
              <label>
                Alasan perubahan (wajib)
                <textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} rows={3} maxLength={500} style={{ font: 'inherit', fontWeight: 400, padding: 10, border: '1px solid #b9c1cd', borderRadius: 8 }} />
              </label>
              <div className="aksi">
                <button className="tombol tombol-isi" disabled={sibuk || berubah.length === 0 || alasan.trim().length < 5} onClick={kirim}>
                  {sibuk ? 'Mengirim...' : `Kirim ajuan (${berubah.length} data)`}
                </button>
              </div>
              <p className="catatan">Perubahan identitas (nama, tanggal lahir, NIK) membutuhkan dokumen pendukung. Siapkan KK atau akta, TU akan memintanya bila perlu.</p>
            </div>
          )}
        </div>
      )}

      <div className="judul-bagian jarak"><h2>Ajuan saya</h2></div>
      {!riwayat && <p className="catatan">Memuat...</p>}
      {riwayat && riwayat.length === 0 && <p className="catatan">Belum ada ajuan.</p>}
      {(riwayat ?? []).map((a) => (
        <div className="kartu jarak" key={a.id}>
          <div className="aksi" style={{ justifyContent: 'space-between' }}>
            <div><span className="lencana">{labelStatus(a)}</span><br /><small>{a.subjek_nama}, diajukan {tglJam(a.dibuat_pada)}</small></div>
            {a.status === 'menunggu' && <button className="tombol" onClick={() => batal(a.id)}>Batalkan</button>}
          </div>
          <Rincian p={a.perubahan} />
          <p className="catatan jarak">Alasan: {a.alasan}</p>
          {a.catatan_admin && <p className="catatan">Catatan TU: {a.catatan_admin}</p>}
          {a.catatan_operator && <p className="catatan">Catatan operator: {a.catatan_operator}</p>}
          {a.status === 'selesai' && <p className="catatan">Selesai {tglJam(a.selesai_pada)}.</p>}
        </div>
      ))}
      <p className="catatan jarak"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

/** Antrean ajuan untuk TU bagian terkait dan operator Dapodik. */
export function AjuanMasuk() {
  const { profil } = useAuth()
  const [daftar, setDaftar] = useState<Ajuan[] | null>(null)
  const [tab, setTab] = useState<'keputusan' | 'operator' | 'riwayat'>('keputusan')
  const [cari, setCari] = useState('')
  const [hal, setHal] = useState(1)
  const [ukuran, setUkuran] = useState(10)
  const [buka, setBuka] = useState<string | null>(null)
  const [catatan, setCatatan] = useState('')
  const [galat, setGalat] = useState('')
  const [pesan, setPesan] = useState('')
  const [sibuk, setSibuk] = useState(false)

  const muat = useCallback(async () => {
    try { setDaftar((await panggil<Ajuan[] | null>('ajuan_daftar')) ?? []) } catch (e) { setGalat((e as Error).message) }
  }, [])
  useEffect(() => { void muat() }, [muat])

  const sesuai = (a: Ajuan) =>
    tab === 'keputusan' ? a.status === 'menunggu'
      : tab === 'operator' ? a.status === 'diteruskan' || a.status === 'dikerjakan'
        : !['menunggu', 'diteruskan', 'dikerjakan'].includes(a.status)
  const k = cari.trim().toLowerCase()
  const tampil = (daftar ?? []).filter((a) => sesuai(a) && (!k || [a.subjek_nama, a.alasan].some((x) => x.toLowerCase().includes(k))))
  const per = efektif(ukuran)
  const irisan = tampil.slice((hal - 1) * per, hal * per)
  const hitung = (t: typeof tab) => (daftar ?? []).filter((a) => (t === 'keputusan' ? a.status === 'menunggu' : t === 'operator' ? ['diteruskan', 'dikerjakan'].includes(a.status) : false)).length

  async function jalankan(fn: string, args: Record<string, unknown>, ok: string) {
    setSibuk(true); setGalat(''); setPesan('')
    try { await panggil(fn, args); setPesan(ok); setBuka(null); setCatatan(''); await muat() } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  async function cocokkan() {
    setSibuk(true); setGalat(''); setPesan('')
    try {
      const r = await panggil<{ selesai: number; belum_terbukti: number }>('cocokkan_ajuan')
      setPesan(`Pencocokan selesai: ${r.selesai} ajuan selesai, ${r.belum_terbukti} belum tampak di data.`)
      await muat()
    } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }

  const bisaKerjakan = (daftar ?? []).some((a) => a.aksi?.includes('kerjakan'))

  return (
    <Halaman judul="Ajuan perbaikan data" lead="Periksa ajuan sesuai bagian Anda. Operator Dapodik memperbaiki di Dapodik lalu mengunggah ulang.">
      <div className="pilih-peran" role="tablist">
        {([['keputusan', 'Menunggu keputusan'], ['operator', 'Antrean operator Dapodik'], ['riwayat', 'Riwayat']] as const).map(([id, nama]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'aktif' : ''} onClick={() => { setTab(id); setHal(1); setBuka(null) }}>
            {nama}{id !== 'riwayat' ? ` (${hitung(id)})` : ''}
          </button>
        ))}
      </div>
      {galat && <p className="catatan jarak" role="alert">Galat: {galat}</p>}
      {pesan && <p className="catatan jarak" aria-live="polite">{pesan}</p>}
      <div className="aksi jarak">
        <input type="search" placeholder="Cari nama atau alasan" value={cari} onChange={(e) => { setCari(e.target.value); setHal(1) }} style={{ minWidth: 260 }} aria-label="Cari" />
        {tab === 'operator' && bisaKerjakan && (
          <>
            <button className="tombol" disabled={sibuk} onClick={cocokkan}>Cocokkan dengan data terbaru</button>
            {profil?.peran === 'admin_tu' && <Link to="/portal/unggah" className="tombol" style={{ color: 'var(--warna-utama)' }}>Buka Unggah Dapodik</Link>}
          </>
        )}
      </div>
      {tab === 'operator' && <p className="catatan jarak">Perbaiki datanya di aplikasi Dapodik atau VervalPD, ekspor ulang, lalu unggah di sini. Ajuan selesai otomatis bila nilainya sama dengan usulan.</p>}

      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Pemilik data</th><th>Bagian</th><th>Perubahan</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {!daftar && <tr><td colSpan={5}>Memuat...</td></tr>}
            {daftar && tampil.length === 0 && <tr><td colSpan={5}>Tidak ada ajuan.</td></tr>}
            {irisan.map((a) => (
              <Fragment key={a.id}>
                <tr>
                  <td>{a.subjek_nama}<br /><small>{a.jenis === 'ptk' ? 'Guru/tendik' : 'Siswa'}, {tglJam(a.dibuat_pada)}</small></td>
                  <td>{namaBagian[a.bagian ?? ''] ?? '-'}</td>
                  <td>{a.perubahan.map((p) => p.label).join(', ')}{a.butuh_dokumen ? <small> (perlu dokumen)</small> : null}</td>
                  <td>{labelStatus(a)}</td>
                  <td><button className="tombol" onClick={() => { setBuka(buka === a.id ? null : a.id); setCatatan('') }}>{buka === a.id ? 'Tutup' : 'Buka'}</button></td>
                </tr>
                {buka === a.id && (
                  <tr>
                    <td colSpan={5}>
                      <Rincian p={a.perubahan} />
                      <p className="catatan jarak">Alasan pengaju: {a.alasan}</p>
                      {a.catatan_admin && <p className="catatan">Catatan TU: {a.catatan_admin}</p>}
                      {a.catatan_operator && <p className="catatan">Catatan operator: {a.catatan_operator}</p>}
                      {(a.aksi ?? []).length > 0 && (
                        <div className="form jarak">
                          <label>
                            Catatan {a.aksi?.includes('putuskan') ? '(wajib bila menolak)' : '(wajib bila mengembalikan)'}
                            <input value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={300} />
                          </label>
                          <div className="aksi">
                            {a.aksi?.includes('putuskan') && (
                              <>
                                <button className="tombol tombol-isi" disabled={sibuk} onClick={() => jalankan('putuskan_ajuan', { p_id: a.id, p_setuju: true, p_catatan: catatan }, 'Ajuan diteruskan ke operator Dapodik.')}>Setujui dan teruskan</button>
                                <button className="tombol" disabled={sibuk || catatan.trim().length < 3} onClick={() => jalankan('putuskan_ajuan', { p_id: a.id, p_setuju: false, p_catatan: catatan }, 'Ajuan ditolak.')}>Tolak</button>
                              </>
                            )}
                            {a.aksi?.includes('kerjakan') && (
                              <>
                                {a.status === 'diteruskan' && <button className="tombol tombol-isi" disabled={sibuk} onClick={() => jalankan('kerjakan_ajuan', { p_aksi: 'mulai', p_id: a.id, p_catatan: catatan }, 'Ajuan ditandai sedang dikerjakan.')}>Mulai kerjakan</button>}
                                <button className="tombol" disabled={sibuk || catatan.trim().length < 3} onClick={() => jalankan('kerjakan_ajuan', { p_aksi: 'kembalikan', p_id: a.id, p_catatan: catatan }, 'Ajuan dikembalikan.')}>Kembalikan</button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <Pager halaman={hal} total={tampil.length} ukuran={ukuran} ke={setHal} ubahUkuran={setUkuran} />
      <p className="catatan jarak"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}
