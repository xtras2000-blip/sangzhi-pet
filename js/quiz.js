// Stage 5: 퀴즈 — 팝퀴즈(B) · 성장 시험(C) · 취향 맞히기. 데이터: data/quiz.json (QUIZ.md v0.1 기반)
// 규칙
//  - 스포일러 방지: 문항 stage(최소 단계) ≤ 현재 단계만 출제. 'any' = 작품 상식(어느 단계든)
//  - 팝퀴즈: 대화의 ~15%. 한 바퀴(그 단계에서 낼 수 있는 문항 전부)를 다 낼 때까지 같은 문항 반복 없음. ⚠️도 출제하되 '미확인' 표시
//  - 성장 시험: ✅(verified)만. 3문제 중 2개 맞히면 통과 → 다음 단계 해금 + 포토카드
//    탈락: 벌점 없음, 다음 날(자정 이후) 다시. 3번 이상 탈락 → 보기 2개(힌트), 5번 이상 → 정답에 ✨ 표시 = 절대 막히지 않음
//  - 취향 맞히기: 단계 해금된 세트만, 하루 3번. scored=false(드라마 미확인) 세트는 설렘 점수 없음 + 라벨 표시
import { STAGES, RARITY_WEIGHT, STORY_GATE } from './config.js';
import { clamp, dayStageIndex, stageOf, gainCrush, gnow } from './state.js';
import { buildPool, shuffled } from './quizgen.js';
// v0.9.4: 자동 생성 문항(대사·이벤트·음식·과목). 대사 데이터는 dialogue.js 가 넣어 줌(setGenSource)
let GEN = null, GEN_SRC = () => ({}), GEN_KEY = '';
export function setGenSource(fn) { GEN_SRC = fn || (() => ({})); GEN = null; }
export function genPool() {
  const src = GEN_SRC() || {}, key = `${(src.lines || []).length}|${(src.events || []).length}|${(Q.taste || []).length}`;
  if (!GEN || key !== GEN_KEY) { GEN = buildPool({ ...src, taste: Q.taste || [] }); GEN_KEY = key; }
  return GEN;
}

export const POP_RATE = 0.15;
export const EXAM_SIZE = 3, EXAM_PASS = 2, HINT_AFTER = 3, SPARKLE_AFTER = 5, TASTE_PER_DAY = 3;
const ORDER = ['중', '고', '대', '졸'];
export const stageRank = (dlg) => (dlg === 'any' ? -1 : ORDER.indexOf(dlg));

let Q = { questions: [], taste: [], lines: {} };
export function setQuiz(d) { Q = d; return Q; }
export const quizData = () => Q;
export async function loadQuiz(url = 'data/quiz.json') { setQuiz(await (await fetch(url)).json()); return Q; }

const pickOne = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];
const curDlg = (s, now) => stageOf(s, now).dlg;
const add = (s, k, v) => (k === 'crush' ? gainCrush(s, v) : (s.stats[k] = clamp(s.stats[k] + v)));
function rollRarity(rnd = Math.random) {
  const tot = Object.values(RARITY_WEIGHT).reduce((a, b) => a + b, 0);
  let r = rnd() * tot;
  for (const [k, w] of Object.entries(RARITY_WEIGHT)) { if ((r -= w) < 0) return k; }
  return '일반';
}
function log(s, e) { s.quiz.log.push({ ...e, t: Date.now() }); if (s.quiz.log.length > 60) s.quiz.log.splice(0, s.quiz.log.length - 60); }

