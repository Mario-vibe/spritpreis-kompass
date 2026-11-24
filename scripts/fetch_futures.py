"""Holt tagesaktuelle Terminkurse von Yahoo Finance. Läuft auf dem Raspberry Pi,
weil Yahoo die Server von GitHub sperrt.

- BZ=F      Brent, US-Dollar je Barrel
- HO=F      Heizöl/Diesel (NY Harbor ULSD), US-Dollar je Gallone
- RB=F      Benzin (RBOB), US-Dollar je Gallone
- EURUSD=X  US-Dollar je Euro

Ergebnis: data/futures.csv. build_site.py verlängert damit die EIA-Werte bis heute.
Die Yahoo-Schnittstelle ist inoffiziell und kann sich ohne Ankündigung ändern.
"""
import csv
import json
import sys
import time
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen

from common import DATA

SYMBOLS = {"brent_usd_bbl": "BZ=F", "diesel_usd_gal": "HO=F", "gasoline_usd_gal": "RB=F", "usd_per_eur": "EURUSD=X"}
BROWSER = "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
PATH = DATA / "futures.csv"
KEEP_DAYS = 400


def load(symbol):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1y&interval=1d"
    with urlopen(Request(url, headers={"User-Agent": BROWSER}), timeout=30) as r:
        res = json.load(r)["chart"]["result"][0]
    offset = res["meta"].get("gmtoffset", 0)
    out = {}
    for ts, close in zip(res.get("timestamp", []), res["indicators"]["quote"][0].get("close", [])):
        if close is not None:
            d = datetime.fromtimestamp(ts + offset, timezone.utc).date().isoformat()
            out[d] = round(close, 4)
    return out


def main():
    cols = {n: {} for n in SYMBOLS}
    if PATH.exists():
        with open(PATH, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                for n in SYMBOLS:
                    if row.get(n):
                        cols[n][row["date"]] = float(row[n])
    ok = 0
    for name, sym in SYMBOLS.items():
        try:
            cols[name].update(load(sym))
            ok += 1
        except Exception as e:
            print(f"{sym}: nicht geladen ({e})", file=sys.stderr)
        time.sleep(1)
    if not ok:
        sys.exit("Yahoo hat keine Kurse geliefert.")
    cutoff = (datetime.now().date() - timedelta(days=KEEP_DAYS)).isoformat()
    dates = sorted(d for d in set().union(*[c.keys() for c in cols.values()]) if d >= cutoff)
    with open(PATH, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", *SYMBOLS])
        for d in dates:
            w.writerow([d, *[cols[n].get(d, "") for n in SYMBOLS]])
    print(f"{ok}/4 Kurse geladen, letzter Tag {dates[-1]}: "
          + ", ".join(f"{s} {cols[n].get(dates[-1], '-')}" for n, s in SYMBOLS.items()))


if __name__ == "__main__":
    main()
