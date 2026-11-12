import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FOUNDRY,
  PHYS,
  WEAPONS,
  damageAtRange,
  rayCharacter,
  raycastWorld,
  spreadDirection,
  toCollisionBoxes,
  viewAnglesToDir,
  type CollisionWorld,
} from '../src/index';

const world: CollisionWorld = { boxes: toCollisionBoxes(FOUNDRY) };

test('raycast hits a wall at the expected distance', () => {
  const hit = raycastWorld(world, 0, 1, -40, 0, 0, -1, 200);
  assert.ok(hit, 'should hit corner tower');
  assert.ok(Math.abs(hit.t - 1) < 0.1, `t=${hit.t}`);
  assert.equal(hit.nz, 1);
});

test('raycast misses open sky', () => {
  const hit = raycastWorld(world, 40, 1, 40, 0, 1, 0, 500);
  assert.equal(hit, null);
});

test('character hitbox registers body and headshot hits', () => {
  const c = { x: 0, y: 0, z: -10 };
  const body = rayCharacter(0, 1.0, 0, 0, 0, -1, c, 50);
  assert.ok(body && !body.headshot, 'center body shot');
  const headDir = viewAnglesToDir(0, Math.atan2(PHYS.eyeHeight - 1.0, 10));
  const head = rayCharacter(0, 1.0, 0, headDir[0], headDir[1], headDir[2], c, 50);
  assert.ok(head && head.headshot, 'head shot');
  const miss = rayCharacter(0, 1.0, 0, 1, 0, 0, c, 50);
  assert.equal(miss, null);
});

test('damage falloff behaves at range boundaries', () => {
  const w = WEAPONS.rifle;
  assert.equal(damageAtRange(w, 5), w.damage);
  assert.equal(damageAtRange(w, w.falloffEnd + 10), w.damage * w.minMult);
  const mid = damageAtRange(w, (w.falloffStart + w.falloffEnd) / 2);
  assert.ok(mid < w.damage && mid > w.damage * w.minMult);
});

test('spread direction stays unit length and near aim', () => {
  const [dx, dy, dz] = viewAnglesToDir(0.3, -0.2);
  const [sx, sy, sz] = spreadDirection(dx, dy, dz, 0.05, () => 0.5);
  const len = Math.hypot(sx, sy, sz);
  assert.ok(Math.abs(len - 1) < 1e-6);
  assert.ok(Math.abs(sx - dx) < 0.1);
});
