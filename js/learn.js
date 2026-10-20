/*
 * Lernsitzung – für ein Fach oder für „Alle Fächer gemischt“ (scope = App.MIX).
 *   Modus "sr":      fällige Karten + neue Karten (Tageslimit pro Fach), FSRS plant die nächste Wiederholung
 *   Modus "klausur": alle (gefilterten) Karten gemischt; "Nochmal" kommt am Ende der Runde wieder;
 *                    der FSRS-Plan wird NICHT verändert, Bewertungen zählen nur für die Statistik
 * Karten mit "formel": Kasten „Formel anzeigen“, bei jeder Karte wieder aus.
 * Antwort: tippen oder zeichnen (ink.js); Rechenaufgaben starten standardmäßig mit der Zeichenfläche.
 */
(function () {
  'use strict';

  const { esc, rich } = window.Render;
  const R = [
    { g: 1, key: 'again', label: 'Nochmal' },
    { g: 2, key: 'hard', label: 'Schwer' },
    { g: 3, key: 'good', label: 'Gut' },
    { g: 4, key: 'easy', label: 'Einfach' },
  ];
  const INPUT_KEY = 'ar-eingabe-rechnung'; // gemerkte Eingabeart für Rechenaufgaben: 'draw' | 'type'

  let S = null;   // aktuelle Sitzung
  let pad = null; // aktive Zeichenfläche

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Verteilt die neuen Karten gleichmäßig zwischen die Wiederholungen. */
  function interleave(reviews, news) {
    if (!news.length) return reviews.slice();
    if (!reviews.length) return news.slice();
    const out = [];
    const ratio = reviews.length / news.length;
    let ri = 0;
    news.forEach((n, i) => {
      const upTo = Math.round((i + 1) * ratio);
      while (ri < upTo) out.push(reviews[ri++]);
      out.push(n);
    });
    while (ri < reviews.length) out.push(reviews[ri++]);
    return out;
  }

  /** Abwechselnd aus jeder Gruppe eine Karte (neue Karten im Mix: Fächer im Wechsel, Reihenfolge je Fach bleibt). */
  function roundRobin(groups) {
    const out = [];
    for (let i = 0; groups.some((g) => i < g.length); i++) groups.forEach((g) => { if (i < g.length) out.push(g[i]); });
    return out;
  }

  function rechnungInput() {
    try { return localStorage.getItem(INPUT_KEY) === 'type' ? 'type' : 'draw'; } catch (e) { return 'draw'; }
  }

  function backHref() {
    return S.mix ? '#/mix' : '#/fach/' + encodeURIComponent(S.scope);
  }

  function destroyPad() {
    if (pad) { pad.destroy(); pad = null; }
  }

  function start(scope, mode) {
    const $app = App.$app;
    const mix = scope === App.MIX;
    destroyPad();
    if (!mix && !App.deck(scope)) {
      S = null;
      $app.innerHTML = `<section class="panel"><p>Fach „${esc(scope)}“ nicht gefunden.</p><a class="btn" href="#/">Zur Startseite</a></section>`;
      return;
    }
    const cards = App.sessionCards(scope);
    const now = Date.now();
    S = {
      scope, mix, mode, main: [], learning: [], current: null, preview: null,
      revealed: false, mine: '', busy: false, undo: [], done: 0, started: now,
      firstTry: new Map(), total: 0,
    };
    if (mode === 'klausur') {
      S.main = shuffle(cards.map((k) => k.id));
      S.total = S.main.length;
    } else {
      const due = [];
      const newsBy = new Map();
      for (const k of cards) {
        const p = App.progress.get(k.id);
        if (!p || p.state === FSRS.State.New) {
          if (!newsBy.has(k.fach)) newsBy.set(k.fach, []);
          newsBy.get(k.fach).push(k.id);
        } else if (p.state === FSRS.State.Review) { if (p.due <= now) due.push(k.id); }
        else S.learning.push({ id: k.id, due: p.due });
      }
      const news = roundRobin([...newsBy].map(([fach, ids]) => ids.slice(0, App.newLeft(fach))));
      S.main = interleave(shuffle(due), news);
    }
    advance();
  }

  function stop() {
    destroyPad();
    S = null;
  }

  /** Alles, was pro Karte frisch beginnt. */
  function resetCard() {
    S.revealed = false;
    S.mine = '';
    S.showFormel = false;
    S.formelUsed = false;
    S.ink = Ink.newState();
    S.inkImg = null;
    const k = S.current && App.byId.get(S.current);
    S.input = k && k.typ === 'rechnung' ? rechnungInput() : 'type';
  }

  function advance() {
    const now = Date.now();
    S.learning.sort((a, b) => a.due - b.due);
    let id = null;
    if (S.learning.length && S.learning[0].due <= now) id = S.learning.shift().id;
    else if (S.main.length) id = S.main.shift();
    else if (S.learning.length) id = S.learning.shift().id; // Lernschritte vorziehen, statt zu warten
    S.current = id;
    resetCard();
    if (!id) { renderFinish(); return; }
    preparePreview();
    render();
  }

  function preparePreview() {
    if (S.mode !== 'sr') { S.preview = null; return; }
    const p = App.progress.get(S.current) || FSRS.newCard(S.current);
    S.preview = FSRS.preview(p, Date.now(), { retention: App.settings.retention });
  }

  function counters() {
    if (S.mode === 'klausur') {
      const known = [...S.firstTry.values()].filter(Boolean).length;
      return `<div class="counters"><span>${S.firstTry.size} / ${S.total}</span><span class="muted">· ${known} gewusst</span></div>`;
    }
    let neu = 0;
    let due = 0;
    S.main.forEach((id) => {
      const p = App.progress.get(id);
      if (!p || p.state === 0) neu++; else due++;
    });
    const cur = S.current && App.progress.get(S.current);
    const curKind = !S.current ? null : !cur || cur.state === 0 ? 'new' : cur.state === 2 ? 'due' : 'learn';
    const num = (n, kind, title) => `<span class="c-${kind}${curKind === kind ? ' cur' : ''}" title="${title}">${n + (curKind === kind ? 1 : 0)}</span>`;
    return `<div class="counters">${num(neu, 'new', 'neu')}${num(S.learning.length, 'learn', 'in Lernphase')}${num(due, 'due', 'fällig')}</div>`;
  }

  function topbar() {
    const title = S.mode === 'klausur' ? 'Klausurmodus' + (S.mix ? ' · alle Fächer' : '')
      : S.mix ? 'Alle Fächer' : App.deck(S.scope).titel;
    return `
      <div class="learn-top">
        <a class="icon-btn" href="${backHref()}" aria-label="Sitzung beenden" title="Beenden">✕</a>
        <div class="learn-mode">${esc(title)}</div>
        ${counters()}
        <button class="icon-btn" data-learn="undo" aria-label="Letzte Bewertung rückgängig" title="Rückgängig (U)" ${S.undo.length ? '' : 'disabled'}>↶</button>
      </div>`;
  }

  function render() {
    destroyPad();
    const k = App.byId.get(S.current);
    const $app = App.$app;
    if (!k) { advance(); return; }
    const deck = S.mix ? App.deck(k.fach) : null;
    const meta = `<div class="q-meta"><span class="badge t-${esc(k.typ)}">${esc(App.TYP_LABEL[k.typ] || k.typ)}</span>${deck ? `<span class="q-fach">${esc(deck.titel)}</span>` : ''}<span>${esc(k.kapitel || '')}</span></div>`;
    const question = `<article class="qcard">${meta}<div class="q-text rich">${rich(k.frage)}</div></article>`;
    const formel = k.formel ? `
      <div class="formel">
        <label class="formel-toggle"><input type="checkbox" data-learn="formel"${S.showFormel ? ' checked' : ''}> Formel anzeigen <kbd class="kbd-hint">F</kbd></label>
        <div class="formel-box rich"${S.showFormel ? '' : ' hidden'}>${rich(k.formel)}</div>
      </div>` : '';

    if (!S.revealed) {
      const seg = (v, label) => `<button data-learn="input" data-value="${v}" class="${S.input === v ? 'on' : ''}" aria-pressed="${S.input === v}">${label}</button>`;
      $app.innerHTML = `
        <div class="learn">
          ${topbar()}
          ${question}
          ${formel}
          <div class="answer-area" data-input="${S.input}">
            <div class="answer-head">
              <span class="lbl">Deine Antwort <span class="muted">(optional)</span></span>
              <div class="seg small" role="group" aria-label="Eingabeart">${seg('draw', '✎ Zeichnen')}${seg('type', 'Tippen')}</div>
            </div>
            <div class="ink">
              <div class="ink-tools" role="toolbar" aria-label="Zeichenwerkzeuge">
                <button data-ink="pen" aria-pressed="true" class="on">Stift</button>
                <button data-ink="eraser" aria-pressed="false">Radierer</button>
                <span class="ink-gap"></span>
                <button data-ink="undo" title="Letzten Strich zurück" aria-label="Letzten Strich zurück">↶</button>
                <button data-ink="clear">Leeren</button>
              </div>
              <div class="ink-surface"><canvas aria-label="Zeichenfläche für deinen Rechenweg"></canvas></div>
            </div>
            <textarea id="mine" rows="4" placeholder="Aus dem Kopf aufschreiben … Formeln mit $…$" autocomplete="off" autocapitalize="sentences">${esc(S.mine)}</textarea>
            <button class="btn primary big" data-learn="reveal">Aufdecken</button>
            <div class="kbd-hint">Leertaste aufdecken · im Textfeld <kbd>Strg</kbd>+<kbd>Enter</kbd>${k.formel ? ' · <kbd>F</kbd> Formel' : ''}</div>
          </div>
        </div>`;
      pad = Ink.create($app.querySelector('.ink'), S.ink);
      return;
    }

    const mine = S.mine.trim();
    const img = S.inkImg;
    const buttons = R.map((r) => {
      const sub = S.mode === 'sr' ? FSRS.fmtInterval(S.preview[r.g], Date.now()) : (r.g === 1 ? 'kommt wieder' : '');
      return `<button class="rate ${r.key}" data-rate="${r.g}"><span>${r.label}</span><small>${esc(sub)}</small></button>`;
    }).join('');
    const minePane = mine || img ? `
      <section class="pane mine"><h4>Deine Antwort</h4>
        ${img ? `<img class="ink-img" src="${img.src}" width="${Math.round(img.w)}" height="${Math.round(img.h)}" alt="Deine Zeichnung">` : ''}
        ${mine ? `<div class="rich">${rich(mine)}</div>` : ''}
      </section>` : '';
    $app.innerHTML = `
      <div class="learn">
        ${topbar()}
        ${question}
        ${formel}
        <div class="compare${minePane ? ' two' : ''}${img ? ' has-ink' : ''}">
          ${minePane}
          <section class="pane solution"><h4>Musterlösung</h4><div class="rich">${rich(k.antwort)}</div>
            <div class="src">Quelle: ${esc(k.quelle || '–')}</div></section>
        </div>
        <div class="ratings" role="group" aria-label="Selbstbewertung">${buttons}</div>
        <div class="kbd-hint">Tasten <kbd>1</kbd>–<kbd>4</kbd> bewerten · <kbd>U</kbd> rückgängig</div>
      </div>`;
    const sol = $app.querySelector('.compare');
    if (sol && (img || window.innerWidth < 700)) sol.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function renderFinish() {
    destroyPad();
    const $app = App.$app;
    const mins = Math.max(1, Math.round((Date.now() - S.started) / 60000));
    const back = backHref();
    const backLabel = S.mix ? 'Zurück zur Auswahl' : 'Zurück zum Fach';
    let body;
    if (S.mode === 'klausur') {
      const known = [...S.firstTry.values()].filter(Boolean).length;
      const pct = S.total ? Math.round(known / S.total * 100) : 0;
      body = `<p><b>${known} von ${S.total}</b> Karten beim ersten Versuch gewusst (${pct} %).</p>
        <div class="btn-row center">
          <a class="btn primary" href="#/klausur/${encodeURIComponent(S.scope)}" data-learn="again-round">Noch eine Runde</a>
          <a class="btn" href="${back}">${backLabel}</a>
        </div>`;
    } else {
      const c = S.mix ? App.mixCounts() : App.counts(S.scope, App.filtered(S.scope));
      body = `<p>${S.done} Bewertungen in ${mins} min.</p>
        <p class="muted">Nächste fällige Wiederholung: ${App.fmtWhen(c.nextDue)}${c.neu && !c.newToday ? '<br>Tageslimit für neue Karten erreicht.' : ''}</p>
        <div class="btn-row center"><a class="btn primary" href="${back}">${backLabel}</a></div>`;
    }
    $app.innerHTML = `
      <div class="learn">
        ${topbar()}
        <section class="panel done center">
          <div class="done-icon" aria-hidden="true">✓</div>
          <h2>${S.done ? 'Geschafft!' : 'Nichts zu tun'}</h2>
          ${S.done || S.mode === 'klausur' ? body : `<p class="muted">Keine fälligen oder neuen Karten mit ${S.mix ? 'der aktuellen Auswahl' : 'dem aktuellen Filter'}.</p><div class="btn-row center"><a class="btn" href="${back}">${backLabel}</a></div>`}
        </section>
      </div>`;
  }

  function reveal() {
    if (!S || S.revealed || !S.current) return;
    const ta = document.getElementById('mine');
    S.mine = ta ? ta.value : '';
    if (ta) ta.blur();
    S.inkImg = pad ? pad.snapshot() : null;
    S.revealed = true;
    render();
  }

  function setFormel(on) {
    if (!S) return;
    S.showFormel = on;
    if (on) S.formelUsed = true;
    const box = document.querySelector('.formel-box');
    const cb = document.querySelector('[data-learn="formel"]');
    if (box) box.hidden = !on;
    if (cb) cb.checked = on;
  }

  function setInput(v) {
    if (!S || S.revealed) return;
    S.input = v;
    const area = document.querySelector('.answer-area');
    if (area) area.dataset.input = v;
    document.querySelectorAll('[data-learn="input"]').forEach((b) => {
      const on = b.dataset.value === v;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const k = App.byId.get(S.current);
    if (k && k.typ === 'rechnung') {
      try { localStorage.setItem(INPUT_KEY, v); } catch (e) { /* egal */ }
    }
  }

  async function rate(g) {
    if (!S || !S.revealed || S.busy || !S.current) return;
    S.busy = true;
    const id = S.current;
    const k = App.byId.get(id);
    const now = Date.now();
    const prev = App.progress.get(id) || null;
    const snap = {
      id, prev, main: S.main.slice(), learning: S.learning.map((x) => ({ ...x })), done: S.done,
      hadFirst: S.firstTry.has(id), first: S.firstTry.get(id),
    };
    const entry = {
      id: App.uid(), cardId: id, fach: k ? k.fach : S.scope, ts: now, rating: g, mode: S.mode,
      state: prev ? prev.state : 0, wasNew: !prev || prev.state === 0,
    };
    if (S.formelUsed) entry.formelHilfe = true;
    let card = null;
    if (S.mode === 'sr') {
      card = Object.assign({}, S.preview[g], { id });
      entry.stability = card.stability;
      entry.difficulty = card.difficulty;
      entry.scheduledDays = card.scheduledDays || 0;
    }
    try {
      await DB.saveReview(card, entry);
    } catch (e) {
      App.toast('Speichern fehlgeschlagen: ' + e.message, 5000);
      S.busy = false;
      return;
    }
    if (card) {
      App.progress.set(id, card);
      if (card.state === FSRS.State.Learning || card.state === FSRS.State.Relearning) S.learning.push({ id, due: card.due });
    } else {
      if (!S.firstTry.has(id)) S.firstTry.set(id, g >= 2);
      if (g === 1) S.main.push(id); // Klausurmodus: kommt am Ende der Runde wieder
    }
    App.log.push(entry);
    snap.logId = entry.id;
    S.undo.push(snap);
    if (S.undo.length > 30) S.undo.shift();
    S.done++;
    S.busy = false;
    advance();
  }

  async function undo() {
    if (!S || S.busy || !S.undo.length) return;
    S.busy = true;
    const u = S.undo.pop();
    try {
      await DB.undoReview(u.logId, S.mode === 'sr' ? { id: u.id, prev: u.prev } : null);
    } catch (e) {
      App.toast('Rückgängig fehlgeschlagen: ' + e.message, 5000);
      S.undo.push(u);
      S.busy = false;
      return;
    }
    if (S.mode === 'sr') {
      if (u.prev) App.progress.set(u.id, u.prev); else App.progress.delete(u.id);
    }
    const i = App.log.findIndex((l) => l.id === u.logId);
    if (i >= 0) App.log.splice(i, 1);
    S.main = u.main;
    S.learning = u.learning;
    S.done = u.done;
    if (u.hadFirst) S.firstTry.set(u.id, u.first); else S.firstTry.delete(u.id);
    S.current = u.id;
    resetCard();
    preparePreview();
    S.busy = false;
    render();
    App.toast('Rückgängig gemacht', 1500);
  }

  /* ---------- Eingaben ---------- */

  document.addEventListener('click', (e) => {
    if (!S) return;
    const b = e.target.closest('[data-learn], [data-rate]');
    if (!b) return;
    if (b.dataset.rate) rate(parseInt(b.dataset.rate, 10));
    else if (b.dataset.learn === 'reveal') reveal();
    else if (b.dataset.learn === 'undo') undo();
    else if (b.dataset.learn === 'input') setInput(b.dataset.value);
    else if (b.dataset.learn === 'again-round') { e.preventDefault(); start(S.scope, 'klausur'); }
  });

  document.addEventListener('change', (e) => {
    if (S && e.target.matches('[data-learn="formel"]')) setFormel(e.target.checked);
  });

  document.addEventListener('keydown', (e) => {
    if (!S || e.altKey) return;
    const inText = e.target.matches && e.target.matches('textarea, select, input:not([type="checkbox"])');
    if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !inText) {
      e.preventDefault();
      // Vor dem Aufdecken auf der Zeichenfläche: letzten Strich zurück, sonst letzte Bewertung
      if (pad && !S.revealed && S.input === 'draw' && (S.ink.strokes.length || S.ink.cleared)) pad.undo();
      else undo();
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'Enter' && !S.revealed) { e.preventDefault(); reveal(); }
      return;
    }
    if (inText) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (!S.revealed) reveal();
    } else if (S.revealed && /^[1-4]$/.test(e.key)) {
      e.preventDefault();
      rate(parseInt(e.key, 10));
    } else if (e.key === 'f' || e.key === 'F') {
      if (document.querySelector('[data-learn="formel"]')) { e.preventDefault(); setFormel(!S.showFormel); }
    } else if (e.key === 'u' || e.key === 'U') {
      undo();
    } else if (e.key === 'Escape') {
      location.hash = backHref();
    }
  });

  window.Learn = { start, stop };
})();
