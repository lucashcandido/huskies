// Simulation eines Spielzugs: Receiver laufen ihre Routen (mit Beschleunigung
// und Tempoverlust bei Cuts), Verteidiger reagieren mit Verzögerung auf ihre
// Mann- bzw. Zonen-Zuordnung. Ergebnis: Positionen pro Frame + Separation.

import { W, isEligible, clamp } from './football.js?v=202611211248';
import { ZONES } from './defense.js?v=202611211248';

export const DT = 1 / 30;
const DEFAULT_SPEED = { WR: 8.6, TE: 7.9, RB: 8.4, FB: 7.6, QB: 7.4, OL: 6, CB: 8.7, S: 8.5, LB: 8.0, DL: 7.2 }; // yd/s
const OFF_ACCEL = 10;   // yd/s²
const DEF_ACCEL = 9;    // yd/s² (Lenk-/Richtungswechsel)
const REACTION = 0.25;  // s Reaktionszeit der Verteidiger
const ZONE_READ = 0.35; // s bis Zonenspieler losgehen

export function defaultSpeed(pos) { return DEFAULT_SPEED[pos] || 7.5; }

function angleBetween(ax, ay, bx, by) {
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  if (!la || !lb) return 0;
  return Math.acos(clamp((ax * bx + ay * by) / (la * lb), -1, 1));
}

/**
 * @param play {offense, defense, duration}
 * @param speedOf (player, side) → yd/s oder null
 */
