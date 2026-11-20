import { db, upsert, remove, uid, get } from '../store.js';
import { METRICS, METRIC, POSITIONS, fullName, ageOf, metricValue, fmtMetric, fmt } from '../metrics.js';
import { esc, modal, toast, confirmDialog, options } from '../ui.js';
import { openAthlete } from './athletes.js';
import { scoped, currentTeamId, currentTeam } from '../team.js';

const KEY_METRICS = ['forty', 'shuffle', 'maxVelocity', 'vertical', 'broad', 'weight'];

export function render(root, params) {
  if (params[0]) return renderDetail(root, params[0]);
  const s = db();
  root.innerHTML = `
    <div class="page-head">
      <div><h1>Roster</h1><p class="muted">Kader aus den erfassten Athlet:innen zusammenstellen – mit Trikotnummer, Position und Depth Chart.</p></div>
      <div class="spacer"></div><button class="primary" id="add">+ Roster</button>
    </div>
    <div class="cards" id="cards"></div>`;
  const cards = root.querySelector('#cards');
  const list = scoped('rosters');
  if (!list.length) cards.outerHTML = `<div class="empty">Noch kein Roster. Lege eins an (z. B. „U19 Saison 2027“) und füge Spieler hinzu.</div>`;
  else cards.innerHTML = list.map(r => {
    const byPos = {};
    r.members.forEach(m => { byPos[m.position || '–'] = (byPos[m.position || '–'] || 0) + 1; });
    return `<div class="card click" data-id="${r.id}">
      <h3>${esc(r.name)}</h3>
      <div class="muted small">${esc([r.team, r.season].filter(Boolean).join(' · ') || '—')}</div>
      <div style="font-size:26px;font-weight:800;color:var(--accent);margin:8px 0 4px">${r.members.length}<span class="small muted" style="font-weight:600"> Spieler</span></div>
      <div class="row">${Object.entries(byPos).sort().map(([p, n]) => `<span class="chip">${esc(p)} ${n}</span>`).join('')}</div>
    </div>`;
  }).join('');
  root.querySelectorAll('[data-id]').forEach(c => c.onclick = () => location.hash = `#/rosters/${c.dataset.id}`);
  root.querySelector('#add').onclick = () => editRoster(null);
}

function editRoster(r) {
  const isNew = !r;
  r = r ? structuredClone(r) : { id: uid('ros'), teamId: currentTeamId(), name: '', team: currentTeam()?.name || '', season: String(new Date().getFullYear()), notes: '', members: [] };
  modal({
    title: isNew ? 'Neues Roster' : 'Roster bearbeiten', width: 560,
    body: `<div class="grid">
      <div class="field full"><label>Name</label><input id="n" value="${esc(r.name)}" placeholder="z. B. U19 Saison 2027"></div>
      <div class="field"><label>Team / Altersklasse</label><input id="t" value="${esc(r.team)}" placeholder="U19"></div>
      <div class="field"><label>Saison</label><input id="s" value="${esc(r.season)}"></div>
      <div class="field full"><label>Notizen</label><textarea id="no" rows="2">${esc(r.notes)}</textarea></div></div>`,
    buttons: [{ label: 'Abbrechen', cls: 'ghost' }, { label: 'Speichern', cls: 'primary', onClick: (close, root) => {
      r.name = root.querySelector('#n').value.trim();
      if (!r.name) { alert('Bitte einen Namen eingeben.'); return false; }
      r.team = root.querySelector('#t').value.trim();
      r.season = root.querySelector('#s').value.trim();
      r.notes = root.querySelector('#no').value;
      upsert('rosters', r);
      if (isNew) location.hash = `#/rosters/${r.id}`; else window.dispatchEvent(new HashChangeEvent('hashchange'));
    } }],
  });
}

const detailView = { tab: 'list', sort: 'depth' };

