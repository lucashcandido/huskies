import { db, upsert, remove, uid, get } from '../store.js?v=202611211016';
import { fullName, metricValue, fmtMetric } from '../metrics.js?v=202611211016';
import { esc, modal, toast, confirmDialog, options } from '../ui.js?v=202611211016';
import { OFFENSE_PERSONNEL, DEFENSE_PERSONNEL, ROLE_NAMES } from '../football.js?v=202611211016';
import { scoped, currentTeamId } from '../team.js?v=202611211016';
import { depthOrder } from './rosters.js?v=202611211016';
import { lineup } from '../lineup.js?v=202611211016';

export function render(root, params) {
  if (params[0]) return renderDetail(root, params[0]);
  const s = db();
  const all = scoped('personnel');
  const group = side => all.filter(p => p.side === side);
  const card = p => {
    const filled = p.slots.filter(x => x.athleteId).length;
    return `<div class="card click" data-id="${p.id}">
      <div class="row"><span class="badge ${p.side === 'offense' ? 'off' : 'def'}">${p.side === 'offense' ? 'Offense' : 'Defense'}</span>
      <span class="small muted">${esc(presetLabel(p))}</span></div>
      <h3 style="margin-top:8px">${esc(p.name)}</h3>
      <div class="small muted">${filled}/${p.slots.length} besetzt</div>
    </div>`;
  };
  root.innerHTML = `
    <div class="page-head">
      <div><h1>Personnel</h1><p class="muted">Personnel-Gruppen mit konkreten Spielern speichern – z. B. „11 Personnel Base“ oder „Nickel vs Spread“. Im Playbook lassen sie sich auf Formationen legen.</p></div>
      <div class="spacer"></div><button class="primary" id="add">+ Personnel</button>
    </div>
    ${!all.length ? '<div class="empty">Noch keine Personnel-Gruppe gespeichert.</div>' : ''}
    ${group('offense').length ? `<div class="section-title">Offense</div><div class="cards">${group('offense').map(card).join('')}</div>` : ''}
    ${group('defense').length ? `<div class="section-title">Defense</div><div class="cards">${group('defense').map(card).join('')}</div>` : ''}`;
  root.querySelectorAll('[data-id]').forEach(c => c.onclick = () => location.hash = `#/personnel/${c.dataset.id}`);
  root.querySelector('#add').onclick = () => createPersonnel();
}

function presetLabel(p) {
  const src = p.side === 'offense' ? OFFENSE_PERSONNEL : DEFENSE_PERSONNEL;
  return src[p.preset]?.label || p.preset;
}

function createPersonnel() {
  const s = db();
  modal({
    title: 'Neue Personnel-Gruppe', width: 560,
    body: `<div class="grid">
      <div class="field full"><label>Name</label><input id="n" placeholder="z. B. 11 Personnel – Starter"></div>
      <div class="field"><label>Seite</label><select id="side"><option value="offense">Offense</option><option value="defense">Defense</option></select></div>
      <div class="field"><label>Gruppierung</label><select id="preset"></select></div>
      <label class="full" style="text-transform:none;letter-spacing:0;font-size:13px;color:var(--txt)"><input type="checkbox" id="auto" checked style="width:auto"> Automatisch nach Roster-Aufstellung besetzen</label>
    </div>`,
    onOpen(root) {
      const sideSel = root.querySelector('#side'), pre = root.querySelector('#preset');
      const fill = () => {
        const src = sideSel.value === 'offense' ? OFFENSE_PERSONNEL : DEFENSE_PERSONNEL;
        pre.innerHTML = options(Object.entries(src).map(([k, v]) => ({ value: k, label: v.label })), sideSel.value === 'offense' ? '11' : 'base43');
      };
      sideSel.onchange = fill; fill();
    },
    buttons: [{ label: 'Abbrechen', cls: 'ghost' }, { label: 'Anlegen', cls: 'primary', onClick: (close, root) => {
      const side = root.querySelector('#side').value, preset = root.querySelector('#preset').value;
      const src = side === 'offense' ? OFFENSE_PERSONNEL : DEFENSE_PERSONNEL;
      const p = {
        id: uid('per'), teamId: currentTeamId(), side, preset,
        name: root.querySelector('#n').value.trim() || src[preset].label.split(' (')[0],
        slots: src[preset].slots.map(sl => ({ ...sl, athleteId: null })),
        notes: '',
      };
      if (root.querySelector('#auto').checked) autoFill(p);
      upsert('personnel', p);
      location.hash = `#/personnel/${p.id}`;
    } }],
  });
}

/** Kandidaten für einen Slot: alle Spieler des Teams, passende Position zuerst (nach Depth Chart) */
function candidates(p, pos) {
  return depthOrder(scoped('athletes')).map(a => ({ a, pos: a.position, depth: a.depth || 99, number: a.number }))
    .sort((x, y) => (x.pos === pos ? 0 : 1) - (y.pos === pos ? 0 : 1));
}

