// Hängt an alle lokalen JS/CSS-Verweise eine Versionsnummer (?v=…) an.
// GitHub Pages lässt Browser Dateien 10 Minuten cachen – mit neuer Version pro
// Veröffentlichung laden alle Geräte nach einem normalen Neuladen sofort den neuen Stand.
// Aufruf vor jedem Commit:  node tools/stamp-version.mjs
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const v = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const files = ['index.html', ...fs.readdirSync(path.join(root, 'js'), { recursive: true }).filter(f => f.endsWith('.js')).map(f => 'js/' + f)];
for (const f of files) {
  const p = path.join(root, f);
  let s = fs.readFileSync(p, 'utf8');
  const before = s;
  // import … from './x.js'  |  import('./x.js')  |  src="js/app.js"  |  href="css/styles.css"
  s = s.replace(/((?:from\s+|import\()\s*['"])(\.{1,2}\/[^'"?]+\.js)(?:\?v=\w+)?(['"])/g, `$1$2?v=${v}$3`);
  s = s.replace(/((?:src|href)=")((?:js|css)\/[^"?]+\.(?:js|css))(?:\?v=\w+)?(")/g, `$1$2?v=${v}$3`);
  if (s !== before) fs.writeFileSync(p, s);
}
console.log('Version', v);
