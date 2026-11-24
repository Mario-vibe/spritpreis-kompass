"""Importiert historische Preise aus dem Tankerkönig-Datenbestand.

Tankerkönig stellt nach Registrierung alle Preisänderungen als Tagesdateien bereit
(prices/JJJJ/MM/JJJJ-MM-TT-prices.csv). Spalten:
date, station_uuid, diesel, e5, e10, dieselchange, e5change, e10change

Zwei Wege:
  1) Lokale Dateien:  python scripts/import_history.py datei1.csv datei2.csv ...
  2) Herunterladen:   python scripts/import_history.py --days 120
     Dafür die Umgebungsvariablen setzen:
       TK_HISTORY_URL   Adressmuster, z. B. https://.../prices/{Y}/{m}/{Y}-{m}-{d}-prices.csv
       TK_HISTORY_USER  und TK_HISTORY_PASS, falls der Zugang eine Anmeldung braucht

Importierte Tage ersetzen die selbst gesammelten Werte dieser Tage, weil der
Datenbestand jede Änderung sekundengenau enthält.
"""
import csv
import io
import os
import sys
from datetime import date, datetime, timedelta

from common import euro_to_ct, http_get, load_config, read_events, write_events


def parse_ts(s):
    s = s.strip()
    if len(s) >= 3 and s[-3] in "+-" and s[-2:].isdigit():
        s += ":00"  # "…+01" -> "…+01:00"
    return int(datetime.fromisoformat(s).timestamp())


def parse_day(text, ids, fuels):
    out = {}
    for row in csv.DictReader(io.StringIO(text)):
        sid = row.get("station_uuid")
        if sid not in ids:
            continue
        ts = parse_ts(row["date"])
        for fuel in fuels:
            flag = row.get(fuel + "change", "1")
            if flag in ("1", "3"):  # 1 = geändert, 3 = neu
                out.setdefault((sid, fuel), []).append((ts, euro_to_ct(row.get(fuel))))
    return out


def merge(ev, imported, day_ranges):
    for key, items in imported.items():
        keep = [e for e in ev[key] if not any(a <= e[0] < b for a, b in day_ranges)]
        ev[key] = sorted(keep + items, key=lambda e: e[0])


def main():
    cfg = load_config()
    ids = {s["id"] for s in cfg["stations"]}
    fuels = cfg["fuels"]
    if not ids:
        sys.exit("Noch keine Tankstellen in config.json.")
    texts = []
    if "--days" in sys.argv:
        tpl = os.environ.get("TK_HISTORY_URL")
        if not tpl:
            print("::notice::TK_HISTORY_URL ist nicht gesetzt, Import übersprungen.")
            return
        n = int(sys.argv[sys.argv.index("--days") + 1])
        user, pw = os.environ.get("TK_HISTORY_USER"), os.environ.get("TK_HISTORY_PASS")
        for i in range(n, 0, -1):
            d = date.today() - timedelta(days=i)
            url = tpl.format(Y=f"{d:%Y}", m=f"{d:%m}", d=f"{d:%d}")
            try:
                texts.append(http_get(url, user, pw, timeout=120).decode("utf-8"))
            except Exception as e:  # einzelne fehlende Tage sind kein Abbruchgrund
                print(f"{d}: nicht geladen ({e})")
    else:
        for p in sys.argv[1:]:
            with open(p, encoding="utf-8") as f:
                texts.append(f.read())
    ev = read_events()
    total = 0
    for text in texts:
        day = parse_day(text, ids, fuels)
        if not day:
            continue
        tss = [t for items in day.values() for t, _ in items]
        start = datetime.fromtimestamp(min(tss)).replace(hour=0, minute=0, second=0)
        rng = [(int(start.timestamp()), int((start + timedelta(days=1)).timestamp()))]
        merge(ev, day, rng)
        total += sum(len(v) for v in day.values())
    write_events(ev)
    print(f"{total} historische Preisänderungen aus {len(texts)} Tagesdateien übernommen.")


if __name__ == "__main__":
    main()
