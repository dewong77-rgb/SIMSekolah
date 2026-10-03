#!/usr/bin/env python3
"""
Importer referensi Dapodik -> Postgres (skema sims_dapodik_schema.sql).

Tujuan: pengguna cukup mengunduh dari Dapodik lalu mengunggah berkas apa adanya.
Importer ini adalah acuan perilaku dan alat uji. Logika yang sama nanti dipindah
ke TypeScript (parsing di peramban) untuk aplikasi Vercel + Supabase.

Prinsip perilaku:
  * Jenis berkas dikenali dari ISI, bukan nama file.
  * Kolom dipetakan lewat NAMA header, bukan urutan. Urutan atau tambahan kolom aman.
  * Format .xlsx dan .xls-XML (SpreadsheetML) dibaca. SpreadsheetML dari Dapodik
    tidak meng-escape karakter "<" dan "&", jadi disanitasi dulu.
  * Idempoten: berkas yang sama (sha256) tidak diproses ulang; berkas baru meng-upsert.
  * Urutan unggah bebas, kecuali profil harus lebih dulu pada database kosong
    (NPSN hanya ada di berkas profil).
  * Masalah data tidak menghentikan impor. Semua dicatat di import_isu.
"""
import argparse, datetime as dt, glob, hashlib, json, os, re, sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

# ----------------------------------------------------------------------------
# 1. Pembaca berkas
# ----------------------------------------------------------------------------
_SS = 'urn:schemas-microsoft-com:office:spreadsheet'
_DATA_RE = re.compile(r'(<Data\b[^>]*>)(.*?)(</Data>)', re.S)


class BerkasTidakDikenali(Exception):
    pass


def _fix_data(m):
    inner = re.sub(r'&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)', '&amp;', m.group(2))
    return m.group(1) + inner.replace('<', '&lt;') + m.group(3)


def _read_spreadsheetml(path):
    txt = open(path, encoding='utf-8', errors='replace').read()
    txt = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', txt)
    txt = _DATA_RE.sub(_fix_data, txt)
    root = ET.fromstring(txt.encode('utf-8'))
    ns = {'s': _SS}
    idx = '{%s}Index' % _SS
    across = '{%s}MergeAcross' % _SS
    name_attr = '{%s}Name' % _SS
    book = {}
    for ws in root.findall('s:Worksheet', ns):
        table = ws.find('s:Table', ns)
        if table is None:
            continue
        rows = []
        for r in table.findall('s:Row', ns):
            if r.get(idx):
                while len(rows) < int(r.get(idx)) - 1:
                    rows.append([])
            row = []
            for c in r.findall('s:Cell', ns):
                if c.get(idx):
                    while len(row) < int(c.get(idx)) - 1:
                        row.append(None)
                d = c.find('s:Data', ns)
                row.append(''.join(d.itertext()) if d is not None else None)
                for _ in range(int(c.get(across) or 0)):
                    row.append(None)
            rows.append(row)
        book[ws.get(name_attr)] = rows
    return book


def read_book(path):
    with open(path, 'rb') as f:
        head = f.read(512)
    if head[:4] == b'PK\x03\x04':
        import openpyxl
        wb = openpyxl.load_workbook(path, data_only=True)
        return {ws.title: [list(r) for r in ws.iter_rows(values_only=True)] for ws in wb.worksheets}
    if head[:8] == b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1':
        raise BerkasTidakDikenali('Berkas .xls biner lama. Simpan ulang sebagai .xlsx lalu unggah lagi.')
    if b'urn:schemas-microsoft-com:office:spreadsheet' in head or head.lstrip()[:5] == b'<?xml':
        return _read_spreadsheetml(path)
    raise BerkasTidakDikenali('Format berkas tidak dikenali (bukan xlsx maupun xls XML).')


# ----------------------------------------------------------------------------
# 2. Utilitas nilai
# ----------------------------------------------------------------------------
def norm(s):
    if s is None:
        return ''
    return re.sub(r'\s+', ' ', str(s).replace('\n', ' ')).strip().lower().rstrip(':').strip()


def _mojibake(s):
    """Ekspor Dapodik memuat 'â€“' (en dash yang salah encoding) pada kolom penghasilan."""
    if 'â' in s or 'Ã' in s:
        try:
            return s.encode('cp1252').decode('utf-8')
        except (UnicodeEncodeError, UnicodeDecodeError):
            return s
    return s


def clean(v):
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    s = _mojibake(str(v)).strip()
    return None if s in ('', '-', '--') else s


def to_date(v):
    v = clean(v)
    if v is None or isinstance(v, dt.date):
        return v, None
    for fmt in ('%Y-%m-%d', '%Y-%m-%d %H:%M:%S', '%d-%m-%Y', '%d/%m/%Y'):
        try:
            return dt.datetime.strptime(v, fmt).date(), None
        except ValueError:
            pass
    return None, 'tanggal tidak terbaca: %r' % v


def to_num(v, zero_null=False):
    v = clean(v)
    if v is None:
        return None, None
    try:
        n = float(str(v).replace(',', '.'))
    except ValueError:
        return None, 'angka tidak terbaca: %r' % v
    if zero_null and n == 0:
        return None, None
    return (int(n) if n.is_integer() else n), None


def to_int(v):
    n, err = to_num(v)
    if err or n is None:
        return None, err
    return int(n), None


def sha(*parts):
    return hashlib.sha256('|'.join(str(p) for p in parts).encode('utf-8')).hexdigest()


def nkey(s):
    return re.sub(r'\s+', ' ', (s or '').strip().lower())


def tingkat_dari_nama(nama):
    m = re.match(r'^(XIII|XII|XI|X)\b', (nama or '').strip().upper())
    return {'X': 10, 'XI': 11, 'XII': 12, 'XIII': 13}.get(m.group(1)) if m else None


def semester_dari_tanggal(d):
    """Tahun ajaran mulai Juli. Juli-Desember = Ganjil, Januari-Juni = Genap."""
    if d.month >= 7:
        return '%d%d' % (d.year, 1), '%d/%d' % (d.year, d.year + 1), 'Ganjil'
    return '%d%d' % (d.year - 1, 2), '%d/%d' % (d.year - 1, d.year), 'Genap'


def semester_dari_id(sid):
    y, s = int(sid[:4]), sid[4]
    return sid, '%d/%d' % (y, y + 1), 'Ganjil' if s == '1' else 'Genap'


# ----------------------------------------------------------------------------
# 3. Konteks dan pencatat isu
# ----------------------------------------------------------------------------
class Ctx:
    def __init__(self, jenis):
        self.jenis = jenis
        self._isu = {}
        self.diunduh = None
        self.pengunduh = None

    def isu(self, tingkat, pesan, lembar=None, baris=None, kolom=None):
        k = (tingkat, lembar, kolom, pesan)
        if k not in self._isu:
            self._isu[k] = [0, baris]
        self._isu[k][0] += 1

    def daftar(self):
        out = []
        for (tingkat, lembar, kolom, pesan), (n, baris) in self._isu.items():
            if n > 1:
                pesan = '%s (%d baris)' % (pesan, n)
            out.append(dict(tingkat=tingkat, lembar=lembar, baris=baris, kolom=kolom, pesan=pesan))
        return out


def baca_meta(rows, ctx):
    """Ambil 'Tanggal Unduh' dan 'Pengunduh' dari baris judul (10 baris pertama)."""
    for r in rows[:10]:
        for c in r:
            s = clean(c)
            if not isinstance(s, str):
                continue
            m = re.search(r'Tanggal Unduh:\s*(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?', s)
            if not m:
                m = re.search(r'Per tanggal\s*:\s*(\d{4}-\d{2}-\d{2})()', s)
            if m and ctx.diunduh is None:
                ctx.diunduh = dt.datetime.strptime(m.group(1) + ' ' + (m.group(2) or '00:00:00'),
                                                   '%Y-%m-%d %H:%M:%S')
            m = re.search(r'Pengunduh:\s*([^(]+)', s)
            if m and ctx.pengunduh is None:
                ctx.pengunduh = m.group(1).strip()


