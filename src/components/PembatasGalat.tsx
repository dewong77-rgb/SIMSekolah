import { Component, type ErrorInfo, type ReactNode } from 'react'

const KUNCI_MUAT_ULANG = 'sims-muat-ulang-galat'

/** Galat karena berkas halaman hasil deploy lama sudah tidak ada di server. */
export function galatBerkasLama(e: unknown): boolean {
  const pesan = e instanceof Error ? `${e.name} ${e.message}` : String(e)
  return /dynamically imported module|Loading chunk|Loading CSS chunk|Importing a module script failed|error loading dynamically|Unable to preload CSS|ChunkLoadError/i.test(pesan)
}

/** Muat ulang otomatis paling banyak satu kali per 30 detik, supaya tidak berputar tanpa henti. */
export function muatUlangSekali(): boolean {
  try {
    const terakhir = Number(sessionStorage.getItem(KUNCI_MUAT_ULANG) ?? 0)
    if (Date.now() - terakhir < 30_000) return false
    sessionStorage.setItem(KUNCI_MUAT_ULANG, String(Date.now()))
  } catch {
    return false
  }
  window.location.reload()
  return true
}

export function Memuat() {
  return (
    <p className="catatan" role="status" aria-live="polite" style={{ padding: '24px 0' }}>
      Memuat halaman...
    </p>
  )
}

type Props = { children: ReactNode; ruang?: 'portal' | 'akar' }
type State = { galat: unknown | null; memuatUlang: boolean }

/**
 * Galat di satu halaman tidak boleh mematikan seluruh aplikasi.
 * Pakai `key={pathname}` agar pindah halaman otomatis mengosongkan galat.
 */
export default class PembatasGalat extends Component<Props, State> {
  state: State = { galat: null, memuatUlang: false }

  static getDerivedStateFromError(galat: unknown): Partial<State> {
    return { galat }
  }

  componentDidCatch(galat: unknown, info: ErrorInfo) {
    if (galatBerkasLama(galat)) {
      // Deploy baru membuat nama berkas lama hilang. Muat ulang menarik versi terbaru.
      if (muatUlangSekali()) this.setState({ memuatUlang: true })
      return
    }
    console.error('[SIMS] Halaman gagal ditampilkan:', galat, info.componentStack)
  }

  render() {
    const { galat, memuatUlang } = this.state
    if (galat == null) return this.props.children

    if (memuatUlang) return <Memuat />

    const lama = galatBerkasLama(galat)
    return (
      <div className="kartu" role="alert" style={{ maxWidth: 560, margin: '32px auto' }}>
        <h2 style={{ marginTop: 0 }}>{lama ? 'Ada versi baru aplikasi' : 'Halaman ini gagal ditampilkan'}</h2>
        <p>
          {lama
            ? 'Aplikasi baru saja diperbarui. Muat ulang untuk melanjutkan. Pekerjaan yang belum disimpan di halaman ini mungkin hilang.'
            : 'Terjadi kesalahan saat menampilkan halaman. Muat ulang dahulu. Bila berulang, catat halaman dan langkah yang Anda lakukan, lalu laporkan ke operator.'}
        </p>
        <p style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="tombol tombol-isi" onClick={() => window.location.reload()}>Muat ulang</button>
          {this.props.ruang === 'portal' && (
            <a className="tombol" href="/portal">Kembali ke portal</a>
          )}
        </p>
        {!lama && (
          <details>
            <summary className="catatan">Rincian teknis</summary>
            <pre className="catatan" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {galat instanceof Error ? `${galat.name}: ${galat.message}` : String(galat)}
            </pre>
          </details>
        )}
      </div>
    )
  }
}
