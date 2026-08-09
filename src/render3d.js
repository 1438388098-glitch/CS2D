// src/render3d.js — 第一人称光线投射渲染器（Wolf3D 风格）
// 与 render.js 共用 game 状态；模块顶层零 DOM 依赖（node 可导入纯函数）
import { TILE, DROP_COL, WEAPONS } from './config.js';
import { clamp } from './utils.js';
import { getGrid, getMap, walkableChar, groundElevationAt } from './map.js';
import { weaponDef } from './entities.js';
import { gunLen } from './render-utils.js';
// 主题色板：textures.js 并行新增 themeOf 导出；命名空间导入+兜底，避免链接期缺失炸模块
import * as tex from './textures.js';
// WebGL 后端（GPU 光栅化）：CPU 只做 DDA 几何与 zbuf，光栅化全在 GPU；
// 不可用时（老环境/无 GPU/stubdom 测试）自动回退 Canvas 2D 像素直写
import { initGL3d, gl3dReady, gl3dCanvas, glResize, glBegin, glSky, glFloorRow, glWallColumn, glGroundQuad, glFlush } from './render3d-gl.js';

const FOV_H = Math.PI / 2;
const NEAR = 0.01;
const PITCH_LIMIT = 1.35;
const MAX_FPS_MARKERS = 24;
// B5 开镜过渡插值辅助
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

const FALLBACK_THEME = {
  floor: [36, 39, 44], floorSpots: [90, 85, 75],
  wall: [90, 96, 104], wallSpots: [80, 86, 96],
  crate: [122, 90, 52], crateSpots: [110, 82, 44],
  water: [29, 74, 94], waterSpots: [50, 110, 160],
  mmWall: '#4d545e', mmCrate: '#6d5534', tint: null, deco: [],
  sky: { top: '#1a2230', horizon: '#6b5a3f', sun: [255, 217, 160] }
};

const mapTile = () => (getMap() && getMap().tile) || TILE;

let ctx = null;       // 主画布 2d context
let layers = null;    // 纹理图层（initTextures 返回）
let cv = null, cctx = null;
let iw = 0, ih = 0;   // 离屏画布逻辑尺寸
let skyCv = null, skyCtx = null, skyCvKey = ''; // WebGL 路径的天空画布缓存

// A2 切枪滑动动画（模块级，跨帧维持）
let vmSwap = { key: '', t: 0, lastT: 0 };
// A4 暗角缓存（key=地图 id，尺寸变化时重建）
const vignetteCache = new Map();
// A5 天气粒子画布缓存（key=weather kind）
const weatherCvCache = new Map();
// C2 3D 装饰物画布缓存（key=deco kind，48×48 简绘）
const decoCvCache = new Map();

// E2 特殊格预索引（key=grid 引用；官方图 tile=16 时全窗口遍历约 14,600 格 → 缓存后仅遍历特殊格）
let quadIdxMap = null, quadIdxCache = null;
// E3a 预烘焙暗化纹理：Map(源纹理 canvas → 16 档暗化副本)，消除逐列 globalAlpha 状态切换
let shadeTiles = null, shadeTilesRef = null, shadeTilesBroken = false; // 已废弃占位（保留声明避免遗留引用）
// E3c zbuf 数组复用（覆盖写全部列，避免每帧 new Array 分配）
let zbufArr = null;
let fpsMarkerCache = [];
let fpsMarkerPool = [];

// ===== 纯函数（node 单测用，无 DOM）=====

// 世界点 → 相机空间：depth=前向分量，perp=横向分量，k=1/depth（focal 仅为签名兼容）
export function project3d(cx, cy, angle, focal, wx, wy) {
  const dx = wx - cx, dy = wy - cy;
  const depth = dx * Math.cos(angle) + dy * Math.sin(angle);
  const perp = -dx * Math.sin(angle) + dy * Math.cos(angle);
  return { depth, perp, k: 1 / depth };
}

export function pitchScreenHorizon(centerY, focal, pitch) {
  return centerY + focal * Math.tan(pitch);
}

export function projectPitchPoint(cx, cy, yaw, pitch, focal, eyeH, centerX, centerY, wx, wy, wz = 0) {
  const dx = wx - cx, dy = wy - cy;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const depth = dx * cos + dy * sin;
  if (depth < NEAR) return null;
  const perp = -dx * sin + dy * cos;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const dz = wz - eyeH;
  const camDepth = depth * cp + dz * sp;
  if (camDepth < NEAR) return null;
  const up = -depth * sp + dz * cp;
  return {
    sx: centerX + perp / camDepth * focal,
    sy: centerY - up / camDepth * focal,
    depth,
    perp,
    camDepth
  };
}

// 瓦片字符 → 墙高系数（'#'1.0，'='0.55，'C'0.55，'o'0.45，默认 1.0）
export function wallHeightFor(char) {
  if (char === '=' || char === 'C') return 0.55;
  if (char === 'o') return 0.45;
  return 1.0;
}

// DDA 光线投射：沿射线步进到阻挡格（!walkableChar）或地图外；side 0=竖墙(撞x边)/1=横墙(撞y边)；
// u=命中边纹理坐标 0..1；超 maxDist 或无命中 → null；起点在墙内 → dist 0（渲染层钳制）
export function wallDist(grid, x0, y0, angle, tile, maxDist) {
  if (!grid || !grid.length) return null;
  const h = grid.length, w = h ? grid[0].length : 0;
  const mx = Math.floor(x0 / tile), my = Math.floor(y0 / tile);
  if (mx < 0 || my < 0 || mx >= w || my >= h || !walkableChar(grid[my][mx])) {
    return { dist: 0, tx: mx, ty: my, side: 0, u: 0, char: '#' };
  }
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
  // 全部以像素计：跨一格的前向距离 = tile/|dir 分量|，初始边距 = 到最近边界的像素距离
  const adx = Math.max(Math.abs(dx), 1e-9), ady = Math.max(Math.abs(dy), 1e-9);
  const deltaX = tile / adx, deltaY = tile / ady;
  // 平行方向永不跨边界：sideDist=Infinity（浮点零容差，避免轴对齐光线在角落平局时误步进）
  const zeroX = Math.abs(dx) < 1e-12, zeroY = Math.abs(dy) < 1e-12;
  let sideX = zeroX ? Infinity : (dx > 0 ? ((mx + 1) * tile - x0) : (x0 - mx * tile)) / adx;
  let sideY = zeroY ? Infinity : (dy > 0 ? ((my + 1) * tile - y0) : (y0 - my * tile)) / ady;
  let tx = mx, ty = my, side = 0;
  for (let i = 0; i < 512; i++) {
    // 先取当前最近边界距离 d，再步进（d 即进入新格的垂直距离）
    let d;
    if (sideX < sideY) { d = sideX; tx += stepX; side = 0; sideX += deltaX; }
    else { d = sideY; ty += stepY; side = 1; sideY += deltaY; }
    if (d > maxDist) return null;
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) {
      return { dist: d, tx, ty, side, u: 0, char: '#' };
    }
    const c = grid[ty][tx];
    if (!walkableChar(c)) {
      // 命中点沿墙面的坐标分量即纹理 u（y 轴向下约定）
      const hit = side === 0 ? y0 + d * dy : x0 + d * dx;
      const u = clamp(hit / tile - Math.floor(hit / tile), 0, 1);
      return { dist: d, tx, ty, side, u, char: c };
    }
  }
  return null;
}

// ===== 相机跟随实体（照搬 game.js update 的 camTarget 逻辑，含 cyber 观战 bots）=====
export function fpsCameraEntity(game) {
  if (!game || !game.player) return null;
  if (!game.player.dead) return game.player;
  if (game.cyber && !game.cyber.ended) {
    const bots = game.entities.filter((e) => e.bot && !e.dead);
    if (bots.length) return bots[game.spectateIdx % bots.length];
  }
  const mates = game.entities.filter((e) => e.team === game.player.team && !e.dead);
  if (mates.length) return mates[game.spectateIdx % mates.length];
  return null;
}

// ===== 渲染器 =====
let glInitTried = false; // WebGL 后端懒初始化（首次渲染时尝试，失败不重试）
export function initRenderer3d(canvas, layersRef) {
  ctx = canvas.getContext('2d');
  layers = layersRef;
  cv = document.createElement('canvas');
  cctx = cv.getContext('2d');
  cctx.imageSmoothingEnabled = false;
  iw = ih = 0;
  skyCv = null; skyCtx = null; skyCvKey = '';
  pxImg = null; px32 = null; texPixMap = null;
  glInitTried = false;
}

// ===== 像素直写缓冲（性能核心：地板/墙/四边形 CPU 直写，一次 putImageData 上屏，
// 避免真实 GPU 下每帧 ~1800 次 draw call 的驱动开销——实测每帧 550ms+）=====
let pxImg = null;      // ImageData（iw×ih，RGBA）
let px32 = null;       // Uint32Array view（小端：byte0=R,1=G,2=B,3=A）
let texPixMap = null;  // Map<canvas, {w,h,px:Uint32Array}> 纹理像素缓存

function ensurePxBuf(w, h) {
  if (!pxImg || pxImg.width !== w || pxImg.height !== h) {
    let id = null;
    try { id = cctx.createImageData(w, h); } catch (e) { id = null; }
    if (!id || !id.data || id.data.length < w * h * 4) {
      // 防御：环境无 createImageData/getImageData 像素数据（stubdom）→ 禁用像素层
      pxImg = null; px32 = null;
      return;
    }
    pxImg = id;
    px32 = new Uint32Array(pxImg.data.buffer);
  }
}

// 纹理 → 像素缓存（getImageData 一次；支持 canvas 与 HTMLImageElement——真实贴图素材是 Image，
// 需先绘制到临时 canvas 再读像素；失败/异常返回 null，调用方回退）
function texPixFor(tex) {
  if (!tex || !tex.width || !tex.height) return null;
  if (!texPixMap) texPixMap = new Map();
  let e = texPixMap.get(tex);
  if (e) return e;
  try {
    let src = tex;
    if (typeof tex.getContext !== 'function') {
      // HTMLImageElement：绘制到临时 canvas
      const tmp = document.createElement('canvas');
      tmp.width = tex.width; tmp.height = tex.height;
      const tctx2 = tmp.getContext('2d');
      tctx2.drawImage(tex, 0, 0);
      src = tmp;
    }
    const tctx = src.getContext('2d');
    const id = tctx.getImageData(0, 0, src.width, src.height);
    if (!id || !id.data || id.data.length < src.width * src.height * 4) return null;
    e = { w: src.width, h: src.height, px: new Uint32Array(id.data.buffer) };
    texPixMap.set(tex, e);
    return e;
  } catch (err) {
    return null;
  }
}

// 写 RGBA 像素（Uint32 小端打包）
function setPx(idx, r, g, b, a) {
  px32[idx] = (a << 24) | (b << 16) | (g << 8) | r;
}

// 混合写入（alpha 0..1，读旧值混合）
function mixPx(idx, r, g, b, a) {
  const old = px32[idx];
  const or_ = old & 0xff, og = (old >> 8) & 0xff, ob = (old >> 16) & 0xff;
  setPx(idx,
    (or_ * (1 - a) + r * a) | 0,
    (og * (1 - a) + g * a) | 0,
    (ob * (1 - a) + b * a) | 0,
    0xff);
}

// 扫描线填充屏幕多边形（pts = [[x,y],...]），支持垂直渐变 cTop→cBottom 与混合 alpha
function fillPolyPx(F, pts, cTop, cBottom, alpha) {
  if (!pts || pts.length < 3) return;
  const iw = F.iw, ih = F.ih;
  let minY = Infinity, maxY = -Infinity;
  for (const pt of pts) {
    if (pt[1] < minY) minY = pt[1];
    if (pt[1] > maxY) maxY = pt[1];
  }
  if (minY >= ih || maxY < 0) return;
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(ih - 1, Math.ceil(maxY));
  const rT = cTop[0], gT = cTop[1], bT = cTop[2];
  const rB = cBottom[0], gB = cBottom[1], bB = cBottom[2];
  const span = Math.max(1, maxY - minY);
  const xs = [];
  for (let y = minY; y <= maxY; y++) {
    xs.length = 0;
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
      const y1 = p1[1], y2 = p2[1];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        const tt = (y - y1) / (y2 - y1);
        xs.push(p1[0] + (p2[0] - p1[0]) * tt);
      }
    }
    xs.sort((m, n) => m - n);
    const tt = (y - minY) / span;
    const r = (rT + (rB - rT) * tt) | 0, g = (gT + (gB - gT) * tt) | 0, b = (bT + (bB - bT) * tt) | 0;
    const rowIdx = y * iw;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      let x0 = Math.max(0, Math.ceil(xs[i])), x1 = Math.min(iw - 1, Math.floor(xs[i + 1]));
      for (let x = x0; x <= x1; x++) {
        if (alpha >= 0.95) setPx(rowIdx + x, r, g, b, 0xff);
        else mixPx(rowIdx + x, r, g, b, alpha);
      }
    }
  }
}

function themeOfMap() {
  const map = getMap();
  if (!map) return FALLBACK_THEME;
  const th = typeof tex.themeOf === 'function' ? tex.themeOf(map.id) : null;
  return th || FALLBACK_THEME;
}

