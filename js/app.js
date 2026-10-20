/*
 * App-Kern: Daten laden, Routing, Startseite, Fach-Ansicht, Einstellungen.
 * Lernsitzung → learn.js, Statistik → stats.js
 */
(function () {
  'use strict';

  const { esc, rich } = window.Render;
  const $app = document.getElementById('app');

  const App = window.App = {
    decks: [],             // [{ fach, titel, karten: [...] }]
    byId: new Map(),       // Karten-ID → Karte (mit .fach)
    progress: new Map(),   // Karten-ID → Lernstand (FSRS)
    log: [],               // alle Bewertungen, nach Zeit sortiert
    settings: { newPerDay: 20, retention: 0.9, lastExport: 0 },
    loadError: null,
    TYP_LABEL: { definition: 'Definition', verstaendnis: 'Verständnis', rechnung: 'Rechnung', vergleich: 'Vergleich' },
  };

  /* ---------- Laden ---------- */

  async function loadDecks() {
    const res = await fetch('decks/index.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('decks/index.json nicht gefunden (HTTP ' + res.status + ')');
    const idx = await res.json();
    App.decks = await Promise.all((idx.decks || []).map(async (d) => {
      try {
        const r = await fetch('decks/' + d.datei, { cache: 'no-cache' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        return { fach: d.fach, titel: data.titel || d.titel || d.fach, karten: Array.isArray(data.karten) ? data.karten : [] };
      } catch (e) {
        console.warn('Deck konnte nicht geladen werden:', d.datei, e);
        return { fach: d.fach, titel: d.titel || d.fach, karten: [], fehler: String(e.message || e) };
      }
    }));
    App.byId = new Map();
    App.decks.forEach((d) => d.karten.forEach((k) => { k.fach = d.fach; App.byId.set(k.id, k); }));
  }

  async function loadProgress() {
    const [cards, log, settings] = await Promise.all([DB.getAll('cards'), DB.getAll('log'), DB.getSettings()]);
    App.progress = new Map(cards.map((c) => [c.id, c]));
    App.log = log.sort((a, b) => a.ts - b.ts);
    Object.assign(App.settings, settings);
  }
  App.reloadProgress = loadProgress;

  /* ---------- Hilfen ---------- */

  App.deck = (fach) => App.decks.find((d) => d.fach === fach);

  App.kapitelOf = (deck) => [...new Set(deck.karten.map((k) => k.kapitel).filter(Boolean))];
  App.tagsOf = (deck) => [...new Set(deck.karten.flatMap((k) => k.tags || []))].sort((a, b) => a.localeCompare(b, 'de'));

  App.TYP_ORDER = ['definition', 'verstaendnis', 'rechnung', 'vergleich'];
  App.TYP_PLURAL = { definition: 'Definitionen', verstaendnis: 'Verständnis', rechnung: 'Rechenaufgaben', vergleich: 'Vergleiche' };
  App.typenOf = (karten) => App.TYP_ORDER.filter((t) => karten.some((k) => k.typ === t));

  App.getFilter = (fach) => {
    let f = null;
    try { f = JSON.parse(localStorage.getItem('ar-filter-' + fach) || 'null'); } catch (e) { /* egal */ }
    const deck = App.deck(fach);
    if (!f || !deck) return { kapitel: [], tags: [], typen: [] };
    // Filterwerte, die es im Deck nicht (mehr) gibt, ignorieren
    const kap = App.kapitelOf(deck);
    const tags = App.tagsOf(deck);
    const typen = App.typenOf(deck.karten);
    return {
      kapitel: (f.kapitel || []).filter((k) => kap.includes(k)),
      tags: (f.tags || []).filter((t) => tags.includes(t)),
      typen: (f.typen || []).filter((t) => typen.includes(t)),
    };
  };
  App.setFilter = (fach, f) => {
    try { localStorage.setItem('ar-filter-' + fach, JSON.stringify(f)); } catch (e) { /* egal */ }
  };
  App.hasFilter = (f) => !!(f.kapitel.length || f.tags.length || f.typen.length);
  App.filtered = (fach) => {
    const deck = App.deck(fach);
    if (!deck) return [];
    const f = App.getFilter(fach);
    return deck.karten.filter((k) =>
      (!f.kapitel.length || f.kapitel.includes(k.kapitel)) &&
      (!f.tags.length || (k.tags || []).some((t) => f.tags.includes(t))) &&
      (!f.typen.length || f.typen.includes(k.typ)));
  };

  /* ---------- Modus „Alle Fächer gemischt“ ---------- */

  App.MIX = '_mix'; // kann nie ein Fach-Kürzel sein (Kürzel bestehen nur aus a-z0-9-)
  const MIX_DEFAULT_OHNE = ['tma']; // TMA ist abgeschlossen → standardmäßig nicht im Mix

  /** { ohne: [Fach-Kürzel, die NICHT mitlernen], typen: [gewählte Kartentypen; leer = alle] } */
  App.getMix = () => {
    let m = null;
    try { m = JSON.parse(localStorage.getItem('ar-mix') || 'null'); } catch (e) { /* egal */ }
    m = m || { ohne: MIX_DEFAULT_OHNE.slice(), typen: [] };
    return { ohne: m.ohne || [], typen: (m.typen || []).filter((t) => App.TYP_ORDER.includes(t)) };
  };
  App.setMix = (m) => {
    try { localStorage.setItem('ar-mix', JSON.stringify(m)); } catch (e) { /* egal */ }
  };
  App.mixDecks = () => {
    const m = App.getMix();
    return App.decks.filter((d) => !m.ohne.includes(d.fach));
  };
  App.mixCardsOf = (deck) => {
    const m = App.getMix();
    return deck.karten.filter((k) => !m.typen.length || m.typen.includes(k.typ));
  };
  App.mixCards = () => App.mixDecks().flatMap((d) => App.mixCardsOf(d));
  /** Summe der Zähler über alle Mix-Fächer (Tageslimit für neue Karten gilt pro Fach). */
  App.mixCounts = () => {
    const sum = { due: 0, learning: 0, neu: 0, newToday: 0, total: 0, nextDue: Infinity };
    App.mixDecks().forEach((d) => {
      const c = App.counts(d.fach, App.mixCardsOf(d));
      ['due', 'learning', 'neu', 'newToday', 'total'].forEach((key) => { sum[key] += c[key]; });
      sum.nextDue = Math.min(sum.nextDue, c.nextDue);
    });
    return sum;
  };
  /** Karten einer Lernsitzung: ein Fach (mit dessen Filter) oder der Mix. */
  App.sessionCards = (scope) => (scope === App.MIX ? App.mixCards() : App.filtered(scope));
  App.newLeft = (fach) => Math.max(0, App.settings.newPerDay - App.introducedToday(fach));

  App.introducedToday = (fach) => {
    const today = FSRS.dayKey(Date.now());
    return App.log.filter((l) => l.fach === fach && l.mode === 'sr' && l.wasNew && FSRS.dayKey(l.ts) === today).length;
  };

  /** Zählt fällige / lernende / neue Karten in einer Kartenliste. */
  App.counts = (fach, cards) => {
    const now = Date.now();
    let due = 0;
    let learning = 0;
    let neu = 0;
    let nextDue = Infinity;
    for (const k of cards) {
      const p = App.progress.get(k.id);
      if (!p || p.state === FSRS.State.New) neu++;
      else if (p.state === FSRS.State.Review) {
        if (p.due <= now) due++; else nextDue = Math.min(nextDue, p.due);
      } else learning++;
    }
    return { due, learning, neu, newToday: Math.min(neu, App.newLeft(fach)), total: cards.length, nextDue };
  };

  App.fmtWhen = (ts) => {
    if (!isFinite(ts)) return '–';
    const days = Math.round((FSRS.dayStart(ts) - FSRS.dayStart(Date.now())) / FSRS.DAY);
    if (days <= 0) return 'heute';
    if (days === 1) return 'morgen';
    if (days < 7) return 'in ' + days + ' Tagen';
    return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  App.toast = (msg, ms) => {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), ms || 3000);
  };

  App.uid = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

  App.flame = '<svg class="flame" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-6 1-9.5z"/></svg>';

  /* ---------- Theme ---------- */

  function getTheme() {
    try { return localStorage.getItem('ar-theme') || 'system'; } catch (e) { return 'system'; }
  }
  function setTheme(t) {
    try { localStorage.setItem('ar-theme', t); } catch (e) { /* egal */ }
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }

  /* ---------- Ansichten ---------- */

  function viewHome() {
    if (App.loadError) {
      $app.innerHTML = `
        <section class="panel error">
          <h2>Decks konnten nicht geladen werden</h2>
          <p>${esc(App.loadError)}</p>
          ${location.protocol === 'file:' ? '<p>Die App muss über einen Webserver laufen. Im Projektordner: <code>python -m http.server 8000</code>, dann <code>http://localhost:8000</code> öffnen.</p>' : ''}
          <button class="btn" data-action="reload-decks">Erneut versuchen</button>
        </section>`;
      return;
    }
    const s = Stats.summary();
    let mixTile = '';
    if (App.decks.length > 1) {
      const m = App.getMix();
      const mc = App.mixCounts();
      const mixTodo = mc.due + mc.learning + mc.newToday;
      const ohne = App.decks.filter((d) => m.ohne.includes(d.fach)).map((d) => d.titel);
      const typInfo = m.typen.length ? ' · nur ' + m.typen.map((t) => App.TYP_PLURAL[t]).join(', ') : '';
      mixTile = `
        <div class="deck-tile mix-tile">
          <a class="deck-main" href="#/mix">
            <div class="deck-title">Alle Fächer gemischt</div>
            <div class="deck-meta">${App.mixDecks().length} Fächer${ohne.length ? ' · ohne ' + esc(ohne.join(', ')) : ''}${esc(typInfo)}</div>
            <div class="pills">
              <span class="pill due">${mc.due + mc.learning} fällig</span>
              <span class="pill new">${mc.newToday} neu</span>
            </div>
          </a>
          <a class="btn primary deck-go${mixTodo ? '' : ' disabled'}" href="#/lernen/${App.MIX}" ${mixTodo ? '' : 'aria-disabled="true" tabindex="-1"'}>${mixTodo ? 'Lernen' : 'Erledigt'}</a>
        </div>`;
    }
    const tiles = App.decks.map((d) => {
      const f = App.getFilter(d.fach);
      const filtered = App.hasFilter(f);
      const c = App.counts(d.fach, App.filtered(d.fach));
      const todo = c.due + c.learning + c.newToday;
      return `
        <div class="deck-tile">
          <a class="deck-main" href="#/fach/${encodeURIComponent(d.fach)}">
            <div class="deck-title">${esc(d.titel)}</div>
            <div class="deck-meta">${d.karten.length} Karten · ${App.kapitelOf(d).length} Kapitel${filtered ? ' · <span class="warn">Filter aktiv</span>' : ''}${d.fehler ? ' · <span class="warn">Fehler beim Laden</span>' : ''}</div>
            <div class="pills">
              <span class="pill due">${c.due + c.learning} fällig</span>
              <span class="pill new">${c.newToday} neu</span>
            </div>
          </a>
          <a class="btn primary deck-go${todo ? '' : ' disabled'}" href="#/lernen/${encodeURIComponent(d.fach)}" ${todo ? '' : 'aria-disabled="true" tabindex="-1"'}>${todo ? 'Lernen' : 'Erledigt'}</a>
        </div>`;
    }).join('');
    $app.innerHTML = `
      <section class="hero">
        <div class="hero-item">${App.flame}<b>${s.streak}</b><span>${s.streak === 1 ? 'Tag' : 'Tage'} Serie</span></div>
        <div class="hero-item"><b>${s.today}</b><span>heute gelernt</span></div>
      </section>
      ${mixTile ? `<div class="deck-list mix-list">${mixTile}</div>` : ''}
      <h2 class="section-title">Fächer</h2>
      ${App.decks.length ? `<div class="deck-list">${tiles}</div>` : `
        <section class="panel">
          <p>Noch keine Decks vorhanden.</p>
          <p>Lege Unterlagen in <code>materialien/&lt;fach&gt;/</code> und führe in Claude Code <code>/karten &lt;fach&gt;</code> aus.</p>
        </section>`}`;
  }

  function viewDeck(fach) {
    const deck = App.deck(fach);
    if (!deck) { $app.innerHTML = `<section class="panel"><p>Fach „${esc(fach)}“ nicht gefunden.</p><a class="btn" href="#/">Zur Startseite</a></section>`; return; }
    const f = App.getFilter(fach);
    const cards = App.filtered(fach);
    const c = App.counts(fach, cards);
    const todo = c.due + c.learning + c.newToday;
    const chip = (kind, value, on, label) =>
      `<button class="chip${on ? ' on' : ''}" data-action="toggle-filter" data-kind="${kind}" data-value="${esc(value)}" aria-pressed="${on}">${esc(label || value)}</button>`;
    const kap = App.kapitelOf(deck);
    const tags = App.tagsOf(deck);
    const typen = App.typenOf(deck.karten);
    $app.innerHTML = `
      <a class="back" href="#/">‹ Fächer</a>
      <h1 class="page-title">${esc(deck.titel)}</h1>
      <div class="stat-grid">
        <div><b>${c.due + c.learning}</b><span>fällig</span></div>
        <div><b>${c.newToday}</b><span>neu heute</span></div>
        <div><b>${c.neu}</b><span>ungelernt</span></div>
        <div><b>${c.total}</b><span>${App.hasFilter(f) ? 'gefiltert' : 'gesamt'}</span></div>
      </div>
      <div class="actions">
        ${todo ? `<a class="btn primary big" href="#/lernen/${encodeURIComponent(fach)}">Lernen · ${todo}</a>`
          : `<div class="panel muted center">Für heute erledigt. Nächste Wiederholung: ${App.fmtWhen(c.nextDue)}${c.neu ? ' · Tageslimit für neue Karten erreicht' : ''}</div>`}
        <a class="btn big${cards.length ? '' : ' disabled'}" href="#/klausur/${encodeURIComponent(fach)}">Klausurmodus · ${cards.length} Karten</a>
      </div>
      <section class="filters">
        ${typen.length > 1 ? `<h3>Kartentyp</h3><div class="chips">${typen.map((t) => chip('typen', t, f.typen.includes(t), App.TYP_PLURAL[t])).join('')}</div>` : ''}
        ${kap.length ? `<h3>Kapitel</h3><div class="chips">${kap.map((k) => chip('kapitel', k, f.kapitel.includes(k))).join('')}</div>` : ''}
        ${tags.length ? `<h3>Tags</h3><div class="chips">${tags.map((t) => chip('tags', t, f.tags.includes(t))).join('')}</div>` : ''}
        ${App.hasFilter(f) ? '<button class="btn small ghost" data-action="clear-filter">Filter zurücksetzen</button>' : ''}
      </section>
      <details class="card-list" data-fach="${esc(fach)}">
        <summary>Karten ansehen (${cards.length})</summary>
        <div class="card-list-body"></div>
      </details>`;
    $app.querySelector('.card-list').addEventListener('toggle', (e) => {
      const body = e.target.querySelector('.card-list-body');
      if (!e.target.open || body.dataset.done) return;
      body.dataset.done = '1';
      body.innerHTML = cards.map((k) => {
        const p = App.progress.get(k.id);
        const st = !p || p.state === 0 ? 'neu' : p.state === 2 ? 'fällig ' + App.fmtWhen(p.due) : 'in Lernphase';
        return `
          <details class="mini-card">
            <summary><span class="rich">${rich(k.frage)}</span></summary>
            <div class="rich answer">${rich(k.antwort)}</div>
            <div class="meta">${esc(App.TYP_LABEL[k.typ] || k.typ)} · ${esc(k.kapitel)} · ${esc(st)}<br><span class="src">${esc(k.quelle)} · ${esc(k.id)}</span></div>
          </details>`;
      }).join('');
    });
  }

  function viewMix() {
    const m = App.getMix();
    const cards = App.mixCards();
    const c = App.mixCounts();
    const todo = c.due + c.learning + c.newToday;
    const alleKarten = App.decks.flatMap((d) => d.karten);
    const mixDeckKarten = App.mixDecks().flatMap((d) => d.karten);
    const fachChips = App.decks.map((d) => {
      const on = !m.ohne.includes(d.fach);
      return `<button class="chip${on ? ' on' : ''}" data-action="toggle-mix-fach" data-value="${esc(d.fach)}" aria-pressed="${on}">${esc(d.titel)} <small>${d.karten.length}</small></button>`;
    }).join('');
    const typChips = App.typenOf(alleKarten).map((t) => {
      const on = m.typen.includes(t);
      const n = mixDeckKarten.filter((k) => k.typ === t).length;
      return `<button class="chip${on ? ' on' : ''}" data-action="toggle-mix-typ" data-value="${t}" aria-pressed="${on}">${App.TYP_PLURAL[t]} <small>${n}</small></button>`;
    }).join('');
    $app.innerHTML = `
      <a class="back" href="#/">‹ Fächer</a>
      <h1 class="page-title">Alle Fächer gemischt</h1>
      <div class="stat-grid">
        <div><b>${c.due + c.learning}</b><span>fällig</span></div>
        <div><b>${c.newToday}</b><span>neu heute</span></div>
        <div><b>${c.neu}</b><span>ungelernt</span></div>
        <div><b>${c.total}</b><span>im Mix</span></div>
      </div>
      <div class="actions">
        ${todo ? `<a class="btn primary big" href="#/lernen/${App.MIX}">Lernen · ${todo}</a>`
          : `<div class="panel muted center">${cards.length ? 'Für heute erledigt. Nächste Wiederholung: ' + App.fmtWhen(c.nextDue) + (c.neu ? ' · Tageslimit für neue Karten erreicht' : '') : 'Keine Karten ausgewählt.'}</div>`}
        <a class="btn big${cards.length ? '' : ' disabled'}" href="#/klausur/${App.MIX}">Klausurmodus · ${cards.length} Karten</a>
      </div>
      <section class="filters">
        <h3>Kartentyp</h3>
        <div class="chips">${typChips}</div>
        <p class="muted small">${m.typen.length ? 'Nur die markierten Typen kommen dran.' : 'Nichts markiert = alle Typen.'}</p>
        <h3>Fächer</h3>
        <div class="chips">${fachChips}</div>
        <p class="muted small">Die Kapitel- und Tag-Filter der einzelnen Fächer gelten hier nicht. Das Limit für neue Karten gilt pro Fach.</p>
      </section>`;
  }

  async function viewSettings() {
    const st = App.settings;
    const theme = getTheme();
    let persisted = null;
    try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (e) { /* egal */ }
    const canShare = !!(navigator.canShare && window.File && navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] }));
    $app.innerHTML = `
      <h1 class="page-title">Einstellungen</h1>
      <section class="panel form">
        <label class="row">
          <span>Neue Karten pro Fach und Tag</span>
          <input type="number" min="0" max="999" inputmode="numeric" value="${st.newPerDay}" data-setting="newPerDay">
        </label>
        <label class="row">
          <span>Ziel-Trefferquote<small>Höher = öfter wiederholen, sicherer behalten</small></span>
          <select data-setting="retention">
            ${[0.8, 0.85, 0.9, 0.95].map((r) => `<option value="${r}"${Math.abs(st.retention - r) < 1e-9 ? ' selected' : ''}>${Math.round(r * 100)} %</option>`).join('')}
          </select>
        </label>
        <div class="row">
          <span>Darstellung</span>
          <div class="seg" role="group" aria-label="Darstellung">
            ${[['system', 'System'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([v, l]) => `<button data-action="theme" data-value="${v}" class="${theme === v ? 'on' : ''}" aria-pressed="${theme === v}">${l}</button>`).join('')}
          </div>
        </div>
      </section>

      <h2 class="section-title">Fortschritt übertragen</h2>
      <section class="panel">
        <p class="muted">Exportiere auf dem einen Gerät und importiere auf dem anderen. Beim Import wird zusammengeführt: Pro Karte gewinnt der neuere Stand, nichts wird gelöscht.</p>
        <div class="btn-row">
          <button class="btn primary" data-action="export">Exportieren</button>
          ${canShare ? '<button class="btn" data-action="share">Teilen …</button>' : ''}
          <label class="btn">Importieren<input type="file" accept="application/json,.json" data-action="import" hidden></label>
        </div>
        <p class="muted small">Letzter Export: ${st.lastExport ? new Date(st.lastExport).toLocaleString('de-DE') : 'noch nie'}${persisted === null ? '' : ' · Speicher ' + (persisted ? 'dauerhaft' : 'nicht dauerhaft (Browser darf ihn löschen)')}</p>
      </section>

      <h2 class="section-title">Decks</h2>
      <section class="panel">
        <p class="muted">${App.decks.length} Fächer, ${App.byId.size} Karten geladen.</p>
        <button class="btn" data-action="reload-decks">Decks neu laden</button>
      </section>

      <h2 class="section-title">Tastenkürzel</h2>
      <section class="panel">
        <table class="keys">
          <tr><td><kbd>Leertaste</kbd></td><td>Aufdecken</td></tr>
          <tr><td><kbd>Strg</kbd>+<kbd>Enter</kbd></td><td>Aufdecken aus dem Textfeld</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Textfeld verlassen</td></tr>
          <tr><td><kbd>1</kbd>–<kbd>4</kbd></td><td>Nochmal / Schwer / Gut / Einfach</td></tr>
          <tr><td><kbd>F</kbd></td><td>Formel ein-/ausblenden (Rechenaufgaben)</td></tr>
          <tr><td><kbd>U</kbd> oder <kbd>Strg</kbd>+<kbd>Z</kbd></td><td>Letzte Bewertung rückgängig (<kbd>Strg</kbd>+<kbd>Z</kbd> beim Zeichnen: letzter Strich)</td></tr>
        </table>
      </section>

      <h2 class="section-title">Zurücksetzen</h2>
      <section class="panel">
        <p class="muted">Löscht den gesamten Lernfortschritt auf diesem Gerät. Exportiere vorher!</p>
        <button class="btn danger" data-action="reset">Fortschritt löschen</button>
      </section>
      <p class="muted small center">Spaced Repetition: FSRS-5 · Daten bleiben lokal im Browser (IndexedDB)</p>`;
  }

  /* ---------- Aktionen ---------- */

  async function exportProgress(share) {
    const data = await DB.exportAll();
    const name = 'active-recall-fortschritt-' + FSRS.dayKey(Date.now()) + '.json';
    const json = JSON.stringify(data);
    if (share) {
      const file = new File([json], name, { type: 'application/json' });
      try { await navigator.share({ files: [file], title: 'Lernfortschritt' }); } catch (e) { if (e.name !== 'AbortError') App.toast('Teilen fehlgeschlagen: ' + e.message); return; }
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    }
    App.settings.lastExport = Date.now();
    await DB.setSetting('lastExport', App.settings.lastExport);
    App.toast(data.cards.length + ' Karten, ' + data.log.length + ' Bewertungen exportiert');
    if (currentView() === 'einstellungen') viewSettings();
  }

  async function importProgress(file) {
    try {
      const data = JSON.parse(await file.text());
      const r = await DB.importMerge(data);
      await loadProgress();
      App.toast(`Import: ${r.cardsTaken} Kartenstände übernommen, ${r.logAdded} Bewertungen ergänzt`, 5000);
    } catch (e) {
      App.toast('Import fehlgeschlagen: ' + e.message, 5000);
    }
  }

  $app.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'INPUT') return;
    const a = el.dataset.action;
    if (a === 'toggle-filter') {
      const fach = currentArg();
      const f = App.getFilter(fach);
      const list = f[el.dataset.kind];
      const i = list.indexOf(el.dataset.value);
      if (i >= 0) list.splice(i, 1); else list.push(el.dataset.value);
      App.setFilter(fach, f);
      viewDeck(fach);
    } else if (a === 'clear-filter') {
      App.setFilter(currentArg(), { kapitel: [], tags: [], typen: [] });
      viewDeck(currentArg());
    } else if (a === 'toggle-mix-fach' || a === 'toggle-mix-typ') {
      const m = App.getMix();
      const list = a === 'toggle-mix-fach' ? m.ohne : m.typen;
      const i = list.indexOf(el.dataset.value);
      if (i >= 0) list.splice(i, 1); else list.push(el.dataset.value);
      App.setMix(m);
      viewMix();
    } else if (a === 'theme') {
      setTheme(el.dataset.value);
      viewSettings();
    } else if (a === 'export') {
      exportProgress(false);
    } else if (a === 'share') {
      exportProgress(true);
    } else if (a === 'reload-decks') {
      await init(true);
      App.toast(App.loadError ? 'Fehler: ' + App.loadError : App.byId.size + ' Karten geladen');
    } else if (a === 'reset') {
      if (!confirm('Wirklich den gesamten Lernfortschritt auf diesem Gerät löschen?')) return;
      if (!confirm('Letzte Warnung: Das kann nicht rückgängig gemacht werden. Fortfahren?')) return;
      await DB.resetProgress();
      await loadProgress();
      App.toast('Fortschritt gelöscht');
    }
  });

  $app.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.dataset.setting === 'newPerDay') {
      const v = Math.max(0, Math.min(999, parseInt(el.value, 10) || 0));
      el.value = v;
      App.settings.newPerDay = v;
      await DB.setSetting('newPerDay', v);
      App.toast('Gespeichert');
    } else if (el.dataset.setting === 'retention') {
      App.settings.retention = parseFloat(el.value);
      await DB.setSetting('retention', App.settings.retention);
      App.toast('Gespeichert – gilt ab der nächsten Bewertung');
    } else if (el.dataset.action === 'import' && el.files && el.files[0]) {
      await importProgress(el.files[0]);
      el.value = '';
      viewSettings();
    }
  });

  /* ---------- Routing ---------- */

  function parts() {
    return location.hash.replace(/^#\/?/, '').split('/').map((p) => decodeURIComponent(p));
  }
  function currentView() { return parts()[0] || ''; }
  function currentArg() { return parts()[1] || ''; }

  function route() {
    const [view, arg] = parts();
    Learn.stop();
    const v = view || 'home';
    document.body.dataset.view = v;
    document.querySelectorAll('#tabbar a').forEach((a) => {
      const on = a.dataset.tab === v || (a.dataset.tab === 'home' && (v === 'fach' || v === 'mix'));
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (view === 'fach') viewDeck(arg);
    else if (view === 'mix') viewMix();
    else if (view === 'lernen') Learn.start(arg, 'sr');
    else if (view === 'klausur') Learn.start(arg, 'klausur');
    else if (view === 'statistik') Stats.view($app);
    else if (view === 'einstellungen') viewSettings();
    else viewHome();
    window.scrollTo(0, 0);
  }
  App.route = route;
  App.$app = $app;

  let lastDeckLoad = 0;
  const DECK_REFRESH_MS = 5 * 60 * 1000;

  async function init(reload) {
    App.loadError = null;
    try { await loadDecks(); lastDeckLoad = Date.now(); } catch (e) { App.loadError = e.message || String(e); }
    if (!reload) await loadProgress();
    route();
  }

  window.addEventListener('hashchange', route);
  // Zurück im Vordergrund (installierte App bleibt oft tagelang offen):
  // Decks neu laden, damit neue Karten ankommen – aber nie mitten in einer Lernsitzung.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || ['lernen', 'klausur'].includes(currentView())) return;
    if (Date.now() - lastDeckLoad > DECK_REFRESH_MS) init(true);
    else route();
  });

  setTheme(getTheme());
  init(false).catch((e) => {
    $app.innerHTML = '<section class="panel error"><h2>Fehler beim Start</h2><p>' + esc(e.message || e) + '</p></section>';
  });

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service Worker:', e));
  }
})();
