import { db, exportJSON, importJSON, resetAll, replaceState } from './store.js';
import { modal, toast, download, pickFile, confirmDialog } from './ui.js';
import { today } from './metrics.js';
import { measurementsCSV } from './views/athletes.js';
import { demoData } from './demo.js';
import * as athletes from './views/athletes.js';
import * as testday from './views/testday.js';
import * as rosters from './views/rosters.js';
import * as personnel from './views/personnel.js';
import * as plays from './views/plays.js';

const routes = { athletes, testday, rosters, personnel, plays };
const app = document.getElementById('app');
let cleanup = null;

function route() {
  const hash = location.hash.replace(/^#\/?/, '') || 'athletes';
  const [name, ...params] = hash.split('/');
  const view = routes[name] || athletes;
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.route === (routes[name] ? name : 'athletes')));
  if (typeof cleanup === 'function') cleanup();
  app.innerHTML = '';
  cleanup = view.render(app, params.map(decodeURIComponent)) || null;
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);

document.getElementById('dataMenuBtn').onclick = () => {
  const s = db();
  const n = `${s.athletes.length} Athlet:innen · ${s.rosters.length} Roster · ${s.personnel.length} Personnel · ${s.plays.length} Spielzüge`;
  modal({
    title: 'Daten', width: 560,
    body: `
      <p class="muted" style="margin-top:0">Alle Daten liegen nur in diesem Browser auf diesem Gerät (${n}).
      Sichere regelmäßig eine Backup-Datei – damit kannst du die Daten auch auf ein anderes Gerät übertragen.</p>
      <div class="btn-grid" style="flex-direction:column;align-items:stretch">
        <button class="primary" data-a="export">Backup herunterladen (.json)</button>
        <button data-a="import">Backup laden – ersetzt alles</button>
        <button data-a="merge">Backup hinzufügen – zusammenführen</button>
        <button data-a="csv">Messwerte als CSV (Excel) exportieren</button>
        <button data-a="demo">Beispieldaten laden</button>
        <button class="danger" data-a="reset">Alle Daten löschen</button>
      </div>`,
    onOpen(root, close) {
      root.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
        const a = b.dataset.a;
        if (a === 'export') { download(`huskies-backup-${today()}.json`, exportJSON()); toast('Backup gespeichert'); }
        if (a === 'csv') { download(`huskies-messwerte-${today()}.csv`, measurementsCSV(), 'text/csv;charset=utf-8'); }
        if (a === 'import' || a === 'merge') {
          const txt = await pickFile('.json,application/json');
          if (!txt) return;
          try { importJSON(txt, a === 'import' ? 'replace' : 'merge'); toast('Daten geladen'); close(); route(); }
          catch (e) { alert('Import fehlgeschlagen: ' + e.message); }
        }
        if (a === 'demo') {
          const go = () => { replaceState(demoData()); toast('Beispieldaten geladen'); close(); route(); };
          if (db().athletes.length) confirmDialog('Beispieldaten ersetzen alle vorhandenen Daten. Fortfahren?', go, 'Ersetzen');
          else go();
        }
        if (a === 'reset') confirmDialog('Wirklich ALLE Daten in diesem Browser löschen?', () => { resetAll(); close(); route(); toast('Gelöscht'); });
      });
    },
  });
};

route();
