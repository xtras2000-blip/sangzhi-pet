import { STATS, GAME_VERSION, FOODS, GIFTS, STAGES, PLACES, STAGE_PLACES, OUTDOOR_SCALE, CHAR_FIT, stageScale } from './config.js';
import { newState, load, save, wipe, advance, stageOf, dayNumber, timeOfDay, moodState, dayKey } from './state.js';
import { loadDialogue, pickSys, quoteCaption, remember, eventById, pickNostalgia } from './dialogue.js';
import { doAction, pokeLine, arriveLine } from './actions.js';
import { dueEvent, dueCards, parseScript, branchSteps, eventExpr, eventShots, ORDER as EV_ORDER } from './events.js';
import { loadIllustIndex, preloadArt, hasEventArt } from './illust.js';
import * as END from './ending.js';
import { DialogBox } from './dialogbox.js';
import { drawChar, drawRoom, ensureSheet, onSheet, loadedSheets, trimSheets, touchSheet, hasSheet, cellOf, scaleRefOf, animInfo, drawSheetFrame, snapDev, blitSharp, LEGACY_EXPR, loadRooms, hasRoomImg, drawRoomImg } from './sprite.js';
import * as QZ from './quiz.js';
import * as MG from './minigame.js';
import * as AU from './audio.js';
import * as MU from './music.js';
import { wantedSlot, normVolumes } from './music_map.js';
import { showTitle, titleOpen } from './title.js';
import { openCatch, bindCatch, loadCatchIcons, catchState, catchDebug, closeCatch, iconHtml } from './catch_ui.js';
import * as CL from './collection.js';
import { getEvents } from './dialogue.js';
import * as DX from './dex_ui.js';
import { initMobile } from './mobile.js';

const $ = (id) => document.getElementById(id);
let S = load();
const firstRun = !S;
if (!S) S = newState();

const UI = { title: false, endingPhase: null, food: null, event: null, ov: null, ovStart: 0, ovUntil: 0, ovThen: null, frame: 0, lastRoomKey: '', lastDraw: '', nextBlink: Date.now() + 3000 };

