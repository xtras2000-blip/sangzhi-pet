// 모바일 웹 최적화: 화면 높이·제스처·뒤로가기·백그라운드 저장·세로 안내·PWA(서비스워커)·디버그/피드백
import { unlockAudio, suspendAudio, audioInfo } from './audio.js';
import { storageStatus } from './state.js';
import { GAME_VERSION } from './config.js';
import { loadedSheets } from './sprite.js';

const $ = (id) => document.getElementById(id);
import { SW_VERSION } from './sw_version.js';   // tools/build_sw.py 가 sw.js 와 함께 생성
export { SW_VERSION };
export const isStandalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
const FPS = { n: 0, t: performance.now(), v: 0 };

export function initMobile({ save, toast, closeTop }) {
  const root = document.documentElement;
  // 1) 100dvh 미지원 브라우저: 실제 innerHeight 로 --app-h
  const setH = () => root.style.setProperty('--app-h', `${window.innerHeight}px`);
  if (!CSS.supports('height', '100dvh')) { root.classList.add('no-dvh'); setH(); addEventListener('resize', setH); addEventListener('orientationchange', () => setTimeout(setH, 250)); }
  if (isStandalone()) root.classList.add('standalone');

  // 2) 실수 확대·길게 누르기 메뉴·스크롤 튕김 막기 (스크롤 영역은 허용)
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('contextmenu', (e) => { if (!e.target.closest('input, textarea, .selectable')) e.preventDefault(); });
  const SCROLLABLE = '.dex-body, .sheet-card, .menu, .debug pre, .card-box, .scroll';
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) return e.preventDefault();              // 핀치 확대
    const s = e.target.closest(SCROLLABLE);
    if (!s || s.scrollHeight <= s.clientHeight + 1) { if (!e.target.closest('.mg, input[type=range]')) e.preventDefault(); }
  }, { passive: false });
  document.addEventListener('touchstart', () => {}, { passive: true });   // iOS :active 상태 켜기

  // 3) 첫 터치에서 소리 unlock (iOS Safari)
  const first = () => { unlockAudio(); removeEventListener('pointerdown', first, true); removeEventListener('touchend', first, true); };
  addEventListener('pointerdown', first, true); addEventListener('touchend', first, true);

  // 4) 백그라운드로 갈 때 저장 + 소리 멈춤
  const bye = () => { try { save(); } catch {} };
  document.addEventListener('visibilitychange', () => { suspendAudio(document.hidden); if (document.hidden) bye(); });
  addEventListener('pagehide', bye); addEventListener('freeze', bye);

  // 5) 안드로이드 뒤로가기: 열린 창 먼저 닫기, 아무것도 없으면 두 번 눌러 나가기
  try {
    history.replaceState({ sz: 'root' }, ''); history.pushState({ sz: 'guard' }, '');
    let lastBack = 0;
    addEventListener('popstate', () => {
      if (closeTop()) { history.pushState({ sz: 'guard' }, ''); return; }
      if (Date.now() - lastBack < 2000) { bye(); history.back(); return; }
      lastBack = Date.now(); toast('뒤로 한 번 더 누르면 나가요'); history.pushState({ sz: 'guard' }, '');
    });
  } catch {}

  // 6) 세로 화면 안내 (휴대폰 가로일 때만, 가로 레이아웃은 CSS 로 유지)
  const hint = $('rotateHint');
  const checkRot = () => {
    const phoneLand = matchMedia('(orientation: landscape) and (max-height: 560px) and (pointer: coarse)').matches;
    if (hint) hint.hidden = !phoneLand || hint.dataset.dismissed === '1';
  };
  hint && hint.addEventListener('click', () => { hint.dataset.dismissed = '1'; hint.hidden = true; });
  addEventListener('resize', checkRot); checkRot();
  if (isStandalone() && screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(() => {});

  // 7) 저장 불가 안내 (한 번)
  setTimeout(() => {
    const st = storageStatus();
    if (st === 'memory') toast('⚠️ 이 브라우저에선 저장이 안 돼요 (사생활 보호 모드?)');
    else if (st === 'quota') toast('⚠️ 저장 공간이 꽉 찼어요');
  }, 1500);

  // 8) 서비스워커 (오프라인·홈 화면 앱). ?nosw=1 이면 해제
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    if (new URLSearchParams(location.search).has('nosw')) navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
    else {
      const had = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('sw register failed', e));
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('✨ 새 버전 받음 · 다시 열면 적용돼요'); });
    }
  }

  // 9) FPS 측정(디버그 표시용, 가벼움)
  const fr = (t) => { FPS.n++; if (t - FPS.t >= 1000) { FPS.v = Math.round(FPS.n * 1000 / (t - FPS.t)); FPS.n = 0; FPS.t = t; } requestAnimationFrame(fr); };
  requestAnimationFrame(fr);

  // 10) 디버그·피드백: ?debug=1 이면 🐞 버튼
  if (new URLSearchParams(location.search).has('debug')) document.body.classList.add('dbg-on');
  $('dbgFab')?.addEventListener('click', () => { $('debug').hidden = !$('debug').hidden; renderInfo(); });
  $('btnFeedback')?.addEventListener('click', copyFeedback);
  setInterval(() => { if (!$('debug').hidden) renderInfo(); }, 1000);
}

export function deviceInfo() {
  const a = audioInfo();
  return {
    ver: GAME_VERSION, sw: SW_VERSION + (navigator.serviceWorker && navigator.serviceWorker.controller ? ' (활성)' : ' (없음)'),
    view: `${innerWidth}×${innerHeight} @${devicePixelRatio}x`, screen: `${screen.width}×${screen.height}`,
    standalone: isStandalone(), orient: (screen.orientation && screen.orientation.type) || (innerWidth > innerHeight ? 'landscape' : 'portrait'),
    storage: storageStatus(), audio: `${a.ext} · ${a.state}${a.unlocked ? ' · unlocked' : ''}`, fps: FPS.v,
    sheets: loadedSheets().join(','), mem: performance.memory ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)}MB` : '-',
    ua: navigator.userAgent,
  };
}
function renderInfo() {
  const el = $('debugInfo'); if (!el) return; const d = deviceInfo();
  el.textContent = `v${d.ver} · SW ${d.sw}\n화면 ${d.view} · ${d.orient}${d.standalone ? ' · 홈화면앱' : ''}\n저장 ${d.storage} · 소리 ${d.audio}\nFPS ${d.fps} · 시트 ${d.sheets} · 메모리 ${d.mem}`;
}
async function copyFeedback() {
  const d = deviceInfo();
  const text = `[쌍즈 키우기 피드백]\n무엇을 하다가:\n어떻게 됐나요:\n기대한 것:\n---\n${Object.entries(d).map(([k, v]) => `${k}: ${v}`).join('\n')}`;
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {}
  if (!ok) { const t = document.createElement('textarea'); t.value = text; t.className = 'selectable'; document.body.appendChild(t); t.select(); try { ok = document.execCommand('copy'); } catch {} t.remove(); }
  const out = $('debugOut'); if (out) out.textContent = ok ? '📋 복사했어요! 카톡/메일에 붙여넣어 보내 주세요.\n\n' + text : text;
}
