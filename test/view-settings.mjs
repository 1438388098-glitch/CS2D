import { createGame, startMatch } from '../src/game.js';

function ok(name, cond) {
  if (!cond) throw new Error('view-settings: ' + name + ' FAIL');
  console.log('view-settings: ' + name + ' PASS');
}

{
  const g = createGame({ mapId: 'dust2', bots: 1 });
  startMatch(g);
  ok('default render quality', g.renderQuality === 1);
  ok('default dpr limit', g.dprLimit === 2);
}

{
  const g = createGame({ mapId: 'dust2', bots: 1 });
  g.viewMode = 'fps';
  g.fpsSens = 0.003;
  g.fpsSensY = 0.0025;
  g.invertY = true;
  g.fov = 1.4;
  g.renderQuality = 0.7;
  g.dprLimit = 1.25;
  g.dpr = 1;
  startMatch(g);
  ok('startMatch preserves view settings', g.viewMode === 'fps' && g.fpsSens === 0.003 && g.fpsSensY === 0.0025 && g.invertY === true && Math.abs(g.fov - 1.4) < 1e-9 && g.renderQuality === 0.7 && g.dprLimit === 1.25 && g.dpr === 1);
}

console.log('view-settings: all PASS');
