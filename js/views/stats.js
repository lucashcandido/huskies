// Stats: Practice (Player of the Practice) und Game (Overall- und Einzelstatistiken)

import { db, upsert, remove, uid, get } from '../store.js?v=202611211256';
import { fullName, today, fmtDate } from '../metrics.js?v=202611211256';
import { esc, modal, toast, confirmDialog, options } from '../ui.js?v=202611211256';
import { scoped, currentTeamId, currentTeam } from '../team.js?v=202611211256';

const view = { tab: 'game' };

// ---------- Definitionen ----------
// Overall-Teamstatistik: [Schlüssel, Bezeichnung] – Paare (x/y) werden als „made / att“ dargestellt
export const TEAM_STATS = [
  { group: 'Allgemein', rows: [['firstDowns', 'First Downs'], ['plays', 'Plays gesamt'], ['top', 'Time of Possession', 'text']] },
  { group: 'Laufspiel', rows: [['rushAtt', 'Läufe'], ['rushYds', 'Rushing Yards']] },
  { group: 'Passspiel', rows: [['passCmp', 'Completions'], ['passAtt', 'Pass-Versuche'], ['passYds', 'Passing Yards'], ['passInt', 'Interceptions geworfen'], ['sacksAllowed', 'Sacks kassiert']] },
  { group: 'Downs & Red Zone', rows: [['d3m', '3rd Down geschafft'], ['d3a', '3rd Down Versuche'], ['d4m', '4th Down geschafft'], ['d4a', '4th Down Versuche'], ['rzm', 'Red Zone Scores'], ['rza', 'Red Zone Trips']] },
  { group: 'Fehler', rows: [['fumLost', 'Fumbles verloren'], ['pen', 'Strafen'], ['penYds', 'Strafyards']] },
  { group: 'Special Teams', rows: [['punts', 'Punts'], ['puntYds', 'Punt Yards']] },
];

// Einzelstatistiken je Kategorie: Felder + berechnete Spalten
export const CATS = {
  passing:   { label: 'Passing',   pos: ['QB'], fields: [['cmp', 'Comp'], ['att', 'Att'], ['yds', 'Yds'], ['td', 'TD'], ['int', 'INT'], ['sck', 'Sacks']],
               calc: [['Comp %', s => pct(s.cmp, s.att)], ['Y/A', s => avg(s.yds, s.att)]], sortBy: 'yds' },
  rushing:   { label: 'Rushing',   pos: ['RB', 'FB', 'QB'], fields: [['att', 'Att'], ['yds', 'Yds'], ['td', 'TD'], ['lng', 'Long'], ['fum', 'Fum']],
               calc: [['Ø', s => avg(s.yds, s.att)]], sortBy: 'yds' },
  receiving: { label: 'Receiving', pos: ['WR', 'TE', 'RB', 'FB'], fields: [['tgt', 'Targets'], ['rec', 'Rec'], ['yds', 'Yds'], ['td', 'TD'], ['lng', 'Long']],
               calc: [['Ø', s => avg(s.yds, s.rec)]], sortBy: 'yds' },
  defense:   { label: 'Defense',   pos: ['DL', 'LB', 'CB', 'S'], fields: [['solo', 'Solo'], ['ast', 'Assist'], ['tfl', 'TFL'], ['sck', 'Sacks'], ['int', 'INT'], ['pd', 'PD'], ['ff', 'FF'], ['fr', 'FR'], ['td', 'TD']],
               calc: [['Tackles', s => (s.solo || 0) + (s.ast || 0)]], sortBy: 'tkl' },
  kicking:   { label: 'Kicking',   pos: ['K'], fields: [['fgm', 'FG'], ['fga', 'FGA'], ['xpm', 'XP'], ['xpa', 'XPA'], ['lng', 'Long']],
               calc: [['FG %', s => pct(s.fgm, s.fga)]], sortBy: 'fgm' },
  punting:   { label: 'Punting',   pos: ['P', 'K'], fields: [['no', 'Punts'], ['yds', 'Yds'], ['lng', 'Long'], ['in20', 'In 20']],
               calc: [['Ø', s => avg(s.yds, s.no)]], sortBy: 'yds' },
  returns:   { label: 'Returns',   pos: ['WR', 'CB', 'RB', 'S'], fields: [['kr', 'KR'], ['kryds', 'KR Yds'], ['pr', 'PR'], ['pryds', 'PR Yds'], ['td', 'TD']],
               calc: [], sortBy: 'kryds' },
};
const MAX_FIELDS = new Set(['lng']);   // „Long“ wird über die Saison als Maximum, nicht als Summe gerechnet
const pct = (a, b) => (b ? `${Math.round((a || 0) / b * 1000) / 10}`.replace('.', ',') + ' %' : '–');
const avg = (a, b) => (b ? ((a || 0) / b).toFixed(1).replace('.', ',') : '–');
const num = v => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')));
const sum = list => list.reduce((s, v) => s + (Number(v) || 0), 0);

