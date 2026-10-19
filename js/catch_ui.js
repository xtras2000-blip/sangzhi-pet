// Stage 6: 디저트 받기 화면(타이틀 → 카운트다운 → 플레이 → 결과). 로직은 minigame.js
import * as MG from './minigame.js';
import { stageScale } from './config.js';
import { animInfo, cellOf, scaleRefOf, drawSheetFrame, drawRoomImg, hasRoomImg, ensureRoom, snapDev, blitSharp } from './sprite.js';
import { PLACES } from './config.js';
import { stageOf, timeOfDay } from './state.js';
import * as AU from './audio.js';
import * as MU from './music.js';

const $ = (id) => document.getElementById(id);
let ICONS = { cell: 64, icons: {} }, ICON_IMG = null;
export async function loadCatchIcons() {
  try {
    ICONS = await (await fetch('assets/icons/catch.json')).json();
    await new Promise((ok) => { const im = new Image(); im.onload = () => { ICON_IMG = im; ok(); }; im.onerror = ok; im.src = `assets/icons/${ICONS.image}`; });
  } catch {}
}
const G = { S: null, hooks: null, mode: null, round: null, raf: 0, last: 0, anim: { name: 'idle', start: 0, until: 0, then: null }, fx: [], bubbleT: 0, cd: 0, held: 0, res: null, rw: null, off: null, stage: 'mid', lastDairyLine: 0 };
const dpr = () => window.devicePixelRatio || 1;

// ── 아이콘(HTML) : 기기 픽셀 정수 배율 ──
function iconPx() { const d = dpr(), k = Math.max(1, Math.round(44 * d / 64)); return (64 * k) / d; }
/** Stage 7: 캔버스에 그릴 아이콘 소스 */
export function catchIconSrc(id) { const p = ICONS.icons[id]; const c = ICONS.cell; return p && ICON_IMG ? { img: ICON_IMG, sx: p[0] * c, sy: p[1] * c, sw: c, sh: c } : null; }
export function iconHtml(id, extra = '') {
  const p = ICONS.icons[id] || [0, 0], s = iconPx(), sc = s / 64;
  return `<span class="cicon ${extra}" style="width:${s}px;height:${s}px;background-size:${(ICON_IMG ? ICON_IMG.width : 512) * sc}px auto;background-position:-${p[0] * s}px -${p[1] * s}px"></span>`;
}

