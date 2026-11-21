// Football-Grundlagen: Personnel-Gruppen, Formationen, Routen-Baum.
// Koordinaten in Yards: x = 0 (linke Seitenlinie) … 53,33 (rechte Seitenlinie),
// y = 0 Line of Scrimmage, positive y = Richtung gegnerische Endzone.

export const W = 160 / 3;          // Feldbreite 53,33 yd
export const CX = W / 2;           // Ballposition (Mitte)
export const HASH_L = 20, HASH_R = W - 20;   // NCAA-/IFAF-Hashmarks

// ---------- Personnel ----------
// Rollen-Labels werden 1:1 in den Formationen verwendet, damit Spieler
// aus einem Personnel automatisch auf die richtigen Punkte gesetzt werden.
const OL = [
  { role: 'LT', pos: 'OL' }, { role: 'LG', pos: 'OL' }, { role: 'C', pos: 'OL' }, { role: 'RG', pos: 'OL' }, { role: 'RT', pos: 'OL' },
];
export const OFFENSE_PERSONNEL = {
  '00': { label: 'Empty / 00 Personnel (0 RB · 0 TE · 5 WR)', slots: [{ role: 'QB', pos: 'QB' }, { role: 'X', pos: 'WR' }, { role: 'Z', pos: 'WR' }, { role: 'H', pos: 'WR' }, { role: 'Y', pos: 'WR' }, { role: 'F', pos: 'WR' }, ...OL] },
  '10': { label: '10 Personnel (1 RB · 0 TE · 4 WR)', slots: [{ role: 'QB', pos: 'QB' }, { role: 'RB', pos: 'RB' }, { role: 'X', pos: 'WR' }, { role: 'Z', pos: 'WR' }, { role: 'H', pos: 'WR' }, { role: 'Y', pos: 'WR' }, ...OL] },
  '11': { label: '11 Personnel (1 RB · 1 TE · 3 WR)', slots: [{ role: 'QB', pos: 'QB' }, { role: 'RB', pos: 'RB' }, { role: 'X', pos: 'WR' }, { role: 'Z', pos: 'WR' }, { role: 'H', pos: 'WR' }, { role: 'Y', pos: 'TE' }, ...OL] },
  '12': { label: '12 Personnel (1 RB · 2 TE · 2 WR)', slots: [{ role: 'QB', pos: 'QB' }, { role: 'RB', pos: 'RB' }, { role: 'X', pos: 'WR' }, { role: 'Z', pos: 'WR' }, { role: 'Y', pos: 'TE' }, { role: 'U', pos: 'TE' }, ...OL] },
  '21': { label: '21 Personnel (2 RB · 1 TE · 2 WR)', slots: [{ role: 'QB', pos: 'QB' }, { role: 'RB', pos: 'RB' }, { role: 'FB', pos: 'FB' }, { role: 'X', pos: 'WR' }, { role: 'Z', pos: 'WR' }, { role: 'Y', pos: 'TE' }, ...OL] },
  '22': { label: '22 Personnel (2 RB · 2 TE · 1 WR)', slots: [{ role: 'QB', pos: 'QB' }, { role: 'RB', pos: 'RB' }, { role: 'FB', pos: 'FB' }, { role: 'X', pos: 'WR' }, { role: 'Y', pos: 'TE' }, { role: 'U', pos: 'TE' }, ...OL] },
};
export const DEFENSE_PERSONNEL = {
  'base43': { label: 'Base 4-3 (4 DL · 3 LB · 4 DB)', slots: [
    { role: 'LE', pos: 'DL' }, { role: 'LT', pos: 'DL' }, { role: 'RT', pos: 'DL' }, { role: 'RE', pos: 'DL' },
    { role: 'W', pos: 'LB' }, { role: 'M', pos: 'LB' }, { role: 'S', pos: 'LB' },
    { role: 'CBL', pos: 'CB' }, { role: 'CBR', pos: 'CB' }, { role: 'FS', pos: 'S' }, { role: 'SS', pos: 'S' }] },
  'nickel': { label: 'Nickel 4-2-5 (4 DL · 2 LB · 5 DB)', slots: [
    { role: 'LE', pos: 'DL' }, { role: 'LT', pos: 'DL' }, { role: 'RT', pos: 'DL' }, { role: 'RE', pos: 'DL' },
    { role: 'W', pos: 'LB' }, { role: 'M', pos: 'LB' },
    { role: 'CBL', pos: 'CB' }, { role: 'CBR', pos: 'CB' }, { role: 'NB', pos: 'CB' }, { role: 'FS', pos: 'S' }, { role: 'SS', pos: 'S' }] },
  'dime': { label: 'Dime 4-1-6 (4 DL · 1 LB · 6 DB)', slots: [
    { role: 'LE', pos: 'DL' }, { role: 'LT', pos: 'DL' }, { role: 'RT', pos: 'DL' }, { role: 'RE', pos: 'DL' },
    { role: 'M', pos: 'LB' },
    { role: 'CBL', pos: 'CB' }, { role: 'CBR', pos: 'CB' }, { role: 'NB', pos: 'CB' }, { role: 'DB', pos: 'CB' }, { role: 'FS', pos: 'S' }, { role: 'SS', pos: 'S' }] },
};

