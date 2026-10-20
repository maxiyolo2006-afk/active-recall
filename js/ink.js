/*
 * Zeichenfläche für Rechenaufgaben (Apple Pencil, Stift, Finger, Maus).
 *   - Druckstärke des Stifts → Strichbreite
 *   - Handballen-Erkennung: sobald einmal ein Stift benutzt wurde, zeichnen Finger nicht mehr,
 *     sondern scrollen die Seite
 *   - Radierer, Strich zurück, Leeren (Leeren ist mit „Strich zurück“ umkehrbar)
 *   - wächst nach unten mit, wenn man unten weiterschreibt
 * Die Striche liegen in einem Zustandsobjekt außerhalb der Fläche, damit sie ein Neuzeichnen
 * der Seite überstehen.
 */
(function () {
  'use strict';

  const START_H = 380;   // Anfangshöhe in CSS-Pixeln
  const GROW = 260;      // so viel wächst die Fläche, wenn man nahe am unteren Rand schreibt
  const GROW_ZONE = 70;
  const MAX_H = 4000;
  const PEN_W = 2.4;
  const ERASER_W = 22;
  const PEN_KEY = 'ar-pen-seen';

  let penSeen = false;
  try { penSeen = localStorage.getItem(PEN_KEY) === '1'; } catch (e) { /* egal */ }

  /** Neuer, leerer Zustand – pro Karte einer. */
  function newState() {
    return { strokes: [], h: START_H, cleared: null };
  }

  function inkColor() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
    return v || '#15171c';
  }

  function widthAt(s, p) {
    // Stift mit Druckinfo: dünn bei leichtem Druck, kräftig bei starkem
    return s.e ? s.w : s.pr ? s.w * (0.35 + 1.15 * p) : s.w;
  }

  /* Zeichnet einen Strich (geglättet über Mittelpunkte) – komplett oder ab Punkt `from`. */
  function drawStroke(ctx, s, color, from, finished) {
    const p = s.pts;
    ctx.globalCompositeOperation = s.e ? 'destination-out' : 'source-over';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (p.length === 1) {
      if (from > 0) return;
      ctx.beginPath();
      ctx.arc(p[0].x, p[0].y, widthAt(s, p[0].p) / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    for (let i = Math.max(1, from); i < p.length; i++) {
      const a = p[i - 1];
      const b = p[i];
      ctx.lineWidth = widthAt(s, (a.p + b.p) / 2);
      ctx.beginPath();
      if (i === 1) {
        ctx.moveTo(a.x, a.y);
        const m = mid(a, b);
        ctx.lineTo(m.x, m.y);
      } else {
        const m0 = mid(p[i - 2], a);
        const m1 = mid(a, b);
        ctx.moveTo(m0.x, m0.y);
        ctx.quadraticCurveTo(a.x, a.y, m1.x, m1.y);
      }
      ctx.stroke();
    }
    if (finished) {
      const a = p[p.length - 2];
      const b = p[p.length - 1];
      const m = mid(a, b);
      ctx.lineWidth = widthAt(s, b.p);
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  /**
   * Bindet eine Zeichenfläche an `root` (enthält <canvas> und Knöpfe mit data-ink="pen|eraser|undo|clear").
   * `state` stammt von Ink.newState() und wird direkt verändert.
   */
  function create(root, state, opts) {
    opts = opts || {};
    const canvas = root.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    let cssW = 0;
    let dpr = 1;
    let tool = 'pen';
    let active = null;      // { id, s, pen }
    let scroll = null;      // Finger-Scrollen nach Stift-Erkennung
    let lastPenUp = 0;
    let color = inkColor();

    function changed() {
      updateButtons();
      if (opts.onChange) opts.onChange();
    }

    function updateButtons() {
      root.querySelectorAll('[data-ink]').forEach((b) => {
        const k = b.dataset.ink;
        if (k === 'pen' || k === 'eraser') {
          b.classList.toggle('on', tool === k);
          b.setAttribute('aria-pressed', String(tool === k));
        } else if (k === 'undo') b.disabled = !state.strokes.length && !state.cleared;
        else if (k === 'clear') b.disabled = !state.strokes.length;
      });
      root.classList.toggle('eraser', tool === 'eraser');
    }

    function redraw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      color = inkColor();
      state.strokes.forEach((s) => drawStroke(ctx, s, color, 0, s !== (active && active.s)));
    }

    function resize() {
      const w = Math.round(root.querySelector('.ink-surface').clientWidth);
      if (!w) return; // versteckt
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      cssW = w;
      canvas.style.height = state.h + 'px';
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(state.h * dpr);
      redraw();
    }

    function grow() {
      if (state.h >= MAX_H) return;
      state.h = Math.min(MAX_H, state.h + GROW);
      resize();
    }

    function point(e, rect) {
      const pressure = e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5;
      return { x: Math.round((e.clientX - rect.left) * 10) / 10, y: Math.round((e.clientY - rect.top) * 10) / 10, p: Math.round(pressure * 100) / 100 };
    }

    function onDown(e) {
      if (e.pointerType === 'pen' && !penSeen) {
        penSeen = true;
        try { localStorage.setItem(PEN_KEY, '1'); } catch (err) { /* egal */ }
      }
      if (e.pointerType === 'touch') {
        // Mit Stift: Finger/Handballen zeichnen nicht, sondern scrollen
        if (penSeen || (active && active.pen)) {
          if (!active && !scroll && Date.now() - lastPenUp > 400) scroll = { id: e.pointerId, y: e.clientY, x: e.clientX, moved: false };
          return;
        }
      } else if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 5) return;
      if (e.pointerType === 'pen' && active && !active.pen) {
        // Handballen hat zuerst „gezeichnet“ – diesen Strich verwerfen
        const i = state.strokes.indexOf(active.s);
        if (i >= 0) state.strokes.splice(i, 1);
        active = null;
        redraw();
      }
      if (active) return;
      scroll = null;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
      const eraser = tool === 'eraser' || e.button === 5 || (e.buttons & 32) === 32;
      const rect = canvas.getBoundingClientRect();
      const s = { e: eraser ? 1 : 0, w: eraser ? ERASER_W : PEN_W, pr: e.pointerType === 'pen' && !eraser ? 1 : 0, pts: [point(e, rect)] };
      state.strokes.push(s);
      state.cleared = null;
      active = { id: e.pointerId, s, pen: e.pointerType === 'pen' };
      drawStroke(ctx, s, color, 0, false);
    }

    function onMove(e) {
      if (scroll && e.pointerId === scroll.id) {
        const dy = scroll.y - e.clientY;
        if (!scroll.moved && Math.abs(dy) < 8 && Math.abs(scroll.x - e.clientX) < 8) return;
        scroll.moved = true;
        scroll.y = e.clientY;
        scroll.x = e.clientX;
        window.scrollBy(0, dy);
        return;
      }
      if (!active || e.pointerId !== active.id) return;
      e.preventDefault();
      const s = active.s;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      const list = evs.length ? evs : [e];
      const from = s.pts.length;
      const rect = canvas.getBoundingClientRect(); // jedes Mal neu: robust, falls die Seite sich verschiebt
      let maxY = 0;
      list.forEach((ev) => {
        const pt = point(ev, rect);
        const last = s.pts[s.pts.length - 1];
        if (Math.abs(pt.x - last.x) + Math.abs(pt.y - last.y) < 0.6) return;
        s.pts.push(pt);
        maxY = Math.max(maxY, pt.y);
      });
      if (s.pts.length === from) return;
      if (maxY > state.h - GROW_ZONE && state.h < MAX_H) grow();
      else drawStroke(ctx, s, color, from, false);
    }

    function onUp(e) {
      if (scroll && e.pointerId === scroll.id) { scroll = null; return; }
      if (!active || e.pointerId !== active.id) return;
      const s = active.s;
      if (active.pen) lastPenUp = Date.now();
      active = null;
      if (e.type === 'pointercancel' && s.pts.length < 3) {
        // abgebrochene Mini-Berührung (z. B. Handballen) verwerfen
        state.strokes.splice(state.strokes.indexOf(s), 1);
        redraw();
      } else if (s.pts.length > 1) {
        drawStroke(ctx, s, color, s.pts.length, true); // nur das letzte Stück bis zum Endpunkt
      }
      changed();
    }

    function onTool(e) {
      const b = e.target.closest('[data-ink]');
      if (!b || !root.contains(b)) return;
      const k = b.dataset.ink;
      if (k === 'pen' || k === 'eraser') tool = k;
      else if (k === 'undo') pad.undo();
      else if (k === 'clear') pad.clear();
      changed();
    }

    // Systemgesten (Lupe, Kontextmenü, Textauswahl) über der Fläche unterbinden
    const stop = (e) => e.preventDefault();

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('contextmenu', stop);
    canvas.addEventListener('touchstart', stop, { passive: false });
    root.addEventListener('click', onTool);

    const ro = window.ResizeObserver ? new ResizeObserver(() => {
      const w = Math.round(root.querySelector('.ink-surface').clientWidth);
      if (w && w !== cssW) resize();
    }) : null;
    if (ro) ro.observe(root.querySelector('.ink-surface'));
    else window.addEventListener('resize', resize);

    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const onScheme = () => redraw();
    if (mq && mq.addEventListener) mq.addEventListener('change', onScheme);

    const pad = {
      isEmpty: () => !state.strokes.some((s) => !s.e),
      undo() {
        if (active) return;
        if (state.strokes.length) state.strokes.pop();
        else if (state.cleared) { state.strokes = state.cleared; state.cleared = null; }
        redraw();
        changed();
      },
      clear() {
        if (active || !state.strokes.length) return;
        state.cleared = state.strokes;
        state.strokes = [];
        redraw();
        changed();
      },
      setTool(t) { tool = t; changed(); },
      redraw: resize,
      /** Ausschnitt mit allen Strichen als PNG (data-URL), oder null wenn leer. */
      snapshot() {
        if (pad.isEmpty()) return null;
        let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
        state.strokes.forEach((s) => {
          if (s.e) return;
          const r = s.w * 1.6;
          s.pts.forEach((p) => { x0 = Math.min(x0, p.x - r); y0 = Math.min(y0, p.y - r); x1 = Math.max(x1, p.x + r); y1 = Math.max(y1, p.y + r); });
        });
        const padPx = 10;
        x0 = Math.max(0, Math.floor(x0 - padPx));
        y0 = Math.max(0, Math.floor(y0 - padPx));
        x1 = Math.ceil(x1 + padPx);
        y1 = Math.ceil(y1 + padPx);
        const w = x1 - x0;
        const h = y1 - y0;
        const scale = Math.min(2, window.devicePixelRatio || 1);
        const c = document.createElement('canvas');
        c.width = Math.round(w * scale);
        c.height = Math.round(h * scale);
        const g = c.getContext('2d');
        g.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
        const col = inkColor();
        state.strokes.forEach((s) => drawStroke(g, s, col, 0, true));
        return { src: c.toDataURL('image/png'), w, h };
      },
      destroy() {
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
        canvas.removeEventListener('contextmenu', stop);
        canvas.removeEventListener('touchstart', stop);
        root.removeEventListener('click', onTool);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
        if (mq && mq.removeEventListener) mq.removeEventListener('change', onScheme);
        active = null;
        scroll = null;
      },
    };

    resize();
    updateButtons();
    return pad;
  }

  window.Ink = { create, newState, get penSeen() { return penSeen; } };
})();
