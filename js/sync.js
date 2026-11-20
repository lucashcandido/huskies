// Gemeinsame Daten für mehrere Coaches – wie bei Cast Comercial:
//
// • Die Daten liegen im privaten GitHub-Repo „huskies-data“, eine Datei pro
//   Bereich (data/athletes.json, data/rosters.json, …).
// • Der Admin verbindet sich einmal mit einem Fine-grained-Token, der NUR
//   dieses Repo erreicht (Contents: Read and write). Die App verschlüsselt
//   {repo, token} mit einem zufälligen 12-stelligen Zugangscode
//   (PBKDF2 + AES-GCM) und legt das Ergebnis als access.json neben die App.
// • Alle weiteren Coaches brauchen nur den Code (oder den Link mit #c=CODE).
//   Ohne Code ist access.json wertlos.
// • Abgleich: laden → feldgenau zusammenführen (neuere Änderung gewinnt) →
//   mit sha zurückschreiben; bei Konflikt (409/422) neu laden und wiederholen.
//   Offline-Änderungen bleiben „dirty“ und werden nachgereicht.

import { COLLS, fileFor, mergeRemote, sameAsRemote, dirtyColls, markClean, markAllDirty, notifyRemote } from './store.js';

const API = 'https://api.github.com';
const CFG_KEY = 'huskies.sync';
const ETAG_KEY = 'huskies.etags';
export const DATA_REPO = 'lucashcandido/huskies-data';
const ACCESS_FILE = 'access.json', ACCESS_ITERATIONS = 600000;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', CODE_LEN = 12;   // ohne 0/O, 1/I/L
export const APP_REPO = (() => {
  const host = /^([\w-]+)\.github\.io$/i.exec(location.hostname), dir = location.pathname.split('/').filter(Boolean)[0];
  return host && dir && !/\./.test(dir) ? host[1] + '/' + dir : 'lucashcandido/huskies';
})();
const path = coll => `data/${coll}.json`;

let cfg = readJSON(CFG_KEY, null);                 // {repo, token, code, coach}
let etags = readJSON(ETAG_KEY, {});                // coll → {etag, sha}
const status = { state: cfg ? 'wait' : 'local', text: cfg ? '…' : 'Nur lokal', at: 0 };
const statusListeners = new Set();
let busy = false, again = false, timer = 0;

function readJSON(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } }
function writeJSON(k, v) { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); }

export function config() { return cfg; }
export function getStatus() { return status; }
export function onStatus(fn) { statusListeners.add(fn); fn(status); return () => statusListeners.delete(fn); }
function setStatus(state, text) { status.state = state; status.text = text; statusListeners.forEach(f => f(status)); }

// ---------- Base64 / Text ----------
const b64enc = s => { const b = new TextEncoder().encode(s); let x = ''; for (let i = 0; i < b.length; i += 0x8000) x += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(x); };
const b64dec = s => { const x = atob(String(s).replace(/\s/g, '')), b = new Uint8Array(x.length); for (let i = 0; i < x.length; i++) b[i] = x.charCodeAt(i); return new TextDecoder().decode(b); };
const bytesToB64 = b => { let x = ''; for (const c of b) x += String.fromCharCode(c); return btoa(x); };
const b64ToBytes = s => Uint8Array.from(atob(String(s)), ch => ch.charCodeAt(0));