// ── 출제 풀 ──
/** stageDlg 이하 문항. verifiedOnly=true면 ✅만 */
export function poolFor(stageDlg, { verifiedOnly = false, s = null, kind = null } = {}) {
  const r = stageRank(stageDlg === '졸' ? '졸' : stageDlg);
  const evOk = (q) => !q.need || !s || (s.events || {})[q.need];   // v0.9.6 시간선: 아직 안 본 장면 문항은 안 냄
  const base = Q.questions.filter((q) => stageRank(q.stage) <= r && (!verifiedOnly || q.verified) && evOk(q));
  if (verifiedOnly) return base;   // 성장 시험은 손으로 쓴 ✅ 문항만
  const gen = genPool().filter((q) => (q.kind === 'study' ? q.stage === stageDlg : stageRank(q.stage) <= r) && (!q.need || (s && (s.events || {})[q.need])));
  const all = [...base, ...gen];
  return kind ? all.filter((q) => (kind === 'study' ? q.kind === 'study' : q.kind !== 'study')) : all.filter((q) => q.kind !== 'study');
}

// ── B. 팝퀴즈 ──
export function shouldPop(s, rnd = Math.random) { return !s.asleep && poolFor(curDlg(s)).length > 0 && rnd() < POP_RATE; }
/** 반복 없는 선택: 이번 바퀴(cycle)에 안 낸 것 중에서. 다 냈으면 새 바퀴(직전 문항은 제외) */
export function pickPop(s, rnd = Math.random, now = gnow(), { kind = null } = {}) {
  const pool = poolFor(curDlg(s, now), { s, kind });
  if (!pool.length) return null;
  // 반복 금지 기록(저장됨): 이번 바퀴에 낸 문항 + 최근 HIST 개는 다시 안 냄. 형식도 번갈아(같은 종류 연속 줄이기)
  s.quiz.cycle = (s.quiz.cycle || []).slice(-400);
  let left = pool.filter((q) => !s.quiz.cycle.includes(q.id));
  if (!left.length) { s.quiz.cycle = s.quiz.cycle.slice(-Math.min(30, Math.floor(pool.length / 2))); left = pool.filter((q) => !s.quiz.cycle.includes(q.id) && q.id !== s.quiz.last); if (!left.length) left = pool; }
  const lastKind = s.quiz.lastKind; if (lastKind) { const other = left.filter((q) => (q.kind || 'hand') !== lastKind); if (other.length && rnd() < 0.75) left = other; }
  // 아직 못 맞힌 문항을 조금 더 자주
  const weak = left.filter((q) => !s.quiz.correct[q.id]);
  const q = pickOne(weak.length && rnd() < 0.7 ? weak : left, rnd);
  s.quiz.cycle.push(q.id); s.quiz.last = q.id; s.quiz.lastKind = q.kind || 'hand';
  return shuffled(q, rnd);
}

/** 정답 처리(팝퀴즈). 반환: { ok, rarity, text, expr, then, fx, delta } — 오답은 스탯 감소 없음 */
export function answerPop(s, q, choice, rnd = Math.random) {
  const ok = choice === q.answer;
  const L = Q.lines;
  if (ok) {
    s.quiz.correct[q.id] = (s.quiz.correct[q.id] || 0) + 1;
    const rarity = rollRarity(rnd);
    const delta = q.kind === 'study' ? { grade: 4, mood: 2 } : rarity === '전설' ? { crush: 5, mood: 8 } : rarity === '희귀' ? { crush: 4, mood: 5 } : { crush: 3, mood: 3 };
    for (const [k, v] of Object.entries(delta)) add(s, k, v);
    let piece = false;
    if (rarity === '전설') { s.collection.pieces++; piece = true; }
    log(s, { type: 'pop', id: q.id, ok: true, rarity });
    return { ok, rarity, piece, delta, text: pickOne(L.correct[rarity], rnd), expr: rarity === '일반' ? 'E01' : 'E19', then: 'E01', fx: rarity === '일반' ? '⭕' : rarity === '희귀' ? '💕' : '🌟' };
  }
  s.quiz.wrong[q.id] = (s.quiz.wrong[q.id] || 0) + 1;
  add(s, 'mood', 1);   // 같이 놀아 준 것만으로도 조금 기분 좋음
  log(s, { type: 'pop', id: q.id, ok: false });
  return { ok, rarity: '일반', delta: { mood: 1 }, text: pickOne(L.wrong, rnd), answerText: L.answerIs.replace('{a}', q.options[q.answer]), expr: 'E13', then: 'E01', fx: '💦' };
}

