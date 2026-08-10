function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function clampScore(v) {
  return Math.max(0, Math.min(100, v));
}

export function computePerformanceScore(stats) {
  const kills = toNum(stats && stats.kills);
  const deaths = toNum(stats && stats.deaths);
  const assists = toNum(stats && stats.assists);
  const plants = toNum(stats && stats.plants);
  const defuses = toNum(stats && stats.defuses);
  const damage = toNum(stats && stats.damage);

  const killScore = Math.min(45, kills * 9);
  const kd = deaths > 0 ? kills / deaths : kills;
  const survivalScore = Math.min(20, kd * 6);
  const assistScore = Math.min(10, assists * 3);
  const plantScore = Math.min(10, plants * 8);
  const defuseScore = Math.min(12, defuses * 12);
  const dmgScore = Math.min(15, damage / 80);

  const total = killScore + survivalScore + assistScore + plantScore + defuseScore + dmgScore;
  return Math.round(clampScore(total));
}

export function computeMvp(players) {
  if (!Array.isArray(players) || players.length === 0) return null;
  let best = null;
  let bestScore = -1;
  for (const player of players) {
    const score = computePerformanceScore(player);
    const kills = toNum(player && player.kills);
    if (!best || score > bestScore || (score === bestScore && kills > toNum(best.kills))) {
      best = player;
      bestScore = score;
    }
  }
  return { player: best, score: bestScore };
}
