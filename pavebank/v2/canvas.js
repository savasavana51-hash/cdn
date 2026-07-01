// =========================================================================
// LINEGRID_PIXEL.JS — Canvas generative art system (halftone pixel variant)
// Pixel size: 0.02rem | Step: 0.18rem | Auto-fill grid from canvas size
// Globe + hover trail + globe-outro disintegration + bank accounts foreground
// =========================================================================

const LINEGRID_DEFAULTS = {
  pixelRem:    0.024,
  stepRem:     0.14,
  fgMinRem:    0.02,
  fgMaxRem:    0.1,
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
  trailGreen:     '#77DD84',  // colour the trail blends toward at high speed
  trailGreenVel:  0.45,       // velStrength at which the blend reaches full green
  bgColor:     '#222222',
  lineColor:   '#f5f5f5',
  dpr:         Math.min(window.devicePixelRatio || 1, 2),
};

// ── Isometric cube geometry (Digital Asset Management) ──────────────────────
// 45° about Y + ~35.26° tilt about X = classic 3/4 isometric. Canvas y grows
// down, so the tilt is signed to look DOWN at the cube (top face visible).
const ISO_A      = Math.atan(1 / Math.SQRT2);   // ~35.264° X tilt
const ISO_BASE_Y = Math.PI / 4;                 // 45° base Y rotation
// Vertical screen extent of a unit (half-size 1) cube at the base view, so a
// rem size maps to real on-screen cube height.
const ISO_SPAN = (() => {
  const ct = Math.cos(ISO_A), st = Math.sin(ISO_A);
  const c  = Math.cos(ISO_BASE_Y), s = Math.sin(ISO_BASE_Y);
  let minY = Infinity, maxY = -Infinity;
  for (const p of [
    [-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],
    [-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1],
  ]) {
    const zr = -p[0]*s + p[2]*c;
    const y2 = p[1]*ct + zr*st;
    if (y2 < minY) minY = y2;
    if (y2 > maxY) maxY = y2;
  }
  return maxY - minY;
})();

class LineGrid {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    if (!this.container) return;   // element not on this page — bail quietly
    const cfg      = Object.assign({}, LINEGRID_DEFAULTS, options);

    // Canvas mode: 'globe' (default — globe + products) or 'empty' (background
    // grid + hover only).
    this.MODE = options.mode || 'globe';

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
    this.TRAIL_GREEN     = this._greenRgb(cfg.trailGreen);  // velocity trail accent (--pavegreen)
    this.TRAIL_GREEN_VEL = cfg.trailGreenVel !== undefined ? cfg.trailGreenVel : 0.45;
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
    this.GLOBE_TILT     = options.globeTilt  !== undefined ? options.globeTilt  : -0.4;
    this.GLOBE_SPEED    = options.globeSpeed  || 0.005;
    this.globeRevealScale     = 1;
    this.globeScrollProgress  = 0;  // 0 = cropped at bottom, 1 = end position

    // ── Globe scroll-end tuning ─────────────────────────────────────────────
    // GLOBE_END_VH:  end vertical position as a fraction of viewport height,
    //                measured from canvas centre. 0 = stays centred, -1 = moves
    //                up by 100vh (off the top), 0.5 = down half a screen, etc.
    // GLOBE_END_R_REM: globe radius (rem) at full scroll. Lower = shrinks more.
    //                Set equal to the full radius (~10.7) for no scale-down.
    this.GLOBE_END_VH    = options.globeEndVh    !== undefined ? options.globeEndVh    : 0;   // -100vh
    this.GLOBE_END_R_REM = options.globeEndRRem  !== undefined ? options.globeEndRRem  : 4;    // shrink target

    this.GLOBE_MARKER_COLOR = this._greenRgb(options.markerColor);   // --pavegreen
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
    //   globe disintegrates: grid-quantized outward hop dissolve. Nothing else.
    // PHASE 2 — bankProgress 0→1, GSAP scrub on .pn-product-scroll.bankaccount
    //   (top 100% → 0%). Dollar reveals, then flips $ → € → ¥. All on scrub.
    this.outroProgress    = 0;
    this._disintegrate    = 0;    // 0 = intact, 1 = fully dissolved
    this._cellJitter      = [];   // per-cell random jitter for dissolve threshold

    this.bankProgress     = 0;    // 0→1 scrub from .pn-product-scroll.bankaccount
    this.bankActive       = false;
    this.damActive        = false;

    // ── 3D extruded currency sequence (GSAP timeline, scrubbed by bankProgress)
    //   reveal $ → hold → flip $→€ → hold → flip €→¥ → hold → dissolve out.
    //   Faces render solid, side walls render smaller & lighter (depth).
    this.CUR_GLYPH_FRAC  = options.curGlyphFrac  !== undefined ? options.curGlyphFrac  : 0.32;
    this.CUR_DEPTH       = options.curDepth      !== undefined ? options.curDepth      : 0.20;
    this.CUR_FOCAL       = options.curFocal      !== undefined ? options.curFocal      : 2.8;
    this.CUR_FACE_SHADE  = 1.0;
    this.CUR_WALL_SHADE  = 0.5;
    this.CUR_WALL_SIZE   = options.curWallSize   !== undefined ? options.curWallSize   : 0.7;  // wall px ÷ face px
    // dissolve (grid-quantized hop) tuning for the currency exit
    this.CUR_HOP_MAX     = options.curHopMax     !== undefined ? options.curHopMax     : 4;
    this.CUR_DIS_BAND    = options.curDisBand    !== undefined ? options.curDisBand    : 0.25;
    this.CUR_DIS_JITTER  = options.curDisJitter  !== undefined ? options.curDisJitter  : 0.18;
    this._curMasks       = null;  // built lazily
    // Public tweenable state — animations.js builds the GSAP timeline against
    // this object and scrubs it. The canvas just renders whatever it holds.
    this.curState        = { scale: 0, flipAngle: 0, symbol: '$', dissolve: 0 };
    this._curState       = this.curState;   // internal alias

    // ── Digital Asset Management — isometric cube (6 minis → merge → spin → out)
    //   Public state driven by a GSAP timeline in animations.js, scrubbed on
    //   .pn-product-scroll.dam. reveal → merge → rot ×2 → dissolve.
    this.damState        = { reveal: 0, merge: 0, rot: 0, dissolve: 0 };
    this.DAM_CUBE_REM    = options.damCubeRem   !== undefined ? options.damCubeRem   : 5;    // big cube size
    this.DAM_MINI_REM    = options.damMiniRem   !== undefined ? options.damMiniRem   : 2;    // mini cube size
    this.DAM_SHADE_TOP   = options.damShadeTop  !== undefined ? options.damShadeTop  : 0.55;
    this.DAM_SHADE_LEFT  = options.damShadeLeft !== undefined ? options.damShadeLeft : 0.35;
    this.DAM_SHADE_RIGHT = options.damShadeRight!== undefined ? options.damShadeRight: 1.0;
    this.DAM_LIGHT_SIZE  = options.damLightSize !== undefined ? options.damLightSize : 0.7;  // lighter faces draw smaller
    this.DAM_REVEAL_OVL  = options.damRevealOvl !== undefined ? options.damRevealOvl : 0.5;  // reveal stagger overlap
    this.DAM_MERGE_OVL   = options.damMergeOvl  !== undefined ? options.damMergeOvl  : 0.45; // merge stagger overlap
    this.DAM_HOP_MAX     = options.damHopMax    !== undefined ? options.damHopMax    : 4;
    this.DAM_DIS_BAND    = options.damDisBand   !== undefined ? options.damDisBand   : 0.25;
    this.DAM_DIS_JITTER  = options.damDisJitter !== undefined ? options.damDisJitter : 0.18;
    // 6 mini-cube ring slots on a regular hexagon (even 60° spacing), ordered
    // clockwise from TOP-RIGHT → ... → TOP-LEFT. Angles measured from +x axis,
    // going clockwise (screen y is down). Radius set by RX/RY (ellipse so the
    // ring reads evenly under the isometric foreshortening).
    {
      const RX = 1.84, RY = 1.84;            // ring radii (× cube scale)
      // clockwise screen angles: top-right 60°, mid-right 0°, bottom-right -60°,
      // bottom-left -120°, mid-left 180°, top-left 120°
      const angs = [60, 0, -60, -120, 180, 120].map(d => d * Math.PI/180);
      this.DAM_SCATTER = angs.map(a => ({
        dx:  Math.cos(a) * RX,
        dy: -Math.sin(a) * RY,            // negate: screen y grows down
      }));
    }

    // ── PaveNet — concentric extruded rings (reveal → spinY 360 → spinX 360 → out)
    //   Disk cut into N nested annular rings; reveal scales them up, then two
    //   full 360° rotations (Y then X), each staggered across rings (outer leads,
    //   inner trails), returning to aligned; then grid-quantized hop dissolve.
    //   Public state driven by a GSAP timeline in animations.js (.pn-product-scroll.pnet).
    this.pnetState        = { reveal: 0, spinY: 0, spinX: 0, dissolve: 0 };
    this.PNET_DISK_REM    = options.pnetDiskRem  !== undefined ? options.pnetDiskRem  : 6.9;  // disk diameter
    this.PNET_THICK_REM   = options.pnetThickRem !== undefined ? options.pnetThickRem : 1.38; // thickness
    this.PNET_RING_COUNT  = options.pnetRingCount!== undefined ? options.pnetRingCount: 4;
    this.PNET_RING_GAP    = options.pnetRingGap  !== undefined ? options.pnetRingGap  : 0.3;  // gap (frac of band)
    this.PNET_REVEAL_OVL  = options.pnetRevealOvl!== undefined ? options.pnetRevealOvl: 0.5;
    this.PNET_SPIN_OVL    = options.pnetSpinOvl  !== undefined ? options.pnetSpinOvl  : 0.866; // 360° stagger
    this.PNET_SPIN_TURNS  = options.pnetSpinTurns!== undefined ? options.pnetSpinTurns: 1;     // 1 = 360°, 0.5 = 180°
    this.PNET_YAW_DEG     = options.pnetYawDeg   !== undefined ? options.pnetYawDeg   : 8;    // fixed x tilt
    this.PNET_SHADE_FACE  = options.pnetShadeFace!== undefined ? options.pnetShadeFace: 1.0;  // front/back caps
    this.PNET_SHADE_SIDE  = options.pnetShadeSide!== undefined ? options.pnetShadeSide: 0.45; // outer rim
    this.PNET_SHADE_INNER = options.pnetShadeInner!==undefined ? options.pnetShadeInner:0.6;  // inner wall
    this.PNET_SHADE_BACK  = options.pnetShadeBack!== undefined ? options.pnetShadeBack: 0.85; // back cap
    this.PNET_LIGHT_SIZE  = options.pnetLightSize!== undefined ? options.pnetLightSize: 0.7;
    this.PNET_NSEG        = options.pnetNseg     !== undefined ? options.pnetNseg     : 64;   // circumference segs
    this.PNET_SIDES       = options.pnetSides    !== undefined ? options.pnetSides    : 64;   // polygon sides (6 = hexagon, high = circle)
    this.PNET_SIDE_OFFSET = options.pnetSideOffset!==undefined ? options.pnetSideOffset: Math.PI/2; // corner orientation (pointy-top)
    this.PNET_HOP_MAX     = options.pnetHopMax   !== undefined ? options.pnetHopMax   : 4;
    this.PNET_DIS_BAND    = options.pnetDisBand  !== undefined ? options.pnetDisBand  : 0.25;
    this.PNET_DIS_JITTER  = options.pnetDisJitter!== undefined ? options.pnetDisJitter: 0.18;
    this.pnetActive       = false;

