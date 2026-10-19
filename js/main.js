import { STATS, GAME_VERSION, FOODS, GIFTS, STAGES, PLACES, STAGE_PLACES, OUTDOOR_SCALE, CHAR_FIT, stageScale, viewPlace, placeInfo } from './config.js';
import { uiConfirm, closeConfirm } from './confirm.js';
import * as ST from './story.js';
import { newState, load, save, wipe, advance, stageOf, dayNumber, timeOfDay, moodState, dayKey } from './state.js';
import { loadDialogue, pickSys, quoteCaption, remember, eventById, pickNostalgia } from './dialogue.js';
import { doAction, timedAction, pokeLine, arriveLine, morningLine } from './actions.js';
import { ACTION_MIN, MSG_AT_MIN, NIGHT_SLEEP_MIN } from './config.js';
import { dueEvent, dueCards, parseScript, branchSteps, eventExpr, eventShots, ORDER as EV_ORDER } from './events.js';
import { loadIllustIndex, preloadArt, hasEventArt } from './illust.js';
import * as END from './ending.js';
import { DialogBox } from './dialogbox.js';
import { drawChar, drawRoom, ensureSheet, onSheet, loadedSheets, trimSheets, touchSheet, hasSheet, cellOf, scaleRefOf, animInfo, drawSheetFrame, snapDev, blitSharp, LEGACY_EXPR, loadRooms, hasRoomImg, drawRoomImg, ensureRoom } from './sprite.js';
import * as QZ from './quiz.js';
import * as MG from './minigame.js';
import * as AU from './audio.js';
import * as MU from './music.js';
import * as VO from './voice.js';
import * as TT from './tantrum.js';
import * as EP from './evplace.js';
import { initGuard } from './guard.js';
import { wantedSlot, normVolumes } from './music_map.js';
import { showTitle, titleOpen } from './title.js';
import { openCatch, bindCatch, loadCatchIcons, catchState, catchDebug, closeCatch, iconHtml } from './catch_ui.js';
import * as CL from './collection.js';
import { getEvents, allLines } from './dialogue.js';
import * as DX from './dex_ui.js';
import { initMobile } from './mobile.js';
import * as MO from './moments.js';
import * as GL from './goals.js';
import * as MS from './messenger.js';
import { gainCrush, condition, crushRoom, bump, gnow, gameNow, setActive, passTime, endDay, clockText } from './state.js';

const $ = (id) => document.getElementById(id);
let S = load();
const firstRun = !S;
if (!S) S = newState();
setActive(() => S);   // 날짜·시간대·이벤트·하루 한도 = 게임 속 시각

const UI = { title: false, endingPhase: null, food: null, event: null, ov: null, ovStart: 0, ovUntil: 0, ovThen: null, frame: 0, lastRoomKey: '', lastDraw: '', nextBlink: Date.now() + 3000 };

// ── 장소 (Stage 3) ──
const placesFor = (st) => (STAGE_PLACES[st] || STAGE_PLACES.mid).filter((id) => hasRoomImg(id));
function curPlace() {
  const st = stageOf(S).id, list = placesFor(st);
  if (!list.includes(S.place)) S.place = list[0] || null;   // 단계가 바뀌면 그 단계의 집으로
  return S.place;
}
function goPlace(id) {
  if (EP.isEventPlace(id)) {   // v0.9.5 특별 장소: 도착 = 이벤트 시작
    $('placeSheet').hidden = true;
    const ev = EP.arrive(S, id); if (!ev || UI.event) return;
    spend(ACTION_MIN.place); AU.sfx('sfx_sparkle'); renderActs(); playEvent(ev); return;
  }
  const p = PLACES[id] && placeInfo(id, stageOf(S).id); if (!p || id === S.place) { $('placeSheet').hidden = true; return; }
  if (S.asleep) { toast('자는 중이에요'); return; }
  S.place = id; $('placeSheet').hidden = true; UI.lastRoomKey = ''; bump(S, `place_${id}`); spend(ACTION_MIN.place);
  // Stage 4: 장소·단계별 도착 대사(dialogue.json action '도착'), 없으면 기본 문구
  const r = arriveLine(S, id);
  const line = r.line && r.line.action === '도착' || r.line?.action === '회상' ? r.line : { id: 'SYS_place', text: PLACE_LINES[id] || `${p.name} 도착!` };
  const tr = TT.resolve(S, id);
  if (tr) {
    S.stats.mood = Math.min(100, S.stats.mood + tr.reward.mood); gainCrush(S, tr.reward.crush); AU.sfx('sfx_heart'); save(S);
    say({ line: { id: 'SYS_tt_ok', text: MS.fill(tr.line, S.player.name) }, expr: 'E02', then: 'E01', note: `${p.icon} ${p.name} · 💗 기분 +${tr.reward.mood} · 💓 +${tr.reward.crush}` });
    renderActs(); return;
  }
  say({ line, expr: p.home ? 'E01' : 'hop', then: r.expr || 'E01', note: `${p.icon} ${p.name}${p.city ? ' · ' + p.city : ''}` });
  maybeEvent();
}
const PLACE_LINES = {
  home_nanwu: '다녀왔습니다~! 역시 집이 최고야.',
  school: '학교 왔다… 오늘 쪽지시험 없겠지? 제발.',
  dessert: '여기 진열장 좀 봐! …하나만 먹어도 되지? 우유 안 들어간 걸로!',
  dorm: '기숙사 도착. 룸메들 아직 안 왔나 봐.',
  apartment: '집이다~ 오늘도 수고했어, 나.',
  yihe_street: '바닷바람 좋다… 이허는 남우랑 공기부터 달라.',
  campus: '이허대 캠퍼스! 야자수 있는 학교라니, 아직도 신기해.',
  beach: '바다다! 신발 벗어도 돼? 조금만 걸을래.',
};
function buildPlaceMenu() {
  const st = stageOf(S).id;
  $('placeMenu').innerHTML = placesFor(st).map((id) => { const p = placeInfo(id, st);
    return `<button class="food place${id === S.place ? ' cur' : ''}" data-place="${id}"><i>${p.icon}</i><b>${p.name}</b><small>${p.city}${p.home ? ' · 집' : ''}</small></button>`; }).join('');
  const sp = EP.specialPlaces(S).map((p) => `<button class="food place evspot" data-place="${p.id}"><em class="newb">✨NEW</em><i>${p.icon}</i><b>${p.name}</b><small>${p.city} · 이야기</small></button>`).join('');
  $('placeMenu').innerHTML = sp + $('placeMenu').innerHTML;
}

// ── 스탯 바 ──
function buildStats() {
  $('stats').innerHTML = STATS.map((d) => `
    <div class="stat" data-k="${d.key}" style="--c:${d.color}">
      <span class="ico">${d.icon}</span><span class="lbl">${d.label}</span>
      <span class="bar"><span class="fill"></span></span><span class="num">0</span>
    </div>`).join('');
}
function renderStats() {
  for (const d of STATS) {
    const el = document.querySelector(`.stat[data-k="${d.key}"]`);
    const v = S.stats[d.key];
    el.querySelector('.fill').style.width = v.toFixed(1) + '%';
    el.querySelector('.num').textContent = Math.round(v);
    el.classList.toggle('low', d.key !== 'grade' && d.key !== 'crush' && v < 30);
  }
  crushJuice(); renderGoalBadge();
}

// ── 표정/애니메이션 선택 (EXPRESSIONS.md 트리거) ──
function baseAnim() {
  if (S.asleep) return 'E22';
  const m = moodState(S);
  if (m === '졸림') return 'E21';
  if (m === '배고픔') return 'E23';
  if (m === '샐짐') return 'E13';
  if (S.stats.mood >= 80) return 'E01';
  return 'idle';
}
function setOverride(name, ms = 3500, then = null) {
  UI.ov = name; UI.ovStart = performance.now(); UI.ovUntil = Date.now() + ms; UI.ovThen = then;
}
function currentAnim(nowP) {
  const st = charSheet();
  if (UI.ov && !S.asleep) {
    const a = animInfo(st, UI.ov);
    const done = a && !a.loop && (nowP - UI.ovStart) >= (a.frames / a.fps) * 1000;
    if (done || Date.now() > UI.ovUntil) {
      if (UI.ovThen) { const t = UI.ovThen; UI.ov = null; setOverride(t, 2500); }
      else UI.ov = null;
    }
  }
  if (S.asleep && UI.ov !== 'E22') UI.ov = null;
  if (UI.ov) return { name: UI.ov, start: UI.ovStart };
  const b = baseAnim();
  // 기본 상태에서 가끔 눈 깜빡
  if (b === 'idle' && Date.now() > UI.nextBlink) { UI.nextBlink = Date.now() + 2500 + Math.random() * 3500; setOverride('blink', 400); return { name: 'blink', start: UI.ovStart }; }
  return { name: b, start: 0 };
}
/** 캐릭터 시트 키: 입은 의상 시트가 있으면 그 의상 id, 아니면 단계 시트 */
function wantedSheet() {
  const st = stageOf(S).id, w = CL.equippedOutfit(S, st, { day: dayNumber(S) });
  return w && CL.OUTFIT_SHEETS[w] ? w : st;
}
function charSheet() {   // 모바일: 시트는 필요할 때 불러옴(ensureSheet). 아직이면 단계 시트로
  const st = stageOf(S).id, w = wantedSheet();
  if (!hasSheet(w)) ensureSheet(w);
  if (w !== st && !hasSheet(st)) ensureSheet(st);
  const k = hasSheet(w) ? w : st; touchSheet(k); return k;
}
function renderChar() {
  const nowP = performance.now();
  const st = charSheet(), cv = $('char'), wrap = $('charWrap');
  const { name, start } = currentAnim(nowP);
  if (hasSheet(st)) {
    const a = animInfo(st, name) || animInfo(st, 'idle');
    const t = nowP - start;
    let f = Math.floor(t * a.fps / 1000);
    f = a.loop ? f % a.frames : Math.min(f, a.frames - 1);
    const T = UI.charT || cellOf(st), C = cellOf(st);
    const key = `${st}|${a.name}|${f}|${T}`;
    if (key !== UI.lastDraw) {
      if (!UI.charSrc || UI.charSrc.width !== C) { UI.charSrc = document.createElement('canvas'); UI.charSrc.width = UI.charSrc.height = C; }
      const off = drawSheetFrame(UI.charSrc, st, a.name, f);
      if (cv.width !== T) { cv.width = cv.height = T; }
      const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, T, T);
      blitSharp(ctx, UI.charSrc, 0, 0, C, C, 0, 0, T, T);
      const dpr = window.devicePixelRatio || 1;
      cv.style.transform = `translateY(${Math.round(off * T / C) / dpr}px)`;   // 기기 픽셀 단위로 맞춤
      UI.lastDraw = key;
    }
    wrap.classList.add('pxsheet');
  } else {
    const key = `${st}|${name}|${UI.frame}`;
    if (key !== UI.lastDraw) {
      if (cv.width !== 64) { cv.width = cv.height = 64; }
      drawChar(cv, { stage: st, expr: LEGACY_EXPR[name] || 'normal', frame: UI.frame });
      cv.style.transform = ''; UI.lastDraw = key;
    }
    wrap.classList.remove('pxsheet');
  }
  const cellV = hasSheet(st) ? cellOf(st) : cv.width;
  if (UI.cellVar !== cellV) { UI.cellVar = cellV; document.documentElement.style.setProperty('--cell', cellV); }   // 매 프레임 스타일 재계산 피하기
  requestAnimationFrame(renderChar);
}

