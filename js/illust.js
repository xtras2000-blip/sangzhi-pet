// Stage 8: 이벤트 일러스트·포토카드 이미지 경로 (지연 로딩: SW 프리캐시에 넣지 않고 처음 볼 때 캐시)
// 파일: assets/events/E#.webp|.jpg|_t.webp, assets/cards/P##.webp|.jpg|_t.webp (tools/build_illust.py가 만듦)
// 변환 전 원본만 있어도 assets/cards/src/card_P##.png 를 마지막 후보로 시도 → 파일을 넣기만 하면 자동으로 보임
let IDX = { events: {}, cards: {} };
export async function loadIllustIndex() {
  try { const r = await fetch('assets/illust_index.json', { cache: 'no-cache' }); if (r.ok) IDX = await r.json(); } catch { /* 오프라인: 후보 체인으로 시도 */ }
  return IDX;
}
export const hasEventArt = (id) => !!IDX.events[id];
export const hasCardArt = (id) => !!IDX.cards[id];
const base = (kind, id) => (kind === 'card' ? `assets/cards/${id}` : `assets/events/${id}`);
const raw = (kind, id) => (kind === 'card' ? `assets/cards/src/card_${id}.png` : `assets/events/src/event_${id}.png`);
/** 후보 목록(앞에서부터 시도). thumb=true면 작은 썸네일 먼저 */
export function artCandidates(kind, id, thumb = false) {
  const b = base(kind, id);
  return [...(thumb ? [`${b}_t.webp`] : []), `${b}.webp`, `${b}.jpg`, raw(kind, id)];
}
/** <img> 태그 html. 모두 실패하면 class="noart"(자리표시 그림)로 바뀜 */
export function artImg(kind, id, { thumb = false, cls = '', alt = '' } = {}) {
  const c = artCandidates(kind, id, thumb);
  return `<img class="art ${cls}" src="${c[0]}" data-alt="${c.slice(1).join('|')}" alt="${alt}" loading="lazy" decoding="async" onerror="window.__artNext(this)">`;
}
if (typeof window !== 'undefined') window.__artNext = (img) => {
  const rest = (img.dataset.alt || '').split('|').filter(Boolean);
  if (!rest.length) { img.onerror = null; img.classList.add('noart'); img.removeAttribute('src'); return; }
  img.dataset.alt = rest.slice(1).join('|'); img.src = rest[0];
};
/** 이미지 하나 미리 불러오기(이벤트 시작 전). 실패하면 null */
export function preloadArt(kind, id) {
  const c = artCandidates(kind, id);
  return new Promise((res) => {
    let i = 0; const im = new Image();
    im.onload = () => res(im.src); im.onerror = () => (++i < c.length ? (im.src = c[i]) : res(null));
    im.src = c[0];
  });
}
