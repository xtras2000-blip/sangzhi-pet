// v0.9.4 퀴즈 확장: 게임 데이터(대사·이벤트·음식)와 템플릿으로 단계별 문항을 자동 생성. 순수 함수
// kind: say(쌍즈라면 뭐라고 할까) · face(표정 고르기, 이모지) · taste(취향·음식) · story(본 이벤트만, 드라마 장면) · study(공부할 때: 학년에 맞는 과목)
// type: mc(4지선다) · tf(O/X) · emoji(이모지 4지선다). id 는 안정적(반복 금지 기록용)
import { FOODS } from './config.js';
import { EVENT_PLACES } from './evplace.js';
export const STAGE_DLG = ['중', '고', '대', '졸'];
const WHEN = { 밥: '밥 차려 줬을 때', 공부: '공부하자고 했을 때', 잠: '자자고 했을 때', 놀기: '놀자고 했을 때', 선물: '선물 받았을 때', 도착: '어디 도착했을 때' };
const SIT = { 밥: '밥 차려 주면', 공부: '공부하자고 하면', 잠: '이제 자자고 하면', 놀기: '같이 놀자고 하면', 선물: '선물을 주면', 도착: '어디 도착하면' };
export const FACE = { E13: '😤', E19: '😳', E21: '😪', E10: '😢', E23: '🤤', E11: '😲', E15: '🙏' };
const FACE_NAME = { E13: '삐짐', E19: '새빨개짐', E21: '졸림', E10: '슬픔', E23: '배고픔', E11: '깜짝', E15: '소원 비는 표정' };
// 결정적 난수(같은 데이터 → 같은 문항)
function rng(seed) { let x = 0; for (const c of String(seed)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296); }
const pickN = (arr, n, r, not = []) => { const a = arr.filter((x) => !not.includes(x)); const out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(r() * a.length), 1)[0]); return out; };
const short = (t, n = 46) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
const mc = (id, stage, kind, q, correct, wrongs, extra = {}) => ({ id, stage, kind, type: 'mc', gen: true, verified: true, src: 'game', q, options: [correct, ...wrongs], answer: 0, ...extra });
const tf = (id, stage, kind, q, truth, extra = {}) => ({ id, stage, kind, type: 'tf', gen: true, verified: true, src: 'game', q, options: ['⭕ 맞아', '❌ 아니야'], answer: truth ? 0 : 1, ...extra });

