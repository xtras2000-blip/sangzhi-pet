// 확인 창: window.confirm()은 안드로이드 WebView(WebChromeClient 없음)에서 항상 false라
// '새로 시작'·'회차 넘기기'가 조용히 취소되고 옛 저장으로 이어지던 버그 → 게임 안 확인 창으로 대체
let cur = null;
export function uiConfirm(msg, { ok = '네', cancel = '아니요', danger = true } = {}) {
  if (typeof document === 'undefined') return Promise.resolve(false);
  if (cur) cur(false);
  return new Promise((res) => {
    const el = document.createElement('div');
    el.id = 'uiConfirm'; el.className = 'ui-confirm';
    el.innerHTML = `<div class="uc-box" role="alertdialog" aria-modal="true"><p></p><div class="uc-row"><button class="uc-no"></button><button class="uc-ok${danger ? ' danger' : ''}"></button></div></div>`;
    el.querySelector('p').textContent = msg;
    el.querySelector('.uc-no').textContent = cancel; el.querySelector('.uc-ok').textContent = ok;
    const end = (v) => { if (cur !== end) return; cur = null; el.remove(); res(v); };
    cur = end;
    el.querySelector('.uc-ok').onclick = (e) => { e.stopPropagation(); end(true); };
    el.querySelector('.uc-no').onclick = (e) => { e.stopPropagation(); end(false); };
    el.onclick = (e) => { e.stopPropagation(); if (e.target === el) end(false); };
    document.body.appendChild(el);
  });
}
export const confirmOpen = () => !!cur;
export function closeConfirm() { if (cur) { cur(false); return true; } return false; }
