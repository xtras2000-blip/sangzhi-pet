// Stage 9: 배경음악(OST 슬롯) — assets/music/ost/ 에 파일을 넣으면 data/music.json 배치표대로 자동 연결.
// Web Audio: 짧은 곡(자체 작곡 루프)은 버퍼로 끊김 없이 반복, 긴 곡(OST 3~4분)은 blob 스트리밍 + 곡 끝↔처음 1.2초 크로스페이드 루프
// (긴 곡을 통째로 디코딩하면 모바일 메모리 60MB+ → 스트리밍). 장소 바뀜 1초 크로스페이드, 이벤트는 페이드 아웃/인, 퀴즈는 덕킹.
// 파일이 없으면 다음 후보 → fallback(자체 작곡) → 무음. iOS 는 첫 터치(unlock) 뒤에 시작.
import { getCtx, onUnlock, isUnlocked, onVisibility, onSoundChange, soundOn, audioExt } from './audio.js';
import { pickTrack, slotChain, extOrder, bgmGain, loopRange, normVolumes } from './music_map.js';

const APPLE = audioExt === 'm4a';
const M = { map: null, index: null, ready: null, avail: {}, vol: { mute: false, bgm: 0.7 }, duck: 1, slot: '', want: '', cur: null, seq: 0, bus: null, hidden: false, resolver: null, log: [] };
const FADE = () => ({ place: 1000, eventOut: 700, eventIn: 1200, duck: 400, duckLevel: 0.35, loopXfade: 1200, ...((M.map && M.map.fade) || {}) });
const now = () => { const c = getCtx(); return c ? c.currentTime : 0; };
const note = (s) => { M.log.push(s); if (M.log.length > 20) M.log.shift(); };

async function json(url, opts) { try { const r = await fetch(url, opts); return r.ok ? await r.json() : null; } catch { return null; } }
/** 배치표 + (있으면) build_music.py 의 index.json */
export function initMusic() {
  M.ready ||= (async () => {
    M.map = await json('data/music.json');
    if (M.map) M.index = await json(`${M.map.dir}index.json`, { cache: 'no-cache' });
    onUnlock(() => { if (M.want) { const w = M.want; M.slot = ''; playSlot(w); } });
    onVisibility((hidden) => { M.hidden = hidden; if (M.cur) hidden ? M.cur.pause() : M.cur.resume(); });
    onSoundChange((on) => { setMusicVolume({ mute: !on }); if (on) refresh(); });
  })();
  return M.ready;
}
/** 지금 화면에 맞는 슬롯을 돌려주는 함수(main.js) — 음소거 해제·unlock 뒤 다시 고를 때 씀 */
export function setMusicResolver(fn) { M.resolver = fn; }
export function refresh() { if (!M.resolver) return; M.slot = ''; playSlot(M.resolver()); }

// ── 파일 찾기 ──
const MUSIC_CACHE = 'sz-music';
async function probe(url) {
  try { if (typeof caches !== 'undefined') { const hit = await caches.match(url, { ignoreSearch: true }); if (hit) return true; } } catch {}
  try { const r = await fetch(url, { method: 'HEAD', cache: 'no-cache' }); return r.ok; } catch { return false; }
}
/** 곡 id → 실제 URL(있으면) */
function locate(id) {
  if (id in M.avail) return M.avail[id];
  const t = M.map.tracks[id]; if (!t) return (M.avail[id] = Promise.resolve(null));
  const dir = t.dir || M.map.dir;
  M.avail[id] = (async () => {
    if (t.dir && t.dir !== M.map.dir) return `${dir}${t.file}.${audioExt}`;          // 게임에 같이 들어 있는 자체 작곡 곡
    const ent = M.index && M.index.files && M.index.files[t.file];
    if (M.index) { if (!ent) return null; const ext = extOrder(APPLE).find((e) => (ent.exts || []).includes(e)); return ext ? `${dir}${t.file}.${ext}${ent.v ? `?v=${ent.v}` : ''}` : null; }
    for (const ext of extOrder(APPLE)) { const u = `${dir}${t.file}.${ext}`; if (await probe(u)) return u; }
    return null;
  })();
  return M.avail[id];
}
async function resolveSlot(slot) {
  const ids = []; for (const s of slotChain(slot)) { const l = M.map.slots[s]; if (Array.isArray(l)) ids.push(...l); else if (l === 'duck') break; }
  const found = {}; for (const id of ids) { const u = await locate(id); found[id] = u; if (u) break; }   // 앞에서부터: 찾으면 멈춤(요청 최소)
  const t = pickTrack(M.map, slot, (id) => !!found[id]);
  return t && t !== 'duck' ? { ...t, url: found[t.id], entry: (M.index && M.index.files || {})[t.base] || null } : t;
}