# ----------------------------------------------------------------------------
# 4. Deteksi jenis berkas (berdasarkan isi)
# ----------------------------------------------------------------------------
def detect(book):
    names = list(book)
    if any(n.startswith('Profil ') for n in names) and 'Rombongan Belajar' in book:
        return 'profil'
    if 'Kompetensi Keahlian' in book and 'Relasi DUDI' in book:
        return 'sekolah_smk'
    first = book[names[0]] if names else []
    a1 = norm(first[0][0]) if first and first[0] else ''
    if a1 == 'daftar hadir siswa':
        return 'absensi'
    if a1.startswith('daftar peserta didik keluar'):
        return 'pd_keluar'
    if a1.startswith('daftar peserta didik'):
        return 'pd_aktif'
    if a1 == 'daftar guru':
        return 'guru'
    if a1.startswith('daftar tenaga kependidikan'):
        return 'tendik'
    return None


# ----------------------------------------------------------------------------
# 5. Header: cari baris header, gabungkan header bertingkat, petakan lewat nama
# ----------------------------------------------------------------------------
def cari_header(rows, jangkar):
    for i, r in enumerate(rows[:30]):
        labels = {norm(c) for c in r if norm(c)}
        if len(labels) >= 2 and jangkar <= labels:
            return i
    return None


def label_gabungan(rows, h):
    """Kembalikan (labels, indeks_baris_data_pertama). Menangani header dua tingkat."""
    top = rows[h]
    nxt = rows[h + 1] if h + 1 < len(rows) else []
    n = max(len(top), len(nxt))
    top = list(top) + [None] * (n - len(top))
    nxt = list(nxt) + [None] * (n - len(nxt))
    ada_sub = (not clean(nxt[0])) and any(norm(x) for x in nxt[1:]) \
        and not any(re.fullmatch(r'\d+', str(clean(x) or '')) for x in nxt[:1])
    labels, grup = [], None
    for c in range(n):
        t, s = norm(top[c]), norm(nxt[c]) if ada_sub else ''
        if t:
            grup = t if s else None
            labels.append('%s.%s' % (t, s) if s else t)
        elif s:
            labels.append('%s.%s' % (grup, s) if grup else s)
        else:
            labels.append('')
    return labels, (h + 2 if ada_sub else h + 1)


def baris_data(rows, mulai, kolom_kunci):
    for i in range(mulai, len(rows)):
        r = rows[i]
        if kolom_kunci < len(r) and clean(r[kolom_kunci]) is not None:
            yield i + 1, r


def petakan(rows, h, peta, ctx, lembar, wajib=()):
    """Terapkan peta {label: (medan, tipe)} ke semua baris data. Kembalikan list (nomor_baris, dict)."""
    labels, mulai = label_gabungan(rows, h)
    idx = {}
    for i, lb in enumerate(labels):
        if lb and lb not in idx:
            idx[lb] = i
    for w in wajib:
        if w not in idx:
            raise ValueError('Kolom wajib "%s" tidak ada di lembar %s' % (w, lembar))
    kunci = idx[wajib[0]] if wajib else 1
    hasil, dipakai = [], set()
    for nomor, r in baris_data(rows, mulai, kunci):
        rec = {}
        for lb, (medan, tipe) in peta.items():
            i = idx.get(lb)
            if i is None:
                continue
            dipakai.add(i)
            v = r[i] if i < len(r) else None
            rec[medan] = konversi(v, tipe, ctx, lembar, nomor, lb)
        hasil.append((nomor, rec))
    # kolom bernama yang tidak dikenal, atau tanpa judul tetapi berisi data
    dikenal = set(peta) | {'no'}
    for lb, i in idx.items():
        if lb in dikenal or i in dipakai:
            continue
        if any(clean(r[i]) is not None for _, r in baris_data(rows, mulai, kunci) if i < len(r)):
            ctx.isu('info', 'kolom tidak dikenal diabaikan', lembar, None, lb)
    for i in range(len(labels)):
        if labels[i] == '' and any(clean(r[i]) is not None
                                   for _, r in baris_data(rows, mulai, kunci) if i < len(r)):
            ctx.isu('info', 'kolom ke-%d tanpa judul tetapi berisi data, diabaikan' % (i + 1), lembar)
    return hasil


def konversi(v, tipe, ctx, lembar, baris, kolom):
    if tipe == 'text':
        v = clean(v)
        return v if v is None or isinstance(v, str) else str(v)
    if tipe == 'date':
        d, err = to_date(v)
    elif tipe == 'int':
        d, err = to_int(v)
    elif tipe == 'num':
        d, err = to_num(v)
    elif tipe == 'geo':
        d, err = to_num(v, zero_null=True)
    elif tipe == 'intlead':
        m = re.match(r'^\s*(\d+)', str(clean(v) or ''))
        d, err = (int(m.group(1)), None) if m else (None, ('angka tidak terbaca: %r' % v) if clean(v) else None)
    else:
        raise ValueError(tipe)
    if err:
        ctx.isu('peringatan', err, lembar, baris, kolom)
    return d


# ----------------------------------------------------------------------------
# 6. Peta kolom Dapodik -> medan database
# ----------------------------------------------------------------------------
T = 'text'
PD_MAIN = {
    'nama': ('nama', T), 'nipd': ('nipd', T), 'jk': ('jk', T), 'nisn': ('nisn', T),
    'tempat lahir': ('tempat_lahir', T), 'tanggal lahir': ('tanggal_lahir', 'date'),
    'agama': ('agama', T), 'alamat': ('alamat', T), 'rt': ('rt', T), 'rw': ('rw', T),
    'dusun': ('dusun', T), 'kelurahan': ('kelurahan', T), 'keluarahan': ('kelurahan', T),
    'kecamatan': ('kecamatan', T), 'kode pos': ('kode_pos', T), 'jenis tinggal': ('jenis_tinggal', T),
    'alat transportasi': ('alat_transportasi', T), 'telepon': ('telepon', T), 'hp': ('hp', T),
    'e-mail': ('email', T), 'skhun': ('skhun', T), 'penerima kps': ('penerima_kps', T),
    'kebutuhan khusus': ('kebutuhan_khusus', T), 'sekolah asal': ('sekolah_asal', T),
    'anak ke-berapa': ('anak_ke', 'int'), 'lintang': ('lintang', 'geo'), 'bujur': ('bujur', 'geo'),
    'berat badan': ('berat_badan', 'num'), 'tinggi badan': ('tinggi_badan', 'num'),
    'lingkar kepala': ('lingkar_kepala', 'num'), 'jml. saudara kandung': ('jml_saudara_kandung', 'int'),
    'jarak rumah ke sekolah (km)': ('jarak_rumah_km', 'num'),
    'layak pip (usulan dari sekolah)': ('layak_pip', T), 'alasan layak pip': ('alasan_layak_pip', T),
}
PD_SENS = {
    'nik': ('nik', T), 'no kk': ('no_kk', T), 'no. kps': ('no_kps', T), 'penerima kip': ('penerima_kip', T),
    'nomor kip': ('nomor_kip', T), 'nama di kip': ('nama_di_kip', T), 'nomor kks': ('nomor_kks', T),
    'no registrasi akta lahir': ('no_registrasi_akta_lahir', T),
    'no peserta ujian nasional': ('no_peserta_ujian_nasional', T), 'no seri ijazah': ('no_seri_ijazah', T),
    'bank': ('bank', T), 'nomor rekening bank': ('nomor_rekening', T),
    'rekening atas nama': ('rekening_atas_nama', T),
}
PD_EXTRA = {'rombel saat ini': ('_rombel', T), 'keluar karena': ('alasan_keluar', T),
            'tanggal keluar': ('tanggal_keluar', 'date')}
