import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { panggil } from '../../lib/rpc'
import { dariInputLokal, keInputLokal, merah, nilaiTeks, unduhCsv } from '../lmsUtil'
import { jam, labelJenis, labelStatus, useRpc } from './umum'

type Ujian = {
  id: string; nama: string; jenis: string; durasi_menit: number; maks_pelanggaran: number; kunci_otomatis: boolean
  acak_soal: boolean; acak_opsi: boolean; tampil_nilai: boolean; status: string; paket: number; sesi: number; peserta: number
}
type Bank = { id: string; mapel: string; tingkat: number | null; judul: string; jumlah_soal: number; pemilik_nama: string }
type Paket = { id: string; nama: string; jumlah_soal: number; total_bobot: number }
type RuangSesi = { id: string; ruang_id: string; ruang: string; kapasitas: number; pengawas_ptk_id: string | null; pengawas: string | null; token: string | null; token_dibuka: boolean; peserta: number }
type Sesi = { id: string; nama: string; paket_id: string | null; paket_nama: string | null; mulai: string; selesai: string; ruang: RuangSesi[] }
type Ruang = { id: string; nama: string; kapasitas: number }
type Ptk = { id: string; nama: string }
type Rombel = { id: string; nama: string; tingkat: number; jumlah: number }
type Rekap = {
  sesi: string; ruang: string; no_kursi: number | null; nama: string; nisn: string | null; kelas: string | null; paket: string | null
  nilai: number | null; benar: number | null; pelanggaran: number | null; terkunci: boolean | null; status: string
}

const FORM_AWAL = { nama: '', jenis: 'uts', durasi_menit: 90, maks_pelanggaran: 3, kunci_otomatis: false, acak_soal: true, acak_opsi: true, tampil_nilai: false }

function Galat({ pesan }: { pesan: string }) {
  return pesan ? <p className="catatan galat" role="alert">{pesan}</p> : null
}

function FormUjian({ awal, simpanLabel, onSimpan }: { awal: typeof FORM_AWAL; simpanLabel: string; onSimpan: (v: typeof FORM_AWAL) => Promise<void> }) {
  const [f, setF] = useState(awal)
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  async function kirim(e: FormEvent) {
    e.preventDefault(); setSibuk(true); setGalat('')
    try { await onSimpan(f) } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  return (
    <form className="kartu form" onSubmit={(e) => void kirim(e)}>
      <Galat pesan={galat} />
      <label>Nama ujian<input required maxLength={120} value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} placeholder="Contoh: Sumatif Tengah Semester Ganjil 2026/2027" /></label>
      <div className="as-baris">
        <label>Jenis
          <select value={f.jenis} onChange={(e) => setF({ ...f, jenis: e.target.value })}>
            <option value="uts">UTS</option><option value="uas">UAS</option><option value="lainnya">Lainnya</option>
          </select>
        </label>
        <label>Durasi (menit)<input type="number" min={5} max={360} required value={f.durasi_menit} onChange={(e) => setF({ ...f, durasi_menit: Number(e.target.value) })} /></label>
        <label>Batas pelanggaran<input type="number" min={1} max={20} required value={f.maks_pelanggaran} onChange={(e) => setF({ ...f, maks_pelanggaran: Number(e.target.value) })} /></label>
      </div>
      <label className="baris-centang"><input type="checkbox" checked={f.kunci_otomatis} onChange={(e) => setF({ ...f, kunci_otomatis: e.target.checked })} /><span>Kunci layar otomatis saat batas pelanggaran tercapai (dibuka pengawas)</span></label>
      <label className="baris-centang"><input type="checkbox" checked={f.acak_soal} onChange={(e) => setF({ ...f, acak_soal: e.target.checked })} /><span>Acak urutan soal</span></label>
      <label className="baris-centang"><input type="checkbox" checked={f.acak_opsi} onChange={(e) => setF({ ...f, acak_opsi: e.target.checked })} /><span>Acak urutan pilihan jawaban</span></label>
      <label className="baris-centang"><input type="checkbox" checked={f.tampil_nilai} onChange={(e) => setF({ ...f, tampil_nilai: e.target.checked })} /><span>Tampilkan nilai ke siswa setelah mengirim</span></label>
      <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : simpanLabel}</button></div>
    </form>
  )
}

