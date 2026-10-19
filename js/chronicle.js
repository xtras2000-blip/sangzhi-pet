// v0.9.7 이야기 연대기 · 이벤트 직후 친구 대화 · 엔딩 전 이야기(PE1~PE5) — 순수 로직(DOM 없음)
export const PRE_IDS = ['PE1', 'PE2', 'PE3', 'PE4', 'PE5'];   // 엔딩(E8) 전에 순서대로 꼭 봐야 함
let D = { chapters: [], preEnding: [] };
export const setChronicle = (d) => { D = d || D; return D; };
export async function loadChronicle() {
  try { D = await (await fetch('data/chronicle.json')).json(); } catch {}
  return D;
}
export const chronicleData = () => D;
export const chapter = (id) => D.chapters.find((c) => c.id === id) || null;
/** 제 N화 · 제목 · 시기 */
export const titleCard = (id, title) => { const c = chapter(id); return c ? `📖 제 ${c.ch}화 · ${title} · ${c.period}` : `📖 ${title}`; };

/** 이벤트를 끝냄 → 그 자리에서 친구 대화 대기(잠·다른 행동보다 먼저). 이미 본 대화(다시 보기)는 다시 안 걸음 */
export function queueTalk(s, id) {
  const c = chapter(id); if (!c || !c.talk || s.epilogue) return false;
  if ((s.evTalkSeen || {})[id]) return false;
  s.evTalk = id; return true;
}
export const talkDue = (s) => (s && s.evTalk && chapter(s.evTalk) ? { id: s.evTalk, ...chapter(s.evTalk).talk } : null);
export function talkDone(s, day) { if (!s.evTalk) return; (s.evTalkSeen ||= {})[s.evTalk] = day; s.evTalk = null; }

/** 엔딩 전 이야기: 졸업 후 + E6 뒤, 하루 하나씩 순서대로 */
export function preEndNext(s, stageId, day) {
  if (!s || s.epilogue || stageId !== 'grad' || !(s.events || {}).E6) return null;   // E6(고백) 뒤 졸업 후. E11·E13 은 날짜 조건이 있어 엔딩을 잠그지 않게 필수로 안 둠
  const seen = s.preEnd || {};
  const i = PRE_IDS.findIndex((id) => !seen[id]); if (i < 0) return null;
  if (i > 0 && seen[PRE_IDS[i - 1]] === day) return null;   // 같은 날 두 개는 안 나옴
  return D.preEnding.find((p) => p.id === PRE_IDS[i]) || null;
}
export const preEndDone = (s) => PRE_IDS.every((id) => (s.preEnd || {})[id]);
export function preEndMark(s, id, day) { (s.preEnd ||= {})[id] = day; }

/** 연대기 화면용: 본 화는 요약, 다음 화는 잠김(제목 대신 ???) */
export function timeline(s, order, titleOf) {
  const seen = { ...((s.archive || {}).events || {}), ...(s.events || {}) };
  const rows = []; let nextShown = false;
  for (const id of order) {
    const c = chapter(id); if (!c) continue;
    if (seen[id]) rows.push({ id, ch: c.ch, period: c.period, title: titleOf(id), summary: c.summary, seen: true });
    else if (!nextShown) { nextShown = true; rows.push({ id, ch: c.ch, period: c.period, title: '???', summary: '다음 이야기 — 아직 잠겨 있어요', seen: false, next: true }); }
    else rows.push({ id, ch: c.ch, period: '', title: '???', summary: '', seen: false });
  }
  return rows;
}
