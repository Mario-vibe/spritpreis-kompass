"""Fasst Preise, Marktdaten und Einstellungen in docs/data/site.json zusammen."""
import csv
import json
import time

from common import DATA, DOCS, load_config, read_events


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
    market = []
    mpath = DATA / "market.csv"
    if mpath.exists():
        with open(mpath, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                market.append({k: (row[k] if k == "date" else (float(row[k]) if row[k] else None)) for k in row})
        market = market[-(days + 30):]
    site = {
        "generated": generated,
        "demo": False,
        "days": days,
        "fuels": cfg["fuels"],
        "stations": cfg["stations"],
        "tax": cfg["tax"],
        "events": events,
        "market": market,
    }
    (DOCS / "data").mkdir(parents=True, exist_ok=True)
    with open(DOCS / "data" / "site.json", "w", encoding="utf-8") as f:
        json.dump(site, f, ensure_ascii=False, separators=(",", ":"))
    print(f"site.json geschrieben: {len(cfg['stations'])} Tankstellen, {len(market)} Markttage.")


if __name__ == "__main__":
    main()