// ── Stage 9: 배경음악 슬롯 (js/music.js, data/music.json) — 화면 상태가 바뀔 때마다 부름(같은 슬롯이면 아무것도 안 함) ──
const musicSlot = () => wantedSlot({ title: UI.title, ending: UI.endingPhase, event: UI.event, mg: UI.mg, place: viewPlace(curPlace(), stageOf(S).id), tod: timeOfDay().id });
function updateMusic() { try { MU.playSlot(musicSlot()); } catch {} }
function applyVolumes() { const v = normVolumes(S.settings); S.settings.bgm = v.bgm; S.settings.sfx = v.sfx; AU.setSfxVolume(v.sfx); MU.applySettings(S.settings); VO.setVoice({ on: S.settings.voice !== false, sound: v.sound, vol: S.settings.voiceVol ?? 1 }); }
function renderScene() {
  const st = stageOf(S), tod = timeOfDay();
  updateMusic();
  $('dayLabel').textContent = `D+${dayNumber(S)}`;
  $('stageLabel').textContent = st.name;
  $('todLabel').textContent = `${tod.icon} ${tod.slot}`;
  $('clock').textContent = clockText(S);   // 게임 속 시계(행동하면 흐름)
  // 방 (변할 때만 다시 그림)
  const room = $('room'), stage = $('stage');
  const w = Math.max(60, Math.round(stage.clientWidth / 4)), h = Math.max(60, Math.round(stage.clientHeight / 4));
  const place = curPlace();
  const vplace = viewPlace(place, st.id), pinfo = placeInfo(place, st.id);
  $('placeLabel').textContent = place ? `${pinfo.icon} ${pinfo.name}` : '';
  const decor = place ? DX.decorSources(S, place) : [];   // Stage 7: 방 꾸미기
  const key = `${w}x${h}|${UI.bgPlace || ''}|${tod.id}|${st.id}|${place}|${decor.map((d) => d.item).join(',')}`;
  if (key !== UI.lastRoomKey) {
    let ok = true;
    if (UI.bgPlace && hasRoomImg(UI.bgPlace)) ok = drawRoomImg(room, { tod: tod.id, place: UI.bgPlace, aspect: stage.clientWidth / stage.clientHeight });   // v0.9.6 이벤트 장소 배경
    else if (place && hasRoomImg(vplace)) ok = drawRoomImg(room, { tod: tod.id, place: vplace, aspect: stage.clientWidth / stage.clientHeight, decor });
    else { room.width = w; room.height = h; drawRoom(room, { tod: tod.id, stage: st.id }); }
    if (ok) UI.lastRoomKey = key;   // 배경을 아직 불러오는 중이면 다음에 다시
  }
  document.body.classList.toggle('asleep', S.asleep);
  $('btnExam').hidden = !QZ.examDue(S) || S.asleep || !!UI.quiz;
  $('sleepLabel').textContent = S.gt.min >= NIGHT_SLEEP_MIN ? '잘 자 인사' : '낮잠';
  document.querySelectorAll('.act').forEach((b) => (b.disabled = S.asleep && b.dataset.act !== 'sleep'));
  renderActs();
  // 캐릭터 크기: 무대 높이에 맞는 정수 배율
  const cell = cellOf(st.id);
  let scale;
  if (cell >= 160) {
    // 고해상도 시트(v2): 기기와 상관없이 무대 대비 같은 크기(iPhone 12 기준 비율 CHAR_FIT),
    // 기기 픽셀 배율 d 가 정수에 가까우면 정수(최근접), 아니면 sharp-bilinear(blitSharp)로 선명하게
    const dpr = window.devicePixelRatio || 1;
    const ss = stageScale(st.id), want = Math.min(stage.clientHeight * 0.80, stage.clientWidth * 1.25) / scaleRefOf(st.id);
    let s = want * CHAR_FIT;
    if (place && PLACES[place].outdoor) s *= OUTDOOR_SCALE;   // 야외: 일정 비율로 작게
    if (ss < 1) s *= ss;                                       // 중학생: 고교 × ss
    const d = snapDev(s * dpr), T = Math.max(16, Math.round(cell * d));
    UI.charT = T; scale = T / (cell * dpr);
    // 위치도 기기 픽셀 경계에 맞춤(반 픽셀 위치면 브라우저가 다시 보간해서 흐려짐)
    const wr = $('charWrap'), wCss = T / dpr;
    wr.style.left = `${Math.round((stage.clientWidth - wCss) / 2 * dpr) / dpr}px`;
    wr.style.bottom = `${Math.round(stage.clientHeight * 0.08 * dpr) / dpr}px`;
    wr.style.transform = 'none';
  } else {
    { const wr = $('charWrap'); wr.style.left = wr.style.bottom = wr.style.transform = ''; UI.charT = 0; }
    scale = Math.max(2, Math.min(5, Math.floor(Math.min(stage.clientWidth * (cell > 64 ? 0.85 : 0.75), stage.clientHeight * (cell > 64 ? 0.64 : 0.6)) / cell)));
  }
  document.documentElement.style.setProperty('--px', scale);
}

const box = new DialogBox({ bubble: $('bubble'), text: $('bubbleText'), rarity: $('bubbleRarity'), cap: $('bubbleCap'), next: $('bubbleNext'), choices: $('bubbleChoices') });
function say(res) {
  if (!res) return;
  const { line, fx, note } = res;
  let { expr } = res;
  // Stage 5: 음식별 전용 먹기 프레임(eat_rice/eat_noodle/eat_tanghulu/eat_lollipop). 없으면 기본 eat(=밥)
  if (expr === 'eat') { UI.food = res.food || null; if (UI.food && animInfo(charSheet(), `eat_${UI.food}`)) expr = `eat_${UI.food}`; }
  if (line) {
    box.show(line.text, { rarity: line.rarity, caption: quoteCaption(line) });
    remember(line.id);
    if (line.id && !line.id.startsWith('SYS')) S.seenLines[line.id] = (S.seenLines[line.id] || 0) + 1;
    UI.lastLine = line;
  }
  if (expr) setOverride(expr, expr === 'hop' ? 2000 : 3500, res.then || null);
  if (fx) { const f = $('fx'); f.textContent = fx; f.classList.remove('pop'); void f.offsetWidth; f.classList.add('pop'); }
  if (note) toast(note);
  $('charWrap').classList.remove('hop'); void $('charWrap').offsetWidth; $('charWrap').classList.add('hop');
  save(S); renderStats(); renderScene();
}

