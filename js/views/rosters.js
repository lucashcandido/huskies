// Roster = automatisch alle Athlet:innen des gewählten Teams.
// Ansicht „Aufstellung“: Basis-Offense und -Defense, unter jeder Position die
// Spieler in Depth-Reihenfolge – per Drag & Drop verschiebbar.

import { get, persist, upsert } from '../store.js?v=202611211111';
import { METRICS, METRIC, POSITIONS, fullName, ageOf, metricValue, fmtMetric, fmt } from '../metrics.js?v=202611211111';
import { esc, toast, confirmDialog, options } from '../ui.js?v=202611211111';
import { openAthlete } from './athletes.js?v=202611211111';
import { scoped, currentTeam } from '../team.js?v=202611211111';
import { OFFENSE_SLOTS, DEFENSE_SLOTS, EXTRA_SLOTS, ALL_SLOTS, SLOT, lineup, slotOf } from '../lineup.js?v=202611211111';

const KEY_METRICS = ['forty', 'shuffle', 'maxVelocity', 'vertical', 'broad', 'bench', 'weight'];
const view = { tab: 'lineup' };

/** Spieler in Depth-Reihenfolge (ohne Angabe: nach 40-yd-Zeit) */
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

/** Übernimmt Nummern aus früher manuell angelegten Rostern einmalig an die Spieler */
function migrateOldRosters() {
  let changed = false;
  for (const r of scoped('rosters')) {
    for (const m of r.members || []) {
      const a = get('athletes', m.athleteId);
      if (!a) continue;
      if (!a.number && m.number) { a.number = m.number; changed = true; }
      if (!a.position && m.position) { a.position = m.position; changed = true; }
    }
  }
  if (changed) persist();
}

