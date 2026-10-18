/*
 * Speicher in IndexedDB.
 *   cards    – Lernstand pro Karten-ID (nur Karten, die schon einmal bewertet wurden)
 *   log      – jede einzelne Bewertung (für Statistik und Rückgängig)
 *   settings – Einstellungen { key, value }
 */
(function () {
  'use strict';

  const NAME = 'active-recall';
  const VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('log')) {
          const log = db.createObjectStore('log', { keyPath: 'id' });
          log.createIndex('ts', 'ts');
          log.createIndex('cardId', 'cardId');
        }
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  const done = (req) => new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });

  /** Führt fn(stores) in einer Transaktion aus und wartet auf deren Abschluss. */
  async function tx(names, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(names, mode);
      const stores = {};
      [].concat(names).forEach((n) => { stores[n] = t.objectStore(n); });
      let result;
      try { result = fn(stores); } catch (e) { t.abort(); reject(e); return; }
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  async function getAll(name) {
    const db = await open();
    return done(db.transaction(name).objectStore(name).getAll());
  }

  async function getSettings() {
    const rows = await getAll('settings');
    const out = {};
    rows.forEach((r) => { out[r.key] = r.value; });
    return out;
  }
  function setSetting(key, value) {
    return tx('settings', 'readwrite', (s) => s.settings.put({ key, value }));
  }

  /** Speichert neuen Kartenstand und Protokolleintrag gemeinsam (atomar). */
  function saveReview(card, entry) {
    return tx(['cards', 'log'], 'readwrite', (s) => {
      if (card) s.cards.put(card);
      s.log.put(entry);
    });
  }
  /**
   * Macht eine Bewertung rückgängig: Log-Eintrag entfernen und – falls restore angegeben –
   * den alten Kartenstand zurückschreiben (bzw. löschen, wenn die Karte vorher neu war).
   */
  function undoReview(logId, restore) {
    return tx(['cards', 'log'], 'readwrite', (s) => {
      if (restore) {
        if (restore.prev) s.cards.put(restore.prev); else s.cards.delete(restore.id);
      }
      s.log.delete(logId);
    });
  }

  async function exportAll() {
    const [cards, log, settings] = await Promise.all([getAll('cards'), getAll('log'), getAll('settings')]);
    return {
      format: 'active-recall-fortschritt',
      version: 1,
      exportiert: new Date().toISOString(),
      cards, log, settings,
    };
  }

  /**
   * Führt einen Export mit dem lokalen Stand zusammen:
   *  - pro Karte gewinnt der Stand mit der jüngeren letzten Wiederholung
   *  - Protokolle werden vereinigt (gleiche IDs = gleicher Eintrag)
   *  - Einstellungen des Geräts bleiben unverändert
   */
  async function importMerge(data) {
    if (!data || data.format !== 'active-recall-fortschritt' || !Array.isArray(data.cards) || !Array.isArray(data.log)) {
      throw new Error('Keine gültige Fortschritts-Datei.');
    }
    const local = new Map((await getAll('cards')).map((c) => [c.id, c]));
    const localLog = new Set((await getAll('log')).map((l) => l.id));
    let cardsTaken = 0;
    let logAdded = 0;
    await tx(['cards', 'log'], 'readwrite', (s) => {
      data.cards.forEach((c) => {
        if (!c || typeof c.id !== 'string') return;
        const mine = local.get(c.id);
        if (!mine || (c.last_review || 0) > (mine.last_review || 0)) { s.cards.put(c); cardsTaken++; }
      });
      data.log.forEach((l) => {
        if (!l || typeof l.id !== 'string' || localLog.has(l.id)) return;
        s.log.put(l);
        logAdded++;
      });
    });
    return { cardsTaken, logAdded };
  }

  function resetProgress() {
    return tx(['cards', 'log'], 'readwrite', (s) => { s.cards.clear(); s.log.clear(); });
  }

  window.DB = { open, getAll, getSettings, setSetting, saveReview, undoReview, exportAll, importMerge, resetProgress };
})();