// ── Stage 4: 이벤트(E1~E8) 재생 ──
let evTimer;
// Stage 7: 보상 카드(하루 루틴 완료 / 조각 3개). 다른 화면이 떠 있으면 다음 확인 때로 미룸
let rwTimer;
/** 카드 연출은 문자·이벤트·퀴즈가 끝난 뒤에(메신저 뒤에 숨어 뜨던 버그) */
function whenFree(fn, delay) { setTimeout(function go() { if (UI.msgr || UI.event || UI.quiz || UI.mg || !$('msgPop').hidden) return setTimeout(go, 800); fn(); }, delay); }
function checkRewards(delay = 1800) {
  if (UI.event || UI.quiz || UI.mg || UI.card || S.asleep || DX.dexState().open) return;
  const r = CL.routineReward(S, DX.catalog()) || CL.piecesReward(S, DX.catalog());
  if (!r) return;
  save(S); UI.card = true;
  clearTimeout(rwTimer); rwTimer = setTimeout(() => whenFree(() => {
    AU.sfx(r.rarity === '일반' ? 'sfx_gift_open' : 'sfx_sparkle'); DX.showCard(r.card, { reveal: r, state: S });
    setOverride(r.rarity === '일반' ? 'E01' : 'E19', 3000, 'E01'); renderStats();
  }, 0), delay);
}
function checkPhotoCards() {   // Stage 8: 포토카드 P01~P10
  if (UI.event || UI.quiz || UI.mg || UI.card || S.asleep || DX.dexState().open) return false;
  const ids = dueCards(S); if (!ids.length) return false;
  S.pcards = S.pcards || {}; const id = ids[0]; S.pcards[id] = dayKey(gnow()); save(S); UI.card = true;
  const c = DX.catalog().find((x) => x.id === `pc_${id}`);
  whenFree(() => { AU.sfx('sfx_sparkle'); DX.showCard(c, { reveal: { dup: false, why: 'pcard' }, state: S }); setOverride('E19', 3000, 'E01'); }, 900);
  return true;
}
/** v0.9.6 이벤트 앞 장면: 사건 → 친구 선택(말투만) → 쌍즈가 이유를 말함 → ✨ 새 장소. 그림 없음(지금 방 배경) */
async function runPre(n) {
  if (UI.event) return;
  UI.event = `pre:${n.id}`; box.locked = true; renderActs();
  const say1 = async (raw) => {
    const m = raw.match(/^쌍즈(?:→([^:]+))?:\s*(.+)$/), txt = MS.fill(m ? m[2] : raw.replace(/^\((.*)\)$/, '$1'), S.player.name);
    if (m) { setOverride(eventExpr(txt), 60000); await box.show(m[1] ? `(${m[1]}) ${txt}` : txt, { wait: true }); } else await box.show(txt, { narr: true, wait: true });
  };
  try {
    for (const r of n.pre.steps) await say1(r);
    box.show('뭐라고 해 줄까?', { narr: true, instant: true }); clearTimeout(box.hideTimer);
    const pick = await box.choose(n.pre.choice.map((c) => c.label));
    const c = n.pre.choice.find((x) => x.label === pick) || n.pre.choice[0];
    MO.noteReaction(S, `P:${n.id}:${pick}`);
    await say1(`쌍즈: ${c.reply}`);
    for (const r of n.pre.after) await say1(r);
  } finally {
    (S.evPre = S.evPre || {})[n.id] = dayKey(gnow()); save(S);   // 날짜 = 그날 밤 문자(gm_summons)용
    UI.event = null; box.locked = false; box.hide();
  }
  AU.sfx('sfx_sparkle'); try { navigator.vibrate && navigator.vibrate([60, 60, 60]); } catch {}
  say({ line: { id: 'SYS_evp', text: MS.fill(n.line, S.player.name) }, expr: 'E02', then: 'E01', note: `✨ 새 장소: ${n.icon} ${n.name}` });
  renderActs();
}
function maybeEvent(delay = 1600) {
  if (UI.ending || UI.msgr) return;
  if (!UI.event && !UI.quiz && !UI.mg) checkGoalDone();
  checkRewards(); if (checkPhotoCards()) return;
  if (UI.event || UI.quiz || UI.mg || UI.card || S.asleep || DX.dexState().open) return;
  // v0.9.5: 이벤트는 여기서 바로 시작하지 않음 → 특별 장소가 열리고(✨NEW) 쌍즈가 가자고 함. 도착하면 시작(goPlace)
  { const ep = EP.pending(S); if (ep) { if (ep.pre && !(S.evPre || {})[ep.id]) runPre(ep); return; } }   // 앞 장면 보다가 껐으면 다시
  const id = dueEvent(S); if (!id) return;
  clearTimeout(evTimer); evTimer = setTimeout(() => {
    if (UI.event || UI.quiz || UI.mg || UI.card || DX.dexState().open || dueEvent(S) !== id) return;
    const n = EP.setPending(S, id, S.gt.min); if (!n) return;
    if (n.pre && !(S.evPre || {})[id]) { S.tantrum = null; save(S); runPre(n); return; }   // v0.9.6: 이벤트 앞 장면(E1 소환장) → 끝나면 새 장소
    S.tantrum = null; save(S); AU.sfx('sfx_sparkle'); try { navigator.vibrate && navigator.vibrate([60, 60, 60]); } catch {}
    say({ line: { id: 'SYS_evp', text: MS.fill(n.line, S.player.name) }, expr: 'E02', then: 'E01', note: `✨ 새 장소: ${n.icon} ${n.name}` });
    renderActs();
  }, delay);
}
async function playEvent(id) {
  const ev = eventById(id); if (!ev || UI.event || UI.quiz) return;
  UI.event = id; UI.evSkip = false; box.locked = true; updateMusic();
  { const bp = (EP.EVENT_PLACES[id] || {}).place; UI.bgPlace = bp && PLACES[bp] ? bp : null; if (UI.bgPlace) { await ensureRoom(UI.bgPlace).catch(() => {}); UI.lastRoomKey = ''; renderScene(); } }   // 이벤트 곡: 방 음악 페이드 아웃 → 이벤트 곡 페이드 인
  const wasSeen = !!(S.events || {})[id];
  // Stage 8: 전체 화면 일러스트(지연 로딩) + 천천히 패닝. 그림이 없으면 예전처럼 방 화면 위 베일
  const art = await preloadArt('event', id);
  const full = $('evFull'), bub = $('bubble'), home = bub.parentNode, homeNext = bub.nextSibling;
  // 순서: (선택지가 있는 이벤트) 상황 대사(방 화면·CG 없음) → 선택 → CG 공개(+음성) → 뒷이야기
  const topSteps = parseScript(ev), choiceAt = topSteps.findIndex((x) => x.kind === 'choice');
  let cgShown = false;
  const showCG = () => {
    if (!art || cgShown) return; cgShown = true; $('eventVeil').hidden = true;
    $('evImg').src = art; $('evTitle').textContent = ev.title; $('evEp').textContent = ev.inspired || '';
    full.hidden = false; full.classList.remove('on'); void full.offsetWidth; full.classList.add('on');
    $('evBox').appendChild(bub); document.body.classList.add('in-evfull');
    UI.evVoiceId = null; $('evVoice').hidden = true;   // 음성은 해당 대사가 뜰 때(아래 voiceMap)
  };
  UI.evCgAt = art ? (choiceAt >= 0 ? choiceAt + 1 : 0) : -1;   // 테스트·디버그용: CG가 처음 보이는 단계
  if (art && choiceAt < 0) showCG();
  else { $('eventTitle').textContent = `✨ ${ev.title}`; $('eventVeil').hidden = false; }
  document.body.classList.add('in-event');
  // 클로즈업·연결 컷(E0_close 등): 이벤트 시작과 함께 뒤에서 미리 받아 두고, 해당 대사 앞에서 크로스페이드
  const shots = art ? eventShots(ev).filter((x) => hasEventArt(x.art)) : [];
  const shotSrc = Object.fromEntries(shots.map((x) => [x.art, preloadArt('event', x.art)]));
  const showShot = async (name) => {
    const src = await Promise.race([shotSrc[name], sleepMs(2500).then(() => null)]); if (!src || UI.evSkip) return;
    const im2 = $('evImg2'); im2.src = src; try { await im2.decode(); } catch {}
    im2.classList.add('show'); im2.parentNode.classList.add('shot'); UI.evShot = name;
  };
  const voiceMap = art ? VO.assignVoice(topSteps, shots, VO.linesForEvent([id, ...shots.map((x) => x.art)]), id, undefined, UI.evCgAt) : {};
  UI.evVoiceMap = voiceMap;
  const run = async (steps, top = false) => {
    for (let k = 0; k < steps.length; k++) {
      const st = steps[k];
      if (top && !UI.evSkip && cgShown) { const sh = shots.find((x) => x.i === k); if (sh) await showShot(sh.art); }   // CG 공개 전(선택 전)엔 클로즈업도 안 띄움
      if (!UI.evSkip && (st.kind === 'say' || st.kind === 'narr')) {   // 대사가 바뀌면 이전 음성 멈추고, 이 대사의 음성이 있으면 재생
        const vm = top ? voiceMap[k] : null;
        if (vm) { UI.evVoiceLines = vm; $('evVoice').hidden = false; VO.playLines(vm); }
        else { VO.stopVoice(); UI.evVoiceLines = null; $('evVoice').hidden = true; }
      }
      if (st.kind === 'reward' || st.kind === 'ending') { if (!S.rewards.includes(st.text)) S.rewards.push(st.text); }
      if (UI.evSkip) continue;
      if (st.kind === 'say') { setOverride(eventExpr(st.text), 60000); await box.show(st.to ? `(${st.to}) ${st.text}` : st.text, { wait: true }); }
      else if (st.kind === 'narr') await box.show(st.text, { narr: true, wait: true });
      else if (st.kind === 'reward' || st.kind === 'ending') await box.show(`${st.kind === 'ending' ? '🌅 엔딩' : '🎁 보상'}: ${st.text}`, { narr: true, wait: true });
      else if (st.kind === 'choice') {
        box.show('어떻게 할까?', { narr: true, instant: true }); clearTimeout(box.hideTimer);
        const opts = st.options.filter((o) => !GL.isNgOption(o) || (S.ng || 0) > 0);
        const pick = await box.choose(opts);
        (S.evChoices = S.evChoices || {})[id] = pick; MO.noteReaction(S, `E:${id}:${pick}`);
        if (top) { showCG(); await sleepMs(500); const vm = voiceMap.reveal; if (vm) { UI.evVoiceLines = vm; $('evVoice').hidden = false; VO.playLines(vm); } }   // 선택 직후 CG 공개
        await run(branchSteps(ev, pick));
      }
    }
  };
  try { await run(topSteps, true); }
  finally {
    S.events[id] = S.events[id] || dayKey(gnow()); save(S);   // Stage 7: 다시 보기여도 처음 본 날짜 유지
    UI.event = null; UI.ov = null; UI.bgPlace = null; UI.lastRoomKey = ''; box.locked = false; $('eventVeil').hidden = true; box.hide();
    if (!END.shouldAutoEnding(id, wasSeen)) updateMusic();   // 다시 장소 음악(엔딩으로 이어지면 엔딩 곡이 받음)
    if (bub.parentNode !== home) home.insertBefore(bub, homeNext);
    VO.stopVoice(); UI.evVoiceId = null; UI.evVoiceLines = null; $('evVoice').hidden = true;
    full.classList.remove('on'); full.hidden = true; $('evImg').removeAttribute('src');
    { const im2 = $('evImg2'); im2.classList.remove('show'); im2.removeAttribute('src'); im2.parentNode.classList.remove('shot'); UI.evShot = null; }
    document.body.classList.remove('in-event', 'in-evfull');
    toast(`📔 이벤트 '${ev.title}' 기록됨`);
    if (END.shouldAutoEnding(id, wasSeen)) setTimeout(() => startEnding(), 900);   // 마지막 이벤트(E8)를 처음 끝내면 엔딩
    else setTimeout(() => maybeEvent(), 1200);
  }
}
function skipEvent() {   // 건너뛰기: 남은 대사를 넘기고 보상만 기록
  if (!UI.event) return; UI.evSkip = true;
  const ch = $('bubbleChoices').querySelector('button'); if (ch) ch.click();
  box.tap(true); box.tap(true);
}
// ── 엔딩: 필름 스트립 → 크레딧 → 쌍즈의 메시지 (js/ending.js) ──
async function startEnding(all = false) {
  if (UI.ending || UI.event || UI.quiz || UI.mg) return;
  UI.ending = true; box.hide && box.hide(); $('toast').hidden = true;
  END.markEndingSeen(S, dayKey(gnow())); save(S);
  try { const ix = await (await fetch('assets/story/index.json')).json(); $('ending').style.setProperty('--credits-bg', ix.includes('story_F3.webp') ? 'url(assets/story/story_F3.webp)' : 'none'); } catch {}
  await END.playEnding({ state: S, all, events: getEvents(), cards: CL.PHOTOCARDS, hasArt: hasEventArt, days: dayNumber(S), outfits: DX.dexProgress(S).outfits,
    audio: { playBgmFade: () => { UI.endingPhase = 'strip'; updateMusic(); }, phase: (ph) => { UI.endingPhase = ph; updateMusic(); }, stopBgmFade: (ms) => { UI.endingPhase = null; MU.stopMusic(ms); } },
    beforeCredits: () => ST.playStory('end'),
    onDone: () => { UI.ending = false; save(S); UI.lastRoomKey = ''; renderAll(); setTimeout(() => maybeEvent(), 1500); } });
}
$('evVoice').addEventListener('click', (e) => { e.stopPropagation(); if (UI.evVoiceLines) VO.playLines(UI.evVoiceLines, { force: true }); else if (UI.evVoiceId) VO.playIllust(UI.evVoiceId, { force: true }); });
$('evSkip').addEventListener('click', (e) => { e.stopPropagation(); AU.sfx('sfx_tap'); skipEvent(); });
$('evFull').addEventListener('click', () => box.tap());
$('eventVeil').addEventListener('click', () => box.tap());

function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => (t.hidden = true), 1800); }

// ── 시트(모달) ──
const open = (id) => ($(id).hidden = false);
const close = (el) => (el.closest('.sheet, .debug').hidden = true);
document.addEventListener('click', (e) => {
  if (e.target.matches('[data-close]')) close(e.target);
  if (e.target.classList.contains('sheet')) e.target.hidden = true;
});

function buildFeedMenu() {
  $('feedMenu').innerHTML = FOODS.map((f) => `
    <button class="food" data-food="${f.id}">${f.px ? iconHtml(f.px, f.dairy ? 'dairy' : '') : `<i>${f.icon}</i>`}<b>${f.name}</b>
    <small>${f.dessert ? '디저트' : '식사'}${f.dairy ? ' · 🥛우유' : ''}</small></button>`).join('');
  $('feedMenu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-food]'); if (!b) return;
    $('feedSheet').hidden = true; tick(); say(act('feed', b.dataset.food)); maybeEvent();
  });
}

function buildGiftMenu() {
  const left = QZ.TASTE_PER_DAY - (S.daily.taste || 0), n = QZ.tasteSetsFor(S).length;
  $('tasteLeft').textContent = n ? `오늘 ${Math.max(0, left)}/${QZ.TASTE_PER_DAY}` : '';
  $('btnTaste').disabled = !QZ.canTaste(S);
  $('giftMenu').innerHTML = GIFTS.map((g) => `
    <button class="food" data-gift="${g.id}"><i>${g.icon}</i><b>${g.name}</b><small>보유 ${S.inventory[g.id] || 0}</small></button>`).join('');
}
$('giftMenu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-gift]'); if (!b) return;
  $('giftSheet').hidden = true; tick(); const r = act('gift', b.dataset.gift); say(r); if (r && r.crush === 0) gainFloat(0); maybeEvent();
});

