import type { WeaponConfig } from './constants';

export function damageAtRange(w: WeaponConfig, dist: number): number {
  if (dist <= w.falloffStart) return w.damage;
  if (dist >= w.falloffEnd) return w.damage * w.minMult;
  const t = (dist - w.falloffStart) / (w.falloffEnd - w.falloffStart);
  return w.damage * (1 + (w.minMult - 1) * t);
}

export function fireIntervalMs(w: WeaponConfig): number {
  return 60000 / w.rpm;
}

export function spreadDirection(
  dx: number,
  dy: number,
  dz: number,
  spread: number,
  rand: () => number,
): [number, number, number] {
  const len = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  let px = 0;
  let py = 0;
  let pz = 0;
  if (Math.abs(uy) < 0.99) {
    px = -uz;
    py = 0;
    pz = ux;
  } else {
    px = 1;
  }
  const pl = Math.hypot(px, py, pz);
  px /= pl;
  py /= pl;
  pz /= pl;
  const qx = uy * pz - uz * py;
  const qy = uz * px - ux * pz;
  const qz = ux * py - uy * px;
  const a = (rand() * 2 - 1) * spread;
  const b = (rand() * 2 - 1) * spread;
  let rx = ux + px * a + qx * b;
  let ry = uy + py * a + qy * b;
  let rz = uz + pz * a + qz * b;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl;
  ry /= rl;
  rz /= rl;
  return [rx, ry, rz];
}

export function viewAnglesToDir(yaw: number, pitch: number): [number, number, number] {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}
