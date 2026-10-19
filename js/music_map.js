// OST 슬롯 → 곡 고르기 (순수 로직, DOM 없음). 배치표: data/music.json, 설명: ../OST_PLAN.md
// 슬롯 이름: title · place:<장소>:<day|night> · quiz · minigame · event:<E#> · ending:strip · ending:credits
export const NIGHT_TODS = ['저녁', '밤', '새벽'];   // events.js 와 같은 기준(저녁부터 밤 곡)
export const daypart = (tod) => (NIGHT_TODS.includes(tod) ? 'night' : 'day');
export const placeSlot = (place, tod) => `place:${place || 'home_nanwu'}:${daypart(tod)}`;
/** 슬롯이 없을 때 찾아볼 순서: place:X:night → place:X:day → (없음) */
export function slotChain(slot) {
  const m = /^place:([^:]+):(day|night)$/.exec(slot || '');
  if (m) return m[2] === 'night' ? [slot, `place:${m[1]}:day`] : [slot, `place:${m[1]}:night`];
  return [slot];
}
/** 곡 id → 실제 파일 기본 이름(확장자 없음)과 폴더 */
export function trackPath(map, id) {
  const t = map && map.tracks && map.tracks[id]; if (!t) return null;
  return { id, base: t.file, dir: t.dir || map.dir || 'assets/music/ost/', kind: t.kind || 'vocal', short: !!t.short, title: t.title || t.file };
}
/**
 * 슬롯에 틀 곡 고르기. has(id) → 그 곡 파일이 있는지(true/false).
 * 반환: { id, ...trackPath } | 'duck' | null(무음)
 */
export function pickTrack(map, slot, has) {
  if (!map || !map.slots) return null;
  for (const s of slotChain(slot)) {
    const list = map.slots[s];
    if (list === 'duck') return 'duck';
    if (!Array.isArray(list)) continue;
    for (const id of list) if (map.tracks[id] && has(id)) return trackPath(map, id);
  }
  return null;
}
/** 지금 화면 상태로 원하는 슬롯 하나 고르기. ui: { title, ending:'strip'|'credits'|..., event, mg, quiz, place, tod } */
export function wantedSlot(ui) {
  if (ui.title) return 'title';
  if (ui.ending) return ui.ending === 'strip' ? 'ending:strip' : 'ending:credits';
  if (ui.event) return `event:${ui.event}`;
  if (ui.mg) return 'minigame';
  return placeSlot(ui.place, ui.tod);
}
/** 확장자 우선순위: iOS·Safari = m4a 먼저, 그 외 = ogg 먼저. mp3는 어디서나 재생됨 */
export const extOrder = (appleish) => (appleish ? ['m4a', 'mp3', 'ogg'] : ['ogg', 'm4a', 'mp3']);
/** 볼륨: 마스터 음소거·BGM 슬라이더·곡 종류별 보정·덕킹 */
export function bgmGain({ mute, bgm = 0.7, duck = 1 }, kind, gains = {}) {
  if (mute) return 0;
  const k = gains[kind] ?? 1;
  return Math.max(0, Math.min(1, bgm * k * duck));
}
/** 설정 기본값 보정(예전 저장: { sound }만 있음) */
export function normVolumes(settings = {}) {
  const n = (v, d) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
  return { sound: settings.sound !== false, bgm: n(settings.bgm, 0.7), sfx: n(settings.sfx, 0.8) };
}
/** build_music.py 가 만든 index.json 항목에서 루프 구간(초). 없으면 곡 전체 */
export function loopRange(entry, dur) {
  const d = (entry && entry.dur) || dur || 0;
  let a = entry && typeof entry.loopStart === 'number' ? entry.loopStart : 0;
  let b = entry && typeof entry.loopEnd === 'number' ? entry.loopEnd : d;
  if (!(b > a + 2)) { a = 0; b = d; }
  return { start: a, end: b };
}
