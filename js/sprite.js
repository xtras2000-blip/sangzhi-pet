import { PLACES } from './config.js';
// 임시(placeholder) 픽셀 스프라이트 — 코드로 그리는 64×64 치비 + 방 배경.
// 최종 스타일 B 스프라이트 시트(PNG)로 교체 예정. 표정 ID는 EXPRESSIONS.md 기준.
export const PAL = {
  ol: '#3B2A3A', skin: '#FFE0CC', skinSh: '#F3C4AE', blush: '#FF9FB2',
  hair: '#241A1E', hairSh: '#4A3029', hairHl: '#7A5040',
  eye: '#2A1E2A', iris: '#6B4234', white: '#FFFFFF', mouth: '#C2475E',
};
const OUTFIT = {
  mid:  { top: '#5B8FD9', topSh: '#4673BD', trim: '#FFFFFF', bottom: '#5B8FD9', bottomSh: '#4673BD', shoe: '#FFFFFF', legs: false },
  high: { top: '#FFFFFF', topSh: '#E6E3EE', cardi: ['#F7D6E0', '#C7B6E6'], bottom: '#2F3A66', bottomSh: '#232C52', shoe: '#5A3B33', legs: true, bow: '#1E1A22' },
  uni:  { top: '#A7A9B4', topSh: '#8C8E9A', inner: '#FF9FB2', bottom: '#5E78A8', bottomSh: '#4B6290', shoe: '#FFFFFF', legs: false },
  grad: { top: '#BFD8F5', topSh: '#9DBDE6', dot: '#FFFFFF', bottom: '#BFD8F5', bottomSh: '#9DBDE6', shoe: '#E9A0B4', legs: true, dress: true },
};

function grid() { return Array.from({ length: 64 }, () => Array(64).fill(null)); }

