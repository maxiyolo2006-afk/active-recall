# Active Recall – Regeln für Claude

Lern-App (PWA, reines HTML/CSS/JS, kein Build). Claude erzeugt aus den Unterlagen in `materialien/<fach>/`
Karteikarten in `decks/<fach>.json`. Der Nutzer lernt sie in der App. Der Lernfortschritt hängt **nur an der Karten-ID**.

## Oberste Regel: Bestehende Karten sind tabu

- Bestehende Karten **nie** ändern, löschen, umsortieren oder neu nummerieren – sonst geht Lernfortschritt verloren.
- Neue Karten nur **am Ende** von `karten` anhängen.
- IDs sind dauerhaft. Eine vergebene ID wird nie wiederverwendet.
- Ausnahme nur, wenn der Nutzer ausdrücklich eine bestimmte Karte korrigieren lässt: dann Inhalt ändern, **ID behalten**.
- Vor dem Bearbeiten `python tools/karten.py snapshot`, danach `python tools/karten.py pruefen --gegen-snapshot`.
  Meldet die Prüfung Fehler, wird korrigiert – nicht ignoriert.

## Kartenformat

`decks/<fach>.json`:

```json
{
  "fach": "tma",
  "titel": "Technische Mechanik A",
  "karten": [
    {
      "id": "tma-zugdruck-001",
      "frage": "Erkläre, wie die Normalspannung $\\sigma$ in einem Zugstab berechnet wird.",
      "antwort": "$$\\sigma = \\frac{F}{A}$$\nKraft $F$ senkrecht zur Querschnittsfläche $A$. Zug positiv, Druck negativ.",
      "typ": "definition",
      "kapitel": "3.1 Zug, Druck und Abscherung",
      "quelle": "3_1_Tutorium_TMA_Zug_Druck_Abscherung.pdf, S. 1",
      "tags": ["spannung", "zug"]
    }
  ]
}
```

| Feld | Regel |
|---|---|
| `id` | `<fach>-<thema>-<nnn>`, nur `a-z0-9-`, dreistellig fortlaufend je Thema. Nächste freie ID: `python tools/karten.py naechste-id <fach> <thema>` |
| `frage` / `antwort` | Text. Formeln in LaTeX: `$…$` inline, `$$…$$` abgesetzt. **In JSON jeden Backslash doppeln** (`\\frac`, `\\text`) – sonst wird `\t`/`\f`/`\n` zum Steuerzeichen. Wort-Indizes aufrecht: `\\sigma_{\\text{zul}}`, `A_{\\text{erf}}`. Einheiten mit `\\,\\text{N/mm}^2`. `**fett**`, Zeilenumbruch `\n`, Aufzählung mit `- ` am Zeilenanfang |
| `typ` | `definition` (Begriff/Formel) · `verstaendnis` (Warum/Wie/Was passiert, wenn) · `rechnung` (Aufgabe mit Lösungsweg) · `vergleich` (A vs. B) |
| `kapitel` | So wie in den Unterlagen benannt, mit Nummer, z. B. `"3.1 Zug, Druck und Abscherung"`. Innerhalb eines Fachs einheitlich schreiben (wird zum Filter) |
| `quelle` | **Immer.** `"<Dateiname>, S. <n>"` bzw. `"Folie <n>"`, bei Übungen zusätzlich `"Aufgabe <n>"`. Der Dateiname muss am Anfang stehen (wird für `verarbeitet.json` ausgewertet) |
| `tags` | 1–4 kurze Schlagwörter, kleingeschrieben, ohne Leerzeichen (`flaechenpressung`, `niet`) |
| `formel` | **Pflicht bei `typ: "rechnung"`**, sonst weglassen. Formelhilfe, die die App hinter dem Kasten „Formel anzeigen“ zeigt: nur die **allgemeinen** Formeln/Ansätze, die man für die Aufgabe braucht – **keine Zahlenwerte, keine Zwischen- oder Endergebnisse**. 1–3 Zeilen, gleiche LaTeX-Regeln wie `antwort`, `$$…$$` vermeiden. Steht direkt nach `antwort`. Darf bei bestehenden Rechenkarten nachgetragen werden (einzige erlaubte Änderung an alten Karten) |

`decks/index.json` nie von Hand bearbeiten – erzeugt `python tools/karten.py pruefen`.

## Wie gute Karten aussehen

