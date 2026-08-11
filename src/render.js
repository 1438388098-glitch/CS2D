import {WEAPONS, DROP_COL, TILE} from './config.js';
import {weaponDef} from './entities.js';
import {getMap, getGrid} from './map.js';
import {gunLen} from './render-utils.js';
import {clamp, rand} from './utils.js';
const mapTile = () => getMap()?.tile || TILE;
import {ARCHETYPES} from './persona.js';
import {fogEnabled} from './fog.js';
import {renderFogLayer} from './fog-layer.js';
import {drawAmbientDust} from './ambient-fx.js';
import {weaponSwitchPop, muzzleSmoke, drawMuzzleSmoke, drawWeaponPop, MUZZLE_SMOKE_LIFE} from './weapon-fx.js';
import {nadeTrajectory, drawNadeTrajectory, NADE_SPEED, NADE_ORIGIN_DIST} from './nade-fx.js';
import {drawRipple, rippleRing, RIPPLE_LIFE} from './water-fx.js';
import {smokeDissolveTrail, drawSmokeTrail, SMOKE_DISSOLVE_LIFE} from './smoke-fx.js';
import {stepCycle, stepDust, drawStepFx, DUST_PER_STEP} from './anim-fx.js';
import {impactMarksAt, drawImpact} from './impact-fx.js';
import {weatherKind, weatherParticles, drawWeather, MAX_PARTICLES as WEATHER_MAX_PARTICLES} from './weather-fx.js';
import {enhancedBoomSpec, drawEnhancedBoom} from './boom-fx.js';
import {visibleShadows, drawShadows} from './shadow-fx.js';
import {killLabel, drawKillLabel, KILL_LABEL_DUR} from './killcam-fx.js';
import {footprintsForPath, drawFootprint, FOOTPRINT_GAP, FOOTPRINT_LIFE, FOOTPRINT_TIME_LIFE} from './footprint-fx.js';
import {initRenderer2dGpu, render2dGpuFrame, render2dGpuReady, render2dGpuIsSoftware, updateFogGpu, rebuildShadowLayer} from './render2d-gpu.js';
import {viewAngle, viewX, viewY} from './render-smooth.js';

let ctx = null;
let layers = null;
let gpu2d = false;
let baseLayer = null;
let baseLayerRev = -1;
let shadowLayerRev = -1;

// 脚步动画渲染态：每实体累积移动距离 + 稳定 seed（渲染私有，不影响游戏逻辑）
const stepFXState = new Map();
// 脚印渲染态：每实体最近移动路径采样点（渲染私有，确定性，无 Math.random）
const footprintPathState = new Map();
// 脚印窗口长度：覆盖 FOOTPRINT_LIFE 移动距离所需的采样点数（含余量）
const FOOTPRINT_MAX_PTS = Math.ceil(FOOTPRINT_LIFE / FOOTPRINT_GAP) + 2;
// 掩体投影固定光源方向：右下角 45° 光照（纯装饰，固定值保证可复现）
const SHADOW_LIGHT_DIR = Math.PI * 0.25;

export function initRenderer(canvas, layersRef) {
  ctx = canvas.getContext('2d');
  layers = layersRef;
  gpu2d = initRenderer2dGpu(canvas, layersRef);
  baseLayer = null;
  baseLayerRev = -1;
  shadowLayerRev = -1;
}

// 静态底图合成：把不变的地图/贴花/阴影叠成一张画布，普通帧只画一次，
// 避免软件 Canvas 每帧重复栅格化三张全图图层。
function ensureBaseLayer(game) {
  if (!layers || !layers.staticLayer) return null;
  const srev = game._shadowRev || 0;
  if (layers.shadowLayer && srev !== shadowLayerRev) {
    rebuildShadowLayer(game);
    shadowLayerRev = srev;
  }
  const rev = (game._decalRev || 0) + ':' + (game._shadowRev || 0);
  const W = layers.staticLayer.width;
  const H = layers.staticLayer.height;
  if (baseLayer && baseLayer.width === W && baseLayer.height === H && baseLayerRev === rev) {
    return baseLayer;
  }
  if (!baseLayer || baseLayer.width !== W || baseLayer.height !== H) {
    baseLayer = document.createElement('canvas');
    baseLayer.width = W;
    baseLayer.height = H;
  }
  const bctx = baseLayer.getContext('2d');
  bctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.clearRect(0, 0, W, H);
  bctx.drawImage(layers.staticLayer, 0, 0);
  bctx.drawImage(layers.decalLayer, 0, 0);
  if (layers.shadowLayer) bctx.drawImage(layers.shadowLayer, 0, 0);
  baseLayerRev = rev;
  return baseLayer;
}

// 软件渲染底图只贴相机可见切片；全图 drawImage 在 CPU Canvas 上会重复栅格化大量不可见像素。
function drawWorldSlice(layer, game) {
  if (!layer || !game) return;
  const map = getMap();
  if (!map || !map.W || !map.H) return;
  const z = game.zoom || 1;
  const w2 = (game.canvasW || 0) / z;
  const h2 = (game.canvasH || 0) / z;
  const camX = game.camX || 0;
  const camY = game.camY || 0;
  const shx = game._shx || 0;
  const shy = game._shy || 0;
  const margin = 64;
  const sx0 = Math.max(0, camX - shx - w2 / 2 - margin);
  const sy0 = Math.max(0, camY - shy - h2 / 2 - margin);
  const sx1 = Math.min(map.W, camX - shx + w2 / 2 + margin);
  const sy1 = Math.min(map.H, camY - shy + h2 / 2 + margin);
  const sw = Math.max(0, sx1 - sx0);
  const sh = Math.max(0, sy1 - sy0);
  if (sw <= 0 || sh <= 0) return;
  ctx.drawImage(layer, sx0, sy0, sw, sh, sx0, sy0, sw, sh);
}