$('actions').addEventListener('click', (e) => {
  const b = e.target.closest('.act'); if (!b || b.disabled || UI.event || UI.quiz || UI.mg) return;
  tick();
  const A = b.dataset.act;
  { const ep = EP.pending(S); if (ep) { AU.sfx('sfx_nope'); bounceTantrum(); say({ line: { id: 'SYS_evp_lock', text: MS.fill(ep.line, S.player.name) }, expr: 'E13', then: 'E01', note: `▶ ${ep.icon} ${ep.name}에 가야 이야기가 시작돼요` }); return; } }
  if (TT.locked(S, A)) { AU.sfx('sfx_nope'); bounceTantrum(); say({ line: { id: 'SYS_tt_lock', text: MS.fill(S.tantrum.line, S.player.name) }, expr: 'E13', then: 'E01' }); return; }
  if (TT.capLeft(S, A) <= 0) { AU.sfx('sfx_nope'); say({ line: { id: 'SYS_cap', text: CAP_LINES[A] }, expr: 'E13', then: 'E01', note: `오늘 ${CAP_NAME[A]}는 다 했어요 · 내일 다시 ${TT.DAILY_CAPS[A]}번` }); return; }
  if (A === 'talk') { TT.useCap(S, 'talk'); renderActs(); }
  if (b.dataset.act === 'feed') return open('feedSheet');
  if (b.dataset.act === 'play') { buildPlayMenu(); return open('playSheet'); }
  if (b.dataset.act === 'gift') { buildGiftMenu(); return open('giftSheet'); }
  // 설렘 순간(대화 선택지): 조건이 맞으면 일반 대사·팝퀴즈보다 먼저
  if (b.dataset.act === 'talk') { const m = MO.dueMoment(S); if (m) return runMoment(m); }
  // Stage 5: 대화의 ~15%는 팝퀴즈(가끔 취향 맞히기)
  if (b.dataset.act === 'talk' && QZ.shouldPop(S)) {
    S.stats_meta.talks++; S.daily.done.talk = true; spend(ACTION_MIN.talk);
    if (QZ.canTaste(S) && Math.random() < 0.25) return runTaste(QZ.pickTaste(S));
    return runPop(QZ.pickPop(S));
  }
  if (b.dataset.act === 'sleep' && nightMsgFirst()) return;
  if (b.dataset.act === 'sleep' && !S.asleep) { const home = placesFor(stageOf(S).id)[0]; if (home && S.place !== home) { S.place = home; UI.lastRoomKey = ''; toast('🏠 집으로 돌아왔어요'); } }
  const r = act(b.dataset.act); if (A === 'study' && !r.noTime) { TT.useCap(S, 'study'); renderActs(); if (Math.random() < 0.4) setTimeout(() => { if (!UI.quiz && !UI.event && !UI.msgr && !UI.mg && $('msgPop').hidden) runPop(QZ.pickPop(S, Math.random, gnow(), { kind: 'study' })); }, 1800); } say(r); if (!r.night) maybeEvent();
});
$('charWrap').addEventListener('click', () => { if (UI.event) return box.tap(); if (UI.quiz || UI.mg) return; tick(); say(pokeLine(S)); maybeEvent(); });

// 장소 이동
$('btnPlace').onclick = () => { if (S.asleep) return toast('자는 중이에요'); buildPlaceMenu(); open('placeSheet'); };
$('placeMenu').addEventListener('click', (e) => { const b = e.target.closest('[data-place]'); if (b) { tick(); goPlace(b.dataset.place); } });

// Stage 7: 도감
$('btnDex').onclick = () => { if (UI.event || UI.quiz || UI.mg) return; AU.sfx('sfx_tap'); DX.openDex(S); };

// 설정
function openSettings() {
  $('btnNG').hidden = !GL.canNewGamePlus(S);
  const v = normVolumes(S.settings);
  $('optSound').checked = v.sound; $('optBgm').value = Math.round(v.bgm * 100); $('optSfx').value = Math.round(v.sfx * 100); $('optVoice').checked = S.settings.voice !== false; $('optVoiceVol').value = Math.round((S.settings.voiceVol ?? 1) * 100); $('optVoiceRow').hidden = $('optVoiceVolRow').hidden = !VO.voiceReady(); volLabels();
  const mi = MU.musicInfo(); $('musicNote').textContent = mi.track ? `🎵 지금 곡: ${mi.title || mi.track}` : '🎵 OST 파일을 assets/music/ost/ 에 넣으면 장면마다 자동으로 나와요(지금은 없는 곳은 무음).';
  open('settingsSheet');
}
const volLabels = () => { $('optVoiceVolV').textContent = `${$('optVoiceVol').value}%`; $('optVoiceVol').disabled = !$('optSound').checked || !$('optVoice').checked; $('optBgmV').textContent = `${$('optBgm').value}%`; $('optSfxV').textContent = `${$('optSfx').value}%`; [$('optBgm'), $('optSfx')].forEach((r) => (r.disabled = !$('optSound').checked)); };
$('btnSettings').onclick = openSettings;
$('optSound').onchange = (e) => { S.settings.sound = e.target.checked; AU.setSound(S.settings.sound); applyVolumes(); if (S.settings.sound) AU.sfx('sfx_tap'); volLabels(); save(S); };
$('optBgm').oninput = (e) => { S.settings.bgm = +e.target.value / 100; MU.setMusicVolume({ bgm: S.settings.bgm }); volLabels(); };
$('optSfx').oninput = (e) => { S.settings.sfx = +e.target.value / 100; AU.setSfxVolume(S.settings.sfx); volLabels(); };
$('optBgm').onchange = () => save(S);
$('optVoice').onchange = (e) => { S.settings.voice = e.target.checked; applyVolumes(); volLabels(); save(S); };
$('optVoiceVol').oninput = (e) => { S.settings.voiceVol = +e.target.value / 100; applyVolumes(); volLabels(); };
$('optVoiceVol').onchange = () => save(S);
$('optSfx').onchange = () => { AU.sfx('sfx_tap'); save(S); };
/** 진짜 새로 시작: 저장(본+백업) 삭제 → 메모리 상태·열린 화면 정리 → 새 상태 저장 */
function resetGame() {
  wipe(); clearTimeout(rwTimer);
  try { const m = $('msgr'); if (!m.hidden && m._abort) m._abort(); } catch {}
  for (const id of ['msgPop', 'cardModal', 'quiz', 'evFull', 'tantrum', 'settingsSheet', 'nameSheet']) { const e = $(id); if (e) e.hidden = true; }
  document.querySelectorAll('.sheet').forEach((e) => (e.hidden = true));
  Object.assign(UI, { event: null, quiz: null, card: false, msgPopLater: false, lastRoomKey: '', lastCrush: null, lastLine: null, dbgEv: undefined });
  document.body.classList.remove('in-quiz', 'in-moment');
  S = newState(); DX.setDexState(S); applyVolumes(); save(S);
  return S;
}
$('btnReset').onclick = async () => {
  if (!(await uiConfirm('정말 처음부터 다시 할까요?\n저장된 기록이 모두 지워져요.', { ok: '새로 시작' }))) return;
  resetGame(); renderAll(); await ST.playStory('open'); await askName(); renderAll();
  say({ line: { id: 'SYS_new', text: '안녕! 나 쌍즈야. 앞으로 잘 부탁해! …꼬맹이라고 부르면 삐질 거야.' }, expr: 'E01' });
};
$('verLabel').textContent = `v${GAME_VERSION} · save schema v${S.v}`;

// ── 디버그: 제목 길게 누르기(0.7초) 또는 ?debug=1 ──
let lp;
const startLP = () => { lp = setTimeout(() => ($('debug').hidden = false), 700); };
const endLP = () => clearTimeout(lp);
$('title').addEventListener('pointerdown', startLP);
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => $('title').addEventListener(ev, endLP));
// ?debug=1: 🐞 버튼만 띄움(mobile.js). 패널은 🐞 또는 제목 길게 누르기로

export function fastForward(hours) {
  // 시간이 흐른 것처럼: 생성·마지막 틱 시각을 과거로 이동 후 정상 경과 처리
  const ms = hours * 3600_000;
  S.createdAt -= ms; S.lastTick -= ms;
  const applied = advance(S);
  save(S); renderAll();
  return applied;
}
$('debug').addEventListener('click', (e) => {
  const k = e.target.dataset.dbg; if (!k) return;
  const set = (o) => { Object.assign(S.stats, o); save(S); renderAll(); };
  const out = $('debugOut');
  if (k.startsWith('ff')) { const h = +k.slice(2); const a = fastForward(h); out.textContent = `+${h}h 요청 → ${a.toFixed(1)}h 반영`; }
  if (k === 'hunger10') set({ hunger: 10 });
  if (k === 'mood10') set({ mood: 10 });
  if (k === 'energy10') set({ energy: 10 });
  if (k === 'crush20') set({ crush: Math.min(100, S.stats.crush + 20) });
  if (k === 'full') set({ hunger: 80, mood: 80, energy: 80, grade: 80 });
  if (k === 'stage') {
    const cur = stageOf(S), i = STAGES.indexOf(cur), nxt = STAGES[(i + 1) % STAGES.length];
    S.gt.day = nxt.fromDay; S.gt.min = 9 * 60; S.exam.unlocked = STAGES.indexOf(nxt); S.exam.nextAt = 0; save(S); renderAll(); out.textContent = `→ ${nxt.name}`;
  }
  if (k === 'evt') { const ids = EV_ORDER; UI.dbgEv = ((UI.dbgEv ?? -1) + 1) % ids.length; $('debug').hidden = true; delete S.events[ids[UI.dbgEv]]; playEvent(ids[UI.dbgEv]); out.textContent = ids[UI.dbgEv]; }
  if (k === 'nost') { const d = new Date(gnow()); const ctx = { on: '대화', stage: stageOf(S).dlg, state: moodState(S), place: S.place, crush: S.stats.crush, grade: S.stats.grade, month: d.getMonth() + 1, time: timeOfDay().id };
    for (const on of ['대화', '선물', '공부', '도착']) { const l = pickNostalgia({ ...ctx, on }, S, true); if (l) { say({ line: l, expr: l.expr }); out.textContent = l.id; return; } }
    out.textContent = '조건 맞는 회상 없음(설렘/장소/단계 확인)'; }
  if (k === 'quiz') { $('debug').hidden = true; runPop(QZ.pickPop(S)); }
  if (k === 'exam') { const i = S.exam.unlocked; if (i >= STAGES.length - 1) { out.textContent = '마지막 단계'; return; }
    S.gt.day = Math.max(S.gt.day, STAGES[i + 1].fromDay); S.exam.nextAt = 0; $('debug').hidden = true; renderAll(); runExam(); }
  if (k === 'taste') { S.daily.taste = 0; $('debug').hidden = true; runTaste(QZ.pickTaste(S)); }
  if (k === 'mg') { $('debug').hidden = true; S.stats.energy = Math.max(S.stats.energy, 40); startCatch(); }
  if (k === 'save') out.textContent = JSON.stringify(S, null, 1);
  if (k === 'reset') { resetGame(); renderAll(); out.textContent = 'reset'; }
});

