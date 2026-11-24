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


def combine_market(eia, fut):
    """EIA-Werte (amtlich, aber bis zu eine Woche alt) mit den Terminkursen vom Pi bis heute verlängern.

    Nach dem letzten EIA-Tag wird der EIA-Wert mit der prozentualen Veränderung des
    Terminkurses fortgeschrieben. So bleibt das Niveau der EIA-Reihe erhalten.
    """
    rows = {d: dict(v) for d, v in eia.items()}
    est = set()
    for f in FIELDS:
        eia_days = sorted(d for d, v in eia.items() if f in v)
        fut_days = sorted(d for d, v in fut.items() if f in v)
        if not fut_days:
            continue
        if not eia_days:  # z. B. EZB nicht erreichbar: Terminkurs direkt verwenden
            for d in fut_days:
                rows.setdefault(d, {})[f] = fut[d][f]
            continue
        last = eia_days[-1]
        base = [d for d in fut_days if d <= last]
        if not base:
            continue
        ratio = eia[last][f] / fut[base[-1]][f]
        for d in fut_days:
            if d > last:
                rows.setdefault(d, {})[f] = round(fut[d][f] * ratio, 4)
                est.add(d)
    return [{"date": d, **{k: rows[d].get(k) for k in FIELDS}, **({"est": True} if d in est else {})}
            for d in sorted(rows)]


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
    market = combine_market(read_csv(DATA / "market.csv"), read_csv(DATA / "futures.csv"))[-(days + 30):]
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
