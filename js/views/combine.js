import { db, upsert, uid } from '../store.js?v=202611211159';
import { METRICS, METRIC, POSITIONS, fullName, latestValue, bestValue, fmtMetric, parseNum, plausibility, today, fmtDate } from '../metrics.js?v=202611211159';
import { esc, options, toast } from '../ui.js?v=202611211159';
import { scoped } from '../team.js?v=202611211159';

const view = { date: today(), pos: '', mode: 'station', metric: 'forty', q: '' };

export function render(root) {
  const s = db();
  root.innerHTML = `
    <div class="page-head">
      <div><a href="#/athletes" class="small">← Athleten</a><h1>Combine erfassen</h1>
      <p class="muted">Schnelle Erfassung am Platz. Jeder Wert wird sofort gespeichert – <span class="kbd">Enter</span> springt zur nächsten Person.</p></div>
    </div>
    <div class="toolbar">
      <div class="field"><label>Datum</label><input type="date" id="date" value="${view.date}"></div>
      <div class="field"><label>Position</label><select id="pos">${options(POSITIONS, view.pos, { empty: 'Alle' })}</select></div>
      <div class="field grow"><label>Suche</label><input id="q" value="${esc(view.q)}" placeholder="Name …"></div>
      <div class="field"><label>Modus</label><div class="seg" id="mode">
        <button data-m="station" class="${view.mode === 'station' ? 'on' : ''}">Station (1 Test)</button>
        <button data-m="table" class="${view.mode === 'table' ? 'on' : ''}">Tabelle (alle Tests)</button>
      </div></div>
    </div>
    <div id="metricBar" class="toolbar"></div>
    <div id="body"></div>`;

  const draw = () => drawBody(root);
  root.querySelector('#date').onchange = e => { view.date = e.target.value || today(); draw(); };
  root.querySelector('#pos').onchange = e => { view.pos = e.target.value; draw(); };
  root.querySelector('#q').oninput = e => { view.q = e.target.value; draw(); };
  root.querySelectorAll('#mode button').forEach(b => b.onclick = () => {
    view.mode = b.dataset.m;
    root.querySelectorAll('#mode button').forEach(x => x.classList.toggle('on', x === b));
    draw();
  });
  draw();
}

function athletesInScope() {
  const s = db();
  let list = scoped('athletes');
  if (view.pos) list = list.filter(a => a.position === view.pos);
  const q = view.q.trim().toLowerCase();
  if (q) list = list.filter(a => fullName(a).toLowerCase().includes(q));
  return list.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
}

function measurementOn(a, date) { return (a.measurements || []).find(m => m.date === date); }

function setValue(athleteId, key, value) {
  const a = db().athletes.find(x => x.id === athleteId);
  if (!a) return;
  a.measurements = a.measurements || [];
  let m = measurementOn(a, view.date);
  if (!m) { // feste ID pro Messtag: so landen Werte mehrerer Coaches im selben Datensatz
    m = { id: a.measurements.some(x => x.id === 'm_' + view.date) ? uid('m') : 'm_' + view.date, date: view.date }; a.measurements.push(m); }
  m[key] = value;
  if (METRICS.every(x => m[x.key] === null || m[x.key] === undefined)) a.measurements = a.measurements.filter(x => x !== m);
  upsert('athletes', a);
}