export function render(game) {
  const __t0 = performance.now();
  const __marks = {};
  game._renderStageMs = __marks;
  const dpr = game.dpr || 1;
  const w2 = ctx.canvas.width / dpr;
  const h2 = ctx.canvas.height / dpr;
  const p = game.player;
  if (!p || p.dead) {
    if (!(game.cyber && game.state === 'LIVE' && !game.cyber.ended)) game.zoom = 0.75;
  }
  const useGpu = gpu2d && render2dGpuReady();
  const useGpuBase = useGpu && !render2dGpuIsSoftware();
  game._render2dGpu = useGpu;
  game._render2dGpuBase = useGpuBase;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#14161a';
  ctx.fillRect(0, 0, w2, h2);
  const scale = game.zoom;
  let shx = 0, shy = 0;
  if (game.shake > 0) {
    shx = rand(-game.shake, game.shake);
    shy = rand(-game.shake, game.shake);
  }
  game._shx = shx;
  game._shy = shy;
  if (useGpuBase) render2dGpuFrame(game, 'base');
  ctx.save();
  ctx.translate(w2 / 2, h2 / 2);
  // 地图固定：所有视角都不旋转世界（人物朝向由实体 sprite 的 angle 表现）
  ctx.scale(scale, scale);
  ctx.translate(-game.camX + shx, -game.camY + shy);
  if (!useGpuBase) {
    const base = ensureBaseLayer(game);
    if (base) {
      drawWorldSlice(base, game);
    } else {
      drawWorldSlice(layers.staticLayer, game);
      drawWorldSlice(layers.decalLayer, game);
    }
  }
  __marks.static = performance.now() - __t0;
  let __s = performance.now();
  drawWaterOverlay(game);
  drawWaterRipples(game);
  drawBombSiteMarks(game);
  drawCrates(game);
  drawBomb(game);
  drawDrops(game);
  drawGrenades(game);
  drawNadePreview(game);
  __marks.staticFx = performance.now() - __s;
  __s = performance.now();
  if (!useGpuBase) {
    if (baseLayer && layers.shadowLayer) {
      // 阴影已包含在合成底图中。
    } else if (useGpu && layers.shadowLayer) {
      drawWorldSlice(layers.shadowLayer, game);
    } else {
      drawShadowsLayer(game);
    }
  }
  __marks.shadows = performance.now() - __s;
  __s = performance.now();
  drawEntities(game);
  drawDeathFX(game);
  drawHitOutlines(game);
  drawLaser(game);
  __marks.entities = performance.now() - __s;
  __s = performance.now();
  drawSmokes(game);
  drawParticles(game);
  drawImpacts(game);
  drawTracers(game);
  __marks.fx = performance.now() - __s;
  __s = performance.now();
  drawWeatherLayer(game);
  __marks.weather = performance.now() - __s;
  __s = performance.now();
  if (useGpu && useGpuBase) {
    updateFogGpu(game);
  } else {
    drawFog(game);
  }
  __marks.fog = performance.now() - __s;
  __s = performance.now();
  drawAmbientDust(ctx, game);
  __marks.ambient = performance.now() - __s;
  __s = performance.now();
  drawDmgPops2D(game);
  __marks.dmgPops = performance.now() - __s;
  ctx.restore();
  __s = performance.now();
  if (useGpu && useGpuBase && fogEnabled(game)) render2dGpuFrame(game, 'fog');
  __marks.gpuBlit = performance.now() - __s;
  drawKillLabelFx(game);
  game._renderStageMs = __marks;
}

// 子弹弹孔印记：按 game.time 从 game.impacts 生成存活弹孔并逐个绘制
// （impactMarksAt 纯函数过滤年龄 + 计算淡出 alpha，不依赖 Math.random）
function drawImpacts(game) {
  const hits = game.impacts;
  if (!hits || !hits.length) return;
  const marks = impactMarksAt(hits, game.time);
  for (const m of marks) drawImpact(ctx, m);
}

// 雨雪天气层：地图 id 匹配 rain/snow 才绘制，否则无副作用。
// 粒子在相机视口（世界坐标）区域内生成并平移到相机原点，固定 seed 全确定性。
function drawWeatherLayer(game) {
  const map = getMap();
  if (!map) return;
  const kind = weatherKind(map.id);
  if (!kind) return;
  const z = game.zoom || 1;
  const vw = game.canvasW / z;
  const vh = game.canvasH / z;
  if (!(vw > 0) || !(vh > 0)) return;
  const parts = weatherParticles(kind, game.time, WEATHER_MAX_PARTICLES, vw, vh, weatherSeed(String(map.id)));
  if (!parts.length) return;
  const ox = (game.camX || 0) - vw / 2;
  const oy = (game.camY || 0) - vh / 2;
  ctx.save();
  ctx.translate(ox, oy);
  drawWeather(ctx, parts, kind);
  ctx.restore();
}

// 地图 id -> 固定整数种子（FNV-1a，确定性）
function weatherSeed(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h || 1;
}

// 掩体投影层：只扫描可视范围(+边距)内的墙/箱/桶瓦片并投射固定方向的柔和投影条。
function drawShadowsLayer(game) {
  const grid = getGrid();
  if (!grid || !grid.length) return;
  const z = game.zoom || 1;
  const vw = game.canvasW / z;
  const vh = game.canvasH / z;
  const shadows = visibleShadows(
    { grid, tile: mapTile() },
    { x: (game.camX || 0) - vw / 2, y: (game.camY || 0) - vh / 2, w: vw, h: vh },
    SHADOW_LIGHT_DIR
  );
  if (shadows.length) drawShadows(ctx, shadows);
}