export const ROLE_NAMES = {
  QB: 'Quarterback', F: 'F – 5. Receiver', RB: 'Running Back', FB: 'Fullback', X: 'X – Split End', Z: 'Z – Flanker', H: 'H – Slot', Y: 'Y', U: 'U – 2. TE',
  LT: 'Left Tackle', LG: 'Left Guard', C: 'Center', RG: 'Right Guard', RT: 'Right Tackle',
  LE: 'Left End', DLT: 'Tackle', RE: 'Right End', W: 'Will LB', M: 'Mike LB', S: 'Sam LB',
  CBL: 'Cornerback links', CBR: 'Cornerback rechts', NB: 'Nickel', DB: 'Dime', FS: 'Free Safety', SS: 'Strong Safety',
};

// ---------- Formationen ----------
const ol = () => [
  { role: 'LT', pos: 'OL', x: CX - 4, y: -1 }, { role: 'LG', pos: 'OL', x: CX - 2, y: -1 }, { role: 'C', pos: 'OL', x: CX, y: -1 },
  { role: 'RG', pos: 'OL', x: CX + 2, y: -1 }, { role: 'RT', pos: 'OL', x: CX + 4, y: -1 },
];
export const FORMATIONS = {
  'doubles': { label: 'Doubles 2x2 (Shotgun)', personnel: '11', players: () => [...ol(),
    { role: 'QB', pos: 'QB', x: CX, y: -5 }, { role: 'RB', pos: 'RB', x: CX + 2.3, y: -5 },
    { role: 'X', pos: 'WR', x: 6, y: -1 }, { role: 'H', pos: 'WR', x: 14, y: -2 },
    { role: 'Y', pos: 'TE', x: CX + 6, y: -1.5 }, { role: 'Z', pos: 'WR', x: W - 7, y: -2 }] },
  'spread': { label: 'Spread 2x2 (4 WR)', personnel: '10', players: () => [...ol(),
    { role: 'QB', pos: 'QB', x: CX, y: -5 }, { role: 'RB', pos: 'RB', x: CX - 2.3, y: -5 },
    { role: 'X', pos: 'WR', x: 6, y: -1 }, { role: 'H', pos: 'WR', x: 15, y: -2 },
    { role: 'Y', pos: 'WR', x: W - 15, y: -2 }, { role: 'Z', pos: 'WR', x: W - 6, y: -1 }] },
  'trips': { label: 'Trips Right 3x1', personnel: '11', players: () => [...ol(),
    { role: 'QB', pos: 'QB', x: CX, y: -5 }, { role: 'RB', pos: 'RB', x: CX - 2.3, y: -5 },
    { role: 'X', pos: 'WR', x: 6, y: -1 },
    { role: 'Y', pos: 'TE', x: CX + 6, y: -1.5 }, { role: 'H', pos: 'WR', x: W - 14, y: -2 }, { role: 'Z', pos: 'WR', x: W - 6, y: -1 }] },
  'bunch': { label: 'Bunch Right', personnel: '11', players: () => [...ol(),
    { role: 'QB', pos: 'QB', x: CX, y: -5 }, { role: 'RB', pos: 'RB', x: CX - 2.3, y: -5 },
    { role: 'X', pos: 'WR', x: 6, y: -1 },
    { role: 'Z', pos: 'WR', x: W - 13, y: -1 }, { role: 'H', pos: 'WR', x: W - 11.5, y: -2.5 }, { role: 'Y', pos: 'TE', x: W - 14.5, y: -2.5 }] },
  'empty': { label: 'Empty 3x2', personnel: '00', players: () => [...ol(),
    { role: 'QB', pos: 'QB', x: CX, y: -5 },
    { role: 'X', pos: 'WR', x: 6, y: -1 }, { role: 'F', pos: 'WR', x: 13, y: -2 },
    { role: 'H', pos: 'WR', x: W - 18, y: -2 }, { role: 'Y', pos: 'WR', x: W - 12, y: -2 }, { role: 'Z', pos: 'WR', x: W - 6, y: -1 }] },
  'emptyQuads': { label: 'Empty Quads 4x1', personnel: '00', players: () => [...ol(),
    { role: 'QB', pos: 'QB', x: CX, y: -5 },
    { role: 'X', pos: 'WR', x: 6, y: -1 },
    { role: 'F', pos: 'WR', x: CX + 5, y: -2 }, { role: 'H', pos: 'WR', x: W - 18, y: -2 }, { role: 'Y', pos: 'WR', x: W - 12, y: -2 }, { role: 'Z', pos: 'WR', x: W - 6, y: -1 }] },
  'emptySpread': { label: 'Empty 2x3 (Trey Left)', personnel: '00', players: () => [...ol(),
    { role: 'QB', pos: 'QB', x: CX, y: -5 },
    { role: 'X', pos: 'WR', x: 6, y: -1 }, { role: 'H', pos: 'WR', x: 13, y: -2 }, { role: 'F', pos: 'WR', x: 19, y: -2 },
    { role: 'Y', pos: 'WR', x: W - 13, y: -2 }, { role: 'Z', pos: 'WR', x: W - 6, y: -1 }] },
  'ace12': { label: 'Ace 12 (2 TE)', personnel: '12', players: () => [...ol(),
    { role: 'QB', pos: 'QB', x: CX, y: -1.8 }, { role: 'RB', pos: 'RB', x: CX, y: -7 },
    { role: 'X', pos: 'WR', x: 6, y: -1 }, { role: 'U', pos: 'TE', x: CX - 6, y: -1.5 },
    { role: 'Y', pos: 'TE', x: CX + 6, y: -1.5 }, { role: 'Z', pos: 'WR', x: W - 8, y: -2 }] },
  'trips10': { label: 'Trips Right (4 WR)', personnel: '10', players: () => [...ol(),
    { role: 'QB', pos: 'QB', x: CX, y: -5 }, { role: 'RB', pos: 'RB', x: CX - 2.3, y: -5 },
    { role: 'X', pos: 'WR', x: 6, y: -1 },
    { role: 'Y', pos: 'WR', x: W - 19, y: -2 }, { role: 'H', pos: 'WR', x: W - 13, y: -2 }, { role: 'Z', pos: 'WR', x: W - 6, y: -1 }] },
  'trips12': { label: 'Trips Right (2 TE)', personnel: '12', players: () => [...ol(),
    { role: 'QB', pos: 'QB', x: CX, y: -5 }, { role: 'RB', pos: 'RB', x: CX - 2.3, y: -5 },
    { role: 'X', pos: 'WR', x: 6, y: -1 },
    { role: 'Y', pos: 'TE', x: CX + 6, y: -1.5 }, { role: 'U', pos: 'TE', x: W - 15, y: -2 }, { role: 'Z', pos: 'WR', x: W - 6, y: -1 }] },
  'jumbo22': { label: 'I-Form 22 (2 TE)', personnel: '22', players: () => [...ol(),
    { role: 'QB', pos: 'QB', x: CX, y: -1.8 }, { role: 'FB', pos: 'FB', x: CX, y: -4.5 }, { role: 'RB', pos: 'RB', x: CX, y: -7 },
    { role: 'X', pos: 'WR', x: 6, y: -1 }, { role: 'U', pos: 'TE', x: CX - 6, y: -1.5 }, { role: 'Y', pos: 'TE', x: CX + 6, y: -1.5 }] },
  'proI': { label: 'Pro I (21)', personnel: '21', players: () => [...ol(),
    { role: 'QB', pos: 'QB', x: CX, y: -1.8 }, { role: 'FB', pos: 'FB', x: CX, y: -4.5 }, { role: 'RB', pos: 'RB', x: CX, y: -7 },
    { role: 'X', pos: 'WR', x: 6, y: -1 }, { role: 'Y', pos: 'TE', x: CX + 6, y: -1.5 }, { role: 'Z', pos: 'WR', x: W - 8, y: -2 }] },
};

