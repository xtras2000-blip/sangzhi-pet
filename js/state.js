// 상태 · 저장 · 시간 경과 시뮬레이션
import { SCHEMA_VERSION, SAVE_KEY, DECAY, MAX_OFFLINE_H, LOW, STAGES, CRUSH_DAILY, CRUSH_DAILY_STREAK_BONUS, CRUSH_STAGE_CAP, GOOD_DAY_AVG, DAY_START_MIN, MSG_AT_MIN, DAY_LAST_MIN } from './config.js';

const H = 3600_000;
export const clamp = (v) => Math.max(0, Math.min(100, v));

export function newState(now = Date.now()) {
  return {
    v: SCHEMA_VERSION,
    createdAt: now,
    lastTick: now,
    stats: { hunger: 70, mood: 70, energy: 80, grade: 20, crush: 0 },
    asleep: false,
    sleptAt: null,
    place: null,            // Stage 3: 현재 장소 id (null = 단계별 집)
    daily: newDaily(now),
    inventory: {},          // giftId -> count (Stage 5: 수집)
    seenLines: {},          // lineId -> count (Stage 4: 대사 도감)
    settings: { sound: true, bgm: 0.7, sfx: 0.8, voice: true, voiceVol: 1 },    // Stage 6: 소리 기본 켬(브라우저는 첫 터치 이후에만 재생) · Stage 9: BGM·효과음 볼륨(0~1)
    stats_meta: { feeds: 0, talks: 0, studies: 0, plays: 0, gifts: 0 },
    events: {},             // Stage 4: 본 이벤트 id -> 날짜
    rewards: [],            // Stage 4: 이벤트 보상(도감 등)
    streak: { study: 0, last: '' },   // 공부 연속 일수 (E2)
    // Stage 5: 퀴즈 기록 (cycle = 이번 바퀴에 낸 팝퀴즈 id → 다 낼 때까지 반복 없음)
    quiz: { cycle: [], last: '', correct: {}, wrong: {}, log: [] },
    // Stage 5: 성장 시험. unlocked = 통과해서 열린 단계 index(0=중학생). 날짜가 차도 시험을 통과해야 다음 단계
    exam: { unlocked: 0, fails: 0, nextAt: 0, asked: [], history: [] },
    // Stage 5: 수집(Stage 7 도감용) — items: 취향 맞히기 아이템, cards: 포토카드, pieces: 포토카드 조각
    collection: { items: {}, cards: [], pieces: 0, cardCount: {}, foods: {}, draws: [] },   // Stage 7: cardCount(중복 수), foods(디저트 도감), draws(최근 뽑기)
    // Stage 6: 미니게임 기록 — best: 단계별 최고점, total: 끝낸 판 수
    minigame: { best: {}, total: 0, log: [] },
    ending: null,           // 엔딩: { first: 처음 본 날, count: 본 횟수 } (도감 '엔딩 다시 보기')
    outfit: {},             // 의상: 단계 id -> 입은 의상 W id (없으면 단계 기본 의상)
    // ── 게임성 개편 ──
    sc: {},                 // 단계별 카운터(목표판): 단계 id -> { feed, talk, study, play, gift, mg, mgGood, moment, momentGood, goodDay, tanghulu, place_beach … }
    goals: { done: {}, early: {} },   // done: 단계 id -> 다 깬 날짜(→ 다음 시험 하루 일찍) · early: 알림 표시 여부
    care: { streak: 0, best: 0, last: '', good: 0, sulk: '' },   // 좋은 날 연속 · 삐짐 장면 본 날
    cuts: {},               // 설렘 10 단위 컷 본 기록: '10' -> 날짜
    reactions: {},          // 본 반응(선택지 결과) 키 -> 횟수. 2회차에도 이어짐('아직 못 본 반응 N개')
    evChoices: {},          // 이벤트에서 고른 선택지: E id -> 문자열
    ng: 0,                  // 2회차 번호(0 = 1회차). 엔딩 본 뒤 '새로 키우기'로 +1
    archive: { events: {} },// 이전 회차에서 본 이벤트(도감 갤러리용)
    // ── 메신저(파일럿): 플레이어 = 쌍즈의 소꿉친구 ──
    player: { name: '' },   // 첫 실행 때 입력한 이름(쌍즈가 이 이름으로 부름)
    bond: { 우정: 0, 용기: 0 },   // 우정 = 둘 사이, 용기 = 쌍즈의 용기(핵심 장면 대사·카드 변형용, 엔딩은 원작 그대로)
    msgr: { done: {}, picks: {}, last: 0, notified: 0 },   // last/notified: 문자 읽은·알림 받은 게임 날짜(D+)
    gt: { day: 1, min: DAY_START_MIN },   // 게임 속 시계: day = D+, min = 그날 몇 분(07:00 시작)   // done: 에피소드 id -> 읽은 날 · picks: 에피소드 id -> 고른 답 번호 목록
  };
}
// 하루 단위 카운터. nost = 오늘 나온 회상 대사 수(하루 1번)
export const newDaily = (now = Date.now()) => ({ date: dayKey(now), desserts: 0, dairy: 0, nost: 0, taste: 0, pops: 0, minigame: 0, gifts: 0, moments: 0, talks: 0, plays: 0, crushGain: 0, crushCapped: '', condSum: 0, condT: 0, card: false, done: { feed: false, talk: false, studyOrPlay: false } });

