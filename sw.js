// 자동 생성: tools/build_sw.py — 손으로 고치지 마세요
const VERSION = 'sz-4a931426f8';
const MUSIC = 'sz-music';   // OST 캐시: 버전이 바뀌어도 지우지 않음(처음 재생할 때 통째로 저장)
const PRECACHE = ["./", "index.html", "manifest.webmanifest", "assets/icons/app/apple-touch-icon.png", "assets/icons/app/icon-192.png", "assets/icons/app/icon-32.png", "assets/icons/app/icon-512.png", "assets/icons/app/maskable-512.png", "assets/icons/catch.json", "assets/icons/catch.png", "assets/icons/taste.json", "assets/icons/taste.png", "assets/rooms/index.json", "assets/sprites/grad/idle.png", "assets/sprites/high/idle.png", "assets/sprites/mid/idle.png", "assets/sprites/outfits/W04/idle.png", "assets/sprites/outfits/W06/idle.png", "assets/sprites/outfits/W07/idle.png", "assets/sprites/outfits/W08/idle.png", "assets/sprites/outfits/W09/idle.png", "assets/sprites/outfits/W13/idle.png", "assets/sprites/outfits/W14/idle.png", "assets/sprites/outfits/W15/idle.png", "assets/sprites/outfits/W16/idle.png", "assets/sprites/outfits/W18/idle.png", "assets/sprites/outfits/W21/idle.png", "assets/sprites/outfits/W22/idle.png", "assets/sprites/outfits/W31/idle.png", "assets/sprites/outfits/W32/idle.png", "assets/sprites/outfits/W33/idle.png", "assets/sprites/outfits/W34/idle.png", "assets/sprites/uni/idle.png", "assets/title/title_1024.webp", "css/style.css", "data/chronicle.json", "data/dialogue.json", "data/ending.json", "data/goals.json", "data/messenger.json", "data/moments.json", "data/music.json", "data/quiz.json", "data/scenes.json", "data/story.json", "data/voice_lines.json", "data/wardrobe.json", "fonts/Galmuri11-Bold-sub.woff2", "fonts/Galmuri11-sub.woff2", "js/actions.js", "js/audio.js", "js/catch_ui.js", "js/chronicle.js", "js/collection.js", "js/config.js", "js/confirm.js", "js/dex_ui.js", "js/dialogbox.js", "js/dialogue.js", "js/ending.js", "js/events.js", "js/evplace.js", "js/goals.js", "js/guard.js", "js/illust.js", "js/main.js", "js/messenger.js", "js/minigame.js", "js/mobile.js", "js/moments.js", "js/music.js", "js/music_map.js", "js/quiz.js", "js/quizgen.js", "js/sprite.js", "js/state.js", "js/story.js", "js/tantrum.js", "js/title.js", "js/voice.js", "js/sw_version.js"];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== MUSIC).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'version') e.source && e.source.postMessage({ version: VERSION }); });
self.addEventListener('fetch', (e) => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;
  if (req.mode === 'navigate') {   // 페이지: 네트워크 먼저(4초), 안 되면 캐시(오프라인)
    e.respondWith(Promise.race([fetch(req), new Promise((_, no) => setTimeout(no, 4000))])
      .then((r) => { const cp = r.clone(); caches.open(VERSION).then((c) => c.put('index.html', cp)); return r; })
      .catch(() => caches.match('index.html')));
    return;
  }
  if (u.pathname.includes('/assets/music/')) {   // 음악: index.json 은 네트워크 먼저, 곡은 캐시 먼저(200 전체 응답만 저장, Range 요청은 그대로 통과)
    if (u.pathname.endsWith('.json')) { e.respondWith(fetch(req).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(MUSIC).then((c) => c.put(req, cp)); } return r; }).catch(() => caches.match(req, { ignoreSearch: true }))); return; }
    if (req.headers.has('range')) return;
    e.respondWith(caches.open(MUSIC).then((c) => c.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.status === 200) c.put(req, r.clone()); return r; }))));
    return;
  }
  // 나머지: 캐시 먼저(버전이 바뀌면 캐시 자체가 새로 만들어짐), 없으면 받아서 저장
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok && r.type === 'basic') { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); }
    return r;
  })));
});