export function formationPlayers(key) {
  const f = FORMATIONS[key] || FORMATIONS.doubles;
  return f.players().map(p => ({ ...p, id: p.role, route: [], routeName: '' }));
}

export const isEligible = p => ['WR', 'TE', 'RB', 'FB'].includes(p.pos);

// ---------- Routen-Baum ----------
// dx positiv = Richtung Feldmitte („inside“), dy positiv = downfield.
export const ROUTES = {
  'Hitch':    [[0, 6], [0.5, 5]],
  'Slant':    [[0, 2], [7, 9]],
  'Out':      [[0, 10], [-8, 10]],
  'Quick Out':[[0, 5], [-7, 5]],
  'In / Dig': [[0, 12], [12, 12]],
  'Curl':     [[0, 12], [1.5, 10]],
  'Comeback': [[0, 15], [-3, 12]],
  'Go / Fade':[[-1, 5], [-2, 28]],
  'Seam':     [[0, 28]],
  'Post':     [[0, 12], [8, 26]],
  'Corner':   [[0, 12], [-8, 22]],
  'Drag':     [[1, 2], [22, 5]],
  'Flat':     [[-2, 1], [-9, 3]],
  'Wheel':    [[-5, 1], [-8, 5], [-8, 26]],
  'Swing':    [[-3, -1], [-9, 1]],
  'Angle':    [[-3, 3], [3, 8]],
  'Sit':      [[0, 6], [0, 6.5]],
};

