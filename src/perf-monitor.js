function pickNum(...values) {
  for (const value of values) {
    if (Number.isFinite(value)) return value;
  }
  return null;
}

export function formatPerfMonitor(stats, game) {
  let res = '-';
  if (stats && stats.render3d && stats.render3d.bufferSize) {
    res = stats.render3d.bufferSize.width + 'x' + stats.render3d.bufferSize.height;
  } else if (game && game.canvasW && game.dpr) {
    res = Math.round(game.canvasW * game.dpr) + 'x' + Math.round(game.canvasH * game.dpr);
  }
  if (!stats) {
    return '-- FPS (1s -- avg --)\nframe -- max -- drop 0/0\nwork -- render -- load --\n' + res + '  x1.00';
  }

  const frameNow = pickNum(stats.frameNow, stats.frameDelta) ?? 0;
  const frameAvg = pickNum(stats.frameAvgMs, stats.frameMs, frameNow) ?? 0;
  const frameMax = pickNum(stats.frameMaxMs, Math.max(frameNow, frameAvg)) ?? 0;
  const renderNow = pickNum(stats.renderNow, stats.renderMs) ?? 0;
  const workNow = pickNum(stats.workNow, stats.workMs) ?? 0;
  const drops = pickNum(stats.frameDrops) ?? 0;
  const frameWindow = pickNum(stats.frameWindow) ?? 0;
  const scale = pickNum(stats.scale, 1) ?? 1;
  const fpsNow = frameNow > 0 ? Math.round(1000 / frameNow) : 0;
  const fpsAvg = frameAvg > 0 ? Math.round(1000 / frameAvg) : 0;
  const fpsWindow = pickNum(stats.fpsWindow) ?? fpsNow;
  const simFps = pickNum(stats.simFps) ?? fpsNow;
  const effectiveFps = Math.min(...[fpsNow, fpsWindow, simFps].filter((v) => Number.isFinite(v) && v > 0));
  const fpsCurrent = effectiveFps || fpsWindow || fpsNow;
  const frameLoad = pickNum(stats.frameLoadPct, workNow > 0 && frameNow > 0 ? Math.min(999, workNow / frameNow * 100) : 0) ?? 0;
  const longCount = pickNum(stats.longTaskCount) ?? 0;
  const longMs = pickNum(stats.longTaskMs) ?? 0;
  const longText = longCount > 0 || longMs > 0 ? longMs.toFixed(1) + 'ms/' + longCount : '0ms/0';

  return fpsCurrent + ' FPS (1s ' + fpsWindow + ' avg ' + fpsAvg + ' sim ' + simFps + ')' +
    '\nframe ' + frameNow.toFixed(1) + 'ms max ' + frameMax.toFixed(1) + 'ms drop ' + drops + '/' + frameWindow +
    '\nwork ' + workNow.toFixed(1) + 'ms render ' + renderNow.toFixed(1) + 'ms load ' + frameLoad.toFixed(0) + '%' +
    '\nlong ' + longText + '  ' + res + '  x' + scale.toFixed(2);
}
