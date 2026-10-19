import { noteMoment } from './events.js';
// Stage 6: 미니게임 ① 디저트 받기 (PLAN §9 v1) — 순수 로직(DOM 없음). UI는 js/catch_ui.js
// 규칙
//  - 한 판 ROUND_SEC(45초). 떨어지는 디저트를 받기, 유제품(우유 알레르기 §6-1)은 피하기
//  - 유제품을 받아도 점수·스탯 감소 없음(벌 없음): 콤보만 끊기고 쌍즈가 "간질간질" 반응
//  - 희귀도: 일반/희귀/전설 아이템 → 점수 + 보상 보너스(희귀 = 기분, 전설 = 설렘)
//  - 하루 소프트 리밋: FULL_PLAYS판까지 보상 100%, 그 뒤로 줄어듦(0이 되지는 않음). 언제든 계속 놀 수 있음
import { clamp, dayKey, gainCrush, bump } from './state.js';

export const ROUND_SEC = 45;
export const FULL_PLAYS = 3;
export const DIMINISH = [1, 1, 1, 0.5, 0.3, 0.2];   // 오늘 n번째 판(0부터) 보상 배율, 이후 마지막 값 유지
export const COMBO_STEP = 0.1, COMBO_MAX = 10;        // 콤보 1당 +10%, 최대 +100%

// 아이콘 이름 = assets/icons/catch.json 키. canon: 근거(없으면 게임 설정)
export const ITEMS = {
  strawberry:      { name: '딸기',       pts: 10, rarity: '일반', good: true },
  lollipop:        { name: '막대사탕',   pts: 10, rarity: '일반', good: true, canon: '취향 맞히기 T_snack' },
  jelly:           { name: '젤리',       pts: 10, rarity: '일반', good: true },
  oolong:          { name: '우롱차',     pts: 10, rarity: '일반', good: true, note: '드라마 미확인(원작 소설)' },
  tanghulu:        { name: '딸기 탕후루',     pts: 25, rarity: '희귀', good: true },
  fruit_tart:      { name: '과일 타르트', pts: 25, rarity: '희귀', good: true, note: '두유 크림(PLAN §6-1 대체 디저트)' },
  paper_star:      { name: '종이별',     pts: 30, rarity: '희귀', good: true, canon: 'E2 종이별 유리병(고)' },
  star_jar:        { name: '종이별 유리병', pts: 60, rarity: '전설', good: true, canon: 'E2 종이별 유리병(고)' },
  milk:            { name: '흰 우유',    dairy: true },
  strawberry_milk: { name: '딸기우유',   dairy: true },
  milktea:         { name: '밀크티',     dairy: true },
  icecream:        { name: '아이스크림', dairy: true },
  milk_pudding:    { name: '우유 푸딩',  dairy: true },
  cream_cake:      { name: '생크림 케이크', dairy: true },
};
// 단계별 설정: 배경 장소, 낙하 속도 배율, 출현 가중치. 종이별·유리병은 고등학생부터(E2 시점 — 스포일러 방지)
const BASE_POOL = { strawberry: 16, lollipop: 12, jelly: 10, tanghulu: 6, fruit_tart: 4, milk: 6, strawberry_milk: 6, milktea: 4, icecream: 4, milk_pudding: 3, cream_cake: 3 };
export const STAGE_CFG = {
  mid:  { place: 'school',  title: '방과 후 디저트 받기', speed: 1.0,  pool: { ...BASE_POOL, star_jar: 0 } },
  high: { place: 'dessert', title: '디저트 가게 대작전',  speed: 1.08, pool: { ...BASE_POOL, paper_star: 5, star_jar: 1.2 } },
  uni:  { place: 'campus',  title: '이허대 캠퍼스 간식 타임', speed: 1.15, pool: { ...BASE_POOL, oolong: 6, paper_star: 4, star_jar: 1.2 } },
  grad: { place: 'beach',   title: '바닷가 디저트 피크닉', speed: 1.2,  pool: { ...BASE_POOL, oolong: 6, paper_star: 4, star_jar: 1.5 } },
};
export const cfgFor = (stageId) => STAGE_CFG[stageId] || STAGE_CFG.mid;
export const poolFor = (stageId) => Object.entries(cfgFor(stageId).pool).filter(([, w]) => w > 0).map(([id]) => id);