// ── 쌍즈 그리기 ──
function setAnim(name, ms = 1200, then = null) { G.anim = { name, start: performance.now(), until: performance.now() + ms, then }; }
function curAnim(now) {
  const a = G.anim;
  if (a.until && now > a.until) { if (a.then) setAnim(a.then, 2500); else G.anim = { name: 'idle', start: now, until: 0, then: null }; }
  return G.anim;
}
function charMetrics(fieldH) {
  // 기기와 상관없이 필드 높이 대비 같은 크기(소수 배율). 기기 픽셀 배율이 정수에 가까우면 정수, 아니면 sharp-bilinear
  const st = G.stage, ref = scaleRefOf(st), cell = cellOf(st), d = dpr();
  const ss = stageScale(st), sH = fieldH * 0.27 / ref;   // 고교 기준
  const dev = snapDev(sH * ss * d), T = Math.max(16, Math.round(cell * dev));       // 중학생: 고교 × ss
  const s = T / (cell * d);
  return { s, T, size: cell * s, cell };
}
function drawChar(ctx, cx, footY, now) {
  const st = G.stage, a0 = curAnim(now), a = animInfo(st, a0.name) || animInfo(st, 'idle');
  if (!a) return;
  let f = Math.floor((now - a0.start) * a.fps / 1000); f = a.loop ? f % a.frames : Math.min(f, a.frames - 1);
  const C = cellOf(st);
  if (!G.off || G.off.width !== C) { G.off = document.createElement('canvas'); G.off.width = G.off.height = C; }
  const off = drawSheetFrame(G.off, st, a.name, f);
  const m = G.cm, d = dpr();
  const size = m.T, x = Math.round(cx * d - size / 2), y = Math.round(footY * d - size * 0.985 + off * m.s * d);
  // 그림자
  ctx.fillStyle = 'rgba(59,42,58,.22)'; ctx.beginPath(); ctx.ellipse(Math.round(cx * d), Math.round(footY * d) - 2 * d, size * 0.2, 5 * d, 0, 0, 6.283); ctx.fill();
  blitSharp(ctx, G.off, 0, 0, C, C, x, y, size, size);
  return { top: y / d + m.size * 0.08 };
}
function drawIcon(ctx, id, x, y, scaleK, rot = 0) {
  if (!ICON_IMG) return;
  const p = ICONS.icons[id] || [0, 0], c = ICONS.cell, d = dpr(), sz = c * scaleK;
  ctx.drawImage(ICON_IMG, p[0] * c, p[1] * c, c, c, Math.round(x * d - sz / 2), Math.round(y * d - sz / 2), sz, sz);
}
// 픽셀 반짝이(4방향 별)
function sparkle(ctx, x, y, u, col) {
  const d = dpr(), X = Math.round(x * d), Y = Math.round(y * d), q = Math.max(1, Math.round(u * d));
  ctx.fillStyle = col; ctx.fillRect(X - q, Y - 3 * q, 2 * q, 6 * q); ctx.fillRect(X - 3 * q, Y - q, 6 * q, 2 * q);
  ctx.fillStyle = '#fff'; ctx.fillRect(X - q, Y - q, 2 * q, 2 * q);
}

// ── 레이아웃 ──
function layout() {
  const cv = $('mgCv'), box = $('mg').getBoundingClientRect(), d = dpr();
  const W = Math.round(box.width), H = Math.round(box.height);
  if (cv.width !== Math.round(W * d) || cv.height !== Math.round(H * d)) { cv.width = Math.round(W * d); cv.height = Math.round(H * d); }
  const ctrlH = $('mgCtrl').offsetHeight || 76;
  G.W = W; G.H = H; G.fieldH = H - ctrlH; G.cm = charMetrics(G.H);
  // 배경
  const pl = MG.cfgFor(G.stage).place, place = hasRoomImg(pl) ? pl : (G.hooks.place() || pl);
  if (hasRoomImg(place) && !drawRoomImg($('mgBg'), { tod: timeOfDay().id, place, aspect: W / H })) ensureRoom(place).then(() => drawRoomImg($('mgBg'), { tod: timeOfDay().id, place, aspect: W / H }));   // 배경 지연 로드
  G.place = place;
}

// ── 화면 전환 ──
function show(panel) { for (const id of ['mgTitle', 'mgPause', 'mgResult']) $(id).hidden = id !== panel; document.getElementById('mg').dataset.mode = G.mode; }
function bubble(text, ms = 0) {
  const b = $('mgBubble'); G.bubbleKind = ''; b.textContent = text; b.hidden = !text; clearTimeout(G.bubbleT);
  if (ms) G.bubbleT = setTimeout(() => (b.hidden = true), ms);
}
function placeBubble(headY) { const b = $('mgBubble'); if (!b.hidden) b.style.top = Math.max(56, headY - b.offsetHeight - 10) + 'px'; }

