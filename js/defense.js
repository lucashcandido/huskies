// Defense-Konzepte: Aufstellung relativ zur Offense-Formation + Zuordnungen
// (Mann-Deckung, Zone oder Pass Rush). Bewusst vereinfacht, aber nah an den
// gängigen Lehrbuch-Varianten.

import { W, CX, HASH_L, HASH_R, isEligible, clamp, DEFENSE_PERSONNEL } from './football.js?v=202611211248';

export const ZONES = {
  deepL3:   { label: 'Deep 1/3 links',   L: [W / 6, 16],       r: [0, W / 3 + 4, 8, 50], deep: true },
  deepM3:   { label: 'Deep 1/3 Mitte',   L: [CX, 17],          r: [W / 3 - 4, 2 * W / 3 + 4, 8, 50], deep: true },
  deepR3:   { label: 'Deep 1/3 rechts',  L: [5 * W / 6, 16],   r: [2 * W / 3 - 4, W, 8, 50], deep: true },
  deepL2:   { label: 'Deep 1/2 links',   L: [W / 4 + 1, 16],   r: [0, CX + 3, 8, 50], deep: true },
  deepR2:   { label: 'Deep 1/2 rechts',  L: [3 * W / 4 - 1, 16], r: [CX - 3, W, 8, 50], deep: true },
  deepMid:  { label: 'Deep Middle (Free)', L: [CX, 15],        r: [0, W, 8, 50], deep: true },
  q1:       { label: 'Quarter außen links', L: [W / 8 + 1, 14],  r: [0, W / 4 + 3, 7, 50], deep: true },
  q2:       { label: 'Quarter innen links', L: [3 * W / 8, 14],  r: [W / 4 - 3, CX + 2, 7, 50], deep: true },
  q3:       { label: 'Quarter innen rechts', L: [5 * W / 8, 14], r: [CX - 2, 3 * W / 4 + 3, 7, 50], deep: true },
  q4:       { label: 'Quarter außen rechts', L: [7 * W / 8 - 1, 14], r: [3 * W / 4 - 3, W, 7, 50], deep: true },
  tampa:    { label: 'Tampa Deep Middle', L: [CX, 14],         r: [CX - 9, CX + 9, 6, 30], deep: true },
  flatL:    { label: 'Flat links',       L: [7, 5],            r: [0, 16, -2, 10] },
  flatR:    { label: 'Flat rechts',      L: [W - 7, 5],        r: [W - 16, W, -2, 10] },
  curlL:    { label: 'Curl links',       L: [15, 10],          r: [9, 23, 3, 15] },
  curlR:    { label: 'Curl rechts',      L: [W - 15, 10],      r: [W - 23, W - 9, 3, 15] },
  curlFlatL:{ label: 'Curl/Flat links',  L: [11, 8],           r: [0, 22, 0, 14] },
  curlFlatR:{ label: 'Curl/Flat rechts', L: [W - 11, 8],       r: [W - 22, W, 0, 14] },
  hookL:    { label: 'Hook links',       L: [CX - 6, 8],       r: [CX - 12, CX + 1, 2, 13] },
  hookR:    { label: 'Hook rechts',      L: [CX + 6, 8],       r: [CX - 1, CX + 12, 2, 13] },
  hookM:    { label: 'Hook Mitte / Robber', L: [CX, 9],        r: [CX - 9, CX + 9, 2, 14] },
};

export const CONCEPTS = {
  cover0: { label: 'Cover 0', desc: 'Reine Mann-Deckung ohne tiefen Safety, alle übrigen blitzen.' },
  cover1: { label: 'Cover 1', desc: 'Mann-Deckung mit einem tiefen Free Safety und einem Robber.' },
  cover2: { label: 'Cover 2', desc: 'Zwei tiefe Hälften, Cornerbacks in den Flats, 5 Unterzonen.' },
  tampa2: { label: 'Tampa 2', desc: 'Wie Cover 2, aber der Mike läuft tief in die Mitte.' },
  cover3: { label: 'Cover 3', desc: 'Drei tiefe Drittel (2 CB + FS), 4 Unterzonen.' },
  cover4: { label: 'Cover 4 (Quarters)', desc: 'Vier tiefe Viertel, 3 Unterzonen.' },
};

const LABEL = { LE: 'E', LT: 'T', RT: 'T', RE: 'E', W: 'W', M: 'M', S: 'S', CBL: 'C', CBR: 'C', NB: 'N', DB: 'D', FS: 'F', SS: '$' };

