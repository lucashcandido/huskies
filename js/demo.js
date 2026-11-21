// Erzeugt fiktive Beispieldaten (zum Vorstellen und Ausprobieren).
// Alle erzeugten Einträge tragen demo: true und lassen sich über
// „⋯ Daten → Beispieldaten entfernen“ wieder vollständig löschen.

import { OFFENSE_PERSONNEL, DEFENSE_PERSONNEL, formationPlayers, OFFENSE_CONCEPTS, applyConcept, offenseInFormation, ROUTES } from './football.js';
import { buildDefense } from './defense.js';

const FIRST = ['Lukas', 'Jonas', 'Ben', 'Elias', 'Noah', 'Paul', 'Leon', 'Finn', 'Luis', 'Felix', 'Henry', 'Emil', 'Anton', 'Theo', 'Mats', 'Jakob',
  'Moritz', 'David', 'Samuel', 'Malik', 'Niklas', 'Tim', 'Ole', 'Karim', 'Milan', 'Jannik', 'Linus', 'Tom', 'Erik', 'Yusuf', 'Hannes', 'Kofi',
  'Marlon', 'Can', 'Maximilian', 'Julian', 'Leo', 'Oskar', 'Vincent', 'Rafael', 'Jason', 'Aaron', 'Mika', 'Tobias', 'Dominik', 'Kevin', 'Marvin',
  'Dennis', 'Patrick', 'Sebastian', 'Florian', 'Marco', 'Daniel', 'Lennard', 'Jannis', 'Nico', 'Robin', 'Simon', 'Fabian', 'Joel', 'Emre', 'Luca'];
const LAST = ['Becker', 'Schulz', 'Hoffmann', 'Krüger', 'Wagner', 'Neumann', 'Braun', 'Wolf', 'Schröder', 'Zimmermann', 'Hartmann', 'Lange', 'Werner',
  'Krause', 'Meier', 'Lehmann', 'Köhler', 'Herrmann', 'Walter', 'Peters', 'Möller', 'Jansen', 'Brandt', 'Haas', 'Vogel', 'Friedrich', 'Keller',
  'Günther', 'Frank', 'Berger', 'Kaiser', 'Fuchs', 'Engel', 'Sommer', 'Dietrich', 'Ziegler', 'Kuhn', 'Pohl', 'Albrecht', 'Schuster', 'Böhm',
  'Winter', 'Roth', 'Busch', 'Graf', 'Seidel', 'Arnold', 'Lorenz', 'Ludwig', 'Jung', 'Hahn', 'Schubert', 'Vogt', 'Otto', 'Simon', 'Franke',
  'Thomas', 'Scholz', 'Schmitz', 'Beck', 'Weiß', 'Lang', 'Ahmeti', 'Okafor', 'Yilmaz', 'Mensah', 'Kowalski', 'Nowak', 'Petrović', 'Rossi'];

// Profil je Position (U19-Niveau): [Gewicht, 40yd, Shuffle, L-Cone, Broad, Vertical, MaxV]
// Bench Press: geschätztes Maximalgewicht (kg) je Position → daraus Wiederholungen mit 100 kg
export const BENCH = { QB: 90, RB: 110, FB: 120, WR: 95, TE: 115, OL: 140, DL: 135, LB: 120, CB: 95, S: 100, K: 80, P: 80 };
const PROFILE = {
  QB: [80, 5.0, 4.6, 7.6, 235, 58, 28.5], RB: [80, 4.8, 4.45, 7.4, 250, 64, 30.5], FB: [92, 5.0, 4.6, 7.6, 238, 58, 28.8],
  WR: [74, 4.75, 4.4, 7.3, 252, 66, 31.0], TE: [92, 5.05, 4.65, 7.7, 235, 58, 28.5], OL: [118, 5.6, 5.0, 8.3, 205, 44, 25.0],
  DL: [105, 5.3, 4.8, 8.0, 220, 50, 26.5], LB: [88, 4.95, 4.55, 7.55, 240, 60, 29.0], CB: [73, 4.7, 4.35, 7.25, 255, 67, 31.2],
  S: [78, 4.8, 4.45, 7.4, 248, 64, 30.4], K: [76, 5.1, 4.7, 7.7, 225, 52, 27.5], P: [80, 5.15, 4.75, 7.8, 222, 50, 27.2],
};
const MIX_FULL = { QB: 3, RB: 3, FB: 1, WR: 7, TE: 3, OL: 8, DL: 6, LB: 5, CB: 5, S: 3, K: 1, P: 1 };
const MIX_SMALL = { QB: 2, RB: 2, WR: 4, TE: 1, OL: 5, DL: 4, LB: 3, CB: 3, S: 2 };

