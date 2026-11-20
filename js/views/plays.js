import { db, upsert, remove, uid, get } from '../store.js';
import { fullName, athleteSpeedYps } from '../metrics.js';
import { esc, modal, toast, confirmDialog, options } from '../ui.js';
import { W, CX, HASH_L, HASH_R, FORMATIONS, formationPlayers, ROUTES, routePoints, isEligible, clamp, OFFENSE_PERSONNEL, DEFENSE_PERSONNEL } from '../football.js';
import { CONCEPTS, ZONES, buildDefense, assignmentLabel } from '../defense.js';
import { simulate, sepClass, sepColor, defaultSpeed, DT } from '../sim.js';
import { scoped, currentTeamId } from '../team.js';

const ROLE_COLOR = { X: '#ffd23f', Z: '#ff8c42', H: '#7bdff2', Y: '#c084fc', U: '#f472b6', RB: '#a3e635', FB: '#cbd5e1' };
const colorOf = p => ROLE_COLOR[p.role] || '#ffd23f';
const VIEW = { x: -1, y: -32, w: W + 2, h: 44 };
const f2 = n => (+n).toFixed(2);
const snap = v => Math.round(v * 2) / 2;

// ======================= Liste =======================
export function render(root, params) {
  if (params[0]) return renderEditor(root, params[0]);
  const plays = scoped('plays').sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  root.innerHTML = `
    <div class="page-head">
      <div><h1>Playbook</h1><p class="muted">Formation wählen, Routen einzeichnen und gegen ein Defense-Konzept laufen lassen.</p></div>
      <div class="spacer"></div><button class="primary" id="add">+ Spielzug</button>
    </div>
    ${plays.length ? `<div class="cards">${plays.map(p => `<div class="card click" data-id="${p.id}" style="padding:0;overflow:hidden">
      <svg viewBox="${VIEW.x} -26 ${VIEW.w} 34" style="width:100%;display:block;background:#13532a">${fieldSVG()}${routesSVG(p.offense)}${playersSVG(p, {})}</svg>
      <div style="padding:10px 12px"><h3>${esc(p.name)}</h3>
      <div class="small muted">${esc(FORMATIONS[p.formation]?.label || '')} · gegen ${esc(CONCEPTS[p.concept]?.label || '')}</div></div>
    </div>`).join('')}</div>` : '<div class="empty">Noch keine Spielzüge. Leg den ersten an!</div>'}`;
  root.querySelectorAll('[data-id]').forEach(c => c.onclick = () => location.hash = `#/plays/${c.dataset.id}`);
  root.querySelector('#add').onclick = newPlay;
}

function newPlay() {
  const s = db();
  modal({
    title: 'Neuer Spielzug', width: 520,
    body: `<div class="grid">
      <div class="field full"><label>Name</label><input id="n" placeholder="z. B. Mesh vs Cover 3"></div>
      <div class="field full"><label>Formation</label><select id="f">${options(Object.entries(FORMATIONS).map(([k, v]) => ({ value: k, label: v.label })), 'doubles')}</select></div>
      <div class="field full"><label>Offense-Personnel</label><select id="op">${options(scoped('personnel').filter(p => p.side === 'offense').map(p => ({ value: p.id, label: p.name })), '', { empty: '– ohne (nur Positionen) –' })}</select></div>
      <div class="field full"><label>Defense-Konzept</label><select id="c">${options(Object.entries(CONCEPTS).map(([k, v]) => ({ value: k, label: v.label })), 'cover3')}</select></div>
    </div>`,
    buttons: [{ label: 'Abbrechen', cls: 'ghost' }, { label: 'Anlegen', cls: 'primary', onClick: (close, root) => {
      const formation = root.querySelector('#f').value;
      const play = {
        id: uid('play'), teamId: currentTeamId(), name: root.querySelector('#n').value.trim() || 'Neuer Spielzug',
        formation, offense: formationPlayers(formation), offensePersonnelId: root.querySelector('#op').value || null,
        concept: root.querySelector('#c').value, defensePreset: 'auto', defensePersonnelId: null, defenseLocked: false,
        defense: [], duration: 4, notes: '',
      };
      rebuildDefense(play);
      upsert('plays', play);
      location.hash = `#/plays/${play.id}`;
    } }],
  });
}

function rebuildDefense(play) {
  const dp = play.defensePersonnelId ? get('personnel', play.defensePersonnelId) : null;
  const preset = dp ? dp.preset : (play.defensePreset || 'auto');
  play.defense = buildDefense(play.offense, play.concept, preset).players;
  play.defenseLocked = false;
}

