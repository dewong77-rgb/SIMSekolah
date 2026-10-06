// Wali kelas: Waka atau Staf Kurikulum mengusulkan, Kepala Sekolah memutuskan. Hasil dibandingkan dengan wali kelas di Dapodik.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Halaman from '../../components/Halaman'
import { panggil } from '../../lib/rpc'
import { WARNA_NADA, pilihanTahunAjaran, tahunAjaranSekarang, type BarisWali, type Guru } from '../../lib/kurikulum'
import GerbangKurikulum from './GerbangKurikulum'

const STATUS: Record<string, { label: string; nada: keyof typeof WARNA_NADA }> = {
  usulan: { label: 'Menunggu Kepala Sekolah', nada: 'sedang' },
  disetujui: { label: 'Disetujui', nada: 'baik' },
  ditolak: { label: 'Ditolak', nada: 'buruk' },
}

function banding(b: BarisWali): { label: string; nada: keyof typeof WARNA_NADA } | null {
  if (b.status !== 'disetujui') return null
  if (!b.wali_dapodik_id) return { label: 'Belum ada di Dapodik', nada: 'sedang' }
  return b.wali_dapodik_id === b.ptk_id ? { label: 'Sama dengan Dapodik', nada: 'baik' } : { label: 'Beda dengan Dapodik', nada: 'buruk' }
}

