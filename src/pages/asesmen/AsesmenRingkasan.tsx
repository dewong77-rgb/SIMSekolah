import { useState } from 'react'
import { Link } from 'react-router-dom'
import { jam, useRpc } from './umum'

type Guru = { ptk_id: string; guru: string; mapel: string; bank: number; soal: number }
type Ringkasan = {
  admin: boolean; ujian_aktif: number; ujian_draf: number; ujian_selesai: number; sesi_berlangsung: number
  sesi_berikut: { sesi: string; ujian: string; mulai: string; selesai: string } | null
  guru: Guru[]
  ruang?: number; paket?: number; sesi_tanpa_pengawas?: number; peserta?: number; mengerjakan?: number; selesai?: number
  bank_mapel?: { mapel: string; bank: number; soal: number }[]
}

const sudah = (g: Guru) => g.soal > 0

function Cek({ ok, teks, tautan, aksi }: { ok: boolean; teks: string; tautan: string; aksi: string }) {
  return (
    <li className={ok ? 'cek-ok' : 'cek-belum'}>
      <span aria-hidden="true">{ok ? '✓' : '○'}</span>
      <span>{teks}</span>
      {!ok && <Link to={tautan}>{aksi}</Link>}
    </li>
  )
}

/** Beranda Asesmen Digital: status CBT, kesiapan, dan kemajuan pengisian bank soal oleh guru. */
export default function RingkasanCbt() {
  const { data: r, galat, memuat } = useRpc<Ringkasan>('ad_ringkasan')
  const [saring, setSaring] = useState<'semua' | 'belum' | 'sudah'>('semua')
  if (galat) return <p className="catatan galat" role="alert">{galat}</p>
  if (memuat || !r) return <p className="catatan">Memuat ringkasan...</p>

  const aktif = r.ujian_aktif > 0
  const guru = r.guru ?? []
  const terisi = guru.filter(sudah).length
  const persen = guru.length > 0 ? Math.round((terisi / guru.length) * 100) : 0
  const tampil = guru.filter((g) => saring === 'semua' || (saring === 'sudah' ? sudah(g) : !sudah(g)))
  const guruBelum = new Set(guru.filter((g) => !sudah(g)).map((g) => g.ptk_id)).size

  return (
    <>
      <div className={'cbt-status ' + (aktif ? 'aktif' : 'mati')} role="status">
        <span className="cbt-status-titik" aria-hidden="true" />
        <div>
          <strong>{aktif ? 'CBT aktif' : 'CBT belum aktif'}</strong>
          <span>
            {aktif
              ? r.sesi_berlangsung > 0
                ? `${r.sesi_berlangsung} sesi sedang berlangsung sekarang.`
                : r.sesi_berikut ? `Sesi berikutnya: ${r.sesi_berikut.ujian}, ${r.sesi_berikut.sesi}, ${jam(r.sesi_berikut.mulai)}.` : 'Belum ada sesi terjadwal. Tambahkan sesi di ujian yang aktif.'
              : r.admin ? 'Belum ada ujian yang diaktifkan. Siswa belum melihat jadwal ujian.' : 'Belum ada ujian yang diaktifkan panitia.'}
          </span>
        </div>
      </div>

      {r.admin && (
        <>
          <div className="as-ringkas">
            <div><strong>{r.ujian_aktif}</strong><span>ujian aktif</span></div>
            <div><strong>{r.ujian_draf}</strong><span>ujian draf</span></div>
            <div><strong>{r.mengerjakan ?? 0}</strong><span>siswa mengerjakan</span></div>
            <div><strong>{r.selesai ?? 0}<small> / {r.peserta ?? 0}</small></strong><span>siswa selesai</span></div>
          </div>

          <div className="kartu jarak">
            <h3 style={{ marginTop: 0 }}>Kesiapan ujian</h3>
            <ul className="cek-daftar">
              <Cek ok={aktif} teks="Ada ujian yang diaktifkan" tautan="/asesmen" aksi="Buka daftar ujian" />
              <Cek ok={(r.paket ?? 0) > 0} teks="Paket soal sudah dirakit" tautan="/asesmen" aksi="Rakit paket" />
              <Cek ok={(r.ruang ?? 0) > 0} teks="Ruang ujian sudah dibuat" tautan="/asesmen/ruang" aksi="Tambah ruang" />
              <Cek ok={(r.sesi_tanpa_pengawas ?? 0) === 0} teks={(r.sesi_tanpa_pengawas ?? 0) === 0 ? 'Semua ruang punya pengawas' : `${r.sesi_tanpa_pengawas} ruang belum punya pengawas`} tautan="/asesmen/pengawas" aksi="Atur pengawas" />
              <Cek ok={guru.length > 0 && terisi === guru.length} teks={`Bank soal: ${terisi} dari ${guru.length} mapel guru sudah terisi`} tautan="/asesmen/bank" aksi="Lihat bank soal" />
            </ul>
          </div>
        </>
      )}

      <div className="kartu jarak">
        <div className="judul-bagian">
          <h3 style={{ margin: 0 }}>{r.admin ? 'Pengisian bank soal oleh guru' : 'Mapel yang Anda ajar'}</h3>
          <Link to="/asesmen/bank">Buka bank soal</Link>
        </div>
        {guru.length === 0 ? (
          <p className="catatan">{r.admin ? 'Belum ada guru yang tercatat mengampu kelas di Ruang belajar (LMS). Daftar ini mengikuti kelas ajar yang dibuat guru.' : 'Anda belum punya kelas ajar. Mapel akan muncul di sini setelah kelas dibuat di Kelas saya.'}</p>
        ) : (
          <>
            <div className="belajar-progres" style={{ boxShadow: 'none' }}>
              <div className="belajar-progres-teks">
                <strong>{terisi} dari {guru.length} mapel sudah punya soal</strong>
                {r.admin && <span>{guruBelum} guru masih ada yang belum mengisi</span>}
              </div>
              <div className="belajar-bar" aria-hidden="true"><div style={{ width: `${persen}%` }} /></div>
            </div>
            {r.admin && (
              <div className="chip-bar" role="tablist" aria-label="Saring status">
                {([['semua', 'Semua'], ['belum', 'Belum mengisi'], ['sudah', 'Sudah mengisi']] as const).map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={saring === k} className={'chip' + (saring === k ? ' aktif' : '')} onClick={() => setSaring(k)}>{l}</button>
                ))}
              </div>
            )}
            <div className="tabel-bungkus">
              <table>
                <thead><tr>{r.admin && <th>Guru</th>}<th>Mata pelajaran</th><th>Bank</th><th>Soal</th><th>Status</th></tr></thead>
                <tbody>
                  {tampil.map((g) => (
                    <tr key={g.ptk_id + g.mapel}>
                      {r.admin && <td>{g.guru}</td>}
                      <td>{g.mapel}</td>
                      <td>{g.bank}</td>
                      <td>{g.soal}</td>
                      <td>{sudah(g) ? <span className="status status-selesai">Sudah mengisi</span> : <span className="status status-menunggu">Belum mengisi</span>}{!r.admin && !sudah(g) && <> <Link to={`/asesmen/bank?mapel=${encodeURIComponent(g.mapel)}`}>Buat bank soal</Link></>}</td>
                    </tr>
                  ))}
                  {tampil.length === 0 && <tr><td colSpan={r.admin ? 5 : 4} className="as-kecil">Tidak ada data untuk penyaring ini.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {r.admin && (r.bank_mapel ?? []).length > 0 && (
        <div className="kartu jarak">
          <h3 style={{ marginTop: 0 }}>Mata pelajaran yang sudah punya bank soal</h3>
          <div className="lencana-baris">
            {(r.bank_mapel ?? []).map((m) => <span key={m.mapel} className="status status-selesai">{m.mapel}: {m.bank} bank, {m.soal} soal</span>)}
          </div>
        </div>
      )}
    </>
  )
}
