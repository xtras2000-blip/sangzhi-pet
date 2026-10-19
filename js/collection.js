// Stage 7: 성장·수집 (도감) — 순수 로직. DOM 없음 → node 테스트 가능
// 데이터: lines(dialogue.json lines), events(dialogue.json events), wardrobe(data/wardrobe.json), taste(quiz.json taste)
import { STAGES, FOODS } from './config.js';
import { gainCrush } from './state.js';

export const RARITY_P = { 일반: 0.85, 희귀: 0.12, 전설: 0.03 };   // PLAN §6 85/12/3
export const STAGE_IDS = STAGES.map((x) => x.id);
const DLG2ID = { 중: 'mid', 고: 'high', 대: 'uni', 졸: 'grad' };
export const stageIdx = (id) => STAGE_IDS.indexOf(id);
/** 지금까지 도달한 단계 index (시험으로 연 단계) */
export const reached = (s) => (s.exam && typeof s.exam.unlocked === 'number' ? s.exam.unlocked : 0);

// ── 카드 카탈로그 ──
// 사진 구도: 기존 v5 스프라이트 프레임(stage, anim) + 장소 배경. 새 일러스트(스타일 C)는 아직 없음
const EXAM_CARDS = [
  { id: 'card_high', title: '고등학생이 됐어!', stage: 'high', anim: 'E01', place: 'school', rarity: '희귀' },
  { id: 'card_uni', title: '이허대학 합격!', stage: 'uni', anim: 'E15', place: 'campus', rarity: '희귀' },
  { id: 'card_grad', title: '졸업 축하해', stage: 'grad', anim: 'E11', place: 'apartment', rarity: '희귀' },
];
const EVENT_CARD = {
  E1: { stage: 'mid', anim: 'E02', place: 'school' }, E2: { stage: 'high', anim: 'E15', place: 'home_nanwu' },
  E3: { stage: 'uni', anim: 'E07', place: 'dorm' }, E4: { stage: 'high', anim: 'E10', place: 'home_nanwu' },
  E5: { stage: 'uni', anim: 'E15', place: 'campus' }, E6: { stage: 'uni', anim: 'E19', place: 'campus' },
  E7: { stage: 'uni', anim: 'E11', place: 'yihe_street' }, E8: { stage: 'grad', anim: 'E19', place: 'beach' },
  E0: { stage: 'mid', anim: 'E19', place: 'home_nanwu' }, E9: { stage: 'uni', anim: 'E10', place: 'dorm' }, E10: { stage: 'uni', anim: 'E10', place: 'campus' },
  E11: { stage: 'uni', anim: 'E01', place: 'yihe_street' }, E12: { stage: 'uni', anim: 'E19', place: 'campus' }, E13: { stage: 'uni', anim: 'E01', place: 'beach' },
};
// Stage 8: 원작 명장면 포토카드(스타일 C 일러스트). 조건은 events.js CARD_RULES
export const PHOTOCARDS = [
  { id: 'P01', title: '버스 정류장의 우유병', ep: '2화', stage: 'high', how: '고등학생 · 우유를 거절하면' },
  { id: 'P02', title: '자전거 뒷자리', ep: '4화', stage: 'high', how: '고등학생 · 기분이 안 좋을 때 디저트로 달래 주면' },
  { id: 'P03', title: '"빚 갚는 거 도와줄게!"', ep: '7화', stage: 'high', how: '고등학생 · 밤 · 설렘 30' },
  { id: 'P04', title: '졸업식 기념사진', ep: '6화', stage: 'high', how: '고등학생 · 성적 40' },
  { id: 'P05', title: '"동생 말고 친구"', ep: '14화', stage: 'uni', how: '대학생 · 재회 뒤 우유를 거절하면' },
  { id: 'P06', title: '같이 듣는 수업', ep: '16~17화', stage: 'uni', how: '장수면 이벤트 뒤 · 캠퍼스에서 공부' },
  { id: 'P07', title: '롤러장 "예고할 게 있어"', ep: '18화', stage: 'uni', how: '장수면 이벤트 뒤 · 설렘 85' },
  { id: 'P08', title: '솜사탕 위로', ep: '16화', stage: 'uni', how: '고백 이벤트 뒤 · 디저트 받기 1판' },
  { id: 'P09', title: '집 안 캠핑', ep: '22화', stage: 'uni', how: '장수면 이벤트 뒤 · 기숙사나 집 · 밤' },
  { id: 'P10', title: '별 쪽지를 모두 보여 줄게', ep: '23~24화', stage: 'grad', how: '졸업 후 · 종이별·장수면 이벤트 뒤', rarity: '전설' },
];
export const STICKERS = ['strawberry', 'tanghulu', 'lollipop', 'jelly', 'fruit_tart', 'paper_star', 'cream_cake', 'rice', 'noodle'];
const STICKER_NAME = { strawberry: '딸기', tanghulu: '딸기 탕후루', lollipop: '막대사탕', jelly: '젤리', fruit_tart: '과일 타르트', paper_star: '종이별', cream_cake: '생크림 케이크', rice: '집밥', noodle: '계란 라면' };
export const PHOTO_EXPR = { E01: '웃음', E02: '수줍음', E07: '공부 중', E15: '감동', E19: '새빨개짐' };
const STAGE_PLACE = { mid: 'home_nanwu', high: 'school', uni: 'campus', grad: 'apartment' };
const STAGE_NAME = Object.fromEntries(STAGES.map((x) => [x.id, x.name]));