function drawBody(root) {
  const bar = root.querySelector('#metricBar');
  const body = root.querySelector('#body');
  const list = athletesInScope();
  if (!scoped('athletes').length) {
    bar.innerHTML = '';
    body.innerHTML = `<div class="empty">Noch keine Athlet:innen – lege sie zuerst unter <a href="#/athletes">Athleten</a> an.</div>`;
    return;
  }

  if (view.mode === 'station') {
    bar.innerHTML = `<div class="seg" style="flex-wrap:wrap">${METRICS.map(m =>
      `<button data-k="${m.key}" class="${view.metric === m.key ? 'on' : ''}">${m.short}</button>`).join('')}</div>
      <span class="muted small" id="progress"></span>`;
    bar.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { view.metric = b.dataset.k; drawBody(root); });
    const m = METRIC[view.metric];
    body.innerHTML = `<div class="station-list">${list.map(a => {
      const cur = measurementOn(a, view.date)?.[m.key];
      const prev = previousValue(a, m.key);
      return `<div class="station-row ${cur != null ? 'done' : ''}" data-id="${a.id}">
        <div class="who"><b>${esc(fullName(a))}</b><span class="small muted">${esc(a.position || '')}</span></div>
        <div class="prev small muted">${prev ? `zuletzt<br>${fmtMetric(m.key, prev.value)} ${m.unit}` : ''}</div>
        <input inputmode="decimal" enterkeyhint="next" value="${cur ?? ''}" placeholder="${m.unit}" aria-label="${esc(m.label)}">
      </div>`;
    }).join('')}</div>
    ${!list.length ? '<div class="empty">Keine Athlet:innen in dieser Auswahl.</div>' : ''}`;
    const inputs = [...body.querySelectorAll('.station-row input')];
    const updateProgress = () => {
      const done = body.querySelectorAll('.station-row.done').length;
      const p = bar.querySelector('#progress'); if (p) p.textContent = `${done} / ${list.length} erfasst · ${fmtDate(view.date)}`;
    };
    inputs.forEach((inp, i) => {
      const row = inp.closest('.station-row');
      const commit = () => {
        const v = parseNum(inp.value);
        if (inp.value.trim() && v === null) { inp.style.borderColor = 'var(--red)'; return; }
        const warn = plausibility(m.key, v);
        inp.style.borderColor = warn ? 'var(--yellow)' : '';
        inp.title = warn || '';
        const before = measurementOn(db().athletes.find(a => a.id === row.dataset.id), view.date)?.[m.key] ?? null;
        if (before === v) return;
        setValue(row.dataset.id, m.key, v);
        row.classList.toggle('done', v !== null);
        updateProgress();
      };
      inp.onchange = commit;
      inp.onkeydown = e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); (inputs[i + 1] || inp).focus(); inputs[i + 1]?.select(); }
      };
    });
    updateProgress();
  } else {
    bar.innerHTML = `<span class="muted small">Messtag ${fmtDate(view.date)} · ${list.length} Athlet:innen</span>`;
    body.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Pos</th>${METRICS.map(m => `<th class="num">${m.short}<br><span style="text-transform:none">${m.unit}</span></th>`).join('')}</tr></thead>
      <tbody>${list.map(a => {
        const cur = measurementOn(a, view.date) || {};
        return `<tr data-id="${a.id}"><td><b>${esc(fullName(a))}</b></td><td>${esc(a.position || '')}</td>
          ${METRICS.map(m => `<td class="num"><input inputmode="decimal" data-k="${m.key}" value="${cur[m.key] ?? ''}" placeholder="–"></td>`).join('')}</tr>`;
      }).join('')}</tbody></table></div>`;
    body.querySelectorAll('input[data-k]').forEach(inp => {
      inp.onchange = () => {
        const v = parseNum(inp.value);
        if (inp.value.trim() && v === null) { inp.style.borderColor = 'var(--red)'; return; }
        const warn = plausibility(inp.dataset.k, v);
        inp.style.borderColor = warn ? 'var(--yellow)' : '';
        inp.title = warn || '';
        setValue(inp.closest('tr').dataset.id, inp.dataset.k, v);
      };
      inp.onkeydown = e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const td = inp.closest('td'), tr = td.closest('tr');
          const idx = [...tr.children].indexOf(td);
          tr.nextElementSibling?.children[idx]?.querySelector('input')?.focus();
        }
      };
    });
  }
}

/** Letzter Wert vor dem gewählten Messtag (zum Vergleichen) */
function previousValue(a, key) {
  const before = (a.measurements || []).filter(m => m.date < view.date && m[key] !== null && m[key] !== undefined)
    .sort((x, y) => x.date.localeCompare(y.date));
  const m = before.pop();
  return m ? { value: m[key], date: m.date } : null;
}

export { toast };
