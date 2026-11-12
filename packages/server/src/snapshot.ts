import { GAME, type SnapshotMsg, type SnapshotPlayer } from '@open-venge/shared';
import type { Room } from './room';

export function buildSnapshot(room: Room): SnapshotMsg {
  const players: SnapshotPlayer[] = room.snapshotPlayers();
  const acks: Record<string, number> = {};
  for (const p of room.players) {
    if (!p.bot && p.ws) acks[String(p.id)] = p.lastSeq;
  }
  return {
    t: 'snapshot',
    tick: room.tick,
    acks,
    matchTime: room.timeLeftMs(),
    phase: room.phase,
    scoreLimit: GAME.scoreLimit,
    players,
  };
}