// ── 장소 (Stage 3) ──
const placesFor = (st) => (STAGE_PLACES[st] || STAGE_PLACES.mid).filter((id) => hasRoomImg(id));
function curPlace() {
  const st = stageOf(S).id, list = placesFor(st);
  if (!list.includes(S.place)) S.place = list[0] || null;   // 단계가 바뀌면 그 단계의 집으로
  return S.place;
}
function goPlace(id) {
  const p = PLACES[id]; if (!p || id === S.place) { $('placeSheet').hidden = true; return; }
  if (S.asleep) { toast('자는 중이에요'); return; }
  S.place = id; $('placeSheet').hidden = true; UI.lastRoomKey = '';
  // Stage 4: 장소·단계별 도착 대사(dialogue.json action '도착'), 없으면 기본 문구
  const r = arriveLine(S, id);
  const line = r.line && r.line.action === '도착' || r.line?.action === '회상' ? r.line : { id: 'SYS_place', text: PLACE_LINES[id] || `${p.name} 도착!` };
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
  $('placeMenu').innerHTML = placesFor(st).map((id) => { const p = PLACES[id];
    return `<button class="food place${id === S.place ? ' cur' : ''}" data-place="${id}"><i>${p.icon}</i><b>${p.name}</b><small>${p.city}${p.home ? ' · 집' : ''}</small></button>`; }).join('');
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
const musicSlot = () => wantedSlot({ title: UI.title, ending: UI.endingPhase, event: UI.event, mg: UI.mg, place: curPlace(), tod: timeOfDay().id });
function updateMusic() { try { MU.playSlot(musicSlot()); } catch {} }
function applyVolumes() { const v = normVolumes(S.settings); S.settings.bgm = v.bgm; S.settings.sfx = v.sfx; AU.setSfxVolume(v.sfx); MU.applySettings(S.settings); }
function renderScene() {
  const st = stageOf(S), tod = timeOfDay();
  updateMusic();
  $('dayLabel').textContent = `D+${dayNumber(S)}`;
  $('stageLabel').textContent = st.name;
  $('todLabel').textContent = tod.icon;
  const now = new Date();
  $('clock').textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  // 방 (변할 때만 다시 그림)
  const room = $('room'), stage = $('stage');
  const w = Math.max(60, Math.round(stage.clientWidth / 4)), h = Math.max(60, Math.round(stage.clientHeight / 4));
  const place = curPlace();
  $('placeLabel').textContent = place ? `${PLACES[place].icon} ${PLACES[place].name}` : '';
  const decor = place ? DX.decorSources(S, place) : [];   // Stage 7: 방 꾸미기
  const key = `${w}x${h}|${tod.id}|${st.id}|${place}|${decor.map((d) => d.item).join(',')}`;
  if (key !== UI.lastRoomKey) {
    let ok = true;
    if (place && hasRoomImg(place)) ok = drawRoomImg(room, { tod: tod.id, place, aspect: stage.clientWidth / stage.clientHeight, decor });
    else { room.width = w; room.height = h; drawRoom(room, { tod: tod.id, stage: st.id }); }
    if (ok) UI.lastRoomKey = key;   // 배경을 아직 불러오는 중이면 다음에 다시
  }
  document.body.classList.toggle('asleep', S.asleep);
  $('btnExam').hidden = !QZ.examDue(S) || S.asleep || !!UI.quiz;
  $('sleepLabel').textContent = S.asleep ? '깨우기' : '재우기';
  document.querySelectorAll('.act').forEach((b) => (b.disabled = S.asleep && b.dataset.act !== 'sleep'));
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
function checkRewards(delay = 1800) {
  if (UI.event || UI.quiz || UI.mg || UI.card || S.asleep || DX.dexState().open) return;
  const r = CL.routineReward(S, DX.catalog()) || CL.piecesReward(S, DX.catalog());
  if (!r) return;
  save(S); UI.card = true;
  clearTimeout(rwTimer); rwTimer = setTimeout(() => {
    AU.sfx(r.rarity === '일반' ? 'sfx_gift_open' : 'sfx_sparkle'); DX.showCard(r.card, { reveal: r, state: S });
    setOverride(r.rarity === '일반' ? 'E01' : 'E19', 3000, 'E01'); renderStats();
  }, delay);
}
function checkPhotoCards() {   // Stage 8: 포토카드 P01~P10
  if (UI.event || UI.quiz || UI.mg || UI.card || S.asleep || DX.dexState().open) return false;
  const ids = dueCards(S); if (!ids.length) return false;
  S.pcards = S.pcards || {}; const id = ids[0]; S.pcards[id] = dayKey(Date.now()); save(S); UI.card = true;
  const c = DX.catalog().find((x) => x.id === `pc_${id}`);
  setTimeout(() => { AU.sfx('sfx_sparkle'); DX.showCard(c, { reveal: { dup: false, why: 'pcard' }, state: S }); setOverride('E19', 3000, 'E01'); }, 900);
  return true;
}
function maybeEvent(delay = 1600) {
  if (UI.ending) return;
  checkRewards(); if (checkPhotoCards()) return;
  if (UI.event || UI.quiz || UI.mg || UI.card || S.asleep || DX.dexState().open) return;
  const id = dueEvent(S); if (!id) return;
  clearTimeout(evTimer); evTimer = setTimeout(() => { if (!UI.event && !UI.quiz && !UI.mg && !UI.card && !DX.dexState().open && dueEvent(S) === id) playEvent(id); }, delay);
}
async function playEvent(id) {
  const ev = eventById(id); if (!ev || UI.event || UI.quiz) return;
  UI.event = id; UI.evSkip = false; box.locked = true; updateMusic();   // 이벤트 곡: 방 음악 페이드 아웃 → 이벤트 곡 페이드 인
  const wasSeen = !!(S.events || {})[id];
  // Stage 8: 전체 화면 일러스트(지연 로딩) + 천천히 패닝. 그림이 없으면 예전처럼 방 화면 위 베일
  const art = await preloadArt('event', id);
  const full = $('evFull'), bub = $('bubble'), home = bub.parentNode, homeNext = bub.nextSibling;
  if (art) {
    $('evImg').src = art; $('evTitle').textContent = ev.title; $('evEp').textContent = ev.inspired || '';
    full.hidden = false; full.classList.remove('on'); void full.offsetWidth; full.classList.add('on');
    $('evBox').appendChild(bub); document.body.classList.add('in-evfull');
  } else { $('eventTitle').textContent = `✨ ${ev.title}`; $('eventVeil').hidden = false; }
  document.body.classList.add('in-event');
  // 클로즈업·연결 컷(E0_close 등): 이벤트 시작과 함께 뒤에서 미리 받아 두고, 해당 대사 앞에서 크로스페이드
  const shots = art ? eventShots(ev).filter((x) => hasEventArt(x.art)) : [];
  const shotSrc = Object.fromEntries(shots.map((x) => [x.art, preloadArt('event', x.art)]));
  const showShot = async (name) => {
    const src = await Promise.race([shotSrc[name], sleepMs(2500).then(() => null)]); if (!src || UI.evSkip) return;
    const im2 = $('evImg2'); im2.src = src; try { await im2.decode(); } catch {}
    im2.classList.add('show'); im2.parentNode.classList.add('shot'); UI.evShot = name;
  };
  const run = async (steps, top = false) => {
    for (let k = 0; k < steps.length; k++) {
      const st = steps[k];
      if (top && !UI.evSkip) { const sh = shots.find((x) => x.i === k); if (sh) await showShot(sh.art); }
      if (st.kind === 'reward' || st.kind === 'ending') { if (!S.rewards.includes(st.text)) S.rewards.push(st.text); }
      if (UI.evSkip) continue;
      if (st.kind === 'say') { setOverride(eventExpr(st.text), 60000); await box.show(st.text, { wait: true }); }
      else if (st.kind === 'narr') await box.show(st.text, { narr: true, wait: true });
      else if (st.kind === 'reward' || st.kind === 'ending') await box.show(`${st.kind === 'ending' ? '🌅 엔딩' : '🎁 보상'}: ${st.text}`, { narr: true, wait: true });
      else if (st.kind === 'choice') {
        box.show('어떻게 할까?', { narr: true, instant: true }); clearTimeout(box.hideTimer);
        const pick = await box.choose(st.options);
        await run(branchSteps(ev, pick));
      }
    }
  };
  try { await run(parseScript(ev), true); }
  finally {
    S.events[id] = S.events[id] || dayKey(Date.now()); save(S);   // Stage 7: 다시 보기여도 처음 본 날짜 유지
    UI.event = null; UI.ov = null; box.locked = false; $('eventVeil').hidden = true; box.hide();
    if (!END.shouldAutoEnding(id, wasSeen)) updateMusic();   // 다시 장소 음악(엔딩으로 이어지면 엔딩 곡이 받음)
    if (bub.parentNode !== home) home.insertBefore(bub, homeNext);
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
  box.tap(); box.tap();
}
// ── 엔딩: 필름 스트립 → 크레딧 → 쌍즈의 메시지 (js/ending.js) ──
async function startEnding(all = false) {
  if (UI.ending || UI.event || UI.quiz || UI.mg) return;
  UI.ending = true; box.hide && box.hide(); $('toast').hidden = true;
  END.markEndingSeen(S, dayKey(Date.now())); save(S);
  await END.playEnding({ state: S, all, events: getEvents(), cards: CL.PHOTOCARDS, hasArt: hasEventArt, days: dayNumber(S), outfits: DX.dexProgress(S).outfits,
    audio: { playBgmFade: () => { UI.endingPhase = 'strip'; updateMusic(); }, phase: (ph) => { UI.endingPhase = ph; updateMusic(); }, stopBgmFade: (ms) => { UI.endingPhase = null; MU.stopMusic(ms); } },
    onDone: () => { UI.ending = false; save(S); UI.lastRoomKey = ''; renderAll(); setTimeout(() => maybeEvent(), 1500); } });
}
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
    $('feedSheet').hidden = true; tick(); say(doAction(S, 'feed', b.dataset.food)); maybeEvent();
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
  $('giftSheet').hidden = true; tick(); say(doAction(S, 'gift', b.dataset.gift)); maybeEvent();
});

$('actions').addEventListener('click', (e) => {
  const b = e.target.closest('.act'); if (!b || b.disabled || UI.event || UI.quiz || UI.mg) return;
  tick();
  if (b.dataset.act === 'feed') return open('feedSheet');
  if (b.dataset.act === 'play') { buildPlayMenu(); return open('playSheet'); }
  if (b.dataset.act === 'gift') { buildGiftMenu(); return open('giftSheet'); }
  // Stage 5: 대화의 ~15%는 팝퀴즈(가끔 취향 맞히기)
  if (b.dataset.act === 'talk' && QZ.shouldPop(S)) {
    S.stats_meta.talks++; S.daily.done.talk = true;
    if (QZ.canTaste(S) && Math.random() < 0.25) return runTaste(QZ.pickTaste(S));
    return runPop(QZ.pickPop(S));
  }
  if (b.dataset.act === 'sleep' && !S.asleep) { const home = placesFor(stageOf(S).id)[0]; if (home && S.place !== home) { S.place = home; UI.lastRoomKey = ''; toast('🏠 집으로 돌아왔어요'); } }
  say(doAction(S, b.dataset.act)); maybeEvent();
});
$('charWrap').addEventListener('click', () => { if (UI.event) return box.tap(); if (UI.quiz || UI.mg) return; tick(); say(pokeLine(S)); maybeEvent(); });

// 장소 이동
$('btnPlace').onclick = () => { if (S.asleep) return toast('자는 중이에요'); buildPlaceMenu(); open('placeSheet'); };
$('placeMenu').addEventListener('click', (e) => { const b = e.target.closest('[data-place]'); if (b) { tick(); goPlace(b.dataset.place); } });

// Stage 7: 도감
$('btnDex').onclick = () => { if (UI.event || UI.quiz || UI.mg) return; AU.sfx('sfx_tap'); DX.openDex(S); };

// 설정
function openSettings() {
  const v = normVolumes(S.settings);
  $('optSound').checked = v.sound; $('optBgm').value = Math.round(v.bgm * 100); $('optSfx').value = Math.round(v.sfx * 100); volLabels();
  const mi = MU.musicInfo(); $('musicNote').textContent = mi.track ? `🎵 지금 곡: ${mi.title || mi.track}` : '🎵 OST 파일을 assets/music/ost/ 에 넣으면 장면마다 자동으로 나와요(지금은 없는 곳은 무음).';
  open('settingsSheet');
}
const volLabels = () => { $('optBgmV').textContent = `${$('optBgm').value}%`; $('optSfxV').textContent = `${$('optSfx').value}%`; [$('optBgm'), $('optSfx')].forEach((r) => (r.disabled = !$('optSound').checked)); };
$('btnSettings').onclick = openSettings;
$('optSound').onchange = (e) => { S.settings.sound = e.target.checked; AU.setSound(S.settings.sound); applyVolumes(); if (S.settings.sound) AU.sfx('sfx_tap'); volLabels(); save(S); };
$('optBgm').oninput = (e) => { S.settings.bgm = +e.target.value / 100; MU.setMusicVolume({ bgm: S.settings.bgm }); volLabels(); };
$('optSfx').oninput = (e) => { S.settings.sfx = +e.target.value / 100; AU.setSfxVolume(S.settings.sfx); volLabels(); };
$('optBgm').onchange = () => save(S);
$('optSfx').onchange = () => { AU.sfx('sfx_tap'); save(S); };
$('btnReset').onclick = () => {
  if (!confirm('정말 처음부터 다시 키울까요? 저장된 기록이 모두 지워져요.')) return;
  wipe(); S = newState(); DX.setDexState(S); save(S); $('settingsSheet').hidden = true; renderAll();
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
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - (nxt.fromDay - 1));
    S.createdAt = d.getTime(); S.exam.unlocked = STAGES.indexOf(nxt); S.exam.nextAt = 0; save(S); renderAll(); out.textContent = `→ ${nxt.name}`;
  }
  if (k === 'evt') { const ids = EV_ORDER; UI.dbgEv = ((UI.dbgEv ?? -1) + 1) % ids.length; $('debug').hidden = true; delete S.events[ids[UI.dbgEv]]; playEvent(ids[UI.dbgEv]); out.textContent = ids[UI.dbgEv]; }
  if (k === 'nost') { const d = new Date(); const ctx = { on: '대화', stage: stageOf(S).dlg, state: moodState(S), place: S.place, crush: S.stats.crush, grade: S.stats.grade, month: d.getMonth() + 1, time: timeOfDay().id };
    for (const on of ['대화', '선물', '공부', '도착']) { const l = pickNostalgia({ ...ctx, on }, S, true); if (l) { say({ line: l, expr: l.expr }); out.textContent = l.id; return; } }
    out.textContent = '조건 맞는 회상 없음(설렘/장소/단계 확인)'; }
  if (k === 'quiz') { $('debug').hidden = true; runPop(QZ.pickPop(S)); }
  if (k === 'exam') { const i = S.exam.unlocked; if (i >= STAGES.length - 1) { out.textContent = '마지막 단계'; return; }
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - (STAGES[i + 1].fromDay - 1)); S.createdAt = d.getTime(); S.exam.nextAt = 0; $('debug').hidden = true; renderAll(); runExam(); }
  if (k === 'taste') { S.daily.taste = 0; $('debug').hidden = true; runTaste(QZ.pickTaste(S)); }
  if (k === 'mg') { $('debug').hidden = true; S.stats.energy = Math.max(S.stats.energy, 40); startCatch(); }
  if (k === 'save') out.textContent = JSON.stringify(S, null, 1);
  if (k === 'reset') { wipe(); S = newState(); DX.setDexState(S); save(S); renderAll(); out.textContent = 'reset'; }
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
const optHtml = (q, i) => `<span class="n">${'①②③④'[i]}</span>${q.options[i]}`;

