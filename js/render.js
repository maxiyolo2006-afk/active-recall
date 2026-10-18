/*
 * Text mit Formeln in HTML umwandeln.
 *   Formeln:  $…$ / \(…\) inline,  $$…$$ / \[…\] abgesetzt,  \$ = Dollarzeichen
 *   Text:     **fett**, `code`, Zeilenumbrüche, Zeilen mit "- " werden zur Liste
 */
(function () {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

  function findClose(src, from, close) {
    let j = from;
    while ((j = src.indexOf(close, j)) !== -1) {
      if (close === '$' && src[j - 1] === '\\') { j++; continue; }
      return j;
    }
    return -1;
  }

  function tokenize(src) {
    const out = [];
    let buf = '';
    let i = 0;
    const flush = () => { if (buf) out.push({ math: false, v: buf }); buf = ''; };
    while (i < src.length) {
      if (src[i] === '\\' && src[i + 1] === '$') { buf += '$'; i += 2; continue; }
      let open = null;
      let close = null;
      let display = false;
      if (src.startsWith('$$', i)) { open = '$$'; close = '$$'; display = true; }
      else if (src.startsWith('\\[', i)) { open = '\\['; close = '\\]'; display = true; }
      else if (src.startsWith('\\(', i)) { open = '\\('; close = '\\)'; }
      else if (src[i] === '$') { open = '$'; close = '$'; }
      if (open) {
        const end = findClose(src, i + open.length, close);
        if (end > i + open.length) {
          flush();
          out.push({ math: true, v: src.slice(i + open.length, end), display });
          i = end + close.length;
          continue;
        }
      }
      buf += src[i];
      i++;
    }
    flush();
    return out;
  }

  function math(tex, display) {
    // Zeilenumbrüche im TeX sind nur Leerraum – entfernen, damit sie die Zeilenlogik unten nicht stören
    const t = tex.replace(/\s*\n\s*/g, ' ').trim();
    if (typeof katex === 'undefined') return '<code>' + esc(t) + '</code>';
    try {
      return katex.renderToString(t, { displayMode: display, throwOnError: false, strict: 'ignore' });
    } catch (e) {
      return '<code class="tex-err" title="' + esc(e.message) + '">' + esc(t) + '</code>';
    }
  }

  function text(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>');
  }

  /** Wandelt Kartentext in HTML um. */
  function rich(src) {
    if (src == null || src === '') return '';
    const html = tokenize(String(src)).map((t) => (t.math ? math(t.v, t.display) : text(t.v))).join('');
    let out = '';
    let inList = false;
    for (const line of html.split('\n')) {
      const m = line.match(/^\s*[-•]\s+(.*)$/);
      if (m) {
        if (!inList) { out += '<ul>'; inList = true; }
        out += '<li>' + m[1] + '</li>';
        continue;
      }
      if (inList) { out += '</ul>'; inList = false; }
      out += line.trim() === '' ? '<div class="gap"></div>' : '<div class="ln">' + line + '</div>';
    }
    if (inList) out += '</ul>';
    return out;
  }

  window.Render = { rich, esc };
})();