    // ── Trading & Markets — scrolling market chart of isometric bars ─────────
    //   reveal (3 bars rise, staggered) → scroll (strip slides right→left through
    //   N waves, then the tail exits left leaving an empty canvas). A mask shows
    //   ~3 bars at a time with soft edge fade + a 90→100% "breathe" scale.
    //   Public state driven by a GSAP timeline in animations.js (.pn-product-scroll.trade).
    this.tradeState        = { reveal: 0, scroll: 0 };
    this.TRD_BAR_WIDTH_REM = options.trdBarWidthRem !== undefined ? options.trdBarWidthRem : 1.4;
    this.TRD_STEP_X_REM    = options.trdStepXRem    !== undefined ? options.trdStepXRem    : 2.1;
    this.TRD_STEP_Y_REM    = options.trdStepYRem    !== undefined ? options.trdStepYRem    : 1.05;
    this.TRD_VISIBLE       = options.trdVisible     !== undefined ? options.trdVisible     : 3;
    this.TRD_SCROLL_START  = options.trdScrollStart !== undefined ? options.trdScrollStart : 1;
    this.TRD_CHART_BARS    = options.trdChartBars   !== undefined ? options.trdChartBars   : 18;
    this.TRD_SCROLL_BARS   = options.trdScrollBars  !== undefined ? options.trdScrollBars  : 21;
    this.TRD_REVEAL_OVL    = options.trdRevealOvl   !== undefined ? options.trdRevealOvl   : 0.45;
    this.TRD_FADE_BARS     = options.trdFadeBars    !== undefined ? options.trdFadeBars    : 0.9;
    this.TRD_EDGE_SCALE    = options.trdEdgeScale   !== undefined ? options.trdEdgeScale   : 0.8;
    this.TRD_MIN_H_REM     = options.trdMinHRem     !== undefined ? options.trdMinHRem     : 1.6;
    this.TRD_MAX_H_REM     = options.trdMaxHRem     !== undefined ? options.trdMaxHRem     : 4.2;
    this.TRD_WAVE_CYCLES   = options.trdWaveCycles  !== undefined ? options.trdWaveCycles  : 4;
    this.TRD_WAVE_LEN      = options.trdWaveLen     !== undefined ? options.trdWaveLen     : 24;
    this.TRD_SHADE_TOP     = options.trdShadeTop    !== undefined ? options.trdShadeTop    : 0.55;
    this.TRD_SHADE_LEFT    = options.trdShadeLeft   !== undefined ? options.trdShadeLeft   : 0.35;
    this.TRD_SHADE_RIGHT   = options.trdShadeRight  !== undefined ? options.trdShadeRight  : 1.0;
    this.TRD_LIGHT_SIZE    = options.trdLightSize   !== undefined ? options.trdLightSize   : 0.7;
    this.TRD_OFFSET_X_REM  = options.trdOffsetXRem  !== undefined ? options.trdOffsetXRem  : 0;   // shift right
    this.TRD_OFFSET_Y_REM  = options.trdOffsetYRem  !== undefined ? options.trdOffsetYRem  : 0;   // shift down
    this.tradeActive       = false;
    // Build the market wave (smooth single sine, one peak/trough per cycle).
    this._trdWave = (() => {
      const n = this.TRD_WAVE_LEN, arr = new Array(n);
      const per = n / this.TRD_WAVE_CYCLES;
      const phase = Math.PI/2 - Math.floor(per/2) * (2*Math.PI/per);
      for (let i=0;i<n;i++){
        const t = i / n * Math.PI * 2 * this.TRD_WAVE_CYCLES + phase;
        const norm = (Math.sin(t) + 1) / 2;
        arr[i] = this.TRD_MIN_H_REM + norm * (this.TRD_MAX_H_REM - this.TRD_MIN_H_REM);
      }
      return arr;
    })();

    // ── Treasury Management — segmented ring (reveal → flip-wave + spin → exit) ──
    //   A thick ring split into N arc slices with gaps. Reveal: slices scale up
    //   staggered anti-clockwise from the left-middle. Middle: a flip wave rolls
    //   each slice a full turn about its tangent axis (staggered) WHILE the whole
    //   ring spins. Exit: slices scale down staggered. Orthographic, tilted +
    //   rolled. State driven by a GSAP timeline in animations.js (.treasury).
    this.treasuryState     = { reveal: 0, spin: 0, flip: 0, exit: 0 };
    this.TRE_DISK_REM      = options.treDiskRem    !== undefined ? options.treDiskRem    : 9;
    this.TRE_HOLE_REM      = options.treHoleRem    !== undefined ? options.treHoleRem    : 5;
    this.TRE_THICK_REM     = options.treThickRem   !== undefined ? options.treThickRem   : 1.2;
    this.TRE_TILT_DEG      = options.treTiltDeg    !== undefined ? options.treTiltDeg    : 30;
    this.TRE_YAW_DEG       = options.treYawDeg     !== undefined ? options.treYawDeg     : 0;
    this.TRE_ROLL_DEG      = options.treRollDeg    !== undefined ? options.treRollDeg    : -20;
    this.TRE_SEGMENTS      = options.treSegments   !== undefined ? options.treSegments   : 10;
    this.TRE_GAP_DEG       = options.treGapDeg     !== undefined ? options.treGapDeg     : 6;
    this.TRE_NSEG          = options.treNseg       !== undefined ? options.treNseg       : 96;
    this.TRE_SPIN_TURNS    = options.treSpinTurns  !== undefined ? options.treSpinTurns  : 0.5;
    this.TRE_STAGGER_OVL   = options.treStaggerOvl !== undefined ? options.treStaggerOvl : 0.5;
    this.TRE_FLIP_OVL      = options.treFlipOvl    !== undefined ? options.treFlipOvl    : 0.6;
    this.TRE_FLIP_MAX      = options.treFlipMax    !== undefined ? options.treFlipMax    : 360;
    this.TRE_SHADE_TOP     = options.treShadeTop   !== undefined ? options.treShadeTop   : 0.28;
    this.TRE_SHADE_RIM     = options.treShadeRim   !== undefined ? options.treShadeRim   : 1.0;
    this.TRE_SHADE_INNER   = options.treShadeInner !== undefined ? options.treShadeInner : 0.85;
    this.TRE_SHADE_END     = options.treShadeEnd   !== undefined ? options.treShadeEnd   : 0.7;
    this.TRE_SHADE_BOTTOM  = options.treShadeBottom!== undefined ? options.treShadeBottom: 0.4;
    this.TRE_LIGHT_SIZE    = options.treLightSize  !== undefined ? options.treLightSize  : 0.7;
    this.TRE_OFFSET_X_REM  = options.treOffsetXRem !== undefined ? options.treOffsetXRem : 0;
    this.TRE_OFFSET_Y_REM  = options.treOffsetYRem !== undefined ? options.treOffsetYRem : 0;
    this.treasuryActive    = false;

    // ── Programmable Infrastructure — 3D node network (reveal → rotate → exit) ──
    //   A hexagonal graph: centre hub + 6 ring nodes at alternating heights,
    //   connected by thin 3D strut-beams. Reveal: nodes scale in (staggered) then
    //   struts grow. Middle: the whole network rotates. Exit: struts retract,
    //   nodes scale out. Iso 3-face view. State driven by animations.js (.infra).
    this.infraState        = { reveal: 0, strut: 0, rot: 0, exit: 0 };
    this.INF_NODE_REM      = options.infNodeRem    !== undefined ? options.infNodeRem    : 0.9;
    this.INF_STRUT_REM     = options.infStrutRem   !== undefined ? options.infStrutRem   : 0.09;
    this.INF_LAYOUT_REM    = options.infLayoutRem  !== undefined ? options.infLayoutRem  : 3.2;
    this.INF_BASE_YAW_DEG  = options.infBaseYawDeg !== undefined ? options.infBaseYawDeg : 45;
    this.INF_TILT_DEG      = options.infTiltDeg    !== undefined ? options.infTiltDeg    : 35;
    this.INF_SPIN_TURNS    = options.infSpinTurns  !== undefined ? options.infSpinTurns  : 1;
    this.INF_REVEAL_OVL    = options.infRevealOvl  !== undefined ? options.infRevealOvl  : 0.55;
    this.INF_EXIT_OVL      = options.infExitOvl    !== undefined ? options.infExitOvl    : 0.55;
    this.INF_SHADE_TOP     = options.infShadeTop   !== undefined ? options.infShadeTop   : 0.55;
    this.INF_SHADE_LEFT    = options.infShadeLeft  !== undefined ? options.infShadeLeft  : 0.35;
    this.INF_SHADE_RIGHT   = options.infShadeRight !== undefined ? options.infShadeRight : 1.0;
    this.INF_STRUT_SHADE   = options.infStrutShade !== undefined ? options.infStrutShade : 0.5;
    this.INF_LIGHT_SIZE    = options.infLightSize  !== undefined ? options.infLightSize  : 0.7;
    this.INF_OFFSET_X_REM  = options.infOffsetXRem !== undefined ? options.infOffsetXRem : 0;
    this.INF_OFFSET_Y_REM  = options.infOffsetYRem !== undefined ? options.infOffsetYRem : 0;
    this.infraActive       = false;
    // Hex node layout: centre hub + 6 pointy-top ring nodes at alternating heights.
    this._infNodes = (() => {
      const pts = [[0,0,0]];
      const ringN = 6, Rr = 1.0;
      for (let i=0;i<ringN;i++){
        const a = i/ringN*Math.PI*2 + Math.PI/6;
        const y = (i%2===0 ? 0.45 : -0.45);
        pts.push([Math.cos(a)*Rr, y, Math.sin(a)*Rr]);
      }
      return pts;
    })();
    // Edges: hub spokes + hex ring loop.
    this._infEdges = (() => {
      const e = [];
      for (let i=1;i<=6;i++) e.push([0, i]);
      for (let i=1;i<=6;i++) e.push([i, i%6 + 1]);
      return e;
    })();

    // ── Trust & Operations — isometric cube field (reveal staggered from centre)
    //   A hexagonal field of true-iso cubes packed corner-to-corner (diamond gaps
    //   show). Reveal scales each cube up in place, staggered by distance from the
    //   centre cube → ripples outward. State in this.trustState, driven by a
    //   scrubbed ScrollTrigger in animations.js (.pn-trust-graphic-scroll).
    this.trustState        = { reveal: 0 };
    this.TRU_CUBE_REM      = options.truCubeRem    !== undefined ? options.truCubeRem    : 1.6;  // cube edge
    this.TRU_SCALE         = options.truScale      !== undefined ? options.truScale      : 1.0;  // master scale of whole field
    this.TRU_HEIGHT_FRAC   = options.truHeightFrac !== undefined ? options.truHeightFrac : 1.0;  // pillar height / edge
    this.TRU_RINGS         = options.truRings      !== undefined ? options.truRings      : 3;    // hex rings out
    this.TRU_REVEAL_OVL    = options.truRevealOvl  !== undefined ? options.truRevealOvl  : 0.6;  // ring-to-ring overlap
    this.TRU_EASE_POW      = options.truEasePow    !== undefined ? options.truEasePow    : 3;    // per-cube ease-out power (1 linear, higher = snappier)
    this.TRU_SHADE_TOP     = options.truShadeTop   !== undefined ? options.truShadeTop   : 0.62;
    this.TRU_SHADE_LEFT    = options.truShadeLeft  !== undefined ? options.truShadeLeft  : 0.42;
    this.TRU_SHADE_RIGHT   = options.truShadeRight !== undefined ? options.truShadeRight : 0.20;
    this.TRU_LIGHT_SIZE    = options.truLightSize  !== undefined ? options.truLightSize  : 0.7;
    // Position as a fraction of canvas size from centre. Negative = left / up.
    //   truOffsetX: -0.3 → 30% of canvas width to the LEFT
    //   truOffsetY: -0.3 → 30% of canvas height UP
    this.TRU_OFFSET_X      = options.truOffsetX    !== undefined ? options.truOffsetX    : 0;
    this.TRU_OFFSET_Y      = options.truOffsetY    !== undefined ? options.truOffsetY    : 0;
    this.trustActive       = false;
    // Corner-touch lattice cells (axial hex envelope), with distance for stagger.
    this._truCells = (() => {
      const cells = [];
      const R = this.TRU_RINGS;
      for (let i=-R;i<=R;i++) for (let j=-R;j<=R;j++) {
        if (Math.abs(i + j) > R) continue;       // hex envelope
        cells.push({ i, j });
      }
      return cells;
    })();

    // Disintegration tuning (radial dissolve, grid-quantized hop + fade)
    //   Cells dissolve in order of radial distance from globe centre, then
    //   hop OUTWARD cell-by-cell in whole STEP increments (always on-grid).
    //   DISSOLVE_DIR:  'out' = edges go first, 'in' = centre goes first
    //   DISSOLVE_JITTER: 0 = clean ring front, higher = more ragged edge
    //   DISSOLVE_BAND: width of the active dissolving front (0–1)
    //   HOP_MAX: max grid cells a pixel travels before vanishing
    this.DISSOLVE_DIR    = options.dissolveDir    || 'out';
    this.DISSOLVE_JITTER = options.dissolveJitter !== undefined ? options.dissolveJitter : 0.18;
    this.DISSOLVE_BAND   = options.dissolveBand   !== undefined ? options.dissolveBand   : 0.25;
    this.HOP_MAX         = options.hopMax !== undefined ? options.hopMax : 4;

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
      if (this.MODE === 'globe') this._initGlobe();
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
    this._cellHopJit = [];
    for (let col = 0; col < this.COLS; col++) {
      this.colXCache.push(col * this.STEP);
      this.energy.push(new Float32Array(this.ROWS).fill(0));
      this.fgActive.push(new Float32Array(this.ROWS).fill(0));
      // Per-cell deterministic jitter (0–1) — ragged dissolve front
      const jit = new Float32Array(this.ROWS);
      const hop = new Float32Array(this.ROWS);   // 0–1, randomizes hop count/dir
      for (let r = 0; r < this.ROWS; r++) {
        const h = Math.sin(col * 12.9898 + r * 78.233) * 43758.5453;
        jit[r] = h - Math.floor(h);
        const h2 = Math.sin(col * 39.346 + r * 11.135) * 24634.6345;
        hop[r] = h2 - Math.floor(h2);
      }
      this._cellJitter.push(jit);
      this._cellHopJit.push(hop);
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
    this.TRAIL_GREEN        = this._greenRgb();   // re-read --pavegreen
    this.GLOBE_MARKER_COLOR = this._greenRgb();
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

  // Normalize any CSS colour string to an "r,g,b" triple. Accepts hex (#77DD84),
  // rgb()/rgba(), or a computed value. Used so green can come from a CSS var.
  _colorToRgb(str) {
    if (!str) return null;
    str = str.trim();
    if (str.startsWith('#')) return this._hexToRgb(str);
    const m = str.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(',').map(s => parseFloat(s));
      return `${Math.round(p[0])},${Math.round(p[1])},${Math.round(p[2])}`;
    }
    return null;
  }