export function openCatch(S, hooks) {
  if (G.mode) return;
  G.S = S; G.hooks = hooks; G.stage = stageOf(S).id; MG.ensureMg(S);
  $('mg').hidden = false; document.body.classList.add('in-mg');
  AU.setSound(S.settings.sound);
  title();
  cancelAnimationFrame(G.raf); G.last = performance.now(); G.raf = requestAnimationFrame(loop);
}
function title() {
  G.mode = 'title'; G.round = null; G.fx = [];
  layout();
  const S = G.S, cfg = MG.cfgFor(G.stage), n = MG.playsToday(S), best = S.minigame.best[G.stage] || 0;
  const goods = MG.poolFor(G.stage).filter((id) => MG.ITEMS[id].good && MG.ITEMS[id].rarity === '일반');
  const rares = MG.poolFor(G.stage).filter((id) => MG.ITEMS[id].rarity && MG.ITEMS[id].rarity !== '일반');
  const dairy = MG.poolFor(G.stage).filter((id) => MG.ITEMS[id].dairy);
  const left = Math.max(0, MG.FULL_PLAYS - n);
  $('mgTitleBody').innerHTML = `
    <h3>🍓 디저트 받기 <small>${cfg.title}</small></h3>
    <div class="mg-row"><b>받기</b><span class="ics">${goods.map((id) => iconHtml(id)).join('')}</span></div>
    <div class="mg-row rare"><b>보너스</b><span class="ics">${rares.map((id) => iconHtml(id, MG.ITEMS[id].rarity === '전설' ? 'legend' : 'rare')).join('')}</span></div>
    <div class="mg-row no"><b>피하기</b><span class="ics">${dairy.map((id) => iconHtml(id, 'dairy')).join('')}</span></div>
    <p class="mg-note">🥛 우유 들어간 건 피해요(알레르기). 받아도 점수는 안 깎이고 콤보만 끊겨요.<br>✨희귀 = 💗기분 보너스 · 🌟전설 = 💓설렘 보너스 · 화면을 끌거나 ◀ ▶</p>
    <p class="mg-meta">🏆 최고 ${best}점 · 오늘 ${n}판 · ${left ? `보상 100% ${left}판 남음` : `오늘은 보상이 조금씩 줄어요`}</p>`;
  $('mgSound').textContent = S.settings.sound ? '🔊' : '🔇';
  show('mgTitle');
  if (!MG.canStart(S)) { $('mgStart').disabled = true; setAnim('E21', 99999); bubble(MG.LINES.sleepy); return; }
  $('mgStart').disabled = false;
  const L = MG.startLine(G.stage); setAnim(L.e, 99999); bubble(L.t);
  MU.playSlot('minigame');
}
function start() {
  if (!MG.canStart(G.S)) return;
  AU.sfx('sfx_tap'); MU.playSlot('minigame');
  layout();
  G.round = MG.newRound(G.stage, { W: G.W, H: G.fieldH, r: iconPx() / 2, charH: G.cm.size * 0.9, halfW: G.cm.size * 0.24 });
  G.round.x = G.round.target = G.W / 2;
  G.mode = 'count'; G.cd = 3.2; G.fx = []; show(null); bubble('');
  setAnim('E01', 99999); hud();
}
function pause() { if (G.mode !== 'play' && G.mode !== 'count') return; G.prevMode = G.mode; G.mode = 'pause'; show('mgPause'); MU.musicDuck(true); }
function resume() { G.mode = G.prevMode || 'play'; show(null); G.last = performance.now(); MU.musicDuck(false); MU.playSlot('minigame'); }
function finish() {
  const res = MG.summary(G.round), rw = MG.applyResult(G.S, res);
  G.res = res; G.rw = rw; G.mode = 'result'; G.round = null; G.hooks.save();
  const L = MG.endLine(G.stage, rw); setAnim(L.e, L.then ? 900 : 99999, L.then || null); if (L.then) G.anim.then = L.then;
  bubble(L.t);
  AU.sfx(rw.newBest ? 'sfx_levelup' : 'sfx_gift_open');
  const tierTxt = { great: '대박! 🌟', good: '좋아! ✨', ok: '수고했어 🍀' }[rw.tier];
  const caught = Object.entries(res.caught).sort((a, b) => b[1] - a[1]).map(([id, c]) => `<span class="cc">${iconHtml(id, MG.ITEMS[id].rarity === '전설' ? 'legend' : MG.ITEMS[id].rarity === '희귀' ? 'rare' : '')}<i>×${c}</i></span>`).join('') || '<span class="muted">이번엔 못 받았어…</span>';
  const gain = [`💗 기분 +${rw.mood}`, rw.crush ? `💓 설렘 +${rw.crush}` : '', `🌙 체력 ${rw.energy}`].filter(Boolean).join(' · ');
  $('mgResultBody').innerHTML = `
    <h3>${tierTxt}</h3>
    <div class="mg-score"><b>${res.score}</b>점 ${rw.newBest ? '<span class="nb">🏆 최고 기록!</span>' : `<small>최고 ${rw.best}</small>`}</div>
    <div class="mg-caught">${caught}</div>
    <p class="mg-meta">최대 콤보 ${res.maxCombo} · 🥛 피한 우유 ${res.dodged || 0} · 받은 우유 ${res.dairy}</p>
    <p class="mg-gain">${gain}</p>
    ${rw.factor < 1 ? `<p class="mg-note">오늘 ${rw.playsToday}번째 판이라 보상 ${Math.round(rw.factor * 100)}% (벌점 없음 · 내일 다시 100%)</p>` : ''}`;
  show('mgResult');
}
export function closeCatch(reason = 'exit') {
  if (!G.mode) return;
  const rw = G.mode === 'result' ? G.rw : null;
  G.mode = null; cancelAnimationFrame(G.raf); AU.stopBgm(); bubble('');
  $('mg').hidden = true; document.body.classList.remove('in-mg');
  G.hooks.onExit && G.hooks.onExit(rw, reason);
}
function hud() {
  const r = G.round; if (!r) return;
  $('mgScore').textContent = r.score; $('mgCombo').textContent = r.combo >= 2 ? `${r.combo} 콤보!` : '';
  $('mgTime').style.width = (MG.timeLeft(r) / r.dur * 100).toFixed(1) + '%';
  $('mgSec').textContent = Math.ceil(MG.timeLeft(r));
}

