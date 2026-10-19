// 설렘 순간: 대화 버튼 → 쌍즈가 묻고, 내가 대답을 고르면 반응(표정·대사) + 설렘 변화. 데이터: data/moments.json (순수 로직, DOM 없음)
import { clamp, stageOf, dayKey, gainCrush, bump, gnow } from './state.js';

let M = { rules: { perDay: 2 }, moments: [] };
export function setMoments(d) { M = { ...(d || {}), rules: { perDay: 2, ...(d && d.rules) }, moments: (d && d.moments) || [], cuts: (d && d.cuts) || {} }; return M; }
export const momentsData = () => M;
export async function loadMoments(url = 'data/moments.json') { try { setMoments(await (await fetch(url)).json()); } catch { setMoments(null); } return M; }
export const momentById = (id) => M.moments.find((m) => m.id === id) || null;

function rec(s) { s.moments = s.moments || {}; s.moments.seen = s.moments.seen || {}; s.moments.log = s.moments.log || []; return s.moments; }
export const momentsToday = (s) => (typeof s.daily.moments === 'number' ? s.daily.moments : 0);
/** 본 반응 기록(2회차에도 이어짐) */
export function noteReaction(s, key) { s.reactions = s.reactions || {}; s.reactions[key] = (s.reactions[key] || 0) + 1; }
/** 지금 회차에서 보이는 선택지(ng: true = 2회차부터) → [{ c, i }] */
export const visibleChoices = (s, m) => m.choices.map((c, i) => ({ c, i })).filter(({ c }) => !c.ng || (s.ng || 0) > 0);
/** 반응 목록(전체/본 것) — 도감 '아직 못 본 반응' */
export function momentReactionKeys(s) { return M.moments.flatMap((m) => visibleChoices(s, m).map(({ i }) => `M:${m.id}:${i}`)); }

/** 지금 대화 버튼을 누르면 나올 설렘 순간(없으면 null). 하루 perDay번까지, 오늘 아직 안 본 것 우선(전부 봤으면 fallbackRepeat일 때 다시) */
export function dueMoment(s, now = gnow(), rnd = Math.random) {
  if (!s || s.asleep) return null;
  const n = momentsToday(s);
  if (n >= (M.rules.perDay || 2)) return null;
  if (n >= 1 && rnd() >= (M.rules.secondChance ?? 0.35)) return null;   // 하루 첫 대화는 꼭, 두 번째부터는 확률
  const st = stageOf(s, now).id, today = dayKey(now), seen = rec(s).seen;
  const pool = s.epilogue ? M.moments.filter((m) => m.stage === 'epi') : M.moments.filter((m) => (m.stage === st || m.stage === 'any') && !(m.after && !(s.events || {})[m.after]));   // v0.9.8 after = 그 이벤트 본 뒤에만
  const fresh = pool.filter((m) => (seen[m.id] || {}).last !== today);
  if (!fresh.length) return null;
  // 안 본 것 먼저, 그다음 덜 본 것(같은 순간은 하루 한 번)
  const min = Math.min(...fresh.map((m) => (seen[m.id] || {}).n || 0));
  const pick = fresh.filter((m) => ((seen[m.id] || {}).n || 0) === min);
  return pick[Math.floor(rnd() * pick.length)] || null;
}
/** 대답 반영. 반환: { line, expr, then, crush(실제 변화), choice } */
export function answerMoment(s, m, idx, now = gnow()) {
  const c = m.choices[idx] || m.choices[0], R = rec(s);
  const gain = gainCrush(s, c.crush || 0, now);
  bump(s, 'moment', 1, now); if ((c.crush || 0) > 0) bump(s, 'momentGood', 1, now);
  noteReaction(s, `M:${m.id}:${idx}`);
  const prev = R.seen[m.id] || { n: 0 };
  R.seen[m.id] = { n: prev.n + 1, last: dayKey(now), pick: idx };
  R.log.push({ id: m.id, pick: idx, d: gain, t: now }); if (R.log.length > 40) R.log.splice(0, R.log.length - 40);
  s.daily.moments = momentsToday(s) + 1;
  s.stats_meta.talks++; s.daily.done.talk = true;
  return { line: { id: `MO_${m.id}_${idx}`, text: c.line }, expr: c.expr || 'E01', then: c.then || 'E01', crush: gain, choice: c };
}
