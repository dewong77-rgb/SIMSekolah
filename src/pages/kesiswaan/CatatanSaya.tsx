// Tampilan siswa dan orang tua: catatan kesiswaan terverifikasi, kehadiran, ekskul, dan pengajuan izin.
import { useCallback, useEffect, useState } from 'react'
import Halaman from '../../components/Halaman'
import FormIzin from '../../components/FormIzin'
import { panggil, tgl } from '../../lib/rpc'
import { BIDANG_PRESTASI, JENIS_IZIN, KATEGORI, PERAN_EKSKUL, PREDIKAT, STATUS_HADIR, STATUS_IZIN, TINDAK_LANJUT, TINGKAT, label } from '../../lib/kesiswaan'

type Catatan = {
  anak: { pd: string; nama: string }[]; pd: string; nama: string; rombel: string | null; tahun_ajaran: string; poin: number
  pelanggaran: { tanggal: string; jenis: string; kategori: string; poin: number }[]
  tindak_lanjut: { tanggal: string; jenis: string }[]
  prestasi: { nama: string; bidang: string; tingkat: string; peringkat: string | null; tanggal: string }[]
  kehadiran_30_hari: Record<string, number>
  ekskul: { nama: string; peran: string; predikat: string | null }[]
}
type Izin = { id: string; pd: string; nama: string; jenis: string; tgl_mulai: string; tgl_selesai: string; jam_keluar: string | null; jam_kembali: string | null; alasan: string; status: string; catatan_keputusan: string | null; bisa_batal: boolean }

export default function CatatanSaya({ orangTua }: { orangTua: boolean }) {
  const [pd, setPd] = useState<string | null>(null)
  const [c, setC] = useState<Catatan | null>(null)
  const [izin, setIzin] = useState<Izin[]>([])
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [form, setForm] = useState(false)

  const muat = useCallback(async () => {
    try {
      const x = await panggil<Catatan>('kesiswaan_catatan_saya', { p_pd: pd })
      setC(x); setGalat('')
      setIzin(await panggil<Izin[]>('izin_saya', { p_pd: x.pd }))
    } catch (e) { setGalat((e as Error).message) }
  }, [pd])
  useEffect(() => { void muat() }, [muat])

  async function batal(id: string) {
    setGalat('')
    try { await panggil('izin_batalkan', { p_id: id }); await muat() } catch (e) { setGalat((e as Error).message) }
  }

  const k = c?.kehadiran_30_hari
  return (
    <Halaman judul={orangTua ? 'Catatan kesiswaan anak' : 'Catatan kesiswaan saya'} lead="Kehadiran, pelanggaran dan prestasi yang sudah diverifikasi sekolah, kegiatan ekstrakurikuler, serta pengajuan izin.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}
      {orangTua && c && c.anak.length > 1 && (
        <div className="aksi" style={{ marginTop: 0 }}>
          {c.anak.map((a) => <button key={a.pd} className={a.pd === c.pd ? 'tombol tombol-isi' : 'tombol'} onClick={() => setPd(a.pd)}>{a.nama}</button>)}
        </div>
      )}
      {c && (
        <>
          <h2>{c.nama} <small className="catatan">{c.rombel}</small></h2>
          <div className="grid grid-3">
            <div className="kartu"><small>Poin pelanggaran {c.tahun_ajaran}</small><h2>{c.poin}</h2><p className="catatan">Hanya catatan yang sudah diverifikasi.</p></div>
            <div className="kartu"><small>Kehadiran 30 hari terakhir</small>
              {k && k.tercatat > 0 ? <p>{STATUS_HADIR.filter(([key]) => (k[key] ?? 0) > 0).map(([key, n]) => `${n} ${k[key]}`).join(' · ')}<br /><small className="catatan">dari {k.tercatat} hari tercatat</small></p> : <p className="catatan">Belum ada data kehadiran harian.</p>}
            </div>
            <div className="kartu"><small>Prestasi</small><h2>{c.prestasi.length}</h2></div>
          </div>
          <div className="grid grid-2 jarak">
            <div className="kartu"><h3>Pelanggaran</h3>
              <ul>{c.pelanggaran.map((p, i) => <li key={i}>{tgl(p.tanggal)}: {p.jenis} ({label(KATEGORI, p.kategori)}, {p.poin} poin)</li>)}{c.pelanggaran.length === 0 && <li className="catatan">Tidak ada catatan.</li>}</ul>
              {c.tindak_lanjut.length > 0 && <><h4>Pembinaan dari sekolah</h4><ul>{c.tindak_lanjut.map((t, i) => <li key={i}>{tgl(t.tanggal)}: {label(TINDAK_LANJUT, t.jenis)}</li>)}</ul></>}
            </div>
            <div className="kartu"><h3>Prestasi dan ekstrakurikuler</h3>
              <ul>{c.prestasi.map((p, i) => <li key={i}>{p.nama}{p.peringkat && ` (${p.peringkat})`}, {label(BIDANG_PRESTASI, p.bidang)} tingkat {label(TINGKAT, p.tingkat).toLowerCase()}, {tgl(p.tanggal)}</li>)}{c.prestasi.length === 0 && <li className="catatan">Belum ada prestasi tercatat.</li>}</ul>
              <h4>Ekstrakurikuler</h4>
              <ul>{c.ekskul.map((e) => <li key={e.nama}>{e.nama} ({label(PERAN_EKSKUL, e.peran).toLowerCase()}){e.predikat && `, predikat ${label(PREDIKAT, e.predikat).toLowerCase()}`}</li>)}{c.ekskul.length === 0 && <li className="catatan">Belum mengikuti.</li>}</ul>
            </div>
          </div>
          <div className="jarak">
            <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}><h2 style={{ margin: 0 }}>Izin</h2><button className="tombol tombol-isi" onClick={() => setForm((f) => !f)}>{form ? 'Tutup form' : 'Ajukan izin'}</button></div>
            {form && <div className="jarak"><FormIzin pd={c.pd} namaSiswa={c.nama} sesudah={(p) => { setInfo(`${p} Menunggu persetujuan sekolah.`); setForm(false); void muat() }} tutup={() => setForm(false)} /></div>}
            <div className="tabel-bungkus jarak">
              <table>
                <thead><tr><th>Jenis</th><th>Tanggal</th><th>Alasan</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {izin.map((i) => (
                    <tr key={i.id}>
                      <td>{label(JENIS_IZIN, i.jenis)}</td>
                      <td>{tgl(i.tgl_mulai)}{i.tgl_selesai !== i.tgl_mulai && ` sampai ${tgl(i.tgl_selesai)}`}{i.jenis === 'izin_keluar' && <><br /><small className="catatan">Keluar {i.jam_keluar?.slice(0, 5)}</small></>}</td>
                      <td>{i.alasan}</td>
                      <td>{label(STATUS_IZIN, i.status)}{i.catatan_keputusan && <><br /><small className="catatan">{i.catatan_keputusan}</small></>}</td>
                      <td>{i.bisa_batal && <button className="tombol-ikon" onClick={() => batal(i.id)}>Batalkan</button>}</td>
                    </tr>
                  ))}
                  {izin.length === 0 && <tr><td colSpan={5} className="catatan">Belum ada pengajuan izin.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Halaman>
  )
}
