// Pure FPS laser ray helper: casts along yaw and pitch so the red laser
// stays aligned with the crosshair in 3D view instead of always lying flat.
import { getMap, passableTolerant, groundElevationAt, tileAt } from './map.js';
import { weaponDef } from './entities.js';

function obstacleTopFor(c, tile) {
  if (c === '=' || c === 'C' || c === 'D') return tile * 0.55;
  if (c === 'o') return tile * 0.45;
  if (c === '~' || c === '\u2248' || c === '\u224b') return tile * 0.25;
  return tile;
}

function hitKindFor(c) {
  if (c === 'C' || c === 'D') return 'crate';
  if (c === 'o') return 'barrel';
  if (c === '=') return 'thin';
  if (c === '~' || c === '\u2248' || c === '\u224b') return 'water';
  if (c === '^' || c === 'R') return 'platform';
  return 'wall';
}

export function castAimRay(p, game, opts = {}) {
  if (!p) return null;
  const map = getMap();
  if (!map || !map.W || !map.H) return null;
  const tile = map.tile || 40;
  const w = weaponDef(p);
  const range = opts.range && opts.range > 0 ? opts.range : (w && w.range ? w.range : 1500);
  const cos = Math.cos(p.angle), sin = Math.sin(p.angle);
  const pitch = Number.isFinite(p.pitch) ? p.pitch : 0;
  const tanP = Math.tan(pitch);
  const eyeH = (0.5 + (p.height || 0)) * tile + groundElevationAt(p.x, p.y);
  const step = 6;
  let bestEnt = null;
  let bestT = range;
  let bestEntPerp = 0;
  for (const o of (game && game.entities) || []) {
    if (o === p || o.dead || o.team === p.team) continue;
    const dx = o.x - p.x;
    const dy = o.y - p.y;
    const along = dx * cos + dy * sin;
    const perp = Math.abs(dx * sin - dy * cos);
    const effRad = (o.rad || 8) + 2;
    if (along < 0 || along > range + effRad || perp >= effRad) continue;
    if (Math.abs(pitch) > 0.02) {
      const targetBase = (o.height || 0) * tile;
      const rayZ = eyeH + along * tanP;
      const targetCenter = targetBase + tile * 1.35;
      if (Math.abs(rayZ - targetCenter) > tile) continue;
    }
    if (along < bestT) {
      bestT = along;
      bestEnt = o;
      bestEntPerp = perp;
    }
  }
  let px = p.x, py = p.y, z = eyeH;
  let hit = null;
  let wallT = range;
  for (let d = 0; d <= range; d += step) {
    px = p.x + cos * d;
    py = p.y + sin * d;
    z = eyeH + d * tanP;
    if (px < 0 || py < 0 || px > map.W || py > map.H) {
      wallT = d;
      hit = { x: px, y: py, z: Math.max(0, z), distance: d, hitKind: 'bounds', tile: tileAt(px, py), solid: false };
      break;
    }
    const c = tileAt(px, py);
    const top = obstacleTopFor(c, tile);
    if ((c === 'C' || c === 'D' || c === '=') && z > top + 0.01) continue;
    if (!passableTolerant(px, py)) {
      wallT = d;
      hit = { x: px, y: py, z: Math.max(0, z), distance: d, hitKind: hitKindFor(c), tile: c, solid: true };
      break;
    }
    if (tanP < -1e-6 && z <= 0) {
      const dFloor = d - z / tanP;
      wallT = dFloor;
      hit = {
        x: p.x + cos * dFloor,
        y: p.y + sin * dFloor,
        z: 0,
        distance: dFloor,
        hitKind: 'floor',
        tile: tileAt(p.x + cos * dFloor, p.y + sin * dFloor),
        solid: false
      };
      break;
    }
  }
  if (!hit) {
    hit = { x: px, y: py, z: Math.max(0, z), distance: range, hitKind: 'range', tile: tileAt(px, py), solid: false };
  }
  if (bestEnt && bestT <= wallT) {
    const hitLen = Math.max(4, bestT - Math.sqrt(Math.max(0, (bestEnt.rad || 8) ** 2 - bestEntPerp ** 2)));
    const hx = p.x + cos * hitLen;
    const hy = p.y + sin * hitLen;
    hit = {
      x: hx,
      y: hy,
      z: eyeH + hitLen * tanP,
      distance: hitLen,
      hitKind: 'entity',
      tile: tileAt(hx, hy),
      solid: true,
      entity: bestEnt
    };
  }
  hit.angle = p.angle;
  hit.pitch = pitch;
  hit.startX = p.x;
  hit.startY = p.y;
  hit.endX = hit.x;
  hit.endY = hit.y;
  return hit;
}

export function castLaserEnd(p, game) {
  const hit = castAimRay(p, game);
  if (!hit) return null;
  return { x: hit.x, y: hit.y, z: hit.z, distance: hit.distance, hitKind: hit.hitKind };
}