// ── C. 성장 시험 ──
export const isLastStage = (s) => s.exam.unlocked >= STAGES.length - 1;
/** 날짜는 찼는데 아직 시험을 안 통과한 상태 + 재도전 시각이 지났는지 */
/** v0.9.6 이야기 잠금: 지금 단계의 필수 이벤트 진행 { need, seen, total, next, ok } */
export function storyGate(s) {
  const id = (STAGES[(s.exam && s.exam.unlocked) || 0] || {}).id, need = STORY_GATE[id] || [];
  const done = need.filter((e) => (s.events || {})[e]);
  return { stage: id, need, seen: done.length, total: need.length, next: need.find((e) => !(s.events || {})[e]) || null, ok: done.length === need.length };
}
export function examDue(s, now = gnow()) {
  if (s.epilogue) return false;
  if (isLastStage(s)) return false;
  if (!(dayStageIndex(s, now) > s.exam.unlocked)) return false;
  if (!storyGate(s).ok) return false;   // 이야기가 먼저(수치가 다 차도 기다림)
  if (s.exam.nextDay) return ((s.gt && s.gt.day) || 0) >= s.exam.nextDay;   // v0.9.5: 재도전은 '게임 속 다음 날'(실제 하루 기다리던 잠김 버그)
  return now >= (s.exam.nextAt || 0);
}
/** 현재(해금된) 단계의 ✅ 문항 3개. 그 단계 문항 우선, 모자라면 이전 단계 ✅ + 작품 상식. 직전 시험에 낸 건 가능하면 피함 */
export function pickExam(s, rnd = Math.random) {
  const dlg = STAGES[s.exam.unlocked].dlg;
  const seenQ = (q) => !q.need || (s.events || {})[q.need];
  const own = Q.questions.filter((q) => q.verified && q.stage === dlg && seenQ(q));
  const rest = poolFor(dlg, { verifiedOnly: true, s }).filter((q) => q.stage !== dlg);
  const fresh = (arr) => arr.filter((q) => !s.exam.asked.includes(q.id));
  const shuffled = (arr) => arr.map((q) => [rnd(), q]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const order = [...shuffled(fresh(own)), ...shuffled(own.filter((q) => s.exam.asked.includes(q.id))), ...shuffled(fresh(rest)), ...shuffled(rest)];
  const out = [];
  for (const q of order) if (!out.includes(q) && out.length < EXAM_SIZE) out.push(q);
  s.exam.asked = out.map((q) => q.id);
  return out;
}
// 좋은 컨디션 연속 2일 이상 = '컨디션 보너스': 처음부터 보기 2개(힌트 1단계)
export const careBonus = (s) => ((s.care || {}).streak || 0) >= 2;
export const hintLevel = (s) => (s.exam.fails >= SPARKLE_AFTER ? 2 : (s.exam.fails >= HINT_AFTER || careBonus(s)) ? 1 : 0);
/** 힌트 1단계 이상이면 보기 2개(정답 + 오답 1개). 반환: 표시할 options 인덱스 배열 */
export function examOptions(s, q, rnd = Math.random) {
  const all = q.options.map((_, i) => i);
  if (!hintLevel(s)) return all;
  const wrong = all.filter((i) => i !== q.answer);
  const keep = pickOne(wrong, rnd);
  return all.filter((i) => i === q.answer || i === keep);
}
export const examPassed = (nCorrect) => nCorrect >= EXAM_PASS;
/** 시험 결과 반영. 통과: 다음 단계 해금 + 포토카드 / 탈락: 다음 날 자정 이후 재도전 */
export function finishExam(s, nCorrect, now = gnow()) {
  const from = STAGES[s.exam.unlocked];
  const pass = examPassed(nCorrect);
  s.exam.history.push({ stage: from.id, n: nCorrect, pass, t: now });
  log(s, { type: 'exam', stage: from.id, n: nCorrect, ok: pass });
  if (pass) {
    s.exam.unlocked = Math.min(STAGES.length - 1, s.exam.unlocked + 1);
    s.exam.fails = 0; s.exam.nextAt = 0; s.exam.nextDay = 0; s.exam.asked = [];
    const to = STAGES[s.exam.unlocked];
    const card = `card_${to.id}`;
    if (!s.collection.cards.includes(card)) s.collection.cards.push(card);
    add(s, 'mood', 10); add(s, 'crush', 3);
    return { pass, to, card };
  }
  s.exam.fails++;
  s.exam.nextAt = 0; s.exam.nextDay = ((s.gt && s.gt.day) || 1) + 1;
  add(s, 'mood', 2);   // 벌점 없음. 같이 공부해 줘서 고마움
  return { pass, to: from };
}

// ── 취향 맞히기 ──
export function tasteSetsFor(s, now = gnow()) { const r = stageRank(curDlg(s, now)); return Q.taste.filter((t) => stageRank(t.stage) <= r); }
export function canTaste(s, now = gnow()) { return !s.asleep && tasteSetsFor(s, now).length > 0 && (s.daily.taste || 0) < TASTE_PER_DAY; }
/** 아직 못 모은 세트 우선 */
export function pickTaste(s, rnd = Math.random, now = gnow()) {
  const sets = tasteSetsFor(s, now); if (!sets.length) return null;
  const todo = sets.filter((t) => !s.collection.items[t.answer]);
  return pickOne(todo.length ? todo : sets, rnd);
}
export function answerTaste(s, set, icon, rnd = Math.random) {
  const L = Q.lines, opt = set.options.find((o) => o.icon === icon) || {};
  s.daily.taste = (s.daily.taste || 0) + 1;
  const ok = icon === set.answer;
  log(s, { type: 'taste', id: set.id, pick: icon, ok, scored: !!set.scored });
  if (ok) {
    const had = !!s.collection.items[icon];
    if (had) { add(s, 'mood', 3); return { ok, had, text: L.tasteAgain, expr: 'E01', fx: '😊', delta: { mood: 3 } }; }
    s.collection.items[icon] = { set: set.id, spot: set.spot, canon: !!set.scored, t: Date.now() };
    const delta = set.scored ? { mood: 10, crush: 3 } : { mood: 6 };
    for (const k in delta) add(s, k, delta[k]);
    return { ok, had, delta, text: pickOne(L.tasteCorrect, rnd), expr: 'E11', then: 'E01', fx: '💖' };
  }
  add(s, 'mood', 2);
  if (opt.dairy) return { ok, text: L.tasteDairy, expr: 'E05', then: 'E01', fx: '🥛', delta: { mood: 2 } };
  if (opt.cantEat) return { ok, text: L.tasteCantEat, expr: 'E13', then: 'E01', fx: '🙅', delta: { mood: 2 } };
  return { ok, text: pickOne(L.tasteWrong, rnd), expr: 'E02', then: 'E01', fx: '💭', delta: { mood: 2 } };
}

/** 보고·테스트용: 유형·단계별 문항 수 */
export function counts() {
  const out = {};
  for (const st of STAGES) {
    const pop = poolFor(st.dlg).length, exam = Q.questions.filter((q) => q.verified && q.stage === st.dlg).length;
    out[st.dlg] = { popPool: pop, popNew: Q.questions.filter((q) => q.stage === st.dlg).length, examOwn: exam, examPool: poolFor(st.dlg, { verifiedOnly: true }).length, taste: Q.taste.filter((t) => stageRank(t.stage) <= stageRank(st.dlg)).length };
  }
  return out;
}
