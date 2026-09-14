// 赛后战报分享图（candidate-596）：把结算数据画成 600x360 卡片导出 PNG。
// 对局数据（HLTV/经济/killfeed）齐全但只活在屏内——战报卡是赛后传播/留档的最小载体。
export function buildShareCardData(game) {
  if (!game || !game.player) return null;
  const p = game.player;
  const winAt = game.ot ? (game.otWin || 11) : (game.matchWin || 5);
  const win = (game.score.T >= winAt && p.team === 't') || (game.score.CT >= winAt && p.team === 'ct');
  const acc = game.stats && game.stats.shots ? Math.round((game.stats.hits / game.stats.shots) * 100) : 0;
  return {
    mapId: (game.opts && game.opts.mapId) || 'dust2',
    score: game.score.T + ':' + game.score.CT,
    win,
    k: p.kills || 0,
    d: p.deaths || 0,
    a: p.assists || 0,
    acc,
    longest: (game.stats && game.stats.longestKill) ? game.stats.longestKill.d + 'm' : null,
    round: game.round || 0
  };
}

// 绘制并返回 dataURL（浏览器端调用；headless 无 canvas 时返回 null）
export function renderShareCard(game, opts) {
  const data = buildShareCardData(game);
  if (!data) return null;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 600; c.height = 360;
  const x = c.getContext('2d');
  if (!x) return null;
  // 背景
  const bg = x.createLinearGradient(0, 0, 0, 360);
  bg.addColorStop(0, '#12161d');
  bg.addColorStop(1, '#0a0d11');
  x.fillStyle = bg;
  x.fillRect(0, 0, 600, 360);
  x.strokeStyle = 'rgba(255,211,77,.5)';
  x.lineWidth = 2;
  x.strokeRect(8, 8, 584, 344);
  // 标题
  x.fillStyle = data.win ? '#7de59a' : '#ff7d7d';
  x.font = "800 40px 'Microsoft YaHei',sans-serif";
  x.textAlign = 'center';
  x.fillText(data.win ? '胜利' : '败北', 300, 78);
  x.fillStyle = '#e6eef5';
  x.font = "700 52px Consolas,monospace";
  x.fillText(data.score, 300, 140);
  x.fillStyle = '#8b98a5';
  x.font = "600 16px 'Microsoft YaHei',sans-serif";
  x.fillText('CS2D · ' + data.mapId.toUpperCase() + ' · ' + data.round + ' 回合', 300, 170);
  // 数据行
  const rows = [
    ['K / D / A', data.k + ' / ' + data.d + ' / ' + data.a],
    ['命中率', data.acc + '%'],
    ['最远击杀', data.longest || '—']
  ];
  let y = 210;
  x.textAlign = 'center';
  for (const [label, val] of rows) {
    x.fillStyle = '#8b98a5';
    x.font = "600 14px 'Microsoft YaHei',sans-serif";
    x.fillText(label, 300, y);
    x.fillStyle = '#ffd34d';
    x.font = "700 22px Consolas,monospace";
    x.fillText(String(val), 300, y + 26);
    y += 46;
  }
  // 水印
  x.fillStyle = 'rgba(255,255,255,.25)';
  x.font = "600 12px 'Microsoft YaHei',sans-serif";
  x.fillText('CS2D 战报 · ' + new Date().toLocaleDateString('zh-CN'), 300, 344);
  try { return c.toDataURL('image/png'); } catch (e) { return null; }
}
