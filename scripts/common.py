"""Gemeinsame Hilfsfunktionen: Pfade, Konfiguration, Preisereignisse, HTTP."""
import base64
import csv
import json
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
EVENTS = DATA / "events"
DOCS = ROOT / "docs"
CONFIG = ROOT / "config.json"
TK_API = "https://creativecommons.tankerkoenig.de/json"
USER_AGENT = "spritpreis-kompass/1.0"


def load_config():
    with open(CONFIG, encoding="utf-8") as f:
        return json.load(f)


def save_config(cfg):
    with open(CONFIG, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
        f.write("\n")


def http_get(url, user=None, password=None, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    if user:
        token = base64.b64encode(f"{user}:{password or ''}".encode()).decode()
        req.add_header("Authorization", "Basic " + token)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def read_events():
    """Liefert {(station_id, kraftstoff): [(unix_ts, preis_ct oder None), ...]} sortiert.

    Gespeichert werden nur Preisänderungen. None bedeutet: Tankstelle geschlossen
    oder kein Preis gemeldet.
    """
    ev = defaultdict(list)
    for path in sorted(EVENTS.glob("*.csv")):
        with open(path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                price = float(row["price"]) if row["price"] else None
                ev[(row["station"], row["fuel"])].append((int(row["ts"]), price))
    for k in ev:
        ev[k].sort(key=lambda e: e[0])
    return ev


def write_events(ev):
    """Schreibt alle Ereignisse, aufgeteilt in Monatsdateien (UTC)."""
    months = defaultdict(list)
    for (station, fuel), items in ev.items():
        for ts, price in items:
            months[time.strftime("%Y-%m", time.gmtime(ts))].append((ts, station, fuel, price))
    EVENTS.mkdir(parents=True, exist_ok=True)
    for old in EVENTS.glob("*.csv"):
        if old.stem not in months:
            old.unlink()
    for month, rows in months.items():
        rows.sort(key=lambda r: (r[0], r[1], r[2]))
        with open(EVENTS / f"{month}.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["ts", "station", "fuel", "price"])
            for ts, station, fuel, price in rows:
                w.writerow([ts, station, fuel, "" if price is None else f"{price:.1f}"])


def euro_to_ct(value):
    """Tankerkönig liefert 1.759 (Euro). Gespeichert werden Cent: 175.9."""
    if value in (None, False, "", 0, "0"):
        return None
    v = float(value)
    return round(v * 100, 1) if v > 0 else None