async function runPop(q) {
  if (!q || UI.quiz || UI.event) return;
  const L = QZ.quizData().lines;
  quizOpen('pop', `<span class="tag">💬 팝퀴즈</span>${q.verified ? '' : `<span class="warn">⚠️ 출처 1곳 · 미확인</span>`}`);
  ask(`${L.popIntro[Math.floor(Math.random() * L.popIntro.length)]}\n${q.q}`);
  const pick = await options(q.options.map((_, i) => ({ key: String(i), html: optHtml(q, i) })));
  const r = QZ.answerPop(S, q, +pick.key);
  mark(q.answer, pick.el);
  await sleepMs(900);
  quizClose();
  react(r, { caption: `출처: ${srcText(q.src)}${q.verified ? '' : ' · ⚠️ 미확인'}` });
  const dt = deltaText(r.delta); toast(r.piece ? `🧩 포토카드 조각 획득! · ${dt}` : dt || '같이 놀아 줘서 고마워!');
  save(S);
}

async function runExam() {
  if (UI.quiz || UI.event || !QZ.examDue(S)) return;
  const L = QZ.quizData().lines, from = STAGES[S.exam.unlocked], to = STAGES[S.exam.unlocked + 1];
  const head = (i, dots) => `<span class="tag">📝 성장 시험</span><span>${from.name} → ${to.name}</span><span class="dots">${dots}</span>`;
  quizOpen('exam', head(0, '○○○'));
  ask(L.examIntro + (QZ.hintLevel(S) ? `\n${L.examHint}` : ''), 'E07');
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
  if (!QZ.examDue(S) || S.asleep || UI.event || UI.quiz || UI.mg || S.exam.nudged === dayKey(Date.now())) return;
  S.exam.nudged = dayKey(Date.now()); save(S);
  box.show(QZ.quizData().lines.examReady[0]); setOverride('E01', 3000); renderScene();
}