// ======================= SVG-Bausteine =======================
function fieldSVG() {
  let s = `<rect x="${VIEW.x - 2}" y="${VIEW.y - 2}" width="${VIEW.w + 4}" height="${VIEW.h + 4}" fill="#0c3219"/>`;
  for (let y = -15; y < 35; y += 5) {
    s += `<rect x="0" y="${-(y + 5)}" width="${f2(W)}" height="5" fill="${((y / 5) & 1) ? '#14552c' : '#175f31'}"/>`;
  }
  for (let y = -10; y <= 30; y += 5) {
    if (y === 0) continue;
    s += `<line x1="0" x2="${f2(W)}" y1="${-y}" y2="${-y}" stroke="rgba(255,255,255,.35)" stroke-width=".12"/>`;
    s += `<text x="1.2" y="${-y - 0.4}" font-size="1.3" fill="rgba(255,255,255,.45)" font-weight="700">${y > 0 ? '+' + y : y}</text>`;
  }
  for (let y = -12; y <= 32; y++) {
    if (y % 5 === 0) continue;
    for (const hx of [HASH_L, HASH_R]) s += `<line x1="${f2(hx - 0.35)}" x2="${f2(hx + 0.35)}" y1="${-y}" y2="${-y}" stroke="rgba(255,255,255,.4)" stroke-width=".1"/>`;
    s += `<line x1="0.2" x2="0.8" y1="${-y}" y2="${-y}" stroke="rgba(255,255,255,.3)" stroke-width=".1"/>`;
    s += `<line x1="${f2(W - 0.8)}" x2="${f2(W - 0.2)}" y1="${-y}" y2="${-y}" stroke="rgba(255,255,255,.3)" stroke-width=".1"/>`;
  }
  s += `<rect x="0" y="${VIEW.y - 2}" width="${f2(W)}" height="${VIEW.h + 4}" fill="none" stroke="rgba(255,255,255,.8)" stroke-width=".25"/>`;
  s += `<line x1="0" x2="${f2(W)}" y1="0" y2="0" stroke="#5aa0e6" stroke-width=".22"/>`;
  s += `<defs>${Object.entries(ROLE_COLOR).map(([r, c]) => `<marker id="arr-${r}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join('')}</defs>`;
  return s;
}

function routesSVG(offense, { selId, faint } = {}) {
  return offense.filter(p => p.route?.length).map(p => {
    const pts = [{ x: p.x, y: p.y }, ...p.route].map(q => `${f2(q.x)},${f2(-q.y)}`).join(' ');
    const c = colorOf(p);
    return `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="${p.id === selId ? 0.42 : 0.3}" stroke-linejoin="round" stroke-linecap="round"
      marker-end="url(#arr-${ROLE_COLOR[p.role] ? p.role : 'X'})" opacity="${faint ? 0.35 : 1}"/>`;
  }).join('');
}

function playersSVG(play, { pos, sel, names, sepNow } = {}) {
  let s = '';
  const at = (side, p) => (pos && pos[side][p.id]) || p;
  for (const d of play.defense || []) {
    const q = at('d', d), isSel = sel && sel.side === 'd' && sel.id === d.id;
    s += `<g data-pid="d:${d.id}" transform="translate(${f2(q.x)},${f2(-q.y)})" style="cursor:pointer">
      ${isSel ? '<circle r="1.55" fill="none" stroke="#5aa0e6" stroke-width=".25"/>' : ''}
      <circle r="1" fill="#3a1515" stroke="#ff6b5b" stroke-width=".18"/>
      <text y=".36" font-size="1" text-anchor="middle" font-weight="800" fill="#ffb3a7">${esc(d.label)}</text>
      ${names?.d?.[d.role] ? `<text y="-1.45" font-size=".72" text-anchor="middle" fill="#ffd9d3" stroke="#0c3219" stroke-width=".25" paint-order="stroke">${esc(names.d[d.role])}</text>` : ''}
    </g>`;
  }
  for (const p of play.offense) {
    const q = at('o', p), isSel = sel && sel.side === 'o' && sel.id === p.id;
    const ring = sepNow && sepNow[p.id] !== undefined ? `<circle r="1.6" fill="none" stroke="${sepColor(sepNow[p.id])}" stroke-width=".3"/>` : '';
    const elig = isEligible(p);
    s += `<g data-pid="o:${p.id}" transform="translate(${f2(q.x)},${f2(-q.y)})" style="cursor:pointer">
      ${ring}${isSel ? '<circle r="1.55" fill="none" stroke="#5aa0e6" stroke-width=".25"/>' : ''}
      <circle r="1" fill="${p.pos === 'OL' ? '#c7ccd4' : '#f2f4f7'}" stroke="${elig ? colorOf(p) : '#0b0c0e'}" stroke-width="${elig ? 0.28 : 0.12}"/>
      <text y=".33" font-size="${p.role.length > 1 ? 0.75 : 0.95}" text-anchor="middle" font-weight="800" fill="#0b0c0e">${esc(p.role)}</text>
      ${names?.o?.[p.role] && p.pos !== 'OL' ? `<text y="2.1" font-size=".72" text-anchor="middle" fill="#fff" stroke="#0c3219" stroke-width=".25" paint-order="stroke">${esc(names.o[p.role])}</text>` : ''}
    </g>`;
  }
  return s;
}

