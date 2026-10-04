import Halaman from '../components/Halaman'
import { useSekolah } from '../lib/profilSekolah'

const DIPERBARUI = '4 Oktober 2026'

export default function Privasi() {
  const sekolah = useSekolah()
  return (
    <Halaman
      judul="Kebijakan Privasi"
      lead={`Cara SIMS ${sekolah.nama} mengumpulkan, memakai, dan melindungi data. Terakhir diperbarui ${DIPERBARUI}.`}
    >
      <div className="kartu" style={{ maxWidth: 820 }}>
        <h3>Ringkasan</h3>
        <p>
          Data di SIMS dipakai untuk layanan pendidikan di sekolah ini. Data tidak dijual, tidak dipakai untuk
          iklan, dan hanya dapat dilihat oleh pihak yang berwenang menurut perannya.
        </p>

        <h3 style={{ marginTop: 20 }}>1. Pengelola</h3>
        <p>
          SIMS adalah sistem informasi manajemen sekolah milik {sekolah.nama} (NPSN {sekolah.npsn}). Sekolah
          menentukan data apa yang diproses dan untuk tujuan apa.
        </p>

        <h3 style={{ marginTop: 20 }}>2. Data yang diproses</h3>
        <ul>
          <li>Data akun: nama, peran (siswa, guru, staf, orang tua, admin), nama pengguna, dan kata sandi. Kata sandi disimpan dalam bentuk sandi acak (hash), bukan teks asli.</li>
          <li>Data pokok pendidikan dari Dapodik: peserta didik, guru, tenaga kependidikan, dan rombongan belajar. Data ini diunggah oleh operator sekolah.</li>
          <li>Data kegiatan belajar: kehadiran, nilai, jawaban kuis dan ulangan, tugas, forum, dan jurnal mengajar.</li>
          <li>Berkas: perangkat ajar guru (RPP, silabus, prota, prosem, rencana aksi), berkas tugas siswa, materi pembelajaran, dan foto kegiatan sekolah.</li>
          <li>Catatan percobaan masuk, untuk mencegah penyalahgunaan akun.</li>
        </ul>

        <h3 style={{ marginTop: 20 }}>3. Tujuan pemakaian</h3>
        <p>
          Menjalankan pembelajaran daring, administrasi guru, pencatatan kehadiran dan nilai, layanan data sekolah,
          dan informasi publik sekolah. Data tidak dipakai untuk tujuan lain tanpa dasar yang sah.
        </p>

        <h3 style={{ marginTop: 20 }}>4. Siapa yang dapat melihat data</h3>
        <ul>
          <li>Siswa melihat data dan kelasnya sendiri.</li>
          <li>Guru melihat kelas yang diampu.</li>
          <li>Orang tua atau wali melihat data anak yang tertaut ke akunnya.</li>
          <li>Tata usaha dan pimpinan melihat data sesuai penugasan resmi.</li>
          <li>Foto galeri kegiatan yang diterbitkan oleh sekolah tampil di laman publik. Data lain tidak tampil di laman publik.</li>
        </ul>

        <h3 style={{ marginTop: 20 }}>5. Penyimpanan berkas di Google Drive</h3>
        <p>
          Berkas yang diunggah disimpan di Google Drive milik sekolah melalui akun yang dikelola pengelola SIMS.
          SIMS memakai izin Google yang terbatas (<code>drive.file</code>). Izin ini hanya memungkinkan SIMS
          mengakses berkas yang dibuat oleh SIMS sendiri. SIMS tidak dapat membaca berkas lain di Drive tersebut.
        </p>
        <p>
          Berkas tidak dibagikan lewat tautan publik. Berkas dibuka melalui SIMS setelah izin pengguna diperiksa.
        </p>
        <p>
          Penggunaan dan pemindahan informasi yang diterima dari Google API oleh SIMS mematuhi{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener noreferrer" target="_blank">
            Google API Services User Data Policy
          </a>
          , termasuk persyaratan Limited Use.
        </p>

        <h3 style={{ marginTop: 20 }}>6. Penyimpanan dan keamanan</h3>
        <p>
          Basis data dijalankan di layanan Supabase dan laman dilayani oleh Vercel. Sambungan memakai HTTPS. Akses
          data dibatasi menurut peran dan penugasan. Kunci akses ke layanan penyimpanan berkas tidak berada di
          peramban pengguna. Tidak ada sistem yang sepenuhnya kebal, sehingga sekolah meminta pengguna menjaga
          kerahasiaan kata sandi dan segera melapor bila akun disalahgunakan.
        </p>
        <p>
          SIMS memakai penyimpanan peramban (local storage) untuk menjaga sesi masuk. SIMS tidak memasang pelacak
          iklan.
        </p>

        <h3 style={{ marginTop: 20 }}>7. Lama penyimpanan</h3>
        <p>
          Data disimpan selama diperlukan untuk administrasi pendidikan sekolah dan kewajiban hukum. Berkas yang
          dihapus oleh pemiliknya atau oleh admin dipindahkan ke tempat sampah Drive sekolah.
        </p>

        <h3 style={{ marginTop: 20 }}>8. Hak pengguna</h3>
        <ul>
          <li>Melihat data pribadi sendiri di portal.</li>
          <li>Mengajukan perbaikan data lewat fitur ajuan perbaikan data di portal, atau langsung ke tata usaha.</li>
          <li>Meminta penghapusan berkas yang diunggah sendiri.</li>
          <li>Untuk siswa di bawah 18 tahun, orang tua atau wali dapat mengajukan permintaan melalui sekolah.</li>
        </ul>
        <p>
          Data pokok yang berasal dari Dapodik mengikuti ketentuan Kementerian Pendidikan Dasar dan Menengah.
          Kebijakan ini mengacu pada Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi.
        </p>

        <h3 style={{ marginTop: 20 }}>9. Perubahan kebijakan</h3>
        <p>Perubahan dimuat di halaman ini. Tanggal pembaruan terakhir tertera di bagian atas.</p>

        <h3 style={{ marginTop: 20 }}>10. Kontak</h3>
        <dl className="daftar">
          <dt>Sekolah</dt><dd>{sekolah.nama}</dd>
          <dt>Alamat</dt><dd>{sekolah.alamat ?? sekolah.wilayah}</dd>
          <dt>Email</dt><dd>{sekolah.email ? <a href={`mailto:${sekolah.email}`}>{sekolah.email}</a> : '-'}</dd>
        </dl>
      </div>
    </Halaman>
  )
}
