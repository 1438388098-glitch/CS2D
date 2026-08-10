import assert from 'node:assert/strict';
import {
  shouldRerouteStuck,
  shouldPushLatePlant,
  shouldRetreatWithoutBomb,
  shouldRetakeBomb,
  canRerouteAgain,
  shouldRushDefuser,
  shouldKeepPath,
  shouldRotateToHot,
  shouldUnstuck,
  pickPlantSite,
  shouldEscortCarrier,
  shouldThrowUtility,
  shouldAttemptDefuse,
  shouldSaveForEco,
  shouldRepositionOnIntel,
  shouldRushPlant
} from '../src/ai/rules.js';

const bot = {
  team: 't',
  path: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
  pathI: 0
};

assert.equal(shouldRerouteStuck(bot, 4), true, 'active path with tiny movement should reroute');
assert.equal(shouldRerouteStuck(bot, 12), false, 'active path with normal movement should not reroute');

const idle = { team: 't', path: null, pathI: 0 };
assert.equal(shouldRerouteStuck(idle, 4), false, 'idle T bot without path should not be kicked');

const done = { team: 't', path: [{ x: 10, y: 10 }], pathI: 1 };
assert.equal(shouldRerouteStuck(done, 4), false, 'finished path should not reroute');

const lateCarrier = { team: 't', hasBomb: true };
assert.equal(shouldPushLatePlant(lateCarrier, 70), true, 'late bomb carrier should push to plant');
assert.equal(shouldPushLatePlant(lateCarrier, 55), false, 'late threshold should be exclusive');
assert.equal(shouldPushLatePlant(lateCarrier, 114), true, 'carrier should push until round end');
assert.equal(shouldPushLatePlant(lateCarrier, 115), false, 'carrier should not push after round end');
assert.equal(shouldPushLatePlant({ team: 't', hasBomb: false }, 70), false, 'non-carrier should not push');
assert.equal(shouldPushLatePlant({ team: 't', hasBomb: true, bomb: { planted: true } }, 70), false, 'planted bomb should not trigger late push');

assert.equal(shouldRushPlant({ team: 't', hasBomb: true }, 700, 110), true, 'far carrier should rush plant in final window');
assert.equal(shouldRushPlant({ team: 't', hasBomb: true }, 400, 110), false, 'near carrier should not need to rush plant');
assert.equal(shouldRushPlant({ team: 't', hasBomb: true }, 700, 60), false, 'normal-time carrier should not rush plant');
assert.equal(shouldRushPlant({ team: 't', hasBomb: false }, 700, 110), false, 'non-carrier should not rush plant');
assert.equal(shouldRushPlant({ team: 't', hasBomb: true, bomb: { planted: true } }, 700, 110), false, 'planted bomb should not trigger rush plant');

assert.equal(shouldRetreatWithoutBomb({ team: 't', hasBomb: false }, 100, 2, 1), true, 'late disadvantage without bomb should retreat');
assert.equal(shouldRetreatWithoutBomb({ team: 't', hasBomb: false }, 100, 1, 1), true, 'late even numbers should retreat');
assert.equal(shouldRetreatWithoutBomb({ team: 't', hasBomb: false }, 60, 2, 1), false, 'early round should not retreat');
assert.equal(shouldRetreatWithoutBomb({ team: 't', hasBomb: true }, 100, 2, 1), false, 'bomb carrier should never retreat');
assert.equal(shouldRetreatWithoutBomb({ team: 't', hasBomb: false, bomb: { planted: true } }, 100, 2, 1), false, 'planted bomb should not trigger retreat');
assert.equal(shouldRetreatWithoutBomb({ team: 't', hasBomb: false, bomb: { dropped: true } }, 100, 2, 1), false, 'dropped bomb should not trigger retreat');

