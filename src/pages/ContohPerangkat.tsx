import { useEffect, useState } from 'react'
import { Dokumen, type Ctx } from './PerangkatAjar'
import { panggil } from '../lib/rpc'

// Contoh format perangkat ajar untuk guru yang dokumennya masih kosong.
// TP, ATP, KKTP, Silabus, Prota, dan Promes memakai penyaji dokumen yang sama dengan dokumen asli, diisi data contoh.
// Modul Ajar dan RPP berupa kerangka bagian dengan petunjuk isi, bisa diunduh sebagai berkas Word.
// Semua isi hanyalah ilustrasi pengisian, bukan keputusan kurikulum sekolah.

const T = (kode: string, semester: number, el: string, nm: string, cap: string, rumusan: string, jp: number, kriteria: string) =>
  ({ elemen_kode: el, elemen_nama: nm, capaian: cap, semester, kode, rumusan, alokasi_jp: jp, kriteria, nilai_tuntas: 75, mapel: 'Informatika', tingkat: 'X', urutan: 0 })

const CAP_BK = 'Contoh: peserta didik mampu menerapkan strategi algoritmik untuk menyelesaikan persoalan.'
const CAP_TIK = 'Contoh: peserta didik mampu memanfaatkan perangkat lunak untuk mengolah dan menyajikan informasi.'
const CAP_AP = 'Contoh: peserta didik mampu menyusun program sederhana dengan struktur kendali.'

const tp = [
  T('BK-1', 1, 'BK', 'Berpikir Komputasional', CAP_BK, 'Contoh: Peserta didik mampu menguraikan persoalan sehari-hari menjadi langkah-langkah yang lebih kecil (dekomposisi).', 4, 'Contoh: Mampu menguraikan minimal satu persoalan menjadi tiga langkah atau lebih secara runtut.'),
  T('BK-2', 1, 'BK', 'Berpikir Komputasional', CAP_BK, 'Contoh: Peserta didik mampu menyusun algoritma dalam bentuk diagram alir untuk persoalan sederhana.', 6, 'Contoh: Diagram alir memuat mulai, proses, keputusan, dan selesai dengan benar.'),
  T('TIK-1', 1, 'TIK', 'Teknologi Informasi dan Komunikasi', CAP_TIK, 'Contoh: Peserta didik mampu mengolah data sederhana menggunakan perangkat lunak lembar kerja.', 6, 'Contoh: Mampu memakai rumus dasar dan membuat satu grafik dari data.'),
  T('AP-1', 2, 'AP', 'Algoritma dan Pemrograman', CAP_AP, 'Contoh: Peserta didik mampu menulis program sederhana dengan percabangan dan perulangan.', 8, 'Contoh: Program berjalan tanpa galat dan menghasilkan keluaran sesuai soal.'),
  T('AP-2', 2, 'AP', 'Algoritma dan Pemrograman', CAP_AP, 'Contoh: Peserta didik mampu menguji dan memperbaiki program yang dibuatnya.', 6, 'Contoh: Mampu menemukan dan memperbaiki minimal satu kesalahan pada programnya.'),
]

const M = (semester: number, nomor: number | null, mulai: string, selesai: string, el: string | null, materi: string | null, jp: number | null, kode: string | null, ket: string | null, efektif: boolean, urutan: number) =>
  ({ id: `c${urutan}`, mapel: 'Informatika', tingkat: 'X', urutan, semester, nomor, tanggal_mulai: mulai, tanggal_selesai: selesai, elemen_kode: el, materi_pokok: materi, jp, tp_kode: kode, keterangan: ket, efektif })

