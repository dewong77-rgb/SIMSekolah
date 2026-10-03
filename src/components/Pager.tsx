// Kontrol halaman bersama: jumlah per halaman (10, 20, 50, Semua) dan tombol sebelumnya/berikutnya.
// Untuk daftar yang dibaca per halaman dari server, "Semua" dibatasi 1000 baris (batas PostgREST).
export const OPSI_UKURAN = [10, 20, 50, 0] as const
export const BATAS_SEMUA = 1000
/** Jumlah baris yang benar-benar diminta untuk ukuran halaman tertentu (0 berarti Semua). */
export const efektif = (ukuran: number) => (ukuran === 0 ? BATAS_SEMUA : ukuran)

export default function Pager({
  halaman, total, ukuran, ke, ubahUkuran, server = false,
}: {
  halaman: number; total: number; ukuran: number; ke: (n: number) => void; ubahUkuran: (u: number) => void; server?: boolean
}) {
  const per = efektif(ukuran)
  const maks = Math.max(Math.ceil(total / per), 1)
  const dari = total === 0 ? 0 : (halaman - 1) * per + 1
  const sampai = Math.min(halaman * per, total)
  return (
    <div className="aksi jarak" style={{ alignItems: 'center' }}>
      <label className="catatan" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        Tampilkan
        <select value={ukuran} onChange={(e) => { ubahUkuran(Number(e.target.value)); ke(1) }} aria-label="Jumlah per halaman">
          {OPSI_UKURAN.map((o) => <option key={o} value={o}>{o === 0 ? 'Semua' : o}</option>)}
        </select>
      </label>
      <button className="tombol" disabled={halaman <= 1} onClick={() => ke(halaman - 1)}>Sebelumnya</button>
      <span className="catatan">
        {total === 0 ? 'Tidak ada data' : `${dari.toLocaleString('id-ID')} sampai ${sampai.toLocaleString('id-ID')} dari ${total.toLocaleString('id-ID')}`}
        {maks > 1 ? ` (halaman ${halaman} dari ${maks})` : ''}
      </span>
      <button className="tombol" disabled={halaman >= maks} onClick={() => ke(halaman + 1)}>Berikutnya</button>
      {server && ukuran === 0 && total > BATAS_SEMUA && <span className="catatan">Dibatasi {BATAS_SEMUA.toLocaleString('id-ID')} baris. Persempit dengan filter atau pencarian.</span>}
    </div>
  )
}