function renderDetail(root, id) {
  const r = get('rosters', id);
  if (!r) { root.innerHTML = `<div class="empty">Roster nicht gefunden. <a href="#/rosters">Zur Übersicht</a></div>`; return; }
  root.innerHTML = `
    <div class="page-head">
      <div><a href="#/rosters" class="small">← Alle Roster</a><h1>${esc(r.name)}</h1>
      <p class="muted">${esc([r.team, r.season].filter(Boolean).join(' · '))} · ${r.members.length} Spieler</p></div>
      <div class="spacer"></div>
      <button id="edit">Bearbeiten</button>
      <button id="dup">Duplizieren</button>
      <button class="danger" id="del">Löschen</button>
      <button class="primary" id="addM">+ Spieler hinzufügen</button>
    </div>
    <div class="toolbar"><div class="seg" id="tabs">
      <button data-t="list" class="${detailView.tab === 'list' ? 'on' : ''}">Kaderliste</button>
      <button data-t="depth" class="${detailView.tab === 'depth' ? 'on' : ''}">Depth Chart</button>
      <button data-t="avg" class="${detailView.tab === 'avg' ? 'on' : ''}">Werte nach Position</button>
    </div><span class="spacer"></span><button class="ghost" onclick="window.print()">Drucken</button></div>
    <div id="body"></div>`;
  root.querySelector('#edit').onclick = () => editRoster(r);
  root.querySelector('#dup').onclick = () => {
    const c = structuredClone(r); c.id = uid('ros'); c.name = r.name + ' (Kopie)';
    upsert('rosters', c); location.hash = `#/rosters/${c.id}`; toast('Dupliziert');
  };
  root.querySelector('#del').onclick = () => confirmDialog(`Roster „${r.name}“ löschen? Die Athlet:innen selbst bleiben erhalten.`, () => {
    remove('rosters', r.id); location.hash = '#/rosters';
  });
  root.querySelector('#addM').onclick = () => addMembers(r, () => drawBody());
  root.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
    detailView.tab = b.dataset.t;
    root.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
    drawBody();
  });

  const body = root.querySelector('#body');
  function drawBody() {
    root.querySelector('.page-head p').textContent = `${[r.team, r.season].filter(Boolean).join(' · ')} · ${r.members.length} Spieler`;
    if (!r.members.length) { body.innerHTML = `<div class="empty">Noch keine Spieler im Roster.</div>`; return; }
    if (detailView.tab === 'list') drawList();
    else if (detailView.tab === 'depth') drawDepth();
    else drawAverages();
  }

  function members() {
    return r.members.map(m => ({ m, a: get('athletes', m.athleteId) })).filter(x => x.a);
  }

  function drawList() {
    const rows = members().sort((x, y) => (POSITIONS.indexOf(x.m.position) - POSITIONS.indexOf(y.m.position)) || ((x.m.depth || 99) - (y.m.depth || 99)));
    body.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Name</th><th>Position</th><th class="num">Depth</th><th class="num">Alter</th>
      ${KEY_METRICS.map(k => `<th class="num">${METRIC[k].short} <span style="text-transform:none">${METRIC[k].unit}</span></th>`).join('')}<th></th></tr></thead>
      <tbody>${rows.map(({ m, a }) => `<tr data-a="${a.id}">
        <td><input data-f="number" value="${esc(m.number ?? '')}" style="width:56px" inputmode="numeric"></td>
        <td><a href="javascript:void 0" data-open>${esc(fullName(a))}</a></td>
        <td><select data-f="position">${options(POSITIONS, m.position, { empty: '–' })}</select></td>
        <td class="num"><input data-f="depth" value="${m.depth ?? ''}" style="width:50px" inputmode="numeric"></td>
        <td class="num">${ageOf(a) ?? '–'}</td>
        ${KEY_METRICS.map(k => `<td class="num">${fmtMetric(k, metricValue(a, k))}</td>`).join('')}
        <td><button class="sm danger" data-rm>Entfernen</button></td></tr>`).join('')}</tbody></table></div>
      <p class="legend">Depth = Reihenfolge innerhalb der Position (1 = Starter). Werte = jeweils letzte Messung.</p>`;
    body.querySelectorAll('tr[data-a]').forEach(tr => {
      const m = r.members.find(x => x.athleteId === tr.dataset.a);
      tr.querySelectorAll('[data-f]').forEach(inp => inp.onchange = () => {
        const f = inp.dataset.f;
        m[f] = f === 'depth' ? (parseInt(inp.value) || null) : inp.value.trim();
        if (f === 'position') m.depth = nextDepth(r, m.position, m.athleteId);
        upsert('rosters', r);
        if (f !== 'number') drawList();
      });
      tr.querySelector('[data-rm]').onclick = () => { r.members = r.members.filter(x => x !== m); upsert('rosters', r); drawBody(); };
      tr.querySelector('[data-open]').onclick = () => openAthlete(get('athletes', m.athleteId), drawBody);
    });
  }

  function drawDepth() {
    const groups = {};
    members().forEach(x => (groups[x.m.position || '–'] = groups[x.m.position || '–'] || []).push(x));
    const order = [...POSITIONS, '–'].filter(p => groups[p]);
    body.innerHTML = `<div class="depth">${order.map(p => {
      const g = groups[p].sort((x, y) => (x.m.depth || 99) - (y.m.depth || 99));
      return `<div class="card"><h3>${esc(p)} <span class="muted small">(${g.length})</span></h3><ol>${g.map(({ m, a }, i) =>
        `<li class="row" style="gap:6px;justify-content:space-between"><span>${m.number ? `<b>#${esc(m.number)}</b> ` : ''}${esc(fullName(a))}</span>
          <span><button class="sm ghost" data-up="${a.id}" ${i === 0 ? 'disabled' : ''}>▲</button><button class="sm ghost" data-down="${a.id}" ${i === g.length - 1 ? 'disabled' : ''}>▼</button></span></li>`).join('')}</ol></div>`;
    }).join('')}</div>`;
    const move = (aid, dir) => {
      const m = r.members.find(x => x.athleteId === aid);
      const g = r.members.filter(x => (x.position || '–') === (m.position || '–')).sort((x, y) => (x.depth || 99) - (y.depth || 99));
      const i = g.indexOf(m), j = i + dir;
      if (j < 0 || j >= g.length) return;
      [g[i], g[j]] = [g[j], g[i]];
      g.forEach((x, k) => x.depth = k + 1);
      upsert('rosters', r); drawDepth();
    };
    body.querySelectorAll('[data-up]').forEach(b => b.onclick = () => move(b.dataset.up, -1));
    body.querySelectorAll('[data-down]').forEach(b => b.onclick = () => move(b.dataset.down, 1));
  }

  function drawAverages() {
    const groups = {};
    members().forEach(x => (groups[x.m.position || '–'] = groups[x.m.position || '–'] || []).push(x.a));
    const order = [...POSITIONS, '–'].filter(p => groups[p]);
    const avg = (list, k) => { const v = list.map(a => metricValue(a, k)).filter(x => x !== null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
    const all = members().map(x => x.a);
    body.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Position</th><th class="num">Anzahl</th>${METRICS.map(m => `<th class="num">Ø ${m.short} <span style="text-transform:none">${m.unit}</span></th>`).join('')}</tr></thead>
      <tbody>${order.map(p => `<tr><td><b>${esc(p)}</b></td><td class="num">${groups[p].length}</td>
        ${METRICS.map(m => `<td class="num">${fmt(avg(groups[p], m.key), METRIC[m.key].dec)}</td>`).join('')}</tr>`).join('')}
        <tr style="border-top:2px solid var(--line)"><td><b>Gesamt</b></td><td class="num">${all.length}</td>
        ${METRICS.map(m => `<td class="num"><b>${fmt(avg(all, m.key), METRIC[m.key].dec)}</b></td>`).join('')}</tr>
      </tbody></table></div>`;
  }

  drawBody();
}