assert.equal(shouldRetakeBomb({ team: 'ct' }, true, 120, 2), true, 'near CT should retake even at round end');
assert.equal(shouldRetakeBomb({ team: 'ct' }, true, 900, 30), true, 'CT with enough time should retake from distance');
assert.equal(shouldRetakeBomb({ team: 'ct' }, true, 900, 2, 1, 4), false, 'far outnumbered CT should not throw away retake');
assert.equal(shouldRetakeBomb({ team: 'ct' }, true, 900, 2, 1, 1), true, 'late 1v1 should still contest bomb');
assert.equal(shouldRetakeBomb({ team: 't' }, true, 900, 30), false, 'T should not use CT retake rule');
assert.equal(shouldRetakeBomb({ team: 'ct', dead: true }, true, 120, 30), false, 'dead CT cannot retake');
assert.equal(shouldRetakeBomb({ team: 'ct', defusing: true }, true, 120, 30), false, 'defusing CT should stay on bomb');
assert.equal(shouldRetakeBomb({ team: 'ct' }, false, 120, 30), false, 'unplanted bomb should not trigger retake');

assert.equal(shouldRushDefuser({ team: 't' }, true, 300, 10), true, 'T near defuser should interrupt immediately');
assert.equal(shouldRushDefuser({ team: 't' }, true, 1200, 2), true, 'T should sprint to defuser at bomb timer end');
assert.equal(shouldRushDefuser({ team: 't' }, true, 1200, 10), false, 'T should not waste a long sprint when time remains');
assert.equal(shouldRushDefuser({ team: 't' }, false, 300, 2), false, 'no defuser should not trigger rush');
assert.equal(shouldRushDefuser({ team: 'ct' }, true, 300, 2), false, 'CT should not use T defuser-stop rule');
assert.equal(shouldRushDefuser({ team: 't', dead: true }, true, 300, 2), false, 'dead T cannot rush defuser');

assert.equal(shouldRotateToHot({ team: 'ct' }, 'A', 700, 30), true, 'CT with hot intel and time should rotate');
assert.equal(shouldRotateToHot({ team: 'ct' }, 'A', 300, 30), false, 'CT already near hot site should not rotate pointlessly');
assert.equal(shouldRotateToHot({ team: 'ct' }, 'A', 700, 8), false, 'CT should not rotate when time is nearly gone');
assert.equal(shouldRotateToHot({ team: 'ct' }, 'A', 700, 30, true), false, 'CT should not rotate after bomb is planted');
assert.equal(shouldRotateToHot({ team: 't' }, 'A', 700, 30), false, 'T should not use CT hot-rotate rule');
assert.equal(shouldRotateToHot({ team: 'ct', dead: true }, 'A', 700, 30), false, 'dead CT cannot rotate');

assert.equal(shouldKeepPath({ path: [{ x: 0, y: 0 }, { x: 100, y: 0 }], pathI: 0 }, 10, 10, 70, 10), true, 'moving bot should keep current path');
assert.equal(shouldKeepPath({ path: [{ x: 0, y: 0 }, { x: 100, y: 0 }], pathI: 0 }, 10, 10, 12, 10), false, 'stationary bot should be eligible for reroute');
assert.equal(shouldKeepPath({ path: null, pathI: 0 }, 10, 10, 70, 10), false, 'bot without path should not keep path');
assert.equal(shouldKeepPath({ path: [{ x: 0, y: 0 }], pathI: 1 }, 10, 10, 70, 10), false, 'completed path should not be kept');

assert.equal(canRerouteAgain({}, null, 10), true, 'bot without reroute history may reroute');
assert.equal(canRerouteAgain({}, 9.2, 10), true, 'cooldown boundary should allow reroute');
assert.equal(canRerouteAgain({}, 9.3, 10), false, 'reroute within cooldown should be blocked');
assert.equal(canRerouteAgain(null, 9.3, 10), false, 'missing bot should not reroute');