const athleteLabel = id => {
  const a = get('athletes', id);
  return a ? `${a.number ? '#' + a.number + ' ' : ''}${fullName(a)}` : 'Gelöschte:r Spieler:in';
};
const athleteOptions = (preferPos, selected, exclude = new Set()) => {
  const list = scoped('athletes').filter(a => !exclude.has(a.id))
    .sort((a, b) => ((preferPos.includes(a.position) ? 0 : 1) - (preferPos.includes(b.position) ? 0 : 1)) || (a.lastName || '').localeCompare(b.lastName || ''));
  return options(list.map(a => ({ value: a.id, label: `${a.number ? '#' + a.number + ' ' : ''}${fullName(a)} (${a.position || '–'})` })), selected, { empty: '– Spieler wählen –' });
};

export function render(root, params) {
  if (params[0] === 'game' && params[1]) return renderGame(root, params[1]);
  root.innerHTML = `
    <div class="page-head">
      <div><h1>Stats ${esc(currentTeam()?.name || '')}</h1><p class="muted">Practice: Player of the Practice nominieren · Game: Spielstatistik erfassen – erst Overall, dann individuell.</p></div>
      <div class="spacer"></div>
      <button class="primary" id="add">${view.tab === 'practice' ? '+ Practice' : '+ Spiel'}</button>
    </div>
    <div class="toolbar"><div class="seg" id="tabs">
      <button data-t="practice" class="${view.tab === 'practice' ? 'on' : ''}">Practice (${scoped('practices').length})</button>
      <button data-t="game" class="${view.tab === 'game' ? 'on' : ''}">Game (${scoped('games').length})</button>
    </div></div>
    <div id="body"></div>`;
  root.querySelectorAll('#tabs button').forEach(b => b.onclick = () => { view.tab = b.dataset.t; render(root, []); });
  root.querySelector('#add').onclick = () => (view.tab === 'practice' ? editPractice(null, () => render(root, [])) : newGame());
  if (view.tab === 'practice') drawPractices(root.querySelector('#body'), () => render(root, []));
  else drawGames(root.querySelector('#body'));
}

