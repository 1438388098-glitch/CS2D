import { recoilControlInfo } from '../src/hud.js';

function ok(name, cond) {
  if (!cond) throw new Error('recoil-hud: ' + name + ' FAIL');
  console.log('recoil-hud: ' + name + ' PASS');
}

{
  const hidden = recoilControlInfo({ recoil: 1.5 }, { kind: 'knife' });
  ok('knife hides recoil meter', hidden.visible === false);
}

{
  const zero = recoilControlInfo({ recoil: 0, recoverMult: 1 }, { kind: 'rifle' });
  ok('zero recoil ratio is 0', zero.visible === true && zero.ratio === 0);
  ok('zero recoil not hot', zero.hot === false);
}

{
  const hot = recoilControlInfo({ recoil: 1.2 }, { kind: 'rifle' });
  ok('recoil ratio maps to 0.5', Math.abs(hot.ratio - 0.5) < 1e-9);
  ok('high recoil marks hot state', hot.hot === true);
}

console.log('recoil-hud: all PASS');
