"""Fügt Tankstellen anhand von Marke, Straße und Ort hinzu.

Eingabe (Umgebungsvariable LISTE): Einträge durch ";" getrennt, Felder durch "|":
    Marke|Straße|Breite,Länge|Umkreis_km
Breite/Länge ist ein Punkt im jeweiligen Ort, der Umkreis höchstens 25 km.

Übernommen wird eine Tankstelle nur, wenn genau ein Treffer zu Straße und Marke passt.
Sonst werden die Kandidaten nur aufgelistet. Braucht TK_API_KEY.
"""
import json
import os
import re
import sys

from common import TK_API, http_get, load_config, save_config


def norm(s):
    s = (s or "").lower().replace("ß", "ss")
    s = re.sub(r"str\.?\b", "strasse", s)
    s = s.replace("chausee", "chaussee")
    return re.sub(r"[^a-z0-9äöü]", "", s)


def main():
    key = os.environ.get("TK_API_KEY")
    if not key:
        sys.exit("TK_API_KEY fehlt.")
    entries = [e.strip() for e in os.environ.get("LISTE", "").split(";") if e.strip()]
    cfg = load_config()
    known = {s["id"] for s in cfg["stations"]}
    added, report = 0, []
    for entry in entries:
        brand, street, coords, rad = [x.strip() for x in entry.split("|")]
        lat, lng = [float(x) for x in coords.split(",")]
        url = f"{TK_API}/list.php?lat={lat}&lng={lng}&rad={min(float(rad), 25)}&sort=dist&type=all&apikey={key}"
        data = json.loads(http_get(url))
        if not data.get("ok"):
            report.append(f"- {brand}, {street}: Fehler von Tankerkönig ({data.get('message')})")
            continue
        st = data.get("stations", [])
        by_street = [s for s in st if norm(street) in norm(s["street"])]
        both = [s for s in by_street if norm(brand)[:4] in norm(s["brand"]) + norm(s["name"])]
        hits = both if len(both) == 1 else (by_street if len(by_street) == 1 else both or by_street)
        desc = lambda s: f"{s['brand'] or '-'} / {s['name']}, {s['street']} {s.get('houseNumber') or ''}, {s['postCode']} {s['place']} [{s['id']}]"
        if len(hits) == 1:
            s = hits[0]
            if s["id"] in known:
                report.append(f"- {brand}, {street}: schon vorhanden ({desc(s)})")
                continue
            cfg["stations"].append({
                "id": s["id"],
                "name": (s["brand"] or s["name"]).strip(),
                "street": f"{s['street']} {s.get('houseNumber') or ''}".strip().title() if s["street"].isupper() else f"{s['street']} {s.get('houseNumber') or ''}".strip(),
                "place": s["place"].title() if s["place"].isupper() else s["place"],
                "km": None,
            })
            known.add(s["id"])
            added += 1
            report.append(f"- {brand}, {street}: übernommen ({desc(s)})")
        elif not hits:
            report.append(f"- {brand}, {street}: kein Treffer in der Straße. Tankstellen im Umkreis: "
                          + "; ".join(desc(s) for s in st[:8]))
        else:
            report.append(f"- {brand}, {street}: mehrere Treffer, nicht übernommen: " + "; ".join(desc(s) for s in hits))
    save_config(cfg)
    print("\n".join(report))
    print(f"\n{added} Tankstellen hinzugefügt, insgesamt {len(cfg['stations'])}.")


if __name__ == "__main__":
    main()