const mg = [
  M(1, null, '2026-07-13', '2026-07-18', null, null, null, null, 'Contoh: masa pengenalan lingkungan sekolah', false, 1),
  M(1, 1, '2026-07-20', '2026-07-25', 'BK', 'Contoh: Dekomposisi persoalan', 2, 'BK-1', null, true, 2),
  M(1, 2, '2026-07-27', '2026-08-01', 'BK', 'Contoh: Dekomposisi persoalan (latihan)', 2, 'BK-1', null, true, 3),
  M(1, 3, '2026-08-03', '2026-08-08', 'BK', 'Contoh: Algoritma dan diagram alir', 2, 'BK-2', null, true, 4),
  M(1, 4, '2026-08-10', '2026-08-15', 'BK', 'Contoh: Diagram alir percabangan', 2, 'BK-2', null, true, 5),
  M(1, null, '2026-08-17', '2026-08-22', null, null, null, null, 'Contoh: libur nasional dan cuti bersama', false, 6),
  M(1, 5, '2026-08-24', '2026-08-29', 'TIK', 'Contoh: Lembar kerja dan rumus dasar', 2, 'TIK-1', null, true, 7),
  M(1, 6, '2026-08-31', '2026-09-05', 'TIK', 'Contoh: Grafik dan penyajian data', 2, 'TIK-1', null, true, 8),
  M(2, 7, '2027-01-04', '2027-01-09', 'AP', 'Contoh: Percabangan dalam program', 2, 'AP-1', null, true, 9),
  M(2, 8, '2027-01-11', '2027-01-16', 'AP', 'Contoh: Perulangan dalam program', 2, 'AP-1', null, true, 10),
  M(2, 9, '2027-01-18', '2027-01-23', 'AP', 'Contoh: Menguji dan memperbaiki program', 2, 'AP-2', null, true, 11),
]

export const contohCtx: Ctx = {
  tp, mg, mapel: 'Informatika', tingkat: 'X', rombel: ['X TKJ 1', 'X TKJ 2'], tahun: '2026/2027',
  pf: {
    satuan: 'Nama Sekolah (contoh)', fase: 'E', program_keahlian: 'Nama Program Keahlian (contoh)', alokasi_waktu: '2 JP per minggu (contoh)', penyusun: 'Nama Guru (contoh)',
    dasar_hukum: 'Contoh: peraturan yang menjadi acuan penyusunan\nContoh: keputusan tentang capaian pembelajaran',
    cp_umum: 'Contoh: tuliskan Capaian Pembelajaran umum fase sesuai dokumen resmi.',
    catatan_prota: 'Contoh: catatan tentang alokasi waktu dan kegiatan sekolah yang memengaruhi jadwal.',
    kepala: 'Nama Kepala Sekolah (contoh)', nip_kepala: '000000000000000000', nip_guru: '000000000000000000', kota: 'Kota (contoh)', tanggal: 'Juli 2026',
  },
}

export type Seksi = { judul: string; petunjuk?: string; baris?: [string, string][]; butir?: string[]; tabel?: { kepala: string[]; isi: string[][] } }
const ISI = '[isi di sini]'

