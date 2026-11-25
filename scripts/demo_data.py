"""Erzeugt Beispieldaten in docs/data/site.json, damit die Seite vor dem ersten echten
Abruf etwas zeigt. Sobald echte Preise vorliegen, überschreibt build_site.py die Datei.
"""
import json
import math
import random
import time
from datetime import date, datetime, timedelta

from common import BERLIN, DOCS, load_config

STATIONS = [
    {"id": "demo-1", "name": "Freie Tankstelle", "street": "Am Moor 1", "place": "Beispielstadt", "km": 1.2, "off": 0},
    {"id": "demo-2", "name": "Markentankstelle", "street": "Hamburger Str. 20", "place": "Beispielstadt", "km": 2.0, "off": 3},
    {"id": "demo-3", "name": "Supermarkt-Tankstelle", "street": "Gewerbegebiet 5", "place": "Beispielstadt", "km": 3.4, "off": 1},
    {"id": "demo-4", "name": "Tankstelle am Bahnhof", "street": "Bahnhofstr. 2", "place": "Beispielstadt", "km": 2.7, "off": 4},
    {"id": "demo-5", "name": "Autohof A7", "street": "Industriestr. 9", "place": "Beispielstadt", "km": 6.8, "off": 7},
]
BASE_T = [45, 150, 270, 370, 470, 570, 1080, 1290, 1380]
BASE_D = [2, 1, 1, 2, 2, 1, 1, 1, 1]


def main():
    cfg = load_config()
    rnd = random.Random(42)
    now = int(time.time()) // 300 * 300
    days = cfg.get("days_on_page", 120)
    today = datetime.fromtimestamp(now, BERLIN).date()
    # Markt: Zufallspfad
    market, b, fx, cd, cg = [], 67.0, 1.16, 0.62, 0.45
    md = {}
    for i in range(days + 40, -1, -1):
        d = today - timedelta(days=i)
        b = b * (1 + 0.016 * rnd.gauss(0, 1)) + 0.04 * (70 - b)
        fx += 0.002 * rnd.gauss(0, 1) + 0.02 * (1.16 - fx)
        cd += 0.02 * rnd.gauss(0, 1) + 0.05 * (0.62 - cd)
        cg += 0.02 * rnd.gauss(0, 1) + 0.05 * (0.45 - cg)
        row = {"date": d.isoformat(), "brent_usd_bbl": round(b, 2), "diesel_usd_gal": round(b / 42 + cd, 4),
               "gasoline_usd_gal": round(b / 42 + cg, 4), "usd_per_eur": round(fx, 4)}
        md[d] = row
        if d.weekday() < 5:
            market.append(row)
    tax = cfg["tax"]
    rs, re_ = date.fromisoformat(tax["rabatt_start"]), date.fromisoformat(tax["rabatt_end"])
    events = {s["id"]: {f: [] for f in cfg["fuels"]} for s in STATIONS}
    for fuel in cfg["fuels"]:
        key = "diesel_usd_gal" if fuel == "diesel" else "gasoline_usd_gal"
        margin = 24 if fuel == "diesel" else 22
        walk = 0.0
        for i in range(days + 2, -1, -1):
            d = today - timedelta(days=i)
            noon = int(datetime(d.year, d.month, d.day, 12, tzinfo=BERLIN).timestamp())
            if noon > now:
                continue
            lag = sum(w * md[d - timedelta(days=2 + j)][key] / 3.785 / md[d - timedelta(days=2 + j)]["usd_per_eur"] * 100
                      for j, w in enumerate([0.3, 0.25, 0.2, 0.15, 0.1]))
            t = tax["energy_tax_ct"][fuel] - (tax["cut_ct"] if rs <= d < re_ else 0)
            walk = 0.85 * walk + 0.6 * rnd.gauss(0, 1)
            low = (lag + t + tax["co2_ct"][fuel] + margin) * 1.19 + walk
            for s in STATIONS:
                drops = [max(0, x + (1 if rnd.random() < .25 else 0) - (1 if rnd.random() < .2 else 0)) for x in BASE_D]
                peak = math.floor(low + s["off"] + (1 if fuel == "e10" and s["off"] > 3 else 0) + sum(drops) + rnd.random() * 1.6) + 0.9
                ev = events[s["id"]][fuel]
                ev.append([noon + rnd.randint(0, 3) * 60, round(peak, 1)])
                p = peak
                for tm, dr in zip(BASE_T, drops):
                    ts = noon + int(tm + (rnd.random() - .5) * 50) * 60
                    if dr and ts <= now:
                        p -= dr
                        ev.append([ts, round(p, 1)])
    site = {"generated": now, "demo": True, "days": days, "fuels": cfg["fuels"],
            "stations": [{k: v for k, v in s.items() if k != "off"} for s in STATIONS],
            "tax": tax, "events": events, "market": market}
    (DOCS / "data").mkdir(parents=True, exist_ok=True)
    with open(DOCS / "data" / "site.json", "w", encoding="utf-8") as f:
        json.dump(site, f, separators=(",", ":"))
    with open(DOCS / "data" / "stamp.json", "w", encoding="utf-8") as f:
        json.dump({"generated": now}, f)
    print("Beispieldaten geschrieben.")


if __name__ == "__main__":
    main()