// 击杀标签（killcam-fx）：读取 killEntity 写入的玩家状态，屏幕中央三段式动画。
// 在 render() 世界变换 restore 之后以画布像素坐标绘制（纯读状态，不修改逻辑）。
function drawKillLabelFx(game) {
  const p = game.player;
  if (!p || p.dead || !(p.killStreakT > 0)) return;
  const elapsed = KILL_LABEL_DUR - p.killStreakT;
  if (elapsed < 0 || elapsed >= KILL_LABEL_DUR) return;
  const streak = game.killStreak || 1;
  const kind = streak >= 2 ? 'multikill' : (game.killLabelHead ? 'headshot' : 'normal');
  drawKillLabel(ctx, killLabel(kind, streak, elapsed));
}

// 脚印渲染态 + 绘制：每实体按 FOOTPRINT_GAP 间距记录最近路径采样点（渲染私有），
// 用 footprintsForPath + drawFootprint 在实体脚下绘制存活脚印（确定性，无 Math.random）。
function drawEntityFootprints(game, e) {
  if (e !== game.player) return;
  let st = footprintPathState.get(e);
  if (!st) {
    st = { pts: [{ x: e.x, y: e.y, t: game.time }], acc: 0, seed: ((Math.floor(e.x) * 73856093 ^ Math.floor(e.y) * 19349663) >>> 0) || 1 };
    footprintPathState.set(e, st);
  }
  const moving = Math.hypot(e.vx || 0, e.vy || 0) > 18;
  if (moving) {
    const last = st.pts[st.pts.length - 1];
    st.acc += Math.hypot(e.x - last.x, e.y - last.y);
    while (st.acc >= FOOTPRINT_GAP && st.pts.length < FOOTPRINT_MAX_PTS * 2) {
      st.acc -= FOOTPRINT_GAP;
      st.pts.push({ x: e.x, y: e.y, t: game.time });
      if (st.pts.length > FOOTPRINT_MAX_PTS) st.pts.shift();
    }
  } else {
    st.acc = 0;
  }
  const pts = st.pts;
  if (pts.length < 2) return;
  const t = Math.min(FOOTPRINT_TIME_LIFE, Math.max(0, game.time - (pts[0].t || game.time)));
  const fps = footprintsForPath(pts, t, st.seed);
  if (!fps.length) return;
  for (const fp of fps) drawFootprint(ctx, fp);
}

// 2D 伤害数字：命中处上浮淡出（描黑边可读），与 3D 的 B3 反馈一致
function drawHitOutlines(game) {
  const marks = game.hitOutlines || [];
  if (!marks.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (const ho of marks) {
    const e = ho.target;
    if (!e || e.dead || ho.t <= 0) continue;
    const alpha = clamp(ho.t / (ho.head ? 0.45 : 0.3), 0, 1);
    const col = e.team === 'ct' ? '77,180,255' : '255,170,80';
    ctx.strokeStyle = 'rgba(' + col + ',' + (0.18 * alpha) + ')';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, 18, 18, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(' + col + ',' + (0.92 * alpha) + ')';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, 18, 18, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDmgPops2D(game) {
  const pops = game.dmgPops;
  if (!pops || !pops.length) return;
  const t = ctx;
  t.font = '12px Arial';
  t.textAlign = 'center';
  t.lineJoin = 'round';
  t.lineWidth = 3;
  const n = Math.min(pops.length, 12);
  for (let i = 0; i < n; i++) {
    const pop = pops[i];
    if (!pop || pop.t === undefined || pop.t > 0.8) continue;
    let sy = pop.y - (1 - pop.t / 0.8) * 30;
    t.globalAlpha = clamp(pop.t / 0.3, 0, 1);
    t.strokeStyle = '#000';
    t.fillStyle = pop.head ? '#ffd34d' : '#ffffff';
    const txt = String(Math.round(pop.dmg));
    t.strokeText(txt, pop.x, sy);
    t.fillText(txt, pop.x, sy);
  }
  t.globalAlpha = 1;
  t.textAlign = 'start';
}

// 动态水面：可见浅水瓦片叠加移动亮线（时间相位差），裁剪到相机视口
function drawWaterOverlay(game) {
  if (game.state !== 'BUY' && game.state !== 'LIVE') return;
  const grid = getGrid();
  if (!grid || !grid.length) return;
  const now = performance.now() / 1000;
  const x0 = Math.max(0, Math.floor((game.camX - game.canvasW / game.zoom / 2) / mapTile()) - 1);
  const y0 = Math.max(0, Math.floor((game.camY - game.canvasH / game.zoom / 2) / mapTile()) - 1);
  const x1 = Math.min(grid[0].length, Math.ceil((game.camX + game.canvasW / game.zoom / 2) / mapTile()) + 1);
  const y1 = Math.min(grid.length, Math.ceil((game.camY + game.canvasH / game.zoom / 2) / mapTile()) + 1);
  ctx.save();
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (grid[y][x] !== '~') continue;
      const px = x * mapTile(), py = y * mapTile();
      const seed = (x * 7 + y * 13) % 17;
      const off = (now * 14 + seed * 5) % 30;
      ctx.fillStyle = 'rgba(220,240,255,0.20)';
      ctx.fillRect(px + off - 10, py + 8 + (seed % 5) * 5, 8, 1.5);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(px + ((off + 16) % 30) - 12, py + 4 + ((seed + 3) % 6) * 4, 6, 1);
    }
  }
  ctx.restore();
}

