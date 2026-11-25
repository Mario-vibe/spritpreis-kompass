# Spritpreis-Kompass

Eine Webseite für Handy und Laptop, die die Diesel- und E10-Preise der Tankstellen in der Umgebung sammelt, mit früheren Tagen vergleicht und eine Prognose bis zur nächsten 12-Uhr-Erhöhung zeigt. Dazu kommen der Großhandelspreis, Rohöl (Brent) und der Hinweis auf das Ende des Tankrabatts.

Alles läuft kostenlos bei GitHub. Ein eigenes Gerät oder ein Server ist nicht nötig.

## So funktioniert es

| Was | Wann | Woher |
|---|---|---|
| Aktuelle Preise der eigenen Tankstellen | alle 10 Minuten (angestoßen vom Raspberry Pi) | Tankerkönig-API (Markttransparenzstelle) |
| Rohöl, Großhandel, Euro-Dollar-Kurs | täglich früh | US-Energiebehörde EIA (wöchentlich ergänzt) und Europäische Zentralbank |
| Historische Preise (optional) | täglich früh | Tankerkönig-Datenbestand |

Gespeichert werden nur Preisänderungen, als CSV-Dateien im Ordner `data/`. Die Seite liegt in `docs/` und wird nach jedem Abruf neu veröffentlicht.

Bis die ersten echten Preise da sind, zeigt die Seite Beispieldaten und weist oben darauf hin.

## Einrichtung

### 1. GitHub-Konto anlegen
Auf <https://github.com/signup> ein kostenloses Konto anlegen. Der Benutzername wird Teil der Adresse der Seite: `https://BENUTZERNAME.github.io/spritpreis-kompass/`.

### 2. Tankerkönig-API-Schlüssel beantragen
Auf <https://creativecommons.tankerkoenig.de> den kostenlosen API-Schlüssel beantragen. Er kommt per E-Mail und sieht so aus: `12345678-abcd-…`.

### 3. Projekt zu GitHub bringen
Am einfachsten über Claude: GitHub unter <https://claude.ai/connect-github> mit Claude verbinden, auf GitHub ein leeres Repository namens `spritpreis-kompass` anlegen (öffentlich, ohne README) und Claude bitten, den Code hochzuladen.

### 4. API-Schlüssel hinterlegen
Im Repository: **Settings → Secrets and variables → Actions → New repository secret**
- Name: `TK_API_KEY`
- Secret: der Schlüssel aus Schritt 2

Der Schlüssel ist dort verschlüsselt und für niemanden sichtbar, auch nicht in den Daten der Seite.

### 5. Seite einschalten
**Settings → Pages → Build and deployment → Source: GitHub Actions** auswählen.

### 6. Tankstellen auswählen
**Actions → Tankstellen suchen → Run workflow**. Breiten- und Längengrad des Wohnorts eintragen (in Google Maps: Rechtsklick auf den Ort, dann die erste Zahl anklicken, um sie zu kopieren), Umkreis und Anzahl wählen. Die gefundene Liste steht anschließend in der Zusammenfassung des Laufs.

Einzelne Tankstellen lassen sich auch direkt in `config.json` hinzufügen oder löschen, etwa eine an der Strecke zur Arbeit.

### 7. Erster Lauf
**Actions → Marktdaten und Historie → Run workflow** einmal starten. Danach läuft alles von selbst. Den Preisabruf kann man mit **Preise abrufen → Run workflow** auch sofort anstoßen.

### 8. Historische Preise (optional)
Ohne diesen Schritt füllt sich die Historie mit der Zeit selbst: Das Tagesmuster ist nach 3 Tagen nutzbar, der 30-Tage-Vergleich nach einem Monat.

Wer sofort Monate an Vergangenheit möchte: Tankerkönig stellt alle Preisänderungen seit 2014 als Tagesdateien bereit. Den Zugang bei Tankerkönig erfragen und dann drei weitere Secrets anlegen:
- `TK_HISTORY_URL`: Adressmuster der Tagesdateien, mit Platzhaltern `{Y}`, `{m}`, `{d}`, z. B. `https://…/prices/{Y}/{m}/{Y}-{m}-{d}-prices.csv`
- `TK_HISTORY_USER` und `TK_HISTORY_PASS`, falls der Zugang eine Anmeldung braucht

