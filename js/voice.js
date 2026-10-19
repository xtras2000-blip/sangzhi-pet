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
