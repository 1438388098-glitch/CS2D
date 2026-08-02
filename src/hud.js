import { WEAPONS, ROUND } from './config.js';
import { weaponDef, ammoFor, reserveFor } from './entities.js';
import { effectiveSpread } from './ballistic.js';
import { los, getMap } from './map.js';
import { FONT } from './render-utils.js';
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

export function isMiniZoomed() { return mmZoom === 2; }

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
  mctx.globalAlpha = 0.94;
  mctx.drawImage(layers.miniMap, ox, oy, mw, mh);
  mctx.globalAlpha = 1;
  mctx.strokeStyle = 'rgba(255,255,255,0.18)';
  mctx.lineWidth = 1;
  mctx.strokeRect(ox - 2, oy - 2, mw + 4, mh + 4);

  const map = getMap();
  for (const key of ['A', 'B']) {
    const site = map.sites && map.sites[key];
    if (!site) continue;
    const px = ox + site.cx * s;
    const py = oy + site.cy * s;
    const pulse = Math.sin(performance.now() / 400) > 0 ? 0.25 : 0.5;
    mctx.fillStyle = key === 'A' ? 'rgba(255,120,70,' + pulse + ')' : 'rgba(70,150,255,' + pulse + ')';
    mctx.fillRect(px - 8, py - 8, 16, 16);
    mctx.strokeStyle = key === 'A' ? '#ffb08a' : '#8ac0ff';
    mctx.lineWidth = 1.2;
    mctx.strokeRect(px - 8, py - 8, 16, 16);
    mctx.fillStyle = '#111';
    mctx.font = "bold 12px 'Segoe UI',sans-serif";
    mctx.textAlign = 'center';
    mctx.textBaseline = 'middle';
    mctx.fillText(key, px, py + 1);
  }

  const p = game.player;
  const now = performance.now();
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
      mctx.fillStyle = '#fff';
      mctx.save();
      mctx.translate(ox + e.x * s, oy + e.y * s);
      mctx.rotate(e.angle);
      mctx.fillRect(-5, -2.5, 10, 5);
      mctx.beginPath();
      mctx.moveTo(6, 0);
      mctx.lineTo(10, -3);
      mctx.lineTo(10, 3);
      mctx.closePath();
      mctx.fill();
      mctx.restore();
    } else {
      if (p && e.team !== p.team) {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d >= 300 && (!canSee || !los(game, p.x, p.y, e.x, e.y))) continue;
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
    mctx.fillStyle = blink ? '#ff3b30' : '#8a1a12';
    mctx.fillRect(bx - 5, by - 5, 10, 10);
    mctx.strokeStyle = blink ? '#ffd0c0' : '#7a5a52';
    mctx.lineWidth = 1.4;
    mctx.strokeRect(bx - 5, by - 5, 10, 10);
    mctx.fillStyle = blink ? '#fff' : '#888';
    mctx.fillRect(bx - 2, by - 2, 4, 4);
  }
  mctx.restore();
}