// ── 루프 ──
function loop(now) {
  if (!G.mode) return;
  const dt = Math.min(0.1, (now - G.last) / 1000); G.last = now;
  const r = G.round;
  if (G.mode === 'count') { G.cd -= dt; const n = Math.ceil(G.cd - 0.2); const lbl = n > 0 ? String(n) : '시작!'; if ($('mgCount').textContent !== lbl) { $('mgCount').textContent = lbl; AU.sfx('sfx_tap', 0.5); } if (G.cd <= 0) { G.mode = 'play'; $('mgCount').textContent = ''; } }
  if (G.mode === 'play' && r) {
    if (G.held) r.target = r.x + G.held * G.W;
    for (const e of MG.step(r, dt)) onEvent(e);
    if (r.done) { finish(); }
    else hud();
  }
  if (G.mode !== 'count') $('mgCount').textContent = '';
  draw(now);
  G.raf = requestAnimationFrame(loop);
}
function onEvent(e) {
  const r = G.round;
  if (e.type === 'catch') {
    G.fx.push({ kind: 'txt', text: `+${e.pts}`, x: e.x, y: e.y, t: 0, col: e.rarity === '전설' ? '#C98A1E' : e.rarity === '희귀' ? '#B07CFF' : '#E0446E' });
    for (let i = 0; i < (e.rarity === '일반' ? 3 : 7); i++) G.fx.push({ kind: 'sp', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 160, vy: -60 - Math.random() * 120, t: 0, col: e.rarity === '전설' ? '#FFD45A' : e.rarity === '희귀' ? '#C9A8FF' : '#FF9AB8' });
    if (e.rarity === '전설') { AU.sfx('sfx_heart'); setAnim('hop', 600, 'E19'); G.anim.then = 'E19'; bubble(MG.pick(MG.LINES.legend), 1600); G.bubbleKind = 'legend'; }
    else if (e.rarity === '희귀') { AU.sfx('sfx_sparkle'); setAnim('E01', 900); }
    else { AU.sfx('sfx_eat', 0.45); if (G.anim.name === 'idle' || G.anim.name === 'E01') setAnim('E01', 600); }
  } else if (e.type === 'dairy') {
    AU.sfx('sfx_nope', 0.6); setAnim('E13', 900);
    G.fx.push({ kind: 'txt', text: '우유!', x: e.x, y: e.y, t: 0, col: '#5A7BC8' });
    if (G.bubbleKind === 'legend' || performance.now() - G.lastDairyLine > 3500) { G.lastDairyLine = performance.now(); bubble(MG.pick(MG.LINES.dairy), 1300); G.bubbleKind = 'dairy'; }
  }
}
function draw(now) {
  const cv = $('mgCv'), ctx = cv.getContext('2d'), d = dpr();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.imageSmoothingEnabled = false;
  const r = G.round, k = Math.max(1, Math.round(44 * d / 64));
  let cx = G.W / 2, foot;
  if (r) { cx = r.x; foot = G.fieldH - 4; }
  else { const p = document.querySelector('#mg .mg-panel:not([hidden])'); foot = p ? p.getBoundingClientRect().top - $('mg').getBoundingClientRect().top - 6 : G.fieldH - 4; }
  // 바닥 띠
  if (r) { ctx.fillStyle = 'rgba(255,246,250,.55)'; ctx.fillRect(0, Math.round((G.fieldH - 10) * d), cv.width, Math.round(10 * d)); }
  const c = drawChar(ctx, cx, foot, now);
  if (c) placeBubble(c.top);
  if (r) {
    for (const it of r.items) {
      const info = MG.ITEMS[it.id], bob = Math.sin(it.spin) * 1.5;
      if (info.rarity === '전설') { ctx.fillStyle = 'rgba(255,214,90,.35)'; ctx.beginPath(); ctx.arc(Math.round(it.x * d), Math.round((it.y + bob) * d), (22 + Math.sin(now / 120) * 3) * d, 0, 6.283); ctx.fill(); }
      drawIcon(ctx, it.id, it.x, it.y + bob, k);
      if (info.rarity === '희귀' || info.rarity === '전설') sparkle(ctx, it.x + 16, it.y - 16 + bob, 1.4, info.rarity === '전설' ? '#FFC93C' : '#C9A8FF');
      if (info.dairy) { // 빨간 ✕ 배지 (유제품 표시)
        const q = Math.max(2, Math.round(1.5 * d)), X = Math.round((it.x + 14) * d), Y = Math.round((it.y - 16) * d);
        ctx.fillStyle = '#3B2A3A'; ctx.fillRect(X - 4 * q, Y - 4 * q, 8 * q, 8 * q); ctx.fillStyle = '#fff'; ctx.fillRect(X - 3 * q, Y - 3 * q, 6 * q, 6 * q);
        ctx.fillStyle = '#E0445E'; for (let i = 0; i < 4; i++) { ctx.fillRect(X + (i - 2) * q, Y + (i - 2) * q, q, q); ctx.fillRect(X + (1 - i) * q, Y + (i - 2) * q, q, q); }
      }
    }
  }
  for (let i = G.fx.length - 1; i >= 0; i--) {
    const f = G.fx[i]; f.t += 1 / 60;
    if (f.kind === 'txt') {
      if (f.t > 0.8) { G.fx.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, 1.6 - f.t * 2); ctx.font = `700 ${Math.round(16 * d)}px Galmuri11, sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 3 * d; ctx.strokeStyle = '#fff'; const y = Math.round((f.y - 20 - f.t * 40) * d);
      ctx.strokeText(f.text, Math.round(f.x * d), y); ctx.fillStyle = f.col; ctx.fillText(f.text, Math.round(f.x * d), y); ctx.globalAlpha = 1;
    } else {
      if (f.t > 0.6) { G.fx.splice(i, 1); continue; }
      f.x += f.vx / 60; f.y += f.vy / 60; f.vy += 300 / 60; sparkle(ctx, f.x, f.y, 1, f.col);
    }
  }
}

// ── 입력 ──
let bound = false;
export function bindCatch() {
  if (bound) return; bound = true;
  const cv = $('mgCv');
  const setX = (e) => { if (G.mode !== 'play' && G.mode !== 'count') return; const b = cv.getBoundingClientRect(); G.round.target = e.clientX - b.left; };
  cv.addEventListener('pointerdown', (e) => { if (!G.round) return; cv.setPointerCapture?.(e.pointerId); setX(e); });
  cv.addEventListener('pointermove', (e) => { if (!G.round || !(e.buttons || e.pointerType === 'touch')) return; setX(e); });
  const hold = (btn, dir) => {
    const on = (e) => { e.preventDefault(); G.held = dir; btn.classList.add('on'); };
    const off = () => { if (G.held === dir) { G.held = 0; if (G.round) G.round.target = G.round.x; } btn.classList.remove('on'); };
    btn.addEventListener('pointerdown', on); ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, off));
  };
  hold($('mgLeft'), -1); hold($('mgRight'), 1);
  addEventListener('keydown', (e) => { if (!G.round) return; if (e.key === 'ArrowLeft') G.held = -1; if (e.key === 'ArrowRight') G.held = 1; });
  addEventListener('keyup', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { G.held = 0; if (G.round) G.round.target = G.round.x; } });
  $('mgStart').onclick = () => start();
  $('mgLater').onclick = () => { AU.sfx('sfx_cancel'); closeCatch('later'); };
  $('mgSound').onclick = () => { G.S.settings.sound = !G.S.settings.sound; AU.setSound(G.S.settings.sound); $('mgSound').textContent = G.S.settings.sound ? '🔊' : '🔇'; G.hooks.save(); if (G.S.settings.sound) { MU.playSlot('minigame'); AU.sfx('sfx_tap'); } };
  $('mgPauseBtn').onclick = () => { AU.sfx('sfx_tap'); pause(); };
  $('mgResume').onclick = () => { AU.sfx('sfx_tap'); resume(); };
  $('mgQuit').onclick = () => { AU.sfx('sfx_cancel'); closeCatch('quit'); };
  $('mgAgain').onclick = () => { AU.sfx('sfx_tap'); title(); };
  $('mgDone').onclick = () => { AU.sfx('sfx_tap'); closeCatch('done'); };
  addEventListener('resize', () => { if (G.mode) layout(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.mode) { pause(); AU.pauseBgm(); } });
}
export const catchState = () => ({ mode: G.mode, stage: G.stage, round: G.round, res: G.res, rw: G.rw, anim: G.anim.name, cm: G.cm });
/** 테스트/스크린샷용: 시간을 빠르게 흘림(실제 step 사용) */
export function catchDebug(cmd, arg) {
  if (cmd === 'start') start();
  if (cmd === 'skipCount' && G.mode === 'count') { G.cd = 0; }
  if (cmd === 'sim' && G.round) { // arg 초 동안 자동 플레이(가까운 좋은 아이템 쫓기)
    const r = G.round; let t = 0;
    while (t < arg && !r.done) { const g = r.items.filter((x) => MG.ITEMS[x.id].good).sort((a, b) => b.y - a.y)[0]; r.target = g ? g.x : r.x; for (const e of MG.step(r, 1 / 30)) onEvent(e); t += 1 / 30; }
    G.fx = G.fx.slice(-6); hud(); if (r.done) finish();
  }
  if (cmd === 'finish' && G.round) { const r = G.round; r.t = r.dur; r.items.length = 0; MG.step(r, 0.01); finish(); }
}