/** Analyse der Offense: Receiver links/rechts, starke Seite, Anzahl WR */
export function analyze(offense) {
  const rec = offense.filter(isEligible);
  const left = rec.filter(r => r.x < CX).sort((a, b) => a.x - b.x);
  const right = rec.filter(r => r.x >= CX).sort((a, b) => b.x - a.x);
  // Backfield-Spieler (RB/FB hinter dem QB) zählen nicht für die Seitenstärke
  const wide = r => !(['RB', 'FB'].includes(r.pos) && Math.abs(r.x - CX) < 4);
  const nl = left.filter(wide).length, nr = right.filter(wide).length;
  const teRight = rec.some(r => r.pos === 'TE' && r.x > CX);
  const strong = nr > nl ? 'R' : nl > nr ? 'L' : (teRight ? 'R' : rec.some(r => r.pos === 'TE') ? 'L' : 'R');
  const wr = rec.filter(r => r.pos === 'WR').length + rec.filter(r => ['RB', 'FB', 'TE'].includes(r.pos) && Math.abs(r.x - CX) > 9).length;
  return { rec, left, right, strong, wr };
}

export function autoPreset(offense) {
  const { wr } = analyze(offense);
  return wr >= 4 ? 'dime' : wr === 3 ? 'nickel' : 'base43';
}

