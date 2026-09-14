import assert from 'node:assert/strict';
import { objectiveText } from '../src/game.js';

// 目标提示各分支文案与优先级（纯逻辑，直接构造最小 game 形状）
function g(opts = {}) {
  return { player: null, bomb: null, ...opts };
}

// 无玩家（回合重载瞬间）
assert.deepEqual(objectiveText(g()), { main: '', sub: '' }, 'no player should yield empty text');

// 死亡观战优先级最高（压过已下包）
{
  // 死亡观战优先级最高（压过已下包）；round-10 sub 改为按键提示
  const ot = objectiveText(g({ player: { dead: true, team: 'ct' }, bomb: { planted: true, site: 'A' } }));
  assert.equal(ot.main, '观战中…', 'dead player overrides everything');
  assert.ok(typeof ot.sub === 'string' && ot.sub.length > 0, 'dead player has hint sub');
}

// CT：已下包 → 拆弹（A/B 区文案），未下包 → 守卫
assert.equal(objectiveText(g({ player: { dead: false, team: 'ct' }, bomb: { planted: true, site: 'A' } })).main, '拆除炸弹！');
assert.equal(objectiveText(g({ player: { dead: false, team: 'ct' }, bomb: { planted: true, site: 'B' } })).sub.indexOf('B 区') > -1, true, 'B site should appear in sub');
assert.equal(objectiveText(g({ player: { dead: false, team: 'ct' } })).main, '守卫目标点');

// T：持弹 > 掉弹 > 已下包掩护 > 默认进攻（优先级逐级回退）
assert.equal(objectiveText(g({ player: { dead: false, team: 't', hasBomb: true }, bomb: { dropped: true } })).main, '前往目标点安装炸弹');
assert.equal(objectiveText(g({ player: { dead: false, team: 't' }, bomb: { dropped: true, planted: true } })).main, '炸弹掉落了', 'dropped should outrank planted');
assert.equal(objectiveText(g({ player: { dead: false, team: 't' }, bomb: { planted: true } })).main, '掩护炸弹');
assert.equal(objectiveText(g({ player: { dead: false, team: 't' } })).main, '进攻目标点');

console.log('game-objective-text: all PASS');
