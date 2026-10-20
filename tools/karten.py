#!/usr/bin/env python3
"""
Hilfsskript für die Karten-Pipeline (wird von /karten benutzt, geht aber auch von Hand).

  python tools/karten.py faecher                    alle Fach-Ordner mit Anzahl neuer/geänderter Unterlagen
  python tools/karten.py neu <fach>                 neue/geänderte Unterlagen in materialien/<fach>/ auflisten
  python tools/karten.py snapshot                   Stand aller Decks vor dem Bearbeiten sichern
  python tools/karten.py naechste-id <fach> <thema>  nächste freie ID, z. B. tma-zugdruck-013
  python tools/karten.py pruefen [--gegen-snapshot] Decks prüfen und decks/index.json neu erzeugen
  python tools/karten.py erledigt <fach> <datei>... Unterlagen als verarbeitet eintragen
  python tools/karten.py text <datei>               Text aus .docx/.txt/.md ausgeben

<fach> darf auch der Ordnername sein ("ET2", "Technische Mechanik B") – daraus wird das Kürzel
abgeleitet (et2, technische-mechanik-b). Deck-Datei: decks/<kürzel>.json.

Exit-Code 1 bei Fehlern – dann NICHTS committen, sondern korrigieren.
"""
import argparse
import hashlib
import json
import re
import shutil
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DECKS = ROOT / "decks"
MAT = ROOT / "materialien"
LOG = MAT / "verarbeitet.json"
SNAP = ROOT / ".snapshot"

TYPEN = {"definition", "verstaendnis", "rechnung", "vergleich"}
FELDER = ["id", "frage", "antwort", "typ", "kapitel", "quelle", "tags"]
OPTIONAL = ["formel"]  # Formelhilfe bei Rechenkarten (darf bei bestehenden Karten nachgetragen werden)
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*-\d{3,}$")
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
JA_NEIN = re.compile(r"^(ist|sind|gibt|kann|können|hat|haben|wird|werden|muss|müssen|darf|stimmt|trifft|is|are|does|do|can|will)\b", re.I)
STEUERZEICHEN = re.compile(r"[\x00-\x08\x0b-\x1f]")  # entsteht, wenn in JSON \t, \f, \b … nicht verdoppelt wurde
IGNORIEREN = {"verarbeitet.json", "desktop.ini", "thumbs.db", ".ds_store", "lies mich.txt"}
UMLAUTE = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"})

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def lade_json(pfad, standard=None):
    if not pfad.exists():
        return standard
    with open(pfad, encoding="utf-8") as f:
        return json.load(f)


def schreibe_json(pfad, daten):
    pfad.parent.mkdir(parents=True, exist_ok=True)
    with open(pfad, "w", encoding="utf-8", newline="\n") as f:
        json.dump(daten, f, ensure_ascii=False, indent=2)
        f.write("\n")


