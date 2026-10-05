import { Link, useParams } from 'react-router-dom'
import { nilaiTeks } from '../lmsUtil'
import AsesmenLayar, { type JadwalSaya } from './AsesmenLayar'
import { jam, labelJenis, useRpc } from './umum'

export function JadwalSiswa() {
  const { data, galat, memuat } = useRpc<JadwalSaya[]>('ad_siswa_jadwal')
  return (
    <>
      <h1>Jadwal ujian</h1>
      <p className="lead">Ujian yang ditempatkan untuk Anda. Datang ke ruang yang tertera dan tunggu token dari pengawas.</p>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      {memuat && <p className="catatan">Memuat...</p>}
      <div className="as-kisi">
        {(data ?? []).map((j) => (
          <Link key={j.peserta_id} to={`/asesmen/ujian-saya/${j.peserta_id}`} className="kartu tautan">
            <span className="lencana">{labelJenis[j.jenis]} · {j.percobaan_selesai ? 'Selesai' : j.status === 'aktif' ? 'Terbuka' : 'Ditutup'}</span>
            <h3 style={{ margin: '4px 0' }}>{j.mapel ?? j.ujian}</h3>
            <p className="as-kecil" style={{ margin: 0 }}>{j.ujian}<br />{j.sesi} · {jam(j.mulai)}<br />Ruang {j.ruang}{j.no_kursi ? `, kursi ${j.no_kursi}` : ''} · {j.durasi_menit} menit</p>
            {j.tampil_nilai && j.percobaan_selesai && <p style={{ margin: '6px 0 0' }}>Nilai <strong>{nilaiTeks(j.nilai)}</strong></p>}
          </Link>
        ))}
        {data && data.length === 0 && <p className="catatan">Belum ada jadwal ujian untuk Anda.</p>}
      </div>
    </>
  )
}

export function UjianSaya() {
  const { peserta = '' } = useParams()
  const { data, galat, memuat, muat } = useRpc<JadwalSaya[]>('ad_siswa_jadwal')
  const j = data?.find((x) => x.peserta_id === peserta)
  return (
    <>
      <p className="as-kecil"><Link to="/asesmen">Jadwal ujian</Link></p>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      {memuat && <p className="catatan">Memuat...</p>}
      {data && !j && <p className="catatan">Jadwal tidak ditemukan.</p>}
      {j && <AsesmenLayar jadwal={j} muatUlang={muat} />}
    </>
  )
}
