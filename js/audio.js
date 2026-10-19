// Stage 6: 소리 — assets/audio (compose.py 자체 작곡, CC0). 설정 '소리' 켜졌을 때만.
// Stage 9: BGM 은 js/music.js(OST 슬롯·크로스페이드). 여기 playBgm 계열은 예전 호환용(지금은 안 씀)
// 모바일: iOS/Safari 는 M4A(AAC), 그 외 OGG. 효과음은 Web Audio(첫 터치에서 unlock → iOS 무음 문제·지연 없음), 실패 시 <audio>.
const IOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const SAFARI = typeof navigator !== 'undefined' && /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
const EXT = (() => { if (IOS || SAFARI) return 'm4a'; try { const a = new Audio(); return a.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a'; } catch { return 'm4a'; } })();
const url = (n) => `assets/audio/${n}.${EXT}`;
let enabled = false, bgm = null, bgmName = '', ctx = null, unlocked = false, sfxVol = 0.8, sfxBus = null;
const UNLOCK_CB = [];
const pool = {}, BUF = {}, FETCH = {};
const COMMON = ['sfx_tap', 'sfx_eat', 'sfx_heart', 'sfx_heartbeat', 'sfx_sparkle', 'sfx_nope', 'sfx_cancel'];
function ac() {
  if (ctx) return ctx;
  const C = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext); if (!C) return null;
  try { ctx = new C(); } catch { ctx = null; } return ctx;
}
/** 효과음 버스(설정 '효과음' 볼륨). music.js 는 같은 AudioContext 에 BGM 버스를 따로 둠 */
function bus() {
  const c = ac(); if (!c) return null;
  if (!sfxBus) { sfxBus = c.createGain(); sfxBus.gain.value = sfxVol; sfxBus.connect(c.destination); }
  return sfxBus;
}
export const getCtx = () => ac();
export const isUnlocked = () => unlocked;
/** unlock(첫 터치) 뒤에 실행. 이미 unlock 됐으면 바로 */
export function onUnlock(fn) { if (unlocked) { try { fn(); } catch {} } else UNLOCK_CB.push(fn); }
export function setSfxVolume(v) { sfxVol = Math.max(0, Math.min(1, +v || 0)); if (sfxBus) sfxBus.gain.value = sfxVol; }
export const sfxVolume = () => sfxVol;
function buf(name) {
  if (BUF[name]) return BUF[name];
  const c = ac(); if (!c) return null;
  FETCH[name] ||= fetch(url(name)).then((r) => r.arrayBuffer()).then((a) => new Promise((ok, no) => c.decodeAudioData(a, ok, no)))
    .then((b) => (BUF[name] = b)).catch(() => null);
  return null;
}
/** 첫 터치(사용자 제스처) 안에서 호출: AudioContext resume + 무음 1샘플 재생 → iOS unlock */
export function unlockAudio() {
  if (unlocked) return; const c = ac(); if (!c) return;
  try {
    if (c.state === 'suspended') c.resume();
    const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0);
    unlocked = true; COMMON.forEach(buf);
    UNLOCK_CB.splice(0).forEach((fn) => { try { fn(); } catch {} });
  } catch {}
}
const VIS_CB = [];
/** 화면을 떠나거나 돌아올 때(music.js 가 스트리밍 곡을 멈추고 이어 틂) */
export const onVisibility = (fn) => VIS_CB.push(fn);
export function suspendAudio(hidden) { try { if (ctx) hidden ? ctx.suspend() : (unlocked && ctx.resume()); } catch {} if (hidden) pauseBgm(); VIS_CB.forEach((fn) => { try { fn(hidden); } catch {} }); }
const SOUND_CB = [];
export const onSoundChange = (fn) => SOUND_CB.push(fn);
export function setSound(on) { enabled = !!on; if (!enabled) stopBgm(); SOUND_CB.forEach((fn) => { try { fn(enabled); } catch {} }); }
export const soundOn = () => enabled;
function htmlSfx(name, vol) {
  const list = (pool[name] ||= []);
  let a = list.find((x) => x.paused || x.ended);
  if (!a) { if (list.length >= 4) a = list[0]; else { a = new Audio(url(name)); a.preload = 'auto'; list.push(a); } }
  a.volume = Math.max(0, Math.min(1, vol * sfxVol)); a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => {});
}
export function sfx(name, vol = 0.7) {
  if (!enabled || sfxVol <= 0) return;
  try {
    if (unlocked && ctx && ctx.state === 'running') {
      const b = buf(name);
      if (b) { const g = ctx.createGain(); g.gain.value = vol; const s = ctx.createBufferSource(); s.buffer = b; s.connect(g); g.connect(bus() || ctx.destination); s.start(0); return; }
    }
    htmlSfx(name, vol);
  } catch {}
}
export function playBgm(name, vol = 0.45) {
  if (!enabled) return;
  try {
    if (bgm && bgmName === name) { if (bgm.paused) bgm.play().catch(() => {}); return; }
    stopBgm(); bgm = new Audio(url(name)); bgm.loop = true; bgm.volume = vol; bgmName = name; bgm.setAttribute('playsinline', '');
    const p = bgm.play(); if (p && p.catch) p.catch(() => {});
  } catch {}
}
export function pauseBgm() { try { bgm && bgm.pause(); } catch {} }
export function stopBgm() { try { if (bgm) { bgm.pause(); bgm.src = ''; } } catch {} bgm = null; bgmName = ''; }
export const bgmPlaying = () => !!(bgm && !bgm.paused);
export const audioExt = EXT;
export const audioInfo = () => ({ ext: EXT, webaudio: !!ctx, state: ctx ? ctx.state : 'none', unlocked, decoded: Object.keys(BUF).length });
// 엔딩: BGM 페이드 인/아웃 (HTMLAudio volume 단계 조절. iOS Safari는 volume을 무시해서 바로 켜지고 꺼짐)
let fadeT = 0;
export function fadeBgm(to, ms = 1500, done) {
  clearInterval(fadeT);
  if (!bgm) { done && done(); return; }
  const a = bgm, from = a.volume, t0 = Date.now();
  fadeT = setInterval(() => {
    const k = Math.min(1, (Date.now() - t0) / ms);
    try { a.volume = Math.max(0, Math.min(1, from + (to - from) * k)); } catch {}
    if (k >= 1) { clearInterval(fadeT); done && done(); }
  }, 50);
}
/** 새 BGM을 볼륨 0에서 시작해 vol까지 키움 */
export function playBgmFade(name, vol = 0.45, ms = 1800) {
  if (!enabled) return;
  playBgm(name, 0); fadeBgm(vol, ms);
}
/** 페이드 아웃 후 정지 */
export function stopBgmFade(ms = 1500) { fadeBgm(0, ms, () => stopBgm()); }