export function render3d(game) {
  if (!ctx || !layers || !game) return;
  const ent = fpsCameraEntity(game);
  if (!ent) return;
  const canvas = ctx.canvas;
  // E4 自适应分辨率：内部渲染分辨率按 CSS 像素计算（÷dpr）并设上限 960——
  // 此前 canvas.width 是物理像素（dpr=2 时内部缓冲=CSS 全分辨率 1280×720，像素量过大），
  // 修正后 dpr=2 下内部缓冲降至 ~960×540（放大上屏，视觉可接受，性能提升 ~40%）
  const cssW = canvas.width / (game.dpr || 1);
  const cssH = canvas.height / (game.dpr || 1);
  // 内部分辨率 = CSS 全分辨率 × scale（默认 1.0 = 1080P 原生画质；E4 自适应在低配机器降档 0.5~1.0）
  // 像素直写路径下 1920×1080 约 6-10ms CPU，真实 GPU 下 putImageData/放大由硬件处理，60fps 稳定
  const scale = (game._renderScale >= 0.5 && game._renderScale <= 1) ? game._renderScale : 1;
  const nw = Math.max(320, Math.min(1920, Math.floor(cssW * scale)));
  const nh = Math.max(180, Math.min(1080, Math.floor(cssH * scale)));
  if (cv.width !== nw || cv.height !== nh) { cv.width = nw; cv.height = nh; iw = nw; ih = nh; }
  // WebGL 后端懒初始化（stubdom/无 GPU 环境 getContext('webgl') 返回 null → 回退像素直写）
  if (!gl3dReady() && !glInitTried) {
    glInitTried = true;
    initGL3d(nw, nh);
  }
  const p = game.player;
  const alive = p && !p.dead;
  // 视角角：玩家活着用自身 yaw/pitch；死亡观战用 _specAngle/_specPitch
  let angle = ent.angle;
  let pitch = Number.isFinite(ent.pitch) ? ent.pitch : 0;
  if (!(ent === p && alive)) {
    if (game._specAngle === null || game._specAngle === undefined) {
      game._specAngle = game.player ? game.player.angle : ent.angle;
    }
    if (game._specPitch === null || game._specPitch === undefined) {
      game._specPitch = game.player ? (game.player.pitch || 0) : (ent.pitch || 0);
    }
    angle = game._specAngle;
    pitch = game._specPitch;
  }
  pitch = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
  // 眼高：站姿 0.5 格 + 高台高度；蹲下 0.35（按地图瓦片尺寸，官方图 tile=16）
  const crouchBase = ent === p && alive && ent.crouched ? 0.35 : 0.5;
  let eyeH = (crouchBase + (ent.height || 0)) * mapTile() + groundElevationAt(ent.x, ent.y);
  const fogMax = game.opts && game.opts.fog ? 560 : 950;
  const wNow = weaponDef(p);
  const scoped = alive && p.scoped && wNow && wNow.kind === 'sniper';
  // B5 开镜过渡：game.scopeT 0..1 平滑值（game.js 并行维护；缺失时按 scoped 硬切防御回退）
  const scopeT = game.scopeT !== undefined && isFinite(game.scopeT)
    ? clamp(game.scopeT, 0, 1)
    : (scoped ? 1 : 0);
  // 镜内微晃：仅开镜且存活时对角度做微调（减少动态时关闭）
  if (scoped && alive && !(game.opts && game.opts.reduceMotion)) angle += Math.sin((game.time || 0) * 2.1) * 0.0012;
  // 玩家 FOV 设置（game.fov 弧度，缺省 Math.PI/2）
  const fovBase = typeof game.fov === 'number' && isFinite(game.fov) && game.fov > 0.3 && game.fov < Math.PI
    ? game.fov : FOV_H;
  const reduceMotion = !!(game.opts && game.opts.reduceMotion);
  // 开火 FOV 后坐踢（视角轻微放大，随 recoil 衰减）——射击手感；幅度减半且可被"减少动态"关闭
  const fovKick = reduceMotion ? 0 : (alive && p && p.recoil > 0 ? Math.min(p.recoil * 0.02, 0.035) : 0);
  const fovH = fovBase + fovKick;
  const focalBase = (iw / 2) / Math.tan(fovH / 2);
  const focal = scoped ? focalBase / lerp(1, 0.35, easeInOut(scopeT)) : focalBase;
  const centerY = ih / 2;
  const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
  const horizon = pitchScreenHorizon(centerY, focal, pitch);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  // 步态视角动感：垂直 bob + 横向摆头（仅第一人称且移动中；幅度温和，可被"减少动态"关闭）
  let sway = 0;
  if (alive && p.walking && !p.scoped && !reduceMotion) {
    const ph = p.bobPhase || 0;
    eyeH += Math.sin(ph * 2) * mapTile() * 0.02;
    sway = Math.cos(ph) * mapTile() * 0.012;
  }
  // B2 受击镜头冲击：F.cx/cy 叠加随机震动（幅度减半；"减少动态"关闭）
  const shk = reduceMotion ? 0 : (game.shake || 0) * 0.5;
  const shox = shk > 0 ? (Math.random() * 2 - 1) * shk : 0;
  const shoy = shk > 0 ? (Math.random() * 2 - 1) * shk : 0;
  const F = {
    g: game, ent, cctx,
    layers,
    iw, ih, focal, // B5 AWP 开镜：focal 按 scopeT 平滑放大
    cx: ent.x - sin * sway + shox, cy: ent.y + cos * sway + shoy, angle, cos, sin,
    eyeH, horizon, centerY, pitch, cosP, sinP, fogMax,
    U: mapTile() / TILE, // 世界尺寸比例：官方图 tile=16 时精灵等世界单位量按 0.4 缩放
    time: game.time || 0,
    theme: themeOfMap(),
    fogOn: !!(game.opts && game.opts.fog),
    scoped,
    scopeT
  };
  // E3c zbuf 数组复用：覆盖写全部列（drawWalls 逐列写满），无需清零，避免每帧分配
  if (!zbufArr || zbufArr.length < iw) zbufArr = new Array(iw);
  const zbuf = zbufArr;
  // 测量基建：各 pass 独立计时（performance.now 采样，独立于 game.time）
  const ts = performance.now();
  let m0 = ts;
  // —— 渲染后端：WebGL（GPU）优先，Canvas 2D 像素直写回退 ——
  if (gl3dReady()) {
    glResize(iw, ih);
    glBegin(F);
    glSky(F, skyCanvasFor(F), skySignature(F)); // 天空缓存画布上传为纹理 + 全屏 quad（z=1 最远）
    drawFloorPixels(F);    // 内部 glFloorRow 分支
    drawGroundQuads(F);    // 内部 glGroundQuad 分支
    drawWalls(F, zbuf);    // 内部 glWallColumn 分支 + zbuf
    glFlush(F);
    // WebGL 已把 3D 场景画到独立 GL canvas；cv 转为透明叠加层，避免天空内容盖住 GL 输出。
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.clearRect(0, 0, iw, ih);
  } else {
    // 像素直写路径（无 WebGL 环境）
    ensureSkyLayer(F);
    ensurePxBuf(iw, ih);
    if (skyLayer && px32) {
      px32.set(skyLayer.px);
      drawFloorPixels(F);
      drawGroundQuads(F);
      drawWalls(F, zbuf);
      cctx.putImageData(pxImg, 0, 0);
    }
  }
  const tBase = performance.now() - m0;
  m0 = performance.now();
  drawSprites(F, zbuf, alive, p);
  const tSprites = performance.now() - m0;
  drawDmgPops(F); // B3 伤害数字（drawSprites 之后、后续屏效之前）
  drawMuzzle(F, alive, p);
  drawViewmodel(F, alive, p);
  if (scopeT > 0.005) drawScope(F); // B5 开镜淡入/淡出期间也画
  const vig = vignetteCanvas(F);
  if (vig) cctx.drawImage(vig, 0, 0);
  // B2 受击红晕：全屏边缘红色 vignette（alpha 随 dmgT 衰减，画在暗角之后）
  if (game.dmgT > 0) {
    const dmgA = clamp(game.dmgT * 2, 0, 1) * 0.22;
    if (dmgA > 0.002) {
      const R = Math.max(iw, ih) * 0.72;
      const dg = cctx.createRadialGradient(iw / 2, ih * 0.46, R * 0.30, iw / 2, ih * 0.46, R);
      dg.addColorStop(0, 'rgba(200,30,25,0)');
      dg.addColorStop(1, 'rgba(200,30,25,' + dmgA.toFixed(3) + ')');
      cctx.fillStyle = dg;
      cctx.fillRect(0, 0, iw, ih);
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // 平滑放大上屏（WebGL 后端用 glcv，像素直写后端用 cv）
  ctx.imageSmoothingEnabled = true;
  if (gl3dReady()) {
    ctx.drawImage(gl3dCanvas(), 0, 0, canvas.width, canvas.height);
    ctx.drawImage(cv, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.drawImage(cv, 0, 0, canvas.width, canvas.height);
  }
  // 恢复 dpr 变换：render3d 之后的 HUD 层按 CSS 像素绘制（与俯视模式 render() 行为一致）
  const dpr = game.dpr || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // 测量结果（ms，直接存最新值；main.js 侧自行 EMA；base 含像素直写+putImageData）
  game._renderStats = {
    sky: tBase, floor: tBase, ground: tBase, walls: tBase, sprites: tSprites,
    total: performance.now() - ts
  };
}

// 天空像素层缓存：drawSky 输出（天空+云+太阳+地板渐变底色）静态，仅当分辨率/图层变化时重建。
// 每帧通过 px32.set 整块拷贝为像素直写基底——消除 drawSky 的每帧 ~16 次 draw call
let skyLayer = null;

// 天空内容不是只随画布尺寸/图层变化：俯仰角会移动地平线，主题色也会改变渐变。
// 这里显式列出所有参与 drawSky 的输入，避免上下视角复用旧天空。
function skySignature(F) {
  const sky = (F.theme && F.theme.sky) || FALLBACK_THEME.sky;
  const fl = (F.theme && F.theme.floor) || FALLBACK_THEME.floor;
  const fog = (F.theme && F.theme.atmo && F.theme.atmo.fogColor) || [150, 130, 95];
  return [
    F.iw, F.ih,
    (F.horizon || 0).toFixed(4),
    (F.centerY || 0).toFixed(2),
    sky.top || '',
    sky.horizon || '',
    (sky.sun || []).join(','),
    (fl || []).join(','),
    F.fogOn ? 'fog' : 'clear',
    (fog || []).join(',')
  ].join('|');
}

function ensureSkyLayer(F) {
  const key = skySignature(F);
  if (skyLayer && skyLayer.w === F.iw && skyLayer.h === F.ih && skyLayer.key === key) return skyLayer;
  cctx.setTransform(1, 0, 0, 1, 0, 0);
  cctx.clearRect(0, 0, F.iw, F.ih);
  drawSky(F);
  try {
    const id = cctx.getImageData(0, 0, F.iw, F.ih);
    if (!id || !id.data || id.data.length < F.iw * F.ih * 4) { skyLayer = null; return null; }
    skyLayer = { px: new Uint32Array(id.data.buffer), w: F.iw, h: F.ih, key };
  } catch (e) {
    skyLayer = null;
  }
  return skyLayer;
}

// 天空盒：顶部→地平线渐变 + 太阳光晕 + 确定性云团（避免纯色天花板压抑感）
function drawSkyTo(F, t) {
  const { iw, ih, horizon } = F;
  const sky = F.theme.sky || FALLBACK_THEME.sky;
  const sun = sky.sun || [255, 217, 160];
  const fogOn = !!F.fogOn;
  let grad = t.createLinearGradient(0, 0, 0, horizon);
  grad.addColorStop(0, sky.top);
  grad.addColorStop(0.8, sky.top);
  grad.addColorStop(1, sky.horizon);
  t.fillStyle = grad;
  t.fillRect(0, 0, iw, horizon);
  // 太阳：右上角光晕
  const sunX = iw * 0.76, sunY = horizon * 0.32;
  const sunR = Math.min(iw, ih) * 0.05;
  const sg = t.createRadialGradient(sunX, sunY, sunR * 0.1, sunX, sunY, sunR * 3.4);
  sg.addColorStop(0, 'rgba(' + sun[0] + ',' + sun[1] + ',' + sun[2] + ',0.9)');
  sg.addColorStop(0.25, 'rgba(' + sun[0] + ',' + sun[1] + ',' + sun[2] + ',0.32)');
  sg.addColorStop(1, 'rgba(' + sun[0] + ',' + sun[1] + ',' + sun[2] + ',0)');
  t.fillStyle = sg;
  t.fillRect(sunX - sunR * 3.4, sunY - sunR * 3.4, sunR * 6.8, sunR * 6.8);
  // 云团：确定性伪随机位置，柔边椭圆
  for (let i = 0; i < 7; i++) {
    const cx = ((i * 0.618034) % 1) * iw;
    const cy = horizon * (0.1 + 0.28 * ((i * 0.381966) % 1));
    const r = Math.min(iw, ih) * (0.035 + 0.02 * ((i * 0.79132) % 1));
    const ca = 0.05 + 0.035 * ((i * 0.52117) % 1);
    t.fillStyle = 'rgba(255,255,255,' + ca.toFixed(3) + ')';
    t.beginPath();
    t.ellipse(cx, cy, r * 2.1, r, 0, 0, Math.PI * 2);
    t.ellipse(cx + r * 1.4, cy + r * 0.3, r * 1.4, r * 0.75, 0, 0, Math.PI * 2);
    t.fill();
  }
  // 地板：近色（画布底）= 主题地板提亮(+25)，远色（视平线）= ×0.35
  const fl = F.theme.floor || [36, 39, 44];
  const near = [Math.min(255, fl[0] + 25), Math.min(255, fl[1] + 25), Math.min(255, fl[2] + 25)];
  const far = [Math.floor(fl[0] * 0.35), Math.floor(fl[1] * 0.35), Math.floor(fl[2] * 0.35)];
  grad = t.createLinearGradient(0, horizon, 0, ih);
  grad.addColorStop(0, 'rgb(' + far.join(',') + ')');
  grad.addColorStop(1, 'rgb(' + near.join(',') + ')');
  t.fillStyle = grad;
  t.fillRect(0, horizon, iw, ih - horizon);
  if (fogOn) {
    const fog = (F.theme.atmo && F.theme.atmo.fogColor) || [150, 130, 95];
    const fogRGBA = (a) => 'rgba(' + Math.round(fog[0]) + ',' + Math.round(fog[1]) + ',' + Math.round(fog[2]) + ',' + a + ')';
    const skyFog = t.createLinearGradient(0, 0, 0, horizon);
    skyFog.addColorStop(0, fogRGBA(0.14));
    skyFog.addColorStop(1, fogRGBA(0.5));
    t.fillStyle = skyFog;
    t.fillRect(0, 0, iw, horizon);
    const floorFog = t.createLinearGradient(0, horizon, 0, ih);
    floorFog.addColorStop(0, fogRGBA(0.54));
    floorFog.addColorStop(1, fogRGBA(0.12));
    t.fillStyle = floorFog;
    t.fillRect(0, horizon, iw, ih - horizon);
  }
}

function drawSky(F) {
  drawSkyTo(F, F.cctx);
}

function skyCanvasFor(F) {
  const key = skySignature(F);
  if (!skyCv) skyCv = document.createElement('canvas');
  if (skyCv.width !== F.iw || skyCv.height !== F.ih || skyCvKey !== key) {
    skyCv.width = F.iw;
    skyCv.height = F.ih;
    if (!skyCtx) skyCtx = skyCv.getContext('2d');
    skyCtx.setTransform(1, 0, 0, 1, 0, 0);
    skyCtx.clearRect(0, 0, F.iw, F.ih);
    drawSkyTo(F, skyCtx);
    skyCvKey = key;
  }
  return skyCv;
}

// ===== A1 纹理地板（WebGL：透视校正行 quad；回退：CPU 像素直写 2×2 降采样）=====
function drawFloorPixels(F) {
  const ft = F.layers && F.layers.floorTex;
  if (!ft || !ft.width || !ft.height) return;
  const { iw, ih, horizon, centerY, eyeH, focal, angle, cx, cy, fogMax, cosP, sinP } = F;
  if (eyeH <= 0.01 || focal <= 0) return;
  const texW = ft.width, texH = ft.height;
  const scl = texW / mapTile(); // 每瓦片重复一次
  // 行两端射线角
  const tan0 = Math.atan((0 - iw / 2) / focal);
  const tan1 = Math.atan((iw - 1 - iw / 2) / focal);
  const c0 = Math.cos(angle + tan0), s0 = Math.sin(angle + tan0);
  const c1 = Math.cos(angle + tan1), s1 = Math.sin(angle + tan1);
  const useGL = gl3dReady();
  let texE = null;
  if (!useGL) texE = texPixFor(ft);
  if (!useGL && !texE) return;
  const wrap = (v, m) => ((v % m) + m) % m;
  // 定点插值（16.16）
  const F16 = 65536;
  for (let y = horizon + 1; y < ih; y += useGL ? 2 : 2) {
    const dy = y - centerY;
    const denom = dy * cosP - focal * sinP;
    if (!isFinite(denom) || denom <= 0.0001) continue;
    const rowDist = eyeH * (dy * sinP + focal * cosP) / denom;
    if (!isFinite(rowDist) || rowDist <= 0) continue;
    const shade = clamp(1 - rowDist / fogMax, 0.12, 1);
    const x0w = cx + c0 * rowDist, y0w = cy + s0 * rowDist;
    const x1w = cx + c1 * rowDist, y1w = cy + s1 * rowDist;
    if (useGL) {
      // WebGL：整行一个透视 quad（uv 世界坐标，REPEAT 自动 wrap，GPU 1/w 插值）
      glFloorRow(F, y, rowDist, x0w * scl, y0w * scl, (x1w - x0w) * scl / iw, (y1w - y0w) * scl / iw, shade);
      continue;
    }
    // 像素直写（2×2 降采样）
    const u0f = (wrap(x0w * scl, texW) * F16) | 0;
    const v0f = (wrap(y0w * scl, texH) * F16) | 0;
    const duf = ((((x1w - x0w) * scl / iw) * 2) * F16) | 0; // x 步进 2 → 纹理增量 ×2
    const dvf = ((((y1w - y0w) * scl / iw) * 2) * F16) | 0;
    let ui = u0f, vi = v0f;
    const rowIdx = y * iw;
    for (let x = 0; x < iw; x += 2) {
      const tu = ((ui >> 16) % texW + texW) % texW;
      const tv = ((vi >> 16) % texH + texH) % texH;
      const pv = texE.px[tv * texW + tu];
      const r = ((pv & 0xff) * shade) | 0;
      const g = (((pv >> 8) & 0xff) * shade) | 0;
      const b = (((pv >> 16) & 0xff) * shade) | 0;
      px32[rowIdx + x] = (0xff << 24) | (b << 16) | (g << 8) | r;
      ui += duf; vi += dvf;
    }
  }
}

// 近平面裁剪：返回深度 ≥ NEAR 的多边形顶点（保持顺序，保留 e 高程插值）；完全在后方 → 空数组。
// 解决相机站在特殊格（水/高台/站点）内部时负深度角投影爆炸导致整格消失的问题
function clipNearPoly(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ain = a.depth >= NEAR, bin = b.depth >= NEAR;
    if (ain) out.push(a);
    if (ain !== bin) {
      const tt = (NEAR - a.depth) / (b.depth - a.depth);
      out.push({
        x: a.x + (b.x - a.x) * tt,
        y: a.y + (b.y - a.y) * tt,
        perp: a.perp + (b.perp - a.perp) * tt,
        depth: NEAR,
        e: (a.e || 0) + ((b.e || 0) - (a.e || 0)) * tt
      });
    }
  }
  return out;
}

// 地面四边形（水体/高台/爆破点），画在墙体之前。
// '^'/'R' 为可走凸台：顶面抬升渲染 + 面向相机的侧面（skirt），站上面的实体 baseH 与顶面对齐
function drawGroundQuads(F) {
  const grid = getGrid();
  if (!grid || !grid.length) return;
  const T = mapTile();
  const t = F.cctx;
  const { cx, cy, fogMax, eyeH, focal, horizon, cos, sin, iw } = F;
  // E2 特殊格预索引：grid 引用不变则复用缓存（构建一次，全窗口 14,600 格 → 仅特殊格）
  if (quadIdxMap !== grid) { quadIdxMap = grid; quadIdxCache = null; }
  if (!quadIdxCache) {
    const qc = [];
    for (let ty = 0; ty < grid.length; ty++) {
      const row = grid[ty];
      for (let tx = 0; tx < row.length; tx++) {
        const ch = row[tx];
        if (ch === '~' || ch === '≈' || ch === '^' || ch === 'R' || ch === 'a' || ch === 'b') qc.push({ ch, tx, ty });
      }
    }
    quadIdxCache = qc;
  }
  const x0 = Math.max(0, Math.floor((cx - fogMax) / T) - 1);
  const y0 = Math.max(0, Math.floor((cy - fogMax) / T) - 1);
  const x1 = Math.min(grid[0].length - 1, Math.ceil((cx + fogMax) / T) + 1);
  const y1 = Math.min(grid.length - 1, Math.ceil((cy + fogMax) / T) + 1);
  const wc = F.theme.water || [29, 74, 94];
  const fl = F.theme.floor || [36, 39, 44];
  const wave = 0.8 + 0.1 * Math.sin(F.time); // 浅水呼吸动画
  const elevOf = (c) => c === '^' ? T : (c === 'R' ? T * 0.5 : 0);
  const projPts = (poly, e) => poly.map((k) => {
    const pt = projectAt(F, k.depth, k.perp, e, true);
    return [pt.sx, pt.sy];
  });
  for (let i = 0; i < quadIdxCache.length; i++) {
    const e = quadIdxCache[i];
    const tx = e.tx, ty = e.ty;
    // E2 快速剔除：格中心超出雾距+半格即跳过（fogMax 外不可见）
    if (Math.abs(tx * T + T / 2 - cx) > fogMax + T || Math.abs(ty * T + T / 2 - cy) > fogMax + T) continue;
    const c = e.ch;
    const elev = elevOf(c);
    const wx0 = tx * T, wy0 = ty * T;
    const corners = [[wx0, wy0], [wx0 + T, wy0], [wx0 + T, wy0 + T], [wx0, wy0 + T]].map((pp) => {
      const dx = pp[0] - cx, dy = pp[1] - cy;
      return { x: pp[0], y: pp[1], depth: dx * cos + dy * sin, perp: -dx * sin + dy * cos };
    });
    const poly = clipNearPoly(corners);
    if (!poly.length) continue;
    let anyIn = false;
    for (const k of poly) { if (k.depth <= fogMax) { anyIn = true; break; } }
    if (!anyIn) continue;
    const ptsTop = projPts(poly, elev);
    const depthsTop = poly.map((k) => k.depth);
    if (elev === 0) {
      // 平面四边形（水/爆破点）——WebGL 顶点色渐变 / 像素扫描线填充
      if (c === '~') {
        // C4 水面反光：垂直渐变（顶部天空反光 → 底部深水），呼吸 alpha
        const wcDk = [Math.floor(wc[0] * 0.45), Math.floor(wc[1] * 0.45), Math.floor(wc[2] * 0.45)];
        if (gl3dReady()) glGroundQuad(F, ptsTop, depthsTop, [200, 230, 255], wcDk, wave);
        else fillPolyPx(F, ptsTop, [200, 230, 255], wcDk, wave);
      } else if (c === '≈') {
        const wcDk2 = [Math.floor(wc[0] * 0.35), Math.floor(wc[1] * 0.35), Math.floor(wc[2] * 0.35)];
        if (gl3dReady()) glGroundQuad(F, ptsTop, depthsTop, wc, wcDk2, 0.92);
        else fillPolyPx(F, ptsTop, wc, wcDk2, 0.92);
      } else if (c === 'a' || c === 'b') {
        // C1 站点区域光：平涂低 alpha（呼吸脉动；描边舍弃以换性能）
        const sc = c === 'a' ? [255, 120, 70] : [70, 150, 255];
        const pulse = 0.14 + 0.05 * Math.sin(F.time * 2);
        if (gl3dReady()) glGroundQuad(F, ptsTop, depthsTop, sc, sc, pulse);
        else fillPolyPx(F, ptsTop, sc, sc, pulse);
      }
    } else {
      // 凸台：顶面抬升（比地面高 elev）+ 面向相机的侧面
      const topCol = c === '^'
        ? [Math.min(255, fl[0] + 25), Math.min(255, fl[1] + 25), Math.min(255, fl[2] + 25)]
        : [Math.floor(fl[0] * 0.45), Math.floor(fl[1] * 0.45), Math.floor(fl[2] * 0.45)];
      if (gl3dReady()) glGroundQuad(F, ptsTop, depthsTop, topCol, topCol, 0.95);
      else fillPolyPx(F, ptsTop, topCol, topCol, 0.95);
      // 侧面：仅画朝向相机（外向法线与视线方向点积 < 0）且邻格更低的边
      const edges = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      for (let i = 0; i < 4; i++) {
        const ndx = edges[i][0], ndy = edges[i][1];
        if (ndx * cos + ndy * sin >= 0) continue;
        const ntx = tx + ndx, nty = ty + ndy;
        if (ntx < 0 || nty < 0 || ntx > x1 + 1 || nty > y1 + 1) continue;
        const nch = grid[nty] && grid[nty][ntx];
        if (elevOf(nch) >= elev) continue;
        const e0 = corners[i], e1 = corners[(i + 1) % 4];
        const sidePoly = clipNearPoly([
          { x: e0.x, y: e0.y, depth: e0.depth, perp: e0.perp, e: elev },
          { x: e1.x, y: e1.y, depth: e1.depth, perp: e1.perp, e: elev },
          { x: e1.x, y: e1.y, depth: e1.depth, perp: e1.perp, e: 0 },
          { x: e0.x, y: e0.y, depth: e0.depth, perp: e0.perp, e: 0 }
        ]);
        if (sidePoly.length < 3) continue;
        const pss = sidePoly.map((k) => {
          const pt = projectAt(F, k.depth, k.perp, k.e || 0, true);
          return [pt.sx, pt.sy];
        });
        const sideCol = c === '^'
          ? [Math.floor(fl[0] * 0.6), Math.floor(fl[1] * 0.6), Math.floor(fl[2] * 0.6)]
          : [Math.floor(fl[0] * 0.3), Math.floor(fl[1] * 0.3), Math.floor(fl[2] * 0.3)];
        if (gl3dReady()) glGroundQuad(F, pss, sidePoly.map((k) => k.depth), sideCol, sideCol, 0.95);
        else fillPolyPx(F, pss, sideCol, sideCol, 0.95);
      }
    }
  }
}

// E3a 预烘焙暗化纹理已废弃：墙雾化/暗化在像素直写路径内完成（见 drawWalls）
// （原 shadeTilesFor 生成 16 档暗化 canvas 的方案被像素直写取代，节省每帧 drawImage 与内存）

// 墙体：逐列 DDA 投射。WebGL 路径提交 GPU 列 quad（光栅化全在 GPU）；
// 回退路径 CPU 像素直写（雾化/侧向亮度/站点浸染在像素级完成）。两路都写 zbuf 供 sprite 裁剪。
function drawWalls(F, zbuf) {
  const grid = getGrid();
  if (!grid || !grid.length) return;
  const T = mapTile();
  const { cx, cy, angle, eyeH, focal, horizon, fogMax, iw, ih } = F;
  const useGL = gl3dReady();
  if (!useGL && !px32) return;
  // C1 站点中心预取（A 橙/B 蓝，map 缺省防御）
  const sites = (F.g.map && F.g.map.sites) || (getMap() && getMap().sites);
  const siteC = [];
  if (sites) {
    if (sites.A && sites.A.cx !== undefined) siteC.push({ x: sites.A.cx, y: sites.A.cy, col: [255, 120, 70] });
    if (sites.B && sites.B.cx !== undefined) siteC.push({ x: sites.B.cx, y: sites.B.cy, col: [70, 150, 255] });
  }
  for (let col = 0; col < iw; col++) {
    const rayA = angle + Math.atan((col - iw / 2) / focal);
    const hit = wallDist(grid, cx, cy, rayA, T, fogMax);
    if (!hit) { zbuf[col] = { d: 1e9, yTop: 0, yBottom: ih }; continue; }
    const d = Math.max(hit.dist, NEAR); // 相机贴墙安全钳制
    const hgt = wallHeightFor(hit.char) * mapTile();
    const yTop = projectAt(F, d, 0, hgt, true).sy;
    const yBottom = projectAt(F, d, 0, 0, true).sy;
    // C1 站点浸染：命中点距 A/B 中心 <480 时混合站点色
    let bandMix = 0, bandCol = null;
    if (siteC.length) {
      const rdX = Math.cos(rayA), rdY = Math.sin(rayA);
      const hitX = cx + d * rdX, hitY = cy + d * rdY;
      for (const sc of siteC) {
        const dSite = Math.hypot(hitX - sc.x, hitY - sc.y);
        if (dSite < 480) {
          const m = clamp(1 - dSite / 480, 0, 1) * 0.22;
          if (m > bandMix) { bandMix = m; bandCol = sc.col; }
        }
      }
    }
    let texSel = hit.char === '#' ? layers.wallTex
      : hit.char === '=' ? layers.thinWallTex
        : hit.char === 'C' ? layers.crateTex
          : hit.char === 'o' ? layers.barrelTex : layers.wallTex;
    // A3 墙面变体：'#' 墙按瓦片坐标确定性取变体
    if (hit.char === '#' && layers.wallVariants) {
      const vi = ((hit.tx * 2654435761) ^ (hit.ty * 1597334677)) >>> 0;
      texSel = layers.wallVariants['v' + (vi % 4)] || layers.wallTex;
    }
    if (texSel) {
      const hgtF = wallHeightFor(hit.char);
      const srcY = texSel.height * (1 - hgtF), srcH = texSel.height * hgtF;
      const texU = Math.min(texSel.width - 1, Math.floor(hit.u * texSel.width));
      const shade = clamp(1 - d / fogMax, 0.15, 1) * (hit.side === 0 ? 0.8 : 1);
      if (useGL) {
        glWallColumn(F, col, d, yTop, yBottom, texSel, texU, srcY, srcH, shade, bandMix, bandCol);
      } else {
        // 像素直写（垂直双线性 + 远墙 2px 降采样）
        const texE = texPixFor(texSel);
        if (texE) {
          const texW = texE.w, texH = texE.h;
          const tp = texE.px;
          const y0p = Math.max(0, Math.ceil(yTop));
          const y1p = Math.min(ih - 1, Math.floor(yBottom));
          const invH = 1 / Math.max(1, yBottom - yTop);
          const step = d > 400 ? 2 : 1;
          const invStep = invH * step;
          const bR = bandCol ? bandCol[0] : 0, bG = bandCol ? bandCol[1] : 0, bB = bandCol ? bandCol[2] : 0;
          const bm = bandMix;
          const twm = texW;
          for (let py = y0p; py <= y1p; py += step) {
            const v = (py - yTop) * invStep;
            const tvf = srcY + v * srcH;
            const tvi = tvf | 0;
            const tv0 = tvi < 0 ? 0 : (tvi >= texH ? texH - 1 : tvi);
            const tv1 = tv0 + 1 >= texH ? tv0 : tv0 + 1;
            const fr = tvf - tvi;
            const idx0 = tv0 * twm + texU, idx1 = tv1 * twm + texU;
            const p0 = tp[idx0], p1 = tp[idx1];
            const r0 = p0 & 0xff, g0 = (p0 >> 8) & 0xff, b0 = (p0 >> 16) & 0xff;
            const r1 = p1 & 0xff, g1 = (p1 >> 8) & 0xff, b1 = (p1 >> 16) & 0xff;
            let r = (r0 + (r1 - r0) * fr) * shade;
            let g = (g0 + (g1 - g0) * fr) * shade;
            let b = (b0 + (b1 - b0) * fr) * shade;
            if (bm > 0.004) {
              r = r * (1 - bm) + bR * bm;
              g = g * (1 - bm) + bG * bm;
              b = b * (1 - bm) + bB * bm;
            }
            px32[py * iw + col] = (0xff << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0);
          }
        }
      }
    }
    zbuf[col] = { d, yTop, yBottom };
  }
}

// ===== Sprite 集合与绘制（墙体之后，zbuf 逐列裁剪）=====
// 3D 标记数据：FPS 模式每帧收集实体屏幕位置，供队友穿透墙标记 / 名牌 / 遇敌箭头共用。
function updateFpsMarkers(F, zbuf) {
  const g = F.g;
  const p = g.player;
  const markers = fpsMarkerCache;
  for (const m of markers) {
    if (fpsMarkerPool.length < MAX_FPS_MARKERS * 2) fpsMarkerPool.push(m);
  }
  markers.length = 0;
  if (!p || g.viewMode !== 'fps') {
    g._fpsEntityMarkers = markers;
    g._fpsMarkerLimitHit = false;
    return;
  }
  const T = mapTile();
  let candidates = 0;
  for (const e of g.entities) {
    if (e.dead || e === F.ent) continue;
    candidates++;
    const dx = e.x - F.cx, dy = e.y - F.cy;
    const depth = dx * F.cos + dy * F.sin;
    if (depth < NEAR || depth > F.fogMax) continue;
    const perp = -dx * F.sin + dy * F.cos;
    const elev = groundElevationAt(e.x, e.y);
    const headH = 44 * F.U + (e.height || 0) * T + elev;
    const pt = projectAt(F, depth, perp, headH, false);
    if (!pt) continue;
    const sx = pt.sx;
    let occluded = false;
    const x0 = Math.max(0, Math.floor(sx - 3));
    const x1 = Math.min(F.iw - 1, Math.ceil(sx + 3));
    for (let c = x0; c <= x1; c++) {
      if (zbuf[c] && zbuf[c].d < depth) { occluded = true; break; }
    }
    let m = fpsMarkerPool.pop();
    if (!m) m = {};
    m.team = e.team;
    m.bot = e.bot;
    m.name = e.name || '?';
    m.hp = e.hp || 0;
    m.depth = depth;
    m.nx = sx / F.iw;
    m.ny = pt.sy / F.ih;
    m.occluded = occluded;
    m.elev = elev;
    m.isKiller = g.lastKiller === e && p.dead;
    markers.push(m);
  }
  markers.sort((a, b) => a.depth - b.depth);
  const limitHit = markers.length > MAX_FPS_MARKERS || candidates > MAX_FPS_MARKERS;
  markers.length = Math.min(markers.length, MAX_FPS_MARKERS);
  g._fpsEntityMarkers = markers;
  g._fpsMarkerLimitHit = limitHit;
}

// 队友穿透墙标记：即使被墙体遮挡也显示屏幕位置，避免 3D 模式跟丢队友。
function drawTeammateMarkers(F) {
  const g = F.g;
  const p = g.player;
  if (!p || g.viewMode !== 'fps' || !g._fpsEntityMarkers) return;
  const t = F.cctx;
  for (const m of g._fpsEntityMarkers) {
    if (m.team !== p.team) continue;
    const sx = m.nx * F.iw;
    const sy = m.ny * F.ih;
    const a = m.occluded ? 0.55 : 0.9;
    t.save();
    t.globalAlpha = a;
    t.fillStyle = '#58e08a';
    t.strokeStyle = 'rgba(0,0,0,0.65)';
    t.lineWidth = 1.5;
    t.beginPath();
    t.moveTo(sx, sy - 7);
    t.lineTo(sx + 5.5, sy - 1);
    t.lineTo(sx, sy + 5);
    t.lineTo(sx - 5.5, sy - 1);
    t.closePath();
    t.fill();
    t.stroke();
    t.restore();
  }
}

// 敌人标记：视野内敌人头顶显示红菱形，遮挡时降透明度，方便 3D 模式快速发现目标。
function drawEnemyMarkers(F) {
  const g = F.g;
  const p = g.player;
  if (!p || g.viewMode !== 'fps' || !g._fpsEntityMarkers) return;
  const t = F.cctx;
  for (const m of g._fpsEntityMarkers) {
    if (m.team === p.team) continue;
    const sx = m.nx * F.iw;
    const sy = m.ny * F.ih;
    if (sx < 6 || sx > F.iw - 6 || sy < 6 || sy > F.ih - 6) continue;
    const a = m.isKiller ? 1 : (m.occluded ? 0.32 : 0.72);
    t.save();
    t.globalAlpha = a;
    t.strokeStyle = m.isKiller ? '#ffd34d' : '#ff5040';
    t.lineWidth = m.isKiller ? 2.4 : 1.8;
    t.shadowColor = 'rgba(255,50,40,0.7)';
    t.shadowBlur = m.isKiller ? 10 : 5;
    t.beginPath();
    t.moveTo(sx, sy - 8);
    t.lineTo(sx + 6.5, sy - 1);
    t.lineTo(sx, sy + 6);
    t.lineTo(sx - 6.5, sy - 1);
    t.closePath();
    t.stroke();
    t.restore();
  }
}

// 遇敌红边与方向提示：敌人存在时给画面边缘淡红反馈；屏幕外的敌人显示指向箭头。
function drawEnemyEdgeIndicators(F) {
  const g = F.g;
  const p = g.player;
  const markers = g._fpsEntityMarkers || [];
  let count = 0;
  for (const m of markers) {
    if (m.team !== p.team) count++;
  }
  g._fpsEnemyAlert = { count, time: g.time || 0 };
  if (!p || g.viewMode !== 'fps' || count === 0) return;
  const t = F.cctx;
  const intensity = Math.min(0.18, 0.08 + count * 0.012);
  const R = Math.max(F.iw, F.ih) * 0.7;
  const dg = t.createRadialGradient(F.iw / 2, F.ih * 0.46, R * 0.32, F.iw / 2, F.ih * 0.46, R);
  dg.addColorStop(0, 'rgba(255,40,30,0)');
  dg.addColorStop(1, 'rgba(255,40,30,' + intensity.toFixed(3) + ')');
  t.save();
  t.fillStyle = dg;
  t.fillRect(0, 0, F.iw, F.ih);
  t.restore();
  const pad = Math.min(F.iw, F.ih) * 0.035 + 10;
  const size = Math.max(7, Math.min(10, F.iw / 160));
  let shown = 0;
  for (const m of markers) {
    if (m.team === p.team || shown >= 6) continue;
    const sx = m.nx * F.iw;
    const sy = m.ny * F.ih;
    if (sx >= pad && sx <= F.iw - pad && sy >= pad && sy <= F.ih - pad) continue;
    const dx = sx - F.iw / 2;
    const dy = sy - F.ih / 2;
    const mag = Math.max(Math.abs(dx), Math.abs(dy));
    if (mag < 1e-6) continue;
    const ax = F.iw / 2 + dx / mag * (F.iw / 2 - pad);
    const ay = F.ih / 2 + dy / mag * (F.ih / 2 - pad);
    const ang = Math.atan2(dy, dx);
    t.save();
    t.translate(ax, ay);
    t.rotate(ang);
    t.globalAlpha = 0.78;
    t.fillStyle = '#ff4030';
    t.strokeStyle = 'rgba(0,0,0,0.7)';
    t.lineWidth = 1.5;
    t.beginPath();
    t.moveTo(size * 1.2, 0);
    t.lineTo(-size * 0.7, size * 0.8);
    t.lineTo(-size * 0.35, 0);
    t.lineTo(-size * 0.7, -size * 0.8);
    t.closePath();
    t.fill();
    t.stroke();
    t.restore();
    shown++;
  }
}

// 实体名牌与血条：只给未被墙体完全遮挡的实体绘制，避免与穿透墙标记叠成一片。
function drawEntityPlates(F) {
  const g = F.g;
  const p = g.player;
  if (!p || g.viewMode !== 'fps' || !g._fpsEntityMarkers) return;
  const t = F.cctx;
  const fontScale = Math.max(0.72, Math.min(1, F.iw / 1280));
  t.font = Math.round(10 * fontScale) + 'px Arial';
  t.textAlign = 'center';
  t.lineJoin = 'round';
  t.lineWidth = 2.4;
  for (const m of g._fpsEntityMarkers) {
    if (m.occluded) continue;
    const sx = m.nx * F.iw;
    const sy = m.ny * F.ih;
    if (sx < 2 || sx > F.iw - 2 || sy < 2 || sy > F.ih - 2) continue;
    const col = m.team === 'ct' ? '#7ab8ff' : '#ffb35c';
    t.strokeStyle = 'rgba(0,0,0,0.82)';
    t.strokeText(m.name, sx, sy - 8 * fontScale);
    t.fillStyle = col;
    t.fillText(m.name, sx, sy - 8 * fontScale);
    const bw = 24 * fontScale, bh = 2.5;
    const hpF = clamp((m.hp || 0) / 100, 0, 1);
    t.fillStyle = 'rgba(0,0,0,0.68)';
    t.fillRect(sx - bw / 2, sy - 4 * fontScale, bw, bh);
    t.fillStyle = hpF > 0.5 ? '#6ee06e' : (hpF > 0.25 ? '#ffd34d' : '#ff5040');
    t.fillRect(sx - bw / 2, sy - 4 * fontScale, bw * hpF, bh);
  }
  t.textAlign = 'start';
}

function drawSprites(F, zbuf, alive, p) {
  updateFpsMarkers(F, zbuf);
  const sprites = [];
  collectEntities(F, sprites);
  collectSmokes(F, sprites);
  collectBomb(F, sprites);
  collectDrops(F, sprites);
  collectGrenades(F, sprites);
  collectDecals(F, sprites);
  collectDecos(F, sprites); // C2 3D 装饰物 billboard
  collectWeather(F, sprites);
  sprites.sort((a, b) => b.depth - a.depth); // 远 → 近
  for (const s of sprites) drawSprite(F, zbuf, s);
  drawParticles(F);
  drawTracers(F);
  drawLaser(F, alive, p);
  drawSpectatePlate(F); // D3 观战名牌（排序绘制后手画，始终可见）
  drawTeammateMarkers(F);
  drawEnemyMarkers(F);
  drawEnemyEdgeIndicators(F);
  drawEntityPlates(F);
}

// ===== B3 伤害数字（combat.js 的 game.dmgPops：上浮淡出，描黑边可读）=====
function drawDmgPops(F) {
  const pops = F.g.dmgPops;
  if (!pops || !pops.length) return;
  const t = F.cctx;
  t.font = '12px Arial';
  t.textAlign = 'center';
  t.lineJoin = 'round';
  t.lineWidth = 3;
  const n = Math.min(pops.length, 12); // 防御：渲染侧再限数量
  for (let i = 0; i < n; i++) {
    const pop = pops[i];
    if (!pop || pop.t === undefined || pop.t > 0.8) continue; // 寿命 0.8s
    const dx = pop.x - F.cx, dy = pop.y - F.cy;
    const depth = dx * F.cos + dy * F.sin;
    if (depth < NEAR || depth > F.fogMax) continue;
    const perp = -dx * F.sin + dy * F.cos;
    const pt = projectAt(F, depth, perp, 0, true);
    const sx = pt.sx;
    let sy = pt.sy;
    sy -= (1 - pop.t / 0.8) * 30; // 上浮动画
    t.globalAlpha = clamp(pop.t / 0.3, 0, 1); // 淡出
    t.strokeStyle = '#000';
    t.fillStyle = pop.head ? '#ffd34d' : '#ffffff';
    const txt = String(pop.dmg);
    t.strokeText(txt, sx, sy);
    t.fillText(txt, sx, sy);
  }
  t.globalAlpha = 1;
  t.textAlign = 'start';
}

// ===== D3 观战名牌：相机实体头顶姓名 + HP 条（不加入 sprite 列表，避免遮挡，始终可见）=====
function drawSpectatePlate(F) {
  const ent = F.ent, g = F.g;
  if (!ent || ent === g.player) return;
  const dx = ent.x - F.cx, dy = ent.y - F.cy;
  const depth = dx * F.cos + dy * F.sin;
  if (depth < NEAR || depth > F.fogMax) return;
  const perp = -dx * F.sin + dy * F.cos;
  const sx = F.iw / 2 + perp / depth * F.focal;
  const headH = 44 * F.U + (ent.height || 0) * mapTile() + groundElevationAt(ent.x, ent.y);
  const sy = projectAt(F, depth, perp, headH, true).sy;
  const t = F.cctx;
  const col = ent.team === 'ct' ? '#7ab8ff' : '#ffb35c';
  t.font = '10px Arial';
  t.textAlign = 'center';
  t.lineJoin = 'round';
  t.lineWidth = 2.4;
  const name = ent.name || '?';
  t.strokeStyle = 'rgba(0,0,0,0.85)';
  t.strokeText(name, sx, sy - 5);
  t.fillStyle = col;
  t.fillText(name, sx, sy - 5);
  const bw = 28, bh = 3;
  const hpF = clamp((ent.hp || 0) / 100, 0, 1);
  t.fillStyle = 'rgba(0,0,0,0.7)';
  t.fillRect(sx - bw / 2, sy - 1, bw, bh);
  t.fillStyle = hpF > 0.5 ? '#6ee06e' : (hpF > 0.25 ? '#ffd34d' : '#ff5040');
  t.fillRect(sx - bw / 2, sy - 1, bw * hpF, bh);
  t.textAlign = 'start';
}

// 3D 弹痕/尸体：combat.js 的 decal（spark/hole/corpse）以贴片形式呈现——打墙有可见反馈
function collectDecals(F, out) {
  for (const d of F.g.decals || []) {
    if (d.type !== 'corpse' && d.type !== 'spark' && d.type !== 'hole') continue;
    const dx = d.x - F.cx, dy = d.y - F.cy;
    const depth = dx * F.cos + dy * F.sin;
    if (depth < NEAR || depth > F.fogMax) continue;
    const perp = -dx * F.sin + dy * F.cos;
    if (d.type === 'corpse') {
      out.push({ depth, perp, cv: corpseCanvas(F.g, d), sw: 32 * F.U, sh: 36 * F.U, baseH: 0, alpha: clamp(d.life / 3, 0, 1) });
    } else {
      // 弹孔/火花：命中点小圆点（面向相机），生命末期淡出
      out.push({ depth, perp, cv: holeCanvas(F.g, d.type), sw: 11 * F.U, sh: 11 * F.U, baseH: 0, alpha: clamp(d.life / 2, 0.15, 1) });
    }
  }
}

// ===== A5 主题天气粒子（世界空间层，复用 zbuf 裁剪管线）=====
// 粒子画布按 kind 缓存：snow 白点 / sand 沙黄斜条 / smoke 灰褐柔圆 / mist 半透明横条
function weatherParticleCanvas(kind) {
  let cv = weatherCvCache.get(kind);
  if (cv) return cv;
  const mk = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    return c;
  };
  if (kind === 'snow') {
    cv = mk(3, 3, (t) => {
      t.fillStyle = 'rgba(255,255,255,0.95)';
      t.beginPath(); t.arc(1.5, 1.5, 1.4, 0, Math.PI * 2); t.fill();
    });
  } else if (kind === 'sand') {
    cv = mk(3, 2, (t) => {
      t.save(); t.rotate(0.5);
      t.fillStyle = 'rgba(196,170,118,0.85)';
      t.fillRect(-1, -0.7, 2.4, 1.4);
      t.restore();
    });
  } else if (kind === 'smoke') {
    cv = mk(6, 6, (t) => {
      const g = t.createRadialGradient(3, 3, 0.6, 3, 3, 3);
      g.addColorStop(0, 'rgba(124,114,99,0.5)');
      g.addColorStop(1, 'rgba(124,114,99,0)');
      t.fillStyle = g;
      t.fillRect(0, 0, 6, 6);
    });
  } else if (kind === 'mist') {
    cv = mk(10, 4, (t) => {
      const g = t.createLinearGradient(0, 0, 10, 0);
      g.addColorStop(0, 'rgba(172,186,176,0)');
      g.addColorStop(0.5, 'rgba(172,186,176,0.45)');
      g.addColorStop(1, 'rgba(172,186,176,0)');
      t.fillStyle = g;
      t.fillRect(0, 0, 10, 4);
    });
  } else return null;
  weatherCvCache.set(kind, cv);
  return cv;
}

// 本阶段只做世界空间层：确定性黄金比例伪随机 + F.time 偏移，环形带围绕相机。
// 前景屏幕空间粒子层（额外 6 个）留待下一阶段实现。
function collectWeather(F, out) {
  const wth = F.theme.weather;
  if (!wth || !wth.kind) return;
  const kind = wth.kind;
  const cv = weatherParticleCanvas(kind);
  if (!cv) return;
  const n = Math.round(28 * (wth.density || 0.5));
  if (n <= 0) return;
  const wind = wth.wind || [0, 0];
  const t0 = F.time;
  const sw = { snow: 6, sand: 7, smoke: 12, mist: 22 }[kind] * F.U || 8 * F.U;
  const sh = sw * cv.height / cv.width;
  const driftX = wind[0] * t0 * 40;
  const fallY = kind === 'snow' ? t0 * 30 : 0;
  for (let i = 0; i < n; i++) {
    const angleOff = (i * 0.618034 * Math.PI * 2 + t0 * 0.05) % (Math.PI * 2);
    const r = 90 + (i * 0.381966 % 1) * 170;
    const wx = F.cx + Math.cos(angleOff) * r + driftX;
    const wy = F.cy + Math.sin(angleOff) * r + fallY;
    const dx = wx - F.cx, dy = wy - F.cy;
    const depth = dx * F.cos + dy * F.sin;
    if (depth < NEAR || depth > F.fogMax) continue;
    const perp = -dx * F.sin + dy * F.cos;
    const alpha = clamp(0.35 + 0.3 * (1 - depth / F.fogMax), 0.05, 1);
    out.push({ depth, perp, cv, sw, sh, baseH: 0, alpha });
  }
}

// ===== C2 3D 装饰物 billboard（layers.decos：确定性放置的贴地小物件，alpha 随深度淡出）=====
const DECO_SIZES = {
  decoGrass: [16, 18], decoStone: [14, 12], decoRock: [14, 12],
  decoBarrel: [14, 16], decoPot: [12, 14], decoPipe: [20, 8],
  decoLamp: [10, 22], decoTire: [16, 14], decoPallet: [18, 6]
};

function collectDecos(F, out) {
  const decos = F.layers && F.layers.decos;
  if (!decos || !decos.length) return;
  const T = mapTile();
  for (const d of decos) {
    if (!d || d.tx === undefined || d.ty === undefined) continue;
    const wx = (d.tx + 0.5) * T, wy = (d.ty + 0.5) * T;
    const dx = wx - F.cx, dy = wy - F.cy;
    const depth = dx * F.cos + dy * F.sin;
    if (depth < NEAR || depth > F.fogMax) continue;
    const perp = -dx * F.sin + dy * F.cos;
    const kind = d.kind || 'deco';
    const cv = decoCanvas(F, kind);
    if (!cv) continue;
    const ss = DECO_SIZES[kind] || [12, 12];
    out.push({ depth, perp, cv, sw: ss[0] * F.U, sh: ss[1] * F.U, baseH: 0, alpha: clamp(0.85 - 0.35 * (depth / F.fogMax), 0, 1) });
  }
}

// 装饰物画布：48×48 按 kind 参数化简绘（不依赖 textures.js 的 drawDeco，独立实现）
function decoCanvas(F, kind) {
  let cv = decoCvCache.get(kind);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = 48; cv.height = 48;
  const t = cv.getContext('2d');
  t.clearRect(0, 0, 48, 48);
  if (kind === 'decoGrass') {
    // 3 条绿弧草叶
    t.strokeStyle = '#3f8f3a';
    t.lineWidth = 2.2;
    t.beginPath();
    t.moveTo(14, 44); t.quadraticCurveTo(9, 30, 14, 21);
    t.moveTo(24, 44); t.quadraticCurveTo(17, 25, 24, 15);
    t.moveTo(34, 44); t.quadraticCurveTo(29, 28, 34, 19);
    t.stroke();
    t.strokeStyle = '#59a94f';
    t.lineWidth = 1.5;
    t.beginPath();
    t.moveTo(20, 44); t.quadraticCurveTo(15, 32, 20, 24);
    t.moveTo(29, 44); t.quadraticCurveTo(25, 30, 29, 21);
    t.stroke();
  } else if (kind === 'decoStone') {
    t.fillStyle = '#8d8f96';
    t.beginPath();
    t.moveTo(10, 44); t.lineTo(7, 30); t.lineTo(14, 20); t.lineTo(30, 17); t.lineTo(40, 26); t.lineTo(38, 44);
    t.closePath(); t.fill();
    t.fillStyle = 'rgba(255,255,255,0.16)';
    t.beginPath(); t.moveTo(14, 20); t.lineTo(19, 18); t.lineTo(18, 27); t.closePath(); t.fill();
  } else if (kind === 'decoRock') {
    t.fillStyle = '#6f7178';
    t.beginPath();
    t.moveTo(6, 44); t.lineTo(4, 32); t.lineTo(12, 22); t.lineTo(26, 20); t.lineTo(40, 30); t.lineTo(36, 44);
    t.closePath(); t.fill();
    t.fillStyle = 'rgba(0,0,0,0.2)';
    t.beginPath(); t.moveTo(12, 44); t.lineTo(13, 30); t.lineTo(21, 26); t.lineTo(23, 44); t.closePath(); t.fill();
    t.fillStyle = 'rgba(255,255,255,0.12)';
    t.beginPath(); t.moveTo(26, 20); t.lineTo(31, 22); t.lineTo(28, 29); t.closePath(); t.fill();
  } else if (kind === 'decoBarrel') {
    t.fillStyle = 'rgba(0,0,0,0.25)';
    t.beginPath(); t.ellipse(24, 44, 11, 3, 0, 0, Math.PI * 2); t.fill();
    t.fillStyle = '#8a5a2b';
    t.beginPath();
    t.moveTo(13, 38); t.lineTo(12, 11); t.quadraticCurveTo(24, 3, 36, 11); t.lineTo(35, 38); t.quadraticCurveTo(24, 44, 13, 38);
    t.closePath(); t.fill();
    t.fillStyle = '#5d3d1e';
    t.fillRect(10, 17, 28, 3);
    t.fillRect(10, 30, 28, 3);
    t.fillStyle = '#6e4a24';
    t.beginPath(); t.ellipse(24, 8, 12, 3, 0, 0, Math.PI * 2); t.fill();
  } else if (kind === 'decoPot') {
    t.fillStyle = 'rgba(0,0,0,0.25)';
    t.beginPath(); t.ellipse(24, 44, 9, 2.4, 0, 0, Math.PI * 2); t.fill();
    t.fillStyle = '#7a4a2c';
    t.beginPath();
    t.moveTo(14, 44); t.lineTo(12, 32); t.lineTo(36, 32); t.lineTo(34, 44);
    t.closePath(); t.fill();
    t.fillStyle = '#8f5736';
    t.beginPath();
    t.moveTo(12, 32); t.lineTo(14, 28); t.lineTo(34, 28); t.lineTo(36, 32);
    t.closePath(); t.fill();
    t.strokeStyle = '#3f8f3a';
    t.lineWidth = 2;
    t.beginPath();
    t.moveTo(19, 28); t.quadraticCurveTo(15, 16, 19, 10);
    t.moveTo(29, 28); t.quadraticCurveTo(33, 16, 29, 10);
    t.stroke();
    t.fillStyle = '#59a94f';
    t.beginPath(); t.arc(24, 8, 3, 0, Math.PI * 2); t.fill();
  } else if (kind === 'decoPipe') {
    t.fillStyle = 'rgba(0,0,0,0.25)';
    t.beginPath(); t.ellipse(24, 44, 12, 2.4, 0, 0, Math.PI * 2); t.fill();
    t.fillStyle = '#7a828c';
    t.fillRect(6, 31, 36, 7);
    t.fillStyle = '#8f99a3';
    t.fillRect(6, 26, 36, 5);
    t.fillStyle = '#5d646d';
    t.fillRect(6, 33, 36, 3);
  } else if (kind === 'decoLamp') {
    t.fillStyle = 'rgba(0,0,0,0.25)';
    t.beginPath(); t.ellipse(24, 47, 7, 1.8, 0, 0, Math.PI * 2); t.fill();
    t.fillStyle = '#4a5058';
    t.fillRect(22, 10, 4, 38);
    t.fillStyle = '#ffd34d';
    t.beginPath(); t.arc(24, 9, 4.4, 0, Math.PI * 2); t.fill();
    t.fillStyle = 'rgba(255,235,150,0.4)';
    t.beginPath(); t.arc(24, 9, 8, 0, Math.PI * 2); t.fill();
  } else if (kind === 'decoTire') {
    t.fillStyle = 'rgba(0,0,0,0.25)';
    t.beginPath(); t.ellipse(24, 44, 10, 2.4, 0, 0, Math.PI * 2); t.fill();
    t.fillStyle = '#1d2024';
    t.beginPath();
    t.arc(24, 30, 12, 0, Math.PI * 2);
    t.arc(24, 30, 5.5, 0, Math.PI * 2, true);
    t.fill('evenodd');
    t.strokeStyle = '#2c3138';
    t.lineWidth = 2;
    t.beginPath();
    t.arc(24, 30, 8.6, 0, Math.PI * 2);
    t.stroke();
  } else if (kind === 'decoPallet') {
    t.fillStyle = 'rgba(0,0,0,0.25)';
    t.beginPath(); t.ellipse(24, 44, 11, 2.2, 0, 0, Math.PI * 2); t.fill();
    t.fillStyle = '#8a6a3c';
    t.fillRect(6, 40, 36, 4);
    t.fillRect(6, 34, 36, 4);
    t.fillStyle = '#75592f';
    t.fillRect(16, 29, 4, 15);
    t.fillRect(28, 29, 4, 15);
  } else {
    t.fillStyle = '#6a6f78';
    t.fillRect(10, 30, 28, 14);
    t.fillStyle = 'rgba(255,255,255,0.16)';
    t.fillRect(10, 30, 28, 3);
  }
  decoCvCache.set(kind, cv);
  return cv;
}

function corpseCanvas(game, d) {
  let map = game._corpseCvs;
  if (!map) map = game._corpseCvs = new Map();
  let cv = map.get(d);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = 96; cv.height = 96;
    const t = cv.getContext('2d');
    t.clearRect(0, 0, 96, 96);
    const col = d.team === 'ct' ? '#2b4a6e' : '#6e4a22';
    // 侧躺尸体：头 + 躯干 + 腿（水平方向）
    t.fillStyle = 'rgba(0,0,0,0.35)';
    t.beginPath(); t.ellipse(48, 84, 30, 7, 0, 0, Math.PI * 2); t.fill();
    t.fillStyle = col;
    t.beginPath();
    t.ellipse(34, 78, 9, 12, 0.6, 0, Math.PI * 2); // 躯干
    t.ellipse(56, 76, 6, 11, 0.35, 0, Math.PI * 2); // 臀
    t.fill();
    t.fillStyle = '#20242b';
    t.fillRect(58, 66, 16, 5); // 腿
    t.fillRect(62, 72, 15, 4);
    t.fillStyle = '#d8b08c';
    t.beginPath(); t.arc(26, 72, 6, 0, Math.PI * 2); t.fill(); // 头
    map.set(d, cv);
  }
  return cv;
}

