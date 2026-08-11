import assert from 'node:assert/strict';
import { smoothRenderEntities, viewAngle, viewX, viewY } from '../src/render-smooth.js';

{
  const e = {
    bot: true,
    x: 0,
    y: 150,
    vx: 100,
    vy: 0,
    angle: Math.PI / 2,
    _rx: 100,
    _ry: 100,
    _ra: 0
  };
  smoothRenderEntities({ entities: [e] }, 1 / 60);

  const dx = Math.abs(viewX(e) - 100);
  const dy = Math.abs(viewY(e) - 100);
  const da = Math.abs(viewAngle(e));
  assert.ok(dx > 0 && dx < 100, 'display x should ease toward the actual position');
  assert.ok(dy > 0 && dy < 100, 'display y should ease toward the actual position');
  assert.ok(da > 0 && da < Math.PI / 2, 'display angle should turn gradually, not snap');
}

{
  const e = { bot: true, x: 100, y: 100, angle: 0 };
  smoothRenderEntities({ entities: [e] }, 1 / 60);
  assert.equal(viewX(e), 100, 'uninitialized render state should start at the actual position');
  assert.equal(viewY(e), 100, 'uninitialized render state should start at the actual position');
  assert.equal(viewAngle(e), 0, 'uninitialized render state should start at the actual angle');
}

{
  const p = { bot: false, x: 100, y: 100, angle: 0 };
  p.x = 0;
  smoothRenderEntities({ entities: [p] }, 1 / 60);
  assert.equal(viewX(p), 0, 'players should keep their exact position so aim input is not lagged');
}

{
  const e = {
    bot: true,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    _rx: 40,
    _ry: 0,
    _ra: 0
  };
  smoothRenderEntities({ entities: [e] }, 1 / 60);
  const moved = Math.hypot(viewX(e) - 40, viewY(e));
  assert.ok(moved <= 0.5, 'stopped bot display should not keep sliding at high speed');

  for (let i = 0; i < 30; i++) smoothRenderEntities({ entities: [e] }, 1 / 60);
  const movedLater = Math.hypot(viewX(e) - 40, viewY(e));
  assert.ok(movedLater <= 0.001, 'stopped bot display must stay still after the logic stops');
}

console.log('ai-smooth-render: all PASS');