/** 전체 카드 목록. kind: exam | event | line | sticker | photo | legend */
export function cardCatalog({ lines = [], events = [] } = {}) {
  const out = EXAM_CARDS.map((c) => ({ ...c, kind: 'exam', how: '성장 시험 통과' }));
  for (const e of events) out.push({ id: `ev_${e.id}`, kind: 'event', title: e.title, rarity: e.id === 'E8' ? '전설' : '희귀', how: '이벤트', ev: e.id, ...(EVENT_CARD[e.id] || { stage: 'mid', anim: 'E01', place: 'home_nanwu' }) });
  for (const p of PHOTOCARDS) out.push({ id: `pc_${p.id}`, kind: 'pcard', pc: p.id, title: p.title, ep: p.ep, rarity: p.rarity || '희귀', how: p.how, stage: p.stage });
  for (const l of lines.filter((x) => x.rarity === '전설')) {
    const st = DLG2ID[l.stage] || 'mid';
    out.push({ id: `ln_${l.id}`, kind: 'line', title: '전설 대사', text: l.text, rarity: '전설', how: '전설 대사 듣기', line: l.id, stage: st, anim: l.expr || 'E19', place: STAGE_PLACE[st] });
  }
  for (const k of STICKERS) out.push({ id: `st_${k}`, kind: 'sticker', title: `${STICKER_NAME[k]} 스티커`, rarity: '일반', how: '보상 카드', icon: k });
  for (const st of STAGE_IDS) for (const [ex, nm] of Object.entries(PHOTO_EXPR))
    out.push({ id: `ph_${st}_${ex}`, kind: 'photo', title: `${STAGE_NAME[st]} · ${nm}`, rarity: '희귀', how: '보상 카드', stage: st, anim: ex, place: STAGE_PLACE[st] });
  for (const st of STAGE_IDS) out.push({ id: `lg_${st}`, kind: 'legend', title: `${STAGE_NAME[st]} · 반짝 포토카드`, rarity: '전설', how: '보상 카드(3%) · 조각 3개', stage: st, anim: 'E11', place: STAGE_PLACE[st] });
  return out;
}

/** 이 카드를 가졌나? 이벤트·전설 대사 카드는 기록에서 바로 계산 */
export function hasCard(s, c) {
  if (c.kind === 'event') return !!(s.events || {})[c.ev];
  if (c.kind === 'pcard') return !!(s.pcards || {})[c.pc];
  if (c.kind === 'line') return !!(s.seenLines || {})[c.line];
  return (s.collection.cards || []).includes(c.id);
}
export const cardCount = (s, id) => (s.collection.cardCount || {})[id] || 0;

