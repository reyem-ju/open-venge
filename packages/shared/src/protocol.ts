import { GAME, isWeaponId, type WeaponId } from './constants';
import type { GameMap } from './world';

export interface JoinMsg {
  t: 'join';
  name: string;
  loadout: WeaponId;
}

export interface InputMsg {
  t: 'input';
  seq: number;
  btn: number;
  yaw: number;
  pitch: number;
}

export interface WeaponMsg {
  t: 'weapon';
  slot: 'primary' | 'secondary';
}

export interface ReloadMsg {
  t: 'reload';
}

export interface PingMsg {
  t: 'ping';
  time: number;
}

export type ClientMsg = JoinMsg | InputMsg | WeaponMsg | ReloadMsg | PingMsg;

const isFiniteNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

export function parseClientMsg(raw: string): ClientMsg | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const m = obj as Record<string, unknown>;

  switch (m.t) {
    case 'join': {
      if (typeof m.name !== 'string') return null;
      if (!isWeaponId(m.loadout)) return null;
      const name = m.name.slice(0, GAME.maxNameLen).replace(/[^\p{L}\p{N} _.-]/gu, '').trim();
      return { t: 'join', name: name || 'Player', loadout: m.loadout };
    }
    case 'input': {
      if (!isFiniteNum(m.seq) || !isFiniteNum(m.btn) || !isFiniteNum(m.yaw) || !isFiniteNum(m.pitch)) return null;
      const seq = m.seq;
      if (seq < 0 || seq > 4294967295) return null;
      const btn = Math.floor(m.btn);
      if (btn < 0 || btn > 255) return null;
      return {
        t: 'input',
        seq,
        btn,
        yaw: m.yaw,
        pitch: Math.max(-1.55, Math.min(1.55, m.pitch)),
      };
    }
    case 'weapon': {
      if (m.slot !== 'primary' && m.slot !== 'secondary') return null;
      return { t: 'weapon', slot: m.slot };
    }
    case 'reload':
      return { t: 'reload' };
    case 'ping': {
      if (!isFiniteNum(m.time)) return null;
      return { t: 'ping', time: m.time };
    }
    default:
      return null;
  }
}

export interface SnapshotPlayer {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  hp: number;
  w: WeaponId;
  ammo: number;
  slot: 'primary' | 'secondary';
  flags: number;
  kills: number;
  deaths: number;
  ping: number;
}

export const PLF_DEAD = 1;
export const PLF_ADS = 2;

export interface ShotEvent {
  e: 'shot';
  by: number;
  o: [number, number, number];
  d: [number, number, number];
  w: WeaponId;
  len: number;
}

export interface HitEvent {
  e: 'hit';
  victim: number;
  dmg: number;
  hs: boolean;
  x: number;
  y: number;
  z: number;
}

export interface DamagedEvent {
  e: 'damaged';
  by: number;
  dmg: number;
  hs: boolean;
  dirX: number;
  dirZ: number;
}

export interface KillEvent {
  e: 'kill';
  killer: number;
  victim: number;
  w: WeaponId;
  hs: boolean;
}

export interface ImpactEvent {
  e: 'impact';
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
}

export interface SpawnEvent {
  e: 'spawn';
  id: number;
}

export interface LeaveEvent {
  e: 'leave';
  id: number;
}

export type GameEvent =
  | ShotEvent
  | HitEvent
  | DamagedEvent
  | KillEvent
  | ImpactEvent
  | SpawnEvent
  | LeaveEvent;

export interface SnapshotMsg {
  t: 'snapshot';
  tick: number;
  acks: Record<string, number>;
  matchTime: number;
  phase: 'live' | 'end';
  scoreLimit: number;
  players: SnapshotPlayer[];
}

export interface WelcomeMsg {
  t: 'welcome';
  id: number;
  tick: number;
  map: GameMap;
}

export interface SpawnMsg {
  t: 'spawn';
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
}

export interface DiedMsg {
  t: 'died';
  by: number;
  respawnMs: number;
}

export interface EventsMsg {
  t: 'events';
  list: GameEvent[];
}

export interface MatchMsg {
  t: 'match';
  phase: 'start' | 'end';
  scores?: { id: number; name: string; kills: number; deaths: number }[];
}

export interface PongMsg {
  t: 'pong';
  time: number;
}

export interface RejectMsg {
  t: 'reject';
  reason: string;
}

export type ServerMsg =
  | WelcomeMsg
  | SnapshotMsg
  | SpawnMsg
  | DiedMsg
  | EventsMsg
  | MatchMsg
  | PongMsg
  | RejectMsg;
