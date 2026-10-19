// 엔딩: 필름 스트립(해금한 일러스트가 옆으로 흘러감) → 크레딧 → 쌍즈의 마지막 메시지
// 데이터: data/ending.json (글·제작 이름·메시지 변형). 순수 로직(위)은 Node 테스트, DOM(아래)은 브라우저 전용
import { ORDER, eventShots } from './events.js';
import { artCandidates } from './illust.js';

export const epNum = (ep = '') => { const m = String(ep).match(/\d+/); return m ? +m[0] : 99; };
/** E8(마지막 이벤트)을 처음 끝냈을 때만 자동 재생. 다시 보기는 도감 버튼으로 */
export const shouldAutoEnding = (id, wasSeen) => id === 'E8' && !wasSeen;

/**
 * 플레이어가 해금한 일러스트를 원작 회차 순서로.
 * 이벤트는 ORDER(회차순) 그대로, 포토카드는 회차가 같거나 앞선 마지막 이벤트 뒤에 끼움(같은 회차면 이벤트 먼저).
 * 클로즈업·연결 컷(E0_close 등)은 부모 이벤트 바로 뒤. 그림 인덱스에 없는 컷은 뺌.
 * @returns [{ kind:'event'|'card', id, art, title, ep, extra }]
 */
export function endingFrames(s, { events = [], cards = [], eps = {}, hasArt = () => true, labels = {}, all = false } = {}) {
  const seenE = (id) => all || !!(s.events || {})[id], seenC = (id) => all || !!(s.pcards || {})[id];
  const list = [];
  ORDER.forEach((id, k) => {
    const ev = events.find((e) => e.id === id); if (!ev || !seenE(id)) return;
    const ep = eps[id] || ''; const grp = [{ kind: 'event', id, art: id, title: ev.title, ep, extra: false }];
    for (const sh of eventShots(ev)) if (hasArt(sh.art)) { const suf = sh.art.split('_')[1] || ''; grp.push({ kind: 'event', id, art: sh.art, title: `${ev.title} · ${labels[suf] || suf}`, ep, extra: true }); }
    list.push({ key: [epNum(ep), 0, k], grp });
  });
  cards.forEach((c, k) => { if (seenC(c.id)) list.push({ key: [epNum(c.ep), 1, k], grp: [{ kind: 'card', id: c.id, art: c.id, title: c.title, ep: c.ep, extra: false }] }); });
  list.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2]);
  // 마지막 이벤트(E8 청혼)는 늘 맨 끝: 회차가 더 큰 카드가 생겨도 피날레 유지
  const fin = list.findIndex((x) => x.grp[0].kind === 'event' && x.grp[0].id === ORDER[ORDER.length - 1]);
  if (fin >= 0) list.push(...list.splice(fin, 1));
  return list.flatMap((x) => x.grp);
}

/** 완성도에 따라 메시지 변형 고르기 (data.messages 위에서부터 min 조건을 다 채운 첫 번째) */
export function pickMessage(st, data) {
  const ms = (data && data.messages) || [];
  return ms.find((m) => Object.entries(m.min || {}).every(([k, v]) => (st[k] || 0) >= v)) || ms[ms.length - 1] || { id: 'none', lines: [] };
}
/** 엔딩 통계 */
export function endingStats(s, { days = 1, outfits = { have: 0, total: 0 }, cardIds = [] } = {}) {
  return {
    days, events: ORDER.filter((id) => (s.events || {})[id]).length, eventsTotal: ORDER.length,
    cards: cardIds.filter((id) => (s.pcards || {})[id]).length, cardsTotal: cardIds.length,
    outfits: outfits.have, outfitsTotal: outfits.total,
  };
}
export const fill = (t, o) => String(t).replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? `{${k}}`));
/** 엔딩을 본 기록 */
export function markEndingSeen(s, day) { s.ending = { first: (s.ending && s.ending.first) || day, count: ((s.ending && s.ending.count) || 0) + 1 }; }

