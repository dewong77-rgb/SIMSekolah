import Halaman from '../components/Halaman'
import { useAuth } from '../auth/AuthContext'

// Panduan singkat di dalam aplikasi, ditampilkan sesuai peran.

export default function PanduanLms() {
  const { profil } = useAuth()
  const siswa = profil?.peran === 'siswa'
  return (
    <Halaman judul="Panduan singkat ruang belajar" lead={siswa ? 'Langkah mengikuti pertemuan dari HP.' : 'Urutan menyiapkan dan menjalankan satu pertemuan.'}>
      {siswa ? (
        <ol className="panduan">
          <li><strong>Masuk dan buka kelas.</strong> Halaman utama menampilkan pertemuan yang perlu Anda kerjakan sekarang untuk tiap mata pelajaran. Ketuk Mulai belajar.</li>
          <li><strong>Baca bahan bacaan (wajib).</strong> Geser ke bawah, lalu tekan Tandai sudah selesai di setiap bacaan. Kehadiran Anda tercatat otomatis, tidak perlu absen.</li>
          <li><strong>Isi lembar kerja.</strong> Ketik jawaban langsung di kolom yang tersedia. Jawaban tersimpan otomatis sebagai draf, jadi aman bila sinyal putus. Tambahkan foto bila ada, lalu tekan Kumpulkan. Boleh kumpul ulang sampai guru menilai.</li>
          <li><strong>Selesaikan secara berurutan.</strong> Pertemuan berikutnya terbuka setelah bahan bacaan dan lembar kerja pertemuan sebelumnya selesai. Pertemuan yang ditutup guru tidak bisa dibuka.</li>
          <li><strong>Diskusi dan kuis.</strong> Di Diskusi, tanyakan atau komentari bahan bacaan dan lembar kerja. Kuis, bila ada, opsional dan menambah nilai pertemuan.</li>
        </ol>
      ) : (
        <ol className="panduan">
          <li><strong>Buat kelas ajar</strong> dari tombol di halaman Ruang belajar (pilih rombel dan mata pelajaran).</li>
          <li><strong>Buat pertemuan</strong> dari Dashboard pembelajaran (centang kelas, atau ambil dari Rencana ajar), lalu impor tiga dokumen Word: Bahan Bacaan, Lembar Kerja, dan File Pertemuan (handout Anda, pilih Guru saja).</li>
          <li><strong>Aktif otomatis.</strong> Begitu bahan bacaan dan lembar kerja ada, pertemuan aktif di semua kelas yang Anda ampu, topik diskusi dibuat, dan kehadiran siswa tercatat dari aktivitas mereka (baca, lembar kerja, forum). Kuis opsional.</li>
          <li><strong>Atur akses.</strong> Panel Akses siswa menutup atau membuka pertemuan kapan saja, atau memberi batas waktu (1 hari sampai 1 bulan, atau tanggal tertentu). Siswa wajib menuntaskan pertemuan yang terbuka sebelum membuka berikutnya.</li>
          <li><strong>Pantau.</strong> Dashboard dan Rekap pertemuan menyegarkan diri otomatis: filter Belum mengumpulkan lembar menunjukkan siapa yang perlu didatangi, dan forum menunggu balasan tampil di dashboard. Kehadiran bisa diubah manual bila perlu.</li>
          <li><strong>Nilai dan tindak lanjut.</strong> Daftar pengingat di halaman utama menunjukkan esai yang perlu dikoreksi dan pengumpulan yang belum dinilai.</li>
        </ol>
      )}
      <p className="catatan">Lupa kata sandi atau akun bermasalah: hubungi admin TU sekolah.</p>
    </Halaman>
  )
}
