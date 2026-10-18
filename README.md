# Active Recall – Karteikarten mit Spaced Repetition

Lern-App fürs Studium: Unterlagen in `materialien/<fach>/` ablegen, Claude Code macht daraus Karteikarten,
du lernst sie am Laptop und am Handy. Frage lesen → Antwort aus dem Kopf aufschreiben → aufdecken → selbst bewerten.
Wann eine Karte wiederkommt, berechnet **FSRS-5**. Läuft offline und lässt sich auf dem Handy installieren.

## 1. Lokal starten

Im Projektordner ein Terminal öffnen und:

```bash
python -m http.server 8000 --bind 127.0.0.1
```

Dann im Browser **http://localhost:8000** öffnen.

> `http.server` liefert immer den Ordner aus, in dem du den Befehl startest. Also **im Projektordner** starten,
> nicht im Benutzerordner. `--bind 127.0.0.1` sorgt dafür, dass nur dein Laptop zugreifen kann.
> `index.html` per Doppelklick zu öffnen funktioniert nicht (der Browser blockiert dann das Laden der Decks).

## 2. Karten erzeugen

1. Unterlagen (PDF, Bilder, `.docx`, `.md`) nach `materialien/<fach>/` legen, z. B. `materialien/et2/`.
   Fachname: Kleinbuchstaben, Ziffern, Bindestrich.
2. Claude Code **in diesem Ordner** starten und eingeben: `/karten et2`
3. App neu laden.

Claude verarbeitet nur Dateien, die neu sind oder sich geändert haben (Liste: `materialien/verarbeitet.json`).
Neue Karten werden nur angehängt; ein Prüfskript verhindert, dass bestehende Karten verändert werden.
Die Regeln für gute Karten stehen in [CLAUDE.md](CLAUDE.md).

## 3. Aufs Handy bringen (GitHub Pages)

**Einmalig:**

1. Auf github.com ein neues Repository anlegen, z. B. `active-recall`, Sichtbarkeit **Public**
   (GitHub Pages ist im kostenlosen Tarif nur für öffentliche Repos verfügbar).
2. Im Projektordner:

   ```bash
   git init -b main
   ```
   ```bash
   git add .
   ```
   ```bash
   git commit -m "Active Recall"
   ```
   ```bash
   git remote add origin https://github.com/DEIN-NAME/active-recall.git
   ```
   ```bash
   git push -u origin main
   ```
3. Im Repo: **Settings → Pages → Source: „Deploy from a branch“ → Branch `main`, Ordner `/ (root)` → Save.**
   Nach ca. 1 Minute läuft die App unter `https://DEIN-NAME.github.io/active-recall/`.
4. Die Adresse auf dem Handy öffnen und installieren:
   - **iPhone (Safari):** Teilen-Symbol → „Zum Home-Bildschirm“
   - **Android (Chrome):** Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“

**Nach jedem `/karten`:**

```bash
git add decks materialien/verarbeitet.json
```
```bash
git commit -m "Neue Karten"
```
```bash
git push
```

Beim nächsten Öffnen mit Internet holt sich die App die neuen Karten automatisch, danach geht es auch offline.

> **Öffentlich:** Bei einem Public-Repo sind deine Decks für jeden mit dem Link lesbar.
> Die Unterlagen selbst (`materialien/`) werden über `.gitignore` **nicht** hochgeladen.

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
| `U` oder `Strg` + `Z` | Letzte Bewertung rückgängig |

- **Lernen:** fällige Karten plus neue Karten bis zum Tageslimit (Standard 20 pro Fach, in den Einstellungen änderbar).
  Unter den Bewertungs-Buttons steht, wann die Karte wiederkommt.
- **Filter:** in der Fach-Ansicht nach Kapitel und Tags. Gilt für Lernen und Klausurmodus.
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
materialien/<fach>/            deine Unterlagen (nicht im Git)
materialien/verarbeitet.json   welche Unterlagen schon verarbeitet sind
tools/karten.py                Prüf- und Hilfsskript für die Karten
CLAUDE.md                      Regeln für die Kartenerstellung
.claude/commands/karten.md     der Befehl /karten
```

## Probleme?

| Symptom | Ursache | Lösung |
|---|---|---|
| „Decks konnten nicht geladen werden“ | `index.html` per Doppelklick geöffnet | Über `python -m http.server` starten (Schritt 1) |
| Statt der App eine Dateiliste | Server im falschen Ordner gestartet | Im Projektordner starten |
| „Address already in use“ | Port 8000 belegt | Anderen Port nehmen: `python -m http.server 8765 --bind 127.0.0.1` |
| Neue Karten fehlen in der App | `index.json` nicht aktualisiert oder Seite noch alt | `python tools/karten.py pruefen`, Seite online neu laden |
| Neue Karten fehlen auf dem Handy | nicht gepusht | `git push`, App mit Internet öffnen |
| Formel rot oder als Rohtext | LaTeX-Fehler oder einfacher Backslash im JSON | `python tools/karten.py pruefen` zeigt die Karte |
| Fortschritt auf dem Handy weg | Browser hat Website-Daten gelöscht | Als App installieren, regelmäßig exportieren |
| GitHub-Pages-Adresse zeigt 404 | Pages noch nicht aktiv oder falscher Branch | Settings → Pages prüfen, 1–2 Minuten warten |
| `git` meldet gesperrte Dateien | OneDrive synchronisiert gerade | Kurz warten oder OneDrive-Sync pausieren |

## Hilfsskript

```bash
python tools/karten.py pruefen
```

Weitere Befehle: `neu <fach>`, `snapshot`, `naechste-id <fach> <thema>`, `pruefen --gegen-snapshot`, `erledigt <fach> <datei>`
(Details: `python tools/karten.py -h`).