function holeCanvas(game, type) {
  let map = game._holeCvs;
  if (!map) map = game._holeCvs = new Map();
  let cv = map.get(type);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = 32; cv.height = 32;
    const t = cv.getContext('2d');
    t.clearRect(0, 0, 32, 32);
    if (type === 'hole') {
      // 弹孔：深色核 + 浅色缘
      t.fillStyle = 'rgba(10,12,14,0.92)';
      t.beginPath(); t.arc(16, 16, 5, 0, Math.PI * 2); t.fill();
      t.strokeStyle = 'rgba(255,255,255,0.25)';
      t.lineWidth = 1;
      t.beginPath(); t.arc(16, 16, 6, 0, Math.PI * 2); t.stroke();
    } else {
      // 火花残点：亮橙核
      const g = t.createRadialGradient(16, 16, 1, 16, 16, 12);
      g.addColorStop(0, 'rgba(255,210,120,0.95)');
      g.addColorStop(0.4, 'rgba(255,160,60,0.5)');
      g.addColorStop(1, 'rgba(255,160,60,0)');
      t.fillStyle = g;
      t.fillRect(0, 0, 32, 32);
    }
    map.set(type, cv);
  }
  return cv;
}

function collectEntities(F, out) {
  // D3 击杀者高亮：玩家死亡且击杀者存活时标记该实体（缺省防御）
  const pl = F.g.player;
  const killHi = F.g.lastKiller && pl && pl.dead && F.g.lastKiller !== pl && !F.g.lastKiller.dead
    ? F.g.lastKiller : null;
  for (const e of F.g.entities) {
    if (e.dead || e === F.ent) continue; // 相机自身不画
    const dx = e.x - F.cx, dy = e.y - F.cy;
    const depth = dx * F.cos + dy * F.sin;
    if (depth < NEAR || depth > F.fogMax) continue;
    const perp = -dx * F.sin + dy * F.cos;
    const s = { depth, perp, cv: entitySprite(F.g, e), sw: 44 * F.U, sh: 44 * F.U, baseH: groundElevationAt(e.x, e.y) + (e.height || 0) * mapTile() };
    if (killHi && e === killHi) s.isKiller = true;
    out.push(s);
  }
}