Dann **Marktdaten und Historie** mit `tage = 120` starten.

## Takt alle 10 Minuten über den Raspberry Pi

GitHub startet zeitgesteuerte Abläufe oft stark verspätet oder gar nicht. Deshalb stößt ein
Raspberry Pi den Ablauf „Preise abrufen“ alle 10 Minuten von außen an. GitHubs eigener Zeitplan
(alle 30 Minuten) bleibt als Reserve. Veröffentlicht wird nur, wenn sich ein Preis geändert hat,
sonst spätestens alle 30 Minuten. Tankerkönig wird höchstens alle 4,5 Minuten gefragt.

1. **Schlüssel erstellen:** GitHub → Profilbild → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token. Name `Raspberry Pi Anstoß`, Ablaufdatum möglichst lang,
   Repository access: *Only select repositories* → `spritpreis-kompass`, Permissions → Repository
   permissions → **Actions: Read and write**. Sonst nichts.
2. **Auf dem Pi ablegen:**
   `mkdir -p ~/.config/spritpreis && nano ~/.config/spritpreis/github-token` (Schlüssel einfügen, speichern),
   dann `chmod 600 ~/.config/spritpreis/github-token`.
3. **Skript holen:** `curl -fsSL -o ~/spritpreis-anstossen.sh https://raw.githubusercontent.com/Mario-vibe/spritpreis-kompass/main/pi/anstossen.sh && chmod +x ~/spritpreis-anstossen.sh`
4. **Testen:** `~/spritpreis-anstossen.sh && echo ok` (bei Erfolg erscheint nur `ok`).
5. **Zeitplan:** `crontab -e`, Zeile anfügen:
   `*/10 * * * * $HOME/spritpreis-anstossen.sh >> $HOME/spritpreis.log 2>&1`

Ins Protokoll `~/spritpreis.log` wird nur bei Fehlern geschrieben.

## Gut zu wissen

- **Öffentlich:** GitHub Pages ist für kostenlose Konten nur bei öffentlichen Repositories verfügbar. Die Seite und die Liste der Tankstellen sind damit für jeden einsehbar, der die Adresse kennt, und lassen Rückschlüsse auf die Wohngegend zu. Der API-Schlüssel bleibt geheim.
- **Tankrabatt:** Beginn, Ende und Höhe stehen in `config.json` unter `tax`. Wird der Rabatt verlängert, dort `rabatt_end` anpassen.
- **Zeitplan:** GitHub startet geplante Abläufe oft einige Minuten verspätet. Pausiert GitHub die Abläufe einmal (es kommt dann eine E-Mail), unter **Actions** wieder einschalten.
- **Großhandel:** Die für Deutschland maßgeblichen Rotterdamer Notierungen (Gasoil, Eurobob) sind nicht frei verfügbar. Ersatzweise werden die sehr ähnlich laufenden Großhandelspreise des Hafens New York verwendet.
- **Lizenz der Preisdaten:** Tankerkönig / MTS-K, CC BY 4.0. Die Quelle steht auf der Seite.

## Dateien

```
config.json                 Tankstellen, Kraftstoffe, Steuerwerte
scripts/fetch_current.py    aktuelle Preise holen
scripts/fetch_market.py     Rohöl, Großhandel (EIA), Wechselkurs (EZB) holen
scripts/import_history.py   historische Tankerkönig-Daten übernehmen
scripts/find_stations.py    Tankstellen im Umkreis suchen
scripts/build_site.py       docs/data/site.json erzeugen
scripts/demo_data.py        Beispieldaten erzeugen
pi/anstossen.sh             stößt auf dem Raspberry Pi alle 10 Minuten den Preisabruf an
docs/                       die Webseite
.github/workflows/          die drei automatischen Abläufe
```
