// Stage 4: 대사 선택기 — dialogue.json(433줄 + 이벤트 8개 + 회상 인용 메타) 전체 연결
// 필터: 단계(중/고/대/졸) → 행동 → 장소(place/avoid) → 아이템(item) → 상태 → 시간대, 최근 N줄 반복 금지, 희귀도 가중치.
import { RARITY_WEIGHT, RECENT_MAX, NOSTALGIA_P } from './config.js';

let LINES = [];
let EVENTS = [];
let QUOTES = {};
const recent = [];
let lastId = null;
let rnd = Math.random;

const FALLBACK = [
  { id: 'F001', stage: 'any', state: 'any', action: '대화', time: 'any', rarity: '일반', expr: 'E01', text: '헤헤, 너 오니까 좋다.' },
  { id: 'F002', stage: 'any', state: 'any', action: '밥', time: 'any', rarity: '일반', expr: 'eat', text: '잘 먹겠습니다!' },
];

// 게임 시스템용 오리지널 대사 (우유 알레르기 규칙 PLAN §6-1 포함)
export const SYSTEM_LINES = {
  dairy: ['으, 얼굴 간질간질해… 이거 우유 들어갔지?!', '이거… 우유 맛 나. 나 우유 안 되는 거 알면서!'],
  dairyRefuse: ['잠깐! 이거 우유 들어갔어? 뚜껑 열어볼래. …역시. 안 먹어!', '오늘 이미 간질간질했단 말이야. 우유 든 건 이제 안 먹어!'],
  tooSweet: ['오늘 단 거 너무 많이 먹었어… 이 썩으면 어떡해! …한 개만 더?', '단 거 그만! 양치하고 올게… 아니 진짜 마지막 한 입만.'],
  studyRefuse: ['오늘은 진짜 안 해! 흥!', '기분 별로라서 머리에 하나도 안 들어와… 나중에 할래.'],
  tooSleepyStudy: ['눈이 감겨서 글자가 춤춰… 자고 나서 할래.', '졸려서 같은 줄만 세 번째 읽고 있어…'],
  wake: ['으음… 벌써 아침이야? 5분만…', '잘 잤다! …아, 머리 뻗친 거 보지 마!'],
  autoWake: ['푹 잤어! 오늘도 힘내 볼까?', '개운하다~ 꿈에서 디저트 가게 갔었어.'],
  sleepRefuse: ['아직 하나도 안 졸려! …진짜야.', '벌써 자라고? 나 애 아니거든!'],
  welcomeBack: ['왜 이제 왔어! 기다린 거 아니거든. …조금만 기다렸어.', '흥, 연락도 없이… 그래도 와줘서 고마워. 쬐끔.'],
  giftEnough: ['또 줘? 오늘은 벌써 많이 받았는데… 아껴 뒀다가 내일 줘. 헤헤.', '고마워! 근데 선물은 가끔 받아야 더 설레는 거야. 내일 또 줘!', '이거 다 받으면 내 서랍 터져! …내일 하나 더 줘.'],
  tooFull: ['배불러… 더 먹으면 굴러다닐 거야. 디저트 배는 따로 있지만!', '방금 먹었잖아! 이따가 줘.'],
  goodStreak: ['요즘 컨디션 최고야! 시험도 자신 있어. 헤헤.', '매일 챙겨 줘서 그런가, 몸이 가벼워! 고마워.'],
  crushDaily: ['오늘은 심장이 너무 바빴어… 내일 또 설레게 해 줘.'],
  crushStage: ['이 마음… 아직은 여기까지만. 조금 더 크면 알게 될 거야.'],
  hello: ['왔어? 헤헤.', '어, 왔다! 오늘은 뭐 할 거야?'],
};
const SYS_EXPR = { dairy: 'E05', dairyRefuse: 'E13', tooSweet: 'E23', studyRefuse: 'E13', tooSleepyStudy: 'E21', wake: 'E21', autoWake: 'E01', sleepRefuse: 'E13', welcomeBack: 'E10', hello: 'E01', giftEnough: 'E02', tooFull: 'E13', goodStreak: 'E01', crushDaily: 'E19', crushStage: 'E02' };
const lastSys = {};
export function pickSys(k) {
  const a = SYSTEM_LINES[k];
  let i = Math.floor(rnd() * a.length);
  if (a.length > 1 && i === lastSys[k]) i = (i + 1) % a.length;   // 같은 시스템 대사 연속 금지
  lastSys[k] = i;
  return { id: `SYS_${k}_${i}`, text: a[i], rarity: '일반', expr: SYS_EXPR[k] || 'E01' };
}

