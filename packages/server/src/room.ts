import {
  BTN,
  FOUNDRY,
  GAME,
  HISTORY_TICKS,
  INTERP_DELAY_MS,
  MAX_PLAYERS,
  PHYS,
  SNAPSHOT_EVERY,
  TICK_DT,
  WEAPONS,
  damageAtRange,
  fireIntervalMs,
  isWeaponId,
  lineOfSightClear,
  parseClientMsg,
  rayCharacter,
  raycastWorld,
  spreadDirection,
  stepMove,
  toCollisionBoxes,
  viewAnglesToDir,
  type CollisionWorld,
  type GameEvent,
  type InputMsg,
  type MoveInput,
  type MoveState,
  type ServerMsg,
  type SnapshotPlayer,
  type WeaponId,
} from '@open-venge/shared';
import type { WebSocket } from 'ws';
import { BotBrain } from './bots';
import { buildSnapshot } from './snapshot';

export const TICK_MS = 1000 / 60;

const msToTicks = (ms: number): number => Math.round(ms / TICK_MS);
const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export class Player {
  id: number;
  name = '';
  bot = false;
  joined = false;
  ws: WebSocket | null = null;
  state: MoveState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: false };
  yaw = 0;
  pitch = 0;
  hp: number = PHYS.maxHealth;
  dead = true;
  respawnTick = 0;
  protectedTick = 0;
  kills = 0;
  deaths = 0;
  loadout: WeaponId = 'rifle';
  slot: 'primary' | 'secondary' = 'primary';
  ammo: [number, number] = [30, 12];
  reloadEndTick = -1;
  switchEndTick = -1;
  nextFireTick = 0;
  lastSeq = 0;
  heldBtn = 0;
  queue: InputMsg[] = [];
  ping = 0;
  lastRecvMs = Date.now();
  rateCount = 0;
  rateWindowStart = 0;
  historyPos = new Float32Array(HISTORY_TICKS * 3);
  historyTick = new Int32Array(HISTORY_TICKS).fill(-1);
  brain = new BotBrain();

  constructor(id: number) {
    this.id = id;
  }

  weapon(): WeaponId {
    return this.slot === 'primary' ? this.loadout : 'pistol';
  }

  eye(): [number, number, number] {
    return [this.state.x, this.state.y + PHYS.eyeHeight, this.state.z];
  }
}

export class Room {
  readonly world: CollisionWorld;
  readonly map = FOUNDRY;
  readonly players = new Set<Player>();
  tick = 0;
  phase: 'live' | 'end' = 'live';
  matchEndTick: number;
  endPauseEndTick = 0;
  private eventsByConn = new Map<number, GameEvent[]>();
  private timer: NodeJS.Timeout | null = null;
  private nextId = 1;
  private readonly botCount: number;

  constructor(botCount = 0) {
    this.world = { boxes: toCollisionBoxes(this.map) };
    this.matchEndTick = msToTicks(GAME.matchTimeMs);
    this.botCount = botCount;
  }