PD_ORTU = {}
for _h in ('ayah', 'ibu', 'wali'):
    for _lb, _f, _t in (('nama', 'nama', T), ('tahun lahir', 'tahun_lahir', 'int'),
                        ('jenjang pendidikan', 'jenjang_pendidikan', T), ('pekerjaan', 'pekerjaan', T),
                        ('penghasilan', 'penghasilan', T), ('nik', 'nik', T),
                        ('kebutuhan khusus', 'kebutuhan_khusus', T)):
        PD_ORTU['data %s.%s' % (_h, _lb)] = ('%s|%s' % (_h, _f), _t)

PTK_MAIN = {
    'nama': ('nama', T), 'nuptk': ('nuptk', T), 'jk': ('jk', T), 'tempat lahir': ('tempat_lahir', T),
    'tanggal lahir': ('tanggal_lahir', 'date'), 'nip': ('nip', T), 'status kepegawaian': ('status_kepegawaian', T),
    'jenis ptk': ('jenis_ptk', T), 'agama': ('agama', T), 'alamat jalan': ('alamat_jalan', T),
    'rt': ('rt', T), 'rw': ('rw', T), 'nama dusun': ('dusun', T), 'desa/kelurahan': ('kelurahan', T),
    'kecamatan': ('kecamatan', T), 'kode pos': ('kode_pos', T), 'telepon': ('telepon', T), 'hp': ('hp', T),
    'email': ('email', T), 'tugas tambahan': ('tugas_tambahan', T), 'sk cpns': ('sk_cpns', T),
    'tanggal cpns': ('tanggal_cpns', 'date'), 'sk pengangkatan': ('sk_pengangkatan', T),
    'tmt pengangkatan': ('tmt_pengangkatan', 'date'), 'lembaga pengangkatan': ('lembaga_pengangkatan', T),
    'pangkat golongan': ('pangkat_golongan', T), 'sumber gaji': ('sumber_gaji', T),
    'tmt pns': ('tmt_pns', 'date'), 'sudah lisensi kepala sekolah': ('sudah_lisensi_kepsek', T),
    'pernah diklat kepengawasan': ('pernah_diklat_kepengawasan', T), 'keahlian braille': ('keahlian_braille', T),
    'keahlian bahasa isyarat': ('keahlian_bahasa_isyarat', T), 'kewarganegaraan': ('kewarganegaraan', T),
    'lintang': ('lintang', 'geo'), 'bujur': ('bujur', 'geo'), 'nuks': ('nuks', T),
}
PTK_SENS = {
    'nik': ('nik', T), 'no kk': ('no_kk', T), 'npwp': ('npwp', T), 'nama wajib pajak': ('nama_wajib_pajak', T),
    'bank': ('bank', T), 'nomor rekening bank': ('nomor_rekening', T),
    'rekening atas nama': ('rekening_atas_nama', T), 'nama ibu kandung': ('nama_ibu_kandung', T),
    'status perkawinan': ('status_perkawinan', T), 'nama suami/istri': ('nama_pasangan', T),
    'nip suami/istri': ('nip_pasangan', T), 'pekerjaan suami/istri': ('pekerjaan_pasangan', T),
    'karpeg': ('karpeg', T), 'karis/karsu': ('karis_karsu', T),
}
PTK_PROFIL = {   # lembar PTK di berkas profil
    'nama': ('nama', T), 'nuptk': ('nuptk', T), 'jk': ('jk', T), 'tempat lahir': ('tempat_lahir', T),
    'tanggal lahir': ('tanggal_lahir', 'date'), 'nip': ('nip', T), 'status kepegawaian': ('status_kepegawaian', T),
    'jenis ptk': ('jenis_ptk', T),
    'keterangan.gelar depan': ('gelar_depan', T), 'keterangan.gelar belakang': ('gelar_belakang', T),
    'keterangan.jenjang': ('jenjang_pendidikan', T), 'keterangan.jurusan/prodi': ('jurusan_prodi', T),
    'keterangan.sertifikasi': ('sertifikasi', T), 'keterangan.tmt kerja': ('tmt_kerja', 'date'),
    'keterangan.tugas tambahan': ('tugas_tambahan', T), 'keterangan.mengajar': ('mengajar', T),
    'keterangan.jam tugas tambahan': ('jam_tugas_tambahan', 'num'), 'keterangan.jjm': ('jjm', 'num'),
    'keterangan.total jjm': ('total_jjm', 'num'), 'keterangan.siswa': ('jml_siswa', 'intlead'),
    'keterangan.kompetensi': ('kompetensi', T), 'jabatan ptk': ('jabatan_ptk', T),
    'nik': ('_nik', T),
}

SEKOLAH_KV = {
    'nama sekolah': 'nama', 'npsn': 'npsn', 'jenjang pendidikan': 'jenjang', 'status sekolah': 'status_sekolah',
    'alamat sekolah': 'alamat', 'kode pos': 'kode_pos', 'kelurahan': 'kelurahan', 'kecamatan': 'kecamatan',
    'kabupaten/kota': 'kabupaten_kota', 'provinsi': 'provinsi', 'sk pendirian sekolah': 'sk_pendirian',
    'tanggal sk pendirian': 'tgl_sk_pendirian', 'status kepemilikan': 'status_kepemilikan',
    'sk izin operasional': 'sk_izin_operasional', 'tgl sk izin operasional': 'tgl_sk_izin_operasional',
    'nomor telepon': 'telepon', 'email': 'email', 'website': 'website',
    'waktu penyelenggaraan': 'waktu_penyelenggaraan', 'sumber listrik': 'sumber_listrik',
    'total daya listrik (watt)': 'daya_listrik_watt', 'akses internet': 'akses_internet',
}

# ----------------------------------------------------------------------------
# 7. Basis data
# ----------------------------------------------------------------------------
def upsert(cur, table, rows, cols, conflict, update=None, touch=False):
    if not rows:
        return
    if update is None:
        update = [c for c in cols if c not in conflict]
    sql = 'insert into %s (%s) values (%s) on conflict (%s) do ' % (
        table, ','.join(cols), ','.join(['%s'] * len(cols)), ','.join(conflict))
    if update or touch:
        sets = ['%s=excluded.%s' % (c, c) for c in update]
        if touch:
            sets.append('diperbarui_pada=now()')
        sql += 'update set ' + ','.join(sets)
    else:
        sql += 'nothing'
    cur.executemany(sql, [tuple(r.get(c) for c in cols) for r in rows])


def hitung(cur, tabel, npsn):
    cur.execute('select count(*) from %s where npsn=%%s' % tabel, (npsn,))
    return cur.fetchone()[0]


def pastikan_semester(cur, sid):
    sid, ta, jenis = semester_dari_id(sid)
    cur.execute('insert into semester values (%s,%s,%s) on conflict do nothing', (sid, ta, jenis))
    return sid


# ----------------------------------------------------------------------------
# 8. Handler per jenis berkas
# ----------------------------------------------------------------------------
NISN_RE = re.compile(r'^\d{10}$')
NIK_RE = re.compile(r'^\d{16}$')


def kunci_pd(rec, nisn_ganda):
    nisn = rec.get('nisn')
    if nisn and NISN_RE.match(nisn) and nisn not in nisn_ganda:
        return sha('nisn', nisn)
    return sha('pd', nkey(rec.get('nama')), rec.get('tanggal_lahir') or '', rec.get('nipd') or '')


