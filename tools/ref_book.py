"""Ekspor isi mentah tiap berkas (hasil read_book Python) ke JSON, acuan uji pembaca TypeScript."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import dapodik_import as d

SRC = sys.argv[1]
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
for f in sorted(os.listdir(SRC)):
    book = d.read_book(os.path.join(SRC, f))
    obj = [[name, [[(None if v == '' else v) for v in r] for r in rows]] for name, rows in book.items()]
    json.dump(obj, open(os.path.join(OUT, 'book_' + f + '.json'), 'w'), ensure_ascii=False)
    print(f, len(book), 'lembar')
