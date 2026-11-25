"""Berechnet die Entfernung (Luftlinie) jeder Tankstelle zum Wohnort.

Der Wohnort kommt aus den Umgebungsvariablen HOME_LAT und HOME_LNG und wird nicht
gespeichert, nur die Kilometer und die Lage der Tankstellen. Braucht TK_API_KEY.

Mit PROFILE (z. B. "mama") werden die Entfernungen für einen anderen Wohnort unter
km_by[PROFILE] gespeichert, wie die eigenen auf eine Nachkommastelle.
"""
import json
import math
import os
import sys

from common import TK_API, http_get, load_config, save_config


def km_between(lat1, lng1, lat2, lng2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def main():
    key = os.environ.get("TK_API_KEY")
    try:
        home = float(os.environ["HOME_LAT"].replace(",", ".")), float(os.environ["HOME_LNG"].replace(",", "."))
    except (KeyError, ValueError):
        sys.exit("Breite und Länge des Wohnorts fehlen oder sind keine Zahlen.")
    if not key:
        sys.exit("TK_API_KEY fehlt.")
    profile = os.environ.get("PROFILE", "").strip().lower()
    cfg = load_config()
    for s in cfg["stations"]:
        if s.get("lat") is None or s.get("lng") is None:
            data = json.loads(http_get(f"{TK_API}/detail.php?id={s['id']}&apikey={key}"))
            if not data.get("ok"):
                print(f"{s['name']}, {s.get('place')}: Lage nicht abrufbar ({data.get('message')})")
                continue
            s["lat"], s["lng"] = data["station"]["lat"], data["station"]["lng"]
        km = km_between(home[0], home[1], s["lat"], s["lng"])
        if profile:
            s.setdefault("km_by", {})[profile] = round(km, 1)
            print(f"{round(km, 1):6.1f} km  {s['name']}, {s.get('street')}, {s.get('place')}")
        else:
            s["km"] = round(km, 1)
            print(f"{s['km']:6.1f} km  {s['name']}, {s.get('street')}, {s.get('place')}")
    save_config(cfg)


if __name__ == "__main__":
    main()
