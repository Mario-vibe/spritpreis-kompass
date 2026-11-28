# Offene Punkte

- [ ] **Tankmenge Bulli klären:** Angenommen sind 60 l. Eintragen in `config.json` unter `vehicles` → `fill_l`.
      Davon hängt ab, ab welchem Preisunterschied sich ein Umweg lohnt.
- [x] **Tankmenge Opel:** 30 l (Tankliste: Durchschnitt 27 l, höchstens etwa 45 l).
- [ ] **Tankrabatt und Spritpreisdeckel prüfen (Mitte Dezember 2026):**
      - Wird die Senkung der Energiesteuer über den 31.12.2026 hinaus verlängert? Falls ja,
        `rabatt_end` in `config.json` anpassen.
      - Spritpreisdeckel: Entwurf des Wirtschaftsministeriums, Kabinettsbeschluss geplant am
        2.12.2026. Stand Ende November: Start spätestens 1.1.2027, befristet bis 31.3.2027
        (Verlängerung auf höchstens ein Jahr möglich), bundesweiter Höchstpreis für E5, E10 und
        Diesel, an Werktagen von der Markttransparenzstelle beim Bundeskartellamt per Formel
        berechnet, Bußgeld bis 100.000 €, Autobahntankstellen ausgenommen, Länder dürfen abweichen.
        Strittig: Bezug teuerste Region oder Durchschnitt (davon hängt ab, ob der Deckel überhaupt greift).
      - Prüfen: Was wurde endgültig beschlossen? Ersetzt der Deckel den Tankrabatt? Startet er am
        1.1. oder erst am 3.1.2027 (so ein Bericht)?
      - 12-Uhr-Regel: Bleibt sie bestehen? Bisher keine ausdrückliche Aussage gefunden, aber alles
        deutet darauf hin: Der Höchstpreis soll jeweils am Folgetag ab 12 Uhr gelten, und das RWI
        sieht die Wirkung des Deckels vor allem im Kappen der 12-Uhr-Spitze. Falls sie doch entfällt
        oder sich ändert, müssen Prognose und Hinweise in der App angepasst werden.
      - Klären: Veröffentlicht das Bundeskartellamt den Höchstpreis täglich in abrufbarer Form?
      - Danach entscheiden: Höchstpreis als Linie im Diagramm anzeigen und als Obergrenze in die
        Prognose einbauen (würde den Sprung um 12 Uhr kappen, derzeit Diesel etwa +30 ct auf rund
        229 ct). Greenline (Autobahn) bliebe ungedeckelt.
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
- [ ] **Routenplanung mit Grenz-Tipp (Idee, erst bei einer längeren Fahrt angehen):** Start und Ziel
      eingeben, günstige Tankstellen am deutschen Abschnitt der Strecke mit Umwegkosten anzeigen,
      hervorgehoben die letzten vor der Grenze (Rückreise: die ersten danach). Optional einen selbst
      recherchierten Auslandspreis eintragen und vergleichen, ob Volltanken vor der Grenze lohnt.
      Technik: kostenloser Cloudflare Worker als Vermittler, der den Tankerkönig-Schlüssel und den
      Schlüssel eines Routendienstes (z. B. openrouteservice) geheim hält und nichts speichert.
      Tankerkönig kennt nur Deutschland, ausländische Preise werden nicht eingebunden.
      Aufwand: Worker klein, Routenplanung etwa zwei Sitzungen. Vorher klären: zulässige Zahl der
      Tankerkönig-Abfragen pro Route. Zuerst einen Entwurf zeigen.