function autoFill(p) {
  const used = new Set(p.slots.filter(s => s.athleteId).map(s => s.athleteId));
  const lu = lineup(scoped('athletes'));
  const side = p.side === 'offense' ? 'O:' : 'D:';
  for (const slot of p.slots) {
    if (slot.athleteId) continue;
    // zuerst der Starter auf dem gleichnamigen Platz der Roster-Aufstellung, sonst nach Position
    const fromLineup = (lu[side + slot.role] || []).find(a => !used.has(a.id));
    if (fromLineup) { slot.athleteId = fromLineup.id; used.add(fromLineup.id); continue; }
    const c = candidates(p, slot.pos).find(x => x.pos === slot.pos && !used.has(x.a.id));
    if (c) { slot.athleteId = c.a.id; used.add(c.a.id); }
  }
}

function renderDetail(root, id) {
  const p = get('personnel', id);
  if (!p) { root.innerHTML = `<div class="empty">Nicht gefunden. <a href="#/personnel">Zur Übersicht</a></div>`; return; }
  const s = db();
  root.innerHTML = `
    <div class="page-head">
      <div><a href="#/personnel" class="small">← Alle Personnel</a>
      <h1><input id="name" value="${esc(p.name)}" style="font-size:20px;font-weight:800;background:transparent;border-color:transparent;padding:2px 4px;margin-left:-4px"></h1>
      <p class="muted"><span class="badge ${p.side === 'offense' ? 'off' : 'def'}">${p.side === 'offense' ? 'Offense' : 'Defense'}</span> ${esc(presetLabel(p))}</p></div>
      <div class="spacer"></div>
      <button id="auto">Nach Roster-Aufstellung füllen</button>
      <button id="dup">Duplizieren</button>
      <button class="danger" id="del">Löschen</button>
    </div>
    <div class="slot-grid" id="slots"></div>
    <div class="section-title">Übersicht</div>
    <div id="summary"></div>
    <div class="field" style="margin-top:14px"><label>Notizen</label><textarea id="notes" rows="3">${esc(p.notes || '')}</textarea></div>`;

  const save = () => upsert('personnel', p);
  root.querySelector('#name').onchange = e => { p.name = e.target.value.trim() || p.name; save(); toast('Gespeichert'); };
  root.querySelector('#notes').onchange = e => { p.notes = e.target.value; save(); };
  root.querySelector('#auto').onclick = () => { autoFill(p); save(); draw(); toast('Freie Slots besetzt'); };
  root.querySelector('#dup').onclick = () => { const c = structuredClone(p); c.id = uid('per'); c.name += ' (Kopie)'; upsert('personnel', c); location.hash = `#/personnel/${c.id}`; };
  root.querySelector('#del').onclick = () => confirmDialog(`„${p.name}“ löschen?`, () => { remove('personnel', p.id); location.hash = '#/personnel'; });

  function draw() {
    const used = new Map(p.slots.filter(x => x.athleteId).map(x => [x.athleteId, x.role]));
    root.querySelector('#slots').innerHTML = p.slots.map((sl, i) => {
      const cands = candidates(p, sl.pos);
      return `<div class="slot"><span class="pos" title="${esc(ROLE_NAMES[sl.role] || sl.role)}">${esc(sl.role)}</span>
        <select data-i="${i}">${options(cands.map(c => ({
          value: c.a.id,
          label: `${c.number ? '#' + c.number + ' ' : ''}${fullName(c.a)} (${c.pos || '–'})${used.has(c.a.id) && used.get(c.a.id) !== sl.role ? ' · bereits ' + used.get(c.a.id) : ''}`,
        })), sl.athleteId, { empty: `– ${sl.pos} wählen –` })}</select></div>`;
    }).join('');
    root.querySelectorAll('#slots select').forEach(sel => sel.onchange = () => {
      p.slots[+sel.dataset.i].athleteId = sel.value || null; save(); draw();
    });
    const rows = p.slots.map(sl => ({ sl, a: sl.athleteId ? get('athletes', sl.athleteId) : null }));
    root.querySelector('#summary').innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Rolle</th><th>Spieler</th><th class="num">40 yd</th><th class="num">Shuffle</th><th class="num">Max V</th><th class="num">Gewicht</th></tr></thead>
      <tbody>${rows.map(({ sl, a }) => `<tr><td><b>${esc(sl.role)}</b> <span class="muted small">${esc(ROLE_NAMES[sl.role] || '')}</span></td>
        <td>${a ? esc(fullName(a)) : '<span class="muted">unbesetzt</span>'}</td>
        <td class="num">${a ? fmtMetric('forty', metricValue(a, 'forty')) : ''}</td>
        <td class="num">${a ? fmtMetric('shuffle', metricValue(a, 'shuffle')) : ''}</td>
        <td class="num">${a ? fmtMetric('maxVelocity', metricValue(a, 'maxVelocity')) : ''}</td>
        <td class="num">${a ? fmtMetric('weight', metricValue(a, 'weight')) : ''}</td></tr>`).join('')}</tbody></table></div>`;
  }
  draw();
}
