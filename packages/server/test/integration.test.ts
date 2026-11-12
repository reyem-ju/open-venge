import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { GAME, PHYS, TICK_DT, WEAPONS, viewAnglesToDir, type ServerMsg } from '@open-venge/shared';
import { Room } from '../src/room';

class FakeWS extends EventEmitter {
  sent: ServerMsg[] = [];
  terminated = false;

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ServerMsg);
  }

  terminate(): void {
    this.terminated = true;
  }

  clientSend(obj: unknown): void {
    this.emit('message', Buffer.from(JSON.stringify(obj)), false);
  }

  last(): ServerMsg | undefined {
    return this.sent[this.sent.length - 1];
  }

  all(pred: (m: ServerMsg) => boolean): ServerMsg[] {
    return this.sent.filter(pred);
  }
}

function stepTicks(room: Room, n: number): void {
  for (let i = 0; i < n; i++) room.step();
}

function joinPlayer(room: Room, name: string): FakeWS {
  const ws = new FakeWS();
  room.addConnection(ws as never);
  ws.clientSend({ t: 'join', name, loadout: 'rifle' });
  stepTicks(room, 5);
  return ws;
}

function findSent(ws: FakeWS, t: string): ServerMsg[] {
  return ws.sent.filter((m) => m.t === t);
}

test('join produces welcome, spawn and snapshots', () => {
  const room = new Room(0);
  const ws = joinPlayer(room, 'Alice');
  const welcome = findSent(ws, 'welcome')[0];
  assert.ok(welcome && welcome.t === 'welcome');
  assert.equal(welcome.map.name, 'Foundry');
  assert.ok(findSent(ws, 'spawn').length > 0, 'should spawn');
  const snaps = findSent(ws, 'snapshot');
  assert.ok(snaps.length > 0, 'should receive snapshots');
  const snap = snaps[snaps.length - 1];
  assert.ok(snap.t === 'snapshot');
  assert.ok(snap.players.length >= 1);
  assert.ok(String(welcome.id) in snap.acks, 'snapshot carries my ack');
});

test('movement input moves the player server-side', () => {
  const room = new Room(0);
  const ws = joinPlayer(room, 'Runner');
  const welcome = findSent(ws, 'welcome')[0];
  assert.ok(welcome && welcome.t === 'welcome');
  const id = welcome.id;
  const before = findSent(ws, 'spawn')[0];
  assert.ok(before && before.t === 'spawn');

  for (let i = 0; i < 60; i++) {
    ws.clientSend({ t: 'input', seq: i + 1, btn: 1, yaw: 0, pitch: 0 });
  }
  stepTicks(room, 65);
  const snaps = findSent(ws, 'snapshot');
  const last = snaps[snaps.length - 1];
  assert.ok(last && last.t === 'snapshot');
  const me = last.players.find((p) => p.id === id);
  assert.ok(me, 'player present in snapshot');
  assert.ok(me.z < before.z - 4, `moved toward -z: ${me.z} vs ${before.z}`);
});

