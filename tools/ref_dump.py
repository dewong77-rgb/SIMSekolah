"""Jalankan kode Python asli (dapodik_import.py) dengan kursor palsu untuk menghasilkan acuan
tingkat rekaman. Tidak memerlukan basis data. Keluaran: JSON kanonik yang dibandingkan dengan parser TypeScript."""
import json, os, re, sys, contextlib
sys.path.insert(0, os.path.dirname(__file__))
import dapodik_import as D

class Fake:
    def __init__(self):
        self.t = {}            # tabel -> dict(kunci_konflik -> baris)
        self.last = None
        self.keang = []        # (rombel_id, pd_id, no_urut) per panggilan set_keanggotaan
        self.rombel = {}       # id -> baris
    def _tbl(self, n): return self.t.setdefault(n, {})
    def execute(self, sql, params=None):
        s = ' '.join(sql.split())
        self.last = None
        if s.startswith('select count(*) from'):
            n = re.search(r'from (\w+) where', s).group(1)
            self.last = [(len(self._tbl(n)),)]
        elif s.startswith('select kunci_identitas, id from'):
            self.last = [(k, 'id:' + k) for k in params[1]]
        elif s.startswith('insert into rombel'):
            cols = re.search(r'\(([^)]*)\) values', s).group(1).split(',')
            d = dict(zip(cols, params))
            rid = '|'.join([d['semester_id'], d['jenis_rombel'], d['nama']])
            cur = self.rombel.get(rid, {})
            cur.update({c: v for c, v in d.items() if c not in ('npsn', 'batch_id')})
            self.rombel[rid] = cur
            self.last = [(rid,)]
        elif s.startswith("select to_regclass"):
            self.last = [(True,)]
        elif s.startswith('select lower(regexp_replace(trim(nama)'):
            self.last = [(D.nkey(r['nama']), 'dudi:' + k[1]) for k, r in self._tbl('dudi').items()]
        elif s.startswith('delete from') and 'where npsn' in s and 'keanggotaan' not in s:
            self._tbl(re.search(r'from (\w+) where', s).group(1)).clear()
    def fetchone(self): return self.last[0]
    def fetchall(self): return self.last
    def executemany(self, sql, rows):
        s = ' '.join(sql.split())
        m = re.match(r'insert into (\w+) \(([^)]*)\) values .*?(?: on conflict \(([^)]*)\))?', s)
        n = m.group(1); cols = m.group(2).split(',')
        mc = re.search(r'on conflict \(([^)]*)\)', s)
        conf = mc.group(1).split(',') if mc else None
        keep_first = bool(mc) and s.endswith('do nothing')
        keep_first = keep_first or (bool(mc) and 'do update' not in s)
        T = self._tbl(n)
        for i, r in enumerate(rows):
            d = dict(zip(cols, r))
            k = tuple(d[c] for c in conf) if conf else (i, len(T))
            if k in T and keep_first: continue
            T[k] = d
    @contextlib.contextmanager
    def copy(self, sql):
        class W:
            def __init__(s2, o): s2.o = o
            def write_row(s2, r): s2.o.keang.append(tuple(r))
        yield W(self)

def upsert_rec(cur, table, rows, cols, conflict, update=None, touch=False):
    if not rows: return
    T = cur._tbl(table)
    for r in rows:
        d = {c: r.get(c) for c in cols}
        k = tuple(d[c] for c in conflict)
        if update == [] and k in T: continue
        T[k] = d
D.upsert = upsert_rec   # versi sederhana: hasil akhir sama, tanpa menafsir SQL

def snap(cur_t, name): return [dict(v) for v in cur_t.get(name, {}).values()]

