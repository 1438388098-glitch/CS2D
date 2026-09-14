// 小地图事件 ping：安放/拆除/爆炸等关键事件在对应位置扩散圆环（candidate 视觉 Round2）。
// 纯逻辑 + 纯绘制，无 Math.random：ping 位置与 t0 由游戏逻辑写入，寿命窗口内可复现过滤。
// ping 列表挂在 game.pings，超过 PING_MAX 淘汰最旧；回合重置时由 spawnRound 清空。

export const PING_LIFE = 1.6;
export const PING_MAX = 8;

// kind → RGB 三元组（安放红 / 拆除蓝 / 爆炸橙）
export const PING_COLORS = {
  plant: '255,80,60',
  defuse: '90,170,255',
  boom: '255,150,50',
  airdrop: '120,255,160'
};

// 记录一次事件 ping（超上限淘汰最旧，常量级内存）
export function addPing(game, kind, x, y) {
  if (!game || !game.pings) game.pings = [];
  game.pings.push({ kind, x, y, t0: game.time || 0 });
  if (game.pings.length > PING_MAX) game.pings.shift();
}

// 纯过滤：返回寿命窗口内的 ping 并换算进度 t∈[0,1)（0 刚触发 → 1 消失）
export function activePings(pings, time) {
  const now = Number(time) || 0;
  const out = [];
  for (const p of pings || []) {
    const age = now - (p.t0 || 0);
    if (age >= 0 && age < PING_LIFE) out.push({ kind: p.kind, x: p.x, y: p.y, t: age / PING_LIFE });
  }
  return out;
}

// 环形态：半径 4→30 线性扩散；透明度前 15% 淡入、随后线性淡出（触圈瞬间不突兀）
export function pingSpec(t) {
  const tt = Math.min(Math.max(Number(t) || 0, 0), 1);
  const fadeIn = tt < 0.15 ? tt / 0.15 : 1;
  return { r: 4 + tt * 26, alpha: (1 - tt) * fadeIn };
}

// 绘制：在已带小地图变换的 ctx 上以世界→小地图换算函数画双层扩散环（软晕 + 亮核）。
// toX/toY 把世界坐标换到小地图像素；mctx 可为 stub 供测试。返回绘制数。
export function drawMinimapPings(mctx, pings, toX, toY) {
  if (!mctx || !Array.isArray(pings) || !pings.length) return 0;
  let drawn = 0;
  mctx.save();
  mctx.globalCompositeOperation = 'lighter';
  for (const pg of pings) {
    const spec = pingSpec(pg.t);
    if (spec.alpha <= 0.01) continue;
    const col = PING_COLORS[pg.kind] || PING_COLORS.plant;
    const cx = toX(pg.x), cy = toY(pg.y);
    mctx.strokeStyle = 'rgba(' + col + ',' + (spec.alpha * 0.35) + ')';
    mctx.lineWidth = 3.5;
    mctx.beginPath();
    mctx.arc(cx, cy, spec.r * 0.6 + 2, 0, Math.PI * 2);
    mctx.stroke();
    mctx.strokeStyle = 'rgba(' + col + ',' + spec.alpha + ')';
    mctx.lineWidth = 1.5;
    mctx.beginPath();
    mctx.arc(cx, cy, spec.r, 0, Math.PI * 2);
    mctx.stroke();
    drawn++;
  }
  mctx.restore();
  return drawn;
}