// 人物建模：正面立绘士兵（经典 Wolf3D billboard 风格）——影/步态双腿/躯干战术背心/持枪手臂/头盔头
function entitySprite(game, e) {
  let map = game._sprCvs;
  if (!map) map = game._sprCvs = new Map();
  if (map.size > 64) map.clear();
  let cv = map.get(e);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = 96; cv.height = 96;
    map.set(e, cv);
  }
  const t = cv.getContext('2d');
  t.clearRect(0, 0, 96, 96);
  const col = e.team === 'ct' ? '#3d7fd6' : '#d98a2b';
  const dark = e.team === 'ct' ? '#2b5ba0' : '#a35f14';
  const now = performance.now();
  const walk = e.walking ? Math.sin(now / 130) : 0;
  const legSwing = e.walking ? Math.sin(now / 130) * 5 : 0;
  const bob = Math.abs(walk) * 2;
  // 地面影
  t.fillStyle = 'rgba(0,0,0,0.4)';
  t.beginPath();
  t.ellipse(48, 90, 21, 6, 0, 0, Math.PI * 2);
  t.fill();
  // 双腿（交替步态）
  t.fillStyle = '#262b33';
  t.fillRect(41 + legSwing, 60 - bob, 7, 25);
  t.fillRect(48 - legSwing, 60 - bob, 7, 25);
  // 靴
  t.fillStyle = '#101214';
  t.fillRect(40 + legSwing, 83 - bob, 9, 6);
  t.fillRect(47 - legSwing, 83 - bob, 9, 6);
  const tb = 38 - bob;
  // 躯干（战术背心，team 色）
  t.fillStyle = col;
  t.beginPath();
  t.moveTo(31, tb + 28);
  t.quadraticCurveTo(30, tb + 8, 48, tb + 8);
  t.quadraticCurveTo(66, tb + 8, 65, tb + 28);
  t.quadraticCurveTo(65, tb + 36, 48, tb + 36);
  t.quadraticCurveTo(31, tb + 36, 31, tb + 28);
  t.fill();
  // 背心细节与肩带
  t.fillStyle = dark;
  t.fillRect(39, tb + 12, 18, 13);
  t.fillRect(31, tb + 9, 4, 20);
  t.fillRect(61, tb + 9, 4, 20);
  // 双臂
  t.fillStyle = '#2c313a';
  t.beginPath(); t.ellipse(29, tb + 15, 5, 4, -0.35, 0, Math.PI * 2); t.fill();
  t.beginPath(); t.ellipse(67, tb + 14, 5, 4, 0.35, 0, Math.PI * 2); t.fill();
  // 武器（朝画面右下角，形成持枪透视）
  const w = weaponDef(e);
  if (w && w.kind === 'knife') {
    t.strokeStyle = '#cfd4da';
    t.lineWidth = 2;
    t.beginPath(); t.moveTo(60, tb + 8); t.lineTo(82, tb + 16); t.stroke();
  } else if (w) {
    t.save();
    t.translate(56, tb + 10);
    t.rotate(0.4);
    t.fillStyle = '#0b0d10';
    const gl = Math.min(gunLen(w), 22);
    t.fillRect(0, -2.5, gl, 5);
    t.fillStyle = '#2c313a';
    t.fillRect(-3, -3.5, 8, 7); // 持枪手
    t.restore();
  }
  // 头
  t.fillStyle = e === game.player ? '#ffcf9e' : '#e8b98c';
  t.beginPath();
  t.arc(48, tb - 8, 8, 0, Math.PI * 2);
  t.fill();
  // 头盔/帽
  t.fillStyle = dark;
  t.beginPath();
  t.arc(48, tb - 9, 8.4, Math.PI * 1.02, Math.PI * 1.98);
  t.fill();
  t.fillRect(39.6, tb - 9, 16.8, 3.5);
  // 眼睛（朝向画面中心，简化 2px）
  t.fillStyle = 'rgba(20,24,30,0.85)';
  t.fillRect(45, tb - 7, 2, 2);
  t.fillRect(50, tb - 7, 2, 2);
  return cv;
}