// ── 판 진행 ──
/** geo: 필드 크기(CSS px). 쌍즈가 받는 영역 = 머리~가슴 높이의 가로 띠 */
export function newRound(stageId, geo = { W: 360, H: 560 }, rnd = Math.random) {
  const { W, H } = geo;
  const charH = geo.charH ?? Math.round(H * 0.3);
  const g = { W, H, r: geo.r ?? 21, charH, catchY0: H - charH * 0.95, catchY1: H - charH * 0.45, halfW: geo.halfW ?? Math.max(30, charH * 0.26) };
  return { stage: stageId, geo: g, t: 0, dur: ROUND_SEC, x: W / 2, target: W / 2, items: [], nextSpawn: 0.6, seq: 0,
    score: 0, combo: 0, maxCombo: 0, caught: {}, dairy: 0, dodged: 0, missed: 0, rare: 0, legend: 0, done: false, rnd };
}
/** 남은 시간이 지날수록 조금씩 빨라짐(최대 +40%) */
export const fallSpeed = (r) => r.geo.H * 0.30 * cfgFor(r.stage).speed * (1 + 0.4 * Math.min(1, r.t / r.dur));
export const spawnGap = (r) => 0.78 - 0.26 * Math.min(1, r.t / r.dur);
export function pickItem(stageId, rnd = Math.random) {
  const pool = Object.entries(cfgFor(stageId).pool).filter(([, w]) => w > 0);
  let x = rnd() * pool.reduce((a, [, w]) => a + w, 0);
  for (const [id, w] of pool) { if ((x -= w) < 0) return id; }
  return pool[0][0];
}
export function spawn(r) {
  const id = pickItem(r.stage, r.rnd), m = r.geo.r + 4;
  const it = { n: r.seq++, id, x: m + r.rnd() * (r.geo.W - 2 * m), y: -r.geo.r, vy: fallSpeed(r) * (0.9 + r.rnd() * 0.25), spin: r.rnd() * 6.28 };
  r.items.push(it); return it;
}
/** 점수: 기본점 × (1 + 콤보×10%, 최대 2배) */
export const scoreFor = (id, combo) => (ITEMS[id]?.good ? Math.round(ITEMS[id].pts * (1 + Math.min(combo, COMBO_MAX) * COMBO_STEP)) : 0);
/** 받기 처리 → 이벤트 */
export function catchItem(r, id) {
  const it = ITEMS[id];
  if (it.dairy) { r.dairy++; r.combo = 0; return { type: 'dairy', id }; }
  const pts = scoreFor(id, r.combo);
  r.score += pts; r.combo++; r.maxCombo = Math.max(r.maxCombo, r.combo); r.caught[id] = (r.caught[id] || 0) + 1;
  if (it.rarity === '희귀') r.rare++; if (it.rarity === '전설') r.legend++;
  return { type: 'catch', id, pts, rarity: it.rarity, combo: r.combo };
}
/** dt초 진행. 쌍즈 x는 target 쪽으로 빠르게 따라감. 반환: 이벤트 배열 */
export function step(r, dt) {
  if (r.done) return [];
  const ev = [];
  dt = Math.min(dt, 0.1); r.t += dt;
  const maxV = r.geo.W * 2.6;   // px/s
  const dx = r.target - r.x; r.x += Math.sign(dx) * Math.min(Math.abs(dx), maxV * dt);
  r.x = Math.max(r.geo.halfW * 0.6, Math.min(r.geo.W - r.geo.halfW * 0.6, r.x));
  if (r.t < r.dur) { r.nextSpawn -= dt; while (r.nextSpawn <= 0) { spawn(r); r.nextSpawn += spawnGap(r); } }
  const g = r.geo;
  for (let i = r.items.length - 1; i >= 0; i--) {
    const it = r.items[i]; it.y += it.vy * dt; it.spin += dt * 2;
    if (it.y + g.r >= g.catchY0 && it.y - g.r <= g.catchY1 && Math.abs(it.x - r.x) <= g.halfW + g.r * 0.6) {
      r.items.splice(i, 1); ev.push({ ...catchItem(r, it.id), x: it.x, y: it.y });
    } else if (it.y - g.r > g.H) {
      r.items.splice(i, 1);
      if (ITEMS[it.id].good) { r.missed++; if (r.combo) ev.push({ type: 'miss', id: it.id }); r.combo = 0; }
      else { r.dodged++; ev.push({ type: 'dodge', id: it.id }); }
    }
  }
  if (r.t >= r.dur && !r.items.length) { r.done = true; ev.push({ type: 'end' }); }
  else if (r.t >= r.dur + 4) { r.items.length = 0; r.done = true; ev.push({ type: 'end' }); }
  return ev;
}
export const timeLeft = (r) => Math.max(0, r.dur - r.t);
export function summary(r) {
  return { stage: r.stage, score: r.score, maxCombo: r.maxCombo, caught: { ...r.caught }, dairy: r.dairy, dodged: r.dodged, missed: r.missed, rare: r.rare, legend: r.legend,
    good: Object.values(r.caught).reduce((a, b) => a + b, 0) };
}

