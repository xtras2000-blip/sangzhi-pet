// 음성 대사(개인 빌드 전용): assets/voice/VLxx.{m4a,ogg} + index.json (tools/build_voice.py)
// 공개 사이트엔 assets/voice 가 없음 → index.json 못 불러오면 조용히 아무것도 안 함
// 일러스트(E#, E#_close, P##)가 보일 때 그 그림의 대사를 차례로 1번 재생 · BGM 은 재생 중 덕킹
import * as MU from './music.js';
const IOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const SAFARI = typeof navigator !== 'undefined' && /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
const EXT = (() => { if (IOS || SAFARI) return 'm4a'; try { return new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a'; } catch { return 'm4a'; } })();
const V = { index: null, lines: [], on: true, sound: true, vol: 1, el: null, seq: 0, log: [] };
/** 순수 함수: 그림 id → 그 그림의 대사 목록(대사 id 순) */
export function linesFor(lines, index, illust) {
  return (lines || []).filter((l) => l.illust === illust && index && index[l.id]).sort((a, b) => a.id.localeCompare(b.id));
}
export async function initVoice() {
  try {
    const [ri, rl] = await Promise.all([fetch('assets/voice/index.json', { cache: 'no-cache' }), fetch('data/voice_lines.json', { cache: 'no-cache' })]);
    if (ri.ok && rl.ok) { V.index = await ri.json(); V.lines = await rl.json(); }
  } catch { V.index = null; }
  return !!V.index;
}
export const voiceReady = () => !!V.index;
export const hasVoice = (illust) => linesFor(V.lines, V.index, illust).length > 0;
export function setVoice({ on, sound, vol } = {}) {
  if (on != null) V.on = !!on; if (sound != null) V.sound = !!sound; if (vol != null) V.vol = Math.max(0, Math.min(1, +vol));
  if (V.el) V.el.volume = V.vol; if (!V.on || !V.sound) stopVoice();
}
function cap(l) {
  const c = typeof document !== 'undefined' && document.getElementById('voiceCap'); if (!c) return;
  if (!l) { c.hidden = true; return; }
  c.innerHTML = `<b>${l.zh}</b><small>${l.ko}</small>`; c.hidden = false;
}
export function stopVoice() {
  V.seq++; if (V.el) { try { V.el.pause(); } catch {} V.el = null; } cap(null); MU.musicDuck(false);
}
/** 그 그림의 대사를 차례로 재생. force=true 면 설정과 무관하게(🔊 버튼) — 단 소리 꺼짐이면 안 함 */
export async function playIllust(illust, { force = false } = {}) {
  const list = linesFor(V.lines, V.index, illust);
  if (!list.length || !V.sound || (!V.on && !force)) return false;
  stopVoice(); const my = ++V.seq;
  MU.musicDuck(true);
  for (const l of list) {
    if (my !== V.seq) return false;
    const a = new Audio(`assets/voice/${l.id}.${EXT}`); a.volume = V.vol; V.el = a; cap(l); V.log.push(l.id);
    await new Promise((res) => { a.onended = res; a.onerror = res; a.play().catch(res); });
    if (my !== V.seq) return false;
    await new Promise((r) => setTimeout(r, 350));
  }
  if (my === V.seq) { V.el = null; cap(null); MU.musicDuck(false); }
  return true;
}
export const voiceInfo = () => ({ ready: !!V.index, on: V.on, playing: !!V.el, cur: V.el ? V.el.src.split('/').pop() : '', log: V.log.slice(-8) });

// ── v0.9.5: 음성을 '그 대사가 뜰 때' 재생 (그림이 뜨자마자 몰아서 재생하던 버그) ──
const norm = (t) => String(t || '').replace(/[\s.,!?…~"'“”‘’()\[\]·\-]/g, '');
const grams = (t) => { const s = norm(t), g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
export function similarity(a, b) {
  const A = grams(a), B = grams(b); if (!A.size || !B.size) return 0;
  let n = 0; for (const x of A) if (B.has(x)) n++;
  return (2 * n) / (A.size + B.size);
}
/**
 * 순수 함수: 이벤트 단계(steps)·컷(shots [{art,i}])·음성 대사(lines) → { 단계 index: [대사…] }
 * 1) 대사 문장과 비슷한 단계에 붙임(쌍즈 대사는 say, 다른 사람은 narr 우선 · 순서 유지)
 * 2) 못 찾은 대사는 그 그림이 보이는 구간의 빈 단계에 하나씩(탭마다 한 줄)
 */
export function assignVoice(steps, shots, lines, illust, TH = 0.15, minStep = 0) {
  const out = {}, used = new Set();
  minStep = Math.max(0, minStep || 0);
  const okAt = (s) => s && (s.kind === 'say' || s.kind === 'narr');
  const ok = (s, i) => okAt(s) && (i == null || i >= minStep);   // CG가 보이기 전 대사엔 음성 없음
  const starts = [{ art: illust, i: minStep }, ...(shots || [])].sort((a, b) => a.i - b.i);
  const range = (art) => { const k = starts.findIndex((x) => x.art === art); if (k < 0) return null; return [starts[k].i, k + 1 < starts.length ? starts[k + 1].i : steps.length]; };
  const mine = (lines || []).filter((l) => range(l.illust)).sort((a, b) => a.id.localeCompare(b.id));
  const pairs = [];
  mine.forEach((l, li) => { if (l.at) { const i = steps.findIndex((st, j) => ok(st, j) && st.text.includes(l.at)); if (i >= 0) pairs.push([9, li, i]); } });   // 직접 지정(at)이 먼저
  mine.forEach((l, li) => steps.forEach((st, i) => {
    if (!ok(st, i)) return;
    let sc = similarity(l.ko, st.text);
    if ((l.speaker === '쌍즈') !== (st.kind === 'say')) sc *= 0.7;
    if (st.kind === 'narr' && l.speaker && st.text.includes(l.speaker)) sc += 0.15;
    if (sc > TH) pairs.push([sc, li, i]);
  }));
  pairs.sort((x, y) => y[0] - x[0]);
  const done = new Set();
  for (const [, li, i] of pairs) { if (done.has(li) || used.has(i)) continue; done.add(li); used.add(i); (out[i] ||= []).push(mine[li]); }
  const left = mine.filter((_, li) => !done.has(li));
  if (minStep > 0) { const k = left.findIndex((l) => l.illust === illust); if (k >= 0) out.reveal = [left.splice(k, 1)[0]]; }   // 선택 직후 CG가 뜨는 순간 한 줄
  for (const l of left) {
    const [a, b] = range(l.illust);
    let i = -1; for (let k = a; k < b; k++) if (ok(steps[k], k) && !used.has(k)) { i = k; break; }
    if (i < 0) { for (let k = b - 1; k >= a; k--) if (ok(steps[k], k)) { i = k; break; } }
    if (i < 0 && minStep > 0) { (out.reveal ||= []).push(l); continue; }
    if (i < 0) i = a;
    (out[i] ||= []).push(l); used.add(i);
  }
  for (const k of Object.keys(out)) out[k].sort((x, y) => x.id.localeCompare(y.id));
  return out;
}
/** 이벤트의 모든 그림(본 그림+컷) 음성 대사 */
export const linesForEvent = (illusts) => (V.lines || []).filter((l) => illusts.includes(l.illust) && V.index && V.index[l.id]);
/** 대사 몇 줄을 지금 재생(이전 음성은 멈춤) */
export async function playLines(list, { force = false } = {}) {
  stopVoice();
  if (!list || !list.length || !V.sound || (!V.on && !force)) return false;
  const my = ++V.seq; MU.musicDuck(true);
  for (const l of list) {
    if (my !== V.seq) return false;
    const a = new Audio(`assets/voice/${l.id}.${EXT}`); a.volume = V.vol; V.el = a; cap(l); V.log.push(l.id);
    await new Promise((res) => { a.onended = res; a.onerror = res; a.play().catch(res); });
    if (my !== V.seq) return false;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (my === V.seq) { V.el = null; cap(null); MU.musicDuck(false); }
  return true;
}
