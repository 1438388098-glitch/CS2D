import { DEATH_MARKER_LIFE, TRACER_LIFE } from './render-utils.js';
export { DEATH_MARKER_LIFE, TRACER_LIFE };
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
import {drawRipple, rippleRing, RIPPLE_LIFE, addRipple} from './water-fx.js';
import {smokeDissolveTrail, drawSmokeTrail, SMOKE_DISSOLVE_LIFE} from './smoke-fx.js';
import {stepCycle, stepDust, drawStepFx, DUST_PER_STEP} from './anim-fx.js';
import {impactMarksAt, drawImpact} from './impact-fx.js';
import {weatherKind, weatherParticles, drawWeather, weatherRecycle, MAX_PARTICLES as WEATHER_MAX_PARTICLES} from './weather-fx.js';
import { activeEmote } from './emote.js';
import {themeWeatherOf} from './textures.js';
import {emberSpec, goldStreakSpec} from './burst-fx.js';
import {enhancedBoomSpec, drawEnhancedBoom} from './boom-fx.js';
import {visibleShadows, drawShadows} from './shadow-fx.js';
import {killLabel, drawKillLabel, KILL_LABEL_DUR} from './killcam-fx.js';
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

// 震动缩放（纯函数，供测试断言）：reduceMotion 归零，自定义强度夹取 [0,1.5]，缺省 1
export function shakeScaleFor(opts) {
  if (opts && opts.reduceMotion) return 0;
  const raw = opts ? opts.shakeScale : undefined;
  const s = Number(raw);
  return Number.isFinite(s) ? Math.min(1.5, Math.max(0, s)) : 1;
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
  const shakeMul = shakeScaleFor(game.opts);
  let shx = 0, shy = 0;
  if (game.shake > 0 && shakeMul > 0) {
    shx = rand(-game.shake, game.shake) * shakeMul;
    shy = rand(-game.shake, game.shake) * shakeMul;
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
  drawSprayTrace(game);
  drawEmpPulse(game);
  drawBlackout(game);
  drawReplayGhosts(game);
  drawWarmupTargets(game);
  drawDoors(game);
  drawHostageMarkers(game);
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

// 雨天水面涟漪：rain 图每隔 ~0.16s 在视口附近随机水面瓦片生成一圈涟漪（渲染层纯装饰，
// 复用 water-fx 的 addRipple 通路与容量上限；随机走 utils.rand，仅表现层）
function spawnRainRipples(game) {
  const now = performance.now() / 1000;
  if (now - _rainRippleAt < 0.16) return;
  _rainRippleAt = now;
  if (!_waterTiles || !_waterTiles.length) return;
  const T = mapTile();
  const z = game.zoom || 1;
  const vw = (game.canvasW || 0) / z;
  const vh = (game.canvasH || 0) / z;
  const x0 = (game.camX || 0) - vw / 2 - 40;
  const y0 = (game.camY || 0) - vh / 2 - 40;
  const x1 = (game.camX || 0) + vw / 2 + 40;
  const y1 = (game.camY || 0) + vh / 2 + 40;
  // 随机取一瓦片，最多重试 4 次落进视口附近
  for (let tries = 0; tries < 4; tries++) {
    const [gx, gy] = _waterTiles[Math.floor(rand(0, _waterTiles.length))];
    const wx = gx * T + T / 2;
    const wy = gy * T + T / 2;
    if (wx < x0 || wx > x1 || wy < y0 || wy > y1) continue;
    addRipple(game, wx + rand(-T / 3, T / 3), wy + rand(-T / 3, T / 3));
    return;
  }
}

// 天气层：官方图优先 THEMES.weather 数据（dust2 沙霾/canal 雾/blast 烟霭/arctic 雪/harbor 雨），
// 自定义图退回 id 关键词匹配（rain/snow）。粒子密度随主题 density 缩放。
function drawWeatherLayer(game) {
  const map = getMap();
  if (!map) return;
  const themeW = themeWeatherOf(map.id);
  // 回合事件可覆盖天气（「浓雾弥漫」强制 fog 且加密粒子），事件结束恢复主题天气
  const evW = game.roundEvent && game.roundEvent.weather;
  const kind = evW || (themeW ? themeW.kind : weatherKind(map.id));
  if (!kind) return;
  if (kind === 'rain') spawnRainRipples(game);
  const z = game.zoom || 1;
  const vw = game.canvasW / z;
  const vh = game.canvasH / z;
  if (!(vw > 0) || !(vh > 0)) return;
  const count = Math.round(WEATHER_MAX_PARTICLES * (evW ? (game.roundEvent.density || 0.8) : (themeW ? themeW.density : 0.55)));
  const parts = weatherParticles(kind, game.time, count, vw, vh, weatherSeed(String(map.id)));
  if (!parts.length) return;
  const ox = (game.camX || 0) - vw / 2;
  const oy = (game.camY || 0) - vh / 2;
  ctx.save();
  ctx.translate(ox, oy);
  drawWeather(ctx, parts, kind);
  ctx.restore();
  weatherRecycle(parts); // 粒子对象归还池，消除每帧稳态分配
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

// 伤害数字分级样式（纯函数，供测试断言）：字号按伤害分 4 档，
// 爆头数字在出现后 0.12s 内弹到 1.55 倍再 0.25s 回落，强化"打中头"的瞬间感
export function dmgPopStyle(pop) {
  const age = 0.8 - clamp(pop.t, 0, 0.8);
  const tier = pop.dmg >= 90 ? 3 : pop.dmg >= 50 ? 2 : pop.dmg >= 22 ? 1 : 0;
  let size = 11 + tier * 2.5;
  if (pop.head) {
    const grow = clamp(age / 0.12, 0, 1);
    const settle = clamp(1 - Math.max(0, age - 0.12) / 0.25, 0, 1);
    size *= 1 + 0.55 * grow * settle;
  }
  return { size, alpha: clamp(pop.t / 0.3, 0, 1) };
}

function drawDmgPops2D(game) {
  const pops = game.dmgPops;
  if (!pops || !pops.length) return;
  const t = ctx;
  t.textAlign = 'center';
  t.lineJoin = 'round';
  t.lineWidth = 3;
  const n = Math.min(pops.length, 12);
  let lastFont = '';
  for (let i = 0; i < n; i++) {
    const pop = pops[i];
    if (!pop || pop.t === undefined || pop.t > 0.8) continue;
    const st = dmgPopStyle(pop);
    let sy = pop.y - (1 - pop.t / 0.8) * 30;
    t.globalAlpha = st.alpha;
    const font = st.size.toFixed(1) + 'px Arial';
    if (font !== lastFont) { t.font = font; lastFont = font; }
    t.strokeStyle = '#000';
    t.fillStyle = pop.head ? '#ffd34d' : (pop.armor ? '#9ecbff' : '#ffffff');
    const txt = String(Math.round(pop.dmg));
    t.strokeText(txt, pop.x, sy);
    t.fillText(txt, pop.x, sy);
  }
  t.globalAlpha = 1;
  t.textAlign = 'start';
}

// 动态水面：可见浅水(~)瓦片叠加移动亮线、深水(≈)瓦片叠加缓慢漂移焦散暗斑（时间相位差），裁剪到相机视口
let _waterGrid = null;
let _waterShallow = false;
let _waterDeep = false;
let _waterTiles = null; // 水瓦片中心坐标缓存 [['x,y' 世界坐标]，雨天涟漪取材用]
let _rainRippleAt = 0;
// 深水焦散规格（纯函数，供测试断言）：暗斑在瓦片内慢速游移，透明度缓慢呼吸
export function deepCausticSpec(seed, now) {
  const ph = seed * 1.7;
  return {
    dx: Math.sin(now * 0.5 + ph) * 6,
    dy: Math.cos(now * 0.4 + ph * 1.3) * 4,
    a: 0.14 + 0.08 * Math.sin(now * 0.8 + ph)
  };
}
function drawWaterOverlay(game) {
  if (game.state !== 'BUY' && game.state !== 'LIVE') return;
  const grid = getGrid();
  if (!grid || !grid.length) return;
  // 无水地图直接跳出：网格对象身份变化（切图/编辑器重载）时才整网重扫一次
  if (_waterGrid !== grid) {
    _waterGrid = grid;
    _waterShallow = false;
    _waterDeep = false;
    _waterTiles = [];
    outer: for (let gy = 0; gy < grid.length; gy++) {
      const row = grid[gy];
      for (let gx = 0; gx < row.length; gx++) {
        const c = row[gx];
        if (c === '~') { _waterShallow = true; _waterTiles.push([gx, gy]); }
        else if (c === '≈') { _waterDeep = true; _waterTiles.push([gx, gy]); }
        if (_waterShallow && _waterDeep && _waterTiles.length > 4000) break outer;
      }
    }
  }
  if (!_waterShallow && !_waterDeep) return;
  const T = mapTile();
  const now = performance.now() / 1000;
  const x0 = Math.max(0, Math.floor((game.camX - game.canvasW / game.zoom / 2) / T) - 1);
  const y0 = Math.max(0, Math.floor((game.camY - game.canvasH / game.zoom / 2) / T) - 1);
  const x1 = Math.min(grid[0].length, Math.ceil((game.camX + game.canvasW / game.zoom / 2) / T) + 1);
  const y1 = Math.min(grid.length, Math.ceil((game.camY + game.canvasH / game.zoom / 2) / T) + 1);
  ctx.save();
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const c = grid[y][x];
      if (c !== '~' && c !== '≈') continue;
      const px = x * T, py = y * T;
      const seed = (x * 7 + y * 13) % 17;
      if (c === '~') {
        const off = (now * 14 + seed * 5) % 30;
        ctx.fillStyle = 'rgba(220,240,255,0.20)';
        ctx.fillRect(px + off - 10, py + 8 + (seed % 5) * 5, 8, 1.5);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(px + ((off + 16) % 30) - 12, py + 4 + ((seed + 3) % 6) * 4, 6, 1);
      } else {
        // 深水焦散：暗斑游移 + 一条微光波纹，让深浅水有质感差
        const ca = deepCausticSpec(seed, now);
        ctx.fillStyle = 'rgba(10,26,46,' + ca.a.toFixed(3) + ')';
        ctx.beginPath();
        ctx.ellipse(px + T / 2 + ca.dx, py + T / 2 + ca.dy, T * 0.34, T * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(150,210,250,' + (ca.a * 0.45).toFixed(3) + ')';
        ctx.fillRect(px + ((seed * 7 + now * 6) % T), py + T * 0.7, T * 0.28, 1.2);
      }
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
  drawSiteMark(map.sites.A, '255,150,90', siteMarkSpec(map.sites.A.x0, map.sites.A.y0, map.sites.A.x1, map.sites.A.y1, pulse));
  drawSiteMark(map.sites.B, '90,160,255', siteMarkSpec(map.sites.B.x0, map.sites.B.y0, map.sites.B.x1, map.sites.B.y1, pulse));
}

// 包点标记样式（纯函数，供测试断言）：角标长度按短边 22% 取、上限 18px；
// 三个透明度随 pulse（0..1）单调增强 —— 内部淡填充 / 细边框 / 角标
export function siteMarkSpec(x0, y0, x1, y1, pulse) {
  const w = x1 - x0, h = y1 - y0;
  const p = clamp(Number(pulse) || 0, 0, 1);
  return {
    L: Math.min(18, Math.min(Math.abs(w), Math.abs(h)) * 0.22),
    fillAlpha: 0.03 + 0.04 * p,
    lineAlpha: 0.3 + 0.3 * p,
    bracketAlpha: 0.55 + 0.35 * p
  };
}

// 包点绘制：内部淡填充 + 细边框 + 四角战术括号（替代裸 strokeRect）
function drawSiteMark(site, rgb, spec) {
  const w = site.x1 - site.x0, h = site.y1 - site.y0;
  ctx.save();
  ctx.fillStyle = 'rgba(' + rgb + ',' + spec.fillAlpha + ')';
  ctx.fillRect(site.x0, site.y0, w, h);
  ctx.strokeStyle = 'rgba(' + rgb + ',' + spec.lineAlpha + ')';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(site.x0, site.y0, w, h);
  const L = spec.L;
  ctx.strokeStyle = 'rgba(' + rgb + ',' + spec.bracketAlpha + ')';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(site.x0, site.y0 + L); ctx.lineTo(site.x0, site.y0); ctx.lineTo(site.x0 + L, site.y0);
  ctx.moveTo(site.x1 - L, site.y0); ctx.lineTo(site.x1, site.y0); ctx.lineTo(site.x1, site.y0 + L);
  ctx.moveTo(site.x1, site.y1 - L); ctx.lineTo(site.x1, site.y1); ctx.lineTo(site.x1 - L, site.y1);
  ctx.moveTo(site.x0 + L, site.y1); ctx.lineTo(site.x0, site.y1); ctx.lineTo(site.x0, site.y1 - L);
  ctx.stroke();
  ctx.restore();
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
    // spec 只依赖 (x,y,hp)：缓存到木箱对象，hp 变化（受击）时才重建
    if (!c._spec || c._specHp !== c.hp) {
      c._spec = crateRenderSpec(c.x, c.y, c.hp);
      c._specHp = c.hp;
    }
    const s = c._spec;
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

// C4 蜂鸣同步警报环（纯函数，供测试断言）：每次蜂鸣发出一圈扩散红环，
// 扩散时长取 min(0.5s, 蜂鸣间隔)——高频急促期环也更急促
export function bombAlarmSpec(tsSinceBeep, interval) {
  const dur = Math.max(0.05, Math.min(0.5, interval || 0.5));
  const t = clamp(tsSinceBeep / dur, 0, 1);
  return { t, r: 12 + t * 34, alpha: (1 - t) * 0.55 };
}

function drawBomb(game) {
  if (!game.bomb) return;
  const b = game.bomb;
  if (!b.dropped && !b.planted) return;
  const blink = Math.sin(performance.now() / 180) > 0;
  ctx.save();
  if (b.planted) {
    const pulse = 0.4 + 0.3 * Math.sin(performance.now() / 300);
    ctx.fillStyle = 'rgba(255,60,40,' + pulse * 0.18 + ')';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 34, 0, Math.PI * 2);
    ctx.fill();
    // 蜂鸣同步警报环：节拍与 updateCamera 的 sfx beep 完全一致（间隔随倒计时升频）
    const bt = b.timer || 0;
    const bInt = bt < 5 ? 0.25 : bt < 10 ? 0.5 : 1;
    const ts = clamp(bInt - (game._bombBeepT || 0), 0, bInt);
    const al = bombAlarmSpec(ts, bInt);
    if (al.alpha > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,70,45,' + (al.alpha * 0.35) + ')';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(b.x, b.y, al.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,120,80,' + al.alpha + ')';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
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
    // info 只依赖 (wid/kind)，drop 生命周期内不变：缓存到 drop 对象免每帧重建
    if (!d._info) d._info = dropRenderInfo(d);
    const info = d._info;
    if (!info) continue;
    const blink = 0.65 + 0.35 * Math.sin(performance.now() / 280);
    const near = game.player && !game.player.dead && Math.hypot(game.player.x - d.x, game.player.y - d.y) < 48;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // 价值分档描边（candidate-576）：高档武器地面一眼可辨
    if (info.tier >= 1) {
      ctx.strokeStyle = info.edge;
      ctx.lineWidth = info.tier >= 3 ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 14 + info.tier, 0, Math.PI * 2);
      ctx.stroke();
    }
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
    // font 状态切换昂贵：仅在 near 翻转时重设
    const wantFont = near ? "bold 11px 'Segoe UI','Microsoft YaHei',sans-serif" : "9px 'Segoe UI','Microsoft YaHei',sans-serif";
    if (ctx.font !== wantFont) ctx.font = wantFont;
    ctx.fillText(info.label, d.x, d.y - 16);
    if (near) {
      ctx.fillStyle = 'rgba(140,255,170,0.9)';
      ctx.font = "10px 'Segoe UI','Microsoft YaHei',sans-serif";
      ctx.fillText('拾取', d.x, d.y + 20);
    }
  }
  ctx.restore();
}

// 价值分档（candidate-576）：价格越高描边越醒目，地面 AWP 与 Glock 视觉权重不再相同
export function priceTier(price) {
  if (!Number.isFinite(price)) return 0;
  if (price >= 4600) return 3;
  if (price >= 2900) return 2;
  if (price >= 1200) return 1;
  return 0;
}
const TIER_EDGE = ['rgba(255,255,255,0)', 'rgba(126,217,87,.75)', 'rgba(90,160,255,.8)', 'rgba(255,205,80,.9)'];

export function dropRenderInfo(d) {
  if (!d) return null;
  if (d.kind === 'kit') return { label: '拆弹钳', kind: 'kit', color: '#ffd34d', tier: 2, edge: TIER_EDGE[2] };
  const w = d.wid && WEAPONS[d.wid];
  if (!w) return null;
  const tier = priceTier(w.price);
  return { label: w.name, kind: w.kind, color: DROP_COL[w.kind] || '#ccc', tier, edge: TIER_EDGE[tier] };
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

// 手雷外观规格（纯函数，供测试断言）：三种投掷物各有体色/中带/高光强度/LED 色调
export function grenadeRenderSpec(kind) {
  const table = {
    he: { body: '#3f6b35', band: '#264a20', hi: 'rgba(255,255,255,0.30)', led: '255,90,70' },
    flash: { body: '#c9c9c9', band: '#787c82', hi: 'rgba(255,255,255,0.55)', led: '255,220,120' },
    smoke: { body: '#5a5f66', band: '#383c42', hi: 'rgba(255,255,255,0.25)', led: '140,220,160' }
  };
  return table[kind] || table.smoke;
}

function drawGrenades(game) {
  const blink = Math.sin(performance.now() / 120) > 0;
  for (const g of game.grenades) {
    const spec = grenadeRenderSpec(g.kind);
    const ang = Math.atan2(g.vy || 0, g.vx || 1);
    // 地面投影
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(g.x + 2, g.y + 4, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(g.x, g.y);
    // 弹体沿飞行方向取向：中带/引信/LED 随轨迹滚动
    ctx.rotate(ang);
    ctx.fillStyle = spec.body;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = spec.band;
    ctx.fillRect(-6, -1.5, 12, 3);
    ctx.fillStyle = spec.hi;
    ctx.beginPath();
    ctx.arc(-2, -2, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(3.5, -1.5, 3, 3);
    if (blink) {
      ctx.fillStyle = 'rgba(' + spec.led + ',0.95)';
      ctx.beginPath();
      ctx.arc(6.5, 0, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
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
  return { phase: cyc.phase, swinging: cyc.swinging, dust, moving };
}

// bot 头顶名离屏缓存：文本栅格化贵，按 (名字|职业|队色) 生成一次小画布，之后 drawImage 贴图
const _nameTagCache = new Map();
function nameTagCanvas(text, color) {
  const key = text + '|' + color;
  let c = _nameTagCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = 160;
  c.height = 18;
  const nc = c.getContext('2d');
  nc.font = "10px 'Segoe UI','Microsoft YaHei',sans-serif";
  nc.textAlign = 'center';
  nc.fillStyle = color;
  nc.fillText(text, 80, 12);
  if (_nameTagCache.size > 60) _nameTagCache.clear();
  _nameTagCache.set(key, c);
  return c;
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
  let calcMs = 0;
  let stepMs = 0;
  let bodyMs = 0;
  let otherMs = 0;
  // 内嵌剖析只在显式开启（window.__cs2dProf=true，诊断脚本用）时采集，生产路径每实体省 8 次 performance.now
  const prof = typeof window !== 'undefined' && !!window.__cs2dProf;
  const stepCounts = { entities: 0, feet: 0, dust: 0 };
  // 受击白闪查表：本帧存在命中标记时才建 Map（常帧零开销），目标死亡时标记已随 updateFxTimers 清除
  let flashByEntity = null;
  if (game.hitOutlines && game.hitOutlines.length) {
    flashByEntity = new Map();
    for (const ho of game.hitOutlines) flashByEntity.set(ho.target, ho);
  }
  for (const e of game.entities) {
    const ex = viewX(e), ey = viewY(e), ea = viewAngle(e);
    if (ex < vx0 || ex > vx1 || ey < vy0 || ey > vy1) continue;
    const calcT = prof ? performance.now() : 0;
    const stFx = getStepFX(e, tSec);
    if (prof) calcMs += performance.now() - calcT;
    if (e.dead) continue;
    const stepT = prof ? performance.now() : 0;
    if (stFx) {
      stepCounts.entities++;
      if (stFx.swinging > 0) stepCounts.feet += 2;
      stepCounts.dust += stFx.dust ? stFx.dust.length : 0;
      drawStepFx(ctx, e, stFx);
    }
    if (prof) stepMs += performance.now() - stepT;
    if (e.muzzleT > 0) {
      // 枪口瞬时光照：开火帧在枪口下方叠暖色泛光（lighter），暗色地面强化开火感知
      const ml = clamp(e.muzzleT / 0.06, 0, 1);
      const lx = ex + Math.cos(ea) * 10;
      const ly = ey + Math.sin(ea) * 10;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(lx, ly, 2, lx, ly, 34);
      g.addColorStop(0, 'rgba(255,190,110,' + (0.4 * ml).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lx, ly, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const isP = e === game.player;
    const darkCol = e.team === 'ct' ? '#4d9bff' : '#ffa03d';
    const bodyT = prof ? performance.now() : 0;
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
    // 行走起伏：玩家保持原有节奏（reduceMotion 时关闭）；bot 用 stepCycle 相位驱动（幅度略小）——人群不再滑行
    let bob = 0;
    const motionOff = game.opts && game.opts.reduceMotion;
    if (isP) bob = e.walking && !motionOff ? Math.sin(performance.now() / 160) * 2.5 : 0;
    else if (stFx && stFx.moving && !motionOff) bob = botBob(stFx.phase, tSec);
    ctx.translate(0, bob);
    ctx.rotate(ea);
    ctx.fillStyle = darkCol;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    // 受击白闪：刚被命中的实体躯干短暂提亮（复用 hitOutlines 剩余时间，头部标记更持久）
    const fl = flashByEntity && flashByEntity.get(e);
    const fa = fl ? bodyFlashAlpha(fl.t, fl.head) : 0;
    if (fa > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + fa + ')';
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 15, 0, 0, Math.PI * 2);
      ctx.fill();
    }
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
    if (prof) bodyMs += performance.now() - bodyT;
    const otherT = prof ? performance.now() : 0;
    if (e.bot) {
      const arch = ARCHETYPES[e.archetype];
      const tag = nameTagCanvas(e.name + (arch ? ' ·' + arch.label : ''), e.team === 'ct' ? '#7fb8ff' : '#ffcf8a');
      ctx.save();
      ctx.globalAlpha = 0.85;
      // 画布内文字基线在 y=12，贴图原点 ey-34 使基线落在 ey-22（与原 fillText 一致）
      ctx.drawImage(tag, ex - 80, ey - 34, 160, 18);
      ctx.restore();
      // 名牌血条：受伤的 bot 在名字上方显示 3px 血量细条（绿→黄→红分档）
      if (e.hp > 0 && e.hp < 100) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(ex - 17, ey - 39, 34, 4);
        ctx.fillStyle = hpBarColor(e.hp);
        ctx.fillRect(ex - 16, ey - 38, 32 * clamp(e.hp / 100, 0, 1), 2);
      }
      // 回合悬赏 $（金色，右）/ 宿敌 ☠（红色，左）：避开血条位置的头顶标记
      if (game.bounty === e) {
        ctx.fillStyle = '#ffd75e';
        ctx.font = 'bold 13px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('$', ex + 22, ey - 40);
        ctx.textAlign = 'left';
      }
      if (e.nemesis) {
        ctx.fillStyle = '#ff5b4d';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('☠', ex - 22, ey - 41);
        ctx.textAlign = 'left';
      }
    }
    // 表情气泡（candidate-592）：所有实体头顶 2s 渐隐（含玩家自己）
    {
      const em = activeEmote(e);
      if (em) {
        ctx.save();
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.globalAlpha = Math.min(1, Math.max(0, e.emoteT) / 0.6);
        ctx.fillText(em.face, ex, ey - 46);
        ctx.restore();
      }
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
    if (prof) otherMs += performance.now() - otherT;
  }
  game._renderStageMs.stepCalc = calcMs;
  game._renderStageMs.stepFx = stepMs;
  game._renderStageMs.stepCounts = stepCounts;
  game._renderStageMs.entityBodies = bodyMs;
  game._renderStageMs.entityOther = otherMs;
}

function drawSmokes(game) {
  ctx.save();
  for (const fr of game.fires || []) {
    const fl = clamp(fr.life / 7, 0, 1);
    const flick = 0.82 + 0.18 * Math.sin(game.time * 17 + fr.x);
    ctx.save();
    const fg = ctx.createRadialGradient(fr.x, fr.y, fr.r * 0.15, fr.x, fr.y, fr.r);
    fg.addColorStop(0, 'rgba(255,190,60,' + (0.5 * fl * flick).toFixed(3) + ')');
    fg.addColorStop(0.6, 'rgba(255,110,26,' + (0.34 * fl * flick).toFixed(3) + ')');
    fg.addColorStop(1, 'rgba(160,40,10,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(fr.x, fr.y, fr.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (const s of game.smokes) {
    // 淡入（半径增长期）+ 淡出（生命末期 2s），其余时段完全遮挡
    const fade = clamp(s.life / SMOKE_DISSOLVE_LIFE, 0, 1) * clamp((s.r - 20) / 40, 0.3, 1);
    ctx.globalAlpha = fade;
    // 外圈柔边：烟体几何 (x,y,r) 终生不变，径向渐变只建一次缓存在烟体上，透明度交给 globalAlpha
    if (!s._grad) {
      const g = ctx.createRadialGradient(s.x, s.y, s.r * 0.3, s.x, s.y, s.r);
      g.addColorStop(0, 'rgba(206,208,211,0.96)');
      g.addColorStop(0.75, 'rgba(190,193,197,0.94)');
      g.addColorStop(0.95, 'rgba(150,155,161,0.55)');
      g.addColorStop(1, 'rgba(120,124,130,0)');
      s._grad = g;
    }
    ctx.fillStyle = s._grad;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
    // 实心核（完全遮挡，与 LOS/子弹截断判定一致）
    ctx.fillStyle = 'rgba(198,200,204,0.97)';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 0.72, 0, Math.PI * 2);
    ctx.fill();
    // 边缘噪点（增强体积感）；用位置+索引确定性伪随机，保证同 seed 画面可复现。
    // 慢速公转 + 呼吸：噪点团绕烟心缓转、半径微脉动，静止烟也有体积流转感（时间驱动确定性）
    ctx.fillStyle = 'rgba(212,214,217,0.5)';
    const tNow = game.time || 0;
    const sHash = (n) => {
      let h = (Math.floor(s.x) * 73856093 ^ Math.floor(s.y) * 19349663 ^ n * 83492791) >>> 0;
      h = (h ^ (h >>> 15)) * 2246822519 >>> 0;
      return (h >>> 0) / 4294967296;
    };
    for (let i = 0; i < 6; i++) {
      const na = sHash(i) * Math.PI * 2 + tNow * 0.15 + i;
      const nr = s.r * (0.55 + sHash(i + 6) * 0.35) * (1 + 0.06 * Math.sin(tNow * 0.8 + i * 1.7));
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
      // globalAlpha 已含 fade，尾迹点直接绘制，免去每帧 map 重建中间数组
      if (trail.length) drawSmokeTrail(ctx, trail);
    }
  }
  ctx.restore();
}

// 基础圆点粒子的填充色（模块常量，免每帧重建 styles 对象；globalAlpha 负责淡出）
// 注意：色值必须是完整合法 fillStyle —— 带尾逗号的 'rgba(r,g,b,' 会被 canvas 静默忽略，
// 导致粒子沿用上一状态颜色（曾致血/烟/水花全部画成烟灰色）。
const PARTICLE_STYLES = {
  blood: 'rgb(150,20,15)',
  smokep: 'rgb(190,193,198)',
  splash: 'rgb(120,190,235)',
  dust: 'rgb(172,158,126)'
};

// 条纹粒子速度→长度规格（纯函数，供测试断言）：条纹沿速度反方向拖出，
// 长度随速度线性增长并夹在 [2,10]，速度近零时退化为默认方向的 2px 短点
export function particleStreakSpec(p) {
  const vx = p.vx || 0, vy = p.vy || 0;
  const speed = Math.hypot(vx, vy);
  const len = clamp(speed * 0.035, 2, 10);
  const inv = speed > 0.001 ? 1 / speed : 0;
  return { len, ux: speed > 0.001 ? vx * inv : 1, uy: speed > 0.001 ? vy * inv : 0 };
}

// 受击白闪强度（纯函数，供测试断言）：复用 hitOutlines 剩余时间，头部标记持续更久
export function bodyFlashAlpha(t, head) {
  return clamp(t / (head ? 0.45 : 0.3), 0, 1) * 0.45;
}

// bot 行走起伏（纯函数，供测试断言）：相位来自 stepCycle，幅度小于玩家的 2.5
export function botBob(phase, tSec) {
  return Math.sin(phase * Math.PI * 2 + tSec * 9) * 1.8;
}

// 名牌血条颜色分档（纯函数，供测试断言）：>60 健康 / 31~60 受伤 / ≤30 危殆
export function hpBarColor(hp) {
  if (hp > 60) return '#5ade7c';
  if (hp > 30) return '#ffc44d';
  return '#ff5a4d';
}

function drawParticles(game) {
  // 单遍分发：原来按 kind 分 6 遍遍历 + 特殊粒子第 7 遍，600 粒子上限时 ~4200 次/帧迭代降为 600
  for (const p of game.particles) {
    const base = PARTICLE_STYLES[p.kind];
    if (base) {
      const a = clamp(p.life, 0, 1);
      ctx.fillStyle = base;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      if (p.kind === 'blood') {
        // 深色内核：血滴更浓更有层次
        ctx.fillStyle = 'rgb(96,10,8)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      continue;
    }
    ctx.globalAlpha = 1;
    const a = clamp(p.life, 0, 1);
    if (p.kind === 'spark') {
      // 加色条纹火花：沿速度反方向拖出光条，双层描边（软橙晕 + 亮黄核），替换原平面圆点
      const st = particleStreakSpec(p);
      const tx = p.x - st.ux * st.len, ty = p.y - st.uy * st.len;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,170,60,' + (a * 0.4) + ')';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,228,160,' + a + ')';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    } else if (p.kind === 'wood') {
      // 木屑条纹：哑光短棕线（不加色，保持碎片质感）
      const st = particleStreakSpec(p);
      const wl = Math.min(st.len, 6);
      ctx.strokeStyle = 'rgba(150,110,60,' + a + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - st.ux * wl, p.y - st.uy * wl);
      ctx.stroke();
    } else if (p.kind === 'shell') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin || 0);
      ctx.fillStyle = 'rgba(200,150,60,' + a + ')';
      ctx.fillRect(-2, -1, 4, 2);
      ctx.fillStyle = 'rgba(255,232,170,' + (a * 0.8) + ')';
      ctx.fillRect(-2, -1, 4, 0.8);
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
    } else if (p.kind === 'gspark') {
      // 爆头金色条纹：与 spark 同构但金色更亮，加色渲染
      const st = goldStreakSpec(p);
      const tx = p.x - st.ux * st.len, ty = p.y - st.uy * st.len;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,190,60,' + (a * 0.4) + ')';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,232,150,' + a + ')';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    } else if (p.kind === 'ember') {
      // 爆炸余烬：缓升火星，相位闪烁，橙黄渐入暗红后熄灭
      const es = emberSpec(p);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(es.alpha, 0, 1);
      ctx.fillStyle = es.color + '1)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, es.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    } else if (p.kind === 'boom') {
      drawEnhancedBoom(ctx, enhancedBoomSpec(p));
    }
  }
  ctx.globalAlpha = 1;
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

// 木门（candidate-575）：带裂纹分档的木纹门板，hp 越低裂纹越重
function drawDoors(game) {
  const doors = game.doors;
  if (!doors || !doors.length) return;
  ctx.save();
  for (const d of doors) {
    const hpF = Math.max(0, d.hp) / 4;
    ctx.fillStyle = 'rgba(122,82,44,.92)';
    ctx.fillRect(d.x - d.w / 2, d.y - d.w / 2, d.w, d.w);
    ctx.strokeStyle = 'rgba(60,38,18,.95)';
    ctx.lineWidth = 2;
    ctx.strokeRect(d.x - d.w / 2, d.y - d.w / 2, d.w, d.w);
    if (hpF < 0.75) {
      ctx.strokeStyle = 'rgba(30,18,8,.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(d.x - 12, d.y - 14); ctx.lineTo(d.x + 4, d.y + 2); ctx.lineTo(d.x - 6, d.y + 16);
      ctx.stroke();
    }
    if (hpF < 0.5) {
      ctx.beginPath();
      ctx.moveTo(d.x + 14, d.y - 10); ctx.lineTo(d.x - 2, d.y + 8);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// 人质世界标记（candidate-634）：绿十字+名字，主画面可见护送目标（此前只有小地图有）
function drawHostageMarkers(game) {
  const hs = game.hostages;
  if (!hs || !hs.length) return;
  ctx.save();
  ctx.textAlign = 'center';
  for (const h of hs) {
    if (h.rescued) continue;
    const pulse = 0.7 + 0.3 * Math.sin((game.time || 0) * 4);
    ctx.strokeStyle = 'rgba(120,255,160,' + pulse.toFixed(2) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(h.x - 10, h.y); ctx.lineTo(h.x + 10, h.y);
    ctx.moveTo(h.x, h.y - 10); ctx.lineTo(h.x, h.y + 10);
    ctx.stroke();
    ctx.fillStyle = 'rgba(200,255,220,.9)';
    ctx.font = "600 11px 'Microsoft YaHei',sans-serif";
    ctx.fillText(h.name + (h.following ? '（护送中）' : ''), h.x, h.y - 16);
  }
  ctx.restore();
}

// 冻结期热身靶（candidate-593）：空心圆靶，命中闪光
function drawWarmupTargets(game) {
  const ts = game.warmupTargets;
  if (!ts || !ts.length) return;
  ctx.save();
  for (const t of ts) {
    ctx.strokeStyle = t.flashT > 0 ? 'rgba(255,220,120,.95)' : 'rgba(160,200,255,.4)';
    ctx.lineWidth = t.flashT > 0 ? 3 : 1.5;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(t.x, t.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(160,200,255,.5)';
    ctx.fill();
  }
  ctx.restore();
}

// 回合高光回放（candidate-523）：END 延迟期把最后 8s 快照以 2 倍速幽灵重放
function drawReplayGhosts(game) {
  if (game.state !== 'END' || game.over) return;
  const clip = game.replayClip;
  if (!clip || clip.length < 4) return;
  // 回放进度：END_DELAY 3s 内把 8s 素材 2 倍速放完（留 1s 给胜负横幅）
  const prog = Math.min(1, Math.max(0, (ROUND_END_WINDOW - (game.endedT || 0) - 0.6) / 1.8));
  const tTarget = clip[0].t + (clip[clip.length - 1].t - clip[0].t) * prog;
  let i = 0;
  while (i < clip.length - 1 && clip[i + 1].t < tTarget) i++;
  const f = clip[i];
  if (!f) return;
  ctx.save();
  ctx.globalAlpha = 0.4;
  for (const e of f.ents) {
    ctx.fillStyle = e.team === 'ct' ? '#7fb8ff' : '#ffcf8a';
    ctx.beginPath();
    ctx.arc(e.x, e.y, 9, 0, Math.PI * 2);
    ctx.fill();
    // 朝向短线
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + Math.cos(e.a) * 14, e.y + Math.sin(e.a) * 14);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#ffd75e';
  ctx.font = "700 13px 'Microsoft YaHei','Segoe UI',sans-serif";
  ctx.textAlign = 'center';
  ctx.fillText('◉ 高光回放', game.camX, game.camY - (game.canvasH / (game.zoom || 1)) / 2 + 26);
  ctx.restore();
}
const ROUND_END_WINDOW = 3.0;

// 断电黑幕（candidate-524）：配电箱击毁后以断电点为心的暗幕，半径外视野正常
function drawBlackout(game) {
  const bo = game.blackout;
  if (!bo) return;
  const remain = bo.until - (game.time || 0);
  if (remain <= 0) { game.blackout = null; return; }
  const a = Math.min(0.78, remain / 5.5 * 0.9);
  ctx.save();
  const g = ctx.createRadialGradient(bo.x, bo.y, 60, bo.x, bo.y, 380);
  g.addColorStop(0, 'rgba(4,6,10,' + a.toFixed(3) + ')');
  g.addColorStop(1, 'rgba(4,6,10,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(bo.x, bo.y, 380, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// EMP 脉冲环（candidate-565）：激活期内干扰圈呼吸扩散，压迫感可视化
function drawEmpPulse(game) {
  const emp = game.empPulse;
  if (!emp || game.time >= emp.until) return;
  const age = emp.until - game.time;
  const pulse = 1 + 0.08 * Math.sin(game.time * 9);
  ctx.save();
  ctx.strokeStyle = 'rgba(120,190,255,' + (0.28 + 0.1 * Math.sin(game.time * 11)).toFixed(3) + ')';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(emp.x, emp.y, emp.r * pulse * Math.min(1, 0.4 + age / 6), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// 玩家 spray 轨迹（candidate-544）：金色细线 0.8s 渐隐，纯渲染不影响判定
function drawSprayTrace(game) {
  const st = game.sprayTrace;
  if (!st || !st.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const s of st) {
    const a = clamp(s.life / 0.8, 0, 1) * 0.5;
    if (a <= 0.01) continue;
    ctx.strokeStyle = 'rgba(255,215,94,' + a.toFixed(3) + ')';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  ctx.restore();
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
    // 双段描边替代每帧渐变：粗低透段模拟渐变尾，细亮核段做弹道光芯；
    // lighter 合成增强发光感（CT 冷蓝、T 方武器口径暖色）
    let rgb = t.team === 'ct' ? '135,190,255' : s.color;
    if (t.paint) {
      // 涂装（candidate-586）：玩家弹道用涂装色
      const h2v = t.paint;
      rgb = parseInt(h2v.slice(1, 3), 16) + ',' + parseInt(h2v.slice(3, 5), 16) + ',' + parseInt(h2v.slice(5, 7), 16);
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(' + rgb + ',' + (s.alpha * 0.35) + ')';
    ctx.lineWidth = s.width * 2.2;
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y1);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(' + rgb + ',' + s.alpha + ')';
    ctx.lineWidth = s.width;
    ctx.stroke();
  }
  ctx.restore();
}
