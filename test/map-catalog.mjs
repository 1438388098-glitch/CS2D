import assert from 'node:assert/strict';
import { MAPS } from '../src/config.js';
import '../src/modes.js';
import '../src/duel.js';
import { installChosenFourthMap } from '../src/4th-map-candidates.js';

installChosenFourthMap();

const maps = Array.from(MAPS);
assert.ok(!maps.some((m) => m.id === 'canal' || m.id === 'blast'), 'canal/blast should not be registered');
assert.ok(maps.some((m) => m.id === 'dust2' && m.category === 'bomb5v5'), 'dust2 should be bomb5v5');
assert.ok(maps.some((m) => m.id === 'duel-pit' && m.category === 'duel'), 'duel map should stay in duel category');
assert.ok(maps.some((m) => m.id === 'forge' && m.category === 'bomb5v5'), 'forge should be bomb5v5');
assert.ok(maps.some((m) => m.id === 'foundry-port' && m.category === 'bomb5v5'), 'chosen foundry map should be bomb5v5');
for (const m of maps) {
  assert.ok(m.id && Array.isArray(m.rows) && m.rows.length > 0, m.id + ' should provide editable rows');
}

console.log('map-catalog: all PASS');