def parse_pd(book, jenis, ctx):
    lembar = next(iter(book))
    rows = book[lembar]
    baca_meta(rows, ctx)
    h = cari_header(rows, {'nama', 'nisn', 'nipd'})
    if h is None:
        raise ValueError('Header (Nama, NISN, NIPD) tidak ditemukan')
    peta = {}
    for d in (PD_MAIN, PD_SENS, PD_EXTRA, PD_ORTU):
        peta.update(d)
    hasil = petakan(rows, h, peta, ctx, lembar, wajib=('nama',))
    labels, _ = label_gabungan(rows, h)
    ada = set(labels)
    kolom_main = sorted({f for lb, (f, _) in PD_MAIN.items() if lb in ada})
    kolom_sens = sorted({f for lb, (f, _) in PD_SENS.items() if lb in ada})
    kolom_ortu = sorted({f.split('|')[1] for lb, (f, _) in PD_ORTU.items() if lb in ada})
    cnt = Counter(r.get('nisn') for _, r in hasil if r.get('nisn'))
    ganda = {k for k, v in cnt.items() if v > 1}
    if ganda:
        ctx.isu('peringatan', 'NISN kembar di dalam berkas (%d nilai); baris dikenali lewat nama+tgl lahir+NIPD'
                % len(ganda), lembar, None, 'NISN')
    recs = []
    for nomor, r in hasil:
        if not r.get('nama'):
            ctx.isu('galat', 'baris tanpa nama dilewati', lembar, nomor, 'Nama')
            continue
        nisn = r.get('nisn')
        if nisn and not NISN_RE.match(nisn):
            ctx.isu('peringatan', 'NISN bukan 10 digit', lembar, nomor, 'NISN')
        if r.get('nik') and not NIK_RE.match(r['nik']):
            ctx.isu('peringatan', 'NIK bukan 16 digit', lembar, nomor, 'NIK')
        if r.get('jk') and r['jk'] not in ('L', 'P'):
            ctx.isu('peringatan', 'JK bukan L/P, dikosongkan', lembar, nomor, 'JK')
            r['jk'] = None
        main = {f: r.get(f) for f in kolom_main}
        sens = {f: r.get(f) for f in kolom_sens}
        ortu = {}
        for hub in ('ayah', 'ibu', 'wali'):
            o = {f: r.get('%s|%s' % (hub, f)) for f in kolom_ortu}
            if o.get('penghasilan'):
                o['penghasilan'] = re.sub(r'\s*[\u2013\u2014]\s*', ' - ', o['penghasilan'])
            if any(v is not None for v in o.values()):
                ortu[hub] = o
        if jenis == 'pd_keluar':
            alasan = r.get('alasan_keluar')
            main['status_peserta_didik'] = {'lulus': 'lulus', 'mutasi': 'mutasi'}.get(nkey(alasan), 'lainnya')
            main['alasan_keluar'] = alasan
            main['tanggal_keluar'] = r.get('tanggal_keluar')
            if r.get('tanggal_keluar') is None:
                ctx.isu('info', 'peserta didik keluar tanpa tanggal keluar', lembar, nomor, 'Tanggal keluar')
        else:
            main['status_peserta_didik'] = 'aktif'
            main['alasan_keluar'] = None
            main['tanggal_keluar'] = None
        recs.append(dict(baris=nomor, main=main, sens=sens, ortu=ortu, rombel=r.get('_rombel'), kolom_ortu=kolom_ortu))
    for rc in recs:
        rc['kunci'] = kunci_pd(rc['main'], ganda)
    grup = defaultdict(list)
    for rc in recs:
        grup[rc['kunci']].append(rc)
    hasil_akhir, n_dup = [], 0
    for k, g in grup.items():
        if len(g) == 1:
            hasil_akhir.append(g[0])
            continue
        n_dup += 1
        # pakai baris dengan tanggal keluar terbaru, isi kolom kosongnya dari baris lain
        g.sort(key=lambda x: x['main'].get('tanggal_keluar') or dt.date.min, reverse=True)
        base = g[0]
        for other in g[1:]:
            for grp in ('main', 'sens'):
                for f, v in other[grp].items():
                    if base[grp].get(f) is None and v is not None:
                        base[grp][f] = v
            for hub, o in other['ortu'].items():
                base['ortu'].setdefault(hub, o)
        hasil_akhir.append(base)
    if n_dup:
        ctx.isu('peringatan', 'identitas kembar digabung: %d orang tercatat lebih dari sekali '
                '(dipakai baris dengan tanggal keluar terbaru, kolom kosong diisi dari baris lain)' % n_dup,
                lembar, None, None)
    return hasil_akhir, kolom_main, kolom_sens, kolom_ortu


def load_pd(cur, npsn, batch, recs, kolom_main, kolom_sens, kolom_ortu, semester):
    kolom = ['npsn', 'kunci_identitas', 'status_peserta_didik', 'tanggal_keluar', 'alasan_keluar', 'batch_id'] + \
            [c for c in kolom_main if c not in ('nama',)] + ['nama']
    kolom = list(dict.fromkeys(kolom))
    rows = []
    for rc in recs:
        d = dict(rc['main'])
        d.update(npsn=npsn, kunci_identitas=rc['kunci'], batch_id=batch)
        rows.append(d)
    before = hitung(cur, 'peserta_didik', npsn)
    upsert(cur, 'peserta_didik', rows, kolom, ['npsn', 'kunci_identitas'], touch=True)
    cur.execute('select kunci_identitas, id from peserta_didik where npsn=%s and kunci_identitas = any(%s)',
                (npsn, [r['kunci'] for r in recs]))
    ids = dict(cur.fetchall())
    srows = []
    for rc in recs:
        if kolom_sens:
            s = dict(rc['sens'])
            s['peserta_didik_id'] = ids[rc['kunci']]
            srows.append(s)
    upsert(cur, 'peserta_didik_sensitif', srows, ['peserta_didik_id'] + kolom_sens, ['peserta_didik_id'])
    orows = []
    for rc in recs:
        for hub, o in rc['ortu'].items():
            d = dict(o)
            d.update(peserta_didik_id=ids[rc['kunci']], hubungan=hub)
            orows.append(d)
    upsert(cur, 'orang_tua_wali', orows, ['peserta_didik_id', 'hubungan'] + kolom_ortu,
           ['peserta_didik_id', 'hubungan'])
    baru = hitung(cur, 'peserta_didik', npsn) - before
    return ids, baru


def set_keanggotaan(cur, npsn, semester, anggota, batch, ganti_roster=False):
    """anggota: list (rombel_id, pd_id, no_urut). Kelas Utama: satu rombel per siswa per semester."""
    cur.execute('create temp table if not exists _m (rombel_id uuid, pd_id uuid, no_urut int) on commit drop')
    cur.execute('truncate _m')
    with cur.copy('copy _m (rombel_id, pd_id, no_urut) from stdin') as cp:
        for a in anggota:
            cp.write_row(a)
    # siswa pindah rombel utama -> hapus keanggotaan utama lamanya
    cur.execute("""delete from keanggotaan_rombel k using rombel ro
                   where k.rombel_id = ro.id and ro.npsn=%s and ro.semester_id=%s and ro.jenis_rombel='Kelas Utama'
                     and k.peserta_didik_id in (select pd_id from _m
                          where rombel_id in (select id from rombel where jenis_rombel='Kelas Utama'))
                     and not exists (select 1 from _m where _m.rombel_id=k.rombel_id and _m.pd_id=k.peserta_didik_id)""",
                (npsn, semester))
    if ganti_roster:  # snapshot roster per rombel: siswa yang tidak ada di lembar dikeluarkan
        cur.execute("""delete from keanggotaan_rombel k
                       where k.rombel_id in (select distinct rombel_id from _m)
                         and not exists (select 1 from _m where _m.rombel_id=k.rombel_id and _m.pd_id=k.peserta_didik_id)""")
    cur.execute("""insert into keanggotaan_rombel (rombel_id, peserta_didik_id, no_urut)
                   select rombel_id, pd_id, no_urut from _m
                   on conflict (rombel_id, peserta_didik_id) do update set no_urut=excluded.no_urut""")


