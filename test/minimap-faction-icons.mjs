// 小地图实体图标纯逻辑：CT 用蓝色方形，T 用橙色三角，便于快速区分敌我。
import { minimapEntityIcon } from '../src/hud.js';

function ok(name, cond) {
  if (!cond) throw new Error('minimap-faction-icons: ' + name + ' FAIL');
  console.log('minimap-faction-icons: ' + name + ' PASS');
}

{
  const ct = minimapEntityIcon({ team: 'ct' });
  ok('CT icon is blue square', ct.shape === 'square' && ct.fill === '#4da6ff');
  const t = minimapEntityIcon({ team: 't' });
  ok('T icon is orange triangle', t.shape === 'triangle' && t.fill === '#ffb84d');
}

console.log('minimap-faction-icons: all PASS');