// 涟漪环：遍历 game.ripples，按 game.time 推进纯函数 rippleRing 生成扩散圆环
// （半径增大/透明度衰减），确定性相位（同 seed 可复现），叠加在浅水微光之上
function drawWaterRipples(game) {
  const ripples = game.ripples;
  if (!ripples || !ripples.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const rp of ripples) {
    const el = (game.time || 0) - (rp.t0 || 0);
    if (el < 0 || el >= RIPPLE_LIFE) continue;
    drawRipple(ctx, rippleRing(rp.x, rp.y, el, rp.r0));
  }
  ctx.restore();
}

function drawBombSiteMarks(game) {
  const map = getMap();
  if (game.state !== 'BUY' && game.state !== 'LIVE') return;
  if (!map.sites || !map.sites.A || !map.sites.B) return;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 400);
  ctx.strokeStyle = 'rgba(255,150,90,' + (0.25 + 0.2 * pulse) + ')';
  ctx.lineWidth = 3;
  ctx.strokeRect(map.sites.A.x0, map.sites.A.y0, map.sites.A.x1 - map.sites.A.x0, map.sites.A.y1 - map.sites.A.y0);
  ctx.strokeStyle = 'rgba(90,160,255,' + (0.25 + 0.2 * pulse) + ')';
  ctx.strokeRect(map.sites.B.x0, map.sites.B.y0, map.sites.B.x1 - map.sites.B.x0, map.sites.B.y1 - map.sites.B.y0);
}

export function crateRenderSpec(x, y, hp, tile = mapTile()) {
  const px = x - tile / 2;
  const py = y - tile / 2;
  const hash = (n) => {
    let h = (Math.floor(x) * 374761393 ^ Math.floor(y) * 668265263 ^ n * 1274126177) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return (h ^ (h >>> 16)) / 4294967296;
  };
  const planks = [];
  const bolts = [];
  const cracks = [];
  for (let i = 0; i < 3; i++) {
    const yPos = py + tile * (0.22 + i * 0.28);
    const offset = (hash(i) - 0.5) * tile * 0.12;
    planks.push({ y: yPos, x1: px + 3, x2: px + tile - 3, offset });
  }
  const boltPos = [[4, 4], [tile - 4, 4], [4, tile - 4], [tile - 4, tile - 4]];
  for (let i = 0; i < boltPos.length; i++) {
    bolts.push({ x: px + boltPos[i][0], y: py + boltPos[i][1], r: 2 + hash(i + 10) * 0.5 });
  }
  if (hp <= 1) {
    cracks.push({ x1: px + tile * 0.18, y1: py + tile * 0.2, x2: px + tile * 0.52, y2: py + tile * 0.58, x3: px + tile * 0.34, y3: py + tile * 0.82 });
    cracks.push({ x1: px + tile * 0.62, y1: py + tile * 0.18, x2: px + tile * 0.84, y2: py + tile * 0.48 });
  }
  return {
    px,
    py,
    tile,
    base: hp > 1 ? 'rgba(118,88,54,0.96)' : 'rgba(104,76,48,0.96)',
    planks,
    bolts,
    cracks
  };
}

export function boomShockwaveSpec(p) {
  const maxLife = p.maxLife || 0.5;
  const life = Math.min(Math.max(p.life || 0, 0), maxLife);
  const t = maxLife > 0 ? 1 - life / maxLife : 1;
  const flash = Math.max(0, 1 - t * 2.5);
  return {
    t,
    flash,
    outer: p.size * (0.25 + 0.85 * t),
    inner: p.size * (0.18 + 0.5 * t),
    alpha: (1 - t) * 0.8
  };
}

// 死亡特效生命周期：闪白轮廓在 DEATH_FLASH_TIME 内衰减，尸体星/十字标记停留 DEATH_MARKER_LIFE
export const DEATH_MARKER_LIFE = 1.8;
export const DEATH_FLASH_TIME = 0.28;

// 死亡特效纯计算：统一由死亡剩余时间驱动（确定性，无 Math.random），供绘制与测试断言
export function deathMarkerSpec(e) {
  if (!e) return { x: 0, y: 0, alpha: 0, scale: 0, t: 1, flash: 0, shape: 'cross', rot: 0 };
  const dead = !!e.dead;
  const x = e.x, y = e.y;
  const t = dead ? clamp(1 - (e.deathT || 0) / DEATH_MARKER_LIFE, 0, 1) : 1;
  // 闪白：死亡瞬间最亮，DEATH_FLASH_TIME 内线性衰减到零
  const flash = dead ? clamp(1 - t * (DEATH_MARKER_LIFE / DEATH_FLASH_TIME), 0, 1) : 0;
  // 标记淡入（前 10%）→ 稳定 → 末 30% 淡出
  let alpha = 0;
  if (dead) {
    if (t < 0.1) alpha = t / 0.1;
    else if (t > 0.7) alpha = clamp((1 - t) / 0.3, 0, 1);
    else alpha = 1;
  }
  // 弹出：死亡瞬间 0.55，DEATH_FLASH_TIME 内弹到 1，之后保持
  const scale = dead ? 0.55 + 0.45 * clamp(t * (DEATH_MARKER_LIFE / DEATH_FLASH_TIME), 0, 1) : 1;
  // 形状/旋转：位置哈希确定性选择星形或十字（同 seed 可复现）
  const seed = (Math.floor(x) * 374761393 ^ Math.floor(y) * 668265263) >>> 0;
  const h = (seed ^ (seed >>> 13)) >>> 0;
  return {
    x, y, alpha, scale, t, flash,
    shape: h % 2 === 0 ? 'star' : 'cross',
    rot: (h % 8) * Math.PI / 8
  };
}