function collectSmokes(F, out) {
  for (const sm of F.g.smokes || []) {
    // 防御：r 异常（如缺 gr 字段导致的 NaN）直接跳过，避免整帧渲染崩溃
    if (!(sm.r > 0) || !isFinite(sm.r)) continue;
    const dx = sm.x - F.cx, dy = sm.y - F.cy;
    const depth = dx * F.cos + dy * F.sin;
    if (depth < NEAR || depth > F.fogMax) continue;
    const perp = -dx * F.sin + dy * F.cos;
    const lifeA = clamp(sm.life / 2, 0, 1);
    const fogA = clamp(1 - (depth / F.fogMax) * 0.8, 0.35, 1);
    const alpha = lifeA * clamp((sm.r - 20) / 100, 0.25, 0.5) * fogA;
    out.push({ depth, perp, cv: smokeCanvas(F.g, sm.r), sw: 2 * sm.r, sh: 2 * sm.r, baseH: F.eyeH - sm.r, alpha });
  }
}

// 烟雾渐变画布：按半径取整缓存
function smokeCanvas(game, r) {
  const key = Math.round(r);
  let cache = game._smokeCv;
  if (!cache || cache.key !== key) {
    const size = Math.max(2, key * 2);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const t = c.getContext('2d');
    const grad = t.createRadialGradient(size / 2, size / 2, size * 0.15, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(150,151,156,0.72)');
    grad.addColorStop(0.45, 'rgba(126,128,134,0.58)');
    grad.addColorStop(0.8, 'rgba(96,100,108,0.34)');
    grad.addColorStop(1, 'rgba(72,76,84,0)');
    t.fillStyle = grad;
    t.fillRect(0, 0, size, size);
    cache = game._smokeCv = { key, cv: c };
  }
  return cache.cv;
}

function collectBomb(F, out) {
  const b = F.g.bomb;
  if (!b || (!b.dropped && !b.planted)) return;
  const dx = b.x - F.cx, dy = b.y - F.cy;
  const depth = dx * F.cos + dy * F.sin;
  if (depth < NEAR || depth > F.fogMax) return;
  const perp = -dx * F.sin + dy * F.cos;
  if (b.planted) {
    // 红色脉冲地面圆（透视椭圆近似：远边/近边按各自深度投影）
    const t = F.cctx;
    if (depth > 34 + NEAR) {
      const k = 1 / depth;
      const sx = F.iw / 2 + perp * k * F.focal;
      const syFar = projectAt(F, depth - 34, perp, 0, true).sy;
      const syNear = projectAt(F, depth + 34, perp, 0, true).sy;
      const pulse = 0.4 + 0.3 * Math.sin(F.time / 0.3);
      t.fillStyle = 'rgba(255,60,40,' + (pulse * 0.3).toFixed(3) + ')';
      t.beginPath();
      t.ellipse(sx, (syFar + syNear) / 2, Math.max(0.5, k * 34 * F.focal), Math.max(0.5, (syNear - syFar) / 2), 0, 0, Math.PI * 2);
      t.fill();
    }
  }
  out.push({ depth, perp, cv: fxCanvas(F.g, 'bomb', bombDraw), sw: 20 * F.U, sh: 16 * F.U, baseH: 0 });
}

function bombDraw(t, cvW, cvH) {
  t.fillStyle = '#222';
  t.fillRect(8, 12, 28, 16);
  t.fillStyle = '#999';
  t.fillRect(16, 2, 8, 10);
  t.fillStyle = '#ff3b30';
  t.beginPath();
  t.arc(22, 20, 7, 0, Math.PI * 2);
  t.fill();
}

function collectDrops(F, out) {
  for (const d of F.g.drops || []) {
    const wd = WEAPONS[d.wid];
    if (!wd) continue;
    const dx = d.x - F.cx, dy = d.y - F.cy;
    const depth = dx * F.cos + dy * F.sin;
    if (depth < NEAR || depth > F.fogMax) continue;
    const perp = -dx * F.sin + dy * F.cos;
    const col = DROP_COL[wd.kind] || '#ccc';
    out.push({ depth, perp, cv: fxCanvas(F.g, 'drop:' + wd.kind, (t, cw, ch) => {
      t.fillStyle = 'rgba(24,26,32,0.9)';
      t.fillRect(2, 2, cw - 4, ch - 4);
      t.fillStyle = col;
      t.fillRect(2, 4, cw - 4, 3);
      t.fillStyle = 'rgba(255,255,255,0.6)';
      t.fillRect(2, 2, 5, 2);
    }), sw: 26 * F.U, sh: 8 * F.U, baseH: 0 });
  }
}

function collectGrenades(F, out) {
  for (const gn of F.g.grenades || []) {
    const dx = gn.x - F.cx, dy = gn.y - F.cy;
    const depth = dx * F.cos + dy * F.sin;
    if (depth < NEAR || depth > F.fogMax) continue;
    const perp = -dx * F.sin + dy * F.cos;
    const col = gn.kind === 'he' ? '#2f6b2f' : (gn.kind === 'flash' ? '#c9c9c9' : '#5a5f66');
    out.push({ depth, perp, cv: fxCanvas(F.g, 'nade:' + gn.kind, (t, cw, ch) => {
      t.fillStyle = col;
      t.beginPath();
      t.arc(cw / 2, ch / 2, cw * 0.36, 0, Math.PI * 2);
      t.fill();
      t.fillStyle = '#111';
      t.fillRect(cw / 2 - 2, ch / 2 - 5, 4, 10);
    }), sw: 12 * F.U, sh: 12 * F.U, baseH: 0 });
  }
}

// 小物件画布缓存（key → canvas）
function fxCanvas(game, key, draw) {
  let map = game._fxCvs;
  if (!map) map = game._fxCvs = new Map();
  let cv = map.get(key);
  if (!cv) {
    const cw = key === 'bomb' ? 40 : (key.indexOf('drop:') === 0 ? 32 : 16);
    const ch = key === 'bomb' ? 32 : (key.indexOf('drop:') === 0 ? 10 : 16);
    cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    draw(cv.getContext('2d'), cw, ch);
    map.set(key, cv);
  }
  return cv;
}

// 通用 billboard 绘制：先查列区间有无更近墙（无 → 整张快绘；有 → 逐列裁到墙顶以下）
function drawSprite(F, zbuf, s) {
  const t = F.cctx;
  const depth = s.depth;
  if (depth < NEAR || depth > F.fogMax) return;
  const k = 1 / depth;
  const sx = F.iw / 2 + s.perp * k * F.focal;
  const dw = F.focal * s.sw * k;
  const dh = F.focal * s.sh * k;
  if (dw < 0.5 || dh < 0.5) return;
  const syTop = projectAt(F, depth, s.perp, s.baseH + s.sh, true).sy;
  const syBot = projectAt(F, depth, s.perp, s.baseH, true).sy;
  const x0 = Math.floor(sx - dw / 2), x1 = Math.ceil(sx + dw / 2);
  let clipped = false;
  for (let c = Math.max(0, x0); c <= Math.min(F.iw - 1, x1); c++) {
    if (zbuf[c] && zbuf[c].d < depth) { clipped = true; break; }
  }
  t.globalAlpha = s.alpha === undefined ? 1 : s.alpha;
  if (!clipped) {
    t.drawImage(s.cv, sx - dw / 2, syTop, dw, dh);
  } else {
    // 逐列裁剪：墙后 sprite 只画墙顶以上部分（sprite 更远更小，整列高度都落在墙的纵向范围内）
    for (let c = Math.max(0, x0); c <= Math.min(F.iw - 1, x1); c++) {
      const wall = zbuf[c];
      const visBot = wall && wall.d < depth ? Math.min(syBot, wall.yTop) : syBot;
      if (visBot <= syTop) continue;
      const srcX = Math.max(0, (c - (sx - dw / 2)) / dw) * s.cv.width;
      const srcH = (visBot - syTop) / dh * s.cv.height;
      t.drawImage(s.cv, srcX, 0, 1, srcH, c, syTop, 1, visBot - syTop);
    }
  }
  t.globalAlpha = 1;
  // D3 击杀者高亮：红色脉冲圆角矩形描边（叠加在精灵之后）
  if (s.isKiller) {
    const ka = 0.9 + 0.1 * Math.sin(F.time * 6);
    t.strokeStyle = 'rgba(255,60,40,' + ka.toFixed(3) + ')';
    t.lineWidth = 2;
    t.strokeRect(sx - dw / 2 - 2, syTop - 2, dw + 4, dh + 4);
  }
}

// 粒子：只画前 60 个，2-4px 屏幕小方块（shell/swing 跳过）
function drawParticles(F) {
  const t = F.cctx;
  const styles = {
    blood: 'rgba(150,20,15,',
    spark: 'rgba(255,200,110,',
    fire: 'rgba(255,150,60,',
    boom: 'rgba(255,150,50,',
    wood: 'rgba(150,110,60,',
    splash: 'rgba(120,190,235,'
  };
  const parts = F.g.particles || [];
  const n = Math.min(parts.length, 60);
  for (let i = 0; i < n; i++) {
    const pa = parts[i];
    const style = styles[pa.kind];
    if (!style) continue;
    const dx = pa.x - F.cx, dy = pa.y - F.cy;
    const depth = dx * F.cos + dy * F.sin;
    if (depth < NEAR || depth > F.fogMax) continue;
    const perp = -dx * F.sin + dy * F.cos;
    const pt = projectAt(F, depth, perp, 0, true);
    const sx = pt.sx;
    const sy = pt.sy;
    // 火花等命中反馈粒子更大更亮（近距离按焦距缩放）
    const sz = clamp((pa.size || 2) * (pa.kind === 'spark' || pa.kind === 'fire' ? 1.6 : 1), 2, 7);
    t.fillStyle = style + clamp(pa.life, 0, 1).toFixed(3) + ')';
    t.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
  }
  t.globalAlpha = 1;
}

// 弹道：两端点投影（clampRange 时钳到 [NEAR, fogMax]，近端贴相机、远端超雾距也能画出穿过视野的部分）
function drawTracers(F) {
  const t = F.cctx;
  for (const tr of F.g.tracers || []) {
    const a = clamp(tr.life / 0.09, 0, 1);
    const p1 = projectPoint(F, tr.x1, tr.y1, true);
    const p2 = projectPoint(F, tr.x2, tr.y2, true);
    if (!p1 || !p2) continue;
    t.strokeStyle = tr.team === 'ct' ? 'rgba(110,180,255,' + a.toFixed(3) + ')' : 'rgba(255,190,90,' + a.toFixed(3) + ')';
    t.lineWidth = 1.6;
    t.beginPath();
    t.moveTo(p1.sx, p1.sy);
    t.lineTo(p2.sx, p2.sy);
    t.stroke();
  }
}

// 激光瞄准线：眼高方向，相机中心 → 命中点（投影到水平线，开镜时与准星对齐）
function drawLaser(F, alive, p) {
  if (!alive || !p.laserEnd) return;
  const t = F.cctx;
  const wz = Number.isFinite(p.laserEnd.z) ? p.laserEnd.z : 0;
  const pt = projectPoint(F, p.laserEnd.x, p.laserEnd.y, true, wz);
  const a = p.scoped ? 0.9 : 0.4;
  t.strokeStyle = 'rgba(255,70,70,' + a + ')';
  t.lineWidth = 1.5;
  t.beginPath();
  t.moveTo(F.iw / 2, F.ih / 2);
  t.lineTo(pt.sx, pt.sy);
  t.stroke();
}

// 枪口火光：屏幕中心黄色放射星光
function drawMuzzle(F, alive, p) {
  if (!alive || !p.muzzleT || p.muzzleT <= 0) return;
  const t = F.cctx;
  const a = clamp(p.muzzleT / 0.08, 0, 1);
  const mx = F.iw / 2, my = F.ih / 2;
  t.fillStyle = 'rgba(255,215,94,' + a.toFixed(3) + ')';
  t.beginPath();
  t.arc(mx, my, 8, 0, Math.PI * 2);
  t.fill();
  t.fillStyle = 'rgba(255,243,192,' + a.toFixed(3) + ')';
  t.beginPath();
  t.arc(mx, my, 4, 0, Math.PI * 2);
  t.fill();
  t.strokeStyle = 'rgba(255,215,94,' + a.toFixed(3) + ')';
  t.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const ang = i * Math.PI / 2 + Math.PI / 4;
    t.beginPath();
    t.moveTo(mx + Math.cos(ang) * 10, my + Math.sin(ang) * 10);
    t.lineTo(mx + Math.cos(ang) * 18, my + Math.sin(ang) * 18);
    t.stroke();
  }
  // A4 枪口闪光泛光：lighter 混合径向渐变（开镜时跳过）
  if (!F.scoped) {
    const gy = F.horizon + F.ih * 0.18;
    const gr = F.ih * 0.35;
    const glow = t.createRadialGradient(mx, gy, gr * 0.08, mx, gy, gr);
    glow.addColorStop(0, 'rgba(255,210,120,' + (a * 0.2).toFixed(3) + ')');
    glow.addColorStop(1, 'rgba(255,210,120,0)');
    t.globalCompositeOperation = 'lighter';
    t.fillStyle = glow;
    t.fillRect(mx - gr, gy - gr, gr * 2, gr * 2);
    t.globalCompositeOperation = 'source-over';
  }
}