// ======================= Practice =======================
function drawPractices(el, refresh) {
  const list = scoped('practices').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const counts = {};
  list.forEach(p => { if (p.playerId) counts[p.playerId] = (counts[p.playerId] || 0) + 1; });
  const board = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  el.innerHTML = `
    ${board.length ? `<div class="section-title">Am häufigsten nominiert</div>
      <div class="row" style="gap:8px;margin-bottom:6px">${board.map(([id, n], i) => `<span class="chip">${i === 0 ? '🏆 ' : ''}<b>${esc(athleteLabel(id))}</b> · ${n}×</span>`).join('')}</div>` : ''}
    <div class="section-title">Trainings</div>
    ${list.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Datum</th><th>Training</th><th>Player of the Practice</th><th>Begründung</th></tr></thead>
      <tbody>${list.map(p => {
        const a = get('athletes', p.playerId);
        return `<tr class="click" data-id="${p.id}"><td>${fmtDate(p.date)}</td><td>${esc(p.title || '–')}</td>
          <td>${p.playerId ? `<b>${esc(athleteLabel(p.playerId))}</b> <span class="badge">${esc(a?.position || '–')}</span>` : '<span class="muted">noch offen</span>'}</td>
          <td class="muted" style="white-space:normal">${esc(p.reason || '')}</td></tr>`;
      }).join('')}</tbody></table></div>`
      : '<div class="empty">Noch keine Trainings erfasst. Mit „+ Practice“ legst du eins an und nominierst den Player of the Practice.</div>'}`;
  el.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => editPractice(get('practices', tr.dataset.id), refresh));
}

function editPractice(existing, onDone) {
  const p = existing ? structuredClone(existing) : { id: uid('prac'), teamId: currentTeamId(), date: today(), title: '', playerId: '', reason: '' };
  modal({
    title: existing ? 'Practice bearbeiten' : 'Neue Practice', width: 520,
    body: `<div class="grid">
      <div class="field"><label>Datum</label><input type="date" id="d" value="${esc(p.date)}"></div>
      <div class="field"><label>Training (optional)</label><input id="t" value="${esc(p.title)}" placeholder="z. B. Dienstag – Install Red Zone"></div>
      <div class="field full"><label>🏆 Player of the Practice</label><select id="pl">${athleteOptions([], p.playerId)}</select></div>
      <div class="field full"><label>Begründung (optional)</label><textarea id="r" rows="2" placeholder="Warum?">${esc(p.reason)}</textarea></div>
    </div>`,
    buttons: [
      ...(existing ? [{ label: 'Löschen', cls: 'danger', left: true, onClick: () => { confirmDialog('Diese Practice löschen?', () => { remove('practices', p.id); onDone(); }); } }] : []),
      { label: 'Abbrechen', cls: 'ghost' },
      { label: 'Speichern', cls: 'primary', onClick: (close, r) => {
        p.date = r.querySelector('#d').value || today();
        p.title = r.querySelector('#t').value.trim();
        p.playerId = r.querySelector('#pl').value;
        p.reason = r.querySelector('#r').value.trim();
        upsert('practices', p); toast('Gespeichert'); onDone();
      } },
    ],
  });
}

// ======================= Game: Liste + Saison =======================
const result = g => {
  const us = num(g.scoreUs), them = num(g.scoreThem);
  if (us === null || them === null) return null;
  return us > them ? 'W' : us < them ? 'L' : 'T';
};

function drawGames(el) {
  const games = scoped('games').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const played = games.filter(result);
  const rec = { W: 0, L: 0, T: 0 };
  played.forEach(g => rec[result(g)]++);
  const pf = sum(played.map(g => g.scoreUs)), pa = sum(played.map(g => g.scoreThem));
  el.innerHTML = `
    <div class="stats">
      <div class="stat"><div class="n">${rec.W}-${rec.L}${rec.T ? '-' + rec.T : ''}</div><div class="l">Bilanz</div></div>
      <div class="stat"><div class="n">${pf}</div><div class="l">Punkte erzielt</div></div>
      <div class="stat"><div class="n">${pa}</div><div class="l">Punkte kassiert</div></div>
      <div class="stat"><div class="n">${played.length ? (pf / played.length).toFixed(1).replace('.', ',') : '–'}</div><div class="l">Ø Punkte / Spiel</div></div>
    </div>
    <div class="section-title">Spiele</div>
    ${games.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Datum</th><th>Gegner</th><th></th><th class="num">Ergebnis</th><th></th><th>Art</th><th class="num">Spieler mit Stats</th></tr></thead>
      <tbody>${games.map(g => {
        const r = result(g);
        const n = new Set(Object.keys(CATS).flatMap(c => Object.keys(g['st_' + c] || {}))).size;
        return `<tr class="click" data-id="${g.id}"><td>${fmtDate(g.date)}</td><td><b>${esc(g.opponent || '–')}</b></td><td class="muted">${g.home === false ? '@' : 'vs'}</td>
          <td class="num"><b>${g.scoreUs ?? '–'} : ${g.scoreThem ?? '–'}</b></td>
          <td>${r ? `<span class="badge ${r === 'W' ? 'off' : r === 'L' ? 'def' : ''}">${r === 'W' ? 'Sieg' : r === 'L' ? 'Niederlage' : 'Remis'}</span>` : '<span class="muted small">offen</span>'}</td>
          <td class="muted">${esc(g.kind || 'Liga')}</td><td class="num">${n || '–'}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty">Noch keine Spiele erfasst. Mit „+ Spiel“ legst du eins an.</div>'}
    ${games.length ? seasonLeaders(games) : ''}`;
  el.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => { location.hash = `#/stats/game/${tr.dataset.id}`; });
  el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { view.seasonCat = b.dataset.cat; drawGames(el); });
}

/** Saisonwerte je Spieler und Kategorie (Summe, „Long“ als Maximum) */
function seasonTotals(games, cat) {
  const tot = {};
  for (const g of games) for (const [id, s] of Object.entries(g['st_' + cat] || {})) {
    const t = tot[id] = tot[id] || { gp: 0 };
    t.gp++;
    for (const [k] of CATS[cat].fields) {
      const v = Number(s[k]) || 0;
      t[k] = MAX_FIELDS.has(k) ? Math.max(t[k] || 0, v) : (t[k] || 0) + v;
    }
  }
  return tot;
}

function seasonLeaders(games) {
  const leader = (cat, key, label, calc) => {
    const tot = seasonTotals(games, cat);
    const val = s => (calc ? calc(s) : s[key] || 0);
    const best = Object.entries(tot).sort((a, b) => val(b[1]) - val(a[1]))[0];
    return `<div class="stat"><div class="l">${label}</div>${best && val(best[1]) ? `<div class="n" style="font-size:20px">${val(best[1])}</div><div class="small">${esc(athleteLabel(best[0]))}</div>` : '<div class="n" style="font-size:20px">–</div>'}</div>`;
  };
  const cat = view.seasonCat || 'passing';
  const def = CATS[cat];
  const tot = seasonTotals(games, cat);
  const sortVal = s => (def.sortBy === 'tkl' ? (s.solo || 0) + (s.ast || 0) : s[def.sortBy] || 0);
  const rows = Object.entries(tot).sort((a, b) => sortVal(b[1]) - sortVal(a[1]));
  return `
    <div class="section-title">Saison-Leader</div>
    <div class="stats">
      ${leader('passing', 'yds', 'Passing Yards')}${leader('rushing', 'yds', 'Rushing Yards')}${leader('receiving', 'yds', 'Receiving Yards')}
      ${leader('defense', null, 'Tackles', s => (s.solo || 0) + (s.ast || 0))}${leader('defense', 'sck', 'Sacks')}${leader('defense', 'int', 'Interceptions')}
    </div>
    <div class="section-title">Saison-Statistik</div>
    <div class="toolbar"><div class="seg">${Object.entries(CATS).map(([k, c]) => `<button data-cat="${k}" class="${cat === k ? 'on' : ''}">${c.label}</button>`).join('')}</div></div>
    ${rows.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Spieler</th><th class="num">Spiele</th>${def.fields.map(([, l]) => `<th class="num">${l}</th>`).join('')}${def.calc.map(([l]) => `<th class="num">${l}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(([id, s]) => `<tr><td><b>${esc(athleteLabel(id))}</b></td><td class="num">${s.gp}</td>
        ${def.fields.map(([k]) => `<td class="num">${s[k] ?? 0}</td>`).join('')}${def.calc.map(([, f]) => `<td class="num">${f(s)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      : `<div class="empty">Noch keine ${def.label}-Stats eingetragen.</div>`}`;
}

function newGame() {
  modal({
    title: 'Neues Spiel', width: 520,
    body: `<div class="grid">
      <div class="field"><label>Datum</label><input type="date" id="d" value="${today()}"></div>
      <div class="field"><label>Gegner</label><input id="o" placeholder="z. B. Hamburg Blue Devils"></div>
      <div class="field"><label>Heim / Auswärts</label><select id="h"><option value="1">Heim</option><option value="0">Auswärts</option></select></div>
      <div class="field"><label>Art</label><select id="k">${options(['Liga', 'Playoffs', 'Pokal', 'Testspiel', 'Turnier'], 'Liga')}</select></div>
      <div class="field full"><label>Ort (optional)</label><input id="l"></div>
    </div>`,
    buttons: [{ label: 'Abbrechen', cls: 'ghost' }, { label: 'Anlegen', cls: 'primary', onClick: (close, r) => {
      const opp = r.querySelector('#o').value.trim();
      if (!opp) { alert('Bitte den Gegner eintragen.'); return false; }
      const g = {
        id: uid('game'), teamId: currentTeamId(), date: r.querySelector('#d').value || today(), opponent: opp,
        home: r.querySelector('#h').value === '1', kind: r.querySelector('#k').value, location: r.querySelector('#l').value.trim(),
        scoreUs: null, scoreThem: null, quarters: { us: ['', '', '', '', ''], them: ['', '', '', '', ''] }, teamUs: {}, teamThem: {}, notes: '',
      };
      upsert('games', g);
      location.hash = `#/stats/game/${g.id}`;
    } }],
  });
}

