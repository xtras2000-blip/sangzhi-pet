// 행동 → 스탯 변화 + 대사 컨텍스트. 순수 로직(DOM 없음).
import { noteFood } from './collection.js';
import { noteMoment } from './events.js';
import { clamp, moodState, stageOf, timeOfDay, dayKey, gainCrush, bump, gnow, passTime, endDay } from './state.js';
import { FOODS, GIFTS, DESSERT_DAILY_LIMIT, GIFT_CRUSH_DAILY, TALK_FULL, TALK_MOOD, TALK_MOOD_LOW, TALK_CRUSH_DAILY, PLAY_FULL, PLAY_MOOD, PLAY_MOOD_LOW, FULL_HUNGER, ACTION_MIN, NIGHT_SLEEP_MIN, NAP_ENERGY, NIGHT_ENERGY } from './config.js';
import { pickLine, pickSys, pickNostalgia, pickMorning } from './dialogue.js';
import { fill } from './messenger.js';

// 대사 내용으로 표정 보정 (EXPRESSIONS.md 트리거)
export function textExpr(t = '') {
  if (/쌍옌/.test(t)) return 'E05';
  if (/종이별|소원|첫눈/.test(t)) return 'E15';
  if (/아니거든|빨간 거 아니|빨갛다고/.test(t)) return 'E19';
  if (/슬퍼|울어|상관.*없어/.test(t)) return 'E10';
  return null;
}
// 받침 유무로 조사 고르기: josa('스케치북','을','를') → '스케치북을'
export const josa = (w, a, b) => { const c = w.charCodeAt(w.length - 1); const has = c >= 0xAC00 && c <= 0xD7A3 ? (c - 0xAC00) % 28 > 0 : false; return w + (has ? a : b); };
const add = (s, k, v) => (k === 'crush' ? gainCrush(s, v) : (s.stats[k] = clamp(s.stats[k] + v)));
// stats/month/day = 조건 대사(cond)용, hist = 풀별 반복 방지 기록(세이브 s.lineHist에 저장)
export const ctxFor = (s, action, state, strict = false, extra = {}) => ({ action, state: state ?? moodState(s), stage: stageOf(s).dlg, time: timeOfDay().id, place: s.place || null, strict, stats: s.stats, events: s.events || {}, month: new Date(gnow()).getMonth() + 1, hist: (s.lineHist ||= {}), ...extra });
/** 아침(하루 시작) 인사·아침 문자: 단계별 풀에서 반복 없이 */
export function morningLine(s) {
  const line = pickMorning({ stage: stageOf(s).dlg, stats: s.stats, events: s.events || {}, month: new Date(gnow()).getMonth() + 1, hist: (s.lineHist ||= {}) });
  return { line: { ...line, text: fill(line.text, s.player && s.player.name) }, expr: line.expr || 'E01' };
}
// 회상(원작 명장면) 시도: 조건 맞으면 25%·하루 1번
const nostCtx = (s, on, extra = {}) => { const d = new Date(gnow()); return { on, stage: stageOf(s).dlg, state: moodState(s), place: s.place || null, crush: s.stats.crush, grade: s.stats.grade, events: s.events || {}, month: d.getMonth() + 1, time: timeOfDay().id, ...extra }; };
export const tryNostalgia = (s, on, extra) => pickNostalgia(nostCtx(s, on, extra), s);
// 줄 표정 → 결과 표정 (then 체인용). eat/E22는 행동이 정하므로 일반 표정으로 바꿈
const after = (line, dflt = 'E01') => (line && line.expr && !['eat', 'E22', 'idle'].includes(line.expr) ? line.expr : dflt);

