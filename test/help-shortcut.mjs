import assert from 'node:assert/strict';
import { ACTIONS, matches, resetBinds } from '../src/keymap.js';
import { installStubs, registerDomIds } from './stubdom.js';
import { renderHelpBindings } from '../src/ui.js';

installStubs();
registerDomIds('helpBinds');
resetBinds();

assert.equal(ACTIONS.help, '帮助', 'help action should be exposed in settings');
assert.equal(matches('KeyH', 'help'), true, 'help should default to H');

renderHelpBindings();
const html = document.getElementById('helpBinds').innerHTML;
assert.ok(html.includes('<b>H</b>'), 'help bindings should render current key labels');
assert.ok(html.includes('帮助'), 'help bindings should include help row');

console.log('help-shortcut: all PASS');
