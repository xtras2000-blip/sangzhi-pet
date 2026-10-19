// 타이틀(메인) 화면: 사용자 제공 키 이미지(로고 '상즈키우기' 포함) 꽉 채우기 + 천천히 줌 + 빛 보케 + TAP TO START
// 첫 터치 = 소리 unlock(iOS) + 타이틀 BGM → 이어하기 / 새로 시작 / 설정
const $ = (id) => document.getElementById(id);
export const IMG = { w: 1024, h: 1536 };
// 꼭 보여야 하는 곳(원본 비율): 얼굴 x 46~79% · y 16~45%, 로고 x 5~68% · y 75~90% (tools/build_title.py 와 같음)
export const BOX = { x0: 0.05, x1: 0.79, y0: 0.16, y1: 0.90 };
/**
 * 화면 크기에 맞춘 이미지 배치(px). cover 로 시작하고, 얼굴·로고가 잘리거나 아래 버튼 자리를 덮으면 줄임(남는 곳은 흐린 배경).
 * need = 화면 아래 버튼·안내 자리(안전 영역 포함). 반환 { w, h, left, top, s }
 */
export function titleLayout(vw, vh, { safeTop = 0, need = 120 } = {}) {
  const { w: iw, h: ih } = IMG, bw = BOX.x1 - BOX.x0;
  let s = Math.max(vw / iw, vh / ih);
  s = Math.min(s, (vw * 0.98) / (bw * iw));                  // 가로: 로고 왼쪽 끝 ~ 얼굴 오른쪽 끝
  s = Math.min(s, (vh - need - safeTop * 0.3) / (BOX.y1 * ih));  // 세로: 로고 아래 = 버튼 자리 위
  const w = Math.round(iw * s), h = Math.round(ih * s);
  const cx = (BOX.x0 + BOX.x1) / 2;
  let left = Math.round(vw / 2 - cx * w);
  left = w >= vw ? Math.min(0, Math.max(vw - w, left)) : Math.round((vw - w) / 2);
  // 세로: 로고 아래가 버튼 자리(vh-need) 위에 오도록, 얼굴 위가 노치 아래에 오도록
  let top = Math.round((vh - h) / 2);
  top = Math.min(top, Math.round(vh - need - BOX.y1 * h));
  top = Math.max(top, Math.round(safeTop - BOX.y0 * h));
  if (h >= vh) top = Math.min(0, Math.max(vh - h, top));
  return { w, h, left, top, s };
}
let T = null;
const safe = (side) => { const v = getComputedStyle(document.documentElement).getPropertyValue(side === 'top' ? '--sat' : '--sab'); return parseFloat(v) || 0; };
function place() {
  const el = $('titleScreen'); if (!el || el.hidden) return;
  const vw = el.clientWidth, vh = el.clientHeight, sb = safe('bottom');
  const need = Math.max(108, Math.round(vh * 0.15)) + sb;
  const L = titleLayout(vw, vh, { safeTop: safe('top'), need });
  const k = $('titleKey'); k.style.width = `${L.w}px`; k.style.height = `${L.h}px`; k.style.left = `${L.left}px`; k.style.top = `${L.top}px`;
  el.style.setProperty('--ui-top', `${Math.min(vh - need, L.top + Math.round(BOX.y1 * L.h))}px`);
}
function bokeh() {
  const box = $('titleBokeh'); if (!box || box.childElementCount) return;
  const rnd = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 16; i++) {
    const b = document.createElement('i'), sz = rnd(6, 26);
    b.style.cssText = `left:${rnd(0, 100)}%;top:${rnd(8, 96)}%;width:${sz}px;height:${sz}px;animation-duration:${rnd(9, 17)}s;animation-delay:-${rnd(0, 15)}s;--o:${rnd(0.25, 0.7).toFixed(2)}`;
    box.appendChild(b);
  }
}
/**
 * 타이틀 보여 주고 고를 때까지 기다림. opts: { hasSave, onFirstTap(), onSettings() } → 'continue' | 'new'
 */
export function showTitle(opts = {}) {
  const el = $('titleScreen'); if (!el) return Promise.resolve('continue');
  el.hidden = false; el.classList.remove('t-open', 'out'); document.body.classList.add('in-title');
  $('tContinue').disabled = !opts.hasSave; $('tContinue').hidden = !opts.hasSave;
  $('tNew').textContent = opts.hasSave ? '새로 시작' : '시작하기'; $('tNew').classList.toggle('main', !opts.hasSave);
  bokeh(); place(); requestAnimationFrame(place);
  addEventListener('resize', place);
  const img = $('titleKey'); if (img.decode) img.decode().then(() => el.classList.add('ready')).catch(() => el.classList.add('ready')); else el.classList.add('ready');
  return new Promise((res) => {
    T = { res };
    const reveal = () => { if (el.classList.contains('t-open')) return; el.classList.add('t-open'); opts.onFirstTap && opts.onFirstTap(); };
    el.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return reveal();
      e.stopPropagation(); reveal();
      if (b.id === 'tSettings') return opts.onSettings && opts.onSettings();
      if (b.id === 'tContinue') return done('continue');
      if (b.id === 'tNew') return done('new');
    };
  });
}
function done(choice) {
  const el = $('titleScreen'); if (!T) return;
  const r = T.res; T = null; el.classList.add('out'); removeEventListener('resize', place);
  setTimeout(() => { el.hidden = true; el.classList.remove('out', 't-open'); document.body.classList.remove('in-title'); }, 650);
  r(choice);
}
export const titleOpen = () => !!T;
/** 안드로이드 뒤로 가기 등에서 */
export function titleInfo() { const el = $('titleScreen'); return { open: !!T, menu: !!(el && el.classList.contains('t-open')) }; }