// ---------- Typische Offense-Konzepte (Routen-Kombinationen) ----------
export const OFFENSE_CONCEPTS = {
  smash:     { label: 'Smash',          formation: 'doubles', routes: { X: 'Hitch', H: 'Corner', Y: 'Corner', Z: 'Hitch', RB: 'Flat' } },
  fourVerts: { label: 'Four Verticals', formation: 'doubles', routes: { X: 'Go / Fade', H: 'Seam', Y: 'Seam', Z: 'Go / Fade', RB: 'Swing' } },
  mesh:      { label: 'Mesh',           formation: 'trips',   routes: { X: 'Drag', Y: 'Drag', H: 'Corner', Z: 'Go / Fade', RB: 'Angle' } },
  flood:     { label: 'Flood',          formation: 'trips',   routes: { X: 'Post', Y: 'Flat', H: 'Out', Z: 'Go / Fade', RB: 'Swing' } },
  curlFlat:  { label: 'Curl / Flat',    formation: 'doubles', routes: { X: 'Curl', H: 'Flat', Y: 'Seam', Z: 'Curl', RB: 'Angle' } },
  slants:    { label: 'Slants',         formation: 'spread',  routes: { X: 'Slant', H: 'Slant', Y: 'Slant', Z: 'Slant', RB: 'Swing' } },
  stick:     { label: 'Stick',          formation: 'trips',   routes: { X: 'Slant', Y: 'Sit', H: 'Flat', Z: 'Go / Fade', RB: 'Angle' } },
  dagger:    { label: 'Dagger',         formation: 'doubles', routes: { X: 'Go / Fade', H: 'Seam', Y: 'In / Dig', Z: 'In / Dig', RB: 'Swing' } },
};

