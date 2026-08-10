import { shouldFakeDefuse } from '../src/ai/actions.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

// 基础：时间足够 + 有 T 威胁 → 可假拆
ok('enough time + T alive allows fake', shouldFakeDefuse({ bombT: 12, defuseSpeed: 5, hasAliveT: true, riskT: 0.65, teamwork: 0.65, allyCover: 0 }) === true);

// 拆弹时间不足 → 不做（避免假拆导致来不及真拆）
ok('tight bomb time forbids fake', shouldFakeDefuse({ bombT: 6, defuseSpeed: 5, hasAliveT: true, riskT: 0.65 }) === false);

// 无 T 存活 → 无诱导对象，不做
ok('no alive T forbids fake', shouldFakeDefuse({ bombT: 12, defuseSpeed: 5, hasAliveT: false, riskT: 0.65 }) === false);

// 已处于拆弹中（defuseT>0）→ 不重新假拆
ok('already defusing forbids fake', shouldFakeDefuse({ defuseT: 1.2, bombT: 12, defuseSpeed: 5, hasAliveT: true, riskT: 0.65 }) === false);

// 已有瞄准目标 → 优先战斗，不假拆
ok('has aim target forbids fake', shouldFakeDefuse({ aimTarget: {}, bombT: 12, defuseSpeed: 5, hasAliveT: true, riskT: 0.65 }) === false);

// 谨慎型（riskT 低）无队友 → fakeChance 可能低于阈值，可抑制
ok('cautious bot may not fake alone', shouldFakeDefuse({ bombT: 12, defuseSpeed: 5, hasAliveT: true, riskT: 0.1, allyCover: 0 }) === false);

// 有队友架枪 → 更愿意假拆（即使谨慎型也倾向）
ok('ally cover encourages cautious fake', shouldFakeDefuse({ bombT: 12, defuseSpeed: 5, hasAliveT: true, riskT: 0.1, allyCover: 1 }) === true);

console.log('ai-fake-defuse: all PASS');
process.exit(failed ? 1 : 0);
