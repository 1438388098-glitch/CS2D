import { MAPS } from './config.js';
import { weaponDef, ammoFor } from './entities.js';
import { effectiveSpread } from './ballistic.js';
import { los, getMap } from './map.js';
import { clamp } from './utils.js';
import { crosshairSpreadPx, shouldDrawFpsSpreadCrosshair } from './crosshair.js';

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
    mctx.strokeStyle = 'rgba(255,255,255,0.12)';
    mctx.lineWidth = 1;
    mctx.beginPath();
    mctx.arc(ox + p.x * s, oy + p.y * s, 300 * s, 0, Math.PI * 2);
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
      mctx.fillStyle = e.team === 'ct' ? '#4da6ff' : '#ffb84d';
      mctx.beginPath();
      mctx.arc(ox + e.x * s, oy + e.y * s, 3, 0, Math.PI * 2);
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
    if (game.hitMarkT > 0) gap += clamp(game.hitMarkT * 30, 0, 30);
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
    ctx.strokeStyle = empty ? 'rgba(255,70,60,0.95)' : (p.aimTarget ? 'rgba(255,80,80,0.9)' : 'rgba(255,255,255,0.85)');
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
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(mx - 2, my - 2, 4, 4);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(mx - 1, my - 1, 2, 2);
  ctx.restore();
}
