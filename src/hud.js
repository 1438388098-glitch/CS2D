import { MAPS, WEAPONS } from './config.js';
import { weaponDef, ammoFor, reserveFor } from './entities.js';
import { effectiveSpread } from './ballistic.js';
import { los, getMap } from './map.js';
import { clamp, angDiff } from './utils.js';
import { crosshairSpreadPx, shouldDrawFpsSpreadCrosshair, crosshairHitFeedback, MISS_FEEDBACK_DUR } from './crosshair.js';
import { getBindLabel } from './keymap.js';
import { fogEnabled } from './fog.js';
import { castAimRay } from './fps-laser.js';
import { lowHpVignette, drawLowHpVignette, killFlash, drawKillFlash } from './screen-fx.js';
import { damageArc, drawDamageArc, HIT_ARC_DURATION } from './damage-fx.js';

let ctx = null;
let layers = null;
let lastMiniUpdate = 0;
let mmZoom = 1;

export function initHud(canvas, layersRef) {
  ctx = canvas.getContext('2d');
  layers = layersRef;
}

export function toggleMiniZoom() {
  mmZoom = mmZoom === 1 ? 2 : 1;
}

export function setMiniZoom(z) {
  mmZoom = z === 2 ? 2 : 1;
}

export function isMiniZoomed() { return mmZoom === 2; }

export function minimapEntityIcon(e) {
  const team = e && e.team;
  return {
    team,
    fill: team === 'ct' ? '#4da6ff' : '#ffb84d',
    shape: team === 'ct' ? 'square' : 'triangle'
  };
}

// 掉落物拾取提示：返回 HUD 文案；玩家不可拾取的掉落返回 null
// （拆弹钳仅 CT 且未持有才提示；与当前主武器相同则忽略）
export function dropPickupLabel(p, d) {
  if (!p || !d) return null;
  if (d.kind === 'kit') {
    if (p.team === 'ct' && !(p.weapons && p.weapons.kit)) return '拾取 拆弹钳';
    return null;
  }
  if (p.weapons && p.weapons.primary === d.wid) return null;
  const wd = WEAPONS[d.wid];
  return '拾取 ' + (wd ? wd.name : d.wid);
}

// FPS mode interaction target: pure logic used by HUD and tests.
export function fpsInteractAction(game) {
  const p = game && game.player;
  if (!p || p.dead || game.viewMode !== 'fps' || (game.state !== 'BUY' && game.state !== 'LIVE')) return null;
  const near = (x, y, r = 120) => Math.hypot(x - p.x, y - p.y) <= r;
  if (game.bomb && game.bomb.dropped && p.team === 't' && near(game.bomb.x, game.bomb.y)) {
    return { label: '拾取 C4', action: 'interact' };
  }
  if (game.bomb && game.bomb.planted && p.team === 'ct' && near(game.bomb.x, game.bomb.y, 140)) {
    return { label: '拆除 C4', action: 'interact' };
  }
  if (p.hasBomb && !(game.bomb && game.bomb.planted)) {
    const map = getMap();
    const site = map && map.sites ? (game.tAttackSite === 'A' ? map.sites.A : map.sites.B) : null;
    if (site) {
      const inRect = p.x >= site.x0 && p.x <= site.x1 && p.y >= site.y0 && p.y <= site.y1;
      const nearCenter = near(site.cx, site.cy, 90);
      if (inRect || nearCenter) return { label: '安放 C4', action: 'interact' };
    }
  }
  for (const d of game.drops || []) {
    if (!near(d.x, d.y)) continue;
    const label = dropPickupLabel(p, d);
    if (label) return { label, action: 'interact' };
  }
  return null;
}

// FPS 3D 模式的严格互动判定：不仅要进入半径，还必须被准星射线命中且无墙/烟遮挡。
export function fpsAimInteractAction(game) {
  const p = game && game.player;
  if (!p || p.dead || game.viewMode !== 'fps' || (game.state !== 'BUY' && game.state !== 'LIVE')) return null;
  const ray = p._aimHit || castAimRay(p, game, { range: 260 });
  const aimedAt = (x, y, r = 190) => {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d > r) return false;
    const a = Math.atan2(y - p.y, x - p.x);
    if (Math.abs(angDiff(a, p.angle || 0)) > 0.24) return false;
    return los(game, p.x, p.y, x, y, p.height || 0);
  };
  if (game.bomb && game.bomb.dropped && p.team === 't' && aimedAt(game.bomb.x, game.bomb.y)) {
    return { label: '拾取 C4', action: 'interact' };
  }
  if (game.bomb && game.bomb.planted && p.team === 'ct' && aimedAt(game.bomb.x, game.bomb.y, 210)) {
    return { label: '拆除 C4', action: 'interact' };
  }
  if (p.hasBomb && !(game.bomb && game.bomb.planted)) {
    const map = getMap();
    const site = map && map.sites ? (game.tAttackSite === 'A' ? map.sites.A : map.sites.B) : null;
    if (site) {
      const inRect = p.x >= site.x0 && p.x <= site.x1 && p.y >= site.y0 && p.y <= site.y1;
      const nearCenter = Math.hypot(p.x - site.cx, p.y - site.cy) <= 120;
      const aim = Math.abs(angDiff(Math.atan2(site.cy - p.y, site.cx - p.x), p.angle || 0)) < 0.32;
      const rayInSite = ray && ray.x >= site.x0 && ray.x <= site.x1 && ray.y >= site.y0 && ray.y <= site.y1;
      if ((inRect || nearCenter) && (aim || rayInSite)) return { label: '安放 C4', action: 'interact' };
    }
  }
  let bestDrop = null;
  for (const d of game.drops || []) {
    if (!aimedAt(d.x, d.y, 220)) continue;
    const label = dropPickupLabel(p, d);
    if (!label) continue;
    const dist = Math.hypot(d.x - p.x, d.y - p.y);
    if (!bestDrop || dist < bestDrop.d) {
      bestDrop = { d: dist, label, action: 'interact' };
    }
  }
  return bestDrop ? { label: bestDrop.label, action: bestDrop.action } : null;
}