1. **Atomar:** eine Information pro Karte. Lieber drei kleine Karten als eine große. Listen mit mehr als 3–4 Punkten aufteilen.
2. **Zum Erklären zwingen:** „Erkläre …“, „Warum …“, „Wie hängt … mit … zusammen?“, „Was passiert, wenn …?“, „Leite … her“.
   Keine Ja/Nein-Fragen. Statt „Ist der Pfeiler ausreichend dimensioniert?“ → „Berechne die Druckspannung im Pfeiler und beurteile …“.
3. **Rechenthemen:** konkrete Aufgaben mit Zahlenwerten und Einheiten, Antwort mit **Lösungsweg** in nummerierten Schritten
   (gegeben → Ansatz → Rechnung → Ergebnis mit Einheit). Zahlenwerte selbst nachrechnen. Weicht das eigene Ergebnis
   von der Lösung in den Unterlagen ab, beide angeben.
4. **Antworten kurz und präzise:** Kernaussage zuerst, maximal ca. 4 Zeilen (Rechenwege dürfen länger sein). Keine Einleitungsfloskeln.
5. **Eindeutig:** Die Frage muss ohne die Unterlagen verständlich sein. Nötige Größen/Bedingungen in die Frage schreiben.
   Bezieht sich etwas auf eine Abbildung, die Situation in Worten beschreiben.
6. **Sprache = Sprache der Unterlagen.** Notation und Formelzeichen exakt wie in den Unterlagen (Indizes, Vorzeichenkonventionen).
7. **Nur was in den Unterlagen steht.** Kein Zusatzwissen als Fakt einbauen. Wenn eine Erklärung nötig ist, die nicht in der Quelle
   steht, kurz und allgemein bekannt halten.
8. **Mischung:** pro Thema Definitionen *und* Verständnisfragen *und* (wo es Rechnungen gibt) Rechenaufgaben.
9. **Keine Dubletten:** vor dem Anlegen prüfen, ob es zu der Information schon eine Karte gibt (auch aus anderen Dateien).

## Fachspezifisches

- **tma** (Technische Mechanik A, HSBI, Prof. Kaimann / Tutorium Dr. Wolf-Homeyer): Kaimann-Notation verwenden – Schnittgrößen
  $N$, $Q$, $M_b$; Indizes „vorh“, „zul“, „erf“ ($A_{\text{erf}}$, $\sigma_{\text{zul}}$); Gleichgewicht „→:“, „↑:“, „↺A:“;
  Zug positiv, Druck negativ. Nietverbindungen: $\tau_a = \frac{F}{n \cdot m \cdot A}$ mit $n$ Nietzahl, $m$ Schnittzahl.

## Fächer und verarbeitete Unterlagen

Jeder Unterordner von `materialien/` ist ein Fach. Der Nutzer benennt die Ordner frei („ET2“, „Technische Mechanik B“);
`tools/karten.py` leitet daraus das Kürzel ab (`et2`, `technische-mechanik-b`) = Deck-Dateiname und ID-Anfang.
`python tools/karten.py faecher` zeigt alle Fächer und was neu ist.

`materialien/verarbeitet.json` merkt sich pro Datei Prüfsumme, Datum und erzeugte Karten-IDs.
Nicht von Hand pflegen – `python tools/karten.py erledigt <fach> <datei>` benutzen. Geänderte Dateien (neue Prüfsumme)
werden erneut angeboten. Dann nur Karten für **neue** Inhalte anhängen.

Abläufe: `/karten <fach>` (ein Fach, von Hand) in `.claude/commands/karten.md`;
`/karten-alle` (alle Fächer + `git push`, läuft automatisch alle 3 Stunden als geplante Aufgabe) in `.claude/commands/karten-alle.md`.
Die App ist über GitHub Pages veröffentlicht; ein Push auf `main` aktualisiert sie nach ca. 1 Minute.

## Code der App

- `index.html`, `css/style.css`, `js/*.js` (klassische Skripte, keine ES-Module, kein Build), `sw.js`, `manifest.json`
- `js/fsrs.js` FSRS-5-Scheduler · `js/db.js` IndexedDB · `js/learn.js` Lernsitzung · `js/ink.js` Zeichenfläche (Apple Pencil) · `js/stats.js` Statistik · `js/app.js` Rest
- KaTeX liegt lokal in `vendor/katex/` (offline). Keine CDNs einbauen.
- Neue Dateien, die offline verfügbar sein sollen, in `SHELL` in `sw.js` eintragen. Nach Änderungen an `sw.js` `CACHE` hochzählen.
- `materialien/` wird nicht veröffentlicht (`.gitignore`), außer `verarbeitet.json`.