def pastikan_rombel(cur, npsn, semester, jenis, nama, batch, extra=None):
    d = dict(npsn=npsn, semester_id=semester, jenis_rombel=jenis, nama=nama, tingkat=tingkat_dari_nama(nama), batch_id=batch)
    if extra:
        d.update(extra)
    cols = list(d)
    upd = [c for c in cols if c not in ('npsn', 'semester_id', 'jenis_rombel', 'nama', 'batch_id') and (extra and c in extra)]
    sql = 'insert into rombel (%s) values (%s) on conflict (npsn,semester_id,jenis_rombel,nama) do update set batch_id=excluded.batch_id, diperbarui_pada=now()%s returning id' % (
        ','.join(cols), ','.join(['%s'] * len(cols)), ''.join(',%s=excluded.%s' % (c, c) for c in upd))
    cur.execute(sql, tuple(d[c] for c in cols))
    return cur.fetchone()[0]


def handle_pd(cur, ctx, book, jenis, npsn, batch, semester):
    recs, km, ks, ko = parse_pd(book, jenis, ctx)
    ids, baru = load_pd(cur, npsn, batch, recs, km, ks, ko, semester)
    ring = dict(baris_dibaca=len(recs), baru=baru, diperbarui=len(recs) - baru)
    if jenis == 'pd_aktif':
        rid, anggota = {}, []
        for rc in recs:
            nm = rc['rombel']
            if not nm:
                ctx.isu('peringatan', 'peserta didik aktif tanpa Rombel Saat Ini', None, rc['baris'], 'Rombel Saat Ini')
                continue
            if nm not in rid:
                rid[nm] = pastikan_rombel(cur, npsn, semester, 'Kelas Utama', nm, batch)
            anggota.append((rid[nm], ids[rc['kunci']], None))
        set_keanggotaan(cur, npsn, semester, anggota, batch)
        ring.update(rombel=len(rid), keanggotaan=len(anggota), semester=semester)
        ctx.isu('info', 'Rombel Saat Ini dipasang ke semester %s (diturunkan dari tanggal unduh)' % semester)
    else:
        st = Counter(rc['main']['status_peserta_didik'] for rc in recs)
        ring.update(status=dict(st))
    return ring


def handle_ptk_file(cur, ctx, book, jenis, npsn, batch, semester):
    lembar = next(iter(book))
    rows = book[lembar]
    baca_meta(rows, ctx)
    h = cari_header(rows, {'nama', 'nuptk'})
    if h is None:
        raise ValueError('Header (Nama, NUPTK) tidak ditemukan')
    peta = {}
    peta.update(PTK_MAIN)
    peta.update(PTK_SENS)
    hasil = petakan(rows, h, peta, ctx, lembar, wajib=('nama',))
    default_jenis = 'Guru' if jenis == 'guru' else 'Tenaga Kependidikan'
    return simpan_ptk(cur, ctx, npsn, batch, lembar, hasil, PTK_MAIN, PTK_SENS, default_jenis)


def kunci_ptk(r, nik_ganda):
    nik = r.get('nik')
    if nik and NIK_RE.match(nik) and nik not in nik_ganda:
        return sha('nik', nik)
    if r.get('nuptk'):
        return sha('nuptk', r['nuptk'])
    return sha('ptk', nkey(r.get('nama')), r.get('tanggal_lahir') or '')


def simpan_ptk(cur, ctx, npsn, batch, lembar, hasil, main_map, sens_map, default_jenis):
    main_f = sorted({f for f, _ in main_map.values() if not f.startswith('_')})
    sens_f = sorted({f for f, _ in sens_map.values()})
    # medan yang benar-benar ada pada hasil
    ada = set(hasil[0][1]) if hasil else set()
    main_f = [f for f in main_f if f in ada]
    sens_f = [f for f in sens_f if f in ada]
    cnt = Counter(r.get('nik') for _, r in hasil if r.get('nik'))
    ganda = {k for k, v in cnt.items() if v > 1}
    rows, srows = [], []
    for nomor, r in hasil:
        if not r.get('nama'):
            ctx.isu('galat', 'baris tanpa nama dilewati', lembar, nomor, 'Nama')
            continue
        if r.get('nik') and not NIK_RE.match(r['nik']):
            ctx.isu('peringatan', 'NIK bukan 16 digit', lembar, nomor, 'NIK')
        if r.get('nuptk') and not NIK_RE.match(r['nuptk']):
            ctx.isu('peringatan', 'NUPTK bukan 16 digit', lembar, nomor, 'NUPTK')
        if r.get('jk') and r['jk'] not in ('L', 'P'):
            r['jk'] = None
        if not r.get('jenis_ptk'):
            r['jenis_ptk'] = default_jenis
        d = {f: r.get(f) for f in main_f}
        d.update(npsn=npsn, kunci_identitas=kunci_ptk(r, ganda), batch_id=batch, jenis_ptk=r['jenis_ptk'])
        rows.append(d)
        srows.append(({f: r.get(f) for f in sens_f}, d['kunci_identitas']))
    kolom = list(dict.fromkeys(['npsn', 'kunci_identitas', 'batch_id', 'jenis_ptk', 'nama'] + main_f))
    before = hitung(cur, 'ptk', npsn)
    upsert(cur, 'ptk', rows, kolom, ['npsn', 'kunci_identitas'], touch=True)
    cur.execute('select kunci_identitas, id from ptk where npsn=%s and kunci_identitas = any(%s)',
                (npsn, [d['kunci_identitas'] for d in rows]))
    ids = dict(cur.fetchall())
    ss = []
    for s, k in srows:
        s = dict(s)
        s['ptk_id'] = ids[k]
        ss.append(s)
    if sens_f:
        upsert(cur, 'ptk_sensitif', ss, ['ptk_id'] + sens_f, ['ptk_id'])
    baru = hitung(cur, 'ptk', npsn) - before
    return dict(baris_dibaca=len(rows), baru=baru, diperbarui=len(rows) - baru)


