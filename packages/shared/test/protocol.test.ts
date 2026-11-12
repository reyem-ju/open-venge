import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseClientMsg } from '../src/index';

test('parses a valid input message', () => {
  const msg = parseClientMsg(JSON.stringify({ t: 'input', seq: 42, btn: 17, yaw: 1.2, pitch: -0.4 }));
  assert.ok(msg && msg.t === 'input');
  assert.equal(msg.seq, 42);
  assert.equal(msg.btn, 17);
});

test('clamps pitch into valid range', () => {
  const msg = parseClientMsg(JSON.stringify({ t: 'input', seq: 1, btn: 0, yaw: 0, pitch: 99 }));
  assert.ok(msg && msg.t === 'input');
  assert.equal(msg.pitch, 1.55);
});

test('sanitizes join names', () => {
  const msg = parseClientMsg(JSON.stringify({ t: 'join', name: '  <script>alert(1)</script> x ', loadout: 'rifle' }));
  assert.ok(msg && msg.t === 'join');
  assert.ok(!msg.name.includes('<'));
  assert.ok(msg.name.length <= 16);
});

test('rejects malformed payloads', () => {
  assert.equal(parseClientMsg('not json'), null);
  assert.equal(parseClientMsg('[]'), null);
  assert.equal(parseClientMsg(JSON.stringify({ t: 'input', seq: 'x', btn: 0, yaw: 0, pitch: 0 })), null);
  assert.equal(parseClientMsg(JSON.stringify({ t: 'join', name: 'a', loadout: 'nuke' })), null);
  assert.equal(parseClientMsg(JSON.stringify({ t: 'unknown' })), null);
});
