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

// ── 언제 열리나 ── (21시 폰 시각 · 단계 · 원작 장면 이후)
export function isAvailable(s, ep, now = gnow(), stageId) {
  if (!ep || (!ep.generic && s.msgr && s.msgr.done[ep.id])) return false;
  const a = ep.avail || {};
  if (a.stage && stageId && a.stage !== stageId) return false;
  if (a.fromHour != null && new Date(now).getHours() < a.fromHour) return false;
  if (a.day && dayNumber(s, now) < a.day) return false;
  if (a.afterEvent && !(s.events && s.events[a.afterEvent])) return false;
  return true;
}
/** 오늘 밤 올 문자: 하루 1번. 대본 있는 날(첫날·원작 장면 뒤)이 먼저, 없으면 그 단계의 임시 짧은 채팅을 번갈아 */
export function pending(s, now = gnow(), stageId) {
  const day = dayNumber(s, now);
  if (s.msgr && s.msgr.last === day) return null;
  const sc = episodes().find((e) => !e.generic && isAvailable(s, e, now, stageId));
  if (sc) return sc;
  const gen = episodes().filter((e) => e.generic && isAvailable(s, e, now, stageId));
  return gen.length ? gen[day % gen.length] : null;
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
export function finish(s, ep, now = gnow()) { s.msgr.done[ep.id] = now; s.msgr.last = dayNumber(s, now); }

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