export function genSay(lines) {
  const out = [];
  for (const st of STAGE_DLG) {
    const by = {}; for (const a of Object.keys(SIT)) by[a] = lines.filter((l) => l.action === a && (l.stage === st) && !/\{/.test(l.text));
    for (const [a, list] of Object.entries(by)) for (const l of list) {
      const r = rng(l.id), others = Object.keys(SIT).filter((x) => x !== a && by[x].length);
      if (others.length < 3) continue;
      const wr = pickN(others, 3, r).map((o) => short(by[o][Math.floor(r() * by[o].length)].text));
      out.push(mc(`G:say:${l.id}`, st, 'say', `내가 이렇게 말할 때는 언제게?\n“${short(l.text, 60)}”`, WHEN[a], pickN(Object.keys(SIT).filter((x) => x !== a), 3, r).map((x) => WHEN[x])));
      out.push(mc(`G:say2:${l.id}`, st, 'say', `${SIT[a]} 나는 뭐라고 할까?`, short(l.text), wr));
    }
  }
  return out;
}
export function genFace(lines) {
  const out = [], keys = Object.keys(FACE);
  for (const l of lines) {
    if (!FACE[l.expr] || !STAGE_DLG.includes(l.stage) || /\{/.test(l.text)) continue;
    const r = rng('f' + l.id), wr = pickN(keys, 3, r, [l.expr]).map((k) => FACE[k]);
    out.push({ ...mc(`G:face:${l.id}`, l.stage, 'face', `이 말 할 때 내 표정은?\n“${short(l.text, 60)}”`, FACE[l.expr], wr), type: 'emoji', hint: FACE_NAME[l.expr] });
  }
  return out;
}
export function genTaste(tasteSets = []) {
  const out = [], dairy = FOODS.filter((f) => f.dairy), ok = FOODS.filter((f) => !f.dairy), des = FOODS.filter((f) => f.dessert), meal = FOODS.filter((f) => !f.dessert);
  for (const st of ['중']) {   // 취향은 단계와 상관없음(한 번만 만들고 모든 단계에서 나옴)
    for (const f of FOODS) {
      out.push(tf(`G:tf_food:${st}:${f.id}`, st, 'taste', `${f.icon} ${f.name}, 나 먹어도 괜찮을까?`, !f.dairy, { note: f.dairy ? '🥛 우유 알레르기' : '' }));
      out.push(tf(`G:tf_des:${st}:${f.id}`, st, 'taste', `${f.icon} ${f.name}은(는) 디저트다!`, !!f.dessert));
    }
    for (const d of dairy) for (const trio of [[0, 1, 2], [1, 2, 3], [0, 2, 3], [0, 1, 3]]) {
      const w = trio.map((i) => ok[i]).filter(Boolean); if (w.length < 3) continue;
      out.push(mc(`G:allergy:${st}:${d.id}:${trio.join('')}`, st, 'taste', '이 중에 내가 먹으면 안 되는 건? (힌트: 🥛)', `${d.icon} ${d.name}`, w.map((x) => `${x.icon} ${x.name}`)));
    }
    for (const m of meal) for (const trio of [[0, 1, 2], [1, 2, 3], [0, 2, 3]]) {
      const w = trio.map((i) => des[i]).filter(Boolean); if (w.length < 3) continue;
      out.push(mc(`G:meal:${st}:${m.id}:${trio.join('')}`, st, 'taste', '디저트 말고 “밥”인 건?', `${m.icon} ${m.name}`, w.map((x) => `${x.icon} ${x.name}`)));
    }
  }
  const rank = { 중: 0, 고: 1, 대: 2, 졸: 3, any: 0 };
  for (const t of tasteSets) {
    const right = t.options.find((o) => o.icon === t.answer); if (!right) continue;
    for (const st of STAGE_DLG.filter((x) => rank[x] >= (rank[t.stage] ?? 0))) {
      out.push(mc(`G:tset:${st}:${t.id}`, st, 'taste', `${t.topic}: 내가 제일 좋아하는 건?`, right.label, t.options.filter((o) => o !== right).map((o) => o.label).slice(0, 3), { verified: t.verified !== false }));
    }
  }
  return out;
}
export function genStory(events = []) {
  const out = [], say = (e) => (e.script || []).filter((x) => /^쌍즈:/.test(x)).map((x) => x.replace(/^쌍즈:\s*/, '')).filter((x) => !/^\(/.test(x));
  const stageOf = (e) => ({ 중: '중', 고: '고', 대: '대', 졸: '졸' })[String(e.stage || '').slice(0, 1)] || '대';
  const allPlaces = Object.values(EVENT_PLACES).map((p) => p.name);
  const eps = (e) => { const m = String(e.inspired || '').match(/(\d+)(?:~\d+)?화/); return m ? +m[1] : null; };
  for (const e of events) {
    const P = EVENT_PLACES[e.id]; if (!P) continue;
    const st = stageOf(e), r = rng('s' + e.id), others = events.filter((x) => x.id !== e.id && EVENT_PLACES[x.id]);
    out.push(mc(`G:st_place:${e.id}`, st, 'story', `‘${e.title}’ 그 일, 어디서 있었더라?`, P.name, pickN(allPlaces, 3, r, [P.name]), { need: e.id }));
    const wp = pickN(allPlaces, 1, r, [P.name])[0];
    out.push(tf(`G:st_tf:${e.id}`, st, 'story', `‘${e.title}’ 은(는) ${wp}에서 있었던 일이다!`, false, { need: e.id }));
    out.push(tf(`G:st_tf2:${e.id}`, st, 'story', `‘${e.title}’ 은(는) ${P.name}에서 있었던 일이다!`, true, { need: e.id }));
    const lines = say(e);
    lines.forEach((ln, i) => {
      const wr = pickN(others.flatMap(say), 3, rng(e.id + i));
      if (wr.length === 3) out.push(mc(`G:st_line:${e.id}:${i}`, st, 'story', `‘${e.title}’ 때 내가 한 말은?`, short(ln), wr.map((x) => short(x)), { need: e.id }));
      const wt = pickN(others, 3, rng('t' + e.id + i)).map((x) => x.title);
      if (wt.length === 3) out.push(mc(`G:st_title:${e.id}:${i}`, st, 'story', `“${short(ln, 50)}”\n이 말 했던 장면은?`, e.title, wt, { need: e.id }));
    });
    const n = eps(e);
    if (n) out.push(mc(`G:st_ep:${e.id}`, st, 'story', `‘${e.title}’ 은(는) 드라마 몇 화 장면이게?`, `${n}화`, pickN([1, 2, 4, 6, 8, 12, 15, 17, 20, 24].filter((x) => x !== n), 3, r).map((x) => `${x}화`), { need: e.id }));
  }
  return out;
}
// ── 공부: 학년에 맞는 과목 ──
const WORDS = {
  중: [['apple', '사과'], ['library', '도서관'], ['weather', '날씨'], ['friend', '친구'], ['brother', '오빠/형'], ['homework', '숙제'], ['teacher', '선생님'], ['watermelon', '수박'], ['secret', '비밀'], ['star', '별'], ['window', '창문'], ['umbrella', '우산']],
  고: [['achieve', '이루다'], ['confess', '고백하다'], ['entrance exam', '입학시험'], ['determine', '결심하다'], ['graduate', '졸업하다'], ['patient', '참을성 있는'], ['promise', '약속'], ['distance', '거리'], ['effort', '노력'], ['memory', '기억']],
  대: [['algorithm', '알고리즘'], ['dormitory', '기숙사'], ['semester', '학기'], ['assignment', '과제'], ['lecture', '강의'], ['scholarship', '장학금'], ['internship', '인턴십'], ['deadline', '마감'], ['campus', '캠퍼스'], ['thesis', '논문']],
  졸: [['meeting', '회의'], ['schedule', '일정'], ['proposal', '제안서'], ['colleague', '동료'], ['salary', '월급'], ['client', '고객'], ['presentation', '발표'], ['contract', '계약'], ['overtime', '야근'], ['promotion', '승진']],
};
export function genStudy() {
  const out = [];
  const num = (st, id, q, ans, wrongs) => out.push(mc(`G:study:${st}:${id}`, st, 'study', q, String(ans), wrongs.map(String)));
  const uniq = (ans, cands) => [...new Set(cands.filter((x) => x !== ans))].slice(0, 3);
  for (const st of STAGE_DLG) {
    const r = rng('study' + st);
    for (let i = 0; i < 22; i++) {
      if (st === '중') {           // 일차방정식 ax + b = c, 정수 해
        const a = 2 + Math.floor(r() * 7), x = 1 + Math.floor(r() * 12), b = Math.floor(r() * 20) - 5, c = a * x + b;
        num(st, `lin${i}`, `✏️ 수학: ${a}x ${b >= 0 ? '+' : '−'} ${Math.abs(b)} = ${c} 일 때 x는?`, x, uniq(x, [x + 1, x - 1, x + 2, x + 3, -x]));
      } else if (st === '고') {    // 이차방정식 두 근의 합 / 로그
        if (i % 2) { const p = 1 + Math.floor(r() * 9), q = 1 + Math.floor(r() * 9); num(st, `quad${i}`, `✏️ 수학: x² − ${p + q}x + ${p * q} = 0 의 두 근의 합은?`, p + q, uniq(p + q, [p * q, p + q + 1, p + q - 1, p - q, q - p + 10])); }
        else { const k = 1 + Math.floor(r() * 10); num(st, `log${i}`, `✏️ 수학: log₂ ${2 ** k} 의 값은?`, k, uniq(k, [k + 1, k - 1, 2 * k, k + 2])); }
      } else if (st === '대') {    // 미분 / 2진수
        if (i % 2) { const n = 2 + Math.floor(r() * 6), c = 1 + Math.floor(r() * 5); num(st, `der${i}`, `📐 미적분: f(x) = ${c}x^${n} 일 때 f′(1) 은?`, c * n, uniq(c * n, [c, n, c * n + c, c + n, c * (n - 1)])); }
        else { const v = 5 + Math.floor(r() * 58); num(st, `bin${i}`, `💻 컴퓨터: 2진수 ${v.toString(2)} 을 10진수로 바꾸면?`, v, uniq(v, [v + 1, v - 1, v + 2, v * 2, v - 2])); }
      } else {                     // 졸: 회사 숫자 감각
        if (i % 2) { const base = (2 + Math.floor(r() * 18)) * 100, pct = [5, 10, 15, 20, 25][Math.floor(r() * 5)], ans = base * (100 + pct) / 100; num(st, `pct${i}`, `📊 업무: 매출 ${base}만 원이 ${pct}% 늘면?`, `${ans}만 원`, [`${base + pct}만 원`, `${ans + 100}만 원`, `${base * (100 - pct) / 100}만 원`]); }
        else { const h = 1 + Math.floor(r() * 5), m = [0, 15, 30, 45][Math.floor(r() * 4)], dur = 30 + 15 * Math.floor(r() * 7); const end = (9 + h) * 60 + m + dur; const fmt = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; num(st, `time${i}`, `📅 업무: ${fmt((9 + h) * 60 + m)}에 시작한 ${dur}분 회의는 몇 시에 끝나?`, fmt(end), [fmt(end + 15), fmt(end - 15), fmt(end + 60)]); }
      }
    }
    const W = WORDS[st];
    W.forEach(([en, ko], i) => {
      const wr = pickN(W.map((w) => w[1]), 3, rng(en), [ko]);
      out.push(mc(`G:study:${st}:en${i}`, st, 'study', `🔤 영어: “${en}” 의 뜻은?`, ko, wr));
      const fake = W[(i + 1 + Math.floor(rng('x' + en)() * (W.length - 1))) % W.length][1];
      const truth = i % 2 === 0;
      out.push(tf(`G:study:${st}:entf${i}`, st, 'study', `🔤 영어: “${en}” 은(는) “${truth ? ko : fake}” 라는 뜻이다!`, truth || fake === ko));
    });
  }
  return out;
}
export function buildPool({ lines = [], events = [], taste = [] } = {}) {
  return [...genSay(lines), ...genFace(lines), ...genTaste(taste), ...genStory(events), ...genStudy()];
}
/** 보기 섞기(⭕/❌ 는 그대로). 반환: 새 객체(answer 다시 계산) */
export function shuffled(q, rnd = Math.random) {
  if (q.type === 'tf') return q;
  const idx = q.options.map((_, i) => i).sort(() => rnd() - 0.5);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return { ...q, options: idx.map((i) => q.options[i]), answer: idx.indexOf(q.answer) };
}
