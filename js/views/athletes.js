import { db, upsert, remove, uid } from '../store.js?v=202611211210';
import { METRICS, METRIC, POSITIONS, fullName, ageOf, metricValue, latestValue, fmt, fmtMetric, parseNum,
  plausibility, quartileClass, sortedMeasurements, today, fmtDate, bestValue } from '../metrics.js?v=202611211210';
import { esc, modal, toast, confirmDialog, options, sparkline } from '../ui.js?v=202611211210';
import { scoped, currentTeamId, teams } from '../team.js?v=202611211210';

const view = { q: '', pos: '', mode: 'latest', sort: 'name', dir: 1 };

export function render(root) {
  const s = db();
  root.innerHTML = `
    <div class="page-head">
      <div><h1>Athleten &amp; Messwerte</h1>
      <p class="muted">Stammdaten und Combine-Werte. Zeile anklicken für Verlauf und Bearbeitung.</p></div>
      <div class="spacer"></div>
      <a href="#/combine"><button>Combine erfassen</button></a>
      <button class="primary" id="addAth">+ Athlet:in</button>
    </div>
    <div class="stats" id="stats"></div>
    <div class="toolbar">
      <input class="grow" id="q" placeholder="Suche nach Name …" value="${esc(view.q)}">
      <select id="pos">${options(POSITIONS, view.pos, { empty: 'Alle Positionen' })}</select>
      <div class="seg" id="mode">
        <button data-m="latest" class="${view.mode === 'latest' ? 'on' : ''}">Aktuell</button>
        <button data-m="best" class="${view.mode === 'best' ? 'on' : ''}">Bestwert</button>
      </div>
    </div>
    <div id="list"></div>
    <p class="legend" style="margin-top:8px">Farben: <span class="q1">Top 25 %</span> · <span class="q2">2. Viertel</span> · <span class="q3">3. Viertel</span> · <span class="q4">unteres Viertel</span> – jeweils innerhalb der aktuellen Auswahl.</p>`;

  const draw = () => drawTable(root);
  root.querySelector('#q').oninput = e => { view.q = e.target.value; draw(); };
  root.querySelector('#pos').onchange = e => { view.pos = e.target.value; draw(); };
  root.querySelectorAll('#mode button').forEach(b => b.onclick = () => {
    view.mode = b.dataset.m;
    root.querySelectorAll('#mode button').forEach(x => x.classList.toggle('on', x === b));
    draw();
  });
  root.querySelector('#addAth').onclick = () => openAthlete(null, draw);
  draw();
}

function filtered() {
  const s = db();
  const q = view.q.trim().toLowerCase();
  let list = scoped('athletes');
  if (q) list = list.filter(a => fullName(a).toLowerCase().includes(q));
  if (view.pos) list = list.filter(a => a.position === view.pos);
  return list;
}

function drawTable(root) {
  const list = filtered();
  const statsEl = root.querySelector('#stats');
  const all = scoped('athletes');
  const measured = all.filter(a => (a.measurements || []).length).length;
  const lastDate = all.flatMap(a => (a.measurements || []).map(m => m.date)).sort().pop();
  statsEl.innerHTML = `
    <div class="stat"><div class="n">${all.length}</div><div class="l">Athlet:innen</div></div>
    <div class="stat"><div class="n">${measured}</div><div class="l">mit Messwerten</div></div>
    <div class="stat"><div class="n">${all.reduce((n, a) => n + (a.measurements || []).length, 0)}</div><div class="l">Messtage gesamt</div></div>
    <div class="stat"><div class="n" style="font-size:18px">${fmtDate(lastDate)}</div><div class="l">letzte Messung</div></div>`;

  const el = root.querySelector('#list');
  if (!all.length) {
    el.innerHTML = `<div class="empty">Noch keine Athlet:innen angelegt.<br><br>
      <button class="primary" id="emptyAdd">+ Erste:n Athlet:in anlegen</button>
      <p class="small">Zum Ausprobieren: oben rechts „⋯ Daten“ → „Beispieldaten laden“.</p></div>`;
    el.querySelector('#emptyAdd').onclick = () => openAthlete(null, () => drawTable(root));
    return;
  }

  const rows = list.map(a => {
    const r = { a, name: fullName(a), pos: a.position || '', age: ageOf(a) };
    METRICS.forEach(m => r[m.key] = metricValue(a, m.key, view.mode));
    r.last = sortedMeasurements(a).pop()?.date || '';
    return r;
  });
  const k = view.sort;
  rows.sort((x, y) => {
    const a = x[k], b = y[k];
    if (a === null || a === undefined || a === '') return 1;
    if (b === null || b === undefined || b === '') return -1;
    return (typeof a === 'string' ? a.localeCompare(b) : a - b) * view.dir;
  });
  const colVals = Object.fromEntries(METRICS.map(m => [m.key, rows.map(r => r[m.key]).filter(v => v !== null)]));

  const th = (key, label, num) => `<th class="sortable ${num ? 'num' : ''}" data-k="${key}">${label}${view.sort === key ? (view.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  el.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>${th('name', 'Name')}${th('pos', 'Pos')}${th('age', 'Alter', 1)}
      ${METRICS.map(m => th(m.key, `${m.short} <span style="text-transform:none">(${m.unit})</span>`, 1)).join('')}
      ${th('last', 'Letzter Test')}</tr></thead>
    <tbody>${rows.map(r => `<tr class="click" data-id="${r.a.id}">
      <td><b>${esc(r.name)}</b></td>
      <td>${r.pos ? `<span class="badge">${esc(r.pos)}</span>` : ''}</td>
      <td class="num">${r.age ?? '–'}</td>
      ${METRICS.map(m => `<td class="num ${quartileClass(m.key, r[m.key], colVals[m.key])}">${fmtMetric(m.key, r[m.key])}</td>`).join('')}
      <td class="muted">${fmtDate(r.last)}</td></tr>`).join('')}
    </tbody></table></div>
    ${!rows.length ? '<div class="empty" style="margin-top:10px">Keine Treffer für diesen Filter.</div>' : ''}`;

  el.querySelectorAll('th[data-k]').forEach(t => t.onclick = () => {
    if (view.sort === t.dataset.k) view.dir *= -1; else { view.sort = t.dataset.k; view.dir = 1; }
    drawTable(root);
  });
  el.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => {
    openAthlete(db().athletes.find(a => a.id === tr.dataset.id), () => drawTable(root));
  });
}

