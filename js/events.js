// Stage 4: 이벤트 E1~E8 해금 조건 + 스크립트 파싱 (순수 로직, DOM 없음)
import { stageOf, dayNumber, timeOfDay } from './state.js';
import { STAGES } from './config.js';

const isWinter = (d) => [12, 1, 2].includes(d.getMonth() + 1);
const UNI_FROM = STAGES.find((x) => x.id === 'uni')?.fromDay || 8;
const GRAD_FROM = STAGES.find((x) => x.id === 'grad')?.fromDay || 15;
const HIGH_LAST_DAY = UNI_FROM - 1;
const st = (s, now) => stageOf(s, now).id;
const seen = (s, ...ids) => ids.every((e) => !!(s.events || {})[e]);
const NIGHT = ['저녁', '밤', '새벽'];
const isNight = (now) => NIGHT.includes(timeOfDay(now).id);
const isDay = (now) => ['아침', '오후'].includes(timeOfDay(now).id);
const UG = (s, now) => ['uni', 'grad'].includes(st(s, now));
const HUG = (s, now) => ['high', 'uni', 'grad'].includes(st(s, now));
const flag = (s, k) => !!(s.pflags || {})[k];
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
/** 해금 조건. 수치는 게임 설계(ILLUST_PROMPTS.md '해금 계획', 원작 근거 없음) */
export const EVENT_RULES = {
  E0: () => true,   // 1화 첫 만남: 첫 접속 직후 가장 먼저 (예전 세이브도 처음 한 번)
  // 놓침 방지: 중학생 때 설렘 20을 못 채웠으면 고등학생이 된 뒤 바로(회상처럼)
  E1: (s, now) => seen(s, 'E0') && ((st(s, now) === 'mid' && s.stats.crush >= 20) || HUG(s, now)),
  // 공부 3일 연속(예전 7일: 고등학생 기간이 4일뿐이라 거의 불가능). 놓치면 대학에서
  E2: (s, now) => (st(s, now) === 'high' && (s.streak?.study || 0) >= 3) || UG(s, now),
  E3: (s, now) => st(s, now) === 'uni' && s.stats.grade >= 60,
  // 고등 마지막 날. 그날 안 들어왔거나 시험을 먼저 봤으면 대학 첫날
  E4: (s, now) => (st(s, now) === 'high' && dayNumber(s, now) >= HIGH_LAST_DAY) || UG(s, now),
  // 8화 계단 재회: 대학 첫날 밤(저녁·밤·새벽). 그 밤을 놓쳐도 다음 날부터는 언제든
  E12: (s, now) => st(s, now) === 'uni' && (isNight(now) || dayNumber(s, now) > UNI_FROM),
  E9: (s, now) => UG(s, now) && seen(s, 'E12') && s.stats.crush >= 40,
  // 첫눈: 겨울(12~2월)이면 바로, 아니어도 대학 D+12부터(이허의 늦은 첫눈). 설렘 50 ≤ 엔딩 80 이라 엔딩 전에 꼭 나옴
  E5: (s, now) => UG(s, now) && s.stats.crush >= 50 && (isWinter(new Date(now)) || dayNumber(s, now) >= UNI_FROM + 4),
  // 12화 중앙 에어컨: E9 뒤 + 밤 + (오늘 시험을 봤거나 대학 D+3 이후 = 기말이 끝난 셈)
  E10: (s, now) => UG(s, now) && seen(s, 'E9') && isNight(now) && (((s.exam || {}).history || []).some((h) => sameDay(h.t, now)) || dayNumber(s, now) >= UNI_FROM + 3),
  E6: (s, now) => UG(s, now) && s.stats.crush >= 80,
  // 생일(4/22) 당일, 아니면 E6 뒤 대학 D+13부터. ORDER에서 E8보다 앞이라 엔딩 전에 꼭 나옴
  E7: (s, now) => { const d = new Date(now); return UG(s, now) && ((d.getMonth() === 3 && d.getDate() === 22) || (seen(s, 'E6') && dayNumber(s, now) >= UNI_FROM + 5)); },
  E11: (s, now) => UG(s, now) && seen(s, 'E6') && flag(s, 'noodle_postE6'),
  E13: (s, now) => (st(s, now) === 'grad' || (st(s, now) === 'uni' && dayNumber(s, now) >= GRAD_FROM - 1)) && seen(s, 'E11') && s.place === 'beach' && isDay(now),   // 예전엔 P02(고등학생 때만 얻는 카드)도 필요 → 놓치면 영영 불가라 뺌
  // Stage 7: 졸업 후 + E6(고백)을 본 뒤 + 설렘 80 + 바닷가. 시간대 제한 없음
  E8: (s, now) => st(s, now) === 'grad' && seen(s, 'E6') && s.stats.crush >= 80 && s.place === 'beach',
};
/** 원작 회차 순서 (1→2→4→7~8→8→8→10→11→12→15→15→17→24→25화) */
export const ORDER = ['E0', 'E1', 'E2', 'E4', 'E3', 'E12', 'E9', 'E5', 'E10', 'E6', 'E7', 'E11', 'E13', 'E8'];

