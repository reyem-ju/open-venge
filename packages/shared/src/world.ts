import { PHYS } from './constants';

export interface Box {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface MapBox {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  c: number;
}

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface GameMap {
  name: string;
  boxes: MapBox[];
  spawns: SpawnPoint[];
  nav: { x: number; y: number; z: number }[];
}

export interface CollisionWorld {
  boxes: Box[];
}

export function toCollisionBoxes(map: GameMap): Box[] {
  return map.boxes.map((b) => ({
    minX: b.x - b.sx / 2,
    minY: b.y - b.sy / 2,
    minZ: b.z - b.sz / 2,
    maxX: b.x + b.sx / 2,
    maxY: b.y + b.sy / 2,
    maxZ: b.z + b.sz / 2,
  }));
}

const R = PHYS.playerRadius;
const H = PHYS.playerHeight;

function playerOverlapsBox(
  x: number,
  y: number,
  z: number,
  b: Box,
  r = R,
  h = H,
): boolean {
  return (
    x + r > b.minX &&
    x - r < b.maxX &&
    y + h > b.minY &&
    y < b.maxY &&
    z + r > b.minZ &&
    z - r < b.maxZ
  );
}

export function playerOverlapsWorld(
  x: number,
  y: number,
  z: number,
  world: CollisionWorld,
): boolean {
  for (const b of world.boxes) {
    if (playerOverlapsBox(x, y, z, b)) return true;
  }
  return false;
}

export interface RayHit {
  t: number;
  nx: number;
  ny: number;
  nz: number;
}

export function raycastWorld(
  world: CollisionWorld,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxT: number,
): RayHit | null {
  let bestT = maxT;
  let best: RayHit | null = null;
  for (const b of world.boxes) {
    const hit = rayBox(ox, oy, oz, dx, dy, dz, b, bestT);
    if (hit && hit.t < bestT) {
      bestT = hit.t;
      best = hit;
    }
  }
  return best;
}

export function rayBox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  b: Box,
  maxT: number,
): RayHit | null {
  let tmin = 0;
  let tmax = maxT;
  let nAxis = -1;
  let nSign = 0;

  const slab = (
    o: number,
    d: number,
    mn: number,
    mx: number,
    axis: number,
  ): boolean => {
    if (Math.abs(d) < 1e-9) return o >= mn && o <= mx;
    const inv = 1 / d;
    let t1 = (mn - o) * inv;
    let t2 = (mx - o) * inv;
    let sign = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      sign = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nAxis = axis;
      nSign = sign;
    }
    if (t2 < tmax) tmax = t2;
    return tmin <= tmax;
  };

  if (!slab(ox, dx, b.minX, b.maxX, 0)) return null;
  if (!slab(oy, dy, b.minY, b.maxY, 1)) return null;
  if (!slab(oz, dz, b.minZ, b.maxZ, 2)) return null;
  if (tmin <= 0 || tmin >= maxT) return null;

  const nx = nAxis === 0 ? nSign : 0;
  const ny = nAxis === 1 ? nSign : 0;
  const nz = nAxis === 2 ? nSign : 0;
  return { t: tmin, nx, ny, nz };
}

export function raySphere(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  cx: number,
  cy: number,
  cz: number,
  r: number,
  maxT: number,
): number | null {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return null;
  const d2 = (lx * lx + ly * ly + lz * lz) - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return null;
  const thc = Math.sqrt(r2 - d2);
  const t = tca - thc;
  if (t <= 0 || t >= maxT) return null;
  return t;
}

export interface CharacterHitbox {
  x: number;
  y: number;
  z: number;
}

export function rayCharacter(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  c: CharacterHitbox,
  maxT: number,
): { t: number; headshot: boolean } | null {
  const body: Box = {
    minX: c.x - R,
    minY: c.y,
    minZ: c.z - R,
    maxX: c.x + R,
    maxY: c.y + 1.45,
    maxZ: c.z + R,
  };
  const bodyHit = rayBox(ox, oy, oz, dx, dy, dz, body, maxT);
  const headLimit = bodyHit ? bodyHit.t : maxT;
  const headT = raySphere(
    ox,
    oy,
    oz,
    dx,
    dy,
    dz,
    c.x,
    c.y + PHYS.eyeHeight,
    c.z,
    0.24,
    headLimit,
  );
  if (headT !== null) {
    return { t: headT, headshot: true };
  }
  if (bodyHit) return { t: bodyHit.t, headshot: false };
  return null;
}

export function lineOfSightClear(
  world: CollisionWorld,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  const hit = raycastWorld(world, ax, ay, az, dx / len, dy / len, dz / len, len);
  return hit === null;
}