def sha256(pfad):
    h = hashlib.sha256()
    with open(pfad, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def deck_dateien():
    return sorted(p for p in DECKS.glob("*.json") if p.name != "index.json")


def kuerzel(name):
    """Ordnername → Fach-Kürzel: 'Technische Mechanik B' → 'technische-mechanik-b'."""
    s = name.strip().lower().translate(UMLAUTE)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def fach_ordner_alle():
    """Alle Unterordner von materialien/ als {kürzel: Pfad}."""
    out = {}
    if MAT.is_dir():
        for p in sorted(MAT.iterdir()):
            if p.is_dir() and not p.name.startswith((".", "_")):
                out.setdefault(kuerzel(p.name), p)
    return out


def fach_ordner(fach):
    return fach_ordner_alle().get(fach)


def offene_dateien(ordner):
    """Neue oder geänderte Dateien eines Fach-Ordners als [(status, pfad)]."""
    log = (lade_json(LOG, {"dateien": {}}) or {"dateien": {}})["dateien"]
    out = []
    for p in sorted(ordner.rglob("*")):
        if not p.is_file() or p.name.lower() in IGNORIEREN or p.name.startswith((".", "~$")):
            continue
        alt = log.get(p.relative_to(MAT).as_posix())
        if alt is None:
            out.append(("NEU", p))
        elif alt.get("sha256") != sha256(p):
            out.append(("GEÄNDERT", p))
    return out


# ---------------------------------------------------------------- faecher
def cmd_faecher(args):
    ordner = fach_ordner_alle()
    namen = {}
    if MAT.is_dir():
        for p in MAT.iterdir():
            if p.is_dir() and not p.name.startswith((".", "_")):
                namen.setdefault(kuerzel(p.name), []).append(p.name)
    for k, n in namen.items():
        if len(n) > 1:
            print(f"WARNUNG  Ordner {', '.join(n)} ergeben dasselbe Kürzel '{k}' – nur '{ordner[k].name}' wird benutzt.")
    if not ordner:
        print("Keine Fach-Ordner in materialien/.")
        return 0
    summe_faecher = summe_dateien = 0
    for k, p in ordner.items():
        offen = offene_dateien(p)
        deck = lade_json(DECKS / f"{k}.json")
        deck_info = f"{len(deck.get('karten', []))} Karten" if isinstance(deck, dict) else "noch kein Deck"
        neu = sum(1 for s, _ in offen if s == "NEU")
        geaendert = len(offen) - neu
        print(f"{k:24} Ordner \"{p.name}\": {neu} neu, {geaendert} geändert · {deck_info}")
        if offen:
            summe_faecher += 1
            summe_dateien += len(offen)
    print(f"\nZu verarbeiten: {summe_dateien} Datei(en) in {summe_faecher} Fach/Fächern." if summe_dateien else "\nNichts Neues.")
    return 0


# ---------------------------------------------------------------- neu
def cmd_neu(args):
    ordner = fach_ordner(args.fach)
    if ordner is None:
        print(f"Kein Ordner für Fach '{args.fach}' in materialien/ gefunden.")
        return 1
    offen = offene_dateien(ordner)
    for status, p in offen:
        print(f"{status:9} {p.relative_to(MAT).as_posix()}")
    if not offen:
        print(f"Keine neuen oder geänderten Unterlagen in materialien/{ordner.name}/.")
    return 0


# ---------------------------------------------------------------- snapshot
def cmd_snapshot(args):
    # Ordner nicht löschen, nur leeren (OneDrive sperrt das Löschen von Ordnern gern)
    SNAP.mkdir(exist_ok=True)
    for alt in SNAP.glob("*.json"):
        alt.unlink()
    n = 0
    for p in deck_dateien():
        shutil.copy2(p, SNAP / p.name)
        n += 1
    print(f"Snapshot von {n} Deck(s) in {SNAP.name}/ gespeichert.")
    return 0


# ---------------------------------------------------------------- naechste-id
def cmd_naechste_id(args):
    if not SLUG_RE.match(args.thema):
        print("Thema-Kürzel nur aus a-z, 0-9 und Bindestrich, z. B. 'zugdruck'.")
        return 1
    prefix = f"{args.fach}-{args.thema}-"
    nummern = [0]
    for p in deck_dateien():
        for k in (lade_json(p, {}) or {}).get("karten", []):
            kid = str(k.get("id", ""))
            if kid.startswith(prefix) and kid[len(prefix):].isdigit():
                nummern.append(int(kid[len(prefix):]))
    print(f"{prefix}{max(nummern) + 1:03d}")
    return 0


# ---------------------------------------------------------------- pruefen
def pruefe_deck(pfad, fehler, warnungen, alle_ids):
    name = pfad.name
    try:
        deck = lade_json(pfad)
    except json.JSONDecodeError as e:
        fehler.append(f"{name}: ungültiges JSON – {e}")
        return None
    if not isinstance(deck, dict) or not isinstance(deck.get("karten"), list):
        fehler.append(f"{name}: erwartet {{\"fach\", \"titel\", \"karten\": [...]}}")
        return None
    fach = pfad.stem
    if deck.get("fach") != fach:
        fehler.append(f"{name}: \"fach\" muss \"{fach}\" sein (Dateiname)")
    if not str(deck.get("titel", "")).strip():
        fehler.append(f"{name}: \"titel\" fehlt")
    for i, k in enumerate(deck["karten"]):
        wo = f"{name} Karte {i + 1}"
        if not isinstance(k, dict):
            fehler.append(f"{wo}: keine Karte (Objekt erwartet)")
            continue
        kid = k.get("id")
        if isinstance(kid, str):
            wo = f"{name} {kid}"
        fehlend = [f for f in FELDER if f not in k]
        if fehlend:
            fehler.append(f"{wo}: Felder fehlen: {', '.join(fehlend)}")
        unbekannt = [f for f in k if f not in FELDER and f not in OPTIONAL]
        if unbekannt:
            warnungen.append(f"{wo}: unbekannte Felder: {', '.join(unbekannt)}")
        if not isinstance(kid, str) or not ID_RE.match(kid):
            fehler.append(f"{wo}: ID \"{kid}\" hat nicht das Format <fach>-<thema>-<nnn>")
        elif not kid.startswith(fach + "-"):
            fehler.append(f"{wo}: ID muss mit \"{fach}-\" beginnen")
        elif kid in alle_ids:
            fehler.append(f"{wo}: ID doppelt (auch in {alle_ids[kid]})")
        else:
            alle_ids[kid] = name
        for feld in ("frage", "antwort", "kapitel", "quelle"):
            if feld in k and (not isinstance(k[feld], str) or not k[feld].strip()):
                fehler.append(f"{wo}: \"{feld}\" muss ein nicht-leerer Text sein")
        if "typ" in k and k["typ"] not in TYPEN:
            fehler.append(f"{wo}: typ \"{k['typ']}\" – erlaubt: {', '.join(sorted(TYPEN))}")
        if "tags" in k and (not isinstance(k["tags"], list) or not all(isinstance(t, str) and t for t in k["tags"])):
            fehler.append(f"{wo}: \"tags\" muss eine Liste von Texten sein")
        if "formel" in k and (not isinstance(k["formel"], str) or not k["formel"].strip()):
            fehler.append(f"{wo}: \"formel\" muss ein nicht-leerer Text sein")
        if k.get("typ") == "rechnung" and "formel" not in k:
            warnungen.append(f"{wo}: Rechenkarte ohne \"formel\" (Formelhilfe fehlt)")
        for feld in ("frage", "antwort", "formel"):
            text = k.get(feld)
            if not isinstance(text, str):
                continue
            if STEUERZEICHEN.search(text):
                fehler.append(f"{wo}: Steuerzeichen in \"{feld}\" – in JSON jeden Backslash doppeln (\\\\frac, \\\\text, \\\\beta)")
            if len(re.findall(r"(?<!\\)\$", text)) % 2:
                warnungen.append(f"{wo}: ungerade Anzahl $ in \"{feld}\" – Formel nicht geschlossen?")
            for m in re.finditer(r"\$\$(.+?)\$\$|\$(.+?)\$", text, re.S):
                if "\n" in (m.group(1) or m.group(2) or ""):
                    warnungen.append(f"{wo}: Zeilenumbruch in einer Formel in \"{feld}\" – \\\\nu, \\\\neq, \\\\nabla mit einfachem Backslash geschrieben?")
        if isinstance(k.get("frage"), str) and JA_NEIN.match(k["frage"].strip()):
            warnungen.append(f"{wo}: klingt nach Ja/Nein-Frage: \"{k['frage'][:60]}\"")
    return deck


def vergleiche_snapshot(fehler):
    if not SNAP.exists():
        fehler.append("Kein Snapshot vorhanden – erst 'python tools/karten.py snapshot' ausführen.")
        return {}
    neu_pro_deck = {}
    for alt_pfad in sorted(SNAP.glob("*.json")):
        jetzt_pfad = DECKS / alt_pfad.name
        alt = (lade_json(alt_pfad, {}) or {}).get("karten", [])
        if not jetzt_pfad.exists():
            fehler.append(f"{alt_pfad.name}: Deck wurde gelöscht!")
            continue
        try:
            jetzt = (lade_json(jetzt_pfad, {}) or {}).get("karten", [])
        except json.JSONDecodeError:
            continue  # wird schon in pruefe_deck gemeldet
        for i, k_alt in enumerate(alt):
            if i >= len(jetzt):
                fehler.append(f"{alt_pfad.name}: Karte {k_alt.get('id')} fehlt (Karten wurden gelöscht)")
                break
            vergleich = jetzt[i]
            if isinstance(vergleich, dict) and "formel" not in k_alt and "formel" in vergleich:
                # Nachgetragene Formelhilfe ist erlaubt – sie ändert nichts am Lernfortschritt
                vergleich = {f: w for f, w in vergleich.items() if f != "formel"}
            if vergleich != k_alt:
                was = "verändert" if jetzt[i].get("id") == k_alt.get("id") else f"ersetzt/verschoben durch {jetzt[i].get('id')}"
                fehler.append(f"{alt_pfad.name}: bestehende Karte {k_alt.get('id')} wurde {was} – nur anhängen erlaubt!")
        neu_pro_deck[alt_pfad.stem] = max(0, len(jetzt) - len(alt))
    for p in deck_dateien():
        if not (SNAP / p.name).exists():
            neu_pro_deck[p.stem] = len((lade_json(p, {}) or {}).get("karten", []))
    return neu_pro_deck


def cmd_pruefen(args):
    fehler, warnungen, alle_ids = [], [], {}
    index = []
    for p in deck_dateien():
        deck = pruefe_deck(p, fehler, warnungen, alle_ids)
        if deck is None:
            continue
        kapitel = []
        for k in deck["karten"]:
            if isinstance(k, dict) and k.get("kapitel") and k["kapitel"] not in kapitel:
                kapitel.append(k["kapitel"])
        index.append({
            "fach": p.stem,
            "titel": deck.get("titel", p.stem),
            "datei": p.name,
            "anzahl": len(deck["karten"]),
            "kapitel": kapitel,
        })
    neu = vergleiche_snapshot(fehler) if args.gegen_snapshot else None

    for w in warnungen:
        print("WARNUNG ", w)
    for f in fehler:
        print("FEHLER  ", f)
    if fehler:
        print(f"\n{len(fehler)} Fehler – index.json NICHT aktualisiert.")
        return 1

    schreibe_json(DECKS / "index.json", {"generiert": date.today().isoformat(), "decks": index})
    for d in index:
        zusatz = f", davon {neu.get(d['fach'], 0)} neu" if neu is not None else ""
        print(f"OK  {d['datei']}: {d['anzahl']} Karten{zusatz}, {len(d['kapitel'])} Kapitel")
    print(f"decks/index.json aktualisiert ({len(index)} Deck(s), {len(warnungen)} Warnung(en)).")
    return 0


# ---------------------------------------------------------------- text
def cmd_text(args):
    """Text aus .docx/.txt/.md/.tex ausgeben (PDFs und Bilder liest Claude direkt mit dem Read-Tool)."""
    p = Path(args.datei)
    if not p.is_file():
        p = MAT / args.datei
    if not p.is_file():
        print(f"nicht gefunden: {args.datei}")
        return 1
    endung = p.suffix.lower()
    if endung == ".docx":
        import docx  # python-docx
        d = docx.Document(str(p))
        for absatz in d.paragraphs:
            print(absatz.text)
        for t in d.tables:
            for zeile in t.rows:
                print(" | ".join(z.text.strip() for z in zeile.cells))
    elif endung in {".txt", ".md", ".tex", ".csv"}:
        print(p.read_text(encoding="utf-8", errors="replace"))
    else:
        print(f"{endung}: bitte mit dem Read-Tool lesen (PDF/Bild).")
        return 1
    return 0


# ---------------------------------------------------------------- erledigt
def cmd_erledigt(args):
    log = lade_json(LOG, {"dateien": {}})
    deck = lade_json(DECKS / f"{args.fach}.json", {"karten": []}) or {"karten": []}
    rc = 0
    ordner = fach_ordner(args.fach) or MAT / args.fach
    for datei in args.dateien:
        p = Path(datei)
        if not p.is_absolute():
            kandidaten = [ordner / datei, MAT / datei, ROOT / datei]
            p = next((k for k in kandidaten if k.is_file()), kandidaten[0])
        if not p.is_file():
            print(f"FEHLER   nicht gefunden: {datei}")
            rc = 1
            continue
        schluessel = p.resolve().relative_to(MAT.resolve()).as_posix()
        ids = [k["id"] for k in deck.get("karten", []) if isinstance(k, dict) and str(k.get("quelle", "")).startswith(p.name)]
        log["dateien"][schluessel] = {
            "sha256": sha256(p),
            "verarbeitet_am": date.today().isoformat(),
            "deck": args.fach,
            "karten": ids,
        }
        print(f"OK       {schluessel}: {len(ids)} Karten zugeordnet")
    log["dateien"] = dict(sorted(log["dateien"].items()))
    schreibe_json(LOG, log)
    return rc


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("faecher"); s.set_defaults(fn=cmd_faecher)
    s = sub.add_parser("neu"); s.add_argument("fach"); s.set_defaults(fn=cmd_neu)
    s = sub.add_parser("snapshot"); s.set_defaults(fn=cmd_snapshot)
    s = sub.add_parser("naechste-id"); s.add_argument("fach"); s.add_argument("thema"); s.set_defaults(fn=cmd_naechste_id)
    s = sub.add_parser("pruefen"); s.add_argument("--gegen-snapshot", action="store_true"); s.set_defaults(fn=cmd_pruefen)
    s = sub.add_parser("erledigt"); s.add_argument("fach"); s.add_argument("dateien", nargs="+"); s.set_defaults(fn=cmd_erledigt)
    s = sub.add_parser("text"); s.add_argument("datei"); s.set_defaults(fn=cmd_text)
    args = ap.parse_args()
    if hasattr(args, "fach"):
        args.fach = kuerzel(args.fach)  # Ordnername oder Kürzel → Kürzel
        if not SLUG_RE.match(args.fach):
            print("Fach-Name muss Buchstaben oder Ziffern enthalten, z. B. 'tma' oder 'ET2'.")
            return 1
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