/** 결과: { line, expr, fx, ms } */
export function doAction(s, act, arg) {
  const st = s.stats;
  switch (act) {
    case 'feed': {
      const f = FOODS.find((x) => x.id === arg) || FOODS[0];
      s.stats_meta.feeds++; s.daily.done.feed = true; noteFood(s, f.id);
      if (f.dairy) {
        // 우유 알레르기(PLAN §6-1): 첫 번째 = 간질간질 + 기분 -10, 같은 날 두 번째부터 = 먼저 확인하고 거절(스탯 변화 없음)
        if (s.daily.dairy >= 1) { noteMoment(s, 'refuse'); bump(s, 'dairyRefuse'); const l = pickSys('dairyRefuse'); return { line: l, expr: l.expr, fx: '🥛❌', allergy: 'refuse', noTime: true }; }
        s.daily.dairy++;
        add(s, 'hunger', Math.round(f.hunger / 2)); add(s, 'mood', -10);
        const l = pickSys('dairy');
        return { line: l, expr: l.expr, fx: '💦', allergy: 'itch' };
      }
      // 배부르면 식사는 거절(디저트 배는 따로). 수치가 늘 100에 붙어 있지 않게
      if (!f.dessert && st.hunger >= FULL_HUNGER) return { line: pickSys('tooFull'), expr: 'E13', then: 'E01', fx: '🙅', noTime: true };
      bump(s, 'feed'); if (f.id === 'tanghulu') bump(s, 'tanghulu'); if (f.id === 'noodle') bump(s, 'noodle');
      noteMoment(s, 'feed', { food: f.id });
      if (f.dessert && st.mood < 30 && f.mood > 0) noteMoment(s, 'comfort');
      add(s, 'hunger', f.hunger);
      if (f.dessert) {
        s.daily.desserts++;
        if (s.daily.desserts > DESSERT_DAILY_LIMIT) return { line: pickSys('tooSweet'), expr: 'eat', then: 'E23', fx: '🦷', food: f.id };
      }
      add(s, 'mood', f.mood);
      const state = st.mood < 30 ? '샐짐' : 'any';
      const line = pickLine(ctxFor(s, '밥', state, false, { item: f.id }));
      return { line, expr: 'eat', then: after(line), fx: f.icon, food: f.id };
    }
    case 'play': {
      if (st.energy < 10) { const l = pickLine(ctxFor(s, '놀기', '졸림')); return { line: l, expr: 'E21', fx: '💤', noTime: true }; }
      s.stats_meta.plays++; s.daily.done.studyOrPlay = true; bump(s, 'play');
      const before = moodState(s);
      s.daily.plays = (s.daily.plays || 0) + 1;
      add(s, 'mood', s.daily.plays <= PLAY_FULL ? PLAY_MOOD : PLAY_MOOD_LOW); add(s, 'energy', -10); add(s, 'hunger', -5);
      const line = pickLine(ctxFor(s, '놀기', before === '샐짐' ? '샐짐' : '기분좋음'));
      return { line, expr: 'hop', then: after(line), fx: '🎵' };
    }
    case 'study': {
      if (st.energy < 15) return { line: pickSys('tooSleepyStudy'), expr: 'E21', fx: '💤', noTime: true };
      if (st.mood < 25) { add(s, 'mood', -2); return { line: pickSys('studyRefuse'), expr: 'E13', fx: '', noTime: true }; }
      s.stats_meta.studies++; s.daily.done.studyOrPlay = true; bump(s, 'study');
      bumpStudyStreak(s); noteMoment(s, 'study');
      add(s, 'grade', 10); add(s, 'mood', -6); add(s, 'energy', -8); add(s, 'hunger', -4);
      const nl = tryNostalgia(s, '공부');
      if (nl) return { line: nl, expr: 'E07', then: after(nl), fx: '📖' };
      const line = pickLine(ctxFor(s, '공부', '공부'));
      return { line, expr: after(line, 'E07'), fx: '' };
    }
    case 'sleep': {
      // 예전: 실제 1시간에 체력 +15 → 사실상 안 참. 이제: 20시 전 = 낮잠(체력 +30, 2시간), 20시부터 = 밤잠(체력 가득 → 다음 날 아침)
      s.asleep = false;
      if (s.gt.min >= NIGHT_SLEEP_MIN) {
        const line = pickLine(ctxFor(s, '잠', st.energy < 50 ? '졸림' : 'any'));
        st.energy = Math.max(st.energy, NIGHT_ENERGY); add(s, 'hunger', -8); add(s, 'mood', 5);
        const day = endDay(s);
        return { line, expr: 'E22', then: 'E01', fx: '🌙', night: true, day, noTime: true };
      }
      if (st.energy > 85) return { line: pickSys('sleepRefuse'), expr: 'E13', fx: '', noTime: true };
      const line = pickLine(ctxFor(s, '잠', st.energy < 50 ? '졸림' : 'any'));
      const before = st.energy; add(s, 'energy', NAP_ENERGY);
      return { line, expr: 'E22', then: 'E21', fx: '💤', nap: true, gain: Math.round(st.energy - before), ms: 2200 };
    }
    case 'talk': {
      s.stats_meta.talks++; s.daily.done.talk = true; bump(s, 'talk');
      let state = moodState(s);
      // 설렘이 높을수록 자쉬 오빠 이야기(설렘 태그)가 나올 확률↑
      if (state === 'any' || state === '기분좋음') if (Math.random() < 0.15 + st.crush / 200) state = '설렘';
      // 하루 처음 몇 번만 크게: 기분 +5(TALK_FULL번까지, 그 뒤 +1) · 설렘 +1(TALK_CRUSH_DAILY번까지)
      s.daily.talks = (s.daily.talks || 0) + 1;
      add(s, 'mood', s.daily.talks <= TALK_FULL ? TALK_MOOD : TALK_MOOD_LOW);
      if (s.daily.talks <= TALK_CRUSH_DAILY) add(s, 'crush', 1);
      const nl = tryNostalgia(s, '대화', { state: state === '설렘' ? '설렘' : moodState(s) });
      if (nl) return { line: nl, expr: after(nl), fx: '📖' };
      const line = pickLine(ctxFor(s, '대화', state));
      // 설렘 높을 때 수줍은 표정(E02)은 새빨개짐(E19)으로 한 단계 올림
      let ex = after(line);
      if (ex === 'E02' && state === '설렘' && st.crush >= 60) ex = 'E19';
      return { line, expr: ex, fx: '' };
    }
    case 'gift': {
      s.stats_meta.gifts++; bump(s, 'gift');
      const g = GIFTS.find((x) => x.id === arg) || GIFTS[Math.floor(Math.random() * GIFTS.length)];
      s.inventory[g.id] = (s.inventory[g.id] || 0) + 1;
      const state = st.mood < 30 ? '샐짐' : (Math.random() < 0.3 ? '기분좋음' : 'any');
      s.daily.gifts = (s.daily.gifts || 0) + 1;
      const note = `${g.icon} ${josa(g.name, '을', '를')} 줬어요`;
      if (s.daily.gifts > GIFT_CRUSH_DAILY) {
        // 하루 한도 초과: 반응은 하지만 설렘 +0, 기분만 조금. 힌트 대사
        add(s, 'mood', 2);
        const l = pickSys('giftEnough');
        return { line: l, expr: l.expr, then: 'E01', fx: g.icon, note: `${note} · 💓 오늘 선물 설렘은 끝 (내일 다시)`, gift: g.id, crush: 0 };
      }
      add(s, 'mood', 12); add(s, 'crush', 3);
      const nl = tryNostalgia(s, '선물', { item: g.id });
      if (nl) return { line: nl, expr: 'E11', then: after(nl), fx: g.icon, note, gift: g.id, crush: 3 };
      const line = pickLine(ctxFor(s, '선물', state, false, { item: g.id }));
      return { line, expr: 'E11', then: after(line), fx: g.icon, note, gift: g.id, crush: 3 };
    }
  }
  return { line: pickSys('hello'), expr: 'E01' };
}

