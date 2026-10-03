// Struktur organisasi publik. Diturunkan dari penugasan aktif tahun ajaran berjalan (RPC struktur_publik).
// Hanya nama, gelar, dan jabatan yang keluar dari database.
import { useEffect, useMemo, useState } from 'react'
import Halaman from '../components/Halaman'
import { supabase } from '../lib/supabase'

type Baris = {
  kode: string; nama: string; induk_kode: string | null; urutan: number; lingkup: string
  bagan: boolean; lingkup_label: string | null; pemegang: string | null
}
type Simpul = { kode: string; nama: string; induk: string | null; urutan: number; lingkup: string; bagan: boolean; pemegang: { nama: string; label: string | null }[] }

const tahunAjaran = () => {
  const n = new Date()
  const y = n.getFullYear()
  return n.getMonth() >= 6 ? `${y}/${y + 1}` : `${y - 1}/${y}`
}

function Cabang({ simpul, anak }: { simpul: Simpul; anak: Map<string | null, Simpul[]> }) {
  const turunan = anak.get(simpul.kode) ?? []
  return (
    <li>
      <div className={'simpul' + (simpul.pemegang.length === 0 ? ' kosong' : '')}>
        <strong>{simpul.nama}</strong>
        {simpul.pemegang.length === 0 ? (
          <span className="catatan">Belum ditetapkan</span>
        ) : (
          <ul className="pemegang">
            {simpul.pemegang.map((p, i) => (
              <li key={i}>{p.label && simpul.lingkup !== 'sekolah' ? <small>{p.label}: </small> : null}{p.nama}</li>
            ))}
          </ul>
        )}
      </div>
      {turunan.length > 0 && (
        <ul className="pohon">
          {turunan.map((t) => <Cabang key={t.kode} simpul={t} anak={anak} />)}
        </ul>
      )}
    </li>
  )
}

export default function Struktur() {
  const [rows, setRows] = useState<Baris[] | null>(null)
  const [galat, setGalat] = useState('')

  useEffect(() => {
    supabase.rpc('struktur_publik').then(({ data, error }) => {
      if (error) setGalat(error.message)
      else setRows((data ?? []) as Baris[])
    })
  }, [])

  const { anak, akar, wali, ekskul, adaIsi } = useMemo(() => {
    const peta = new Map<string, Simpul>()
    for (const r of rows ?? []) {
      let s = peta.get(r.kode)
      if (!s) {
        s = { kode: r.kode, nama: r.nama, induk: r.induk_kode, urutan: r.urutan, lingkup: r.lingkup, bagan: r.bagan, pemegang: [] }
        peta.set(r.kode, s)
      }
      if (r.pemegang) s.pemegang.push({ nama: r.pemegang, label: r.lingkup_label })
    }
    const semua = [...peta.values()].sort((a, b) => a.urutan - b.urutan)
    const anak = new Map<string | null, Simpul[]>()
    for (const s of semua.filter((x) => x.bagan)) {
      // jabatan yang induknya tidak tampil publik naik ke akar agar tidak hilang dari bagan
      const induk = s.induk && peta.get(s.induk)?.bagan ? s.induk : null
      anak.set(induk, [...(anak.get(induk) ?? []), s])
    }
    const wali = (peta.get('wali_kelas')?.pemegang ?? []).slice().sort((a, b) => (a.label ?? '').localeCompare(b.label ?? '', 'id', { numeric: true }))
    const ekskul = peta.get('pembina_ekskul')?.pemegang ?? []
    return { anak, akar: anak.get(null) ?? [], wali, ekskul, adaIsi: semua.some((s) => s.pemegang.length > 0) }
  }, [rows])

  const waliPerTingkat = useMemo(() => {
    const g = new Map<string, typeof wali>()
    for (const w of wali) {
      const t = (w.label ?? '').split(' ')[0] || '-'
      g.set(t, [...(g.get(t) ?? []), w])
    }
    return [...g.entries()].sort((a, b) => ['X', 'XI', 'XII', 'XIII'].indexOf(a[0]) - ['X', 'XI', 'XII', 'XIII'].indexOf(b[0]))
  }, [wali])

  return (
    <Halaman judul="Struktur Organisasi" lead={`Susunan pimpinan dan pengelola sekolah tahun ajaran ${tahunAjaran()}.`}>
      {galat && <p className="kartu" role="alert">Struktur belum dapat dimuat.</p>}
      {rows && !adaIsi && <p className="kartu">Struktur akan tampil setelah penugasan ditetapkan oleh sekolah.</p>}
      {rows && adaIsi && (
        <>
          <ul className="pohon akar" aria-label="Bagan struktur organisasi">
            {akar.map((s) => <Cabang key={s.kode} simpul={s} anak={anak} />)}
          </ul>

          {waliPerTingkat.length > 0 && (
            <>
              <div className="judul-bagian jarak"><h2>Wali kelas</h2></div>
              {waliPerTingkat.map(([t, daftar]) => (
                <section key={t} className="jarak" aria-label={`Wali kelas tingkat ${t}`}>
                  <h3>Kelas {t}</h3>
                  <div className="grid grid-3">
                    {daftar.map((w, i) => (
                      <div className="kartu" key={i}><small>{w.label}</small><p style={{ margin: '4px 0 0' }}><strong>{w.nama}</strong></p></div>
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}

          {ekskul.length > 0 && (
            <>
              <div className="judul-bagian jarak"><h2>Pembina ekstrakurikuler</h2></div>
              <div className="grid grid-3">
                {ekskul.map((p, i) => (
                  <div className="kartu" key={i}><small>{p.label}</small><p style={{ margin: '4px 0 0' }}><strong>{p.nama}</strong></p></div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Halaman>
  )
}