// ── 버스(BGM 볼륨·덕킹) ──
function bus() {
  const c = getCtx(); if (!c) return null;
  if (!M.bus) { M.bus = c.createGain(); M.bus.gain.value = busLevel(); M.bus.connect(c.destination); }
  return M.bus;
}
const busLevel = () => bgmGain({ mute: M.vol.mute, bgm: M.vol.bgm, duck: M.duck }, 'inst', {});
function ramp(param, to, ms) {
  const c = getCtx(); if (!c || !param) return; const t = c.currentTime;
  try { param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); param.linearRampToValueAtTime(to, t + Math.max(0.01, ms / 1000)); } catch { param.value = to; }
}
export function setMusicVolume(v = {}) {
  if ('bgm' in v) M.vol.bgm = Math.max(0, Math.min(1, +v.bgm || 0));
  if ('mute' in v) M.vol.mute = !!v.mute;
  if (M.bus) ramp(M.bus.gain, busLevel(), 150);
  if (M.cur && M.cur.html) M.cur.applyHtmlVolume();
  if (M.vol.mute && M.cur) { stopCur(300); M.slot = ''; }
}
export function applySettings(settings) { const n = normVolumes(settings); setMusicVolume({ bgm: n.bgm, mute: !n.sound }); }
export function musicDuck(on) {
  const d = on ? FADE().duckLevel : 1; if (M.duck === d) return; M.duck = d;
  if (M.bus) ramp(M.bus.gain, busLevel(), FADE().duck); if (M.cur && M.cur.html) M.cur.applyHtmlVolume();
}

// ── 재생기 ──
const kindGain = (t) => (M.map.gain || {})[t.kind] ?? 1;
/** 짧은 루프: 디코딩 버퍼 → 끊김 없는 반복 (처음부터 재생, 이후 loopStart~loopEnd 구간 반복) */
const BUFS = {};
async function bufferPlayer(t) {
  const c = getCtx();
  BUFS[t.url] ||= fetch(t.url).then((r) => r.arrayBuffer()).then((a) => new Promise((ok, no) => c.decodeAudioData(a, ok, no))).catch(() => { delete BUFS[t.url]; return null; });
  const b = await BUFS[t.url]; if (!b) return null;
  const out = c.createGain(); out.gain.value = 0; out.connect(bus());
  let src = null, startedAt = 0;
  const lr = loopRange(t.entry, b.duration);
  const go = (from = 0) => { src = c.createBufferSource(); src.buffer = b; src.loop = true; src.loopStart = lr.start; src.loopEnd = lr.end; src.connect(out); src.start(0, from); startedAt = c.currentTime - from; };
  return { t, mode: 'buffer', out,
    start(ms) { go(0); ramp(out.gain, kindGain(t), ms); },
    fade(to, ms) { ramp(out.gain, to * kindGain(t), ms); },
    stop(ms) { ramp(out.gain, 0, ms); const s = src; setTimeout(() => { try { s && s.stop(); } catch {} try { out.disconnect(); } catch {} }, ms + 60); },
    pause() {}, resume() {},   // AudioContext suspend/resume 가 처리
    pos() { if (!src) return 0; const e = c.currentTime - startedAt; return e < lr.end ? e : lr.start + ((e - lr.start) % Math.max(0.01, lr.end - lr.start)); } };
}
/** 긴 곡: blob URL 스트리밍(서비스워커 캐시에 통째로 저장됨 → 오프라인 OK) + 두 개의 audio 로 끝↔처음 크로스페이드 */
async function streamPlayer(t) {
  const c = getCtx();
  let blobUrl;
  try { const r = await fetch(t.url); if (!r.ok) return null; blobUrl = URL.createObjectURL(await r.blob()); } catch { return null; }
  const mk = () => { const a = new Audio(); a.preload = 'auto'; a.src = blobUrl; a.setAttribute('playsinline', ''); return a; };
  const els = [mk(), mk()];
  const html = !c;   // Web Audio 없음: audio.volume 로만(iOS 는 볼륨 무시)
  const out = c ? c.createGain() : null, g = c ? els.map((a) => { const n = c.createGain(); n.gain.value = 0; c.createMediaElementSource(a).connect(n); n.connect(out); return n; }) : [];
  if (out) { out.gain.value = 0; out.connect(bus()); }
  await new Promise((ok) => { const a = els[0]; if (a.readyState >= 1) return ok(); a.addEventListener('loadedmetadata', ok, { once: true }); a.addEventListener('error', ok, { once: true }); setTimeout(ok, 4000); });
  const dur = isFinite(els[0].duration) ? els[0].duration : 0;
  const lr = loopRange(t.entry, dur), XF = ((t.kind === 'vocal' && FADE().loopXfadeVocal) || FADE().loopXfade) / 1000;   // 보컬 곡을 장소 BGM으로 돌릴 땐 끝↔처음을 더 길게 겹침
  let act = 0, timer = 0, level = 0, paused = false, dead = false;
  const play = (a) => { const p = a.play(); if (p && p.catch) p.catch(() => {}); };
  const tick = () => {
    if (dead || paused || !lr.end) return;
    const a = els[act];
    if (a.currentTime >= lr.end - XF) {   // 루프: 다른 audio 를 loopStart 에서 시작하며 크로스페이드
      const nx = act ^ 1, b = els[nx];
      try { b.currentTime = lr.start; } catch {}
      play(b);
      if (g.length) { ramp(g[act].gain, 0, XF * 1000); ramp(g[nx].gain, 1, XF * 1000); }
      else { b.volume = a.volume; }
      const old = a; setTimeout(() => { if (els[act] !== old) { old.pause(); } }, XF * 1000 + 80);
      act = nx;
    }
  };
  const P = { t, mode: 'stream', html, out,
    applyHtmlVolume() { if (html) els.forEach((a) => { a.volume = Math.max(0, Math.min(1, level * busLevel())); }); },
    start(ms) { els[0].currentTime = 0; if (g.length) g[0].gain.value = 1; play(els[0]); this.fade(1, ms); timer = setInterval(tick, 200); if (html) { els[0].loop = !lr.end; } },
    fade(to, ms) { level = to * kindGain(t); if (out) ramp(out.gain, level, ms); else this.applyHtmlVolume(); },
    stop(ms) { this.fade(0, ms); clearInterval(timer); setTimeout(() => { dead = true; els.forEach((a) => { try { a.pause(); a.removeAttribute('src'); a.load(); } catch {} }); try { out && out.disconnect(); } catch {} URL.revokeObjectURL(blobUrl); }, ms + 80); },
    pause() { paused = true; els.forEach((a) => a.pause()); },
    resume() { if (dead) return; paused = false; play(els[act]); },
    pos() { return els[act].currentTime; } };
  return P;
}
async function makePlayer(t) {
  const short = t.short || (t.entry && t.entry.dur && t.entry.dur <= 75);
  if (short && getCtx()) return bufferPlayer(t);
  return streamPlayer(t);
}
function stopCur(ms) { if (M.cur) { const p = M.cur; M.cur = null; p.stop(ms); } }

