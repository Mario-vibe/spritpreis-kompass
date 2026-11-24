"""Lädt Tageswerte für Rohöl, Großhandelspreise und Wechselkurs von FRED (ohne Schlüssel).

- DCOILBRENTEU  Brent, US-Dollar je Barrel
- DDFUELNYH     Diesel (ULSD) Großhandel New York Harbor, US-Dollar je Gallone
- DGASNYH       Benzin Großhandel New York Harbor, US-Dollar je Gallone
- DEXUSEU       US-Dollar je Euro

Die Rotterdamer Notierungen (ICE Gasoil, Eurobob) sind nicht frei verfügbar. Die
New-Yorker Großhandelspreise laufen ihnen sehr ähnlich und dienen als Ersatz.
"""
import csv
import io

from common import DATA, http_get

SERIES = {
    "brent_usd_bbl": "DCOILBRENTEU",
    "diesel_usd_gal": "DDFUELNYH",
    "gasoline_usd_gal": "DGASNYH",
    "usd_per_eur": "DEXUSEU",
}
KEEP_DAYS = 400


def load(series_id):
    raw = http_get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}", timeout=30).decode()
    out = {}
    for row in csv.reader(io.StringIO(raw)):
        if len(row) < 2 or not row[0][:1].isdigit():
            continue  # Kopfzeile
        try:
            out[row[0]] = float(row[1])
        except ValueError:
            pass  # "." = kein Handelstag
    return out


def read_existing(path):
    """Bisher gespeicherte Werte, damit ein Ausfall einer Quelle nichts löscht."""
    old = {name: {} for name in SERIES}
    if path.exists():
        with open(path, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                for name in SERIES:
                    if row.get(name):
                        old[name][row["date"]] = float(row[name])
    return old


def main():
    path = DATA / "market.csv"
    cols = read_existing(path)
    failed = []
    for name, sid in SERIES.items():
        try:
            cols[name].update(load(sid))
        except Exception as e:  # eine ausgefallene Quelle darf den Ablauf nicht stoppen
            failed.append(sid)
            print(f"::warning::Marktdaten {sid} nicht geladen: {e}")
    dates = sorted(set().union(*[c.keys() for c in cols.values()]))[-KEEP_DAYS:]
    if not dates:
        print("::warning::Keine Marktdaten verfügbar, das Diagramm bleibt vorerst leer.")
        return
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", *SERIES])
        for d in dates:
            w.writerow([d, *[cols[n].get(d, "") for n in SERIES]])
    print(f"{len(dates)} Tage Marktdaten gespeichert, letzter Tag {dates[-1]}."
          + (f" Nicht erreichbar: {', '.join(failed)}." if failed else ""))


if __name__ == "__main__":
    main()
