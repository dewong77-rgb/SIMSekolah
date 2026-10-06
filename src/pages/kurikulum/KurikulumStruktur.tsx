// Struktur kurikulum: durasi satu jam pelajaran (satu angka untuk semua hari), daftar mapel, dan jam per minggu per tingkat dan program.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Halaman from '../../components/Halaman'
import { panggil } from '../../lib/rpc'
import {
  KELOMPOK_MAPEL, namaKelompok, pilihanTahunAjaran, tahunAjaranSekarang,
  type BarisStruktur, type Mapel, type Pengaturan, type ProgramRombel,
} from '../../lib/kurikulum'
import GerbangKurikulum from './GerbangKurikulum'

type Baris = { mapel_id: string; jp: string }

function KartuPengaturan({ p, boleh, muatUlang }: { p: Pengaturan; boleh: boolean; muatUlang: () => void }) {
  const [durasi, setDurasi] = useState(String(p.durasi_jp))
  const [wajib, setWajib] = useState(String(p.jam_wajib))
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  async function simpan() {
    setGalat(''); setInfo(''); setSibuk(true)
    try {
      await panggil('kur_pengaturan_simpan', { p_durasi: Number(durasi), p_jam_wajib: Number(wajib) })
      setInfo('Tersimpan. Durasi ini berlaku untuk semua hari dan dipakai di halaman jam pelajaran.'); muatUlang()
    } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  const d = Number(durasi) || 0
  return (
    <div className="kartu form">
      <h3>Durasi dan beban wajib</h3>
      {galat && <p role="alert" className="catatan galat">{galat}</p>}
      {info && <p role="status" className="catatan sukses">{info}</p>}
      <div className="grid grid-2">
        <label>Menit per jam pelajaran (semua hari)
          <input type="number" min={30} max={60} value={durasi} disabled={!boleh} onChange={(e) => setDurasi(e.target.value)} />
        </label>
        <label>Jam wajib mengajar per minggu
          <input type="number" min={6} max={40} value={wajib} disabled={!boleh} onChange={(e) => setWajib(e.target.value)} />
        </label>
      </div>
      <p className="catatan">1 JP = {d} menit. 2 JP = {d * 2} menit. 3 JP = {d * 3} menit. Beban {wajib || 0} JP per minggu = {(Number(wajib) || 0) * d} menit tatap muka.</p>
      {boleh && <div className="aksi" style={{ marginTop: 0 }}><button className="tombol tombol-isi" disabled={sibuk} onClick={simpan}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button></div>}
    </div>
  )
}

function DaftarMapel({ mapel, boleh, muat }: { mapel: Mapel[]; boleh: boolean; muat: () => Promise<void> }) {
  const [edit, setEdit] = useState<(Partial<Mapel> & { kata: string }) | null>(null)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  async function simpan() {
    if (!edit) return
    setGalat(''); setInfo(''); setSibuk(true)
    try {
      await panggil('kur_mapel_simpan', { p: { id: edit.id ?? null, nama: edit.nama ?? '', kelompok: edit.kelompok ?? 'umum', urutan: edit.urutan ?? 100, aktif: edit.aktif ?? true, bidang_linier: edit.kata.split(',').map((x) => x.trim()).filter(Boolean) } })
      setEdit(null); setInfo('Mapel tersimpan.'); await muat()
    } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  async function hapus(m: Mapel) {
    if (!window.confirm(`Hapus mapel "${m.nama}"? Bila sudah dipakai struktur atau pembagian guru, mapel hanya dinonaktifkan.`)) return
    setGalat(''); setInfo(''); setSibuk(true)
    try { const r = await panggil<string>('kur_mapel_hapus', { p_id: m.id }); setInfo(r === 'dihapus' ? 'Mapel dihapus.' : 'Mapel sudah terpakai, jadi dinonaktifkan.'); await muat() }
    catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  return (
    <div className="kartu form">
      <h3>Daftar mata pelajaran</h3>
      <p className="catatan">Kata kunci bidang dipakai untuk menilai linieritas guru. Sistem mencocokkannya dengan kompetensi, sertifikasi, dan prodi ijazah guru di Dapodik. Pisahkan dengan koma, misalnya: matematika, statistika.</p>
      {galat && <p role="alert" className="catatan galat">{galat}</p>}
      {info && <p role="status" className="catatan sukses">{info}</p>}
      <div className="tabel-bungkus">
        <table>
          <thead><tr><th>Mapel</th><th>Kelompok</th><th>Kata kunci bidang linier</th><th><span className="sr-only">Aksi</span></th></tr></thead>
          <tbody>
            {mapel.map((m) => (
              <tr key={m.id} style={m.aktif ? undefined : { opacity: .55 }}>
                <td>{m.nama}{!m.aktif && <small> (nonaktif)</small>}</td>
                <td>{namaKelompok(m.kelompok)}</td>
                <td>{m.bidang_linier.length ? m.bidang_linier.join(', ') : <small>belum diisi</small>}</td>
                <td>{boleh && (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="tombol" style={{ padding: '4px 10px' }} onClick={() => setEdit({ ...m, kata: m.bidang_linier.join(', ') })}>Ubah</button>
                    <button type="button" className="tombol" style={{ padding: '4px 10px', color: '#a11' }} disabled={sibuk} onClick={() => hapus(m)}>Hapus</button>
                  </span>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {boleh && !edit && <div className="aksi" style={{ marginTop: 0 }}><button className="tombol" onClick={() => setEdit({ nama: '', kelompok: 'umum', kata: '', urutan: (mapel.at(-1)?.urutan ?? 0) + 10, aktif: true })}>Tambah mapel</button></div>}
      {edit && (
        <div className="kartu jarak form" style={{ background: '#f7f9fc' }}>
          <h3>{edit.id ? 'Ubah mapel' : 'Mapel baru'}</h3>
          <label>Nama mapel<input value={edit.nama ?? ''} maxLength={120} onChange={(e) => setEdit({ ...edit, nama: e.target.value })} /></label>
          <div className="grid grid-2">
            <label>Kelompok
              <select value={edit.kelompok ?? 'umum'} onChange={(e) => setEdit({ ...edit, kelompok: e.target.value })}>
                {KELOMPOK_MAPEL.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>Urutan tampil<input type="number" value={edit.urutan ?? 100} onChange={(e) => setEdit({ ...edit, urutan: Number(e.target.value) })} /></label>
          </div>
          <label>Kata kunci bidang linier<input value={edit.kata} placeholder="matematika, statistika" onChange={(e) => setEdit({ ...edit, kata: e.target.value })} /></label>
          {edit.id && <label className="baris-centang"><input type="checkbox" checked={edit.aktif ?? true} onChange={(e) => setEdit({ ...edit, aktif: e.target.checked })} /> Mapel aktif</label>}
          <div className="aksi" style={{ marginTop: 0 }}>
            <button className="tombol tombol-isi" disabled={sibuk} onClick={simpan}>{sibuk ? 'Menyimpan...' : 'Simpan mapel'}</button>
            <button className="tombol" onClick={() => setEdit(null)}>Batal</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Struktur({ p, boleh }: { p: Pengaturan; boleh: boolean }) {
  const [ta, setTa] = useState(tahunAjaranSekarang())
  const [tingkat, setTingkat] = useState(10)
  const [program, setProgram] = useState('*')
  const [struktur, setStruktur] = useState<BarisStruktur[]>([])
  const [programRombel, setProgramRombel] = useState<ProgramRombel[]>([])
  const [mapel, setMapel] = useState<Mapel[]>([])
  const [baris, setBaris] = useState<Baris[]>([])
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [salinDari, setSalinDari] = useState('')

  const muatMapel = useCallback(async () => setMapel((await panggil<Mapel[]>('kur_mapel_daftar')) ?? []), [])
  const muatStruktur = useCallback(async () => {
    try {
      const [s, pr] = await Promise.all([panggil<BarisStruktur[]>('kur_struktur_daftar', { p_ta: ta }), panggil<ProgramRombel[]>('kur_program_daftar', { p_ta: ta })])
      setStruktur(s ?? []); setProgramRombel(pr ?? [])
    } catch (e) { setGalat((e as Error).message) }
  }, [ta])
  useEffect(() => { void muatMapel().catch((e) => setGalat((e as Error).message)) }, [muatMapel])
  useEffect(() => { void muatStruktur() }, [muatStruktur])

  const daftarProgram = useMemo(() => ['*', ...Array.from(new Set([...programRombel.map((x) => x.program), ...struktur.map((x) => x.program)].filter((x) => x && x !== '*'))).sort()], [programRombel, struktur])
  useEffect(() => {
    setBaris(struktur.filter((s) => s.tingkat === tingkat && s.program === program).map((s) => ({ mapel_id: s.mapel_id, jp: String(s.jp_minggu) })))
  }, [struktur, tingkat, program])

  const aktif = mapel.filter((m) => m.aktif)
  const total = baris.reduce((a, b) => a + (Number(b.jp) || 0), 0)
  const ubah = (i: number, k: keyof Baris, v: string) => setBaris((b) => b.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  async function simpan() {
    setGalat(''); setInfo('')
    for (const b of baris) {
      if (!b.mapel_id) return setGalat('Pilih mapel di setiap baris.')
      const n = Number(b.jp)
      if (!Number.isInteger(n) || n < 1 || n > 20) return setGalat('Jam per minggu harus bilangan bulat 1 sampai 20.')
    }
    setSibuk(true)
    try {
      await panggil('kur_struktur_simpan', { p_ta: ta, p_tingkat: tingkat, p_program: program, p_baris: baris.map((b) => ({ mapel_id: b.mapel_id, jp_minggu: Number(b.jp) })) })
      setInfo('Struktur tersimpan.'); await muatStruktur()
    } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  async function salin() {
    setGalat(''); setInfo(''); setSibuk(true)
    try { const n = await panggil<number>('kur_struktur_salin', { p_dari: salinDari, p_ke: ta }); setInfo(`${n} baris disalin ke ${ta}.`); await muatStruktur() }
    catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }

  const ringkas = useMemo(() => {
    const m = new Map<string, { tingkat: number; program: string; jp: number; mapel: number }>()
    for (const s of struktur) {
      const k = `${s.tingkat}|${s.program}`
      const x = m.get(k) ?? { tingkat: s.tingkat, program: s.program, jp: 0, mapel: 0 }
      x.jp += s.jp_minggu; x.mapel += 1; m.set(k, x)
    }
    return [...m.values()].sort((a, b) => a.tingkat - b.tingkat || a.program.localeCompare(b.program))
  }, [struktur])
  const namaProgram = (x: string) => (x === '*' ? 'Semua program' : x)

  return (
    <div className="kartu form">
      <h3>Struktur kurikulum per tingkat dan program</h3>
      <p className="catatan">Isi jam per minggu tiap mapel. Baris di program tertentu menimpa baris "Semua program" untuk mapel yang sama. Struktur ini menentukan daftar mapel yang harus dibagi ke guru di Beban mengajar.</p>
      {galat && <p role="alert" className="catatan galat">{galat}</p>}
      {info && <p role="status" className="catatan sukses">{info}</p>}
      <div className="grid grid-3">
        <label>Tahun ajaran
          <select value={ta} onChange={(e) => setTa(e.target.value)}>{pilihanTahunAjaran().map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        <label>Tingkat
          <select value={tingkat} onChange={(e) => setTingkat(Number(e.target.value))}>
            <option value={10}>X (kelas 10)</option><option value={11}>XI (kelas 11)</option><option value={12}>XII (kelas 12)</option>
          </select>
        </label>
        <label>Program
          <select value={program} onChange={(e) => setProgram(e.target.value)}>{daftarProgram.map((x) => <option key={x} value={x}>{namaProgram(x)}</option>)}</select>
        </label>
      </div>

      {ringkas.length > 0 && (
        <p className="catatan">Sudah diisi: {ringkas.map((r) => `${['', '', '', '', '', '', '', '', '', '', 'X', 'XI', 'XII'][r.tingkat]} ${namaProgram(r.program)} (${r.mapel} mapel, ${r.jp} JP)`).join(' · ')}</p>
      )}

      <div className="tabel-bungkus">
        <table>
          <thead><tr><th>Mapel</th><th>Kelompok</th><th>JP per minggu</th><th>Menit per minggu</th><th><span className="sr-only">Aksi</span></th></tr></thead>
          <tbody>
            {baris.length === 0 && <tr><td colSpan={5}>Belum ada mapel untuk kelompok ini.</td></tr>}
            {baris.map((b, i) => {
              const m = mapel.find((x) => x.id === b.mapel_id)
              return (
                <tr key={i}>
                  <td>
                    <select value={b.mapel_id} disabled={!boleh} aria-label={`Mapel baris ${i + 1}`} onChange={(e) => ubah(i, 'mapel_id', e.target.value)} style={{ minWidth: 220 }}>
                      <option value="">Pilih mapel</option>
                      {aktif.filter((x) => x.id === b.mapel_id || !baris.some((y) => y.mapel_id === x.id)).map((x) => <option key={x.id} value={x.id}>{x.nama}</option>)}
                      {m && !m.aktif && <option value={m.id}>{m.nama} (nonaktif)</option>}
                    </select>
                  </td>
                  <td>{m ? namaKelompok(m.kelompok) : '-'}</td>
                  <td><input type="number" min={1} max={20} value={b.jp} disabled={!boleh} aria-label={`JP baris ${i + 1}`} onChange={(e) => ubah(i, 'jp', e.target.value)} style={{ width: 80 }} /></td>
                  <td>{(Number(b.jp) || 0) * p.durasi_jp}</td>
                  <td>{boleh && <button type="button" className="tombol" style={{ padding: '4px 10px', color: '#a11' }} onClick={() => setBaris((x) => x.filter((_, j) => j !== i))} aria-label={`Hapus baris ${i + 1}`}>Hapus</button>}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot><tr><th colSpan={2}>Total per minggu</th><th>{total} JP</th><th>{total * p.durasi_jp} menit</th><th /></tr></tfoot>
        </table>
      </div>
      {boleh && (
        <div className="aksi" style={{ marginTop: 0 }}>
          <button type="button" className="tombol" onClick={() => setBaris((b) => [...b, { mapel_id: '', jp: '2' }])}>Tambah mapel</button>
          <button type="button" className="tombol tombol-isi" disabled={sibuk} onClick={simpan}>{sibuk ? 'Menyimpan...' : 'Simpan struktur'}</button>
        </div>
      )}
      {boleh && struktur.length === 0 && (
        <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
          <select value={salinDari} onChange={(e) => setSalinDari(e.target.value)} aria-label="Salin dari tahun ajaran">
            <option value="">Salin seluruh struktur dari...</option>
            {pilihanTahunAjaran().filter((x) => x !== ta).map((x) => <option key={x}>{x}</option>)}
          </select>
          <button type="button" className="tombol" disabled={!salinDari || sibuk} onClick={salin}>Salin</button>
        </div>
      )}
    </div>
  )
}

function Isi({ p, muatUlang }: { p: Pengaturan; muatUlang: () => void }) {
  const [mapel, setMapel] = useState<Mapel[]>([])
  const [galat, setGalat] = useState('')
  const muat = useCallback(async () => setMapel((await panggil<Mapel[]>('kur_mapel_daftar')) ?? []), [])
  useEffect(() => { void muat().catch((e) => setGalat((e as Error).message)) }, [muat])
  return (
    <Halaman judul="Struktur kurikulum" lead="Satu durasi jam pelajaran untuk semua hari, daftar mapel, dan jam per minggu tiap tingkat dan program. Bagian ini menjadi acuan pembagian guru, jadwal, dan asesmen.">
      {!p.boleh && <p className="kartu">Anda hanya dapat melihat. Pengaturan kurikulum dilakukan oleh Waka Kurikulum atau staf kurikulum.</p>}
      {galat && <p role="alert" className="catatan galat">{galat}</p>}
      <div style={{ display: 'grid', gap: 16 }}>
        <KartuPengaturan p={p} boleh={p.boleh} muatUlang={muatUlang} />
        <Struktur p={p} boleh={p.boleh} />
        <DaftarMapel mapel={mapel} boleh={p.boleh} muat={muat} />
      </div>
    </Halaman>
  )
}

export default function KurikulumStruktur() {
  return <GerbangKurikulum judul="Struktur kurikulum" aktif="/portal/kurikulum/struktur">{(p, muatUlang) => <Isi p={p} muatUlang={muatUlang} />}</GerbangKurikulum>
}
