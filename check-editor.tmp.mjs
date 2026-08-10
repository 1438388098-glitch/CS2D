const raw = { id: 'custom-map', name: '测试图', rows: ['########','#t....#','#..a..#','#..b..#','#....c#','########'] };
globalThis.localStorage = { getItem: (k) => k === 'cs2d_editor_map' ? JSON.stringify(raw) : null, setItem: () => {}, removeItem: () => {} };
const mod = await import('./src/map-editor.js');
const obj = mod.installSavedEditorMap();
console.log('installed=' + (obj && obj.name) + ' rows=' + (obj && obj.rows && obj.rows.length));
