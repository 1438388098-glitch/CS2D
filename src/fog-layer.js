import { getMap } from './map.js';
import { fogEnabled, castVisionPolygon, fogVisionRadius } from './fog.js';

const FOG_SCALE = 0.1;
const FOG_RAYS = 96;
const FOG_BLUR = 12;
const FOG_CACHE_MS = 250;   // 缓存刷新周期：放宽后视点小幅移动不触发重算（雾重算是 2D 帧耗大头）

function viewpointsFor(game) {
  const p = game.player;
  let target = p && !p.dead ? p : null;
  if (!target) {
    let best = null;
    let bestD = Infinity;
    const camX = game.camX || 0;
    const camY = game.camY || 0;
    for (const e of game.entities || []) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - camX, e.y - camY);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    target = best;
  }
  if (target) return [target];
  return Number.isFinite(game.camX) && Number.isFinite(game.camY)
    ? [{ x: game.camX, y: game.camY }]
    : [];
}

function layerKey(game, views) {
  const smokeKey = (game.smokes || [])
    .map((s) => Math.round(s.x / 48) + ',' + Math.round(s.y / 48))
    .join(';');
  const posKey = views
    .map((v) => Math.round(v.x / 32) + ',' + Math.round(v.y / 32))
    .join('|');
  return posKey + '#' + smokeKey;
}

export function renderFogLayer(game) {
  if (!fogEnabled(game) || typeof document === 'undefined') return null;
  const map = getMap();
  if (!map || !map.W || !map.H) return null;

  const fw = Math.max(1, Math.ceil(map.W * FOG_SCALE));
  const fh = Math.max(1, Math.ceil(map.H * FOG_SCALE));
  let cv = game._fogCv;
  if (!cv || cv.width !== fw || cv.height !== fh) {
    cv = document.createElement('canvas');
    cv.width = fw;
    cv.height = fh;
    game._fogCv = cv;
  }

  const views = viewpointsFor(game);
  if (!views.length) return cv;

  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const key = layerKey(game, views);
  if (game._fogKey === key && now - (game._fogUpdatedAt || 0) < FOG_CACHE_MS) return cv;
  game._fogKey = key;
  game._fogUpdatedAt = now;

  const fctx = cv.getContext('2d');
  fctx.setTransform(1, 0, 0, 1, 0, 0);
  fctx.globalCompositeOperation = 'source-over';
  fctx.clearRect(0, 0, fw, fh);
  fctx.fillStyle = 'rgba(2,5,9,0.94)';
  fctx.fillRect(0, 0, fw, fh);
  fctx.globalCompositeOperation = 'destination-out';

  const radius = fogVisionRadius(game);
  for (const v of views) {
    const pts = castVisionPolygon(game, v.x, v.y, radius, FOG_RAYS);
    if (!pts.length) continue;
    fctx.save();
    fctx.shadowColor = 'rgba(0,0,0,1)';
    fctx.shadowBlur = FOG_BLUR;
    fctx.shadowOffsetX = 0;
    fctx.shadowOffsetY = 0;
    fctx.fillStyle = 'rgba(0,0,0,1)';
    fctx.beginPath();
    fctx.moveTo(pts[0].x * FOG_SCALE, pts[0].y * FOG_SCALE);
    for (let i = 1; i < pts.length; i++) {
      fctx.lineTo(pts[i].x * FOG_SCALE, pts[i].y * FOG_SCALE);
    }
    fctx.closePath();
    fctx.fill();
    fctx.restore();
  }
  fctx.globalCompositeOperation = 'source-over';
  return cv;
}
