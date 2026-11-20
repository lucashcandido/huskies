// Erzeugt fiktive Beispieldaten zum Ausprobieren der App.
import { uid } from './store.js';
import { OFFENSE_PERSONNEL, DEFENSE_PERSONNEL, formationPlayers, routePoints } from './football.js';
import { buildDefense } from './defense.js';

const FIRST = ['Lukas', 'Jonas', 'Ben', 'Elias', 'Noah', 'Paul', 'Leon', 'Finn', 'Luis', 'Felix', 'Henry', 'Emil', 'Anton', 'Theo', 'Mats', 'Jakob',
  'Moritz', 'David', 'Samuel', 'Malik', 'Niklas', 'Tim', 'Ole', 'Karim', 'Milan', 'Jannik', 'Linus', 'Tom', 'Erik', 'Yusuf', 'Hannes', 'Kofi', 'Marlon', 'Can'];
const LAST = ['Becker', 'Schulz', 'Hoffmann', 'Krüger', 'Wagner', 'Neumann', 'Braun', 'Wolf', 'Schröder', 'Zimmermann', 'Hartmann', 'Lange', 'Werner',
  'Krause', 'Meier', 'Lehmann', 'Köhler', 'Herrmann', 'Walter', 'Peters', 'Möller', 'Jansen', 'Brandt', 'Haas', 'Vogel', 'Friedrich', 'Keller', 'Günther', 'Frank', 'Berger', 'Kaiser', 'Fuchs', 'Engel', 'Sommer'];

// Profile je Position: [Gewicht, 40yd, Shuffle, L-Cone, Broad, Vertical, MaxV]
const PROFILE = {
  QB: [80, 5.0, 4.6, 7.6, 235, 58, 28.5], RB: [80, 4.8, 4.45, 7.4, 250, 64, 30.5], WR: [74, 4.75, 4.4, 7.3, 252, 66, 31.0],
  TE: [92, 5.05, 4.65, 7.7, 235, 58, 28.5], OL: [118, 5.6, 5.0, 8.3, 205, 44, 25.0], DL: [105, 5.3, 4.8, 8.0, 220, 50, 26.5],
  LB: [88, 4.95, 4.55, 7.55, 240, 60, 29.0], CB: [73, 4.7, 4.35, 7.25, 255, 67, 31.2], S: [78, 4.8, 4.45, 7.4, 248, 64, 30.4],
};
const MIX = { QB: 2, RB: 3, WR: 6, TE: 2, OL: 6, DL: 5, LB: 4, CB: 4, S: 2 };

export function demoData() {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
  const athletes = [];
  let n = 0;
  for (const [pos, count] of Object.entries(MIX)) {
    for (let i = 0; i < count; i++) {
      const [w, f, sh, lc, br, ve, mv] = PROFILE[pos];
      const talent = gauss();
      const year = 2007 + Math.floor(rnd() * 3);
      const dates = ['2026-03-14', '2026-06-20', '2026-09-26'];
      const ms = dates.map((date, k) => {
        const imp = k * 0.012;      // leichte Verbesserung über die Saison
        const r = (base, spread, lowerBetter = true) => {
          const v = base * (1 + (lowerBetter ? -1 : 1) * (talent * spread + imp) + gauss() * spread * 0.35);
          return v;
        };
        return {
          id: uid('m'), date,
          weight: Math.round((w + gauss() * 8 + k * 0.8) * 10) / 10,
          forty: Math.round(r(f, 0.04) * 100) / 100,
          shuffle: Math.round(r(sh, 0.04) * 100) / 100,
          lconeR: Math.round(r(lc, 0.035) * 100) / 100,
          lconeL: Math.round(r(lc * 1.01, 0.035) * 100) / 100,
          broad: Math.round(r(br, 0.06, false)),
          vertical: Math.round(r(ve, 0.08, false) * 2) / 2,
          maxVelocity: Math.round(r(mv, 0.04, false) * 10) / 10,
        };
      });
      // nicht jede:r war bei jedem Test
      if (rnd() < 0.25) ms.shift();
      athletes.push({
        id: uid('ath') + n, firstName: FIRST[n % FIRST.length], lastName: LAST[(n * 7) % LAST.length],
        birthDate: `${year}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`,
        age: null, position: pos, notes: '', measurements: ms,
      });
      n++;
    }
  }
  const roster = {
    id: uid('ros'), name: 'U19 Saison 2027', team: 'U19', season: '2027', notes: '',
    members: [],
  };
  const depth = {};
  athletes.forEach((a, i) => {
    depth[a.position] = (depth[a.position] || 0) + 1;
    roster.members.push({ athleteId: a.id, number: String(((i * 37) % 89) + 1), position: a.position, depth: depth[a.position] });
  });
  const fillSlots = (slots) => {
    const used = new Set();
    return slots.map(sl => {
      const m = roster.members.filter(x => x.position === sl.pos && !used.has(x.athleteId)).sort((a, b) => a.depth - b.depth)[0];
      if (m) used.add(m.athleteId);
      return { ...sl, athleteId: m ? m.athleteId : null };
    });
  };
  const off11 = { id: uid('per'), side: 'offense', preset: '11', name: '11 Personnel – Starter', rosterId: roster.id, slots: fillSlots(OFFENSE_PERSONNEL['11'].slots), notes: '' };
  const defNickel = { id: uid('per'), side: 'defense', preset: 'nickel', name: 'Nickel – Starter', rosterId: roster.id, slots: fillSlots(DEFENSE_PERSONNEL.nickel.slots), notes: '' };

  const mkPlay = (name, formation, concept, routes) => {
    const offense = formationPlayers(formation);
    for (const [role, r] of Object.entries(routes)) {
      const p = offense.find(x => x.role === role);
      if (p) { p.route = routePoints(r, p); p.routeName = r; }
    }
    return {
      id: uid('play'), name, formation, offense, offensePersonnelId: off11.id, concept, defensePreset: 'auto',
      defensePersonnelId: defNickel.id, defenseLocked: false, defense: buildDefense(offense, concept, 'nickel').players, duration: 4,
      notes: '',
    };
  };
  const plays = [
    mkPlay('Smash vs Cover 2', 'doubles', 'cover2', { X: 'Hitch', H: 'Corner', Y: 'Corner', Z: 'Hitch', RB: 'Flat' }),
    mkPlay('Four Verts vs Cover 3', 'doubles', 'cover3', { X: 'Go / Fade', H: 'Seam', Y: 'Seam', Z: 'Go / Fade', RB: 'Swing' }),
    mkPlay('Mesh vs Cover 1', 'trips', 'cover1', { X: 'Drag', Y: 'Drag', H: 'Corner', Z: 'Go / Fade', RB: 'Angle' }),
  ];
  return { version: 1, athletes, rosters: [roster], personnel: [off11, defNickel], plays };
}
