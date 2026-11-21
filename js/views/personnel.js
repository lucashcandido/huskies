import { db, upsert, remove, uid, get } from '../store.js?v=202611211210';
import { fullName, metricValue, fmtMetric } from '../metrics.js?v=202611211210';
import { esc, modal, toast, confirmDialog, options } from '../ui.js?v=202611211210';
import { OFFENSE_PERSONNEL, DEFENSE_PERSONNEL, ROLE_NAMES } from '../football.js?v=202611211210';
import { scoped, currentTeamId } from '../team.js?v=202611211210';
import { depthOrder } from './rosters.js?v=202611211210';
import { lineup } from '../lineup.js?v=202611211210';
import { FORMATIONS, W, isEligible, clamp } from '../football.js?v=202611211210';
import { VIEW, fieldSVG, playersSVG } from './plays.js?v=202611211210';
import { keyOf, startPlayers, saveFormation, deleteFormation, playsUsing, mirror, registerCustomFormations } from '../formations.js?v=202611211210';

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
    ${p.side === 'offense' ? `<div class="section-title" style="display:flex;align-items:center;gap:8px">Formationen (${esc(p.preset === '00' ? 'Empty' : p.preset + ' Personnel')})
      <span style="flex:1"></span><button class="sm primary" id="addForm">+ Formation</button></div>
      <p class="legend" style="margin-top:0">Eigene Formationen erscheinen im Playbook bei „Neuer Spielzug“ und in der Formationsauswahl. Spielzüge in einer Formation übernehmen Änderungen automatisch.</p>
      <div class="cards" id="forms"></div>` : ''}
    <div class="section-title">Übersicht</div>
    <div id="summary"></div>
    <div class="field" style="margin-top:14px"><label>Notizen</label><textarea id="notes" rows="3">${esc(p.notes || '')}</textarea></div>`;

  const save = () => upsert('personnel', p);
  root.querySelector('#name').onchange = e => { p.name = e.target.value.trim() || p.name; save(); toast('Gespeichert'); };
  root.querySelector('#notes').onchange = e => { p.notes = e.target.value; save(); };
  root.querySelector('#auto').onclick = () => { autoFill(p); save(); draw(); toast('Freie Slots besetzt'); };
  root.querySelector('#dup').onclick = () => { const c = structuredClone(p); c.id = uid('per'); c.name += ' (Kopie)'; upsert('personnel', c); location.hash = `#/personnel/${c.id}`; };
  root.querySelector('#del').onclick = () => confirmDialog(`„${p.name}“ löschen?`, () => { remove('personnel', p.id); location.hash = '#/personnel'; });

  function drawForms() {
    const el = root.querySelector('#forms');
    if (!el) return;
    registerCustomFormations();
    const list = scoped('formations').filter(f => f.personnel === p.preset).sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
    el.innerHTML = list.length ? list.map(f => `<div class="card click" data-f="${f.id}" style="padding:0;overflow:hidden">
        <svg viewBox="${VIEW.x} -12 ${VIEW.w} 16" style="width:100%;display:block;background:#13532a">${fieldSVG()}${playersSVG({ offense: f.players.map(x => ({ ...x, id: x.role })), defense: [] }, {})}</svg>
        <div style="padding:8px 12px"><h3 style="margin:0">${esc(f.name)}</h3><div class="small muted">${playsUsing(f).length} Spielzüge</div></div></div>`).join('')
      : '<div class="empty">Noch keine eigenen Formationen für dieses Personnel.</div>';
    el.querySelectorAll('[data-f]').forEach(c => c.onclick = () => openFormation(p, scoped('formations').find(f => f.id === c.dataset.f), drawForms));
  }
  root.querySelector('#addForm')?.addEventListener('click', () => openFormation(p, null, drawForms));
  drawForms();

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