export function drawChar(canvas, { stage = 'mid', expr = 'normal', frame = 0 } = {}) {
  const g = grid();
  const set = (x, y, c) => { if (x >= 0 && x < 64 && y >= 0 && y < 64) g[y][x] = c; };
  const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c); };
  const ell = (cx, cy, rx, ry, c, cond) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d <= 1 && (!cond || cond(x, y))) set(x, y, c);
      }
  };
  const o = OUTFIT[stage] || OUTFIT.mid;

  // 1) 뒷머리
  if (stage === 'mid') { rect(18, 22, 28, 14, PAL.hair); ell(32, 35, 14, 3, PAL.hair); }
  if (stage === 'high') { // 높은 포니테일
    ell(46, 12, 4, 4, PAL.hair); ell(49, 20, 4, 8, PAL.hair); ell(50, 28, 3, 5, PAL.hair);
  }
  if (stage === 'uni') { ell(32, 7, 7, 5, PAL.hair); ell(30, 4, 3, 2, PAL.hair); }
  if (stage === 'grad') { // 긴 웨이브
    for (let y = 22; y < 54; y++) { const w = Math.round(Math.sin(y / 3) * 1.5); rect(15 + w, y, 6, 1, PAL.hair); rect(43 - w, y, 6, 1, PAL.hair); }
    rect(19, 20, 26, 14, PAL.hair);
  }

  // 2) 몸
  const legsY = 52;
  if (o.dress) {
    for (let y = 39; y < 54; y++) { const w = 9 + Math.floor((y - 39) / 2); rect(32 - w, y, w * 2, 1, y > 47 ? o.bottomSh : o.top); }
    for (let y = 41; y < 53; y += 4) for (let x = 24; x < 41; x += 4) set(x + ((y / 4) % 2 ? 2 : 0), y, o.dot);
  } else {
    rect(23, 39, 18, 12, o.top); rect(23, 49, 18, 2, o.topSh);
    if (stage === 'mid') { rect(31, 39, 2, 12, o.trim); rect(23, 44, 3, 1, o.trim); rect(38, 44, 3, 1, o.trim); rect(28, 38, 8, 2, o.trim); }
    if (stage === 'high') { // 셔츠 + 줄무늬 가디건
      for (let y = 39; y < 51; y++) { const c = o.cardi[(y >> 1) % 2]; rect(23, y, 6, 1, c); rect(35, y, 6, 1, c); }
      rect(30, 39, 4, 2, PAL.ol); set(31, 41, '#2F3A66'); set(32, 41, '#2F3A66'); // 리본 타이
    }
    if (stage === 'uni') { rect(29, 39, 6, 4, o.inner); rect(32, 43, 1, 8, o.topSh); rect(22, 37, 20, 3, o.topSh); }
    if (stage === 'high') { for (let y = 50; y < 56; y++) { const w = 10 + (y - 50); rect(32 - w, y, w * 2, 1, (y - 50) % 2 ? o.bottomSh : o.bottom); } for (let x = 24; x < 41; x += 3) rect(x, 52, 1, 4, o.bottomSh); }
    else if (stage !== 'grad') { rect(24, 51, 7, 7, o.bottom); rect(33, 51, 7, 7, o.bottom); rect(30, 51, 1, 6, o.bottomSh); rect(33, 51, 1, 6, o.bottomSh); }
  }
  // 팔
  rect(19, 40, 4, 9, o.dress ? PAL.skin : o.top); rect(41, 40, 4, 9, o.dress ? PAL.skin : o.top);
  rect(19, 49, 4, 2, PAL.skin); rect(41, 49, 4, 2, PAL.skin);
  // 다리/신발
  if (o.legs) { rect(26, 54, 4, 4, PAL.skin); rect(34, 54, 4, 4, PAL.skin); if (stage === 'high') { rect(26, 57, 4, 1, '#FFFFFF'); rect(34, 57, 4, 1, '#FFFFFF'); } }
  rect(25, 58, 6, 2, o.shoe); rect(33, 58, 6, 2, o.shoe);

  // 3) 얼굴
  ell(32, 26, 13, 12, PAL.skin);
  if (expr === 'eat') { ell(19.5, 30, 2, 2, PAL.skin); ell(44.5, 30, 2, 2, PAL.skin); }
  rect(29, 37, 6, 2, PAL.skinSh); // 목

  // 4) 앞머리
  ell(32, 19, 15, 10, PAL.hair, (x, y) => y <= 21);
  for (let x = 18; x <= 46; x++) { const h = 22 + ((x * 7) % 3 === 0 ? 2 : (x % 4 === 0 ? 1 : 0)); rect(x, 21, 1, h - 21, PAL.hair); }
  if (stage === 'mid' || stage === 'grad') { rect(17, 22, 3, 12, PAL.hair); rect(44, 22, 3, 12, PAL.hair); }
  else { rect(18, 22, 2, 8, PAL.hair); rect(44, 22, 2, 8, PAL.hair); }
  if (stage === 'grad') { rect(21, 15, 2, 1, PAL.blush); }
  if (stage === 'high') { ell(44, 9, 3, 2, o.bow); ell(49, 9, 3, 2, o.bow); rect(46, 8, 2, 3, o.bow); }

  // 5) 외곽선 패스
  const filled = (x, y) => x >= 0 && x < 64 && y >= 0 && y < 64 && g[y][x];
  const outline = [];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++)
    if (!g[y][x] && (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1))) outline.push([x, y]);
  outline.forEach(([x, y]) => (g[y][x] = PAL.ol));

  // 머리 광택 (갈색 광택)
  for (let x = 24; x <= 38; x++) { const y = 13 + Math.round(((x - 31) / 7) ** 2 * 2); set(x, y, x % 3 ? PAL.hairSh : PAL.hairHl); }
  set(26, 12, PAL.hairHl); set(36, 12, PAL.hairHl);

  // 6) 표정
  const eyeOpen = (ex, look = 0, teary = false) => {
    rect(ex, 25, 5, 1, PAL.ol);
    rect(ex, 26, 5, 4, PAL.eye);
    rect(ex + 1 + look, 28, 3, 2, PAL.iris);
    set(ex + 1 + look, 26, PAL.white); set(ex + 2 + look, 26, PAL.white); set(ex + 3 + look, 29, PAL.white);
    if (teary) { set(ex + 3, 27, PAL.white); set(ex + 4, 30, '#BFE3FF'); }
  };
  const eyeLine = (ex, shape) => { // ^ / ‿ / ―
    const ys = shape === 'happy' ? [28, 27, 27, 27, 28] : shape === 'closed' ? [27, 28, 28, 28, 27] : [28, 28, 28, 28, 28];
    ys.forEach((y, i) => set(ex + i, y, PAL.ol));
    if (shape === 'half') rect(ex, 29, 5, 1, PAL.eye);
  };
  const brow = (kind) => {
    if (kind === 'sad') { set(24, 22, PAL.ol); set(25, 23, PAL.ol); set(39, 23, PAL.ol); set(40, 22, PAL.ol); }
    if (kind === 'angry') { set(24, 23, PAL.ol); set(25, 23, PAL.ol); set(26, 24, PAL.ol); set(38, 24, PAL.ol); set(39, 23, PAL.ol); set(40, 23, PAL.ol); }
  };
  const blush = (strong) => { const c = PAL.blush; rect(22, 31, 3, 1, c); rect(39, 31, 3, 1, c); if (strong) { rect(21, 30, 5, 2, c); rect(38, 30, 5, 2, c); } };
  const M = {
    smile: () => { set(30, 33, PAL.mouth); set(31, 34, PAL.mouth); set(32, 34, PAL.mouth); set(33, 33, PAL.mouth); },
    open: () => { rect(30, 33, 4, 2, PAL.mouth); rect(30, 33, 4, 1, PAL.ol); set(31, 34, '#FF9FB2'); set(32, 34, '#FF9FB2'); },
    frown: () => { set(30, 34, PAL.ol); set(31, 33, PAL.ol); set(32, 33, PAL.ol); set(33, 34, PAL.ol); },
    pout: () => { rect(30, 33, 4, 1, PAL.ol); set(31, 32, PAL.mouth); set(32, 32, PAL.mouth); },
    o: () => { rect(31, 33, 2, 2, PAL.mouth); },
    dot: () => { set(31, 33, PAL.mouth); set(32, 33, PAL.mouth); },
    wave: () => { set(29, 34, PAL.ol); set(30, 33, PAL.ol); set(31, 34, PAL.ol); set(32, 33, PAL.ol); set(33, 34, PAL.ol); set(34, 33, PAL.ol); },
    chew: () => { rect(30, 33, 4, 1, PAL.ol); set(frame ? 30 : 33, 34, PAL.ol); },
  };
  switch (expr) {
    case 'happy': eyeLine(24, 'happy'); eyeLine(36, 'happy'); M.open(); blush(true); break;          // E01
    case 'shy': eyeOpen(24, 1); eyeOpen(36, 1); brow('sad'); M.wave(); blush(true); rect(19, 29, 26, 1, PAL.blush); break; // E19
    case 'sulky': eyeLine(24, 'half'); eyeLine(36, 'half'); brow('angry'); M.pout(); ell(42, 31, 2, 1.5, PAL.blush); break; // E13
    case 'sleepy': eyeLine(24, 'half'); eyeLine(36, 'half'); M.o(); break;                          // E21
    case 'sleep': eyeLine(24, 'closed'); eyeLine(36, 'closed'); M.dot(); blush(false); break;          // E22
    case 'hungry': eyeOpen(24, 0, true); eyeOpen(36, 0, true); brow('sad'); M.frown(); break;           // E23
    case 'eat': eyeLine(24, 'happy'); eyeLine(36, 'happy'); M.chew(); blush(true); break;               // E06
    case 'study': eyeOpen(24, -1); eyeOpen(36, -1); M.dot(); rect(33, 33, 6, 1, '#E8B84A'); set(39, 33, PAL.ol); break; // E07 펜
    case 'itchy': eyeLine(24, 'happy'); eyeLine(36, 'happy'); brow('sad'); M.wave(); for (let i = 0; i < 4; i++) { set(21 + i * 2, 30 + (i % 2), '#FF6F8E'); set(37 + i * 2, 30 + (i % 2), '#FF6F8E'); } break;
    default: eyeOpen(24); eyeOpen(36); M.smile(); blush(false);                                          // 기본
  }

  // 렌더
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (g[y][x]) { ctx.fillStyle = g[y][x]; ctx.fillRect(x, y, 1, 1); }
}