// ── Stage 5: 퀴즈 (팝퀴즈 · 성장 시험 · 취향 맞히기) ──
let ICONS = { cell: 64, icons: {} };
async function loadIcons() { try { ICONS = await (await fetch('assets/icons/taste.json')).json(); } catch {} }
const SRC = () => QZ.quizData().sources || {};
const srcText = (src) => String(src).split('·').map((k) => SRC()[k.trim()] || k.trim()).join(' · ');
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
function quizOpen(kind, head) {
  UI.quiz = kind; box.locked = true; document.body.classList.add('in-quiz'); MU.musicDuck(true);   // 퀴즈: 음악은 그대로, 소리만 줄임
  const q = $('quiz'); q.className = `quiz ${kind}`; q.hidden = false; $('quizHead').innerHTML = head; $('quizFoot').replaceChildren(); $('quizOpts').replaceChildren();
  renderScene();
}
function quizClose() { MU.musicDuck(false); UI.quiz = null; box.locked = false; document.body.classList.remove('in-quiz'); $('quiz').hidden = true; save(S); renderAll(); checkRewards(2400); }
/** 말풍선에 질문(타이핑) — 퀴즈 중엔 자동으로 닫히지 않음 */
function ask(text, expr = 'E07') { setOverride(expr, 120000); const p = box.show(text); p.then(() => { if (UI.quiz) clearTimeout(box.hideTimer); }); return p; }
/** 보기 버튼 → Promise(고른 인덱스/아이콘). items: [{ key, html, cls }] */
function options(items, icons = false) {
  const wrap = $('quizOpts'); wrap.classList.toggle('icons', icons);
  return new Promise((res) => {
    wrap.replaceChildren(...items.map((it) => {
      const b = document.createElement('button'); b.className = 'qopt' + (it.cls ? ' ' + it.cls : ''); b.innerHTML = it.html; b.dataset.key = it.key;
      b.onclick = (e) => { e.stopPropagation(); if (wrap.dataset.lock) return; wrap.dataset.lock = '1'; res({ key: it.key, el: b }); };
      return b;
    }));
    delete wrap.dataset.lock;
  });
}
function mark(answerKey, picked) {
  for (const b of $('quizOpts').children) {
    if (b.dataset.key === String(answerKey)) b.classList.add('ok');
    else if (b === picked) b.classList.add('no'); else b.classList.add('dim');
  }
}
function react(r, extra = {}) {
  const text = r.answerText ? `${r.text}\n${r.answerText}` : r.text;
  box.show(text, { rarity: r.rarity, caption: extra.caption || '' });
  UI.lastLine = { id: 'SYS_quiz', text };
  setOverride(r.expr, 3200, r.then || null);
  if (r.fx) { const f = $('fx'); f.textContent = r.fx; f.classList.remove('pop'); void f.offsetWidth; f.classList.add('pop'); }
  $('charWrap').classList.remove('hop'); void $('charWrap').offsetWidth; $('charWrap').classList.add('hop');
}
const deltaText = (d = {}) => [d.crush ? `💗 설렘 +${d.crush}` : '', d.mood ? `😊 기분 +${d.mood}` : ''].filter(Boolean).join(' · ');
const optHtml = (q, i) => (q.type === 'emoji' ? `<span class="emo">${q.options[i]}</span>` : `<span class="n">${q.type === 'tf' ? '' : '①②③④'[i]}</span>${q.options[i]}`);

async function runPop(q) {
  if (!q || UI.quiz || UI.event || UI.msgr) return;
  const L = QZ.quizData().lines;
  const tag = q.kind === 'study' ? '✏️ 공부 퀴즈' : q.type === 'tf' ? '⭕❌ O/X 퀴즈' : q.type === 'emoji' ? '😳 표정 맞히기' : q.kind === 'story' ? '📔 그때 기억나?' : '💬 팝퀴즈';
  quizOpen('pop', `<span class="tag">${tag}</span>${q.verified ? '' : `<span class="warn">⚠️ 출처 1곳 · 미확인</span>`}`);
  ask(q.kind === 'study' ? `이 문제 같이 풀어 줘!\n${q.q}` : `${L.popIntro[Math.floor(Math.random() * L.popIntro.length)]}\n${q.q}`, q.kind === 'study' ? 'E07' : undefined);
  const pick = await options(q.options.map((_, i) => ({ key: String(i), html: optHtml(q, i) })));
  const r = QZ.answerPop(S, q, +pick.key);
  mark(q.answer, pick.el);
  await sleepMs(900);
  quizClose();
  react(r, { caption: q.gen ? (q.kind === 'study' ? '✏️ 성적 +4 (맞혔을 때)' : '') : `출처: ${srcText(q.src)}${q.verified ? '' : ' · ⚠️ 미확인'}` });
  const dt = deltaText(r.delta); toast(r.piece ? `🧩 포토카드 조각 획득! · ${dt}` : dt || '같이 놀아서 재밌었어!');
  save(S);
}

async function runExam() {
  if (UI.quiz || UI.event || !QZ.examDue(S)) return;
  const L = QZ.quizData().lines, from = STAGES[S.exam.unlocked], to = STAGES[S.exam.unlocked + 1];
  const head = (i, dots) => `<span class="tag">📝 성장 시험</span><span>${from.name} → ${to.name}</span><span class="dots">${dots}</span>`;
  quizOpen('exam', head(0, '○○○'));
  ask(L.examIntro + (QZ.careBonus(S) ? '\n✨ 컨디션 보너스! 요즘 컨디션 좋아서 보기가 2개만 나와.' : QZ.hintLevel(S) ? `\n${L.examHint}` : ''), 'E07');
  const foot = $('quizFoot');
  const go = await new Promise((res) => {
    const a = document.createElement('button'); a.textContent = '시작!'; a.onclick = (e) => { e.stopPropagation(); res(true); };
    const b = document.createElement('button'); b.textContent = '나중에'; b.className = 'ghost2'; b.onclick = (e) => { e.stopPropagation(); res(false); };
    foot.replaceChildren(a, b);
  });
  foot.replaceChildren();
  if (!go) { quizClose(); box.show(L.examLater); setOverride('E01', 2500); return; }
  const qs = QZ.pickExam(S), marks = [];
  let n = 0;
  for (let k = 0; k < qs.length; k++) {
    const q = qs[k];
    $('quizHead').innerHTML = head(k, [...marks, ...Array(3 - marks.length).fill('○')].join(''));
    ask(`${k + 1}번! ${q.q}`, 'E07');
    const idx = QZ.examOptions(S, q), spark = QZ.hintLevel(S) >= 2;
    const pick = await options(idx.map((i) => ({ key: String(i), html: optHtml(q, i), cls: spark && i === q.answer ? 'spark' : '' })));
    const ok = +pick.key === q.answer; if (ok) n++;
    marks.push(ok ? '⭕' : '❌'); mark(q.answer, pick.el);
    $('quizHead').innerHTML = head(k, [...marks, ...Array(3 - marks.length).fill('○')].join(''));
    setOverride(ok ? 'E01' : 'E13', 1200);
    box.show(ok ? '정답!' : `땡~ 정답은 '${q.options[q.answer]}'!`, { instant: true }); clearTimeout(box.hideTimer);
    await sleepMs(1100);
  }
  const r = QZ.finishExam(S, n);
  quizClose();
  if (r.pass) {
    UI.lastRoomKey = ''; renderAll();
    react({ text: L.examPass[0], expr: 'hop', then: 'E01', fx: '🎓' }, { caption: `${n}/3 정답 · 통과!` });
    toast(`🎓 ${r.to.name}이 됐어요! 📸 포토카드 획득`);
  } else {
    const hint = S.exam.fails >= QZ.HINT_AFTER ? ' · 다음엔 힌트 있음' : '';
    react({ text: L.examFail[Math.floor(Math.random() * L.examFail.length)], expr: 'E02', then: 'E01', fx: '🍀' }, { caption: `${n}/3 정답 · 내일 다시 도전 (벌점 없음)${hint}` });
    toast('📝 내일 다시 볼 수 있어요');
  }
  save(S);
}

async function runTaste(set) {
  if (!set || UI.quiz || UI.event) return;
  if (!QZ.canTaste(S)) { box.show(QZ.quizData().lines.tasteLimit); setOverride('E01', 2500); return; }
  const warn = set.scored ? '' : `<span class="warn">⚠️ ${set.label} · 점수 없음</span>`;
  quizOpen('taste', `<span class="tag">🎯 취향 맞히기</span><span>${set.topic}</span>${warn}`);
  ask(set.ask, 'E01');
  const ic = (name) => { const p = ICONS.icons[name] || [0, 0], c = ICONS.cell || 64; return `<span class="ticon" style="background-position:-${p[0] * c}px -${p[1] * c}px"></span>`; };
  const pick = await options(set.options.map((o) => ({ key: o.icon, html: `${ic(o.icon)}<span>${o.label}</span>` })), true);
  const r = QZ.answerTaste(S, set, pick.key);
  mark(set.answer, pick.el);
  await sleepMs(900);
  quizClose();
  const name = set.item || set.options.find((o) => o.icon === set.answer).label;
  react(r, { caption: `출처: ${srcText(set.src)}${set.scored ? '' : ' (원작 소설) · 드라마 미확인'}` });
  if (r.ok && !r.had) toast(`🎁 '${name}' 획득 → ${set.spot}`); else toast(deltaText(r.delta) || '고마워!');
  save(S);
}
$('btnExam').onclick = () => { tick(); runExam(); };
$('btnTaste').onclick = () => { $('giftSheet').hidden = true; tick(); runTaste(QZ.pickTaste(S)); };
function examNudge() {
  if (!QZ.examDue(S) || S.asleep || UI.event || UI.quiz || UI.mg || S.exam.nudged === dayKey(gnow())) return;
  S.exam.nudged = dayKey(gnow()); save(S);
  box.show(QZ.quizData().lines.examReady[0]); setOverride('E01', 3000); renderScene();
}


// ── Stage 6: 같이 놀기 → 미니게임 메뉴 ──
function buildPlayMenu() {
  MG.ensureMg(S);
  const n = MG.playsToday(S), left = Math.max(0, MG.FULL_PLAYS - n), best = S.minigame.best[stageOf(S).id] || 0;
  $('playCatchInfo').textContent = `${MG.ROUND_SEC}초 · 우유는 피하기! · 최고 ${best}점 · ${left ? `보상 100% ${left}판 남음` : '오늘은 보상 조금씩 줄어요'}`;
  const tl = QZ.TASTE_PER_DAY - (S.daily.taste || 0), hasT = QZ.tasteSetsFor(S).length > 0;
  $('playTasteInfo').textContent = hasT ? `4지선다 · 오늘 ${Math.max(0, tl)}/${QZ.TASTE_PER_DAY}` : '아직 열린 문제가 없어요';
  document.querySelector('[data-play="taste"]').disabled = !QZ.canTaste(S);
}
function startCatch() {
  if (UI.quiz || UI.event || UI.mg || S.asleep) return;
  if (!MG.canStart(S)) { say(doAction(S, 'play')); return; }   // 체력<10: 졸린 대사(기존 규칙)
  UI.mg = true; box.hide && box.hide(); setOverride('idle', 10);
  openCatch(S, { save: () => save(S), place: () => curPlace(), onExit: catchExit });
}
function catchExit(rw, reason) {
  UI.mg = false; UI.lastRoomKey = ''; AU.setSound(S.settings.sound); if (rw) spend(ACTION_MIN.minigame); save(S); renderAll(); checkRewards(2200);
  if (rw) { setOverride(rw.tier === 'ok' ? 'E02' : 'E01', 3000); toast([`💗 기분 +${rw.mood}`, rw.crush ? `💓 설렘 +${rw.crush}` : ''].filter(Boolean).join(' · ')); }
  else if (reason === 'quit') { box.show('에이, 벌써 끝? …다음엔 끝까지 하자!'); setOverride('E13', 2500, 'E01'); }
  maybeEvent(2500);
}
$('playMenu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-play]'); if (!b || b.disabled) return;
  $('playSheet').hidden = true; tick(); AU.sfx('sfx_tap');
  if (TT.locked(S, 'play') || TT.capLeft(S, 'play') <= 0) return;
  TT.useCap(S, 'play'); renderActs();
  if (b.dataset.play === 'catch') return startCatch();
  if (b.dataset.play === 'taste') { spend(ACTION_MIN.talk); return runTaste(QZ.pickTaste(S)); }
  say(act('play')); maybeEvent();
});

