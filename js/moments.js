// 설렘 순간: 대화 버튼 → 쌍즈가 묻고, 내가 대답을 고르면 반응(표정·대사) + 설렘 변화. 데이터: data/moments.json (순수 로직, DOM 없음)
import { clamp, stageOf, dayKey } from './state.js';

let M = { rules: { perDay: 2 }, moments: [] };
export function setMoments(d) { M = { rules: { perDay: 2, ...(d && d.rules) }, moments: (d && d.moments) || [] }; return M; }
export const momentsData = () => M;
export async function loadMoments(url = 'data/moments.json') { try { setMoments(await (await fetch(url)).json()); } catch { setMoments(null); } return M; }
export const momentById = (id) => M.moments.find((m) => m.id === id) || null;

function rec(s) { s.moments = s.moments || {}; s.moments.seen = s.moments.seen || {}; s.moments.log = s.moments.log || []; return s.moments; }
export const momentsToday = (s) => (typeof s.daily.moments === 'number' ? s.daily.moments : 0);

/** 지금 대화 버튼을 누르면 나올 설렘 순간(없으면 null). 하루 perDay번까지, 오늘 아직 안 본 것 우선(전부 봤으면 fallbackRepeat일 때 다시) */
export function dueMoment(s, now = Date.now()) {
  if (!s || s.asleep) return null;
  if (momentsToday(s) >= (M.rules.perDay || 2)) return null;
  const st = stageOf(s, now).id, today = dayKey(now), seen = rec(s).seen;
  const pool = M.moments.filter((m) => m.stage === st || m.stage === 'any');
  const fresh = pool.filter((m) => (seen[m.id] || {}).last !== today);
  return fresh[0] || null;   // 파일럿: 같은 순간은 하루 한 번(그래서 M1 하나면 하루 첫 대화에 1번)
}
/** 대답 반영. 반환: { line, expr, then, crush(실제 변화), choice } */
export function answerMoment(s, m, idx, now = Date.now()) {
  const c = m.choices[idx] || m.choices[0], R = rec(s);
  const before = s.stats.crush; s.stats.crush = clamp(before + (c.crush || 0));
  const gain = Math.round(s.stats.crush - before);
  const prev = R.seen[m.id] || { n: 0 };
  R.seen[m.id] = { n: prev.n + 1, last: dayKey(now), pick: idx };
  R.log.push({ id: m.id, pick: idx, d: gain, t: now }); if (R.log.length > 40) R.log.splice(0, R.log.length - 40);
  s.daily.moments = momentsToday(s) + 1;
  s.stats_meta.talks++; s.daily.done.talk = true;
  return { line: { id: `MO_${m.id}_${idx}`, text: c.line }, expr: c.expr || 'E01', then: c.then || 'E01', crush: gain, choice: c };
}
