#!/usr/bin/env bash
# Läuft per cron auf dem Raspberry Pi (alle 10 Minuten) und stößt bei GitHub den Ablauf
# "Preise abrufen" an. GitHubs eigener Zeitplan ist zu unzuverlässig.
#
# Braucht einen Fine-grained Personal Access Token mit der einzigen Berechtigung
# "Actions: Read and write" für das Repository spritpreis-kompass, abgelegt in
#   ~/.config/spritpreis/github-token   (nur für den eigenen Benutzer lesbar)
# Ausgabe nur bei Fehlern, damit das Protokoll klein bleibt.
set -u
REPO="Mario-vibe/spritpreis-kompass"
TOKEN_FILE="$HOME/.config/spritpreis/github-token"

if [ ! -r "$TOKEN_FILE" ]; then
  echo "$(date '+%F %T') Token-Datei fehlt: $TOKEN_FILE"
  exit 1
fi
ANTWORT="$(mktemp)"
trap 'rm -f "$ANTWORT"' EXIT
CODE=$(curl -sS -m 30 -o "$ANTWORT" -w '%{http_code}' -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(cat "$TOKEN_FILE")" \
  "https://api.github.com/repos/$REPO/actions/workflows/preise.yml/dispatches" \
  -d '{"ref":"main"}') || CODE="Verbindungsfehler"
if [ "$CODE" != "204" ]; then
  echo "$(date '+%F %T') Anstoß fehlgeschlagen ($CODE): $(head -c 300 "$ANTWORT")"
  exit 1
fi