// ── 설렘 순간: 쌍즈가 묻고 → 대답 고르기 → 반응 + 💓 수치 (data/moments.json) ──
/** 캐릭터 위에 '+5 💓' 떠오르기. 0이면 '💓 +0' 회색 */
function gainFloat(d) {
  const el = document.createElement('div');
  el.className = 'gain-float' + (d > 0 ? ' up' : d < 0 ? ' down' : ' zero');
  el.textContent = `${d > 0 ? '+' : ''}${d} 💓`;
  $('charWrap').appendChild(el); setTimeout(() => el.remove(), 2000);
  if (d > 0) { const h = document.querySelector('.stat[data-k="crush"]') || null; h && (h.classList.remove('flash'), void h.offsetWidth, h.classList.add('flash')); }
}
async function runMoment(m) {
  if (!m) return;
  const vis = MO.visibleChoices(S, m);
  return runBeat({ ask: m.ask, caption: '💓 설렘 순간', choices: vis.map(({ c }) => c), apply: (k) => MO.answerMoment(S, m, vis[k].i) });
}
/** 삐짐 장면(돌봄 결과): 어떤 대답이든 기분이 돌아옴, 벌점 없음 */
async function runSulk(sk) {
  if (!sk) return;
  GL.markSulk(S); save(S);
  return runBeat({ ask: sk.ask, caption: '💢 삐짐', choices: sk.choices, apply: (k) => {
    const c = sk.choices[k]; for (const key of ['mood', 'hunger', 'energy']) if (c[key]) S.stats[key] = Math.max(0, Math.min(100, S.stats[key] + c[key]));
    MO.noteReaction(S, `S:${sk.id}:${k}`); bump(S, 'sulkSoothed');
    return { line: { id: `SK_${sk.id}_${k}`, text: c.line }, expr: c.expr === 'eat' ? 'E01' : c.expr, then: c.then, crush: null, mood: c.mood || 0 };
  } });
}
/** 공통: 말풍선 질문 → 선택지 → 반응. apply(k) → { line, expr, then, crush } */
async function runBeat(b) {
  if (!b || UI.quiz || UI.event || UI.mg || S.asleep) return;
  UI.quiz = 'moment'; box.locked = true; document.body.classList.add('in-moment'); renderScene();
  try {
    setOverride(b.ask.expr || 'E02', 120000);
    await box.show(b.ask.text, { caption: b.caption });
    clearTimeout(box.hideTimer);
    const labels = b.choices.map((c) => c.label);
    const pick = await box.choose(labels);
    UI.noBlush = true;
    const r = b.apply(labels.indexOf(pick));
    if (r.crush != null && r.crush <= 0) AU.sfx(r.crush < 0 ? 'sfx_nope' : 'sfx_tap');
    UI.quiz = null; box.locked = false; document.body.classList.remove('in-moment');
    say({ line: r.line, expr: r.expr, then: r.then, fx: r.crush > 0 ? '💓' : r.crush < 0 ? '💢' : '' });
    setOverride(r.expr, 4200, r.then);
    if (r.crush === 0) gainFloat(0);   // 상한에 걸려 +0 (오르고 내린 건 renderStats 가 띄움)
    if (r.mood) toast(`😊 기분 +${r.mood}`);
  } finally {
    UI.quiz = null; box.locked = false; document.body.classList.remove('in-moment'); save(S); renderStats(); UI.noBlush = false;
    maybeEvent(3500);
  }
}

// ── 설렘 연출: 설렘이 바뀌면 +N 💓 · 심장 소리 · 3 이상이면 볼 빨개짐 · 10 단위를 넘으면 짧은 컷 ──
function crushJuice() {
  const v = S.stats.crush;
  if (UI.lastCrush == null || UI.lastCrushSave !== S) { UI.lastCrush = v; UI.lastCrushSave = S; return; }
  const d = Math.round((v - UI.lastCrush) * 10) / 10; if (!d) return;
  const prev = UI.lastCrush; UI.lastCrush = v;
  if (UI.ending) return;
  gainFloat(Math.round(d));
  if (d > 0) {
    AU.sfx('sfx_heartbeat');
    if (d >= 3 && !UI.event && !UI.mg && !UI.noBlush) setOverride('E19', 2600, 'E01');
    for (let t = Math.floor(prev / 10) * 10 + 10; t <= v; t += 10) if (!(S.cuts || {})[t]) { (S.cuts = S.cuts || {})[t] = dayKey(gnow()); (UI.cutQ = UI.cutQ || []).push(t); }
    setTimeout(showCut, 1400);
  }
  const capped = S.daily.crushCapped; const key = `${S.daily.date}:${capped}`;
  if (capped && UI.capToast !== key) { UI.capToast = key; setTimeout(() => toast(capped === 'stage' ? '💓 지금 단계에선 여기까지 · 다음 단계에서 더 깊어져요' : '💓 오늘 설렘은 여기까지 · 내일 또'), 2100); }
}
function showCut(force) {
  const t = force ?? (UI.cutQ || [])[0]; if (t == null) return;
  if (force == null && (UI.event || UI.quiz || UI.mg || UI.ending || UI.card || DX.dexState().open || !$('crushCut').hidden)) { setTimeout(showCut, 2500); return; }
  if (force == null) UI.cutQ.shift();
  const line = (MO.momentsData().cuts || {})[t] || '';
  $('ccLv').textContent = `💓 설렘 ${t}`; $('ccLine').textContent = line; $('crushCut').hidden = false;
  AU.sfx('sfx_heartbeat'); setTimeout(() => AU.sfx('sfx_heartbeat'), 700);
  clearTimeout(UI.cutT); UI.cutT = setTimeout(() => { $('crushCut').hidden = true; if ((UI.cutQ || []).length) setTimeout(showCut, 600); }, 2800);
}
$('crushCut').addEventListener('click', () => { $('crushCut').hidden = true; clearTimeout(UI.cutT); if ((UI.cutQ || []).length) setTimeout(showCut, 600); });

// ── 목표판 ──
function renderGoalBadge() {
  const b = GL.goalBoard(S); const el = $('btnGoals'); if (!el) return;
  $('goalBadge').textContent = b.total ? `${b.done}/${b.total}` : '';
  el.classList.toggle('done', b.complete);
}
function openGoals() {
  const b = GL.goalBoard(S), st = stageOf(S), nx = GL.nextEvent(S, getEvents());
  const rx = reactionCount();
  const careLine = `🌤️ 좋은 컨디션 연속 ${S.care.streak || 0}일 (최고 ${S.care.best || 0}) · 오늘 평균 컨디션 ${Math.round(S.daily.condT > 0 ? S.daily.condSum / S.daily.condT : condition(S))}` + ((S.care.streak || 0) >= 2 ? ' · ✨ 컨디션 보너스: 시험 보기 2개 · 설렘 하루 상한 +2' : ' · 2일 연속이면 보너스');
  const room = crushRoom(S);
  const next = STAGES[STAGES.indexOf(st) + 1];
  const note = b.finished ? (next ? `✅ 다 했어요! ${next.name} 성장 시험이 하루 일찍 열려요.` : '✅ 목표 전부 완료!') : next ? `다 하면 ${next.name} 성장 시험이 하루 일찍 열려요.` : '마지막 단계 목표예요.';
  $('goalTitle').textContent = `🎯 ${st.name} 목표판 · ${b.done}/${b.total}`;
  const sg = QZ.storyGate(S), sgHint = sg.next ? (GL.goalsData().hints || {})[sg.next] || '' : '';
  const gateLine = next ? `<p class="gnote gate">📝 ${next.name} 성장 시험까지: 이벤트 ${sg.seen}/${sg.total}${sg.ok ? ' ✅' : ` · 다음: ${sgHint || '조금 더 함께 지내면…'}`}</p>` : '';
  $('goalBody').innerHTML = gateLine + `<div class="gbar"><i style="width:${b.pct}%"></i></div><p class="gnote">${note}</p>
    <ul class="glist">${b.list.map((m) => `<li class="${m.ok ? 'ok' : ''}"><span>${m.icon || '•'}</span><b>${m.text}</b><small>${m.cur}/${m.n}</small></li>`).join('')}</ul>
    ${nx ? `<div class="gnext"><div class="gsil" style="background-image:url('assets/events/${nx.id}_t.webp')"></div><div><small>다음 이야기</small><b>${nx.id} · ???</b><small>힌트: ${nx.hint || '조금 더 함께 지내면…'}</small></div></div>` : ''}
    <p class="gcare">${careLine}<br>💓 오늘 설렘 +${Math.round(S.daily.crushGain || 0)}/${room.daily} · 이 단계 상한 ${room.stageCap}${rx ? `<br>💬 아직 못 본 반응 ${rx.left}개` : ''}</p>`;
  $('goalSheet').hidden = false;
}
$('btnGoals').onclick = () => { if (UI.event || UI.quiz || UI.mg) return; AU.sfx('sfx_tap'); openGoals(); };
function checkGoalDone() {
  const id = GL.checkGoals(S); renderGoalBadge(); if (!id) return false;
  save(S); AU.sfx('sfx_levelup'); toast('🎯 목표 전부 완료!');
  setTimeout(() => { box.show((GL.goalsData().doneLine || {})[id] || '목표 완료!'); setOverride('hop', 2000, 'E01'); }, 900);
  return true;
}
// ── 반응 수집 · 2회차 ──
function reactionCount() {
  const keys = [...MO.momentReactionKeys(S), ...GL.eventReactionKeys(S, getEvents()), ...GL.sulkReactionKeys()];
  return keys.length ? GL.unseenReactions(S, keys) : null;
}
async function startNewGamePlus(skipAsk) {
  if (!GL.canNewGamePlus(S)) return;
  if (skipAsk !== true && !(await uiConfirm(`${(S.ng || 0) + 2}회차를 시작할까요? 이야기는 처음부터지만 도감·포토카드·반응 기록은 이어져요. 새 선택지(✨)도 열려요.`, { ok: '시작', danger: false }))) return;
  S = GL.newGamePlus(S); DX.setDexState(S); save(S); $('settingsSheet').hidden = true; UI.lastRoomKey = ''; UI.lastCrush = null; renderAll();
  say({ line: { id: 'SYS_ng', text: (ST.storyData() && ST.storyData().ngPlus) || '…별이 또 떨어졌다. 어? 처음 보는 사람 같지 않아. 이상하다. 아무튼, 잘 부탁해!' }, expr: 'E02', then: 'E01' });
  setTimeout(() => maybeEvent(), 3000);
}
$('btnNG').onclick = startNewGamePlus;
/** 돌아왔을 때: 삐짐(오래 비움·배고픔) 또는 좋은 날 연속 인사 */
function greetReturn(away) {
  const sk = GL.sulkDue(S, away);
  if (sk) { setTimeout(() => runSulk(sk), 1800); return true; }
  return false;
}

