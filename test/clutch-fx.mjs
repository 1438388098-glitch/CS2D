// 残局指示（Round 11）契约测试：clutchInfo 纯函数。
// 契约：玩家存活、我方仅剩自己、敌方 ≥2 → { vs:N, label:'残局 1vN' }；
//       任一条件不满足 → null；敌方恰 1 人（1v1）不显示。
import assert from 'node:assert/strict';
import { clutchInfo } from '../src/clutch-fx.js';

function mkGame(player, entities) {
  return { player, entities };
}
const P = { dead: false, team: 'ct' };

{
  const g = mkGame(P, [P, { team: 't', dead: false }, { team: 't', dead: false }]);
  const c = clutchInfo(g);
  assert.ok(c && c.vs === 2 && c.label === '残局 1v2', '1v2 detected');
}
{
  const g = mkGame(P, [P, { team: 'ct', dead: false }, { team: 't', dead: false }, { team: 't', dead: false }]);
  assert.equal(clutchInfo(g), null, 'teammates alive -> not clutch');
}
{
  const g = mkGame(P, [P, { team: 't', dead: false }]);
  assert.equal(clutchInfo(g), null, '1v1 not flagged');
}
{
  const g = mkGame({ ...P, dead: true }, [P, { team: 't', dead: false }, { team: 't', dead: false }]);
  assert.equal(clutchInfo(g), null, 'dead player not clutch');
}
{
  const g = mkGame(P, [P, { team: 't', dead: true }, { team: 't', dead: false }]);
  assert.equal(clutchInfo(g), null, 'dead enemies not counted -> 1v1 is null');
  assert.equal(clutchInfo(null), null, 'null game safe');
}

console.log('clutch-fx: all PASS');
