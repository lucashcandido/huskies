import { db, exportJSON, importJSON, resetAll, subscribe, uid, COLLS } from './store.js?v=202611211016';
import { modal, toast, download, pickFile, confirmDialog, esc } from './ui.js?v=202611211016';
import { today } from './metrics.js?v=202611211016';
import { measurementsCSV } from './views/athletes.js?v=202611211016';
import { demoTeam } from './demo.js?v=202611211016';
import * as sync from './sync.js?v=202611211016';
import { teams, currentTeam, setTeam, clearTeam, createTeam, renameTeam, teamUsage, untaggedCount, adoptUntagged } from './team.js?v=202611211016';
import { persist } from './store.js?v=202611211016';
import * as athletes from './views/athletes.js?v=202611211016';
import * as combine from './views/combine.js?v=202611211016';
import * as rosters from './views/rosters.js?v=202611211016';
import * as personnel from './views/personnel.js?v=202611211016';
import * as plays from './views/plays.js?v=202611211016';

const routes = { athletes, combine, testday: combine, rosters, personnel, plays };
const app = document.getElementById('app');
const LOCAL_KEY = 'huskies.localOnly';
let cleanup = null;
let pendingCode = '';

// Link mit Zugangscode: …/#c=ABCD-EFGH-JKLM
{
  const m = /^#c=([A-Za-z0-9-]+)/.exec(location.hash);
  if (m) { pendingCode = sync.cleanCode(m[1]); history.replaceState(null, '', location.pathname + '#/athletes'); }
}

const needsSetup = () => !sync.config() && (localStorage.getItem(LOCAL_KEY) !== '1' || pendingCode);

function route() {
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  app.innerHTML = '';
  const chip = document.getElementById('teamChip');
  if (needsSetup()) { chip.classList.add('hidden'); renderSetup(app); return; }
  const team = currentTeam();
  if (!team) { chip.classList.add('hidden'); renderTeamPicker(app); return; }
  chip.classList.remove('hidden');
  chip.querySelector('span').textContent = team.name;
  const hash = location.hash.replace(/^#\/?/, '') || 'athletes';
  const [name, ...params] = hash.split('/');
  const view = routes[name] || athletes;
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.route === (['combine', 'testday'].includes(name) ? 'athletes' : routes[name] ? name : 'athletes')));
  cleanup = view.render(app, params.map(decodeURIComponent)) || null;
}

window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });

// ---------- Synchronisierung ----------
let rerenderTimer = 0;
function safeRerender() {
  clearTimeout(rerenderTimer);
  const busy = document.querySelector('.overlay') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (busy) { rerenderTimer = setTimeout(safeRerender, 2500); return; }
  const y = window.scrollY;
  route();
  window.scrollTo(0, y);
}
subscribe(({ remote }) => {
  if (remote) safeRerender();      // Änderungen anderer Coaches anzeigen
  else sync.syncSoon();            // eigene Änderungen hochladen
});

const pill = document.getElementById('syncPill');
sync.onStatus(s => {
  pill.className = 'pill ' + s.state;
  pill.querySelector('span').textContent = s.state === 'local' ? 'Nur lokal' : s.text;
  pill.title = sync.config() ? `Verbunden als ${sync.config().coach} mit ${sync.config().repo}` : 'Daten liegen nur auf diesem Gerät';
});
pill.onclick = () => openDataMenu();

// ---------- Team-Auswahl ----------
document.getElementById('teamChip').onclick = () => { clearTeam(); route(); };

