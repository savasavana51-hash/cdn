// =========================================================================
// LINEGRID_PIXEL.JS — Canvas generative art system (halftone pixel variant)
// Pixel size: 0.02rem | Step: 0.18rem | Auto-fill grid from canvas size
// Globe + hover trail + globe-outro disintegration + bank accounts foreground
// =========================================================================

const LINEGRID_DEFAULTS = {
  pixelRem:    0.025,
  stepRem:     0.2,
  fgMinRem:    0.02,
  fgMaxRem:    0.14,
  fgEase:      1,
  bgOpacity:   0.35,
  hoverMinRem: 0.03,
  hoverMaxRem: 0.22,
  hoverSpread: 3,
  hoverDecay:  0.55,
  lerp:        0.08,
  velDecay:    0.85,
  velScale:    0.04,
  waveSpeed:   0.3,
  threshold:   0.5,
  trailLen:    24,
  bgColor:     '#222222',
  lineColor:   '#f5f5f5',
  dpr:         Math.min(window.devicePixelRatio || 1, 2),
};

class LineGrid {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    const cfg      = Object.assign({}, LINEGRID_DEFAULTS, options);

    this.PIXEL_REM     = cfg.pixelRem;
    this.STEP_REM      = cfg.stepRem;
    this.FG_MIN_REM    = cfg.fgMinRem;
    this.FG_MAX_REM    = cfg.fgMaxRem;
    this.FG_EASE       = cfg.fgEase;
    this.HOVER_MIN_REM = cfg.hoverMinRem;
    this.HOVER_MAX_REM = cfg.hoverMaxRem;
    this.HOVER_SPREAD  = cfg.hoverSpread;
    this.HOVER_DECAY   = cfg.hoverDecay;
    this.LERP          = cfg.lerp;
    this.VEL_DECAY     = cfg.velDecay;
    this.VEL_SCALE     = cfg.velScale;
    this.WAVE_SPEED    = cfg.waveSpeed;
    this.THRESHOLD     = cfg.threshold;
    this.TRAIL_LEN     = cfg.trailLen;
    this.BG_OPACITY    = cfg.bgOpacity;

    this._bgVar   = options.bgColor  && options.bgColor.startsWith('--')  ? options.bgColor  : null;
    this._lineVar = options.lineColor && options.lineColor.startsWith('--') ? options.lineColor : null;
    this.BG_COLOR   = this._bgVar   ? this._readVar(this._bgVar)   : (cfg.bgColor   || '#222222');
    this.LINE_COLOR = this._lineVar ? this._hexToRgb(this._readVar(this._lineVar)) : this._hexToRgb(cfg.lineColor || '#f5f5f5');

    this.DPR = cfg.dpr;

    // Pixel grid dimensions
    this.PIXEL_SIZE = 0; this.STEP = 0; this.FG_MIN = 0; this.FG_MAX = 0;
    this.HOVER_MIN  = 0; this.HOVER_MAX = 0;
    this.COLS = 0; this.ROWS = 0;
    this.W = 0; this.H = 0;
    this.sCX = 0; this.sCY = 0;
    this._rem = 0;

    this.colXCache = [];
    this.rowYCache = [];
    this.energy    = [];
    this.fgActive  = [];
    this._fgTarget = null;

    // Mouse / trail state
    this.trail       = [];
    this.targetX     = -1; this.targetY     = -1;
    this.smoothX     = -1; this.smoothY     = -1;
    this.prevSmoothX = -1; this.prevSmoothY = -1;
    this.velocity    = 0;

    // Time
    this.waveTime = 0;
    this.lastTs   = null;
    this._prevTs  = null;
    this._rafId   = null;

    // Globe
    this.globeAngle     = 0;
    this.globeCountries = [];
    this.globeReady     = false;
    this.GLOBE_TILT     = options.globeTilt  !== undefined ? options.globeTilt  : -0.3;
    this.GLOBE_SPEED    = options.globeSpeed  || 0.005;
    this.globeRevealScale     = 1;
    this.globeScrollProgress  = 0;  // 0 = cropped at bottom, 1 = centred + shrunk