assert.equal(shouldUnstuck({ path: [{ x: 0, y: 0 }, { x: 50, y: 0 }], pathI: 0 }, 2, 5), true, 'stuck active-path bot should be unstuck');
assert.equal(shouldUnstuck({ path: [{ x: 0, y: 0 }, { x: 50, y: 0 }], pathI: 0 }, 1, 5), false, 'short stuck time should not teleport');
assert.equal(shouldUnstuck({ path: [{ x: 0, y: 0 }, { x: 50, y: 0 }], pathI: 0 }, 2, 40), false, 'moving bot should not be treated as stuck');
assert.equal(shouldUnstuck({ path: null, pathI: 0 }, 2, 5), false, 'bot without path should not be teleported');
assert.equal(shouldUnstuck({ path: [{ x: 0, y: 0 }], pathI: 1 }, 2, 5), false, 'completed-path bot should not be teleported');

assert.equal(pickPlantSite({ team: 't', hasBomb: true }, { dist: 200, cover: 2, enemyNear: 0 }, { dist: 500, cover: 1, enemyNear: 2 }, 40), 'A', 'near covered site should be preferred early');
assert.equal(pickPlantSite({ team: 't', hasBomb: true }, { dist: 500, cover: 1, enemyNear: 0 }, { dist: 200, cover: 2, enemyNear: 0 }, 15), 'B', 'late-round carrier should favor closer site');
assert.equal(pickPlantSite({ team: 't', hasBomb: true }, { dist: 400, cover: 1, enemyNear: 1 }, { dist: 420, cover: 1, enemyNear: 1 }, 50), null, 'near-even site choices should wait for more intel');
assert.equal(pickPlantSite({ team: 't', hasBomb: false }, { dist: 200, cover: 2 }, { dist: 500, cover: 1 }, 40), null, 'non-carrier should not choose plant site');
assert.equal(pickPlantSite({ team: 't', hasBomb: true, dead: true }, { dist: 200, cover: 2 }, { dist: 500, cover: 1 }, 40), null, 'dead carrier should not choose plant site');
assert.equal(pickPlantSite({ team: 't', hasBomb: true, bomb: { planted: true } }, { dist: 200, cover: 2 }, { dist: 500, cover: 1 }, 40), null, 'planted bomb should not choose another site');

assert.equal(shouldEscortCarrier({ team: 't' }, 200, 180, 12), true, 'near-site carrier should be escorted early');
assert.equal(shouldEscortCarrier({ team: 't' }, 200, 500, 12), false, 'carrier still far from site should not gather teammates');
assert.equal(shouldEscortCarrier({ team: 't' }, 200, 180, 24), false, 'mid-round teammates should keep lanes instead of escorting');
assert.equal(shouldEscortCarrier({ team: 't' }, 80, 180, 12), false, 'already close teammate should not collapse onto carrier');
assert.equal(shouldEscortCarrier({ team: 't', hasBomb: true }, 200, 180, 12), false, 'bomb carrier should not escort itself');
assert.equal(shouldEscortCarrier({ team: 'ct' }, 200, 180, 12), false, 'CT should not use T escort rule');
assert.equal(shouldEscortCarrier({ team: 't', dead: true }, 200, 180, 12), false, 'dead bot cannot escort');
assert.equal(shouldEscortCarrier({ team: 't', bomb: { planted: true } }, 200, 180, 12), false, 'planted bomb should end escort behavior');