export const KERANGKA: Record<'modul_ajar' | 'rpp', { judul: string; seksi: Seksi[] }> = {
  modul_ajar: {
    judul: 'Modul Ajar',
    seksi: [
      { judul: 'A. Informasi Umum', petunjuk: 'Identitas modul dan gambaran umum pembelajaran.', baris: [
        ['Nama penyusun', ISI], ['Satuan pendidikan', ISI], ['Tahun pelajaran', ISI], ['Mata pelajaran', ISI], ['Fase / kelas', ISI],
        ['Elemen dan topik', ISI], ['Alokasi waktu', 'Contoh: 2 x 45 menit, 1 pertemuan'], ['Kompetensi awal', 'Apa yang sudah dikuasai peserta didik sebelum topik ini.'],
        ['Profil lulusan / profil pelajar', 'Dimensi yang dikuatkan melalui pembelajaran ini, sesuaikan dengan kebijakan sekolah.'],
        ['Sarana dan prasarana', 'Perangkat, laboratorium, jaringan, bahan, atau media yang dipakai.'], ['Target peserta didik', 'Reguler, kesulitan belajar, atau berkemampuan tinggi.'],
        ['Model pembelajaran', 'Contoh: pembelajaran berbasis proyek, diskusi, atau praktik langsung.'],
      ] },
      { judul: 'B. Komponen Inti', petunjuk: 'Bagian utama yang menjelaskan tujuan, kegiatan, dan penilaian.', baris: [
        ['Tujuan pembelajaran', 'Salin atau turunkan dari TP pada ATP. Rumuskan dengan kompetensi dan lingkup materi yang jelas.'],
        ['Pemahaman bermakna', 'Manfaat atau gagasan penting yang akan dipahami peserta didik.'],
        ['Pertanyaan pemantik', 'Pertanyaan pembuka yang mengundang rasa ingin tahu.'],
        ['Persiapan pembelajaran', 'Apa yang perlu disiapkan guru dan peserta didik sebelum pertemuan.'],
      ] },
      { judul: 'C. Kegiatan Pembelajaran', petunjuk: 'Tuliskan langkah dan alokasi waktu setiap kegiatan.', tabel: { kepala: ['Kegiatan', 'Deskripsi', 'Waktu'], isi: [
        ['Pendahuluan', 'Salam, doa, presensi, apersepsi, pertanyaan pemantik, penyampaian tujuan.', '10 menit'],
        ['Inti', 'Langkah pembelajaran sesuai model: mengamati, mencoba, berdiskusi, menyajikan.', '70 menit'],
        ['Penutup', 'Rangkuman, refleksi, umpan balik, dan informasi pertemuan berikutnya.', '10 menit'],
      ] } },
      { judul: 'D. Asesmen', petunjuk: 'Sesuaikan dengan KKTP pada dokumen KKTP.', tabel: { kepala: ['Jenis', 'Teknik dan instrumen', 'Waktu'], isi: [
        ['Diagnostik', 'Contoh: pertanyaan lisan atau kuis singkat di awal.', 'Awal pertemuan'],
        ['Formatif', 'Contoh: pengamatan, tugas harian, lembar kerja di LMS.', 'Selama pembelajaran'],
        ['Sumatif', 'Contoh: kuis akhir bab atau proyek dengan rubrik.', 'Akhir topik'],
      ] } },
      { judul: 'E. Pengayaan dan Remedial', baris: [['Pengayaan', 'Kegiatan untuk peserta didik yang sudah tuntas.'], ['Remedial', 'Kegiatan untuk peserta didik yang belum tuntas.']] },
      { judul: 'F. Refleksi', baris: [['Refleksi guru', 'Apa yang berjalan baik dan perlu diperbaiki.'], ['Refleksi peserta didik', 'Apa yang dipahami dan masih membingungkan.']] },
      { judul: 'G. Lampiran', butir: ['Lembar kerja peserta didik (LKPD)', 'Bahan bacaan guru dan peserta didik', 'Rubrik penilaian', 'Glosarium', 'Daftar pustaka'] },
    ],
  },
  rpp: {
    judul: 'Rencana Pelaksanaan Pembelajaran (RPP)',
    seksi: [
      { judul: 'A. Identitas', baris: [['Satuan pendidikan', ISI], ['Mata pelajaran', ISI], ['Kelas / semester', ISI], ['Materi pokok', ISI], ['Alokasi waktu', ISI]] },
      { judul: 'B. Tujuan Pembelajaran', petunjuk: 'Satu atau beberapa tujuan yang dapat diamati dan diukur.', butir: ['Tujuan pembelajaran 1', 'Tujuan pembelajaran 2'] },
      { judul: 'C. Materi Pokok', butir: ['Pokok bahasan 1', 'Pokok bahasan 2'] },
      { judul: 'D. Pendekatan, Model, dan Metode', baris: [['Pendekatan', ISI], ['Model', ISI], ['Metode', ISI]] },
      { judul: 'E. Media dan Sumber Belajar', baris: [['Media', ISI], ['Alat dan bahan', ISI], ['Sumber belajar', ISI]] },
      { judul: 'F. Langkah Kegiatan', tabel: { kepala: ['Tahap', 'Kegiatan', 'Waktu'], isi: [
        ['Pendahuluan', 'Orientasi, apersepsi, motivasi, dan penyampaian tujuan.', '10 menit'],
        ['Inti', 'Kegiatan belajar peserta didik secara berurutan.', '70 menit'],
        ['Penutup', 'Rangkuman, refleksi, dan tindak lanjut.', '10 menit'],
      ] } },
      { judul: 'G. Penilaian', tabel: { kepala: ['Aspek', 'Teknik', 'Instrumen'], isi: [
        ['Sikap', 'Pengamatan', 'Lembar pengamatan'], ['Pengetahuan', 'Tes tertulis atau kuis', 'Soal dan kunci jawaban'], ['Keterampilan', 'Praktik atau proyek', 'Rubrik'],
      ] } },
      { judul: 'H. Pengesahan', baris: [['Mengetahui, Kepala Sekolah', 'Nama dan NIP'], ['Guru mata pelajaran', 'Nama dan NIP']] },
    ],
  },
}