  start(): void {
    for (let i = 0; i < this.botCount; i++) {
      if (this.players.size >= MAX_PLAYERS) break;
      const bot = new Player(this.nextId++);
      bot.bot = true;
      bot.joined = true;
      bot.name = BotBrain.randomName();
      bot.loadout = 'rifle';
      this.players.add(bot);
      this.respawn(bot);
    }
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.pump(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  pump(): void {
    try {
      this.step();
    } catch (err) {
      console.error('room step error', err);
    }
  }

  addConnection(ws: WebSocket): void {
    const player = new Player(this.nextId++);
    player.ws = ws;
    this.players.add(player);
    ws.on('message', (data, isBinary) => {
      player.lastRecvMs = Date.now();
      if (isBinary) return;
      this.handleMessage(player, data.toString());
    });
    ws.on('close', () => this.removePlayer(player));
    ws.on('error', () => this.removePlayer(player));
  }

  removePlayer(player: Player): void {
    if (!this.players.has(player)) return;
    this.players.delete(player);
    if (player.joined) {
      this.broadcast({ e: 'leave', id: player.id });
    }
  }

  private handleMessage(player: Player, raw: string): void {
    if (raw.length > GAME.maxMsgBytes) return;
    const now = Date.now();
    if (now - player.rateWindowStart >= 1000) {
      player.rateWindowStart = now;
      player.rateCount = 0;
    }
    player.rateCount++;
    if (player.rateCount > GAME.maxInputRatePerSec * 2) return;

    const msg = parseClientMsg(raw);
    if (!msg) return;

    switch (msg.t) {
      case 'join': {
        if (player.joined) return;
        if (this.countHumans() >= MAX_PLAYERS) {
          this.send(player.ws, { t: 'reject', reason: 'Server full' });
          return;
        }
        player.name = msg.name;
        player.loadout = msg.loadout;
        player.joined = true;
        this.send(player.ws, {
          t: 'welcome',
          id: player.id,
          tick: this.tick,
          map: this.map,
        });
        this.send(player.ws, { t: 'match', phase: 'start' });
        this.respawn(player);
        break;
      }
      case 'input': {
        player.lastSeq = msg.seq;
        if (!player.joined) return;
        if (player.queue.length < 16) player.queue.push(msg);
        break;
      }
      case 'weapon': {
        if (!player.joined || player.dead) return;
        if (player.slot === msg.slot) return;
        player.slot = msg.slot;
        player.reloadEndTick = -1;
        player.switchEndTick = this.tick + msToTicks(WEAPONS[player.weapon()].switchMs);
        player.nextFireTick = Math.max(player.nextFireTick, player.switchEndTick);
        break;
      }
      case 'reload': {
        this.startReload(player);
        break;
      }
      case 'ping': {
        this.send(player.ws, { t: 'pong', time: msg.time });
        break;
      }
    }
  }

  private countHumans(): number {
    let n = 0;
    for (const p of this.players) if (!p.bot) n++;
    return n;
  }

  step(): void {
    this.tick++;

    for (const p of this.players) {
      if (!p.joined) continue;

      if (p.bot) {
        const input = p.brain.think(this, p, this.tick);
        if (input) p.queue.push(input);
      }

      const inputs = p.queue;
      p.queue = [];
      if (inputs.length === 0) {
        inputs.push({
          t: 'input',
          seq: p.lastSeq,
          btn: p.dead ? 0 : p.heldBtn,
          yaw: p.yaw,
          pitch: p.pitch,
        });
      }

      for (const inp of inputs) {
        p.lastSeq = inp.seq;
        p.yaw = inp.yaw;
        p.pitch = inp.pitch;
        if (p.dead) continue;
        const mi: MoveInput = {
          fwd: (inp.btn & BTN.FWD ? 1 : 0) - (inp.btn & BTN.BACK ? 1 : 0),
          right: (inp.btn & BTN.RIGHT ? 1 : 0) - (inp.btn & BTN.LEFT ? 1 : 0),
          jump: (inp.btn & BTN.JUMP) !== 0,
          yaw: inp.yaw,
        };
        p.heldBtn = inp.btn;
        stepMove(p.state, mi, TICK_DT, this.world);
      }

      if (p.dead) {
        if (this.tick >= p.respawnTick && this.phase === 'live') {
          this.respawn(p);
        }
        continue;
      }

      if ((p.heldBtn & BTN.SHOOT) !== 0) this.tryFire(p);

      if (p.reloadEndTick > 0 && this.tick >= p.reloadEndTick) {
        const w = WEAPONS[p.weapon()];
        const idx = p.slot === 'primary' ? 0 : 1;
        p.ammo[idx] = w.magSize;
        p.reloadEndTick = -1;
      }

      const idx = this.tick % HISTORY_TICKS;
      p.historyTick[idx] = this.tick;
      p.historyPos[idx * 3] = p.state.x;
      p.historyPos[idx * 3 + 1] = p.state.y;
      p.historyPos[idx * 3 + 2] = p.state.z;
    }

    this.updateMatch();

    if (this.tick % (SNAPSHOT_EVERY * 6) === 0) this.dropTimedOut();
    if (this.tick % SNAPSHOT_EVERY === 0) this.broadcastSnapshot();
  }

  private dropTimedOut(): void {
    const now = Date.now();
    for (const p of [...this.players]) {
      if (!p.bot && now - p.lastRecvMs > 45000) {
        this.removePlayer(p);
        p.ws?.terminate();
      }
    }
  }

  private startReload(p: Player): void {
    if (!p.joined || p.dead || p.reloadEndTick > 0) return;
    if (this.tick < p.switchEndTick) return;
    const w = WEAPONS[p.weapon()];
    const idx = p.slot === 'primary' ? 0 : 1;
    if (p.ammo[idx] >= w.magSize) return;
    p.reloadEndTick = this.tick + msToTicks(w.reloadMs);
  }

  weaponOf(p: Player) {
    return WEAPONS[p.weapon()];
  }

  private tryFire(p: Player): void {
    const w = this.weaponOf(p);
    if (this.phase !== 'live') return;
    if (this.tick < p.nextFireTick || this.tick < p.switchEndTick) return;
    if (p.reloadEndTick > 0) return;
    const idx = p.slot === 'primary' ? 0 : 1;
    if (p.ammo[idx] <= 0) {
      this.startReload(p);
      return;
    }
    p.ammo[idx]--;
    p.nextFireTick = this.tick + Math.max(1, Math.ceil(fireIntervalMs(w) / TICK_MS));

    const [ex, ey, ez] = p.eye();
    const [dx0, dy0, dz0] = viewAnglesToDir(p.yaw, p.pitch);
    const ads = (p.heldBtn & BTN.ADS) !== 0;
    const moving =
      Math.hypot(p.state.vx, p.state.vz) > 1.5 || !p.state.onGround;
    const spread =
      w.spread *
      (ads ? w.adsSpreadMult : 1) *
      (moving ? w.moveSpreadMult : 1);

    let closestT = Infinity;
    for (let i = 0; i < w.pellets; i++) {
      const [dx, dy, dz] = spreadDirection(dx0, dy0, dz0, spread, Math.random);
      const worldHit = raycastWorld(this.world, ex, ey, ez, dx, dy, dz, w.range);
      const wallT = worldHit ? worldHit.t : Infinity;

      const rewindTicks = clamp(
        Math.round((p.ping / 2 + INTERP_DELAY_MS) / TICK_MS),
        0,
        HISTORY_TICKS - 1,
      );
      const targetTick = this.tick - rewindTicks;

      let bestT = Math.min(wallT, w.range);
      let victim: Player | null = null;
      let headshot = false;
      for (const v of this.players) {
        if (v === p || !v.joined || v.dead) continue;
        const pos = this.sampleHistory(v, targetTick) ?? v.state;
        const ch = rayCharacter(ex, ey, ez, dx, dy, dz, pos, bestT);
        if (ch) {
          bestT = ch.t;
          victim = v;
          headshot = ch.headshot;
        }
      }

      if (victim) {
        const dmg = Math.round(damageAtRange(w, bestT) * (headshot ? w.headshotMult : 1));
        this.applyDamage(victim, dmg, p, p.weapon(), headshot, ex + dx * bestT, ey + dy * bestT, ez + dz * bestT);
        closestT = Math.min(closestT, bestT);
      } else if (worldHit) {
        closestT = Math.min(closestT, worldHit.t);
        this.emit(p, {
          e: 'impact',
          x: ex + dx * worldHit.t,
          y: ey + dy * worldHit.t,
          z: ez + dz * worldHit.t,
          nx: worldHit.nx,
          ny: worldHit.ny,
          nz: worldHit.nz,
        });
      } else {
        closestT = Math.min(closestT, w.range);
      }
    }

    this.broadcastExcept(p, {
      e: 'shot',
      by: p.id,
      o: [round2(ex), round2(ey), round2(ez)],
      d: [round4(dx0), round4(dy0), round4(dz0)],
      w: p.weapon(),
      len: round2(Number.isFinite(closestT) ? closestT : w.range),
    });
  }

  private applyDamage(
    victim: Player,
    dmg: number,
    attacker: Player,
    weapon: WeaponId,
    headshot: boolean,
    hx: number,
    hy: number,
    hz: number,
  ): void {
    if (victim.dead || this.phase !== 'live') return;
    if (this.tick < victim.protectedTick) return;
    victim.hp -= dmg;

    this.emit(attacker, {
      e: 'hit',
      victim: victim.id,
      dmg,
      hs: headshot,
      x: round2(hx),
      y: round2(hy),
      z: round2(hz),
    });
    const len = Math.hypot(attacker.state.x - victim.state.x, attacker.state.z - victim.state.z) || 1;
    this.emit(victim, {
      e: 'damaged',
      by: attacker.id,
      dmg,
      hs: headshot,
      dirX: (attacker.state.x - victim.state.x) / len,
      dirZ: (attacker.state.z - victim.state.z) / len,
    });

    if (victim.hp <= 0) {
      this.kill(victim, attacker, weapon, headshot);
    }
  }

  private kill(victim: Player, killer: Player, weapon: WeaponId, headshot: boolean): void {
    victim.hp = 0;
    victim.dead = true;
    victim.deaths++;
    victim.respawnTick = this.tick + msToTicks(GAME.respawnMs);
    victim.reloadEndTick = -1;
    if (killer !== victim) killer.kills++;

    this.broadcast({
      e: 'kill',
      killer: killer.id,
      victim: victim.id,
      w: weapon,
      hs: headshot,
    });
    this.send(victim.ws, { t: 'died', by: killer.id, respawnMs: GAME.respawnMs });

    if (killer.kills >= GAME.scoreLimit) {
      this.endMatch();
    }
  }

  respawn(p: Player): void {
    const sp = this.pickSpawn(p);
    p.state = { x: sp.x, y: sp.y, z: sp.z, vx: 0, vy: 0, vz: 0, onGround: true };
    p.yaw = sp.yaw;
    p.pitch = 0;
    p.hp = PHYS.maxHealth;
    p.dead = false;
    p.slot = 'primary';
    p.ammo = [WEAPONS[p.loadout].magSize, WEAPONS.pistol.magSize];
    p.reloadEndTick = -1;
    p.switchEndTick = -1;
    p.nextFireTick = this.tick + msToTicks(400);
    p.protectedTick = this.tick + msToTicks(GAME.spawnProtectionMs);
    p.queue.length = 0;
    p.heldBtn = 0;

    this.broadcast({ e: 'spawn', id: p.id });
    this.send(p.ws, {
      t: 'spawn',
      x: sp.x,
      y: sp.y,
      z: sp.z,
      yaw: sp.yaw,
      hp: p.hp,
    });
  }

  private pickSpawn(p: Player): { x: number; y: number; z: number; yaw: number } {
    let best = this.map.spawns[0];
    let bestScore = -1;
    for (const sp of this.map.spawns) {
      let minDist = Infinity;
      for (const other of this.players) {
        if (other === p || !other.joined || other.dead) continue;
        const d = Math.hypot(other.state.x - sp.x, other.state.z - sp.z);
        if (d < minDist) minDist = d;
      }
      const score = Math.min(minDist, 100) + Math.random() * 5;
      if (score > bestScore) {
        bestScore = score;
        best = sp;
      }
    }
    return best;
  }

  sampleHistory(p: Player, tick: number): MoveState | null {
    const idx = ((tick % HISTORY_TICKS) + HISTORY_TICKS) % HISTORY_TICKS;
    if (p.historyTick[idx] !== tick) return null;
    return {
      x: p.historyPos[idx * 3],
      y: p.historyPos[idx * 3 + 1],
      z: p.historyPos[idx * 3 + 2],
      vx: 0,
      vy: 0,
      vz: 0,
      onGround: true,
    };
  }

  emit(p: Player, ev: GameEvent): void {
    if (p.bot || !p.ws) return;
    let list = this.eventsByConn.get(p.id);
    if (!list) {
      list = [];
      this.eventsByConn.set(p.id, list);
    }
    list.push(ev);
  }

  broadcast(ev: GameEvent): void {
    for (const p of this.players) {
      if (p.bot || !p.ws) continue;
      this.emit(p, ev);
    }
  }

  broadcastExcept(p: Player, ev: GameEvent): void {
    for (const other of this.players) {
      if (other === p || other.bot || !other.ws) continue;
      this.emit(other, ev);
    }
  }

  send(ws: WebSocket | null, msg: ServerMsg): void {
    if (!ws) return;
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket closing */
    }
  }

  private broadcastSnapshot(): void {
    const snapshot = buildSnapshot(this);
    const payload = JSON.stringify(snapshot);
    for (const p of this.players) {
      if (p.bot || !p.ws) continue;
      const events = this.eventsByConn.get(p.id);
      this.eventsByConn.delete(p.id);
      try {
        if (events && events.length > 0) {
          p.ws.send(JSON.stringify({ t: 'events', list: events } satisfies ServerMsg));
        }
        p.ws.send(payload);
      } catch {
        /* socket closing */
      }
    }
    for (const list of this.eventsByConn.values()) list.length = 0;
    this.eventsByConn.clear();
  }

  private updateMatch(): void {
    if (this.phase === 'live') {
      const timeUp = this.tick >= this.matchEndTick;
      const scoreReached = [...this.players].some((p) => p.kills >= GAME.scoreLimit);
      if (timeUp || scoreReached) this.endMatch();
    } else if (this.tick >= this.endPauseEndTick) {
      this.startMatch();
    }
  }

  private endMatch(): void {
    if (this.phase === 'end') return;
    this.phase = 'end';
    this.endPauseEndTick = this.tick + msToTicks(GAME.endPauseMs);
    const scores = this.sortedScores();
    for (const p of this.players) {
      if (p.bot || !p.ws) continue;
      this.send(p.ws, { t: 'match', phase: 'end', scores });
    }
  }

  private startMatch(): void {
    this.phase = 'live';
    this.matchEndTick = this.tick + msToTicks(GAME.matchTimeMs);
    for (const p of this.players) {
      p.kills = 0;
      p.deaths = 0;
      if (p.joined) this.respawn(p);
    }
    for (const p of this.players) {
      if (p.bot || !p.ws) continue;
      this.send(p.ws, { t: 'match', phase: 'start' });
    }
  }

  sortedScores(): { id: number; name: string; kills: number; deaths: number }[] {
    return [...this.players]
      .filter((p) => p.joined)
      .map((p) => ({ id: p.id, name: p.name, kills: p.kills, deaths: p.deaths }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  }

  snapshotPlayers(): SnapshotPlayer[] {
    const out: SnapshotPlayer[] = [];
    for (const p of this.players) {
      if (!p.joined) continue;
      out.push({
        id: p.id,
        name: p.name,
        x: round2(p.state.x),
        y: round2(p.state.y),
        z: round2(p.state.z),
        yaw: round4(p.yaw),
        pitch: round4(p.pitch),
        hp: Math.max(0, p.hp),
        w: p.weapon(),
        ammo: p.ammo[p.slot === 'primary' ? 0 : 1],
        slot: p.slot,
        flags: p.dead ? 1 : 0,
        kills: p.kills,
        deaths: p.deaths,
        ping: p.ping,
      });
    }
    return out;
  }

  timeLeftMs(): number {
    if (this.phase === 'end') return 0;
    return Math.max(0, Math.round((this.matchEndTick - this.tick) * TICK_MS));
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