// Niveau je Altersklasse: Zeiten ×t, Sprünge ×j, Gewicht ×w, Max V ×v, Geburtsjahre
export const LEVELS = {
  youth:   { t: 1.17, j: 0.74, w: 0.62, v: 0.82, b: 0.45, born: [2014, 2015], mix: MIX_SMALL },
  junior:  { t: 1.07, j: 0.87, w: 0.84, v: 0.92, b: 0.7, born: [2011, 2013], mix: MIX_FULL },
  u20:     { t: 1.0,  j: 1.0,  w: 1.0,  v: 1.0,  b: 1.0, born: [2007, 2010], mix: MIX_FULL },
  senior:  { t: 0.975, j: 1.04, w: 1.06, v: 1.03, b: 1.12, born: [1992, 2006], mix: { ...MIX_FULL, OL: 9, DL: 7, WR: 8 } },
  prospect:{ t: 1.02, j: 0.97, w: 0.97, v: 0.98, b: 0.97, born: [2008, 2010], mix: { QB: 1, RB: 2, WR: 3, TE: 1, OL: 2, DL: 2, LB: 2, CB: 2, S: 1 } },
};
/** Wiederholungen mit 100 kg aus dem Maximalgewicht (Epley-Formel umgestellt) */
// Wer 100 kg nicht schafft, hat keinen Wert (in jüngeren Teams wird Bench i. d. R. nicht getestet)
export const benchReps = oneRm => { const r = Math.round(30 * (oneRm / 100 - 1)); return r > 0 ? r : null; };

/** Passendes Niveau aus dem Teamnamen raten */
export function levelFor(name) {
  const n = String(name).toLowerCase();
  if (n.includes('prospect')) return 'prospect';
  const m = /u\s?(\d{2})/.exec(n);
  if (m) { const a = +m[1]; return a <= 13 ? 'youth' : a <= 17 ? 'junior' : 'u20'; }
  if (/herren|senior|1\.|men/.test(n)) return 'senior';
  return 'u20';
}

const DATES = ['2026-03-14', '2026-06-20', '2026-09-26'];
// Offense-Calls je Personnel: [Formation, Konzept, Defense zum Testen]. Der Name beginnt mit der Formation.
export const CALL_NAME = { doubles: 'Doubles', spread: 'Spread', trips: 'Trips Rt', trips10: 'Trips Rt', bunch: 'Bunch Rt', empty: 'Empty',
  emptyQuads: 'Empty Quads', emptySpread: 'Empty Trey Lt', ace12: 'Ace', trips12: 'Tight Trips Rt', proI: 'Pro I', jumbo22: 'Jumbo' };
const CALLS = {
  '10': [['spread', 'fourVerts', 'cover3'], ['spread', 'slants', 'cover1'], ['spread', 'dagger', 'cover4'], ['trips10', 'flood', 'cover3'], ['trips10', 'stick', 'cover2']],
  '00': [['empty', 'mesh', 'cover1'], ['empty', 'flood', 'cover3'], ['emptyQuads', 'stick', 'cover2'], ['emptySpread', 'slants', 'cover1'], ['emptySpread', 'fourVerts', 'cover4']],
  '11': [['doubles', 'smash', 'cover2'], ['doubles', 'curlFlat', 'cover4'], ['doubles', 'fourVerts', 'cover3'], ['trips', 'flood', 'cover3'], ['trips', 'mesh', 'cover1'], ['trips', 'stick', 'cover2'], ['bunch', 'flood', 'cover1']],
  '12': [['ace12', 'smash', 'cover2'], ['ace12', 'dagger', 'cover3'], ['trips12', 'flood', 'cover3'], ['trips12', 'stick', 'cover4']],
  '21': [['proI', 'curlFlat', 'cover3'], ['proI', 'flood', 'cover2'], ['proI', 'smash', 'cover4']],
  '22': [['jumbo22', 'flood', 'cover3'], ['jumbo22', 'curlFlat', 'cover1']],
};
const CALL_PERS = { youth: ['11'], prospect: ['11'], junior: ['11', '12', '21'], u20: ['00', '10', '11', '12', '21', '22'], senior: ['00', '10', '11', '12', '21', '22'] };