// FPS death spectate overlay data.
export function fpsSpectateInfo(game) {
  const p = game && game.player;
  if (!p || !p.dead || game.viewMode !== 'fps') return null;
  const targets = game.entities.filter((e) => e.bot && !e.dead && e.team === p.team);
  if (!targets.length) return null;
  const e = targets[game.spectateIdx % targets.length];
  const w = weaponDef(e);
  const wid = e.slot === 'primary' ? (e.weapons.primary || e.weapons.secondary) :
    (e.weapons.secondary || e.weapons.primary);
  return {
    name: e.name || '?',
    hp: e.hp || 0,
    team: e.team,
    weapon: w ? w.name : (wid || '?'),
    ammo: wid ? ammoFor(e) : 0,
    reserve: wid ? reserveFor(e) : 0,
    target: e
  };
}

export function recoilControlInfo(p, wd) {
  if (!p || !wd || wd.kind === 'knife') return { visible: false, ratio: 0, hot: false };
  const ratio = clamp((p.recoil || 0) / 2.4, 0, 1);
  return { visible: true, ratio, hot: ratio > 0.45 };
}

// 准星命中/开火反馈（渲染胶水，纯逻辑由 crosshairHitFeedback 承担）：
// 命中优先（hitMarkT>0），未命中用 lastShot 反推剩余反馈时间；均无则不反馈。
export function crosshairFeedbackFor(game, p) {
  if (!game || !p || p.dead) return null;
  if (game.hitMarkT > 0) return crosshairHitFeedback(true, game.hitMarkT, p.recoil || 0);
  const lastShotAge = p.lastShot > 0 ? (game.time * 1000 - p.lastShot) / 1000 : MISS_FEEDBACK_DUR;
  const fireT = MISS_FEEDBACK_DUR - lastShotAge;
  if (fireT > 0) return crosshairHitFeedback(false, fireT, p.recoil || 0);
  return null;
}

// HUD 弹药低量警示（candidate-291）：纯函数，输入弹匣弹量/弹容/时刻，输出警示状态。
// 确定性：blink 仅由传入的 t（毫秒）推导，不读取 Date/performance。
// 阈值可经 opts 覆盖以便测试边界：
//   lowRatio(≤0.2 弹容触发 low) / criticalRatio(≤0.1 触发 critical) / criticalMin(≤2 发触发 critical)
export function ammoWarning(ammo, mag, t = 0, opts = {}) {
  const lowRatio = opts.lowRatio != null ? opts.lowRatio : 0.2;
  const criticalRatio = opts.criticalRatio != null ? opts.criticalRatio : 0.1;
  const criticalMin = opts.criticalMin != null ? opts.criticalMin : 2;
  const lowPeriod = opts.lowPeriod != null ? opts.lowPeriod : 480;
  const critPeriod = opts.critPeriod != null ? opts.critPeriod : 240;
  if (!(mag > 0) || !(ammo >= 0)) return { warning: false, level: 'ok', blink: false };
  const ratio = ammo / mag;
  let level = 'ok';
  if (ammo <= 0) level = 'critical';
  else if (ammo <= criticalMin || ratio <= criticalRatio) level = 'critical';
  else if (ratio <= lowRatio) level = 'low';
  const warning = level !== 'ok';
  const period = level === 'critical' ? critPeriod : lowPeriod;
  const blink = warning && (Math.floor(Math.max(0, t) / period) % 2 === 0);
  return { warning, level, blink };
}

function rr(mctx, x, y, w, h, r) {
  mctx.beginPath();
  mctx.moveTo(x + r, y);
  mctx.arcTo(x + w, y, x + w, y + h, r);
  mctx.arcTo(x + w, y + h, x, y + h, r);
  mctx.arcTo(x, y + h, x, y, r);
  mctx.arcTo(x, y, x + w, y, r);
  mctx.closePath();
}

