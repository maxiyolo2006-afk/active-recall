---
description: Verarbeitet neue Unterlagen in ALLEN Fach-Ordnern und lädt die Karten hoch (für die Automatik)
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(python tools/karten.py:*), Bash(git status:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git pull:*), Bash(git log:*), Bash(git diff:*)
---

Du bist die Karten-Automatik. Arbeite ohne Rückfragen – es sitzt niemand davor.
Halte dich strikt an `CLAUDE.md` (vor allem: bestehende Karten nie ändern).

## Ablauf

1. **Stand holen:** `git pull --ff-only` (Fehler hier → abbrechen und melden, nichts ändern).

2. **Was ist neu?** `python tools/karten.py faecher`
   - Steht dort „Nichts Neues.“ → mit einem Satz melden und **sofort aufhören**.
   - Jeder Unterordner von `materialien/` ist ein Fach. Das Kürzel in der ersten Spalte ist der Fachname
     (Deck: `decks/<kürzel>.json`, IDs: `<kürzel>-<thema>-<nnn>`).

3. **Snapshot:** `python tools/karten.py snapshot`

4. **Pro Fach mit neuen/geänderten Dateien** genau wie in `.claude/commands/karten.md`, Schritte 2 und 4–8:
   - `python tools/karten.py neu <kürzel>`
   - Deck lesen bzw. neu anlegen (`titel` = Fachname aus den Unterlagen, sonst der Ordnername)
   - jede Datei vollständig lesen, Karten nach den Regeln aus `CLAUDE.md` schreiben, nur **anhängen**
   - `python tools/karten.py erledigt <kürzel> <datei> …` nur für vollständig verarbeitete Dateien
   - **Höchstens 8 Dateien pro Lauf** insgesamt (älteste zuerst). Der Rest kommt beim nächsten Lauf dran.
   - Eine Datei, die sich nicht lesen lässt (beschädigt, Passwort, leer): **nicht** als erledigt markieren, im Bericht nennen.

5. **Prüfen:** `python tools/karten.py pruefen --gegen-snapshot`
   - Fehler → nur die neuen Karten korrigieren, erneut prüfen. Bleibt ein Fehler, den du nicht lösen kannst:
     **nicht committen**, `git status` im Bericht nennen und aufhören.

6. **Hochladen:**
   - `git add decks materialien/verarbeitet.json`
   - `git commit -m "Karten: <kürzel> +<n>, …"` (pro Fach die Anzahl neuer Karten)
   - `git push`
   - Nie andere Dateien committen (keine Unterlagen aus `materialien/`, keine App-Dateien).

7. **Bericht** (kurz, auf Deutsch): pro Fach neue Karten und verarbeitete Dateien, übersprungene/problematische Dateien,
   ob der Upload geklappt hat. Nach dem Push sind die Karten nach ca. 1 Minute auf dem Handy.