// ======================= Game: Detail =======================
const gameView = { step: 'overall' };

function renderGame(root, id) {
  const g = get('games', id);
  if (!g) { root.innerHTML = '<div class="empty">Spiel nicht gefunden. <a href="#/stats">Zu den Stats</a></div>'; return; }
  const team = currentTeam()?.name || 'Huskies';
  const save = () => upsert('games', g);
  root.innerHTML = `
    <div class="page-head">
      <div><a href="#/stats" class="small">← Stats</a>
      <h1>${esc(team)} ${g.home === false ? '@' : 'vs'} ${esc(g.opponent)}</h1>
      <p class="muted">${fmtDate(g.date)} · ${esc(g.kind || 'Liga')}${g.location ? ' · ' + esc(g.location) : ''}</p></div>
      <div class="spacer"></div>
      <div class="scorebox"><span>${esc(team)}</span><b id="sUs">${g.scoreUs ?? '–'}</b><i>:</i><b id="sThem">${g.scoreThem ?? '–'}</b><span>${esc(g.opponent)}</span></div>
      <button id="editMeta">Bearbeiten</button>
      <button class="danger" id="del">Löschen</button>
    </div>
    <div class="toolbar"><div class="seg" id="steps">
      <button data-s="overall" class="${gameView.step === 'overall' ? 'on' : ''}">1 · Overall</button>
      <button data-s="individual" class="${gameView.step === 'individual' ? 'on' : ''}">2 · Individuell</button>
    </div><span class="small muted">Alles wird sofort gespeichert.</span></div>
    <div id="body"></div>`;
  root.querySelectorAll('#steps button').forEach(b => b.onclick = () => { gameView.step = b.dataset.s; renderGame(root, id); });
  root.querySelector('#del').onclick = () => confirmDialog(`Spiel gegen ${g.opponent} inklusive aller Stats löschen?`, () => { remove('games', g.id); location.hash = '#/stats'; });
  root.querySelector('#editMeta').onclick = () => editMeta(g, () => renderGame(root, id));
  const body = root.querySelector('#body');
  if (gameView.step === 'overall') drawOverall(); else drawIndividual();

  // ---------- 1 · Overall ----------
  function drawOverall() {
    g.quarters = g.quarters || { us: ['', '', '', '', ''], them: ['', '', '', '', ''] };
    g.teamUs = g.teamUs || {}; g.teamThem = g.teamThem || {};
    const qIn = (side, i) => `<input data-q="${side}" data-i="${i}" inputmode="numeric" value="${esc(g.quarters[side][i] ?? '')}" style="width:56px">`;
    const tIn = (side, key, type) => `<input data-t="${side}" data-k="${key}" ${type === 'text' ? 'placeholder="mm:ss" style="width:80px;text-align:right"' : 'inputmode="numeric"'} value="${esc((side === 'us' ? g.teamUs : g.teamThem)[key] ?? '')}">`;
    const calcRows = [
      ['Total Yards', s => (num(s.rushYds) || 0) + (num(s.passYds) || 0)],
      ['Yards / Play', s => (num(s.plays) ? (((num(s.rushYds) || 0) + (num(s.passYds) || 0)) / num(s.plays)).toFixed(1).replace('.', ',') : '–')],
      ['Comp %', s => pct(num(s.passCmp), num(s.passAtt))],
      ['3rd Down %', s => pct(num(s.d3m), num(s.d3a))],
      ['Turnovers', s => (num(s.passInt) || 0) + (num(s.fumLost) || 0)],
    ];
    body.innerHTML = `
      <div class="section-title">Ergebnis nach Vierteln</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Team</th><th class="num">Q1</th><th class="num">Q2</th><th class="num">Q3</th><th class="num">Q4</th><th class="num">OT</th><th class="num">Gesamt</th></tr></thead>
        <tbody>
          <tr><td><b>${esc(team)}</b></td>${[0, 1, 2, 3, 4].map(i => `<td class="num">${qIn('us', i)}</td>`).join('')}<td class="num"><b id="totUs">${g.scoreUs ?? '–'}</b></td></tr>
          <tr><td><b>${esc(g.opponent)}</b></td>${[0, 1, 2, 3, 4].map(i => `<td class="num">${qIn('them', i)}</td>`).join('')}<td class="num"><b id="totThem">${g.scoreThem ?? '–'}</b></td></tr>
        </tbody></table></div>
      <div class="section-title">Teamstatistik</div>
      <div class="table-wrap"><table class="team-stats">
        <thead><tr><th></th><th class="num">${esc(team)}</th><th class="num">${esc(g.opponent)}</th></tr></thead>
        <tbody>${TEAM_STATS.map(grp => `<tr class="grp"><td colspan="3">${grp.group}</td></tr>${grp.rows.map(([k, l, type]) =>
          `<tr><td>${l}</td><td class="num">${tIn('us', k, type)}</td><td class="num">${tIn('them', k, type)}</td></tr>`).join('')}`).join('')}
        <tr class="grp"><td colspan="3">Berechnet</td></tr>
        ${calcRows.map(([l, f]) => `<tr><td>${l}</td><td class="num" data-c="${l}-us">${f(g.teamUs)}</td><td class="num" data-c="${l}-them">${f(g.teamThem)}</td></tr>`).join('')}
        </tbody></table></div>
      <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="primary" id="next">Weiter zu 2 · Individuell →</button></div>`;
    const updateTotals = () => {
      for (const side of ['us', 'them']) {
        const vals = g.quarters[side].map(num).filter(v => v !== null);
        const t = vals.length ? sum(vals) : null;
        if (side === 'us') g.scoreUs = t; else g.scoreThem = t;
      }
      body.querySelector('#totUs').textContent = g.scoreUs ?? '–'; body.querySelector('#totThem').textContent = g.scoreThem ?? '–';
      root.querySelector('#sUs').textContent = g.scoreUs ?? '–'; root.querySelector('#sThem').textContent = g.scoreThem ?? '–';
      for (const [l, f] of calcRows) {
        body.querySelector(`[data-c="${l}-us"]`).textContent = f(g.teamUs);
        body.querySelector(`[data-c="${l}-them"]`).textContent = f(g.teamThem);
      }
    };
    body.querySelectorAll('[data-q]').forEach(inp => inp.onchange = () => {
      g.quarters[inp.dataset.q][+inp.dataset.i] = inp.value.trim() === '' ? '' : num(inp.value);
      g.quarters = { ...g.quarters };
      updateTotals(); save();
    });
    body.querySelectorAll('[data-t]').forEach(inp => inp.onchange = () => {
      const obj = inp.dataset.t === 'us' ? 'teamUs' : 'teamThem';
      const v = inp.placeholder === 'mm:ss' ? inp.value.trim() : (inp.value.trim() === '' ? null : num(inp.value));
      g[obj] = { ...g[obj], [inp.dataset.k]: v };
      updateTotals(); save();
    });
    body.querySelector('#next').onclick = () => { gameView.step = 'individual'; renderGame(root, id); };
  }

  // ---------- 2 · Individuell ----------
  function drawIndividual() {
    body.innerHTML = Object.entries(CATS).map(([cat, def]) => {
      const st = g['st_' + cat] || {};
      const ids = Object.keys(st);
      const totals = Object.fromEntries(def.fields.map(([k]) => [k, MAX_FIELDS.has(k) ? Math.max(0, ...ids.map(i => Number(st[i][k]) || 0)) : sum(ids.map(i => st[i][k]))]));
      const check = cat === 'passing' ? [['yds', 'passYds'], ['cmp', 'passCmp'], ['att', 'passAtt']] : cat === 'rushing' ? [['yds', 'rushYds'], ['att', 'rushAtt']] : [];
      // nur Felder vergleichen, die in den Einzelstats auch eingetragen wurden
      const mism = check.filter(([k, tk]) => totals[k] > 0 && num(g.teamUs?.[tk]) !== null && totals[k] !== num(g.teamUs[tk]));
      return `<div class="card" style="margin-bottom:12px">
        <div class="row" style="justify-content:space-between;margin-bottom:8px"><h3 style="margin:0">${def.label}</h3>
          <div class="row"><select data-addsel="${cat}" style="min-width:220px">${athleteOptions(def.pos, '', new Set(ids))}</select><button class="sm" data-add="${cat}">+ Spieler</button></div></div>
        ${ids.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Spieler</th>${def.fields.map(([, l]) => `<th class="num">${l}</th>`).join('')}${def.calc.map(([l]) => `<th class="num">${l}</th>`).join('')}<th></th></tr></thead>
          <tbody>${ids.map(aid => `<tr><td><b>${esc(athleteLabel(aid))}</b></td>
            ${def.fields.map(([k]) => `<td class="num"><input data-cat="${cat}" data-a="${aid}" data-k="${k}" inputmode="numeric" value="${st[aid][k] ?? ''}" style="width:64px"></td>`).join('')}
            ${def.calc.map(([, f]) => `<td class="num muted">${f(st[aid])}</td>`).join('')}
            <td><button class="sm danger" data-rm="${cat}" data-a="${aid}">✕</button></td></tr>`).join('')}
            <tr style="border-top:2px solid var(--line)"><td><b>Summe</b></td>${def.fields.map(([k]) => `<td class="num"><b>${totals[k]}</b></td>`).join('')}${def.calc.map(([, f]) => `<td class="num"><b>${f(totals)}</b></td>`).join('')}<td></td></tr>
          </tbody></table></div>
          ${mism.length ? `<p class="small" style="color:var(--yellow);margin:6px 0 0">⚠ Abweichung zur Teamstatistik: ${mism.map(([k, tk]) => `${def.fields.find(f => f[0] === k)[1]} ${totals[k]} (Team: ${g.teamUs[tk]})`).join(' · ')}</p>` : ''}`
          : '<p class="muted small" style="margin:0">Noch keine Einträge – Spieler auswählen und hinzufügen.</p>'}
      </div>`;
    }).join('');
    body.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
      const cat = b.dataset.add, aid = body.querySelector(`[data-addsel="${cat}"]`).value;
      if (!aid) return;
      g['st_' + cat] = { ...(g['st_' + cat] || {}), [aid]: {} };
      save(); drawIndividual();
      body.querySelector(`input[data-cat="${cat}"][data-a="${aid}"]`)?.focus();
    });
    body.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      const cat = b.dataset.rm; const st = { ...(g['st_' + cat] || {}) };
      delete st[b.dataset.a]; g['st_' + cat] = st; save(); drawIndividual();
    });
    body.querySelectorAll('input[data-cat]').forEach(inp => {
      inp.onchange = () => {
        const { cat, a, k } = inp.dataset;
        const st = { ...(g['st_' + cat] || {}) };
        st[a] = { ...st[a], [k]: inp.value.trim() === '' ? null : num(inp.value) };
        g['st_' + cat] = st; save();
        const y = window.scrollY; drawIndividual(); window.scrollTo(0, y);
      };
      inp.onkeydown = e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const all = [...body.querySelectorAll('input[data-cat]')];
        const i = all.indexOf(inp);
        inp.dispatchEvent(new Event('change'));
        setTimeout(() => { const next = [...body.querySelectorAll('input[data-cat]')][i + 1]; next?.focus(); next?.select(); }, 0);
      };
    });
  }
}

function editMeta(g, onDone) {
  modal({
    title: 'Spiel bearbeiten', width: 520,
    body: `<div class="grid">
      <div class="field"><label>Datum</label><input type="date" id="d" value="${esc(g.date)}"></div>
      <div class="field"><label>Gegner</label><input id="o" value="${esc(g.opponent)}"></div>
      <div class="field"><label>Heim / Auswärts</label><select id="h"><option value="1" ${g.home !== false ? 'selected' : ''}>Heim</option><option value="0" ${g.home === false ? 'selected' : ''}>Auswärts</option></select></div>
      <div class="field"><label>Art</label><select id="k">${options(['Liga', 'Playoffs', 'Pokal', 'Testspiel', 'Turnier'], g.kind || 'Liga')}</select></div>
      <div class="field full"><label>Ort</label><input id="l" value="${esc(g.location || '')}"></div>
      <div class="field full"><label>Notizen</label><textarea id="n" rows="3">${esc(g.notes || '')}</textarea></div>
    </div>`,
    buttons: [{ label: 'Abbrechen', cls: 'ghost' }, { label: 'Speichern', cls: 'primary', onClick: (close, r) => {
      g.date = r.querySelector('#d').value || g.date; g.opponent = r.querySelector('#o').value.trim() || g.opponent;
      g.home = r.querySelector('#h').value === '1'; g.kind = r.querySelector('#k').value;
      g.location = r.querySelector('#l').value.trim(); g.notes = r.querySelector('#n').value;
      upsert('games', g); onDone();
    } }],
  });
}
