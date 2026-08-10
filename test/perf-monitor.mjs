import { formatPerfMonitor } from '../src/perf-monitor.js';

function ok(name, cond) {
  if (!cond) throw new Error('perf-monitor: ' + name + ' FAIL');
  console.log('perf-monitor: ' + name + ' PASS');
}

{
  const out = formatPerfMonitor({
    frameNow: 50,
    frameAvgMs: 16.7,
    frameMaxMs: 50.1,
    renderNow: 25.3,
    workNow: 42,
    frameLoadPct: 84,
    frameDrops: 4,
    frameWindow: 60,
    fpsWindow: 60,
    simFps: 60,
    longTaskCount: 1,
    longTaskMs: 52,
    render3d: { bufferSize: { width: 1920, height: 1080 } },
    scale: 0.75
  }, {});
  ok('shows raw fps from last frame', out.includes('20 FPS'));
  ok('shows recent average fps', out.includes('avg 60'));
  ok('shows simulation tick fps', out.includes('sim 60'));
  ok('shows last frame ms', out.includes('frame 50.0ms'));
  ok('shows worst frame ms', out.includes('max 50.1ms'));
  ok('shows current render ms', out.includes('render 25.3ms'));
  ok('shows dropped frame count', out.includes('drop 4/60'));
  ok('shows main-thread load', out.includes('load 84%'));
  ok('shows long task', out.includes('long 52.0ms/1'));
  ok('shows 3d buffer and scale', out.includes('1920x1080') && out.includes('x0.75'));
}

{
  const out = formatPerfMonitor({
    frameNow: 6.94,
    frameAvgMs: 6.94,
    frameMaxMs: 16.7,
    renderNow: 2,
    workNow: 4,
    frameLoadPct: 60,
    frameDrops: 1,
    frameWindow: 60,
    fpsWindow: 144,
    simFps: 60,
    scale: 1
  }, {});
  ok('high refresh callback does not hide low sim fps', out.includes('60 FPS (1s 144 avg 144 sim 60)'));
  ok('raw callback fps stays visible in window', out.includes('1s 144'));
}

{
  const out = formatPerfMonitor(null, { canvasW: 800, canvasH: 450, dpr: 2 });
  ok('falls back to placeholder fps', out.startsWith('-- FPS'));
  ok('falls back to 2d canvas resolution', out.includes('1600x900'));
}

{
  const out = formatPerfMonitor({
    frameNow: 50,
    frameAvgMs: 50,
    frameMaxMs: 60,
    renderNow: 30,
    workNow: 42,
    frameLoadPct: 84,
    frameDrops: 7,
    frameWindow: 30,
    fpsWindow: 21,
    simFps: 60,
    scale: 1
  }, {});
  ok('current frame wins over stale counted fps', out.includes('20 FPS (1s 21 avg 20 sim 60)'));
  ok('shows full-frame work time', out.includes('work 42.0ms'));
}

console.log('perf-monitor: all PASS');
