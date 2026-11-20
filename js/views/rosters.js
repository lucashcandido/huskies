// Roster = automatisch alle Athlet:innen des gewählten Teams.
// Trikotnummer, Position und Depth werden direkt am Spieler gespeichert.

import { upsert, get, persist } from '../store.js';
import { METRICS, METRIC, POSITIONS, fullName, ageOf, metricValue, fmtMetric, fmt } from '../metrics.js';
import { esc, toast, confirmDialog, options } from '../ui.js';
import { openAthlete } from './athletes.js';
import { scoped, currentTeam } from '../team.js';

const KEY_METRICS = ['forty', 'shuffle', 'maxVelocity', 'vertical', 'broad', 'weight'];
const view = { tab: 'list' };

/** Spieler in Depth-Reihenfolge (ohne Depth-Angabe: nach 40-yd-Zeit) */
export function depthOrder(list) {
  return [...list].sort((x, y) => ((x.depth || 999) - (y.depth || 999))
    || ((metricValue(x, 'forty') ?? 99) - (metricValue(y, 'forty') ?? 99))
    || (x.lastName || '').localeCompare(y.lastName || ''));
}

export function groupByPos(list) {
  const g = {};
  for (const a of list) (g[a.position || '–'] = g[a.position || '–'] || []).push(a);
  return g;
}

/** Übernimmt Nummer/Depth aus früher manuell angelegten Rostern einmalig an die Spieler */
function migrateOldRosters() {
  let changed = false;
  for (const r of scoped('rosters')) {
    for (const m of r.members || []) {
      const a = get('athletes', m.athleteId);
      if (!a) continue;
      if (!a.number && m.number) { a.number = m.number; changed = true; }
      if (!a.depth && m.depth) { a.depth = m.depth; changed = true; }
      if (!a.position && m.position) { a.position = m.position; changed = true; }
    }
  }
  if (changed) persist();
}

