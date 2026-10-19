// 액자 이야기: 어른 쌍즈가 접은 마지막 종이별 → 과거로 → 소꿉친구(플레이어). 별은 운명을 바꿀 수 없음(원작 그대로)
// 그림 슬롯 story_O1~O4 · F1~F2(+크레디트 배경 F3), 영상 슬롯 story_V1.mp4 / story_V2.mp4. 없으면 별밤 자리표시
import { sfx } from './audio.js';
import * as VO from './voice.js';   // 어른 쌍즈 음성 VL40~43(녹음 오면 assets/voice 에 추가 → 없으면 조용히 건너뜀)
let D = null;
export async function loadStory() { try { D = await (await fetch('data/story.json')).json(); } catch { D = { open: [], end: [] }; } return D; }
export const storyData = () => D;
let IDX = null;   // assets/story/index.json (tools/build_story_index.py) — 없는 파일은 아예 요청 안 함
async function exists(url) {
  if (!IDX) { try { IDX = new Set(await (await fetch('assets/story/index.json', { cache: 'no-cache' })).json()); } catch { IDX = new Set(); } }
  return IDX.has(url.split('/').pop());
}
/** 순수 함수: 슬라이드 목록 → 화면용 [{ src|null, text }] (have: 있는 그림 이름 집합) */
const src = (have, a) => (a && have.has(a) ? `assets/story/${a}.webp` : null);
/** 전/후 쌍(pair)은 두 장으로 펼침: 두 번째 장은 금빛 별가루 크로스페이드 + 차임(sparkle) */
export function slides(list, have) {
  const out = [];
  for (const s of list || []) {
    if (s.video) { if (have.has(s.video)) out.push({ video: `assets/story/${s.video}.mp4`, art: s.video, text: s.text || '', hold: !!s.hold, fallback: src(have, s.art) }); else if (s.hold && s.text) out.push({ text: s.text, src: src(have, s.art), art: s.art }); continue; }   // 영상 없으면: hold 장면은 정지 그림+대사, 아니면 건너뜀
    out.push({ text: s.text, src: src(have, s.art), art: s.art });
    if (s.pair) out.push({ text: s.after || '', src: src(have, s.pair), art: s.pair, sparkle: true });
  }
  return out;
}
export async function playStory(kind) {
  if (!D) await loadStory();
  const list = (D && D[kind]) || []; if (!list.length) return;
  const have = new Set(); await Promise.all(list.flatMap((s) => [s.art, s.pair]).filter(Boolean).map(async (a) => { if (await exists(`assets/story/${a}.webp`)) have.add(a); }));
  await Promise.all(list.filter((s) => s.video).map(async (s) => { if (await exists(`assets/story/${s.video}.mp4`)) have.add(s.video); }));
  const el = document.createElement('div'); el.className = 'story'; el.id = 'story';
  el.innerHTML = `<div class="st-stage"><div class="st-sky"><i>⭐</i><b class="st-ph"></b></div><img alt=""><div class="st-spark"></div><video playsinline muted preload="auto" hidden></video></div><p class="st-text"></p><button class="st-skip">건너뛰기 ⏭</button><small class="st-tap">탭해서 계속</small>`;
  document.body.appendChild(el);
  const img = el.querySelector('img'), txt = el.querySelector('.st-text'), v = el.querySelector('video');
  let done; const fin = new Promise((r) => (done = r));
  el.querySelector('.st-skip').onclick = (e) => { e.stopPropagation(); done(); };
  const sl = slides(list, have); let i = -1;
  let shownAt = 0, playing = null;
  const GUARD = 600;   // 연타로 바로 넘어가지 않게
  const show = () => {
    if (performance.now() - shownAt < GUARD) return;
    if (playing) { const p = playing; playing = null; p(); return; }   // 영상 중 탭 = 건너뛰기
    VO.stopVoice();
    i++; if (i >= sl.length) return done();
    shownAt = performance.now();
    const s = sl[i];
    if (s.video) {   // 소리 없이(타이틀 곡 유지) 한 번 재생 → 다음 장면으로 크로스페이드. 못 틀면 앞 장면 그림 그대로
      txt.classList.remove('on');
      v.src = s.video; v.muted = true; v.setAttribute('muted', ''); v.playsInline = true; v.hidden = false; v.classList.remove('fade');
      const end = () => {
        if (playing === end) playing = null;
        if (s.hold) {   // 마지막 프레임에 멈춰 두고 마지막 대사 → 탭하면 끝
          v.pause();   // 끝난 영상은 마지막 프레임에 그대로 멈춰 있음
          txt.classList.remove('on'); void txt.offsetWidth; txt.textContent = s.text; txt.classList.add('on'); shownAt = performance.now(); VO.playIllust('story_V2'); return;
        }
        v.classList.add('fade'); setTimeout(() => { v.hidden = true; v.pause(); v.classList.remove('fade'); }, 600); shownAt = 0; show(); };
      playing = end; v.onended = () => playing === end && end(); v.onerror = () => playing === end && end();
      v.play().catch(() => playing === end && end());
      return;
    }
    const put = () => { el.classList.toggle('ph', !s.src); el.querySelector('.st-ph').textContent = s.src ? '' : s.art.replace('story_', ''); if (s.src) img.src = s.src; else img.removeAttribute('src'); };
    if (!s.video) setTimeout(() => VO.playIllust(s.art), s.sparkle ? 500 : 250);
    if (s.sparkle) {   // 금빛 별가루가 번지며 '친구가 나타난' 장면으로
      const sp = el.querySelector('.st-spark'); sp.classList.remove('go'); void sp.offsetWidth; sp.classList.add('go');
      try { sfx('sfx_sparkle', 0.6); } catch {}
      setTimeout(put, 450);
    } else put();
    txt.classList.remove('on'); void txt.offsetWidth; txt.textContent = s.text; txt.classList.add('on');
  };
  el.onclick = () => show(); show();
  await fin;
  VO.stopVoice();
  el.classList.add('out'); setTimeout(() => el.remove(), 500);
}
