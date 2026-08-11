// Editor regression: saving two different templates must keep two custom maps.
import { spawn } from 'child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, waitForDebug, newTab, CDP, getFreePort } from './cdp.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPort = await getFreePort();
const dbgPort = await getFreePort();
const baseUrl = `http://127.0.0.1:${appPort}/`;
const srv = spawn('node', ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(appPort) },
  stdio: 'ignore',
  detached: true
});
await sleep(1500);
if (srv.exitCode !== null) {
  console.error('map-editor-multimap: FAIL (server failed to start, exit=' + srv.exitCode + ')');
  process.exit(1);
}

const { proc, port } = launchBrowser({
  port: dbgPort,
  profile: `C:/Users/20579/AppData/Local/Temp/opencode/cdp-profile-map-editor-${process.pid}`
});
let cdp = null;
let ok = true;
try {
  const wsUrl = await waitForDebug(port);
  const pageUrl = await newTab(port, baseUrl);
  cdp = new CDP(pageUrl);
  await cdp.connect();
  await cdp.navigate(baseUrl);

  const result = await cdp.eval(`(async () => {
    for (let i = 0; i < 60 && !window.GAME; i++) await new Promise((r) => setTimeout(r, 100));
    localStorage.removeItem('cs2d_editor_map');
    localStorage.removeItem('cs2d_editor_maps');
    const name = document.getElementById('editorName');
    const save = document.getElementById('editorSave');
    const openAndSave = async (id, n) => {
      window.__openMapEditor(window.GAME, id);
      await new Promise((r) => setTimeout(r, 120));
      if (document.getElementById('editorTemplate').value !== id) throw new Error('editor did not load existing map ' + id);
      name.value = n;
      name.dispatchEvent(new Event('input'));
      save.click();
      await new Promise((r) => setTimeout(r, 120));
    };
    await openAndSave('dust2', 'Edited Dust');
    await openAndSave('metro', 'Edited Metro');
    window.__syncMapCards();
    await new Promise((r) => setTimeout(r, 100));
    const cards = [...document.querySelectorAll('.map-card')]
      .filter((b) => (b.getAttribute('data-map') || '').startsWith('custom'))
      .map((b) => b.querySelector('.mc-name')?.textContent || '');
    if (!cards.includes('Edited Dust') || !cards.includes('Edited Metro')) {
      throw new Error('expected two saved custom maps, got ' + JSON.stringify(cards));
    }

    const metroCard = [...document.querySelectorAll('.map-card')].find((b) => (b.querySelector('.mc-name')?.textContent || '') === 'Edited Metro');
    const edit = metroCard && metroCard.querySelector('.mc-edit');
    if (!edit) throw new Error('custom map card should expose an edit action');
    edit.click();
    await new Promise((r) => setTimeout(r, 120));
    if (name.value !== 'Edited Metro') throw new Error('edit action should load the existing custom map');
    name.value = 'Edited Metro v2';
    name.dispatchEvent(new Event('input'));
    save.click();
    await new Promise((r) => setTimeout(r, 120));
    window.__syncMapCards();
    await new Promise((r) => setTimeout(r, 100));
    return [...document.querySelectorAll('.map-card')]
      .filter((b) => (b.getAttribute('data-map') || '').startsWith('custom'))
      .map((b) => b.querySelector('.mc-name')?.textContent || '');
  })()`);

  if (!Array.isArray(result) || result.length < 2 || !result.includes('Edited Dust') || !result.includes('Edited Metro v2')) {
    throw new Error('expected two persistent custom maps with edited name, got ' + JSON.stringify(result));
  }
  console.log('map-editor-multimap: all PASS ' + JSON.stringify(result));
} catch (e) {
  ok = false;
  console.error('map-editor-multimap: FAIL ' + e.message);
}
try { cdp && cdp.close(); } catch {}
try { proc.kill(); } catch {}
try { srv.kill(); } catch {}
process.exit(ok ? 0 : 1);
