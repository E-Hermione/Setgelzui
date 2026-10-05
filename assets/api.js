/*
 * Өгөгдлийн давхарга (демо).
 *
 * Энэ файл бүх өгөгдлийг хөтөчийн localStorage-д хадгалдаг тул сайт сервергүйгээр
 * бүрэн ажиллана. Хоёр таб нээж нэгд нь хэрэглэгч, нөгөөд нь сэтгэл зүйчээр
 * нэвтэрвэл чат хооронд нь шууд солигдоно.
 *
 * Жинхэнэ сервер (Firebase, Supabase эсвэл өөрийн API) холбохдоо зөвхөн энэ файлыг
 * ижил функцуудтай хувилбараар солино. app.js өөрчлөгдөхгүй.
 */

const DB_KEY = 'stol-db-v1';
const SESSION_KEY = 'stol-session-v1';

/* Демо сэтгэл зүйчийн бүртгэл. Жинхэнэ сервер холбогдоход устгана. */
const DEMO_PSY = { email: 'psy@demo.mn', password: 'demo123', name: 'Демо сэтгэл зүйч' };

const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { users: {}, chats: {}, subs: {}, msgs: {}, config: null };
}
function save(db) {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {}
  notify();
}
function notify() { listeners.forEach(fn => { try { fn(); } catch (e) {} }); }
window.addEventListener('storage', e => { if (e.key === DB_KEY) notify(); });

function err(code) { const e = new Error(code); e.code = code; return e; }
const later = v => new Promise(r => setTimeout(() => r(v), 150));
const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

async function hash(text) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('stol:' + text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return 'plain:' + text;
  }
}

/* Нэвтрэлт таб бүрт тусдаа (sessionStorage), ингэснээр нэг табд хэрэглэгч, нөгөөд сэтгэл зүйч байж болно. */
function sessionUid() { try { return sessionStorage.getItem(SESSION_KEY); } catch (e) { return null; } }
function setSession(uid) {
  try { uid ? sessionStorage.setItem(SESSION_KEY, uid) : sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  notify();
}

async function ensureDemoPsy() {
  const db = load();
  if (Object.values(db.users).some(u => u.email === DEMO_PSY.email)) return;
  const uid = 'psy-' + newId();
  db.users[uid] = { uid, name: DEMO_PSY.name, phone: '', email: DEMO_PSY.email, pass: await hash(DEMO_PSY.password), isAdmin: true, createdAt: Date.now() };
  save(db);
}

function publicUser(u) { return u ? { uid: u.uid, name: u.name, phone: u.phone, email: u.email, isAdmin: !!u.isAdmin } : null; }

/* Өгөгдсөн selector-ийн утга өөрчлөгдөх бүрт cb дуудна. Буцаах утга: unsubscribe. */
function watch(selector, cb) {
  let last;
  const run = () => {
    const v = JSON.stringify(selector(load()) ?? null);
    if (v !== last) { last = v; cb(JSON.parse(v)); }
  };
  listeners.add(run);
  setTimeout(run, 0);
  return () => listeners.delete(run);
}

export const api = {
  demo: true,
  demoPsy: { email: DEMO_PSY.email, password: DEMO_PSY.password },

  /* ---------- бүртгэл ---------- */
  onAuth(cb) {
    ensureDemoPsy();
    let last;
    const run = () => {
      const uid = sessionUid();
      const u = uid ? publicUser(load().users[uid]) : null;
      const v = JSON.stringify(u);
      if (v !== last) { last = v; cb(u); }
    };
    listeners.add(run);
    setTimeout(run, 0);
    return () => listeners.delete(run);
  },
  async register({ name, phone, email, password }) {
    email = email.toLowerCase();
    if (password.length < 6) throw err('auth/weak-password');
    const db = load();
    if (Object.values(db.users).some(u => u.email === email)) throw err('auth/email-already-in-use');
    const uid = 'u-' + newId();
    db.users[uid] = { uid, name, phone, email, pass: await hash(password), isAdmin: false, createdAt: Date.now() };
    save(db);
    setSession(uid);
    return later(publicUser(db.users[uid]));
  },
  async login(email, password) {
    await ensureDemoPsy();
    email = email.toLowerCase();
    const db = load();
    const u = Object.values(db.users).find(x => x.email === email);
    if (!u || u.pass !== await hash(password)) throw err('auth/invalid-credential');
    setSession(u.uid);
    return later(publicUser(u));
  },
  async logout() { setSession(null); },
  async resetPassword() { throw err('demo/no-email'); },

  /* ---------- тохиргоо (үнэ, данс) ---------- */
  watchConfig(cb) { return watch(db => db.config, cb); },
  async saveConfig(data) { const db = load(); db.config = clone(data); save(db); },

  /* ---------- хэрэглэгчийн чатын мэдээлэл ---------- */
  watchChat(uid, cb) { return watch(db => db.chats[uid], cb); },
  async saveChat(uid, data) { const db = load(); db.chats[uid] = clone(data); save(db); },
  watchAllChats(cb) { return watch(db => Object.entries(db.chats).map(([id, d]) => ({ id, d })), cb); },

  /* ---------- багц ---------- */
  watchSub(uid, cb) { return watch(db => db.subs[uid], cb); },
  async setSub(uid, data) { const db = load(); db.subs[uid] = clone(data); save(db); },
  watchAllSubs(cb) { return watch(db => db.subs, cb); },

  /* ---------- мессеж ---------- */
  watchMessages(uid, cb) { return watch(db => (db.msgs[uid] || []).slice(-300), cb); },
  async addMessage(uid, msg) {
    const db = load();
    if (msg.from === 'user') {
      const s = db.subs[uid];
      if (!s || s.until <= Date.now()) throw err('chat/no-subscription');
    }
    (db.msgs[uid] = db.msgs[uid] || []).push(clone(msg));
    save(db);
  }
};