/** 테스트용: 데이터 직접 주입 / 난수 교체 / 기록 초기화 */
export function setDialogue(j) {
  LINES = Array.isArray(j?.lines) ? j.lines : [];
  EVENTS = Array.isArray(j?.events) ? j.events : [];
  QUOTES = j?.quotes || {};
  resetRecent();
  return LINES.length;
}
export const setRng = (f) => { rnd = f || Math.random; };
export function resetRecent() { recent.length = 0; lastId = null; }
export const recentIds = () => [...recent];

export async function loadDialogue(url = 'data/dialogue.json') {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    return setDialogue(await r.json());
  } catch (e) {
    console.warn('dialogue.json 로드 실패, 기본 대사 사용', e);
    LINES = FALLBACK; return LINES.length;
  }
}
export const lineById = (id) => LINES.find((l) => l.id === id);
export const allLines = () => LINES;
export const getEvents = () => EVENTS;
export const eventById = (id) => EVENTS.find((e) => e.id === id);

/** 회상 줄의 출처 캡션: "원작 #7 · 돤자쉬 · 竹已《偷偷藏不住》/드라마《투투장부주》 · 작성자 번역" */
export function quoteCaption(line) {
  if (!line || line.quote == null) return '';
  const q = QUOTES[line.quote] || {};
  return `📖 원작 #${line.quote}${q.who ? ' · ' + q.who : ''} · 竹已《偷偷藏不住》/드라마《투투장부주》 · 작성자 번역${q.warn ? ' ⚠️' : ''}`;
}

/** 말한 줄 기록(반복 방지). 시스템 대사도 직전 줄 비교에 포함 */
export function remember(id) {
  if (!id) return;
  lastId = id;
  if (id.startsWith('SYS') || id.startsWith('F')) return;
  const i = recent.indexOf(id); if (i >= 0) recent.splice(i, 1);
  recent.push(id); while (recent.length > RECENT_MAX) recent.shift();
}

function weighted(items, wf) {
  const tot = items.reduce((a, x) => a + wf(x), 0);
  let r = rnd() * tot;
  for (const x of items) { r -= wf(x); if (r <= 0) return x; }
  return items[items.length - 1];
}
const URGENT = new Set(['배고픔', '졸림', '샐짐']);
const stageMatch = (l, st) => l.stage === 'any' || l.stage === st;

/**
 * ctx: { action, state, stage:'중'|'고'|'대'|'졸', time, place?, item?, strict? }
 * 1) 아이템 전용 줄(선물/음식) 65% 2) 장소 전용 줄(도착은 항상, 대화는 급한 상태가 아니면 40%)
 * 3) 상태 일치 줄 70% / 상태 any 줄. 시간대가 맞는 줄만. 최근 RECENT_MAX줄 제외(모자라면 직전 줄만 제외).
 */