// ── 루프 ──
function tick() { advance(S); if (S.autoWoke) { S.autoWoke = false; say({ line: pickSys('autoWake'), expr: 'E01' }); } }
function renderAll() { renderStats(); renderScene(); }

/** 안드로이드 뒤로가기: 맨 위에 열린 창 하나 닫기. 닫은 게 있으면 true */
function closeTop() {
  const vis = (id) => $(id) && !$(id).hidden;
  if (END.endingOpen()) { END.skipEnding(); return true; }
  if (vis('cardModal')) { $('cardModal').click(); return true; }
  if (closeConfirm()) return true;
  if (vis('debug')) { $('debug').hidden = true; return true; }
  const sh = [...document.querySelectorAll('.sheet')].find((x) => !x.hidden); if (sh) { sh.hidden = true; return true; }
  if (vis('msgr')) { $('msgrBack').click(); return true; }
  if (vis('dex')) { $('dexClose').click(); return true; }
  if (vis('mg')) { if (vis('mgPause')) $('mgResume').click(); else if (vis('mgTitle')) $('mgLater').click(); else if (vis('mgResult')) $('mgDone').click(); else $('mgPauseBtn').click(); return true; }
  return false;
}
async function boot() {
  initGuard();
  QZ.setGenSource(() => ({ lines: allLines(), events: getEvents() }));
  initMobile({ save: () => save(S), toast, closeTop });
  buildStats(); bindCatch(); END.bindEnding(); AU.setSound(S.settings.sound);
  MU.initMusic(); MU.setMusicResolver(musicSlot); applyVolumes();
  await Promise.all([loadIllustIndex(), loadDialogue(), ensureSheet(stageOf(S).id), ensureSheet(wantedSheet()), loadRooms([S.place || (STAGE_PLACES[stageOf(S).id] || [])[0]]), QZ.loadQuiz(), MO.loadMoments(), GL.loadGoals(), MS.loadMessenger(), ST.loadStory(), loadIcons(), loadCatchIcons(), VO.initVoice()]);
  if (typeof window !== 'undefined') window.__voice = VO.voiceInfo;
  onSheet((id, kind) => { if (kind === 'thumb') return; if (kind === 'room') UI.lastRoomKey = ''; else UI.lastDraw = ''; renderScene(); });
  buildFeedMenu();   // Stage 7a: 픽셀 아이콘(catch.png) 로드 후
  await DX.loadDex(ICONS); DX.setDexState(S);
  DX.bindDex({ tap: () => AU.sfx('sfx_tap'), close: () => { trimSheets([stageOf(S).id, wantedSheet()]); UI.lastRoomKey = ''; renderAll(); }, cardClosed: () => { UI.card = false; UI.lastRoomKey = ''; renderAll(); }, replay: (id) => { UI.lastRoomKey = ''; renderAll(); setTimeout(() => playEvent(id), 200); }, ending: () => { UI.lastRoomKey = ''; renderAll(); setTimeout(() => startEnding(), 200); }, equip: () => { save(S); UI.lastDraw = ''; } });
  { const q = new URLSearchParams(location.search);   // Stage 8 디버그: ?debug=1&unlock=all|events|cards, ?debug=1&event=E10 (바로 재생)
    if (q.get('debug') === '1') {
      const u = q.get('unlock') || '';
      if (u === 'all' || u === 'events') for (const id of EV_ORDER) S.events[id] = S.events[id] || dayKey(gnow());
      if (u === 'all' || u === 'cards') { S.pcards = S.pcards || {}; for (let i = 1; i <= 10; i++) { const k = 'P' + String(i).padStart(2, '0'); S.pcards[k] = S.pcards[k] || dayKey(gnow()); } }
      // ?debug=1&ending=1: 전부 해금한 상태로 엔딩 바로 재생
      if (q.get('ending') === '1') { for (const id of EV_ORDER) S.events[id] = S.events[id] || dayKey(gnow()); S.pcards = S.pcards || {}; for (const c of CL.PHOTOCARDS) S.pcards[c.id] = S.pcards[c.id] || dayKey(gnow()); setTimeout(() => startEnding(), 800); }
      if (q.get('event')) setTimeout(() => { delete S.events[q.get('event')]; playEvent(q.get('event')); }, 600);
      // ?debug=1&moment=M1: 설렘 순간 바로 띄우기(오늘 횟수 무시)
      if (q.get('moment')) setTimeout(() => runMoment(MO.momentById(q.get('moment'))), 1500);
      // 게임성 개편 디버그: &stage=high|uni|grad · &crush=N · &good=N(좋은 날 연속) · &goals=1(목표판) · &goalsdone=1(목표 다 채움) · &cut=30(설렘 컷) · &sulk=1 · &ng=1(엔딩 본 상태 → 설정에 2회차 버튼)
      { const sid = q.get('stage'); const k = STAGES.findIndex((x) => x.id === sid);
        if (k > 0) { S.gt.day = STAGES[k].fromDay; S.exam.unlocked = k; S.exam.nextAt = 0; for (const id of EV_ORDER.slice(0, k === 1 ? 2 : k === 2 ? 4 : 12)) S.events[id] = S.events[id] || dayKey(gnow()); } }
      // &clock=20:30 → 게임 시계 맞추기 · &day=N → D+N
      if (q.get('day')) S.gt.day = Math.max(1, +q.get('day') || 1);
      if (q.get('clock')) { const [hh, mm] = q.get('clock').split(':').map(Number); S.gt.min = Math.max(0, Math.min(23 * 60 + 30, (hh || 0) * 60 + (mm || 0))); }
      if (q.get('crush')) S.stats.crush = Math.max(0, Math.min(100, +q.get('crush') || 0));
      if (q.get('good')) S.care.streak = +q.get('good') || 0;
      if (q.get('goalsdone') === '1') { const b = GL.goalBoard(S); const c = (S.sc[b.stage] = S.sc[b.stage] || {}); for (const m of b.list) { if (m.kind === 'count') c[m.key] = m.n; if (m.kind === 'event') S.events[m.id2] = S.events[m.id2] || dayKey(gnow()); if (m.kind === 'stat') S.stats[m.key] = Math.max(S.stats[m.key], m.n); if (m.kind === 'streak') S.streak = { study: m.n, last: dayKey(gnow()) }; } }
      if (q.get('goals') === '1') setTimeout(openGoals, 1500);
      if (q.get('cut')) setTimeout(() => showCut(+q.get('cut')), 1500);
      if (q.get('sulk') === '1') { S.care.sulk = ''; setTimeout(() => runSulk(GL.sulkDue(S, 99)), 1500); }
      // 메신저 파일럿: &msg=mid_d1 | uni_drunk (바로 열기) · &name=이름 · &askname=1(이름 입력 화면) · &fast=1(빠르게)
      if (q.get('name')) S.player.name = MS.cleanName(q.get('name'));
      if (q.get('askname') === '1') S.player.name = '';
      if (q.get('msg')) { const ep = MS.episode(q.get('msg')); if (ep) { delete S.msgr.done[ep.id]; if (ep.event) S.events[ep.event] = S.events[ep.event] || dayKey(gnow()); UI.debugMsg = ep; } }
      if (q.get('ng') === '1') { S.ending = S.ending || { first: dayKey(gnow()), count: 1 }; setTimeout(openSettings, 1500); }
    } }
  const qp = new URLSearchParams(location.search).get('place'); if (qp && PLACES[qp]) S.place = qp;
  requestAnimationFrame(renderChar);
  await runTitle();
  const away = advance(S);
  save(S); renderAll();
  DX.setDexExtra({ reactions: reactionCount });
  const needName = !S.player.name && (!navigator.webdriver || new URLSearchParams(location.search).get('askname') === '1');
  if (needName) { await ST.playStory('open'); await askName(); say({ line: { id: 'SYS_name', text: MS.fill('{call}! 이따 밤 9시에 문자할게. 폰 꼭 봐!', S.player.name) }, expr: 'hop', then: 'E01' }); }
  else if (UI.debugMsg) setTimeout(() => openMsgr(UI.debugMsg), 600);
  else if (firstRun || UI.titleReset) say({ line: { id: 'SYS_new', text: '안녕! 나 쌍즈야. 앞으로 잘 부탁해! …꼬맹이라고 부르면 삐질 거야.' }, expr: 'E01' });
  else if (!S.asleep && greetReturn(away)) { /* 삐짐 장면 */ }
  else if (away >= 3 && !S.asleep) say({ line: pickSys('welcomeBack'), expr: 'E10', then: 'E13' });
  else if (!S.asleep && (S.care.streak || 0) >= 2 && S.care.greeted !== dayKey(gnow())) { S.care.greeted = dayKey(gnow()); say({ line: pickSys('goodStreak'), expr: 'hop', then: 'E01' }); }
  else if (!S.asleep) say({ line: pickSys('hello'), expr: 'E01' });

  if (!firstRun) setTimeout(examNudge, 2500);
  maybeEvent(4000);
  renderMsgDot(); setTimeout(() => { checkTantrum(); if (!UI.title) showMsgPop(); }, 2500);
  setInterval(() => { if (document.hidden) return; renderMsgDot(); if (UI.msgPopLater && !UI.event && !UI.quiz && !UI.mg && $('msgPop').hidden && $('cardModal').hidden) showMsgPop(); tick(); save(S); renderStats(); if (!box.busy) maybeEvent(); if (!UI.mg) renderScene(); }, 5000);         // 실시간 감소 + 이벤트 해금 확인
  setInterval(() => { if (document.hidden) return; UI.frame ^= 1; renderScene(); }, 600);              // 2프레임 애니
  addEventListener('resize', () => { UI.lastRoomKey = ''; renderScene(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { const a = advance(S); renderAll(); if (!S.asleep && greetReturn(a)) return; if (a >= 3 && !S.asleep) say({ line: pickSys('welcomeBack'), expr: 'E10', then: 'E13' }); } else save(S); });
}
// ── 메신저(파일럿): 이름 입력 · 밤 9시 채팅 ──
function askName() {
  return new Promise((res) => {
    const sh = $('nameSheet'), inp = $('nameInput'); sh.hidden = false; inp.value = S.player.name || '';
    setTimeout(() => { try { inp.focus(); } catch {} }, 100);
    const ok = () => { const v = MS.cleanName(inp.value); if (!v) { inp.focus(); toast('이름을 적어 줘!'); return; } S.player.name = v; save(S); sh.hidden = true; AU.sfx('sfx_tap'); res(v); };
    $('nameOk').onclick = ok; inp.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
  });
}
function renderMsgDot() { const p = msgUnread(); const d = $('msgDot'); if (d) d.hidden = !p; $('btnMsg').classList.toggle('unread', !!p); }
/** 21시 지나고 아직 안 읽은 오늘 문자 */
const msgUnread = () => (S.gt.min >= MSG_AT_MIN ? MS.pending(S, gnow(), stageOf(S).id) : null);
function showMsgPop() {
  const ep = msgUnread(); if (!ep || UI.msgr || UI.title || UI.ending) return false;
  if (UI.event || UI.quiz || UI.mg || UI.card || !$('cardModal').hidden) { UI.msgPopLater = true; return false; }
  const first = (ep.lines || []).find((l) => l.t === 'sz');
  $('mpText').textContent = first ? MS.fill(first.text, S.player.name).slice(0, 60) : '자? 할 얘기 있어…';
  $('mpTime').textContent = ep.at || clockText(S);
  $('msgPop').hidden = false; UI.msgPopLater = false; renderMsgDot();
  try { navigator.vibrate && navigator.vibrate([180, 90, 180]); } catch {}
  AU.sfx('sfx_heartbeat');
  return true;
}
$('mpGo').onclick = () => { $('msgPop').hidden = true; const ep = msgUnread(); if (ep) openMsgr(ep); };
$('mpLater').onclick = () => { $('msgPop').hidden = true; AU.sfx('sfx_tap'); };
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(() => { if ($('msgPop').hidden) showMsgPop(); }, 600); });
// ── v0.9.4 때쓰기 · 하루 횟수 ──
const CAP_NAME = { study: '공부', talk: '대화', play: '놀기' };
const CAP_LINES = { study: '오늘 공부는 여기까지!! 머리 터질 것 같아…', talk: '오늘 할 말 다 했어~ 목 아파. 내일 또 얘기해!', play: '나 오늘 너무 많이 놀았어… 내일 또 놀자!' };
function renderActs() {
  document.querySelectorAll('.act').forEach((b) => {
    const a = b.dataset.act, left = TT.capLeft(S, a), cap = b.querySelector('.cap');
    if (cap) cap.textContent = a === 'gift' ? `💓${Math.max(0, 2 - (S.daily.gifts || 0))}` : `${left}/${TT.DAILY_CAPS[a]}`;
    b.classList.toggle('capped', left <= 0); b.classList.toggle('ttlock', TT.locked(S, a));
  });
  const t = S.tantrum, el = $('tantrum'), ep = EP.pending(S);
  el.classList.toggle('evp', !!ep);
  if (ep) {
    document.querySelectorAll('.act').forEach((b) => b.classList.add('ttlock'));
    $('ttIcon').textContent = '✨'; $('ttWant').textContent = `${ep.icon} ${ep.name} · 새 장소`;
    $('ttLine').textContent = MS.fill(ep.line, S.player.name);
    $('ttLock').textContent = '🔒 다른 행동 잠김 · 거기 가야 이야기가 시작돼요';
    $('ttGo').textContent = '▶ 가기'; el.hidden = false; return;
  }
  $('ttGo').textContent = '데려가기 ›';
  if (!t || S.asleep) { el.hidden = true; return; }
  const K = TT.KINDS[t.kind], P = placeInfo(t.want, stageOf(S).id);
  $('ttIcon').textContent = K.icon; $('ttWant').textContent = `${K.label}! ${P.icon || ''} ${P.name || ''}`;
  $('ttLine').textContent = MS.fill(t.line, S.player.name);
  $('ttLock').textContent = `🔒 ${K.locks.map((x) => ({ play: '놀기', study: '공부', gift: '선물' })[x]).join('·')} 잠김 · 오래 무시하면 삐져요`;
  el.hidden = false;
}
function bounceTantrum() { const el = $('tantrum'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
function checkTantrum() {
  const r = TT.tick(S);
  if (r && r.penalty) {
    S.stats.mood = Math.max(0, S.stats.mood + r.penalty.mood); S.stats.crush = Math.max(0, S.stats.crush + r.penalty.crush);
    setTimeout(() => { say({ line: { id: 'SYS_tt_ign', text: MS.fill(r.line, S.player.name) }, expr: 'E13', then: 'E01', note: `😤 삐졌어요 · 기분 ${r.penalty.mood} · 💓 ${r.penalty.crush}` }); }, 400);
  }
  if (UI.event || UI.quiz || UI.mg || UI.msgr || S.asleep || EP.pending(S) || dueEvent(S)) return;   // 이야기(이벤트)가 먼저
  const st = stageOf(S).id, d = TT.due(S, { stageId: st, avail: placesFor(st) });
  if (d) {
    TT.start(S, d, st); save(S);
    try { navigator.vibrate && navigator.vibrate(60); } catch {}
    setTimeout(() => { AU.sfx('sfx_nope'); say({ line: { id: 'SYS_tt', text: MS.fill(S.tantrum.line, S.player.name) }, expr: 'E13', then: 'E01' }); renderActs(); }, 500);
  }
  renderActs();
}
$('ttGo').onclick = (e) => { e.stopPropagation(); const ep = EP.pending(S); if (ep) { AU.sfx('sfx_tap'); goPlace(ep.place); return; } if (S.tantrum) { AU.sfx('sfx_tap'); goPlace(S.tantrum.want); } };
// ── 게임 속 시간: 행동마다 흐르고, 21시엔 문자, 밤잠이면 다음 날 ──
function act(a, x) { const r = timedAction(S, a, x); afterTime(r.time); if (r.nap) setTimeout(() => toast(`💤 낮잠 · 체력 +${r.gain} (${clockText(S)})`), 300); if (r.night) dayTransition(r.day); return r; }
function spend(min) { afterTime(passTime(S, min)); }
function afterTime(t) {
  if (!t) return;
  checkTantrum();
  renderScene(); renderMsgDot();
  const day = dayNumber(S);
  if (S.gt.min >= MSG_AT_MIN && S.msgr.notified !== day && MS.pending(S, gnow(), stageOf(S).id)) {
    S.msgr.notified = day; save(S);
    setTimeout(() => { AU.sfx('sfx_sparkle'); showMsgPop(); const b = $('btnMsg'); b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); }, 900);
  }
}
/** 밤에 '재우기': 문자가 아직이면 21시로 → 폰이 울림 / 안 읽었으면 한 번은 먼저 보라고. true = 재우기 멈춤 */
function nightMsgFirst() {
  if (S.gt.min < NIGHT_SLEEP_MIN) return false;
  const day = dayNumber(S);
  if (S.gt.min < MSG_AT_MIN) { const t = passTime(S, MSG_AT_MIN - S.gt.min); afterTime(t); if (MS.pending(S, gnow(), stageOf(S).id)) { toast('📱 자려는데 폰이 울렸다…'); return true; } return false; }
  if (MS.pending(S, gnow(), stageOf(S).id) && S.msgr.asked !== day) { S.msgr.asked = day; toast('💬 쌍즈 문자 먼저 볼래요? (한 번 더 누르면 그냥 자요)'); const b = $('btnMsg'); b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); return true; }
  return false;
}
function dayTransition(day) {
  const f = $('dayFade'); if (!f) return;
  f.querySelector('b').textContent = `D+${day}`; f.querySelector('small').textContent = `${stageOf(S).name} · ☀️ 아침 ${clockText(S)}`;
  f.hidden = false; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  UI.lastRoomKey = ''; save(S);
  setTimeout(() => { f.hidden = true; renderAll(); renderMsgDot(); renderGoalBadge && renderGoalBadge(); say(morningLine(S)); setTimeout(checkTantrum, 2500); maybeEvent(1200); }, 2600);
}
async function openMsgr(ep) {
  if (UI.msgr) return;
  if (UI.quiz || UI.event || UI.mg) { UI.msgPopLater = true; return; }
  if (!S.player.name) await askName();
  UI.msgr = true; AU.sfx('sfx_tap');
  const fast = new URLSearchParams(location.search).get('fast') === '1';
  try { await MS.runChat($('msgr'), S, ep, { fast, sfx: () => AU.sfx('sfx_tap') }); } finally { UI.msgr = false; save(S); renderMsgDot(); }
}
$('btnMsg').onclick = () => {
  if (UI.event || UI.quiz || UI.mg) return;
  const ep = MS.pending(S, gnow(), stageOf(S).id);
  if (ep) openMsgr(ep); else { AU.sfx('sfx_tap'); toast(S.gt.min < MSG_AT_MIN ? `아직 새 메시지 없음 · 밤 9시에 쌍즈가 문자해요 (지금 ${clockText(S)})` : '오늘 문자는 다 읽었어요. 재우기로 하루를 끝내요 🌙'); }
};
$('msgrBack').onclick = () => { const r = $('msgr'); if (r._abort) r._abort(); };
// ── 타이틀(메인) 화면: 이어하기 / 새로 시작 / 설정. 자동 테스트(webdriver)·?notitle=1·디버그 바로 재생 때는 건너뜀(?title=1 이면 항상) ──
function wantTitle() {
  const q = new URLSearchParams(location.search);
  if (q.get('title') === '1') return true;
  if (q.get('notitle') === '1' || q.get('event') || q.get('moment') || q.get('ending') === '1' || (q.get('debug') === '1' && ['goals', 'cut', 'sulk', 'ng', 'stage', 'msg'].some((k) => q.get(k)))) return false;
  return !navigator.webdriver;
}
async function runTitle() {
  if (!wantTitle()) return;
  UI.title = true; renderAll();
  for (;;) {
    const hasSave = !firstRun && !UI.titleReset;
    const pick = await showTitle({ hasSave, onFirstTap: () => updateMusic(), onSettings: () => { AU.sfx('sfx_tap'); openSettings(); } });
    AU.sfx('sfx_tap');
    if (pick === 'new' && hasSave) {
      if (!(await uiConfirm('처음부터 새로 키울까요?\n저장된 기록이 모두 지워져요.', { ok: '새로 시작' }))) continue;
      resetGame(); UI.titleReset = true;
    }
    break;
  }
  UI.title = false; UI.lastRoomKey = ''; renderAll();   // 타이틀 곡 → 장소 곡 크로스페이드
}
// 테스트/디버그용 훅
function forceNost(on = '대화', extra = {}) {
  const d = new Date(gnow());
  const ctx = { on, stage: stageOf(S).dlg, state: moodState(S), place: S.place, crush: S.stats.crush, grade: S.stats.grade, events: S.events || {}, month: d.getMonth() + 1, time: timeOfDay().id, ...extra };
  const l = pickNostalgia(ctx, S, true); if (l) say({ line: l, expr: l.expr }); return l;
}
window.SZ = { EP, buildPlaceMenu, TT, checkTantrum, showMsgPop, renderActs, MS, openMsgr: (id) => openMsgr(MS.episode(id)), askName, GL, openGoals, showCut, runSulk, reactionCount, startNewGamePlus, resetGame, MO, runMoment: (id) => runMoment(id ? MO.momentById(id) : MO.dueMoment(S)), gainFloat, END, startEnding, get ending() { return END.endingState(); }, get evShot() { return UI.evShot; }, skipEvent, checkPhotoCards, get state() { return S; }, get sheet() { return charSheet(); }, box, playEvent, forceNost, get event() { return UI.event; }, get food() { return UI.food; }, get lastLine() { return UI.lastLine; }, goPlace, get place() { return curPlace(); }, fastForward, say, setOverride, get anim() { return currentAnim(performance.now()).name; }, doAction: (a, x) => { const r = act(a, x); say(r); return r; }, spend, nightMsgFirst, get clock() { return clockText(S); }, renderAll, save: () => save(S),
  runPop: (id) => runPop(id ? QZ.quizData().questions.find((q) => q.id === id) : QZ.pickPop(S)), runExam, runTaste: (id) => runTaste(id ? QZ.quizData().taste.find((t) => t.id === id) : QZ.pickTaste(S)), get quiz() { return UI.quiz; }, QZ,
  MG, AU, MU, get music() { return MU.musicInfo(); }, get musicSlot() { return musicSlot(); }, startCatch, closeCatch, get mg() { return catchState(); }, mgDebug: catchDebug, buildPlayMenu,
  CL, DX, openDex: (t) => DX.openDex(S, t), closeDex: DX.closeDex, get dex() { return DX.dexState(); }, checkRewards, dexProgress: () => DX.dexProgress(S) };
boot();
