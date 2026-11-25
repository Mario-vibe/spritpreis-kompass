"""Fasst Preise, Marktdaten und Einstellungen in docs/data/site.json zusammen."""
import csv
import json
import time

from common import DATA, DOCS, load_config, read_events


FIELDS = ["brent_usd_bbl", "diesel_usd_gal", "gasoline_usd_gal", "usd_per_eur"]


def read_csv(path):
    """{datum: {feld: wert}} aus einer Markt-CSV, leer wenn die Datei fehlt."""
    out = {}
    if path.exists():
        with open(path, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                out[row["date"]] = {k: float(row[k]) for k in FIELDS if row.get(k)}
    return out


def main():
    cfg = load_config()
    if not cfg["stations"]:
        print("Noch keine Tankstellen eingetragen, die Beispieldaten bleiben stehen.")
        return
    days = cfg.get("days_on_page", 120)
    last = DATA / "last_fetch.json"
    generated = json.loads(last.read_text())["ts"] if last.exists() else int(time.time())
    cutoff = generated - (days + 3) * 86400
    ev = read_events()
    events = {}
    for s in cfg["stations"]:
        per = {}
        for fuel in cfg["fuels"]:
            items = ev.get((s["id"], fuel), [])
            before = [e for e in items if e[0] < cutoff][-1:]  # Startwert am Rand
            per[fuel] = [[t, p] for t, p in before + [e for e in items if e[0] >= cutoff]]
        events[s["id"]] = per
    mk = read_csv(DATA / "market.csv")
    market = [{"date": d, **{k: mk[d].get(k) for k in FIELDS}} for d in sorted(mk)][-(days + 30):]
    meta_path = DATA / "market_meta.json"
    market_meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    site = {
        "generated": generated,
        "built": int(time.time()),
        "demo": False,
        "days": days,
        "fuels": cfg["fuels"],
        "stations": cfg["stations"],
        "tax": cfg["tax"],
        "events": events,
        "market": market,
        "market_meta": market_meta,
        "vehicles": cfg.get("vehicles", []),
        "road_factor": cfg.get("road_factor", 1.3),
    }
    (DOCS / "data").mkdir(parents=True, exist_ok=True)
    with open(DOCS / "data" / "site.json", "w", encoding="utf-8") as f:
        json.dump(site, f, ensure_ascii=False, separators=(",", ":"))
    # Winzige Datei nur mit dem Zeitstempel: Die Seite prüft damit, ob es Neues gibt, ohne alle Daten zu laden
    with open(DOCS / "data" / "stamp.json", "w", encoding="utf-8") as f:
        json.dump({"generated": generated, "built": site["built"]}, f)
    print(f"site.json geschrieben: {len(cfg['stations'])} Tankstellen, {len(market)} Markttage.")


if __name__ == "__main__":
    main()
