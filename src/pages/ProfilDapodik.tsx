// Profil lengkap bergaya formulir Dapodik (F-PTK dan F-PD), hanya baca.
// Semua data datang dari satu fungsi basis data, public.profil_dapodik, yang memeriksa siapa penanyanya.
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'

type J = Record<string, unknown>
type Hasil =
  | { jenis: 'ptk'; data: J; sensitif: J; disamarkan: boolean; wali_kelas_dari: string[] }
  | { jenis: 'siswa'; data: J; sensitif: J; disamarkan: boolean; orang_tua: J[]; rombel: J | null }
  | { jenis: 'daftar_anak'; anak: { id: string; nama: string; nisn: string | null; status: string; rombel: string | null }[] }

const kosong = (x: unknown) => x === null || x === undefined || String(x).trim() === '' || String(x).trim() === '-'
const tampil = (x: unknown) => (kosong(x) ? null : String(x))
const tanggal = (t: unknown) =>
  kosong(t) ? null : new Date(String(t).slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
const gabung = (...a: unknown[]) => a.filter((x) => !kosong(x)).join(', ') || null
const jenisKelamin = (x: unknown) => (x === 'L' ? 'Laki-laki' : x === 'P' ? 'Perempuan' : tampil(x))
const warga = (x: unknown) => (x === 'ID' ? 'Indonesia' : tampil(x))
const angka = (x: unknown, satuan: string) => (kosong(x) || Number(x) === 0 ? null : `${x} ${satuan}`)
const koordinat = (x: unknown) => (kosong(x) || Number(x) === 0 ? null : Number(x).toFixed(6))
const alamatBaris = (d: J) => gabung(d.alamat ?? d.alamat_jalan, d.dusun && `Dusun ${d.dusun}`)
const rtrw = (d: J) => (kosong(d.rt) && kosong(d.rw) ? null : `RT ${tampil(d.rt) ?? '-'} / RW ${tampil(d.rw) ?? '-'}`)

type Baris = [string, ReactNode]

function Bagian({ judul, baris }: { judul: string; baris: Baris[] }) {
  return (
    <section className="kartu bagian-profil" aria-label={judul}>
      <h3>{judul}</h3>
      <dl className="daftar">
        {baris.map(([k, x]) => (
          <Fragment key={k}>
            <dt>{k}</dt>
            <dd>{kosong(x) ? <span className="kosong">Belum diisi</span> : x}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  )
}

function Kepala({ nama, anak, catatan }: { nama: string; anak?: string[]; catatan?: string | null }) {
  return (
    <div className="kartu kepala-profil">
      <div className="inisial" aria-hidden="true">{nama.trim().charAt(0).toUpperCase()}</div>
      <div>
        <h2>{nama}</h2>
        <div className="lencana-baris">{(anak ?? []).filter(Boolean).map((x) => <span key={x} className="lencana">{x}</span>)}</div>
        {catatan && <p className="catatan">{catatan}</p>}
      </div>
    </div>
  )
}

function Perbaikan({ disamarkan }: { disamarkan: boolean }) {
  return (
    <p className="catatan jarak">
      {disamarkan && 'NIK dan nomor kartu ditampilkan sebagian demi keamanan. '}
      Data ini bersumber dari Dapodik. Jika ada yang keliru, sampaikan ke admin TU sekolah. Pengajuan perbaikan langsung dari halaman ini sedang disiapkan.
    </p>
  )
}

function ProfilPtk({ h }: { h: Extract<Hasil, { jenis: 'ptk' }> }) {
  const d = h.data, s = h.sensitif
  const nama = [d.gelar_depan, d.nama].filter((x) => !kosong(x)).join(' ') + (kosong(d.gelar_belakang) ? '' : `, ${d.gelar_belakang}`)
  return (
    <>
      <Kepala nama={nama} anak={[String(d.jenis_ptk ?? ''), String(d.status_kepegawaian ?? ''), kosong(d.jabatan_ptk) ? '' : String(d.jabatan_ptk)]}
        catatan={h.wali_kelas_dari.length ? `Wali kelas ${h.wali_kelas_dari.join(', ')}` : null} />
      <div className="grid grid-2 jarak">
        <Bagian judul="Identitas" baris={[
          ['Nama lengkap', tampil(d.nama)], ['NIK', tampil(s.nik)], ['Jenis kelamin', jenisKelamin(d.jk)],
          ['Tempat, tanggal lahir', gabung(d.tempat_lahir, tanggal(d.tanggal_lahir))], ['Nama ibu kandung', tampil(s.nama_ibu_kandung)],
          ['Agama', tampil(d.agama)], ['Kewarganegaraan', warga(d.kewarganegaraan)],
        ]} />
        <Bagian judul="Alamat dan kontak" baris={[
          ['Alamat', alamatBaris(d)], ['RT / RW', rtrw(d)], ['Kelurahan / desa', tampil(d.kelurahan)], ['Kecamatan', tampil(d.kecamatan)],
          ['Kode pos', tampil(d.kode_pos)], ['No. HP', tampil(d.hp)], ['No. telepon', tampil(d.telepon)], ['Email', tampil(d.email)],
        ]} />
        <Bagian judul="Data pribadi" baris={[
          ['Status kawin', tampil(s.status_perkawinan)], ['Nama suami / istri', tampil(s.nama_pasangan)],
          ['Pekerjaan suami / istri', tampil(s.pekerjaan_pasangan)], ['NIP suami / istri', tampil(s.nip_pasangan)],
          ['NPWP', tampil(s.npwp)], ['Nama wajib pajak', tampil(s.nama_wajib_pajak)],
        ]} />
        <Bagian judul="Kepegawaian" baris={[
          ['Status pegawai', tampil(d.status_kepegawaian)], ['NIP', tampil(d.nip)], ['NUPTK', tampil(d.nuptk)], ['NUKS', tampil(d.nuks)],
          ['Jenis PTK', tampil(d.jenis_ptk)], ['SK pengangkatan', tampil(d.sk_pengangkatan)], ['TMT pengangkatan', tanggal(d.tmt_pengangkatan)],
          ['Lembaga pengangkat', tampil(d.lembaga_pengangkatan)], ['Pangkat / golongan', tampil(d.pangkat_golongan)], ['Sumber gaji', tampil(d.sumber_gaji)],
          ['SK CPNS', tampil(d.sk_cpns)], ['TMT CPNS', tanggal(d.tanggal_cpns)], ['TMT PNS', tanggal(d.tmt_pns)],
          ['TMT kerja', tanggal(d.tmt_kerja)], ['Kartu pegawai', tampil(s.karpeg)], ['Karis / Karsu', tampil(s.karis_karsu)],
        ]} />
        <Bagian judul="Penugasan" baris={[
          ['Jabatan PTK', tampil(d.jabatan_ptk)], ['Tugas tambahan', tampil(d.tugas_tambahan)], ['Mengajar', tampil(d.mengajar)],
          ['Jam mengajar per minggu', tampil(d.jjm)], ['Jam tugas tambahan', tampil(d.jam_tugas_tambahan)], ['Total jam per minggu', tampil(d.total_jjm)],
          ['Jumlah siswa diajar', tampil(d.jml_siswa)],
        ]} />
        <Bagian judul="Pendidikan dan kompetensi" baris={[
          ['Jenjang pendidikan terakhir', tampil(d.jenjang_pendidikan)], ['Program studi', tampil(d.jurusan_prodi)],
          ['Sertifikasi', tampil(d.sertifikasi)], ['Kompetensi', tampil(d.kompetensi)],
          ['Lisensi kepala sekolah', tampil(d.sudah_lisensi_kepsek)], ['Diklat kepengawasan', tampil(d.pernah_diklat_kepengawasan)],
          ['Keahlian braille', tampil(d.keahlian_braille)], ['Keahlian bahasa isyarat', tampil(d.keahlian_bahasa_isyarat)],
        ]} />
      </div>
      <Sinkron d={d} />
    </>
  )
}

function Sinkron({ d }: { d: J }) {
  const t = tanggal(d.diperbarui_pada)
  return t ? <p className="catatan jarak">Data terakhir disinkronkan dari Dapodik pada {t}.</p> : null
}

function ProfilSiswa({ h }: { h: Extract<Hasil, { jenis: 'siswa' }> }) {
  const d = h.data, s = h.sensitif, r = h.rombel
  const wali = (hub: string) => h.orang_tua.find((o) => o.hubungan === hub)
  const orangTua = (hub: string): Baris[] => {
    const o = wali(hub) ?? {}
    return [
      ['Nama', tampil(o.nama)], ['Tahun lahir', tampil(o.tahun_lahir)], ['Pendidikan', tampil(o.jenjang_pendidikan)],
      ['Pekerjaan', tampil(o.pekerjaan)], ['Penghasilan bulanan', tampil(o.penghasilan)], ['Berkebutuhan khusus', tampil(o.kebutuhan_khusus)],
    ]
  }
  const status = String(d.status_peserta_didik ?? '')
  return (
    <>
      <Kepala nama={String(d.nama)} anak={[
        status === 'aktif' ? 'Peserta didik aktif' : status === 'lulus' ? 'Lulus' : status === 'mutasi' ? 'Mutasi' : status,
        r ? String(r.nama) : '',
      ]} catatan={r && !kosong(r.wali_kelas) ? `Wali kelas ${r.wali_kelas}` : null} />
      <div className="grid grid-2 jarak">
        <Bagian judul="Identitas peserta didik" baris={[
          ['Nama lengkap', tampil(d.nama)], ['Jenis kelamin', jenisKelamin(d.jk)], ['NISN', tampil(d.nisn)], ['NIPD', tampil(d.nipd)],
          ['NIK', tampil(s.nik)], ['No. KK', tampil(s.no_kk)], ['Tempat, tanggal lahir', gabung(d.tempat_lahir, tanggal(d.tanggal_lahir))],
          ['Agama', tampil(d.agama)], ['Berkebutuhan khusus', tampil(d.kebutuhan_khusus)], ['No. registrasi akta lahir', tampil(s.no_registrasi_akta_lahir)],
          ['Sekolah asal', tampil(d.sekolah_asal)], ['Anak ke', tampil(d.anak_ke)],
        ]} />
        <Bagian judul="Alamat dan kontak" baris={[
          ['Alamat', alamatBaris(d)], ['RT / RW', rtrw(d)], ['Kelurahan / desa', tampil(d.kelurahan)], ['Kecamatan', tampil(d.kecamatan)],
          ['Kode pos', tampil(d.kode_pos)], ['Jenis tinggal', tampil(d.jenis_tinggal)], ['Alat transportasi', tampil(d.alat_transportasi)],
          ['No. telepon rumah', tampil(d.telepon)], ['No. HP', tampil(d.hp)], ['Email', tampil(d.email)],
          ['Lintang', koordinat(d.lintang)], ['Bujur', koordinat(d.bujur)],
        ]} />
        <Bagian judul="Data ayah kandung" baris={orangTua('ayah')} />
        <Bagian judul="Data ibu kandung" baris={orangTua('ibu')} />
        <Bagian judul="Data wali" baris={orangTua('wali')} />
        <Bagian judul="Data periodik" baris={[
          ['Tinggi badan', angka(d.tinggi_badan, 'cm')], ['Berat badan', angka(d.berat_badan, 'kg')], ['Lingkar kepala', angka(d.lingkar_kepala, 'cm')],
          ['Jarak rumah ke sekolah', angka(d.jarak_rumah_km, 'km')], ['Jumlah saudara kandung', tampil(d.jml_saudara_kandung)],
        ]} />
        <Bagian judul="Kesejahteraan" baris={[
          ['Penerima KPS', tampil(d.penerima_kps)], ['No. KPS', tampil(s.no_kps)], ['No. KKS', tampil(s.nomor_kks)],
          ['Penerima KIP', tampil(s.penerima_kip)], ['No. KIP', tampil(s.nomor_kip)], ['Nama tertera di KIP', tampil(s.nama_di_kip)],
          ['Layak PIP', tampil(d.layak_pip)], ['Alasan layak PIP', tampil(d.alasan_layak_pip)],
        ]} />
        <Bagian judul="Rombongan belajar" baris={r ? [
          ['Rombel', tampil(r.nama)], ['Tingkat', tampil(r.tingkat)], ['Wali kelas', tampil(r.wali_kelas)],
          ['Kurikulum', tampil(r.kurikulum)], ['Ruangan', tampil(r.ruangan)],
        ] : [['Rombel', null]]} />
        {status !== 'aktif' && (
          <Bagian judul="Status keluar" baris={[
            ['Status', tampil(status)], ['Tanggal keluar', tanggal(d.tanggal_keluar)], ['Alasan keluar', tampil(d.alasan_keluar)],
          ]} />
        )}
      </div>
      <Sinkron d={d} />
    </>
  )
}

function useProfil(jenis?: string, id?: string) {
  const [hasil, setHasil] = useState<Hasil | null | undefined>(undefined)
  const [galat, setGalat] = useState('')
  useEffect(() => {
    let batal = false
    setHasil(undefined)
    setGalat('')
    supabase.rpc('profil_dapodik', { p_jenis: jenis ?? null, p_id: id ?? null }).then(({ data, error }) => {
      if (batal) return
      if (error) { setGalat(error.message); setHasil(null); return }
      setHasil((data as Hasil | null) ?? null)
    })
    return () => { batal = true }
  }, [jenis, id])
  return { hasil, galat }
}

function Isi({ hasil, galat }: { hasil: Hasil | null | undefined; galat: string }) {
  if (hasil === undefined) return <p className="catatan">Memuat profil...</p>
  if (galat) return <p className="catatan" role="alert">Gagal memuat profil: {galat}</p>
  if (!hasil) return <p className="catatan">Profil tidak ditemukan, atau Anda tidak berhak melihatnya.</p>
  if (hasil.jenis === 'ptk') return <><ProfilPtk h={hasil} /><Perbaikan disamarkan={false} /></>
  if (hasil.jenis === 'siswa') return <><ProfilSiswa h={hasil} /><Perbaikan disamarkan={hasil.disamarkan} /></>
  return null
}

/** Guru, tendik, dan siswa melihat profil mereka sendiri. */
export function ProfilSendiri() {
  const { profil } = useAuth()
  const { hasil, galat } = useProfil()
  return (
    <Halaman judul={profil?.peran === 'siswa' ? 'Data saya' : 'Profil saya'} lead="Data pribadi Anda seperti tercatat di Dapodik.">
      <Isi hasil={hasil} galat={galat} />
      <p className="catatan jarak"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

/** Orang tua: daftar anak yang ditautkan oleh TU. */
export function DaftarAnak() {
  const { hasil, galat } = useProfil()
  return (
    <Halaman judul="Anak saya" lead="Anak yang ditautkan ke akun Anda oleh admin TU.">
      {hasil === undefined && <p className="catatan">Memuat...</p>}
      {galat && <p className="catatan" role="alert">{galat}</p>}
      {hasil?.jenis === 'daftar_anak' && (hasil.anak.length === 0
        ? <p className="catatan">Belum ada anak yang ditautkan. Hubungi admin TU sekolah.</p>
        : <div className="grid grid-3">{hasil.anak.map((a) => (
            <Link key={a.id} to={`/portal/profil/siswa/${a.id}`} className="kartu tautan">
              <h3>{a.nama}</h3><small>{[a.rombel, a.nisn && `NISN ${a.nisn}`].filter(Boolean).join(' · ') || a.status}</small>
            </Link>))}</div>)}
      <p className="catatan jarak"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

/** Admin TU melihat siapa pun, orang tua melihat anaknya. */
export function ProfilOrang() {
  const { jenis, id } = useParams()
  const { profil } = useAuth()
  const valid = (jenis === 'ptk' || jenis === 'siswa') && !!id
  const { hasil, galat } = useProfil(valid ? jenis : undefined, valid ? id : undefined)
  const balik = profil?.peran === 'orang_tua' ? '/portal/anak' : jenis === 'ptk' ? '/portal/ptk' : '/portal/peserta-didik'
  return (
    <Halaman judul={jenis === 'ptk' ? 'Profil guru dan tendik' : 'Profil peserta didik'} lead="Tampilan formulir Dapodik, hanya baca.">
      {valid ? <Isi hasil={hasil} galat={galat} /> : <p className="catatan">Alamat tidak valid.</p>}
      <p className="catatan jarak"><Link to={balik}>Kembali</Link></p>
    </Halaman>
  )
}
