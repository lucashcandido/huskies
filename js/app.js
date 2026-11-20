import { db, exportJSON, importJSON, resetAll, replaceState, subscribe } from './store.js';
import { modal, toast, download, pickFile, confirmDialog, esc } from './ui.js';
import { today } from './metrics.js';
import { measurementsCSV } from './views/athletes.js';
import { demoData } from './demo.js';
import * as sync from './sync.js';
import * as athletes from './views/athletes.js';
import * as testday from './views/testday.js';
import * as rosters from './views/rosters.js';
import * as personnel from './views/personnel.js';
import * as plays from './views/plays.js';

const routes = { athletes, testday, rosters, personnel, plays };
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
  if (needsSetup()) { renderSetup(app); return; }
  const hash = location.hash.replace(/^#\/?/, '') || 'athletes';
  const [name, ...params] = hash.split('/');
  const view = routes[name] || athletes;
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.route === (routes[name] ? name : 'athletes')));
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

// ---------- Datenmenü ----------
function openDataMenu() {
  const s = db();
  const cfg = sync.config();
  const n = `${s.athletes.length} Athlet:innen · ${s.rosters.length} Roster · ${s.personnel.length} Personnel · ${s.plays.length} Spielzüge`;
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
        <button data-a="demo">Beispieldaten laden</button>
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
          const go = () => { replaceState(demoData()); toast('Beispieldaten geladen'); close(); route(); };
          if (db().athletes.length || cfg) confirmDialog(`Beispieldaten ersetzen alle vorhandenen Daten${cfg ? ' – für alle Coaches' : ''}. Fortfahren?`, go, 'Ersetzen');
          else go();
        }
        if (a === 'reset') confirmDialog(`Wirklich ALLE Daten löschen${cfg ? ' – für alle Coaches' : ''}?`, () => { resetAll(); close(); route(); toast('Gelöscht'); });
      });
    },
  });
}
document.getElementById('dataMenuBtn').onclick = openDataMenu;

route();
sync.startAutoSync();