test('players can kill each other; kill events and respawn flow', () => {
  const room = new Room(0);
  const wsA = joinPlayer(room, 'Alice');
  const wsB = joinPlayer(room, 'Bob');
  const idA = (findSent(wsA, 'welcome')[0] as { id: number }).id;
  const idB = (findSent(wsB, 'welcome')[0] as { id: number }).id;

  const pa = room.snapshotPlayers().find((p) => p.id === idA)!;
  const pb = room.snapshotPlayers().find((p) => p.id === idB)!;

  const a = [...room.players].find((p) => p.id === idA)!;
  const b = [...room.players].find((p) => p.id === idB)!;
  a.state = { x: pb.x, y: pb.y, z: pb.z + 6, vx: 0, vy: 0, vz: 0, onGround: true };
  b.state = { x: pb.x, y: pb.y, z: pb.z, vx: 0, vy: 0, vz: 0, onGround: true };
  b.dead = false;

  stepTicks(room, 30);

  const dir = viewAnglesToDir(a.yaw, a.pitch);
  void dir;
  const aimYaw = Math.atan2(-(b.state.x - a.state.x), -(b.state.z - a.state.z));
  for (let i = 0; i < 90; i++) {
    wsA.clientSend({ t: 'input', seq: 100 + i, btn: 32, yaw: aimYaw, pitch: 0 });
  }
  stepTicks(room, 95);

  const kills = wsA.sent.filter((m) => m.t === 'events' && m.list.some((e) => e.e === 'kill' && e.victim === idB));
  assert.ok(kills.length > 0, 'Alice should have killed Bob');
  assert.equal(a.kills, 1);
  assert.equal(b.deaths, 1);
  assert.equal(b.dead, true);

  const hits = wsA.sent.filter((m) => m.t === 'events' && m.list.some((e) => e.e === 'hit'));
  assert.ok(hits.length > 0, 'shooter receives hit events');

  stepTicks(room, Math.ceil(GAME.respawnMs / (TICK_DT * 1000)) + 10);
  assert.equal(b.dead, false, 'Bob respawns after respawn time');
  assert.equal(b.hp, PHYS.maxHealth);
});

test('spawn protection blocks immediate damage', () => {
  const room = new Room(0);
  const wsA = joinPlayer(room, 'Alice');
  const wsB = joinPlayer(room, 'Bob');
  const idA = (findSent(wsA, 'welcome')[0] as { id: number }).id;
  const idB = (findSent(wsB, 'welcome')[0] as { id: number }).id;
  const a = [...room.players].find((p) => p.id === idA)!;
  const b = [...room.players].find((p) => p.id === idB)!;
  b.dead = false;
  b.protectedTick = room.tick + 1000;
  const hpBefore = b.hp;
  a.state = { x: b.state.x, y: b.state.y, z: b.state.z + 3, vx: 0, vy: 0, vz: 0, onGround: true };
  const aimYaw = Math.atan2(-(b.state.x - a.state.x), -(b.state.z - a.state.z));
  for (let i = 0; i < 30; i++) {
    wsA.clientSend({ t: 'input', seq: 200 + i, btn: 32, yaw: aimYaw, pitch: 0 });
  }
  stepTicks(room, 35);
  assert.equal(b.hp, hpBefore, 'protected player takes no damage');
});

test('malformed messages do not crash the room', () => {
  const room = new Room(0);
  const ws = new FakeWS();
  room.addConnection(ws as never);
  ws.emit('message', Buffer.from('garbage{{{'), false);
  ws.emit('message', Buffer.from(JSON.stringify({ t: 'input', seq: -5, btn: 9999, yaw: 0, pitch: 0 })), false);
  stepTicks(room, 3);
  assert.ok(room.tick > 0);
});

test('weapon switch and reload messages are accepted', () => {
  const room = new Room(0);
  const ws = joinPlayer(room, 'Alice');
  ws.clientSend({ t: 'weapon', slot: 'secondary' });
  ws.clientSend({ t: 'reload' });
  stepTicks(room, 5);
  const p = [...room.players].find((x) => !x.bot)!;
  assert.equal(p.slot, 'secondary');
  assert.ok(p.reloadEndTick > 0 || p.ammo[1] === WEAPONS.pistol.magSize);
});

test('disconnect removes the player and broadcasts leave', () => {
  const room = new Room(0);
  const wsA = joinPlayer(room, 'Alice');
  const wsB = joinPlayer(room, 'Bob');
  stepTicks(room, 3);
  const idA = (findSent(wsA, 'welcome')[0] as { id: number }).id;
  wsA.emit('close');
  stepTicks(room, 3);
  const leaves = wsB.sent.filter(
    (m) => m.t === 'events' && m.list.some((e) => e.e === 'leave' && e.id === idA),
  );
  assert.ok(leaves.length > 0, 'other players see the leave event');
  assert.ok(!room.snapshotPlayers().some((p) => p.id === idA));
});