// ===== A2 武器 viewmodel（程序化立绘，全部 fillRect/ellipse/quadraticCurveTo，无资源）=====
function drawViewmodel(F, alive, p) {
  if (!alive || !p) return;
  const t = F.cctx;
  const s = Math.min(F.iw, F.ih) / 360;
  const mx = F.iw * 0.5, my = F.ih * 0.62; // 枪口锚点
  // 手雷槽：绿圆 + 拉环
  if (p.slot && p.slot.indexOf('nade:') === 0) { drawNadeVM(t, F, p, mx, my, s); return; }
  const w = weaponDef(p);
  if (!w) return;
  const wid = p.slot === 'primary'
    ? (p.weapons && p.weapons.primary ? p.weapons.primary : (p.weapons && p.weapons.secondary ? p.weapons.secondary : 'glock'))
    : (p.slot === 'knife' ? 'knife' : (p.weapons && p.weapons.secondary ? p.weapons.secondary : 'glock'));
  // —— 状态联动（全部只读 game 已有状态）——
  const kick = p.recoil || 0;
  let dx = 0, dy = -kick * 6;
  // 步态摆动（仅行走时）
  const ph = p.bobPhase || 0;
  if (p.walking) { dx += Math.sin(ph) * 2.2; dy += Math.abs(Math.cos(ph)) * 1.5; }
  // 换弹动画：t<0.15 整体下移出屏；中间段弹匣下拉 18px 旋转 -20°；t>0.85 复位
  let magDY = 0, magRot = 0;
  if (p.reloading) {
    const tFrac = 1 - (p.reloadT || 0) / ((w.reload || 2000) / 1000);
    if (tFrac < 0.15) dy += 60;
    else {
      const mid = clamp((tFrac - 0.15) / 0.7, 0, 1);
      magDY = 18 * s * mid;
      magRot = -0.35 * mid;
    }
  }
  // 切枪动画：模块级 vmSwap 自维护（key 变化 → 0.18s 从右下滑入）
  const key = wid + ':' + (p.slot || '');
  if (vmSwap.key !== key) vmSwap = { key, t: 0.18, lastT: F.time };
  else {
    const dt = F.time - vmSwap.lastT;
    vmSwap.lastT = F.time;
    if (dt > 0 && dt < 0.5) vmSwap.t = Math.max(0, vmSwap.t - dt);
  }
  if (vmSwap.t > 0) dx += 60 * vmSwap.t;
  const alpha = vmSwap.t > 0 ? clamp(vmSwap.t / 0.18, 0, 1) : 1;
  // 开镜：武器整体下移出屏，只留枪口一角（AWP 开镜视角）
  if (F.scoped) dy += 120;
  // 弹药提示：弹匣不足 25% 时枪身画 3px 红点
  const lowAmmo = w.mag > 0 && (p.ammoMap || {})[wid] !== undefined && (p.ammoMap || {})[wid] < w.mag * 0.25;
  // 布局：枪身向右下延伸约 (iw*0.16, ih*0.26)
  const bx = F.iw * 0.16, by = F.ih * 0.26;
  const L = Math.hypot(bx, by);
  t.save();
  t.globalAlpha = alpha;
  t.translate(mx, my + dy);
  t.translate(dx, 0);
  t.rotate(Math.atan2(by, bx) + kick * 0.04); // 后坐绕枪口锚点旋转
  drawGunParts(t, w, wid, L, s, magDY, magRot, lowAmmo);
  // 持枪手（枪身尾部肤色椭圆，与 entitySprite 手臂风格一致）
  if (w.kind !== 'knife') {
    t.fillStyle = '#d8a87a';
    t.beginPath();
    t.ellipse(L * 0.95, s, 7 * s, 5 * s, 0, 0, Math.PI * 2);
    t.fill();
  }
  t.restore();
}