function renderTeamPicker(root) {
  document.querySelectorAll('#nav a').forEach(a => a.classList.remove('active'));
  const list = teams();
  const prev = localStorage.getItem('huskies.lastTeam');
  const count = t => { const u = teamUsage(t.id); return `${u.athletes} Athlet:innen · ${u.plays} Spielzüge`; };
  root.innerHTML = `
    <div class="setup">
      <div class="card">
        <h1>Team wählen</h1>
        <p class="muted">Die Auswahl gilt für dieses Gerät, bis du sie oben über den Team-Button wechselst.</p>
        ${list.length ? `<div class="team-list">${list.map(t => `<button class="team-btn ${t.id === prev ? 'cur' : ''}" data-id="${t.id}">${esc(t.name)}<small>${count(t)}</small></button>`).join('')}</div>`
          : '<div class="empty" style="margin:14px 0">Noch kein Team angelegt.</div>'}
        <div class="section-title">Neues Team</div>
        <div class="row"><input id="tn" class="grow" placeholder="z. B. U15, U19, Herren" style="flex:1"><button class="primary" id="tadd">Anlegen</button></div>
        <div id="tmsg"></div>
        ${list.length ? '<p style="margin:16px 0 0;text-align:center"><a href="javascript:void 0" id="manage" class="small">Teams umbenennen</a></p>' : ''}
      </div>
    </div>`;
  const pick = id => {
    setTeam(id); localStorage.setItem('huskies.lastTeam', id);
    const loose = untaggedCount();
    // Detailseiten (z. B. ein Spielzug) gehören zum alten Team → zur Übersicht des Bereichs
    const base = (location.hash.replace(/^#\/?/, '').split('/')[0]) || 'athletes';
    if (location.hash !== '#/' + base) history.replaceState(null, '', '#/' + base);
    route();
    if (loose) confirmDialog(`Es gibt ${loose} Einträge ohne Team (aus einer älteren Version). Dem Team „${currentTeam().name}“ zuordnen?`,
      () => { adoptUntagged(id); persist(); route(); toast('Zugeordnet'); }, 'Zuordnen');
  };
  root.querySelectorAll('[data-id]').forEach(b => b.onclick = () => pick(b.dataset.id));
  const add = async () => {
    const name = root.querySelector('#tn').value.trim();
    const msg = t => { root.querySelector('#tmsg').innerHTML = t ? `<div class="msg err">${esc(t)}</div>` : ''; };
    if (!name) return msg('Bitte einen Namen eingeben.');
    root.querySelector('#tadd').disabled = true;
    if (sync.config()) await sync.syncNow();       // erst abgleichen, damit kein Team doppelt entsteht
    const dup = teams().find(t => t.name.toLowerCase() === name.toLowerCase());
    if (dup) { pick(dup.id); return; }
    pick(createTeam(name).id);
  };
  root.querySelector('#tadd').onclick = add;
  root.querySelector('#tn').onkeydown = e => { if (e.key === 'Enter') add(); };
  root.querySelector('#manage')?.addEventListener('click', () => {
    modal({
      title: 'Teams umbenennen', width: 460,
      body: list.map(t => `<div class="field" style="margin-bottom:8px"><input data-r="${t.id}" value="${esc(t.name)}"></div>`).join(''),
      buttons: [{ label: 'Abbrechen', cls: 'ghost' }, { label: 'Speichern', cls: 'primary', onClick: (close, r) => {
        r.querySelectorAll('[data-r]').forEach(i => renameTeam(i.dataset.r, i.value)); route();
      } }],
    });
  });
}

// ---------- Einrichtung ----------
function renderSetup(root) {
  document.querySelectorAll('#nav a').forEach(a => a.classList.remove('active'));
  root.innerHTML = `
    <div class="setup">
      <div class="card">
        <h1>Huskies Data verbinden</h1>
        <p class="muted">Alle Coaches arbeiten mit denselben Daten. Gib den Zugangscode ein, den du vom Admin bekommen hast.</p>
        <div class="field"><label>Dein Name (erscheint im Verlauf)</label><input id="coach" placeholder="z. B. Coach Müller" value="${esc(localStorage.getItem('huskies.coachName') || '')}"></div>
        <div class="field" style="margin-top:10px"><label>Zugangscode</label>
          <input id="code" class="code-input" placeholder="XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" value="${esc(sync.showCode(pendingCode))}"></div>
        <div id="msg"></div>
        <button class="primary" id="go" style="width:100%;margin-top:12px;padding:12px">Verbinden</button>
        <details style="margin-top:18px">
          <summary class="muted" style="cursor:pointer">Admin: einmalig mit GitHub-Token einrichten</summary>
          <p class="small muted">Einen <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Fine-grained Token</a> erstellen,
          der <b>nur</b> auf <code>${esc(sync.DATA_REPO)}</code> zugreift (Repository permissions → Contents: <b>Read and write</b>).
          Der Token wird nur an GitHub gesendet; für die anderen Coaches wird er verschlüsselt mit dem Zugangscode abgelegt.</p>
          <div class="field"><label>Token</label><input id="token" type="password" placeholder="github_pat_…" autocomplete="off"></div>
          <div id="tmsg"></div>
          <button id="tgo" style="width:100%;margin-top:10px">Mit Token verbinden</button>
        </details>
        <p style="margin:18px 0 0;text-align:center"><a href="javascript:void 0" id="local" class="small">Ohne Synchronisierung nur auf diesem Gerät nutzen</a></p>
      </div>
    </div>`;
  const $ = s => root.querySelector(s);
  const msg = (el, t, cls = 'err') => { $(el).innerHTML = t ? `<div class="msg ${cls}">${esc(t)}</div>` : ''; };
  const codeInp = $('#code');
  codeInp.oninput = () => { codeInp.value = sync.showCode(sync.cleanCode(codeInp.value).slice(0, 12)); };
  codeInp.onkeydown = e => { if (e.key === 'Enter') $('#go').click(); };
  const coachName = () => { const n = $('#coach').value.trim(); localStorage.setItem('huskies.coachName', n); return n; };

  $('#go').onclick = async () => {
    if (!coachName()) return msg('#msg', 'Bitte deinen Namen eintragen.');
    msg('#msg', 'Verbinde…', 'warn'); $('#go').disabled = true;
    try {
      await sync.connectWithCode(codeInp.value, coachName());
      pendingCode = ''; localStorage.removeItem(LOCAL_KEY);
      toast('Verbunden'); location.hash = '#/athletes'; route();
    } catch (e) { msg('#msg', sync.ERRORS[e.message] || sync.ERRORS.net); $('#go').disabled = false; }
  };
  $('#tgo').onclick = async () => {
    if (!coachName()) return msg('#tmsg', 'Bitte oben deinen Namen eintragen.');
    if (!$('#token').value.trim()) return msg('#tmsg', 'Bitte den Token einfügen.');
    msg('#tmsg', 'Prüfe Zugriff…', 'warn'); $('#tgo').disabled = true;
    try {
      await sync.connectWithToken($('#token').value, coachName());
      pendingCode = ''; localStorage.removeItem(LOCAL_KEY);
      location.hash = '#/athletes'; route();
      openAccessDialog(true);
    } catch (e) { msg('#tmsg', sync.ERRORS[e.message] || sync.ERRORS.net); $('#tgo').disabled = false; }
  };
  $('#local').onclick = () => { localStorage.setItem(LOCAL_KEY, '1'); pendingCode = ''; route(); };
}

/** Zugangscode erstellen / anzeigen und access.json veröffentlichen */
function openAccessDialog(fresh = false) {
  const cfg = sync.config();
  let code = cfg.code;
  const { root } = modal({
    title: 'Zugang für Coaches', width: 560,
    body: `
      ${fresh ? '<p>Verbunden. Erstelle jetzt einen Zugangscode für die anderen Coaches.</p>' : ''}
      <div id="codeBox"></div>
      <div id="note"></div>
      <div class="btn-grid" style="margin-top:12px">
        <button class="primary" id="mk">${code ? 'Neuen Code erstellen' : 'Zugangscode erstellen'}</button>
        <button id="cp" ${code ? '' : 'disabled'}>Link kopieren</button>
      </div>
      <p class="small muted" style="margin-bottom:0">Ein neuer Code macht den alten ungültig – bereits verbundene Geräte bleiben verbunden.
      Wird der Token ersetzt, verbindet sich jedes Gerät mit dem gespeicherten Code automatisch neu.</p>`,
    buttons: [{ label: 'Fertig', cls: 'primary' }],
  });
  const draw = () => {
    root.querySelector('#codeBox').innerHTML = code
      ? `<div class="code-show">${esc(sync.showCode(code))}</div><div class="small muted" style="text-align:center;word-break:break-all">${esc(sync.shareLink(code))}</div>`
      : '<p class="muted">Noch kein Code vorhanden.</p>';
    root.querySelector('#cp').disabled = !code;
    root.querySelector('#mk').textContent = code ? 'Neuen Code erstellen' : 'Zugangscode erstellen';
  };
  draw();
  root.querySelector('#mk').onclick = async () => {
    const c = sync.newCode();
    root.querySelector('#note').innerHTML = '<div class="msg warn">Verschlüssele und veröffentliche…</div>';
    const r = await sync.publishAccess(c);
    code = c; draw();
    root.querySelector('#note').innerHTML = r.ok
      ? '<div class="msg ok">Zugangsdatei veröffentlicht. Gib den Code oder Link an die Coaches weiter.</div>'
      : `<div class="msg err">Der Token darf nicht ins App-Repo schreiben (gewollt, wenn er nur <code>${esc(sync.DATA_REPO)}</code> erreicht).
         Bitte den Text unten als <b>access.json</b> ins App-Repo legen:
         <a href="${esc(r.manualUrl)}" target="_blank" rel="noopener">Datei auf GitHub anlegen</a>.</div>
         <textarea readonly rows="5" style="margin-top:8px;font-family:monospace;font-size:11px">${esc(r.text)}</textarea>
         <button class="sm" id="dl" style="margin-top:6px">access.json herunterladen</button>`;
    root.querySelector('#dl')?.addEventListener('click', () => download('access.json', r.text));
  };
  root.querySelector('#cp').onclick = async () => {
    try { await navigator.clipboard.writeText(sync.shareLink(code)); toast('Link kopiert'); }
    catch (e) { prompt('Link kopieren:', sync.shareLink(code)); }
  };
}

// ---------- Beispieldaten ----------
const demoCount = () => ['athletes', 'personnel', 'plays'].reduce((n, c) => n + db()[c].filter(x => x.demo).length, 0);
function removeDemo() {
  const s = db();
  const gone = new Set(s.athletes.filter(a => a.demo).map(a => a.id));
  for (const c of ['athletes', 'personnel', 'plays']) s[c] = s[c].filter(x => !x.demo);
  // Verweise echter Einträge auf entfernte Beispielspieler lösen
  s.personnel.forEach(p => p.slots.forEach(sl => { if (gone.has(sl.athleteId)) sl.athleteId = null; }));
  persist();
}

// ---------- Datenmenü ----------
function openDataMenu() {
  const s = db();
  const cfg = sync.config();
  const n = `Insgesamt ${s.teams.length} Team(s) · ${s.athletes.length} Athlet:innen · ${s.rosters.length} Roster · ${s.personnel.length} Personnel · ${s.plays.length} Spielzüge`;
  const st = sync.getStatus();
  modal({
    title: 'Daten', width: 580,
    body: `
      <div class="card" style="margin-bottom:14px">
        ${cfg ? `<div class="row" style="justify-content:space-between"><div><b>Huskies Data</b> <span class="pill ${st.state}" style="cursor:default"><i></i><span>${esc(st.text)}</span></span>
            <div class="small muted">${esc(cfg.repo)} · angemeldet als <b>${esc(cfg.coach)}</b></div></div></div>
          <div class="btn-grid" style="margin-top:10px">
            <button class="sm primary" data-a="sync">Jetzt synchronisieren</button>
            <button class="sm" data-a="name">Namen ändern</button>
            <button class="sm" data-a="access">Zugang für Coaches</button>
            <button class="sm danger" data-a="unlink">Gerät trennen</button>
          </div>`
        : `<b>Nicht verbunden</b><div class="small muted">Daten liegen nur auf diesem Gerät.</div>
           <button class="sm primary" data-a="connect" style="margin-top:8px">Mit Huskies Data verbinden</button>`}
      </div>
      <p class="muted" style="margin-top:0">${n}</p>
      <div class="btn-grid" style="flex-direction:column;align-items:stretch">
        <button data-a="export">Backup herunterladen (.json)</button>
        <button data-a="import">Backup laden – ersetzt alles</button>
        <button data-a="merge">Backup hinzufügen – zusammenführen</button>
        <button data-a="csv">Messwerte als CSV (Excel) exportieren</button>
        <button data-a="demo">Beispieldaten zu ${esc(currentTeam()?.name || 'einem neuen Team „U19“')} hinzufügen</button>
        ${demoCount() ? `<button data-a="undemo">Alle Beispieldaten entfernen (${demoCount()} Einträge)</button>` : ''}
        <button class="danger" data-a="reset">Alle Daten löschen</button>
      </div>
      ${cfg ? '<p class="small muted" style="margin-bottom:0">Achtung: Laden, Beispieldaten und Löschen wirken über die Synchronisierung auf alle Coaches.</p>' : ''}`,
    onOpen(root, close) {
      root.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
        const a = b.dataset.a;
        if (a === 'sync') { b.disabled = true; await sync.syncNow(); close(); openDataMenu(); }
        if (a === 'name') { const v = prompt('Dein Name:', cfg.coach); if (v) { sync.setCoachName(v); close(); openDataMenu(); } }
        if (a === 'access') { close(); openAccessDialog(); }
        if (a === 'unlink') confirmDialog('Dieses Gerät von Huskies Data trennen? Die lokale Kopie bleibt erhalten, wird aber nicht mehr abgeglichen.', () => {
          sync.disconnect(); localStorage.setItem(LOCAL_KEY, '1'); close(); route();
        }, 'Trennen');
        if (a === 'connect') { localStorage.removeItem(LOCAL_KEY); close(); route(); }
        if (a === 'export') { download(`huskies-backup-${today()}.json`, exportJSON()); toast('Backup gespeichert'); }
        if (a === 'csv') { download(`huskies-messwerte-${today()}.csv`, measurementsCSV(), 'text/csv;charset=utf-8'); }
        if (a === 'import' || a === 'merge') {
          const txt = await pickFile('.json,application/json');
          if (!txt) return;
          const go = () => {
            try { importJSON(txt, a === 'import' ? 'replace' : 'merge'); toast('Daten geladen'); close(); route(); }
            catch (e) { alert('Import fehlgeschlagen: ' + e.message); }
          };
          if (a === 'import' && cfg) confirmDialog('Das Backup ersetzt die Daten für ALLE Coaches. Fortfahren?', go, 'Ersetzen'); else go();
        }
        if (a === 'demo') {
          const go = () => {
            const team = currentTeam() || createTeam('U19');
            setTeam(team.id);
            const d = demoTeam(team, { seed: Date.now() % 9973, uid });
            for (const c of ['athletes', 'personnel', 'plays']) db()[c].push(...d[c]);
            persist();
            toast(`${d.athletes.length} fiktive Spieler hinzugefügt`); close(); route();
          };
          confirmDialog(`Fiktive Spieler mit Combine-Werten, Personnel und Spielzügen zu „${currentTeam()?.name || 'U19'}“ hinzufügen?${cfg ? ' Alle Coaches sehen sie.' : ''} Sie lassen sich hier jederzeit wieder entfernen.`, go, 'Hinzufügen');
        }
        if (a === 'undemo') confirmDialog(`Alle Beispieldaten (${demoCount()} Einträge) in allen Teams entfernen? Echte Daten bleiben erhalten.`, () => {
          removeDemo(); close(); route(); toast('Beispieldaten entfernt');
        }, 'Entfernen');
        if (a === 'reset') confirmDialog(`Wirklich ALLE Daten löschen${cfg ? ' – für alle Coaches' : ''}?`, () => { resetAll(); close(); route(); toast('Gelöscht'); });
      });
    },
  });
}
document.getElementById('dataMenuBtn').onclick = openDataMenu;

route();
sync.startAutoSync();