// ── 결과 · 보상 ──
export const TIERS = [{ id: 'great', min: 600 }, { id: 'good', min: 300 }, { id: 'ok', min: 0 }];
export const tierOf = (score) => TIERS.find((t) => score >= t.min).id;
export const factorFor = (playsBefore) => DIMINISH[Math.min(playsBefore, DIMINISH.length - 1)];
/** 보상 계산(상태 변경 없음). playsBefore = 오늘 이미 끝낸 판 수. best = 이 단계 이전 최고점 */
export function rewardFor(res, playsBefore = 0, best = 0) {
  const f = factorFor(playsBefore), tier = tierOf(res.score);
  const newBest = res.score > best && res.score > 0;
  const baseMood = 3 + Math.round(Math.min(res.score, 960) / 80);          // 3~15
  const rareMood = Math.min(3, res.rare);                                   // 희귀 1개당 +1 (최대 +3)
  const crushRaw = Math.min(4, res.legend * 2) + (tier !== 'ok' ? 1 : 0);   // 전설 1개당 +2 (최대 +4), 좋아 이상 +1
  const mood = Math.max(1, Math.round((baseMood + rareMood + (newBest ? 2 : 0)) * f));
  const crush = Math.round(crushRaw * f);
  return { tier, factor: f, newBest, mood, crush, energy: -6, hunger: -3, parts: { baseMood, rareMood, crushRaw } };
}
export function ensureMg(s) {
  s.minigame = s.minigame || {};
  s.minigame.best = s.minigame.best || {}; s.minigame.total = s.minigame.total || 0; s.minigame.log = s.minigame.log || [];
  if (typeof s.daily.minigame !== 'number') s.daily.minigame = 0;
  return s.minigame;
}
export const playsToday = (s) => (s.daily && s.daily.date === dayKey(Date.now()) ? s.daily.minigame || 0 : s.daily.minigame || 0);
export const canStart = (s) => !s.asleep && s.stats.energy >= 10;
/** 보상 반영 + 기록. 반환: rewardFor 결과 + best */
export function applyResult(s, res, now = Date.now()) {
  const mg = ensureMg(s);
  const before = s.daily.minigame || 0, best = mg.best[res.stage] || 0;
  const rw = rewardFor(res, before, best);
  s.stats.mood = clamp(s.stats.mood + rw.mood); rw.crush = gainCrush(s, rw.crush, now);
  bump(s, 'mg', 1, now); if (rw.tier !== 'ok') bump(s, 'mgGood', 1, now);
  s.stats.energy = clamp(s.stats.energy + rw.energy); s.stats.hunger = clamp(s.stats.hunger + rw.hunger);
  s.daily.minigame = before + 1; s.daily.done.studyOrPlay = true; s.stats_meta.plays++;
  noteMoment(s, 'minigame');
  mg.total++; if (rw.newBest) mg.best[res.stage] = res.score;
  mg.log.push({ g: 'catch', st: res.stage, score: res.score, tier: rw.tier, f: rw.factor, t: now }); if (mg.log.length > 40) mg.log.splice(0, mg.log.length - 40);
  return { ...rw, best: mg.best[res.stage] || 0, playsToday: s.daily.minigame };
}

