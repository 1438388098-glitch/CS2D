import { createGame, startMatch, update } from '../src/game.js';
import { projectPitchPoint, pitchScreenHorizon } from '../src/render3d.js';
import { castLaserEnd } from '../src/fps-laser.js';

function ok(name, cond) {
  if (!cond) throw new Error('fps-aim-3d: ' + name + ' FAIL');
  console.log('fps-aim-3d: ' + name + ' PASS');
}

function fresh() {
  const g = createGame({ mapId: 'dust2', bots: 1 });
  startMatch(g);
  g.state = 'LIVE';
  g.freezeT = 0;
  for (const e of g.entities) if (e.bot) e.dead = true;
  g.input.keys = {};
  return g;
}

{
  const g = createGame();
  ok('default pitch accumulators', g._mlookDy === 0 && g._specPitch === null);
  ok('default vertical aim settings', g.fpsSensY === 0.002 && g.invertY === false);
}

{
  const g = fresh();
  g.viewMode = 'fps';
  const p = g.player;
  p.pitch = 0.1;
  const a0 = p.angle;
  g._mlookDx = 40;
  g._mlookDy = -60;
  update(g, 1 / 60);
  ok('mouse yaw still applied', Math.abs((p.angle - a0) - 40 * g.fpsSens) < 1e-9);
  ok('mouse y moves pitch up', Math.abs(p.pitch - (0.1 + 60 * g.fpsSens)) < 1e-9);
  ok('pitch accumulator consumed', g._mlookDy === 0 && g._mlookDx === 0);
}

{
  const g = fresh();
  g.viewMode = 'fps';
  g.invertY = true;
  const p = g.player;
  p.pitch = 0.1;
  g._mlookDy = -40;
  update(g, 1 / 60);
  ok('invert Y flips vertical aim', Math.abs(p.pitch - (0.1 - 40 * g.fpsSensY)) < 1e-9);
}

{
  const g = fresh();
  g.viewMode = 'fps';
  g.fpsSensY = 0.001;
  const p = g.player;
  p.pitch = 0;
  g._mlookDy = -40;
  update(g, 1 / 60);
  ok('vertical sensitivity used', Math.abs(p.pitch - 0.04) < 1e-9);
}

{
  const g = fresh();
  g.viewMode = 'fps';
  const p = g.player;
  p.slot = 'primary';
  p.weapons.primary = 'awp';
  g.input.mouse.rdown = true;
  p.scoped = true;
  const a0 = p.angle;
  g._mlookDx = 40;
  update(g, 1 / 60);
  const expect = 40 * g.fpsSens * 0.35;
  ok('scoped sensitivity reduced', Math.abs((p.angle - a0) - expect) < 1e-9);
}

{
  const g = fresh();
  g.viewMode = 'fps';
  const p = g.player;
  g._mlookDy = -1e9;
  update(g, 1 / 60);
  ok('pitch clamps high', Number.isFinite(p.pitch) && p.pitch > 0 && p.pitch < 1.5);
  g._mlookDy = 1e9;
  update(g, 1 / 60);
  ok('pitch clamps low', Number.isFinite(p.pitch) && p.pitch < 0 && p.pitch > -1.5);
}

{
  const g = fresh();
  g.viewMode = 'fps';
  g.player.dead = true;
  g._mlookDy = -40;
  update(g, 1 / 60);
  ok('spectate pitch initialized', typeof g._specPitch === 'number' && g._specPitch > 0);
  ok('spectate yaw initialized', typeof g._specAngle === 'number');
}

{
  const centerY = 360;
  const focal = 512;
  const p0 = projectPitchPoint(0, 0, 0, 0, focal, 16, 0, centerY, 100, 0, 16);
  const pUp = projectPitchPoint(0, 0, 0, 0.4, focal, 16, 0, centerY, 100, 0, 16);
  ok('pitch projection exports', p0 && pUp && p0.sy === centerY && pUp.sy > centerY);
  ok('pitch horizon moves down', pitchScreenHorizon(centerY, focal, 0.4) > centerY);
  const floorFlat = projectPitchPoint(0, 0, 0, 0, focal, 16, 0, centerY, 100, 0, 0);
  const floorUp = projectPitchPoint(0, 0, 0, 0.4, focal, 16, 0, centerY, 100, 0, 0);
  ok('floor drops when looking up', floorFlat.sy < floorUp.sy);
}

{
  const g = fresh();
  const p = g.player;
  p.pitch = 0;
  const flat = castLaserEnd(p, g);
  ok('laser flat endpoint has z', flat !== null && Number.isFinite(flat.z));
  p.pitch = -0.45;
  const down = castLaserEnd(p, g);
  ok('laser down ends on floor', down !== null && down.z === 0);
  p.pitch = 0.35;
  const up = castLaserEnd(p, g);
  ok('laser up endpoint above floor', up !== null && up.z > 0);
}

console.log('fps-aim-3d: all PASS');
