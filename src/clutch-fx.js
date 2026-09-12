// 残局指示（candidate-508，纯函数供测试断言）：玩家存活且为队内最后一人、
// 敌方不少于 2 人存活 → 返回 "1vN" 残局描述；否则 null。
export function clutchInfo(game) {
  const p = game && game.player;
  if (!p || p.dead || !p.team) return null;
  let mates = 0; // 含自己在内的我方存活数
  let enemies = 0;
  for (const e of game.entities || []) {
    if (e.dead) continue;
    if (e.team === p.team) mates++;
    else enemies++;
  }
  if (mates !== 1 || enemies < 2) return null;
  return { vs: enemies, label: '残局 1v' + enemies };
}
