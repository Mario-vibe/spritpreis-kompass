"""Lädt Tageswerte für Rohöl, Großhandelspreise und Wechselkurs (ohne Schlüssel).

- US-Energiebehörde EIA (Tagestabellen, werden wöchentlich ergänzt):
    RBRTED                        Brent, US-Dollar je Barrel
    EER_EPD2DXL0_PF4_Y35NY_DPGD   Diesel (ULSD) Großhandel New York Harbor, US-Dollar je Gallone
    EER_EPMRU_PF4_Y35NY_DPGD      Benzin Großhandel New York Harbor, US-Dollar je Gallone
- Europäische Zentralbank: Referenzkurs, US-Dollar je Euro

Die Rotterdamer Notierungen (ICE Gasoil, Eurobob) sind nicht frei verfügbar. Die
New-Yorker Großhandelspreise laufen ihnen sehr ähnlich und dienen als Ersatz.
FRED und Yahoo Finance sperren die Server von GitHub und werden deshalb nicht genutzt.
"""
import csv
import io
import re
from datetime import date, timedelta

from common import DATA, http_get

EIA = {
    "brent_usd_bbl": "RBRTED",
    "diesel_usd_gal": "EER_EPD2DXL0_PF4_Y35NY_DPGD",
    "gasoline_usd_gal": "EER_EPMRU_PF4_Y35NY_DPGD",
}
COLUMNS = [*EIA, "usd_per_eur"]
KEEP_DAYS = 400
MONTHS = {m: i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
ROW = re.compile(r"<td class='B6'>(?:&nbsp;)*\s*(\d{4}) (\w{3})-\s*(\d+) to [^<]*</td>((?:\s*<td class='B3'>[^<]*</td>){5})")
CELL = re.compile(r"<td class='B3'>([^<]*)</td>")


def parse_eia(html):
    """Zeilen der Form '2026 Nov-16 to Nov-20' mit fünf Werten Montag bis Freitag."""
    out = {}
    for year, mon, day, cells in ROW.findall(html):
        start = date(int(year), MONTHS[mon], int(day))
        for i, v in enumerate(CELL.findall(cells)):
            v = v.strip()
            if v:
                try:
                    out[(start + timedelta(days=i)).isoformat()] = float(v)
                except ValueError:
                    pass  # "NA", "W" usw.
    return out


def load_eia(series_id):
    html = http_get(f"https://www.eia.gov/dnav/pet/hist/{series_id}.htm", timeout=60).decode("latin-1")
    values = parse_eia(html)
    if not values:
        raise ValueError("Tabelle nicht gefunden, die Seite hat sich womöglich geändert")
    return values


def load_ecb():
    start = (date.today() - timedelta(days=KEEP_DAYS + 30)).isoformat()
    raw = http_get("https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A"
                   f"?startPeriod={start}&format=csvdata", timeout=60).decode("utf-8")
    return {r["TIME_PERIOD"]: float(r["OBS_VALUE"]) for r in csv.DictReader(io.StringIO(raw)) if r.get("OBS_VALUE")}


def read_existing(path):
    """Bisher gespeicherte Werte, damit ein Ausfall einer Quelle nichts löscht."""
    old = {name: {} for name in COLUMNS}
    if path.exists():
        with open(path, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                for name in COLUMNS:
                    if row.get(name):
                        old[name][row["date"]] = float(row[name])
    return old


def main():
    path = DATA / "market.csv"
    cols = read_existing(path)
    failed = []
    sources = [(name, lambda sid=sid: load_eia(sid), sid) for name, sid in EIA.items()]
    sources.append(("usd_per_eur", load_ecb, "EZB-Wechselkurs"))
    for name, loader, label in sources:
        try:
            cols[name].update(loader())
        except Exception as e:  # eine ausgefallene Quelle darf den Ablauf nicht stoppen
            failed.append(label)
            print(f"::warning::Marktdaten {label} nicht geladen: {e}")
    cutoff = (date.today() - timedelta(days=KEEP_DAYS)).isoformat()
    dates = sorted(d for d in set().union(*[c.keys() for c in cols.values()]) if d >= cutoff)
    if not dates:
        print("::warning::Keine Marktdaten verfügbar, das Diagramm bleibt vorerst leer.")
        return
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", *COLUMNS])
        for d in dates:
            w.writerow([d, *[cols[n].get(d, "") for n in COLUMNS]])
    last = {n: max(cols[n]) if cols[n] else "-" for n in COLUMNS}
    print(f"{len(dates)} Tage Marktdaten gespeichert. Letzte Werte: {last}."
          + (f" Nicht erreichbar: {', '.join(failed)}." if failed else ""))


if __name__ == "__main__":
    main()