// 스키마 마이그레이션: 버전이 오르면 여기에 단계별 변환 추가
const MIGRATIONS = {
  // 1: (s) => ({ ...s, v: 2, newField: ... }),
};
export function migrate(raw) {
  let s = raw;
  if (!s || typeof s !== 'object' || typeof s.v !== 'number') return null;
  while (s.v < SCHEMA_VERSION) {
    const m = MIGRATIONS[s.v];
    if (!m) return null;
    s = m(s);
  }
  // 누락 필드 보정
  const base = newState(s.createdAt || Date.now());
  const hadExam = !!(s.exam && typeof s.exam.unlocked === 'number');
  s = { ...base, ...s, goals: { ...base.goals, ...s.goals }, care: { ...base.care, ...s.care }, archive: { ...base.archive, ...s.archive }, player: { ...base.player, ...s.player }, bond: { ...base.bond, ...s.bond }, msgr: { ...base.msgr, ...s.msgr }, gt: (s.gt && s.gt.day) ? { ...s.gt } : { day: Math.max(1, dayNumber(s, Date.now())), min: DAY_START_MIN }, quiz: { ...base.quiz, ...s.quiz }, exam: { ...base.exam, ...s.exam }, collection: { ...base.collection, ...s.collection }, minigame: { ...base.minigame, ...s.minigame }, stats: { ...base.stats, ...s.stats }, daily: { ...base.daily, ...s.daily }, settings: { ...base.settings, ...s.settings }, streak: { ...base.streak, ...s.streak }, outfit: (s.outfit && typeof s.outfit === 'object' && !Array.isArray(s.outfit)) ? { ...s.outfit } : {} };
  for (const k in s.stats) s.stats[k] = clamp(Number(s.stats[k]) || 0);
  // Stage 5 이전 저장: 이미 날짜로 올라간 단계는 그대로 인정(강등 없음)
  if (!hadExam) s.exam.unlocked = dayStageIndex(s, gameNow(s));
  s.asleep = false;   // 예전 '실제 시간 동안 잠' 상태 해제(이제 잠은 바로 끝남)
  return s;
}

