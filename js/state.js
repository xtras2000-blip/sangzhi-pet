// 상태 · 저장 · 시간 경과 시뮬레이션
import { SCHEMA_VERSION, SAVE_KEY, DECAY, MAX_OFFLINE_H, LOW, STAGES } from './config.js';

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
    settings: { sound: true, bgm: 0.7, sfx: 0.8 },    // Stage 6: 소리 기본 켬(브라우저는 첫 터치 이후에만 재생) · Stage 9: BGM·효과음 볼륨(0~1)
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
  };
}
// 하루 단위 카운터. nost = 오늘 나온 회상 대사 수(하루 1번)
export const newDaily = (now = Date.now()) => ({ date: dayKey(now), desserts: 0, dairy: 0, nost: 0, taste: 0, pops: 0, minigame: 0, card: false, done: { feed: false, talk: false, studyOrPlay: false } });

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
  s = { ...base, ...s, quiz: { ...base.quiz, ...s.quiz }, exam: { ...base.exam, ...s.exam }, collection: { ...base.collection, ...s.collection }, minigame: { ...base.minigame, ...s.minigame }, stats: { ...base.stats, ...s.stats }, daily: { ...base.daily, ...s.daily }, settings: { ...base.settings, ...s.settings }, streak: { ...base.streak, ...s.streak }, outfit: (s.outfit && typeof s.outfit === 'object' && !Array.isArray(s.outfit)) ? { ...s.outfit } : {} };
  for (const k in s.stats) s.stats[k] = clamp(Number(s.stats[k]) || 0);
  // Stage 5 이전 저장: 이미 날짜로 올라간 단계는 그대로 인정(강등 없음)
  if (!hadExam) s.exam.unlocked = dayStageIndex(s, Date.now());
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
  }
  s.lastTick = now;
  rollDaily(s, now);
  return capped;
}

export function dayKey(t) { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
function rollDaily(s, now) {
  const k = dayKey(now);
  if (s.daily.date !== k) s.daily = newDaily(now);
}

export function dayNumber(s, now = Date.now()) {
  // 생성 시각의 자정 기준으로 달력 일수 계산 (D+1부터)
  const c = new Date(s.createdAt); c.setHours(0, 0, 0, 0);
  const n = new Date(now); n.setHours(0, 0, 0, 0);
  return Math.round((n - c) / 86400_000) + 1;
}
/** 날짜만 보면 몇 번째 단계인지 (시험 무시) */
export function dayStageIndex(s, now = Date.now()) {
  const d = dayNumber(s, now);
  let i = 0;
  STAGES.forEach((st, k) => { if (d >= st.fromDay) i = k; });
  return i;
}
/** 현재 단계 = min(날짜 단계, 시험으로 열린 단계). Stage 5부터 다음 단계는 성장 시험 통과가 필요 */
export function stageOf(s, now = Date.now()) {
  const i = dayStageIndex(s, now);
  const u = s.exam && typeof s.exam.unlocked === 'number' ? s.exam.unlocked : STAGES.length - 1;
  return STAGES[Math.max(0, Math.min(i, u))];
}

export function timeOfDay(now = Date.now()) {
  const h = new Date(now).getHours();
  if (h < 5) return { id: '새벽', icon: '🌌' };
  if (h < 11) return { id: '아침', icon: '🌤️' };
  if (h < 17) return { id: '오후', icon: '☀️' };
  if (h < 21) return { id: '저녁', icon: '🌇' };
  return { id: '밤', icon: '🌙' };
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
