// Bandingkan keluaran parser TypeScript dengan acuan rekaman dari Python (tools/ref_dump.py).
import { readFileSync, readdirSync } from 'node:fs'
import { bacaBerkas } from '../src/dapodik/readers'
import { uraiBook } from '../src/dapodik/parser'

const [src, ref] = process.argv.slice(2)
const kanon = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(kanon)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, kanon(x)]))
  return v === undefined ? null : v
}
const s = (v: unknown) => JSON.stringify(kanon(v))
let gagal = 0
for (const f of readdirSync(src).sort()) {
  const t0 = Date.now()
  const hasil = await uraiBook(bacaBerkas(new Uint8Array(readFileSync(`${src}/${f}`))))
  const ms = Date.now() - t0
  const acuan = JSON.parse(readFileSync(`${ref}/rekaman_${f}.json`, 'utf-8'))
  const catatan: string[] = []
  for (const k of ['jenis', 'diunduh', 'pengunduh', 'semester'] as const) {
    if (s(hasil[k]) !== s(acuan[k])) catatan.push(`${k}: ts=${s(hasil[k])} py=${s(acuan[k])}`)
  }
  // tabel: cocokkan baris menurut urutan; pembanding juga melaporkan jika hanya urutan yang beda
  const nama = new Set([...Object.keys(hasil.tabel), ...Object.keys(acuan.tabel)])
  let barisTotal = 0
  for (const n of nama) {
    const a = (hasil.tabel[n] ?? []).map((r) => {
      const x = { ...r } as Record<string, unknown>
      if (n === 'sekolah' && typeof x.atribut === 'string') x.atribut = JSON.parse(x.atribut)
      return s(x)
    })
    const b = (acuan.tabel[n] ?? []).map(s)
    barisTotal += a.length
    if (a.length !== b.length) { catatan.push(`${n}: jumlah ts=${a.length} py=${b.length}`); }
    const sa = [...a].sort(), sb = [...b].sort()
    let beda = 0
    const contoh: string[] = []
    for (let i = 0; i < Math.min(sa.length, sb.length); i++) if (sa[i] !== sb[i]) { beda++; if (contoh.length < 2) contoh.push(`ts=${sa[i].slice(0, 300)}\n        py=${sb[i].slice(0, 300)}`) }
    if (beda) catatan.push(`${n}: ${beda} baris beda\n      ${contoh.join('\n      ')}`)
    else if (a.length === b.length && a.some((x, i) => x !== b[i])) catatan.push(`${n}: isi sama, urutan beda`)
  }
  const ia = hasil.isu.map(s), ib = (acuan.isu as unknown[]).map(s)
  if (JSON.stringify(ia) !== JSON.stringify(ib)) {
    const sa = ia.filter((x) => !ib.includes(x)), sb = ib.filter((x) => !ia.includes(x))
    catatan.push(`isu beda: hanya di ts=${JSON.stringify(sa)} hanya di py=${JSON.stringify(sb)}`)
  }
  if (catatan.length) gagal++
  console.log(`${catatan.length ? 'GAGAL' : 'ok   '} ${f} (${hasil.jenis}): ${barisTotal} baris tabel, ${hasil.isu.length} isu, ${ms} ms`)
  for (const c of catatan) console.log('   ', c)
}
process.exit(gagal ? 1 : 0)
