// 色弱辅助色板（candidate-549）：deutan/protan 模式下把"红色语义"反馈换为高区分度色相。
// 全仓库受击红弧/低血红边此前为硬编码红色系，红绿色弱玩家依赖亮度差辨认。
// 仅改反馈层颜色，不改变任何游戏逻辑；localStorage 缺失时退化为关闭。
const KEY = 'cs2d_a11y_v1';

export function getA11yMode() {
  try {
    if (typeof localStorage === 'undefined') return 'off';
    return localStorage.getItem(KEY) || 'off';
  } catch (e) { return 'off'; }
}

export function setA11yMode(mode) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, mode);
  } catch (e) { /* 无痕模式忽略 */ }
}

// 语义色：hit = 受击方向弧 / lowhp = 低血量边缘 / gold = 爆头与奖励金
export function a11yPalette() {
  const m = getA11yMode();
  if (m === 'deutan') {
    // 绿色盲：红→高对比蓝，金→亮青
    return { hit: [[80, 150, 255], [60, 120, 230], [40, 100, 210]], lowhp: [90, 160, 255], gold: [90, 220, 255] };
  }
  if (m === 'protan') {
    // 红色盲：红→品红
    return { hit: [[255, 80, 220], [230, 60, 200], [210, 40, 185]], lowhp: [255, 90, 235], gold: [255, 210, 90] };
  }
  return null;
}
