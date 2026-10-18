/*
 * Statistik: Lernserie, Karten pro Tag, Trefferquote, Kartenreife, schwierigste Karten.
 */
(function () {
  'use strict';

  const { esc, rich } = window.Render;

  function perDayMap() {
    const m = new Map();
    App.log.forEach((l) => {
      const k = FSRS.dayKey(l.ts);
      m.set(k, (m.get(k) || 0) + 1);
    });
    return m;
  }

  function streaks(days) {
    const now = Date.now();
    let d = FSRS.dayStart(now);
    if (!days.has(FSRS.dayKey(d))) d = FSRS.addDays(d, -1); // heute noch nicht gelernt → Serie zählt bis gestern
    let current = 0;
    while (days.has(FSRS.dayKey(d))) { current++; d = FSRS.addDays(d, -1); }

    let longest = 0;
    let run = 0;
    let prev = null;
    [...days.keys()].sort().forEach((k) => {
      const [y, m, dd] = k.split('-').map(Number);
      const noon = new Date(y, m - 1, dd, 12).getTime();
      run = prev !== null && FSRS.dayKey(FSRS.addDays(prev, 1)) === k ? run + 1 : 1;
      longest = Math.max(longest, run);
      prev = noon;
    });
    return { current, longest };
  }

  function summary() {
    const days = perDayMap();
    return { streak: streaks(days).current, today: days.get(FSRS.dayKey(Date.now())) || 0 };
  }

  /** Die n schwierigsten Karten: FSRS-Schwierigkeit, sonst Nochmal-Quote; danach Anzahl "Nochmal". */
  function hardest(n) {
    const agg = new Map();
    App.log.forEach((l) => {
      const a = agg.get(l.cardId) || { n: 0, again: 0 };
      a.n++;
      if (l.rating === 1) a.again++;
      agg.set(l.cardId, a);
    });
    const rows = [];
    agg.forEach((a, id) => {
      const k = App.byId.get(id);
      if (!k) return; // Karte existiert nicht mehr im Deck
      const p = App.progress.get(id);
      const d = p && p.state !== 0 ? p.difficulty : 1 + 9 * (a.again / a.n);
      rows.push({ k, d, again: a.again, n: a.n, lapses: p ? p.lapses : 0 });
    });
    rows.sort((x, y) => y.d - x.d || y.again - x.again || y.lapses - x.lapses);
    return rows.slice(0, n);
  }

  function view($app) {
    const days = perDayMap();
    const st = streaks(days);
    const now = Date.now();
    const today = FSRS.dayStart(now);

    // Karten pro Tag, letzte 30 Tage
    const bars = [];
    for (let i = 29; i >= 0; i--) {
      const ts = FSRS.addDays(today, -i);
      const key = FSRS.dayKey(ts);
      bars.push({ ts, key, n: days.get(key) || 0 });
    }
    const max = Math.max(1, ...bars.map((b) => b.n));
    const sum30 = bars.reduce((s, b) => s + b.n, 0);
    const active30 = bars.filter((b) => b.n).length;

    // Trefferquote bei Wiederholungen (Modus sr, Karte war im Wiederholungs-Zustand), 30 Tage
    const since = FSRS.addDays(today, -29);
    const rev = App.log.filter((l) => l.mode === 'sr' && l.state === FSRS.State.Review && l.ts >= since);
    const retention = rev.length ? Math.round(rev.filter((l) => l.rating > 1).length / rev.length * 100) : null;

    // Kartenreife je Fach
    const reife = App.decks.map((d) => {
      const c = { neu: 0, lernen: 0, jung: 0, reif: 0 };
      d.karten.forEach((k) => {
        const p = App.progress.get(k.id);
        if (!p || p.state === 0) c.neu++;
        else if (p.state !== 2) c.lernen++;
        else if (p.stability >= 21) c.reif++;
        else c.jung++;
      });
      return { d, c, total: d.karten.length || 1 };
    });

    const hard = hardest(10);
    const wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

    $app.innerHTML = `
      <h1 class="page-title">Statistik</h1>
      <div class="stat-grid">
        <div>${App.flame}<b>${st.current}</b><span>Tage Serie</span></div>
        <div><b>${st.longest}</b><span>längste Serie</span></div>
        <div><b>${days.get(FSRS.dayKey(now)) || 0}</b><span>heute</span></div>
        <div><b>${retention === null ? '–' : retention + ' %'}</b><span>Trefferquote 30 T</span></div>
      </div>

      <h2 class="section-title">Karten pro Tag</h2>
      <section class="panel">
        <div class="bars" role="img" aria-label="Bewertungen pro Tag in den letzten 30 Tagen">
          ${bars.map((b, i) => {
            const dt = new Date(b.ts);
            const label = wd[dt.getDay()] + ' ' + dt.getDate() + '.' + (dt.getMonth() + 1) + '.: ' + b.n + ' Karten';
            const showDay = i % 5 === 4 || i === 29;
            return `<div class="bar-col" title="${label}"><div class="bar${b.n ? '' : ' zero'}" style="height:${b.n ? Math.max(4, b.n / max * 100) : 2}%">${b.n && b.n === max ? `<span class="bar-max">${b.n}</span>` : ''}</div><span class="bar-day">${showDay ? dt.getDate() + '.' : ''}</span></div>`;
          }).join('')}
        </div>
        <p class="muted small">30 Tage: ${sum30} Bewertungen an ${active30} Tagen · Ø ${active30 ? Math.round(sum30 / active30) : 0} pro Lerntag · insgesamt ${App.log.length}</p>
      </section>

      <h2 class="section-title">Kartenreife</h2>
      <section class="panel">
        ${reife.length ? reife.map(({ d, c, total }) => `
          <div class="reife">
            <div class="reife-head"><span>${esc(d.titel)}</span><span class="muted small">${c.reif} reif · ${c.jung} jung · ${c.lernen} lernen · ${c.neu} neu</span></div>
            <div class="stack" aria-hidden="true">
              <span class="s-reif" style="width:${c.reif / total * 100}%"></span><span class="s-jung" style="width:${c.jung / total * 100}%"></span><span class="s-lernen" style="width:${c.lernen / total * 100}%"></span>
            </div>
          </div>`).join('') : '<p class="muted">Keine Decks.</p>'}
        <p class="muted small">reif = Stabilität ≥ 21 Tage</p>
      </section>

      <h2 class="section-title">Die 10 schwierigsten Karten</h2>
      <section class="panel">
        ${hard.length ? `<ol class="hard-list">${hard.map((h) => `
          <li>
            <details>
              <summary><span class="rich">${rich(h.k.frage)}</span></summary>
              <div class="rich answer">${rich(h.k.antwort)}</div>
            </details>
            <div class="meta">${esc(App.deck(h.k.fach) ? App.deck(h.k.fach).titel : h.k.fach)} · Schwierigkeit ${h.d.toFixed(1).replace('.', ',')}/10 · ${h.again}× Nochmal bei ${h.n} Bewertungen</div>
          </li>`).join('')}</ol>` : '<p class="muted">Noch keine Bewertungen.</p>'}
      </section>`;
  }

  window.Stats = { summary, view, hardest };
})();