export function UjianDaftar() {
  const { data, galat, memuat } = useRpc<Ujian[]>('ad_ujian_daftar')
  const nav = useNavigate()
  const [baru, setBaru] = useState(false)
  return (
    <>
      <h1>Ujian</h1>
      <p className="lead">Satu ujian berisi paket soal, sesi, ruang, pengawas, dan peserta lintas kelas.</p>
      <Galat pesan={galat} />
      <div className="aksi" style={{ marginTop: 0 }}>
        <button className="tombol tombol-isi" onClick={() => setBaru(!baru)}>{baru ? 'Batal' : 'Buat ujian'}</button>
      </div>
      {baru && (
        <div className="jarak">
          <FormUjian awal={FORM_AWAL} simpanLabel="Buat ujian" onSimpan={async (f) => {
            const id = await panggil<string>('ad_ujian_simpan', { p_id: null, p: f })
            nav(`/asesmen/ujian/${id}`)
          }} />
        </div>
      )}
      {memuat && <p className="catatan">Memuat...</p>}
      <div className="as-kisi jarak">
        {(data ?? []).map((u) => (
          <Link key={u.id} to={`/asesmen/ujian/${u.id}`} className="kartu tautan">
            <span className="lencana">{labelStatus[u.status]} · {labelJenis[u.jenis]}</span>
            <h3 style={{ margin: '4px 0' }}>{u.nama}</h3>
            <p className="as-kecil" style={{ margin: 0 }}>{u.paket} paket · {u.sesi} sesi · {u.peserta} peserta · {u.durasi_menit} menit</p>
          </Link>
        ))}
        {data && data.length === 0 && !baru && <p className="catatan">Belum ada ujian. Mulai dengan Buat ujian.</p>}
      </div>
    </>
  )
}