/** Baut die 11 Verteidiger für ein Konzept */
export function buildDefense(offense, concept = 'cover3', preset = 'auto') {
  const A = analyze(offense);
  const pre = preset === 'auto' || !DEFENSE_PERSONNEL[preset] ? autoPreset(offense) : preset;
  const s = A.strong === 'R' ? 1 : -1;               // +1 = starke Seite rechts
  const side = (strongSide) => (strongSide ? (A.strong === 'R' ? 'R' : 'L') : (A.strong === 'R' ? 'L' : 'R'));
  const te = A.rec.filter(r => r.pos === 'TE' && Math.abs(r.x - CX) < 9);

  const D = {};
  const add = (id, pos, x, y) => { D[id] = { id, role: id, pos, label: LABEL[id] || id, x, y, assign: { type: 'rush' } }; };

  // --- Front ---
  const teL = te.find(t => t.x < CX), teR = te.find(t => t.x > CX);
  add('LE', 'DL', teL ? teL.x - 1 : CX - 5.5, 1);
  add('LT', 'DL', CX - 1.5, 1);
  add('RT', 'DL', CX + 1.5, 1);
  add('RE', 'DL', teR ? teR.x + 1 : CX + 5.5, 1);

  // --- Linebacker ---
  const roles = DEFENSE_PERSONNEL[pre].slots.map(x => x.role);
  if (roles.includes('S')) {         // 4-3
    add('W', 'LB', CX - 4 * s, 4.5); add('M', 'LB', CX, 5); add('S', 'LB', CX + 4 * s, 4.5);
  } else if (roles.includes('W')) {  // Nickel
    add('W', 'LB', CX - 2.5 * s, 4.5); add('M', 'LB', CX + 2.5 * s, 4.5);
  } else {
    add('M', 'LB', CX, 5);
  }

  // --- Secondary: Grundposition ---
  const outerL = A.left[0], outerR = A.right[0];
  add('CBL', 'CB', outerL ? outerL.x : CX - 14, outerL ? 6 : 8);
  add('CBR', 'CB', outerR ? outerR.x : CX + 14, outerR ? 6 : 8);
  const strongList = A.strong === 'R' ? A.right : A.left;
  const weakList = A.strong === 'R' ? A.left : A.right;
  const slotS = strongList.filter(r => Math.abs(r.x - CX) > 5)[1] || strongList[1];
  const slotW = weakList.filter(r => Math.abs(r.x - CX) > 5)[1] || weakList[1];
  if (roles.includes('NB')) add('NB', 'CB', slotS ? slotS.x - 0.8 * s : CX + 9 * s, 5);
  if (roles.includes('DB')) add('DB', 'CB', slotW ? slotW.x + 0.8 * s : CX - 9 * s, 5);
  add('FS', 'S', CX, 12);
  add('SS', 'S', CX + 6 * s, 9);

  const inside = x => (x < CX ? 1 : -1);
  const zone = (id, z) => { if (D[id]) D[id].assign = { type: 'zone', zone: z }; };
  const sideZone = (base, strongSide) => base + side(strongSide);
  const first = (...ids) => ids.find(id => D[id] && D[id].assign.type === 'rush' && D[id].pos !== 'DL');
  const weakDef = () => first('DB', 'W');
  const strongDef = () => first('NB', 'S');
  const setPos = (id, x, y) => { if (D[id]) { D[id].x = clamp(x, 0.8, W - 0.8); D[id].y = y; } };

  if (concept === 'cover0' || concept === 'cover1') {
    // Mann-Deckung
    const free = new Set(Object.keys(D).filter(id => D[id].pos !== 'DL'));
    const manOn = (id, r) => {
      D[id].assign = { type: 'man', target: r.id };
      free.delete(id);
      const press = D[id].pos === 'CB';
      const backfield = r.y < -2.5 && Math.abs(r.x - CX) < 6;
      setPos(id, r.x + inside(r.x) * 0.7, backfield ? 4.5 : press ? 1.5 : 3.5);
    };
    if (concept === 'cover1') {
      D.FS.assign = { type: 'zone', zone: 'deepMid' }; free.delete('FS'); setPos('FS', CX, 13);
    }
    const todo = [...A.rec];
    if (outerL) { manOn('CBL', outerL); todo.splice(todo.indexOf(outerL), 1); }
    if (outerR) { manOn('CBR', outerR); todo.splice(todo.indexOf(outerR), 1); }
    todo.sort((a, b) => Math.abs(b.x - CX) - Math.abs(a.x - CX));
    for (const r of todo) {
      let best = null, bestCost = Infinity;
      for (const id of free) {
        const d = D[id];
        const cost = Math.hypot(d.x - r.x, d.y - r.y) + (r.pos === 'WR' && d.pos === 'LB' ? 15 : 0) + (concept === 'cover1' && id === 'M' ? 6 : 0);
        if (cost < bestCost) { bestCost = cost; best = id; }
      }
      if (best) manOn(best, r);
    }
    if (concept === 'cover1') {
      const robber = ['M', 'W', 'S', 'SS', 'NB', 'DB'].find(id => free.has(id));
      if (robber) { zone(robber, 'hookM'); free.delete(robber); setPos(robber, CX, 7); }
    }
    for (const id of free) { // Blitz
      setPos(id, D[id].x, 3);
    }
  } else if (concept === 'cover2' || concept === 'tampa2') {
    zone('CBL', 'flatL'); zone('CBR', 'flatR');
    if (outerL) setPos('CBL', outerL.x - 1, 4); if (outerR) setPos('CBR', outerR.x + 1, 4);
    // FS = Hälfte der schwachen Seite, SS = Hälfte der starken Seite
    zone('FS', sideZone('deep', false) + '2'); zone('SS', sideZone('deep', true) + '2');
    setPos('FS', side(false) === 'L' ? HASH_L - 2 : HASH_R + 2, 12);
    setPos('SS', side(true) === 'L' ? HASH_L - 2 : HASH_R + 2, 12);
    const m = 'M';
    zone(m, concept === 'tampa2' ? 'tampa' : 'hookM');
    const w = weakDef(); if (w) zone(w, 'curl' + side(false));
    const st = strongDef(); if (st) zone(st, 'curl' + side(true));
  } else if (concept === 'cover3') {
    zone('CBL', 'deepL3'); zone('CBR', 'deepR3');
    if (outerL) setPos('CBL', outerL.x - 1, 7); if (outerR) setPos('CBR', outerR.x + 1, 7);
    zone('FS', 'deepM3'); setPos('FS', CX, 13);
    zone('SS', 'curlFlat' + side(true));
    setPos('SS', slotS ? slotS.x + inside(slotS.x) * 1.5 : CX + 9 * s, 6);
    zone('M', 'hookM');
    const st = strongDef(); if (st) zone(st, 'hook' + side(true));
    const w = weakDef(); if (w) zone(w, 'curlFlat' + side(false));
  } else if (concept === 'cover4') {
    zone('CBL', 'q1'); zone('CBR', 'q4');
    if (outerL) setPos('CBL', outerL.x + 0.5, 7); if (outerR) setPos('CBR', outerR.x - 0.5, 7);
    zone('FS', side(false) === 'L' ? 'q2' : 'q3'); zone('SS', side(true) === 'L' ? 'q2' : 'q3');
    setPos('FS', CX - 7 * s, 10); setPos('SS', CX + 7 * s, 10);
    zone('M', 'hookM');
    const w = weakDef(); if (w) zone(w, 'curlFlat' + side(false));
    const st = strongDef(); if (st) zone(st, 'curlFlat' + side(true));
  }

  // Nicht zugeordnete Nicht-DL im Zonen-Konzept → Hook-Zonen statt Blitz
  if (!['cover0', 'cover1'].includes(concept)) {
    for (const d of Object.values(D)) {
      if (d.pos !== 'DL' && d.assign.type === 'rush') d.assign = { type: 'zone', zone: d.x < CX ? 'hookL' : 'hookR' };
    }
  }
  return { preset: pre, players: Object.values(D) };
}

export function assignmentLabel(d, offense) {
  const a = d.assign || {};
  if (a.type === 'man') {
    const t = offense.find(p => p.id === a.target);
    return `Mann gegen ${t ? t.role : '?'}`;
  }
  if (a.type === 'zone') return ZONES[a.zone]?.label || a.zone;
  return 'Pass Rush / Blitz';
}
