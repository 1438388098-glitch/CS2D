const weapons = new Map();
const maps = new Map();
const modes = new Map();

export function registerWeapon(id, stats) {
  if (!id || !stats) throw new Error('registerWeapon: invalid args');
  weapons.set(id, Object.freeze({ ...stats }));
  return id;
}

export function registerMap(mapDef) {
  if (!mapDef || !mapDef.id) throw new Error('registerMap: invalid args');
  const prev = maps.get(mapDef.id) || {};
  maps.set(mapDef.id, Object.freeze({ ...prev, ...mapDef }));
  return mapDef.id;
}

export function registerMode(modeDef) {
  if (!modeDef || !modeDef.id) throw new Error('registerMode: invalid args');
  modes.set(modeDef.id, modeDef);
  return modeDef.id;
}

export function getWeapon(id) { return weapons.get(id) || null; }
export function getWeapons() { return weapons; }
export function getMapDef(id) { return maps.get(id) || null; }
export function getMaps() { return maps; }
// 竞技图池（5v5 拆包）：按注册顺序返回 category==='bomb5v5' 的地图 id，新增竞技图只需注册时带 category 即自动入池
export function getBombMapIds() {
  return Array.from(maps.values()).filter((d) => d.category === 'bomb5v5').map((d) => d.id);
}
// 竞技图池固定清单（单一数据源）：ranked/career 等模式共用；此处与 getBombMapIds 并存，
// MODE_MAPS 为显式列表（含尚无 category 标注的历史竞技图），避免依赖注册顺序。
export const MODE_MAPS = ['dust2', 'metro', 'forge', 'atrium', 'arctic', 'harbor'];
export function getMode(id) { return modes.get(id) || null; }
export function getModes() { return modes; }
export function hasMode(id) { return modes.has(id); }
