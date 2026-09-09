import { installStubs } from './stubdom.js';
installStubs();

import { createGame, startMatch } from '../src/game.js';
import { castAimRay } from '../src/fps-laser.js';
import { smoothRemote } from '../src/lan.js';

function ok(name, cond) {
  if (!cond) throw new Error('laser-lan-smooth: ' + name + ' FAIL');
  console.log('laser-lan-smooth: ' + name + ' PASS');
}

// —— castAimRay：命中/裁剪/空值防护 ——
{
  const g = createGame({ mapId: 'dust2', bots: 1 });
  startMatch(g);
  g.state = 'LIVE';
  g.freezeT = 0;
  const p = g.player;

  ok('null player guarded', castAimRay(null, g) === null);

  // 开阔地朝正东：终点应在射程或墙前，且在起点东侧
  p.x = 600; p.y = 600; p.angle = 0; p.pitch = 0; p.height = 0;
  const hit = castAimRay(p, g, { range: 400 });
  ok('aim ray returns endpoint', !!hit && Number.isFinite(hit.x) && Number.isFinite(hit.y));
  ok('aim ray respects range clip', hit.x >= p.x - 1 && hit.x <= p.x + 400 + 40);

  // 极小射程：终点紧贴起点
  const near = castAimRay(p, g, { range: 1 });
  ok('tiny range stays near shooter', Math.hypot(near.x - p.x, near.y - p.y) < 40);
}

// —— smoothRemote：插值收敛 + 观战端死亡保持 ——
{
  const g = {
    mode: 'lan',
    lan: { spectating: true },
    player: { dead: false },
    entities: []
  };
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - 33; // 已过一个快照周期 → t=1
  g.entities.push({
    netRole: 'remote', _netPx: 100, _netPy: 200, _netTx: 133, _netTy: 222, _netT0: t0,
    x: 100, y: 200
  });
  smoothRemote(g, 1 / 60);
  const e = g.entities[0];
  ok('remote interpolates to target', Math.abs(e.x - 133) < 0.01 && Math.abs(e.y - 222) < 0.01);
  ok('spectator player kept dead', g.player.dead === true);

  // 非观战/无 remote 时安全 no-op
  ok('null game guarded', smoothRemote(null, 1 / 60) === undefined);
}

console.log('laser-lan-smooth: all PASS');
