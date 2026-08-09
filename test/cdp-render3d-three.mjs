import { launchBrowser, waitForDebug, newTab, CDP } from './cdp.js';
import { spawn } from 'child_process';

const APP_PORT = 8098;
const DBG_PORT = 9238;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const srv = spawn('node', ['server.js'], {
  cwd: 'D:/Claudeworkspace/CS2D',
  env: { ...process.env, PORT: String(APP_PORT) },
  stdio: 'ignore',
  detached: true
});
await sleep(1500);
if (srv.exitCode !== null) {
  console.log('CDP-RENDER3D-THREE: FAIL (server failed to start)');
  process.exit(1);
}

const { proc, port } = launchBrowser({ port: DBG_PORT, profile: 'C:/Users/20579/AppData/Local/Temp/opencode/cdp-profile-three' });
let ok = true;
const fail = (m) => { ok = false; console.log('  FAIL: ' + m); };
const pass = (m) => console.log('  PASS: ' + m);

try {
  const wsUrl = await waitForDebug(port);
  const pageUrl = await newTab(port, `http://127.0.0.1:${APP_PORT}/`);
  const cdp = new CDP(pageUrl);
  await cdp.connect();
  await cdp.navigate(`http://127.0.0.1:${APP_PORT}/`);
  await sleep(2500);

  await cdp.eval(`(()=>{const b=document.getElementById('startBtn');if(b)b.click();return true})()`);
  await sleep(2200);

  const gameReady = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;return !!(g&&g.player&&!g.player.dead)})()`);
  if (!gameReady) fail('game not ready');
  else pass('game ready');

  await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;if(g)g.viewMode='fps';return true})()`);
  await sleep(1800);

  const backend = await cdp.eval(`(()=>{const c=window.__cs2d;return {backend:c&&c.render3d&&c.render3d.backend,gameBackend:c&&c.game&&c.game._render3dBackend,stats:c&&c.game&&c.game._renderStats}})()`);
  if (!backend || backend.backend !== 'next' || backend.gameBackend !== 'next') {
    fail('three.js backend not active: ' + JSON.stringify(backend));
  } else {
    pass('three.js backend active: ' + JSON.stringify(backend));
  }

  if (!backend || !backend.stats || backend.stats.dynamicObjects < 1 || backend.stats.viewmodelObjects < 1 || backend.stats.drawCalls < 1) {
    fail('three.js scene stats missing: ' + JSON.stringify(backend && backend.stats));
  } else {
    pass('scene stats: ' + JSON.stringify(backend.stats));
  }
  if (!backend || !backend.stats || backend.stats.entityWeapons < 1) {
    fail('three.js entity weapon meshes missing: ' + JSON.stringify(backend && backend.stats));
  } else {
    pass('entity weapon meshes present: ' + backend.stats.entityWeapons);
  }
  const vmState = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;const p=g&&g.player;if(!g||!p)return null;p.fireCd=0.3;p.lastSlot='secondary';p.reloading=true;p.reloadT=0.4;p.scoped=true;g.scopeT=0.5;return true})()`);
  await sleep(400);
  const vmStats = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;const c=window.__cs2d;return {backend:c&&c.render3d&&c.render3d.backend,gameBackend:g&&g._render3dBackend,parts:g&&g._renderStats?g._renderStats.viewmodelParts:0,objects:g&&g._renderStats?g._renderStats.viewmodelObjects:0}})()`);
  if (!vmState || !vmStats || vmStats.backend !== 'next' || vmStats.gameBackend !== 'next' || !vmStats.parts || vmStats.parts < 6 || vmStats.objects < 1) {
    fail('three.js detailed viewmodel missing: ' + JSON.stringify(vmStats));
  } else {
    pass('detailed viewmodel rendered: ' + JSON.stringify(vmStats));
  }
  await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;const p=g&&g.player;if(!g||!p)return false;p.fireCd=0;p.lastSlot=null;p.reloading=false;p.reloadT=0;p.scoped=false;g.scopeT=0;return true})()`);
  if (!backend || !backend.stats || backend.stats.bakedGround !== 1) {
    fail('three.js baked ground layer missing: ' + JSON.stringify(backend && backend.stats));
  } else {
    pass('baked ground layer present: ' + backend.stats.bakedGround);
  }
  if (!backend || !backend.stats || backend.stats.teamMarkers < 1) {
    fail('three.js teammate markers missing: ' + JSON.stringify(backend && backend.stats));
  } else {
    pass('teammate markers visible: ' + backend.stats.teamMarkers);
  }
  if (!backend || !backend.stats || backend.stats.mapCullSafe < 1) {
    fail('instanced map meshes are not frustum-safe: ' + JSON.stringify(backend && backend.stats));
  } else {
    pass('instanced map meshes frustum-safe: ' + backend.stats.mapCullSafe);
  }
  if (!backend || !backend.stats || backend.stats.mapObjects < 4) {
    fail('three.js map props missing: ' + JSON.stringify(backend && backend.stats));
  } else {
    pass('map props present: ' + backend.stats.mapObjects);
  }
  if (!backend || !backend.stats || !backend.stats.mapModelStats || backend.stats.mapModelStats.wallSkirts < 1 || backend.stats.mapModelStats.wallPipes < 1 || backend.stats.mapModelStats.wallConduits < 1) {
    fail('three.js wall model detail missing: ' + JSON.stringify(backend && backend.stats && backend.stats.mapModelStats));
  } else {
    pass('wall model detail present: ' + JSON.stringify(backend.stats.mapModelStats));
  }
  if (!backend || !backend.stats || !backend.stats.groundModelStats || backend.stats.groundModelStats.groundSeams < 1 || backend.stats.groundModelStats.groundCurbs < 1 || backend.stats.groundModelStats.drainGrills < 1 || backend.stats.groundModelStats.sitePlates < 1) {
    fail('three.js ground model detail missing: ' + JSON.stringify(backend && backend.stats && backend.stats.groundModelStats));
  } else {
    pass('ground model detail present: ' + JSON.stringify(backend.stats.groundModelStats));
  }

  await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;if(!g||!g.player)return false;g.decals.push({type:'corpse',x:g.player.x+96,y:g.player.y+48,angle:0.7,team:'t',life:60});return true})()`);
  await sleep(500);
  const decalStats = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;return g&&g._renderStats?g._renderStats:null})()`);
  if (!decalStats || decalStats.corpseObjects < 1) {
    fail('three.js corpse decal missing: ' + JSON.stringify(decalStats));
  } else {
    pass('three.js corpse decal rendered: ' + decalStats.corpseObjects);
  }

  const beforeBullet = decalStats ? decalStats.decalObjects : 0;
  await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;if(!g||!g.player)return false;g.decals.push({type:'bullet',x:g.player.x+160,y:g.player.y+120,angle:0.2,life:6});return true})()`);
  await sleep(400);
  const bulletStats = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;return g&&g._renderStats?g._renderStats:null})()`);
  if (!bulletStats || bulletStats.decalObjects <= beforeBullet) {
    fail('three.js bullet decal missing: ' + JSON.stringify(bulletStats));
  } else {
    pass('three.js bullet decal rendered: ' + bulletStats.decalObjects);
  }

  await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;const e=g&&g.entities&&g.entities.find((x)=>x&&x!==g.player);if(!e)return false;e.muzzleT=1;return true})()`);
  await sleep(350);
  const muzzleStats = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;return g&&g._renderStats?g._renderStats:null})()`);
  if (!muzzleStats || muzzleStats.entityMuzzles < 1) {
    fail('three.js entity muzzle flash missing: ' + JSON.stringify(muzzleStats));
  } else {
    pass('three.js entity muzzle flash rendered: ' + muzzleStats.entityMuzzles);
  }

  const pixels = await cdp.eval(`(()=>{const c=document.querySelector('canvas');if(!c)return null;const w=Math.min(c.width,1600),h=Math.min(c.height,900);const d=c.getContext('2d').getImageData(0,0,w,h).data;let lit=0,bright=0,white=0,colors=new Set(),checked=0;for(let y=0;y<h;y+=3){for(let x=0;x<w;x+=3){const i=(y*w+x)*4;const r=d[i],g=d[i+1],b=d[i+2];const sum=r+g+b;checked++;if(sum>40)lit++;if(sum>540)bright++;if(sum>720)white++;colors.add((r>>4)+','+(g>>4)+','+(b>>4));}}return {lit,bright,white,checked,colors:colors.size}})()`);
  if (!pixels || pixels.lit < 1 || pixels.colors < 8) {
    fail('three.js frame blank or low variance: ' + JSON.stringify(pixels));
  } else {
    pass('three.js frame variance: ' + JSON.stringify(pixels));
  }
  if (pixels && pixels.white > pixels.checked * 0.35) {
    fail('three.js frame too white: ' + JSON.stringify(pixels));
  }

  const pitchLock = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;if(!g||!g.player)return null;g.state='LIVE';g.player.pitch=0.5;g._mlookDx=0;g._mlookDy=140;window.GAME.debug.tick(0.016);return {pitch:g.player.pitch,dy:g._mlookDy}})()`);
  if (!pitchLock || pitchLock.pitch !== 0 || pitchLock.dy !== 0) {
    fail('vertical aim not locked: ' + JSON.stringify(pitchLock));
  } else {
    pass('vertical aim locked: ' + JSON.stringify(pitchLock));
  }

  await cdp.eval(`(()=>{window.GAME.debug.setOpts({mapId:'canal'});window.GAME.startMatch();return true})()`);
  await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;if(g)g.viewMode='fps';return true})()`);
  await sleep(1800);
  const switched = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;const c=window.__cs2d;return {map:g&&g.opts&&g.opts.mapId,backend:c&&c.render3d&&c.render3d.backend,stats:g&&g._renderStats}})()`);
  if (!switched || switched.map !== 'canal' || switched.backend !== 'next' || !switched.stats || switched.stats.dynamicObjects < 1 || switched.stats.viewmodelObjects < 1 || switched.stats.teamMarkers < 1) {
    fail('map switch with three.js failed: ' + JSON.stringify(switched));
  } else {
    pass('map switch with three.js: ' + JSON.stringify(switched));
  }
  if (!switched || !switched.stats || switched.stats.mapId !== 'canal') {
    fail('three.js map id not synced: ' + JSON.stringify(switched));
  } else {
    pass('three.js map id synced: ' + switched.stats.mapId);
  }
  if (!switched || !switched.stats || switched.stats.mapObjects < 4) {
    fail('map props missing after map switch: ' + JSON.stringify(switched));
  } else {
    pass('map props after map switch: ' + switched.stats.mapObjects);
  }
  if (!switched || !switched.stats || !switched.stats.mapModelStats || switched.stats.mapModelStats.wallSkirts < 1 || switched.stats.mapModelStats.wallPipes < 1 || switched.stats.mapModelStats.wallConduits < 1) {
    fail('wall model detail missing after map switch: ' + JSON.stringify(switched && switched.stats && switched.stats.mapModelStats));
  } else {
    pass('wall model detail after map switch: ' + JSON.stringify(switched.stats.mapModelStats));
  }
  if (!switched || !switched.stats || !switched.stats.groundModelStats || switched.stats.groundModelStats.groundSeams < 1 || switched.stats.groundModelStats.groundCurbs < 1 || switched.stats.groundModelStats.drainGrills < 1 || switched.stats.groundModelStats.sitePlates < 1) {
    fail('ground model detail missing after map switch: ' + JSON.stringify(switched && switched.stats && switched.stats.groundModelStats));
  } else {
    pass('ground model detail after map switch: ' + JSON.stringify(switched.stats.groundModelStats));
  }
  if (!switched || !switched.stats || switched.stats.mapCullSafe < 1) {
    fail('instanced map meshes not frustum-safe after map switch: ' + JSON.stringify(switched));
  } else {
    pass('instanced map meshes frustum-safe after map switch: ' + switched.stats.mapCullSafe);
  }

  await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;if(!g)return false;g.tracers=Array.from({length:80},(_,i)=>({x1:100+i*2,y1:100+i,x2:100+i,y2:120+i}));return true})()`);
  await sleep(400);
  const stress = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;const c=window.__cs2d;return {backend:c&&c.render3d&&c.render3d.backend,gameBackend:g&&g._render3dBackend,stats:g&&g._renderStats}})()`);
  if (!stress || stress.backend !== 'next' || stress.gameBackend !== 'next' || !stress.stats || stress.stats.drawCalls < 1) {
    fail('tracer buffer stress fell back: ' + JSON.stringify(stress));
  } else {
    pass('tracer buffer stress keeps next backend: ' + JSON.stringify(stress));
  }

  await cdp.close();
} catch (e) {
  fail(e.message);
} finally {
  try { proc.kill(); } catch {}
  try { srv.kill(); } catch {}
}

console.log(ok ? 'CDP-RENDER3D-THREE: PASS' : 'CDP-RENDER3D-THREE: FAIL');
process.exit(ok ? 0 : 1);
