// Beranda Kesiswaan: ringkasan dan pintu ke modul sesuai hak akses.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { panggil } from '../../lib/rpc'
import { KATEGORI } from '../../lib/kesiswaan'
import Gerbang from './Gerbang'

type Ringkasan = {
  tahun_ajaran: string; seluruh_sekolah: boolean
  lencana: { pelanggaran: number; prestasi: number; izin: number }
  risiko: { tinggi: number; sedang: number; siswa: number; rombel_total: number; rombel_tercatat: number } | null
  izin_hari_ini: number
  pelanggaran_30_hari: Record<string, number>
  pelanggaran_teratas: { nama: string; jumlah: number }[]
  prestasi_tahun_ini: number; ekskul_aktif: number; anggota_ekskul: number
  beasiswa: { program: number; ditetapkan: number; dicairkan: number; proses: number } | null
}

function Isi({ izin }: { izin: string[] }) {
  const [r, setR] = useState<Ringkasan | null>(null)
  const [galat, setGalat] = useState('')
  useEffect(() => { panggil<Ringkasan>('kesiswaan_ringkasan').then(setR).catch((e: Error) => setGalat(e.message)) }, [])
  const punya = (...k: string[]) => izin.some((i) => k.includes(i))
  const sekolah = r?.seluruh_sekolah ?? false

  const menu = [
    punya('kesiswaan.catat', 'kesiswaan.pantau', 'kesiswaan.verifikasi') && { to: '/portal/kesiswaan/pelanggaran', nama: 'Pelanggaran', ket: 'Catat, verifikasi, katalog poin, dan ambang sanksi', n: r?.lencana.pelanggaran },
    punya('kesiswaan.catat', 'kesiswaan.pantau', 'kesiswaan.verifikasi') && { to: '/portal/kesiswaan/prestasi', nama: 'Prestasi', ket: 'Prestasi akademik, non-akademik, dan kejuruan', n: r?.lencana.prestasi },
    punya('kesiswaan.izin') && { to: '/portal/kesiswaan/izin', nama: 'Izin siswa', ket: 'Sakit, izin, dispensasi, dan izin keluar sekolah', n: r?.lencana.izin },
    punya('kesiswaan.izin', 'kesiswaan.pantau') && { to: '/portal/kesiswaan/kehadiran', nama: 'Kehadiran harian', ket: 'Isi dan rekap kehadiran per hari sekolah', n: 0 },
    punya('kesiswaan.pantau') && { to: '/portal/kesiswaan/risiko', nama: 'Risiko siswa', ket: 'Siswa yang perlu dilihat lebih dulu dan tindak lanjutnya', n: 0 },
    punya('ekskul.kelola') && { to: '/portal/kesiswaan/ekskul', nama: 'Ekskul dan OSIS', ket: 'Anggota, pertemuan, dan predikat', n: 0 },
    punya('kesiswaan.beasiswa') && { to: '/portal/kesiswaan/beasiswa', nama: 'Beasiswa dan PIP', ket: 'Program, calon, berkas, dan pencairan', n: 0 },
  ].filter(Boolean) as { to: string; nama: string; ket: string; n?: number }[]

  const kat = r?.pelanggaran_30_hari ?? {}
  return (
    <Halaman judul="Kesiswaan" lead="Pembinaan siswa dalam satu tempat: pelanggaran dan prestasi, izin dan kehadiran, siswa berisiko, ekstrakurikuler, dan beasiswa.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      <div className="grid grid-3">
        {menu.map((m) => (
          <Link key={m.to} to={m.to} className="kartu" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h3 style={{ marginTop: 0 }}>{m.nama}{!!m.n && <b className="angka" style={{ marginLeft: 8 }} aria-label={`${m.n} menunggu`}>{m.n}</b>}</h3>
            <p className="catatan">{m.ket}</p>
          </Link>
        ))}
      </div>
      {r && sekolah && (
        <div className="jarak">
          <h2>Gambaran sekolah</h2>
          <div className="grid grid-3">
            {r.risiko && <div className="kartu"><small>Siswa risiko tinggi / sedang</small><h2>{r.risiko.tinggi} / {r.risiko.sedang}</h2><p className="catatan">Dari {r.risiko.siswa} siswa. Kehadiran harian terisi di {r.risiko.rombel_tercatat} dari {r.risiko.rombel_total} rombel.</p></div>}
            <div className="kartu"><small>Izin berlaku hari ini</small><h2>{r.izin_hari_ini}</h2></div>
            <div className="kartu"><small>Pelanggaran terverifikasi 30 hari</small><h2>{Object.values(kat).reduce((a, b) => a + b, 0)}</h2><p className="catatan">{KATEGORI.map(([k, n]) => `${n} ${kat[k] ?? 0}`).join(' · ')}</p></div>
            <div className="kartu"><small>Prestasi terverifikasi {r.tahun_ajaran}</small><h2>{r.prestasi_tahun_ini}</h2></div>
            <div className="kartu"><small>Ekskul dan organisasi aktif</small><h2>{r.ekskul_aktif}</h2><p className="catatan">{r.anggota_ekskul} siswa menjadi anggota.</p></div>
            {r.beasiswa && <div className="kartu"><small>Beasiswa dan PIP</small><h2>{r.beasiswa.ditetapkan + r.beasiswa.dicairkan} penerima</h2><p className="catatan">{r.beasiswa.program} program aktif, {r.beasiswa.proses} siswa masih diproses.</p></div>}
          </div>
          {r.pelanggaran_teratas.length > 0 && (
            <div className="kartu jarak"><h3>Pelanggaran terbanyak 30 hari terakhir</h3><ol>{r.pelanggaran_teratas.map((p) => <li key={p.nama}>{p.nama} ({p.jumlah})</li>)}</ol>
              <p className="catatan">Pola ini lebih berguna untuk memperbaiki sistem (jam masuk, aturan, pengawasan) daripada untuk menilai siswa tertentu.</p>
            </div>
          )}
        </div>
      )}
      {r && !sekolah && <p className="catatan jarak">Ringkasan seluruh sekolah hanya tampil bagi pemegang tugas tingkat sekolah. Halaman di atas menampilkan data rombel atau ekskul yang Anda tangani.</p>}
    </Halaman>
  )
}

export default function KesiswaanBeranda() {
  return <Gerbang perlu={['kesiswaan.catat', 'kesiswaan.verifikasi', 'kesiswaan.pantau', 'kesiswaan.izin', 'kesiswaan.beasiswa', 'ekskul.kelola']} judul="Kesiswaan">{(izin) => <Isi izin={izin} />}</Gerbang>
}
