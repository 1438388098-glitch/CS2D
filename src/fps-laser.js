// Pure FPS laser ray helper: casts along yaw and pitch so the red laser
// stays aligned with the crosshair in 3D view instead of always lying flat.
import { getMap, passableTolerant, groundElevationAt } from './map.js';
import { weaponDef } from './entities.js';

export function castLaserEnd(p, game) {
  if (!p) return null;
  const map = getMap();
  if (!map || !map.W || !map.H) return null;
  const tile = map.tile || 40;
  const w = weaponDef(p);
  const range = w && w.range ? w.range : 1500;
  const cos = Math.cos(p.angle), sin = Math.sin(p.angle);
  const pitch = Number.isFinite(p.pitch) ? p.pitch : 0;
  const tanP = Math.tan(pitch);
  const eyeH = (0.5 + (p.height || 0)) * tile + groundElevationAt(p.x, p.y);
  const step = 6;
  let px = p.x, py = p.y, z = eyeH;
  for (let d = 0; d <= range; d += step) {
    px = p.x + cos * d;
    py = p.y + sin * d;
    z = eyeH + d * tanP;
    if (px < 0 || py < 0 || px > map.W || py > map.H) {
      return { x: px, y: py, z: Math.max(0, z) };
    }
    if (!passableTolerant(px, py)) {
      return { x: px, y: py, z: Math.max(0, z) };
    }
    if (tanP < -1e-6 && z <= 0) {
      const dFloor = d - z / tanP;
      return {
        x: p.x + cos * dFloor,
        y: p.y + sin * dFloor,
        z: 0
      };
    }
  }
  return { x: px, y: py, z: Math.max(0, z) };
}