    this.GLOBE_MARKER_COLOR = this._hexToRgb(options.markerColor || '#77DD84');
    this.globeMarkers = options.globeMarkers || [
      { name: 'GE',  lon: 43.3569,  lat: 42.3154 },
      { name: 'SG',  lon: 103.8198, lat: 1.3521  },
      { name: 'MY',  lon: 101.9758, lat: 4.2105  },
      { name: 'HK',  lon: 114.1694, lat: 22.3193 },
      { name: 'UAE', lon: 54.3773,  lat: 24.4539 },
      { name: 'UK',  lon: -0.1276,  lat: 51.5074 },
    ];

    this._globeCX = 0; this._globeCY = 0;
    this._globeR  = 0; this._globeFocal = 0;
    this.shapeMinX = 0; this.shapeMaxX = 0;

    // ── Two independent scrub-driven phases ─────────────────────────────────
    // PHASE 1 — outroProgress 0→1, GSAP scrub on .globe-outro (top 100% → 50%)
    //   globe disintegrates: on-grid radial dissolve. Nothing else.
    // PHASE 2 — bankProgress 0→1, GSAP scrub on .pn-product-scroll.bankaccount
    //   (top 100% → 0%). Dollar reveals, then flips $ → € → ¥. All on scrub.
    this.outroProgress    = 0;
    this._disintegrate    = 0;    // 0 = intact, 1 = fully dissolved
    this._cellJitter      = [];   // per-cell random jitter for dissolve threshold

    this.bankProgress     = 0;    // 0→1 scrub: reveal + two flips, no ticker
    this.bankActive       = false;

    // Disintegration tuning (radial dissolve, on-grid, no movement)
    //   Cells dissolve in order of distance from globe centre (outer → ... )
    //   DISSOLVE_DIR:  'out' = edges go first, 'in' = centre goes first
    //   DISSOLVE_JITTER: 0 = clean ring front, higher = more ragged edge
    //   DISSOLVE_BAND: width of the active dissolving front (0–1)
    this.DISSOLVE_DIR    = options.dissolveDir    || 'out';
    this.DISSOLVE_JITTER = options.dissolveJitter !== undefined ? options.dissolveJitter : 0.18;
    this.DISSOLVE_BAND   = options.dissolveBand   !== undefined ? options.dissolveBand   : 0.25;

    // Canvas
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `display:block;width:100%;height:100%;background:${this.BG_COLOR};`;
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.faceCanvas = document.createElement('canvas');
    this.fCtx       = this.faceCanvas.getContext('2d');

