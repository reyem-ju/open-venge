import { PHYS } from './constants';
import type { CollisionWorld } from './world';
import { playerOverlapsWorld } from './world';

export interface MoveState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  onGround: boolean;
}

export interface MoveInput {
  fwd: number;
  right: number;
  jump: boolean;
  yaw: number;
}

const EPS = 1e-4;
const R = PHYS.playerRadius;
const H = PHYS.playerHeight;

export function stepMove(
  s: MoveState,
  inp: MoveInput,
  dt: number,
  world: CollisionWorld,
): void {
  let wishX = 0;
  let wishZ = 0;
  if (inp.fwd !== 0 || inp.right !== 0) {
    const sin = Math.sin(inp.yaw);
    const cos = Math.cos(inp.yaw);
    wishX = -sin * inp.fwd + cos * inp.right;
    wishZ = -cos * inp.fwd - sin * inp.right;
    const len = Math.hypot(wishX, wishZ);
    if (len > 1e-9) {
      wishX /= len;
      wishZ /= len;
    } else {
      wishX = 0;
      wishZ = 0;
    }
  }

  if (s.onGround) {
    const speed = Math.hypot(s.vx, s.vz);
    if (speed > 0.001) {
      const drop = speed * PHYS.friction * dt;
      const scale = Math.max(0, speed - drop) / speed;
      s.vx *= scale;
      s.vz *= scale;
    } else {
      s.vx = 0;
      s.vz = 0;
    }
  }

  if (wishX !== 0 || wishZ !== 0) {
    const current = s.vx * wishX + s.vz * wishZ;
    const add = PHYS.moveSpeed - current;
    if (add > 0) {
      const accel = s.onGround ? PHYS.groundAccel : PHYS.airAccel;
      const acc = Math.min(accel * PHYS.moveSpeed * dt, add);
      s.vx += wishX * acc;
      s.vz += wishZ * acc;
    }
  }

  if (inp.jump && s.onGround) {
    s.vy = PHYS.jumpSpeed;
    s.onGround = false;
  }

  s.vy -= PHYS.gravity * dt;
  if (s.vy < -PHYS.terminalVelocity) s.vy = -PHYS.terminalVelocity;

  moveWithCollisions(s, dt, world);
}

function overlapsAny(x: number, y: number, z: number, world: CollisionWorld): boolean {
  return playerOverlapsWorld(x, y, z, world);
}

function resolveHorizontal(
  s: MoveState,
  axis: 'x' | 'z',
  delta: number,
  world: CollisionWorld,
): void {
  if (delta === 0) return;
  s[axis] += delta;
  for (const b of world.boxes) {
    if (!playerOverlapsWorld(s.x, s.y, s.z, { boxes: [b] })) continue;
    const stepUp =
      s.onGround &&
      b.maxY - s.y <= PHYS.stepHeight + 0.001 &&
      b.maxY > s.y;
    if (stepUp && !overlapsAny(s.x, b.maxY + EPS, s.z, world)) {
      s.y = b.maxY + EPS;
      continue;
    }
    if (axis === 'x') {
      s.x = delta > 0 ? b.minX - R - EPS : b.maxX + R + EPS;
    } else {
      s.z = delta > 0 ? b.minZ - R - EPS : b.maxZ + R + EPS;
    }
  }
}

export function moveWithCollisions(
  s: MoveState,
  dt: number,
  world: CollisionWorld,
): void {
  resolveHorizontal(s, 'x', s.vx * dt, world);
  resolveHorizontal(s, 'z', s.vz * dt, world);

  s.onGround = false;
  const dy = s.vy * dt;
  s.y += dy;
  for (const b of world.boxes) {
    if (!playerOverlapsWorld(s.x, s.y, s.z, { boxes: [b] })) continue;
    if (dy <= 0) {
      s.y = b.maxY + EPS;
      s.vy = 0;
      s.onGround = true;
    } else {
      s.y = b.minY - H - EPS;
      s.vy = 0;
    }
  }

  if (!s.onGround && s.vy <= 0) {
    const probeY = s.y - 0.06;
    for (const b of world.boxes) {
      if (
        b.maxY <= s.y + PHYS.stepHeight + 0.05 &&
        playerOverlapsWorld(s.x, probeY, s.z, { boxes: [b] })
      ) {
        s.y = b.maxY + EPS;
        s.vy = 0;
        s.onGround = true;
        break;
      }
    }
  }

  s.x = Math.max(-500, Math.min(500, s.x));
  s.z = Math.max(-500, Math.min(500, s.z));
  if (s.y < -50) {
    s.y = 10;
    s.vy = 0;
  }
}
