// v0.9.4 연타 보호: 빠르게 화면을 두드리는 중에 카드·모달·이벤트·메신저가 뜨면 그 탭들에 바로 닫히던 문제
// 새로 보인 오버레이는 GUARD_MS 동안 입력 무시(살짝 페이드 인) + 열리기 전에 시작한 터치(pointerdown)는 무시 + 배경으로 탭이 새지 않게
export const GUARD_MS = 700;
export const SELECTOR = '#cardModal, #evFull, #eventVeil, #msgr, #msgPop, #quiz, #crushCut, #nameSheet, #ending, #tantrum, .sheet, .guarded';
const shownAt = new WeakMap();
let lastDown = 0;
/** 순수: 이 입력을 막아야 하나? (now, 오버레이가 보인 시각, 이 터치의 pointerdown 시각) */
export function shouldBlock(now, shown, downAt, ms = GUARD_MS) {
  if (!shown) return false;
  if (now - shown < ms) return true;
  if (downAt && downAt < shown) return true;   // 열리기 전에 시작한 터치
  return false;
}
export function markShown(el, now = performance.now()) {
  shownAt.set(el, now); el.classList.remove('guard-in'); void el.offsetWidth; el.classList.add('guard-in');
}
export const isGuarded = (el, now = performance.now()) => { const s = shownAt.get(el); return !!s && now - s < GUARD_MS; };
export function initGuard(root = document) {
  const seen = new WeakSet();
  const scan = () => root.querySelectorAll(SELECTOR).forEach((el) => {
    const v = !el.hidden && !el.classList.contains('gone');
    if (v && !seen.has(el)) { seen.add(el); markShown(el); }
    if (!v) seen.delete(el);
  });
  new MutationObserver((recs) => {
    for (const r of recs) { const el = r.target; if (r.type === 'attributes' && r.attributeName === 'hidden' && el.matches && el.matches(SELECTOR) && !el.hidden) { seen.add(el); markShown(el); } }
    scan();
  }).observe(root.body, { subtree: true, attributes: true, attributeFilter: ['hidden', 'class'], childList: true });
  scan();
  const owner = (t) => t && t.closest && t.closest(SELECTOR);
  root.addEventListener('pointerdown', (e) => { lastDown = performance.now(); e.target.__downAt = lastDown; }, true);
  const block = (e) => {
    const o = owner(e.target); if (!o) return;
    if (shouldBlock(performance.now(), shownAt.get(o), lastDown, o.matches('.sheet') ? 350 : GUARD_MS)) { e.stopImmediatePropagation(); e.preventDefault(); }
  };
  for (const t of ['click', 'pointerup', 'touchend']) root.addEventListener(t, block, true);
  // 오버레이 위의 pointerdown 은 배경으로 전달하지 않음
  root.addEventListener('pointerdown', (e) => { if (owner(e.target)) e.stopPropagation(); }, false);
}
if (typeof window !== 'undefined') window.__guard = { shouldBlock, GUARD_MS };