/** Setzt die Routen eines Konzepts auf die passenden Spieler (übrige Routen werden gelöscht) */
export function applyConcept(players, key) {
  const c = OFFENSE_CONCEPTS[key];
  for (const p of players) { p.route = []; p.routeName = ''; }
  if (!c) return players;
  for (const [role, r] of Object.entries(c.routes)) {
    const p = players.find(x => x.role === role);
    if (p) { p.route = routePoints(r, p); p.routeName = r; }
  }
  return players;
}

// ---------- Dasselbe Konzept in anderem Personnel ----------
// Konzepte werden in „11-Rollen“ gedacht (X, Z, H, Y, RB). In anderen Personnel-Gruppen
// übernimmt ein anderer Spieler die Rolle, die Formation passt sich an.
export const PERS_KEYS = ['00', '10', '11', '12', '21', '22'];
export const persLabel = k => (k === '00' ? 'Empty' : `${k} Personnel`);
const ROLE_MAP = { '00': { RB: 'F' }, '10': {}, '11': {}, '12': { H: 'U' }, '21': { H: 'FB' }, '22': { H: 'U', Z: 'FB' } };
const FORM_BY = {
  '00': { doubles: 'emptySpread', trips: 'empty' }, '10': { doubles: 'spread', trips: 'trips10' }, '11': { doubles: 'doubles', trips: 'trips' },
  '12': { doubles: 'ace12', trips: 'trips12' }, '21': { doubles: 'proI', trips: 'proI' }, '22': { doubles: 'jumbo22', trips: 'jumbo22' },
};
export const personnelOf = formation => FORMATIONS[formation]?.personnel || '11';
export const familyOf = formation => FORMATIONS[formation]?.family || ((['trips', 'bunch', 'empty', 'emptyQuads', 'trips10', 'trips12'].includes(formation) ? 'trips' : 'doubles'));
const canonRole = (role, pers) => Object.entries(ROLE_MAP[pers] || {}).find(([, a]) => a === role)?.[0] || role;

/** Routen relativ zum Startpunkt (dx Richtung Feldmitte), je 11-Rolle */
export function relRoutes(offense, pers) {
  const out = {};
  for (const p of offense) {
    if (!isEligible(p) || !p.route?.length) continue;
    const s = p.x < CX ? 1 : -1;
    out[canonRole(p.role, pers)] = { name: p.routeName, pts: p.route.map(q => [(q.x - p.x) * s, q.y - p.y]) };
  }
  return out;
}

/** Erzeugt die Offense eines Konzepts in einem anderen Personnel */
export function offenseIn(pers, family, rel) {
  return offenseInFormation(FORM_BY[pers]?.[family] || FORM_BY['11'][family], rel);
}

/** Überträgt Routen (je 11-Rolle, relativ) auf eine beliebige Formation */
export function offenseInFormation(formation, rel) {
  const pers = personnelOf(formation);
  const players = formationPlayers(formation);
  for (const [canon, r] of Object.entries(rel)) {
    const role = ROLE_MAP[pers]?.[canon] || canon;
    const p = players.find(x => x.role === role);
    if (!p) continue;
    const s = p.x < CX ? 1 : -1;
    p.route = r.pts.map(([dx, dy]) => ({ x: clamp(p.x + dx * s, 0.5, W - 0.5), y: p.y + dy }));
    p.routeName = r.name;
  }
  return { formation, players };
}

/** Wandelt eine Routen-Vorlage in absolute Punkte für einen Spieler um */
export function routePoints(name, p) {
  const def = ROUTES[name];
  if (!def) return [];
  const inside = p.x < CX ? 1 : -1;
  return def.map(([dx, dy]) => ({ x: clamp(p.x + dx * inside, 0.5, W - 0.5), y: p.y + dy }));
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