export function pickLine(ctx) {
  const placeOk = (l) => (!l.place || l.place === ctx.place) && !(l.avoid && ctx.place && l.avoid.includes(ctx.place));
  const itemOk = (l) => !l.item || l.item === ctx.item;
  const base = (st) => LINES.filter((l) => l.action === ctx.action && stageMatch(l, st) && placeOk(l) && itemOk(l));
  let pool = base(ctx.stage);
  // 졸업 후: 해당 행동/상태 조합 줄이 없으면 대학생 줄로 보충
  if (ctx.stage === '졸' && !pool.some((l) => l.state === ctx.state || l.state === 'any')) pool = pool.concat(base('대').filter((l) => l.stage === '대'));
  if (!pool.length) pool = LINES.filter((l) => l.action === ctx.action && !l.place && !l.item && l.stage !== '졸');
  if (!pool.length) pool = FALLBACK.filter((l) => l.action === ctx.action);
  if (!pool.length) pool = FALLBACK;
  const timed = pool.filter((l) => l.time === 'any' || l.time === ctx.time);
  if (timed.length) pool = timed;

  let cand = null;
  if (ctx.item) {
    const it = pool.filter((l) => l.item === ctx.item);
    if (it.length && (ctx.strict || rnd() < 0.65)) cand = it;
  }
  if (!cand && ctx.place) {
    const pl = pool.filter((l) => l.place === ctx.place && (l.state === 'any' || l.state === ctx.state));
    if (pl.length && (ctx.action === '도착' || (!URGENT.has(ctx.state) && rnd() < 0.4))) cand = pl;
  }
  if (!cand) {
    const rest = pool.filter((l) => !l.item && !l.place);
    const src = rest.length ? rest : pool;
    const exact = src.filter((l) => l.state === ctx.state);
    // 평범한 상태(any)일 땐 기분좋음 줄도 무난하게 섞음(후보가 너무 적어 반복되는 것 방지)
    const generic = src.filter((l) => l.state === 'any' || (ctx.state === 'any' && l.state === '기분좋음'));
    cand = (exact.length && (ctx.strict || rnd() < 0.7 || !generic.length)) ? exact : generic;
    if (!cand.length) cand = src;
  }
  const isFresh = (l) => !recent.includes(l.id) && l.id !== lastId;
  let fresh = cand.filter(isFresh);
  if (!fresh.length) {
    // 좁은 후보가 다 최근에 나왔으면: 같은 행동·단계·장소의 상태 맞는/무난한 줄로 넓혀서 다시 찾음
    const okState = ctx.strict ? (l) => l.state === ctx.state
      : (l) => l.state === ctx.state || l.state === 'any' || (ctx.state === 'any' && l.state === '기분좋음');
    const itemLines = cand.some((l) => l.item);
    fresh = pool.filter((l) => okState(l) && (itemLines ? l.item === ctx.item : !l.item) && isFresh(l));
  }
  if (fresh.length) cand = fresh;
  else {
    // 그래도 없으면 가장 오래전에 나온 줄(LRU). 직전 줄은 절대 다시 안 나옴
    const notLast = cand.filter((l) => l.id !== lastId);
    if (notLast.length) { const age = (l) => { const i = recent.indexOf(l.id); return i < 0 ? -1 : i; }; const m = Math.min(...notLast.map(age)); cand = notLast.filter((l) => age(l) === m); }
  }

  const rarities = [...new Set(cand.map((l) => l.rarity || '일반'))];
  const rar = weighted(rarities, (r) => RARITY_WEIGHT[r] ?? 1);
  const inR = cand.filter((l) => (l.rarity || '일반') === rar);
  const line = inR[Math.floor(rnd() * inR.length)];
  remember(line.id);
  return line;
}

const SEASON = { winter: [12, 1, 2], spring: [3, 4, 5], summer: [6, 7, 8], autumn: [9, 10, 11] };
/** 회상 후보(조건만 검사, 확률/하루 제한 없음). ctx: { on, stage, state, place, item, crush, grade, month, time } */
export function nostalgiaCandidates(ctx) {
  return LINES.filter((l) => {
    if (l.action !== '회상' || l.stage !== ctx.stage) return false;   // 단계 정확히 일치 = 스포일러 방지
    const t = l.trig || {};
    if (t.on && !t.on.includes(ctx.on)) return false;
    if (t.minCrush != null && (ctx.crush ?? 0) < t.minCrush) return false;
    if (t.minGrade != null && (ctx.grade ?? 0) < t.minGrade) return false;
    if (t.state && t.state !== ctx.state) return false;
    if (t.place && t.place !== ctx.place) return false;
    if (t.item && t.item !== ctx.item) return false;
    if (t.season && !(SEASON[t.season] || []).includes(ctx.month)) return false;
    if (l.time !== 'any' && l.time !== ctx.time) return false;
    return true;
  });
}
/** 회상 발동: 조건 맞음 + NOSTALGIA_P 확률 + 하루 1번. 안 본 줄 우선. s = 게임 상태(daily.nost, seenLines) */
export function pickNostalgia(ctx, s, force = false) {
  if (!s || (s.daily?.nost || 0) >= 1 && !force) return null;
  let c = nostalgiaCandidates(ctx).filter((l) => l.id !== lastId && !recent.includes(l.id));
  if (!c.length) return null;
  if (!force && rnd() >= NOSTALGIA_P) return null;
  const unseen = c.filter((l) => !(s.seenLines || {})[l.id]);
  if (unseen.length) c = unseen;
  const line = c[Math.floor(rnd() * c.length)];
  if (s.daily) s.daily.nost = (s.daily.nost || 0) + 1;
  remember(line.id);
  return line;
}
