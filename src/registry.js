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
export function getMode(id) { return modes.get(id) || null; }
export function getModes() { return modes; }
export function hasMode(id) { return modes.has(id); }
