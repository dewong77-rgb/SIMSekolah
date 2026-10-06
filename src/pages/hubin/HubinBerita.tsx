// Redaksi berita sekolah. Penulis membuat draf dan mengajukan; penerbitan oleh pemegang izin hubin.kelola_humas.
// Editor dibuat bertahap: judul, isi, foto, pengaturan. Foto diunggah langsung dan dikecilkan otomatis.
import TombolIkon from '../../components/TombolIkon'
import BeritaIsi from '../../components/BeritaIsi'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { panggil, tglJam } from '../../lib/rpc'
import {
  KATEGORI_BERITA, MAKS_FOTO, namaKategori, urlGambarBerita, tglJamBerita, unggahFotoBerita, waktuBaca, jumlahKata,
  type BeritaKelola, type Foto,
} from '../../lib/berita'
import PenyuntingIsi, { type PenyuntingRef } from '../../components/PenyuntingIsi'
import { bersihkanHtml, teksKeHtml, teksPolos } from '../../lib/isiBerita'
import Gerbang from './Gerbang'

const NAMA_STATUS: Record<string, string> = { draf: 'Draf', diajukan: 'Menunggu terbit', terbit: 'Terbit', diarsipkan: 'Diarsipkan' }
const KUNCI_DRAF = 'berita-draf-baru'

type Form = {
  id?: string; judul: string; subjudul: string; kategori: string; ringkasan: string; isi: string
  tema: string; tag: string[]; byline: string; kredit_foto: string; foto: Foto[]; sampul: string
  unggulan: boolean; status: string
}
const BARU: Form = {
  judul: '', subjudul: '', kategori: 'kegiatan', ringkasan: '', isi: '', tema: '', tag: [], byline: '', kredit_foto: '', foto: [], sampul: '',
  unggulan: false, status: 'draf',
}

const bacaDraf = (): Form | null => {
  try { const s = localStorage.getItem(KUNCI_DRAF); return s ? { ...BARU, ...JSON.parse(s) } : null } catch { return null }
}
const simpanDraf = (f: Form | null) => {
  try { if (f) localStorage.setItem(KUNCI_DRAF, JSON.stringify(f)); else localStorage.removeItem(KUNCI_DRAF) } catch { /* penyimpanan peramban tidak tersedia */ }
}

