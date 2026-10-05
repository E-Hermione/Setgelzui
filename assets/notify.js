/*
 * Сэтгэл зүйчид шинэ мессеж, төлбөрийн мэдэгдлийг имэйл болон SMS (webhook)-ээр илгээнэ.
 * Мөн самбар нээлттэй үед хөтчийн мэдэгдэл, дуу гаргана.
 */
import { notifyConfig as C } from './notify-config.js';

const EMAILJS_SRC = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4.4.1/dist/email.min.js';
const THROTTLE_KEY = 'stol-notify-v1';

export function notifyChannels() {
  const e = C.emailjs || {};
  return { email: !!(e.publicKey && e.serviceId && e.templateId), webhook: !!C.webhookUrl };
}

let emailjsPromise = null;
function loadEmailJs() {
  if (window.emailjs) return Promise.resolve(window.emailjs);
  if (!emailjsPromise) {
    emailjsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = EMAILJS_SRC;
      s.onload = () => resolve(window.emailjs);
      s.onerror = () => { emailjsPromise = null; reject(new Error('emailjs-load')); };
      document.head.appendChild(s);
    });
  }
  return emailjsPromise;
}

function readThrottle() { try { return JSON.parse(localStorage.getItem(THROTTLE_KEY)) || {}; } catch (e) { return {}; } }
function writeThrottle(m) { try { localStorage.setItem(THROTTLE_KEY, JSON.stringify(m)); } catch (e) {} }

/* Төлбөрийн мэдэгдэл үргэлж явна. Мессежийн хувьд сэтгэл зүйч хариулсны дараах эхний мессеж,
   эсвэл өмнөх мэдэгдлээс throttleMinutes өнгөрсөн бол явна. */
function shouldSend(uid, kind, firstUnanswered) {
  if (kind === 'payment' || firstUnanswered) return true;
  const last = readThrottle()[uid] || 0;
  return Date.now() - last > (C.throttleMinutes || 15) * 60000;
}
function markSent(uid) { const m = readThrottle(); m[uid] = Date.now(); writeThrottle(m); }

/**
 * @param {object} p
 * @param {'message'|'payment'} p.kind
 * @param {string} p.uid      Хэрэглэгчийн id
 * @param {string} p.name     Хэрэглэгчийн нэр
 * @param {string} p.phone    Хэрэглэгчийн утас
 * @param {string} [p.text]   Мессежийн текст
 * @param {string} [p.plan]   Багцын нэр (төлбөрийн үед)
 * @param {boolean} [p.firstUnanswered] Сэтгэл зүйч хариулсны дараах эхний мессеж эсэх
 * @param {{email?:string, phone?:string}} p.to  Сэтгэл зүйчийн имэйл, утас (сайтын тохиргооноос)
 */
export async function notifyPsychologist(p) {
  const ch = notifyChannels();
  const to = p.to || {};
  const useEmail = ch.email && to.email;
  const useHook = ch.webhook;
  if (!useEmail && !useHook) return { sent: false, reason: 'not-configured' };
  if (!shouldSend(p.uid, p.kind, p.firstUnanswered)) return { sent: false, reason: 'throttled' };

  const name = p.name || 'Хэрэглэгч';
  const link = location.href.split('#')[0] + '#chat';
  const subject = p.kind === 'payment' ? `Төлбөр шалгах: ${name}` : `Шинэ мессеж: ${name}`;
  const message = p.kind === 'payment'
    ? `${name} (${p.phone || 'утасгүй'}) «${p.plan || ''}» багцын төлбөр төлсөн гэж мэдэгдлээ. Самбараас шалгаад идэвхжүүлнэ үү.`
    : `${name} (${p.phone || 'утасгүй'}): ${String(p.text || '').slice(0, 500)}`;
  const sms = p.kind === 'payment'
    ? `Сэтгэлийн Толь: ${name} төлбөр төлсөн гэж мэдэгдлээ.`
    : `Сэтгэлийн Толь: ${name}-с шинэ мессеж ирлээ.`;

  const jobs = [];
  if (useEmail) {
    jobs.push(loadEmailJs().then(ejs => ejs.send(C.emailjs.serviceId, C.emailjs.templateId, {
      to_email: to.email, subject, message, user_name: name, user_phone: p.phone || '', site_url: link
    }, { publicKey: C.emailjs.publicKey })));
  }
  if (useHook) {
    /* text/plain + no-cors: хөтөч урьдчилсан CORS шалгалт хийхгүй тул Make, Zapier шууд хүлээн авна. */
    jobs.push(fetch(C.webhookUrl, {
      method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        event: p.kind, subject, message, sms, link,
        user: { name, phone: p.phone || '' },
        to_email: to.email || '', to_phone: to.phone || '',
        at: new Date().toISOString()
      })
    }));
  }
  const results = await Promise.allSettled(jobs);
  const ok = results.some(r => r.status === 'fulfilled');
  if (ok) markSent(p.uid);
  return { sent: ok, results };
}

/* ---------- хөтчийн мэдэгдэл (сэтгэл зүйчийн самбар) ---------- */
let audioCtx = null;
export function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
    o.connect(g).connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.4);
  } catch (e) {}
}
export function browserNotifyState() {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}
export async function enableBrowserNotify() {
  if (!('Notification' in window)) return 'unsupported';
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  try { return await Notification.requestPermission(); } catch (e) { return Notification.permission; }
}
export function showBrowserNotify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { const n = new Notification(title, { body, tag: 'stol-' + title }); n.onclick = () => { window.focus(); n.close(); }; } catch (e) {}
}