/** 행동 + 게임 시간 흐름. 거절된 행동(noTime)은 시간이 안 감. r.time = { from, to, crossedMsg } */
const TIME_KEY = { feed: 'feed', talk: 'talk', play: 'play', study: 'study', gift: 'gift', sleep: 'nap' };
export function timedAction(s, act, arg) {
  const r = doAction(s, act, arg);
  if (!r.noTime && TIME_KEY[act]) r.time = passTime(s, ACTION_MIN[TIME_KEY[act]]);
  return r;
}

/** 공부 연속 일수(E2 해금): 어제도 했으면 +1, 오늘 처음이면 1부터 */
export function bumpStudyStreak(s, now = gnow()) {
  const today = dayKey(now), y = dayKey(now - 86400_000);
  s.streak = s.streak || { study: 0, last: '' };
  if (s.streak.last === today) return s.streak.study;
  s.streak.study = s.streak.last === y ? s.streak.study + 1 : 1;
  s.streak.last = today;
  return s.streak.study;
}

/** 장소 도착 대사: 회상 → 장소별 도착 줄 */
export function arriveLine(s, placeId) {
  const nl = tryNostalgia(s, '도착', { place: placeId });
  if (nl) return { line: nl, expr: after(nl) };
  const line = pickLine({ ...ctxFor(s, '도착', 'any'), place: placeId });
  return { line, expr: after(line) };
}

/** 캐릭터를 탭했을 때: 지금 상태를 알려주는 혼잣말 */
export function pokeLine(s) {
  const m = moodState(s);
  if (m === '수면') return { line: { id: 'SYS_zzz', text: '쿨… 쿨… (자는 중)' }, expr: 'E22' };
  if (m === '배고픔') { const l = pickLine(ctxFor(s, '밥', '배고픔', true)); return { line: l, expr: after(l, 'E23'), fx: '' }; }
  if (m === '졸림') { const l = pickLine(ctxFor(s, '대화', '졸림', true)); return { line: l, expr: after(l, 'E21'), fx: '' }; }
  return doAction(s, 'talk');
}
