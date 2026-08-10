// 地图编辑器交互回归：矩形/直线必须保留首点 anchor 直到第二次点击完成。
// 旧 bug：window.onmouseup 无条件清空 anchor，导致第一次点击后无法继续画形状。
import assert from 'node:assert/strict';
import { shapeStep } from '../src/map-editor.js';

function makeState() {
  const rows = ['########', '#......#', '#......#', '#......#', '########'];
  return {
    rows,
    sel: '.',
    brush: 1,
    tool: 'rect',
    drawing: false,
    anchor: null,
    history: [],
    historyIdx: -1,
    zoom: 1
  };
}

// 第一次点击只记录首点，不写格子、不结束形状。
const ed = makeState();
shapeStep(ed, 1, 1);
assert.equal(ed.anchor.tx, 1);
assert.equal(ed.anchor.ty, 1);
assert.equal(ed.rows.join(''), makeState().rows.join(''), 'first click should not paint');

// 第二次点击完成矩形并清空 anchor。
shapeStep(ed, 3, 3);
assert.equal(ed.anchor, null, 'completed shape should clear anchor');
assert.equal(ed.rows[2][3], '.', 'rect should fill from anchor to second point');

// 直线同理：首点保留，次点完成。
ed.tool = 'line';
ed.rows = makeState().rows;
ed.anchor = null;
shapeStep(ed, 1, 1);
assert.equal(ed.anchor.tx, 1);
assert.equal(ed.anchor.ty, 1);
shapeStep(ed, 3, 3);
assert.equal(ed.anchor, null);
assert.equal(ed.rows[3][3], '.', 'line should paint between anchor and second point');

console.log('map-editor-edit: all PASS');