export function renderMinimap(game) {
  const dpr = game.dpr || 1;
  const cw = ctx.canvas.width / dpr;
  const s = layers.mmScale * mmZoom * 0.5;
  const mw = 240 * mmZoom;
  const mh = 180 * mmZoom;
  const ox = cw - mw - 10;
  const oy = 8;
  const mctx = ctx;
  mctx.save();
  // 玻璃底
  rr(mctx, ox - 2, oy - 2, mw + 4, mh + 4, 8);
  mctx.fillStyle = 'rgba(10,13,17,.8)';
  mctx.fill();
  mctx.strokeStyle = 'rgba(255,255,255,.16)';
  mctx.lineWidth = 1;
  mctx.stroke();
  mctx.save();
  rr(mctx, ox - 2, oy - 2, mw + 4, mh + 4, 8);
  mctx.clip();
  mctx.globalAlpha = 0.94;
  mctx.drawImage(layers.miniMap, ox, oy, mw, mh);
  mctx.globalAlpha = 1;
  // 底部暗角 + 地图名
  const grd = mctx.createLinearGradient(0, oy + mh - 26, 0, oy + mh);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(0,0,0,.55)');
  mctx.fillStyle = grd;
  mctx.fillRect(ox, oy + mh - 26, mw, 26);
  const map = getMap();
  const mapDef = MAPS.find((m) => m.id === game.mapId);
  mctx.fillStyle = 'rgba(255,255,255,.5)';
  mctx.font = "10px 'Microsoft YaHei',sans-serif";
  mctx.textAlign = 'center';
  mctx.textBaseline = 'middle';
  mctx.fillText(mapDef ? mapDef.name : (map ? map.name : ''), ox + mw / 2, oy + mh - 12);
  mctx.restore();

  const now = performance.now();
  for (const key of ['A', 'B']) {
    const site = map.sites && map.sites[key];
    if (!site) continue;
    const px = ox + site.cx * s;
    const py = oy + site.cy * s;
    const pulse = Math.sin(now / 400) > 0 ? 0.3 : 0.55;
    mctx.save();
    mctx.shadowColor = key === 'A' ? 'rgba(255,120,70,.9)' : 'rgba(70,150,255,.9)';
    mctx.shadowBlur = 8;
    mctx.fillStyle = key === 'A' ? 'rgba(255,120,70,' + pulse + ')' : 'rgba(70,150,255,' + pulse + ')';
    rr(mctx, px - 7, py - 7, 14, 14, 3);
    mctx.fill();
    mctx.restore();
    mctx.strokeStyle = key === 'A' ? '#ffb08a' : '#8ac0ff';
    mctx.lineWidth = 1.2;
    rr(mctx, px - 7, py - 7, 14, 14, 3);
    mctx.stroke();
    // 站点外圈呼吸环：增强 A/B 可读性
    mctx.strokeStyle = key === 'A' ? 'rgba(255,120,70,0.5)' : 'rgba(70,150,255,0.5)';
    mctx.lineWidth = 1.5;
    const pulseR = 12 + Math.sin(now / 300 + (key === 'A' ? 0 : Math.PI)) * 2;
    mctx.beginPath();
    mctx.arc(px, py, pulseR, 0, Math.PI * 2);
    mctx.stroke();
    mctx.fillStyle = '#111';
    mctx.font = "bold 11px 'Segoe UI',sans-serif";
    mctx.textAlign = 'center';
    mctx.textBaseline = 'middle';
    mctx.fillText(key, px, py + 1);
  }

  const p = game.player;
  const canSee = p && !p.dead && now - lastMiniUpdate > 250;
  if (canSee) lastMiniUpdate = now;

  if (p && !p.dead) {
    // 视野圈：迷雾开启时对应真实可见半径，否则 300px 战术圈
    const vRadius = fogEnabled(game) ? 560 : 300;
    mctx.strokeStyle = 'rgba(255,255,255,0.12)';
    mctx.lineWidth = 1;
    mctx.beginPath();
    mctx.arc(ox + p.x * s, oy + p.y * s, vRadius * s, 0, Math.PI * 2);
    mctx.stroke();
  }

  for (const e of game.entities) {
    if (e.dead) continue;
    if (e === p) {
      mctx.save();
      mctx.translate(ox + e.x * s, oy + e.y * s);
      mctx.rotate(e.angle);
      mctx.fillStyle = '#fff';
      mctx.strokeStyle = 'rgba(0,0,0,.65)';
      mctx.lineWidth = 1;
      mctx.beginPath();
      mctx.moveTo(10, 0);
      mctx.lineTo(-6, -5);
      mctx.lineTo(-6, 5);
      mctx.closePath();
      mctx.fill();
      mctx.stroke();
      mctx.restore();
    } else {
      if (p && e.team !== p.team) {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d >= 300 && (!canSee || !los(game, p.x, p.y, e.x, e.y, p.height))) continue;
      }
      const icon = minimapEntityIcon(e);
      mctx.save();
      mctx.translate(ox + e.x * s, oy + e.y * s);
      mctx.rotate(e.angle || 0);
      mctx.fillStyle = icon.fill;
      mctx.strokeStyle = 'rgba(0,0,0,.7)';
      mctx.lineWidth = 1;
      mctx.beginPath();
      if (icon.shape === 'square') {
        mctx.rect(-3.2, -3.2, 6.4, 6.4);
      } else {
        mctx.moveTo(6, 0);
        mctx.lineTo(-4, -4);
        mctx.lineTo(-4, 4);
        mctx.closePath();
      }
      mctx.fill();
      mctx.stroke();
      mctx.restore();
    }
  }

  // 出生点标记：T 暖色/CT 冷色小方块，便于快速判断双方出生区域
  const mmap = getMap();
  if (mmap) {
    mctx.fillStyle = 'rgba(255,160,60,0.55)';
    for (const sp of mmap.spawns.t || []) mctx.fillRect(ox + sp.x * s - 1.5, oy + sp.y * s - 1.5, 3, 3);
    mctx.fillStyle = 'rgba(70,150,255,0.55)';
    for (const sp of mmap.spawns.ct || []) mctx.fillRect(ox + sp.x * s - 1.5, oy + sp.y * s - 1.5, 3, 3);
  }

  // 烟雾区：灰斑覆盖对应区域，提升战术可读性
  if (game.smokes && game.smokes.length) {
    mctx.fillStyle = 'rgba(170,175,185,0.5)';
    for (const sm of game.smokes) {
      const sr = Math.max(4, sm.r * s);
      mctx.beginPath();
      mctx.arc(ox + sm.x * s, oy + sm.y * s, sr, 0, Math.PI * 2);
      mctx.fill();
    }
  }
  if (game.crates) {
    mctx.fillStyle = 'rgba(158,116,64,0.95)';
    for (const c of game.crates) {
      mctx.fillRect(ox + c.x * s - 1.5, oy + c.y * s - 1.5, 3, 3);
    }
  }
  if (p && p.dead) {
    mctx.fillStyle = 'rgba(255,255,255,0.85)';
    mctx.font = '9px Segoe UI,Microsoft YaHei,sans-serif';
    mctx.textAlign = 'left';
    mctx.textBaseline = 'top';
    for (const e of game.entities) {
      if (e.dead || e.team !== p.team) continue;
      mctx.fillText(e.name, ox + e.x * s + 5, oy + e.y * s - 4);
    }
  }
  if (game.bomb && (game.bomb.dropped || game.bomb.planted)) {
    const blink = Math.sin(now / 160) > 0;
    const bx = ox + game.bomb.x * s;
    const by = oy + game.bomb.y * s;
    mctx.save();
    mctx.translate(bx, by);
    mctx.rotate(Math.PI / 4);
    mctx.shadowColor = blink ? 'rgba(255,59,48,.95)' : 'rgba(138,26,18,.8)';
    mctx.shadowBlur = blink ? 10 : 5;
    mctx.fillStyle = blink ? '#ff3b30' : '#8a1a12';
    mctx.fillRect(-5.5, -5.5, 11, 11);
    mctx.restore();
    mctx.strokeStyle = blink ? '#ffd0c0' : '#7a5a52';
    mctx.lineWidth = 1.4;
    mctx.save();
    mctx.translate(bx, by);
    mctx.rotate(Math.PI / 4);
    mctx.strokeRect(-5.5, -5.5, 11, 11);
    mctx.restore();
    mctx.fillStyle = blink ? '#fff' : '#888';
    mctx.fillRect(bx - 2, by - 2, 4, 4);
  }
  mctx.restore();
}