// ── 쌍즈 대사 (시작·도중·끝) — 단계별 말투 ──
export const LINES = {
  start: {
    mid:  [{ t: '디저트 받기 하자! 우유 들어간 건 절대 잡으면 안 돼. 알지?', e: 'E01' }, { t: '쌍옌 오빠보다 많이 받을 거야! 잘 봐!', e: 'E05' }],
    high: [{ t: '종이별 떨어지면 꼭 잡아 줘! …그냥, 모으는 중이야.', e: 'E02' }, { t: '집중! 우유는 패스, 딸기는 전부 내 거!', e: 'E01' }],
    uni:  [{ t: '이허 와서도 이건 내가 일등이야. 시작!', e: 'E01' }, { t: '딸기 탕후루 나오면 양보 없어!', e: 'E01' }],
    grad: [{ t: '오늘은 바닷가 버전! 우유는 여전히 안 돼~', e: 'E01' }, { t: '준비됐어? 나 아직 실력 안 죽었어.', e: 'E01' }],
  },
  dairy: ['앗, 우유잖아! 패스, 패스!', '으, 간질간질… 그거 우유야!', '우유는 안 돼~!'],
  legend: ['유리병이다! 이건 진짜 소중한 거야.', '종이별 가득…! 헤헤.'],
  end: {
    great: [{ t: '봤지? 나 원래 이런 거 잘해! 흐흥.', e: 'hop', then: 'E01' }, { t: '대박! 오늘 디저트 운 최고야!', e: 'hop', then: 'E01' }],
    good:  [{ t: '헤헤, 꽤 많이 받았다! 한 판 더 해도 돼?', e: 'E01' }, { t: '나쁘지 않았지? …칭찬해 줘도 돼.', e: 'E02' }],
    ok:    [{ t: '…방금 건 연습이었어. 다음엔 진짜로 할 거야!', e: 'E13', then: 'E01' }, { t: '흥, 디저트가 너무 빨랐어. 다음엔 다 잡을 거야!', e: 'E13', then: 'E01' }],
  },
  best: { mid: '최고 기록! 내일 학교 가서 자랑해야지.', high: '최고 기록! 내일 학교 가서 자랑해야지.', uni: '최고 기록이다! 이건 사진 찍어 둬야 돼.', grad: '최고 기록이다! 이건 사진 찍어 둬야 돼.' },
  tired: '헤헤, 오늘 진짜 많이 놀았다. 내일 또 하자! (보상이 조금 줄었어요)',
  sleepy: '하암… 너무 졸려서 손이 안 움직여. 조금 쉬었다 하자.',
};
export const pick = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];
export function startLine(stageId, rnd = Math.random) { return pick(LINES.start[stageId] || LINES.start.mid, rnd); }
export function endLine(stageId, rw, rnd = Math.random) {
  const base = pick(LINES.end[rw.tier], rnd);
  if (rw.newBest) return { ...base, t: LINES.best[stageId] || LINES.best.mid, e: 'hop', then: 'E01' };
  if (rw.factor < 1) return { t: LINES.tired, e: 'E01' };
  return base;
}