def handle_absensi(cur, ctx, book, jenis, npsn, batch, semester_arg):
    anggota_rows, rombel_ids, stub, per_rombel = [], {}, {}, {}
    semesters = set()
    for lembar, rows in book.items():
        if len(rows) < 10:
            continue
        judul = ' '.join(str(c) for c in rows[2] if c) if len(rows) > 2 else ''
        info = ' '.join(str(c) for c in rows[3] if c) if len(rows) > 3 else ''
        mta = re.search(r'TAHUN PELAJARAN\s+(\d{4})/(\d{4})', judul, re.I)
        m = re.search(r'Jenis Rombel:\s*(.*?)\s*-\s*Nama Rombel:\s*(.*?)\s*-\s*Semester\s+(\w+)\s*-\s*Wali Kelas:\s*(.*)$', info)
        if not (mta and m):
            ctx.isu('peringatan', 'judul lembar tidak sesuai pola daftar hadir, dilewati', lembar)
            continue
        jenis_r, nama_r, sem_txt, wali = [x.strip() for x in m.groups()]
        sid = '%s%d' % (mta.group(1), 1 if sem_txt.lower() == 'ganjil' else 2)
        semesters.add(sid)
        rid = (sid, jenis_r, nama_r)
        per_rombel[rid] = dict(wali=wali or None, anggota=[])
        h = None
        for i, r in enumerate(rows[:15]):
            if norm(r[0] if r else '') == 'urut' or any(norm(c) == 'nama siswa' for c in r):
                h = i
        for i, r in enumerate(rows):
            if len(r) > 3 and r[0] and str(r[0]).strip().isdigit() and clean(r[2]) and (h is None or i > h):
                nisn_nipd = str(r[1] or '').split('/')
                nisn = clean(nisn_nipd[0])
                nipd = clean(nisn_nipd[1]) if len(nisn_nipd) > 1 else None
                jk = clean(r[3])
                per_rombel[rid]['anggota'].append(dict(baris=i + 1, urut=int(str(r[0]).strip()),
                    nama=clean(r[2]), jk=jk if jk in ('L', 'P') else None, nisn=nisn, nipd=nipd))
    if not per_rombel:
        raise ValueError('Tidak ada lembar daftar hadir yang dapat dibaca')
    sems = sorted(semesters)
    for s in sems:
        pastikan_semester(cur, s)
    # siswa yang belum ada -> stub minimal (tidak menimpa data lengkap dari daftar_pd)
    stub_rows, key_of = [], {}
    for rid, dta in per_rombel.items():
        for a in dta['anggota']:
            if not a['nisn'] or not NISN_RE.match(a['nisn']):
                ctx.isu('peringatan', 'NISN kosong atau tidak 10 digit pada daftar hadir', str(rid[2]), a['baris'], 'NISN / NIS')
                continue
            k = sha('nisn', a['nisn'])
            key_of[(rid, a['baris'])] = k
            stub_rows.append(dict(npsn=npsn, kunci_identitas=k, nama=a['nama'], jk=a['jk'], nisn=a['nisn'],
                                  nipd=a['nipd'], status_peserta_didik='aktif', batch_id=batch))
    before = hitung(cur, 'peserta_didik', npsn)
    uniq = list({r['kunci_identitas']: r for r in stub_rows}.values())
    upsert(cur, 'peserta_didik', uniq, ['npsn', 'kunci_identitas', 'nama', 'jk', 'nisn', 'nipd', 'status_peserta_didik', 'batch_id'],
           ['npsn', 'kunci_identitas'], update=[])
    stub_baru = hitung(cur, 'peserta_didik', npsn) - before
    cur.execute('select kunci_identitas, id from peserta_didik where npsn=%s and kunci_identitas = any(%s)',
                (npsn, list(key_of.values())))
    pid = dict(cur.fetchall())
    anggota_all, tot_semua = [], 0
    by_sem = defaultdict(list)
    for rid, dta in per_rombel.items():
        sid, jenis_r, nama_r = rid
        rombel_id = pastikan_rombel(cur, npsn, sid, jenis_r, nama_r, batch, extra=dict(wali_kelas_nama=dta['wali']))
        for a in dta['anggota']:
            k = key_of.get((rid, a['baris']))
            if k:
                by_sem[sid].append((rombel_id, pid[k], a['urut']))
                tot_semua += 1
    for sid, ang in by_sem.items():
        set_keanggotaan(cur, npsn, sid, ang, batch, ganti_roster=True)
    return dict(lembar_rombel=len(per_rombel), keanggotaan=tot_semua, siswa_stub_baru=stub_baru,
                semester=sems, jenis_rombel=dict(Counter(r[1] for r in per_rombel)))


def kv_profil(rows):
    kv, lintang, bujur = {}, None, None
    for r in rows:
        cells = [clean(c) for c in r]
        if not any(c is not None for c in cells):
            continue
        # Bujur ditulis pada baris terpisah: [nilai, 'Bujur']
        for i, c in enumerate(cells):
            if isinstance(c, str) and norm(c) in ('bujur', 'lintang'):
                # sel digabung: nilai bisa berjarak beberapa sel kosong di kiri label
                for j in range(i - 1, -1, -1):
                    if cells[j] is not None and str(cells[j]).strip() != ':' and to_num(cells[j])[0] is not None:
                        if norm(c) == 'bujur':
                            bujur = cells[j]
                        else:
                            lintang = cells[j]
                        break
        if len(cells) > 3 and cells[1] and isinstance(cells[1], str):
            label = norm(cells[1])
            if label == 'rt / rw':
                kv['rt'], kv['rw'] = cells[3], (cells[5] if len(cells) > 5 else None)
                continue
            vals = [c for c in cells[3:] if c is not None and str(c).strip() not in (':', '/')]
            if label == 'posisi geografis':
                continue
            if len(vals) == 1 or (len(vals) == 2 and label not in ('posisi geografis',) and str(vals[1]) in ('✓',)):
                kv[label] = vals[0]
            elif len(vals) == 0 and cells[2] is not None and str(cells[2]).strip() not in (':',) and len(cells) > 2:
                kv[label] = cells[2]
    return kv, lintang, bujur


def handle_profil(cur, ctx, book, jenis, npsn, batch, semester):
    ring = {}
    # lembar rombel
    if 'Rombongan Belajar' in book:
        rows = book['Rombongan Belajar']
        h = cari_header(rows, {'nama rombel'})
        pt = {'nama rombel': ('nama', T), 'tingkat kelas': ('tingkat', 'int'), 'jumlah siswa.l': ('l', 'int'),
              'jumlah siswa.p': ('p', 'int'), 'jumlah siswa.total': ('total', 'int'), 'wali kelas': ('wali', T), 'kurikulum': ('kurikulum', T), 'ruangan': ('ruangan', T)}
        n = 0
        for nomor, r in petakan(rows, h, pt, ctx, 'Rombongan Belajar', wajib=('nama rombel',)):
            pastikan_rombel(cur, npsn, semester, 'Kelas Utama', r['nama'], batch, extra=dict(
                tingkat=r.get('tingkat') or tingkat_dari_nama(r['nama']), kurikulum=r.get('kurikulum'),
                ruangan=r.get('ruangan'), wali_kelas_nama=r.get('wali'),
                jumlah_l_profil=r.get('l'), jumlah_p_profil=r.get('p')))
            n += 1
        ring['rombel'] = n
        ctx.isu('info', 'lembar Rombongan Belajar dipasang ke semester %s, jenis Kelas Utama (asumsi)' % semester)
    # lembar PTK
    if 'PTK' in book:
        rows = book['PTK']
        h = cari_header(rows, {'nama', 'nuptk'})
        peta = dict(PTK_PROFIL)
        hasil = petakan(rows, h, peta, ctx, 'PTK', wajib=('nama',))
        for _, r in hasil:
            r['nik'] = r.pop('_nik', None)
        main_map = {k: v for k, v in PTK_PROFIL.items() if not v[0].startswith('_')}
        ring['ptk'] = simpan_ptk(cur, ctx, npsn, batch, 'PTK', hasil, main_map, {'nik': ('nik', T)}, 'Guru')
    # snapshot: prasarana, sarana, bantuan
    snap = [
        ('Prasarana', 'prasarana', {'nama prasarana'}, {'nama prasarana': ('nama_prasarana', T), 'keterangan': ('keterangan', T),
            'panjang': ('panjang', 'num'), 'lebar': ('lebar', 'num'), 'status kepemilikan': ('status_kepemilikan', T)}, 'nama prasarana'),
        ('Sarana', 'sarana', {'jenis sarana'}, {'jenis sarana': ('jenis_sarana', T), 'letak': ('letak', T),
            'kepemilikan': ('kepemilikan', T), 'spesifikasi': ('spesifikasi', T), 'jumlah': ('jumlah', 'num'),
            'laik': ('laik', 'num'), 'tidak laik': ('tidak_laik', 'num')}, 'jenis sarana'),
        ('Blockgrant', 'bantuan_sekolah', {'jenis bantuan'}, {'tahun': ('tahun', 'int'), 'jenis bantuan': ('jenis_bantuan', T),
            'sumber bantuan': ('sumber_bantuan', T), 'besar bantuan': ('besar_bantuan', 'num'),
            'dana pendamping': ('dana_pendamping', 'num'), 'peruntukan dana': ('peruntukan_dana', T)}, 'jenis bantuan'),
    ]
    for lembar, tabel, jangkar, peta, kunci in snap:
        if lembar in book:
            ring[tabel] = load_snapshot(cur, ctx, book[lembar], lembar, tabel, jangkar, peta, kunci, npsn, batch)
    # profil sekolah dilakukan lebih awal (lihat import_file); ringkasan ditambah di sana
    return ring