/**
 * 슬롯 틀기(같은 슬롯이면 아무것도 안 함). opts.out/opts.in: 페이드(ms)
 */
export async function playSlot(slot, opts = {}) {
  if (!slot) return;
  M.want = slot;
  if (slot === M.slot) return;
  await initMusic(); if (!M.map) return;
  if (M.vol.mute || !soundOn()) { M.slot = ''; return; }
  if (!isUnlocked()) return;   // unlock 되면 M.want 로 다시
  const prev = M.slot; M.slot = slot; const my = ++M.seq;
  const F = FADE();
  const toEvent = slot.startsWith('event:') || slot.startsWith('ending:'), fromEvent = prev.startsWith('event:') || prev.startsWith('ending:');
  const fout = opts.out ?? (toEvent ? F.eventOut : F.place), fin = opts.in ?? (toEvent || fromEvent ? F.eventIn : F.place);
  const t = await resolveSlot(slot); if (my !== M.seq) return;
  if (t === 'duck') { musicDuck(true); return; }
  musicDuck(false);
  if (!t) { note(`${slot}: 곡 없음 → 무음`); stopCur(fout); return; }
  if (M.cur && M.cur.t.id === t.id) return;   // 같은 곡(예: 낮→밤 같은 곡)은 이어서
  bus();
  const p = await makePlayer(t); if (!p) { note(`${slot}: ${t.base} 재생 실패 → 이전 곡 페이드 아웃`); if (my === M.seq) stopCur(fout); return; }   // 실패해도 타이틀 곡이 남지 않게
  if (my !== M.seq) { p.stop(0); return; }
  stopCur(fout);
  p.start(fin); M.cur = p; note(`${slot}: ${t.base} (${p.mode})`);
  if (M.hidden) p.pause();
}
/** 엔딩 등에서 페이드 아웃 후 정지 */
export function stopMusic(ms = 1500) { M.seq++; M.slot = ''; stopCur(ms); }
export const musicInfo = () => ({ slot: M.slot, want: M.want, track: M.cur ? M.cur.t.base : '', title: M.cur ? M.cur.t.title : '', mode: M.cur ? M.cur.mode : '', duck: M.duck, vol: { ...M.vol }, index: !!M.index, pos: M.cur && M.cur.pos ? +M.cur.pos().toFixed(2) : 0, log: M.log.slice(-6) });