export function simulate(play, speedOf = () => null) {
  const T = play.duration || 4;
  const steps = Math.round(T / DT);
  const offense = play.offense.map(p => {
    let path = [{ x: p.x, y: p.y }, ...(p.route || [])];
    let vmax = speedOf(p, 'offense') || defaultSpeed(p.pos);
    if (p.pos === 'QB') { path = [{ x: p.x, y: p.y }, { x: p.x, y: p.y > -3 ? -7 : p.y - 2 }]; vmax = 5; }
    if (p.pos === 'OL') { path = [{ x: p.x, y: p.y }, { x: p.x, y: p.y - 1.2 }]; vmax = 2; }
    // Run Blocking: Blocker laufen ihren Block (Puller schnell, sonst kurze, kräftige Schritte)
    // Run-Spielzug: nur Pulls laufen ihren Block, alle anderen Blocker bleiben stehen (Block ist eingezeichnet)
    if (play.playType === 'run' && p.block?.pts?.length && !(p.route || []).length) {
      const pull = p.block.pull ?? ['pull', 'kick', 'trap'].includes(p.block.type);
      if (pull) { path = [{ x: p.x, y: p.y }, ...p.block.pts]; vmax = 6; }
      else { path = [{ x: p.x, y: p.y }]; }
    }
    return { id: p.id, pos: p.pos, path, seg: 0, x: p.x, y: p.y, v: 0, vmax, routeLen: (p.route || []).length };
  });
  const offById = Object.fromEntries(offense.map(o => [o.id, o]));
  const qb = offense.find(o => o.pos === 'QB');
  const defense = play.defense.map(d => ({
    id: d.id, pos: d.pos, assign: d.assign || { type: 'rush' }, x: d.x, y: d.y, vx: 0, vy: 0, x0: d.x, y0: d.y,
    vmax: speedOf(d, 'defense') || defaultSpeed(d.pos),
  }));

  const frames = [];
  const snap = () => {
    const f = { o: {}, d: {} };
    offense.forEach(o => f.o[o.id] = { x: o.x, y: o.y });
    defense.forEach(d => f.d[d.id] = { x: d.x, y: d.y });
    frames.push(f);
  };
  snap();

  const posAt = (id, t) => {
    const i = clamp(Math.round(t / DT), 0, frames.length - 1);
    return frames[i].o[id];
  };

  for (let k = 1; k <= steps; k++) {
    const t = k * DT;
    // --- Offense bewegt sich entlang der Pfade ---
    for (const o of offense) {
      if (o.seg >= o.path.length - 1) { o.v = 0; continue; }
      o.v = Math.min(o.vmax, o.v + OFF_ACCEL * DT);
      let dist = o.v * DT;
      while (dist > 0 && o.seg < o.path.length - 1) {
        const b = o.path[o.seg + 1];
        const dx = b.x - o.x, dy = b.y - o.y, len = Math.hypot(dx, dy);
        if (len <= dist) {
          o.x = b.x; o.y = b.y; dist -= len; o.seg++;
          const c = o.path[o.seg + 1];
          if (c) {
            const turn = angleBetween(dx, dy, c.x - b.x, c.y - b.y);
            // Tempoverlust je nach Schärfe des Cuts (90° ≈ -30 %, 180° ≈ -60 %)
            const factor = 1 - 0.6 * Math.min(1, turn / Math.PI);
            o.v *= factor; dist *= factor;
          }
        } else {
          o.x += dx / len * dist; o.y += dy / len * dist; dist = 0;
        }
      }
    }
    // --- Defense reagiert ---
    const tr = Math.max(0, t - REACTION);
    const recNow = offense.filter(o => isEligible(o)).map(o => ({ id: o.id, ...posAt(o.id, tr) }));
    for (const d of defense) {
      if (play.playType === 'run' && play.side !== 'defense') continue;   // Run-Spielzug: Defense bleibt in ihrer Aufstellung stehen
      let tx = d.x, ty = d.y, vmax = d.vmax;
      const a = d.assign;
      if (a.type === 'man' && offById[a.target]) {
        const r = posAt(a.target, tr), r0 = offById[a.target].path[0];
        const cushion = Math.max(0.4, (d.y0 - r0.y) - 3.2 * t);
        const lev = r.x < W / 2 ? 0.6 : -0.6;
        tx = r.x + lev; ty = r.y + cushion;
      } else if (a.type === 'zone' && ZONES[a.zone]) {
        const z = ZONES[a.zone];
        const [lx, ly] = z.L, [x0, x1, y0, y1] = z.r;
        if (t < ZONE_READ) { tx = d.x; ty = d.y; }
        else {
          const inZone = recNow.filter(r => r.x >= x0 - 1.5 && r.x <= x1 + 1.5 && r.y >= y0 - 1.5 && r.y <= y1 + 3);
          if (z.deep) {
            const threat = inZone.filter(r => r.y > ly - 10).sort((p, q) => q.y - p.y)[0];
            if (threat) { tx = clamp(lx + (threat.x - lx) * 0.75, x0, x1); ty = Math.max(threat.y + 3, ly - 3); }
            else { tx = lx; ty = ly; }
          } else {
            const threat = inZone.sort((p, q) => Math.hypot(p.x - lx, p.y - ly) - Math.hypot(q.x - lx, q.y - ly))[0];
            if (threat) { tx = clamp(threat.x, x0, x1); ty = clamp(threat.y + 0.8, y0, y1); }
            else { tx = lx; ty = ly; }
          }
        }
      } else if (qb) { // Rush
        tx = qb.x; ty = qb.y;
        if (d.y < 1.2) vmax = d.pos === 'DL' ? 2.2 : 3; // im Block
      }
      // Lenkverhalten mit begrenzter Beschleunigung
      const dx = tx - d.x, dy = ty - d.y, dist = Math.hypot(dx, dy);
      const want = Math.min(vmax, dist * 4);
      const dvx = (dist ? dx / dist * want : 0) - d.vx, dvy = (dist ? dy / dist * want : 0) - d.vy;
      const dv = Math.hypot(dvx, dvy), lim = DEF_ACCEL * DT;
      const f = dv > lim ? lim / dv : 1;
      d.vx += dvx * f; d.vy += dvy * f;
      const sp = Math.hypot(d.vx, d.vy);
      if (sp > vmax) { d.vx *= vmax / sp; d.vy *= vmax / sp; }
      d.x += d.vx * DT; d.y += d.vy * DT;
    }
    snap();
  }

  // --- Separation je Receiver mit Route ---
  const receivers = play.offense.filter(p => isEligible(p) && (p.route || []).length);
  const separation = {};
  for (const r of receivers) {
    separation[r.id] = frames.map(f => {
      const p = f.o[r.id];
      let m = Infinity;
      for (const id in f.d) { const q = f.d[id]; m = Math.min(m, Math.hypot(p.x - q.x, p.y - q.y)); }
      return m;
    });
  }
  return { frames, separation, duration: T, dt: DT };
}

// Aus Sicht der Offense ist viel Abstand gut, aus Sicht der Defense schlecht (invert)
export function sepClass(v, invert = false) { return v >= 3 ? (invert ? 'sep-bad' : 'sep-good') : v >= 1.5 ? 'sep-mid' : (invert ? 'sep-good' : 'sep-bad'); }
export function sepColor(v, invert = false) { return v >= 3 ? (invert ? '#e74c3c' : '#2ecc71') : v >= 1.5 ? '#f1c40f' : (invert ? '#2ecc71' : '#e74c3c'); }