def load_snapshot(cur, ctx, rows, lembar, tabel, jangkar, peta, kunci, npsn, batch):
    h = cari_header(rows, jangkar)
    if h is None:
        ctx.isu('galat', 'header tidak ditemukan', lembar)
        return 0
    hasil = petakan(rows, h, peta, ctx, lembar, wajib=(kunci,))
    cols = list(dict.fromkeys(f for f, _ in peta.values()))
    cur.execute('delete from %s where npsn=%%s' % tabel, (npsn,))
    data = []
    for _, r in hasil:
        d = {c: r.get(c) for c in cols}
        d.update(npsn=npsn, batch_id=batch)
        data.append(d)
    cur.executemany('insert into %s (%s) values (%s)' % (tabel, ','.join(cols + ['npsn', 'batch_id']),
                    ','.join(['%s'] * (len(cols) + 2))), [tuple(d[c] for c in cols + ['npsn', 'batch_id']) for d in data])
    return len(data)


def handle_sekolah_smk(cur, ctx, book, jenis, npsn, batch, semester):
    cur.execute("select to_regclass('public.dudi') is not null")
    if not cur.fetchone()[0]:
        raise ValueError('Modul opsional belum dipasang. Jalankan 02_modul_opsional.sql untuk berkas sekolah_smk.')
    ring = {}
    # Kompetensi keahlian
    rows = book['Kompetensi Keahlian']
    baca_meta(rows, ctx)
    h = cari_header(rows, {'kompetensi keahlian'})
    pt = {'bidang keahlian': ('bidang_keahlian', T), 'program keahlian': ('program_keahlian', T),
          'kompetensi keahlian': ('kompetensi_keahlian', T), 'sk izin': ('sk_izin', T),
          'tanggal izin': ('tanggal_izin', 'date'), 'jumlah pendaftar ppdb': ('jumlah_pendaftar_ppdb', 'int')}
    hs = petakan(rows, h, pt, ctx, 'Kompetensi Keahlian', wajib=('program keahlian',))
    ks = []
    for _, r in hs:
        r['kompetensi_keahlian'] = r.get('kompetensi_keahlian') or ''
        r['sk_izin'] = r.get('sk_izin') or ''
        r.update(npsn=npsn, batch_id=batch)
        ks.append(r)
    upsert(cur, 'kompetensi_keahlian', ks, ['npsn', 'bidang_keahlian', 'program_keahlian', 'kompetensi_keahlian', 'sk_izin',
           'tanggal_izin', 'jumlah_pendaftar_ppdb', 'batch_id'], ['npsn', 'program_keahlian', 'kompetensi_keahlian', 'sk_izin'])
    ring['kompetensi_keahlian'] = len(ks)
    # DUDI
    rows = book['Relasi DUDI']
    h = cari_header(rows, {'nama', 'bidang usaha'})
    pt = {'nama': ('nama', T), 'bidang usaha': ('bidang_usaha', T), 'alamat': ('alamat', T), 'rt': ('rt', T), 'rw': ('rw', T),
          'nama dusun': ('dusun', T), 'desa kelurahan': ('desa_kelurahan', T), 'kecamatan/ kabupaten': ('kecamatan_kabupaten', T),
          'kode pos': ('kode_pos', T), 'lintang': ('lintang', 'geo'), 'bujur': ('bujur', 'geo'), 'no telpon': ('telepon', T),
          'fax': ('fax', T), 'email': ('email', T), 'website': ('website', T), 'npwp': ('npwp', T)}
    hd = petakan(rows, h, pt, ctx, 'Relasi DUDI', wajib=('nama',))
    dd = {}
    for nomor, r in hd:
        r['kunci'] = sha(nkey(r['nama']), nkey(r.get('alamat')))
        if r['kunci'] in dd:
            ctx.isu('peringatan', 'DUDI dengan nama+alamat sama muncul lebih dari sekali', 'Relasi DUDI', nomor, 'Nama')
        r.update(npsn=npsn, batch_id=batch)
        dd[r['kunci']] = r
    cols = ['npsn', 'kunci', 'batch_id'] + [f for f, _ in pt.values()]
    upsert(cur, 'dudi', list(dd.values()), list(dict.fromkeys(cols)), ['npsn', 'kunci'])
    ring['dudi'] = len(dd)
    cur.execute('select lower(regexp_replace(trim(nama),%s,%s,%s)), id from dudi where npsn=%s', (r'\s+', ' ', 'g', npsn))
    dudi_id = {}
    for k, v in cur.fetchall():
        dudi_id.setdefault(k, v)
    # MoU
    rows = book['MoU Kerjasama']
    h = cari_header(rows, {'jenis kerjasama'})
    pt = {'jenis kerjasama': ('jenis_kerjasama', T), 'dunia usaha/ industri': ('nama_dudi_sumber', T),
          'nomor mou': ('nomor_mou', T), 'judul mou': ('judul_mou', T), 'tgl mulai': ('tgl_mulai', 'date'),
          'tgl selesai': ('tgl_selesai', 'date'), 'npwp dudi': ('npwp_dudi', T), 'nama bidang usaha': ('nama_bidang_usaha', T),
          'telp kantor': ('telp_kantor', T), 'fax': ('fax', T), 'contact person': ('contact_person', T),
          'telpon contact person': ('telp_contact_person', T), 'jabatan contact person': ('jabatan_contact_person', T)}
    hm = petakan(rows, h, pt, ctx, 'MoU Kerjasama', wajib=('jenis kerjasama',))
    mm, tanpa_dudi = {}, 0
    for nomor, r in hm:
        if not r.get('nama_dudi_sumber'):
            ctx.isu('peringatan', 'MoU tanpa nama DUDI dilewati', 'MoU Kerjasama', nomor)
            continue
        r['kunci'] = sha(r.get('nomor_mou') or '', nkey(r.get('judul_mou')), nkey(r['nama_dudi_sumber']), r.get('tgl_mulai') or '')
        r['dudi_id'] = dudi_id.get(nkey(r['nama_dudi_sumber']))
        if r['dudi_id'] is None:
            tanpa_dudi += 1
        r.update(npsn=npsn, batch_id=batch)
        mm[r['kunci']] = r
    if tanpa_dudi:
        ctx.isu('info', 'MoU yang namanya tidak cocok dengan tabel DUDI (dudi_id dikosongkan): %d' % tanpa_dudi, 'MoU Kerjasama')
    cols = list(dict.fromkeys(['npsn', 'kunci', 'batch_id', 'dudi_id'] + [f for f, _ in pt.values()]))
    upsert(cur, 'mou_kerjasama', list(mm.values()), cols, ['npsn', 'kunci'])
    ring['mou_kerjasama'] = len(mm)
    ring['mou_dilewati_duplikat'] = len(hm) - len(mm) - 0
    # Snapshot (contoh unduhan kosong: belum teruji dengan isi)
    ring['unit_produksi'] = load_snapshot(cur, ctx, book['Unit Produksi'], 'Unit Produksi', 'unit_produksi', {'nama unit produksi'},
        {'kompetensi keahlian': ('kompetensi_keahlian', T), 'kelompok produksi': ('kelompok_produksi', T),
         'nama unit produksi': ('nama_unit_produksi', T)}, 'nama unit produksi', npsn, batch) if 'Unit Produksi' in book else 0
    ring['praktik_industri'] = load_snapshot(cur, ctx, book['Praktek Industri'], 'Praktek Industri', 'praktik_industri', {'nama dudi'},
        {'nama dudi': ('nama_dudi', T), 'no mou kerjasama': ('no_mou_kerjasama', T), 'tanggal mulai': ('tanggal_mulai', 'date'),
         'tanggal selesai': ('tanggal_selesai', 'date'), 'jenis aktivitas': ('jenis_aktivitas', T), 'judul aktivitas': ('judul_aktivitas', T),
         'sk tugas': ('sk_tugas', T), 'tanggal tugas': ('tanggal_tugas', 'date'), 'nama pembimbing i': ('nama_pembimbing_1', T),
         'nama pembimbing ii': ('nama_pembimbing_2', T), 'nama siswa': ('nama_siswa', T),
         'tingkat pendidikan': ('tingkat_pendidikan', T), 'rombel siswa': ('rombel_siswa', T)}, 'nama dudi', npsn, batch) if 'Praktek Industri' in book else 0
    return ring


