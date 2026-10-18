/*
 * Lernsitzung.
 *   Modus "sr":      fällige Karten + neue Karten (Tageslimit), FSRS plant die nächste Wiederholung
 *   Modus "klausur": alle (gefilterten) Karten gemischt; "Nochmal" kommt am Ende der Runde wieder;
 *                    der FSRS-Plan wird NICHT verändert, Bewertungen zählen nur für die Statistik
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

  let S = null; // aktuelle Sitzung

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

  function start(fach, mode) {
    const $app = App.$app;
    const deck = App.deck(fach);
    if (!deck) {
      $app.innerHTML = `<section class="panel"><p>Fach „${esc(fach)}“ nicht gefunden.</p><a class="btn" href="#/">Zur Startseite</a></section>`;
      return;
    }
    const cards = App.filtered(fach);
    const now = Date.now();
    S = {
      fach, mode, main: [], learning: [], current: null, preview: null,
      revealed: false, mine: '', busy: false, undo: [], done: 0, started: now,
      firstTry: new Map(), total: 0,
    };
    if (mode === 'klausur') {
      S.main = shuffle(cards.map((k) => k.id));
      S.total = S.main.length;
    } else {
      const due = [];
      const news = [];
      for (const k of cards) {
        const p = App.progress.get(k.id);
        if (!p || p.state === FSRS.State.New) news.push(k.id);
        else if (p.state === FSRS.State.Review) { if (p.due <= now) due.push(k.id); }
        else S.learning.push({ id: k.id, due: p.due });
      }
      const left = Math.max(0, App.settings.newPerDay - App.introducedToday(fach));
      S.main = interleave(shuffle(due), news.slice(0, left));
    }
    advance();
  }

  function stop() {
    S = null;
  }

  function advance() {
    S.revealed = false;
    S.mine = '';
    const now = Date.now();
    S.learning.sort((a, b) => a.due - b.due);
    let id = null;
    if (S.learning.length && S.learning[0].due <= now) id = S.learning.shift().id;
    else if (S.main.length) id = S.main.shift();
    else if (S.learning.length) id = S.learning.shift().id; // Lernschritte vorziehen, statt zu warten
    S.current = id;
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
    const back = '#/fach/' + encodeURIComponent(S.fach);
    return `
      <div class="learn-top">
        <a class="icon-btn" href="${back}" aria-label="Sitzung beenden" title="Beenden">✕</a>
        <div class="learn-mode">${S.mode === 'klausur' ? 'Klausurmodus' : esc(App.deck(S.fach).titel)}</div>
        ${counters()}
        <button class="icon-btn" data-learn="undo" aria-label="Letzte Bewertung rückgängig" title="Rückgängig (U)" ${S.undo.length ? '' : 'disabled'}>↶</button>
      </div>`;
  }

  function render() {
    const k = App.byId.get(S.current);
    const $app = App.$app;
    if (!k) { advance(); return; }
    const meta = `<div class="q-meta"><span class="badge t-${esc(k.typ)}">${esc(App.TYP_LABEL[k.typ] || k.typ)}</span><span>${esc(k.kapitel || '')}</span></div>`;
    const question = `<article class="qcard">${meta}<div class="q-text rich">${rich(k.frage)}</div></article>`;

    if (!S.revealed) {
      $app.innerHTML = `
        <div class="learn">
          ${topbar()}
          ${question}
          <div class="answer-area">
            <label class="lbl" for="mine">Deine Antwort <span class="muted">(optional)</span></label>
            <textarea id="mine" rows="4" placeholder="Aus dem Kopf aufschreiben … Formeln mit $…$" autocomplete="off" autocapitalize="sentences">${esc(S.mine)}</textarea>
            <button class="btn primary big" data-learn="reveal">Aufdecken</button>
            <div class="kbd-hint">Leertaste aufdecken · im Textfeld <kbd>Strg</kbd>+<kbd>Enter</kbd></div>
          </div>
        </div>`;
      return;
    }

    const mine = S.mine.trim();
    const buttons = R.map((r) => {
      const sub = S.mode === 'sr' ? FSRS.fmtInterval(S.preview[r.g], Date.now()) : (r.g === 1 ? 'kommt wieder' : '');
      return `<button class="rate ${r.key}" data-rate="${r.g}"><span>${r.label}</span><small>${esc(sub)}</small></button>`;
    }).join('');
    $app.innerHTML = `
      <div class="learn">
        ${topbar()}
        ${question}
        <div class="compare${mine ? ' two' : ''}">
          ${mine ? `<section class="pane mine"><h4>Deine Antwort</h4><div class="rich">${rich(mine)}</div></section>` : ''}
          <section class="pane solution"><h4>Musterlösung</h4><div class="rich">${rich(k.antwort)}</div>
            <div class="src">Quelle: ${esc(k.quelle || '–')}</div></section>
        </div>
        <div class="ratings" role="group" aria-label="Selbstbewertung">${buttons}</div>
        <div class="kbd-hint">Tasten <kbd>1</kbd>–<kbd>4</kbd> bewerten · <kbd>U</kbd> rückgängig</div>
      </div>`;
    const sol = $app.querySelector('.compare');
    if (sol && window.innerWidth < 700) sol.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function renderFinish() {
    const $app = App.$app;
    const mins = Math.max(1, Math.round((Date.now() - S.started) / 60000));
    let body;
    if (S.mode === 'klausur') {
      const known = [...S.firstTry.values()].filter(Boolean).length;
      const pct = S.total ? Math.round(known / S.total * 100) : 0;
      body = `<p><b>${known} von ${S.total}</b> Karten beim ersten Versuch gewusst (${pct} %).</p>
        <div class="btn-row center">
          <a class="btn primary" href="#/klausur/${encodeURIComponent(S.fach)}" data-learn="again-round">Noch eine Runde</a>
          <a class="btn" href="#/fach/${encodeURIComponent(S.fach)}">Zurück zum Fach</a>
        </div>`;
    } else {
      const c = App.counts(S.fach, App.filtered(S.fach));
      body = `<p>${S.done} Bewertungen in ${mins} min.</p>
        <p class="muted">Nächste fällige Wiederholung: ${App.fmtWhen(c.nextDue)}${c.neu && !c.newToday ? '<br>Tageslimit für neue Karten erreicht.' : ''}</p>
        <div class="btn-row center"><a class="btn primary" href="#/fach/${encodeURIComponent(S.fach)}">Zurück zum Fach</a></div>`;
    }
    $app.innerHTML = `
      <div class="learn">
        ${topbar()}
        <section class="panel done center">
          <div class="done-icon" aria-hidden="true">✓</div>
          <h2>${S.done ? 'Geschafft!' : 'Nichts zu tun'}</h2>
          ${S.done || S.mode === 'klausur' ? body : '<p class="muted">Keine fälligen oder neuen Karten mit dem aktuellen Filter.</p><div class="btn-row center"><a class="btn" href="#/fach/' + encodeURIComponent(S.fach) + '">Zurück zum Fach</a></div>'}
        </section>
      </div>`;
  }

  function reveal() {
    if (!S || S.revealed || !S.current) return;
    const ta = document.getElementById('mine');
    S.mine = ta ? ta.value : '';
    if (ta) ta.blur();
    S.revealed = true;
    render();
  }

  async function rate(g) {
    if (!S || !S.revealed || S.busy || !S.current) return;
    S.busy = true;
    const id = S.current;
    const now = Date.now();
    const prev = App.progress.get(id) || null;
    const snap = {
      id, prev, main: S.main.slice(), learning: S.learning.map((x) => ({ ...x })), done: S.done,
      hadFirst: S.firstTry.has(id), first: S.firstTry.get(id),
    };
    const entry = {
      id: App.uid(), cardId: id, fach: S.fach, ts: now, rating: g, mode: S.mode,
      state: prev ? prev.state : 0, wasNew: !prev || prev.state === 0,
    };
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
    S.revealed = false;
    S.mine = '';
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
    else if (b.dataset.learn === 'again-round') { e.preventDefault(); start(S.fach, 'klausur'); }
  });

  document.addEventListener('keydown', (e) => {
    if (!S || e.altKey) return;
    const inText = e.target.matches && e.target.matches('textarea, input, select');
    if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !inText) { e.preventDefault(); undo(); return; }
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
    } else if (e.key === 'u' || e.key === 'U') {
      undo();
    } else if (e.key === 'Escape') {
      location.hash = '#/fach/' + encodeURIComponent(S.fach);
    }
  });

  window.Learn = { start, stop };
})();
