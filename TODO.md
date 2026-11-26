# Offene Punkte

- [ ] **Tankmenge Bulli klären:** Angenommen sind 60 l. Eintragen in `config.json` unter `vehicles` → `fill_l`.
      Davon hängt ab, ab welchem Preisunterschied sich ein Umweg lohnt.
- [x] **Tankmenge Opel:** 30 l (Tankliste: Durchschnitt 27 l, höchstens etwa 45 l).
- [ ] **Tankrabatt prüfen (Mitte Dezember 2026):** Wird die Senkung der Energiesteuer über den
      31.12.2026 hinaus verlängert? Falls ja, `rabatt_end` in `config.json` anpassen.
- [ ] **Verzögerungsanalyse ansehen (ab etwa Anfang Januar 2027):** Wie viele Tage hinkt die
      Zapfsäule dem Großhandel hinterher? Bei nur 2 bis 3 Tagen könnten tagesaktuelle Börsendaten
      (kostenpflichtig) die Prognose verbessern, bei einer Woche oder mehr lohnt sich das nicht.
- [ ] **Historische Preise (optional):** Bei Tankerkönig nach Zugang zum Datenbestand fragen. Damit
      ließe sich die Vergangenheit sofort auffüllen statt über Wochen zu sammeln.
- [ ] **Benachrichtigungen aufs Handy (nach der Testphase entscheiden):** Meldung bei günstigem Preis,
      z. B. gegen 10:30 Uhr, höchstens einmal am Tag, wenn die sinnvollste Tankstelle zu den günstigsten
      20 % der letzten 30 Tage gehört. Wege: App „ntfy“ (einfach, empfohlen) oder Web-Push direkt aus der
      Web-App (aufwendiger). Offen: eigener Kanal für Mama (E10)? Uhrzeit?
- [ ] **Schlüssel des Raspberry Pi erneuern bis 23.02.2027:** Der Fine-grained Token für den Anstoß alle
      10 Minuten läuft an diesem Tag ab. Etwa Mitte Februar bei GitHub einen neuen erstellen (gleiche
      Einstellungen: nur dieses Repository, nur „Actions: Read and write“) und auf dem Pi in
      `~/.config/spritpreis/github-token` ersetzen. Danach den alten Schlüssel bei GitHub löschen.
