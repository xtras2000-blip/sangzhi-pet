// v0.9.5 이벤트 장소: 이벤트가 '될 때'가 되면 지도에 평소엔 없는 특별 장소가 열리고(✨NEW),
// 쌍즈가 거기 갈 이유를 말함. 그동안 다른 행동은 잠김 → 그 장소에 도착하면 이벤트 시작 → 장소는 다시 닫힘.
// 이벤트는 다른 곳에서 저절로 시작하지 않음. 순수 로직(DOM 없음)
export const EVENT_PLACES = {
  E0:  { place: 'ev_sangyan_room', name: '쌍옌 오빠 방', icon: '🍉', city: '남우 · 우리 집', drama: '1화 쌍즈네 집, 쌍옌 방',
         line: '엄마가 쌍옌 오빠 방에 수박 갖다주래… 친구 왔다나 봐. 같이 가자, 혼자 가기 싫어!' },
  E1:  { place: 'ev_school_office', name: '욱일중학 교무실', icon: '📋', city: '남우', drama: '2~3화 학부모 소환, 학교 교무실',
         line: '자쉬 오빠가 우리 오빠인 척 교무실에 와 준대! …진짜 올지는 모르겠지만. 교무실 앞까지 같이 가 줘!',
         // v0.9.6 E1 앞 장면(원작 2화): 수업 중 멍때림(창밖 어미 새) + 말대꾸 → 담임 천 선생님이 '내일 보호자 모셔 와'.
         // 이번 주 벌써 세 번째, 쌍옌 오빠는 거절 → 처음 본 오빠 친구(돤자쉬)에게 친오빠인 척 와 달라고 부탁하기로. 친구 선택은 말투만 바뀜
         pre: {
           steps: [
             '(하굣길. 쌍즈가 구겨진 종이 한 장을 들고 터덜터덜 걸어온다)',
             '쌍즈: {call}… 나 망했어. 이거 봐. 학부모 소환장.',
             '쌍즈: 수업 시간에 창밖에서 엄마 새가 아기 새들 밥 주는 거 보고 있었거든. 천 선생님이 뭐 하냐길래 그대로 말했더니… 말대꾸래.',
             '쌍즈: 이번 주에만 벌써 세 번째야. 엄마 알면 진짜 끝장이야. 쌍옌 오빠는 문자 보내자마자 \'안 가\'래. 치사해.',
           ],
           choice: [
             { label: '헐… 새 구경은 좀 억울하다', reply: '그치?! 아기 새가 얼마나 귀여웠는데! …아, 이게 중요한 게 아니지.' },
             { label: '그러게 수업 좀 듣지 ㅋㅋ', reply: '알아, 안다고! 지금 놀릴 때야?! …근데 맞는 말이라 더 억울해.' },
             { label: '일단 진정해. 같이 방법 찾자', reply: '…응. 너 있어서 다행이다. 진짜로.' },
           ],
           after: [
             '쌍즈: …그러고 보니 쌍옌 오빠 친구, 자쉬 오빠 있잖아. 자쉬 오빠한테 우리 오빠인 척 와 달라고 부탁해 볼까?',
             '쌍즈: 부탁은 내가 직접 할게. 대신 너도 교무실 앞까지 같이 가 줘. 혼자는 무서워!',
           ],
         } },
  E2:  { place: 'ev_stationery', name: '학교 앞 문구점', icon: '⭐', city: '남우', drama: '종이별 모티프(학교 앞 문구점 별 종이)',
         line: '종이별 접는 종이 다 떨어졌어. 학교 앞 문구점 가자! …뭐 접냐고 묻지 마.' },
  E3:  { place: 'ev_dorm_desk', name: '기숙사 내 책상 (별 쪽지)', icon: '📝', city: '이허', drama: '8화 이허대 기숙사, 목표 쪽지',
         line: '나 목표 쪽지 새로 쓸 거야. 기숙사 내 자리 가자, 오늘은 꼭 줄 하나 긋고 싶어.' },
  E4:  { place: 'ev_nanwu_airport', name: '남우 공항', icon: '✈️', city: '남우', drama: '이허행 비행기(혼자 떠난 장면)',
         line: '…나 공항 좀 데려다줄래? 아무것도 묻지 말고. 그냥… 꼭 확인할 게 있어.' },
  E5:  { place: 'ev_fountain_snow', name: '분수 광장 (첫눈)', icon: '❄️', city: '이허', drama: '11화 첫눈 날 분수 광장 소원',
         line: '눈 온대!! 이허에 눈이라니 말도 안 돼. 분수 광장 가자, 첫눈 오면 소원 빌 거야!' },
  E6:  { place: 'ev_jx_door', name: '자쉬 오빠 집 앞', icon: '🚪', city: '이허', drama: '고백 장면(오빠 집 앞)',
         line: '자쉬 오빠가… 할 말 있다고 집 앞으로 오래. 같이 가 줘, 심장 터질 것 같아.' },
  E7:  { place: 'ev_jx_home', name: '자쉬 오빠 집', icon: '🎂', city: '이허', drama: '생일 선물 장면(오빠 집)',
         line: '자쉬 오빠가 오늘 집으로 오래! 뭐 준비했대… 나 이 옷 괜찮아? 가자 가자!' },
  E8:  { place: 'ev_beach_night', name: '밤바다 산책로', icon: '🌙', city: '이허', drama: '결말 바닷가 산책',
         line: '오늘 밤바다 보러 가자. 자쉬 오빠도 온대… 할 얘기가 있대. 무슨 얘기일까.' },
  E9:  { place: 'ev_hospital', name: '이허 병원', icon: '🏥', city: '이허', drama: '9~10화 자쉬 오빠 급성 맹장염 수술, 병원',
         line: '자쉬 오빠가 저녁 약속 못 온대… 목소리가 이상해. 회사 들렀다가 병원 가야 할지도 몰라, 같이 가 줘!' },
  E10: { place: 'ev_bbq', name: '꼬치집 (기말 뒤풀이)', icon: '🍢', city: '이허', drama: '12화 기말 끝난 밤 뒤풀이',
         line: '기말 끝났다아!! 룸메들이랑 꼬치집 간대. 오늘은 나도 한 잔만… 같이 가자!' },
  E11: { place: 'ev_noodle_shop', name: '빌린 작은 식당', icon: '🍜', city: '이허', drama: '17화 식당을 빌려 끓인 장수면',
         line: '자쉬 오빠 생일이야. 식당 하나 통째로 빌렸어… 장수면 내가 끓일 거야. 비밀로 하고 같이 가 줘!' },
  E12: { place: 'ev_campus_steps', name: '이허대 광장 돌계단', icon: '🌃', city: '이허', drama: '8화 입학 후 광장 돌계단 재회',
         line: '입학 첫날 밤이다… 광장 돌계단 가 보자. 거기 야경 예쁘대. …그냥, 바람 쐬고 싶어서.' },
  E13: { place: 'ev_bike_road', name: '바닷가 순환도로 자전거 대여소', icon: '🚲', city: '이허', drama: '24화 바닷가 순환도로 자전거',
         line: '날씨 진짜 좋다! 자전거 빌려서 바닷가 순환도로 달리자. 자쉬 오빠도 온대!' },
};
export const isEventPlace = (pid) => typeof pid === 'string' && pid.startsWith('ev_');
export const eventOfPlace = (pid) => Object.keys(EVENT_PLACES).find((k) => EVENT_PLACES[k].place === pid) || null;
/** 될 때가 된 이벤트를 '대기'로. 이미 대기 중이면 그대로. 새로 대기하면 그 정보, 아니면 null */
export function setPending(s, evId, now = 0) {
  if (!evId || !EVENT_PLACES[evId] || (s.events || {})[evId]) return null;
  if (s.evPending && s.evPending.id === evId) return null;
  if (s.evPending && !(s.events || {})[s.evPending.id]) return null;   // 하나씩
  s.evPending = { id: evId, since: now };
  return { id: evId, ...EVENT_PLACES[evId] };
}
/** 지금 대기 중인 이벤트(이미 본 거면 정리) */
export function pending(s) {
  const p = s.evPending; if (!p) return null;
  if ((s.events || {})[p.id]) { s.evPending = null; return null; }
  return { id: p.id, ...EVENT_PLACES[p.id] };
}
/** 대기 중이면 장소 이동 말고는 모두 잠김 */
export const lockedAll = (s) => !!pending(s);
/** 지도에 보일 특별 장소 (대기 중일 때만) */
export const specialPlaces = (s) => { const p = pending(s); return p ? [{ id: p.place, ev: p.id, name: p.name, icon: p.icon, city: p.city }] : []; };
/** 특별 장소 도착 → 시작할 이벤트 id (아니면 null) */
export function arrive(s, pid) {
  const p = pending(s); if (!p || p.place !== pid) return null;
  return p.id;
}