    // Events
    this._onMouseMove  = this._onMouseMove.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);
    this._onResize     = this._onResize.bind(this);
    window.addEventListener('mousemove',  this._onMouseMove);
    window.addEventListener('mouseleave', this._onMouseLeave);
    window.addEventListener('resize',     this._onResize);

    window.addEventListener('load', () => {
      this.resize();
      this._initGlobe();
      this._rafId = requestAnimationFrame((ts) => this._tick(ts));
      LineGrid._instances.add(this);
    });
  }

  // ── Events ────────────────────────────────────────────────────────────────

  _onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.targetX = e.clientX - rect.left;
    this.targetY = e.clientY - rect.top;
    if (this.smoothX < 0) { this.smoothX = this.targetX; this.smoothY = this.targetY; }
  }
  _onMouseLeave(e) {
    if (e.relatedTarget === null) {
      this.targetX = -1; this.targetY = -1;
      this.smoothX = -1; this.smoothY = -1;
      this.prevSmoothX = -1; this.prevSmoothY = -1;
      this.velocity = 0; this.trail.length = 0;
    }
  }
  _onResize() { this.resize(); }

  // ── Resize ────────────────────────────────────────────────────────────────

  resize() {
    const style = window.getComputedStyle(this.container);
    const W = this.container.clientWidth  - parseFloat(style.paddingLeft)  - parseFloat(style.paddingRight);
    const H = this.container.clientHeight - parseFloat(style.paddingTop)   - parseFloat(style.paddingBottom);
    this.W = W; this.H = H > 0 ? H : window.innerHeight;

    this.canvas.style.width  = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.canvas.width  = this.W * this.DPR;
    this.canvas.height = this.H * this.DPR;
    this.ctx.scale(this.DPR, this.DPR);

    this.faceCanvas.width  = this.W * this.DPR;
    this.faceCanvas.height = this.H * this.DPR;

    const rem       = parseFloat(getComputedStyle(document.documentElement).fontSize);
    this._rem       = rem;
    this.PIXEL_SIZE = rem * this.PIXEL_REM;
    this.STEP       = rem * this.STEP_REM;
    this.FG_MIN     = rem * this.FG_MIN_REM;
    this.FG_MAX     = rem * this.FG_MAX_REM;
    this.HOVER_MIN  = rem * this.HOVER_MIN_REM;
    this.HOVER_MAX  = rem * this.HOVER_MAX_REM;
    this.COLS       = Math.floor((this.W + this.STEP + 0.5) / this.STEP);
    this.ROWS       = Math.floor((this.H + this.STEP + 0.5) / this.STEP);
    this.sCX        = this.W / 2;
    this.sCY        = this.H / 2;

    this.colXCache = [];
    this.rowYCache = [];
    this.energy    = [];
    this.fgActive  = [];
    this._cellJitter = [];
    for (let col = 0; col < this.COLS; col++) {
      this.colXCache.push(col * this.STEP);
      this.energy.push(new Float32Array(this.ROWS).fill(0));
      this.fgActive.push(new Float32Array(this.ROWS).fill(0));
      // Per-cell deterministic jitter (0–1) — ragged dissolve front
      const jit = new Float32Array(this.ROWS);
      for (let r = 0; r < this.ROWS; r++) {
        const h = Math.sin(col * 12.9898 + r * 78.233) * 43758.5453;
        jit[r] = h - Math.floor(h);
      }
      this._cellJitter.push(jit);
    }
    for (let row = 0; row < this.ROWS; row++) {
      this.rowYCache.push(row * this.STEP);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _readVar(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  refreshColors() {
    if (this._bgVar)   this.BG_COLOR   = this._readVar(this._bgVar);
    if (this._lineVar) this.LINE_COLOR  = this._hexToRgb(this._readVar(this._lineVar));
    this.canvas.style.background = this.BG_COLOR;
  }

  _hexToRgb(hex) {
    if (!hex) return '245,245,245';
    hex = hex.trim().replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c+c).join('');
    const r = parseInt(hex.slice(0,2), 16);
    const g = parseInt(hex.slice(2,4), 16);
    const b = parseInt(hex.slice(4,6), 16);
    return `${r},${g},${b}`;
  }

  _getFracCol(x) {
    const col = Math.floor(x / this.STEP);
    return Math.max(0, Math.min(this.COLS - 1, col + (x % this.STEP) / this.STEP));
  }

  _drawPixelCentered(cellX, cellY, size) {
    if (size <= 0) return;
    const half = this.STEP / 2;
    this.ctx.fillRect(cellX + half - size/2, cellY + half - size/2, size, size);
  }

  _resetFgTarget() {
    if (!this._fgTarget || this._fgTarget.length !== this.COLS) {
      this._fgTarget = [];
      for (let c = 0; c < this.COLS; c++) this._fgTarget.push(new Float32Array(this.ROWS));
    } else {
      for (let c = 0; c < this.COLS; c++) this._fgTarget[c].fill(0);
    }
  }

  // Eased foreground render with optional on-grid radial dissolve.
  // disint 0 = intact; 1 = fully dissolved. Cells never leave their grid cell —
  // they shrink to zero in order of radial distance from the globe centre,
  // with per-cell jitter for a ragged front. (A+C disintegration.)
  _drawFgEased(disint = 0) {
    const { COLS, ROWS, FG_MIN, FG_MAX } = this;
    const doDissolve = disint > 0.0001;

    // Radial reference: globe centre + radius (fall back to canvas centre)
    const gcx = this._globeCX || this.W / 2;
    const gcy = this._globeCY || this.H / 2;
    const gr  = this._globeR  || Math.min(this.W, this.H) * 0.5;
    const invR = 1 / (gr * 1.05);            // normalise so edge ≈ 1
    const dirOut = this.DISSOLVE_DIR !== 'in';
    const band   = Math.max(0.02, this.DISSOLVE_BAND);
    const jitAmt = this.DISSOLVE_JITTER;

    // Front position 0→1 across the whole dissolve, expanded so the band
    // fully clears both ends (front travels from -band to 1+jit).
    const front = disint * (1 + band + jitAmt);

    this.ctx.fillStyle = `rgba(${this.LINE_COLOR},1)`;

    for (let col = 0; col < COLS; col++) {
      const cellX     = this.colXCache[col];
      const targetCol = this._fgTarget[col];
      const activeCol = this.fgActive[col];
      const jitCol    = this._cellJitter[col];
      const cxCell    = cellX + this.STEP / 2;
      for (let row = 0; row < ROWS; row++) {
        const target = targetCol[row];
        const cur    = activeCol[row];
        const next   = cur + (target - cur) * this.FG_EASE;
        activeCol[row] = next;
        if (next <= 0.001) continue;

        let vis = 1;
        if (doDissolve) {
          const cyCell = this.rowYCache[row] + this.STEP / 2;
          const dx = (cxCell - gcx) * invR, dy = (cyCell - gcy) * invR;
          let nd = Math.sqrt(dx*dx + dy*dy);           // 0 centre → ~1 edge
          if (dirOut) nd = 1 - nd;                     // edges dissolve first
          // Per-cell threshold with jitter
          const thresh = nd + (jitCol[row] - 0.5) * jitAmt;
          // vis: 1 before front, 0 after, linear across the band
          vis = (thresh - (front - band)) / band;
          if (vis >= 1) vis = 1;
          else if (vis <= 0) continue;                 // fully dissolved cell
        }

        const sz = (FG_MIN + next * (FG_MAX - FG_MIN)) * vis;
        if (sz <= 0.001) continue;
        if (doDissolve && vis < 1) {
          this.ctx.fillStyle = `rgba(${this.LINE_COLOR},${vis})`;
        } else {
          this.ctx.fillStyle = `rgba(${this.LINE_COLOR},1)`;
        }
        this._drawPixelCentered(cellX, this.rowYCache[row], sz);
      }
    }
  }

  _scanToFgTarget(getAlpha, valueFn) {
    const { COLS, ROWS } = this;
    const half = this.STEP / 2;
    this._resetFgTarget();
    for (let col = 0; col < COLS; col++) {
      const cx = this.colXCache[col] + half;
      const targetCol = this._fgTarget[col];
      for (let row = 0; row < ROWS; row++) {
        const cy = this.rowYCache[row] + half;
        if (getAlpha(cx, cy) <= this.THRESHOLD) continue;
        targetCol[row] = valueFn(cx, cy);
      }
    }
  }

  // =========================================================================
  // FOREGROUND: GLOBE
  // =========================================================================

  _initGlobe() {
    const self = this;
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then(r => r.json())
      .then(topology => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js';
        document.head.appendChild(script);
        script.onload = () => {
          const geojson = topojson.feature(topology, topology.objects.countries);
          geojson.features.forEach(feature => {
            const geom = feature.geometry;
            const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
            polys.forEach(poly => poly.forEach(ring => {
              if (ring.length < 6) return;
              let minLon=180,maxLon=-180,minLat=90,maxLat=-90;
              ring.forEach(([lon,lat]) => { if(lon<minLon)minLon=lon; if(lon>maxLon)maxLon=lon; if(lat<minLat)minLat=lat; if(lat>maxLat)maxLat=lat; });
              if ((maxLon-minLon)*(maxLat-minLat) < 4) return;
              if (ring.length > 1) self.globeCountries.push(ring);
            }));
          });
          self.globeReady = true;
        };
      });
  }

  _renderGlobe() {
    if (!this.globeReady) return null;
    const { W, H, DPR } = this;
    const rem = this._rem || 16;

    const progress    = this.globeScrollProgress || 0;

    const GLOBE_R_FULL = rem * 10.7;
    const GLOBE_R_END  = rem * 4;
    const GLOBE_R_FULL_LERPED = GLOBE_R_FULL + (GLOBE_R_END - GLOBE_R_FULL) * progress;

    const GLOBE_R = GLOBE_R_FULL_LERPED * this.globeRevealScale;
    if (GLOBE_R < 0.5) return null;

    const GLOBE_CX = W / 2;
    const GLOBE_CY_START = H + GLOBE_R_FULL * 0.08;
    const GLOBE_CY_END   = H / 2 + rem * 1.2;
    const GLOBE_CY = GLOBE_CY_START + (GLOBE_CY_END - GLOBE_CY_START) * progress;
    const FOCAL    = H * 1.1;
    const fCtx     = this.fCtx;

    fCtx.clearRect(0, 0, W*DPR, H*DPR);
    fCtx.save(); fCtx.scale(DPR, DPR);
    fCtx.fillStyle = 'white';

    const cosA = Math.cos(this.globeAngle), sinA = Math.sin(this.globeAngle);
    const cosT = Math.cos(this.GLOBE_TILT),  sinT = Math.sin(this.GLOBE_TILT);

    this.shapeMinX  = 0;
    this.shapeMaxX  = W;
    this._globeCY   = GLOBE_CY;
    this._globeCX   = GLOBE_CX;
    this._globeR    = GLOBE_R;
    this._globeFocal = FOCAL;

    this.globeCountries.forEach(ring => {
      const pts = []; let anyVisible = false;
      for (let i = 0; i < ring.length; i++) {
        const [lon, lat] = ring[i];
        const phi = (90 - lat) * Math.PI / 180, theta = -lon * Math.PI / 180;
        let x = Math.sin(phi)*Math.cos(theta), y = Math.cos(phi), z = Math.sin(phi)*Math.sin(theta);
        const x1 = x*cosA + z*sinA, z1 = -x*sinA + z*cosA;
        const y2 = y*cosT - z1*sinT, z2 = y*sinT + z1*cosT;
        const rx = x1*GLOBE_R, ry = -y2*GLOBE_R, rz = z2*GLOBE_R;
        const s  = FOCAL / (FOCAL + rz + 300);
        const sx = GLOBE_CX + rx * s, sy = GLOBE_CY + ry * s;
        const behind = rz < -GLOBE_R * 0.1;
        pts.push({ sx, sy, behind });
        if (!behind) anyVisible = true;
      }
      if (!anyVisible) return;
      fCtx.beginPath(); let penDown = false;
      pts.forEach(({ sx, sy, behind }) => {
        if (behind) { penDown = false; return; }
        if (!penDown) { fCtx.moveTo(sx, sy); penDown = true; }
        else fCtx.lineTo(sx, sy);
      });
      if (penDown) fCtx.closePath();
      fCtx.fill();
    });

    fCtx.restore();
    return GLOBE_R_FULL_LERPED;
  }

  _scanGlobeToTarget(GLOBE_R) {
    if (!this.globeReady) return;
    const { W, H, DPR } = this;
    const data = this.fCtx.getImageData(0, 0, W*DPR, H*DPR), stride = Math.round(W * DPR);
    const globeCY = this._globeCY, globeCX = this._globeCX;
    const getAlpha = (x, y) => {
      const px=Math.round(Math.max(0,Math.min(W*DPR-1,x*DPR)));
      const py=Math.round(Math.max(0,Math.min(H*DPR-1,y*DPR)));
      return data.data[(py*stride+px)*4+3]/255;
    };
    this._scanToFgTarget(getAlpha, (cx, cy) => {
      const ndx = (cx - globeCX) / GLOBE_R, ndy = (cy - globeCY) / GLOBE_R;
      return Math.max(0, 1 - Math.sqrt(ndx*ndx + ndy*ndy) * 0.9);
    });
  }

  _drawGlobeMarkers() {
    if (!this.globeReady || !this.globeMarkers) return;
    const GLOBE_R = this._globeR;
    if (!GLOBE_R || GLOBE_R < 0.5) return;
    const { COLS, ROWS, STEP } = this;
    const FOCAL    = this._globeFocal;
    const GLOBE_CX = this._globeCX, GLOBE_CY = this._globeCY;
    const half     = STEP / 2;
    const cosA = Math.cos(this.globeAngle), sinA = Math.sin(this.globeAngle);
    const cosT = Math.cos(this.GLOBE_TILT),  sinT = Math.sin(this.GLOBE_TILT);
    const ctx  = this.ctx;
    const green = this.GLOBE_MARKER_COLOR;
    const SPREAD = 2;
    const markerFade = 1 - this._disintegrate;  // markers fade with globe
    if (markerFade <= 0.001) return;

    this.globeMarkers.forEach((m, i) => {
      const phi = (90 - m.lat) * Math.PI / 180, theta = -m.lon * Math.PI / 180;
      let x = Math.sin(phi)*Math.cos(theta), y = Math.cos(phi), z = Math.sin(phi)*Math.sin(theta);
      const x1 = x*cosA + z*sinA, z1 = -x*sinA + z*cosA;
      const y2 = y*cosT - z1*sinT, z2 = y*sinT + z1*cosT;
      const rz = z2*GLOBE_R;
      if (rz < -GLOBE_R * 0.1) return;
      const s  = FOCAL / (FOCAL + rz + 300);
      const sx = GLOBE_CX + x1*GLOBE_R * s;
      const sy = GLOBE_CY + (-y2)*GLOBE_R * s;
      const phase = this.waveTime * 2.2 + i * 1.7;
      const blink = (Math.sin(phase) + 1) / 2;
      const alpha = (0.2 + blink * 0.8) * markerFade;
      const col0  = Math.round((sx - half) / STEP);
      const row0  = Math.round((sy - half) / STEP);
      for (let dc = -SPREAD; dc <= SPREAD; dc++) {
        for (let dr = -SPREAD; dr <= SPREAD; dr++) {
          const col = col0 + dc, row = row0 + dr;
          if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue;
          const d = Math.sqrt(dc*dc + dr*dr);
          if (d > SPREAD + 0.3) continue;
          const falloff = Math.max(0, 1 - d / (SPREAD + 0.3));
          const sz = this.FG_MIN + falloff * (this.FG_MAX - this.FG_MIN) * (0.5 + blink * 0.5);
          ctx.fillStyle = `rgba(${green},${alpha * (0.35 + falloff * 0.65)})`;
          this._drawPixelCentered(this.colXCache[col], this.rowYCache[row], sz);
        }
      }
    });
  }

  // =========================================================================
  // FOREGROUND: BANK ACCOUNTS — currency flip (Dollar → Euro → Yen)
  // Reveal: dollar scales up from centre. Loop: flip between currencies.
  // Driven entirely by this.bankProgress (0→1) on scrub — no internal ticker.
  // Sequence: reveal $ → hold → flip to € → hold → flip to ¥.
  // =========================================================================

  _renderCurrencyFace(symbol, scaleX, scaleY) {
    const { W, H, DPR } = this;
    const fCtx = this.fCtx;
    fCtx.clearRect(0, 0, W*DPR, H*DPR);
    if (scaleX <= 0.001 || scaleY <= 0.001) return;

    fCtx.save();
    fCtx.scale(DPR, DPR);
    const cx = W / 2;
    const cy = H / 2 + this._rem * 1.2;     // align with globe end-centre
    const fontPx = Math.min(W, H) * 0.252;  // reduced 40% from 0.42

    fCtx.translate(cx, cy);
    fCtx.scale(scaleX, scaleY);
    fCtx.fillStyle = 'white';
    fCtx.textAlign = 'center';
    fCtx.textBaseline = 'middle';
    fCtx.font = `700 ${fontPx}px Georgia, "Times New Roman", serif`;
    fCtx.fillText(symbol, 0, 0);
    fCtx.restore();
  }

  _scanCurrencyToTarget() {
    const { W, H, DPR } = this;
    const data = this.fCtx.getImageData(0, 0, W*DPR, H*DPR), stride = Math.round(W * DPR);
    const cx = W / 2, cy = H / 2 + this._rem * 1.2;
    const shapeR = Math.min(W, H) * 0.18;  // matched to reduced glyph
    const getAlpha = (x, y) => {
      const px=Math.round(Math.max(0,Math.min(W*DPR-1,x*DPR)));
      const py=Math.round(Math.max(0,Math.min(H*DPR-1,y*DPR)));
      return data.data[(py*stride+px)*4+3]/255;
    };
    this._scanToFgTarget(getAlpha, (px, py) => {
      const ndx = (px - cx) / shapeR, ndy = (py - cy) / shapeR;
      return Math.max(0.15, 1 - Math.sqrt(ndx*ndx + ndy*ndy) * 0.8);
    });
  }

  _drawBankAccounts() {
    if (this.bankProgress <= 0.001) return;

    const CURRENCIES = ['$', '\u20AC', '\u00A5'];  // Dollar, Euro, Yen
    const p = Math.min(1, this.bankProgress);

    // Map scrub progress 0→1 across the whole sequence:
    //   [0.00 – 0.30]  REVEAL  : dollar scales 0→1 from centre
    //   [0.30 – 0.45]  HOLD    : dollar full
    //   [0.45 – 0.65]  FLIP 1  : dollar → euro
    //   [0.65 – 0.80]  HOLD    : euro full
    //   [0.80 – 1.00]  FLIP 2  : euro → yen
    const seg = (a, b) => Math.max(0, Math.min(1, (p - a) / (b - a)));
    // Cubic ease for flip halves so the card has weight
    const flipEase = (t) => (t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2);

    if (p < 0.30) {
      // REVEAL — dollar scales up (clean ease-out, no bounce)
      const t = seg(0.0, 0.30);
      const eased = 1 - Math.pow(1 - t, 3);
      this._renderCurrencyFace(CURRENCIES[0], eased, eased);

    } else if (p < 0.45) {
      // HOLD dollar
      this._renderCurrencyFace(CURRENCIES[0], 1, 1);

    } else if (p < 0.65) {
      // FLIP 1 : dollar → euro  (scaleX squeeze out then in)
      const e = flipEase(seg(0.45, 0.65));
      if (e < 0.5) this._renderCurrencyFace(CURRENCIES[0], 1 - e*2, 1);
      else         this._renderCurrencyFace(CURRENCIES[1], (e - 0.5)*2, 1);

    } else if (p < 0.80) {
      // HOLD euro
      this._renderCurrencyFace(CURRENCIES[1], 1, 1);

    } else {
      // FLIP 2 : euro → yen
      const e = flipEase(seg(0.80, 1.00));
      if (e < 0.5) this._renderCurrencyFace(CURRENCIES[1], 1 - e*2, 1);
      else         this._renderCurrencyFace(CURRENCIES[2], (e - 0.5)*2, 1);
    }

    this._scanCurrencyToTarget();
    this._drawFgEased(0);
  }

  // =========================================================================
  // MAIN LOOP
  // =========================================================================

  _tick(ts) {
    if (this.lastTs !== null) this.waveTime += (ts - this.lastTs) / 1000;
    this._prevTs = this.lastTs;
    this.lastTs  = ts;

    const { W, H, COLS, ROWS, STEP } = this;
    const ctx = this.ctx;

    // ── Two independent scrub phases ──────────────────────────────────────
    // PHASE 1: globe disintegration driven solely by outroProgress
    this._disintegrate = Math.min(1, Math.max(0, this.outroProgress || 0));
    // PHASE 2: bank accounts active once its own scrub starts
    const bp = Math.min(1, Math.max(0, this.bankProgress || 0));
    this.bankProgress = bp;
    this.bankActive = bp > 0.001 || this._disintegrate >= 1;

    // Mouse smoothing + velocity
    if (this.targetX >= 0) {
      this.smoothX += (this.targetX - this.smoothX) * this.LERP;
      this.smoothY += (this.targetY - this.smoothY) * this.LERP;
      if (this.prevSmoothX >= 0) {
        const dx = this.smoothX - this.prevSmoothX, dy = this.smoothY - this.prevSmoothY;
        this.velocity += (Math.sqrt(dx*dx + dy*dy) - this.velocity) * 0.2;
      }
      this.prevSmoothX = this.smoothX; this.prevSmoothY = this.smoothY;
    }
    this.velocity *= this.VEL_DECAY;
    const velStrength = Math.min(this.velocity * this.VEL_SCALE, 1);

    if (velStrength > 0.01 && this.smoothX >= 0) {
      this.trail.push({ x: this.smoothX, y: this.smoothY, v: velStrength });
      if (this.trail.length > this.TRAIL_LEN) this.trail.shift();
    } else {
      if (this.trail.length > 0) this.trail.shift();
    }

    // Hover energy
    this.trail.forEach((pt, ti) => {
      const strength = Math.pow(ti / this.trail.length, 2) * pt.v;
      const SPREAD   = this.HOVER_SPREAD;
      for (let col = 0; col < COLS; col++) {
        const colMid  = this.colXCache[col] + STEP / 2;
        const colDist = Math.abs(pt.x - colMid) / STEP;
        if (colDist > SPREAD + 1) continue;
        const cf = Math.exp(-colDist * colDist / (SPREAD * 0.9));
        if (cf < 0.01) continue;
        const ri0 = Math.round(pt.y / STEP);
        for (let ri = ri0 - SPREAD; ri <= ri0 + SPREAD; ri++) {
          if (ri < 0 || ri >= ROWS) continue;
          const rf = Math.exp(-Math.pow((ri - ri0) / SPREAD, 2) * 1.5);
          this.energy[col][ri] = Math.max(this.energy[col][ri], strength * cf * rf);
        }
      }
    });
    for (let col = 0; col < COLS; col++)
      for (let ri = 0; ri < ROWS; ri++)
        this.energy[col][ri] *= this.HOVER_DECAY;

    // Background
    ctx.fillStyle = this.BG_COLOR;
    ctx.fillRect(0, 0, W, H);

    const fracCol = this.smoothX >= 0 ? this._getFracCol(this.smoothX) : -1;
    const fracRow = this.smoothY >= 0 ? this.smoothY / STEP : -1;

    // Pixel grid + hover trail
    for (let col = 0; col < COLS; col++) {
      const cellX = this.colXCache[col];
      const xMul  = (fracCol >= 0 && velStrength > 0.01)
        ? Math.exp(-Math.pow(col - fracCol, 2) * 1.2) * velStrength : 0;
      for (let row = 0; row < ROWS; row++) {
        const cellY = this.rowYCache[row];
        const e     = this.energy[col][row] || 0;

        ctx.fillStyle = `rgba(${this.LINE_COLOR},${this.BG_OPACITY})`;
        this._drawPixelCentered(cellX, cellY, this.PIXEL_SIZE);

        let targetSz = 0;
        if (e > 0.01) {
          targetSz = this.HOVER_MIN + e * (this.HOVER_MAX - this.HOVER_MIN);
        } else if (xMul > 0.02 && fracRow >= 0) {
          const yDist = row - fracRow, yMul = Math.exp(-yDist * yDist * 1.2), influence = xMul * yMul;
          if (influence > 0.02) targetSz = this.HOVER_MIN + influence * (this.HOVER_MAX - this.HOVER_MIN);
        }
        if (targetSz > 0.001) {
          ctx.fillStyle = `rgba(${this.LINE_COLOR},0.9)`;
          this._drawPixelCentered(cellX, cellY, targetSz);
        }
      }
    }

    // ── Foreground: globe (disintegrating) OR bank accounts ───────────────
    if (this.bankActive) {
      // Globe gone — render bank accounts dollar/currency
      // Clear any lingering globe fg so it doesn't ease back in
      if (this._fgTarget) for (let c = 0; c < COLS; c++) this.fgActive[c].fill(0);
      this._drawBankAccounts();
    } else {
      // Globe phase (intact or disintegrating)
      this._currentGlobeSpeed = this._currentGlobeSpeed || this.GLOBE_SPEED;
      this._currentGlobeSpeed += (this.GLOBE_SPEED - this._currentGlobeSpeed) * 0.05;
      this.globeAngle += this._currentGlobeSpeed;
      const gr = this._renderGlobe();
      if (gr) {
        this._scanGlobeToTarget(gr);
        this._drawFgEased(this._disintegrate);   // radial on-grid dissolve
      }
      this._drawGlobeMarkers();
    }

    this._rafId = requestAnimationFrame((ts) => this._tick(ts));
  }

  destroy() {
    cancelAnimationFrame(this._rafId);
    window.removeEventListener('mousemove',  this._onMouseMove);
    window.removeEventListener('mouseleave', this._onMouseLeave);
    window.removeEventListener('resize',     this._onResize);
    this.canvas.remove();
    LineGrid._instances.delete(this);
  }
}

LineGrid._instances = new Set();
LineGrid.refreshAll = () => { LineGrid._instances.forEach(i => i.refreshColors()); };

// =========================================================================
// CANVAS INSTANCE
// =========================================================================

const grid1 = new LineGrid('#section-1', {
  bgColor:     '--dark',
  lineColor:   '--white',
  markerColor: '#77DD84',
});
