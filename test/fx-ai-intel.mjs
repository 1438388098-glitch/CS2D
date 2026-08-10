// 警报覆盖目标缓存（candidate-151）：shouldRefreshObjective / alertConf 纯函数契约
// 背景：botObjective 3s TTL；lastKnown/lastHear 被新强警报覆盖后未及时失效 → CT 转点响应慢。
// 机制：新警报置信度高于旧目标时立即覆盖 lastKnown/lastHear，而非等 TTL 到期。
// 纯函数、确定性：不读 Date/performance，结果仅由入参决定。
import { alertConf, shouldRefreshObjective } from '../src/ai/shared.js';

function ok(name, cond) {
  if (!cond) throw new Error('fx-ai-intel: ' + name + ' FAIL');
  console.log('fx-ai-intel: ' + name + ' PASS');
}

// ---- alertConf：类型 → 置信度 ----
ok('sight conf 1', alertConf({ type: 'sight' }) === 1);
ok('focus conf 1', alertConf({ type: 'focus' }) === 1);
ok('shot conf 0.55', alertConf({ type: 'shot' }) === 0.55);
ok('call conf 0.5', alertConf({ type: 'call' }) === 0.5);
ok('dmg conf 0.5', alertConf({ type: 'dmg' }) === 0.5);
ok('step conf 0.45', alertConf({ type: 'step' }) === 0.45);
ok('kill conf 0.7', alertConf({ type: 'kill' }) === 0.7);
ok('generic default 0.5', alertConf({}) === 0.5);
ok('explicit conf wins', alertConf({ type: 'shot', conf: 0.35 }) === 0.35);
ok('muffled gunshot explicit', alertConf({ conf: 0.35 }) === 0.35);
ok('null conf 0', alertConf(null) === 0);
ok('conf precedence over type', alertConf({ type: 'sight', conf: 0.55 }) === 0.55);

// ---- shouldRefreshObjective：基础规则 ----
ok('no alert → no refresh', shouldRefreshObjective({ x: 0, y: 0 }, null, 10) === false);
ok('no old target → write', shouldRefreshObjective(null, { x: 1, y: 1, conf: 0.5, t: 10 }, 10) === true);
ok('no old + no alert → false', shouldRefreshObjective(null, null, 10) === false);

// 高置信新警报 → 立即覆盖（不等 TTL）
ok('shot beats generic old', shouldRefreshObjective({ x: 0, y: 0, t: 10 }, { x: 500, y: 0, t: 10, type: 'shot' }, 10) === true);
ok('sight beats shot old', shouldRefreshObjective({ x: 0, y: 0, conf: 0.55, t: 9 }, { x: 200, y: 0, t: 10, type: 'sight' }, 10) === true);
ok('shot beats older call old', shouldRefreshObjective({ x: 0, y: 0, conf: 0.5, t: 8 }, { x: 300, y: 0, t: 10, type: 'shot' }, 10) === true);

// 低置信新警报 → 不冲掉强目标
ok('step does not beat shot', shouldRefreshObjective({ x: 0, y: 0, conf: 0.55, t: 9.5 }, { x: 100, y: 0, t: 10, type: 'step' }, 10) === false);
ok('muffled shot does not beat sight', shouldRefreshObjective({ x: 0, y: 0, conf: 1, t: 9 }, { x: 100, y: 0, t: 10, type: 'shot' }, 10) === false);
ok('walk step does not beat run step', shouldRefreshObjective({ x: 0, y: 0, conf: 0.48, t: 9 }, { x: 100, y: 0, t: 10, conf: 0.32 }, 10) === false);

// 同置信度：更新情报覆盖旧情报（转向新威胁）
ok('equal conf fresher overrides', shouldRefreshObjective({ x: 0, y: 0, conf: 0.55, t: 9 }, { x: 400, y: 0, conf: 0.55, t: 10 }, 10) === true);
ok('equal conf same age keeps old', shouldRefreshObjective({ x: 0, y: 0, conf: 0.55, t: 10 }, { x: 400, y: 0, conf: 0.55, t: 10 }, 10) === false);
ok('equal conf older new alert no', shouldRefreshObjective({ x: 0, y: 0, conf: 0.55, t: 9.5 }, { x: 400, y: 0, conf: 0.55, t: 8 }, 10) === false);

// 旧目标超 TTL（4s）→ 任何新警报接管
ok('expired old any alert takes over', shouldRefreshObjective({ x: 0, y: 0, conf: 0.9, t: 5.5 }, { x: 10, y: 10, conf: 0.35, t: 10 }, 10) === true);
ok('not expired weak alert no', shouldRefreshObjective({ x: 0, y: 0, conf: 0.55, t: 8 }, { x: 10, y: 10, conf: 0.35, t: 10 }, 10) === false);

// lastKnown 形态（lastKnownT 计龄）
ok('lastKnown older refreshed', shouldRefreshObjective({ x: 0, y: 0, conf: 0.55, lastKnownT: 2 }, { x: 400, y: 0, t: 10, conf: 0.55 }, 10) === true);
ok('lastKnown same freshness kept', shouldRefreshObjective({ x: 0, y: 0, conf: 0.55, lastKnownT: 0.5 }, { x: 400, y: 0, t: 9.5, conf: 0.55 }, 10) === false);

// 确定性：同入参同结果
{
  const a = { x: 0, y: 0, conf: 0.55, t: 9 };
  const b = { x: 400, y: 0, conf: 0.55, t: 10 };
  ok('deterministic', shouldRefreshObjective(a, b, 10) === shouldRefreshObjective(a, b, 10));
  ok('input not mutated', a.t === 9 && a.x === 0 && b.conf === 0.55);
}

console.log('fx-ai-intel: all PASS');
