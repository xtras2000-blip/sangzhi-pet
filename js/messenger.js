// 밤 메신저(파일럿) — 플레이어 = 쌍즈의 소꿉친구. 데이터: data/messenger.json
// 순수 로직(테스트용)과 화면 재생기(runChat)로 나뉨
import { dayNumber, gnow } from './state.js';

let DATA = { gauges: {}, episodes: [] };
export const setMessenger = (d) => { DATA = d || DATA; };
export const episodes = () => DATA.episodes || [];
export const episode = (id) => episodes().find((e) => e.id === id) || null;
export async function loadMessenger() { try { setMessenger(await (await fetch('data/messenger.json')).json()); } catch {} return DATA; }

// ── 이름 ──
export function hasBatchim(name) {
  const c = String(name || '').trim().slice(-1).charCodeAt(0);
  if (!(c >= 0xac00 && c <= 0xd7a3)) return false;
  return (c - 0xac00) % 28 !== 0;
}
export function cleanName(v) { return String(v || '').replace(/[{}<>]/g, '').trim().slice(0, 8); }
export function fill(text, name) {
  const n = cleanName(name) || '친구';
  const b = hasBatchim(n);
  return String(text)
    .replace(/\{call\}/g, n + (b ? '아' : '야'))
    .replace(/\{name_i\}/g, n + (b ? '이' : ''))
    .replace(/\{name\}/g, n);
}

