import { fpsInteractAction } from '../src/hud.js';
import { loadMap } from '../src/map.js';
import { MAPS } from '../src/config.js';

function ok(name, cond) {
  if (!cond) throw new Error('fps-interact: ' + name + ' FAIL');
  console.log('fps-interact: ' + name + ' PASS');
}

loadMap(MAPS.find((m) => m.id === 'dust2'));

function player(overrides = {}) {
  return {
    x: 100, y: 100, dead: false, team: 't', hasBomb: false, angle: 0,
    weapons: { primary: null, secondary: 'glock', nades: {} }, pitch: 0,
    ...overrides
  };
}

function game(overrides = {}) {
  return {
    viewMode: 'fps', state: 'LIVE', player: player(), drops: [], bomb: null,
    tAttackSite: 'A', ...overrides
  };
}

{
  const g = game({ bomb: { x: 100, y: 100, dropped: true, planted: false } });
  const act = fpsInteractAction(g);
  ok('dropped C4 pickup', act && act.action === 'interact' && act.label.indexOf('C4') >= 0);
}

{
  const g = game({
    player: player({ team: 'ct' }),
    bomb: { x: 100, y: 100, dropped: false, planted: true }
  });
  const act = fpsInteractAction(g);
  ok('planted C4 defuse', act && act.action === 'interact' && act.label.indexOf('拆除') >= 0);
}

{
  const g = game({ player: player({ hasBomb: true, x: 1544, y: 320 }) });
  const act = fpsInteractAction(g);
  ok('plant prompt in site', act && act.label.indexOf('安放') >= 0);
}

{
  const g = game({ drops: [{ x: 100, y: 100, wid: 'ak47' }] });
  const act = fpsInteractAction(g);
  ok('weapon pickup prompt', act && act.label.indexOf('拾取') >= 0);
}

{
  const g = game({ player: player({ x: 500, y: 500, hasBomb: true }), bomb: { x: 100, y: 100, dropped: true, planted: false } });
  ok('far interaction is null', fpsInteractAction(g) === null);
}

console.log('fps-interact: all PASS');
