# Active Recall – Karteikarten mit Spaced Repetition

Lern-App fürs Studium: Unterlagen in einen Fach-Ordner legen, Claude macht daraus automatisch Karteikarten,
du lernst sie am Handy und am Laptop. Frage lesen → Antwort aus dem Kopf aufschreiben → aufdecken → selbst bewerten.
Wann eine Karte wiederkommt, berechnet **FSRS-5**. Läuft offline und lässt sich auf dem Handy installieren.

**App:** https://maxiyolo2006-afk.github.io/active-recall/

## 1. Auf dem Handy installieren (einmalig)

Die Adresse oben auf dem Handy öffnen und:
- **iPhone (Safari):** Teilen-Symbol → „Zum Home-Bildschirm“
- **Android (Chrome):** Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“

Neue Karten holt sich die App beim Öffnen mit Internet selbst, danach geht alles auch offline.

## 2. Neue Unterlagen → Karten (automatisch)

1. In `materialien/` pro Fach einen Unterordner anlegen – Name frei wählbar, z. B. `ET2` oder `Technische Mechanik B`.
2. Unterlagen hineinlegen: PDF (Folien, Skripte, Scans), Fotos, `.docx`, `.txt`/`.md`. PowerPoint bitte als PDF speichern.
   Geht auch vom Handy aus über die OneDrive-App, der Ordner liegt in OneDrive.
3. Fertig. Die geplante Aufgabe **„Karten-Automatik“** in der Claude-App schaut **alle 3 Stunden (7–22 Uhr)** nach,
   erstellt Karten für neue oder geänderte Dateien (max. 8 pro Lauf) und lädt sie hoch. Etwa 1 Minute später sind sie in der App.

- Sofort statt warten: Claude-App → Seitenleiste **„Geplant“** → Karten-Automatik → **„Jetzt ausführen“**.
- Die Automatik läuft nur, solange die Claude-App auf dem Laptop offen ist; verpasste Läufe holt sie beim nächsten Start nach.
- Fragt ein Lauf nach einer Erlaubnis, einmal zustimmen – sie gilt dann für alle weiteren Läufe.
- Von Hand für ein Fach: Claude Code in diesem Ordner starten, `/karten ET2` eingeben (lädt nicht hoch),
  oder `/karten-alle` (alle Fächer + Upload).

Claude verarbeitet nur Dateien, die neu sind oder sich geändert haben (Liste: `materialien/verarbeitet.json`).
Neue Karten werden nur angehängt; ein Prüfskript verhindert, dass bestehende Karten verändert werden.
Die Regeln für gute Karten stehen in [CLAUDE.md](CLAUDE.md).

> **Öffentlich:** Das Repo (github.com/maxiyolo2006-afk/active-recall) ist öffentlich, die Karten sind für jeden mit dem Link lesbar.
> Die Unterlagen selbst (`materialien/<Fach>/`) werden über `.gitignore` **nicht** hochgeladen.

## 3. Lokal am Laptop starten (optional)

Die Online-Adresse funktioniert auch am Laptop. Lokal (z. B. zum Testen) im Projektordner:

```bash
python -m http.server 8000 --bind 127.0.0.1
```

Dann **http://localhost:8000** öffnen. Den Befehl **im Projektordner** starten, nicht im Benutzerordner –
`http.server` liefert immer den Ordner aus, in dem er gestartet wird.

## 4. Fortschritt zwischen Laptop und Handy

Der Lernstand liegt lokal im Browser (IndexedDB), jedes Gerät hat seinen eigenen.
Zum Übertragen: **Einstellungen → Exportieren** auf dem einen Gerät, **Importieren** auf dem anderen
(auf dem Handy geht auch „Teilen …“, z. B. per Mail oder Cloud).
Beim Import wird **zusammengeführt**: Pro Karte gewinnt der neuere Stand, keine Bewertung geht verloren.

> **iPhone:** Safari löscht Daten von Websites, die 7 Tage nicht benutzt wurden. Als App auf dem Home-Bildschirm
> passiert das nicht. Trotzdem ab und zu exportieren.

## Bedienung

| Taste | Aktion |
|---|---|
| `Leertaste` | Antwort aufdecken |
| `Strg` + `Enter` | Aufdecken, während du im Textfeld schreibst |
| `Esc` | Textfeld verlassen (danach wieder Leertaste) |
| `1` `2` `3` `4` | Nochmal / Schwer / Gut / Einfach |
| `F` | Formel ein-/ausblenden (Rechenaufgaben) |
| `U` oder `Strg` + `Z` | Letzte Bewertung rückgängig (`Strg` + `Z` beim Zeichnen: letzter Strich) |

- **Lernen:** fällige Karten plus neue Karten bis zum Tageslimit (Standard 20 pro Fach, in den Einstellungen änderbar).
  Unter den Bewertungs-Buttons steht, wann die Karte wiederkommt.
- **Alle Fächer gemischt:** Kachel oben auf der Startseite. Alle Fächer in einer Sitzung, abwechselnd gemischt.
  Technische Mechanik A ist standardmäßig abgewählt; welche Fächer mitmachen, stellst du in der Kachel ein.
  Dort wählst du auch die **Kartentypen** (z. B. nur Rechenaufgaben, nur Definitionen oder beides).