/** Detail-/Bearbeitungsdialog einer Athletin / eines Athleten */
export function openAthlete(existing, onDone) {
  const a = existing ? structuredClone(existing) : { id: uid('ath'), teamId: currentTeamId(), firstName: '', lastName: '', birthDate: '', age: null, position: '', notes: '', measurements: [] };
  const isNew = !existing;
  if (isNew) a.measurements.push({ id: 'm_' + today(), date: today() });

  const body = `
    <div class="grid">
      <div class="field"><label>Vorname</label><input id="fn" value="${esc(a.firstName)}"></div>
      <div class="field"><label>Nachname</label><input id="ln" value="${esc(a.lastName)}"></div>
      <div class="field"><label>Geburtsdatum</label><input id="bd" type="date" value="${esc(a.birthDate || '')}"></div>
      <div class="field"><label>Alter <span style="text-transform:none">(falls kein Geb.-Datum)</span></label><input id="age" type="number" min="5" max="60" value="${a.age ?? ''}"></div>
      <div class="field"><label>Trikotnummer</label><input id="num" inputmode="numeric" value="${esc(a.number ?? '')}"></div>
      <div class="field"><label>Position</label><select id="posSel">${options(POSITIONS, a.position, { empty: '–' })}</select></div>
      ${teams().length > 1 ? `<div class="field"><label>Team</label><select id="teamSel">${options(teams().map(t => ({ value: t.id, label: t.name })), a.teamId)}</select></div>` : ''}
      <div class="field full"><label>Notizen</label><textarea id="notes" rows="2">${esc(a.notes || '')}</textarea></div>
    </div>
    <div id="sparks"></div>
    <div class="section-title" style="display:flex;align-items:center;gap:8px">Messungen
      <span class="spacer" style="flex:1"></span><button class="sm" id="addM">+ Messtag</button></div>
    <div class="table-wrap"><table id="mt"></table></div>
    <div id="warn" class="small" style="color:var(--yellow);margin-top:6px"></div>`;

  const { root, close } = modal({
    title: isNew ? 'Neue:r Athlet:in' : fullName(a), width: 1000, body,
    buttons: [
      ...(isNew ? [] : [{ label: 'Löschen', cls: 'danger', left: true, onClick: () => {
        confirmDialog(`${fullName(a)} inklusive aller Messwerte löschen? Die Person wird auch aus Rostern und Personnel entfernt.`, () => {
          remove('athletes', a.id); toast('Gelöscht'); onDone?.(); });
        return true; } }]),
      { label: 'Abbrechen', cls: 'ghost' },
      { label: 'Speichern', cls: 'primary', onClick: () => save() },
    ],
  });

  const ageInput = root.querySelector('#age');
  const syncAge = () => {
    const bd = root.querySelector('#bd').value;
    ageInput.disabled = !!bd;
    if (bd) ageInput.value = ageOf({ birthDate: bd }) ?? '';
  };
  root.querySelector('#bd').oninput = syncAge;
  syncAge();

  function drawMeasurements() {
    const ms = a.measurements.sort((x, y) => (y.date || '').localeCompare(x.date || ''));
    root.querySelector('#mt').innerHTML = `
      <thead><tr><th>Datum</th>${METRICS.map(m => `<th class="num">${m.short}<br><span style="text-transform:none">${m.unit}</span></th>`).join('')}<th></th></tr></thead>
      <tbody>${ms.map(m => `<tr data-id="${m.id}">
        <td><input type="date" data-f="date" value="${esc(m.date || '')}" style="width:140px;text-align:left"></td>
        ${METRICS.map(x => `<td class="num"><input inputmode="decimal" data-f="${x.key}" value="${m[x.key] ?? ''}" placeholder="–"></td>`).join('')}
        <td><button class="sm danger" data-del>✕</button></td></tr>`).join('')}
      ${!ms.length ? `<tr><td colspan="${METRICS.length + 2}" class="muted">Noch keine Messungen.</td></tr>` : ''}</tbody>`;
    root.querySelectorAll('#mt tr[data-id]').forEach(tr => {
      const m = a.measurements.find(x => x.id === tr.dataset.id);
      tr.querySelectorAll('input').forEach(inp => inp.oninput = () => {
        const f = inp.dataset.f;
        m[f] = f === 'date' ? inp.value : parseNum(inp.value);
        drawSparks(); checkWarn();
      });
      tr.querySelector('[data-del]').onclick = () => { a.measurements = a.measurements.filter(x => x !== m); drawMeasurements(); drawSparks(); };
    });
  }

  function drawSparks() {
    const ms = sortedMeasurements(a);
    const el = root.querySelector('#sparks');
    if (ms.length === 0) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="section-title">Verlauf &amp; Bestwerte</div><div class="spark-grid">${METRICS.map(m => {
      const vals = ms.map(x => x[m.key]).filter(v => v !== null && v !== undefined && v !== '');
      const last = latestValue(a, m.key), best = bestValue(a, m.key);
      return `<div class="spark"><div class="t">${m.label}</div>
        <div class="v">${last ? fmtMetric(m.key, last.value) : '–'} <span class="small muted">${m.unit}</span></div>
        ${sparkline(vals, { better: m.better })}
        <div class="small muted">${m.better && best ? `Bestwert ${fmtMetric(m.key, best.value)} (${fmtDate(best.date)})` : `${vals.length} Messung(en)`}</div></div>`;
    }).join('')}</div>`;
  }

  function checkWarn() {
    const w = [];
    a.measurements.forEach(m => METRICS.forEach(x => { const p = plausibility(x.key, m[x.key]); if (p) w.push(p); }));
    root.querySelector('#warn').textContent = w.length ? '⚠ ' + w.join(' · ') : '';
  }

  root.querySelector('#addM').onclick = () => { a.measurements.push({ id: a.measurements.some(m => m.id === 'm_' + today()) ? uid('m') : 'm_' + today(), date: today() }); drawMeasurements(); };
  drawMeasurements(); drawSparks(); checkWarn();

  function save() {
    a.firstName = root.querySelector('#fn').value.trim();
    a.lastName = root.querySelector('#ln').value.trim();
    a.birthDate = root.querySelector('#bd').value;
    a.age = a.birthDate ? null : parseNum(ageInput.value);
    if (a.position !== root.querySelector('#posSel').value) a.depth = null;
    a.position = root.querySelector('#posSel').value;
    a.number = root.querySelector('#num').value.trim();
    a.notes = root.querySelector('#notes').value;
    if (root.querySelector('#teamSel')) a.teamId = root.querySelector('#teamSel').value;
    if (!a.firstName && !a.lastName) { alert('Bitte mindestens einen Namen eintragen.'); return false; }
    // Leere Messtage verwerfen
    a.measurements = a.measurements.filter(m => METRICS.some(x => m[x.key] !== null && m[x.key] !== undefined && m[x.key] !== ''));
    upsert('athletes', a);
    toast('Gespeichert');
    onDone?.();
  }
  return close;
}

/** CSV aller Messungen (Semikolon + Dezimalkomma für deutsches Excel) */
export function measurementsCSV() {
  const head = ['Nachname', 'Vorname', 'Position', 'Geburtsdatum', 'Alter am Messtag', 'Datum', ...METRICS.map(m => `${m.label} (${m.unit})`)];
  const lines = [head];
  for (const a of scoped('athletes')) {
    for (const m of sortedMeasurements(a)) {
      lines.push([a.lastName, a.firstName, a.position, a.birthDate || '', ageOf(a, m.date) ?? '', m.date,
        ...METRICS.map(x => m[x.key] === null || m[x.key] === undefined ? '' : String(m[x.key]).replace('.', ','))]);
    }
  }
  return '﻿' + lines.map(l => l.map(c => /[;"\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(';')).join('\r\n');
}

export { fmt };
