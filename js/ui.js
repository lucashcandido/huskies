// Kleine UI-Helfer: Escaping, Modals, Toasts, Downloads

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/**
 * Öffnet ein Modal. `body` ist HTML, `buttons` eine Liste
 * {label, cls, onClick(close, root) → false verhindert Schließen, left}
 */
export function modal({ title, body, buttons = [], width = 860, onOpen }) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal" style="max-width:${width}px">
    <div class="modal-head"><h2>${esc(title)}</h2><button class="ghost sm" data-x>✕</button></div>
    <div class="modal-body">${body}</div>
    ${buttons.length ? '<div class="modal-foot"></div>' : ''}
  </div>`;
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  ov.querySelector('[data-x]').onclick = close;
  const foot = ov.querySelector('.modal-foot');
  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    if (b.cls) btn.className = b.cls;
    if (b.left) btn.classList.add('left');
    btn.onclick = () => { if (!b.onClick || b.onClick(close, ov) !== false) close(); };
    foot.appendChild(btn);
  });
  document.body.appendChild(ov);
  onOpen?.(ov, close);
  const first = ov.querySelector('input,select,textarea');
  if (first) setTimeout(() => first.focus(), 30);
  return { root: ov, close };
}

export function confirmDialog(text, onYes, yesLabel = 'Löschen') {
  modal({
    title: 'Bitte bestätigen', width: 440,
    body: `<p>${esc(text)}</p>`,
    buttons: [{ label: 'Abbrechen', cls: 'ghost' }, { label: yesLabel, cls: 'danger', onClick: () => { onYes(); } }],
  });
}

export function download(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function pickFile(accept = '.json') {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept;
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsText(f);
    };
    inp.click();
  });
}

export function options(list, selected, { empty } = {}) {
  let html = empty !== undefined ? `<option value="">${esc(empty)}</option>` : '';
  for (const o of list) {
    const v = typeof o === 'object' ? o.value : o;
    const l = typeof o === 'object' ? o.label : o;
    html += `<option value="${esc(v)}" ${String(v) === String(selected ?? '') ? 'selected' : ''}>${esc(l)}</option>`;
  }
  return html;
}

/** Mini-Liniendiagramm als SVG-String */
export function sparkline(values, { better } = {}) {
  const pts = values.filter(v => v !== null && v !== undefined);
  if (pts.length < 2) return '<svg viewBox="0 0 100 40"></svg>';
  const min = Math.min(...pts), max = Math.max(...pts), span = (max - min) || 1;
  const coords = pts.map((v, i) => [i / (pts.length - 1) * 96 + 2, 36 - (v - min) / span * 32]);
  const first = pts[0], last = pts[pts.length - 1];
  const improved = better === 'low' ? last < first : better === 'high' ? last > first : null;
  const color = improved === null ? '#c7ccd4' : improved ? '#2ecc71' : '#e74c3c';
  const d = coords.map((c, i) => (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ');
  const dots = coords.map(c => `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="1.8" fill="${color}"/>`).join('');
  return `<svg viewBox="0 0 100 40" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>${dots}</svg>`;
}