assert.equal(shouldThrowUtility({ team: 't' }, 'smoke', 1, 400, 20), true, 'smoke should be thrown on entry approach');
assert.equal(shouldThrowUtility({ team: 't' }, 'smoke', 1, 100, 20), false, 'smoke is wasted at very close range');
assert.equal(shouldThrowUtility({ team: 't' }, 'smoke', 1, 400, 6), false, 'early round smoke should be saved');
assert.equal(shouldThrowUtility({ team: 't' }, 'flash', 1, 300, 20, 2), true, 'flash with enemy contact should be thrown');
assert.equal(shouldThrowUtility({ team: 't' }, 'flash', 1, 300, 20, 0), false, 'flash should be saved without enemy contact');
assert.equal(shouldThrowUtility({ team: 't' }, 'he', 1, 250, 20, 1), true, 'HE should punish known close enemy');
assert.equal(shouldThrowUtility({ team: 't' }, 'he', 0, 250, 20, 1), false, 'empty utility slot should not throw');
assert.equal(shouldThrowUtility({ team: 't', bomb: { planted: true } }, 'smoke', 1, 400, 20), false, 'pre-plant utility rule should not apply after planting');
assert.equal(shouldThrowUtility({ team: 't' }, 'molotov', 1, 400, 20), false, 'unknown utility kind should be rejected');

assert.equal(shouldAttemptDefuse({ team: 'ct' }, true, 100, 15, false), true, 'near CT should commit to defuse when enough time remains');
assert.equal(shouldAttemptDefuse({ team: 'ct' }, true, 700, 30, true), true, 'kit CT with extra time can push from range in small clutch');
assert.equal(shouldAttemptDefuse({ team: 'ct' }, true, 700, 30, false, 3), false, 'slow defuser should not sprint from range while multiple enemies remain');
assert.equal(shouldAttemptDefuse({ team: 'ct' }, true, 100, 10, false), false, 'defuse should require time beyond the 10s action');
assert.equal(shouldAttemptDefuse({ team: 'ct' }, true, 100, 5, true), false, 'kit defuse should also leave a small safety margin');
assert.equal(shouldAttemptDefuse({ team: 'ct' }, false, 100, 15, false), false, 'unplanted bomb should not trigger defuse');
assert.equal(shouldAttemptDefuse({ team: 't' }, true, 100, 15, false), false, 'T should not use CT defuse rule');
assert.equal(shouldAttemptDefuse({ team: 'ct', defusing: true }, true, 100, 15, false), false, 'already defusing CT should stay on bomb');

assert.equal(shouldSaveForEco({ team: 'ct' }, 1800, 2, 100), true, 'late low-money rifle holder should save');
assert.equal(shouldSaveForEco({ team: 'ct' }, 1800, 0, 100), false, 'pistol holder should not save for economy');
assert.equal(shouldSaveForEco({ team: 'ct' }, 4200, 2, 100), false, 'rich rifle holder can afford next buy');
assert.equal(shouldSaveForEco({ team: 'ct' }, 1800, 2, 60), false, 'early round should not trigger eco save');
assert.equal(shouldSaveForEco({ team: 't', hasBomb: true }, 1800, 2, 100), false, 'bomb carrier must keep playing the objective');
assert.equal(shouldSaveForEco({ team: 'ct', defusing: true }, 1800, 2, 100), false, 'defusing CT should not abandon bomb');
assert.equal(shouldSaveForEco({ team: 'ct', dead: true }, 1800, 2, 100), false, 'dead bot cannot save equipment');

assert.equal(shouldRepositionOnIntel({ team: 'ct' }, 9, 900), true, 'CT far from anchor with stale intel should reposition');
assert.equal(shouldRepositionOnIntel({ team: 'ct' }, 2, 900), false, 'fresh intel should keep the current hold');
assert.equal(shouldRepositionOnIntel({ team: 'ct' }, 9, 300), false, 'CT already near home should not rotate pointlessly');
assert.equal(shouldRepositionOnIntel({ team: 'ct' }, 9, 900, true), false, 'post-plant CT should move to bomb instead of home anchor');
assert.equal(shouldRepositionOnIntel({ team: 't' }, 9, 900), false, 'T should not use CT reposition rule');
assert.equal(shouldRepositionOnIntel({ team: 'ct', dead: true }, 9, 900), false, 'dead CT cannot reposition');

console.log('ai-rules: all PASS');
