import * as VO from './voice.js';
// Stage 7: 도감 화면(카드·옷장·수집·이벤트·대사·성장) + 보상 카드 연출 + 방 꾸미기 소스. DOM 담당
import { STAGES, FOODS, GIFTS, PLACES, stageScale } from './config.js';
import { dayNumber, stageOf } from './state.js';
import * as CL from './collection.js';
import { allLines, getEvents, quoteCaption } from './dialogue.js';
import { artImg } from './illust.js';
import { ORDER as EV_ORDER } from './events.js';
import { drawRoomImg, drawSheetFrame, animInfo, hasSheet, cellOf, hasRoomImg, ensureSheet, thumbOf, onSheet } from './sprite.js';
import { catchIconSrc, iconHtml } from './catch_ui.js';
import * as QZ from './quiz.js';

const $ = (id) => document.getElementById(id);
let WARDROBE = [], TASTE_META = { cell: 64, icons: {} }, TASTE_IMG = null, CATALOG = null;
let S = null, TAB = 'cards';
const THUMB = new Map();   // 카드/의상 그림 캐시(dataURL)

export async function loadDex(tasteMeta) {
  TASTE_META = tasteMeta || TASTE_META;
  try { WARDROBE = await (await fetch('data/wardrobe.json')).json(); } catch { WARDROBE = []; }
  await new Promise((ok) => { const im = new Image(); im.onload = () => { TASTE_IMG = im; ok(); }; im.onerror = ok; im.src = 'assets/icons/taste.png'; });
}
export const catalog = () => (CATALOG ||= CL.cardCatalog({ lines: allLines(), events: getEvents() }));
export const wardrobe = () => WARDROBE;
const data = () => ({ lines: allLines(), events: getEvents(), wardrobe: WARDROBE, taste: QZ.quizData().taste || [] });

function tasteSrc(id) { const p = TASTE_META.icons[id]; const c = TASTE_META.cell; return p && TASTE_IMG ? { img: TASTE_IMG, sx: p[0] * c, sy: p[1] * c, sw: c, sh: c } : null; }
/** 방 꾸미기: decorFor 결과에 그림 소스 붙이기 */
export function decorSources(s, place) {
  return CL.decorFor(s, place).map((d) => ({ ...d, ...(d.src === 'catch' ? catchIconSrc(d.item) : tasteSrc(d.item)) })).filter((d) => d.img);
}
const tasteIconHtml = (id, px = 40) => {
  const p = TASTE_META.icons[id]; if (!p) return '';
  const sc = px / TASTE_META.cell, w = TASTE_IMG ? TASTE_IMG.width : 512;
  return `<span class="ticon" style="width:${px}px;height:${px}px;background-size:${w * sc}px auto;background-position:-${p[0] * px}px -${p[1] * px}px"></span>`;
};

