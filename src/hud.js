import { MAPS } from './config.js';
import { weaponDef } from './entities.js';
import { effectiveSpread } from './ballistic.js';
import { los, getMap } from './map.js';
import { clamp } from './utils.js';

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

export function renderHud(game) {
  const dpr = game.dpr || 1;
  const w2 = ctx.canvas.width / dpr;
  const h2 = ctx.canvas.height / dpr;
  const p = game.player;
  ctx.save();
  // 受击方向指示：屏幕边缘红色箭头指向伤害来源，1.2s 内衰减
  if (p && !p.dead && p.lastDmgFrom && (game.time * 1000 - p.lastDmgT) < 1200) {
    const src = p.lastDmgFrom;
    const age = (game.time * 1000 - p.lastDmgT) / 1000;
    const a = clamp(1 - age / 1.2, 0, 1);
    const ang = Math.atan2(src.y - p.y, src.x - p.x);
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
    const hx = game.input.mouse.x;
    const hy = game.input.mouse.y;
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
  // 狙击镜
  if (p && !p.dead && p.scoped) {
    const wd = weaponDef(p);
    if (wd && wd.kind === 'sniper') {
      const cx = game.input.mouse.x;
      const cy = game.input.mouse.y;
      const r = Math.min(w2, h2) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w2, h2);
      ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(0,0,0,0.82)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.95)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

export function renderCrosshair(game) {
  const dpr = game.dpr || 1;
  const cw = ctx.canvas.width / dpr;
  const ch = ctx.canvas.height / dpr;
  const p = game.player;
  if (!p || p.dead) return;
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