function assignmentsSVG(play, { sel, showZones }) {
  let s = '';
  for (const d of play.defense) {
    const a = d.assign || {};
    const isSel = sel && sel.side === 'd' && sel.id === d.id;
    if (a.type === 'zone' && ZONES[a.zone]) {
      const z = ZONES[a.zone];
      if (showZones || isSel) {
        const [x0, x1, y0, y1] = z.r, yy1 = Math.min(y1, 30);
        s += `<rect x="${f2(x0)}" y="${f2(-yy1)}" width="${f2(x1 - x0)}" height="${f2(yy1 - y0)}" rx="1.5"
          fill="${z.deep ? 'rgba(90,160,230,.10)' : 'rgba(255,107,91,.10)'}" stroke="${z.deep ? 'rgba(90,160,230,.5)' : 'rgba(255,107,91,.5)'}"
          stroke-width="${isSel ? 0.2 : 0.08}" stroke-dasharray="${isSel ? '' : '.6 .4'}"/>`;
      }
      s += `<line x1="${f2(d.x)}" y1="${f2(-d.y)}" x2="${f2(z.L[0])}" y2="${f2(-z.L[1])}" stroke="#ff8a7a" stroke-width=".14" stroke-dasharray=".5 .35" opacity="${isSel ? 1 : 0.55}"/>
        <circle cx="${f2(z.L[0])}" cy="${f2(-z.L[1])}" r=".35" fill="#ff8a7a" opacity="${isSel ? 1 : 0.55}"/>`;
    } else if (a.type === 'man') {
      const t = play.offense.find(p => p.id === a.target);
      if (t) s += `<line x1="${f2(d.x)}" y1="${f2(-d.y)}" x2="${f2(t.x)}" y2="${f2(-t.y)}" stroke="#ff8a7a" stroke-width=".14" stroke-dasharray=".25 .3" opacity="${isSel ? 1 : 0.5}"/>`;
    } else {
      s += `<line x1="${f2(d.x)}" y1="${f2(-d.y)}" x2="${f2(d.x + (CX - d.x) * 0.25)}" y2="${f2(-(d.y - 1.8))}" stroke="#ff8a7a" stroke-width=".18" opacity=".6"/>`;
    }
  }
  return s;
}

