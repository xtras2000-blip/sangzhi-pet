// v0.9.4 때쓰기: 게임 속 시각·상태에 따라 쌍즈가 "어디 가자"고 조름. 순수 로직(DOM 없음)
// 풀릴 때까지 상황에 맞는 기능 일부가 잠김 · 오래 무시하면 기분·설렘 감소 · 데려가면 작은 보상
import { DAY_START_MIN } from './config.js';
export const DAILY_CAPS = { study: 3, talk: 3, play: 3 };   // 선물은 기존 하루 2번(설렘) 규칙
export const IGNORE_MIN = 150;      // 게임 속 2시간 30분 넘게 무시하면 삐짐(벌점)
export const REWARD = { mood: 8, crush: 1 };
export const PENALTY = { mood: -12, crush: -2 };
const H = (h, m = 0) => h * 60 + m;
/** 단계별: [학교, 집, 간식] 장소 */
export const TARGETS = {
  mid:  { school: 'school', home: 'home_nanwu', crave: 'dessert' },
  high: { school: 'school', home: 'home_nanwu', crave: 'dessert' },
  uni:  { school: 'campus', home: 'dorm', crave: 'yihe_street' },
  grad: { school: null, home: 'apartment', crave: 'yihe_street' },
};
export const KINDS = {
  school: { icon: '🎒', locks: ['play', 'gift'], label: '학교 가자' },
  home:   { icon: '🏠', locks: ['play', 'study'], label: '집 가자' },
  crave:  { icon: '🍰', locks: ['study'], label: '디저트 가게 가자' },
};
export const LINES = {
  school: {
    mid:  ['{call}! 학교 가자! 지각하면 담임쌤이 우리 오빠 또 부른단 말이야…', '빨리빨리! 오늘 1교시 수학이라고!! 학교 가자~'],
    high: ['학교 가자… 고3한테 지각은 사치야. 진짜로.', '가방 쌌어! 학교 가자, 늦으면 자습실 자리 없어.'],
    uni:  ['캠퍼스 가자! 오늘 교양 출석 부른대… 제발.', '수업 늦겠다! 이허대 가자~ 야자수 보면서 뛰어가자.'],
  },
  home: {
    mid:  ['집 가자… 해 졌잖아. 늦으면 엄마가 쌍옌 오빠 시켜서 데리러 온단 말이야.', '배고파… 집 가자, 응? 집 가자아~'],
    high: ['집 가자. 오늘 진짜 지쳤어… 이불 속에 들어가고 싶어.', '해 다 졌어. 집 가자, 숙제도 남았고…'],
    uni:  ['기숙사 가자… 룸메들이 야식 시켰대!', '다리 아파… 기숙사 가자, 응?'],
    grad: ['집 가자~ 오늘도 수고했어, 나. 그리고 너도.', '집에 가서 씻고 눕고 싶어… 집 가자!'],
  },
  crave: {
    mid:  ['디저트 가게 가자!! 딱 하나만! 우유 안 들어간 걸로!', '나 지금 당 떨어졌어… 디저트 가게 가자, 제발~'],
    high: ['공부했으니까 상 줘야지? 디저트 가게 가자!', '머리가 안 돌아가… 단 거. 디저트 가게 가자.'],
    uni:  ['항구 거리 가자! 거기 새로 생긴 디저트 가게 있대!', '단 거 먹고 싶어… 이허 거리 가자, 응?'],
    grad: ['퇴근길에 항구 거리 들르자~ 단 거 먹고 싶어!', '오늘 같은 날엔 디저트지. 항구 거리 가자!'],
  },
  resolved: ['헤헤, 역시 {call}밖에 없어!', '…고마워. 진짜로.', '좋아좋아! 그럼 이제 뭐 할까?'],
  ignored: ['…됐어. 혼자 가면 되지 뭐.', '흥. 내 말 안 듣지? 기억해 둘 거야.', '…{call} 미워.'],
};
export const weekday = (day) => ((Math.max(1, day) - 1) % 7) < 5;   // D+1 = 월요일 · 토·일은 학교 안 감
const pick = (a, r) => a[Math.floor(r * a.length) % a.length];
/** 지금 조를 만한 것: 없으면 null. avail = 이 단계에 갈 수 있는 장소 목록, rnd = 0..1 */
export function due(s, { stageId, avail = [], rnd = Math.random() } = {}) {
  if (s.tantrum || s.asleep) return null;
  const tg = TARGETS[stageId]; if (!tg) return null;
  const min = s.gt.min, day = s.gt.day, done = (s.daily.tantrum || {});
  const ok = (pl) => pl && avail.includes(pl) && s.place !== pl;
  if (!done.school && tg.school && weekday(day) && stageId !== 'grad' && min >= DAY_START_MIN && min < H(10) && ok(tg.school)) return { kind: 'school', want: tg.school };
  if (!done.home && min >= H(18) && min < H(20, 30) && ok(tg.home)) return { kind: 'home', want: tg.home };
  if (!done.crave && min >= H(12) && min < H(18) && ok(tg.crave) && (s.stats.mood < 55 || s.stats.hunger < 45) && rnd < 0.35) return { kind: 'crave', want: tg.crave };
  return null;
}
export function start(s, d, stageId, rnd = Math.random()) {
  const lines = LINES[d.kind][stageId] || LINES[d.kind].mid || Object.values(LINES[d.kind])[0];
  s.tantrum = { kind: d.kind, want: d.want, since: s.gt.min, day: s.gt.day, line: pick(lines, rnd) };
  s.daily.tantrum = { ...(s.daily.tantrum || {}), [d.kind]: 'on' };
  return s.tantrum;
}
/** 잠긴 기능인가 (act = play|study|talk|gift|minigame) */
export function locked(s, act) {
  const t = s.tantrum; if (!t) return false;
  const a = act === 'minigame' ? 'play' : act;
  return KINDS[t.kind].locks.includes(a);
}
/** 장소 이동 뒤: 원하던 곳이면 보상 */
export function resolve(s, placeId, rnd = Math.random()) {
  const t = s.tantrum; if (!t || placeId !== t.want) return null;
  s.tantrum = null; s.daily.tantrum = { ...(s.daily.tantrum || {}), [t.kind]: 'ok' };
  return { kind: t.kind, reward: { ...REWARD }, line: pick(LINES.resolved, rnd) };
}
/** 시간이 흐른 뒤: 오래 무시했거나 날이 바뀌었으면 끝냄 */
export function tick(s, rnd = Math.random()) {
  const t = s.tantrum; if (!t) return null;
  if (t.day !== s.gt.day) { s.tantrum = null; return { kind: t.kind, expired: true }; }
  if (s.gt.min - t.since >= IGNORE_MIN) {
    s.tantrum = null; s.daily.tantrum = { ...(s.daily.tantrum || {}), [t.kind]: 'ignored' };
    return { kind: t.kind, penalty: { ...PENALTY }, line: pick(LINES.ignored, rnd) };
  }
  return null;
}
// ── 하루 횟수 제한 ──
export const capUsed = (s, a) => ((s.daily.cap || {})[a] || 0);
export const capLeft = (s, a) => (DAILY_CAPS[a] == null ? Infinity : Math.max(0, DAILY_CAPS[a] - capUsed(s, a)));
export function useCap(s, a) { if (DAILY_CAPS[a] == null) return; s.daily.cap = { ...(s.daily.cap || {}), [a]: capUsed(s, a) + 1 }; }