/** 85/12/3 희귀도 뽑기 */
export function rollRarity(rnd = Math.random) {
  const r = rnd();
  return r < RARITY_P.전설 ? '전설' : r < RARITY_P.전설 + RARITY_P.희귀 ? '희귀' : '일반';
}
/** 보상 카드 뽑기 풀(도달한 단계까지만 = 스포일러 방지) */
export function drawPool(s, rarity, catalog) {
  const top = reached(s);
  return catalog.filter((c) => ['sticker', 'photo', 'legend'].includes(c.kind) && c.rarity === rarity && (c.stage ? stageIdx(c.stage) <= top : true));
}
/** 카드 한 장 뽑아서 기록. 안 가진 카드 70% 우선(중복도 벌점 없음 = 개수만 +1) */
export function drawCard(s, catalog, { rnd = Math.random, rarity } = {}) {
  const r = rarity || rollRarity(rnd);
  const pool = drawPool(s, r, catalog);
  const fresh = pool.filter((c) => !hasCard(s, c));
  const from = fresh.length && (rnd() < 0.7 || fresh.length === pool.length) ? fresh : pool;
  const c = from[Math.floor(rnd() * from.length)] || pool[0];
  const col = s.collection; col.cardCount = col.cardCount || {};
  const dup = col.cards.includes(c.id);
  if (!dup) col.cards.push(c.id);
  col.cardCount[c.id] = (col.cardCount[c.id] || 0) + 1;
  (col.draws = col.draws || []).push({ id: c.id, r, t: Date.now() }); if (col.draws.length > 60) col.draws.shift();
  return { card: c, rarity: r, dup };
}

/** 하루 루틴(밥·대화·공부/놀기) 다 하면 하루 1번 카드 + 설렘 +1. 반환: 뽑은 결과 또는 null */
export function routineReward(s, catalog, rnd = Math.random) {
  const d = s.daily; if (!d || d.card) return null;
  if (!(d.done.feed && d.done.talk && d.done.studyOrPlay)) return null;
  d.card = true;
  gainCrush(s, 1);
  return { ...drawCard(s, catalog, { rnd }), why: 'routine' };
}
/** 포토카드 조각 3개 → 전설 카드 1장 확정 */
export const PIECES_PER_CARD = 3;
export function piecesReward(s, catalog, rnd = Math.random) {
  if ((s.collection.pieces || 0) < PIECES_PER_CARD) return null;
  s.collection.pieces -= PIECES_PER_CARD;
  return { ...drawCard(s, catalog, { rnd, rarity: '전설' }), why: 'pieces' };
}

