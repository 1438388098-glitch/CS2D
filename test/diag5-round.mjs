// 怀疑点6+7：跨回合字段残留
// A) netAct/netAt 跨回合残留（spawnEntity 未清）→ 新回合开局沿用上回合网络决策
// B) game.ctPush 跨回合残留 → 新回合 roamer 无 IGL 授权前压
// C) lastShot/lastHearT 跨回合 → 新回合"听到"上回合枪声（开局误报枪声+错误 lastKnown）
import { mkGame, place, step, alive, botOf, forcedNet } from './diag-lib.mjs';
import { botObjective } from '../src/ai/decisions.js';
import { getMap } from '../src/map.js';

const m = getMap();

console.log('=== A) netAct 跨回合残留 ===');
{
  const game = mkGame({ diff: 'normal' });
  const t = botOf(game, 't');
  // 模拟 DQN 决策：回合结束时刻缓存 netAct='save'（用合法权重，rotate 恒胜）
  t.aiParams = { netWeights: forcedNet(2) };
  t.netAct = 'save';
  t.netAt = game.time; // 上一回合末
  // 推进到下一回合
  game.roundTime = 110;
  step(game, 60); // 2s → 回合结束（timeout）→ 下一回合 spawnRound
  console.log(`spawnRound 后: netAct=${t.netAct} netAt=${t.netAt} game.time=${game.time.toFixed(2)}`);
  console.log(`netAct 是否被重置: ${t.netAct === undefined || t.netAct === null ? '是' : '否（残留 ' + t.netAct + '）'}`);
  // 新回合开局 netAct() 应返回缓存旧值
  step(game, 1);
  const { netAct } = await import('../src/ai/decisions.js');
  const na = netAct(t, game);
  console.log(`新回合开局 netAct() 返回: ${na} (残留值=${t.netAct}) → 回合间间隔=${(game.time - t.netAt).toFixed(1)}s, 缓存窗口=0.6s → ${game.time - t.netAt < 0.6 ? '在缓存窗口内（沿用旧决策）' : '已过期（自愈）'}`);
}

console.log('\n=== B) game.ctPush 跨回合残留 ===');
{
  const game = mkGame({ diff: 'normal' });
  game.ctPush = true;
  game.ctPushAt = game.roundTime - 1;
  step(game, 120); // 4s → 不触发 IGL 重评估（需 roundTime>30）
  const roamer = game.entities.find((e) => e.bot && e.team === 'ct' && e.ctRoamer && !e.dead);
  if (roamer) {
    const obj = botObjective(roamer, game);
    const sp = m.spawns.t[0];
    const pushish = obj && Math.hypot(obj.x - sp.x, obj.y - sp.y) < 500;
    console.log(`新回合 ${game.roundTime.toFixed(1)}s: ctPush=${game.ctPush} (spawnRound 未清) roamer目标=(${obj ? Math.round(obj.x) : '?'},${obj ? Math.round(obj.y) : '?'}) 指向T出生点=${pushish}`);
    console.log(`ctPush 是否被回合重置: ${game.ctPush === undefined || game.ctPush === false && game.roundTime > 0 ? '被重置' : '残留=true → roamer 开局无授权前压'}`);
  }
}

console.log('\n=== C) lastShot/lastHearT 跨回合 → 开局误听上回合枪声 ===');
{
  const game = mkGame({ diff: 'normal' });
  const ct = botOf(game, 'ct');
  const tShooter = botOf(game, 't', 1);
  // 上一回合：tShooter 开过枪（lastShot 持久），回合结束
  tShooter.lastShot = game.time * 1000 - 100; // 100ms 前（上回合末）
  place(tShooter, ct.x + 400, ct.y); // 听力半径 1000 内
  step(game, 60); // 2s → 回合结束 → 新回合
  const t2 = game.entities.find((o) => o === tShooter); // 可能换边? 不，swap 只在第9回合
  const before = ct.lastKnown ? { x: Math.round(ct.lastKnown.x), y: Math.round(ct.lastKnown.y) } : null;
  const shotBefore = game.time;
  step(game, 2); // 新回合开局 2 帧
  const heard = ct.lastHearT && ct.lastHearT[t2.name];
  const after = ct.lastKnown ? { x: Math.round(ct.lastKnown.x), y: Math.round(ct.lastKnown.y) } : null;
  console.log(`新回合开局: tShooter.lastShot=${(tShooter.lastShot).toFixed(0)}ms (game.time*1000=${(game.time * 1000).toFixed(0)} 上回合遗留) CT lastKnown=${before ? JSON.stringify(before) : 'null'} → ${after ? JSON.stringify(after) : 'null'} lastHearT[shooter]=${heard ? heard.toFixed(0) : '无'}`);
  console.log(`误听判定: ${after && before === null ? '开局即把上回合枪声当新鲜情报（lastKnown 被写）' : after && before ? '上回合已有 lastKnown' : '未发生'}`);
}
