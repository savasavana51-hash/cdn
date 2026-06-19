// =========================================================================
// LINEGRID.JS — Canvas generative art system
// =========================================================================

const LINEGRID_DEFAULTS = {
  // All values in rem — 1rem = 50px baseline
  colRem:      2.2,
  gapRem:      0.2,
  lineGapRem:  0.2,
  minHRem:     0.02,
  maxHRem:     0.12,
  radiusRem:   0.4,
  bgOpacity:   0.15,
  sizeRatio:   0.38,
  stroke:      18,
  threshold:   0.5,
  trailLen:    12,
  lerp:        0.08,
  velDecay:    0.85,
  velScale:    0.04,
  waveSpeed:   0.3,
  flipSpeed:   0.018,
  flipFocal:   900,
  bgColor:     '#222222',
  lineColor:   '#f5f5f5',
  dpr:         Math.min(window.devicePixelRatio || 1, 2),
};

class LineGrid {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    const cfg      = Object.assign({}, LINEGRID_DEFAULTS, options);

    this.COL_REM      = cfg.colRem;
    this.GAP_REM      = cfg.gapRem;
    this.LINE_GAP_REM = cfg.lineGapRem;
    this.MIN_H_REM    = cfg.minHRem;
    this.MAX_H_REM    = cfg.maxHRem;
    this.RADIUS_REM   = cfg.radiusRem;
    this.COLS     = 0; this.GAP = 0; this.COL_W = 0;
    this.LINE_GAP = 0; this.MIN_H = 0; this.MAX_H = 0; this.RADIUS = 0;
    this.BG_OPACITY = cfg.bgOpacity;

    this.SIZE_RATIO = cfg.sizeRatio;
    this.STROKE     = cfg.stroke;
    this.THRESHOLD  = cfg.threshold;
    this.TRAIL_LEN  = cfg.trailLen;
    this.LERP       = cfg.lerp;
    this.VEL_DECAY  = cfg.velDecay;
    this.VEL_SCALE  = cfg.velScale;
    this.WAVE_SPEED = cfg.waveSpeed;
    this.FLIP_SPEED = cfg.flipSpeed;
    this.FLIP_FOCAL = cfg.flipFocal;

    this._bgVar   = options.bgColor  && options.bgColor.startsWith('--')  ? options.bgColor  : null;
    this._lineVar = options.lineColor && options.lineColor.startsWith('--') ? options.lineColor : null;
    this.BG_COLOR   = this._bgVar   ? this._readVar(this._bgVar)   : (cfg.bgColor   || '#222222');
    this.LINE_COLOR = this._lineVar ? this._hexToRgb(this._readVar(this._lineVar)) : this._hexToRgb(cfg.lineColor || '#f5f5f5');

    this.DPR = cfg.dpr;

    this.foregroundType = options.foregroundType || null;
    this.shapePath      = options.shapePath      || null;
    this.shapeViewBox   = options.shapeViewBox   || { w: 1450, h: 770 };
    this.flipPaths      = options.flipPaths      || [];
    this.flipBounds     = options.flipBounds     || [];

    this.W = 0; this.H = 0; this.COL_W = 0;
    this.sCX = 0; this.sCY = 0; this.LINES = 0;
    this.colXCache   = [];
    this.shapeMinX   = 0; this.shapeMaxX = 0;
    this.angle       = 0;
    this.waveTime    = 0; this.lastTs = null;
    this.trail       = []; this.energy = [];
    this.targetX     = -1; this.targetY     = -1;
    this.smoothX     = -1; this.smoothY     = -1;
    this.prevSmoothX = -1; this.prevSmoothY = -1;
    this.velocity    = 0;
    this._rafId      = null;

    this.rhombusLines   = null;
    this.revealProgress = 0;

    this.flipDatas    = []; this.flipHalfW = []; this.flipHalfH = [];
    this.flipIdx      = 0;  this.flipLastSign = 1; this.flipAngle = 0;

    this.gyroRings   = null;
    this.GYRO_SLOW   = options.gyroSlow   || 0.75;
    this.GYRO_STROKE = options.gyroStroke || 5;
    this.gyroScale   = 0;
    this.gyroReveal  = 0;

    this.globeAngle     = 0;
    this.globeCountries = [];
    this.globeReady     = false;
    this.GLOBE_TILT     = options.globeTilt !== undefined ? options.globeTilt : -0.3;
    this.GLOBE_SPEED    = options.globeSpeed  || 0.005;
    this.GLOBE_STROKE   = options.globeStroke || 2;
    this.globeRevealScale = 1;
    this.globeRevealX     = 1;
    this.plinthReveal     = 1;
    this.arcReveal        = 1;

    // Blinking green markers — financial hubs [lon, lat]
    this.GLOBE_MARKER_COLOR = this._hexToRgb(options.markerColor || '#77DD84');
    this.globeMarkers = options.globeMarkers || [
      { name: 'GE',  lon: 43.3569,  lat: 42.3154 },
      { name: 'SG',  lon: 103.8198, lat: 1.3521  },
      { name: 'MY',  lon: 101.9758, lat: 4.2105  },
      { name: 'HK',  lon: 114.1694, lat: 22.3193 },
      { name: 'UAE', lon: 54.3773,  lat: 24.4539 },
      { name: 'UK',  lon: -0.1276,  lat: 51.5074 },
    ];

    // Ring + Diamond reveal — 0 = invisible, 1 = fully visible (fade only)
    this.ringDiamondReveal = 0;

    // Product visual switcher for canvas 2
    // productVisual: null | 'bankAccounts' | 'digitalAsset' | 'pavenet'
    this.productVisual       = options.productVisual || null;
    this.productTime         = 0;
    this.bankAccountsReveal  = 0;
    this.digitalAssetReveal  = 0;

    // Bank Accounts — currency flip state (internal, driven by productTime)
    this._baRevealProgress   = 0;

    // Digital Asset — cube merge state (internal, driven by productTime)
    this._daTime             = 0;

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `display:block;width:100%;height:100%;background:${this.BG_COLOR};`;
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.faceCanvas = document.createElement('canvas');
    this.fCtx       = this.faceCanvas.getContext('2d');

