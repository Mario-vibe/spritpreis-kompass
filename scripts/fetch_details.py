"""Holt einmal täglich die Öffnungszeiten der Tankstellen (Tankerkönig detail.php).

Ergebnis: data/details.json  {station_id: {"times": [...], "override": [...], "whole_day": bool}}
Ein Ausfall stoppt den Ablauf nicht; bisher gespeicherte Angaben bleiben erhalten.
Braucht TK_API_KEY.
"""
import json
import os
import time

from common import DATA, TK_API, http_get, load_config

PATH = DATA / "details.json"


def main():
    key = os.environ.get("TK_API_KEY")
    if not key:
        print("::warning::TK_API_KEY fehlt, Öffnungszeiten nicht abgerufen.")
        return
    cfg = load_config()
    try:
        details = json.loads(PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        details = {}
    ok = failed = 0
    for s in cfg["stations"]:
        try:
            data = json.loads(http_get(f"{TK_API}/detail.php?id={s['id']}&apikey={key}"))
            if not data.get("ok"):
                raise ValueError(data.get("message"))
            st = data["station"]
            details[s["id"]] = {
                "times": [{"text": t.get("text", ""), "start": t.get("start", ""), "end": t.get("end", "")}
                          for t in (st.get("openingTimes") or [])],
                "override": st.get("overrideOpeningTimes") or [],
                "whole_day": bool(st.get("wholeDay")),
            }
            ok += 1
        except Exception as e:  # einzelne Tankstelle ohne Angaben ist kein Abbruchgrund
            failed += 1
            print(f"::warning::{s['name']} {s.get('place', '')}: Öffnungszeiten nicht abgerufen ({e})")
        time.sleep(0.5)
    known = {s["id"] for s in cfg["stations"]}
    details = {k: v for k, v in details.items() if k in known}
    PATH.write_text(json.dumps(details, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Öffnungszeiten: {ok} Tankstellen aktualisiert, {failed} ohne Antwort.")


if __name__ == "__main__":
    main()
