"""Ruft die aktuellen Preise der Tankstellen aus config.json ab (Tankerkönig-API).

Gespeichert wird nur, wenn sich ein Preis geändert hat. Braucht TK_API_KEY.

Für den Ablauf bei GitHub gibt das Skript "publish=true/false" aus: Veröffentlicht wird,
wenn sich ein Preis geändert hat oder die letzte Veröffentlichung 30 Minuten her ist.
Liegt der letzte Abruf weniger als 4,5 Minuten zurück, wird Tankerkönig nicht gefragt
(Tankerkönig bittet um höchstens einen Abruf alle 5 Minuten).
"""
import json
import os
import sys
import time

from common import DATA, DOCS, TK_API, euro_to_ct, http_get, load_config, read_events, write_events


MIN_GAP = 270          # Sekunden: kürzester Abstand zwischen zwei Abrufen
PUBLISH_EVERY = 1800   # Sekunden: ohne Preisänderung spätestens so oft veröffentlichen


def output(publish):
    """Ergebnis für den GitHub-Ablauf: soll die Seite neu veröffentlicht werden?"""
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"publish={'true' if publish else 'false'}\n")


def read_ts(path, key):
    try:
        return int(json.loads(path.read_text(encoding="utf-8"))[key])
    except (OSError, ValueError, KeyError):
        return 0


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
    now = int(time.time())
    force = os.environ.get("FORCE", "").lower() == "true"  # z. B. nach geänderten Einstellungen: immer veröffentlichen
    if now - read_ts(DATA / "last_fetch.json", "ts") < MIN_GAP:
        print("Letzter Abruf liegt weniger als 4,5 Minuten zurück, Tankerkönig wird nicht erneut gefragt."
              + (" Die Seite wird trotzdem neu aufgebaut." if force else ""))
        output(force)
        return
    ev = read_events()
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
    published = read_ts(DOCS / "data" / "stamp.json", "generated")
    publish = force or changed > 0 or now - published >= PUBLISH_EVERY
    if publish:
        write_events(ev)
        (DATA / "last_fetch.json").write_text(json.dumps({"ts": now}) + "\n", encoding="utf-8")
    print(f"{changed} Preisänderungen. " + ("Wird veröffentlicht." if publish else "Keine Änderung, Veröffentlichung entfällt."))
    output(publish)


if __name__ == "__main__":
    main()