// ───────────────────────── DOM (브라우저) ─────────────────────────
let DATA = null, RUN = null;
export async function loadEnding() {
  if (DATA) return DATA;
  try { DATA = await (await fetch('data/ending.json')).json(); } catch { DATA = { messages: [], credits: [], eps: {}, statLines: [] }; }
  return DATA;
}
export const endingData = () => DATA;
export const endingState = () => (RUN ? { phase: RUN.phase, paused: RUN.paused, frames: RUN.frames.length, x: RUN.x, msg: RUN.msg && RUN.msg.id } : null);
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const kindOf = (f) => (f.kind === 'card' ? 'card' : 'event');

/** 이미지 하나 로드(+decode). 후보 체인: webp → jpg → 원본 png */
function loadImg(img, f) {
  if (img.dataset.state) return img._p;
  img.dataset.state = 'loading';
  const c = artCandidates(kindOf(f), f.art); let i = 0;
  img._p = new Promise((res) => {
    img.onload = () => { img.dataset.state = 'ok'; (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => res(true)); };
    img.onerror = () => { if (++i < c.length) img.src = c[i]; else { img.dataset.state = 'fail'; img.closest('.efr')?.classList.add('noart'); res(false); } };
    img.src = c[0];
  });
  return img._p;
}
function unloadImg(img) { if (img.dataset.state === 'ok') { img.removeAttribute('src'); delete img.dataset.state; img._p = null; } }

/**
 * 엔딩 재생. opts: { state, events, cards, days, outfits, all(디버그: 전부 해금으로 보기), audio:{ playBgmFade, stopBgmFade, sfx }, onDone }
 */
