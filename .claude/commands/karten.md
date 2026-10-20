---
description: Erzeugt Karteikarten aus neuen Unterlagen in materialien/<fach>/
argument-hint: <fach>
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(python tools/karten.py:*)
---

Erzeuge Karteikarten für das Fach **$ARGUMENTS** und halte dich strikt an die Regeln in `CLAUDE.md`.

## Ablauf

1. **Fach klären.** Ist `$ARGUMENTS` leer, führe `python tools/karten.py faecher` aus und frage, welches Fach gemeint ist.
   `$ARGUMENTS` darf der Ordnername sein („ET2“, „Technische Mechanik B“). Das Skript leitet daraus das Kürzel ab
   (`et2`, `technische-mechanik-b`); dieses Kürzel ist der Name der Deck-Datei und der Anfang jeder Karten-ID.

2. **Neue Unterlagen finden:** `python tools/karten.py neu "$ARGUMENTS"` (Anführungszeichen wegen Leerzeichen im Ordnernamen)
   Gibt es nichts Neues oder Geändertes: kurz melden und aufhören.

3. **Snapshot:** `python tools/karten.py snapshot`

4. **Bestehendes Deck lesen:** `decks/<kürzel>.json`. Falls es fehlt, neu anlegen mit
   `{"fach": "<kürzel>", "titel": "<voller Fachname aus den Unterlagen, sonst Ordnername>", "karten": []}`.
   Merke dir, welche Inhalte schon Karten haben (keine Dubletten) und welche Themen-Kürzel in den IDs schon benutzt werden.

5. **Jede neue/geänderte Datei vollständig lesen.**
   - PDF: mit dem Read-Tool, bei mehr als 20 Seiten in Abschnitten (`pages: "1-20"`, `"21-40"`, …). Gescannte Seiten
     ohne Textebene werden als Bild angezeigt – genauso auswerten (Handschrift, Skizzen).
   - Bilder (`.png`, `.jpg`): mit dem Read-Tool ansehen.
   - `.docx`: `python tools/karten.py text "<pfad>"` (Text und Tabellen)
   - `.md`, `.txt`, `.tex`: direkt lesen.
   - `.pptx`/`.doc`/andere: nicht lesbar → nicht als erledigt markieren, im Bericht nennen (Tipp: als PDF speichern).
   - Notiere pro Seite/Folie die prüfungsrelevanten Informationen: Definitionen, Formeln, Zusammenhänge, Rechenverfahren, Aufgaben mit Lösungen.
   - Bei einer **geänderten** Datei: die schon vorhandenen Karten mit dieser Quelle ansehen und nur für **neue** Inhalte Karten erzeugen.

6. **Karten schreiben** (Regeln aus `CLAUDE.md`, Abschnitt „Wie gute Karten aussehen“):
   - atomar, Fragen zum Erklären, Rechenaufgaben mit Lösungsweg, kurze Antworten, Quelle mit Seite/Folie, Sprache der Unterlagen
   - jede Rechenaufgabe (`typ: "rechnung"`) bekommt ein Feld `formel` mit den allgemeinen Formeln ohne Zahlen und ohne Ergebnis
   - IDs mit `python tools/karten.py naechste-id <kürzel> <thema>` holen und danach fortlaufend weiterzählen
   - Karten **nur ans Ende** von `karten` anhängen. Bestehende Karten nicht anfassen.
   - Rechenergebnisse selbst nachrechnen (z. B. mit `python -c`).

7. **Prüfen:** `python tools/karten.py pruefen --gegen-snapshot`
   - Fehler → nur die **neuen** Karten korrigieren und erneut prüfen, bis es durchläuft.
   - Warnungen (Ja/Nein-Frage, offenes `$`, Rechenkarte ohne `formel`) ansehen und, wenn berechtigt, die neue Karte verbessern.

8. **Als verarbeitet eintragen:** `python tools/karten.py erledigt <kürzel> <datei1> <datei2> …`
   (nur Dateien, die wirklich vollständig verarbeitet wurden)

9. **Bericht** (kurz):
   - pro Datei: Anzahl neuer Karten und Kapitel
   - Gesamtzahl im Deck, Verteilung nach `typ`
   - was bewusst ausgelassen wurde oder unklar war (z. B. unleserliche Seiten)
   - Hinweis: App neu laden. Fürs Handy hochladen: `git add decks materialien/verarbeitet.json`, committen, `git push`
     (oder einfach auf die Automatik warten – `/karten-alle` macht das alle 3 Stunden selbst)