function Kerangka({ jenis }: { jenis: 'modul_ajar' | 'rpp' }) {
  const k = KERANGKA[jenis]
  return (
    <article className="dokumen-ajar">
      <h2 style={{ textAlign: 'center', margin: '0 0 12px' }}>{k.judul.toUpperCase()}</h2>
      {k.seksi.map((s) => (
        <section key={s.judul} className="jarak">
          <h3>{s.judul}</h3>
          {s.petunjuk && <p className="catatan"><em>{s.petunjuk}</em></p>}
          {s.baris && <div className="tabel-bungkus"><table><tbody>{s.baris.map(([a, b]) => <tr key={a}><td style={{ width: '30%' }}><strong>{a}</strong></td><td>{b}</td></tr>)}</tbody></table></div>}
          {s.butir && <ul>{s.butir.map((b) => <li key={b}>{b}</li>)}</ul>}
          {s.tabel && <div className="tabel-bungkus"><table><thead><tr>{s.tabel.kepala.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{s.tabel.isi.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>}
        </section>
      ))}
    </article>
  )
}

const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Mengunduh kerangka sebagai berkas .doc (HTML yang dibuka Word, Google Dokumen, atau LibreOffice). */
export function unduhTemplateDokumen(jenis: 'modul_ajar' | 'rpp') {
  const k = KERANGKA[jenis]
  const bagian = k.seksi.map((s) => {
    let h = `<h3>${esc(s.judul)}</h3>`
    if (s.petunjuk) h += `<p><i>${esc(s.petunjuk)}</i></p>`
    if (s.baris) h += `<table border="1" cellspacing="0" cellpadding="6" width="100%">${s.baris.map(([a, b]) => `<tr><td width="30%"><b>${esc(a)}</b></td><td>${esc(b)}</td></tr>`).join('')}</table>`
    if (s.butir) h += `<ul>${s.butir.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
    if (s.tabel) h += `<table border="1" cellspacing="0" cellpadding="6" width="100%"><tr>${s.tabel.kepala.map((x) => `<th>${esc(x)}</th>`).join('')}</tr>${s.tabel.isi.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`
    return h
  }).join('')
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(k.judul)}</title></head><body style="font-family:Calibri,Arial,sans-serif;font-size:11pt"><h2 style="text-align:center">${esc(k.judul.toUpperCase())}</h2>${bagian}</body></html>`
  const url = URL.createObjectURL(new Blob(['﻿', html], { type: 'application/msword' }))
  const a = document.createElement('a')
  a.href = url; a.download = `template-${jenis.replace('_', '-')}.doc`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

type Sumber = { ptk_id: string; guru: string; mapel: string; tingkat: string; jumlah_tp: number; milik_saya: boolean }
type Isi = { guru: string; tp: Ctx['tp']; mg: Ctx['mg']; pf: Ctx['pf'] }

function ctxDari(sumber: Sumber, isi: { tp: Ctx['tp']; minggu: Ctx['mg']; profil: Ctx['pf'] }): Ctx {
  const awal = isi.minggu.map((m) => m.tanggal_mulai).filter((x): x is string => !!x).sort()[0]
  const th = awal ? (Number(awal.slice(5, 7)) >= 7 ? Number(awal.slice(0, 4)) : Number(awal.slice(0, 4)) - 1) : null
  return { tp: isi.tp, mg: isi.minggu, pf: isi.profil, mapel: sumber.mapel, tingkat: sumber.tingkat, rombel: [], tahun: th ? `${th}/${th + 1}` : '' }
}

/** Menyalin contoh bersama ke Rencana ajar milik guru yang sedang masuk (titik awal untuk diubah). */
function SalinContoh({ isi, sumber }: { isi: Isi; sumber: Sumber }) {
  const [v, setV] = useState({ mapel: '', tingkat: sumber.tingkat })
  const [pesan, setPesan] = useState('')
  const [sibuk, setSibuk] = useState(false)
  async function salin() {
    const mapel = v.mapel.trim(); const tingkat = v.tingkat.trim().toUpperCase()
    if (!mapel || !tingkat) { setPesan('Isi mata pelajaran dan tingkat dulu.'); return }
    setSibuk(true); setPesan('')
    try {
      const saya = await panggil<{ tp: { mapel: string; tingkat: string }[]; minggu: { mapel: string; tingkat: string }[] }>('lms_rencana_saya')
      const ada = [...saya.tp, ...saya.minggu].some((x) => x.mapel.toLowerCase() === mapel.toLowerCase() && x.tingkat === tingkat)
      if (ada && !window.confirm(`Rencana ${mapel} kelas ${tingkat} Anda sudah ada dan akan DIGANTI dengan contoh ini. Lanjutkan?`)) { setSibuk(false); return }
      const h = await panggil<{ tp: number; minggu: number }>('lms_rencana_ganti', {
        p_mapel: mapel, p_tingkat: tingkat,
        p_tp: isi.tp.map(({ elemen_kode, elemen_nama, capaian, semester, kode, rumusan, alokasi_jp, kriteria, nilai_tuntas }) => ({ elemen_kode, elemen_nama, capaian, semester, kode, rumusan, alokasi_jp, kriteria, nilai_tuntas })),
        p_minggu: isi.mg.map(({ semester, nomor, tanggal_mulai, tanggal_selesai, elemen_kode, materi_pokok, jp, tp_kode, keterangan, efektif }) => ({ semester, nomor, tanggal_mulai, tanggal_selesai, elemen_kode, materi_pokok, jp, tp_kode, keterangan, efektif })),
      })
      setPesan(`Tersalin: ${h.tp} TP dan ${h.minggu} baris program semester ke Rencana ajar ${mapel} kelas ${tingkat}. Buka Rencana ajar untuk menyesuaikan isinya.`)
    } catch (e) { setPesan((e as Error).message) }
    setSibuk(false)
  }
  return (
    <div className="kartu jarak tanpa-cetak">
      <h3 style={{ marginTop: 0 }}>Pakai sebagai titik awal</h3>
      <p className="catatan">Salin contoh ini ke Rencana ajar Anda, lalu ubah sesuai mata pelajaran dan kelas Anda. Tanggal program semester perlu disesuaikan dengan kalender sekolah.</p>
      <div className="form">
        <div className="grid grid-2">
          <label>Mata pelajaran Anda<input value={v.mapel} onChange={(e) => setV({ ...v, mapel: e.target.value })} placeholder="Nama mata pelajaran" /></label>
          <label>Tingkat<input value={v.tingkat} onChange={(e) => setV({ ...v, tingkat: e.target.value })} style={{ maxWidth: 90 }} /></label>
        </div>
        <div className="aksi"><button type="button" className="tombol tombol-isi" disabled={sibuk} onClick={() => void salin()}>{sibuk ? 'Menyalin...' : 'Salin ke Rencana ajar saya'}</button></div>
      </div>
      {pesan && <p className="catatan" role="status">{pesan}</p>}
    </div>
  )
}

/** Contoh format satu jenis perangkat ajar. Memakai rencana ajar yang dibagikan guru sekolah bila ada, jika tidak contoh bawaan. */
export function ContohFormat({ jenis }: { jenis: string }) {
  const dok = jenis === 'modul_ajar' || jenis === 'rpp'
  const [daftar, setDaftar] = useState<Sumber[]>([])
  const [pilih, setPilih] = useState('')
  const [isi, setIsi] = useState<Isi | null>(null)
  useEffect(() => {
    if (dok) return
    panggil<Sumber[]>('lms_rencana_contoh_daftar').then((d) => { setDaftar(d); setPilih(d.length ? `${d[0].ptk_id}|${d[0].mapel}|${d[0].tingkat}` : '') }).catch(() => undefined)
  }, [dok])
  const sumber = daftar.find((x) => `${x.ptk_id}|${x.mapel}|${x.tingkat}` === pilih)
  useEffect(() => {
    setIsi(null)
    if (!sumber) return
    let batal = false
    panggil<{ guru: string; tp: Ctx['tp']; minggu: Ctx['mg']; profil: Ctx['pf'] }>('lms_rencana_contoh_ambil', { p_ptk: sumber.ptk_id, p_mapel: sumber.mapel, p_tingkat: sumber.tingkat })
      .then((r) => { if (!batal) setIsi({ guru: r.guru, tp: r.tp, mg: r.minggu, pf: r.profil }) }).catch(() => undefined)
    return () => { batal = true }
  }, [sumber?.ptk_id, sumber?.mapel, sumber?.tingkat])
  const nyata = !!sumber && !!isi
  return (
    <div className="kartu jarak contoh-format">
      {dok ? (
        <>
          <p className="catatan"><strong>Contoh format.</strong> Isi di bawah hanya kerangka dan petunjuk pengisian, bukan keputusan kurikulum sekolah.</p>
          <div className="aksi tanpa-cetak"><button type="button" className="tombol tombol-isi" onClick={() => unduhTemplateDokumen(jenis as 'modul_ajar' | 'rpp')}>Unduh template Word</button></div>
          <Kerangka jenis={jenis as 'modul_ajar' | 'rpp'} />
        </>
      ) : (
        <>
          {nyata
            ? <p className="catatan"><strong>Contoh dari rekan guru.</strong> Ini rencana ajar {sumber.mapel} kelas {sumber.tingkat} milik {isi.guru}, dibagikan sebagai contoh. Mata pelajaran Anda boleh berbeda; yang dicontoh adalah susunan dan tingkat kerincian pengisiannya.</p>
            : <p className="catatan"><strong>Contoh format.</strong> Isi di bawah hanya ilustrasi pengisian, bukan data Anda dan bukan keputusan kurikulum sekolah.</p>}
          {daftar.length > 1 && (
            <label className="tanpa-cetak">Sumber contoh
              <select value={pilih} onChange={(e) => setPilih(e.target.value)}>
                {daftar.map((x) => <option key={`${x.ptk_id}|${x.mapel}|${x.tingkat}`} value={`${x.ptk_id}|${x.mapel}|${x.tingkat}`}>{x.mapel} kelas {x.tingkat}, {x.guru}</option>)}
              </select>
            </label>
          )}
          {nyata ? <Dokumen jenis={jenis} c={ctxDari(sumber, { tp: isi.tp, minggu: isi.mg, profil: isi.pf })} /> : <Dokumen jenis={jenis} c={contohCtx} />}
          {nyata && !sumber.milik_saya && <SalinContoh key={`${sumber.ptk_id}|${sumber.mapel}|${sumber.tingkat}`} isi={isi} sumber={sumber} />}
        </>
      )}
    </div>
  )
}
