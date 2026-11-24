"""Sucht Tankstellen im Umkreis und trägt die nächsten in config.json ein.

Aufruf: python scripts/find_stations.py BREITE LÄNGE [RADIUS_KM] [--save N]
Beispiel: python scripts/find_stations.py 53.83 9.96 5 --save 6
Braucht die Umgebungsvariable TK_API_KEY.
"""
import argparse
import json
import os
import sys

from common import TK_API, http_get, load_config, save_config


def main():
    p = argparse.ArgumentParser(usage=__doc__)
    p.add_argument("lat")
    p.add_argument("lng")
    p.add_argument("radius", nargs="?", default="5")
    p.add_argument("--save", type=int, default=0)
    a = p.parse_args()
    num = lambda s: float(str(s).replace(",", "."))
    lat, lng, rad, save = num(a.lat), num(a.lng), min(num(a.radius), 25.0), a.save
    key = os.environ.get("TK_API_KEY")
    if not key:
        sys.exit("TK_API_KEY fehlt.")
    url = f"{TK_API}/list.php?lat={lat}&lng={lng}&rad={rad}&sort=dist&type=all&apikey={key}"
    data = json.loads(http_get(url))
    if not data.get("ok"):
        sys.exit("Tankerkönig meldet einen Fehler: " + str(data.get("message")))
    stations = data.get("stations", [])
    for i, s in enumerate(stations, 1):
        print(f"{i:2}. {s['dist']:5.1f} km  {s['brand'] or '-':15}  {s['name']}, {s['street']} {s.get('houseNumber') or ''}, {s['place']}  [{s['id']}]")
    if save:
        cfg = load_config()
        known = {s["id"] for s in cfg["stations"]}
        for s in stations[:save]:
            if s["id"] in known:
                continue
            cfg["stations"].append({
                "id": s["id"],
                "name": (s["brand"] or s["name"]).strip(),
                "street": f"{s['street']} {s.get('houseNumber') or ''}".strip(),
                "place": s["place"],
                "km": round(s["dist"], 1),
            })
        save_config(cfg)
        print(f"\n{len(cfg['stations'])} Tankstellen stehen jetzt in config.json.")


if __name__ == "__main__":
    main()
