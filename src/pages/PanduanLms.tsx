import Halaman from '../components/Halaman'
import { useAuth } from '../auth/AuthContext'

// Panduan singkat di dalam aplikasi, ditampilkan sesuai peran.

export default function PanduanLms() {
  const { profil } = useAuth()
  const siswa = profil?.peran === 'siswa'
  return (
    <Halaman judul="Panduan singkat ruang belajar" lead={siswa ? 'Lima langkah untuk mengikuti pertemuan dari HP.' : 'Urutan menyiapkan dan menjalankan satu pertemuan.'}>
      {siswa ? (
        <ol className="panduan">
          <li><strong>Masuk dan buka kelas.</strong> Menu Ruang belajar menampilkan kelas Anda. Di halaman utama, daftar "Yang perlu Anda kerjakan" menunjukkan absen, tugas, dan latihan yang menunggu.</li>
          <li><strong>Absen dulu.</strong> Buka pertemuan, masukkan kode 4 digit dari guru bila diminta, tekan Saya hadir. Materi baru terbuka setelah absen. Bila absen belum dibuka, tunggu guru lalu tekan Segarkan.</li>
          <li><strong>Baca bahan bacaan (wajib).</strong> Geser ke bawah, lalu tekan Tandai sudah selesai di setiap bacaan. Lembar kerja baru terbuka setelah semua bacaan selesai.</li>
          <li><strong>Isi lembar kerja.</strong> Absen, baca, dan lembar kerja membentuk nilai pertemuan. Ketik jawaban langsung di kolom yang tersedia. Jawaban tersimpan otomatis sebagai draf, jadi aman bila sinyal putus. Tambahkan foto bila ada, lalu tekan Kumpulkan. Boleh kumpul ulang sampai guru menilai.</li>
          <li><strong>Diskusi dan kuis.</strong> Di Diskusi, tanyakan atau komentari bahan bacaan dan lembar kerja. Kuis, bila ada, opsional dan menambah nilai pertemuan (waktu dihitung server).</li>
        </ol>
      ) : (
        <ol className="panduan">
          <li><strong>Buat kelas ajar</strong> dari tombol di halaman Ruang belajar (pilih rombel dan mata pelajaran).</li>
          <li><strong>Buat pertemuan</strong> lalu impor tiga dokumen Word: Bahan Bacaan (bacaan siswa), Lembar Kerja (siswa mengisi langsung), dan File Pertemuan (handout Anda, pilih Guru saja). Forum dibuat otomatis, kuis opsional.</li>
          <li><strong>Periksa dengan pratinjau.</strong> Centang Lihat sebagai siswa untuk melihat tampilan siswa tanpa menyimpan apa pun.</li>
          <li><strong>Terbitkan.</strong> Tombol aktif bila bahan bacaan dan lembar kerja sudah ada. Bila darurat, pakai Terbitkan sekarang walau belum lengkap. Salin ke kelas lain agar tidak mengetik ulang.</li>
          <li><strong>Jalankan di kelas.</strong> Buka absen dan bagikan kode. Rekap pertemuan menyegarkan diri tiap 20 detik: filter Belum absen atau Belum mengumpulkan lembar menunjukkan siapa yang perlu didatangi. Siswa yang terlewat bisa diabsen manual.</li>
          <li><strong>Nilai dan tindak lanjut.</strong> Daftar pengingat di halaman utama menunjukkan esai yang perlu dikoreksi dan pengumpulan yang belum dinilai. Lembar siswa dibuka lewat tombol Lihat lembar di halaman Tugas.</li>
        </ol>
      )}
      <p className="catatan">Lupa kata sandi atau akun bermasalah: hubungi admin TU sekolah.</p>
    </Halaman>
  )
}