// ── 언제 열리나 ── (21시 폰 시각 · 단계 · 원작 장면 이후 · 조건)
let rnd = Math.random;
export const setMsgRng = (f) => { rnd = f || Math.random; };
const keyDays = (k) => { const m = String(k || '').match(/^(\d+)-(\d+)-(\d+)$/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null; };
const nowDays = (now) => { const d = new Date(now); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000; };
const inR = (v, r) => !r || (v != null && v >= r[0] && v <= (r[1] ?? 1e9));
/**
 * avail: { stage, fromHour, day, afterEvent, notEvent, fresh(장면 뒤 N일 안에만), crush:[min,max], grade:[..], mood:[..],
 *          bond:{용기:[min,max]}, months:[..], afterEp(이 문자를 본 뒤), w(가중치), once(평범한 날 문자지만 한 번만),
 *          minN/maxN(이 단계에서 이미 받은 문자 수 범위 = 단계 초반/후반 이야기) }
 */
export function isAvailable(s, ep, now = gnow(), stageId) {
  if (!ep || (!ep.generic && s.msgr && s.msgr.done[ep.id])) return false;
  const a = ep.avail || {};
  if (a.stage && stageId && a.stage !== stageId) return false;
  if (a.stages && stageId && !a.stages.includes(stageId)) return false;
  if (a.fromHour != null && new Date(now).getHours() < a.fromHour) return false;
  if (a.day && dayNumber(s, now) < a.day) return false;
  if (a.afterEvent && !(s.events && s.events[a.afterEvent])) return false;
  if (a.notEvent && s.events && s.events[a.notEvent]) return false;
  if (a.afterEvent && a.fresh != null) {   // 원작 장면 문자는 그 장면 본 날(~fresh일 뒤)까지만. 옛날 일을 '오늘'처럼 말하지 않게
    const d = keyDays(s.events[a.afterEvent]);
    if (d != null && nowDays(now) - d > a.fresh) return false;
  }
  if (a.afterEp && !(s.msgr && s.msgr.done[a.afterEp])) return false;
  if (ep.generic && a.once && s.msgr && s.msgr.done[ep.id]) return false;      // 인생에 한 번(첫 출근·이사 등)
  const nth = stageNights(s, stageId || ep.stage);                               // 이 단계에서 이미 받은 문자 수 → 단계 초반/후반 이야기
  if (a.minN != null && nth < a.minN) return false;
  if (a.maxN != null && nth > a.maxN) return false;
  const st = s.stats || {};
  if (!inR(st.crush, a.crush) || !inR(st.grade, a.grade) || !inR(st.mood, a.mood)) return false;
  for (const k in (a.bond || {})) if (!inR((s.bond || {})[k] || 0, a.bond[k])) return false;
  if (a.months && !a.months.includes(new Date(now).getMonth() + 1)) return false;
  return true;
}
/** 이 단계에서 받은(다 읽은) 문자 수 */
export const stageNights = (s, st) => ((s.msgr && s.msgr.nights) || {})[st] || 0;
const condCount = (ep) => { const a = ep.avail || {}; return ['crush', 'grade', 'mood', 'bond', 'months', 'afterEvent', 'afterEp', 'minN', 'maxN'].filter((k) => a[k] != null).length; };
/** 평범한 날 문자 고르기: 이 단계에서 아직 안 본 것 중(다 보면 한 바퀴 새로, 최근 3개는 빼고) 조건 맞는 것 가중치 우선 */
function chooseGeneric(s, gen, stageId) {
  const m = s.msgr;
  const used = ((m.used ||= {})[stageId] ||= []);
  let c = gen.filter((e) => !used.includes(e.id));
  if (!c.length) {
    const tail = used.slice(-Math.min(5, Math.floor(gen.length / 2)));
    used.length = 0; used.push(...tail);       // 한 바퀴 다 봄 → 새 바퀴(직전 몇 개는 계속 제외)
    c = gen.filter((e) => !tail.includes(e.id));
    if (!c.length) c = gen;
  }
  const w = (e) => ((e.avail || {}).w || 1) * (1 + 1.5 * condCount(e));
  const tot = c.reduce((t, e) => t + w(e), 0);
  let r = rnd() * tot;
  for (const e of c) { r -= w(e); if (r <= 0) return e; }
  return c[c.length - 1];
}
/** 오늘 밤 올 문자: 하루 1번. 원작 장면 문자(대본)가 먼저, 없으면 그 단계 평범한 날 문자(반복 없이). 고른 건 그날 고정(s.msgr.plan) */
export function pending(s, now = gnow(), stageId) {
  const day = dayNumber(s, now);
  if (s.msgr && s.msgr.last === day) return null;
  const sc = episodes().find((e) => !e.generic && isAvailable(s, e, now, stageId));
  if (sc) return sc;
  const plan = s.msgr.plan;
  if (plan && plan.day === day && plan.stage === stageId) { const e = episode(plan.id); if (e && isAvailable(s, e, now, stageId)) return e; }
  const gen = episodes().filter((e) => e.generic && isAvailable(s, e, now, stageId));
  if (!gen.length) return null;
  const e = chooseGeneric(s, gen, stageId);
  s.msgr.plan = { day, stage: stageId, id: e.id };
  return e;
}

// ── 게이지 ──
export function applyGauges(s, g) {
  const out = {};
  for (const k in (g || {})) {
    const max = (DATA.gauges[k] || {}).max || 100;
    const before = s.bond[k] || 0;
    s.bond[k] = Math.max(0, Math.min(max, before + g[k]));
    out[k] = s.bond[k] - before;
  }
  return out;
}
export function pick(s, ep, ci, oi) {
  const ch = ep.lines.filter((l) => l.t === 'choice')[ci];
  const opt = ch && ch.options[oi];
  if (!opt) return null;
  (s.msgr.picks[ep.id] ||= [])[ci] = oi;
  return { opt, delta: applyGauges(s, opt.g) };
}
export function finish(s, ep, now = gnow(), stageId) {
  s.msgr.done[ep.id] = now; s.msgr.last = dayNumber(s, now);
  const sn = stageId || ep.stage;
  if (sn) { s.msgr.nights ||= {}; s.msgr.nights[sn] = (s.msgr.nights[sn] || 0) + 1; }
  if (ep.generic) {   // 평범한 날 문자: 이 단계 바퀴 기록(다 볼 때까지 다시 안 옴)
    const st = ep.stage || (ep.avail || {}).stage || 'any';
    const u = ((s.msgr.used ||= {})[st] ||= []);
    const i = u.indexOf(ep.id); if (i >= 0) u.splice(i, 1); u.push(ep.id);
    s.msgr.plan = null;
  }
}

// ── 화면 재생기 ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function runChat(root, s, ep, opt = {}) {
  const speed = opt.fast ? 0.15 : 1;
  const name = s.player.name;
  const log = root.querySelector('.mg-log'), bar = root.querySelector('.mg-choices'), status = root.querySelector('.mg-status');
  const typing = root.querySelector('.mg-typing');
  root.querySelector('.mg-clock').textContent = ep.at || '21:00';
  root.querySelector('.mg-title').textContent = ep.title || '';
  log.innerHTML = ''; bar.innerHTML = ''; root.hidden = false;
  root.classList.toggle('drunk', !!ep.drunk);
  let fastNow = false, aborted = false, release = null;
  const snap = { bond: { ...s.bond }, picks: s.msgr.picks[ep.id] };
  root._abort = () => { aborted = true; s.bond = snap.bond; if (snap.picks) s.msgr.picks[ep.id] = snap.picks; else delete s.msgr.picks[ep.id]; root.hidden = true; release && release(-1); };
  const view = root.querySelector('.mg-view');
  log.onclick = (e) => { const b = e.target.closest('.mg-photo'); if (!b) return; e.stopPropagation(); view.querySelector('img').src = `assets/events/${b.dataset.art}.webp`; view.hidden = false; };
  view.onclick = () => { view.hidden = true; };
  const onTap = () => { fastNow = true; };
  log.addEventListener('click', onTap);
  const ABORT = {};
  const wait = async (ms) => { await sleep((fastNow ? 0.2 : 1) * speed * (ms || 0)); if (aborted) throw ABORT; };
  const scroll = () => { log.scrollTop = log.scrollHeight; };
  const gaugeChip = () => { root.querySelector('.mg-bond').textContent = Object.keys(DATA.gauges).map((k) => `${DATA.gauges[k].icon}${s.bond[k] || 0}`).join(' '); };
  gaugeChip();
  const add = (cls, html) => { const d = document.createElement('div'); d.className = 'mg-row ' + cls; d.innerHTML = html; log.insertBefore(d, typing); scroll(); opt.onLine && opt.onLine(d); return d; };
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  log.appendChild(typing);
  const showTyping = async (ms, pauses = 0) => {
    for (let i = 0; i < pauses; i++) {   // 입력 중… 떴다가 멈춤(망설임 / 취해서 지웠다 다시 씀)
      typing.hidden = false; status.textContent = '입력 중…'; scroll(); await wait(ms * 0.6);
      typing.hidden = true; status.textContent = '접속 중'; await wait(900);
    }
    typing.hidden = false; status.textContent = '입력 중…'; scroll(); await wait(ms);
    typing.hidden = true; status.textContent = '접속 중';
  };
  const play = async (lines) => {
    for (const l of lines) {
      if (l.wait) await wait(l.wait);
      if (l.t === 'sys') { if (l.clock) root.querySelector('.mg-clock').textContent = l.clock; add('sys', `<span>${esc(l.text)}</span>`); await wait(300); }
      else if (l.t === 'sz') { await showTyping(l.typing || 900, l.pause || 0); add('sz', `<p>${esc(fill(l.text, name))}</p>`); opt.sfx && opt.sfx('msg'); await wait(250); }
      else if (l.t === 'photo') {
        await showTyping(l.typing || 1500);
        add('sz photo', `<button class="mg-photo" data-art="${esc(l.art)}"><img src="assets/events/${esc(l.art)}_t.webp" alt="사진"></button>${l.text ? `<p>${esc(fill(l.text, name))}</p>` : ''}`);
        opt.sfx && opt.sfx('msg'); await wait(400);
      } else if (l.t === 'choice') {
        const ci = ++choiceN;
        const oi = await new Promise((res) => {
          release = res; bar.innerHTML = '';
          l.options.forEach((o, i) => { const b = document.createElement('button'); b.className = 'mg-opt'; b.textContent = fill(o.label, name); b.onclick = () => res(i); bar.appendChild(b); });
          scroll(); opt.onChoice && opt.onChoice(bar);
        });
        release = null; if (aborted || oi < 0) throw ABORT;
        bar.innerHTML = '';
        const r = pick(s, ep, ci, oi);
        add('me', `<p>${esc(fill(r.opt.say || r.opt.label, name))}</p><i>읽음</i>`);
        const gains = Object.entries(r.delta).filter(([, v]) => v > 0).map(([k, v]) => `${(DATA.gauges[k] || {}).icon || ''} ${k} +${v}`);
        if (gains.length) { gaugeChip(); add('sys gain', `<span>${gains.join(' · ')}</span>`); }
        opt.onPick && opt.onPick(r);
        fastNow = false;
        await wait(600);
        await play(r.opt.then || []);
      }
    }
  };
  let choiceN = -1;
  try { await play(ep.lines); } catch (e) { if (e === ABORT) { log.removeEventListener('click', onTap); typing.hidden = true; return false; } throw e; }
  finish(s, ep);
  log.removeEventListener('click', onTap);
  root._abort = () => { root.hidden = true; root._done && root._done(true); };
  const done = document.createElement('button'); done.className = 'mg-opt mg-done'; done.textContent = '폰 내려놓기';
  bar.appendChild(done);
  return new Promise((res) => { root._done = res; done.onclick = () => { root.hidden = true; res(true); }; });
}