    this.CUBE_EDGES = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];

    this._onMouseMove  = this._onMouseMove.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);
    this._onResize     = this._onResize.bind(this);
    this.canvas.addEventListener('mousemove',  this._onMouseMove);
    this.canvas.addEventListener('mouseleave', this._onMouseLeave);
    window.addEventListener('resize', this._onResize);

    window.addEventListener('load', () => {
      this.resize();
      if (this.foregroundType === 'globe') this._initGlobe();
      if (this.foregroundType === 'gyro')  this._initGyro();
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
  _onMouseLeave() {
    this.targetX = -1; this.targetY = -1;
    this.smoothX = -1; this.smoothY = -1;
    this.prevSmoothX = -1; this.prevSmoothY = -1;
    this.velocity = 0; this.trail.length = 0;
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

    const rem        = parseFloat(getComputedStyle(document.documentElement).fontSize);
    this.GAP         = rem * this.GAP_REM;
    this.COL_W       = rem * this.COL_REM;
    this.COLS        = Math.floor((this.W + this.GAP + 0.5) / (this.COL_W + this.GAP));
    this.LINE_GAP    = rem * this.LINE_GAP_REM;
    this.MIN_H       = rem * this.MIN_H_REM;
    this.MAX_H       = rem * this.MAX_H_REM;
    this.RADIUS      = rem * this.RADIUS_REM;
    this._rem        = rem;

    this.sCX   = this.W / 2;
    this.sCY   = this.H / 2;
    this.LINES = Math.ceil(this.H / this.LINE_GAP);

    this.colXCache = [];
    this.energy    = [];
    for (let col = 0; col < this.COLS; col++) {
      this.colXCache.push(col * (this.COL_W + this.GAP));
      this.energy.push(new Float32Array(this.LINES).fill(0));
    }

    if (this.foregroundType === 'rhombus' && this.shapePath) this._buildRhombusLines();
    if (this.foregroundType === 'flip' && this.flipPaths.length === 2) this._buildFlipShapes();
  }

  // ── Shared helpers ────────────────────────────────────────────────────────

  _rotateY(v,a){const[x,y,z]=v;return[x*Math.cos(a)+z*Math.sin(a),y,-x*Math.sin(a)+z*Math.cos(a)];}
  _rotateX(v,a){const[x,y,z]=v;return[x,y*Math.cos(a)-z*Math.sin(a),y*Math.sin(a)+z*Math.cos(a)];}
  _project(v,focal){const[x,y,z]=v,s=focal/(focal+z+focal*0.5);return[this.sCX+x*s,this.sCY+y*s];}

  _getFracCol(x) {
    for (let c = 0; c < this.COLS; c++) {
      const cx = this.colXCache[c];
      if (x >= cx && x < cx + this.COL_W + this.GAP) return c + (x - cx) / (this.COL_W + this.GAP);
    }
    return x < 0 ? 0 : this.COLS - 1;
  }

  _snapY(y) { return Math.round(y / this.LINE_GAP) * this.LINE_GAP; }

  _readVar(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

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

  _drawRoundedBottom(x, y, w, h, r) {
    if (w <= 0 || h <= 0) return;
    const safeR = Math.min(r, h/2, w/2);
    const c = this.ctx;
    c.beginPath(); c.moveTo(x,y); c.lineTo(x+w,y);
    c.lineTo(x+w,y+h-safeR); c.quadraticCurveTo(x+w,y+h,x+w-safeR,y+h);
    c.lineTo(x+safeR,y+h);   c.quadraticCurveTo(x,y+h,x,y+h-safeR);
    c.lineTo(x,y); c.closePath(); c.fill();
  }

  // =========================================================================
  // FOREGROUND: CUBE
  // =========================================================================

  _renderCube(SIZE, FOCAL) {
    const {W,H,DPR,STROKE} = this;
    const fCtx = this.fCtx;
    fCtx.clearRect(0,0,W*DPR,H*DPR);
    fCtx.save(); fCtx.scale(DPR,DPR);
    fCtx.strokeStyle='white'; fCtx.lineWidth=STROKE; fCtx.lineCap='round';
    const h=SIZE/2;
    const verts=[[-h,-h,-h],[h,-h,-h],[h,h,-h],[-h,h,-h],[-h,-h,h],[h,-h,h],[h,h,h],[-h,h,h]];
    const rotated=verts.map(v=>this._rotateX(this._rotateY(v,this.angle),Math.PI/6));
    this.shapeMinX=Infinity; this.shapeMaxX=-Infinity;
    const projected=rotated.map(v=>{
      const p=this._project(v,FOCAL);
      if(p[0]<this.shapeMinX)this.shapeMinX=p[0];
      if(p[0]>this.shapeMaxX)this.shapeMaxX=p[0];
      return p;
    });
    this.shapeMinX-=STROKE; this.shapeMaxX+=STROKE;
    this.CUBE_EDGES.forEach(([a,b])=>{
      const[ax,ay]=projected[a],[bx,by]=projected[b];
      fCtx.beginPath();fCtx.moveTo(ax,ay);fCtx.lineTo(bx,by);fCtx.stroke();
    });
    fCtx.restore();
  }

  _drawCubeLines(getAlpha, SIZE) {
    const {COLS,COL_W,LINE_GAP,RADIUS,THRESHOLD,H} = this;
    for (let col=0;col<COLS;col++) {
      const colX=this.colXCache[col], colEnd=colX+COL_W;
      if (colEnd<this.shapeMinX||colX>this.shapeMaxX) continue;
      for (let y=0;y<=H;y+=LINE_GAP) {
        let lx=-1,rx=-1;
        for(let px=colX;px<=colEnd;px++){if(getAlpha(px,y)>THRESHOLD){lx=px;break;}}
        for(let px=colEnd;px>=colX;px--){if(getAlpha(px,y)>THRESHOLD){rx=px;break;}}
        if(lx!==-1&&rx!==-1&&rx>=lx){
          const midX=(lx+rx)/2;
          const ndx=(midX-this.sCX)/(SIZE*0.8);
          const ndy=(y-this.sCY)/(SIZE*0.8);
          const d=Math.sqrt(ndx*ndx+ndy*ndy);
          const t=Math.max(0,1-d);
          const lh=this.MIN_H+t*(this.MAX_H-this.MIN_H);
          this.ctx.fillStyle=`rgba(${this.LINE_COLOR},1)`;
          this._drawRoundedBottom(lx,y,rx-lx,lh,RADIUS);
        }
      }
    }
  }

  // =========================================================================
  // FOREGROUND: RHOMBUS
  // =========================================================================

  _buildRhombusLines() {
    const {W,H,DPR,COLS,COL_W,LINE_GAP,THRESHOLD,MIN_H,MAX_H} = this;
    const vbW=this.shapeViewBox.w, vbH=this.shapeViewBox.h;
    const scale=W/vbW;
    const offsetX=(W-vbW*scale)/2;
    const offsetY=(H-vbH*scale)/2;

    const tmp=document.createElement('canvas');
    tmp.width=W*DPR; tmp.height=H*DPR;
    const tCtx=tmp.getContext('2d');
    tCtx.scale(DPR,DPR);
    tCtx.translate(offsetX,offsetY);
    tCtx.scale(scale,scale);
    tCtx.fillStyle='white';
    tCtx.fill(new Path2D(this.shapePath));

    const imgData=tCtx.getImageData(0,0,W*DPR,H*DPR);
    const d=imgData.data;
    const stride=Math.round(W*DPR);
    const px2css=(v)=>v/DPR;

    let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
    for(let py=0;py<H*DPR;py++){
      for(let px=0;px<W*DPR;px++){
        if(d[(py*stride+px)*4+3]>10){
          if(px<x0)x0=px; if(px>x1)x1=px;
          if(py<y0)y0=py; if(py>y1)y1=py;
        }
      }
    }

    const cssx0=px2css(x0),cssx1=px2css(x1);
    const cssy0=px2css(y0),cssy1=px2css(y1);
    const shapeCX=(cssx0+cssx1)/2;
    const shapeHalfW=(cssx1-cssx0)/2;
    const shapeHalfH=(cssy1-cssy0)/2;
    this.shapeMinX=cssx0; this.shapeMaxX=cssx1;

    const getA=(cx,cy)=>{
      const px=Math.round(Math.max(0,Math.min(W*DPR-1,cx*DPR)));
      const py=Math.round(Math.max(0,Math.min(H*DPR-1,cy*DPR)));
      return d[(py*stride+px)*4+3]/255;
    };

    const lines=[];
    for(let col=0;col<COLS;col++) lines.push([]);

    for(let col=0;col<COLS;col++){
      const colX=this.colXCache[col];
      const colEnd=colX+COL_W;
      if(colEnd<cssx0||colX>cssx1) continue;
      const snapStart=this._snapY(cssy0);
      for(let y=snapStart;y<=cssy1;y+=LINE_GAP){
        let lx=-1,rx=-1;
        for(let px=colX;px<=colEnd;px++){if(getA(px,y)>THRESHOLD){lx=px;break;}}
        for(let px=colEnd;px>=colX;px--){if(getA(px,y)>THRESHOLD){rx=px;break;}}
        if(lx===-1||rx===-1||rx<lx) continue;
        const midX=(lx+rx)/2;
        const distH=Math.abs(midX-shapeCX)/Math.max(shapeHalfW,1);
        const ndx=(midX-this.sCX)/Math.max(shapeHalfW,1);
        const ndy=(y-this.sCY)/Math.max(shapeHalfH,1);
        const dist=Math.sqrt(ndx*ndx+ndy*ndy);
        const baseH=MIN_H+Math.max(0,1-dist)*(MAX_H-MIN_H);
        lines[col].push({y,lx,rx,distH,baseH,dist});
      }
    }
    this.rhombusLines=lines;
  }

  _drawRhombus() {
    if(!this.rhombusLines) return;
    const {MIN_H,RADIUS,WAVE_SPEED,COLS} = this;
    const t = this.waveTime;
    const reveal = this.revealProgress;

    for(let col=0;col<COLS;col++){
      for(const {y,lx,rx,distH,baseH,dist} of this.rhombusLines[col]){
        if (dist > reveal) continue;
        const lineReveal = reveal === 0 ? 0 : Math.min(1, (reveal - dist) / Math.max(reveal, 0.001));
        const phase = t * WAVE_SPEED - distH * 0.5;
        const sine  = (Math.sin(phase * Math.PI * 2) + 1) / 2;
        const breathH = baseH * 0.4 + sine * baseH * 0.6;
        const revealH = MIN_H + lineReveal * (baseH - MIN_H);
        const lh = reveal < 1 ? revealH : breathH;
        this.ctx.fillStyle=`rgba(${this.LINE_COLOR},1)`;
        this._drawRoundedBottom(lx,y,rx-lx,Math.max(MIN_H,lh),RADIUS);
      }
    }
  }

  // =========================================================================
  // FOREGROUND: FLIP
  // =========================================================================

  _buildFlipShapes() {
    const {W,H,DPR} = this;
    this.flipDatas = []; this.flipHalfW = []; this.flipHalfH = [];
    this.flipPaths.forEach((pathStr, i) => {
      const b = this.flipBounds[i];
      const shapeCX = (b.x1 + b.x2) / 2;
      const shapeCY = (b.y1 + b.y2) / 2;
      const offX = this.sCX - shapeCX;
      const offY = this.sCY - shapeCY;
      const oc = document.createElement('canvas');
      oc.width = W * DPR; oc.height = H * DPR;
      const oc2d = oc.getContext('2d');
      oc2d.scale(DPR, DPR);
      oc2d.save();
      oc2d.translate(this.sCX, this.sCY); oc2d.scale(0.8, 0.8); oc2d.translate(-this.sCX, -this.sCY);
      oc2d.translate(offX, offY);
      oc2d.fillStyle = 'white';
      oc2d.fill(new Path2D(pathStr));
      oc2d.restore();
      this.flipDatas.push(oc2d.getImageData(0, 0, W * DPR, H * DPR));
      this.flipHalfW.push((b.x2 - b.x1) / 2 * 0.8);
      this.flipHalfH.push((b.y2 - b.y1) / 2 * 0.8);
    });
  }

  _drawFlipLines() {
    if(this.flipDatas.length < 2) return;
    const {W,H,DPR,COLS,COL_W,LINE_GAP,RADIUS,THRESHOLD,MIN_H,MAX_H,FLIP_FOCAL} = this;
    this.flipAngle += this.FLIP_SPEED;
    const cosA = Math.cos(this.flipAngle), sinA = Math.sin(this.flipAngle);
    const currentSign = cosA >= 0 ? 1 : -1;
    if (currentSign !== this.flipLastSign) { this.flipIdx = 1 - this.flipIdx; this.flipLastSign = currentSign; }
    const data = this.flipDatas[this.flipIdx], halfW = this.flipHalfW[this.flipIdx], halfH = this.flipHalfH[this.flipIdx];
    const stride = W * DPR;
    const getAlpha = (x, y) => { const px=Math.round(Math.max(0,Math.min(W*DPR-1,x*DPR))); const py=Math.round(Math.max(0,Math.min(H*DPR-1,y*DPR))); return data.data[(py*stride+px)*4+3]/255; };
    const edgeZ = halfW * sinA, perspScale = FLIP_FOCAL / (FLIP_FOCAL + edgeZ);
    const screenHalfW = halfW * Math.abs(cosA) * perspScale;
    if (screenHalfW < 0.5) return;
    const scanL = Math.floor(this.sCX - halfW), scanR = Math.ceil(this.sCX + halfW), scaleX = screenHalfW / halfW;
    for (let col = 0; col < COLS; col++) {
      const colX = this.colXCache[col], colEnd = colX + COL_W;
      if (colEnd < this.sCX - screenHalfW || colX > this.sCX + screenHalfW) continue;
      for (let y = 0; y <= H; y += LINE_GAP) {
        let leftShapeX = -1, rightShapeX = -1;
        for (let sx = scanL; sx <= scanR; sx++) { if (getAlpha(sx, y) > THRESHOLD) { leftShapeX = sx; break; } }
        for (let sx = scanR; sx >= scanL; sx--) { if (getAlpha(sx, y) > THRESHOLD) { rightShapeX = sx; break; } }
        if (leftShapeX === -1 || rightShapeX === -1) continue;
        const screenLeft = this.sCX + (leftShapeX - this.sCX) * scaleX;
        const screenRight = this.sCX + (rightShapeX - this.sCX) * scaleX;
        const leftX = Math.max(screenLeft, colX), rightX = Math.min(screenRight, colEnd);
        if (rightX <= leftX) continue;
        const midX = (leftX + rightX) / 2;
        const ndx = (midX - this.sCX) / Math.max(screenHalfW, 1), ndy = (y - this.sCY) / halfH;
        const d = Math.sqrt(ndx*ndx + ndy*ndy), t = Math.max(0, 1 - d);
        const lh = MIN_H + t * (MAX_H - MIN_H);
        this.ctx.fillStyle = `rgba(${this.LINE_COLOR},1)`;
        this._drawRoundedBottom(leftX, y, rightX - leftX, lh, RADIUS);
      }
    }
  }

  // =========================================================================
  // FOREGROUND: GYRO
  // =========================================================================

  _initGyro() {
    const s = this.GYRO_SLOW;
    this.gyroRings = [
      { speed:  0.007*s, driftX:  0.007*s, driftZ:  0.005*s },
      { speed: -0.011*s, driftX: -0.009*s, driftZ:  0.011*s },
      { speed:  0.009*s, driftX:  0.008*s, driftZ: -0.007*s },
      { speed: -0.006*s, driftX: -0.006*s, driftZ: -0.009*s },
    ];
    this.gyroRings.forEach((ring, i) => {
      ring.angle = Math.random() * Math.PI * 2;
      const axisXOffsets = [0.4, 1.1, 1.7, 2.6];
      const axisZTargets = [0.2, 0.8, 0.4, 1.1];
      ring.axisX = Math.PI / 2 + axisXOffsets[i];
      ring.axisZ = axisZTargets[i];
    });
  }

  _renderGyro() {
    if (!this.gyroRings) return;
    const { W, H, DPR } = this;
    const RING_R = Math.min(W, H) * 0.36 * this.gyroScale;
    if (RING_R < 0.5) return null;
    const STEPS = 180, fCtx = this.fCtx, reveal = this.gyroReveal;
    fCtx.clearRect(0, 0, W*DPR, H*DPR);
    fCtx.save(); fCtx.scale(DPR, DPR);
    fCtx.strokeStyle = 'white'; fCtx.lineWidth = this.GYRO_STROKE; fCtx.lineCap = 'round';
    const FOCAL = 900;
    this.gyroRings.forEach(ring => {
      ring.angle += ring.speed;
      if (reveal >= 1) { ring.axisX += ring.driftX; ring.axisZ += ring.driftZ; }
      const startAxisX = Math.PI / 2;
      const displayAxisX = startAxisX + (ring.axisX - startAxisX) * reveal;
      const displayAxisZ = ring.axisZ * reveal;
      const displayAngle = ring.angle;
      fCtx.beginPath();
      for (let st = 0; st <= STEPS; st++) {
        const a = (st / STEPS) * Math.PI * 2;
        let v = [RING_R * Math.cos(a), RING_R * Math.sin(a), 0];
        let [x,y,z] = v;
        v = [x, y*Math.cos(displayAxisX)-z*Math.sin(displayAxisX), y*Math.sin(displayAxisX)+z*Math.cos(displayAxisX)];
        [x,y,z] = v;
        v = [x*Math.cos(displayAxisZ)-y*Math.sin(displayAxisZ), x*Math.sin(displayAxisZ)+y*Math.cos(displayAxisZ), z];
        [x,y,z] = v;
        v = [x*Math.cos(displayAngle)+z*Math.sin(displayAngle), y, -x*Math.sin(displayAngle)+z*Math.cos(displayAngle)];
        [x,y,z] = v;
        const s = FOCAL / (FOCAL + z + 300);
        const sx = this.sCX + x*s;
        const snappedCY = Math.round(this.sCY / this.LINE_GAP) * this.LINE_GAP;
        const sy = snappedCY + y*s;
        st === 0 ? fCtx.moveTo(sx, sy) : fCtx.lineTo(sx, sy);
      }
      fCtx.closePath(); fCtx.stroke();
    });
    fCtx.restore();
    return RING_R;
  }

  _drawGyroLines(RING_R) {
    const { W, H, DPR, COLS, COL_W, LINE_GAP, RADIUS, THRESHOLD } = this;
    const data = this.fCtx.getImageData(0, 0, W*DPR, H*DPR), stride = Math.round(W * DPR);
    const getAlpha = (x, y) => { const px=Math.round(Math.max(0,Math.min(W*DPR-1,x*DPR))); const py=Math.round(Math.max(0,Math.min(H*DPR-1,y*DPR))); return data.data[(py*stride+px)*4+3]/255; };
    const getSegments = (colX, colEnd, y) => {
      const segs = []; let inSeg = false, start = -1;
      for (let px = colX; px <= colEnd; px++) {
        const a = getAlpha(px, y);
        if (a > THRESHOLD && !inSeg) { inSeg = true; start = px; }
        else if (a <= THRESHOLD && inSeg) { inSeg = false; segs.push([start, px-1]); }
      }
      if (inSeg) segs.push([start, colEnd]);
      return segs;
    };
    for (let col = 0; col < COLS; col++) {
      const colX = this.colXCache[col], colEnd = colX + COL_W;
      for (let y = 0; y <= H; y += LINE_GAP) {
        const segs = getSegments(colX, colEnd, y);
        segs.forEach(([lx, rx]) => {
          const midX = (lx + rx) / 2;
          const ndx = (midX - this.sCX) / RING_R, ndy = (y - this.sCY) / RING_R;
          const t = Math.max(0, 1 - Math.sqrt(ndx*ndx + ndy*ndy));
          const lh = this.MIN_H + t * (this.MAX_H - this.MIN_H);
          this.ctx.fillStyle = `rgba(${this.LINE_COLOR},1)`;
          this._drawRoundedBottom(lx, y, rx-lx, lh, RADIUS);
        });
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

  _drawGlobeDecor(fCtx, GLOBE_R, GLOBE_CY, GLOBE_CX) {
    const sCX = GLOBE_CX !== undefined ? GLOBE_CX : this.sCX;
    const sCY = GLOBE_CY;
    const rem = this._rem || 50;
    const color = `rgb(${this.LINE_COLOR})`;
    const ARC_R      = GLOBE_R + rem * 0.56;
    const ARC_STROKE = rem * 0.12;
    const TICK_SPAN  = rem * 0.2;

    if (this.arcReveal > 0) {
      const arcBottom = sCY + ARC_R + TICK_SPAN + 10;
      const arcTop    = sCY - ARC_R - TICK_SPAN - 10;
      const clipTop   = arcBottom - this.arcReveal * (arcBottom - arcTop);
      fCtx.save();
      fCtx.beginPath();
      fCtx.rect(0, clipTop, this.W, arcBottom - clipTop + 10);
      fCtx.clip();
      fCtx.strokeStyle = color; fCtx.lineWidth = ARC_STROKE; fCtx.lineCap = 'round';
      fCtx.beginPath(); fCtx.arc(sCX, sCY, ARC_R, Math.PI * 0.62, Math.PI * 1.18, false); fCtx.stroke();
      this._drawArcTick(fCtx, sCX, sCY, ARC_R, Math.PI * 0.62,  0.07, TICK_SPAN, ARC_STROKE);
      this._drawArcTick(fCtx, sCX, sCY, ARC_R, Math.PI * 1.18, -0.07, TICK_SPAN, ARC_STROKE);
      fCtx.beginPath(); fCtx.arc(sCX, sCY, ARC_R, Math.PI * 1.82, Math.PI * 2.38, false); fCtx.stroke();
      this._drawArcTick(fCtx, sCX, sCY, ARC_R, Math.PI * 1.82,  0.07, TICK_SPAN, ARC_STROKE);
      this._drawArcTick(fCtx, sCX, sCY, ARC_R, Math.PI * 2.38, -0.07, TICK_SPAN, ARC_STROKE);
      fCtx.restore();
    }

    if (this.plinthReveal > 0) {
      const PLINTH_GAP    = rem * 0.44;
      const PLINTH_Y      = sCY + GLOBE_R + PLINTH_GAP;
      const PLINTH_W      = GLOBE_R * 1.2 * this.plinthReveal;
      const PLINTH_H      = rem * 0.36;
      const PLINTH_STEP_W = GLOBE_R * 0.85 * this.plinthReveal;
      const PLINTH_STEP_H = rem * 0.22;
      fCtx.fillStyle = color;
      fCtx.fillRect(sCX - PLINTH_STEP_W/2, PLINTH_Y,                 PLINTH_STEP_W, PLINTH_STEP_H);
      fCtx.fillRect(sCX - PLINTH_W/2,      PLINTH_Y + PLINTH_STEP_H, PLINTH_W,      PLINTH_H);
    }
  }

  _drawArcTick(o, cx, cy, r, angle, dAngle, tickSpan, lineWidth) {
    const innerR = r - tickSpan, outerR = r + tickSpan;
    const x1 = cx + innerR * Math.cos(angle), y1 = cy + innerR * Math.sin(angle);
    const x2 = cx + outerR * Math.cos(angle+dAngle), y2 = cy + outerR * Math.sin(angle+dAngle);
    o.lineWidth = lineWidth;
    o.beginPath(); o.moveTo(x1,y1); o.lineTo(x2,y2); o.stroke();
  }

  _renderGlobe() {
    if (!this.globeReady) return;
    const { W, H, DPR } = this;
    const rem = this._rem || 50;

    const GLOBE_R_FULL = rem * 5.21;
    const GLOBE_R      = GLOBE_R_FULL * this.globeRevealScale;
    if (GLOBE_R < 0.5) return null;

    const GLOBE_CX = W / 2;

    const vpH      = window.innerHeight;
    const startTop = (vpH - rem * 12) / 2;
    const GLOBE_CY = startTop + rem * 0.56 + GLOBE_R_FULL + rem * 6;

    const FOCAL = H * 1.1;
    const fCtx  = this.fCtx;

    fCtx.clearRect(0, 0, W*DPR, H*DPR);
    fCtx.save(); fCtx.scale(DPR, DPR);
    fCtx.fillStyle = 'white';

    const cosA = Math.cos(this.globeAngle), sinA = Math.sin(this.globeAngle);
    const cosT = Math.cos(this.GLOBE_TILT),  sinT = Math.sin(this.GLOBE_TILT);

    this.shapeMinX = GLOBE_CX - GLOBE_R_FULL - rem * 0.56 - rem * 0.1 - 10;
    this.shapeMaxX = GLOBE_CX + GLOBE_R_FULL + rem * 0.56 + rem * 0.1 + 10;
    this._globeCY  = GLOBE_CY;
    this._globeCX  = GLOBE_CX;
    this._globeR   = GLOBE_R;
    this._globeFocal = FOCAL;

    this.globeCountries.forEach(ring => {
      const pts = []; let anyVisible = false;
      for (let i = 0; i < ring.length; i++) {
        const [lon, lat] = ring[i];
        const phi = (90 - lat) * Math.PI / 180, theta = lon * Math.PI / 180;
        let x = Math.sin(phi)*Math.cos(theta), y = Math.cos(phi), z = Math.sin(phi)*Math.sin(theta);
        const x1 = x*cosA + z*sinA, z1 = -x*sinA + z*cosA;
        const y2 = y*cosT - z1*sinT, z2 = y*sinT + z1*cosT;
        const rx = x1*GLOBE_R, ry = y2*GLOBE_R, rz = z2*GLOBE_R;
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

    return GLOBE_R_FULL;
  }

  _drawGlobeLines(GLOBE_R) {
    if (!this.globeReady) return;
    const { W, H, DPR, COLS, COL_W, LINE_GAP, RADIUS, THRESHOLD } = this;
    const data = this.fCtx.getImageData(0, 0, W*DPR, H*DPR), stride = Math.round(W * DPR);
    const globeCY = this._globeCY || this.sCY, globeCX = this._globeCX || this.sCX;

    const getAlpha = (x, y) => { const px=Math.round(Math.max(0,Math.min(W*DPR-1,x*DPR))); const py=Math.round(Math.max(0,Math.min(H*DPR-1,y*DPR))); return data.data[(py*stride+px)*4+3]/255; };
    const getSegments = (colX, colEnd, y) => {
      const segs = []; let inSeg = false, start = -1;
      for (let px = colX; px <= colEnd; px++) {
        const a = getAlpha(px, y);
        if (a > THRESHOLD && !inSeg) { inSeg = true; start = px; }
        else if (a <= THRESHOLD && inSeg) { inSeg = false; segs.push([start, px-1]); }
      }
      if (inSeg) segs.push([start, colEnd]);
      return segs;
    };

    for (let col = 0; col < COLS; col++) {
      const colX = this.colXCache[col], colEnd = colX + COL_W;
      if (colEnd < this.shapeMinX || colX > this.shapeMaxX) continue;
      for (let y = 0; y <= H; y += LINE_GAP) {
        const segs = getSegments(colX, colEnd, y);
        segs.forEach(([lx, rx]) => {
          if (rx - lx < 4) return;
          const midX = (lx + rx) / 2;
          const ndx  = (midX - globeCX) / GLOBE_R;
          const ndy  = (y    - globeCY) / GLOBE_R;
          const dist = Math.sqrt(ndx*ndx + ndy*ndy);
          const t    = Math.max(0, 1 - dist * 0.9);
          const lh   = dist >= 1.0 ? this.MIN_H : this.MIN_H + t * (this.MAX_H - this.MIN_H);
          this.ctx.fillStyle = `rgba(${this.LINE_COLOR},1)`;
          this._drawRoundedBottom(lx, y, rx-lx, lh, RADIUS);
        });
      }
    }
  }

  _drawGlobeMarkers() {
    if (!this.globeReady || !this.globeMarkers) return;
    const GLOBE_R = this._globeR;
    if (!GLOBE_R || GLOBE_R < 0.5) return;
    const FOCAL    = this._globeFocal;
    const GLOBE_CX = this._globeCX, GLOBE_CY = this._globeCY;

    const cosA = Math.cos(this.globeAngle), sinA = Math.sin(this.globeAngle);
    const cosT = Math.cos(this.GLOBE_TILT),  sinT = Math.sin(this.GLOBE_TILT);
    const ctx   = this.ctx;
    const green = this.GLOBE_MARKER_COLOR;
    const segW  = 10;
    const segH  = this.MAX_H;
    const snapY = this.LINE_GAP;

    this.globeMarkers.forEach((m, i) => {
      const phi   = (90 - m.lat) * Math.PI / 180;
      const theta = m.lon * Math.PI / 180;
      let x = Math.sin(phi)*Math.cos(theta), y = Math.cos(phi), z = Math.sin(phi)*Math.sin(theta);
      const x1 = x*cosA + z*sinA,  z1 = -x*sinA + z*cosA;
      const y2 = y*cosT - z1*sinT, z2 =  y*sinT + z1*cosT;
      const rz = z2 * GLOBE_R;
      if (rz < -GLOBE_R * 0.1) return;
      const s  = FOCAL / (FOCAL + rz + 300);
      const sx = GLOBE_CX + x1 * GLOBE_R * s;
      const sy = GLOBE_CY + y2 * GLOBE_R * s;
      const snappedY = Math.round(sy / snapY) * snapY;
      const phase = this.waveTime * 2.2 + i * 1.7;
      const blink = (Math.sin(phase) + 1) / 2;
      const alpha = 0.25 + blink * 0.75;
      ctx.fillStyle = `rgba(${green},${alpha})`;
      this._drawRoundedBottom(sx - segW / 2, snappedY, segW, segH, this.RADIUS);
    });
  }

  // =========================================================================
  // FOREGROUND: RING + DIAMOND
  // 4 concentric rings of dots rotating in alternating directions,
  // plus a diamond at centre. Reveal is a simple opacity fade (0→1).
  // Ring dimensions are fixed in rem — canvas clipping is expected and fine.
  // =========================================================================

  _drawRingDiamond() {
    const reveal = this.ringDiamondReveal;
    if (reveal <= 0) return;

    const { W, H, DPR, COLS, COL_W, LINE_GAP, RADIUS, THRESHOLD } = this;
    const rem = this._rem || 50;
    const cx = W / 2, cy = H / 2;

    // Ring config — fixed rem dimensions, canvas may clip outer rings
    const RING_R  = rem * 2.1;   const DOT_R  = rem * 0.137;  // inner  — 12 dots
    const RING_R3 = rem * 3.78;  const DOT_R3 = rem * 0.029;  // middle — 16 tiny dots
    const RING_R2 = rem * 5.25;  const DOT_R2 = rem * 0.239;  // outer  — 16 large dots
    const RING_R4 = rem * 7.35;  const DOT_R4 = rem * 0.137;  // outermost — 15 dots
    const DIAM_R  = rem * 0.263;
    const STROKE  = rem * 0.315;

    // Per-ring rotation — alternating directions, driven by waveTime
    const t    = this.waveTime;
    const rot1 =  t * 0.18;
    const rot2 = -t * 0.10;
    const rot3 =  t * 0.22;
    const rot4 = -t * 0.14;

    // Draw all shapes to offscreen canvas
    const fCtx = this.fCtx;
    fCtx.clearRect(0, 0, W * DPR, H * DPR);
    fCtx.save(); fCtx.scale(DPR, DPR);
    fCtx.fillStyle = 'white';

    // Inner ring — 12 dots
    for (let i = 0; i < 12; i++) {
      const ang = -Math.PI / 2 + (i / 12) * Math.PI * 2 + rot1;
      fCtx.beginPath();
      fCtx.arc(cx + Math.cos(ang) * RING_R, cy + Math.sin(ang) * RING_R, DOT_R + STROKE / 2, 0, Math.PI * 2);
      fCtx.fill();
    }
    // Middle ring — 16 tiny dots
    for (let i = 0; i < 16; i++) {
      const ang = -Math.PI / 2 + (i / 16) * Math.PI * 2 + rot2;
      fCtx.beginPath();
      fCtx.arc(cx + Math.cos(ang) * RING_R3, cy + Math.sin(ang) * RING_R3, DOT_R3 + STROKE / 2, 0, Math.PI * 2);
      fCtx.fill();
    }
    // Outer ring — 16 large dots
    for (let i = 0; i < 16; i++) {
      const ang = -Math.PI / 2 + (i / 16) * Math.PI * 2 + rot3;
      fCtx.beginPath();
      fCtx.arc(cx + Math.cos(ang) * RING_R2, cy + Math.sin(ang) * RING_R2, DOT_R2 + STROKE / 2, 0, Math.PI * 2);
      fCtx.fill();
    }
    // Outermost ring — 15 dots
    for (let i = 0; i < 15; i++) {
      const ang = -Math.PI / 2 + (i / 15) * Math.PI * 2 + rot4;
      fCtx.beginPath();
      fCtx.arc(cx + Math.cos(ang) * RING_R4, cy + Math.sin(ang) * RING_R4, DOT_R4 + STROKE / 2, 0, Math.PI * 2);
      fCtx.fill();
    }
    // Diamond
    const d = DIAM_R + STROKE / 2;
    fCtx.beginPath();
    fCtx.moveTo(cx, cy - d); fCtx.lineTo(cx + d, cy);
    fCtx.lineTo(cx, cy + d); fCtx.lineTo(cx - d, cy);
    fCtx.closePath(); fCtx.fill();

    fCtx.restore();

    // Scan offscreen → draw line segments, applying reveal as globalAlpha
    const data   = fCtx.getImageData(0, 0, W * DPR, H * DPR);
    const stride = Math.round(W * DPR);
    const getAlpha = (x, y) => {
      const px = Math.round(Math.max(0, Math.min(W * DPR - 1, x * DPR)));
      const py = Math.round(Math.max(0, Math.min(H * DPR - 1, y * DPR)));
      return data.data[(py * stride + px) * 4 + 3] / 255;
    };
    const getSegments = (colX, colEnd, y) => {
      const segs = []; let inSeg = false, start = -1;
      for (let px = colX; px <= colEnd; px++) {
        const a = getAlpha(px, y);
        if (a > THRESHOLD && !inSeg)      { inSeg = true; start = px; }
        else if (a <= THRESHOLD && inSeg) { inSeg = false; segs.push([start, px - 1]); }
      }
      if (inSeg) segs.push([start, colEnd]);
      return segs;
    };

    this.ctx.globalAlpha = reveal;
    this.ctx.fillStyle = `rgba(${this.LINE_COLOR},1)`;
    for (let col = 0; col < COLS; col++) {
      const colX = this.colXCache[col], colEnd = colX + COL_W;
      for (let y = 0; y <= H; y += LINE_GAP) {
        getSegments(colX, colEnd, y).forEach(([lx, rx]) => {
          const midX = (lx + rx) / 2;
          const ndx  = (midX - cx) / RING_R2;
          const ndy  = (y    - cy) / RING_R2;
          const t    = Math.max(0, 1 - Math.sqrt(ndx * ndx + ndy * ndy));
          const lh   = this.MIN_H + t * (this.MAX_H - this.MIN_H);
          this._drawRoundedBottom(lx, y, rx - lx, lh, RADIUS);
        });
      }
    }
    this.ctx.globalAlpha = 1;
  }

  // =========================================================================
  // FOREGROUND: BANK ACCOUNTS — currency flip (Dollar → Euro → Yen)
  // =========================================================================

  _drawBankAccounts() {
    if (this.bankAccountsReveal <= 0) return;
    const { W, H, DPR, COLS, COL_W, LINE_GAP, RADIUS, THRESHOLD, MAX_H } = this;
    const fCtx = this.fCtx;

    const CURRENCIES = [
      { path: 'M74.3281 0V0.296875H82.0078V22.8691C88.009 23.9079 93.8639 25.7087 99.4277 28.2373C108.101 32.0129 115.576 38.0892 121.045 45.8076C126.328 53.5862 129.179 62.7603 129.234 72.1631H99.6475C99.4086 68.6207 98.3935 65.1741 96.6748 62.0674C94.9561 58.9606 92.5753 56.2691 89.7012 54.1846C87.3116 52.5082 84.7246 51.1546 82.0078 50.1484V98.4814C88.4565 99.9872 94.7671 102.034 100.871 104.604C106.71 107.054 112.154 110.353 117.029 114.394C121.635 118.195 125.378 122.933 128.011 128.293C130.761 134.147 132.124 140.558 131.995 147.024C132.191 156.54 129.476 165.888 124.214 173.818C118.656 181.811 110.91 188.032 101.906 191.733C95.5292 194.432 88.8405 196.291 82.0078 197.274V219.297H74.3281V219.72H59.0479V219.297H50.0078V196.956C43.7974 195.949 37.7128 194.231 31.877 191.827C22.5442 188.031 14.5273 181.585 8.81641 173.285C3.1171 164.535 0.0565012 154.329 0 143.887H30.2139C30.4536 149.538 32.3531 154.995 35.6738 159.574C39.0158 163.847 43.4804 167.106 48.5684 168.986C49.0453 169.166 49.5256 169.337 50.0078 169.5V118.369C35.5379 114.706 24.3803 109.198 16.5352 101.844C12.5295 98.0829 9.37517 93.5077 7.28613 88.4258C5.19714 83.344 4.22131 77.8735 4.42383 72.3828C4.23877 62.886 7.08506 53.5768 12.5498 45.8076C18.2352 38.0429 25.9244 31.9694 34.7949 28.2373C39.682 26.0444 44.783 24.3886 50.0078 23.291V0.296875H59.0479V0H74.3281ZM82.0078 170.027C82.9184 169.752 83.8209 169.447 84.7129 169.112C89.501 167.372 93.7291 164.369 96.9492 160.421C99.8662 156.737 101.428 152.162 101.373 147.463C101.492 143.456 100.129 139.546 97.5449 136.481C94.5821 133.216 90.9269 130.654 86.8467 128.983C85.2511 128.295 83.6371 127.651 82.0078 127.049V170.027ZM50.0078 50.8115C45.7583 52.4979 42.0252 55.2716 39.1875 58.8594C36.622 62.2516 35.2634 66.4046 35.3281 70.6572C35.1722 74.848 36.6583 78.9342 39.4697 82.0459C42.4511 85.1494 46.0393 87.6026 50.0078 89.2598V50.8115Z', fillRule: 'evenodd', vw: 132, vh: 220 },
      { path: 'M98.0473 133.954V140.637C98.1383 141.655 98.0272 142.681 97.7202 143.655C97.4133 144.63 96.9167 145.534 96.2589 146.316C95.4722 146.976 94.5626 147.474 93.5826 147.781C92.6025 148.088 91.5714 148.198 90.5487 148.105H32.5046C33.2576 147.76 34.0107 147.414 34.7637 147.007C38.4952 145.032 41.6515 142.124 43.9252 138.567C46.3388 134.421 47.4331 129.639 47.0627 124.856L46.1842 98.9712H92.9645V77.7929H45.6508L44.8665 55.2342C44.5936 49.8727 45.5041 44.5168 47.5333 39.5466C49.3747 35.3127 52.5035 31.7667 56.4753 29.4125C61.0894 26.8414 66.3194 25.5827 71.5981 25.773C74.7963 25.6219 77.9918 26.1225 80.9906 27.2444C83.9894 28.3662 86.7289 30.0859 89.0426 32.299C93.7049 37.3639 96.4852 43.8771 96.9178 50.7476L125.155 47.2963C124.243 38.3403 121.128 29.7494 116.088 22.2903C111.325 15.2798 104.844 9.60836 97.2629 5.81836C89.1575 1.86895 80.237 -0.119351 71.2216 0.0139613C60.9387 -0.206638 50.7685 2.19017 41.6662 6.97924C33.3148 11.4672 26.4639 18.3072 21.9626 26.6515C17.136 35.82 14.9628 46.1532 15.6876 56.4892L16.6602 77.7616H0V98.9398H17.6642L18.982 128.401C19.3208 131.027 19.102 133.695 18.3397 136.23C17.5774 138.766 16.2888 141.112 14.5581 143.116C12.5953 144.889 10.293 146.247 7.79063 147.103C5.28826 147.961 2.63788 148.301 0 148.105L0 173.895H91.1448C102.733 173.895 111.413 171.019 117.186 165.267C122.991 159.494 125.877 151.117 125.877 140.167V133.954H98.0473Z', vw: 126, vh: 174 },
      { path: 'M126.128 0H93.9999L63.0013 72.2883L32.0026 0H0L39.6896 84.1168H10.6048V102.879H47.5333V117.249H10.6048V136.011H47.5333V171.465H77.779V136.011H113.107V117.249H77.779V102.879H113.107V84.1168H86.1561L126.128 0Z', vw: 127, vh: 172 },
    ];

    const HOLD = 1.8, FLIP_DUR = 0.65;
    const CYCLE = HOLD + FLIP_DUR, N = CURRENCIES.length;
    const easeOutCubic3 = (t) => 1 - Math.pow(1-t, 3);
    const reveal = this.bankAccountsReveal;
    const t      = this.productTime;

    // Render one currency to fCtx
    const renderCurrency = (idx, scaleX, scale) => {
      const cur = CURRENCIES[idx];
      fCtx.clearRect(0, 0, W*DPR, H*DPR);
      fCtx.save(); fCtx.scale(DPR, DPR);
      const TARGET = Math.min(W, H) * 0.44 * scale;
      const gs = Math.min(TARGET / cur.vw, TARGET / cur.vh);
      const gw = cur.vw * gs, gh = cur.vh * gs;
      fCtx.save();
      fCtx.translate(W/2, H/2); fCtx.scale(scaleX, 1);
      fCtx.translate(-gw/2, -gh/2); fCtx.scale(gs, gs);
      fCtx.fillStyle = 'white';
      const p2d = new Path2D(cur.path);
      if (cur.fillRule) fCtx.fill(p2d, cur.fillRule); else fCtx.fill(p2d);
      fCtx.restore(); fCtx.restore();
    };

    const scanAndDrawBA = () => {
      const data = fCtx.getImageData(0, 0, W*DPR, H*DPR), stride = Math.round(W*DPR);
      const getA = (x, y) => { const px=Math.round(Math.max(0,Math.min(W*DPR-1,x*DPR))); const py=Math.round(Math.max(0,Math.min(H*DPR-1,y*DPR))); return data.data[(py*stride+px)*4+3]/255; };
      this.ctx.fillStyle = `rgba(${this.LINE_COLOR},${reveal})`;
      for (let col = 0; col < COLS; col++) {
        const colX = this.colXCache[col], colEnd = colX + COL_W;
        for (let y = 0; y <= H; y += LINE_GAP) {
          const segs = []; let inSeg = false, start = -1;
          for (let px = colX; px <= colEnd; px++) { const a = getA(px,y); if(a>THRESHOLD&&!inSeg){inSeg=true;start=px;}else if(a<=THRESHOLD&&inSeg){inSeg=false;segs.push([start,px-1]);} }
          if (inSeg) segs.push([start, colEnd]);
          segs.forEach(([lx,rx]) => this._drawRoundedBottom(lx, y, rx-lx, MAX_H, RADIUS));
        }
      }
    };

    if (reveal < 1) {
      renderCurrency(0, 1, easeOutCubic3(reveal));
      scanAndDrawBA();
    } else {
      const cyclePos = t % (CYCLE * N);
      const curIdx = Math.floor(cyclePos / CYCLE) % N;
      const cycleT = cyclePos % CYCLE;
      if (cycleT < HOLD) {
        renderCurrency(curIdx, 1, 1); scanAndDrawBA();
      } else {
        const flipT = (cycleT - HOLD) / FLIP_DUR;
        if (flipT < 0.5) { renderCurrency(curIdx, 1 - easeOutCubic3(flipT*2), 1); }
        else             { renderCurrency((curIdx+1)%N, easeOutCubic3((flipT-0.5)*2), 1); }
        scanAndDrawBA();
      }
    }
  }

  // =========================================================================
  // FOREGROUND: DIGITAL ASSET — 6 cubes merge into 1, then rotate
  // =========================================================================

  _drawDigitalAsset() {
    if (this.digitalAssetReveal <= 0) return;
    const { W, H, DPR, COLS, COL_W, LINE_GAP, RADIUS, THRESHOLD, MAX_H } = this;
    const fCtx = this.fCtx;
    const ctx  = this.ctx;
    const t    = this.productTime;
    const reveal = this.digitalAssetReveal;

    const LINE_H_L = MAX_H * 0.25, LINE_H_T = MAX_H * 0.50, LINE_H_R = MAX_H * 1.00;
    const easeInOut = (t) => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
    const easeOut3  = (t) => 1 - Math.pow(1-t, 3);

    const projectV = (v, cx, cy, s) => [
      cx + (v[0] - v[2]) * Math.cos(Math.PI/6) * s,
      cy + (-v[1] + (v[0] + v[2]) * Math.sin(Math.PI/6)) * s,
    ];
    const rotYv = (v, a) => [v[0]*Math.cos(a)+v[2]*Math.sin(a), v[1], -v[0]*Math.sin(a)+v[2]*Math.cos(a)];

    const drawFaceDA = (pts) => {
      fCtx.clearRect(0, 0, W*DPR, H*DPR);
      fCtx.save(); fCtx.scale(DPR, DPR);
      fCtx.fillStyle = 'white';
      fCtx.beginPath(); fCtx.moveTo(pts[0][0], pts[0][1]);
      for (let i=1; i<pts.length; i++) fCtx.lineTo(pts[i][0], pts[i][1]);
      fCtx.closePath(); fCtx.fill(); fCtx.restore();
    };

    const scanDA = (lineH) => {
      const data = fCtx.getImageData(0,0,W*DPR,H*DPR), stride = Math.round(W*DPR);
      const getA = (x,y) => { const px=Math.round(Math.max(0,Math.min(W*DPR-1,x*DPR))); const py=Math.round(Math.max(0,Math.min(H*DPR-1,y*DPR))); return data.data[(py*stride+px)*4+3]/255; };
      ctx.fillStyle = `rgba(${this.LINE_COLOR},${reveal})`;
      for (let col=0; col<COLS; col++) {
        const colX = this.colXCache[col], colEnd = colX+COL_W;
        for (let y=0; y<=H; y+=LINE_GAP) {
          const segs=[]; let inSeg=false, start=-1;
          for (let px=colX; px<=colEnd; px++) { const a=getA(px,y); if(a>THRESHOLD&&!inSeg){inSeg=true;start=px;}else if(a<=THRESHOLD&&inSeg){inSeg=false;segs.push([start,px-1]);} }
          if (inSeg) segs.push([start,colEnd]);
          segs.forEach(([lx,rx]) => this._drawRoundedBottom(lx,y,rx-lx,lineH,RADIUS));
        }
      }
    };

    const drawCubeDA = (cx, cy, s, rotX=0) => {
      if (s < 0.5) return;
      const raw = [[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1],[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]];
      const v = raw.map(p => projectV(rotYv(p, rotX), cx, cy, s));
      const cosA = Math.cos(rotX), sinA = Math.sin(rotX);
      const topFace = [v[0],v[1],v[2],v[3]];
      const faces = [];
      if (cosA - sinA > 0) faces.push({ pts:[v[1],v[2],v[6],v[5]], lh:LINE_H_R });
      if (sinA - cosA > 0) faces.push({ pts:[v[0],v[3],v[7],v[4]], lh:LINE_H_R });
      if (sinA + cosA > 0) faces.push({ pts:[v[3],v[2],v[6],v[7]], lh:LINE_H_L });
      if (-sinA - cosA > 0) faces.push({ pts:[v[0],v[1],v[5],v[4]], lh:LINE_H_L });
      faces.filter(f=>f.lh===LINE_H_L).forEach(f=>{drawFaceDA(f.pts);scanDA(f.lh);});
      drawFaceDA(topFace); scanDA(LINE_H_T);
      faces.filter(f=>f.lh===LINE_H_R).forEach(f=>{drawFaceDA(f.pts);scanDA(f.lh);});
    };

    const BIG_S   = Math.min(W, H) * 0.16;
    const SMALL_S = BIG_S / 3;
    const SCATTER_R = BIG_S * 3.5;
    const STAGGER  = 0.22, MOVE_DUR = 0.55;
    const REVEAL_END = 5 * STAGGER + MOVE_DUR;
    const HOLD_DUR = 1.2, ROT_DUR = 1.8, LOOP_DUR = HOLD_DUR + ROT_DUR;

    const ANGLES = [-Math.PI/2, -Math.PI/2+Math.PI/3, -Math.PI/2+Math.PI*2/3, -Math.PI/2+Math.PI, -Math.PI/2+Math.PI*4/3, -Math.PI/2+Math.PI*5/3];
    const GRID   = [[0,0],[1,0],[0,1],[1,1],[0,2],[1,2]];

    let totalProgress = 0;
    GRID.forEach((_, i) => {
      const el = Math.max(0, t - i*STAGGER);
      totalProgress += easeInOut(Math.min(1, el/MOVE_DUR));
    });
    const mergeScale = totalProgress / GRID.length;
    const bigCubeS   = BIG_S * mergeScale;
    const cx = W/2, cy = H/2;

    // Flying small cubes
    GRID.forEach((_, i) => {
      const el = Math.max(0, t - i*STAGGER);
      const tt = Math.min(1, el/MOVE_DUR);
      const eased = easeInOut(tt);
      const ang = ANGLES[i];
      const sx = cx + Math.cos(ang)*SCATTER_R, sy = cy + Math.sin(ang)*SCATTER_R*0.6;
      const px = sx + (cx-sx)*eased, py = sy + (cy-sy)*eased;
      const alpha = 1 - eased;
      if (alpha > 0.01) { ctx.globalAlpha = alpha*reveal; drawCubeDA(px, py, SMALL_S, 0); ctx.globalAlpha = 1; }
    });

    // Growing + rotating merged cube
    if (bigCubeS > 0.5) {
      let rotX = 0;
      if (t > REVEAL_END) {
        const loopTime   = t - REVEAL_END;
        const cycleIdx   = Math.floor(loopTime / LOOP_DUR);
        const cycleLocal = loopTime % LOOP_DUR;
        const baseAngle  = cycleIdx * Math.PI / 2;
        rotX = cycleLocal > HOLD_DUR
          ? baseAngle + easeInOut((cycleLocal - HOLD_DUR) / ROT_DUR) * Math.PI / 2
          : baseAngle;
      }
      drawCubeDA(cx, cy, bigCubeS, rotX);
    }
  }

  // =========================================================================
  // MAIN LOOP
  // =========================================================================

  _tick(ts) {
    if(this.lastTs!==null) this.waveTime+=(ts-this.lastTs)/1000;
    this.lastTs=ts;
    this.angle+=0.009;

    const {W,H,DPR,COLS,COL_W,GAP,LINE_GAP,LINES,RADIUS,
           SIZE_RATIO,TRAIL_LEN,LERP,BG_OPACITY,VEL_DECAY,VEL_SCALE} = this;
    const BG_OPACITY_LINE = this.LINE_COLOR;
    const SIZE=H*SIZE_RATIO, FOCAL=H*1.1;
    const ctx=this.ctx;

    if(this.targetX>=0){
      this.smoothX+=(this.targetX-this.smoothX)*LERP;
      this.smoothY+=(this.targetY-this.smoothY)*LERP;
      if(this.prevSmoothX>=0){
        const dx=this.smoothX-this.prevSmoothX, dy=this.smoothY-this.prevSmoothY;
        this.velocity+=(Math.sqrt(dx*dx+dy*dy)-this.velocity)*0.2;
      }
      this.prevSmoothX=this.smoothX; this.prevSmoothY=this.smoothY;
    }
    this.velocity*=VEL_DECAY;
    const velStrength=Math.min(this.velocity*VEL_SCALE,1);

    if(velStrength>0.01&&this.smoothX>=0){
      this.trail.push({x:this.smoothX,y:this.smoothY,v:velStrength});
      if(this.trail.length>TRAIL_LEN) this.trail.shift();
    } else {
      if(this.trail.length>0) this.trail.shift();
    }

    this.trail.forEach((pt,ti)=>{
      const strength=Math.pow(ti/this.trail.length,2)*pt.v;
      for(let col=0;col<COLS;col++){
        const colMid=this.colXCache[col]+COL_W/2;
        const colDist=Math.abs(pt.x-colMid)/(COL_W+GAP);
        const cf=Math.exp(-colDist*colDist*1.5);
        if(cf<0.01) continue;
        const li0=Math.round(pt.y/LINE_GAP);
        for(let li=li0-2;li<=li0+2;li++){
          if(li<0||li>=LINES) continue;
          const lf=Math.exp(-Math.pow((li-li0)/2,2)*4);
          this.energy[col][li]=Math.max(this.energy[col][li],strength*cf*lf);
        }
      }
    });

    for(let col=0;col<COLS;col++)
      for(let li=0;li<LINES;li++)
        this.energy[col][li]*=0.65;

    let getAlpha=()=>0;
    if(this.foregroundType==='cube'){
      this._renderCube(SIZE,FOCAL);
      const data=this.fCtx.getImageData(0,0,W*DPR,H*DPR);
      const stride=W*DPR;
      getAlpha=(x,y)=>{ const px=Math.round(Math.max(0,Math.min(W*DPR-1,x*DPR))); const py=Math.round(Math.max(0,Math.min(H*DPR-1,y*DPR))); return data.data[(py*stride+px)*4+3]/255; };
    }

    ctx.fillStyle=this.BG_COLOR; ctx.fillRect(0,0,W,H);

    const fracCol     =this.smoothX>=0?this._getFracCol(this.smoothX):-1;
    const hoverLineIdx=this.smoothY>=0?this.smoothY/LINE_GAP:-1;

    for(let col=0;col<COLS;col++){
      const colX=this.colXCache[col];
      const xMul=(fracCol>=0&&velStrength>0.01)?Math.exp(-Math.pow(col-fracCol,2)*1.2)*velStrength:0;
      let y=0,li=0;
      while(y<=H){
        const e=this.energy[col][li]||0;
        ctx.fillStyle=`rgba(${BG_OPACITY_LINE},${BG_OPACITY})`;
        this._drawRoundedBottom(colX,y,COL_W,1,RADIUS);
        if(e>0.01){
          ctx.fillStyle=`rgba(${BG_OPACITY_LINE},1)`;
          this._drawRoundedBottom(colX,y,COL_W,1+e*4,RADIUS);
        } else if(xMul>0.02&&hoverLineIdx>=0){
          const yDist=li-hoverLineIdx, yMul=Math.exp(-yDist*yDist*1.2), influence=xMul*yMul;
          if(influence>0.02){
            const w=COL_W*(0.2+xMul*0.8), colDiff=col-fracCol;
            let xOff;
            if(colDiff<-0.3) xOff=COL_W-w;
            else if(colDiff>0.3) xOff=0;
            else xOff=(COL_W-w)+((colDiff+0.3)/0.6)*(-(COL_W-w));
            ctx.fillStyle=`rgba(${BG_OPACITY_LINE},1)`;
            this._drawRoundedBottom(colX+xOff,y,w,1+influence*3,RADIUS);
          }
        }
        y+=LINE_GAP; li++;
      }
    }

    if(this.foregroundType==='cube')       this._drawCubeLines(getAlpha,SIZE);
    if(this.foregroundType==='rhombus')    this._drawRhombus();
    if(this.foregroundType==='flip')       this._drawFlipLines();
    if(this.foregroundType==='gyro') {
      const gr = this._renderGyro();
      if (gr) this._drawGyroLines(gr);
    }
    if(this.foregroundType==='globe') {
      this._currentGlobeSpeed = this._currentGlobeSpeed || this.GLOBE_SPEED;
      this._currentGlobeSpeed += (this.GLOBE_SPEED - this._currentGlobeSpeed) * 0.05;
      this.globeAngle += this._currentGlobeSpeed;
      const gr = this._renderGlobe();
      if (gr) this._drawGlobeLines(gr);
      this._drawGlobeMarkers();
    }
    if(this.foregroundType==='ringDiamond') this._drawRingDiamond();

    // Product visual switcher — increments productTime while a visual is active
    if (this.productVisual) {
      if(this.lastTs!==null) this.productTime += (ts - this.lastTs) / 1000;
    }
    if(this.productVisual==='bankAccounts') this._drawBankAccounts();
    if(this.productVisual==='digitalAsset') this._drawDigitalAsset();
    if(this.productVisual==='pavenet') {
      const gr = this._renderGyro();
      if (gr) this._drawGyroLines(gr);
    }

    this._rafId=requestAnimationFrame((ts)=>this._tick(ts));
  }

  destroy() {
    cancelAnimationFrame(this._rafId);
    this.canvas.removeEventListener('mousemove',  this._onMouseMove);
    this.canvas.removeEventListener('mouseleave', this._onMouseLeave);
    window.removeEventListener('resize', this._onResize);
    this.canvas.remove();
    LineGrid._instances.delete(this);
  }
}

LineGrid._instances = new Set();
LineGrid.refreshAll = () => { LineGrid._instances.forEach(i => i.refreshColors()); };

// =========================================================================
// CANVAS INSTANCES
// =========================================================================

const grid1 = new LineGrid('#section-1', {
  foregroundType: 'globe',
  bgColor:        '--dark',
  lineColor:      '--white',
  markerColor:    '#77DD84',
});

const grid2 = new LineGrid('#section-2', {
  foregroundType: null,       // product visuals managed via productVisual
  bgColor:        '--dark',
  lineColor:      '--white',
});

// Initialise gyro rings (needed for pavenet visual)
window.addEventListener('load', () => { grid2._initGyro(); });

// Switch grid2 to a product visual. Called from animations.js.
// Instantly hides previous, resets time, GSAP then tweens the reveal prop.
window.switchProductVisual = (visual) => {
  grid2.productVisual      = visual;
  grid2.productTime        = 0;
  grid2.bankAccountsReveal = 0;
  grid2.digitalAssetReveal = 0;
  grid2.gyroScale          = 0;
  grid2.gyroReveal         = 0;
};

const grid3 = new LineGrid('#section-3', {
  foregroundType: 'rhombus',
  waveSpeed:      0.3,
  shapePath:      'M725.428 303.293L1139.5 385.002L725.428 466.714L310.496 385.001L725.428 303.293Z',
  shapeViewBox:   { w: 1450, h: 770 },
  bgColor:        '--dark',
  lineColor:      '--white',
});

new LineGrid('#section-4', {
  foregroundType: null,
  bgColor:        '--white',
  lineColor:      '--dark',
});