export function UjianDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data: daftar, galat, muat } = useRpc<Ujian[]>('ad_ujian_daftar')
  const [tab, setTab] = useState<'atur' | 'paket' | 'sesi' | 'rekap'>('sesi')
  const [pesan, setPesan] = useState('')
  const u = daftar?.find((x) => x.id === id)

  async function ubahStatus(s: string) {
    setPesan('')
    try { await panggil('ad_ujian_status', { p_id: id, p_status: s }); await muat() } catch (e) { setPesan((e as Error).message) }
  }
  async function hapus() {
    if (!window.confirm('Hapus ujian ini beserta paket, sesi, dan penempatan siswa?')) return
    try { await panggil('ad_ujian_hapus', { p_id: id }); nav('/asesmen') } catch (e) { setPesan((e as Error).message) }
  }
  if (galat) return <Galat pesan={galat} />
  if (!daftar) return <p className="catatan">Memuat...</p>
  if (!u) return <p className="catatan">Ujian tidak ditemukan. <Link to="/asesmen">Kembali</Link></p>
  return (
    <>
      <p className="as-kecil"><Link to="/asesmen">Ujian</Link> / {u.nama}</p>
      <h1>{u.nama}</h1>
      <p className="lead"><span className="lencana">{labelStatus[u.status]}</span> {labelJenis[u.jenis]} · {u.durasi_menit} menit · {u.peserta} peserta di {u.sesi} sesi</p>
      <Galat pesan={pesan} />
      <div className="aksi" style={{ marginTop: 0 }}>
        {u.status !== 'aktif' && <button className="tombol tombol-isi" onClick={() => void ubahStatus('aktif')}>Aktifkan ujian</button>}
        {u.status === 'aktif' && <button className="tombol" onClick={() => void ubahStatus('selesai')}>Tutup ujian</button>}
        {u.status === 'aktif' && <button className="tombol" onClick={() => void ubahStatus('draf')}>Kembalikan ke draf</button>}
        {u.status === 'selesai' && <button className="tombol" onClick={() => void ubahStatus('aktif')}>Buka lagi</button>}
      </div>
      <div className="as-tab" role="tablist">
        {([['sesi', 'Sesi dan ruang'], ['paket', 'Paket soal'], ['rekap', 'Rekap nilai'], ['atur', 'Pengaturan']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'aktif' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'atur' && (
        <>
          <FormUjian awal={{ nama: u.nama, jenis: u.jenis, durasi_menit: u.durasi_menit, maks_pelanggaran: u.maks_pelanggaran, kunci_otomatis: u.kunci_otomatis, acak_soal: u.acak_soal, acak_opsi: u.acak_opsi, tampil_nilai: u.tampil_nilai }}
            simpanLabel="Simpan pengaturan" onSimpan={async (f) => { await panggil('ad_ujian_simpan', { p_id: id, p: f }); await muat(); setPesan('') }} />
          <p className="as-kecil">Durasi dan acak berlaku untuk siswa yang belum mulai. Siswa yang sedang mengerjakan memakai pengaturan saat ia mulai.</p>
          <div className="aksi"><button className="tombol" style={merah} onClick={() => void hapus()}>Hapus ujian</button></div>
        </>
      )}
      {tab === 'paket' && <TabPaket ujian={id} onUbah={muat} />}
      {tab === 'sesi' && <TabSesi ujian={id} onUbah={muat} />}
      {tab === 'rekap' && <TabRekap ujian={u} />}
    </>
  )
}

function TabPaket({ ujian, onUbah }: { ujian: string; onUbah: () => Promise<void> }) {
  const { data, galat, muat } = useRpc<Paket[]>('ad_paket_daftar', { p_ujian: ujian })
  const { data: bank } = useRpc<Bank[]>('ad_bank_daftar')
  const [nama, setNama] = useState('')
  const [pilih, setPilih] = useState<string[]>([])
  const [jumlah, setJumlah] = useState('')
  const [pesan, setPesan] = useState('')
  const [sibuk, setSibuk] = useState(false)
  async function rakit(e: FormEvent) {
    e.preventDefault(); setSibuk(true); setPesan('')
    try {
      await panggil('ad_paket_rakit', { p_ujian: ujian, p_nama: nama, p_bank: pilih, p_jumlah: jumlah ? Number(jumlah) : null })
      setNama(''); setPilih([]); setJumlah(''); await muat(); await onUbah()
    } catch (er) { setPesan((er as Error).message) }
    setSibuk(false)
  }
  async function hapus(id: string) {
    if (!window.confirm('Hapus paket ini?')) return
    try { await panggil('ad_paket_hapus', { p_id: id }); await muat(); await onUbah() } catch (er) { setPesan((er as Error).message) }
  }
  return (
    <>
      <Galat pesan={galat || pesan} />
      <div className="tabel-bungkus">
        <table>
          <thead><tr><th>Paket (mata pelajaran)</th><th>Soal</th><th>Total bobot</th><th /></tr></thead>
          <tbody>
            {(data ?? []).map((p) => (
              <tr key={p.id}><td>{p.nama}</td><td>{p.jumlah_soal}</td><td>{nilaiTeks(p.total_bobot)}</td><td><button className="tombol" style={merah} onClick={() => void hapus(p.id)}>Hapus</button></td></tr>
            ))}
            {data && data.length === 0 && <tr><td colSpan={4} className="as-kecil">Belum ada paket.</td></tr>}
          </tbody>
        </table>
      </div>
      <form className="kartu form jarak" onSubmit={(e) => void rakit(e)}>
        <h3 style={{ marginTop: 0 }}>Rakit paket baru</h3>
        <p className="as-kecil">Soal disalin dari bank soal. Perubahan bank soal sesudahnya tidak mengubah paket yang sudah dirakit.</p>
        <div className="as-baris">
          <label>Nama paket<input required maxLength={80} value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Contoh: Informatika kelas X" /></label>
          <label>Jumlah soal (kosong = semua)<input type="number" min={1} value={jumlah} onChange={(e) => setJumlah(e.target.value)} /></label>
        </div>
        <fieldset style={{ border: '1px solid var(--garis)', borderRadius: 8, marginTop: 12 }}>
          <legend>Bank soal</legend>
          {(bank ?? []).map((b) => (
            <label key={b.id} className="baris-centang">
              <input type="checkbox" checked={pilih.includes(b.id)} disabled={b.jumlah_soal === 0}
                onChange={(e) => setPilih(e.target.checked ? [...pilih, b.id] : pilih.filter((x) => x !== b.id))} />
              <span>{b.mapel}{b.tingkat ? ` (kelas ${b.tingkat})` : ''}: {b.judul} · {b.jumlah_soal} soal · {b.pemilik_nama}</span>
            </label>
          ))}
          {bank && bank.length === 0 && <p className="as-kecil">Belum ada bank soal. Guru mengisinya di menu Bank soal.</p>}
        </fieldset>
        <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk || pilih.length === 0}>{sibuk ? 'Merakit...' : 'Rakit paket'}</button></div>
      </form>
    </>
  )
}