// 按武器 kind 差异化的枪身绘制（局部坐标：枪口在原点，枪身沿 +x 向枪托）
function drawGunParts(t, w, wid, L, s, magDY, magRot, lowAmmo) {
  const kind = w.kind;
  const dark = '#1c1f24', mid = '#2a2d33';
  const wood = (wid === 'ak' || wid === 'ak47') ? '#6b4a2b' : (wid === 'm4' ? '#4d5d3f' : '#7a4a26');
  if (kind === 'knife') {
    t.strokeStyle = '#cfd4da'; // 银白刃弧线
    t.lineWidth = 2.6 * s;
    t.beginPath();
    t.moveTo(0, 0);
    t.quadraticCurveTo(L * 0.45, -7 * s, L, 4 * s);
    t.stroke();
    t.fillStyle = dark;
    t.fillRect(L * 0.62, -2 * s, L * 0.3, 5 * s);
    return;
  }
  // 枪管
  if (kind === 'shotgun') {
    t.fillStyle = '#23262b'; // 粗双管
    t.fillRect(0, -5 * s, L * 0.58, 3.1 * s);
    t.fillRect(0, 1.7 * s, L * 0.58, 3.1 * s);
    t.fillStyle = wood;      // 栗木泵动护木
    t.fillRect(L * 0.16, -5.8 * s, L * 0.16, 11.6 * s);
  } else if (kind === 'sniper') {
    t.fillStyle = '#262a30'; // 长筒
    t.fillRect(0, -2.6 * s, L * 0.95, 5.2 * s);
  } else if (kind === 'rifle') {
    t.fillStyle = mid;
    t.fillRect(0, -2.8 * s, L * 0.6, 5.6 * s);
  } else if (kind === 'smg') {
    t.fillStyle = mid;       // 短管
    t.fillRect(0, -2.8 * s, L * 0.42, 5.6 * s);
  } else {
    t.fillStyle = '#2f343c'; // 手枪小巧
    t.fillRect(0, -2.5 * s, L * 0.6, 5 * s);
  }
  // 机匣 / 枪身
  if (kind === 'rifle') {
    t.fillStyle = dark;
    t.fillRect(L * 0.34, -3.4 * s, L * 0.5, 6.8 * s);
    drawMag(t, L * 0.4, 3.4 * s, 5 * s, 11 * s, magRot, magDY);
    t.save(); t.translate(L * 0.56, 3.2 * s); t.rotate(0.5);
    t.fillStyle = wood; t.fillRect(-2.6 * s, 0, 5.2 * s, 10 * s); t.restore();
    t.fillStyle = wood;
    t.fillRect(L * 0.78, -2.6 * s, L * 0.2, 5.2 * s);
  } else if (kind === 'smg') {
    t.fillStyle = dark;
    t.fillRect(L * 0.28, -3.6 * s, L * 0.42, 7.2 * s);
    drawMag(t, L * 0.36, 3.6 * s, 4.2 * s, 9 * s, magRot, magDY);
    t.fillStyle = '#3a4048';
    t.fillRect(L * 0.66, -2.2 * s, L * 0.2, 4.4 * s);
  } else if (kind === 'shotgun') {
    t.fillStyle = wood;      // 栗木枪托
    t.fillRect(L * 0.4, -4.6 * s, L * 0.42, 9.2 * s);
    t.fillStyle = dark;
    t.fillRect(L * 0.8, -3 * s, L * 0.18, 6 * s);
  } else if (kind === 'sniper') {
    t.fillStyle = '#15171b'; // 镜筒 + 小圆透镜
    t.fillRect(L * 0.36, -5.6 * s, L * 0.24, 8.4 * s);
    t.fillStyle = '#8a8f96';
    t.beginPath();
    t.arc(L * 0.44, -3.6 * s, 1.8 * s, 0, Math.PI * 2);
    t.arc(L * 0.56, -3.6 * s, 1.8 * s, 0, Math.PI * 2);
    t.fill();
    t.fillStyle = dark;
    t.fillRect(L * 0.46, -3.2 * s, L * 0.36, 6.4 * s);
    t.fillStyle = '#3f3a33';
    t.fillRect(L * 0.8, -2.6 * s, L * 0.18, 5.2 * s);
  } else { // pistol
    t.fillStyle = dark;
    t.fillRect(L * 0.4, -2.6 * s, L * 0.3, 5.2 * s);
    drawMag(t, L * 0.58, 2.6 * s, 3.6 * s, 7 * s, magRot, magDY);
    t.save(); t.translate(L * 0.56, 2.4 * s); t.rotate(0.45);
    t.fillStyle = '#3a4048'; t.fillRect(-2.2 * s, 0, 4.4 * s, 9 * s); t.restore();
  }
  // 弹药不足提示（枪身上 3px 红点）
  if (lowAmmo) {
    t.fillStyle = 'rgba(255,40,30,0.95)';
    t.fillRect(L * 0.42, -1.6 * s, 3 * s, 3 * s);
  }
}