// ---------- Zugangscode ----------
export const cleanCode = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const showCode = c => cleanCode(c).replace(/(.{4})(?=.)/g, '$1-');
export function newCode() {
  let out = '';
  while (out.length < CODE_LEN) for (const x of crypto.getRandomValues(new Uint8Array(24))) if (x < 248 && out.length < CODE_LEN) out += CODE_CHARS[x % 31];
  return out;
}
async function codeKey(code, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(cleanCode(code)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function sealAccess(code, conf) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await codeKey(code, salt, ACCESS_ITERATIONS);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify({ repo: conf.repo, token: conf.token })));
  return { v: 1, it: ACCESS_ITERATIONS, salt: bytesToB64(salt), iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
}
async function openAccess(code, blob) {
  if (!blob || blob.v !== 1 || !Number.isInteger(blob.it) || blob.it < 100000 || blob.it > 5000000) throw new Error('format');
  const key = await codeKey(code, b64ToBytes(blob.salt), blob.it);
  let plain;
  try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(blob.iv) }, key, b64ToBytes(blob.ct)); }
  catch (e) { throw new Error('code'); }
  const conf = JSON.parse(new TextDecoder().decode(plain));
  if (!conf || typeof conf.token !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(conf.repo || '')) throw new Error('format');
  return { repo: conf.repo, token: conf.token };
}
/** access.json: frisch über die GitHub-API, sonst die mit der App ausgelieferte Kopie. null = noch nicht eingerichtet */
async function fetchAccessBlob() {
  try {
    const r = await fetch(`${API}/repos/${APP_REPO}/contents/${ACCESS_FILE}`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (r.ok) { const j = await r.json(); if (j && j.content) return JSON.parse(b64dec(j.content)); }
  } catch (e) { /* weiter mit der lokalen Kopie */ }
  const r = await fetch(ACCESS_FILE + '?v=' + Date.now(), { cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('net');
  return r.json();
}

// ---------- GitHub ----------
function gh(conf, p, opt = {}) {
  opt.headers = { Authorization: 'Bearer ' + conf.token, Accept: 'application/vnd.github+json', ...(opt.headers || {}) };
  opt.cache = 'no-store';
  return fetch(API + p, opt);
}
async function checkRepo(conf) {
  const r = await gh(conf, `/repos/${conf.repo}`);
  if (r.status === 401) throw new Error('expired');
  if (r.status === 404 || r.status === 403) throw new Error('norepo');
  if (!r.ok) throw new Error('net');
  const j = await r.json();
  if (j.permissions && !j.permissions.push) throw new Error('readonly');
}

/** Admin: einmalig mit Token verbinden */
export async function connectWithToken(token, coach) {
  const conf = { repo: DATA_REPO, token: token.trim() };
  await checkRepo(conf);
  cfg = { ...conf, code: cfg?.code || '', coach: coach.trim() || 'Admin' };
  writeJSON(CFG_KEY, cfg);
  etags = {}; writeJSON(ETAG_KEY, etags);
  markAllDirty();
  return syncNow();
}

/** Coach: mit Zugangscode verbinden */
export async function connectWithCode(code, coach) {
  if (cleanCode(code).length !== CODE_LEN) throw new Error('len');
  const blob = await fetchAccessBlob();
  if (!blob) throw new Error('none');
  const conf = await openAccess(code, blob);
  await checkRepo(conf);
  cfg = { ...conf, code: cleanCode(code), coach: coach.trim() || 'Coach' };
  writeJSON(CFG_KEY, cfg);
  etags = {}; writeJSON(ETAG_KEY, etags);
  markAllDirty();
  return syncNow();
}

export function setCoachName(name) { if (cfg) { cfg.coach = name.trim() || cfg.coach; writeJSON(CFG_KEY, cfg); } }

export function disconnect() {
  cfg = null; writeJSON(CFG_KEY, null);
  etags = {}; writeJSON(ETAG_KEY, etags);
  setStatus('local', 'Nur lokal');
}

/** Verschlüsselt {repo, token} mit dem Code und legt access.json in das App-Repo (geht nur, wenn der Token dort schreiben darf). */
export async function publishAccess(code) {
  const text = JSON.stringify(await sealAccess(code, cfg));
  const p = `/repos/${APP_REPO}/contents/${ACCESS_FILE}`;
  let ok = false;
  try {
    const got = await gh(cfg, p);
    if (got.ok || got.status === 404) {
      const body = { message: 'Zugangsdatei aktualisiert', content: b64enc(text) };
      if (got.ok) body.sha = (await got.json()).sha;
      const put = await gh(cfg, p, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      ok = put.ok;
    }
  } catch (e) { ok = false; }
  cfg.code = cleanCode(code); writeJSON(CFG_KEY, cfg);
  return { ok, text, manualUrl: `https://github.com/${APP_REPO}/new/main?filename=${ACCESS_FILE}` };
}
export function shareLink(code) {
  return location.origin + location.pathname + '#c=' + showCode(code || cfg?.code);
}

// ---------- Dateien laden / speichern ----------
async function loadFile(coll, useEtag) {
  const e = etags[coll];
  const headers = useEtag && e?.etag ? { 'If-None-Match': e.etag } : {};
  const r = await gh(cfg, `/repos/${cfg.repo}/contents/${path(coll)}`, { headers });
  if (r.status === 304) return { unchanged: true, sha: e.sha };
  if (r.status === 404) return { sha: null, data: { items: [], deleted: {} } };
  if (!r.ok) throw new Error('http ' + r.status);
  const j = await r.json();
  let text = j.content ? b64dec(j.content) : '';
  if (!text && j.size > 0) {               // > 1 MB: Inhalt über die Blob-API holen
    const b = await gh(cfg, `/repos/${cfg.repo}/git/blobs/${j.sha}`);
    if (!b.ok) throw new Error('http ' + b.status);
    text = b64dec((await b.json()).content);
  }
  etags[coll] = { etag: r.headers.get('ETag'), sha: j.sha };
  writeJSON(ETAG_KEY, etags);
  return { sha: j.sha, data: text ? JSON.parse(text) : { items: [], deleted: {} } };
}

async function saveFile(coll) {
  for (let tries = 0; tries < 4; tries++) {
    const cur = await loadFile(coll, false);
    if (!cur.unchanged) {
      mergeRemote(coll, cur.data);
      if (cur.sha && sameAsRemote(coll, cur.data)) return;   // nichts Neues → kein Commit
    }
    const body = {
      message: `${cfg.coach}: ${coll} ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      content: b64enc(JSON.stringify(fileFor(coll))),
    };
    if (cur.sha) body.sha = cur.sha;
    const r = await gh(cfg, `/repos/${cfg.repo}/contents/${path(coll)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) {
      const j = await r.json();
      etags[coll] = { etag: null, sha: j.content?.sha };    // ETag erst beim nächsten Laden neu setzen
      writeJSON(ETAG_KEY, etags);
      return;
    }
    if (r.status !== 409 && r.status !== 422) throw new Error('http ' + r.status);
  }
  throw new Error('conflict');
}

export async function syncNow() {
  if (!cfg) return;
  if (busy) { again = true; return; }
  busy = true; clearTimeout(timer);
  setStatus('wait', 'Synchronisiere…');
  let changed = false;
  try {
    const dirty = new Set(dirtyColls());
    for (const coll of COLLS) {
      if (dirty.has(coll)) {
        await saveFile(coll);            // lädt vorher und führt zusammen
        markClean(coll);
        changed = true;
      } else {
        const cur = await loadFile(coll, true);
        if (!cur.unchanged && mergeRemote(coll, cur.data)) changed = true;
        // Lokal neuer als die Datei? (z. B. Daten von vor dem Verbinden) → hochladen
        if (dirtyColls().includes(coll)) { await saveFile(coll); markClean(coll); }
      }
    }
    status.at = Date.now();
    setStatus('ok', 'Synchron · ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    if (/http 401/.test(e.message) && cfg.code) {
      // Token wurde vom Admin ersetzt? → neue access.json mit dem gespeicherten Code öffnen
      try {
        const fresh = await openAccess(cfg.code, await fetchAccessBlob());
        if (fresh.token !== cfg.token) { cfg.token = fresh.token; cfg.repo = fresh.repo; writeJSON(CFG_KEY, cfg); busy = false; return syncNow(); }
      } catch (x) { /* bleibt abgelaufen */ }
      setStatus('err', 'Token abgelaufen – Admin informieren');
    } else if (/http 401/.test(e.message)) setStatus('err', 'Token abgelaufen');
    else setStatus(dirtyColls().length ? 'wait' : 'err', dirtyColls().length ? 'Offline – wird nachgereicht' : 'Offline');
  }
  busy = false;
  if (changed) notifyRemote();
  if (again) { again = false; syncNow(); }
}

/** Nach lokalen Änderungen kurz warten und dann hochladen */
export function syncSoon() {
  if (!cfg) return;
  clearTimeout(timer);
  setStatus('wait', 'Speichere…');
  timer = setTimeout(syncNow, 1500);
}

export function startAutoSync() {
  setInterval(() => { if (cfg && document.visibilityState === 'visible') syncNow(); }, 45000);
  addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  if (cfg) syncNow();
}

export const ERRORS = {
  len: 'Bitte den vollständigen Code eingeben (12 Zeichen).',
  none: 'Der Zugang ist noch nicht eingerichtet – der Admin muss sich zuerst mit dem Token verbinden.',
  code: 'Code falsch.',
  format: 'Die Zugangsdatei ist beschädigt.',
  expired: 'Der Token ist abgelaufen oder ungültig.',
  norepo: `Der Token hat keinen Zugriff auf ${DATA_REPO}.`,
  readonly: `Der Token darf ${DATA_REPO} nur lesen – bitte „Contents: Read and write“ vergeben.`,
  net: 'Keine Verbindung zu GitHub. Bitte erneut versuchen.',
};
