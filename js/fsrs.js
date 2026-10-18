/*
 * FSRS-5 Scheduler (Free Spaced Repetition Scheduler)
 * Formeln nach open-spaced-repetition/fsrs4anki (FSRS-5), Standard-Parameter.
 *
 * Kartenzustand (wird in IndexedDB gespeichert):
 *   { id, state, due, stability, difficulty, reps, lapses, step, last_review, scheduledDays }
 *   state: 0 = neu, 1 = lernen, 2 = wiederholen, 3 = neu lernen (nach "Nochmal")
 *   due:   Zeitstempel (ms). Wiederholungen werden auf 04:00 Uhr des Zieltags gelegt.
 */
(function () {
  'use strict';

  const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575,
    0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
  const DECAY = -0.5;
  const FACTOR = 19 / 81; // so gewählt, dass R(t = S) = 90 %
  const MIN = 60 * 1000;
  const DAY = 24 * 60 * MIN;
  const DAY_START_HOUR = 4; // Lerntag beginnt um 04:00 – wer nach Mitternacht lernt, zählt noch zum Vortag

  const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 };
  const State = { New: 0, Learning: 1, Review: 2, Relearning: 3 };

  const DEFAULTS = {
    retention: 0.9,       // gewünschte Abrufwahrscheinlichkeit beim Fälligwerden
    maxInterval: 3650,    // Tage
    learnSteps: [1, 10],  // Minuten (neue Karten)
    relearnSteps: [10],   // Minuten (vergessene Karten)
    fuzz: true,
    random: Math.random,
  };

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  /* ---------- Lerntage ---------- */
  function dayStart(ts) {
    const d = new Date(ts - DAY_START_HOUR * 3600 * 1000);
    d.setHours(DAY_START_HOUR, 0, 0, 0);
    return d.getTime();
  }
  function addDays(ts, n) {
    const d = new Date(ts);
    d.setDate(d.getDate() + n);
    return d.getTime();
  }
  function dayKey(ts) {
    const d = new Date(ts - DAY_START_HOUR * 3600 * 1000);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ---------- FSRS-5 Formeln ---------- */
  function retrievability(elapsedDays, s) {
    return Math.pow(1 + FACTOR * elapsedDays / s, DECAY);
  }
  function initStability(g) {
    return Math.max(W[g - 1], 0.1);
  }
  function initDifficulty(g) {
    return W[4] - Math.exp(W[5] * (g - 1)) + 1;
  }
  function nextDifficulty(d, g) {
    const delta = -W[6] * (g - 3);
    const damped = d + delta * (10 - d) / 9;               // lineare Dämpfung Richtung 10
    const reverted = W[7] * initDifficulty(4) + (1 - W[7]) * damped; // Rückkehr zum Mittelwert
    return clamp(reverted, 1, 10);
  }
  function recallStability(d, s, r, g) {
    const hardPenalty = g === Rating.Hard ? W[15] : 1;
    const easyBonus = g === Rating.Easy ? W[16] : 1;
    return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) *
      (Math.exp((1 - r) * W[10]) - 1) * hardPenalty * easyBonus);
  }
  function forgetStability(d, s, r) {
    return W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]);
  }
  function shortTermStability(s, g) {
    return s * Math.exp(W[17] * (g - 3 + W[18]));
  }
  function intervalDays(s, o) {
    const ivl = s / FACTOR * (Math.pow(o.retention, 1 / DECAY) - 1);
    return clamp(Math.round(ivl), 1, o.maxInterval);
  }
  function fuzz(ivl, o) {
    if (!o.fuzz || ivl < 3) return ivl;
    const d = Math.max(1, Math.round(ivl * 0.05));
    return ivl + Math.floor(o.random() * (2 * d + 1)) - d;
  }

  /* ---------- Planung ---------- */
  function newCard(id) {
    return { id, state: State.New, due: 0, stability: 0, difficulty: 0, reps: 0, lapses: 0, step: 0, last_review: 0, scheduledDays: 0 };
  }

  function toReview(c) {
    c.state = State.Review;
    c.step = 0;
    c.scheduledDays = null; // wird in preview() gesetzt (Fuzz + Reihenfolge)
    return c;
  }
  function toStep(c, state, steps, i, now) {
    if (!steps.length) return toReview(c);
    c.state = state;
    c.step = i;
    c.scheduledDays = 0;
    c.due = now + steps[i] * MIN;
    return c;
  }

  function schedule(card, g, now, o) {
    const c = Object.assign({}, card);
    const prev = card.state;
    const sameDay = card.last_review > 0 && dayKey(card.last_review) === dayKey(now);
    const elapsed = card.last_review > 0 ? Math.max(0, (now - card.last_review) / DAY) : 0;

    // Stabilität und Schwierigkeit
    if (prev === State.New) {
      c.difficulty = clamp(initDifficulty(g), 1, 10);
      c.stability = initStability(g);
    } else {
      const r = retrievability(elapsed, card.stability);
      c.difficulty = nextDifficulty(card.difficulty, g);
      if (sameDay) c.stability = shortTermStability(card.stability, g);
      else if (g === Rating.Again) c.stability = Math.min(forgetStability(card.difficulty, card.stability, r), card.stability);
      else c.stability = recallStability(card.difficulty, card.stability, r, g);
    }
    c.stability = Math.max(c.stability, 0.01);
    c.reps = card.reps + 1;
    c.last_review = now;

    // Zustandsübergang
    if (prev === State.Review) {
      if (g === Rating.Again) {
        c.lapses = card.lapses + 1;
        return toStep(c, State.Relearning, o.relearnSteps, 0, now);
      }
      return toReview(c);
    }
    const relearn = prev === State.Relearning;
    const steps = relearn ? o.relearnSteps : o.learnSteps;
    const st = relearn ? State.Relearning : State.Learning;
    const step = prev === State.New ? 0 : Math.min(card.step, Math.max(0, steps.length - 1));

    if (g === Rating.Easy || !steps.length) return toReview(c);
    if (g === Rating.Again) return toStep(c, st, steps, 0, now);
    if (g === Rating.Hard) {
      // wie Anki: erster Schritt → Mittelwert der ersten beiden, einziger Schritt → 1,5-fach
      const delay = step === 0 && steps.length > 1 ? (steps[0] + steps[1]) / 2
        : steps.length === 1 ? steps[0] * 1.5 : steps[step];
      c.state = st;
      c.step = step;
      c.scheduledDays = 0;
      c.due = now + delay * MIN;
      return c;
    }
    // Gut
    if (step + 1 >= steps.length) return toReview(c);
    return toStep(c, st, steps, step + 1, now);
  }

  /**
   * Berechnet das Ergebnis für alle vier Bewertungen.
   * Rückgabe: { 1: Karte, 2: Karte, 3: Karte, 4: Karte }
   */
  function preview(card, now, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const res = {};
    for (const g of [1, 2, 3, 4]) {
      res[g] = schedule(card, g, now, o);
      if (res[g].state === State.Review) res[g].scheduledDays = fuzz(intervalDays(res[g].stability, o), o);
    }
    // Reihenfolge erzwingen: Schwer ≤ Gut < Einfach
    const rev = (g) => res[g].state === State.Review;
    if (rev(2) && rev(3)) {
      res[2].scheduledDays = Math.min(res[2].scheduledDays, res[3].scheduledDays);
      res[3].scheduledDays = Math.max(res[3].scheduledDays, res[2].scheduledDays + 1);
    }
    if (rev(3) && rev(4)) res[4].scheduledDays = Math.max(res[4].scheduledDays, res[3].scheduledDays + 1);
    const today = dayStart(now);
    for (const g of [1, 2, 3, 4]) {
      if (rev(g)) {
        res[g].scheduledDays = clamp(res[g].scheduledDays, 1, o.maxInterval);
        res[g].due = addDays(today, res[g].scheduledDays);
      }
    }
    return res;
  }

  function isDue(card, now) {
    return card.state !== State.New && card.due <= now;
  }

  /** Kurzlabel für den Abstand bis zur nächsten Wiederholung. */
  function fmtInterval(card, now) {
    if (card.state === State.Review) return fmtDays(card.scheduledDays);
    const m = Math.max(1, Math.round((card.due - now) / MIN));
    return m < 60 ? m + ' min' : Math.round(m / 60) + ' h';
  }
  function fmtDays(d) {
    if (d < 30) return d + ' T';
    if (d < 365) return (d / 30).toFixed(1).replace('.', ',').replace(',0', '') + ' Mon';
    return (d / 365).toFixed(1).replace('.', ',').replace(',0', '') + ' J';
  }

  window.FSRS = {
    W, Rating, State, DEFAULTS, MIN, DAY,
    newCard, preview, isDue, retrievability,
    dayKey, dayStart, addDays, fmtInterval, fmtDays,
  };
})();
