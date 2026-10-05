// Halaman publik: ekstrakurikuler dan prestasi. Hanya menampilkan yang sudah dipilih untuk diterbitkan.
import { useMemo, useState } from 'react'
import Halaman from '../components/Halaman'
import { kapital, namaBidang, namaTingkat, useEkskulPublik, usePrestasiPublik, type EkskulPublik } from '../lib/sekolahPublik'

function KartuEkskul({ e }: { e: EkskulPublik }) {
  return (
    <article className="kartu">
      <h3 style={{ marginTop: 0 }}>{e.nama}</h3>
      {e.deskripsi && <p>{e.deskripsi}</p>}
      <p className="catatan">
        {e.pembina && <>Pembina: {kapital(e.pembina)}<br /></>}
        {e.jadwal && <>Jadwal: {e.jadwal}<br /></>}
        {e.anggota > 0 && <>{e.anggota} anggota</>}
      </p>
    </article>
  )
}

export function EkstrakurikulerPublik() {
  const { data, galat } = useEkskulPublik()
  const ekskul = (data ?? []).filter((e) => e.jenis === 'ekskul')
  const organisasi = (data ?? []).filter((e) => e.jenis !== 'ekskul')
  return (
    <Halaman judul="Ekstrakurikuler" lead="Wadah siswa mengembangkan minat, bakat, dan kepemimpinan di luar jam pelajaran.">
      {galat && <p className="kartu galat" role="alert">Data belum dapat dimuat. Coba lagi beberapa saat.</p>}
      {data === null && !galat && <p className="catatan">Memuat...</p>}
      {data && data.length === 0 && <p className="catatan">Belum ada data ekstrakurikuler yang diterbitkan.</p>}
      {ekskul.length > 0 && (
        <>
          <div className="judul-bagian"><h2>Ekstrakurikuler</h2></div>
          <div className="grid grid-3">{ekskul.map((e) => <KartuEkskul key={e.nama} e={e} />)}</div>
        </>
      )}
      {organisasi.length > 0 && (
        <div className="jarak">
          <div className="judul-bagian"><h2>Organisasi siswa</h2></div>
          <div className="grid grid-3">{organisasi.map((e) => <KartuEkskul key={e.nama} e={e} />)}</div>
        </div>
      )}
    </Halaman>
  )
}

export function PrestasiPublikHalaman() {
  const { data, galat } = usePrestasiPublik()
  const [kat, setKat] = useState<'semua' | 'siswa' | 'gtk'>('semua')
  const kelompok = useMemo(() => {
    const m = new Map<string, NonNullable<typeof data>>()
    for (const p of (data ?? []).filter((x) => kat === 'semua' || x.kategori === kat)) {
      const k = p.tahun ? String(p.tahun) : 'Lainnya'
      m.set(k, [...(m.get(k) ?? []), p])
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [data, kat])
  return (
    <Halaman judul="Prestasi" lead="Capaian siswa dan guru di bidang akademik, olahraga, seni, dan keterampilan kejuruan.">
      {galat && <p className="kartu galat" role="alert">Data belum dapat dimuat. Coba lagi beberapa saat.</p>}
      {data === null && !galat && <p className="catatan">Memuat...</p>}
      {data && data.length === 0 && <p className="catatan">Belum ada prestasi yang diterbitkan.</p>}
      {data && data.some((p) => p.kategori === 'gtk') && data.some((p) => p.kategori === 'siswa') && (
        <div className="aksi" role="group" aria-label="Saring kategori" style={{ marginTop: 0, marginBottom: 16 }}>
          {([['semua', 'Semua'], ['siswa', 'Siswa'], ['gtk', 'Guru dan tenaga kependidikan']] as const).map(([k, n]) => (
            <button key={k} type="button" className={'tombol' + (kat === k ? ' tombol-isi' : '')} aria-pressed={kat === k} onClick={() => setKat(k)}>{n}</button>
          ))}
        </div>
      )}
      {kelompok.map(([tahun, daftar]) => (
        <section key={tahun} className="jarak" aria-label={`Prestasi ${tahun}`}>
          <div className="judul-bagian"><h2>{tahun}</h2></div>
          <div className="grid grid-3">
            {daftar.map((p) => (
              <article key={p.id} className="kartu">
                <small className="catatan">{[namaBidang(p.bidang), namaTingkat(p.tingkat)].filter(Boolean).join(' · ')}</small>
                <h3 style={{ margin: '4px 0 6px' }}>{p.judul}</h3>
                {p.peringkat && <p><strong>{p.peringkat}</strong></p>}
                {p.nama && <p>{kapital(p.nama)}</p>}
                {p.deskripsi && <p>{p.deskripsi}</p>}
                {p.penyelenggara && <p className="catatan">{p.penyelenggara}</p>}
              </article>
            ))}
          </div>
        </section>
      ))}
    </Halaman>
  )
}