// ── 카드 그림: 배경(장소) + v5 스프라이트 프레임(상반신) / 스티커 = 아이콘 3배 ──
const CW = 270, CH = 360;
function frameIdx(st, anim) { const a = animInfo(st, anim); return a ? (a.loop ? 0 : a.frames - 1) : 0; }
function paintCard(c) {
  if (THUMB.has(c.id)) return THUMB.get(c.id);
  const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
  const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
  if (c.kind === 'sticker') {
    x.fillStyle = '#FFF4F7'; x.fillRect(0, 0, CW, CH);
    x.fillStyle = '#FFE1EA'; for (let yy = 0; yy < CH; yy += 18) for (let xx = (yy / 18) % 2 ? 9 : 0; xx < CW; xx += 18) x.fillRect(xx, yy, 4, 4);
    const src = catchIconSrc(c.icon);
    if (src) { x.fillStyle = '#fff'; x.beginPath(); x.arc(CW / 2, CH / 2 - 10, 104, 0, Math.PI * 2); x.fill(); x.drawImage(src.img, src.sx, src.sy, src.sw, src.sh, CW / 2 - 96, CH / 2 - 106, 192, 192); }
  } else {
    const place = c.place && hasRoomImg(c.place) ? c.place : null;
    if (place) { const r = document.createElement('canvas'); if (!drawRoomImg(r, { tod: c.tod || (c.kind === 'legend' || c.ev === 'E8' ? '저녁' : '오후'), place, aspect: CW / CH })) return cv.toDataURL(); x.drawImage(r, 0, 0, r.width, r.height, 0, 0, CW, CH); }   // 배경 불러오는 중이면 캐시 안 함
    else { x.fillStyle = '#FFE4EC'; x.fillRect(0, 0, CW, CH); }
    if (!hasSheet(c.stage)) { ensureSheet(c.stage); return cv.toDataURL(); }   // 불러오면 다시 그림(onSheet), 캐시 안 함
    {
      const C = cellOf(c.stage), o = document.createElement('canvas'); o.width = o.height = C;
      const off = drawSheetFrame(o, c.stage, c.anim, frameIdx(c.stage, c.anim));
      const k = stageScale(c.stage), D = Math.round(C * k);   // 중학생: 더 작게(그 외 1:1 픽셀 그대로)
      if (k === 1) x.drawImage(o, Math.round((CW - C) / 2), Math.round(CH - C + 70 + off));   // 1:1 상반신(픽셀 그대로)
      else { x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(o, 0, 0, C, C, Math.round((CW - D) / 2), Math.round(CH - D + 70 * k + off * k), D, D); x.imageSmoothingEnabled = false; }
    }
    if (c.kind === 'legend' || c.kind === 'line') {   // 반짝이(픽셀 별)
      x.fillStyle = '#FFF6C8';
      [[30, 40], [228, 62], [52, 150], [236, 180], [130, 26], [20, 250]].forEach(([a, b], i) => { const s = i % 2 ? 2 : 3; x.fillRect(a - s, b, s * 3, s); x.fillRect(a, b - s, s, s * 3); });
    }
  }
  const url = cv.toDataURL(); THUMB.set(c.id, url); return url;
}
/** 실루엣 색: 견본 중 너무 밝지 않은 첫 색(흰 셔츠 등은 건너뜀), 없으면 연보라 */
function tone(cols = []) {
  for (const h of cols) { const n = parseInt(h.slice(1), 16), l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; if (l < 0.82) return l < 0.25 ? '#5A5F7A' : h; }
  return '#B9A6D9';
}
/** 의상 카드: 보유 = 그 단계 idle 프레임 전신 / 그 외 = 실루엣 + 색 견본(새 그림 없이) */
function paintOutfit(w, state) {
  const key = `o_${w.id}_${state}`; if (THUMB.has(key)) return THUMB.get(key);
  const st = CL.OUTFIT_SHEETS[w.id] ? w.id : (CL.SPRITE_OUTFIT[w.id] || w.stage || 'mid');
  const cv = document.createElement('canvas'); cv.width = 176; cv.height = 176;
  const x = cv.getContext('2d'); x.imageSmoothingEnabled = state === 'owned' ? true : false; x.imageSmoothingQuality = 'high';
  const th = thumbOf(st);   // 시트 전체 대신 idle 한 장(모바일 메모리)
  if (!th) return cv.toDataURL();
  {
    const C = th.naturalWidth, o = document.createElement('canvas'); o.width = o.height = C;
    o.getContext('2d').drawImage(th, 0, 0);
    if (state !== 'owned') { const oc = o.getContext('2d'); oc.globalCompositeOperation = 'source-in'; oc.fillStyle = state === 'unlocked' ? tone(w.colors) : '#C9BFD0'; oc.fillRect(0, 0, C, C); }
    x.imageSmoothingEnabled = true; x.drawImage(o, 0, 0, C, C, 0, 0, 176, 176);
  }
  const url = cv.toDataURL(); THUMB.set(key, url); return url;
}