export function render(root) {
  migrateOldRosters();
  const team = currentTeam();
  root.innerHTML = `
    <div class="page-head">
      <div><h1>Roster ${esc(team?.name || '')}</h1><p class="muted" id="sub"></p></div>
      <div class="spacer"></div>
      <button class="primary" id="addAth">+ Athlet:in</button>
    </div>
    <div class="toolbar"><div class="seg" id="tabs">
      <button data-t="list" class="${view.tab === 'list' ? 'on' : ''}">Kaderliste</button>
      <button data-t="depth" class="${view.tab === 'depth' ? 'on' : ''}">Depth Chart</button>
      <button data-t="avg" class="${view.tab === 'avg' ? 'on' : ''}">Werte nach Position</button>
    </div><span class="spacer" style="flex:1"></span>
    <button id="autoDepth" title="Depth je Position nach der 40-yd-Zeit neu vergeben">Depth nach 40 yd sortieren</button>
    <button class="ghost" onclick="window.print()">Drucken</button></div>
    <div id="body"></div>`;

  const body = root.querySelector('#body');
  root.querySelector('#addAth').onclick = () => openAthlete(null, drawBody);
  root.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
    view.tab = b.dataset.t;
    root.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
    drawBody();
  });
  root.querySelector('#autoDepth').onclick = () => confirmDialog('Depth Chart für alle Positionen nach der 40-yd-Zeit neu sortieren? Manuelle Reihenfolgen werden überschrieben.', () => {
    for (const g of Object.values(groupByPos(scoped('athletes')))) {
      [...g].sort((x, y) => (metricValue(x, 'forty') ?? 99) - (metricValue(y, 'forty') ?? 99)).forEach((a, i) => { a.depth = i + 1; });
    }
    persist(); toast('Depth Chart sortiert'); drawBody();
  }, 'Sortieren');

  function drawBody() {
    const players = scoped('athletes');
    const pos = new Set(players.map(a => a.position).filter(Boolean));
    root.querySelector('#sub').textContent = `${players.length} Spieler · ${pos.size} Positionen · automatisch aus allen Athlet:innen des Teams`;
    root.querySelector('#autoDepth').disabled = !players.length;
    if (!players.length) {
      body.innerHTML = '<div class="empty">Noch keine Athlet:innen in diesem Team. Jede:r neue Athlet:in erscheint hier automatisch.</div>';
      return;
    }
    if (view.tab === 'list') drawList(players);
    else if (view.tab === 'depth') drawDepth(players);
    else drawAverages(players);
  }

  function drawList(players) {
    const groups = groupByPos(players);
    const rows = [...POSITIONS, '–'].filter(p => groups[p]).flatMap(p => depthOrder(groups[p]));
    const numCount = {};
    players.forEach(a => { if (a.number) numCount[a.number] = (numCount[a.number] || 0) + 1; });
    const dupNums = Object.values(numCount).some(n => n > 1);
    body.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Name</th><th>Position</th><th class="num">Depth</th><th class="num">Alter</th>
      ${KEY_METRICS.map(k => `<th class="num">${METRIC[k].short} <span style="text-transform:none">${METRIC[k].unit}</span></th>`).join('')}</tr></thead>
      <tbody>${rows.map(a => {
        const dup = a.number && numCount[a.number] > 1;
        return `<tr data-a="${a.id}">
        <td><input data-f="number" value="${esc(a.number ?? '')}" inputmode="numeric" style="width:56px;${dup ? 'border-color:var(--yellow)' : ''}" title="${dup ? 'Nummer doppelt vergeben' : ''}"></td>
        <td><a href="javascript:void 0" data-open>${esc(fullName(a))}</a></td>
        <td><select data-f="position">${options(POSITIONS, a.position, { empty: '–' })}</select></td>
        <td class="num"><input data-f="depth" value="${a.depth ?? ''}" placeholder="–" style="width:50px" inputmode="numeric"></td>
        <td class="num">${ageOf(a) ?? '–'}</td>
        ${KEY_METRICS.map(k => `<td class="num">${fmtMetric(k, metricValue(a, k))}</td>`).join('')}</tr>`;
      }).join('')}</tbody></table></div>
      <p class="legend">Enthält automatisch alle Athlet:innen des Teams. Depth = Reihenfolge innerhalb der Position (1 = Starter); ohne Angabe wird nach 40-yd-Zeit sortiert. Werte = letzte Messung.${dupNums ? ' <span style="color:var(--yellow)">Gelb markierte Nummern sind doppelt vergeben.</span>' : ''}</p>`;
    body.querySelectorAll('tr[data-a]').forEach(tr => {
      const a = get('athletes', tr.dataset.a);
      tr.querySelectorAll('[data-f]').forEach(inp => inp.onchange = () => {
        const f = inp.dataset.f;
        if (f === 'depth') a.depth = parseInt(inp.value) || null;
        else if (f === 'number') a.number = inp.value.trim();
        else { a.position = inp.value; a.depth = null; }
        upsert('athletes', a);
        drawBody();
      });
      tr.querySelector('[data-open]').onclick = () => openAthlete(a, drawBody);
    });
  }

  function drawDepth(players) {
    const groups = groupByPos(players);
    body.innerHTML = `<div class="depth">${[...POSITIONS, '–'].filter(p => groups[p]).map(p => {
      const g = depthOrder(groups[p]);
      return `<div class="card"><h3>${esc(p)} <span class="muted small">(${g.length})</span></h3><ol>${g.map((a, i) =>
        `<li class="row" style="gap:6px;justify-content:space-between"><span>${a.number ? `<b>#${esc(a.number)}</b> ` : ''}${esc(fullName(a))}</span>
          <span><button class="sm ghost" data-up="${a.id}" ${i === 0 ? 'disabled' : ''}>▲</button><button class="sm ghost" data-down="${a.id}" ${i === g.length - 1 ? 'disabled' : ''}>▼</button></span></li>`).join('')}</ol></div>`;
    }).join('')}</div>`;
    const move = (aid, dir) => {
      const a = get('athletes', aid);
      const g = depthOrder(groupByPos(scoped('athletes'))[a.position || '–']);
      const i = g.indexOf(a), j = i + dir;
      if (j < 0 || j >= g.length) return;
      [g[i], g[j]] = [g[j], g[i]];
      g.forEach((x, k) => { x.depth = k + 1; });
      persist(); drawBody();
    };
    body.querySelectorAll('[data-up]').forEach(b => b.onclick = () => move(b.dataset.up, -1));
    body.querySelectorAll('[data-down]').forEach(b => b.onclick = () => move(b.dataset.down, 1));
  }

  function drawAverages(players) {
    const groups = groupByPos(players);
    const avg = (list, k) => { const v = list.map(a => metricValue(a, k)).filter(x => x !== null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
    body.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Position</th><th class="num">Anzahl</th>${METRICS.map(m => `<th class="num">Ø ${m.short} <span style="text-transform:none">${m.unit}</span></th>`).join('')}</tr></thead>
      <tbody>${[...POSITIONS, '–'].filter(p => groups[p]).map(p => `<tr><td><b>${esc(p)}</b></td><td class="num">${groups[p].length}</td>
        ${METRICS.map(m => `<td class="num">${fmt(avg(groups[p], m.key), METRIC[m.key].dec)}</td>`).join('')}</tr>`).join('')}
        <tr style="border-top:2px solid var(--line)"><td><b>Gesamt</b></td><td class="num">${players.length}</td>
        ${METRICS.map(m => `<td class="num"><b>${fmt(avg(players, m.key), METRIC[m.key].dec)}</b></td>`).join('')}</tr>
      </tbody></table></div>`;
  }

  drawBody();
}