// 弹匣部件（换弹时相对机匣下拉 + 旋转）
function drawMag(t, x, y, w2, h2, rot, dyOff) {
  t.save();
  t.translate(x, y);
  t.rotate(rot);
  t.fillStyle = '#1f2329';
  t.fillRect(-w2 / 2, dyOff, w2, h2);
  t.fillStyle = '#3a4048';
  t.fillRect(-w2 / 2, dyOff, w2, 1.6);
  t.restore();
}

// 手雷 viewmodel：绿圆 + 拉环 + 持雷手
function drawNadeVM(t, F, p, mx, my, s) {
  const ph = p.bobPhase || 0;
  const bob = p.walking ? Math.abs(Math.cos(ph)) * 1.5 : 0;
  t.save();
  t.translate(mx, my + 10 * s + bob);
  t.fillStyle = '#2f6b2f';
  t.beginPath(); t.arc(0, 0, 7 * s, 0, Math.PI * 2); t.fill();
  t.fillStyle = 'rgba(255,255,255,0.15)';
  t.beginPath(); t.arc(-2 * s, -2.2 * s, 2.6 * s, 0, Math.PI * 2); t.fill();
  t.strokeStyle = '#9aa0a8';
  t.lineWidth = 1.4 * s;
  t.beginPath(); t.arc(0, -6.4 * s, 2 * s, 0, Math.PI * 2); t.stroke();
  t.strokeStyle = '#5a5f66';
  t.beginPath(); t.moveTo(0, -4.6 * s); t.quadraticCurveTo(2.2 * s, -9 * s, 0, -13 * s); t.stroke();
  t.fillStyle = '#d8a87a';
  t.beginPath(); t.ellipse(4.4 * s, 4 * s, 6 * s, 4.4 * s, 0.4, 0, Math.PI * 2); t.fill();
  t.restore();
}

// ===== A4 动态光照：暗角（按地图 id 懒缓存离屏画布）=====
function vignetteCanvas(F) {
  const map = getMap();
  const id = (map && map.id) || '?';
  let v = vignetteCache.get(id);
  if (v && v.iw === F.iw && v.ih === F.ih) return v.cv;
  const c = document.createElement('canvas');
  c.width = F.iw; c.height = F.ih;
  const t = c.getContext('2d');
  const cx = F.iw / 2, cy = F.ih * 0.46;
  const R = Math.max(F.iw, F.ih) * 0.72;
  const g = t.createRadialGradient(cx, cy, R * 0.42, cx, cy, R);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.36)');
  t.fillStyle = g;
  t.fillRect(0, 0, F.iw, F.ih);
  // 底部略重
  const gb = t.createLinearGradient(0, F.ih * 0.72, 0, F.ih);
  gb.addColorStop(0, 'rgba(0,0,0,0)');
  gb.addColorStop(1, 'rgba(0,0,0,0.16)');
  t.fillStyle = gb;
  t.fillRect(0, F.ih * 0.72, F.iw, F.ih * 0.28);
  vignetteCache.set(id, { iw: F.iw, ih: F.ih, cv: c });
  return c;
}

// AWP 开镜遮罩：黑环 + 细十字线 + 中心点（B5 按 scopeT 淡入，过渡初期只画十字）
function drawScope(F) {
  const t = F.cctx;
  const st = F.scopeT !== undefined ? F.scopeT : 1;
  const mx = F.iw / 2, my = F.ih / 2;
  t.globalAlpha = st;
  if (st >= 0.12) {
    t.fillStyle = '#000';
    t.beginPath();
    t.rect(0, 0, F.iw, F.ih);
    t.arc(mx, my, Math.min(F.iw, F.ih) * 0.46, 0, Math.PI * 2);
    t.fill('evenodd');
  }
  t.strokeStyle = 'rgba(255,255,255,0.9)';
  t.lineWidth = 2;
  t.beginPath();
  t.moveTo(mx, 0); t.lineTo(mx, F.ih);
  t.moveTo(0, my); t.lineTo(F.iw, my);
  t.stroke();
  t.fillStyle = 'rgba(255,255,255,0.9)';
  t.fillRect(mx - 1.5, my - 1.5, 3, 3);
  t.globalAlpha = 1;
}

// 相机空间投影：hDepth 为 yaw 平面的前向距离，wz 为世界高度。
// safe 时把相机深度钳到 [NEAR, fogMax]，用于墙体/弹道这类需要画到屏幕边缘的对象。
function projectAt(F, hDepth, perp, wz, safe) {
  const dz = wz - F.eyeH;
  let camDepth = hDepth * F.cosP + dz * F.sinP;
  if (safe) camDepth = clamp(camDepth, NEAR, F.fogMax);
  else if (camDepth < NEAR || camDepth > F.fogMax) return null;
  const up = -hDepth * F.sinP + dz * F.cosP;
  return {
    sx: F.iw / 2 + perp / camDepth * F.focal,
    sy: F.centerY - up / camDepth * F.focal
  };
}

// 世界点 → 屏幕（clampRange 时把深度钳到 [NEAR, fogMax] 而非丢弃，用于弹道/激光这类连线绘制）
function projectPoint(F, wx, wy, clampRange, wz = 0) {
  const dx = wx - F.cx, dy = wy - F.cy;
  const hDepth = dx * F.cos + dy * F.sin;
  const perp = -dx * F.sin + dy * F.cos;
  return projectAt(F, hDepth, perp, wz, !!clampRange);
}
