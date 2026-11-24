"""Ruft die aktuellen Preise der Tankstellen aus config.json ab (Tankerkönig-API).

Gespeichert wird nur, wenn sich ein Preis geändert hat. Braucht TK_API_KEY.
"""
import json
import os
import sys
import time

from common import DATA, TK_API, euro_to_ct, http_get, load_config, read_events, write_events


def main():
    key = os.environ.get("TK_API_KEY")
    if not key:
        print("::warning::TK_API_KEY ist nicht gesetzt, Abruf übersprungen.")
        return
    cfg = load_config()
    ids = [s["id"] for s in cfg["stations"]]
    if not ids:
        print("::warning::Noch keine Tankstellen in config.json, Abruf übersprungen.")
        return
    ev = read_events()
    now = int(time.time())
    changed = 0
    for i in range(0, len(ids), 10):  # höchstens 10 Tankstellen je Anfrage
        url = f"{TK_API}/prices.php?ids={','.join(ids[i:i + 10])}&apikey={key}"
        data = json.loads(http_get(url))
        if not data.get("ok"):
            sys.exit("Tankerkönig meldet einen Fehler: " + str(data.get("message")))
        for sid, p in data.get("prices", {}).items():
            is_open = p.get("status") == "open"
            for fuel in cfg["fuels"]:
                price = euro_to_ct(p.get(fuel)) if is_open else None
                series = ev[(sid, fuel)]
                if not series or series[-1][1] != price:
                    series.append((now, price))
                    changed += 1
    write_events(ev)
    (DATA / "last_fetch.json").write_text(json.dumps({"ts": now}) + "\n", encoding="utf-8")
    print(f"{changed} Preisänderungen gespeichert.")


if __name__ == "__main__":
    main()