// ── 의상(W01~W34) ── 해금 조건은 게임 설계(원작 근거 없음). 스프라이트는 4벌만 있음
export const SPRITE_OUTFIT = { W01: 'mid', W02: 'high', W10: 'uni', W17: 'grad' };   // 단계 기본 의상(단계 시트)
// 새로 그린 의상 시트(assets/sprites/outfits/<W>/sheet.png, 단계 시트와 같은 줄 구조). 검수 통과한 것만 넣어요(tools/OUTFITS_PROGRESS.md)
export const OUTFIT_SHEETS = { W04: 'high', W06: 'high', W07: 'high', W08: 'high', W09: 'uni', W14: 'uni', W13: 'uni', W15: 'uni', W16: 'uni', W18: 'uni', W21: 'uni', W22: 'uni', W31: 'grad', W32: 'grad', W33: 'grad', W34: 'grad' };
/** 이 의상 그림이 쓰는 단계(없으면 null = 그림 없음) */
export const spriteStageOf = (id) => SPRITE_OUTFIT[id] || OUTFIT_SHEETS[id] || null;
export const BASE_OUTFIT = Object.fromEntries(Object.entries(SPRITE_OUTFIT).map(([w, st]) => [st, w]));
const R = (st) => (s) => reached(s) >= stageIdx(st);
const C = (st, n) => (s) => R(st)(s) && (s.stats.crush || 0) >= n;
const DAYS = (st, n) => (s, ctx) => R(st)(s) && (ctx.day || 0) >= n;
const META = (st, k, n) => (s) => R(st)(s) && ((s.stats_meta || {})[k] || 0) >= n;
const EV = (e) => (s) => !!(s.events || {})[e];
export const OUTFIT_RULES = {
  W01: { test: R('mid'), text: '처음부터' },
  W02: { test: R('high'), text: '고등학생이 되면' },
  W10: { test: R('uni'), text: '대학생이 되면' },
  W17: { test: R('grad'), text: '졸업 후가 되면' },
  W31: { test: DAYS('grad', 18), text: '졸업 후 · D+18' },
  W04: { test: C('high', 30), text: '고등학생 · 설렘 30' },
  W06: { test: META('high', 'plays', 10), text: '고등학생 · 놀아주기 10번' },
  W08: { test: C('high', 45), text: '고등학생 · 설렘 45' },
  W07: { test: EV('E4'), text: '이벤트 「혼자 떠난 비행기」' },
  W09: { test: C('uni', 50), text: '대학생 · 설렘 50' },
  W13: { test: DAYS('uni', 10), text: '대학생 · D+10' },
  W14: { test: C('uni', 65), text: '대학생 · 설렘 65' },
  W15: { test: EV('E7'), text: '이벤트 「우리 쌍즈도 가져야지」' },
  W16: { test: DAYS('uni', 12), text: '대학생 · D+12' },
  W18: { test: EV('E5'), text: '이벤트 「첫눈과 약상자」' },
  W21: { test: C('uni', 75), text: '대학생 · 설렘 75' },
  W22: { test: META('uni', 'studies', 20), text: '대학생 · 공부 20번' },
  W32: { test: R('grad'), text: '졸업 시험 통과' },
  W33: { test: EV('E8'), text: '엔딩 「바닷가의 비밀」' },
  W34: { test: DAYS('grad', 16), text: '졸업 후 · D+16' },
};
/** 의상 상태: owned(스프라이트 있음, 입을 수 있음) | unlocked(해금, 그림 준비 중) | locked | archive(v2 후보, 기록만) */
export function outfitState(s, w, ctx = {}) {
  const rule = OUTFIT_RULES[w.id];
  if (!w.game || !rule) return { state: 'archive', text: '기록만 (v2 후보)' };
  if (!rule.test(s, ctx)) return { state: 'locked', text: rule.text };
  return { state: spriteStageOf(w.id) ? 'owned' : 'unlocked', text: rule.text };
}
/** 지금 단계에서 입고 있는 의상 id (저장: s.outfit[stage]). 해금이 안 됐거나 그림이 없으면 단계 기본 의상 */
export function equippedOutfit(s, st, ctx = {}) {
  const id = (s.outfit || {})[st];
  if (id && OUTFIT_SHEETS[id] === st && OUTFIT_RULES[id] && OUTFIT_RULES[id].test(s, ctx)) return id;
  return BASE_OUTFIT[st] || null;
}
/** 의상 입기. 그림이 있고 해금된 의상만, 그 의상의 단계 칸에 저장. 기본 의상을 고르면 칸을 비움 */
export function equipOutfit(s, id, ctx = {}) {
  const st = spriteStageOf(id); const rule = OUTFIT_RULES[id];
  if (!st || !rule || !rule.test(s, ctx)) return false;
  s.outfit = { ...(s.outfit || {}) };
  if (SPRITE_OUTFIT[id]) delete s.outfit[st]; else s.outfit[st] = id;
  return true;
}

// ── 방 꾸미기: 모은 취향 아이템을 집에 놓기 (배경 이미지 640x360 좌표, 바닥선 y, 크기 px) ──
export const DECOR_SLOTS = {   // 가장 좁은 화면(412x915)에서도 보이는 범위: 침실 x178~411, 기숙사 101~334, 아파트 114~347. 가운데(쌍즈 자리)는 피함
  home_nanwu: { plush_fox: [200, 304, 36], art_set: [392, 262, 24], star_jar: [232, 178, 16] },
  dorm: { oolong: [147, 179, 15], case_frog: [167, 179, 19], star_jar: [188, 93, 15], plush_fox: [128, 308, 34], art_set: [312, 304, 28] },
  apartment: { star_jar: [153, 181, 22], oolong: [146, 152, 14], case_frog: [163, 152, 15], plush_fox: [134, 320, 34], art_set: [326, 316, 28] },
};
/** 이 장소에 놓을 장식 목록 [{ item, x, y, size, src:'taste'|'catch' }] */
export function decorFor(s, place) {
  const slots = DECOR_SLOTS[place]; if (!slots) return [];
  const have = { ...(s.collection.items || {}) };
  if ((s.events || {}).E2 || (s.rewards || []).some((r) => r.includes('종이별'))) have.star_jar = true;
  const out = [];
  for (const [item, [x, y, size]] of Object.entries(slots)) if (have[item] && size > 0) out.push({ item, x, y, size, src: item === 'star_jar' ? 'catch' : 'taste' });
  return out;
}