// Defense-Beispiele: [Name, Konzept, Gegner-Konzept, zusätzliche Blitzer]
const DEF_PLAYS = [
  ['Cover 3 vs Flood', 'cover3', 'flood'],
  ['Tampa 2 vs Four Verts', 'tampa2', 'fourVerts'],
  ['Cover 1 Robber vs Mesh', 'cover1', 'mesh'],
  ['Cover 4 vs Smash', 'cover4', 'smash'],
  ['Cover 0 Blitz vs Slants', 'cover0', 'slants'],
  ['Cover 3 Mike-Blitz vs Stick', 'cover3', 'stick', ['M']],
];

/**
 * Fiktive Daten für ein Team.
 * @param team {id, name}; opts: {level, seed, plays, uid}
 */
export function demoTeam(team, { level = levelFor(team.name), seed = 7, plays = true, defPlays = 3, uid } = {}) {
  const L = LEVELS[level] || LEVELS.u20;
  let s = (seed * 9301 + 49297) % 233280 || 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const used = new Set();
  const athletes = [];
  for (const [pos, count] of Object.entries(L.mix)) {
    for (let i = 0; i < count; i++) {
      const [w, f, sh, lc, br, ve, mv] = PROFILE[pos];
      const talent = gauss();
      let first, last;
      do { first = pick(FIRST); last = pick(LAST); } while (used.has(first + last));
      used.add(first + last);
      const year = L.born[0] + Math.floor(rnd() * (L.born[1] - L.born[0] + 1));
      const r = (base, spread, k, lowerBetter = true) =>
        base * (1 + (lowerBetter ? -1 : 1) * (talent * spread + k * 0.012) + gauss() * spread * 0.35);
      let ms = DATES.map((date, k) => ({
        id: 'm_' + date, date,
        weight: Math.round((w * L.w + gauss() * 8 * L.w + k * 0.8) * 10) / 10,
        forty: Math.round(r(f * L.t, 0.04, k) * 100) / 100,
        shuffle: Math.round(r(sh * L.t, 0.04, k) * 100) / 100,
        lconeR: Math.round(r(lc * L.t, 0.035, k) * 100) / 100,
        lconeL: Math.round(r(lc * L.t * 1.01, 0.035, k) * 100) / 100,
        broad: Math.round(r(br * L.j, 0.06, k, false)),
        vertical: Math.round(r(ve * L.j, 0.08, k, false) * 2) / 2,
        maxVelocity: Math.round(r(mv * L.v, 0.04, k, false) * 10) / 10,
        bench: benchReps(r(BENCH[pos] * L.b, 0.1, k * 2, false)),
      }));
      if (rnd() < 0.22) ms = ms.slice(1);                 // nicht jede:r war bei jedem Test
      if (rnd() < 0.1) ms[ms.length - 1].vertical = null; // vereinzelt fehlende Werte
      athletes.push({
        id: uid('ath'), teamId: team.id, demo: true, firstName: first, lastName: last,
        birthDate: `${year}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`,
        age: null, position: pos, notes: '', measurements: ms,
      });
    }
  }
  // Trikotnummern ohne Doppelte, grob nach Position
  const RANGE = { QB: [1, 19], RB: [20, 49], FB: [30, 49], WR: [1, 19, 80, 89], TE: [80, 89, 40, 49], OL: [50, 79], DL: [90, 99, 50, 79],
    LB: [40, 59, 90, 99], CB: [20, 39, 1, 19], S: [20, 49], K: [1, 19, 90, 99], P: [1, 19, 90, 99] };
  const nums = new Set();
  for (const a of athletes) {
    const rg = RANGE[a.position] || [1, 99];
    for (let t = 0; t < 200; t++) {
      const part = rg.length > 2 && rnd() < 0.4 ? 2 : 0;
      const n = rg[part] + Math.floor(rnd() * (rg[part + 1] - rg[part] + 1));
      if (!nums.has(n)) { nums.add(n); a.number = String(n); break; }
    }
  }
  // Personnel: Starter = schnellste 40-yd-Zeit je Position
  const fortyOf = a => a.measurements[a.measurements.length - 1].forty ?? 99;
  const fill = slots => {
    const taken = new Set();
    return slots.map(sl => {
      const m = athletes.filter(x => x.position === sl.pos && !taken.has(x.id)).sort((a, b) => fortyOf(a) - fortyOf(b))[0];
      if (m) taken.add(m.id);
      return { ...sl, athleteId: m ? m.id : null };
    });
  };
  const off11 = { id: uid('per'), teamId: team.id, demo: true, side: 'offense', preset: '11', name: '11 Personnel – Starter', slots: fill(OFFENSE_PERSONNEL['11'].slots), notes: '' };
  const defNickel = { id: uid('per'), teamId: team.id, demo: true, side: 'defense', preset: 'nickel', name: 'Nickel – Starter', slots: fill(DEFENSE_PERSONNEL.nickel.slots), notes: '' };
  const personnel = [off11, defNickel];
  if (L.mix.FB) personnel.push({ id: uid('per'), teamId: team.id, demo: true, side: 'offense', preset: '21', name: '21 Personnel – I-Form', slots: fill(OFFENSE_PERSONNEL['21'].slots), notes: '' });
  if (L.mix.LB >= 3) personnel.push({ id: uid('per'), teamId: team.id, demo: true, side: 'defense', preset: 'base43', name: 'Base 4-3', slots: fill(DEFENSE_PERSONNEL.base43.slots), notes: '' });

  const playList = !plays ? [] : CALL_PERS[level].flatMap(pers => CALLS[pers].map(([formation, ck, concept]) => {
    const c = OFFENSE_CONCEPTS[ck];
    const rel = Object.fromEntries(Object.entries(c.routes).map(([role, r]) => [role, { name: r, pts: ROUTES[r] }]));
    const offense = offenseInFormation(formation, rel).players;
    return {
      id: uid('play'), teamId: team.id, demo: true, side: 'offense', name: `${CALL_NAME[formation]} ${c.label}`, formation, offense,
      offensePersonnelId: off11.id, concept, defensePreset: 'auto', defensePersonnelId: defNickel.id, defenseLocked: false,
      defense: buildDefense(offense, concept, 'nickel').players, duration: 4, notes: 'Beispiel-Spielzug',
    };
  }));
  const defNickelOrBase = personnel.find(p => p.preset === 'base43') || defNickel;
  const defList = DEF_PLAYS.slice(0, defPlays).map(([name, concept, oc, blitz]) => {
    const c = OFFENSE_CONCEPTS[oc];
    const offense = applyConcept(formationPlayers(c.formation), oc);
    const dper = concept === 'cover0' || concept === 'cover1' ? defNickel : defNickelOrBase;
    const defense = buildDefense(offense, concept, dper.preset).players;
    for (const id of blitz || []) { const d = defense.find(x => x.id === id); if (d) d.assign = { type: 'rush' }; }
    return {
      id: uid('play'), teamId: team.id, demo: true, side: 'defense', name, formation: c.formation, opponentConcept: oc,
      offense, offensePersonnelId: null, concept, defensePreset: 'auto', defensePersonnelId: dper.id,
      defenseLocked: !!(blitz && blitz.length), defense, duration: 4, notes: 'Beispiel-Spielzug',
    };
  });
  return { athletes, personnel, plays: [...playList, ...defList] };
}