export async function playEnding(opts) {
  if (RUN) return;
  const D = await loadEnding(), S = opts.state;
  const frames = endingFrames(S, { events: opts.events, cards: opts.cards, eps: D.eps, hasArt: opts.hasArt, labels: D.shotLabel, all: opts.all });
  const stats = endingStats(S, { days: opts.days, outfits: opts.outfits, cardIds: opts.cards.map((c) => c.id) });
  const msg = pickMessage(stats, D);
  const rm = reduced();
  const root = $('ending');
  RUN = { phase: 'strip', paused: false, frames, x: 0, msg, rm, raf: 0, timers: [], done: false };
  root.className = 'ending' + (rm ? ' rm' : ''); root.hidden = false; void root.offsetWidth; root.classList.add('on');
  document.body.classList.add('in-ending');
  $('endSkip').textContent = '건너뛰기 ⏭';
  opts.audio?.playBgmFade?.('bgm_first_snow_ending', 0.5, 2500);

  // 필름 프레임 만들기 (이미지는 화면에 들어오기 직전에만 로드, 지나가면 해제 → 모바일 메모리)
  const track = $('endTrack');
  track.innerHTML = frames.map((f, i) => `<div class="efr${f.extra ? ' extra' : ''}${f.kind === 'card' ? ' card' : ''}" data-i="${i}"><div class="eimg"><img alt="" decoding="async"></div><p><b>${esc(f.title)}</b><span>${esc(f.ep)}</span></p></div>`).join('') || '<div class="efr empty"><p><b>아직 모은 장면이 없어요</b></p></div>';
  $('endStripTitle').textContent = D.stripTitle || '';
  const els = [...track.children], imgs = els.map((e) => e.querySelector('img'));
  const vw = () => $('endFilm').clientWidth;
  const fw = () => (els[0] ? els[0].offsetWidth : 200);

  const finish = () => new Promise((res) => { RUN.next = res; });
  const later = (fn, ms) => { const t = setTimeout(fn, ms); RUN.timers.push(t); return t; };

  // ── 1) 필름 스트립 ──
  await Promise.race([Promise.all(imgs.slice(0, rm ? 2 : 3).map((im, i) => loadImg(im, frames[i]))), new Promise((r) => setTimeout(r, 2500))]);
  if (frames.length) {
    root.classList.add('strip');
    const W = fw(), per = (D.secPerFrame || 2.4) * 1000, speed = W / per;   // px/ms
    if (!rm) {
      const start = -vw(), end = W * els.length;   // 오른쪽 밖에서 들어와 왼쪽 밖으로
      RUN.x = start; let last = performance.now();
      const step = (t) => {
        if (!RUN || RUN.phase !== 'strip') return;
        const dt = Math.min(64, t - last); last = t;
        if (!RUN.paused) RUN.x += speed * dt;
        track.style.transform = `translate3d(${-RUN.x.toFixed(1)}px,0,0)`;
        const v = vw(), first = Math.floor(RUN.x / W);
        for (let i = 0; i < els.length; i++) {
          if (i >= first - 1 && i <= first + Math.ceil(v / W) + 3) loadImg(imgs[i], frames[i]);   // 3장 앞까지 미리
          else if (i < first - 2) unloadImg(imgs[i]);
        }
        if (RUN.x >= end) { RUN.next && RUN.next(); return; }
        RUN.raf = requestAnimationFrame(step);
      };
      RUN.raf = requestAnimationFrame(step);
    } else {   // 움직임 줄이기: 한 장씩 크로스페이드
      let i = 0; els[0].classList.add('show');
      const pre = (j) => { if (imgs[j]) loadImg(imgs[j], frames[j]); };
      const adv = () => {
        if (!RUN || RUN.phase !== 'strip') return;
        if (RUN.paused) { later(adv, 300); return; }
        if (i + 1 >= els.length) { RUN.next && RUN.next(); return; }
        els[i].classList.remove('show'); if (i > 0) unloadImg(imgs[i - 1]);
        i++; RUN.x = i; els[i].classList.add('show'); pre(i + 1);
        later(adv, per);
      };
      pre(1); later(adv, per);
    }
    await finish();
  }
  if (!RUN) return;
  cancelAnimationFrame(RUN.raf); RUN.timers.forEach(clearTimeout); RUN.timers = [];
  imgs.forEach(unloadImg);

  // ── 1.5) 액자 이야기 엔딩(F1 → F2 → V2, 그 뒤 F3 위로 크레딧) ──
  if (opts.beforeCredits) { RUN.paused = true; await opts.beforeCredits(); if (!RUN) return; RUN.paused = false; }
  // ── 2) 크레딧 ──
  RUN.phase = 'credits'; opts.audio?.phase?.('credits'); RUN.paused = false; root.classList.remove('strip'); root.classList.add('credits');
  const statHtml = (D.statLines || []).map((l) => `<li>${esc(fill(l, stats))}</li>`).join('');
  $('endRoll').innerHTML = (D.credits || []).map((c) => c.big
    ? `<section class="cbig"><h2>${esc(c.big)}</h2>${c.small ? `<p>${esc(c.small)}</p>` : ''}</section>`
    : `<section><h3>${esc(c.head)}</h3>${c.stats ? `<ul class="cstats">${statHtml}</ul>` : (c.lines || []).map((l) => `<p>${esc(fill(l, D))}</p>`).join('')}</section>`).join('');
  const roll = $('endRoll'), box = $('endCredits');
  if (!rm) {
    const H = box.clientHeight, total = roll.scrollHeight + H; let y = H * 0.3, last = performance.now();
    const sp = 0.045;   // px/ms ≈ 45px/s
    const step = (t) => {
      if (!RUN || RUN.phase !== 'credits') return;
      const dt = Math.min(64, t - last); last = t;
      if (!RUN.paused) y += sp * dt;
      RUN.x = y; roll.style.transform = `translate3d(0,${(H - y).toFixed(1)}px,0)`;
      if (y >= total - H * 0.35) { RUN.next && RUN.next(); return; }   // 마지막 'Thank you'가 위쪽에 머물 때 다음으로
      RUN.raf = requestAnimationFrame(step);
    };
    roll.style.transform = `translate3d(0,${H}px,0)`;
    RUN.raf = requestAnimationFrame(step);
  } else { roll.style.transform = 'none'; box.classList.add('static'); later(() => RUN && RUN.next && RUN.next(), 14000); }
  await finish();
  if (!RUN) return;
  cancelAnimationFrame(RUN.raf); RUN.timers.forEach(clearTimeout); RUN.timers = [];

  // ── 3) 쌍즈의 마지막 메시지 ──
  RUN.phase = 'message'; root.classList.remove('credits'); root.classList.add('message');
  $('endSkip').textContent = '닫기 ✕';
  const bgF = [...frames].reverse().find((f) => f.art === 'E8_close') || [...frames].reverse().find((f) => f.kind === 'event');
  const bg = $('endMsgBg'); bg.removeAttribute('src'); if (bgF) { delete bg.dataset.state; loadImg(bg, bgF); }
  const ul = $('endMsgLines');
  ul.innerHTML = msg.lines.map((l) => `<p>${esc(l)}</p>`).join('') + `<p class="sign">${esc(D.sign || '')}</p>`;
  const ps = [...ul.children]; let k = 0;
  RUN.revealAll = () => { ps.forEach((p) => p.classList.add('on')); k = ps.length; $('endBack').hidden = false; };
  const nextLine = () => {
    if (!RUN || RUN.phase !== 'message') return;
    if (RUN.paused) { later(nextLine, 300); return; }
    if (k < ps.length) { ps[k++].classList.add('on'); later(nextLine, rm ? 1400 : 2200); }
    else $('endBack').hidden = false;
  };
  later(nextLine, 900);
  await finish();
  close(opts);
}
function close(opts) {
  if (!RUN) return;
  cancelAnimationFrame(RUN.raf); RUN.timers.forEach(clearTimeout);
  RUN = null;
  const root = $('ending'); root.classList.remove('on');
  opts.audio?.stopBgmFade?.(1500);
  setTimeout(() => { root.hidden = true; root.className = 'ending'; $('endTrack').innerHTML = ''; $('endRoll').innerHTML = ''; $('endMsgLines').innerHTML = ''; $('endMsgBg').removeAttribute('src'); $('endBack').hidden = true; $('endCredits').classList.remove('static'); }, 700);
  document.body.classList.remove('in-ending');
  opts.onDone && opts.onDone();
}
/** 건너뛰기: 스트립/크레딧 → 메시지로, 메시지 → 닫기. one=true면 다음 단계 하나만(디버그·미리보기 녹화) */
export function skipEnding(one = false) {
  if (!RUN) return;
  if (one) { RUN.next && RUN.next(); return; }
  if (RUN.phase === 'message') { RUN.next && RUN.next(); return; }
  RUN.skipTo = true; const go = () => { if (!RUN) return; if (RUN.phase === 'message') return; RUN.next && RUN.next(); setTimeout(go, 30); }; go();
}
/** 화면 탭: 스트립·크레딧은 일시정지 토글, 메시지는 남은 줄 한 번에 */
export function tapEnding() {
  if (!RUN) return;
  if (RUN.phase === 'message') { if ($('endBack').hidden) RUN.revealAll && RUN.revealAll(); return; }
  RUN.paused = !RUN.paused; $('ending').classList.toggle('paused', RUN.paused);
}
export function bindEnding() {
  $('endSkip').addEventListener('click', (e) => { e.stopPropagation(); skipEnding(); });
  $('endBack').addEventListener('click', (e) => { e.stopPropagation(); RUN && RUN.next && RUN.next(); });
  $('ending').addEventListener('click', () => tapEnding());
}
export const endingOpen = () => !!RUN;