// ── 저장소: localStorage 가 막힌 경우(사생활 보호 모드·용량 초과·저장소 차단)에도 게임은 계속 ──
const MEM = {};
let STORE_STATUS = 'ok';   // ok | memory(저장 불가: 이 탭에서만) | quota(용량 초과)
let lastBak = 0;
const LS = (() => { try { const k = '__sz_t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; } catch { STORE_STATUS = 'memory'; return null; } })();
const getItem = (k) => { try { return LS ? LS.getItem(k) : (MEM[k] ?? null); } catch { return MEM[k] ?? null; } };
function setItem(k, v) {
  MEM[k] = v; if (!LS) return false;
  try { LS.setItem(k, v); if (STORE_STATUS === 'quota') STORE_STATUS = 'ok'; return true; }
  catch (e) { STORE_STATUS = /quota/i.test(e && (e.name + e.message)) ? 'quota' : 'memory'; return false; }
}
export const storageStatus = () => STORE_STATUS;
export function load() {
  for (const k of [SAVE_KEY, SAVE_KEY + '_bak']) {   // 본 저장이 깨졌으면 백업으로
    try { const raw = JSON.parse(getItem(k)); if (raw && typeof raw === 'object') return migrate(raw); } catch {}
  }
  return null;
}
export function save(s) {
  let json; try { json = JSON.stringify(s); } catch { return false; }
  const ok = setItem(SAVE_KEY, json);
  if (ok && Date.now() - lastBak > 60_000) { lastBak = Date.now(); setItem(SAVE_KEY + '_bak', json); }
  return ok;
}
export function wipe() { try { LS && LS.removeItem(SAVE_KEY); LS && LS.removeItem(SAVE_KEY + '_bak'); } catch {} delete MEM[SAVE_KEY]; delete MEM[SAVE_KEY + '_bak']; }

/** 경과 시간 반영. 1분 단위로 적분해서 '배고프면 기분 2배 감소' 같은 조건을 정확히 반영. 반환: 실제 반영한 시간(h) */
export function advance(s, now = Date.now()) {
  let elapsedH = (now - s.lastTick) / H;
  if (!(elapsedH > 0)) { s.lastTick = now; return 0; }
  const capped = Math.min(elapsedH, MAX_OFFLINE_H);
  let left = capped;
  const step = 1 / 60;
  const st = s.stats;
  while (left > 1e-9) {
    const dt = Math.min(step, left);
    left -= dt;
    st.hunger = clamp(st.hunger + DECAY.hunger * dt);
    const stressed = st.hunger < LOW.hunger || st.energy < LOW.energy;
    st.mood = clamp(st.mood + DECAY.mood * (stressed ? 2 : 1) * dt);
    st.energy = clamp(st.energy + (s.asleep ? DECAY.energySleep : DECAY.energyAwake) * dt);
    st.grade = clamp(st.grade + DECAY.grade * dt);
    if (s.asleep && st.energy >= 100) { s.asleep = false; s.autoWoke = true; }
    // 하루 평균 컨디션(좋은 날 판정용). 날짜는 실제 자정이 아니라 게임 속 '재우기'로 바뀜(endDay)
    s.daily.condSum = (s.daily.condSum || 0) + condition(s) * dt; s.daily.condT = (s.daily.condT || 0) + dt;
  }
  s.lastTick = now;
  return capped;
}
/** 컨디션 = 배부름·기분·체력 평균(0~100) */
export const condition = (s) => (s.stats.hunger + s.stats.mood + s.stats.energy) / 3;
/** 끝난 하루가 '좋은 날'인지: 평균 컨디션 ≥ GOOD_DAY_AVG + 하루 루틴(밥·대화·공부/놀기) 완료 */
export function isGoodDay(d) {
  if (!d || !d.done) return false;
  const avg = d.condT > 0 ? d.condSum / d.condT : 0;
  return avg >= GOOD_DAY_AVG && d.done.feed && d.done.talk && d.done.studyOrPlay;
}
/** 단계별 카운터 올리기(목표판) */
export function bump(s, key, n = 1, now = gnow()) {
  const id = stageOf(s, now).id; s.sc = s.sc || {}; const c = (s.sc[id] = s.sc[id] || {});
  c[key] = (c[key] || 0) + n; return c[key];
}
/** 설렘 올리기/내리기: 오르는 건 하루 상한(CRUSH_DAILY, 좋은 날 연속 보너스) · 단계 상한(CRUSH_STAGE_CAP) 적용. 반환: 실제 변화량 */
export function crushRoom(s, now = gnow()) {
  const cap = CRUSH_STAGE_CAP[stageOf(s, now).id] ?? 100;
  const daily = CRUSH_DAILY + (((s.care || {}).streak || 0) >= 2 ? CRUSH_DAILY_STREAK_BONUS : 0);
  return { daily, dailyLeft: Math.max(0, daily - (s.daily.crushGain || 0)), stageCap: cap, stageLeft: Math.max(0, cap - s.stats.crush) };
}
export function gainCrush(s, v, now = gnow()) {
  const before = s.stats.crush;
  if (!(v > 0)) { s.stats.crush = clamp(before + (v || 0)); return Math.round((s.stats.crush - before) * 100) / 100; }
  const r = crushRoom(s, now), g = Math.max(0, Math.min(v, r.dailyLeft, r.stageLeft));
  if (g < v) s.daily.crushCapped = r.stageLeft <= r.dailyLeft ? 'stage' : 'daily';
  s.stats.crush = clamp(before + g); s.daily.crushGain = (s.daily.crushGain || 0) + (s.stats.crush - before);
  return Math.round((s.stats.crush - before) * 100) / 100;
}

export function dayKey(t) { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
function rollDaily(s, now) {
  const k = dayKey(now);
  if (s.daily.date === k) return;
  // 끝난 날 평가 → 좋은 날 연속(벌점 없음: 끊기면 0부터)
  const c = (s.care = s.care || { streak: 0, best: 0, last: '', good: 0, sulk: '' });
  if (s.daily.date && isGoodDay(s.daily)) { c.streak = (c.streak || 0) + 1; c.best = Math.max(c.best || 0, c.streak); c.good = (c.good || 0) + 1; c.last = s.daily.date; try { bump(s, 'goodDay', 1, now - 60_000); } catch {} }
  else if (s.daily.date) c.streak = 0;
  s.daily = newDaily(now);
}
export const rollDay = rollDaily;

export function dayNumber(s, now = gnow()) {
  // 생성 시각의 자정 기준으로 달력 일수 계산 (D+1부터)
  const c = new Date(s.createdAt); c.setHours(0, 0, 0, 0);
  const n = new Date(now); n.setHours(0, 0, 0, 0);
  return Math.round((n - c) / 86400_000) + 1;
}
/** 날짜만 보면 몇 번째 단계인지 (시험 무시) */
export function dayStageIndex(s, now = gnow()) {
  const d = dayNumber(s, now);
  let i = 0;
  STAGES.forEach((st, k) => { if (d >= stageFromDay(s, k)) i = k; });
  return i;
}
/** 단계 k가 열리는 날. 앞 단계 목표판을 다 깼으면 하루 일찍 */
export function stageFromDay(s, k) {
  const st = STAGES[k]; if (!st) return Infinity;
  const prev = STAGES[k - 1];
  return st.fromDay - (prev && s && s.goals && s.goals.done && s.goals.done[prev.id] ? 1 : 0);
}
/** 현재 단계 = min(날짜 단계, 시험으로 열린 단계). Stage 5부터 다음 단계는 성장 시험 통과가 필요 */
export function stageOf(s, now = gnow()) {
  const i = dayStageIndex(s, now);
  const u = s.exam && typeof s.exam.unlocked === 'number' ? s.exam.unlocked : STAGES.length - 1;
  return STAGES[Math.max(0, Math.min(i, u))];
}

// id = 배경·대사·이벤트가 쓰는 시간대(아침/오후/저녁/밤/새벽), slot = 화면에 보이는 이름(아침→낮→오후→저녁→밤)
export function timeOfDay(now = gnow()) {
  const h = new Date(now).getHours();
  if (h < 5) return { id: '새벽', slot: '새벽', icon: '🌌' };
  if (h < 10) return { id: '아침', slot: '아침', icon: '🌤️' };
  if (h < 14) return { id: '오후', slot: '낮', icon: '☀️' };
  if (h < 18) return { id: '오후', slot: '오후', icon: '🌞' };
  if (h < 21) return { id: '저녁', slot: '저녁', icon: '🌇' };
  return { id: '밤', slot: '밤', icon: '🌙' };
}

// ── 게임 속 시계 ──
// gameNow = 시작일 자정 + (D-1)일 + 그날 분. 날짜·시간대·이벤트·하루 한도는 전부 이 시각 기준(실제 시계는 스탯 감소에만)
export function gameNow(s) {
  const g = (s && s.gt) || { day: 1, min: DAY_START_MIN };
  const c = new Date(s.createdAt); c.setHours(0, 0, 0, 0); c.setDate(c.getDate() + (g.day - 1));
  return c.getTime() + g.min * 60_000;
}
let ACTIVE = null;
/** 화면이 쓰는 저장 상태를 등록 → 기본 시각(gnow)이 게임 속 시각이 됨. 등록 전(테스트)은 실제 시각 */
export const setActive = (get) => { ACTIVE = typeof get === 'function' ? get : () => get; };
export const gnow = () => { const s = ACTIVE && ACTIVE(); return s && s.gt ? gameNow(s) : Date.now(); };
export const clockText = (s) => { const m = s.gt.min; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
/** 행동 한 번 → 게임 시간 흐름. 반환: { from, to, crossedMsg } */
export function passTime(s, min) {
  const from = s.gt.min, to = Math.min(DAY_LAST_MIN, from + (min || 0));
  s.gt.min = to;
  return { from, to, crossedMsg: from < MSG_AT_MIN && to >= MSG_AT_MIN };
}
/** 밤잠 → 다음 날 아침. 하루 평가·하루 한도 초기화(rollDaily) */
export function endDay(s) {
  s.gt.day += 1; s.gt.min = DAY_START_MIN;
  rollDaily(s, gameNow(s));
  return s.gt.day;
}

/** 표정/대사 선택에 쓰는 대표 상태 */
export function moodState(s) {
  const st = s.stats;
  if (s.asleep) return '수면';
  if (st.energy < LOW.energy) return '졸림';
  if (st.hunger < LOW.hunger) return '배고픔';
  if (st.mood < LOW.mood) return '샐짐';
  if (st.mood >= 70) return '기분좋음';
  return 'any';
}
