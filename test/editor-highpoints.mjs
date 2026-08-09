// 地图编辑器 highPoints 自动推导回归：^/R 屋顶连通簇应产出站点锚点而非空数组。
import { computeMapMeta } from '../src/map-editor.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} editor-highpoints ${name}${detail ? ' ' + detail : ''}`);
  if (!cond) failed = true;
}

const rows = [
  '########',
  '#..^##.#',
  '#..^##a#',
  '#......#',
  '#..R...b',
  '########'
];

const meta = computeMapMeta(rows);
ok('has penPoints A', meta.penPoints.length >= 2, 'n=' + meta.penPoints.length);
ok('highPoints derived', Array.isArray(meta.highPoints) && meta.highPoints.length > 0, 'n=' + meta.highPoints.length);
if (meta.highPoints.length > 0) {
  const hp = meta.highPoints[0];
  ok('highPoint has x/y', typeof hp.x === 'number' && typeof hp.y === 'number');
  ok('highPoint has site', hp.site === 'A' || hp.site === 'B' || hp.site === 'mid', 'site=' + hp.site);
  ok('highPoint has face', typeof hp.face === 'number');
}
// 无屋顶时 highPoints 为空
const flat = computeMapMeta([
  '#####',
  '#a.b#',
  '#####'
]);
ok('flat map empty highPoints', flat.highPoints.length === 0, 'n=' + flat.highPoints.length);

process.exit(failed ? 1 : 0);