export function renderLens(game) {
  if (typeof document === 'undefined') return;
  const dpr = game.dpr || 1;
  const w2 = ctx.canvas.width / dpr;
  const h2 = ctx.canvas.height / dpr;
  const p = game.player;
  if (!p || p.dead || !p.scoped) return;
  const wd = weaponDef(p);
  if (!wd || wd.kind !== 'sniper') return;
  const mx = game.input.mouse.x;
  const my = game.input.mouse.y;
  const r = Math.min(w2, h2) * 0.48;
  if (r < 8) return;
  const scale = 2.2;
  const srcR = r / scale;
  const size = Math.max(8, Math.ceil(r * 2 * dpr));
  let cv = game._lensCv;
  if (!cv) {
    cv = document.createElement('canvas');
    game._lensCv = cv;
  }
  if (cv.width !== size || cv.height !== size) {
    cv.width = size;
    cv.height = size;
  }
  const lctx = cv.getContext('2d');
  lctx.clearRect(0, 0, size, size);
  // 仅绘制放大 2.2x 的一次采样（前一次整幅绘制被完全覆盖，纯浪费）
  lctx.drawImage(ctx.canvas, (mx - srcR) * dpr, (my - srcR) * dpr, srcR * 2 * dpr, srcR * 2 * dpr, 0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(mx, my, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(cv, mx - r, my - r, r * 2, r * 2);
  ctx.restore();
}

export function renderHud(game) {
  const dpr = game.dpr || 1;
  const w2 = ctx.canvas.width / dpr;
  const h2 = ctx.canvas.height / dpr;
  const p = game.player;
  // FPS 命中反馈/击杀环恒锚定屏幕中心（朝向=鼠标屏幕方向，中心即射击线）
  if (game.viewMode === 'fps' && p && p.dead) {
    const spec = fpsSpectateInfo(game);
    if (spec) {
      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = "700 16px 'Microsoft YaHei','Segoe UI',sans-serif";
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText('观战 ' + spec.name, 18, 62);
      ctx.fillStyle = spec.team === 'ct' ? '#7fb8ff' : '#ffcf8a';
      ctx.fillText('观战 ' + spec.name, 18, 62);
      ctx.font = "12px 'Microsoft YaHei','Segoe UI',sans-serif";
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.strokeText(spec.weapon + '  ' + spec.ammo + '/' + spec.reserve, 18, 84);
      ctx.fillText(spec.weapon + '  ' + spec.ammo + '/' + spec.reserve, 18, 84);
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(18, 102, 110, 6);
      ctx.fillStyle = spec.hp > 60 ? '#4dc35c' : (spec.hp > 30 ? '#ffc24d' : '#ff5540');
      ctx.fillRect(18, 102, 110 * clamp(spec.hp / 100, 0, 1), 6);
      ctx.font = "11px 'Microsoft YaHei','Segoe UI',sans-serif";
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.strokeText('[Q/E] 切换目标', 18, 116);
      ctx.fillText('[Q/E] 切换目标', 18, 116);
      ctx.restore();
    }
  }
  if (game.viewMode === 'fps' && p && !p.dead) {
    const act = fpsAimInteractAction(game);
    if (act) {
      const label = '[' + getBindLabel(act.action) + '] ' + act.label;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = "600 15px 'Microsoft YaHei','Segoe UI',sans-serif";
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(label, w2 / 2, h2 - 82);
      ctx.fillStyle = 'rgba(255,235,160,0.95)';
      ctx.fillText(label, w2 / 2, h2 - 82);
      ctx.restore();
    }
  }
  const aimX = game.viewMode === 'fps' ? w2 / 2 : game.input.mouse.x;
  const aimY = game.viewMode === 'fps' ? h2 / 2 : game.input.mouse.y;
  ctx.save();
  // 受击方向指示：屏幕边缘红色箭头指向伤害来源，1.2s 内衰减
  if (p && !p.dead && p.lastDmgFrom && (game.time * 1000 - p.lastDmgT) < 1200) {
    const src = p.lastDmgFrom;
    const age = (game.time * 1000 - p.lastDmgT) / 1000;
    const a = clamp(1 - age / 1.2, 0, 1);
    let ang = Math.atan2(src.y - p.y, src.x - p.x);
    if (game.viewMode !== 'top') ang = ang - p.angle - Math.PI / 2;
    const ccx = w2 / 2, ccy = h2 / 2;
    const r = Math.min(w2, h2) / 2 - 70;
    const ax = ccx + Math.cos(ang) * r;
    const ay = ccy + Math.sin(ang) * r;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.fillStyle = 'rgba(255,60,50,' + a + ')';
    ctx.shadowColor = 'rgba(255,40,30,' + a + ')';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-8, -11);
    ctx.lineTo(-8, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // 命中标记（爆头放大 1.5x + 金色）
  if (game.hitMarkT > 0) {
    const hmA = clamp(game.hitMarkT / 0.2, 0, 1);
    const hx = aimX;
    const hy = aimY;
    const hs = game.headshotT > 0 ? 1.5 : 1;
    ctx.strokeStyle = game.headshotT > 0 ? 'rgba(255,200,60,' + hmA + ')' : 'rgba(255,60,60,' + hmA + ')';
    ctx.lineWidth = 2;
    const s2 = 8 * hs;
    ctx.beginPath();
    ctx.moveTo(hx - s2, hy - s2); ctx.lineTo(hx - s2 / 3, hy - s2 / 3);
    ctx.moveTo(hx + s2, hy - s2); ctx.lineTo(hx + s2 / 3, hy - s2 / 3);
    ctx.moveTo(hx - s2, hy + s2); ctx.lineTo(hx - s2 / 3, hy + s2 / 3);
    ctx.moveTo(hx + s2, hy + s2); ctx.lineTo(hx + s2 / 3, hy + s2 / 3);
    ctx.stroke();
  }
  // 爆头金字（FPS 模式，0.35s 淡出）
  if (game.headshotT > 0 && game.viewMode === 'fps') {
    const hA = clamp(game.headshotT / 0.35, 0, 1);
    const cx = w2 / 2, cy = h2 * 0.3;
    ctx.save();
    ctx.globalAlpha = hA;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = "900 30px 'Segoe UI',sans-serif";
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 6;
    ctx.strokeText('HEADSHOT', cx, cy);
    ctx.fillStyle = '#ffd34d';
    ctx.fillText('HEADSHOT', cx, cy);
    ctx.font = "700 14px 'Microsoft YaHei',sans-serif";
    ctx.strokeText('爆头', cx, cy + 22);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText('爆头', cx, cy + 22);
    ctx.restore();
  }
  // D1 目标方向指示箭头：屏幕边缘三角指向 C4/进攻点，带距离标签
  if (game.viewMode === 'fps' && p && !p.dead) {
    const map = getMap();
    let tx = null;
    if (p.team === 't') {
      if (game.bomb && game.bomb.dropped) tx = { x: game.bomb.x, y: game.bomb.y };
      else if (game.bomb && game.bomb.planted) tx = { x: game.bomb.x, y: game.bomb.y };
      else if (map.sites) tx = game.tAttackSite === 'A' ? map.sites.A : map.sites.B;
    } else {
      if (game.bomb && game.bomb.planted) tx = { x: game.bomb.x, y: game.bomb.y };
      else if (game.bomb && !game.bomb.planted && game.bomb.dropped) tx = { x: game.bomb.x, y: game.bomb.y };
      else if (map.sites) tx = game.tAttackSite === 'A' ? map.sites.A : map.sites.B;
    }
    if (tx) {
      const tcx = tx.cx !== undefined ? tx.cx : tx.x;
      const tcy = tx.cy !== undefined ? tx.cy : tx.y;
      const relA = Math.atan2(tcy - p.y, tcx - p.x) - p.angle - Math.PI / 2;
      const dist = Math.hypot(tcx - p.x, tcy - p.y);
      if (Math.abs(relA) > 0.6) {
        const rr2 = Math.min(w2, h2) / 2 - 46;
        const ax = w2 / 2 + Math.cos(relA) * rr2;
        const ay = h2 / 2 + Math.sin(relA) * rr2;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(relA);
        ctx.fillStyle = 'rgba(255,200,90,0.92)';
        ctx.shadowColor = 'rgba(255,180,60,0.6)';
        ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, -9); ctx.lineTo(-6, 9); ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = 'rgba(255,230,170,0.9)';
        ctx.font = "11px 'Microsoft YaHei',sans-serif";
        ctx.textAlign = 'center';
        const label = game.bomb && game.bomb.planted ? 'C4 ' : (p.team === 't' ? '攻点 ' : '防守 ');
        ctx.fillText(label + Math.round(dist / 40) + 'm', w2 / 2 + Math.cos(relA) * (rr2 + 18), h2 / 2 + Math.sin(relA) * (rr2 + 18));
      }
    }
  }
  // 击杀环（FPS 下锚定屏幕中心 + 径向光晕强化反馈）
  if (game.killRingT > 0) {
    const kt = 0.7 - game.killRingT;
    const pr = Math.min(1, Math.max(0, kt / 0.35));
    const a = (1 - pr) * 0.9;
    if (game.viewMode === 'fps') {
      const rr2 = 62 + pr * 62;
      const g = ctx.createRadialGradient(aimX, aimY, 8, aimX, aimY, rr2);
      g.addColorStop(0, 'rgba(255,210,90,' + (a * 0.28) + ')');
      g.addColorStop(1, 'rgba(255,210,90,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(aimX, aimY, rr2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,210,90,' + a + ')';
    ctx.lineWidth = game.viewMode === 'fps' ? 3.5 : 2.5;
    ctx.beginPath();
    ctx.arc(aimX, aimY, 20 + pr * 55, 0, Math.PI * 2);
    ctx.stroke();
  }  if (p && !p.dead && p.scoped && game.viewMode !== 'fps') {
    // 开镜环：FPS 模式下由 render3d 的 drawScope 负责（黑环+十字线），此处跳过避免双镜错位
    const wd = weaponDef(p);
    if (wd && wd.kind === 'sniper') {
      const cx = game.input.mouse.x;
      const cy = game.input.mouse.y;
      const r = Math.min(w2, h2) * 0.48;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w2, h2);
      ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(4,8,12,0.52)';
      ctx.fill();
      const lens = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
      lens.addColorStop(0, 'rgba(120,210,255,0.10)');
      lens.addColorStop(0.85, 'rgba(120,210,255,0.18)');
      lens.addColorStop(1, 'rgba(170,230,255,0.42)');
      ctx.fillStyle = lens;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(170,225,255,0.65)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const a = Math.PI * i / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r - 8, a - 0.18, a + 0.18);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  // D2 freeze 倒计时：3s 内中央大数字
  if (game.viewMode === 'fps' && game.freezeT > 0 && game.freezeT < 3) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "900 64px 'Segoe UI',sans-serif";
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 8;
    ctx.strokeText(String(Math.ceil(game.freezeT)), w2 / 2, h2 / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(Math.ceil(game.freezeT)), w2 / 2, h2 / 2);
    ctx.restore();
  }
  // D2 炸弹已装：上方中央 C4 倒计时，<10s 红色脉冲
  if (game.viewMode === 'fps' && game.bomb && game.bomb.planted) {
    const t = game.bomb.timer;
    const urgent = t < 10;
    const pulse = 0.7 + 0.3 * Math.sin(game.time * 10);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = (urgent ? "900 40px" : "700 28px") + " 'Segoe UI',sans-serif";
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 6;
    ctx.strokeText('C4  ' + t.toFixed(1), w2 / 2, 54);
    ctx.fillStyle = urgent ? 'rgba(255,70,60,' + pulse + ')' : '#ffffff';
    ctx.fillText('C4  ' + t.toFixed(1), w2 / 2, 54);
    ctx.restore();
  }
  const recoil = recoilControlInfo(p, weaponDef(p));
  if (recoil.visible) {
    const bw = 132;
    const bh = 7;
    const bx = w2 / 2 - bw / 2;
    const by = h2 - 34;
    ctx.save();
    ctx.fillStyle = 'rgba(4,8,12,0.55)';
    rr(ctx, bx - 2, by - 2, bw + 4, bh + 4, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    rr(ctx, bx, by, bw, bh, 3);
    ctx.fill();
    const fillW = Math.max(0, Math.round(bw * recoil.ratio));
    if (fillW > 0) {
      ctx.fillStyle = recoil.hot ? '#ff5540' : '#ffb545';
      rr(ctx, bx, by, fillW, bh, 3);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = "10px 'Microsoft YaHei',sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('后座', w2 / 2, by - 3);
    ctx.restore();
  }
  // candidate-308：受击方向红弧——受击瞬间屏幕边缘朝向伤害来源闪现红色弧形，0.3s 渐隐
  if (p && !p.dead && p.hitFxT > 0) {
    let ang = p.lastHitAng || 0;
    if (game.viewMode !== 'top') ang = ang - p.angle - Math.PI / 2;
    const fx = damageArc(ang, HIT_ARC_DURATION - p.hitFxT);
    drawDamageArc(ctx, w2, h2, fx);
  }
  // D6 低血量屏幕边缘红边脉冲警示：血量 <30% 时出现，越低越明显，死亡后消失
  if (p && !p.dead) {
    const fx = lowHpVignette(p.hp, p.maxHp || 100, game.time || 0, dpr);
    drawLowHpVignette(ctx, w2, h2, fx);
  }
  // 2D 击杀屏幕边缘白色闪光（candidate-304）：左右下三边 0.35s 内从 1 衰减到 0
  if (game.killFlashT > 0) {
    drawKillFlash(ctx, w2, h2, killFlash(game.killFlashT));
  }
  ctx.restore();
}
export function renderCrosshair(game) {
  const dpr = game.dpr || 1;
  const cw = ctx.canvas.width / dpr;
  const ch = ctx.canvas.height / dpr;
  const p = game.player;
  if (!p || p.dead) return;
  if (game.viewMode === 'fps') {
    // FPS 准星恒在屏幕中心：3D 视角不显示独立鼠标，朝向由指针锁定的 movementX/Y 驱动；
    // 准星中心即射击线方向
    const mx = cw / 2, my = ch / 2;
    const wd = weaponDef(p);
    if (!shouldDrawFpsSpreadCrosshair(wd, p)) return;
    // 刀：不画十字，仅中心红点 + 小圆环
    if (wd && wd.kind === 'knife') {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,60,40,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mx, my, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,60,40,0.9)';
      ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
      ctx.restore();
      return;
    }
    let sp = wd ? effectiveSpread(wd, p) : 0;
    if (wd && wd.kind === 'sniper' && p.scoped) sp = 0.15;
    const rDeg = wd ? p.recoil * 0.6 : 0;
    const spreadPx = crosshairSpreadPx(cw, game.fov, sp, rDeg);
    const baseGap = wd && wd.kind === 'shotgun' ? 12 : 6;
    let gap = baseGap + clamp(spreadPx, 0, 260) + (p.scoped ? 2 : 0);
    if (p.hp <= 25) gap = Math.max(3, gap - 2);
    if (game.dmgSpreadT > 0) gap += clamp(game.dmgSpreadT * 34, 0, 34);
    // D4 命中/开火十字反馈：命中显著扩散+橙红变色，未命中轻微扩散颜色不变
    const fb = crosshairFeedbackFor(game, p);
    if (fb) gap *= fb.spreadMul;
    const len = wd && wd.kind === 'sniper' ? 4 : 7;
    const reloading = !!p.reloading;
    if (reloading) gap = baseGap;
    const empty = wd && wd.mag > 0 && ammoFor(p) <= 0;
    ctx.save();
    ctx.globalAlpha = reloading ? 0.35 : 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = wd && wd.kind === 'shotgun' ? 4.5 : 3.5;
    ctx.beginPath();
    ctx.moveTo(mx - gap - len, my); ctx.lineTo(mx - gap, my);
    ctx.moveTo(mx + gap, my); ctx.lineTo(mx + gap + len, my);
    ctx.moveTo(mx, my - gap - len); ctx.lineTo(mx, my - gap);
    ctx.moveTo(mx, my + gap); ctx.lineTo(mx, my + gap + len);
    ctx.stroke();
    const fbColor = fb && fb.color ? fb.color : null;
    ctx.strokeStyle = fbColor || (empty ? 'rgba(255,70,60,0.95)' : (p.aimTarget ? 'rgba(255,80,80,0.9)' : 'rgba(255,255,255,0.85)'));
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mx - gap - len, my); ctx.lineTo(mx - gap, my);
    ctx.moveTo(mx + gap, my); ctx.lineTo(mx + gap + len, my);
    ctx.moveTo(mx, my - gap - len); ctx.lineTo(mx, my - gap);
    ctx.moveTo(mx, my + gap); ctx.lineTo(mx, my + gap + len);
    ctx.stroke();
    if (game.headshotT > 0) {
      ctx.fillStyle = 'rgba(255,200,60,0.95)';
      const hg = gap + len + 5;
      ctx.fillRect(mx - hg - 2, my - 1, 4, 2);
      ctx.fillRect(mx + hg - 2, my - 1, 4, 2);
      ctx.fillRect(mx - 1, my - hg - 2, 2, 4);
      ctx.fillRect(mx - 1, my + hg - 2, 2, 4);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(mx - 2, my - 2, 4, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(mx - 1, my - 1, 2, 2);
    // D4 准星目标信息：名称 + 血条
    const tgt = p.aimTarget;
    if (tgt && !tgt.dead) {
      const ty2 = my + 34;
      ctx.save();
      ctx.font = "10px 'Microsoft YaHei',sans-serif";
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      ctx.strokeText(tgt.name, mx, ty2);
      ctx.fillStyle = tgt.team === 'ct' ? '#7fb8ff' : '#ffcf8a';
      ctx.fillText(tgt.name, mx, ty2);
      const bw = 36;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(mx - bw / 2, ty2 + 5, bw, 4);
      ctx.fillStyle = tgt.hp > 60 ? '#4dc35c' : (tgt.hp > 30 ? '#ffc24d' : '#ff5540');
      ctx.fillRect(mx - bw / 2, ty2 + 5, bw * Math.max(0, tgt.hp) / 100, 4);
      ctx.restore();
    }
    ctx.restore();
    return;
  }
  const mx = game.input.mouse.x;
  const my = game.input.mouse.y;
  if (mx < -10 || my < -10 || mx > cw + 10 || my > ch + 10) return;
  const w = weaponDef(p);
  let spread = w && w.kind !== 'knife' ? effectiveSpread(w, p) : 0;
  if (w && w.kind === 'sniper' && p.scoped) spread = 0.15;
  const recoilDeg = w && w.kind !== 'knife' ? p.recoil * 0.6 : 0;
  const px = cw / 2 + (p.x - (game.camX || 0)) * (game.zoom || 1);
  const py = ch / 2 + (p.y - (game.camY || 0)) * (game.zoom || 1);
  const dist = Math.hypot(mx - px, my - py) || 1;
  const spreadPx = Math.tan(((spread + recoilDeg) * Math.PI) / 180) * dist;
  let gap = 6 + clamp(spreadPx, 0, 260) + (p.scoped ? 2 : 0);
  if (p.hp <= 25) gap = Math.max(3, gap - 2);
  if (game.dmgSpreadT > 0) gap += clamp(game.dmgSpreadT * 34, 0, 34);
  const len = 7;
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(mx - gap - len, my); ctx.lineTo(mx - gap, my);
  ctx.moveTo(mx + gap, my); ctx.lineTo(mx + gap + len, my);
  ctx.moveTo(mx, my - gap - len); ctx.lineTo(mx, my - gap);
  ctx.moveTo(mx, my + gap); ctx.lineTo(mx, my + gap + len);
  ctx.stroke();
  ctx.strokeStyle = p.aimTarget ? 'rgba(255,80,80,0.9)' : 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(mx - gap - len, my); ctx.lineTo(mx - gap, my);
  ctx.moveTo(mx + gap, my); ctx.lineTo(mx + gap + len, my);
  ctx.moveTo(mx, my - gap - len); ctx.lineTo(mx, my - gap);
  ctx.moveTo(mx, my + gap); ctx.lineTo(mx, my + gap + len);
  ctx.stroke();
  // 爆头命中：四臂外圈双点标记
  if (game.headshotT > 0) {
    ctx.fillStyle = 'rgba(255,200,60,0.95)';
    const hg = gap + len + 5;
    ctx.fillRect(mx - hg - 2, my - 1, 4, 2);
    ctx.fillRect(mx + hg - 2, my - 1, 4, 2);
    ctx.fillRect(mx - 1, my - hg - 2, 2, 4);
    ctx.fillRect(mx - 1, my + hg - 2, 2, 4);
  }
  // 命中闪光：命中时准星周围短暂扩散亮环（与 3D 反馈一致）
  if (game.hitFlashT > 0) {
    const fr = 14 + (1 - game.hitFlashT / 0.25) * 26;
    ctx.strokeStyle = 'rgba(255,70,60,' + clamp(game.hitFlashT * 3, 0, 0.8) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(mx, my, fr, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(mx - 2, my - 2, 4, 4);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(mx - 1, my - 1, 2, 2);
  ctx.restore();
}