def jalankan(path):
    book = D.read_book(path)
    jenis = D.detect(book)
    ctx = D.Ctx(jenis)
    D.baca_meta(next(iter(book.values())), ctx)
    cur = Fake()
    semester = None
    if jenis != 'absensi':
        import datetime as _dt; semester = D.semester_dari_tanggal((ctx.diunduh or _dt.datetime.now()).date())[0]
    npsn = 'X'
    if jenis == 'profil':
        kv_sk = None
        # simpan_sekolah memakai cur.execute insert; tangkap parameter lewat kursor khusus
        class C2(Fake):
            def execute(s2, sql, params=None):
                if sql.startswith('insert into sekolah'):
                    cols = re.search(r'\(([^)]*)\) values', sql).group(1).split(',')
                    s2.sekolah = dict(zip(cols, params))
                else: super().execute(sql, params)
        cur = C2()
        D.simpan_sekolah(cur, book, ctx)
    ring = D.HANDLERS[jenis](cur, ctx, book, jenis, npsn, 'B', semester)
    t = {}
    def kanon_pd(rows):
        out = []
        for r in rows:
            r = {k: (v.isoformat() if hasattr(v, 'isoformat') else v) for k, v in r.items() if k not in ('npsn', 'batch_id')}
            out.append(r)
        return out
    def keyed(name, idcol, ren):
        out = []
        for r in cur._tbl(name).values():
            r = {k: (v.isoformat() if hasattr(v, 'isoformat') else v) for k, v in r.items() if k not in ('npsn', 'batch_id')}
            if idcol in r:
                v = r.pop(idcol); r[ren] = v[3:] if v.startswith('id:') else v
            out.append(r)
        return out
    if jenis in ('pd_aktif', 'pd_keluar'):
        t['peserta_didik'] = keyed('peserta_didik', 'kunci_identitas', 'kunci_identitas')
        t['peserta_didik_sensitif'] = keyed('peserta_didik_sensitif', 'peserta_didik_id', 'kunci_identitas')
        t['orang_tua_wali'] = keyed('orang_tua_wali', 'peserta_didik_id', 'kunci_identitas')
        if jenis == 'pd_aktif':
            t['rombel'] = [dict(semester_id=k.split('|')[0], jenis_rombel=k.split('|')[1], nama=k.split('|')[2],
                                tingkat=v['tingkat']) for k, v in cur.rombel.items()]
            rid2 = {k: k for k in cur.rombel}
            pdk = {}
            t['keanggotaan_rombel'] = [dict(semester_id=a[0].split('|')[0], jenis_rombel=a[0].split('|')[1],
                                           rombel=a[0].split('|')[2], kunci_identitas=a[1][3:], no_urut=a[2]) for a in cur.keang]
    elif jenis in ('guru', 'tendik'):
        t['ptk'] = keyed('ptk', 'kunci_identitas', 'kunci_identitas')
        t['ptk_sensitif'] = keyed('ptk_sensitif', 'ptk_id', 'kunci_identitas')
    elif jenis == 'absensi':
        t['peserta_didik_stub'] = keyed('peserta_didik', 'kunci_identitas', 'kunci_identitas')
        t['rombel'] = [dict(semester_id=k.split('|')[0], jenis_rombel=k.split('|')[1], nama=k.split('|')[2],
                            tingkat=v['tingkat'], wali_kelas_nama=v.get('wali_kelas_nama')) for k, v in cur.rombel.items()]
        t['keanggotaan_rombel'] = [dict(semester_id=a[0].split('|')[0], jenis_rombel=a[0].split('|')[1],
                                       rombel=a[0].split('|')[2], kunci_identitas=a[1][3:], no_urut=a[2]) for a in cur.keang]
    elif jenis == 'profil':
        sk = {k: (v.isoformat() if hasattr(v, 'isoformat') else v) for k, v in cur.sekolah.items()}
        sk['atribut'] = json.loads(sk['atribut'])
        t['sekolah'] = [sk]
        t['rombel'] = [dict(semester_id=k.split('|')[0], jenis_rombel=k.split('|')[1], nama=k.split('|')[2],
                            tingkat=v['tingkat'], kurikulum=v.get('kurikulum'), ruangan=v.get('ruangan'),
                            wali_kelas_nama=v.get('wali_kelas_nama'), jumlah_l_profil=v.get('jumlah_l_profil'),
                            jumlah_p_profil=v.get('jumlah_p_profil')) for k, v in cur.rombel.items()]
        t['ptk'] = keyed('ptk', 'kunci_identitas', 'kunci_identitas')
        t['ptk_sensitif'] = keyed('ptk_sensitif', 'ptk_id', 'kunci_identitas')
        for n in ('prasarana', 'sarana', 'bantuan_sekolah'):
            if n in cur.t: t[n] = kanon_pd(list(cur.t[n].values()))
    elif jenis == 'sekolah_smk':
        t['kompetensi_keahlian'] = kanon_pd(list(cur._tbl('kompetensi_keahlian').values()))
        t['dudi'] = kanon_pd(list(cur._tbl('dudi').values()))
        mou = []
        for r in cur._tbl('mou_kerjasama').values():
            r = dict(r); r['dudi_cocok'] = 0 if r.pop('dudi_id') is None else 1
            mou.append(r)
        t['mou_kerjasama'] = kanon_pd(mou)
        for n in ('unit_produksi', 'praktik_industri'):
            t[n] = kanon_pd(list(cur._tbl(n).values())) if n in cur.t else []
    isu = ctx.daftar()
    return dict(jenis=jenis, diunduh=ctx.diunduh.isoformat() if ctx.diunduh else None, pengunduh=ctx.pengunduh,
                semester=semester, tabel=t, isu=isu)

if __name__ == '__main__':
    src, out = sys.argv[1:3]
    os.makedirs(out, exist_ok=True)
    for f in sorted(os.listdir(src)):
        r = jalankan(os.path.join(src, f))
        json.dump(r, open(os.path.join(out, 'rekaman_%s.json' % f), 'w'), default=str, ensure_ascii=False)
        print(f, r['jenis'], {k: len(v) for k, v in r['tabel'].items()}, 'isu', len(r['isu']))