/** 포토카드 P01~P10 해금 조건. 플래그(s.pflags)는 actions.js·minigame.js가 그 순간 조건을 보고 남김 */
export const CARD_RULES = {
  P01: (s) => flag(s, 'refuse_high'),                                   // 고: 유제품 거절
  P02: (s) => flag(s, 'comfort_high'),                                  // 고: 기분<30일 때 디저트로 달램
  P03: (s, now) => st(s, now) === 'high' && isNight(now) && s.stats.crush >= 30,
  P04: (s, now) => st(s, now) === 'high' && s.stats.grade >= 40,
  P05: (s) => flag(s, 'refuse_uni'),                                    // 대: E12 뒤 유제품 거절
  P06: (s) => flag(s, 'campus_postE11'),                                // E11 뒤 캠퍼스에서 공부
  P07: (s, now) => UG(s, now) && seen(s, 'E11') && s.stats.crush >= 85,
  P08: (s) => flag(s, 'mg_postE6'),                                     // E6 뒤 디저트 받기 1판
  P09: (s, now) => UG(s, now) && seen(s, 'E11') && ['dorm', 'apartment'].includes(s.place) && isNight(now),
  P10: (s, now) => st(s, now) === 'grad' && seen(s, 'E2', 'E11'),
};
export const CARD_IDS = Object.keys(CARD_RULES);
/** 지금 새로 얻는 포토카드 id 목록 (기록은 하지 않음) */
export function dueCards(s, now = Date.now()) {
  if (!s) return [];
  return CARD_IDS.filter((id) => !(s.pcards || {})[id] && CARD_RULES[id](s, now));
}
/** 그 순간 조건을 보고 플래그 남기기. kind: refuse | comfort | study | minigame | feed */
export function noteMoment(s, kind, info = {}, now = Date.now()) {
  const f = (s.pflags = s.pflags || {}); const id = st(s, now);
  if (kind === 'refuse') { if (id === 'high') f.refuse_high = 1; if (id === 'uni' && seen(s, 'E12')) f.refuse_uni = 1; }
  if (kind === 'comfort' && id === 'high') f.comfort_high = 1;
  if (kind === 'study' && s.place === 'campus' && seen(s, 'E11')) f.campus_postE11 = 1;
  if (kind === 'minigame' && seen(s, 'E6')) f.mg_postE6 = 1;
  if (kind === 'feed' && info.food === 'noodle' && seen(s, 'E6')) f.noodle_postE6 = 1;
}

/** 지금 볼 수 있는(아직 안 본) 이벤트 id 또는 null */
export function dueEvent(s, now = Date.now()) {
  if (!s || s.asleep) return null;
  for (const id of ORDER) if (EVENT_RULES[id]) if (!(s.events || {})[id] && EVENT_RULES[id](s, now)) return id;
  return null;
}

/** 스크립트 → 단계 목록. kind: narr(괄호 내레이션) | say(쌍즈 대사) | choice | reward | ending */
export function parseScript(ev) {
  return (ev.script || []).map((raw) => {
    let m;
    if ((m = raw.match(/^\[선택\]\s*(.+)$/))) return { kind: 'choice', options: m[1].split('/').map((x) => x.trim()) };
    if ((m = raw.match(/^\[보상\]\s*(.+)$/))) return { kind: 'reward', text: m[1] };
    if ((m = raw.match(/^\[엔딩\]\s*(.+)$/))) return { kind: 'ending', text: m[1] };
    if ((m = raw.match(/^쌍즈:\s*(.+)$/))) return { kind: 'say', text: m[1] };
    return { kind: 'narr', text: raw.replace(/^\((.*)\)$/, '$1') };
  });
}
/** 선택지 뒤에 붙는 짧은 분기(없으면 빈 배열) */
export const branchSteps = (ev, opt) => (ev.branch?.[opt] || []).map((raw) => parseScript({ script: [raw] })[0]);

/** 이벤트 대사 표정 */
export function eventExpr(text = '') {
  if (/아파|약/.test(text)) return 'E15';
  if (/빨간 거 아니|아니야!|대답\?|보지 마|아무것도 아니/.test(text)) return 'E19';
  if (/울어도|미안|바람 쐬고|안 꺼낼/.test(text)) return 'E10';
  if (/소원|눈이다|종이별|비밀/.test(text)) return 'E15';
  if (/삐질|끝장/.test(text)) return 'E13';
  if (/고마워|헤헤|생일/.test(text)) return 'E01';
  return 'E02';
}
/** 클로즈업·연결 컷: dialogue.json 이벤트의 shots [{ art, at }] → [{ art, i }]
 *  at = 그 문구가 들어 있는 첫 대사(script 줄) 바로 앞에서 컷이 바뀜. 못 찾으면 빼 둠 */
export function eventShots(ev) {
  const sc = (ev && ev.script) || [];
  return ((ev && ev.shots) || []).map((sh) => ({ art: sh.art, i: sc.findIndex((t) => t.includes(sh.at)) })).filter((x) => x.art && x.i >= 0);
}
