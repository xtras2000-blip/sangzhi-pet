// 단계별 목표판 · 다음 이벤트 실루엣 · 삐짐 장면 고르기 · 2회차(새로 키우기) · 못 본 반응 세기. 순수 로직(DOM 없음)
// 데이터: data/goals.json, data/scenes.json
import { STAGES } from './config.js';
import { stageOf, dayKey, newState, condition, gnow } from './state.js';
import { ORDER } from './events.js';
import { SULK_AWAY_H, SULK_LOW } from './config.js';

let G = { stages: {}, hints: {}, doneLine: {} }, SC = { sulk: [] };
export function setGoals(d) { G = { stages: {}, hints: {}, doneLine: {}, ...(d || {}) }; return G; }
export function setScenes(d) { SC = { sulk: [], ...(d || {}) }; return SC; }
export const goalsData = () => G;
export const scenesData = () => SC;
export async function loadGoals() {
  const j = async (u) => { try { return await (await fetch(u)).json(); } catch { return null; } };
  const [g, sc] = await Promise.all([j('data/goals.json'), j('data/scenes.json')]);
  setGoals(g); setScenes(sc);
}

/** 미션 하나의 진행: { cur, n, ok } */
export function missionProgress(s, stageId, m) {
  const c = ((s.sc || {})[stageId]) || {};
  let cur = 0, n = m.n || 1;
  if (m.kind === 'count') cur = c[m.key] || 0;
  else if (m.kind === 'event') { cur = (s.events || {})[m.id2] ? 1 : 0; n = 1; }
  else if (m.kind === 'flag') { cur = (s.pflags || {})[m.key] ? 1 : 0; n = 1; }
  else if (m.kind === 'stat') cur = Math.round(s.stats[m.key] || 0);
  else if (m.kind === 'streak') cur = (s.streak || {}).study || 0;
  else if (m.kind === 'care') cur = (s.care || {}).streak || 0;
  return { cur: Math.min(cur, n), n, ok: cur >= n };
}
/** 단계 목표 목록 + 진행률 */
export function goalBoard(s, now = gnow(), stageId = stageOf(s, now).id) {
  const list = (G.stages[stageId] || []).map((m) => ({ ...m, ...missionProgress(s, stageId, m) }));
  const done = list.filter((x) => x.ok).length;
  return { stage: stageId, list, done, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0, complete: list.length > 0 && done === list.length, finished: !!((s.goals || {}).done || {})[stageId] };
}
/** 다 깼으면 기록(다음 단계 시험이 하루 일찍). 반환: 새로 끝낸 단계 id 또는 null */
export function checkGoals(s, now = gnow()) {
  const b = goalBoard(s, now);
  s.goals = s.goals || { done: {}, early: {} }; s.goals.done = s.goals.done || {};
  if (!b.complete || s.goals.done[b.stage]) return null;
  s.goals.done[b.stage] = dayKey(now);
  return b.stage;
}
/** 다음에 볼 이벤트(실루엣): 이 단계에서 아직 안 본 첫 이벤트, 없으면 전체에서 */
const DLG_STAGE = { mid: '중', high: '고', uni: '대', grad: '졸' };
export function nextEvent(s, events = [], now = gnow()) {
  const tag = DLG_STAGE[stageOf(s, now).id];
  const unseen = ORDER.filter((id) => !(s.events || {})[id]);
  const byStage = unseen.find((id) => { const e = events.find((x) => x.id === id); return e && String(e.stage || '').includes(tag); });
  const id = byStage || unseen[0]; if (!id) return null;
  return { id, hint: G.hints[id] || '', title: (events.find((x) => x.id === id) || {}).title || '' };
}

// ── 삐짐 장면 ──
/** 지금 삐짐 장면을 띄울지: 오래 비웠거나(awayH) 배고픔·기분이 너무 낮을 때, 하루 1번 */
export function sulkDue(s, awayH = 0, now = gnow()) {
  if (!s || s.asleep || !SC.sulk.length) return null;
  if ((s.care || {}).sulk === dayKey(now)) return null;
  const hungry = s.stats.hunger < SULK_LOW;
  if (!(awayH >= SULK_AWAY_H || hungry || s.stats.mood < SULK_LOW)) return null;
  return SC.sulk.find((x) => x.when === (hungry ? 'hungry' : 'any')) || SC.sulk[0];
}
export function markSulk(s, now = gnow()) { s.care = s.care || {}; s.care.sulk = dayKey(now); }

// ── 반응 수집 · 2회차 ──
/** 이벤트 선택지 반응 키(✨ = 2회차 선택지) */
export const isNgOption = (o) => String(o).trim().startsWith('✨');
export function eventReactionKeys(s, events = []) {
  const keys = [];
  for (const e of events) for (const raw of e.script || []) {
    const m = raw.match(/^\[선택\]\s*(.+)$/); if (!m) continue;
    for (const o of m[1].split('/').map((x) => x.trim())) if (!isNgOption(o) || (s.ng || 0) > 0) keys.push(`E:${e.id}:${o}`);
  }
  return keys;
}
export const sulkReactionKeys = () => SC.sulk.flatMap((x) => x.choices.map((_, i) => `S:${x.id}:${i}`));
/** 아직 못 본 반응 수. allKeys = 모든 반응 키(설렘 순간 + 이벤트 + 삐짐) */
export function unseenReactions(s, allKeys) {
  const seen = s.reactions || {};
  const total = allKeys.length, have = allKeys.filter((k) => seen[k]).length;
  return { total, have, left: total - have };
}
/** 2회차: 기록(도감·포토카드·대사·반응·엔딩·최고 점수·설정)은 이어서, 키우기는 처음부터. ng +1 */
export function newGamePlus(prev, now = gnow()) {
  const s = newState(now);
  s.ng = (prev.ng || 0) + 1;
  s.collection = prev.collection; s.pcards = prev.pcards; s.seenLines = prev.seenLines; s.reactions = prev.reactions || {};
  s.ending = prev.ending; s.settings = prev.settings; s.minigame.best = (prev.minigame || {}).best || {};
  s.archive = { events: { ...((prev.archive || {}).events || {}), ...(prev.events || {}) } };
  s.rewards = prev.rewards || [];
  s.player = { ...(prev.player || { name: '' }) };   // 이름은 2회차에도 그대로
  // 반복 방지 기록도 이어감: 2회차엔 1회차에 덜 본 대사·평범한 날 문자가 먼저 나옴
  s.lineHist = prev.lineHist || {}; s.msgr.used = (prev.msgr && prev.msgr.used) || {};
  return s;
}
export const canNewGamePlus = (s) => !!(s && s.ending);
export { condition };
