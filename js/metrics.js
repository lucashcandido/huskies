// Definition der Messwerte + Hilfsfunktionen rund um Athlet:innen

export const METRICS = [
  { key: 'weight',      label: 'Gewicht',              short: 'Gewicht',  unit: 'kg',   step: 0.1,  dec: 1, better: null,   min: 30,  max: 200 },
  { key: 'forty',       label: '40 Yard Dash',         short: '40 yd',    unit: 's',    step: 0.01, dec: 2, better: 'low',  min: 3.8, max: 9 },
  { key: 'shuffle',     label: 'Shuffle',              short: 'Shuffle',  unit: 's',    step: 0.01, dec: 2, better: 'low',  min: 3,   max: 10 },
  { key: 'lconeR',      label: 'L-Cone rechts',        short: 'L-Cone R', unit: 's',    step: 0.01, dec: 2, better: 'low',  min: 5,   max: 14 },
  { key: 'lconeL',      label: 'L-Cone links',         short: 'L-Cone L', unit: 's',    step: 0.01, dec: 2, better: 'low',  min: 5,   max: 14 },
  { key: 'broad',       label: 'Broad Jump',           short: 'Broad',    unit: 'cm',   step: 1,    dec: 0, better: 'high', min: 80,  max: 400 },
  { key: 'vertical',    label: 'Vertical Jump',        short: 'Vertical', unit: 'cm',   step: 0.5,  dec: 1, better: 'high', min: 10,  max: 120 },
  { key: 'bench',       label: 'Bench Press 100 kg',   short: 'Bench',    unit: 'Wdh.', step: 1,    dec: 0, better: 'high', min: 0,   max: 60 },
  { key: 'maxVelocity', label: 'Max. Geschwindigkeit', short: 'Max V',    unit: 'km/h', step: 0.1,  dec: 1, better: 'high', min: 10,  max: 45 },
];
export const METRIC = Object.fromEntries(METRICS.map(m => [m.key, m]));

export const POSITIONS = ['QB', 'RB', 'FB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P', 'LS', 'ATH'];
export const OFF_POS = ['QB', 'RB', 'FB', 'WR', 'TE', 'OL'];
export const DEF_POS = ['DL', 'LB', 'CB', 'S'];

export function fullName(a) { return a ? `${a.firstName || ''} ${a.lastName || ''}`.trim() || '—' : '—'; }
export function shortName(a) { return a ? `${(a.firstName || '').slice(0, 1)}. ${a.lastName || ''}`.trim() : '—'; }

/** Alter in Jahren – aus Geburtsdatum (am Stichtag) oder manuell gepflegtem Alter */
export function ageOf(a, atDate = new Date()) {
  if (!a) return null;
  if (a.birthDate) {
    const b = new Date(a.birthDate), d = new Date(atDate);
    if (isNaN(b)) return a.age ?? null;
    let age = d.getFullYear() - b.getFullYear();
    const m = d.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && d.getDate() < b.getDate())) age--;
    return age;
  }
  return a.age ?? null;
}

const has = v => v !== null && v !== undefined && v !== '' && !isNaN(v);

/** Messungen nach Datum aufsteigend */
export function sortedMeasurements(a) {
  return [...(a.measurements || [])].sort((x, y) => (x.date || '').localeCompare(y.date || ''));
}

export function latestValue(a, key) {
  const ms = sortedMeasurements(a);
  for (let i = ms.length - 1; i >= 0; i--) if (has(ms[i][key])) return { value: +ms[i][key], date: ms[i].date };
  return null;
}

export function bestValue(a, key) {
  const m = METRIC[key];
  if (!m.better) return latestValue(a, key);
  let best = null;
  for (const ms of a.measurements || []) {
    if (!has(ms[key])) continue;
    const v = +ms[key];
    if (!best || (m.better === 'low' ? v < best.value : v > best.value)) best = { value: v, date: ms.date };
  }
  return best;
}

export function metricValue(a, key, mode = 'latest') {
  const r = mode === 'best' ? bestValue(a, key) : latestValue(a, key);
  return r ? r.value : null;
}

export function fmt(v, dec = 2) {
  if (!has(v)) return '–';
  return Number(v).toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
export function fmtMetric(key, v) { return fmt(v, METRIC[key].dec); }

/** Parst Eingaben mit Komma oder Punkt */
export function parseNum(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return isNaN(n) ? null : n;
}

/** Plausibilitätsprüfung – liefert Warntext oder null */
export function plausibility(key, v) {
  const m = METRIC[key];
  if (!has(v)) return null;
  if (v < m.min || v > m.max) return `${m.label}: ${v} ${m.unit} wirkt unplausibel (erwartet ${m.min}–${m.max})`;
  return null;
}

/** Quartil-Klasse (q1 = Top 25 %) eines Werts innerhalb einer Werteliste */
export function quartileClass(key, v, values) {
  const m = METRIC[key];
  if (!m.better || !has(v) || values.length < 4) return '';
  const sorted = [...values].sort((a, b) => m.better === 'low' ? a - b : b - a);
  const rank = sorted.indexOf(v) / (sorted.length - 1);
  return rank <= 0.25 ? 'q1' : rank <= 0.5 ? 'q2' : rank <= 0.75 ? 'q3' : 'q4';
}

/** km/h → Yards pro Sekunde (für die Simulation) */
export function kmhToYps(kmh) { return kmh / 3.6 * 1.09361; }

/** Grobe Ableitung der Topspeed aus der 40-Yard-Zeit, falls keine Max-V-Messung da ist */
export function speedFromForty(forty) {
  // Faustregel: Topspeed ≈ 40 / (forty * 0.83) yd/s (der erste Teil ist Beschleunigung)
  return 40 / (forty * 0.83);
}

export function athleteSpeedYps(a) {
  const v = latestValue(a, 'maxVelocity');
  if (v) return kmhToYps(v.value);
  const f = latestValue(a, 'forty');
  if (f) return speedFromForty(f.value);
  return null;
}

export function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function fmtDate(iso) {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