function traceMarkerShape(e, shape, rot, R) {
  ctx.beginPath();
  if (shape === 'star') {
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? R : R * 0.42;
      const a = rot + i * Math.PI / 5 - Math.PI / 2;
      const px = e.x + Math.cos(a) * rr;
      const py = e.y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else {
    ctx.moveTo(e.x - R, e.y); ctx.lineTo(e.x + R, e.y);
    ctx.moveTo(e.x, e.y - R); ctx.lineTo(e.x, e.y + R);
  }
}

// 2D 死亡特效：死亡瞬间闪白轮廓 + 尸体星/十字标记（黑边 + 队伍色，短暂停留后淡出）
function drawDeathFX(game) {
  ctx.save();
  ctx.lineCap = 'round';
  for (const e of game.entities) {
    if (!e.dead || !(e.deathT > 0)) continue;
    const s = deathMarkerSpec(e);
    if (s.flash > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * s.flash) + ')';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, 17, 17, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.32 * s.flash) + ')';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, 19, 19, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (s.alpha > 0 && s.scale > 0) {
      const col = e.team === 'ct' ? '110,185,255' : '255,175,90';
      const R = 8.5 * s.scale;
      ctx.strokeStyle = 'rgba(0,0,0,' + (0.55 * s.alpha) + ')';
      ctx.lineWidth = 5;
      traceMarkerShape(e, s.shape, s.rot, R);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(' + col + ',' + s.alpha + ')';
      ctx.lineWidth = 2.5;
      traceMarkerShape(e, s.shape, s.rot, R);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawCrates(game) {
  if (!game.crates || !game.crates.length) return;
  for (const c of game.crates) {
    const s = crateRenderSpec(c.x, c.y, c.hp);
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(s.px + 3, s.py + s.tile - 4, s.tile, 4);
    ctx.fillStyle = s.base;
    ctx.fillRect(s.px, s.py, s.tile, s.tile);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(s.px, s.py, s.tile, 3);
    ctx.strokeStyle = 'rgba(56,40,24,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(s.px + 1, s.py + 1, s.tile - 2, s.tile - 2);
    ctx.strokeStyle = 'rgba(44,31,18,0.48)';
    ctx.lineWidth = 1.25;
    for (const pl of s.planks) {
      ctx.beginPath();
      ctx.moveTo(pl.x1, pl.y);
      ctx.lineTo(pl.x2, pl.y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.px + s.tile * 0.5, s.py + 2);
    ctx.lineTo(s.px + s.tile * 0.5, s.py + s.tile - 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(26,18,10,0.82)';
    for (const bolt of s.bolts) {
      ctx.beginPath();
      ctx.arc(bolt.x, bolt.y, bolt.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (c.hp <= 1) {
      ctx.strokeStyle = 'rgba(34,24,14,0.9)';
      ctx.lineWidth = 1.5;
      for (const crack of s.cracks) {
        ctx.beginPath();
        ctx.moveTo(crack.x1, crack.y1);
        ctx.lineTo(crack.x2, crack.y2);
        if (crack.x3 !== undefined) ctx.lineTo(crack.x3, crack.y3);
        ctx.stroke();
      }
    }
  }
}

function drawBomb(game) {
  if (!game.bomb) return;
  const b = game.bomb;
  if (!b.dropped && !b.planted) return;
  const blink = Math.sin(performance.now() / 180) > 0;
  ctx.save();
  if (b.planted) {
    const pulse = 0.4 + 0.3 * Math.sin(performance.now() / 300);
    ctx.fillStyle = 'rgba(255,60,40,' + pulse * 0.3 + ')';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 34, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#222';
  ctx.fillRect(b.x - 7, b.y - 4, 14, 8);
  ctx.fillStyle = blink ? '#ff3b30' : '#5a0f0a';
  ctx.beginPath();
  ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#999';
  ctx.fillRect(b.x - 2, b.y - 10, 4, 6);
  ctx.restore();
}

function drawDrops(game) {
  ctx.save();
  ctx.font = "12px 'Segoe UI','Microsoft YaHei',sans-serif";
  ctx.textAlign = 'center';
  for (const d of game.drops) {
    const info = dropRenderInfo(d);
    if (!info) continue;
    const blink = 0.65 + 0.35 * Math.sin(performance.now() / 280);
    const near = game.player && !game.player.dead && Math.hypot(game.player.x - d.x, game.player.y - d.y) < 48;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (info.kind === 'kit') {
      ctx.fillStyle = 'rgba(24,26,32,' + blink + ')';
      ctx.fillRect(-7, -5, 14, 10);
      ctx.fillStyle = info.color;
      ctx.fillRect(-2.5, -8, 5, 16);
      ctx.strokeStyle = 'rgba(255,255,255,' + blink + ')';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-7, -5, 14, 10);
    } else {
      const w = WEAPONS[d.wid];
      ctx.rotate(-Math.PI / 2);
      const len = w.kind === 'sniper' ? 30 : (w.kind === 'rifle' ? 26 : 22);
      ctx.fillStyle = 'rgba(24,26,32,' + blink + ')';
      ctx.fillRect(-len / 2, -3.5, len, 7);
      ctx.fillStyle = info.color;
      ctx.fillRect(-len / 2, -1.2, len, 2.4);
      ctx.fillStyle = 'rgba(255,255,255,' + blink + ')';
      ctx.fillRect(-len / 2, -4, 4, 8);
    }
    ctx.restore();
    ctx.fillStyle = near ? 'rgba(255,240,180,' + blink + ')' : 'rgba(255,220,150,' + blink * 0.8 + ')';
    ctx.font = near ? "bold 11px 'Segoe UI','Microsoft YaHei',sans-serif" : "9px 'Segoe UI','Microsoft YaHei',sans-serif";
    ctx.fillText(info.label, d.x, d.y - 16);
    if (near) {
      ctx.fillStyle = 'rgba(140,255,170,0.9)';
      ctx.font = "10px 'Segoe UI','Microsoft YaHei',sans-serif";
      ctx.fillText('拾取', d.x, d.y + 20);
    }
  }
  ctx.restore();
}

export function dropRenderInfo(d) {
  if (!d) return null;
  if (d.kind === 'kit') return { label: '拆弹钳', kind: 'kit', color: '#ffd34d' };
  const w = d.wid && WEAPONS[d.wid];
  if (!w) return null;
  return { label: w.name, kind: w.kind, color: DROP_COL[w.kind] || '#ccc' };
}

function drawLaser(game) {
  const p = game.player;
  if (!p || p.dead || !p.laserEnd) return;
  const end = p.laserEnd;
  const sx = p.x + Math.cos(p.angle) * 20;
  const sy = p.y + Math.sin(p.angle) * 20;
  const dx = end.x - sx, dy = end.y - sy;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;
  const strong = p.scoped ? 0.9 : 0.38;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,70,70,' + (strong * 0.14) + ')';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,70,70,' + strong + ')';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,120,120,0.95)';
  ctx.beginPath();
  ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGrenades(game) {
  for (const g of game.grenades) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.fillStyle = g.kind === 'he' ? '#2f6b2f' : (g.kind === 'flash' ? '#c9c9c9' : '#5a5f66');
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillRect(-1.5, -3, 3, 6);
    ctx.restore();
  }
}

// 手雷轨迹预览：仅玩家自己手持投掷物且存活时，从出手点到预计落点绘制虚线弧（辅助瞄准线）。
// 纯预览装饰，不影响实际投掷判定；初速/出手偏移与 throwGrenade 完全一致。
function drawNadePreview(game) {
  const p = game.player;
  if (!p || p.dead) return;
  if (game.state !== 'BUY' && game.state !== 'LIVE') return;
  if (!p.slot || p.slot.indexOf('nade:') !== 0) return;
  const kind = p.slot.slice(5);
  const speed = NADE_SPEED[kind];
  if (!speed || !p.weapons || (p.weapons.nades[kind] || 0) <= 0) return;
  const x0 = p.x + Math.cos(p.angle) * NADE_ORIGIN_DIST;
  const y0 = p.y + Math.sin(p.angle) * NADE_ORIGIN_DIST;
  const pts = nadeTrajectory(x0, y0, p.angle, speed, 40);
  drawNadeTrajectory(ctx, pts);
}

// 脚步动画渲染态：计算实体累积移动距离与脚步特效参数（渲染私有，确定性）。
// 实体移动时累积位移（推动 stepCycle/stepDust 的 phase 与尘埃生成），站立/死亡时归零。
// seed 取实体首次出现时位置哈希，之后固定，保证同一实体脚步特效稳定可复现。
function getStepFX(e, tSec) {
  let st = stepFXState.get(e);
  if (!st) {
    st = { acc: 0, px: e.x, py: e.y, seed: ((Math.floor(e.x) * 73856093 ^ Math.floor(e.y) * 19349663) >>> 0) || 1 };
    stepFXState.set(e, st);
  }
  if (e.dead) { st.acc = 0; st.px = e.x; st.py = e.y; return null; }
  const moving = Math.hypot(e.vx || 0, e.vy || 0) > 18;
  if (moving) st.acc += Math.hypot(e.x - st.px, e.y - st.py);
  else st.acc = 0;
  st.px = e.x; st.py = e.y;
  const cyc = stepCycle(st.acc, tSec, st.seed);
  const dust = moving ? stepDust(st.acc, tSec, st.seed, DUST_PER_STEP) : [];
  return { phase: cyc.phase, swinging: cyc.swinging, dust };
}

function drawEntities(game) {
  const tSec = performance.now() / 1000;
  const z = game.zoom || 1;
  const vw = (game.canvasW || 0) / z;
  const vh = (game.canvasH || 0) / z;
  const margin = 96;
  const vx0 = (game.camX || 0) - (game._shx || 0) - vw / 2 - margin;
  const vy0 = (game.camY || 0) - (game._shy || 0) - vh / 2 - margin;
  const vx1 = (game.camX || 0) - (game._shx || 0) + vw / 2 + margin;
  const vy1 = (game.camY || 0) - (game._shy || 0) + vh / 2 + margin;
  let fpMs = 0;
  let calcMs = 0;
  let stepMs = 0;
  let bodyMs = 0;
  let otherMs = 0;
  const stepCounts = { entities: 0, feet: 0, dust: 0 };
  for (const e of game.entities) {
    const ex = viewX(e), ey = viewY(e), ea = viewAngle(e);
    if (ex < vx0 || ex > vx1 || ey < vy0 || ey > vy1) continue;
    const calcT = performance.now();
    const stFx = getStepFX(e, tSec);
    calcMs += performance.now() - calcT;
    if (e.dead) continue;
    const fpT = performance.now();
    drawEntityFootprints(game, e);
    fpMs += performance.now() - fpT;
    const stepT = performance.now();
    if (stFx) {
      stepCounts.entities++;
      if (stFx.swinging > 0) stepCounts.feet += 2;
      stepCounts.dust += stFx.dust ? stFx.dust.length : 0;
      drawStepFx(ctx, e, stFx);
    }
    stepMs += performance.now() - stepT;
    const isP = e === game.player;
    const darkCol = e.team === 'ct' ? '#4d9bff' : '#ffa03d';
    const bodyT = performance.now();
    ctx.save();
    ctx.translate(ex, ey);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = e.team === 'ct' ? 'rgba(77,155,255,0.35)' : 'rgba(255,160,61,0.35)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 16, 0, 0, Math.PI * 2);
    ctx.stroke();
    const bob = isP && e.walking ? Math.sin(performance.now() / 160) * 2.5 : 0;
    ctx.translate(0, bob);
    ctx.rotate(ea);
    ctx.fillStyle = darkCol;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2c3038';
    ctx.beginPath();
    ctx.arc(0, -4, 9, 0, Math.PI * 2);
    ctx.fill();
    const w = weaponDef(e);
    if (w && w.kind === 'knife') {
      ctx.strokeStyle = '#cfd4da';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(4, -6);
      ctx.lineTo(20, -8);
      ctx.stroke();
    } else if (w) {
      // 后坐偏移：开火时枪身沿后向退，与准星扩散视觉一致
      const recoilOff = (e.recoil || 0) * 4;
      const gl = gunLen(w);
      const pop = weaponSwitchPop(e.switchT || 0);
      drawWeaponPop(ctx, { scale: pop.scale, gl, recoilOff, kind: w.kind, muzzleT: e.muzzleT });
      // 开火枪口烟：由 lastShot 距游戏时间推得烟龄，确定性（无 Math.random）
      const elapsed = (game.time || 0) - (e.lastShot || 0) / 1000;
      const smokePts = muzzleSmoke(elapsed >= 0 && elapsed < MUZZLE_SMOKE_LIFE, elapsed, (Math.floor(ex) * 374761393 ^ Math.floor(ey) * 668265263) >>> 0);
      if (smokePts.length) {
        const mz = 2 + (gl - recoilOff - 2) * pop.scale;
        drawMuzzleSmoke(ctx, mz, 0, 0, smokePts);
      }
    }
    ctx.restore();
    ctx.save();
    ctx.translate(ex, ey + bob - 4);
    ctx.fillStyle = isP ? '#ffcf9e' : '#e8b98c';
    ctx.beginPath();
    ctx.arc(0, 0, isP ? 5.5 : 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isP ? '#1c2b3a' : (e.team === 'ct' ? '#1d3557' : '#3a2413');
    ctx.fillRect(-4, -6, 8, 4);
    ctx.restore();
    bodyMs += performance.now() - bodyT;
    const otherT = performance.now();
    if (e.bot) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.font = "10px 'Segoe UI','Microsoft YaHei',sans-serif";
      ctx.textAlign = 'center';
      ctx.fillStyle = e.team === 'ct' ? '#7fb8ff' : '#ffcf8a';
      const arch = ARCHETYPES[e.archetype];
      ctx.fillText(e.name + (arch ? ' ·' + arch.label : ''), ex, ey - 22);
      ctx.restore();
    }
    if (e.defuseT > 0) {
      const pct = clamp(e.defuseT / (e.weapons.kit ? 2.5 : 5), 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(ex - 16, ey - 32, 32, 5);
      ctx.fillStyle = '#4dc3ff';
      ctx.fillRect(ex - 16, ey - 32, 32 * pct, 5);
    }
    if (e.plantT > 0) {
      const pct2 = clamp(e.plantT / 3, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(ex - 16, ey - 32, 32, 5);
      ctx.fillStyle = '#ff8a2a';
      ctx.fillRect(ex - 16, ey - 32, 32 * pct2, 5);
    }
    if (e.hasBomb && e.team === 't') {
      const blink = Math.sin(performance.now() / 200) > 0;
      ctx.fillStyle = blink ? '#ff3b30' : '#8a1a12';
      ctx.beginPath();
      ctx.arc(ex + 14, ey - 12, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    otherMs += performance.now() - otherT;
  }
  game._renderStageMs.footprints = fpMs;
  game._renderStageMs.stepCalc = calcMs;
  game._renderStageMs.stepFx = stepMs;
  game._renderStageMs.stepCounts = stepCounts;
  game._renderStageMs.entityBodies = bodyMs;
  game._renderStageMs.entityOther = otherMs;
}

function drawSmokes(game) {
  for (const s of game.smokes) {
    // 淡入（半径增长期）+ 淡出（生命末期 2s），其余时段完全遮挡
    const fade = clamp(s.life / 2, 0, 1) * clamp((s.r - 20) / 40, 0.3, 1);
    // 外圈柔边
    const g = ctx.createRadialGradient(s.x, s.y, s.r * 0.3, s.x, s.y, s.r);
    g.addColorStop(0, 'rgba(206,208,211,' + (0.96 * fade) + ')');
    g.addColorStop(0.75, 'rgba(190,193,197,' + (0.94 * fade) + ')');
    g.addColorStop(0.95, 'rgba(150,155,161,' + (0.55 * fade) + ')');
    g.addColorStop(1, 'rgba(120,124,130,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
    // 实心核（完全遮挡，与 LOS/子弹截断判定一致）
    ctx.fillStyle = 'rgba(198,200,204,' + (0.97 * fade) + ')';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 0.72, 0, Math.PI * 2);
    ctx.fill();
    // 边缘噪点（增强体积感）；用位置+索引确定性伪随机，保证同 seed 画面可复现
    ctx.fillStyle = 'rgba(212,214,217,' + (0.5 * fade) + ')';
    const sHash = (n) => {
      let h = (Math.floor(s.x) * 73856093 ^ Math.floor(s.y) * 19349663 ^ n * 83492791) >>> 0;
      h = (h ^ (h >>> 15)) * 2246822519 >>> 0;
      return (h >>> 0) / 4294967296;
    };
    for (let i = 0; i < 6; i++) {
      const na = sHash(i) * Math.PI * 2;
      const nr = s.r * (0.55 + sHash(i + 6) * 0.35);
      ctx.beginPath();
      ctx.arc(s.x + Math.cos(na) * nr, s.y + Math.sin(na) * nr, 6 + sHash(i + 12) * 8, 0, Math.PI * 2);
      ctx.fill();
    }
    // 生命末段（life<2s）：边缘飘散尾迹，取代整团突然淡出——小烟团从柔边剥落、向外漂移消散。
    // 位置/尺寸/透明度由位置+seed 确定性哈希导出（见 smoke-fx.js），同 seed 同 t 画面可复现。
    if (s.life < SMOKE_DISSOLVE_LIFE) {
      const sSeed = (Math.floor(s.x) * 374761393 ^ Math.floor(s.y) * 668265263) >>> 0;
      const t = clamp((SMOKE_DISSOLVE_LIFE - s.life) / SMOKE_DISSOLVE_LIFE, 0, 1);
      const n = clamp(Math.round(s.r / 25), 4, 12);
      const trail = smokeDissolveTrail(s, t, sSeed, n);
      if (trail.length) {
        const trailPts = trail.map((p) => ({ x: p.x, y: p.y, r: p.r, alpha: p.alpha * fade }));
        drawSmokeTrail(ctx, trailPts);
      }
    }
  }
}

function drawParticles(game) {
  const styles = {
    blood: 'rgba(150,20,15,',
    spark: 'rgba(255,200,110,',
    smokep: 'rgba(190,193,198,',
    splash: 'rgba(120,190,235,',
    wood: 'rgba(150,110,60,',
    dust: 'rgba(172,158,126,'
  };
  for (const kind of Object.keys(styles)) {
    ctx.fillStyle = styles[kind];
    for (const p of game.particles) {
      if (p.kind !== kind) continue;
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  for (const p of game.particles) {
    const a = clamp(p.life, 0, 1);
    if (p.kind === 'shell') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin || 0);
      ctx.fillStyle = 'rgba(200,150,60,' + a + ')';
      ctx.fillRect(-2, -1, 4, 2);
      ctx.restore();
    } else if (p.kind === 'swing') {
      ctx.strokeStyle = 'rgba(255,255,255,' + (a * 0.5) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
      ctx.stroke();
    } else if (p.kind === 'fire') {
      ctx.fillStyle = p.life > 0.4 ? '#ff8a2a' : '#ffd75e';
      ctx.globalAlpha = clamp(1 - p.life * 0.3, 0.15, 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - p.life * 0.3), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (p.kind === 'boom') {
      drawEnhancedBoom(ctx, enhancedBoomSpec(p));
    }
  }
}
function drawFog(game) {
  const map = getMap();
  const cv = renderFogLayer(game);
  if (!cv || !map || !map.W || !map.H) return;
  const z = game.zoom || 1;
  const w2 = (game.canvasW || 0) / z;
  const h2 = (game.canvasH || 0) / z;
  const camX = game.camX || 0;
  const camY = game.camY || 0;
  const shx = game._shx || 0;
  const shy = game._shy || 0;
  const margin = 64;
  const sx0 = Math.max(0, camX - shx - w2 / 2 - margin);
  const sy0 = Math.max(0, camY - shy - h2 / 2 - margin);
  const sx1 = Math.min(map.W, camX - shx + w2 / 2 + margin);
  const sy1 = Math.min(map.H, camY - shy + h2 / 2 + margin);
  const sw = Math.max(0, sx1 - sx0);
  const sh = Math.max(0, sy1 - sy0);
  if (sw <= 0 || sh <= 0) return;
  const fx = cv.width / map.W;
  const fy = cv.height / map.H;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(cv, sx0 * fx, sy0 * fy, sw * fx, sh * fy, sx0, sy0, sw, sh);
  ctx.restore();
}

// 弹道拖尾生命周期：可见时长从旧的 0.09s 延长，配合 len 拉伸形成更清晰的弹道拖尾
export const TRACER_LIFE = 0.16;

// 口径分档样式：大威力（步枪/狙击）更长更亮更粗，手枪/冲锋枪较短（颜色为 RGB 三元组）
const TRACER_STYLE = {
  sniper:  { alpha: 1.0, width: 3.4, len: 2.5, color: '255,240,205' },
  rifle:   { alpha: 0.95, width: 2.8, len: 2.1, color: '255,224,170' },
  shotgun: { alpha: 0.8, width: 2.2, len: 1.5, color: '255,206,130' },
  smg:     { alpha: 0.62, width: 1.6, len: 1.15, color: '255,186,118' },
  pistol:  { alpha: 0.5, width: 1.2, len: 1.0, color: '255,166,96' },
  default: { alpha: 0.6, width: 1.6, len: 1.2, color: '255,186,118' }
};

// 弹道拖尾纯计算：t∈[0,1] 为剩余寿命进度（1 刚发射 → 0 消失），weaponKind 决定口径档位
// 返回 {alpha, width, len, color}，确定性、无 Math.random
export function tracerStyle(t, weaponKind) {
  const s = TRACER_STYLE[weaponKind] || TRACER_STYLE.default;
  const fade = clamp(1 - t, 0, 1);
  return {
    alpha: s.alpha * fade,
    width: s.width,
    len: s.len,
    color: s.color
  };
}

function drawTracers(game) {
  const tracers = game.tracers;
  if (!tracers.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (const t of tracers) {
    const s = tracerStyle(clamp(t.life / TRACER_LIFE, 0, 1), t.kind);
    if (s.alpha <= 0.004) continue;
    // 拖尾沿弹道方向延长 len 倍，从发射点延伸到末端
    const dx = t.x2 - t.x1, dy = t.y2 - t.y1;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist, uy = dy / dist;
    const ex = t.x1 + ux * dist * s.len, ey = t.y1 + uy * dist * s.len;
    // 渐变：发射点最亮 → 末端淡出；CT 冷蓝、T 方武器口径暖色
    const rgb = t.team === 'ct' ? '135,190,255' : s.color;
    const g = ctx.createLinearGradient(t.x1, t.y1, ex, ey);
    g.addColorStop(0, 'rgba(' + rgb + ',' + s.alpha + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = s.width;
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y1);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
  ctx.restore();
}
