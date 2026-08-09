// 掉落物渲染信息必须安全处理拆弹钳等无武器ID的掉落，避免2D渲染崩溃。
import { dropRenderInfo } from '../src/render.js';

function ok(name, cond) {
  if (!cond) throw new Error('drop-render-info: ' + name + ' FAIL');
  console.log('drop-render-info: ' + name + ' PASS');
}

{
  const kit = dropRenderInfo({ kind: 'kit' });
  ok('kit has safe label', kit && kit.label === '拆弹钳');
  ok('kit has safe kind', kit && kit.kind === 'kit');

  const rifle = dropRenderInfo({ wid: 'ak' });
  ok('weapon keeps name', rifle && rifle.label === 'AK-47');
  ok('weapon keeps color', rifle && typeof rifle.color === 'string');

  ok('unknown drop is skipped', dropRenderInfo({ kind: 'ghost' }) === null);
  ok('null drop is skipped', dropRenderInfo(null) === null);
}

console.log('drop-render-info: all PASS');
