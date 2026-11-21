# Huskies – Athletik, Roster & Playbook

Webapp für Combine-Messungen, Kaderplanung und Spielzüge. Läuft komplett im Browser – kein Server, kein Build-Schritt.

## Funktionen

- **Team-Auswahl**: Beim Start wählt man einmal das Team (z. B. U15, U19, Herren). Die Wahl bleibt auf dem Gerät gespeichert und gilt für alle Bereiche; gewechselt wird über den blauen Team-Button oben. Athlet:innen lassen sich im Bearbeiten-Dialog einem anderen Team zuordnen.
- **Athleten**: Stammdaten (Name, Geburtsdatum bzw. Alter, Position) und Messverlauf für Gewicht, 40 Yard Dash, Shuffle, L-Cone rechts/links, Broad Jump, Vertical Jump und Max. Geschwindigkeit, Bench Press (Wiederholungen mit 100 kg). Sortierbare Tabelle mit Aktuell-/Bestwert-Ansicht, Einfärbung nach Vierteln, Verlauf je Messwert, Plausibilitätswarnungen.
- **Combine erfassen** (Button auf der Athleten-Seite): Schnellerfassung am Platz – *Station* (ein Test, alle Spieler, Enter = nächster) oder *Tabelle* (alle Tests). Jeder Wert wird sofort gespeichert.
- **Roster**: wird automatisch aus allen Athlet:innen des gewählten Teams gebildet. Die *Aufstellung* zeigt eine Basis-Offense (11 Personnel) und -Defense (4-3); unter jeder Position stehen die Spieler als Depth Chart und lassen sich per Drag & Drop umsortieren oder auf eine andere Position ziehen (auch per Touch). Neue Spieler werden nach Position und 40-yd-Zeit automatisch einsortiert. Dazu Kaderliste mit Trikotnummern und Durchschnittswerte je Position, druckbar.
- **Personnel**: Offense- (10/11/12/21/22) und Defense-Gruppen (4-3, Nickel, Dime) mit konkreten Spielern, automatisch nach dem Depth Chart des Rosters befüllbar.
- **Playbook** – getrennt nach **Offense** und **Defense**. Defense-Spielzüge: Coverage wählen, einzelne Verteidiger auf Blitz/Mann/Zone umstellen und gegen typische Offense-Konzepte (Smash, Four Verts, Mesh, Flood, Curl/Flat, Slants, Stick, Dagger) testen – die Tabelle zeigt dann, wie offen die Receiver werden (grün = gedeckt). Offense: oben das Personnel (Empty/00, 10, 11, 12, 21, 22) wählen, darunter alle Spielzüge dieses Personnels alphabetisch – so stehen Calls mit gleicher Formation beieinander. Beim Formationswechsel laufen dieselben Rollen dieselben Routen weiter. Die Defense lässt sich per Klick ein- und ausblenden. Formationen, Routen aus dem Routenbaum oder frei gezeichnet, Defense-Konzepte (Cover 0, 1, 2, Tampa 2, 3, 4) richten sich automatisch aus. Die **Simulation** lässt die Routen gegen die Defense laufen und zeigt die Separation je Receiver über die Zeit. Ist ein Personnel hinterlegt, werden die gemessenen Speeds (Max V bzw. 40 yd) verwendet.

## Daten & Synchronisierung (Huskies Data)

Alle Coaches arbeiten auf denselben Daten im privaten Repo **`huskies-data`** – nach demselben Prinzip wie Cast Comercial:

1. **Admin, einmalig:** einen [Fine-grained Token](https://github.com/settings/personal-access-tokens/new) erstellen, der **nur** `lucashcandido/huskies-data` erreicht (Repository permissions → *Contents: Read and write*). In der App „Admin: einmalig mit GitHub-Token einrichten“ wählen.
2. Die App erstellt einen **12-stelligen Zugangscode** und verschlüsselt `{repo, token}` damit (PBKDF2 600 000 Runden + AES-GCM) zu `access.json`. Weil der Token absichtlich nicht ins App-Repo schreiben darf, zeigt die App den Inhalt an → als `access.json` ins Root dieses Repos legen (Link in der App).
3. **Coaches:** App öffnen, Namen und Code eingeben – oder einfach den Link `…/#c=CODE` öffnen.

Abgleich: Änderungen werden nach 1,5 s hochgeladen, alle 45 s und beim Zurückkehren in die App wird geladen. Pro Feld gewinnt die neuere Änderung, Messungen werden pro Messtag zusammengeführt – zwei Coaches an verschiedenen Stationen überschreiben sich nicht. Offline erfasste Werte werden nachgereicht. Jeder Commit trägt den Namen des Coaches; über den Git-Verlauf lässt sich jeder Stand wiederherstellen. Läuft der Token ab, genügt es, mit dem neuen Token einen Code neu zu erzeugen und `access.json` zu ersetzen – Geräte mit dem alten Code verbinden sich nur neu, wenn derselbe Code weiterverwendet wird.

Über **⋯ Daten** gibt es zusätzlich Backup (JSON), CSV-Export für Excel sowie fiktive Beispieldaten für das aktuelle Team. Beispieldaten sind mit `demo: true` markiert und lassen sich dort mit „Alle Beispieldaten entfernen“ restlos löschen – echte Einträge bleiben erhalten. Ohne Verbindung („nur auf diesem Gerät“) bleibt alles im `localStorage`.

## Lokal starten

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

(ES-Module funktionieren nicht per Doppelklick auf `index.html`, es braucht einen kleinen Webserver.)

## Veröffentlichen

Die App läuft über GitHub Pages (Deploy from branch `main`): https://lucashcandido.github.io/huskies/ – jeder Push auf `main` wird automatisch veröffentlicht.

## Struktur

```
index.html
css/styles.css
js/app.js          Router, Datenmenü
js/store.js        Speicher, Zeitstempel je Feld, Zusammenführen
js/sync.js         Zugangscode, GitHub-Abgleich mit huskies-data
js/metrics.js      Messwert-Definitionen, Alter, Bestwerte
js/football.js     Personnel, Formationen, Routenbaum
js/defense.js      Defense-Konzepte, Ausrichtung, Zonen
js/sim.js          Simulation & Separation
js/demo.js         Beispieldaten
js/views/*.js      Seiten
```

## Neue Version veröffentlichen

Vor jedem Commit `node tools/stamp-version.mjs` ausführen. Das hängt an alle Skript- und Stylesheet-Verweise eine neue Versionsnummer an, sodass Browser nach dem Neuladen sofort die neue Version laden statt bis zu 10 Minuten eine zwischengespeicherte.
