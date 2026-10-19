// Stage 4: 말풍선 UX — 한 글자씩 타이핑, 탭하면 끝까지 표시 → 다시 탭하면 다음/닫기.
// 레이아웃 흔들림 방지: 아직 안 나온 글자도 visibility:hidden으로 미리 깔아 두어 줄바꿈 위치가 처음부터 고정됨(word-break: keep-all).
import { TYPE_MS } from './config.js';

const PAUSE = { '…': 7, '.': 5, '!': 5, '?': 5, ',': 3, '~': 2 };   // 문장부호 뒤 쉬는 시간(글자 수 단위)

export class DialogBox {
  constructor({ bubble, text, rarity, cap, next, choices }) {
    Object.assign(this, { bubble, text, rarity, cap, next, choices });
    this.shown = document.createElement('span');
    this.hid = document.createElement('span'); this.hid.className = 'hid'; this.hid.setAttribute('aria-hidden', 'true');
    this.text.replaceChildren(this.shown, this.hid);
    this.full = ''; this.n = 0; this.typing = false; this.hideTimer = 0; this.raf = 0;
    this.onDone = null; this.waitTap = false; this._tapResolve = null;
    this.speed = TYPE_MS;
    bubble.addEventListener('click', (e) => { e.stopPropagation(); this.tap(); });
  }
  get visible() { return this.bubble.classList.contains('show'); }
  get busy() { return this.typing || this.waitTap; }

  /** 말풍선에 한 줄 표시. opts: { rarity, caption, narr, wait(탭 기다림), instant } → Promise(다 보이면/탭하면) */
  show(str, opts = {}) {
    cancelAnimationFrame(this.raf); clearTimeout(this.hideTimer);
    this.full = String(str || ''); this.n = 0;
    const r = opts.rarity && opts.rarity !== '일반' ? opts.rarity : '';
    this.rarity.textContent = r ? (r === '전설' ? '🌟 전설' : '✨ 희귀') : '';
    this.cap.textContent = opts.caption || '';
    this.bubble.className = 'bubble show' + (r === '전설' ? ' legend' : r ? ' rare' : '') + (opts.narr ? ' narr' : '') + (opts.caption ? ' quote' : '') + (opts.wait ? ' wait' : '');
    this.choices.replaceChildren(); this.next.hidden = true;
    this.waitTap = !!opts.wait;
    this.render();
    return new Promise((res) => {
      this.onDone = () => {
        this.typing = false; this.render();
        if (this.waitTap) { this.next.hidden = false; this._tapResolve = res; }
        else { this.autoHide(); res(); }
      };
      if (opts.instant || this.speed <= 0) { this.n = this.full.length; this.onDone(); return; }
      this.typing = true; this.t0 = performance.now(); this.budget = 0;
      const step = (t) => {
        if (!this.typing) return;
        // 경과 시간만큼 글자 진행(문장부호 뒤엔 잠깐 멈춤)
        let el = t - this.t0;
        while (this.n < this.full.length) {
          const cost = this.speed * (1 + (PAUSE[this.full[this.n - 1]] && this.full[this.n] !== this.full[this.n - 1] ? PAUSE[this.full[this.n - 1]] : 0));
          if (el < this.budget + cost) break;
          this.budget += cost; this.n++;
        }
        this.render();
        if (this.n >= this.full.length) this.onDone();
        else this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    });
  }
  render() { this.shown.textContent = this.full.slice(0, this.n); this.hid.textContent = this.full.slice(this.n); }
  autoHide() {
    clearTimeout(this.hideTimer);
    const ms = Math.min(9000, Math.max(3500, 2200 + this.full.length * 70));
    this.hideTimer = setTimeout(() => this.hide(), ms);
  }
  hide() { clearTimeout(this.hideTimer); cancelAnimationFrame(this.raf); this.typing = false; this.waitTap = false; this.bubble.classList.remove('show'); }
  /** 탭: 타이핑 중 → 끝까지, 탭 대기 → 다음, 그 외 → 닫기 */
  tap() {
    if (this.typing) { cancelAnimationFrame(this.raf); this.n = this.full.length; this.onDone(); return 'skip'; }
    if (this.waitTap && this._tapResolve) { const r = this._tapResolve; this._tapResolve = null; this.waitTap = false; this.next.hidden = true; r(); return 'next'; }
    if (this.visible && !this.locked && !this.choices.childElementCount) { this.hide(); return 'close'; }
    return 'none';
  }
  /** 선택지 버튼 → Promise(고른 문자열) */
  choose(options) {
    this.waitTap = false; this.next.hidden = true; clearTimeout(this.hideTimer);
    return new Promise((res) => {
      this.choices.replaceChildren(...options.map((o) => {
        const b = document.createElement('button'); b.className = 'choice'; b.textContent = o;
        b.onclick = (e) => { e.stopPropagation(); this.choices.replaceChildren(); res(o); };
        return b;
      }));
    });
  }
}