// ---------- Formation-Editor ----------
function openFormation(per, existing, onDone) {
  const f = existing ? structuredClone(existing) : { id: null, name: '', personnel: per.preset, personnelId: per.id, players: startPlayers(per.preset) };
  const templates = Object.entries(FORMATIONS).filter(([k, x]) => x.personnel === per.preset && (!existing || k !== keyOf(existing)));
  let sel = null, drag = null;
  const { root, close } = modal({
    title: existing ? `Formation: ${existing.name}` : 'Neue Formation', width: 980,
    body: `
      <div class="grid" style="grid-template-columns:2fr 1fr">
        <div class="field"><label>Name (so heißt sie im Call)</label><input id="fname" value="${esc(f.name)}" placeholder="z. B. Twins Rt, Trey Lt, Bunch Lt"></div>
        <div class="field"><label>Startaufstellung übernehmen</label><select id="tpl">${options(templates.map(([k, x]) => ({ value: k, label: x.label + (x.custom ? ' ★' : '') })), '', { empty: '– Vorlage wählen –' })}</select></div>
      </div>
      <div class="row" style="margin:10px 0;justify-content:space-between">
        <span class="small muted">Spieler ziehen (rastet auf ½ Yard ein). Die blaue Linie ist die Line of Scrimmage.</span>
        <span><button class="sm" id="mirror">⇆ Spiegeln</button></span>
      </div>
      <div class="field-wrap"><svg class="field-svg" id="fsvg" viewBox="${VIEW.x} -14 ${VIEW.w} 22"></svg></div>
      <div id="fcheck" class="small" style="margin-top:8px"></div>`,
    buttons: [
      ...(existing ? [{ label: 'Löschen', cls: 'danger', left: true, onClick: () => {
        const n = playsUsing(existing).length;
        if (n) { alert(`„${existing.name}“ wird in ${n} Spielzug/Spielzügen verwendet. Bitte dort zuerst eine andere Formation wählen.`); return false; }
        confirmDialog(`Formation „${existing.name}“ löschen?`, () => { deleteFormation(existing); onDone(); toast('Gelöscht'); });
      } }] : []),
      { label: 'Abbrechen', cls: 'ghost' },
      { label: 'Speichern', cls: 'primary', onClick: () => {
        f.name = root.querySelector('#fname').value.trim();
        if (!f.name) { alert('Bitte einen Namen eingeben.'); return false; }
        const n = saveFormation(f);
        toast(n ? `Gespeichert – ${n} Spielzug/Spielzüge aktualisiert` : 'Formation gespeichert');
        onDone();
      } },
    ],
  });
  const svg = root.querySelector('#fsvg');
  function draw() {
    svg.innerHTML = fieldSVG() + playersSVG({ offense: f.players.map(x => ({ ...x, id: x.role })), defense: [] }, { sel: sel ? { side: 'o', id: sel } : null });
    const onLine = f.players.filter(x => x.y >= -1.25).length;
    const backs = f.players.filter(x => x.y < -1.25).length;
    const ok = onLine === 7;
    root.querySelector('#fcheck').innerHTML = `<span style="color:${ok ? 'var(--green)' : 'var(--yellow)'}">${ok ? '✓' : '⚠'} ${onLine} Spieler an der Line of Scrimmage, ${backs} im Backfield</span>${ok ? '' : ' <span class="muted">(regelkonform sind 7 an der Linie)</span>'}`;
  }
  const toField = e => {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: q.x, y: -q.y };
  };
  svg.addEventListener('pointerdown', e => {
    const g = e.target.closest('[data-pid]');
    if (!g) { sel = null; draw(); return; }
    const role = g.dataset.pid.split(':')[1];
    const pl = f.players.find(x => x.role === role);
    const pt = toField(e);
    sel = role; drag = { pl, dx: pl.x - pt.x, dy: pl.y - pt.y };
    svg.setPointerCapture(e.pointerId);
    draw();
  });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    const pt = toField(e);
    const nx = clamp(Math.round((pt.x + drag.dx) * 2) / 2, 0.5, W - 0.5), ny = clamp(Math.round((pt.y + drag.dy) * 2) / 2, -12, -0.5);
    if (nx !== drag.pl.x || ny !== drag.pl.y) { drag.pl.x = nx; drag.pl.y = ny; draw(); }
  });
  const end = () => { drag = null; };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  root.querySelector('#mirror').onclick = () => { f.players = mirror(f.players); draw(); };
  root.querySelector('#tpl').onchange = e => {
    if (!e.target.value) return;
    f.players = startPlayers(per.preset, e.target.value);
    if (!root.querySelector('#fname').value.trim()) root.querySelector('#fname').value = FORMATIONS[e.target.value].label.replace(/\s*\(.*\)$/, '');
    draw();
  };
  draw();
  return close;
}