function Isi() {
  const [daftar, setDaftar] = useState<BeritaKelola[]>([])
  const [bisa, setBisa] = useState({ tulis: false, terbitkan: false })
  const [status, setStatus] = useState('semua')
  const [form, setForm] = useState<Form | null>(null)
  const [pratinjau, setPratinjau] = useState(false)
  const [saran, setSaran] = useState<{ tag: string[]; tema: string[] }>({ tag: [], tema: [] })
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [unggah, setUnggah] = useState<{ nama: string; galat?: string }[]>([])
  const [tagKetik, setTagKetik] = useState('')
  const [sorot, setSorot] = useState(false)
  const penyunting = useRef<PenyuntingRef>(null)
  const berkasRef = useRef<HTMLInputElement>(null)

  const baca = useCallback(async () => {
    try {
      const [b, d] = await Promise.all([panggil<{ tulis: boolean; terbitkan: boolean }>('berita_boleh'), panggil<BeritaKelola[]>('berita_kelola_daftar', { p_status: status })])
      setBisa(b); setDaftar(d)
    } catch (e) { setGalat((e as Error).message) }
  }, [status])
  useEffect(() => { void baca() }, [baca])
  useEffect(() => { panggil<{ tag: string[]; tema: string[] }>('berita_saran').then(setSaran).catch(() => undefined) }, [])

  // Draf berita baru disimpan otomatis di peramban supaya tidak hilang bila tab tertutup.
  useEffect(() => { if (form && !form.id) simpanDraf(form) }, [form])

  function mulaiBaru() {
    const lama = bacaDraf()
    setForm(lama && (lama.judul || lama.isi) && window.confirm('Ada tulisan yang belum tersimpan dari sesi sebelumnya. Lanjutkan tulisan itu?') ? lama : BARU)
    setPratinjau(false); setGalat(''); setInfo('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function ubah(b: BeritaKelola) {
    setGalat(''); setInfo('')
    try {
      const x = await panggil<Record<string, unknown>>('berita_ambil', { p_id: b.id })
      const foto = (Array.isArray(x.foto) ? x.foto : []) as Foto[]
      const sampulUrl = urlGambarBerita({ gambar_path: x.gambar_path as string | null, gambar_url: x.gambar_url as string | null }) ?? ''
      // Sampul lama yang belum ada di galeri dimasukkan agar bisa diatur bersama foto lain.
      const semua = sampulUrl && !foto.some((f) => f.url === sampulUrl) ? [{ url: sampulUrl, keterangan: String(x.gambar_keterangan ?? '') }, ...foto] : foto
      setForm({
        id: b.id, judul: String(x.judul ?? ''), subjudul: String(x.subjudul ?? ''), kategori: String(x.kategori ?? 'kegiatan'),
        ringkasan: String(x.ringkasan ?? ''), isi: teksKeHtml(String(x.isi ?? ''), semua), tema: String(x.tema ?? ''), tag: (x.tag as string[] | null) ?? [],
        byline: String(x.byline ?? ''), kredit_foto: String(x.kredit_foto ?? ''), foto: semua, sampul: sampulUrl,
        unggulan: !!x.unggulan, status: String(x.status ?? 'draf'),
      })
      setPratinjau(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) { setGalat((e as Error).message) }
  }

  const u = <K extends keyof Form>(k: K, v: Form[K]) => setForm((x) => (x ? { ...x, [k]: v } : x))

  // ---------- Isi: sisip foto ke penyunting ----------
  const sisipFoto = (no: number) => { const f = form?.foto[no - 1]; if (f) penyunting.current?.sisipFoto(f) }

  // ---------- Foto ----------
  async function tambahFoto(berkas: FileList | File[]) {
    if (!form) return
    const sisa = MAKS_FOTO - form.foto.length
    const pilihan = Array.from(berkas).filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, sisa))
    if (pilihan.length === 0) { setGalat(sisa <= 0 ? `Maksimal ${MAKS_FOTO} foto per berita.` : 'Pilih berkas gambar (JPG, PNG, atau WebP).'); return }
    setGalat('')
    setUnggah(pilihan.map((f) => ({ nama: f.name })))
    const baru: Foto[] = []
    for (const f of pilihan) {
      try { baru.push({ url: await unggahFotoBerita(f), keterangan: '' }) } catch (e) {
        setUnggah((l) => l.map((x) => (x.nama === f.name ? { ...x, galat: (e as Error).message } : x)))
      }
    }
    if (baru.length) setForm((x) => (x ? { ...x, foto: [...x.foto, ...baru], sampul: x.sampul || baru[0].url } : x))
    setTimeout(() => setUnggah((l) => l.filter((x) => x.galat)), 1200)
  }
  const jatuhkan = (e: DragEvent) => { e.preventDefault(); setSorot(false); void tambahFoto(e.dataTransfer.files) }
  const ketFoto = (i: number, v: string) => setForm((x) => (x ? { ...x, foto: x.foto.map((f, j) => (j === i ? { ...f, keterangan: v } : f)) } : x))
  const hapusFoto = (i: number) => setForm((x) => {
    if (!x) return x
    const sisa = x.foto.filter((_, j) => j !== i)
    // Foto yang dihapus bisa dirujuk isi lewat [foto:N]. Penomoran digeser agar rujukan lain tetap benar.
    const isi = x.isi.replace(/\[foto:(\d{1,2})\]/gi, (m, n) => (Number(n) === i + 1 ? '' : Number(n) > i + 1 ? `[foto:${Number(n) - 1}]` : m))
    return { ...x, foto: sisa, isi, sampul: x.sampul === x.foto[i].url ? (sisa[0]?.url ?? '') : x.sampul }
  })
  const geser = (i: number, arah: -1 | 1) => setForm((x) => {
    if (!x) return x
    const j = i + arah
    if (j < 0 || j >= x.foto.length) return x
    const foto = [...x.foto]; [foto[i], foto[j]] = [foto[j], foto[i]]
    // Tukar rujukan [foto:N] di isi supaya foto tetap tampil di tempat yang sama.
    const isi = x.isi.replace(/\[foto:(\d{1,2})\]/gi, (m, n) => (Number(n) === i + 1 ? `[foto:${j + 1}]` : Number(n) === j + 1 ? `[foto:${i + 1}]` : m))
    return { ...x, foto, isi }
  })

  // ---------- Tag ----------
  function tambahTag(mentah: string) {
    const t = mentah.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, ' ').slice(0, 30)
    if (t.length < 2) return
    setForm((x) => (x && x.tag.length < 8 && !x.tag.includes(t) ? { ...x, tag: [...x.tag, t] } : x))
    setTagKetik('')
  }
  const tagKunci = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); tambahTag(tagKetik) }
    else if (e.key === 'Backspace' && !tagKetik && form?.tag.length) u('tag', form.tag.slice(0, -1))
  }

  // ---------- Kesiapan ----------
  const periksa = useMemo(() => {
    if (!form) return []
    return [
      { ok: form.judul.trim().length >= 5, teks: 'Judul 5 huruf atau lebih', wajib: true },
      { ok: teksPolos(form.isi).length >= 20, teks: 'Isi berita terisi', wajib: true },
      { ok: !!form.sampul, teks: 'Ada foto sampul', wajib: false },
      { ok: form.ringkasan.trim().length >= 20, teks: 'Ringkasan untuk daftar berita', wajib: false },
      { ok: form.tag.length > 0, teks: 'Minimal satu tag', wajib: false },
      { ok: jumlahKata(form.isi) >= 80, teks: 'Isi sekitar 80 kata atau lebih', wajib: false },
    ]
  }, [form])
  const siap = periksa.filter((p) => p.wajib).every((p) => p.ok)

  async function simpan(e: FormEvent | null, statusBaru?: string) {
    e?.preventDefault(); if (!form) return
    setGalat(''); setInfo('')
    if (!siap) return setGalat('Judul dan isi berita wajib diisi.')
    if (unggah.some((x) => !x.galat)) return setGalat('Tunggu sampai foto selesai diunggah.')
    const sampul = form.foto.find((f) => f.url === form.sampul)
    setSibuk(true)
    try {
      await panggil('berita_simpan', {
        p_id: form.id ?? null,
        p_data: {
          judul: form.judul, subjudul: form.subjudul, kategori: form.kategori, ringkasan: form.ringkasan, isi: bersihkanHtml(form.isi),
          tema: form.tema, tag: form.tag, byline: form.byline, kredit_foto: form.kredit_foto, foto: form.foto,
          gambar_url: sampul?.url ?? '', gambar_path: '', gambar_keterangan: sampul?.keterangan ?? '', unggulan: form.unggulan,
          status: statusBaru ?? form.status,
        },
      })
      if (!form.id) simpanDraf(null)
      setForm(null)
      setInfo(statusBaru === 'terbit' ? 'Berita terbit di situs publik.' : statusBaru === 'diajukan' ? 'Berita diajukan untuk diterbitkan.' : 'Tersimpan.')
      void baca()
    } catch (er) { setGalat((er as Error).message) } finally { setSibuk(false) }
  }

  async function pindah(b: BeritaKelola, s: string) {
    setGalat(''); setInfo('')
    try { await panggil('berita_status', { p_id: b.id, p_status: s }); void baca() } catch (e) { setGalat((e as Error).message) }
  }

  function batal() {
    if (form && !form.id && (form.judul || teksPolos(form.isi)) && !window.confirm('Tulisan ini belum disimpan. Tutup editor? Draf otomatis tetap ada di peramban ini.')) return
    setForm(null)
  }

  const sampulFoto = form?.foto.find((f) => f.url === form.sampul)

  return (
    <Halaman judul="Berita dan kegiatan" lead="Tulis, ajukan, dan terbitkan berita sekolah. Berita terbit tampil di beranda dan halaman Berita.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}
      {!bisa.terbitkan && bisa.tulis && <p className="catatan">Anda dapat menulis dan mengajukan berita. Penerbitan oleh Waka Hubinmas atau Pengelola Web.</p>}
      {!form && (
        <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
          <button className="tombol tombol-isi" onClick={mulaiBaru}>Tulis berita</button>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status">
            <option value="semua">Semua status</option>
            {Object.entries(NAMA_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      )}

      {form && (
        <form className="ed" onSubmit={(e) => simpan(e)}>
          <div className="ed-judul-bar">
            <h2>{form.id ? 'Ubah berita' : 'Berita baru'}</h2>
            <div className="ed-tab" role="tablist">
              <button type="button" role="tab" aria-selected={!pratinjau} className={!pratinjau ? 'aktif' : ''} onClick={() => setPratinjau(false)}>Tulis</button>
              <button type="button" role="tab" aria-selected={pratinjau} className={pratinjau ? 'aktif' : ''} onClick={() => setPratinjau(true)}>Pratinjau</button>
            </div>
          </div>

          {pratinjau ? (
            <div className="ed-pratinjau bt-artikel">
              <p className="bt-kicker">{namaKategori(form.kategori)}{form.tema && <> <i>/</i> <span className="bt-tema">{form.tema}</span></>}</p>
              <h1>{form.judul || 'Judul berita'}</h1>
              {form.subjudul && <p className="bt-dek">{form.subjudul}</p>}
              <p className="bt-byline"><strong>{form.byline || 'Redaksi'}</strong><span>{tglJamBerita(new Date().toISOString())} · {waktuBaca(form.isi)} menit baca</span></p>
              {form.sampul && (
                <figure className="bt-sampul">
                  <img src={form.sampul} alt="" />
                  {(sampulFoto?.keterangan || form.kredit_foto) && <figcaption>{sampulFoto?.keterangan} {form.kredit_foto && <span className="bt-kredit">Foto: {form.kredit_foto}</span>}</figcaption>}
                </figure>
              )}
              <BeritaIsi isi={form.isi || '<p>Isi berita belum ditulis.</p>'} foto={form.foto} kredit={form.kredit_foto} />
              {form.tag.length > 0 && <p className="bt-tag-baris"><span>Tag:</span> {form.tag.map((t) => <span key={t} className="bt-tag">#{t}</span>)}</p>}
            </div>
          ) : (
            <>
              <section className="ed-bagian">
                <h3><span>1</span> Judul dan ringkasan</h3>
                <label>Judul
                  <input value={form.judul} maxLength={150} onChange={(e) => u('judul', e.target.value)} placeholder="Tulis judul yang jelas dan singkat" required />
                  <small className="catatan">{form.judul.length}/150. Judul yang baik memuat siapa, apa, dan di mana.</small>
                </label>
                <label>Subjudul <span className="catatan">(opsional)</span>
                  <input value={form.subjudul} maxLength={200} onChange={(e) => u('subjudul', e.target.value)} placeholder="Kalimat pendukung di bawah judul" />
                </label>
                <label>Ringkasan <span className="catatan">(tampil di daftar berita)</span>
                  <textarea rows={2} maxLength={300} value={form.ringkasan} onChange={(e) => u('ringkasan', e.target.value)} placeholder="Dua kalimat yang menjelaskan inti berita" />
                  <small className="catatan">{form.ringkasan.length}/300</small>
                </label>
              </section>

              <section className="ed-bagian">
                <h3><span>2</span> Isi berita</h3>
                <PenyuntingIsi ref={penyunting} nilai={form.isi} onUbah={(h) => u('isi', h)} />
                {form.foto.length > 0 && (
                  <label className="ed-sisip">Sisipkan foto ke tulisan
                    <select value="" onChange={(e) => { if (e.target.value) sisipFoto(Number(e.target.value)); e.target.value = '' }}>
                      <option value="">Pilih foto…</option>
                      {form.foto.map((f, i) => <option key={f.url} value={i + 1}>Foto {i + 1}{f.keterangan ? ` · ${f.keterangan.slice(0, 40)}` : ''}</option>)}
                    </select>
                  </label>
                )}
                <small className="catatan">{jumlahKata(form.isi)} kata · {waktuBaca(form.isi)} menit baca. Blok teks lalu pilih tombol untuk menebalkan, meratakan, atau membuat daftar bernomor. Tempel dari Word akan dibersihkan otomatis.</small>
              </section>

              <section className="ed-bagian">
                <h3><span>3</span> Foto</h3>
                <div className={`ed-unggah${sorot ? ' sorot' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setSorot(true) }} onDragLeave={() => setSorot(false)} onDrop={jatuhkan}>
                  <p><strong>Tarik foto ke sini</strong> atau</p>
                  <button type="button" className="tombol" onClick={() => berkasRef.current?.click()} disabled={form.foto.length >= MAKS_FOTO}>Pilih foto</button>
                  <input ref={berkasRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
                    onChange={(e) => { if (e.target.files) void tambahFoto(e.target.files); e.target.value = '' }} />
                  <small className="catatan">JPG, PNG, atau WebP. Ukuran dikecilkan otomatis. Maksimal {MAKS_FOTO} foto. Foto pertama menjadi sampul.</small>
                </div>
                {unggah.length > 0 && (
                  <ul className="ed-proses" aria-live="polite">
                    {unggah.map((x) => <li key={x.nama} className={x.galat ? 'galat' : ''}>{x.nama}: {x.galat ?? 'mengunggah…'}</li>)}
                  </ul>
                )}
                {form.foto.length > 0 && (
                  <ol className="ed-foto">
                    {form.foto.map((f, i) => (
                      <li key={f.url} className={f.url === form.sampul ? 'sampul' : ''}>
                        <img src={f.url} alt="" />
                        <div>
                          <strong>Foto {i + 1}{f.url === form.sampul && ' · Sampul'}</strong>
                          <input value={f.keterangan} maxLength={200} onChange={(e) => ketFoto(i, e.target.value)} placeholder="Keterangan foto (siapa dan apa)" aria-label={`Keterangan foto ${i + 1}`} />
                          <div className="ed-foto-aksi">
                            {f.url !== form.sampul && <button type="button" onClick={() => u('sampul', f.url)}>Jadikan sampul</button>}
                            <button type="button" onClick={() => sisipFoto(i + 1)}>Sisipkan ke isi</button>
                            <button type="button" onClick={() => geser(i, -1)} disabled={i === 0} aria-label="Naikkan">↑</button>
                            <button type="button" onClick={() => geser(i, 1)} disabled={i === form.foto.length - 1} aria-label="Turunkan">↓</button>
                            <button type="button" className="bahaya" onClick={() => hapusFoto(i)}>Hapus</button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
                <label>Kredit foto <span className="catatan">(opsional)</span>
                  <input value={form.kredit_foto} maxLength={80} onChange={(e) => u('kredit_foto', e.target.value)} placeholder="Nama fotografer atau dokumentasi sekolah" />
                </label>
                <small className="catatan">Foto yang tidak disisipkan ke isi tampil otomatis sebagai galeri di akhir berita.</small>
              </section>

              <section className="ed-bagian">
                <h3><span>4</span> Pengaturan</h3>
                <div className="ed-baris">
                  <label>Kategori
                    <select value={form.kategori} onChange={(e) => u('kategori', e.target.value)}>
                      {KATEGORI_BERITA.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </label>
                  <label>Tema <span className="catatan">(liputan khusus, opsional)</span>
                    <input list="saran-tema" value={form.tema} maxLength={60} onChange={(e) => u('tema', e.target.value)} placeholder="Mis. Kunjungan Industri 2026" />
                    <datalist id="saran-tema">{saran.tema.map((t) => <option key={t} value={t} />)}</datalist>
                  </label>
                </div>
                <label>Tag <span className="catatan">(tekan Enter setelah mengetik, maksimal 8)</span>
                  <div className="ed-tag">
                    {form.tag.map((t) => <span key={t} className="bt-tag">#{t}<button type="button" aria-label={`Hapus tag ${t}`} onClick={() => u('tag', form.tag.filter((x) => x !== t))}>×</button></span>)}
                    <input value={tagKetik} onChange={(e) => setTagKetik(e.target.value)} onKeyDown={tagKunci} onBlur={() => tambahTag(tagKetik)}
                      placeholder={form.tag.length ? '' : 'Mis. pkl, jurusan tkj, prestasi'} disabled={form.tag.length >= 8} />
                  </div>
                </label>
                {saran.tag.filter((t) => !form.tag.includes(t)).length > 0 && (
                  <p className="ed-saran"><span className="catatan">Sering dipakai:</span> {saran.tag.filter((t) => !form.tag.includes(t)).slice(0, 10).map((t) => <button type="button" key={t} className="bt-tag" onClick={() => tambahTag(t)}>+ {t}</button>)}</p>
                )}
                <label>Nama penulis <span className="catatan">(tampil di bawah judul; kosong = “Redaksi”)</span>
                  <input value={form.byline} maxLength={80} onChange={(e) => u('byline', e.target.value)} placeholder="Redaksi" />
                </label>
                {bisa.terbitkan && <label className="ed-cek"><input type="checkbox" checked={form.unggulan} onChange={(e) => u('unggulan', e.target.checked)} /> Berita utama (tampil paling atas di halaman Berita)</label>}
              </section>
            </>
          )}

          <div className="ed-kaki">
            <ul className="ed-periksa" aria-label="Kesiapan berita">
              {periksa.map((p) => <li key={p.teks} className={p.ok ? 'ok' : p.wajib ? 'wajib' : ''}>{p.ok ? '✓' : p.wajib ? '!' : '○'} {p.teks}</li>)}
            </ul>
            <div className="aksi">
              <button className="tombol" disabled={sibuk || !siap}>Simpan {form.status === 'terbit' ? 'perubahan' : 'sebagai draf'}</button>
              {!bisa.terbitkan && form.status !== 'terbit' && <button type="button" className="tombol tombol-isi" disabled={sibuk || !siap} onClick={() => simpan(null, 'diajukan')}>Ajukan untuk terbit</button>}
              {bisa.terbitkan && form.status !== 'terbit' && <button type="button" className="tombol tombol-isi" disabled={sibuk || !siap} onClick={() => simpan(null, 'terbit')}>Terbitkan</button>}
              <TombolIkon ikon="tutup" label="Tutup editor" onClick={batal} />
            </div>
          </div>
        </form>
      )}

      {!form && (
        <ul className="ed-daftar jarak">
          {daftar.map((b) => (
            <li key={b.id}>
              {urlGambarBerita(b) ? <img src={urlGambarBerita(b)!} alt="" loading="lazy" /> : <div className="ed-tanpa" aria-hidden="true" />}
              <div>
                <strong>{b.unggulan && '★ '}{b.status === 'terbit' ? <Link to={`/berita/${b.slug}`} target="_blank">{b.judul}</Link> : b.judul}</strong>
                <small className="catatan">
                  <span className={`ed-status ed-${b.status}`}>{NAMA_STATUS[b.status] ?? b.status}</span> {namaKategori(b.kategori)}
                  {b.tema && ` · ${b.tema}`} · {b.penulis_nama} · {tglJam(b.diperbarui_pada)}
                </small>
                {b.tag.length > 0 && <small className="catatan">{b.tag.map((t) => `#${t}`).join(' ')}</small>}
              </div>
              <div className="aksi-ikon">
                {b.bisa_ubah && <TombolIkon ikon="pena" label="Ubah" onClick={() => ubah(b)} />}
                {bisa.terbitkan && b.status !== 'terbit' && b.status !== 'diarsipkan' && <TombolIkon ikon="kirim" label="Terbitkan" onClick={() => pindah(b, 'terbit')} />}
                {bisa.terbitkan && b.status === 'terbit' && <TombolIkon ikon="kembali" label="Tarik" varian="bahaya" onClick={() => pindah(b, 'diarsipkan')} />}
                {bisa.terbitkan && b.status === 'diarsipkan' && <TombolIkon ikon="muat" label="Pulihkan" onClick={() => pindah(b, 'draf')} />}
                {!bisa.terbitkan && b.bisa_ubah && b.status === 'draf' && <TombolIkon ikon="kirim" label="Ajukan" onClick={() => pindah(b, 'diajukan')} />}
                {!bisa.terbitkan && b.bisa_ubah && b.status === 'diajukan' && <TombolIkon ikon="kembali" label="Tarik ke draf" onClick={() => pindah(b, 'draf')} />}
              </div>
            </li>
          ))}
          {daftar.length === 0 && <li className="catatan">Belum ada berita.</li>}
        </ul>
      )}
      <p><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

export default function HubinBerita() {
  return <Gerbang perlu={['hubin.tulis_berita', 'hubin.kelola_humas']} judul="Berita dan kegiatan">{() => <Isi />}</Gerbang>
}
