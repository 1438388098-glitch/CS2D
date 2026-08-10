import { project3d, wallHeightFor, wallDist } from '../src/render3d.js';
import { rotateInputVector } from '../src/utils.js';

const grid = [
  '#######',
  '#.....#',
  '#.#####',
  '#.....#',
  '#######'
];
const TILE = 40;

function ok(name, cond) {
  if (!cond) throw new Error('render3d-proj: ' + name + ' FAIL');
  console.log('render3d-proj: ' + name + ' PASS');
}

// a) project3d
const fwd = project3d(0, 0, 0, 512, 100, 0);
ok('project3d forward point', Math.abs(fwd.depth - 100) < 1e-9 && Math.abs(fwd.perp) < 1e-9 && Math.abs(fwd.k - 0.01) < 1e-9);

const right = project3d(0, 0, 0, 512, 0, 100);
ok('project3d right y-down', Math.abs(right.perp - 100) < 1e-9 && Math.abs(right.depth) < 1e-9);

const up = project3d(0, 0, Math.PI / 2, 512, 0, 100);
ok('project3d facing +y', Math.abs(up.depth - 100) < 1e-9 && Math.abs(up.perp) < 1e-9);

// b) wallHeightFor
ok('wallHeightFor chars', wallHeightFor('#') === 1 && wallHeightFor('=') === 0.55 && wallHeightFor('C') === 0.55 && wallHeightFor('o') === 0.45 && wallHeightFor('@') === 1);

// c) wallDist
// 相机 (40,40) 在格 (1,1)（'.'），行 1 为 '#.....#'：朝 +x 撞 (6,1) 东边，dist=200
const hit0 = wallDist(grid, 40, 40, 0, TILE, 512);
ok('wallDist +x exact', hit0 !== null && hit0.dist === 200 && hit0.side === 0 && hit0.u === 0 && hit0.tx === 6 && hit0.ty === 1 && hit0.char === '#');

// 朝 +y：列 1 为 '.....' 直到行 4 撞 '#':(1,4) 南边? 行 4 是 '#######'，撞 (1,4) 上边（side=1），dist=120
const hit90 = wallDist(grid, 40, 40, Math.PI / 2, TILE, 512);
ok('wallDist +y exact', hit90 !== null && hit90.dist === 120 && hit90.side === 1 && hit90.tx === 1 && hit90.ty === 4 && Math.abs(hit90.u) < 1e-9 && hit90.char === '#');

// 格心 u：相机 (60,60) 在格 (1,1) 中心，朝 +y 撞行 4 顶部 → u=0.5；朝 -y 撞行 0 底部 → u=0.5
const lane = wallDist(grid, 60, 60, Math.PI / 2, TILE, 512);
const near = wallDist(grid, 60, 60, -Math.PI / 2, TILE, 512);
ok('wallDist open lane much longer', lane !== null && near !== null && lane.char === '#' && near.char === '#' && lane.dist > near.dist * 2.5);
ok('wallDist u at tile center', lane !== null && Math.abs(lane.u - 0.5) < 1e-9 && lane.dist === 100 && lane.side === 1);
ok('wallDist u near face', near !== null && Math.abs(near.u - 0.5) < 1e-9 && near.dist === 20 && near.side === 1);

// 矮墙/油桶 char 透传：相机从 '.' 出发分别撞 '=' 和 'o'
const g2 = ['#####', '#.=o#', '#####'];
const hitEq = wallDist(g2, 40, 40, 0, TILE, 512);
ok('wallDist thin wall char', hitEq !== null && hitEq.char === '=' && hitEq.dist === 40 && hitEq.side === 0 && hitEq.tx === 2);
const g3 = ['#####', '#.o=#', '#####'];
const hitOil = wallDist(g3, 40, 40, 0, TILE, 512);
ok('wallDist barrel char', hitOil !== null && hitOil.char === 'o' && hitOil.dist === 40 && hitOil.tx === 2);

// 边界分支：空 grid / 相机在墙内 → dist 0；超 maxDist → null
ok('wallDist empty grid', wallDist([], 40, 40, 0, TILE, 512) === null);
ok('wallDist camera in wall', wallDist(grid, 0, 0, 0, TILE, 512) !== null && wallDist(grid, 0, 0, 0, TILE, 512).dist === 0);
ok('wallDist maxDist exceeded', wallDist(grid, 40, 40, 0, TILE, 10) === null);

// d) rotateInputVector
const w = rotateInputVector(0, -1, 0);
ok('rotateInputVector W fwd +x', Math.abs(w.x - 1) < 1e-9 && Math.abs(w.y) < 1e-9);

const d = rotateInputVector(1, 0, 0);
ok('rotateInputVector D right +y', Math.abs(d.x) < 1e-9 && Math.abs(d.y - 1) < 1e-9);

const w90 = rotateInputVector(0, -1, Math.PI / 2);
ok('rotateInputVector W facing +y', Math.abs(w90.x) < 1e-9 && Math.abs(w90.y - 1) < 1e-9);

const a = rotateInputVector(-1, 0, 0);
ok('rotateInputVector A left -y', Math.abs(a.x) < 1e-9 && Math.abs(a.y + 1) < 1e-9);

console.log('render3d-proj: all PASS');
