import {
  BTN,
  PHYS,
  lineOfSightClear,
  type InputMsg,
} from '@open-venge/shared';
import type { Player, Room } from './room';

const NAMES = [
  'Rekt', 'Skye', 'Blitz', 'Nova', 'Rook', 'Pip', 'Vex', 'Ash',
  'Juno', 'Kilo', 'Mira', 'Onyx', 'Faze', 'Rust', 'Echo', 'Wisp',
];

export class BotBrain {
  navTarget: { x: number; y: number; z: number } | null = null;
  nextThinkTick = 0;
  strafe = 0;
  strafeTick = 0;
  targetId = -1;
  lastX = 0;
  lastZ = 0;
  stuckTicks = 0;
  jumpUntilTick = 0;

  static randomName(): string {
    return NAMES[Math.floor(Math.random() * NAMES.length)] + '-' + Math.floor(Math.random() * 90 + 10);
  }

  think(room: Room, bot: Player, tick: number): InputMsg | null {
    if (tick < this.nextThinkTick) return null;
    this.nextThinkTick = tick + 6;

    if (bot.dead) return null;

    let target: Player | null = null;
    let bestDist = 60;
    const [ex, ey, ez] = bot.eye();
    for (const v of room.players) {
      if (v === bot || !v.joined || v.dead) continue;
      const d = Math.hypot(v.state.x - bot.state.x, v.state.z - bot.state.z);
      if (d < bestDist && lineOfSightClear(room.world, ex, ey, ez, v.state.x, v.state.y + PHYS.eyeHeight, v.state.z)) {
        bestDist = d;
        target = v;
      }
    }
    this.targetId = target ? target.id : -1;

    if (tick >= this.strafeTick) {
      this.strafeTick = tick + 25 + Math.floor(Math.random() * 45);
      this.strafe = [0, 1, -1][Math.floor(Math.random() * 3)];
    }

    let btn = 0;
    let yaw = bot.yaw;
    let pitch = 0;

    if (target) {
      const t = target.state;
      yaw = Math.atan2(-(t.x - bot.state.x), -(t.z - bot.state.z));
      const wobble = Math.sin(tick * 0.11 + bot.id * 2.7) * 0.045;
      const wobbleP = Math.cos(tick * 0.09 + bot.id) * 0.025;
      const dh = Math.hypot(t.x - bot.state.x, t.z - bot.state.z);
      pitch = Math.atan2(t.y + PHYS.eyeHeight * 0.85 - ey, dh) + wobbleP;
      yaw += wobble;
      btn |= BTN.SHOOT;
      if (this.strafe !== 0) btn |= this.strafe > 0 ? BTN.RIGHT : BTN.LEFT;
      if (bestDist < 5) btn = (btn & ~BTN.SHOOT) | BTN.BACK;
      if (bestDist > 25) btn |= BTN.FWD;
    } else {
      if (!this.navTarget || Math.hypot(this.navTarget.x - bot.state.x, this.navTarget.z - bot.state.z) < 2.5) {
        const nav = room.map.nav;
        this.navTarget = nav[Math.floor(Math.random() * nav.length)];
      }
      const n = this.navTarget;
      if (n) {
        yaw = Math.atan2(-(n.x - bot.state.x), -(n.z - bot.state.z));
        btn |= BTN.FWD;
        if (n.y > bot.state.y + 1) btn |= BTN.JUMP;
      }
    }

    if (Math.hypot(bot.state.x - this.lastX, bot.state.z - this.lastZ) < 0.25) {
      this.stuckTicks += 6;
    } else {
      this.stuckTicks = 0;
    }
    this.lastX = bot.state.x;
    this.lastZ = bot.state.z;
    if (this.stuckTicks > 24) {
      btn |= BTN.JUMP;
      if (this.stuckTicks > 120) {
        this.stuckTicks = 0;
        this.navTarget = null;
      }
    }

    return { t: 'input', seq: tick, btn, yaw, pitch };
  }
}
