// AI 教练复盘（candidate-573）：死亡归因 + 纯规则改进建议，无 ML 依赖。
// deathLog 由 combat.js 在玩家阵亡时写入；stats 由 game.stats 聚合。
// career-ui 的"教练组诊断"只管战队财务轮换——玩家本人的枪法走位复盘此前完全空白。

// 玩家阵亡时记录一条归因（combat.js killEntity 调用）
export function recordDeathForCoach(game, killer, victim) {
  if (!game || !killer || killer === victim) return;
  const toKiller = Math.atan2(killer.y - victim.y, killer.x - victim.x);
  // 背身判定：击杀者位于玩家面朝方向的反向 110° 扇区外
  const facing = Math.cos(toKiller - (victim.angle || 0));
  game.deathLog = game.deathLog || [];
  game.deathLog.push({ behind: facing < -0.34, dist: Math.round(Math.hypot(killer.x - victim.x, killer.y - victim.y) / 50) * 50 });
  if (game.deathLog.length > 40) game.deathLog.shift();
}

// finishMatch 后生成 1-3 条中文建议（纯函数，可单测）
export function buildCoachLines(game) {
  const out = [];
  if (!game || !game.player) return out;
  const deaths = game.player.deaths || 0;
  const log = game.deathLog || [];
  const behind = log.filter((d) => d.behind).length;
  if (deaths >= 3 && behind >= 2 && behind / Math.max(1, log.length) >= 0.4) {
    out.push('你有一半以上死亡来自背身（' + behind + ' 次）——每隔 3 秒扫一眼小地图，转角前先清点。');
  }
  const avgDist = log.length ? Math.round(log.reduce((a, d) => a + d.dist, 0) / log.length) : 0;
  if (deaths >= 4 && avgDist >= 450) {
    out.push('平均交火距离 ' + avgDist + 'px 偏远——用掩体逼近后再对枪，别在开阔地消耗。');
  }
  const stats = game.stats || {};
  const acc = stats.shots > 60 ? stats.hits / stats.shots : 0;
  if (acc > 0 && acc < 0.2) {
    out.push('命中率仅 ' + Math.round(acc * 100) + '%——泼水太多，练习 3 连发短点射，打完回掩体。');
  }
  if (deaths >= 6 && (game.player.kills || 0) < deaths / 2) {
    out.push('本局换枪比 1:' + Math.max(1, Math.round(deaths / Math.max(1, game.player.kills || 1))) + '——别单走，跟队友一起推进换血。');
  }
  return out.slice(0, 3);
}