function TabSesi({ ujian, onUbah }: { ujian: string; onUbah: () => Promise<void> }) {
  const { data, galat, muat } = useRpc<Sesi[]>('ad_sesi_daftar', { p_ujian: ujian })
  const { data: paket } = useRpc<Paket[]>('ad_paket_daftar', { p_ujian: ujian })
  const { data: ruang } = useRpc<Ruang[]>('ad_ruang_daftar')
  const { data: ptk } = useRpc<Ptk[]>('ad_ptk_daftar')
  const { data: rombel } = useRpc<Rombel[]>('ad_rombel_daftar')
  const [form, setForm] = useState<{ id: string | null; nama: string; paket_id: string; mulai: string; selesai: string } | null>(null)
  const [pesan, setPesan] = useState('')
  const [tambahRuang, setTambahRuang] = useState<{ sesi: string; ruang: string; pengawas: string } | null>(null)
  const [tempat, setTempat] = useState<{ sr: string; rombel: string[]; acak: boolean } | null>(null)
  const [info, setInfo] = useState('')

  async function simpanSesi(e: FormEvent) {
    e.preventDefault(); if (!form) return; setPesan('')
    try {
      await panggil('ad_sesi_simpan', { p_id: form.id, p_ujian: ujian, p: { nama: form.nama, paket_id: form.paket_id || null, mulai: dariInputLokal(form.mulai), selesai: dariInputLokal(form.selesai) } })
      setForm(null); await muat(); await onUbah()
    } catch (er) { setPesan((er as Error).message) }
  }
  async function jalankan(fn: string, args: Record<string, unknown>, konfirmasi?: string) {
    if (konfirmasi && !window.confirm(konfirmasi)) return
    setPesan(''); setInfo('')
    try { const r = await panggil<unknown>(fn, args); await muat(); await onUbah(); return r } catch (er) { setPesan((er as Error).message) }
  }
  async function simpanRuang(e: FormEvent) {
    e.preventDefault(); if (!tambahRuang) return
    const r = await jalankan('ad_sesi_ruang_simpan', { p_sesi: tambahRuang.sesi, p_ruang: tambahRuang.ruang, p_pengawas: tambahRuang.pengawas || null })
    if (r !== undefined) setTambahRuang(null)
  }
  async function tempatkan(e: FormEvent) {
    e.preventDefault(); if (!tempat) return
    const r = await jalankan('ad_peserta_tempatkan', { p_sesi_ruang: tempat.sr, p_rombel: tempat.rombel, p_acak: tempat.acak }) as { ditambah: number; sudah_di_sesi_ini: number; tidak_muat: number } | undefined
    if (r) {
      setInfo(`${r.ditambah} siswa ditempatkan.${r.sudah_di_sesi_ini ? ` ${r.sudah_di_sesi_ini} sudah ada di sesi ini.` : ''}${r.tidak_muat ? ` ${r.tidak_muat} tidak muat, tambah ruang lain.` : ''}`)
      setTempat(null)
    }
  }
  return (
    <>
      <Galat pesan={galat || pesan} />
      {info && <p className="catatan" role="status">{info}</p>}
      <div className="aksi" style={{ marginTop: 0 }}>
        <button className="tombol tombol-isi" onClick={() => setForm({ id: null, nama: '', paket_id: '', mulai: '', selesai: '' })}>Tambah sesi</button>
      </div>
      {form && (
        <form className="kartu form jarak" onSubmit={(e) => void simpanSesi(e)}>
          <div className="as-baris">
            <label>Nama sesi<input required maxLength={60} value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="Sesi 1" /></label>
            <label>Paket soal
              <select value={form.paket_id} onChange={(e) => setForm({ ...form, paket_id: e.target.value })}>
                <option value="">Belum dipilih</option>
                {(paket ?? []).map((p) => <option key={p.id} value={p.id}>{p.nama} ({p.jumlah_soal} soal)</option>)}
              </select>
            </label>
          </div>
          <div className="as-baris">
            <label>Mulai<input type="datetime-local" required value={form.mulai} onChange={(e) => setForm({ ...form, mulai: e.target.value })} /></label>
            <label>Selesai (batas masuk dan kerja)<input type="datetime-local" required value={form.selesai} onChange={(e) => setForm({ ...form, selesai: e.target.value })} /></label>
          </div>
          <div className="aksi"><button className="tombol tombol-isi">Simpan sesi</button><button type="button" className="tombol" onClick={() => setForm(null)}>Batal</button></div>
        </form>
      )}
      {(data ?? []).map((s) => (
        <div key={s.id} className="kartu jarak">
          <div className="as-baris" style={{ alignItems: 'center' }}>
            <div style={{ flex: '1 1 240px' }}>
              <h3 style={{ margin: 0 }}>{s.nama}</h3>
              <p className="as-kecil" style={{ margin: '2px 0 0' }}>{jam(s.mulai)} sampai {jam(s.selesai)} · paket: {s.paket_nama ?? 'belum dipilih'}</p>
            </div>
            <button className="tombol" onClick={() => setForm({ id: s.id, nama: s.nama, paket_id: s.paket_id ?? '', mulai: keInputLokal(s.mulai), selesai: keInputLokal(s.selesai) })}>Ubah</button>
            <button className="tombol" style={merah} onClick={() => void jalankan('ad_sesi_hapus', { p_id: s.id }, 'Hapus sesi ini?')}>Hapus</button>
          </div>
          <div className="tabel-bungkus jarak">
            <table>
              <thead><tr><th>Ruang</th><th>Pengawas</th><th>Peserta</th><th /></tr></thead>
              <tbody>
                {s.ruang.map((r) => (
                  <tr key={r.id}>
                    <td>{r.ruang}</td>
                    <td>{r.pengawas ?? <span className="as-awas">Belum ada</span>}</td>
                    <td>{r.peserta} / {r.kapasitas}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="tombol" onClick={() => setTempat({ sr: r.id, rombel: [], acak: false })}>Tempatkan siswa</button>{' '}
                      <Link className="tombol" to={`/asesmen/pantau/${r.id}`}>Pantau</Link>{' '}
                      <button className="tombol" style={merah} onClick={() => void jalankan('ad_sesi_ruang_hapus', { p_id: r.id }, 'Lepas ruang ini dari sesi? Penempatan siswanya ikut hilang.')}>Lepas</button>
                    </td>
                  </tr>
                ))}
                {s.ruang.length === 0 && <tr><td colSpan={4} className="as-kecil">Belum ada ruang.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="aksi" style={{ marginTop: 8 }}><button className="tombol" onClick={() => setTambahRuang({ sesi: s.id, ruang: '', pengawas: '' })}>Tambah ruang dan pengawas</button></div>
        </div>
      ))}
      {tambahRuang && (
        <form className="kartu form jarak" onSubmit={(e) => void simpanRuang(e)}>
          <h3 style={{ marginTop: 0 }}>Ruang dan pengawas</h3>
          <div className="as-baris">
            <label>Ruang
              <select required value={tambahRuang.ruang} onChange={(e) => setTambahRuang({ ...tambahRuang, ruang: e.target.value })}>
                <option value="">Pilih ruang</option>
                {(ruang ?? []).map((r) => <option key={r.id} value={r.id}>{r.nama} (kapasitas {r.kapasitas})</option>)}
              </select>
            </label>
            <label>Pengawas
              <select value={tambahRuang.pengawas} onChange={(e) => setTambahRuang({ ...tambahRuang, pengawas: e.target.value })}>
                <option value="">Belum dipilih</option>
                {(ptk ?? []).map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
              </select>
            </label>
          </div>
          <p className="as-kecil">Memilih ruang yang sudah ada di sesi ini mengganti pengawasnya. Ruang baru bisa ditambah di menu Ruang.</p>
          <div className="aksi"><button className="tombol tombol-isi">Simpan</button><button type="button" className="tombol" onClick={() => setTambahRuang(null)}>Batal</button></div>
        </form>
      )}
      {tempat && (
        <form className="kartu form jarak" onSubmit={(e) => void tempatkan(e)}>
          <h3 style={{ marginTop: 0 }}>Tempatkan siswa aktif per kelas</h3>
          <p className="as-kecil">Siswa yang sudah ada di sesi ini dilewati. Pengisian berhenti saat ruang penuh.</p>
          <div className="as-kisi">
            {(rombel ?? []).map((r) => (
              <label key={r.id} className="baris-centang">
                <input type="checkbox" checked={tempat.rombel.includes(r.id)}
                  onChange={(e) => setTempat({ ...tempat, rombel: e.target.checked ? [...tempat.rombel, r.id] : tempat.rombel.filter((x) => x !== r.id) })} />
                <span>{r.nama} ({r.jumlah})</span>
              </label>
            ))}
          </div>
          <label className="baris-centang"><input type="checkbox" checked={tempat.acak} onChange={(e) => setTempat({ ...tempat, acak: e.target.checked })} /><span>Acak urutan dan tempat duduk (campur lintas kelas)</span></label>
          <div className="aksi"><button className="tombol tombol-isi" disabled={tempat.rombel.length === 0}>Tempatkan</button><button type="button" className="tombol" onClick={() => setTempat(null)}>Batal</button></div>
        </form>
      )}
    </>
  )
}

function TabRekap({ ujian }: { ujian: Ujian }) {
  const { data, galat, muat } = useRpc<Rekap[]>('ad_rekap', { p_ujian: ujian.id })
  const label: Record<string, string> = { belum: 'Belum mulai', mengerjakan: 'Mengerjakan', selesai: 'Selesai' }
  const hitung = (s: string) => (data ?? []).filter((r) => r.status === s).length
  function unduh() {
    unduhCsv(`rekap-${ujian.nama}.csv`, [
      ['Sesi', 'Ruang', 'Kursi', 'Nama', 'NISN', 'Kelas', 'Paket', 'Status', 'Nilai', 'Benar', 'Pelanggaran'],
      ...(data ?? []).map((r) => [r.sesi, r.ruang, r.no_kursi, r.nama, r.nisn, r.kelas, r.paket, label[r.status], r.nilai, r.benar, r.pelanggaran]),
    ])
  }
  return (
    <>
      <Galat pesan={galat} />
      <p className="as-kecil">{hitung('selesai')} selesai · {hitung('mengerjakan')} mengerjakan · {hitung('belum')} belum mulai</p>
      <div className="aksi" style={{ marginTop: 0 }}>
        <button className="tombol" onClick={() => void muat()}>Muat ulang</button>
        <button className="tombol" onClick={unduh} disabled={!data?.length}>Unduh CSV</button>
      </div>
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Sesi</th><th>Ruang</th><th>Kursi</th><th>Nama</th><th>Kelas</th><th>Status</th><th>Nilai</th><th>Pelanggaran</th></tr></thead>
          <tbody>
            {(data ?? []).map((r, i) => (
              <tr key={i}>
                <td>{r.sesi}</td><td>{r.ruang}</td><td>{r.no_kursi ?? '-'}</td><td>{r.nama}</td><td>{r.kelas ?? '-'}</td>
                <td className={`as-status-${r.status}`}>{label[r.status]}</td>
                <td>{nilaiTeks(r.nilai)}</td>
                <td className={r.pelanggaran ? 'as-awas' : ''}>{r.pelanggaran ?? '-'}{r.terkunci ? ' (terkunci)' : ''}</td>
              </tr>
            ))}
            {data && data.length === 0 && <tr><td colSpan={8} className="as-kecil">Belum ada peserta.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function RuangDaftar() {
  const { data, galat, muat } = useRpc<Ruang[]>('ad_ruang_daftar')
  const [f, setF] = useState<{ id: string | null; nama: string; kapasitas: number }>({ id: null, nama: '', kapasitas: 36 })
  const [pesan, setPesan] = useState('')
  async function simpan(e: FormEvent) {
    e.preventDefault(); setPesan('')
    try { await panggil('ad_ruang_simpan', { p_id: f.id, p_nama: f.nama, p_kapasitas: f.kapasitas }); setF({ id: null, nama: '', kapasitas: 36 }); await muat() } catch (er) { setPesan((er as Error).message) }
  }
  async function hapus(id: string) {
    if (!window.confirm('Hapus ruang ini?')) return
    try { await panggil('ad_ruang_hapus', { p_id: id }); await muat() } catch (er) { setPesan((er as Error).message) }
  }
  return (
    <>
      <h1>Ruang ujian</h1>
      <p className="lead">Ruang fisik tempat siswa duduk. Satu ruang bisa dipakai di banyak sesi.</p>
      <Galat pesan={galat || pesan} />
      <form className="kartu form" onSubmit={(e) => void simpan(e)}>
        <div className="as-baris">
          <label>Nama ruang<input required maxLength={60} value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} placeholder="Lab Komputer 1" /></label>
          <label>Kapasitas<input type="number" min={1} max={200} required value={f.kapasitas} onChange={(e) => setF({ ...f, kapasitas: Number(e.target.value) })} /></label>
          <button className="tombol tombol-isi">{f.id ? 'Simpan perubahan' : 'Tambah ruang'}</button>
          {f.id && <button type="button" className="tombol" onClick={() => setF({ id: null, nama: '', kapasitas: 36 })}>Batal</button>}
        </div>
      </form>
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Ruang</th><th>Kapasitas</th><th /></tr></thead>
          <tbody>
            {(data ?? []).map((r) => (
              <tr key={r.id}><td>{r.nama}</td><td>{r.kapasitas}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="tombol" onClick={() => setF({ id: r.id, nama: r.nama, kapasitas: r.kapasitas })}>Ubah</button>{' '}
                  <button className="tombol" style={merah} onClick={() => void hapus(r.id)}>Hapus</button>
                </td></tr>
            ))}
            {data && data.length === 0 && <tr><td colSpan={3} className="as-kecil">Belum ada ruang.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
