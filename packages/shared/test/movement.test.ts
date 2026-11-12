import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FOUNDRY, PHYS, stepMove, toCollisionBoxes, type CollisionWorld, type MoveState } from '../src/index';

const world: CollisionWorld = { boxes: toCollisionBoxes(FOUNDRY) };
const DT = 1 / 60;

function newState(x: number, y: number, z: number): MoveState {
  return { x, y, z, vx: 0, vy: 0, vz: 0, onGround: false };
}

function run(s: MoveState, inp: Parameters<typeof stepMove>[1], ticks: number): MoveState {
  for (let i = 0; i < ticks; i++) stepMove(s, inp, DT, world);
  return s;
}

test('falls under gravity and lands on the floor', () => {
  const s = run(newState(0, 3, 20), { fwd: 0, right: 0, jump: false, yaw: 0 }, 120);
  assert.ok(s.onGround, 'should be grounded');
  assert.ok(Math.abs(s.y) < 0.01, `resting on floor, got y=${s.y}`);
});

test('walks forward at movement speed until blocked by the central platform', () => {
  const s = run(newState(0, 0.1, 20), { fwd: 1, right: 0, jump: false, yaw: 0 }, 120);
  assert.ok(s.z < 8 && s.z > 6.9, `should advance and stop at platform edge, got z=${s.z}`);
  assert.ok(Math.abs(s.x) < 0.01, 'no lateral drift');
});

test(' stops on friction when input released', () => {
  const s = run(newState(0, 0.1, 20), { fwd: 1, right: 0, jump: false, yaw: 0 }, 60);
  run(s, { fwd: 0, right: 0, jump: false, yaw: 0 }, 60);
  const speed = Math.hypot(s.vx, s.vz);
  assert.ok(speed < 0.1, `should stop, speed=${speed}`);
});

test('jump gains roughly the expected height', () => {
  const s = newState(0, 0.1, 20);
  run(s, { fwd: 0, right: 0, jump: false, yaw: 0 }, 30);
  let maxY = s.y;
  for (let i = 0; i < 90; i++) {
    stepMove(s, { fwd: 0, right: 0, jump: i < 2, yaw: 0 }, DT, world);
    maxY = Math.max(maxY, s.y);
  }
  const expected = (PHYS.jumpSpeed * PHYS.jumpSpeed) / (2 * PHYS.gravity);
  assert.ok(Math.abs(maxY - expected) < 0.15, `apex ${maxY} vs expected ${expected}`);
});

test('perimeter wall blocks movement', () => {
  const s = run(newState(0, 0.1, -44), { fwd: 1, right: 0, jump: false, yaw: 0 }, 120);
  assert.ok(s.z > -48.2, `wall should block, got z=${s.z}`);
});

test('climbs stairs via step-up onto the central platform', () => {
  const s = run(newState(-13, 0.1, 0), { fwd: 1, right: 0, jump: false, yaw: -Math.PI / 2 }, 140);
  assert.ok(s.x > -7.5, `should cross onto platform, got x=${s.x}`);
  assert.ok(Math.abs(s.y - 2.5) < 0.1, `should stand at platform height 2.5, got y=${s.y}`);
});

test('deterministic: same inputs produce identical states', () => {
  const a = run(newState(5, 0.1, 5), { fwd: 1, right: 1, jump: true, yaw: 0.7 }, 200);
  const b = run(newState(5, 0.1, 5), { fwd: 1, right: 1, jump: true, yaw: 0.7 }, 200);
  assert.equal(a.x, b.x);
  assert.equal(a.y, b.y);
  assert.equal(a.z, b.z);
});
