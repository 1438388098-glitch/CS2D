import { createGame, startMatch, update } from '../src/game.js';
import { fpsSpectateInfo } from '../src/hud.js';

function ok(name, cond) {
  if (!cond) throw new Error('fps-spectate: ' + name + ' FAIL');
  console.log('fps-spectate: ' + name + ' PASS');
}

{
  const g = createGame({ mapId: 'dust2', bots: 3, team: 'ct' });
  startMatch(g);
  g.state = 'LIVE';
  g.freezeT = 0;
  g.viewMode = 'fps';
  g.player.dead = true;
  g.player.hp = 0;
  g.spectateIdx = 0;
  const info = fpsSpectateInfo(g);
  ok('spectate info target', !!info && info.name.length > 0 && info.hp >= 0);
  ok('spectate info weapon', !!info && typeof info.weapon === 'string' && info.ammo >= 0);
}

{
  const g = createGame({ mapId: 'dust2', bots: 3, team: 'ct' });
  startMatch(g);
  g.state = 'LIVE';
  g.freezeT = 0;
  g.viewMode = 'fps';
  g.player.dead = true;
  g.player.hp = 0;
  g._specManual = null;
  g._specAngle = 0;
  g._specPitch = 0;
  g._mlookDx = 24;
  g._mlookDy = 0;
  update(g, 1 / 60);
  ok('spectate mouse marks manual camera', typeof g._specManual === 'number');
}

console.log('fps-spectate: all PASS');
