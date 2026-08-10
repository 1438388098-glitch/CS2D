globalThis.localStorage = { getItem: (k) => k === 'cs2d_map_choice_4th' ? 'abyss-lab' : null, setItem: () => {}, removeItem: () => {} };
const mod = await import('./src/4th-map-candidates.js');
const chosen = mod.chosenFourthMap();
const installed = mod.installChosenFourthMap();
console.log('chosen=' + (chosen && chosen.name) + ' installed=' + (installed && installed.id));