export function renderHud(game) {
  const dpr = game.dpr || 1;
  const w2 = ctx.canvas.width / dpr;
  const h2 = ctx.canvas.height / dpr;
  const narrow = w2 < 900;
  const p = game.player;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = FONT;
  let tT = Math.max(0, Math.ceil((game.roundDur || ROUND.DURATION) - game.roundTime));
  const tMin = Math.floor(tT / 60);
  const tSec = tT % 60;
  const timeStr = (tMin < 10 ? '0' : '') + tMin + ':' + (tSec < 10 ? '0' : '') + tSec;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(w2 / 2 - 90, 8, 180, 34);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.strokeRect(w2 / 2 - 90, 8, 180, 34);
  ctx.fillStyle = '#fff';
  ctx.fillText(timeStr, w2 / 2, 32);
  ctx.fillStyle = '#ffb545';
  ctx.fillText('T ' + game.score.T, w2 / 2 - 110, 32);
  ctx.fillStyle = '#5ab0ff';
  ctx.fillText(game.score.CT + ' CT', w2 / 2 + 110, 32);
  if (game.state === 'BUY' && game.freezeT > 0) {
    ctx.fillStyle = '#ff8a2a';
    ctx.fillText(Math.ceil(game.freezeT), w2 / 2, 58);
  }
  if (p && !p.dead) {
    const hx = 24, hy = h2 - 64;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(hx - 10, hy - 34, 220, 88);
    ctx.font = FONT;
    ctx.textAlign = 'left';
    const hp = Math.max(0, Math.ceil(p.hp));
    ctx.fillStyle = hp <= 25 ? '#ff4444' : '#fff';
    ctx.fillText(hp, hx, hy + 14);
    ctx.font = "11px 'Segoe UI','Microsoft YaHei',sans-serif";
    ctx.fillStyle = '#8b95a1';
    ctx.fillText('HP', hx + 56, hy + 8);
    ctx.fillStyle = '#ffd27a';
    ctx.font = FONT;
    ctx.fillText('$' + p.money, hx, hy + 30);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(hx + 70, hy - 20, 140, 7);
    ctx.fillStyle = '#3ddc68';
    ctx.fillRect(hx + 70, hy - 20, 140 * clamp(p.hp / 100, 0, 1), 7);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(hx + 70, hy - 8, 140, 5);
    ctx.fillStyle = '#7fc7ff';
    ctx.fillRect(hx + 70, hy - 8, 140 * clamp(p.armor / 100, 0, 1), 5);
    const wd = weaponDef(p);
    let ammoStr = '∞';
    if (wd && wd.mag > 0) ammoStr = ammoFor(p) + ' / ' + reserveFor(p);
    ctx.font = FONT;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.fillText(ammoStr, w2 - 26, h2 - 30);
    ctx.font = "12px 'Segoe UI','Microsoft YaHei',sans-serif";
    ctx.fillStyle = '#8b95a1';
    ctx.fillText(wd ? wd.name : (p.slot && p.slot.indexOf('nade:') === 0 ? '手雷' : ''), w2 - 26, h2 - 12);
    if (p.reloading) {
      ctx.fillStyle = '#ff8a2a';
      ctx.fillText('换弹中…', w2 - 26, h2 - 50);
    } else if (wd && wd.kind === 'sniper' && p.scoped) {
      ctx.fillStyle = '#8ab4ff';
      ctx.fillText('已开镜', w2 - 26, h2 - 50);
    }
    if (!narrow) {
      ctx.textAlign = 'left';
      ctx.font = "11px 'Segoe UI','Microsoft YaHei',sans-serif";
      ctx.fillStyle = '#8b95a1';
      const nades = p.weapons.nades;
      ctx.fillText('雷 4:' + nades.he + '  闪 5:' + nades.flash + '  烟 6:' + nades.smoke, w2 - 230, h2 - 30);
    }
  } else if (p && !narrow) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = "14px 'Segoe UI','Microsoft YaHei',sans-serif";
    const mates = game.entities.filter((e) => e.team === p.team && !e.dead);
    if (mates.length) {
      ctx.fillText('观战: ' + mates[game.spectateIdx % mates.length].name + ' · 左键切换视角', w2 / 2, h2 - 40);
    } else {
      ctx.fillText('本回合已结束', w2 / 2, h2 - 40);
    }
  }
  if (game.state === 'BUY') {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,138,42,0.9)';
    ctx.font = "12px 'Segoe UI','Microsoft YaHei',sans-serif";
    ctx.fillText('购买阶段 剩余 ' + Math.max(0, Math.ceil(game.buyTime)) + 's · B 打开购买菜单', w2 / 2, 72);
  }
  if (game.bomb && game.bomb.planted) {
    const t = game.bomb.timer;
    const urgent = t < 10;
    const col = urgent && Math.floor(performance.now() / 250) % 2 === 0 ? '#ff3b30' : '#ffd27a';
    ctx.textAlign = 'center';
    ctx.font = FONT;
    ctx.fillStyle = col;
    const bx = w2 / 2 - 38;
    ctx.fillRect(bx - 14, h2 - 160, 30, 22);
    ctx.fillRect(bx - 6, h2 - 172, 14, 12);
    ctx.fillStyle = '#0a0c0e';
    ctx.beginPath();
    ctx.arc(bx + 1, h2 - 147, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = urgent ? '#ff3b30' : '#ffd27a';
    ctx.beginPath();
    ctx.arc(bx + 1, h2 - 147, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.fillText(Math.max(0, t).toFixed(1), w2 / 2 + 18, Math.round(h2 - 148));
  }
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
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-8, -11);
    ctx.lineTo(-8, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  if (game.hitMarkT > 0) {
    const hmA = clamp(game.hitMarkT / 0.2, 0, 1);
    const hx = game.input.mouse.x + (game._shx || 0);
    const hy = game.input.mouse.y + (game._shy || 0);
    ctx.strokeStyle = 'rgba(255,60,60,' + hmA + ')';
    ctx.lineWidth = 2;
    const s2 = 8;
    ctx.beginPath();
    ctx.moveTo(hx - s2, hy - s2); ctx.lineTo(hx - s2 / 3, hy - s2 / 3);
    ctx.moveTo(hx + s2, hy - s2); ctx.lineTo(hx + s2 / 3, hy - s2 / 3);
    ctx.moveTo(hx - s2, hy + s2); ctx.lineTo(hx - s2 / 3, hy + s2 / 3);
    ctx.moveTo(hx + s2, hy + s2); ctx.lineTo(hx + s2 / 3, hy + s2 / 3);
    ctx.stroke();
  }
  if (p && !p.dead && p.scoped) {
    const wd = weaponDef(p);
    if (wd && wd.kind === 'sniper') {
      const cx = game.input.mouse.x + (game._shx || 0);
      const cy = game.input.mouse.y + (game._shy || 0);
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
  const mx = game.input.mouse.x + (game._shx || 0);
  const my = game.input.mouse.y + (game._shy || 0);
  if (mx < -10 || my < -10 || mx > cw + 10 || my > ch + 10) return;
  const w = weaponDef(p);
  let spread = w && w.kind !== 'knife' ? effectiveSpread(w, p) : 0;
  if (w && w.kind === 'sniper' && p.scoped) spread = 0.15;
  const recoilDeg = w && w.kind !== 'knife' ? p.recoil * 0.6 : 0;
  const px = cw / 2 + (p.x - (game.camX || 0)) * (game.zoom || 1);
  const py = ch / 2 + (p.y - (game.camY || 0)) * (game.zoom || 1);
  const dist = Math.hypot(mx - px, my - py) || 1;
  const spreadPx = Math.tan(((spread + recoilDeg) * Math.PI) / 180) * dist;
  const gap = 6 + clamp(spreadPx, 0, 260) + (p.scoped ? 2 : 0);
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
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(mx - 2, my - 2, 4, 4);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(mx - 1, my - 1, 2, 2);
  ctx.restore();
}