const slotLabel = id => {
  const s = SLOT[id];
  if (!s) return '–';
  if (id === '-') return 'Weitere';
  return `${id.startsWith('O:') ? 'Offense' : id.startsWith('D:') ? 'Defense' : 'Special Teams'} · ${s.label}${s.pos && s.pos !== s.label ? ' (' + s.pos + ')' : ''}`;
};

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
      <button data-t="lineup" class="${view.tab === 'lineup' ? 'on' : ''}">Aufstellung</button>
      <button data-t="list" class="${view.tab === 'list' ? 'on' : ''}">Kaderliste</button>
      <button data-t="avg" class="${view.tab === 'avg' ? 'on' : ''}">Werte nach Position</button>
    </div><span class="spacer" style="flex:1"></span>
    <button id="autoLineup" title="Alle Plätze nach Position und 40-yd-Zeit neu vergeben">Automatisch aufstellen</button>
    <button class="ghost" onclick="window.print()">Drucken</button></div>
    <div id="body"></div>`;

  const body = root.querySelector('#body');
  root.querySelector('#addAth').onclick = () => openAthlete(null, drawBody);
  root.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
    view.tab = b.dataset.t;
    root.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
    drawBody();
  });
  root.querySelector('#autoLineup').onclick = () => confirmDialog('Alle Spieler nach ihrer Position neu auf die Plätze verteilen (Reihenfolge nach 40-yd-Zeit)? Manuelle Aufstellungen werden überschrieben.', () => {
    for (const a of scoped('athletes')) { a.slot = null; a.depth = null; }
    persist(); toast('Neu aufgestellt'); drawBody();
  }, 'Aufstellen');

  function drawBody() {
    const players = scoped('athletes');
    const pos = new Set(players.map(a => a.position).filter(Boolean));
    root.querySelector('#sub').textContent = `${players.length} Spieler · ${pos.size} Positionen · automatisch aus allen Athlet:innen des Teams`;
    root.querySelector('#autoLineup').disabled = !players.length;
    if (!players.length) {
      body.innerHTML = '<div class="empty">Noch keine Athlet:innen in diesem Team. Jede:r neue Athlet:in erscheint hier automatisch.</div>';
      return;
    }
    if (view.tab === 'lineup') drawLineup(players);
    else if (view.tab === 'list') drawList(players);
    else drawAverages(players);
  }

  // ---------- Aufstellung ----------
  function drawLineup(players) {
    const lu = lineup(players);
    const chip = (a, i) => `<li class="pchip ${i === 0 ? 'starter' : ''}" data-a="${a.id}" title="${esc(fullName(a))} · ${esc(a.position || '–')}">
      <span class="d">${i + 1}</span>${a.number ? `<span class="no">#${esc(a.number)}</span>` : ''}<span class="nm">${esc(a.lastName || a.firstName || '?')}</span></li>`;
    const box = s => `<div class="slot-box ${s.pos ? '' : 'wide'}" style="${s.col ? `grid-column:${s.col};grid-row:${s.row}` : ''}">
      <div class="slot-head" title="${esc(s.name)}"><b>${esc(s.label)}</b>${s.pos && s.pos !== s.label ? `<span>${esc(s.pos)}</span>` : ''}</div>
      <ol class="slot-list" data-slot="${s.id}">${lu[s.id].map(chip).join('')}</ol></div>`;
    body.innerHTML = `
      <p class="legend" style="margin-top:0">Namen per Drag &amp; Drop verschieben – innerhalb einer Position ändert das die Reihenfolge (oben = Starter), auf eine andere Position zieht den Spieler dorthin. Antippen öffnet den Spieler.</p>
      <div class="lineup-scroll">
        <div class="lineup-card"><div class="lineup-title">Defense <span>4-3</span></div>
          <div class="formation def">${DEFENSE_SLOTS.map(box).join('')}</div></div>
        <div class="los">Line of Scrimmage</div>
        <div class="lineup-card"><div class="lineup-title">Offense <span>11 Personnel · Pro Set</span></div>
          <div class="formation off">${OFFENSE_SLOTS.map(box).join('')}</div></div>
      </div>
      <div class="extras">${EXTRA_SLOTS.map(box).join('')}</div>`;
  }

  function enableDnD(container) {
    let drag = null;
    const listAt = (x, y) => document.elementFromPoint(x, y)?.closest('.slot-list');
    container.addEventListener('pointerdown', e => {
      const c = e.target.closest('.pchip');
      if (!c || e.button > 0) return;
      drag = { chip: c, from: c.parentElement, x0: e.clientX, y0: e.clientY, started: false };
    });
    const move = e => {
      if (!drag) return;
      if (!drag.started) {
        if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
        drag.started = true;
        const r = drag.chip.getBoundingClientRect();
        drag.ghost = drag.chip.cloneNode(true);
        drag.ghost.classList.add('ghost');
        Object.assign(drag.ghost.style, { width: r.width + 'px', left: r.left + 'px', top: r.top + 'px' });
        drag.dx = e.clientX - r.left; drag.dy = e.clientY - r.top;
        document.body.appendChild(drag.ghost);
        drag.line = document.createElement('div');
        drag.line.className = 'drop-line';
        document.body.appendChild(drag.line);
        drag.chip.classList.add('placeholder');
      }
      e.preventDefault();
      drag.ghost.style.left = (e.clientX - drag.dx) + 'px';
      drag.ghost.style.top = (e.clientY - drag.dy) + 'px';
      const list = listAt(e.clientX, e.clientY);
      container.querySelectorAll('.slot-list.over').forEach(l => l !== list && l.classList.remove('over'));
      drag.target = list || null;
      if (!list) { drag.line.style.display = 'none'; return; }
      list.classList.add('over');
      // Einfügeposition nur anzeigen (Linie) – das Layout verschiebt sich beim Ziehen nicht
      const chips = [...list.querySelectorAll('.pchip')].filter(ch => ch !== drag.chip);
      drag.before = chips.find(ch => { const r = ch.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; }) || null;
      const lr = list.getBoundingClientRect();
      const ref = drag.before ? drag.before.getBoundingClientRect().top - 2 : (chips.length ? chips[chips.length - 1].getBoundingClientRect().bottom + 1 : lr.top + 2);
      Object.assign(drag.line.style, { display: 'block', left: lr.left + 'px', width: lr.width + 'px', top: ref + 'px' });
    };
    const up = () => {
      if (!drag) return;
      const d = drag; drag = null;
      if (!d.started) { openAthlete(get('athletes', d.chip.dataset.a), drawBody); return; }
      d.ghost.remove(); d.line.remove();
      d.chip.classList.remove('placeholder');
      container.querySelectorAll('.slot-list.over').forEach(l => l.classList.remove('over'));
      if (!d.target) return;
      d.target.insertBefore(d.chip, d.before);
      commit(container, d.chip);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    cleanups.push(() => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); });
  }

  /** Speichert die komplette sichtbare Aufstellung als feste Plätze */
  function commit(container, movedChip) {
    let posChange = null;
    container.querySelectorAll('.slot-list').forEach(list => {
      const sid = list.dataset.slot, s = SLOT[sid];
      [...list.querySelectorAll('.pchip')].forEach((c, i) => {
        const a = get('athletes', c.dataset.a);
        if (!a) return;
        a.slot = sid; a.depth = i + 1;
        if (s.pos && a.position !== s.pos) { if (c === movedChip) posChange = { a, from: a.position, to: s.pos }; a.position = s.pos; }
      });
    });
    persist();
    if (posChange) toast(`${posChange.a.lastName || fullName(posChange.a)}: Position ${posChange.from || '–'} → ${posChange.to}`);
    drawBody();
  }

  // ---------- Kaderliste ----------
  function drawList(players) {
    const lu = lineup(players);
    const order = ALL_SLOTS.map(s => s.id);
    const rows = [...players].sort((x, y) => {
      const sx = slotOf(x, lu), sy = slotOf(y, lu);
      return (order.indexOf(sx) - order.indexOf(sy)) || (lu[sx].indexOf(x) - lu[sy].indexOf(y));
    });
    const numCount = {};
    players.forEach(a => { if (a.number) numCount[a.number] = (numCount[a.number] || 0) + 1; });
    const dupNums = Object.values(numCount).some(n => n > 1);
    const slotOpts = ALL_SLOTS.map(s => ({ value: s.id, label: slotLabel(s.id) }));
    body.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Name</th><th>Position</th><th>Platz in der Aufstellung</th><th class="num">Depth</th><th class="num">Alter</th>
      ${KEY_METRICS.map(k => `<th class="num">${METRIC[k].short} <span style="text-transform:none">${METRIC[k].unit}</span></th>`).join('')}</tr></thead>
      <tbody>${rows.map(a => {
        const dup = a.number && numCount[a.number] > 1;
        const sid = slotOf(a, lu);
        return `<tr data-a="${a.id}">
        <td><input data-f="number" value="${esc(a.number ?? '')}" inputmode="numeric" style="width:56px;${dup ? 'border-color:var(--yellow)' : ''}" title="${dup ? 'Nummer doppelt vergeben' : ''}"></td>
        <td><a href="javascript:void 0" data-open>${esc(fullName(a))}</a></td>
        <td><select data-f="position">${options(POSITIONS, a.position, { empty: '–' })}</select></td>
        <td><select data-f="slot">${options(slotOpts, sid)}</select>${lu._auto.has(a) ? ' <span class="small muted" title="automatisch zugeordnet">auto</span>' : ''}</td>
        <td class="num">${lu[sid].indexOf(a) + 1}</td>
        <td class="num">${ageOf(a) ?? '–'}</td>
        ${KEY_METRICS.map(k => `<td class="num">${fmtMetric(k, metricValue(a, k))}</td>`).join('')}</tr>`;
      }).join('')}</tbody></table></div>
      <p class="legend">Enthält automatisch alle Athlet:innen des Teams. Depth = Reihenfolge auf dem Platz (1 = Starter) – am einfachsten unter „Aufstellung“ per Drag &amp; Drop ändern. Werte = letzte Messung.${dupNums ? ' <span style="color:var(--yellow)">Gelb markierte Nummern sind doppelt vergeben.</span>' : ''}</p>`;
    body.querySelectorAll('tr[data-a]').forEach(tr => {
      const a = get('athletes', tr.dataset.a);
      tr.querySelectorAll('[data-f]').forEach(inp => inp.onchange = () => {
        const f = inp.dataset.f;
        if (f === 'number') a.number = inp.value.trim();
        else if (f === 'position') { a.position = inp.value; a.slot = null; a.depth = null; }
        else {
          const s = SLOT[inp.value];
          a.slot = inp.value;
          a.depth = lineup(scoped('athletes').filter(x => x !== a))[inp.value].length + 1;
          if (s.pos) a.position = s.pos;
        }
        upsert('athletes', a);
        drawBody();
      });
      tr.querySelector('[data-open]').onclick = () => openAthlete(a, drawBody);
    });
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

  const cleanups = [];
  enableDnD(body);
  drawBody();
  return () => cleanups.forEach(f => f());
}
