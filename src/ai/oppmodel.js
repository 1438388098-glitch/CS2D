// 对手建模（S3 H11 专用，合法 AI）：统计 CT 防守实际站位 → 预瞄点分布
// 非透视：只记录 H11 队「目击/受击/击杀」事件中的 CT 位置；按图分桶防过拟合

const MAX_REC = 40;
const MAX_AGE = 120; // 秒：只记近期（回合滚动）

export function initOppModel(game) {
  if (!game.oppModel) game.oppModel = { dust2: [], snow: [], depot: [], canal: [], metro: [] };
}

// 记录一次 CT 位置事件（战斗中由 combat/core 调用，仅 H11 队启用）
export function recordOppPos(game, x, y, w) {
  if (!game.oppModel) return;
  const mapId = game.opts.mapId || 'dust2';
  const bucket = game.oppModel[mapId];
  if (!bucket) return;
  bucket.push({ x, y, w: w || 1, t: game.time });
  // 时间衰减清理（保留近期 + 按权重裁剪）
  while (bucket.length > MAX_REC) {
    // 去掉最旧的 25%（时间滚动）
    bucket.sort((a, b) => b.t - a.t);
    bucket.length = Math.floor(bucket.length * 0.75);
  }
}

// 查询预瞄点：近 N 条记录的加权质心（最近权重更高）
export function oppAimPoint(game, nearX, nearY, radius = 600) {
  if (!game.oppModel) return null;
  const mapId = game.opts.mapId || 'dust2';
  const bucket = game.oppModel[mapId];
  if (!bucket || bucket.length < 2) return null;
  const recent = bucket.filter((r) => game.time - r.t < MAX_AGE && Math.hypot(r.x - nearX, r.y - nearY) < radius);
  if (recent.length < 2) return null;
  let wx = 0, wy = 0, wsum = 0;
  for (const r of recent) {
    const ageW = Math.max(0.2, 1 - (game.time - r.t) / MAX_AGE);
    const w = ageW * (r.w || 1);
    wx += r.x * w; wy += r.y * w; wsum += w;
  }
  if (wsum <= 0) return null;
  return { x: wx / wsum, y: wy / wsum };
}