// ── 디저트 도감 ──
export function noteFood(s, id) { const d = (s.collection.foods = s.collection.foods || {}); d[id] = (d[id] || 0) + 1; }

// ── 진행률 ──
export function progress(s, { lines = [], events = [], wardrobe = [], taste = [] } = {}, ctx = {}) {
  const cat = cardCatalog({ lines, events });
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const cardsHave = cat.filter((c) => hasCard(s, c)).length;
  const game = wardrobe.filter((w) => w.game);
  const outHave = game.filter((w) => ['owned', 'unlocked'].includes(outfitState(s, w, ctx).state)).length;
  const items = taste.filter((t) => (s.collection.items || {})[t.answer]).length + (decorFor(s, 'dorm').some((d) => d.item === 'star_jar') ? 1 : 0);
  const foods = FOODS.filter((f) => (s.collection.foods || {})[f.id]).length;
  const itemTot = taste.length + 1 + FOODS.length;
  const evHave = events.filter((e) => (s.events || {})[e.id]).length;
  const story = lines.filter((l) => l.action === '회상' || l.rarity === '전설');
  const storyHave = story.filter((l) => (s.seenLines || {})[l.id]).length;
  const lineHave = lines.filter((l) => (s.seenLines || {})[l.id]).length;
  const r = {
    cards: { have: cardsHave, total: cat.length, pct: pct(cardsHave, cat.length) },
    outfits: { have: outHave, total: game.length, all: wardrobe.length, pct: pct(outHave, game.length) },
    items: { have: items + foods, total: itemTot, pct: pct(items + foods, itemTot) },
    events: { have: evHave, total: events.length, pct: pct(evHave, events.length) },
    lines: { have: storyHave, total: story.length, heard: lineHave, all: lines.length, pct: pct(storyHave, story.length) },
  };
  r.total = Math.round((r.cards.pct + r.outfits.pct + r.items.pct + r.events.pct + r.lines.pct) / 5);
  return r;
}

// ── 성장 타임라인 ──
/** [{ id, name, fromDay, toDay, state:'done'|'now'|'exam'|'next'|'later', passedAt }] */
export function timeline(s, day) {
  const top = reached(s);
  return STAGES.map((st, i) => {
    const toDay = STAGES[i + 1] ? STAGES[i + 1].fromDay - 1 : null;
    const pass = (s.exam?.history || []).find((h) => h.pass && stageIdx(h.stage) === i - 1);
    let state = i < top ? 'done' : i === top ? 'now' : 'later';
    if (i === top + 1) state = day >= st.fromDay ? 'exam' : 'next';
    return { id: st.id, name: st.name, fromDay: st.fromDay, toDay, state, passedAt: pass ? pass.t : (i === 0 ? s.createdAt : null) };
  });
}
/** 엔딩(E8) 조건 체크리스트 */
export const ENDING_NEED = { crush: 80 };
export function endingChecklist(s) {
  return [
    { k: '졸업 후 단계', ok: reached(s) >= stageIdx('grad') },
    { k: "이벤트 「'이제 쫓아가도 돼?'」", ok: !!(s.events || {}).E6 },
    { k: `설렘 ${ENDING_NEED.crush} 이상`, ok: (s.stats.crush || 0) >= ENDING_NEED.crush },
    { k: '바닷가에 같이 가기', ok: s.place === 'beach' },
  ];
}
