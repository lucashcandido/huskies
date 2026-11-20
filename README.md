# Huskies – Athletik, Roster & Playbook

Webapp für Combine-Messungen, Kaderplanung und Spielzüge. Läuft komplett im Browser – kein Server, kein Build-Schritt.

## Funktionen

- **Athleten**: Stammdaten (Name, Geburtsdatum bzw. Alter, Position) und Messverlauf für Gewicht, 40 Yard Dash, Shuffle, L-Cone rechts/links, Broad Jump, Vertical Jump und Max. Geschwindigkeit. Sortierbare Tabelle mit Aktuell-/Bestwert-Ansicht, Einfärbung nach Vierteln, Verlauf je Messwert, Plausibilitätswarnungen.
- **Testtag**: Schnellerfassung am Platz – *Station* (ein Test, alle Spieler, Enter = nächster) oder *Tabelle* (alle Tests). Jeder Wert wird sofort gespeichert.
- **Roster**: Kader aus Athlet:innen zusammenstellen, mit Trikotnummer, Position, Depth Chart und Durchschnittswerten je Position. Druckbar.
- **Personnel**: Offense- (10/11/12/21/22) und Defense-Gruppen (4-3, Nickel, Dime) mit konkreten Spielern, automatisch nach Depth Chart befüllbar.
- **Playbook**: Formationen, Routen aus dem Routenbaum oder frei gezeichnet, Defense-Konzepte (Cover 0, 1, 2, Tampa 2, 3, 4) richten sich automatisch aus. Die **Simulation** lässt die Routen gegen die Defense laufen und zeigt die Separation je Receiver über die Zeit. Ist ein Personnel hinterlegt, werden die gemessenen Speeds (Max V bzw. 40 yd) verwendet.

## Daten

Alles wird im `localStorage` des Browsers gespeichert. Über **⋯ Daten** gibt es Backup (JSON) herunterladen/laden, CSV-Export für Excel und Beispieldaten. Die Speicherlogik liegt gebündelt in `js/store.js` und lässt sich später gegen ein Backend (z. B. Supabase) tauschen, damit mehrere Coaches dieselben Daten sehen.

## Lokal starten

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

(ES-Module funktionieren nicht per Doppelklick auf `index.html`, es braucht einen kleinen Webserver.)

## Veröffentlichen

Der Workflow `.github/workflows/pages.yml` veröffentlicht die App bei jedem Push auf `main` über GitHub Pages. Einmalig in den Repo-Einstellungen unter **Settings → Pages → Source** „GitHub Actions“ wählen.

## Struktur

```
index.html
css/styles.css
js/app.js          Router, Datenmenü
js/store.js        Speicher (localStorage, Import/Export)
js/metrics.js      Messwert-Definitionen, Alter, Bestwerte
js/football.js     Personnel, Formationen, Routenbaum
js/defense.js      Defense-Konzepte, Ausrichtung, Zonen
js/sim.js          Simulation & Separation
js/demo.js         Beispieldaten
js/views/*.js      Seiten
```