// ── 화면 ──
const TABS = [['cards', '📸', '카드'], ['outfits', '👗', '옷장'], ['items', '🎁', '수집'], ['events', '📔', '이벤트'], ['lines', '💬', '대사'], ['growth', '📈', '성장']];
export const setDexState = (state) => { S = state; };
export function openDex(state, tab) {
  S = state; if (tab) TAB = tab;
  $('dex').hidden = false; document.body.classList.add('in-dex'); renderDex();
}
export function closeDex() { $('dex').hidden = true; document.body.classList.remove('in-dex'); }
const ctx = () => ({ day: dayNumber(S) });
export function dexProgress(state = S) { return CL.progress(state, data(), { day: dayNumber(state) }); }

function renderDex() {
  const p = dexProgress();
  $('dexTotal').textContent = `${p.total}%`;
  const pk = { cards: p.cards, outfits: p.outfits, items: p.items, events: p.events, lines: p.lines };
  $('dexTabs').innerHTML = TABS.map(([id, ic, nm]) => `<button class="dtab${id === TAB ? ' on' : ''}" data-tab="${id}"><i>${ic}</i><b>${nm}</b>${pk[id] ? `<small>${pk[id].pct}%</small>` : `<small>D+${dayNumber(S)}</small>`}</button>`).join('');
  const body = $('dexBody'); body.scrollTop = 0;
  body.innerHTML = ({ cards: tabCards, outfits: tabOutfits, items: tabItems, events: tabEvents, lines: tabLines, growth: tabGrowth })[TAB](p);
}
const bar = (pc) => `<span class="pbar"><span style="width:${Math.max(0, Math.min(100, pc))}%"></span></span>`;
const head = (t, have, total, pc, note = '') => `<div class="dhead"><b>${t}</b><span>${have}/${total} · ${pc}%</span>${bar(pc)}${note ? `<p class="dnote">${note}</p>` : ''}</div>`;
/** 엔딩을 한 번 본 뒤: 🎞️ 엔딩 다시 보기 */
const endBtn = () => (S.ending ? `<button class="dex-ending" data-ending="1">🎞️ 엔딩 다시 보기 <small>(필름 · 크레딧 · 메시지)</small></button>` : '');
const R_CLASS = { 일반: 'r1', 희귀: 'r2', 전설: 'r3' };

