// 对手建模（S3 H11 专用，合法 AI）：统计 CT 防守实际站位 → 预瞄点分布
// 非透视：只记录 H11 队「目击/受击/击杀」事件中的 CT 位置；按图分桶防过拟合

const MAX_REC = 40;
const MAX_AGE = 120; // 秒：只记近期（回合滚动）
const CLUSTER_R = 200; // 聚类半径（px）：热点合并阈值

// 事件类型权重（事件越「精确」，站位置信越高）：
// 击杀=尸体精确位置 → 1.5；目击=直接看到 → 1.2；受击=大致方向 → 1.0；枪声/模糊 → 0.7
const EVENT_W = { kill: 1.5, sight: 1.2, dmg: 1.0, shot: 0.7 };

const OM_KEY = 'cs2d_oppmodel_v1';

function omStore() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch (e) { return null; }
}

export function initOppModel(game) {
  if (!game.oppModel) game.oppModel = {};
  // 持久对手记忆（candidate-521）：高难度下载入该图的历史站位热点，bot 开局即预判你的习惯位
  if (!game.opts || game.opts.diff !== 'hell') return;
  const st = omStore();
  if (!st) return;
  try {
    const raw = JSON.parse(st.getItem(OM_KEY) || '{}');
    const recs = raw[game.opts.mapId || 'dust2'];
    if (Array.isArray(recs) && recs.length) {
      // 存档年龄转负时间戳：recWeight 的 now - r.t 直接给出"陈旧度"，热区随对局推进自然衰减
      const base = game.time || 0;
      game.oppModel[game.opts.mapId || 'dust2'] = recs.slice(-12).map((r) => ({ ...r, t: base - (r.age || 30) }));
    }
  } catch (e) { /* 坏档忽略 */ }
}

// finishMatch 调用：把本局的 CT 站位热点写盘（仅 hell 且有数据时）
export function saveOppModel(game) {
  if (!game || !game.oppModel || !game.opts || game.opts.diff !== 'hell') return;
  const st = omStore();
  if (!st) return;
  const mapId = game.opts.mapId || 'dust2';
  const recs = game.oppModel[mapId];
  if (!Array.isArray(recs) || !recs.length) return;
  try {
    const raw = (() => { try { return JSON.parse(st.getItem(OM_KEY) || '{}'); } catch (e) { return {}; } })();
    const base = game.time || 0;
    raw[mapId] = recs.slice(-12).map((r) => ({ x: Math.round(r.x), y: Math.round(r.y), eventType: r.eventType, w: r.w || 1, weaponTier: r.weaponTier || 1, age: Math.round(Math.max(0, Math.min(90, base - r.t))) }));
    st.setItem(OM_KEY, JSON.stringify(raw));
  } catch (e) { /* 配额满忽略 */ }
}

function bucketFor(game) {
  if (!game.oppModel) return null;
  const mapId = game.opts.mapId || 'dust2';
  // 惰性建桶（candidate-555）：此前只预建 3 张旧图，其余竞技图对手建模静默失效
  return game.oppModel[mapId] || (game.oppModel[mapId] = []);
}

// 单条记录可信权重 = 年龄 × 记录权重 × 事件精确度 × 武器威胁度（高威胁武器站位更有价值）
function recWeight(r, now) {
  const ageW = Math.max(0.2, 1 - (now - r.t) / MAX_AGE);
  const evW = EVENT_W[r.eventType] || 1;
  const tierW = 0.75 + ((r.weaponTier || 1) - 1) * 0.25;
  return ageW * (r.w || 1) * evW * tierW;
}

// 记录一次 CT 位置事件（战斗中由 combat/core 调用，仅 H11 队启用）
// opts（可选，向后兼容）：{ role, weaponTier, eventType }
export function recordOppPos(game, x, y, w, opts) {
  const bucket = bucketFor(game);
  if (!bucket) return;
  bucket.push({
    x, y,
    w: w || 1,
    t: game.time,
    role: opts && opts.role,
    weaponTier: opts && opts.weaponTier,
    eventType: opts && opts.eventType
  });
  // 时间衰减清理（保留近期 + 按权重裁剪）
  while (bucket.length > MAX_REC) {
    // 去掉最旧的 25%（时间滚动）
    bucket.sort((a, b) => b.t - a.t);
    bucket.length = Math.floor(bucket.length * 0.75);
  }
}

// 查询预瞄点：最近 K 条记录的加权质心（最近 / 高威胁 / 精确事件权重更高）
export function oppAimPoint(game, nearX, nearY, radius = 600) {
  const bucket = bucketFor(game);
  if (!bucket || bucket.length < 2) return null;
  const now = game.time;
  const recent = bucket
    .filter((r) => now - r.t < MAX_AGE && Math.hypot(r.x - nearX, r.y - nearY) < radius)
    .sort((a, b) => b.t - a.t)
    .slice(0, 12);
  if (recent.length < 2) return null;
  let wx = 0, wy = 0, wsum = 0;
  for (const r of recent) {
    const w = recWeight(r, now);
    wx += r.x * w; wy += r.y * w; wsum += w;
  }
  if (wsum <= 0) return null;
  return { x: wx / wsum, y: wy / wsum };
}

// 聚类热点：返回 1-3 个敌方站位聚集区质心（供未来进攻分散/多路夹击决策）
export function oppHeatPoints(game) {
  const bucket = bucketFor(game);
  if (!bucket) return [];
  const now = game.time;
  const recent = bucket.filter((r) => now - r.t < MAX_AGE);
  if (!recent.length) return [];
  const clusters = [];
  for (const r of recent) {
    const w = recWeight(r, now);
    let bestC = null, bestD = Infinity;
    for (const c of clusters) {
      const dd = Math.hypot(c.x - r.x, c.y - r.y);
      if (dd < bestD) { bestD = dd; bestC = c; }
    }
    if (bestC && bestD < CLUSTER_R) {
      const total = bestC.w + w;
      bestC.x = (bestC.x * bestC.w + r.x * w) / total;
      bestC.y = (bestC.y * bestC.w + r.y * w) / total;
      bestC.w = total;
    } else {
      clusters.push({ x: r.x, y: r.y, w });
    }
  }
  clusters.sort((a, b) => b.w - a.w);
  return clusters.slice(0, 3).map((c) => ({ x: c.x, y: c.y }));
}
