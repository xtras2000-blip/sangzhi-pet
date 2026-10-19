// 게임 상수 — PLAN.md v0.2 §5 기준
export const SCHEMA_VERSION = 1;
export const SAVE_KEY = 'sangzhi-pet.save';
export const GAME_VERSION = '0.7.0-stage7';

export const STATS = [
  { key: 'hunger', label: '배고픔', icon: '🍚', color: '#FFB36B', hint: '높을수록 배불러요' },
  { key: 'mood',   label: '기분',   icon: '💗', color: '#FF7FA3' },
  { key: 'energy', label: '체력',   icon: '🌙', color: '#8FB8FF' },
  { key: 'grade',  label: '성적',   icon: '📚', color: '#7FD6B5' },
  { key: 'crush',  label: '설렘',   icon: '💓', color: '#C59BFF' },
];

// 시간당 변화량
export const DECAY = {
  hunger: -6,
  mood: -4,          // 배고픔<30 또는 체력<20 이면 2배
  energyAwake: -5,
  energySleep: +15,
  grade: -1,
  crush: 0,
};
export const MAX_OFFLINE_H = 48;
export const LOW = { hunger: 30, mood: 30, energy: 20 };

// 성장 단계 (접속 일수 기준. 성장 시험 게이트는 Stage 3에서 추가)
export const STAGES = [
  { id: 'mid',  name: '중학생', fromDay: 1,  dlg: '중' },
  { id: 'high', name: '고등학생', fromDay: 4, dlg: '고' },
  { id: 'uni',  name: '대학생', fromDay: 8,  dlg: '대' },
  { id: 'grad', name: '졸업 후', fromDay: 15, dlg: '졸' }, // Stage 4: 졸업 후 전용 대사(졸) + 공통. 없는 조합만 대학생 대사로 대체
];

export const RARITY_WEIGHT = { '일반': 85, '희귀': 12, '전설': 3 };

// 밥 메뉴 (dairy = 우유 알레르기 규칙 §6-1)
export const FOODS = [
  { id: 'rice', px: 'rice',     name: '집밥',        icon: '🍚', hunger: 35, mood: 2,  dessert: false, dairy: false },
  { id: 'noodle', px: 'noodle',   name: '계란 라면',    icon: '🍜', hunger: 28, mood: 5,  dessert: false, dairy: false },
  { id: 'tanghulu', px: 'tanghulu', name: '딸기 탕후루',  icon: '🍓', hunger: 10, mood: 14, dessert: true,  dairy: false },
  { id: 'lollipop', px: 'lollipop', name: '막대사탕',     icon: '🍭', hunger: 4,  mood: 11, dessert: true,  dairy: false },
  { id: 'pudding', px: 'milk_pudding',  name: '우유 푸딩',    icon: '🍮', hunger: 10, mood: 12, dessert: true,  dairy: true },
  { id: 'icecream', px: 'icecream', name: '아이스크림',   icon: '🍦', hunger: 8,  mood: 12, dessert: true,  dairy: true },
];
export const DESSERT_DAILY_LIMIT = 3;

export const GIFTS = [
  { id: 'hairpin', name: '머리핀', icon: '🎀' },
  { id: 'starpaper', name: '종이별 색종이', icon: '⭐' },
  { id: 'sketch', name: '스케치북', icon: '🎨' },
  { id: 'candy', name: '별사탕', icon: '🍬' },
];

// ── Stage 3: 장소(배경) — LOCATIONS.md 매핑. img: 낮, night: 밤(없으면 낮 + 틴트), dusk: 저녁(해질녘) 전용 ──
// fx = 세로 화면 crop 중심(0~1). 쌍즈가 서는 바닥이 crop 가운데 오게.
export const PLACES = {
  home_nanwu: { name: '쌍즈네 집', icon: '🏠', city: '남우', canon: 'L02/L03', img: 'bedroom_day.png', night: 'bedroom_night.png', fx: 0.46, home: true },
  school:     { name: '욱일중학', icon: '🏫', city: '남우', canon: 'L01', img: 'school_day.png', dusk: 'school_dusk.png', fx: 0.5 },
  dessert:    { name: '디저트 가게', icon: '🍰', city: '남우', canon: 'L05/L21', img: 'dessert_day.png', night: 'dessert_night.png', fx: 0.5 },
  dorm:       { name: '기숙사', icon: '🏠', city: '이허', canon: 'L09', img: 'dorm_day.png', night: 'dorm_night.png', fx: 0.34, home: true },
  apartment:  { name: '우리 집', icon: '🏠', city: '이허', canon: '—', img: 'apartment_day.png', night: 'apartment_night.png', fx: 0.36, home: true },
  yihe_street:{ name: '이허 항구 거리', icon: '⛵', city: '이허', canon: 'L12(沙坡尾)', img: 'yihe_street_day.png', night: 'yihe_street_night.png', fx: 0.56, outdoor: true },
  campus:     { name: '이허대학교', icon: '🎓', city: '이허', canon: 'L09(厦门工学院)', img: 'campus_day.png', night: 'campus_night.png', fx: 0.34, outdoor: true },
  beach:      { name: '바닷가', icon: '🌊', city: '이허', canon: 'L20(同安彩虹沙滩)', img: 'beach_day.png', dusk: 'beach_dusk.png', fx: 0.42, outdoor: true },
};
// 단계별 갈 수 있는 곳 (첫 번째 = 집)
export const STAGE_PLACES = {
  mid:  ['home_nanwu', 'school', 'dessert'],
  high: ['home_nanwu', 'school', 'dessert'],
  uni:  ['dorm', 'campus', 'yihe_street', 'beach'],
  grad: ['apartment', 'yihe_street', 'campus', 'beach'],
};
// 야외 원근: 야외(outdoor)에서는 쌍즈를 한 단계 작게. 기기 픽셀 정수 배율 유지,
// 줄어드는 비율이 OUTDOOR_MIN_RATIO보다 크게 줄면(예: DPR 2에서 50%) 적용하지 않음
export const OUTDOOR_SCALE = 0.8;
// 캐릭터 크기: 무대 기준 크기(want) 대비 비율. iPhone 12의 이전 정수 배율 결과(0.667/0.855≈0.78)에 맞춤 → 모든 기기에서 같은 비율
export const CHAR_FIT = 0.78;
export const OUTDOOR_MIN_RATIO = 0.6;
// 중학생은 고교보다 작게 그려서 더 어려 보이게(그림 시트는 그대로, 그릴 때 배율만). 야외 배율과 곱해짐
// A ≈ 고교 키의 85%(기본), B ≈ 92%. 비교용: 주소에 ?mid=A / ?mid=B / ?mid=1(원래 크기)
export const STAGE_SCALE_OPTIONS = { A: 0.85, B: 0.92 };
export const STAGE_SCALE_DEFAULT = 'A';
export function stageScale(st) {
  if (st !== 'mid') return 1;
  let q = null; try { q = new URLSearchParams(location.search).get('mid'); } catch {}
  if (q && STAGE_SCALE_OPTIONS[q]) return STAGE_SCALE_OPTIONS[q];
  if (q && +q > 0.5 && +q <= 1) return +q;
  return STAGE_SCALE_OPTIONS[STAGE_SCALE_DEFAULT];
}

// ── Stage 4: 대사 ──
export const RECENT_MAX = 12;          // 최근 N줄은 다시 안 나옴(후보가 모자라면 직전 줄만 제외)
export const NOSTALGIA_P = 0.25;       // 회상 조건이 맞을 때 발동 확률(하루 1번)
export const TYPE_MS = 32;             // 한 글자 타이핑 간격(ms)