// ======================= Editor =======================
function renderEditor(root, id) {
  const play = get('plays', id);
  if (!play) { root.innerHTML = `<div class="empty">Spielzug nicht gefunden. <a href="#/plays">Zum Playbook</a></div>`; return; }
  const ed = { sel: null, mode: 'move', showZones: false, sim: null, t: 0, playing: false, speed: 1, raf: 0, drag: null, last: 0 };

  root.innerHTML = `
    <div class="page-head">
      <div><a href="#/plays" class="small">← Playbook</a>
      <h1><input id="name" value="${esc(play.name)}" style="font-size:20px;font-weight:800;background:transparent;border-color:transparent;padding:2px 4px;margin-left:-4px;width:min(520px,80vw)"></h1></div>
      <div class="spacer"></div>
      <button id="dup">Duplizieren</button>
      <button class="danger" id="del">Löschen</button>
    </div>
    <div class="designer">
      <div>
        <div class="field-wrap">
          <svg class="field-svg" id="svg" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}"></svg>
          <div class="sim-bar">
            <button class="primary" id="playBtn">▶ Abspielen</button>
            <button id="resetBtn" title="Zurück zur Aufstellung">⟲</button>
            <input type="range" id="tSlider" min="0" max="${play.duration}" step="${DT}" value="0">
            <span class="sim-time" id="tLabel">0,0 s</span>
            <select id="speedSel" title="Abspielgeschwindigkeit"><option value="0.5">0,5×</option><option value="1" selected>1×</option><option value="2">2×</option></select>
          </div>
        </div>
        <div class="row" style="margin-top:8px;justify-content:space-between">
          <div class="seg" id="modeSeg">
            <button data-m="move" class="on">✥ Verschieben</button>
            <button data-m="draw">✎ Route zeichnen</button>
          </div>
          <label style="text-transform:none;letter-spacing:0;font-size:13px;color:var(--txt)"><input type="checkbox" id="zonesChk" style="width:auto"> Zonen anzeigen</label>
        </div>
        <p class="legend" id="hint"></p>
        <div class="card" style="margin-top:10px">
          <h3 style="font-size:12px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted)">Separation (Yards zum nächsten Verteidiger)</h3>
          <div id="results"></div>
        </div>
      </div>
      <div class="side">
        <div class="card">
          <h3>Offense</h3>
          <div class="field"><label>Formation</label><select id="formSel">${options(Object.entries(FORMATIONS).map(([k, v]) => ({ value: k, label: v.label })), play.formation)}</select></div>
          <div class="field" style="margin-top:8px"><label>Personnel</label><select id="opSel"></select></div>
          <div class="small muted" id="opHint" style="margin-top:6px"></div>
        </div>
        <div class="card" id="selCard"></div>
        <div class="card">
          <h3>Defense</h3>
          <div class="field"><label>Konzept</label><select id="conceptSel">${options(Object.entries(CONCEPTS).map(([k, v]) => ({ value: k, label: v.label })), play.concept)}</select></div>
          <div class="small muted" id="conceptDesc" style="margin:6px 0 8px"></div>
          <div class="field"><label>Personnel</label><select id="dpSel"></select></div>
          <div class="row" style="margin-top:8px"><button id="realign" class="sm">Defense neu ausrichten</button><span class="small muted" id="lockHint"></span></div>
        </div>
        <div class="card">
          <h3>Einstellungen</h3>
          <div class="field"><label>Simulationsdauer</label><select id="durSel">${options([3, 3.5, 4, 5, 6].map(v => ({ value: v, label: v.toString().replace('.', ',') + ' s' })), play.duration)}</select></div>
          <div class="field" style="margin-top:8px"><label>Notizen / Coaching Points</label><textarea id="notes" rows="4">${esc(play.notes || '')}</textarea></div>
        </div>
      </div>
    </div>`;

  const svg = root.querySelector('#svg');
  const $ = s => root.querySelector(s);

  // ---------- Daten-Helfer ----------
  function maps() {
    const o = {}, d = {}, oa = {}, da = {};
    const op = play.offensePersonnelId ? get('personnel', play.offensePersonnelId) : null;
    if (op) {
      const used = new Set();
      for (const p of play.offense) {
        let sl = op.slots.find(s => s.role === p.role && !used.has(s));
        if (!sl) sl = op.slots.find(s => s.pos === p.pos && !used.has(s) && !play.offense.some(q => q.role === s.role));
        if (sl) { used.add(sl); const a = sl.athleteId && get('athletes', sl.athleteId); if (a) { oa[p.role] = a; o[p.role] = a.lastName || fullName(a); } }
      }
    }
    const dp = play.defensePersonnelId ? get('personnel', play.defensePersonnelId) : null;
    if (dp) for (const sl of dp.slots) { const a = sl.athleteId && get('athletes', sl.athleteId); if (a) { da[sl.role] = a; d[sl.role] = a.lastName || fullName(a); } }
    return { names: { o, d }, oa, da };
  }
  let M = maps();
  const speedOf = (p, side) => { const a = side === 'offense' ? M.oa[p.role] : M.da[p.role]; return a ? athleteSpeedYps(a) : null; };

  const save = () => upsert('plays', play);
  function recompute() { M = maps(); ed.sim = simulate(play, speedOf); drawResults(); }

  // ---------- Zeichnen ----------
  function draw() {
    const inSim = ed.t > 0 && ed.sim;
    let content = fieldSVG();
    if (inSim) {
      const i = clamp(Math.round(ed.t / DT), 0, ed.sim.frames.length - 1);
      const fr = ed.sim.frames[i];
      content += routesSVG(play.offense, { faint: true });
      // Spuren
      for (const p of play.offense.filter(p => isEligible(p) && p.route?.length)) {
        const pts = ed.sim.frames.slice(0, i + 1).filter((_, k) => k % 2 === 0).map(f => `${f2(f.o[p.id].x)},${f2(-f.o[p.id].y)}`).join(' ');
        content += `<polyline points="${pts}" fill="none" stroke="${colorOf(p)}" stroke-width=".22" opacity=".9"/>`;
      }
      for (const d of play.defense) {
        const pts = ed.sim.frames.slice(0, i + 1).filter((_, k) => k % 3 === 0).map(f => `${f2(f.d[d.id].x)},${f2(-f.d[d.id].y)}`).join(' ');
        content += `<polyline points="${pts}" fill="none" stroke="#ff6b5b" stroke-width=".12" opacity=".5"/>`;
      }
      const sepNow = Object.fromEntries(Object.entries(ed.sim.separation).map(([k, v]) => [k, v[i]]));
      content += playersSVG(play, { pos: fr, sel: ed.sel, names: M.names, sepNow });
    } else {
      content += assignmentsSVG(play, { sel: ed.sel, showZones: ed.showZones });
      content += routesSVG(play.offense, { selId: ed.sel?.side === 'o' ? ed.sel.id : null });
      content += playersSVG(play, { sel: ed.sel, names: M.names });
      // Griffe für Routenpunkte
      if (ed.mode === 'draw' && ed.sel?.side === 'o') {
        const p = play.offense.find(x => x.id === ed.sel.id);
        (p?.route || []).forEach((q, k) => {
          content += `<circle data-handle="${k}" cx="${f2(q.x)}" cy="${f2(-q.y)}" r=".55" fill="${colorOf(p)}" stroke="#0b0c0e" stroke-width=".12" style="cursor:move"/>`;
        });
      }
    }
    svg.innerHTML = content;
    $('#tSlider').value = ed.t;
    $('#tLabel').textContent = ed.t.toFixed(1).replace('.', ',') + ' s';
    $('#playBtn').textContent = ed.playing ? '❚❚ Pause' : '▶ Abspielen';
  }

  function drawHint() {
    const p = ed.sel?.side === 'o' ? play.offense.find(x => x.id === ed.sel.id) : null;
    $('#hint').innerHTML = ed.mode === 'draw'
      ? (p && isEligible(p) ? `Route für <b>${esc(p.role)}</b>: aufs Feld klicken, um Punkte zu setzen. Punkte lassen sich ziehen, Doppelklick löscht einen Punkt. <span class="kbd">⌫</span> entfernt den letzten, <span class="kbd">Esc</span> beendet.`
        : 'Erst einen Receiver (WR, TE, RB) antippen, dann Punkte aufs Feld setzen.')
      : 'Spieler antippen zum Auswählen, ziehen zum Verschieben. Routen wandern beim Verschieben mit.';
  }

  function drawSide() {
    const card = $('#selCard');
    if (!ed.sel) {
      card.innerHTML = `<h3>Auswahl</h3><p class="muted small" style="margin:0">Tippe einen Spieler auf dem Feld an, um ihm eine Route zu geben (Offense) oder seine Aufgabe zu ändern (Defense).</p>`;
      return;
    }
    if (ed.sel.side === 'o') {
      const p = play.offense.find(x => x.id === ed.sel.id);
      if (!p) { ed.sel = null; return drawSide(); }
      const a = M.oa[p.role], sp = (a && athleteSpeedYps(a)) || defaultSpeed(p.pos);
      card.innerHTML = `<h3>Offense · ${esc(p.role)}</h3>
        <div style="margin-bottom:8px"><b>${a ? esc(fullName(a)) : esc(p.pos)}</b>
        <div class="small muted">Topspeed ${(sp / 1.09361 * 3.6).toFixed(1).replace('.', ',')} km/h ${a ? '(gemessen)' : '(Standardwert)'}</div></div>
        ${isEligible(p) ? `
          <div class="field"><label>Route aus dem Routenbaum</label></div>
          <div class="btn-grid" style="margin:6px 0 10px">${Object.keys(ROUTES).map(r => `<button class="sm ${p.routeName === r ? 'on' : ''}" data-route="${esc(r)}">${esc(r)}</button>`).join('')}</div>
          <div class="btn-grid">
            <button class="sm ${ed.mode === 'draw' ? 'on' : ''}" id="drawBtn">✎ Freihand zeichnen</button>
            <button class="sm" id="undoPt" ${p.route?.length ? '' : 'disabled'}>Letzten Punkt weg</button>
            <button class="sm danger" id="clearRoute" ${p.route?.length ? '' : 'disabled'}>Route löschen</button>
          </div>` : '<p class="small muted" style="margin:0">Keine Route möglich (nicht passberechtigt).</p>'}`;
      card.querySelectorAll('[data-route]').forEach(b => b.onclick = () => {
        p.route = routePoints(b.dataset.route, p); p.routeName = b.dataset.route; commit();
      });
      card.querySelector('#drawBtn')?.addEventListener('click', () => setMode(ed.mode === 'draw' ? 'move' : 'draw'));
      card.querySelector('#undoPt')?.addEventListener('click', () => { p.route.pop(); p.routeName = p.route.length ? 'Freie Route' : ''; commit(); });
      card.querySelector('#clearRoute')?.addEventListener('click', () => { p.route = []; p.routeName = ''; commit(); });
    } else {
      const d = play.defense.find(x => x.id === ed.sel.id);
      if (!d) { ed.sel = null; return drawSide(); }
      const a = M.da[d.role];
      const val = d.assign.type === 'man' ? 'man:' + d.assign.target : d.assign.type === 'zone' ? 'zone:' + d.assign.zone : 'rush';
      const opts = [{ value: 'rush', label: 'Pass Rush / Blitz' },
        ...play.offense.filter(isEligible).map(p => ({ value: 'man:' + p.id, label: `Mann gegen ${p.role}` })),
        ...Object.entries(ZONES).map(([k, z]) => ({ value: 'zone:' + k, label: 'Zone: ' + z.label }))];
      card.innerHTML = `<h3>Defense · ${esc(d.role)}</h3>
        <div style="margin-bottom:8px"><b>${a ? esc(fullName(a)) : esc(d.pos)}</b>
        <div class="small muted">${esc(assignmentLabel(d, play.offense))}</div></div>
        <div class="field"><label>Aufgabe</label><select id="assignSel">${options(opts, val)}</select></div>`;
      card.querySelector('#assignSel').onchange = e => {
        const v = e.target.value;
        d.assign = v === 'rush' ? { type: 'rush' } : v.startsWith('man:') ? { type: 'man', target: v.slice(4) } : { type: 'zone', zone: v.slice(5) };
        play.defenseLocked = true; commit();
      };
    }
  }

  function drawPanels() {
    const s = db();
    const offP = scoped('personnel').filter(p => p.side === 'offense');
    $('#opSel').innerHTML = options(offP.map(p => ({ value: p.id, label: p.name })), play.offensePersonnelId, { empty: '– ohne –' });
    const op = play.offensePersonnelId ? get('personnel', play.offensePersonnelId) : null;
    const fPers = FORMATIONS[play.formation]?.personnel;
    $('#opHint').innerHTML = !offP.length ? 'Lege unter <a href="#/personnel">Personnel</a> eine Offense-Gruppe an, um echte Spieler und ihre gemessene Geschwindigkeit zu verwenden.'
      : op && op.preset !== fPers ? `Hinweis: Formation ist für ${fPers} Personnel gedacht, gewählt ist ${op.preset}. Positionen werden bestmöglich zugeordnet.` : '';
    const defP = scoped('personnel').filter(p => p.side === 'defense');
    $('#dpSel').innerHTML = options([
      { value: 'auto', label: 'Automatisch (nach Formation)' },
      ...Object.entries(DEFENSE_PERSONNEL).map(([k, v]) => ({ value: 'preset:' + k, label: v.label.split(' (')[0] })),
      ...defP.map(p => ({ value: 'per:' + p.id, label: '★ ' + p.name })),
    ], play.defensePersonnelId ? 'per:' + play.defensePersonnelId : play.defensePreset && play.defensePreset !== 'auto' ? 'preset:' + play.defensePreset : 'auto');
    $('#conceptDesc').textContent = CONCEPTS[play.concept]?.desc || '';
    $('#lockHint').textContent = play.defenseLocked ? 'manuell angepasst' : 'richtet sich automatisch aus';
  }

  function drawResults() {
    const el = $('#results');
    const rec = play.offense.filter(p => isEligible(p) && p.route?.length);
    if (!rec.length) { el.innerHTML = '<p class="muted small" style="margin:0">Gib mindestens einem Receiver eine Route, dann siehst du hier, wer wann offen ist.</p>'; return; }
    const times = [1.5, 2, 2.5, 3, 3.5].filter(t => t <= play.duration);
    const idx = t => Math.min(ed.sim.frames.length - 1, Math.round(t / DT));
    el.innerHTML = `<div class="table-wrap"><table class="sep-table"><thead><tr><th>Receiver</th><th>Route</th>
      ${times.map(t => `<th class="num">${t.toString().replace('.', ',')} s</th>`).join('')}<th class="num">Max. offen</th></tr></thead><tbody>
      ${rec.map(p => {
        const sep = ed.sim.separation[p.id];
        let bi = idx(1), bv = -1;
        for (let k = idx(1); k < sep.length; k++) if (sep[k] > bv) { bv = sep[k]; bi = k; }
        return `<tr><td><span style="color:${colorOf(p)};font-weight:800">${esc(p.role)}</span> <span class="small muted">${esc(M.names.o[p.role] || '')}</span></td>
          <td class="small">${esc(p.routeName || 'Freie Route')}</td>
          ${times.map(t => `<td class="num ${sepClass(sep[idx(t)])}" data-t="${t}" style="cursor:pointer">${sep[idx(t)].toFixed(1).replace('.', ',')}</td>`).join('')}
          <td class="num ${sepClass(bv)}" data-t="${(bi * DT).toFixed(2)}" style="cursor:pointer">${bv.toFixed(1).replace('.', ',')} <span class="small">@ ${(bi * DT).toFixed(1).replace('.', ',')} s</span></td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="legend" style="margin:6px 0 0"><span class="sep-good" style="padding:0 4px">≥ 3 yd offen</span> <span class="sep-mid" style="padding:0 4px">1,5–3 yd eng</span> <span class="sep-bad" style="padding:0 4px">&lt; 1,5 yd gedeckt</span>
      · Zeitpunkt anklicken, um ihn auf dem Feld zu sehen. Vereinfachtes Modell – Speeds aus den Messwerten (Max V bzw. 40 yd), sonst Standardwerte.</p>`;
    el.querySelectorAll('[data-t]').forEach(td => td.onclick = () => { stop(); ed.t = +td.dataset.t; draw(); });
  }

  function commit({ realign = false } = {}) {
    if (realign && !play.defenseLocked) rebuildDefense(play);
    save(); recompute(); draw(); drawSide(); drawPanels(); drawHint();
  }

  function setMode(m) {
    ed.mode = m;
    root.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    draw(); drawSide(); drawHint();
  }

  // ---------- Simulation abspielen ----------
  function stop() { ed.playing = false; cancelAnimationFrame(ed.raf); }
  function tick(now) {
    const dt = ed.last ? (now - ed.last) / 1000 : 0;
    ed.last = now;
    ed.t = Math.min(play.duration, ed.t + dt * ed.speed);
    draw();
    if (ed.t >= play.duration) { stop(); draw(); return; }
    ed.raf = requestAnimationFrame(tick);
  }
  $('#playBtn').onclick = () => {
    if (ed.playing) { stop(); draw(); return; }
    if (ed.t >= play.duration) ed.t = 0;
    ed.playing = true; ed.last = 0; ed.raf = requestAnimationFrame(tick);
  };
  $('#resetBtn').onclick = () => { stop(); ed.t = 0; draw(); };
  $('#tSlider').oninput = e => { stop(); ed.t = +e.target.value; draw(); };
  $('#speedSel').onchange = e => { ed.speed = +e.target.value; };

  // ---------- Interaktion auf dem Feld ----------
  const toField = e => {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: q.x, y: -q.y };
  };
  svg.addEventListener('pointerdown', e => {
    if (ed.t > 0) { stop(); ed.t = 0; }
    const f = toField(e);
    const handle = e.target.closest('[data-handle]');
    const g = e.target.closest('[data-pid]');
    if (handle && ed.sel?.side === 'o') {
      ed.drag = { kind: 'pt', k: +handle.dataset.handle, moved: false };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (g) {
      const [side, pid] = g.dataset.pid.split(':');
      ed.sel = { side, id: pid };
      if (ed.mode === 'move') {
        const obj = (side === 'o' ? play.offense : play.defense).find(x => x.id === pid);
        ed.drag = { kind: 'player', obj, side, dx: obj.x - f.x, dy: obj.y - f.y, moved: false, sx: obj.x, sy: obj.y };
        svg.setPointerCapture(e.pointerId);
      }
      draw(); drawSide(); drawHint();
      return;
    }
    if (ed.mode === 'draw' && ed.sel?.side === 'o') {
      const p = play.offense.find(x => x.id === ed.sel.id);
      if (p && isEligible(p)) {
        p.route = p.route || [];
        p.route.push({ x: clamp(snap(f.x), 0.5, W - 0.5), y: clamp(snap(f.y), -12, 31) });
        p.routeName = 'Freie Route';
        commit();
        return;
      }
    }
    ed.sel = null; draw(); drawSide(); drawHint();
  });
  svg.addEventListener('pointermove', e => {
    if (!ed.drag) return;
    const f = toField(e);
    if (ed.drag.kind === 'player') {
      const { obj, side } = ed.drag;
      let nx = clamp(snap(f.x + ed.drag.dx), 0.5, W - 0.5);
      let ny = side === 'o' ? clamp(snap(f.y + ed.drag.dy), -12, -0.5) : clamp(snap(f.y + ed.drag.dy), 0.5, 25);
      const ddx = nx - obj.x, ddy = ny - obj.y;
      if (!ddx && !ddy) return;
      obj.x = nx; obj.y = ny;
      if (side === 'o') (obj.route || []).forEach(q => { q.x = clamp(q.x + ddx, 0.5, W - 0.5); q.y += ddy; });
      ed.drag.moved = true;
    } else {
      const p = play.offense.find(x => x.id === ed.sel.id);
      const q = p.route[ed.drag.k];
      q.x = clamp(snap(f.x), 0.5, W - 0.5); q.y = clamp(snap(f.y), -12, 31);
      ed.drag.moved = true;
    }
    draw();
  });
  const endDrag = () => {
    if (!ed.drag) return;
    const d = ed.drag; ed.drag = null;
    if (!d.moved) return;
    if (d.kind === 'player' && d.side === 'd') play.defenseLocked = true;
    if (d.kind === 'pt') { const p = play.offense.find(x => x.id === ed.sel.id); p.routeName = 'Freie Route'; }
    commit({ realign: d.kind === 'player' && d.side === 'o' });
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('dblclick', e => {
    const handle = e.target.closest('[data-handle]');
    if (handle && ed.sel?.side === 'o') {
      const p = play.offense.find(x => x.id === ed.sel.id);
      p.route.splice(+handle.dataset.handle, 1);
      p.routeName = p.route.length ? 'Freie Route' : '';
      commit();
    }
  });
  const onKey = e => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    if (e.key === 'Escape' && ed.mode === 'draw') setMode('move');
    if ((e.key === 'Backspace' || e.key === 'Delete') && ed.mode === 'draw' && ed.sel?.side === 'o') {
      const p = play.offense.find(x => x.id === ed.sel.id);
      if (p?.route?.length) { e.preventDefault(); p.route.pop(); commit(); }
    }
    if (e.key === ' ' && !e.repeat) { e.preventDefault(); $('#playBtn').click(); }
  };
  document.addEventListener('keydown', onKey);

  // ---------- Panels ----------
  root.querySelectorAll('#modeSeg button').forEach(b => b.onclick = () => setMode(b.dataset.m));
  $('#zonesChk').onchange = e => { ed.showZones = e.target.checked; draw(); };
  $('#name').onchange = e => { play.name = e.target.value.trim() || play.name; save(); toast('Gespeichert'); };
  $('#notes').onchange = e => { play.notes = e.target.value; save(); };
  $('#durSel').onchange = e => { play.duration = +e.target.value; $('#tSlider').max = play.duration; ed.t = 0; commit(); };
  $('#formSel').onchange = e => {
    const apply = () => { play.formation = e.target.value; play.offense = formationPlayers(play.formation); ed.sel = null; play.defenseLocked = false; commit({ realign: true }); };
    if (play.offense.some(p => p.route?.length)) {
      confirmDialog('Neue Formation setzt alle Spieler zurück und löscht die Routen. Fortfahren?', apply, 'Formation wechseln');
      e.target.value = play.formation;
    } else apply();
  };
  $('#opSel').onchange = e => { play.offensePersonnelId = e.target.value || null; commit(); };
  $('#conceptSel').onchange = e => {
    const go = () => { play.concept = e.target.value; play.defenseLocked = false; ed.sel = ed.sel?.side === 'd' ? null : ed.sel; commit({ realign: true }); };
    if (play.defenseLocked) { confirmDialog('Manuelle Anpassungen der Defense gehen verloren. Fortfahren?', go, 'Konzept wechseln'); e.target.value = play.concept; }
    else go();
  };
  $('#dpSel').onchange = e => {
    const v = e.target.value;
    play.defensePersonnelId = v.startsWith('per:') ? v.slice(4) : null;
    play.defensePreset = v.startsWith('preset:') ? v.slice(7) : 'auto';
    play.defenseLocked = false; if (ed.sel?.side === 'd') ed.sel = null;
    commit({ realign: true });
  };
  $('#realign').onclick = () => { play.defenseLocked = false; if (ed.sel?.side === 'd') ed.sel = null; commit({ realign: true }); toast('Defense neu ausgerichtet'); };
  $('#dup').onclick = () => { const c = structuredClone(play); c.id = uid('play'); c.name += ' (Kopie)'; upsert('plays', c); location.hash = `#/plays/${c.id}`; };
  $('#del').onclick = () => confirmDialog(`Spielzug „${play.name}“ löschen?`, () => { remove('plays', play.id); location.hash = '#/plays'; });

  if (!play.defense?.length) rebuildDefense(play);
  recompute(); draw(); drawSide(); drawPanels(); drawHint();

  return () => { stop(); document.removeEventListener('keydown', onKey); };
}