  // Resolve the accent green as "r,g,b". Prefers the --pavegreen CSS variable so
  // the whole system tracks the brand token; falls back to the provided colour.
  _greenRgb(fallback) {
    const fromVar = this._colorToRgb(this._readVar('--pavegreen'));
    return fromVar || this._hexToRgb(fallback || '#77DD84');
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

  // Eased foreground render with optional grid-quantized hop dissolve (B+C).
  // disint 0 = intact; 1 = fully dissolved. As the radial front (ordered by
  // distance from globe centre) reaches a cell, the pixel hops OUTWARD in whole
  // STEP increments — landing on a real grid node every frame — and fades as it
  // travels, vanishing after HOP_MAX cells. Scrub-driven and reversible.
  _drawFgEased(disint = 0) {
    const { COLS, ROWS, FG_MIN, FG_MAX, STEP } = this;
    const doDissolve = disint > 0.0001;

    const gcx = this._globeCX || this.W / 2;
    const gcy = this._globeCY || this.H / 2;
    const gr  = this._globeR  || Math.min(this.W, this.H) * 0.5;
    const invR = 1 / (gr * 1.05);
    const dirOut = this.DISSOLVE_DIR !== 'in';
    const band   = Math.max(0.02, this.DISSOLVE_BAND);
    const jitAmt = this.DISSOLVE_JITTER;
    const hopMax = this.HOP_MAX;
    const front  = disint * (1 + band + jitAmt);

    this.ctx.fillStyle = `rgba(${this.LINE_COLOR},1)`;

    for (let col = 0; col < COLS; col++) {
      const cellX     = this.colXCache[col];
      const targetCol = this._fgTarget[col];
      const activeCol = this.fgActive[col];
      const jitCol    = this._cellJitter[col];
      const hopCol    = this._cellHopJit[col];
      const cxCell    = cellX + STEP / 2;
      for (let row = 0; row < ROWS; row++) {
        const target = targetCol[row];
        const cur    = activeCol[row];
        const next   = cur + (target - cur) * this.FG_EASE;
        activeCol[row] = next;
        if (next <= 0.001) continue;

        const baseSz = FG_MIN + next * (FG_MAX - FG_MIN);

        if (!doDissolve) {
          this.ctx.fillStyle = `rgba(${this.LINE_COLOR},1)`;
          this._drawPixelCentered(cellX, this.rowYCache[row], baseSz);
          continue;
        }

        // Radial position of source cell
        const cyCell = this.rowYCache[row] + STEP / 2;
        const ndx = (cxCell - gcx) * invR, ndy = (cyCell - gcy) * invR;
        let nd = Math.sqrt(ndx*ndx + ndy*ndy);
        let rnd = dirOut ? 1 - nd : nd;
        const thresh = rnd + (jitCol[row] - 0.5) * jitAmt;

        // local 0→1 = how far this cell is into its own dissolve
        const local = (front - band - thresh) / band;   // <0 not started, >1 done-ish
        if (local <= 0) {
          // not yet dissolving — render in place, full
          this.ctx.fillStyle = `rgba(${this.LINE_COLOR},1)`;
          this._drawPixelCentered(cellX, this.rowYCache[row], baseSz);
          continue;
        }

        // Hop count grows with local progress, quantized to whole cells
        const lp = Math.min(1, local);
        const cellMaxHops = 1 + Math.floor(hopCol[row] * hopMax);   // 1..hopMax+1
        const hops = Math.floor(lp * cellMaxHops + 0.0001);
        const fade = 1 - lp;                                        // fade as it travels
        if (fade <= 0.01) continue;                                 // fully gone

        // Outward grid direction (unit-ish radial → quantized to a grid step)
        let ux = cxCell - gcx, uy = cyCell - gcy;
        const ul = Math.hypot(ux, uy) || 1;
        ux /= ul; uy /= ul;
        // Diagonal vs orthogonal: snap each axis to -1/0/1 by magnitude
        const ax = Math.abs(ux), ay = Math.abs(uy);
        let dcol = 0, drow = 0;
        if (ax > 0.38) dcol = ux > 0 ? 1 : -1;
        if (ay > 0.38) drow = uy > 0 ? 1 : -1;
        if (dcol === 0 && drow === 0) { dcol = ux >= 0 ? 1 : -1; }

        const hCol = col + dcol * hops;
        const hRow = row + drow * hops;
        if (hCol < 0 || hCol >= COLS || hRow < 0 || hRow >= ROWS) continue;

        const sz = baseSz * (0.6 + fade * 0.4);   // slight shrink while fading
        if (sz <= 0.001) continue;
        this.ctx.fillStyle = `rgba(${this.LINE_COLOR},${fade})`;
        this._drawPixelCentered(this.colXCache[hCol], this.rowYCache[hRow], sz);
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
    const GLOBE_R_END  = rem * this.GLOBE_END_R_REM;   // ← tweak scale-down here
    const GLOBE_R_FULL_LERPED = GLOBE_R_FULL + (GLOBE_R_END - GLOBE_R_FULL) * progress;

    const GLOBE_R = GLOBE_R_FULL_LERPED * this.globeRevealScale;
    if (GLOBE_R < 0.5) return null;

    const GLOBE_CX = W / 2;
    const GLOBE_CY_START = H + GLOBE_R_FULL * 0.08;
    // End position: canvas centre + GLOBE_END_VH worth of viewport height.
    //   GLOBE_END_VH = -1  → moves up 100vh   |   0 → stays centred
    const GLOBE_CY_END   = H / 2 + rem * 1.2 + this.GLOBE_END_VH * H;   // ← tweak vertical end here
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

    // Clip to the sphere silhouette. The rim-walk fill below pushes limb-crossing
    // boundary points out to GLOBE_R (which shows as spikes just outside the
    // globe); the visible limb sits at the perspective-scaled radius, so clipping
    // here hides those spikes while keeping every bit of real coastline. The
    // rim-walk itself removes the interior "slice" chord.
    const limbR = GLOBE_R * FOCAL / (FOCAL + 300);
    fCtx.save();
    fCtx.beginPath();
    fCtx.arc(GLOBE_CX, GLOBE_CY, limbR, 0, Math.PI*2);
    fCtx.clip();

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
      // Rim-walk: at each visible↔hidden transition push the boundary point out to
      // the sphere edge and bridge hidden arcs along the rim. This removes the
      // interior chord ("slice") that a plain pen-lift + fill would draw across a
      // country straddling the limb. Spikes it creates outside the globe are
      // hidden by the clip above.
      const edge = (p) => {
        const ex = p.sx - GLOBE_CX, ey = p.sy - GLOBE_CY;
        const len = Math.hypot(ex, ey) || 1;
        return { sx: GLOBE_CX + ex/len*GLOBE_R, sy: GLOBE_CY + ey/len*GLOBE_R };
      };
      fCtx.beginPath();
      let started = false;
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const cur = pts[i], prev = pts[(i - 1 + n) % n];
        if (!cur.behind) {
          if (!started) {
            if (prev.behind) { const e = edge(cur); fCtx.moveTo(e.sx, e.sy); fCtx.lineTo(cur.sx, cur.sy); }
            else fCtx.moveTo(cur.sx, cur.sy);
            started = true;
          } else {
            fCtx.lineTo(cur.sx, cur.sy);
          }
        } else if (started && !prev.behind) {
          const e = edge(prev);
          fCtx.lineTo(e.sx, e.sy);
        }
      }
      fCtx.closePath();
      fCtx.fill();
    });

    fCtx.restore();   // release the silhouette clip
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
    const SPREAD = 3;
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
      // High floor so the spot never fades to invisibility — a gentle pulse
      // (0.75 → 1.0) instead of the old 0.2 → 1.0 that dropped it to near-nothing.
      const alpha = (0.75 + blink * 0.25) * markerFade;
      const col0  = Math.round((sx - half) / STEP);
      const row0  = Math.round((sy - half) / STEP);
      for (let dc = -SPREAD; dc <= SPREAD; dc++) {
        for (let dr = -SPREAD; dr <= SPREAD; dr++) {
          const col = col0 + dc, row = row0 + dr;
          if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue;
          const d = Math.sqrt(dc*dc + dr*dr);
          if (d > SPREAD + 0.3) continue;
          const falloff = Math.max(0, 1 - d / (SPREAD + 0.3));
          // Size holds near full (0.85 → 1.0 with the pulse) so dots stay big.
          const sz = this.FG_MIN + falloff * (this.FG_MAX - this.FG_MIN) * (0.85 + blink * 0.15);
          ctx.fillStyle = `rgba(${green},${alpha * (0.55 + falloff * 0.45)})`;
          this._drawPixelCentered(this.colXCache[col], this.rowYCache[row], sz);
        }
      }
    });
  }

  // =========================================================================
  // FOREGROUND: BANK ACCOUNTS — 3D extruded currency sequence ($ → € → ¥)
  // Real extrude + project, faces solid / walls smaller+lighter (depth).
  // Driven by a GSAP timeline scrubbed via this.bankProgress (0→1):
  //   reveal $ → hold → flip $→€ → hold → flip €→¥ → hold → dissolve out.
  // The flip rotates the glyph to a thin slab at 90° where the symbol swaps.
  // =========================================================================

  _buildCurMask(symbol) {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${size*0.72}px Georgia,"Times New Roman",serif`;
    g.fillText(symbol, size/2, size/2 + size*0.02);
    const d = g.getImageData(0,0,size,size).data;
    const a = new Uint8Array(size*size);
    for (let i=0;i<size*size;i++) a[i] = d[i*4+3];
    return { size, a };
  }
  _curMaskAlpha(mask, u, v) {
    if (u<0||u>1||v<0||v>1) return 0;
    const x = Math.min(mask.size-1,(u*mask.size)|0);
    const y = Math.min(mask.size-1,(v*mask.size)|0);
    return mask.a[y*mask.size+x]/255;
  }
  _curRotNY(nx, nz, cosA, sinA) { return [ nx*cosA + nz*sinA, -nx*sinA + nz*cosA ]; }

  // Symbols the currency sequence cycles through (animations.js references these).
  static get CURRENCIES() { return ['$', '\u20AC', '\u00A5']; }

  // Render the lit extruded glyph (grey faces/walls) into the offscreen buffer.
  _renderCurrency3D(angle, symbol, scale) {
    const { W, H, DPR } = this;
    const fCtx = this.fCtx;
    fCtx.setTransform(1,0,0,1,0,0);
    fCtx.clearRect(0,0,W*DPR,H*DPR);
    if (scale <= 0.001) return;
    fCtx.save();
    fCtx.scale(DPR,DPR);

    const gh = Math.min(W,H) * this.CUR_GLYPH_FRAC * scale;
    const gw = gh, halfW = gw/2, halfH = gh/2;
    const depth = gh * this.CUR_DEPTH;
    const cx = W/2, cy = H/2 + this._rem * 1.2;
    const focal = gh * this.CUR_FOCAL;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const dot = Math.max(1.1, this.STEP*0.6);
    const mask = this._curMasks[symbol];

    const project = (lx,ly,lz) => {
      const xr =  lx*cosA + lz*sinA;
      const zr = -lx*sinA + lz*cosA;
      const s  = focal/(focal+zr);
      return { x: cx+xr*s, y: cy+ly*s, s };
    };
    const splat = (x,y,r,sh) => {
      const val = Math.max(0,Math.min(255,Math.round(sh*255)));
      fCtx.fillStyle = `rgb(${val},${val},${val})`;
      fCtx.fillRect(x-r/2, y-r/2, r, r);
    };

    const FACE_STEP = 1/200, WALL_VSTEP = 1/180, WALL_ZSTEP = 1/22, EDGE_SCAN = 1/300;

    // Faces — only the viewer-facing one
    const faces = [ { z:-depth/2, nz:-1 }, { z:+depth/2, nz:1 } ];
    for (const f of faces) {
      const n = this._curRotNY(0, f.nz, cosA, sinA);
      if (n[1] <= 0) continue;
      for (let v=0; v<=1; v+=FACE_STEP) {
        const ly = -halfH + v*gh;
        for (let u=0; u<=1; u+=FACE_STEP) {
          if (this._curMaskAlpha(mask,u,v) < 0.5) continue;
          const lx = -halfW + u*gw;
          const p = project(lx,ly,f.z);
          splat(p.x,p.y, dot*p.s, this.CUR_FACE_SHADE);
        }
      }
    }
    // Side walls — viewer-facing silhouette edges swept across depth
    for (let v=0; v<=1; v+=WALL_VSTEP) {
      const ly = -halfH + v*gh;
      let prev = 0;
      for (let u=0; u<=1; u+=EDGE_SCAN) {
        const cur = this._curMaskAlpha(mask,u,v) >= 0.5 ? 1 : 0;
        if (cur !== prev) {
          const lx = -halfW + u*gw;
          const dir = cur>prev ? -1 : 1;
          const n = this._curRotNY(dir, 0, cosA, sinA);
          if (n[1] > 0) {
            for (let z=-0.5; z<=0.5; z+=WALL_ZSTEP) {
              const p = project(lx, ly, z*depth);
              splat(p.x,p.y, dot*p.s, this.CUR_WALL_SHADE);
            }
          }
          prev = cur;
        }
      }
    }
    fCtx.restore();
  }

  // Render currency cells directly: face = solid line colour at full size;
  // wall = smaller & lighter. With grid-quantized hop dissolve on exit.
  _drawCurrency3D() {
    const st = this._curState;
    this._renderCurrency3D(st.flipAngle, st.symbol, st.scale);

    const { W, H, DPR, COLS, ROWS, STEP } = this;
    const data = this.fCtx.getImageData(0, 0, W*DPR, H*DPR).data;
    const stride = Math.round(W * DPR);
    const half = STEP / 2;
    const [lr, lg, lb] = this.LINE_COLOR.split(',').map(Number);
    const dissolve = st.dissolve;

    // dissolve front (grid-quantized radial hop), centred on currency centre.
    // gr is scaled to the GLYPH radius (not the canvas) so the glyph's own cells
    // span the full nd 0→1 range — edge cells (nd≈1, rnd≈0) dissolve first, centre
    // cells (nd≈0, rnd≈1) last. Using half-canvas here left every glyph cell at
    // rnd≈1, so the front spent the first ~half of its travel crossing empty space
    // before reaching any pixel (the dead zone).
    const gcx = W/2, gcy = H/2 + this._rem*1.2;
    const gr  = Math.min(W,H) * this.CUR_GLYPH_FRAC * 0.6;   // ~glyph radius
    const band = this.CUR_DIS_BAND, jitAmt = this.CUR_DIS_JITTER, hopMax = this.CUR_HOP_MAX;
    // Front travels from `band` (first cell triggers immediately, no dead zone)
    // up to the value that clears the highest-threshold centre cell at dissolve=1.
    const frontStart = band;
    const frontEnd   = 1 + jitAmt*0.5 + band*2 + 0.05;
    const front = frontStart + (frontEnd - frontStart) * dissolve;

    for (let c = 0; c < COLS; c++) {
      const sx = this.colXCache[c] + half;
      const px = Math.min(W*DPR-1, Math.max(0,(sx*DPR)|0));
      const jitCol = this._cellJitter[c];
      const hopCol = this._cellHopJit[c];
      for (let r = 0; r < ROWS; r++) {
        const sy = this.rowYCache[r] + half;
        const py = Math.min(H*DPR-1, Math.max(0,(sy*DPR)|0));
        const idx = (py*stride+px)*4;
        if (data[idx+3]/255 <= this.THRESHOLD) continue;
        const shade = data[idx]/255;             // ~1 face, ~0.5 wall
        const isFace = shade >= 0.75;
        const baseSz = this.FG_MAX * (isFace ? 1 : this.CUR_WALL_SIZE);

        if (dissolve <= 0.0001) {
          this.ctx.fillStyle = `rgba(${lr},${lg},${lb},${shade})`;
          this.ctx.fillRect(this.colXCache[c]+half-baseSz/2, this.rowYCache[r]+half-baseSz/2, baseSz, baseSz);
          continue;
        }
        // grid-quantized radial hop dissolve
        const ndx = (sx - gcx)/gr, ndy = (sy - gcy)/gr;
        const nd = Math.sqrt(ndx*ndx + ndy*ndy);
        const rnd = 1 - nd;
        const thresh = rnd + (jitCol[r] - 0.5) * jitAmt;
        const local = (front - band - thresh) / band;
        if (local <= 0) {
          this.ctx.fillStyle = `rgba(${lr},${lg},${lb},${shade})`;
          this.ctx.fillRect(this.colXCache[c]+half-baseSz/2, this.rowYCache[r]+half-baseSz/2, baseSz, baseSz);
          continue;
        }
        const lp = Math.min(1, local);
        const cellMaxHops = 1 + Math.floor(hopCol[r] * hopMax);
        const hops = Math.floor(lp * cellMaxHops + 0.0001);
        const fade = 1 - lp;
        if (fade <= 0.01) continue;
        let ux = sx - gcx, uy = sy - gcy;
        const ul = Math.hypot(ux, uy) || 1; ux/=ul; uy/=ul;
        const axv = Math.abs(ux), ayv = Math.abs(uy);
        let dcol = 0, drow = 0;
        if (axv > 0.38) dcol = ux > 0 ? 1 : -1;
        if (ayv > 0.38) drow = uy > 0 ? 1 : -1;
        if (dcol === 0 && drow === 0) dcol = ux >= 0 ? 1 : -1;
        const hCol = c + dcol*hops, hRow = r + drow*hops;
        if (hCol < 0 || hCol >= COLS || hRow < 0 || hRow >= ROWS) continue;
        const sz = baseSz * (0.6 + fade*0.4);
        if (sz <= 0.01) continue;
        this.ctx.fillStyle = `rgba(${lr},${lg},${lb},${shade*fade})`;
        this.ctx.fillRect(this.colXCache[hCol]+half-sz/2, this.rowYCache[hRow]+half-sz/2, sz, sz);
      }
    }
  }

  _drawBankAccounts() {
    if (this.curState.scale <= 0.001) return;
    if (!this._curMasks) {
      this._curMasks = {
        '$':      this._buildCurMask('$'),
        '\u20AC': this._buildCurMask('\u20AC'),
        '\u00A5': this._buildCurMask('\u00A5'),
      };
    }
    // State (scale / flipAngle / symbol / dissolve) is driven by the GSAP
    // timeline in animations.js. We just render whatever it currently holds.
    this._drawCurrency3D();
  }

  // =========================================================================
  // FOREGROUND: DIGITAL ASSET MANAGEMENT — isometric cube
  //   6 mini cubes reveal (clockwise) → fly to centre & merge (centre cube
  //   accumulates) → spin ×2 → grid-quantized hop dissolve. State lives in
  //   this.damState, driven by a GSAP timeline in animations.js.
  // =========================================================================

  _damRotY(p, c, s) { return [ p[0]*c + p[2]*s, p[1], -p[0]*s + p[2]*c ]; }

  _damProject(p, cx, cy, scale) {
    const ct = Math.cos(ISO_A), st = Math.sin(ISO_A);
    const y2 = p[1]*ct + p[2]*st;     // screen y (down positive)
    const z2 = -p[1]*st + p[2]*ct;    // toward viewer
    return { x: cx + p[0]*scale, y: cy + y2*scale, z: z2 };
  }

  // Stagger helper: global progress p → this item's local 0→1 (clockwise order).
  _damStagger(p, i, n, overlap) {
    const span  = 1 / (n - (n-1)*overlap);
    const start = i * span * (1 - overlap);
    return Math.max(0, Math.min(1, (p - start) / span));
  }

  // Draw one shaded cube into the offscreen buffer (fCtx). Faces classified by
  // rotated normal so top/left/right tones stay correct through the spin.
  _damDrawCube(cxp, cyp, rot, scale) {
    const fCtx = this.fCtx;
    const ry = rot + ISO_BASE_Y;
    const c = Math.cos(ry), s = Math.sin(ry);
    const u = 1;
    const C = [
      [-u,-u,-u],[ u,-u,-u],[ u,-u, u],[-u,-u, u],
      [-u, u,-u],[ u, u,-u],[ u, u, u],[-u, u, u],
    ].map(p => this._damProject(this._damRotY(p, c, s), cxp, cyp, scale));

    const faces = [
      { idx:[0,1,2,3], n:[0,-1,0] },
      { idx:[4,7,6,5], n:[0, 1,0] },
      { idx:[0,3,7,4], n:[-1,0,0] },
      { idx:[1,5,6,2], n:[ 1,0,0] },
      { idx:[3,2,6,7], n:[0,0, 1] },
      { idx:[0,4,5,1], n:[0,0,-1] },
    ];
    const ct = Math.cos(ISO_A), st = Math.sin(ISO_A);
    faces.forEach(f => {
      const rn = this._damRotY(f.n, c, s);
      const screenY = rn[1]*ct + rn[2]*st;   // up-facing = negative
      const vz      = -rn[1]*st + rn[2]*ct;  // toward viewer
      const nx      = rn[0];
      f.vz = vz;
      if (screenY < -0.5) f.shade = this.DAM_SHADE_TOP;
      else if (nx > 0)    f.shade = this.DAM_SHADE_RIGHT;
      else                f.shade = this.DAM_SHADE_LEFT;
    });
    faces.sort((a,b) => a.vz - b.vz);

    faces.forEach(f => {
      if (f.vz <= 0.001) return;
      const v = Math.max(0, Math.min(255, Math.round(f.shade*255)));
      fCtx.fillStyle = `rgb(${v},${v},${v})`;
      fCtx.beginPath();
      const q = f.idx.map(i => C[i]);
      fCtx.moveTo(q[0].x, q[0].y);
      for (let i=1;i<q.length;i++) fCtx.lineTo(q[i].x, q[i].y);
      fCtx.closePath();
      fCtx.fill();
    });
  }

  // Render the full cube scene (reveal + merge OR merged cube) to the buffer.
  _damRenderScene() {
    const { W, H, DPR } = this;
    const fCtx = this.fCtx;
    fCtx.setTransform(1,0,0,1,0,0);
    fCtx.clearRect(0,0,W*DPR,H*DPR);
    fCtx.save();
    fCtx.scale(DPR,DPR);

    const st = this.damState;
    const cx = W/2, cy = H/2 + this._rem*1.2;
    const bigHalf  = this._rem * this.DAM_CUBE_REM / ISO_SPAN;
    const miniHalf = this._rem * this.DAM_MINI_REM / ISO_SPAN;
    const SC = this.DAM_SCATTER;

    if (st.dissolve <= 0.0001 && st.merge < 0.999) {
      const n = SC.length;
      const span = 1 / (n - (n-1)*this.DAM_MERGE_OVL);
      const firstLanded = span;

      // Centre cube appears once the first mini lands, then grows mini→big.
      if (st.merge > firstLanded) {
        const g = (st.merge - firstLanded) / (1 - firstLanded);
        const centreScl = miniHalf + (bigHalf - miniHalf) * Math.max(0, Math.min(1, g));
        this._damDrawCube(cx, cy, st.rot, centreScl);
      }

      SC.forEach((slot, i) => {
        const revLocal = this._damStagger(st.reveal, i, n, this.DAM_REVEAL_OVL);
        const mLocal   = this._damStagger(st.merge,  i, n, this.DAM_MERGE_OVL);
        if (mLocal >= 0.999) return;                       // absorbed
        if (revLocal <= 0.001 && mLocal <= 0.001) return;
        const sx = cx + slot.dx * bigHalf * (1 - mLocal);
        const sy = cy + slot.dy * bigHalf * (1 - mLocal);
        const scl = miniHalf * revLocal;
        if (scl <= 0.001) return;
        this._damDrawCube(sx, sy, st.rot, scl);
      });
    } else {
      this._damDrawCube(cx, cy, st.rot, bigHalf);
    }
    fCtx.restore();
  }

  // Scan the buffer → pixel grid (face shade → dark-pixel size+opacity), with
  // the same grid-quantized hop dissolve used by the currency exit.
  _drawDigitalAsset() {
    this._damRenderScene();

    const { W, H, DPR, COLS, ROWS, STEP } = this;
    const data = this.fCtx.getImageData(0,0,W*DPR,H*DPR).data;
    const stride = Math.round(W * DPR);
    const half = STEP/2;
    const [lr, lg, lb] = this.LINE_COLOR.split(',').map(Number);
    const st = this.damState;
    const dissolve = st.dissolve;

    const gcx = W/2, gcy = H/2 + this._rem*1.2;
    const gr  = this._rem * this.DAM_CUBE_REM * 0.6;
    const band = this.DAM_DIS_BAND, jitAmt = this.DAM_DIS_JITTER, hopMax = this.DAM_HOP_MAX;
    const frontStart = band;
    const frontEnd   = 1 + jitAmt*0.5 + band*2 + 0.05;
    const front = frontStart + (frontEnd - frontStart) * dissolve;

    for (let c = 0; c < COLS; c++) {
      const sx = this.colXCache[c] + half;
      const px = Math.min(W*DPR-1, Math.max(0,(sx*DPR)|0));
      const jitCol = this._cellJitter[c];
      const hopCol = this._cellHopJit[c];
      for (let r = 0; r < ROWS; r++) {
        const sy = this.rowYCache[r] + half;
        const py = Math.min(H*DPR-1, Math.max(0,(sy*DPR)|0));
        const idx = (py*stride+px)*4;
        if (data[idx+3]/255 <= this.THRESHOLD) continue;
        const shade = data[idx]/255;
        const sizeFrac = this.DAM_LIGHT_SIZE + (1 - this.DAM_LIGHT_SIZE) * shade;
        const baseSz = this.FG_MAX * sizeFrac;

        if (dissolve <= 0.0001) {
          this.ctx.fillStyle = `rgba(${lr},${lg},${lb},${shade})`;
          this.ctx.fillRect(this.colXCache[c]+half-baseSz/2, this.rowYCache[r]+half-baseSz/2, baseSz, baseSz);
          continue;
        }
        const ndx = (sx-gcx)/gr, ndy = (sy-gcy)/gr;
        const nd = Math.sqrt(ndx*ndx + ndy*ndy);
        const rnd = 1 - nd;
        const thresh = rnd + (jitCol[r]-0.5)*jitAmt;
        const local = (front - band - thresh) / band;
        if (local <= 0) {
          this.ctx.fillStyle = `rgba(${lr},${lg},${lb},${shade})`;
          this.ctx.fillRect(this.colXCache[c]+half-baseSz/2, this.rowYCache[r]+half-baseSz/2, baseSz, baseSz);
          continue;
        }
        const lp = Math.min(1, local);
        const cellMaxHops = 1 + Math.floor(hopCol[r]*hopMax);
        const hops = Math.floor(lp*cellMaxHops + 0.0001);
        const fade = 1 - lp;
        if (fade <= 0.01) continue;
        let ux = sx-gcx, uy = sy-gcy;
        const ul = Math.hypot(ux,uy) || 1; ux/=ul; uy/=ul;
        const axv = Math.abs(ux), ayv = Math.abs(uy);
        let dcol=0, drow=0;
        if (axv > 0.38) dcol = ux>0?1:-1;
        if (ayv > 0.38) drow = uy>0?1:-1;
        if (dcol===0 && drow===0) dcol = ux>=0?1:-1;
        const hCol = c+dcol*hops, hRow = r+drow*hops;
        if (hCol<0||hCol>=COLS||hRow<0||hRow>=ROWS) continue;
        const sz = baseSz*(0.6+fade*0.4);
        if (sz <= 0.01) continue;
        this.ctx.fillStyle = `rgba(${lr},${lg},${lb},${shade*fade})`;
        this.ctx.fillRect(this.colXCache[hCol]+half-sz/2, this.rowYCache[hRow]+half-sz/2, sz, sz);
      }
    }
  }

  // =========================================================================
  // FOREGROUND: PAVENET — concentric extruded rings
  //   reveal (rings scale up, staggered) → spin Y 360° (staggered) → spin X
  //   360° (staggered) → grid-quantized hop dissolve. State in this.pnetState,
  //   driven by a GSAP timeline in animations.js.
  // =========================================================================

  // Rotate about Y (x,z) then about X (y,z). Returns rotated 3D coords.
  _pnetRotate3(p, ry, rx) {
    const cy = Math.cos(ry), sy = Math.sin(ry);
    let x =  p[0]*cy + p[2]*sy;
    let z = -p[0]*sy + p[2]*cy;
    let y =  p[1];
    const cx2 = Math.cos(rx), sx2 = Math.sin(rx);
    const y2 = y*cx2 - z*sx2;
    const z2 = y*sx2 + z*cx2;
    return [x, y2, z2];
  }
  _pnetProject(p, ry, rx, cx, cy, scale) {
    const r = this._pnetRotate3(p, ry, rx);
    return { x: cx + r[0]*scale, y: cy + r[1]*scale, z: r[2] };
  }
  _pnetFaceVisible(n, ry, rx) { return this._pnetRotate3(n, ry, rx)[2]; }

  // Per-ring stagger: global progress p → ring i local 0→1 (outer i=0 leads).
  _pnetStagger(p, i, n, overlap) {
    const span  = 1 / (n - (n-1)*overlap);
    const start = i * span * (1 - overlap);
    return Math.max(0, Math.min(1, (p - start) / span));
  }

  // Draw one annular ring (outer rO, inner rI) extruded along z, rotated by
  // ry (vertical) + rx (horizontal). scale = reveal scale. Solid-filled faces.
  _pnetDrawRing(rO, rI, ry, rx, scale, cx, cy) {
    const fc = this.fCtx;
    const halfT = this._rem * this.PNET_THICK_REM * 0.5;
    // NSEG must be a multiple of the polygon sides so vertices land on corners.
    const S0 = this.PNET_SIDES;
    const NSEG = S0 * Math.max(1, Math.round(this.PNET_NSEG / S0));
    const proj = (p) => this._pnetProject(p, ry, rx, cx, cy, scale);
    const vis  = (n) => this._pnetFaceVisible(n, ry, rx);

    // Polygon radius: for PNET_SIDES corners, returns the radius at angle `ang`
    // so the outline has straight edges between corners (apothem formula). A high
    // side count → effectively a circle; 6 → hexagon.
    const S = this.PNET_SIDES;
    const seg = Math.PI*2 / S;
    const apo = Math.cos(seg/2);
    const polyR = (rad, ang) => {
      // distance from corner-aligned angle; corners at multiples of seg + offset
      const a = ((ang - this.PNET_SIDE_OFFSET) % seg + seg) % seg;
      return rad * apo / Math.cos(a - seg/2);
    };

    const drawCap = (sign, shade) => {
      const v = Math.max(0, Math.min(255, Math.round(shade*255)));
      fc.fillStyle = `rgb(${v},${v},${v})`;
      fc.beginPath();
      for (let a=0; a<=NSEG; a++) {
        const ang = (a/NSEG)*Math.PI*2;
        const rr = polyR(rO, ang);
        const p = proj([Math.cos(ang)*rr, Math.sin(ang)*rr, sign*halfT]);
        if (a===0) fc.moveTo(p.x, p.y); else fc.lineTo(p.x, p.y);
      }
      for (let a=NSEG; a>=0; a--) {
        const ang = (a/NSEG)*Math.PI*2;
        const rr = polyR(rI, ang);
        const p = proj([Math.cos(ang)*rr, Math.sin(ang)*rr, sign*halfT]);
        fc.lineTo(p.x, p.y);
      }
      fc.closePath();
      fc.fill('evenodd');
    };

    const drawWall = (rad, nrmSign, shade) => {
      const v = Math.max(0, Math.min(255, Math.round(shade*255)));
      fc.fillStyle = `rgb(${v},${v},${v})`;
      for (let a=0; a<NSEG; a++) {
        const a0 = (a/NSEG)*Math.PI*2, a1 = ((a+1)/NSEG)*Math.PI*2;
        const am = (a0+a1)/2;
        if (vis([Math.cos(am)*nrmSign, Math.sin(am)*nrmSign, 0]) <= 0.001) continue;
        const r0 = polyR(rad, a0), r1 = polyR(rad, a1);
        const c0=Math.cos(a0), s0=Math.sin(a0), c1=Math.cos(a1), s1=Math.sin(a1);
        const q = [
          proj([c0*r0, s0*r0,  halfT]),
          proj([c1*r1, s1*r1,  halfT]),
          proj([c1*r1, s1*r1, -halfT]),
          proj([c0*r0, s0*r0, -halfT]),
        ];
        fc.beginPath();
        fc.moveTo(q[0].x,q[0].y);
        for (let i=1;i<4;i++) fc.lineTo(q[i].x,q[i].y);
        fc.closePath();
        fc.fill();
      }
    };

    const frontVis = vis([0,0, 1]);
    const backVis  = vis([0,0,-1]);
    const frontFirst = frontVis < backVis;

    if (frontFirst && frontVis > 0.001) drawCap(1,  this.PNET_SHADE_FACE);
    if (!frontFirst && backVis > 0.001) drawCap(-1, this.PNET_SHADE_BACK);

    drawWall(rO, +1, this.PNET_SHADE_SIDE);
    drawWall(rI, -1, this.PNET_SHADE_INNER);

    if (frontFirst && backVis > 0.001) drawCap(-1, this.PNET_SHADE_BACK);
    if (!frontFirst && frontVis > 0.001) drawCap(1,  this.PNET_SHADE_FACE);
  }

  _pnetRenderScene() {
    const { W, H, DPR } = this;
    const fc = this.fCtx;
    fc.setTransform(1,0,0,1,0,0);
    fc.clearRect(0,0,W*DPR,H*DPR);
    fc.save();
    fc.scale(DPR,DPR);

    const st = this.pnetState;
    const cx = W/2, cy = H/2 + this._rem*1.2;       // align with other products
    const R  = this._rem * this.PNET_DISK_REM * 0.5;
    const N  = this.PNET_RING_COUNT;
    const gap = this.PNET_RING_GAP;
    const yawRad = this.PNET_YAW_DEG * Math.PI/180;

    // OUTER → INNER so inner rings nest within outer holes.
    for (let i = N-1; i >= 0; i--) {
      const bandO = R * (i+1) / N;
      const bandI = R * i / N;
      const g = (bandO - bandI) * gap * 0.5;
      const rO = bandO - g;
      const rI = bandI + g;

      const revL = this._pnetStagger(st.reveal, i, N, this.PNET_REVEAL_OVL);
      const scl  = revL;
      if (scl <= 0.001) continue;

      const ryL = this._pnetStagger(st.spinY, i, N, this.PNET_SPIN_OVL);
      const rxL = this._pnetStagger(st.spinX, i, N, this.PNET_SPIN_OVL);
      const sweep = Math.PI * 2 * this.PNET_SPIN_TURNS;
      const ry  = ryL * sweep;
      const rx  = yawRad + rxL * sweep;

      this._pnetDrawRing(rO, rI, ry, rx, scl, cx, cy);
    }
    fc.restore();
  }

  _drawPaveNet() {
    this._pnetRenderScene();

    const { W, H, DPR, COLS, ROWS, STEP } = this;
    const data = this.fCtx.getImageData(0,0,W*DPR,H*DPR).data;
    const stride = Math.round(W * DPR);
    const half = STEP/2;
    const [lr, lg, lb] = this.LINE_COLOR.split(',').map(Number);
    const st = this.pnetState;
    const dissolve = st.dissolve;

    const gcx = W/2, gcy = H/2 + this._rem*1.2;
    const gr  = this._rem * this.PNET_DISK_REM * 0.5 * 1.05;
    const band = this.PNET_DIS_BAND, jitAmt = this.PNET_DIS_JITTER, hopMax = this.PNET_HOP_MAX;
    const frontStart = band;
    const frontEnd   = 1 + jitAmt*0.5 + band*2 + 0.05;
    const front = frontStart + (frontEnd - frontStart) * dissolve;

    for (let c = 0; c < COLS; c++) {
      const sx = this.colXCache[c] + half;
      const px = Math.min(W*DPR-1, Math.max(0,(sx*DPR)|0));
      const jitCol = this._cellJitter[c];
      const hopCol = this._cellHopJit[c];
      for (let r = 0; r < ROWS; r++) {
        const sy = this.rowYCache[r] + half;
        const py = Math.min(H*DPR-1, Math.max(0,(sy*DPR)|0));
        const idx = (py*stride+px)*4;
        if (data[idx+3]/255 <= this.THRESHOLD) continue;
        const shade = data[idx]/255;
        const sizeFrac = this.PNET_LIGHT_SIZE + (1 - this.PNET_LIGHT_SIZE) * shade;
        const baseSz = this.FG_MAX * sizeFrac;

        if (dissolve <= 0.0001) {
          this.ctx.fillStyle = `rgba(${lr},${lg},${lb},${shade})`;
          this.ctx.fillRect(this.colXCache[c]+half-baseSz/2, this.rowYCache[r]+half-baseSz/2, baseSz, baseSz);
          continue;
        }
        const ndx = (sx-gcx)/gr, ndy = (sy-gcy)/gr;
        const nd = Math.sqrt(ndx*ndx + ndy*ndy);
        const rnd = 1 - nd;
        const thresh = rnd + (jitCol[r]-0.5)*jitAmt;
        const local = (front - band - thresh) / band;
        if (local <= 0) {
          this.ctx.fillStyle = `rgba(${lr},${lg},${lb},${shade})`;
          this.ctx.fillRect(this.colXCache[c]+half-baseSz/2, this.rowYCache[r]+half-baseSz/2, baseSz, baseSz);
          continue;
        }
        const lp = Math.min(1, local);
        const cellMaxHops = 1 + Math.floor(hopCol[r]*hopMax);
        const hops = Math.floor(lp*cellMaxHops + 0.0001);
        const fade = 1 - lp;
        if (fade <= 0.01) continue;
        let ux = sx-gcx, uy = sy-gcy;
        const ul = Math.hypot(ux,uy) || 1; ux/=ul; uy/=ul;
        const axv = Math.abs(ux), ayv = Math.abs(uy);
        let dcol=0, drow=0;
        if (axv > 0.38) dcol = ux>0?1:-1;
        if (ayv > 0.38) drow = uy>0?1:-1;
        if (dcol===0 && drow===0) dcol = ux>=0?1:-1;
        const hCol = c+dcol*hops, hRow = r+drow*hops;
        if (hCol<0||hCol>=COLS||hRow<0||hRow>=ROWS) continue;
        const sz = baseSz*(0.6+fade*0.4);
        if (sz <= 0.01) continue;
        this.ctx.fillStyle = `rgba(${lr},${lg},${lb},${shade*fade})`;
        this.ctx.fillRect(this.colXCache[hCol]+half-sz/2, this.rowYCache[hRow]+half-sz/2, sz, sz);
      }
    }
  }

  // =========================================================================
  // FOREGROUND: TRADING & MARKETS — scrolling chart of isometric bars
  //   reveal (3 bars rise, staggered) → scroll (strip slides right→left through
  //   the chart, then exits left → empty canvas). Mask window + soft edge fade +
  //   90→100% breathe scale. State in this.tradeState, driven by animations.js.
  // =========================================================================

  _trdRotY(p, c, s) { return [ p[0]*c + p[2]*s, p[1], -p[0]*s + p[2]*c ]; }

  _trdProject(p, cx, cy, scale) {
    const ct = Math.cos(ISO_A), st = Math.sin(ISO_A);
    const y2 = p[1]*ct + p[2]*st;
    const z2 = -p[1]*st + p[2]*ct;
    return { x: cx + p[0]*scale, y: cy + y2*scale, z: z2 };
  }

  // Draw a box prism (half-extents hx,hy,hz) into the offscreen buffer at fade f.
  _trdDrawBox(cxp, cyp, hx, hy, hz, scale, fade) {
    const fCtx = this.fCtx;
    const c = Math.cos(ISO_BASE_Y), s = Math.sin(ISO_BASE_Y);
    const C = [
      [-hx,-hy,-hz],[ hx,-hy,-hz],[ hx,-hy, hz],[-hx,-hy, hz],
      [-hx, hy,-hz],[ hx, hy,-hz],[ hx, hy, hz],[-hx, hy, hz],
    ].map(p => this._trdProject(this._trdRotY(p, c, s), cxp, cyp, scale));

    const faces = [
      { idx:[0,1,2,3], n:[0,-1,0] },
      { idx:[4,7,6,5], n:[0, 1,0] },
      { idx:[0,3,7,4], n:[-1,0,0] },
      { idx:[1,5,6,2], n:[ 1,0,0] },
      { idx:[3,2,6,7], n:[0,0, 1] },
      { idx:[0,4,5,1], n:[0,0,-1] },
    ];
    const ct = Math.cos(ISO_A), st = Math.sin(ISO_A);
    faces.forEach(f => {
      const rn = this._trdRotY(f.n, c, s);
      const screenY = rn[1]*ct + rn[2]*st;
      const vz      = -rn[1]*st + rn[2]*ct;
      const nx      = rn[0];
      f.vz = vz;
      if (screenY < -0.5) f.shade = this.TRD_SHADE_TOP;
      else if (nx > 0)    f.shade = this.TRD_SHADE_RIGHT;
      else                f.shade = this.TRD_SHADE_LEFT;
    });
    faces.sort((a,b) => a.vz - b.vz);

    fCtx.globalAlpha = Math.max(0, Math.min(1, fade));
    faces.forEach(f => {
      if (f.vz <= 0.001) return;
      const v = Math.max(0, Math.min(255, Math.round(f.shade*255)));
      fCtx.fillStyle = `rgb(${v},${v},${v})`;
      fCtx.beginPath();
      const q = f.idx.map(i => C[i]);
      fCtx.moveTo(q[0].x, q[0].y);
      for (let i=1;i<q.length;i++) fCtx.lineTo(q[i].x, q[i].y);
      fCtx.closePath();
      fCtx.fill();
    });
    fCtx.globalAlpha = 1;
  }

  _trdRenderScene() {
    const { W, H, DPR } = this;
    const fCtx = this.fCtx;
    fCtx.setTransform(1,0,0,1,0,0);
    fCtx.clearRect(0,0,W*DPR,H*DPR);
    fCtx.save();
    fCtx.scale(DPR,DPR);

    const st = this.tradeState;
    const hx = this._rem * this.TRD_BAR_WIDTH_REM * 0.5;
    const hz = hx;
    const scale = 1;
    const ct = Math.cos(ISO_A);
    const dxScreen = this._rem * this.TRD_STEP_X_REM;
    const dyScreen = this._rem * this.TRD_STEP_Y_REM;

    const cx = W/2 + this._rem * this.TRD_OFFSET_X_REM;
    const cy = H/2 + this._rem*1.2 + this._rem * this.TRD_OFFSET_Y_REM;
    const vis = this.TRD_VISIBLE;
    const halfWin = vis / 2;
    const fade = this.TRD_FADE_BARS;
    const WAVE = this._trdWave, WLEN = this.TRD_WAVE_LEN;

    const scrollPos = this.TRD_SCROLL_START + st.scroll * this.TRD_SCROLL_BARS;
    const scrolling = st.scroll > 0.0001;

    const startIdx = this.TRD_SCROLL_START;
    const revealBars = [startIdx-1, startIdx, startIdx+1];
    const firstBar = startIdx - 1;
    const lastBar = firstBar + this.TRD_CHART_BARS;
    const revLocal = (j) => {
      const n = revealBars.length, ov = this.TRD_REVEAL_OVL;
      const span = 1 / (n - (n-1)*ov);
      const start = j * span * (1 - ov);
      return Math.max(0, Math.min(1, (st.reveal - start) / span));
    };

    const lo = Math.floor(scrollPos - halfWin - fade - 1);
    const hi = Math.ceil (scrollPos + halfWin + fade + 1);

    for (let k = hi; k >= lo; k--) {
      if (k < firstBar || k > lastBar) continue;
      const slot = k - scrollPos;
      const edge = Math.abs(slot) - halfWin;
      let f = edge <= 0 ? 1 : 1 - edge / fade;
      if (f <= 0.001) continue;
      f = Math.max(0, Math.min(1, f));

      let grow;
      if (scrolling) {
        grow = this.TRD_EDGE_SCALE + (1 - this.TRD_EDGE_SCALE) * f;
      } else {
        const j = revealBars.indexOf(k);
        if (j === -1) continue;
        grow = revLocal(j);
        f = 1;
      }
      if (grow <= 0.001) continue;

      const hRem = WAVE[((k % WLEN) + WLEN) % WLEN];
      const hy = this._rem * hRem * 0.5 * grow;
      if (hy <= 0.001) continue;
      const baseX = cx + slot * dxScreen;
      const baseY = cy - slot * dyScreen;
      const cyp = baseY - hy*ct;
      this._trdDrawBox(baseX, cyp, hx, hy, hz, scale, f);
    }

    fCtx.restore();
  }

  _drawTrading() {
    this._trdRenderScene();

    const { W, H, DPR, COLS, ROWS, STEP } = this;
    const data = this.fCtx.getImageData(0,0,W*DPR,H*DPR).data;
    const stride = Math.round(W * DPR);
    const half = STEP/2;
    const [lr, lg, lb] = this.LINE_COLOR.split(',').map(Number);

    for (let c=0;c<COLS;c++){
      const sx = this.colXCache[c]+half;
      const px = Math.min(W*DPR-1, Math.max(0,(sx*DPR)|0));
      for (let r=0;r<ROWS;r++){
        const sy = this.rowYCache[r]+half;
        const py = Math.min(H*DPR-1,Math.max(0,(sy*DPR)|0));
        const idx = (py*stride+px)*4;
        const alpha = data[idx+3]/255;            // mask-edge fade
        if (alpha <= 0.02) continue;
        const shade = data[idx]/255;
        const sizeFrac = this.TRD_LIGHT_SIZE + (1 - this.TRD_LIGHT_SIZE) * shade;
        const sz = this.FG_MAX * sizeFrac * (0.6 + 0.4*alpha);
        this.ctx.fillStyle = `rgba(${lr},${lg},${lb},${shade*alpha})`;
        this.ctx.fillRect(this.colXCache[c]+half-sz/2, this.rowYCache[r]+half-sz/2, sz, sz);
      }
    }
  }

  // =========================================================================
  // FOREGROUND: TREASURY MANAGEMENT — segmented ring (flip-wave + spin)
  //   reveal (slices scale in, staggered anti-cw from left-middle) → middle
  //   (flip wave rolls each slice a full turn about its tangent axis, staggered,
  //   WHILE the whole ring spins) → exit (slices scale out). Orthographic,
  //   tilted + rolled. State in this.treasuryState, driven by animations.js.
  // =========================================================================

  // rotate about Y (yaw) then X (tilt); orthographic — no perspective divide.
  _treRotate3(p, ry, rx) {
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const x =  p[0]*cy + p[2]*sy;
    const z = -p[0]*sy + p[2]*cy;
    const y =  p[1];
    const cx2 = Math.cos(rx), sx2 = Math.sin(rx);
    return [ x, y*cx2 - z*sx2, y*sx2 + z*cx2 ];
  }
  // Rodrigues rotation of p about unit axis ax by angle th.
  _treRotAxis(p, ax, th) {
    const c = Math.cos(th), s = Math.sin(th), k = 1 - c;
    const [x,y,z] = p, [ux,uy,uz] = ax;
    const dot = x*ux + y*uy + z*uz;
    return [
      x*c + (uy*z - uz*y)*s + ux*dot*k,
      y*c + (uz*x - ux*z)*s + uy*dot*k,
      z*c + (ux*y - uy*x)*s + uz*dot*k,
    ];
  }

  _treRenderScene() {
    const { W, H, DPR } = this;
    const fc = this.fCtx;
    fc.setTransform(1,0,0,1,0,0);
    fc.clearRect(0,0,W*DPR,H*DPR);
    fc.save();
    fc.scale(DPR,DPR);

    const st = this.treasuryState;
    const R  = this._rem * this.TRE_DISK_REM * 0.5;
    const rI = this._rem * this.TRE_HOLE_REM * 0.5;
    const halfT = this._rem * this.TRE_THICK_REM * 0.5;
    const cx = W/2 + this._rem * this.TRE_OFFSET_X_REM;
    const cy = H/2 + this._rem*1.2 + this._rem * this.TRE_OFFSET_Y_REM;
    const ry = this.TRE_YAW_DEG * Math.PI/180;
    const rx = this.TRE_TILT_DEG * Math.PI/180;
    const roll = this.TRE_ROLL_DEG * Math.PI/180;
    const cr = Math.cos(roll), sr = Math.sin(roll);

    const proj = (p) => {
      const r = this._treRotate3(p, ry, rx);
      const x = cx + r[0], y = cy + r[1];
      const dx = x - cx, dy = y - cy;
      return { x: cx + dx*cr - dy*sr, y: cy + dx*sr + dy*cr, z: r[2] };
    };

    const NS  = this.TRE_SEGMENTS;
    const SPIN = -st.spin * Math.PI*2 * this.TRE_SPIN_TURNS;   // counter-clockwise
    const gap = this.TRE_GAP_DEG * Math.PI/180;
    const full = Math.PI*2 / NS;
    const arc  = full - gap;
    const ASEG = Math.max(2, Math.round(this.TRE_NSEG / NS));

    const faces = [];
    const addFace = (localPts, shade) => {
      const sp = localPts.map(proj);
      let zsum = 0; for (const q of sp) zsum += q.z;
      faces.push({ pts: sp, shade, depth: zsum / sp.length });
    };

    const stagger = (gp, j, ov) => {
      const span = 1 / (NS - (NS-1)*ov);
      const start = j * span * (1 - ov);
      return Math.max(0, Math.min(1, (gp - start) / span));
    };
    const orderOf = (i) => {
      const baseMid = i*full + gap*0.5 + arc*0.5;
      let d = (baseMid - Math.PI); d = ((d % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
      return (NS - Math.round(d / full)) % NS;     // 0 = left-middle, anti-cw
    };
    const sliceScale = (i) => {
      const order = orderOf(i);
      if (st.exit > 0.0001) return 1 - stagger(st.exit, order, this.TRE_STAGGER_OVL);
      return stagger(st.reveal, order, this.TRE_STAGGER_OVL);
    };
    const flipAngleFor = (i) => {
      if (st.flip <= 0.0001) return 0;
      const order = orderOf(i);
      const ov = this.TRE_FLIP_OVL;
      const span = 1 / (NS - (NS-1)*ov);
      const start = order * span * (1 - ov);
      const local = (st.flip - start) / span;
      if (local <= 0 || local >= 1) return 0;
      return -local * this.TRE_FLIP_MAX * Math.PI/180;          // reversed direction
    };

    for (let i=0;i<NS;i++){
      const sc = sliceScale(i);
      if (sc <= 0.001) continue;
      const a0 = i*full + gap*0.5 + SPIN;
      const a1 = a0 + arc;
      const aMid = (a0 + a1) / 2;
      const rMid = (R + rI) / 2;
      const cMidX = Math.cos(aMid)*rMid, cMidZ = Math.sin(aMid)*rMid;
      const flipA = flipAngleFor(i);
      const tax = [-Math.sin(aMid), 0, Math.cos(aMid)];
      const Psc = (ang, rad, h) => {
        const x = Math.cos(ang)*rad, z = Math.sin(ang)*rad;
        let p = [ (x-cMidX)*sc, h*sc, (z-cMidZ)*sc ];
        if (flipA !== 0) p = this._treRotAxis(p, tax, flipA);
        return [ cMidX + p[0], p[1], cMidZ + p[2] ];
      };

      for (const [sign, shade] of [[1, this.TRE_SHADE_TOP], [-1, this.TRE_SHADE_BOTTOM]]) {
        const pts = [];
        for (let a=0;a<=ASEG;a++){ const ang=a0+(a1-a0)*a/ASEG; pts.push(Psc(ang,R,sign*halfT)); }
        for (let a=ASEG;a>=0;a--){ const ang=a0+(a1-a0)*a/ASEG; pts.push(Psc(ang,rI,sign*halfT)); }
        addFace(pts, shade);
      }
      for (let a=0;a<ASEG;a++){
        const b0=a0+(a1-a0)*a/ASEG, b1=a0+(a1-a0)*(a+1)/ASEG;
        addFace([Psc(b0,R,halfT),Psc(b1,R,halfT),Psc(b1,R,-halfT),Psc(b0,R,-halfT)], this.TRE_SHADE_RIM);
        addFace([Psc(b0,rI,halfT),Psc(b1,rI,halfT),Psc(b1,rI,-halfT),Psc(b0,rI,-halfT)], this.TRE_SHADE_INNER);
      }
      addFace([Psc(a0,R,halfT),Psc(a0,rI,halfT),Psc(a0,rI,-halfT),Psc(a0,R,-halfT)], this.TRE_SHADE_END);
      addFace([Psc(a1,R,halfT),Psc(a1,rI,halfT),Psc(a1,rI,-halfT),Psc(a1,R,-halfT)], this.TRE_SHADE_END);
    }

    faces.sort((A,B)=>B.depth - A.depth);
    for (const f of faces){
      const v = Math.max(0, Math.min(255, Math.round(f.shade*255)));
      fc.fillStyle = `rgb(${v},${v},${v})`;
      fc.beginPath();
      fc.moveTo(f.pts[0].x, f.pts[0].y);
      for (let i=1;i<f.pts.length;i++) fc.lineTo(f.pts[i].x, f.pts[i].y);
      fc.closePath();
      fc.fill();
    }
    fc.restore();
  }

  _drawTreasury() {
    this._treRenderScene();

    const { W, H, DPR, COLS, ROWS, STEP } = this;
    const data = this.fCtx.getImageData(0,0,W*DPR,H*DPR).data;
    const stride = Math.round(W * DPR);
    const half = STEP/2;
    const [lr, lg, lb] = this.LINE_COLOR.split(',').map(Number);

    for (let c=0;c<COLS;c++){
      const sx = this.colXCache[c]+half;
      const px = Math.min(W*DPR-1, Math.max(0,(sx*DPR)|0));
      for (let r=0;r<ROWS;r++){
        const sy = this.rowYCache[r]+half;
        const py = Math.min(H*DPR-1,Math.max(0,(sy*DPR)|0));
        const idx = (py*stride+px)*4;
        if (data[idx+3]/255 <= this.THRESHOLD) continue;
        const shade = data[idx]/255;
        const sizeFrac = this.TRE_LIGHT_SIZE + (1 - this.TRE_LIGHT_SIZE) * shade;
        const sz = this.FG_MAX * sizeFrac;
        this.ctx.fillStyle = `rgba(${lr},${lg},${lb},${shade})`;
        this.ctx.fillRect(this.colXCache[c]+half-sz/2, this.rowYCache[r]+half-sz/2, sz, sz);
      }
    }
  }

  // =========================================================================
  // FOREGROUND: PROGRAMMABLE INFRASTRUCTURE — 3D node network
  //   reveal (nodes scale in staggered, then struts grow) → middle (whole net
  //   rotates) → exit (struts retract, nodes scale out). Nodes are cubes, struts
  //   are thin 3D beams. Iso 3-face view. State in this.infraState.
  // =========================================================================

  _infRotY(p, c, s) { return [ p[0]*c + p[2]*s, p[1], -p[0]*s + p[2]*c ]; }
  _infRotX(p, c, s) { return [ p[0], p[1]*c - p[2]*s, p[1]*s + p[2]*c ]; }

  _infProject(p, ry, rx, cx, cy, scale) {
    let q = this._infRotY(p, Math.cos(ry), Math.sin(ry));
    q = this._infRotX(q, Math.cos(rx), Math.sin(rx));
    return { x: cx + q[0]*scale, y: cy + q[1]*scale, z: q[2] };
  }

  _infAddBox(scene, center, hx, hy, hz, ry, rx, cx, cy, scale, shadeSet) {
    const [Cx,Cy,Cz] = center;
    const corners = [
      [-hx,-hy,-hz],[ hx,-hy,-hz],[ hx,-hy, hz],[-hx,-hy, hz],
      [-hx, hy,-hz],[ hx, hy,-hz],[ hx, hy, hz],[-hx, hy, hz],
    ].map(p => this._infProject([p[0]+Cx, p[1]+Cy, p[2]+Cz], ry, rx, cx, cy, scale));
    const faces = [
      { idx:[0,1,2,3], n:[0,-1,0] },
      { idx:[4,7,6,5], n:[0, 1,0] },
      { idx:[0,3,7,4], n:[-1,0,0] },
      { idx:[1,5,6,2], n:[ 1,0,0] },
      { idx:[3,2,6,7], n:[0,0, 1] },
      { idx:[0,4,5,1], n:[0,0,-1] },
    ];
    const c1=Math.cos(ry), s1=Math.sin(ry), c2=Math.cos(rx), s2=Math.sin(rx);
    for (const f of faces){
      let rn = this._infRotY(f.n, c1, s1); rn = this._infRotX(rn, c2, s2);
      if (rn[2] >= -0.001) continue;
      let shade;
      if (shadeSet.flat !== undefined) shade = shadeSet.flat;
      else if (rn[1] < -0.5) shade = shadeSet.top;
      else if (rn[0] > 0) shade = shadeSet.right;
      else shade = shadeSet.left;
      const q = f.idx.map(i => corners[i]);
      const depth = (q[0].z+q[1].z+q[2].z+q[3].z)/4;
      scene.push({ pts:q, shade, depth });
    }
  }

  _infAddBeam(scene, A, B, t, frac, ry, rx, cx, cy, scale, shade) {
    const ax=A[0], ay=A[1], az=A[2];
    const bx=ax+(B[0]-ax)*frac, by=ay+(B[1]-ay)*frac, bz=az+(B[2]-az)*frac;
    const mid=[(ax+bx)/2,(ay+by)/2,(az+bz)/2];
    const dx=bx-ax, dy=by-ay, dz=bz-az;
    const len=Math.hypot(dx,dy,dz) || 1e-6;
    const u=[dx/len,dy/len,dz/len];
    let ref = Math.abs(u[1])<0.9 ? [0,1,0] : [1,0,0];
    let v=[u[1]*ref[2]-u[2]*ref[1], u[2]*ref[0]-u[0]*ref[2], u[0]*ref[1]-u[1]*ref[0]];
    const vl=Math.hypot(v[0],v[1],v[2])||1; v=[v[0]/vl,v[1]/vl,v[2]/vl];
    let w=[u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    const hl=len/2;
    const corner = (su,sv,sw) => [
      mid[0]+u[0]*su*hl+v[0]*sv*t+w[0]*sw*t,
      mid[1]+u[1]*su*hl+v[1]*sv*t+w[1]*sw*t,
      mid[2]+u[2]*su*hl+v[2]*sv*t+w[2]*sw*t,
    ];
    const C = [
      corner(-1,-1,-1),corner(1,-1,-1),corner(1,-1,1),corner(-1,-1,1),
      corner(-1,1,-1),corner(1,1,-1),corner(1,1,1),corner(-1,1,1),
    ].map(p=>this._infProject(p, ry, rx, cx, cy, scale));
    const faces=[[0,1,2,3],[4,7,6,5],[0,3,7,4],[1,5,6,2],[3,2,6,7],[0,4,5,1]];
    for (const idx of faces){
      const q=idx.map(i=>C[i]);
      const area=(q[1].x-q[0].x)*(q[2].y-q[0].y)-(q[1].y-q[0].y)*(q[2].x-q[0].x);
      if (area<=0) continue;
      const depth=(q[0].z+q[1].z+q[2].z+q[3].z)/4;
      scene.push({ pts:q, shade, depth });
    }
  }

  _infStagger(gp, j, n, ov){
    const span = 1/(n-(n-1)*ov);
    const start = j*span*(1-ov);
    return Math.max(0, Math.min(1, (gp-start)/span));
  }

  _infRenderScene() {
    const { W, H, DPR } = this;
    const fc = this.fCtx;
    fc.setTransform(1,0,0,1,0,0);
    fc.clearRect(0,0,W*DPR,H*DPR);
    fc.save();
    fc.scale(DPR,DPR);

    const st = this.infraState;
    const cx = W/2 + this._rem*this.INF_OFFSET_X_REM;
    const cy = H/2 + this._rem*1.2 + this._rem*this.INF_OFFSET_Y_REM;
    const scale = this._rem * this.INF_LAYOUT_REM;
    const ry = this.INF_BASE_YAW_DEG*Math.PI/180 + st.rot * Math.PI*2 * this.INF_SPIN_TURNS;
    const rx = this.INF_TILT_DEG*Math.PI/180;
    const node = this._rem*this.INF_NODE_REM*0.5 / scale;
    const t = this._rem*this.INF_STRUT_REM*0.5 / scale;
    const N = this._infNodes.length;

    const nodeScl = (i) => {
      if (st.exit>0.0001) return 1 - this._infStagger(st.exit, i, N, this.INF_EXIT_OVL);
      return this._infStagger(st.reveal, i, N, this.INF_REVEAL_OVL);
    };

    const scene = [];
    // struts first
    for (const [a,b] of this._infEdges){
      if (nodeScl(a)<=0.01 || nodeScl(b)<=0.01) continue;
      this._infAddBeam(scene, this._infNodes[a], this._infNodes[b], t, st.strut, ry, rx, cx, cy, scale, this.INF_STRUT_SHADE);
    }
    // nodes
    for (let i=0;i<N;i++){
      const s=nodeScl(i);
      if (s<=0.01) continue;
      const hs = node*s;
      this._infAddBox(scene, this._infNodes[i], hs, hs, hs, ry, rx, cx, cy, scale,
        { top:this.INF_SHADE_TOP, left:this.INF_SHADE_LEFT, right:this.INF_SHADE_RIGHT });
    }

    scene.sort((A,B)=>B.depth-A.depth);
    for (const f of scene){
      const v = Math.max(0,Math.min(255,Math.round(f.shade*255)));
      fc.fillStyle = `rgb(${v},${v},${v})`;
      fc.beginPath();
      fc.moveTo(f.pts[0].x, f.pts[0].y);
      for (let i=1;i<f.pts.length;i++) fc.lineTo(f.pts[i].x, f.pts[i].y);
      fc.closePath();
      fc.fill();
    }
    fc.restore();
  }

  _drawInfra() {
    this._infRenderScene();

    const { W, H, DPR, COLS, ROWS, STEP } = this;
    const data = this.fCtx.getImageData(0,0,W*DPR,H*DPR).data;
    const stride = Math.round(W * DPR);
    const half = STEP/2;
    const [lr, lg, lb] = this.LINE_COLOR.split(',').map(Number);

    for (let c=0;c<COLS;c++){
      const sx = this.colXCache[c]+half;
      const px = Math.min(W*DPR-1, Math.max(0,(sx*DPR)|0));
      for (let r=0;r<ROWS;r++){
        const sy = this.rowYCache[r]+half;
        const py = Math.min(H*DPR-1,Math.max(0,(sy*DPR)|0));
        const idx = (py*stride+px)*4;
        if (data[idx+3]/255 <= this.THRESHOLD) continue;
        const shade = data[idx]/255;
        const sizeFrac = this.INF_LIGHT_SIZE + (1 - this.INF_LIGHT_SIZE) * shade;
        const sz = this.FG_MAX * sizeFrac;
        this.ctx.fillStyle = `rgba(${lr},${lg},${lb},${shade})`;
        this.ctx.fillRect(this.colXCache[c]+half-sz/2, this.rowYCache[r]+half-sz/2, sz, sz);
      }
    }
  }

  // =========================================================================
  // FOREGROUND: TRUST & OPERATIONS — isometric cube field
  //   A hexagonal field of true-iso cubes packed corner-to-corner. Reveal scales
  //   each cube up in place, staggered by distance from the centre → ripples
  //   outward. State in this.trustState, driven by a scrubbed ScrollTrigger.
  // =========================================================================

  // Draw one straight-on iso cube directly in screen space (3 visible faces).
  //   (sx,sy) = footprint anchor (middle vertex); dx,dy = top-rhombus half-
  //   diagonals; hpx = pillar height. Pushes faces with a depth key.
  _truAddCube(scene, sx, sy, dx, dy, hpx, depth, green, op) {
    const top    = sy - hpx;
    const Ttop   = { x: sx,      y: top };
    const Tright = { x: sx + dx, y: top + dy };
    const Tbot   = { x: sx,      y: top + 2*dy };
    const Tleft  = { x: sx - dx, y: top + dy };
    const Bbot   = { x: sx,      y: top + 2*dy + hpx };
    const Bright = { x: sx + dx, y: top + dy   + hpx };
    const Bleft  = { x: sx - dx, y: top + dy   + hpx };
    scene.push({ pts:[Ttop, Tright, Tbot, Tleft], shade: this.TRU_SHADE_TOP,   depth, green, op });
    scene.push({ pts:[Tleft, Tbot, Bbot, Bleft],  shade: this.TRU_SHADE_LEFT,  depth, green, op });
    scene.push({ pts:[Tbot, Tright, Bright, Bbot], shade: this.TRU_SHADE_RIGHT, depth, green, op });
  }

  _truRenderScene() {
    const { W, H, DPR } = this;
    const fc = this.fCtx;
    fc.setTransform(1,0,0,1,0,0);
    fc.clearRect(0,0,W*DPR,H*DPR);
    fc.save();
    fc.scale(DPR,DPR);

    const st = this.trustState;
    const cx = W/2 + this.TRU_OFFSET_X * W;
    const cy = H/2 + this._rem*1.2 + this.TRU_OFFSET_Y * H;
    const E  = this._rem * this.TRU_CUBE_REM * this.TRU_SCALE;   // cube edge (master-scaled)
    const dx = E * Math.cos(Math.PI/6);              // true-iso half-diagonals
    const dy = E * Math.sin(Math.PI/6);
    const hpx = E * this.TRU_HEIGHT_FRAC;

    // corner-touch lattice basis: u=(2dx,-E), v=(2dx,E)
    const ux = 2*dx, uy = -E, vx = 2*dx, vy = E;
    const cells = this._truCells;
    let maxR = 1;
    for (const c of cells) {
      const ox = c.i*ux + c.j*vx, oy = c.i*uy + c.j*vy;
      const r = Math.hypot(ox, oy);
      if (r > maxR) maxR = r;
    }

    const ov = this.TRU_REVEAL_OVL;
    const revealOf = (distNorm) => {
      const start = distNorm * ov;
      const dur   = 1 - start;
      return Math.max(0, Math.min(1, (st.reveal - start) / Math.max(0.0001, dur)));
    };
    const easeOut = x => 1 - Math.pow(1 - x, this.TRU_EASE_POW);

    const scene = [];
    // Split each cube's reveal into two non-overlapping phases:
    //   phase 1 (0 → SPLIT): opacity fades 0 → 1 at zero height (flat tile)
    //   phase 2 (SPLIT → 1): height grows 0 → full at full opacity
    const SPLIT = 0.45;
    for (const c of cells) {
      const ox = c.i*ux + c.j*vx, oy = c.i*uy + c.j*vy;
      const distNorm = Math.hypot(ox, oy) / maxR;
      const sc = easeOut(revealOf(distNorm));
      if (sc <= 0.0001) continue;           // not started yet
      const isCentre = (c.i === 0 && c.j === 0);
      const op   = Math.min(1, sc / SPLIT);                         // fade in first
      const hFr  = Math.max(0, (sc - SPLIT) / (1 - SPLIT));         // then grow height
      this._truAddCube(scene, cx + ox, cy + oy, dx, dy, hpx*hFr, oy, isCentre, op);
    }
    scene.sort((A,B) => A.depth - B.depth);          // far → near

    const [gr, gg, gb] = this.TRAIL_GREEN.split(',').map(Number);
    for (const f of scene) {
      fc.globalAlpha = f.op !== undefined ? Math.max(0, Math.min(1, f.op)) : 1;
      if (f.green) {
        // green centre cube: scale the green by the face shade so 3D reads
        const r = Math.round(gr * f.shade), g = Math.round(gg * f.shade), b = Math.round(gb * f.shade);
        fc.fillStyle = `rgb(${r},${g},${b})`;
      } else {
        const v = Math.max(0, Math.min(255, Math.round(f.shade*255)));
        fc.fillStyle = `rgb(${v},${v},${v})`;
      }
      fc.beginPath();
      fc.moveTo(f.pts[0].x, f.pts[0].y);
      for (let i=1;i<f.pts.length;i++) fc.lineTo(f.pts[i].x, f.pts[i].y);
      fc.closePath();
      fc.fill();
    }
    fc.globalAlpha = 1;
    fc.restore();
  }

  _drawTrust() {
    this._truRenderScene();

    const { W, H, DPR, COLS, ROWS, STEP } = this;
    const data = this.fCtx.getImageData(0,0,W*DPR,H*DPR).data;
    const stride = Math.round(W * DPR);
    const half = STEP/2;
    const [lr, lg, lb] = this.LINE_COLOR.split(',').map(Number);
    const [gr, gg, gb] = this.TRAIL_GREEN.split(',').map(Number);

    for (let c=0;c<COLS;c++){
      const sx = this.colXCache[c]+half;
      const px = Math.min(W*DPR-1, Math.max(0,(sx*DPR)|0));
      for (let r=0;r<ROWS;r++){
        const sy = this.rowYCache[r]+half;
        const py = Math.min(H*DPR-1,Math.max(0,(sy*DPR)|0));
        const idx = (py*stride+px)*4;
        const alpha = data[idx+3]/255;          // buffer alpha = cube reveal/opacity
        if (alpha <= 0.02) continue;            // skip empty pixels only
        // Canvas stores straight (non-premultiplied) RGBA, so the channel values
        // are the true face brightness regardless of the cube's fade alpha.
        const R = data[idx], G = data[idx+1], B = data[idx+2];
        // Green centre cube pixels read as G noticeably above R/B.
        const isGreen = G > R + 20 && G > B + 20;
        const shade = isGreen ? G / gg : R / 255;
        const sizeFrac = this.TRU_LIGHT_SIZE + (1 - this.TRU_LIGHT_SIZE) * shade;
        const sz = this.FG_MAX * sizeFrac * alpha;   // dot shrinks with fade
        const a  = shade * alpha;                    // dot fades with reveal
        if (isGreen) {
          this.ctx.fillStyle = `rgba(${gr},${gg},${gb},${a})`;
        } else {
          this.ctx.fillStyle = `rgba(${lr},${lg},${lb},${a})`;
        }
        this.ctx.fillRect(this.colXCache[c]+half-sz/2, this.rowYCache[r]+half-sz/2, sz, sz);
      }
    }
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
    // PHASE 2: bank accounts active once the globe is fully gone. The currency
    // state (scale/flip/dissolve) is driven by the GSAP timeline in animations.js.
    const cs = this.curState;
    const curVisible = cs.scale > 0.001 && cs.dissolve < 0.999;
    this.bankActive = curVisible || this._disintegrate >= 1;
    // PHASE 3: digital asset cube active once its own state is in play.
    const ds = this.damState;
    this.damActive = (ds.reveal > 0.001 || ds.merge > 0.001) && ds.dissolve < 0.999;
    // PHASE 4: PaveNet rings active once their own state is in play.
    const ps = this.pnetState;
    this.pnetActive = (ps.reveal > 0.001) && ps.dissolve < 0.999;
    // PHASE 5: Trading & Markets active once its reveal starts. It ends by
    // scrolling fully off (empty canvas), so it stays "active" the whole time;
    // the empty result is just what it renders at scroll=1.
    const tr = this.tradeState;
    this.tradeActive = tr.reveal > 0.001;
    // PHASE 6: Treasury Management active once reveal starts, until exit done.
    const tm = this.treasuryState;
    this.treasuryActive = tm.reveal > 0.001 && tm.exit < 0.999;
    // PHASE 7: Programmable Infrastructure active once reveal starts, until exit.
    const inf = this.infraState;
    this.infraActive = inf.reveal > 0.001 && inf.exit < 0.999;
    // PHASE 8: Trust & Operations cube field active once its reveal starts.
    const tu = this.trustState;
    this.trustActive = tu.reveal > 0.001;

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
    // Velocity → green blend: 0 at rest (trail = line colour), 1 at high speed
    // (trail blends fully toward TRAIL_GREEN). Reaches full green at TRAIL_GREEN_VEL.
    const greenAmt = Math.max(0, Math.min(1, velStrength / this.TRAIL_GREEN_VEL));

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
          if (greenAmt > 0.05) {
            // blend line colour → TRAIL_GREEN by greenAmt
            const [lr, lg, lb] = this.LINE_COLOR.split(',').map(Number);
            const [gr, gg, gb] = this.TRAIL_GREEN.split(',').map(Number);
            const r = Math.round(lr + (gr - lr) * greenAmt);
            const g = Math.round(lg + (gg - lg) * greenAmt);
            const b = Math.round(lb + (gb - lb) * greenAmt);
            ctx.fillStyle = `rgba(${r},${g},${b},0.9)`;
          } else {
            ctx.fillStyle = `rgba(${this.LINE_COLOR},0.9)`;
          }
          this._drawPixelCentered(cellX, cellY, targetSz);
        }
      }
    }

    // ── Foreground by mode ──────────────────────────────────────────────────
    if (this.MODE === 'empty') {
      // background grid + hover only — nothing more to draw
    } else if (this.trustActive) {
      if (this._fgTarget) for (let c = 0; c < COLS; c++) this.fgActive[c].fill(0);
      this._drawTrust();
    } else if (this.infraActive) {
      if (this._fgTarget) for (let c = 0; c < COLS; c++) this.fgActive[c].fill(0);
      this._drawInfra();
    } else if (this.treasuryActive) {
      if (this._fgTarget) for (let c = 0; c < COLS; c++) this.fgActive[c].fill(0);
      this._drawTreasury();
    } else if (this.tradeActive) {
      if (this._fgTarget) for (let c = 0; c < COLS; c++) this.fgActive[c].fill(0);
      this._drawTrading();
    } else if (this.pnetActive) {
      if (this._fgTarget) for (let c = 0; c < COLS; c++) this.fgActive[c].fill(0);
      this._drawPaveNet();
    } else if (this.damActive) {
      if (this._fgTarget) for (let c = 0; c < COLS; c++) this.fgActive[c].fill(0);
      this._drawDigitalAsset();
    } else if (this.bankActive) {
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
  // Digital Asset cube sizes (rem)
  damCubeRem:  4.2,
  damMiniRem:  1.51,
  // PaveNet ring sizes (−20% again from 5.52 / 1.1), gap restored
  pnetDiskRem:  4.42,
  pnetRingCount: 3,     // 3 rings (was 4)
  pnetThickRem: 1.17,   // thicker (×4/3) so 3 rings read with the same heft as 4
  pnetRingGap:  0.34,
  pnetSpinTurns: 0.5,   // 180° rotations (was 360°)
  pnetYawDeg:    0,     // dead-on at rest (no tilt)
  pnetSides:     6,     // hexagonal rings (use high number, e.g. 64, for circles)
  // Trading & Markets — scaled 30% smaller (bars + diagonal spacing × 0.7)
  trdBarWidthRem: 0.98,
  trdStepXRem:    1.47,
  trdStepYRem:    0.735,
  trdMinHRem:     1.12,
  trdMaxHRem:     2.94,
  trdOffsetXRem:  0.8,   // nudge right to centre
  trdOffsetYRem:  0.8,   // nudge down to centre
  trdChartBars:   12,    // 2 waves (2 × 6-bar cycle), ends on a trough
  trdScrollBars:  15,    // total travel so the tail clears the left edge
  // Treasury Management — segmented ring (−35% → × 0.65)
  treDiskRem:    5.85,
  treHoleRem:    3.25,
  treThickRem:   0.78,
  treTiltDeg:    30,
  treRollDeg:    -20,
  treSegments:   10,
  treGapDeg:     6,
  treSpinTurns:  0.5,    // ring spins 180° during the middle
  treFlipMax:    360,    // each slice rolls a full turn (flip wave)
  treFlipOvl:    0.6,
  // Programmable Infrastructure — node network (−20% → × 0.8)
  infNodeRem:    0.72,
  infStrutRem:   0.072,
  infLayoutRem:  2.56,
  infBaseYawDeg: 45,
  infTiltDeg:    35,
  infSpinTurns:  1,      // network does one full turn in the middle
  // Trust & Operations — isometric cube field
  truScale:     0.665,    // master scale of the whole field (up/down)
  truRings:     5,       // hex rings out from centre (1 -> 7, 2 -> 19, 3 -> 37, 4 -> 61)
  truOffsetX:   0.168,    // fraction of canvas width  (positive = right)
  truOffsetY:  -0.25,    // fraction of canvas height (negative = up)
  truRevealOvl: 0.6,     // ring-to-ring stagger overlap (low = sequential ripple, high = more together)
  truEasePow:   3,       // per-cube ease-out (1 = linear, 2 gentle, 3 default, 4-5 snappier)
});

// 4th canvas — empty grid + hover only, in the footer slot.
const grid4 = new LineGrid('.pn-footer-canvas', {
  mode:        'empty',
  bgColor:     '--white',
  lineColor:   '--dark',
});