const ILL = (c) => c.kind === 'event' || c.kind === 'pcard';
const illImg = (c, thumb) => artImg(c.kind === 'pcard' ? 'card' : 'event', c.kind === 'pcard' ? c.pc : c.ev, { thumb });
function cardHtml(c, own) {
  const n = CL.cardCount(S, c.id);
  if (ILL(c)) {
    if (!own) return `<button class="pcard ill locked ${R_CLASS[c.rarity]}" data-card="${c.id}"><span class="pback">?</span><em>${c.how}</em></button>`;
    return `<button class="pcard ill ${R_CLASS[c.rarity]}" data-card="${c.id}">${illImg(c, true)}<em>${c.title}</em></button>`;
  }
  if (!own) return `<button class="pcard locked ${R_CLASS[c.rarity]}" data-card="${c.id}"><span class="pback">?</span><em>${c.how}</em></button>`;
  return `<button class="pcard ${R_CLASS[c.rarity]}" data-card="${c.id}"><img src="${paintCard(c)}" alt=""><em>${c.title}</em>${n > 1 ? `<u>×${n}</u>` : ''}</button>`;
}
function tabCards(p) {
  const cat = catalog(), top = CL.reached(S);
  const groups = [['명장면 포토카드', 'pcard'], ['성장 시험', 'exam'], ['이벤트', 'event'], ['전설 대사', 'line'], ['반짝 포토카드 (전설 3%)', 'legend'], ['표정 포토카드 (희귀 12%)', 'photo'], ['디저트 스티커 (일반 85%)', 'sticker']];
  return head('포토카드', p.cards.have, p.cards.total, p.cards.pct, `하루 루틴(밥·대화·공부나 놀기)을 다 하면 카드 1장 + 💗1 · 🧩 조각 ${S.collection.pieces || 0}/${CL.PIECES_PER_CARD} → 전설 카드`) +
    groups.map(([t, k]) => {
      const list = cat.filter((c) => c.kind === k);
      const have = list.filter((c) => CL.hasCard(S, c)).length;
      return `<h4>${t} <small>${have}/${list.length}</small></h4><div class="pgrid">${list.map((c) => {
        const own = CL.hasCard(S, c);
        if (!own && c.stage && CL.stageIdx(c.stage) > top + 0 && k !== 'exam') return `<div class="pcard locked future ${R_CLASS[c.rarity]}"><span class="pback">🔒</span><em>${STAGES.find((x) => x.id === c.stage).name}</em></div>`;
        return cardHtml(c, own);
      }).join('')}</div>`;
    }).join('');
}
function tabOutfits(p) {
  const by = { mid: '중학생', high: '고등학생', uni: '대학', grad: '인턴·졸업·엔딩' };
  const nowSt = stageOf(S).id;
  return head('옷장', p.outfits.have, p.outfits.total, p.outfits.pct, `🎮 게임 의상 ${p.outfits.total}벌 기준 · 전체 기록 ${p.outfits.all}벌(WARDROBE.md) · 그림이 있는 의상(보유)은 그 단계일 때 눌러서 갈아입을 수 있어요. 그림 준비 중인 의상은 색 견본만 보여요.`) +
    Object.entries(by).map(([st, nm]) => `<h4>${nm}</h4><div class="ogrid">${WARDROBE.filter((w) => w.stage === st).map((w) => {
      const o = CL.outfitState(S, w, ctx());
      const wearing = CL.equippedOutfit(S, nowSt, ctx()) === w.id;
      const canWear = o.state === 'owned' && !wearing && CL.spriteStageOf(w.id) === nowSt;
      const sw = w.colors.slice(0, 4).map((h) => `<i style="background:${h}"></i>`).join('');
      const later = o.state === 'owned' && CL.spriteStageOf(w.id) !== nowSt ? ` · ${STAGES.find((x) => x.id === CL.spriteStageOf(w.id)).name} 때 입어요` : '';
      const badge = { owned: wearing ? '👗 입는 중' : canWear ? '보유 · 눌러서 입기' : '보유' + later, unlocked: '해금 · 그림 준비 중', locked: '🔒 ' + o.text, archive: '기록만' }[o.state];
      return `<div class="ocard ${o.state}${wearing ? ' wear' : ''}${canWear ? ' canwear' : ''}"${canWear ? ` data-wear="${w.id}" role="button"` : ''}><div class="oimg">${o.state === 'archive' ? '<span>📝</span>' : `<img src="${paintOutfit(w, o.state)}" alt="">`}</div>
        <b>${w.id}</b><span class="oname">${w.name}${w.verified === '미확인' ? ' <em class="unk">미확인</em>' : ''}</span><span class="sw">${sw}</span><small>${badge}</small></div>`;
    }).join('')}</div>`).join('');
}
function tabItems(p) {
  const taste = QZ.quizData().taste || [];
  const items = taste.map((t) => {
    const own = (S.collection.items || {})[t.answer];
    return `<div class="icard${own ? '' : ' locked'}">${own ? tasteIconHtml(t.answer, 48) : '<span class="q">?</span>'}<b>${own ? t.item : '???'}</b><small>${own ? `🏠 ${t.spot}${t.scored === false ? ' · 미확인' : ''}` : `${t.stage} · 취향 맞히기`}</small></div>`;
  });
  const jar = CL.decorFor(S, 'dorm').some((d) => d.item === 'star_jar');
  items.push(`<div class="icard${jar ? '' : ' locked'}">${jar ? iconHtml('star_jar') : '<span class="q">?</span>'}<b>${jar ? '종이별 유리병' : '???'}</b><small>${jar ? '🏠 책상 위' : '이벤트 보상'}</small></div>`);
  const foods = FOODS.map((f) => {
    const n = (S.collection.foods || {})[f.id] || 0;
    return `<div class="icard${n ? '' : ' locked'}">${f.px ? iconHtml(f.px, f.dairy ? 'dairy' : '') : f.icon}<b>${f.name}</b><small>${n ? `${n}번 먹음` : '아직'}${f.dairy ? ' · 🥛우유 알레르기' : ''}</small></div>`;
  });
  const gifts = GIFTS.map((g) => `<div class="icard${S.inventory[g.id] ? '' : ' locked'}"><i>${g.icon}</i><b>${g.name}</b><small>준 횟수 ${S.inventory[g.id] || 0}</small></div>`);
  const best = S.minigame?.best || {};
  const mg = STAGES.map((st) => `<span>${st.name} ${best[st.id] ?? '-'}</span>`).join(' · ');
  const rx = EXTRA.reactions();
  return head('수집', p.items.have, p.items.total, p.items.pct, '맞힌 취향 아이템은 집 방에 놓여요 (중·고: 남우 집, 대: 기숙사, 졸업 후: 아파트).') +
    (rx ? `<h4>💬 반응 수집${S.ng ? ` <small>· ${S.ng + 1}회차</small>` : ''}</h4><p class="dnote react">아직 못 본 반응 ${rx.left}개 <small>(본 반응 ${rx.have}/${rx.total} · 설렘 순간·이벤트 선택지·삐짐 장면${S.ng ? '' : ' · 엔딩 뒤 2회차에서 새 선택지가 열려요'})</small></p>` : '') +
    `<h4>취향 아이템</h4><div class="igrid">${items.join('')}</div><h4>디저트 도감</h4><div class="igrid">${foods.join('')}</div>` +
    `<h4>선물 <small>(도감 진행률에는 안 들어가요)</small></h4><div class="igrid">${gifts.join('')}</div><h4>🍓 디저트 받기 최고 점수</h4><p class="dnote">${mg}</p>` +
    (S.rewards.length ? `<h4>이벤트 보상</h4><ul class="dlist">${S.rewards.map((r) => `<li>${r}</li>`).join('')}</ul>` : '');
}
let EXTRA = { reactions: () => null };
export function setDexExtra(o) { EXTRA = { ...EXTRA, ...o }; }
const seenEv = () => ({ ...((S.archive || {}).events || {}), ...(S.events || {}) });   // 2회차: 이전 회차에서 본 이벤트도 다시 보기 가능
function tabEvents(p) {
  const evs = EV_ORDER.map((id) => getEvents().find((e) => e.id === id)).filter(Boolean);
  const SEEN = seenEv();
  const gal = `<h4>🖼️ 갤러리 <small>탭하면 다시 보기</small></h4><div class="egal">${evs.map((e) => SEEN[e.id]
    ? `<button class="eg" data-replay="${e.id}">${artImg('event', e.id, { thumb: true })}<span>${e.title}</span></button>`
    : `<div class="eg locked">🔒<span>${e.id} · ${e.stage}</span></div>`).join('')}</div><h4>📔 기록</h4>`;
  return head('이벤트', p.events.have, p.events.total, p.events.pct) + endBtn() + gal + `<ul class="elist">${evs.map((e) => {
    const seen = SEEN[e.id];
    return `<li class="${seen ? 'seen' : ''}"><b>${e.id}</b><span>${seen ? e.title : '???'}</span><small>${seen ? `📅 ${seen}` : `${e.stage} · ${e.id === 'E8' ? '엔딩' : '조건 비밀'}`}</small>${seen && e.inspired ? `<em>${e.inspired}</em>` : ''}${seen ? `<button class="replay" data-replay="${e.id}">▶ 다시 보기</button>` : ''}</li>`;
  }).join('')}</ul>`;
}
function tabLines(p) {
  const L = allLines(), seen = S.seenLines || {};
  const by = (r) => { const a = L.filter((l) => l.rarity === r && l.action !== '회상'); return `${a.filter((l) => seen[l.id]).length}/${a.length}`; };
  const nost = L.filter((l) => l.action === '회상'), leg = L.filter((l) => l.rarity === '전설' && l.action !== '회상');
  const row = (l) => seen[l.id] ? `<li class="seen"><span>${l.text}</span>${l.quote != null ? `<small>${quoteCaption(l)}</small>` : ''}</li>` : `<li><span>??? <small>(${l.stage})</small></span></li>`;
  return head('회상·전설 대사', p.lines.have, p.lines.total, p.lines.pct, `들은 대사 전체 ${p.lines.heard}/${p.lines.all} · 일반 ${by('일반')} · 희귀 ${by('희귀')} · 전설 ${by('전설')}`) +
    `<h4>📖 회상 (원작 명대사)</h4><ul class="llist">${nost.map(row).join('')}</ul><h4>🌟 전설 대사</h4><ul class="llist">${leg.map(row).join('')}</ul>`;
}
function tabGrowth() {
  const day = dayNumber(S), tl = CL.timeline(S, day);
  const fmt = (t) => { if (!t) return ''; const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const ST = { done: '✅ 지남', now: '⭐ 지금', exam: '📝 시험 볼 수 있어요', next: '⏳ 다음', later: '🔒' };
  const ex = S.exam || {}, last = (ex.history || []).slice(-1)[0];
  const examLine = QZ.examDue(S) ? '📝 지금 성장 시험을 볼 수 있어요!' : ex.nextAt && ex.nextAt > Date.now() ? `📝 재도전: 내일부터 (${fmt(ex.nextAt)})` : tl.find((x) => x.state === 'next') ? `⏳ 다음 시험: D+${tl.find((x) => x.state === 'next').fromDay}부터` : CL.reached(S) >= 3 ? '🎓 모든 시험 통과!' : '';
  const end = CL.endingChecklist(S), ended = !!(S.events || {}).E8;
  return `<div class="dhead"><b>📈 성장 기록</b><span>D+${day} · ${stageOf(S).name}</span><p class="dnote">처음 만난 날 ${fmt(S.createdAt)} · 밥 ${S.stats_meta.feeds} · 대화 ${S.stats_meta.talks} · 공부 ${S.stats_meta.studies} · 놀기 ${S.stats_meta.plays} · 선물 ${S.stats_meta.gifts}</p></div>` +
    `<ol class="tline">${tl.map((x) => `<li class="${x.state}"><b>${x.name}</b><span>D+${x.fromDay}${x.toDay ? `~${x.toDay}` : '~'}</span><small>${ST[x.state]}${x.passedAt && (x.state === 'done' || x.state === 'now') ? ` · ${fmt(x.passedAt)}부터` : ''}</small></li>`).join('')}</ol>` +
    `<p class="dnote">${examLine}${last ? ` · 지난 시험: ${STAGES.find((s) => s.id === last.stage)?.name} ${last.n}/5 ${last.pass ? '통과' : '다시 도전'}` : ''}</p>` +
    `<h4>🌅 엔딩 「바닷가의 비밀」 ${ended ? '— 봤어요! (이벤트 탭 ▶ 다시 보기)' : ''}</h4>${endBtn()}<ul class="check">${end.map((c) => `<li class="${c.ok ? 'ok' : ''}">${c.ok ? '✅' : '⬜'} ${c.k}</li>`).join('')}</ul>` +
    `<p class="dnote">벌점·과금 없음. 조건은 게임 설계(PLAN §10 "대→졸업 엔딩")이고 원작 수치가 아니에요.</p>`;
}

// ── 카드 크게 보기 / 뽑기 연출 ──
export function showCard(c, { reveal = null, state } = {}) {
  if (state) S = state;
  const own = CL.hasCard(S, c) || !!reveal;
  const el = $('cardModal');
  const rTxt = { 일반: '일반', 희귀: '✨ 희귀', 전설: '🌟 전설' }[c.rarity];
  const pic = own ? (ILL(c) ? illImg(c, false) : `<img src="${paintCard(c)}" alt="">`) : (ILL(c) ? '<span class="sil"></span><span class="pback">🔒</span>' : '<span class="pback">?</span>');
  $('cardBody').innerHTML = `<div class="bigcard ${ILL(c) ? 'ill ' : ''}${R_CLASS[c.rarity]}${reveal ? ' flip' : ''}" style="position:relative">${pic}</div>
    <div class="cinfo"><span class="rar ${R_CLASS[c.rarity]}">${rTxt}</span><b>${own ? c.title : '???'}</b>${own && c.text ? `<p>“${c.text}”</p>` : ''}<small>${reveal ? (reveal.dup ? `또 나왔어요 ×${CL.cardCount(S, c.id)}` : 'NEW! 도감에 들어갔어요') : (own && c.ep ? `원작 ${c.ep} · ${c.how}` : c.how)}</small>
    ${reveal ? `<small>${reveal.why === 'pcard' ? `📸 명장면 포토카드 · 원작 ${c.ep}` : reveal.why === 'pieces' ? '🧩 조각 3개 → 전설 카드' : '하루 루틴 완료 보상 · 💗 설렘 +1'}</small>` : ''}</div>`;
  const vid = own && ILL(c) ? (c.kind === 'pcard' ? c.pc : c.ev) : null;
  if (vid && VO.hasVoice(vid)) { const b = document.createElement('button'); b.className = 'card-voice'; b.textContent = '🔊'; b.setAttribute('aria-label', '대사 다시 듣기'); b.onclick = (e) => { e.stopPropagation(); VO.playIllust(vid, { force: true }); }; $('cardBody').querySelector('.bigcard').appendChild(b); VO.playIllust(vid); }
  el.hidden = false;
}
export function bindDex(hooks = {}) {
  $('dexTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { TAB = b.dataset.tab; hooks.tap?.(); renderDex(); } });
  $('dexBody').addEventListener('click', (e) => { const wr = e.target.closest('[data-wear]'); if (wr) { if (CL.equipOutfit(S, wr.dataset.wear, ctx())) { hooks.tap?.(); hooks.equip?.(wr.dataset.wear); const y = $('dexBody').scrollTop; renderDex(); $('dexBody').scrollTop = y; } return; } const en = e.target.closest('[data-ending]'); if (en) { hooks.tap?.(); closeDex(); hooks.ending?.(); return; } const rp = e.target.closest('[data-replay]'); if (rp) { hooks.tap?.(); closeDex(); hooks.replay?.(rp.dataset.replay); return; } const b = e.target.closest('[data-card]'); if (b) { hooks.tap?.(); showCard(catalog().find((c) => c.id === b.dataset.card)); } });
  $('dexClose').onclick = () => { hooks.tap?.(); closeDex(); hooks.close?.(); };
  $('cardModal').addEventListener('click', () => { VO.stopVoice(); $('cardModal').hidden = true; if (!$('dex').hidden) renderDex(); hooks.cardClosed?.(); });
}
export const dexState = () => ({ open: !$('dex').hidden, tab: TAB, card: !$('cardModal').hidden });
export const clearThumbs = () => THUMB.clear();
let reT = 0;
onSheet(() => { if ($('dex').hidden) return; clearTimeout(reT); reT = setTimeout(() => { const b = $('dexBody'), y = b.scrollTop; renderDex(); b.scrollTop = y; }, 80); });
