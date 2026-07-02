// =========================================================================
// BUTTONS.JS — pixelated dissolve hover fill for .button
// -------------------------------------------------------------------------
// On hover, the button's fill dissolves to `data-hover-fill` in a pixel grid
// that radiates from the centre; on unhover, the fill dissolves back OUT from
// the centre (not a shrink-back). A canvas layer is injected into each button
// between its background and its text; the button's real CSS :hover background
// is neutralized so the canvas is the only thing painting the hover colour.
//
// Requirements on the markup / CSS side:
//   • Buttons use the class `.button` and have `data-hover-fill="#RRGGBB"`.
//   • The button is a positioned, overflow-hidden box (so the canvas clips to
//     its border-radius). This module sets position/overflow defensively.
//   • Button text should sit above the canvas. The module bumps the z-index of
//     the button's real children so they stay on top of the injected canvas.
//   • Text colour on hover is handled by your CSS (unchanged here).
// =========================================================================

(() => {
  const CFG = {
    cellRem:   0.12,     // dissolve cell size in REM — scales with the root font-size
    duration:  0.6,      // seconds for full in / out
    softness:  0.15,     // 0 = hard front, 1 = soft (cells ease across a wide band)
    scatter:   0.45,     // 0 = ordered centre-out sweep, 1 = fully random per-cell
    tweenEase: 'circ.out',                 // GSAP ease driving the sweep
    cellEase:  t => 1 - Math.pow(1 - t, 3), // per-cell grow-in curve (cubic out)
  };
  // Resolve the current rem→px factor from the root font-size (matches the rem
  // logic used elsewhere on the site), so the cell grid scales with the page.
  const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

  class ButtonDissolve {
    constructor(el) {
      this.el = el;
      // Hover colour: explicit data-hover-fill, else the --pavegreen token.
      const paveGreen = getComputedStyle(document.documentElement)
        .getPropertyValue('--pavegreen').trim();
      this.hoverFill = el.getAttribute('data-hover-fill') || paveGreen || '#77DD84';

      // Ensure the button can host an absolutely-positioned, clipped canvas.
      const cs = getComputedStyle(el);
      if (cs.position === 'static') el.style.position = 'relative';
      if (cs.overflow !== 'hidden') el.style.overflow = 'hidden';

      // Neutralize the real CSS :hover background so it can't paint under us.
      // Stamp the current (base) background inline with !important.
      this.baseBg = cs.backgroundColor;
      el.style.setProperty('background-color', this.baseBg, 'important');

      // Buttons often contain a bare text node (e.g. <a class="button">Label</a>)
      // with no wrapping element — nothing to lift above the canvas, so the label
      // disappears once the fill paints. Wrap all existing content in a single
      // positioned span that stays on top. If the button is already wholly wrapped
      // in one element, reuse it instead of double-wrapping.
      const onlyChild = el.children.length === 1 && el.childNodes.length === 1
        ? el.children[0] : null;
      if (onlyChild) {
        this._label = onlyChild;
      } else {
        const span = document.createElement('span');
        while (el.firstChild) span.appendChild(el.firstChild);
        el.appendChild(span);
        this._label = span;
      }
      this._label.style.position = 'relative';
      this._label.style.zIndex = '2';

      // Canvas fill layer.
      this.canvas = document.createElement('canvas');
      Object.assign(this.canvas.style, {
        position: 'absolute', inset: '0', width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: '1', display: 'block',
      });
      el.insertBefore(this.canvas, el.firstChild);
      this.ctx = this.canvas.getContext('2d');
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);

      this.mode  = 'clear';   // 'fill' (intro) | 'clear' (outro)
      this.phase = 1;         // 1 = settled/empty
      this.raf   = null;
      this.cells = [];

      this.build();

      this._enter = () => this.animateTo(1);
      this._leave = () => this.animateTo(0);
      el.addEventListener('mouseenter', this._enter);
      el.addEventListener('mouseleave', this._leave);

      this._ro = new ResizeObserver(() => this.build());
      this._ro.observe(el);
    }

    build() {
      const rect = this.el.getBoundingClientRect();
      this.W = Math.max(1, Math.round(rect.width));
      this.H = Math.max(1, Math.round(rect.height));
      this.canvas.width  = this.W * this.dpr;
      this.canvas.height = this.H * this.dpr;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      const cell = Math.max(2, Math.round(CFG.cellRem * remPx()));   // rem → px, min 2px
      this.cols = Math.ceil(this.W / cell);
      this.rows = Math.ceil(this.H / cell);
      this.cell = cell;
      this.cells = [];
      // Threshold = centre-out distance blended with per-cell randomness.
      const cxMid = this.cols / 2, cyMid = this.rows / 2;
      const maxD = Math.hypot(cxMid, cyMid) || 1;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const ordered = Math.hypot(c - cxMid, r - cyMid) / maxD;   // 0 centre → 1 edge
          const rand = Math.random();
          const thr = ordered * (1 - CFG.scatter) + rand * CFG.scatter;
          this.cells.push({ c, r, thr });
        }
      }
      this.draw();
    }

    animateTo(t) {
      // t=1 → intro (fill, centre-out).  t=0 → outro (clear, centre-out).
      const mode = t === 1 ? 'fill' : 'clear';
      this.mode = mode;
      this.phase = 0;                        // fresh pass each time
      if (window.gsap) {
        gsap.killTweensOf(this);
        gsap.to(this, {
          phase: 1,
          duration: CFG.duration,
          ease: CFG.tweenEase,
          onUpdate: () => this.draw(),
          onComplete: () => this.draw(),
        });
      } else {
        cancelAnimationFrame(this.raf);
        const start = performance.now();
        const step = (now) => {
          this.phase = Math.min(1, (now - start) / (CFG.duration * 1000));
          this.draw();
          if (this.phase < 1) this.raf = requestAnimationFrame(step);
        };
        this.raf = requestAnimationFrame(step);
      }
    }

    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.W, this.H);
      const mode = this.mode || 'clear';
      const p = this.phase || 0;
      if (mode === 'clear' && p >= 1) return;   // fully cleared & settled

      const soft = Math.max(0.0001, CFG.softness);
      ctx.fillStyle = this.hoverFill;
      const cell = this.cell;
      for (const cellObj of this.cells) {
        // How far this cell is into its own transition (0→1), from its centre-out
        // threshold. Fill and clear share thresholds, so both radiate from centre.
        const cross = Math.max(0, Math.min(1, (p - cellObj.thr) / soft + 0.5));
        const vis = mode === 'fill' ? cross : 1 - cross;
        if (vis <= 0.001) continue;
        const eased = CFG.cellEase(vis);
        const size = cell * eased;
        if (size < 0.4) continue;
        const x = cellObj.c * cell + (cell - size) / 2;
        const y = cellObj.r * cell + (cell - size) / 2;
        ctx.globalAlpha = eased;
        ctx.fillRect(x, y, size, size);
      }
      ctx.globalAlpha = 1;
    }

    destroy() {
      this.el.removeEventListener('mouseenter', this._enter);
      this.el.removeEventListener('mouseleave', this._leave);
      this._ro.disconnect();
      if (window.gsap) gsap.killTweensOf(this);
      cancelAnimationFrame(this.raf);
      this.canvas.remove();
    }
  }

  // Boot after layout is ready so button sizes are correct.
  function boot() {
    const buttons = document.querySelectorAll('.button');
    ButtonDissolve.instances = [];
    buttons.forEach((el) => ButtonDissolve.instances.push(new ButtonDissolve(el)));
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();


// =========================================================================
// NAV-LINK HOVER — square pops in on the left, text nudges right
// -------------------------------------------------------------------------
// On hover of a .nav-link: a 0.15rem square scales in on the left and the text
// shifts right by 0.25rem. On leave, both reverse. The square is injected and
// the link's text is wrapped in a span so the text can move independently.
// =========================================================================

(() => {
  const SQUARE_REM = 0.15;   // square edge size
  const SHIFT_REM  = 0.25;   // text shift on hover
  const DUR        = 0.35;   // seconds
  const EASE       = 'power3.out';

  function setup(link) {
    // Wrap the link's content in a span so the text can move on its own.
    let label;
    const onlyChild = link.children.length === 1 && link.childNodes.length === 1
      ? link.children[0] : null;
    if (onlyChild) {
      label = onlyChild;
    } else {
      label = document.createElement('span');
      while (link.firstChild) label.appendChild(link.firstChild);
      link.appendChild(label);
    }
    label.style.display = 'inline-block';
    label.style.willChange = 'transform';

    // Injected square, positioned to the left of the text.
    const sq = document.createElement('span');
    Object.assign(sq.style, {
      position: 'absolute',
      left: '0',
      top: '50%',
      width: SQUARE_REM + 'rem',
      height: SQUARE_REM + 'rem',
      backgroundColor: 'var(--pavegreen)',
      transform: 'translateY(-50%) scale(0)',
      transformOrigin: 'center',
      opacity: '0',
      pointerEvents: 'none',
    });
    // Ensure the link can host the absolutely-positioned square.
    if (getComputedStyle(link).position === 'static') link.style.position = 'relative';
    link.insertBefore(sq, link.firstChild);

    const enter = () => {
      gsap.to(sq,    { scale: 1, opacity: 1, duration: DUR, ease: EASE });
      gsap.to(label, { x: SHIFT_REM + 'rem', duration: DUR, ease: EASE });
    };
    const leave = () => {
      gsap.to(sq,    { scale: 0, opacity: 0, duration: DUR, ease: EASE });
      gsap.to(label, { x: '0rem', duration: DUR, ease: EASE });
    };
    link.addEventListener('mouseenter', enter);
    link.addEventListener('mouseleave', leave);
  }

  function bootNav() {
    document.querySelectorAll('.nav-link').forEach(setup);
  }

  if (document.readyState === 'complete') bootNav();
  else window.addEventListener('load', bootNav);
})();