// ── 방 배경 (논리 해상도 = 화면/4) ──
// ── 이미지 방 배경 (스타일 B) ───────────────────────────────
const ROOM_IMG = {};          // 'place|img' / 'place|night' / 'place|dusk' -> HTMLImageElement (불러온 것)
const ROOM_HAVE = {};         // 같은 키 -> 파일 이름 (있는 것). 모바일: 필요한 장소만 지연 로드
const ROOM_LOAD = {};
/** index.json 만 읽고, preload 장소만 미리 불러옴. 나머지는 drawRoomImg 가 처음 쓸 때 */
export async function loadRooms(preload = []) {
  let have = null;   // assets/rooms/index.json = 실제 있는 파일 목록 (없는 파일 요청 → 콘솔 404 방지)
  try { have = new Set(await (await fetch('assets/rooms/index.json')).json()); } catch {}
  for (const [id, p] of Object.entries(PLACES)) for (const k of ['img', 'night', 'dusk']) {
    if (p[k] && (!have || have.has(p[k]))) ROOM_HAVE[`${id}|${k}`] = p[k];
  }
  await Promise.all(preload.filter(Boolean).map(ensureRoom));
}
function loadRoomKey(key) {
  if (ROOM_IMG[key] || !ROOM_HAVE[key]) return Promise.resolve(!!ROOM_IMG[key]);
  return (ROOM_LOAD[key] ||= new Promise((ok) => {
    const img = new Image(); img.decoding = 'async';
    img.onload = () => { ROOM_IMG[key] = img; delete ROOM_LOAD[key]; LISTENERS.forEach((f) => { try { f(key, 'room'); } catch {} }); ok(true); };
    img.onerror = () => { delete ROOM_LOAD[key]; ok(false); }; img.src = `assets/rooms/${ROOM_HAVE[key]}`;
  }));
}
export const ensureRoom = (place) => Promise.all(['img', 'night', 'dusk'].map((k) => loadRoomKey(`${place}|${k}`)));
export const hasRoomImg = (place) => !!ROOM_HAVE[`${place}|img`];
const NIGHT = new Set(['밤', '새벽']);
/** 이미지 배경: 캔버스 = 원본 높이 기준 세로 crop. 밤 이미지가 있으면 그걸 쓰고 틴트는 약하게 */
export function drawRoomImg(canvas, { tod = '오후', place = 'home_nanwu', aspect = 0.68, focus, decor = [] } = {}) {
  const want = [NIGHT.has(tod) && `${place}|night`, tod === '저녁' && `${place}|dusk`, `${place}|img`].filter((k) => k && ROOM_HAVE[k]);
  if (!want.every((k) => ROOM_IMG[k])) { ensureRoom(place); return false; }   // 아직: 불러오면 onSheet(…, 'room') 로 알림
  const nightImg = NIGHT.has(tod) ? ROOM_IMG[`${place}|night`] : null;
  const duskImg = tod === '저녁' ? ROOM_IMG[`${place}|dusk`] : null;
  const img = nightImg || duskImg || ROOM_IMG[`${place}|img`]; const H = img.height, W = Math.min(img.width, Math.round(H * aspect));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const c = canvas.getContext('2d'); c.imageSmoothingEnabled = false;
  const fx = focus ?? PLACES[place]?.fx ?? 0.46;
  const sx = Math.max(0, Math.min(img.width - W, Math.round(img.width * fx - W / 2)));
  c.globalCompositeOperation = 'source-over'; c.drawImage(img, sx, 0, W, H, 0, 0, W, H);
  // Stage 7: 방 꾸미기 — 모은 아이템을 배경 픽셀 해상도로 올려 둠(밤/저녁 그림이면 같은 톤으로 어둡게)
  if (decor.length) drawDecor(c, decor, sx, nightImg ? ['#2B3266', 0.5] : duskImg ? ['#B0605A', 0.22] : null);
  const tint = duskImg ? null : nightImg ? { 새벽: ['#6A6FB0', 0.18] }[tod]
    : { 아침: ['#FFF4E0', 0.12], 저녁: ['#FF9A6A', 0.28], 밤: ['#2B3266', 0.5], 새벽: ['#3B3F7A', 0.42] }[tod];
  if (tint) { c.globalCompositeOperation = 'multiply'; c.globalAlpha = tint[1]; c.fillStyle = tint[0]; c.fillRect(0, 0, W, H); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
  return true;
}

/** decor: [{ img, sx, sy, sw, sh, x, y, size }] — x = 가운데, y = 바닥선(배경 이미지 좌표) */
function drawDecor(c, decor, ox, dim) {
  for (const d of decor) {
    if (!d.img) continue;
    const w = d.size, h = Math.round(d.size * d.sh / d.sw), x = Math.round(d.x - ox - w / 2), y = Math.round(d.y - h);
    if (x + w < 0 || x > c.canvas.width) continue;
    const o = document.createElement('canvas'); o.width = w; o.height = h;
    const oc = o.getContext('2d'); oc.imageSmoothingEnabled = true; oc.imageSmoothingQuality = 'high';
    oc.drawImage(d.img, d.sx, d.sy, d.sw, d.sh, 0, 0, w, h);
    if (dim) { oc.globalCompositeOperation = 'source-atop'; oc.globalAlpha = dim[1]; oc.fillStyle = dim[0]; oc.fillRect(0, 0, w, h); }
    if (d.y > 220) {   // 바닥에 놓인 것: 옅은 그림자
      c.fillStyle = 'rgba(60,30,40,0.18)'; c.beginPath(); c.ellipse(x + w / 2, d.y - 1, w * 0.42, Math.max(2, w * 0.09), 0, 0, Math.PI * 2); c.fill();
    }
    c.drawImage(o, x, y);
  }
}

export function drawRoom(canvas, { tod = '오후', stage = 'mid' } = {}) {
  const W = canvas.width, H = canvas.height, c = canvas.getContext('2d');
  const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const floorY = Math.round(H * 0.62);
  // 벽
  R(0, 0, W, floorY, '#FFE4EC');
  for (let x = 0; x < W; x += 8) R(x, 0, 3, floorY, '#FFD9E4');
  for (let y = 6; y < floorY - 6; y += 12) for (let x = (y / 12) % 2 ? 4 : 0; x < W; x += 8) R(x + 1, y, 1, 1, '#FFFFFF');
  R(0, floorY - 4, W, 4, '#FFFFFF'); R(0, floorY - 1, W, 1, '#E8C3CF');
  // 바닥
  R(0, floorY, W, H - floorY, '#F4DDBE');
  for (let y = floorY + 5; y < H; y += 6) R(0, y, W, 1, '#E6C8A3');
  for (let y = floorY; y < H; y += 6) for (let x = ((y / 6) % 2) * 9; x < W; x += 18) R(x, y, 1, 6, '#E6C8A3');
  // 창문 (시간대별 하늘)
  const sky = { 아침: ['#BFE6FF', '#E8F6FF'], 오후: ['#9FD4FF', '#D8F0FF'], 저녁: ['#FFB98A', '#FFDDB8'], 밤: ['#2C3A6B', '#46548A'], 새벽: ['#3A3F78', '#6E6FA8'] }[tod] || ['#9FD4FF', '#D8F0FF'];
  const wx = Math.round(W * 0.08), wy = Math.round(H * 0.07), ww = Math.round(W * 0.36), wh = Math.round(H * 0.24);
  R(wx - 2, wy - 2, ww + 4, wh + 4, '#FFFFFF'); R(wx - 2, wy + wh + 2, ww + 4, 2, '#E8C3CF');
  R(wx, wy, ww, wh, sky[0]); R(wx, wy + wh * 0.6, ww, wh * 0.4, sky[1]);
  if (tod === '밤' || tod === '새벽') { R(wx + ww * 0.7, wy + 3, 3, 3, '#FFF6DA'); [[0.15, 0.3], [0.4, 0.15], [0.55, 0.55], [0.25, 0.7]].forEach(([a, b]) => R(wx + ww * a, wy + wh * b, 1, 1, '#FFFFFF')); }
  else { R(wx + ww * 0.15, wy + wh * 0.3, 8, 2, '#FFFFFF'); R(wx + ww * 0.18, wy + wh * 0.3 - 2, 4, 2, '#FFFFFF'); }
  R(wx + ww / 2 - 1, wy, 2, wh, '#FFFFFF'); R(wx, wy + wh / 2 - 1, ww, 2, '#FFFFFF');
  // 커튼
  R(wx - 5, wy - 4, 5, wh + 10, '#FF9FB2'); R(wx + ww, wy - 4, 5, wh + 10, '#FF9FB2');
  R(wx - 8, wy - 6, ww + 16, 3, '#E8C3CF');
  // 액자 + 선반
  const fx = Math.round(W * 0.62), fy = Math.round(H * 0.1);
  R(fx, fy, 14, 11, '#C59BFF'); R(fx + 2, fy + 2, 10, 7, '#FFF6DA'); R(fx + 4, fy + 4, 3, 3, '#FF7FA3');
  R(fx + 18, fy + 14, 18, 2, '#C9A27A'); R(fx + 20, fy + 9, 3, 5, '#7FD6B5'); R(fx + 24, fy + 10, 3, 4, '#FFB36B'); R(fx + 29, fy + 8, 4, 6, '#8FB8FF');
  // 책상 (왼쪽)
  const dy = floorY - 14;
  R(2, dy, 30, 3, '#C9A27A'); R(4, dy + 3, 3, 14, '#B38B63'); R(27, dy + 3, 3, 14, '#B38B63'); R(16, dy + 3, 11, 7, '#D9B48A');
  R(6, dy - 6, 6, 6, '#7FD6B5'); R(7, dy - 8, 4, 2, '#FFF6DA'); // 스탠드
  R(14, dy - 3, 8, 3, '#FF7FA3'); R(15, dy - 5, 7, 2, '#8FB8FF'); // 책
  // 침대 (오른쪽)
  const bx = W - 38;
  R(bx, floorY - 6, 38, 4, '#FFFFFF'); R(bx, floorY - 2, 38, 10, '#CFF3E6'); R(bx, floorY + 8, 38, 3, '#9ED9C4');
  R(bx - 2, floorY - 16, 4, 27, '#C9A27A'); R(bx + 4, floorY - 10, 12, 5, '#FFFFFF');
  for (let x = bx + 18; x < W; x += 5) R(x, floorY - 1, 2, 2, '#FFE4EC');
  // 러그
  const cx = W / 2, cy = floorY + (H - floorY) * 0.55, rx = W * 0.28, ry = (H - floorY) * 0.28;
  for (let y = -ry; y <= ry; y++) { const w = rx * Math.sqrt(1 - (y / ry) ** 2); R(cx - w, cy + y, w * 2, 1, Math.abs(y) > ry - 2 ? '#FF9FB2' : '#FFC2D1'); }
}

// ───────────── Stage 2: 스타일 B 스프라이트 시트 (4단계) ─────────────
const SHEETS = {};   // id(단계 또는 의상) -> { img, meta, used }
// 모바일: 시트 하나가 디코드되면 ~37MB(1408×6688 RGBA) → 필요한 것만 지연 로드 + 최근 것 몇 개만 유지(LRU)
const STAGE_IDS = ['mid', 'high', 'uni', 'grad'];
const MAX_SHEETS = 6;   // 4단계 + 의상 2 (도감 카드가 4단계를 다 쓸 때도 서로 밀어내지 않게)
const LOADING = {}, LISTENERS = [];
const dirOf = (id) => (STAGE_IDS.includes(id) ? `assets/sprites/${id}` : `assets/sprites/outfits/${id}`);
async function loadOne(id) {
  try {
    const meta = await (await fetch(`${dirOf(id)}/sheet.json`)).json();
    const img = new Image(); img.decoding = 'async'; img.src = `${dirOf(id)}/${meta.image}`;
    await img.decode();
    SHEETS[id] = { img, meta, used: performance.now() }; evict(id); return true;
  } catch (e) { console.warn('sprite sheet load failed', id, e); return false; }
}
function evict(keep) {
  const ids = Object.keys(SHEETS); if (ids.length <= MAX_SHEETS) return;
  ids.filter((k) => k !== keep).sort((a, b) => SHEETS[a].used - SHEETS[b].used).slice(0, ids.length - MAX_SHEETS)
    .forEach((k) => { SHEETS[k].img.src = ''; delete SHEETS[k]; });
}
/** 시트가 없으면 불러옴(중복 요청 합침). 다 불러오면 onSheet 리스너 호출 */
export function ensureSheet(id) {
  if (SHEETS[id]) { SHEETS[id].used = performance.now(); return Promise.resolve(true); }
  return (LOADING[id] ||= loadOne(id).then((ok) => { delete LOADING[id]; if (ok) LISTENERS.forEach((f) => { try { f(id); } catch {} }); return ok; }));
}
export const onSheet = (f) => LISTENERS.push(f);
/** 도감을 닫은 뒤 등: keep 말고는 내려놓기(메모리) */
export function trimSheets(keep = []) { Object.keys(SHEETS).filter((k) => !keep.includes(k)).forEach((k) => { SHEETS[k].img.src = ''; delete SHEETS[k]; }); }
export const loadedSheets = () => Object.keys(SHEETS);
export async function loadSheets(stages = ['high']) { await Promise.all(stages.map(ensureSheet)); }
export async function loadOutfitSheets(ids = []) { await Promise.all(ids.map(ensureSheet)); }
/** 옷장 미리보기용 idle 한 장(시트 전체 대신, tools/make_thumbs.py) */
const THUMBS = {};
export function thumbOf(id) {
  if (THUMBS[id] !== undefined) return THUMBS[id] && THUMBS[id].complete && THUMBS[id].naturalWidth ? THUMBS[id] : null;
  const im = new Image(); THUMBS[id] = im;
  im.onload = () => LISTENERS.forEach((f) => { try { f(id, 'thumb'); } catch {} }); im.onerror = () => { THUMBS[id] = null; };
  im.src = `${dirOf(id)}/idle.png`; return null;
}
export const hasSheet = (st) => !!SHEETS[st];
export const touchSheet = (st) => { if (SHEETS[st]) SHEETS[st].used = performance.now(); };
export const cellOf = (st) => (SHEETS[st] ? SHEETS[st].meta.cell : 64);
/** 화면 배율 기준 셀(모든 단계 동일 → 단계가 바뀌어도 같은 픽셀 배율) */
export const scaleRefOf = (st) => (SHEETS[st] ? (SHEETS[st].meta.scaleRef || SHEETS[st].meta.cell) : 64);

/** 시트 애니 정보 */
export function animInfo(st, name) {
  const s = SHEETS[st]; if (!s) return null;
  const n = s.meta.aliases?.[name] || name;
  return s.meta.anims[n] ? { name: n, ...s.meta.anims[n] } : null;
}
/** 프레임 그리기. 반환: 세로 오프셋(px, 셀 단위) */
export function drawSheetFrame(canvas, st, name, f) {
  const s = SHEETS[st]; const a = animInfo(st, name); if (!s || !a) return 0;
  const C = s.meta.cell, fi = Math.min(f, a.frames - 1); s.used = performance.now();
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(s.img, fi * C, a.row * C, C, C, 0, 0, C, C);
  return a.offsets ? a.offsets[fi] : 0;
}

// 새 표정 ID → 임시 스프라이트(다른 단계) 표정 이름
export const LEGACY_EXPR = {
  idle: 'normal', E01: 'happy', E02: 'shy', E19: 'shy', E13: 'sulky', E05: 'sulky', eat: 'eat', E23: 'hungry',
  E21: 'sleepy', E22: 'sleep', E07: 'study', E11: 'happy', E10: 'hungry', E15: 'happy', hop: 'happy',
};

// Stage 5: 음식 패치(오버레이) 경로 제거 → 시트에 음식별 eat_<food> 줄이 직접 들어 있음 (tools/build_eat.py)

// ── 선명한 소수 배율(sharp-bilinear) ──
// 기기 픽셀 기준 배율 d 가 정수에 가까우면(±4%) 정수로 맞춰 최근접 그대로,
// 아니면 정수배 k=ceil(d)로 최근접 확대한 뒤 목표 크기로 부드럽게 축소 → 고르지 않은 픽셀(1·2px 섞임) 없이 선명
export function snapDev(d) {
  const r = Math.round(d);
  return r >= 1 && Math.abs(d - r) <= 0.04 * d ? r : d;
}
const PRE = { cv: null };
export function blitSharp(ctx, src, sx, sy, sw, sh, dx, dy, dw, dh) {
  const kx = dw / sw;
  if (Math.abs(kx - Math.round(kx)) < 1e-6 && kx >= 1) {   // 정수배: 최근접
    ctx.imageSmoothingEnabled = false; ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh); return;
  }
  if (kx < 1) {   // 축소: 고품질 스무딩
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh); ctx.imageSmoothingEnabled = false; return;
  }
  const k = Math.ceil(kx), W = sw * k, H = sh * k;
  if (!PRE.cv) PRE.cv = document.createElement('canvas');
  const p = PRE.cv;
  if (p.width < W || p.height < H) { p.width = Math.max(p.width, W); p.height = Math.max(p.height, H); }
  const pc = p.getContext('2d'); pc.imageSmoothingEnabled = false;
  pc.clearRect(0, 0, W, H); pc.drawImage(src, sx, sy, sw, sh, 0, 0, W, H);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';   // 2배 미만 축소 → 쌍선형이면 충분
  ctx.drawImage(p, 0, 0, W, H, dx, dy, dw, dh); ctx.imageSmoothingEnabled = false;
}
