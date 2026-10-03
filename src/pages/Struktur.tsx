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

const inisial = (n: string) => {
  const k = n.replace(/,.*$/, '').trim().split(/\s+/).filter((x) => /^[A-Za-z]/.test(x) && !/\.$/.test(x))
  return ((k[0]?.[0] ?? '') + (k.length > 1 ? k[1][0] : '')).toUpperCase() || '?'
}

type Peta = Map<string | null, Simpul[]>

function Kartu({ simpul, tingkat }: { simpul: Simpul; tingkat: number }) {
  const kosong = simpul.pemegang.length === 0
  return (
    <div className={`kartu-org t${Math.min(tingkat, 2)}` + (kosong ? ' kosong' : '')}>
      <span className="jabatan">{simpul.nama}</span>
      {kosong ? (
        <span className="catatan">Belum ditetapkan</span>
      ) : (
        <ul className="pemegang">
          {simpul.pemegang.map((p, i) => (
            <li key={i}>
              <span className="avatar" aria-hidden="true">{inisial(p.nama)}</span>
              <span>{p.label && simpul.lingkup !== 'sekolah' ? <small>{p.label}</small> : null}<strong>{p.nama}</strong></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Turunan({ simpul, anak, tingkat }: { simpul: Simpul; anak: Peta; tingkat: number }) {
  const t = anak.get(simpul.kode) ?? []
  return (
    <li>
      <Kartu simpul={simpul} tingkat={tingkat} />
      {t.length > 0 && (
        <ul className="rantai">{t.map((x) => <Turunan key={x.kode} simpul={x} anak={anak} tingkat={tingkat + 1} />)}</ul>
      )}
    </li>
  )
}

function Bagan({ simpul, anak }: { simpul: Simpul; anak: Peta }) {
  const t = anak.get(simpul.kode) ?? []
  return (
    <div className="bagan-org">
      <div className="bagan-puncak"><Kartu simpul={simpul} tingkat={0} /></div>
      {t.length > 0 && (
        <ul className="bagan-baris" style={{ ['--n' as string]: Math.min(t.length, 6) }}>
          {t.map((x) => (
            <li key={x.kode} className="bagan-kolom">
              <Kartu simpul={x} tingkat={1} />
              {(anak.get(x.kode) ?? []).length > 0 && (
                <ul className="rantai">
                  {(anak.get(x.kode) ?? []).map((y) => <Turunan key={y.kode} simpul={y} anak={anak} tingkat={2} />)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
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
    // jabatan yang atasannya disembunyikan dipasang di bawah puncak bagan pertama, bukan jadi bagan terpisah
    const puncak = (anak.get(null) ?? []).filter((x) => !x.induk)
    const yatim = (anak.get(null) ?? []).filter((x) => x.induk)
    if (puncak.length && yatim.length) {
      anak.set(null, puncak)
      anak.set(puncak[0].kode, [...(anak.get(puncak[0].kode) ?? []), ...yatim].sort((a, b) => a.urutan - b.urutan))
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
          <div aria-label="Bagan struktur organisasi" role="group">
            {akar.map((s) => <Bagan key={s.kode} simpul={s} anak={anak} />)}
          </div>

          {waliPerTingkat.length > 0 && (
            <>
              <div className="judul-bagian jarak"><h2>Wali kelas</h2></div>
              {waliPerTingkat.map(([t, daftar]) => (
                <section key={t} className="jarak" aria-label={`Wali kelas tingkat ${t}`}>
                  <h3>Kelas {t}</h3>
                  <div className="grid grid-3">
                    {daftar.map((w, i) => (
                      <div className="kartu-org t2" key={i}><span className="jabatan">{w.label}</span><ul className="pemegang"><li><span className="avatar" aria-hidden="true">{inisial(w.nama)}</span><strong>{w.nama}</strong></li></ul></div>
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
                  <div className="kartu-org t2" key={i}><span className="jabatan">{p.label}</span><ul className="pemegang"><li><span className="avatar" aria-hidden="true">{inisial(p.nama)}</span><strong>{p.nama}</strong></li></ul></div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Halaman>
  )
}
