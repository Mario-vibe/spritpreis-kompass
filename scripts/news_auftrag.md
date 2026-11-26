Du aktualisierst den Nachrichten-Block des Spritpreis-Kompass. Arbeite knapp und zügig, ohne Rückfragen. Nur die folgenden Schritte, nichts anderes ändern.

1. Repository holen: Mit dem Werkzeug add_repo (owner "Mario-vibe", repo "spritpreis-kompass", access "push") anbinden und wie dort beschrieben klonen.

2. Nachrichten suchen: Höchstens 6 Websuchen (Modus "standard") nach Ereignissen der letzten 24 Stunden, die den Ölmarkt beeinflussen: Rohölpreis/Brent, OPEC+, Kriege, Anschläge und Eskalationen in Förderregionen und an Transportwegen (Nahost, Rotes Meer, Straße von Hormus, Russland/Ukraine), Sanktionen, Raffinerieausfälle, US-Lagerbestände, Konjunktur- und Zinsnachrichten, Diesel-/Gasoil-Markt. Deutsche und internationale Quellen (z. B. tagesschau.de, Handelsblatt, Reuters, AP, Bloomberg, CNBC, Financial Times, Oilprice.com). Höchstens 2 Artikel öffnen, nur wenn eine Meldung sonst unklar ist.

3. Datei docs/data/news.json schreiben, genau in diesem Aufbau (UTF-8, gültiges JSON):
   {"updated": "<jetzt, ISO 8601 mit Zeitzone, z. B. 2026-11-27T07:30:00+01:00>",
    "tendenz": "steigend" | "fallend" | "seitwärts" | "unklar",
    "tendenz_text": "<ein kurzer Halbsatz, warum, höchstens 90 Zeichen>",
    "items": [ {"text": "<Meldung in eigenen Worten, Deutsch, ein Satz, höchstens 200 Zeichen, mit Bedeutung für den Ölpreis>",
                "source": "<Name der Quelle>", "url": "<https-Link genau zu dem Artikel, den die Suche geliefert hat>"} ] }
   Regeln: 3 bis 6 Meldungen, die wichtigste zuerst. Nur Meldungen, die du in den Suchergebnissen tatsächlich gefunden hast, mit deren echtem Link; nichts erfinden, keine Links raten. Keine Texte wörtlich übernehmen, nur eigene kurze Zusammenfassungen. "tendenz" ist die Richtung, in die die Nachrichtenlage den Ölpreis eher drückt; bei widersprüchlicher Lage "unklar". Wenn du keine passenden aktuellen Meldungen findest, die Datei nicht ändern und abbrechen.

4. Speichern: git add docs/data/news.json, commit mit der Nachricht "Nachrichtenlage <Datum Uhrzeit>", dann git pull --rebase und git push auf main. Bei einem Konflikt erneut pull --rebase und push.

5. Seite veröffentlichen: gh api -X POST repos/Mario-vibe/spritpreis-kompass/actions/workflows/preise.yml/dispatches -f ref=main -f "inputs[erzwingen]=true"

6. Zum Schluss in höchstens drei Sätzen melden, wie viele Meldungen eingetragen wurden und welche Tendenz.