- **Filter:** in der Fach-Ansicht nach Kartentyp, Kapitel und Tags. Gilt für Lernen und Klausurmodus.
- **Zeichnen (Apple Pencil):** Bei Rechenaufgaben ist die Antwort eine Karo-Zeichenfläche. Stift-Druck ändert die
  Strichstärke, die Fläche wächst nach unten mit. Sobald einmal der Stift benutzt wurde, zeichnen Finger und Handballen
  nicht mehr, sondern scrollen. Radierer, Strich zurück, Leeren. Über „Tippen“ kannst du auf das Textfeld umschalten
  (wird für Rechenaufgaben gemerkt). Nach dem Aufdecken steht deine Zeichnung über der Musterlösung.
- **Formel anzeigen:** Bei jeder Rechenaufgabe gibt es den Kasten „Formel anzeigen“. Er ist bei jeder neuen Aufgabe
  wieder aus und zeigt nur die allgemeinen Formeln, nicht die Lösung.
- **Klausurmodus:** alle (gefilterten) Karten eines Fachs gemischt, ohne Pausen. „Nochmal“ kommt am Ende der Runde wieder.
  Der Wiederholungsplan wird dabei **nicht** verändert.
- **Statistik:** Lernserie, Karten pro Tag (30 Tage), Trefferquote, Kartenreife, die 10 schwierigsten Karten.
- Ein Lerntag beginnt um 04:00 Uhr. Wer nach Mitternacht lernt, zählt noch zum Vortag.

## So wird geplant (FSRS-5)

Jede Karte hat eine **Stabilität** S (nach wie vielen Tagen du sie mit 90 % Wahrscheinlichkeit noch weißt)
und eine **Schwierigkeit** D (1–10). Nach jeder Bewertung werden S und D neu berechnet. Die Karte kommt wieder, wenn die
Abrufwahrscheinlichkeit auf die Ziel-Trefferquote (Standard 90 %) gefallen ist.
Neue oder vergessene Karten durchlaufen erst kurze Lernschritte (1 und 10 Minuten) in derselben Sitzung.
Parameter: offizielle FSRS-5-Standardwerte (`js/fsrs.js`).

## Ordnerstruktur

```
index.html, css/, js/          App (reines HTML/CSS/JS, kein Build)
sw.js, manifest.json, icons/   PWA: Offline-Cache, Installation
vendor/katex/                  Formelsatz (lokal, damit offline)
decks/<fach>.json              Karten pro Fach
decks/index.json               Liste der Decks (automatisch erzeugt)
materialien/<Fach>/            deine Unterlagen, ein Ordner pro Fach (nicht im Git)
materialien/verarbeitet.json   welche Unterlagen schon verarbeitet sind
tools/karten.py                Prüf- und Hilfsskript für die Karten
CLAUDE.md                      Regeln für die Kartenerstellung
.claude/commands/karten.md     /karten <Fach> – ein Fach von Hand
.claude/commands/karten-alle.md  /karten-alle – alle Fächer + Upload (macht die Automatik)
```

## Probleme?

| Symptom | Ursache | Lösung |
|---|---|---|
| Neue Unterlagen werden nicht verarbeitet | Claude-App war zu, oder ein Lauf wartet auf eine Erlaubnis | Seitenleiste „Geplant“ → Karten-Automatik: letzten Lauf öffnen, ggf. zustimmen oder „Jetzt ausführen“ |
| Neue Karten fehlen auf dem Handy | Lauf noch nicht gelaufen / Seite noch alt | App mit Internet öffnen und kurz warten bzw. neu öffnen |
| Datei wird übersprungen | Format nicht lesbar (z. B. `.pptx`, passwortgeschützt) | Als PDF speichern und neu ablegen |
| „Decks konnten nicht geladen werden“ (lokal) | `index.html` per Doppelklick geöffnet | Über `python -m http.server` starten (Schritt 3) |
| Statt der App eine Dateiliste (lokal) | Server im falschen Ordner gestartet | Im Projektordner starten |
| „Address already in use“ | Port 8000 belegt | Anderen Port nehmen: `python -m http.server 8765 --bind 127.0.0.1` |
| Formel rot oder als Rohtext | LaTeX-Fehler oder einfacher Backslash im JSON | `python tools/karten.py pruefen` zeigt die Karte |
| Fortschritt auf dem Handy weg | Browser hat Website-Daten gelöscht | Als App installieren, regelmäßig exportieren |
| GitHub-Pages-Adresse zeigt 404 | Pages noch nicht aktiv oder falscher Branch | Settings → Pages prüfen, 1–2 Minuten warten |
| `git` meldet gesperrte Dateien | OneDrive synchronisiert gerade | Kurz warten oder OneDrive-Sync pausieren |

## Hilfsskript

```bash
python tools/karten.py pruefen
```

Weitere Befehle: `faecher`, `neu <fach>`, `snapshot`, `naechste-id <fach> <thema>`, `pruefen --gegen-snapshot`, `erledigt <fach> <datei>`, `text <datei>`
(Details: `python tools/karten.py -h`).