function nextDepth(r, pos, exceptId) {
  return r.members.filter(m => m.position === pos && m.athleteId !== exceptId).length + 1;
}

function addMembers(r, onDone) {
  const inRoster = new Set(r.members.map(m => m.athleteId));
  const candidates = scoped('athletes').filter(a => !inRoster.has(a.id)).sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
  if (!candidates.length) { alert(scoped('athletes').length ? 'Alle Athlet:innen sind bereits im Roster.' : 'Lege zuerst Athlet:innen an.'); return; }
  const sel = new Set();
  modal({
    title: `Spieler zu „${r.name}“ hinzufügen`, width: 640,
    body: `<div class="toolbar"><input id="q" class="grow" placeholder="Suche …"><select id="p">${options(POSITIONS, '', { empty: 'Alle Positionen' })}</select>
      <button class="sm" id="all">Alle sichtbaren</button></div>
      <div id="lst" style="max-height:55vh;overflow:auto"></div>`,
    buttons: [{ label: 'Abbrechen', cls: 'ghost' }, { label: 'Hinzufügen', cls: 'primary', onClick: () => {
      for (const id of sel) {
        const a = get('athletes', id);
        r.members.push({ athleteId: id, number: '', position: a.position || '', depth: nextDepth(r, a.position || '') });
      }
      upsert('rosters', r); toast(`${sel.size} hinzugefügt`); onDone();
    } }],
    onOpen(root) {
      const draw = () => {
        const q = root.querySelector('#q').value.toLowerCase(), p = root.querySelector('#p').value;
        const vis = candidates.filter(a => fullName(a).toLowerCase().includes(q) && (!p || a.position === p));
        root.querySelector('#lst').innerHTML = vis.map(a => `<label class="station-row" style="cursor:pointer;text-transform:none;letter-spacing:0;font-size:14px;color:var(--txt);margin-bottom:6px">
          <input type="checkbox" data-id="${a.id}" ${sel.has(a.id) ? 'checked' : ''} style="width:auto">
          <span class="who"><b>${esc(fullName(a))}</b></span><span class="badge">${esc(a.position || '–')}</span>
          <span class="small muted">40yd ${fmtMetric('forty', metricValue(a, 'forty'))}</span></label>`).join('') || '<div class="muted">Keine Treffer.</div>';
        root.querySelectorAll('[data-id]').forEach(c => c.onchange = () => c.checked ? sel.add(c.dataset.id) : sel.delete(c.dataset.id));
        root.querySelector('#all').onclick = () => { vis.forEach(a => sel.add(a.id)); draw(); };
      };
      root.querySelector('#q').oninput = draw;
      root.querySelector('#p').onchange = draw;
      draw();
    },
  });
}
