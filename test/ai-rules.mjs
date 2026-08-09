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

console.log('ai-rules: all PASS');
