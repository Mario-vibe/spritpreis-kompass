# Offene Punkte

- [ ] **Tankmengen klären:** Wie viele Liter tankt ihr typischerweise auf einmal? Angenommen sind
      Opel 40 l und Bulli 60 l. Eintragen in `config.json` unter `vehicles` → `fill_l`.
      Davon hängt ab, ab welchem Preisunterschied sich ein Umweg lohnt.
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