function unduhCsv(ta: string, baris: BarisWali[]) {
  const sel = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const isi = ['No,Kelas,Jumlah siswa,Wali kelas,Wali kelas di Dapodik'].concat(
    baris.map((b, i) => [i + 1, sel(b.rombel), b.jumlah_siswa, sel(b.wali), sel(b.wali_dapodik)].join(',')))
  const url = URL.createObjectURL(new Blob(['﻿' + isi.join('\n')], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = `wali-kelas-${ta.replace('/', '-')}.csv`; a.click(); URL.revokeObjectURL(url)
}

function Isi({ usul, setuju }: { usul: boolean; setuju: boolean }) {
  const [ta, setTa] = useState(tahunAjaranSekarang())
  const [data, setData] = useState<BarisWali[]>([])
  const [guru, setGuru] = useState<Guru[]>([])
  const [memuat, setMemuat] = useState(true)
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [tolak, setTolak] = useState<{ id: string; alasan: string } | null>(null)

  const muat = useCallback(async () => {
    try {
      const [d, g] = await Promise.all([panggil<BarisWali[]>('kur_wali_data', { p_ta: ta }), panggil<Guru[]>('kur_guru_daftar', { p_ta: ta })])
      setData(d ?? []); setGuru((g ?? []).filter((x) => x.jenis_ptk === 'Guru' || x.jenis_ptk === 'Kepala Sekolah'))
    } catch (e) { setGalat((e as Error).message) }
    setMemuat(false)
  }, [ta])
  useEffect(() => { setMemuat(true); void muat() }, [muat])

  const dipakai = useMemo(() => new Map(data.filter((b) => b.ptk_id && (b.status === 'usulan' || b.status === 'disetujui')).map((b) => [b.ptk_id as string, b.rombel])), [data])
  const aktif = data.filter((b) => b.status === 'usulan' || b.status === 'disetujui')
  const disetujui = data.filter((b) => b.status === 'disetujui')
  const menunggu = data.filter((b) => b.status === 'usulan')

  async function jalankan(fn: () => Promise<unknown>, pesan: string) {
    setGalat(''); setInfo(''); setSibuk(true)
    try { await fn(); setInfo(pesan); await muat() } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  const usulkan = (b: BarisWali, ptk: string) =>
    jalankan(() => panggil('kur_wali_usulkan', { p_rombel: b.rombel_id, p_ptk: ptk || null, p_catatan: null }), ptk ? 'Usulan tersimpan. Menunggu keputusan Kepala Sekolah.' : 'Usulan ditarik.')
  const putuskan = (id: string, ok: boolean, catatan?: string) =>
    jalankan(async () => { await panggil('kur_wali_putuskan', { p_id: id, p_setuju: ok, p_catatan: catatan ?? null }); setTolak(null) }, ok ? 'Wali kelas disetujui.' : 'Usulan ditolak. Waka Kurikulum dapat mengusulkan guru lain.')

  return (
    <Halaman judul="Wali kelas" lead="Waka Kurikulum mengusulkan wali kelas per rombel, Kepala Sekolah memutuskan. Hasil yang disetujui menjadi lampiran SK dan dibandingkan dengan wali kelas di Dapodik. Data Dapodik tidak diubah dari sini.">
      {!usul && !setuju && <p className="kartu">Anda hanya dapat melihat. Usulan dibuat oleh Waka atau staf kurikulum, keputusan oleh Kepala Sekolah.</p>}
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
        <select value={ta} onChange={(e) => setTa(e.target.value)} aria-label="Tahun ajaran">{pilihanTahunAjaran().map((x) => <option key={x}>{x}</option>)}</select>
        <button className="tombol" disabled={disetujui.length === 0} onClick={() => unduhCsv(ta, disetujui)}>Unduh lampiran SK (CSV)</button>
      </div>

      {memuat ? <p className="catatan jarak">Memuat data...</p> : data.length === 0 ? (
        <p className="kartu jarak">Belum ada rombel untuk tahun ajaran {ta} di Dapodik.</p>
      ) : (
        <>
          <div className="grid grid-3 jarak">
            <div className="kartu"><small>Rombel</small><h3 style={{ margin: 0 }}>{data.length}</h3></div>
            <div className="kartu"><small>Menunggu keputusan</small><h3 style={{ margin: 0 }}>{menunggu.length}</h3></div>
            <div className="kartu"><small>Disetujui</small><h3 style={{ margin: 0 }}>{disetujui.length} dari {data.length}</h3></div>
          </div>
          <div className="tabel-bungkus jarak">
            <table>
              <thead><tr><th>Kelas</th><th>Siswa</th><th>Wali di Dapodik</th><th>Usulan wali kelas</th><th>Status</th><th><span className="sr-only">Aksi</span></th></tr></thead>
              <tbody>
                {data.map((b) => {
                  const st = b.status ? STATUS[b.status] : null
                  const bd = banding(b)
                  const terkunci = b.status === 'disetujui'
                  return (
                    <tr key={b.rombel_id}>
                      <td>{b.rombel}</td>
                      <td>{b.jumlah_siswa || '-'}</td>
                      <td>{b.wali_dapodik ?? <small>belum ada</small>}</td>
                      <td>
                        {usul && !terkunci ? (
                          <select value={b.status === 'ditolak' ? '' : b.ptk_id ?? ''} disabled={sibuk} aria-label={`Wali kelas ${b.rombel}`} onChange={(e) => usulkan(b, e.target.value)} style={{ minWidth: 220 }}>
                            <option value="">Belum diusulkan</option>
                            {guru.map((g) => {
                              const di = dipakai.get(g.ptk_id)
                              return <option key={g.ptk_id} value={g.ptk_id} disabled={!!di && g.ptk_id !== b.ptk_id}>{g.nama}{di && g.ptk_id !== b.ptk_id ? ` (wali ${di})` : ''} · {g.jp_total} JP</option>
                            })}
                          </select>
                        ) : (b.wali ?? <small>belum diusulkan</small>)}
                        {b.status === 'ditolak' && <small style={{ display: 'block' }}>Ditolak: {b.wali}. {b.catatan}</small>}
                      </td>
                      <td>
                        {st ? <span className="lencana" style={{ ...WARNA_NADA[st.nada], marginBottom: 0 }}>{st.label}</span> : <small>-</small>}
                        {bd && <span className="lencana" style={{ ...WARNA_NADA[bd.nada], marginBottom: 0, marginLeft: 6 }}>{bd.label}</span>}
                      </td>
                      <td>
                        {setuju && b.status === 'usulan' && b.usulan_id && (
                          <span style={{ display: 'flex', gap: 6 }}>
                            <button className="tombol tombol-isi" style={{ padding: '4px 10px' }} disabled={sibuk} onClick={() => putuskan(b.usulan_id as string, true)}>Setujui</button>
                            <button className="tombol" style={{ padding: '4px 10px' }} disabled={sibuk} onClick={() => setTolak({ id: b.usulan_id as string, alasan: '' })}>Tolak</button>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {tolak && (
            <div className="kartu form jarak" style={{ maxWidth: 560 }}>
              <label>Alasan penolakan (wajib)<textarea rows={2} value={tolak.alasan} onChange={(e) => setTolak({ ...tolak, alasan: e.target.value })} /></label>
              <div className="aksi" style={{ marginTop: 0 }}>
                <button className="tombol tombol-isi" disabled={sibuk} onClick={() => putuskan(tolak.id, false, tolak.alasan)}>Konfirmasi penolakan</button>
                <button className="tombol" onClick={() => setTolak(null)}>Batal</button>
              </div>
            </div>
          )}
          <p className="catatan jarak">
            {aktif.length} dari {data.length} rombel punya usulan aktif. Satu guru hanya dapat menjadi wali satu kelas dalam satu tahun ajaran. Setelah disetujui, minta operator Dapodik menyesuaikan wali kelas bila labelnya "Beda dengan Dapodik".
          </p>
        </>
      )}
    </Halaman>
  )
}

export default function KurikulumWali() {
  const [izin, setIzin] = useState<{ usul: boolean; setuju: boolean } | null>(null)
  useEffect(() => { void panggil<{ usul: boolean; setuju: boolean } | null>('kur_wali_izin').then((x) => setIzin(x ?? { usul: false, setuju: false })).catch(() => setIzin({ usul: false, setuju: false })) }, [])
  return <GerbangKurikulum judul="Wali kelas" aktif="/portal/kurikulum/wali-kelas">{() => (izin ? <Isi usul={izin.usul} setuju={izin.setuju} /> : <Halaman judul="Wali kelas"><p className="catatan">Memuat...</p></Halaman>)}</GerbangKurikulum>
}
