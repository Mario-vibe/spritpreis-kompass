#!/usr/bin/env bash
# Läuft per cron auf dem Raspberry Pi: Terminkurse von Yahoo holen und zu GitHub schicken.
set -euo pipefail
cd "$(dirname "$0")/.."

git pull -q --rebase
python3 scripts/fetch_futures.py
git add data/futures.csv
if ! git diff --cached --quiet; then
  git -c user.name="spritpreis-pi" -c user.email="spritpreis-pi@users.noreply.github.com" \
    commit -q -m "Terminkurse $(date +%Y-%m-%d\ %H:%M)"
  # Falls GitHub gerade selbst etwas gespeichert hat: einmal neu aufsetzen und erneut senden
  git push -q || { git pull -q --rebase && git push -q; }
  echo "$(date '+%F %T') hochgeladen"
else
  echo "$(date '+%F %T') keine neuen Kurse"
fi