// ── Stage 6: 놀아주기 → 미니게임 메뉴 ──
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
  UI.mg = false; UI.lastRoomKey = ''; AU.setSound(S.settings.sound); save(S); renderAll(); checkRewards(2200);
  if (rw) { setOverride(rw.tier === 'ok' ? 'E02' : 'E01', 3000); toast([`💗 기분 +${rw.mood}`, rw.crush ? `💓 설렘 +${rw.crush}` : ''].filter(Boolean).join(' · ')); }
  else if (reason === 'quit') { box.show('에이, 벌써 끝? …다음엔 끝까지 하자!'); setOverride('E13', 2500, 'E01'); }
  maybeEvent(2500);
}
$('playMenu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-play]'); if (!b || b.disabled) return;
  $('playSheet').hidden = true; tick(); AU.sfx('sfx_tap');
  if (b.dataset.play === 'catch') return startCatch();
  if (b.dataset.play === 'taste') return runTaste(QZ.pickTaste(S));
  say(doAction(S, 'play')); maybeEvent();
});

// ── 루프 ──
function tick() { advance(S); if (S.autoWoke) { S.autoWoke = false; say({ line: pickSys('autoWake'), expr: 'E01' }); } }
function renderAll() { renderStats(); renderScene(); }

/** 안드로이드 뒤로가기: 맨 위에 열린 창 하나 닫기. 닫은 게 있으면 true */
function closeTop() {
  const vis = (id) => $(id) && !$(id).hidden;
  if (END.endingOpen()) { END.skipEnding(); return true; }
  if (vis('cardModal')) { $('cardModal').click(); return true; }
  if (vis('debug')) { $('debug').hidden = true; return true; }
  const sh = [...document.querySelectorAll('.sheet')].find((x) => !x.hidden); if (sh) { sh.hidden = true; return true; }
  if (vis('dex')) { $('dexClose').click(); return true; }
  if (vis('mg')) { if (vis('mgPause')) $('mgResume').click(); else if (vis('mgTitle')) $('mgLater').click(); else if (vis('mgResult')) $('mgDone').click(); else $('mgPauseBtn').click(); return true; }
  return false;
}
async function boot() {
  initMobile({ save: () => save(S), toast, closeTop });
  buildStats(); bindCatch(); END.bindEnding(); AU.setSound(S.settings.sound);
  MU.initMusic(); MU.setMusicResolver(musicSlot); applyVolumes();
  await Promise.all([loadIllustIndex(), loadDialogue(), ensureSheet(stageOf(S).id), ensureSheet(wantedSheet()), loadRooms([S.place || (STAGE_PLACES[stageOf(S).id] || [])[0]]), QZ.loadQuiz(), loadIcons(), loadCatchIcons()]);
  onSheet((id, kind) => { if (kind === 'thumb') return; if (kind === 'room') UI.lastRoomKey = ''; else UI.lastDraw = ''; renderScene(); });
  buildFeedMenu();   // Stage 7a: 픽셀 아이콘(catch.png) 로드 후
  await DX.loadDex(ICONS); DX.setDexState(S);
  DX.bindDex({ tap: () => AU.sfx('sfx_tap'), close: () => { trimSheets([stageOf(S).id, wantedSheet()]); UI.lastRoomKey = ''; renderAll(); }, cardClosed: () => { UI.card = false; UI.lastRoomKey = ''; renderAll(); }, replay: (id) => { UI.lastRoomKey = ''; renderAll(); setTimeout(() => playEvent(id), 200); }, ending: () => { UI.lastRoomKey = ''; renderAll(); setTimeout(() => startEnding(), 200); }, equip: () => { save(S); UI.lastDraw = ''; } });
  { const q = new URLSearchParams(location.search);   // Stage 8 디버그: ?debug=1&unlock=all|events|cards, ?debug=1&event=E10 (바로 재생)
    if (q.get('debug') === '1') {
      const u = q.get('unlock') || '';
      if (u === 'all' || u === 'events') for (const id of EV_ORDER) S.events[id] = S.events[id] || dayKey(Date.now());
      if (u === 'all' || u === 'cards') { S.pcards = S.pcards || {}; for (let i = 1; i <= 10; i++) { const k = 'P' + String(i).padStart(2, '0'); S.pcards[k] = S.pcards[k] || dayKey(Date.now()); } }
      // ?debug=1&ending=1: 전부 해금한 상태로 엔딩 바로 재생
      if (q.get('ending') === '1') { for (const id of EV_ORDER) S.events[id] = S.events[id] || dayKey(Date.now()); S.pcards = S.pcards || {}; for (const c of CL.PHOTOCARDS) S.pcards[c.id] = S.pcards[c.id] || dayKey(Date.now()); setTimeout(() => startEnding(), 800); }
      if (q.get('event')) setTimeout(() => { delete S.events[q.get('event')]; playEvent(q.get('event')); }, 600);
    } }
  const qp = new URLSearchParams(location.search).get('place'); if (qp && PLACES[qp]) S.place = qp;
  requestAnimationFrame(renderChar);
  await runTitle();
  const away = advance(S);
  save(S); renderAll();
  if (firstRun || UI.titleReset) say({ line: { id: 'SYS_new', text: '안녕! 나 쌍즈야. 앞으로 잘 부탁해! …꼬맹이라고 부르면 삐질 거야.' }, expr: 'E01' });
  else if (away >= 3 && !S.asleep) say({ line: pickSys('welcomeBack'), expr: 'E10', then: 'E13' });
  else if (!S.asleep) say({ line: pickSys('hello'), expr: 'E01' });

  if (!firstRun) setTimeout(examNudge, 2500);
  maybeEvent(4000);
  setInterval(() => { if (document.hidden) return; tick(); save(S); renderStats(); if (!box.busy) maybeEvent(); if (!UI.mg) renderScene(); }, 5000);         // 실시간 감소 + 이벤트 해금 확인
  setInterval(() => { if (document.hidden) return; UI.frame ^= 1; renderScene(); }, 600);              // 2프레임 애니
  addEventListener('resize', () => { UI.lastRoomKey = ''; renderScene(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { const a = advance(S); renderAll(); if (a >= 3 && !S.asleep) say({ line: pickSys('welcomeBack'), expr: 'E10', then: 'E13' }); } else save(S); });
}
// ── 타이틀(메인) 화면: 이어하기 / 새로 시작 / 설정. 자동 테스트(webdriver)·?notitle=1·디버그 바로 재생 때는 건너뜀(?title=1 이면 항상) ──
function wantTitle() {
  const q = new URLSearchParams(location.search);
  if (q.get('title') === '1') return true;
  if (q.get('notitle') === '1' || q.get('event') || q.get('ending') === '1') return false;
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
      if (!confirm('처음부터 새로 키울까요? 저장된 기록이 모두 지워져요.')) continue;
      wipe(); S = newState(); DX.setDexState(S); applyVolumes(); save(S); UI.titleReset = true;
    }
    break;
  }
  UI.title = false; UI.lastRoomKey = ''; renderAll();   // 타이틀 곡 → 장소 곡 크로스페이드
}
// 테스트/디버그용 훅
function forceNost(on = '대화', extra = {}) {
  const d = new Date();
  const ctx = { on, stage: stageOf(S).dlg, state: moodState(S), place: S.place, crush: S.stats.crush, grade: S.stats.grade, month: d.getMonth() + 1, time: timeOfDay().id, ...extra };
  const l = pickNostalgia(ctx, S, true); if (l) say({ line: l, expr: l.expr }); return l;
}
window.SZ = { END, startEnding, get ending() { return END.endingState(); }, get evShot() { return UI.evShot; }, skipEvent, checkPhotoCards, get state() { return S; }, get sheet() { return charSheet(); }, box, playEvent, forceNost, get event() { return UI.event; }, get food() { return UI.food; }, get lastLine() { return UI.lastLine; }, goPlace, get place() { return curPlace(); }, fastForward, say, setOverride, get anim() { return currentAnim(performance.now()).name; }, doAction: (a, x) => { const r = doAction(S, a, x); say(r); return r; }, renderAll, save: () => save(S),
  runPop: (id) => runPop(id ? QZ.quizData().questions.find((q) => q.id === id) : QZ.pickPop(S)), runExam, runTaste: (id) => runTaste(id ? QZ.quizData().taste.find((t) => t.id === id) : QZ.pickTaste(S)), get quiz() { return UI.quiz; }, QZ,
  MG, AU, MU, get music() { return MU.musicInfo(); }, get musicSlot() { return musicSlot(); }, startCatch, closeCatch, get mg() { return catchState(); }, mgDebug: catchDebug, buildPlayMenu,
  CL, DX, openDex: (t) => DX.openDex(S, t), closeDex: DX.closeDex, get dex() { return DX.dexState(); }, checkRewards, dexProgress: () => DX.dexProgress(S) };
boot();