HANDLERS = {'pd_aktif': handle_pd, 'pd_keluar': handle_pd, 'guru': handle_ptk_file, 'tendik': handle_ptk_file,
            'absensi': handle_absensi, 'profil': handle_profil, 'sekolah_smk': handle_sekolah_smk}


# ----------------------------------------------------------------------------
# 9. Orkestrasi
# ----------------------------------------------------------------------------
def simpan_sekolah(cur, book, ctx, batch_placeholder=None):
    nama_lembar = next(n for n in book if n.startswith('Profil '))
    rows = book[nama_lembar]
    kv, lintang, bujur = kv_profil(rows)
    sk = {}
    atribut = {}
    for label, val in kv.items():
        if label in SEKOLAH_KV:
            sk[SEKOLAH_KV[label]] = val
        elif label in ('rt', 'rw'):
            sk[label] = val
        else:
            atribut[label] = val if not isinstance(val, (dt.date,)) else val.isoformat()
    if not sk.get('npsn'):
        raise ValueError('NPSN tidak ditemukan di berkas profil')
    for f in ('tgl_sk_pendirian', 'tgl_sk_izin_operasional'):
        if f in sk:
            sk[f], err = to_date(sk[f])
    if 'daya_listrik_watt' in sk:
        sk['daya_listrik_watt'], _ = to_num(sk['daya_listrik_watt'])
    sk['lintang'], _ = to_num(lintang)
    sk['bujur'], _ = to_num(bujur)
    sk['npsn'] = str(sk['npsn'])
    sk['atribut'] = json.dumps(atribut, default=str, ensure_ascii=False)
    cols = [c for c in sk]
    cur.execute('insert into sekolah (%s) values (%s) on conflict (npsn) do update set %s, diperbarui_pada=now()' % (
        ','.join(cols), ','.join(['%s'] * len(cols)), ','.join('%s=excluded.%s' % (c, c) for c in cols if c != 'npsn')),
        tuple(sk[c] for c in cols))
    return sk['npsn'], len(atribut)


def resolve_wali(cur, npsn):
    cur.execute("""update rombel r set wali_kelas_ptk_id = p.id from ptk p
                   where r.npsn=%s and p.npsn=r.npsn and r.wali_kelas_ptk_id is null and r.wali_kelas_nama is not null
                     and lower(regexp_replace(trim(p.nama),'\\s+',' ','g')) = lower(regexp_replace(trim(r.wali_kelas_nama),'\\s+',' ','g'))""",
                (npsn,))
    cur.execute("select count(*) from rombel where npsn=%s and wali_kelas_nama is not null and wali_kelas_ptk_id is null", (npsn,))
    return cur.fetchone()[0]


def sha_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def import_file(conn, path, npsn=None, semester=None, force=False):
    nama = os.path.basename(path)
    book = read_book(path)
    jenis = detect(book)
    if jenis is None:
        raise BerkasTidakDikenali('Jenis berkas tidak dikenali dari isinya: %s' % nama)
    ctx = Ctx(jenis)
    baca_meta(next(iter(book.values())), ctx)
    digest = sha_file(path)
    with conn.cursor() as cur:
        if jenis == 'profil':
            with conn.transaction():
                npsn, _ = simpan_sekolah(cur, book, ctx)
        if npsn is None:
            cur.execute('select npsn from sekolah')
            ada = [r[0] for r in cur.fetchall()]
            if len(ada) != 1:
                raise ValueError('NPSN belum diketahui. Unggah berkas profil lebih dulu, atau berikan --npsn.')
            npsn = ada[0]
        if not force:
            cur.execute("select id, dibuat_pada from import_batch where npsn=%s and sha256=%s and status='selesai'", (npsn, digest))
            dup = cur.fetchone()
            if dup:
                return dict(berkas=nama, jenis=jenis, status='dilewati',
                            alasan='berkas identik sudah pernah diimpor pada %s' % dup[1].isoformat(timespec='seconds'))
        if semester is None:
            if jenis != 'absensi':
                tgl = (ctx.diunduh or dt.datetime.now()).date()
                semester = semester_dari_tanggal(tgl)[0]
        with conn.transaction():
            if semester:
                pastikan_semester(cur, semester)
            cur.execute("""insert into import_batch (npsn, jenis_berkas, nama_file, sha256, diunduh_pada, pengunduh, semester_id, status)
                           values (%s,%s,%s,%s,%s,%s,%s,'berjalan')
                           on conflict (npsn, sha256) do update set status='berjalan', dibuat_pada=now()
                           returning id""",
                        (npsn, jenis, nama, digest, ctx.diunduh.replace(tzinfo=dt.timezone(dt.timedelta(hours=7))) if ctx.diunduh else None,
                         ctx.pengunduh, semester))
            batch = cur.fetchone()[0]
        try:
            with conn.transaction():
                ring = HANDLERS[jenis](cur, ctx, book, jenis, npsn, batch, semester)
                if jenis in ('guru', 'tendik', 'profil', 'absensi'):
                    belum = resolve_wali(cur, npsn)
                    if belum:
                        ctx.isu('info', 'rombel yang wali kelasnya belum cocok dengan tabel PTK: %d' % belum)
            status = 'selesai'
        except Exception as e:
            ctx.isu('galat', 'impor dibatalkan: %s' % e)
            ring, status = {}, 'gagal'
        with conn.transaction():
            isu = ctx.daftar()
            cur.execute('delete from import_isu where batch_id=%s', (batch,))
            for i in isu:
                cur.execute('insert into import_isu (batch_id,tingkat,lembar,baris,kolom,pesan) values (%s,%s,%s,%s,%s,%s)',
                            (batch, i['tingkat'], i['lembar'], i['baris'], i['kolom'], i['pesan']))
            ring['isu'] = dict(Counter(i['tingkat'] for i in isu))
            cur.execute('update import_batch set status=%s, ringkasan=%s where id=%s', (status, json.dumps(ring, default=str), batch))
    return dict(berkas=nama, jenis=jenis, status=status, ringkasan=ring, isu=isu)


def dry_run(path):
    book = read_book(path)
    jenis = detect(book)
    ctx = Ctx(jenis)
    print('%s -> %s | lembar: %d' % (os.path.basename(path)[:60], jenis, len(book)))
    return jenis


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('berkas', nargs='+')
    ap.add_argument('--dsn', help='postgres://...  (kosong = hanya deteksi jenis berkas)')
    ap.add_argument('--npsn')
    ap.add_argument('--semester', help='mis. 20261 (default: diturunkan dari tanggal unduh)')
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    files = [f for p in a.berkas for f in sorted(glob.glob(p))]
    if not a.dsn:
        for f in files:
            dry_run(f)
        sys.exit(0)
    import psycopg
    with psycopg.connect(a.dsn, autocommit=True) as conn:
        for f in files:
            res = import_file(conn, f, a.npsn, a.semester, a.force)
            print(json.dumps(res, default=str, ensure_ascii=False, indent=1)[:1500])
