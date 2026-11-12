import type { GameMap, MapBox, SpawnPoint } from '../world';

const C = {
  floor: 0x3a4048,
  wall: 0x4b5563,
  concrete: 0x59636f,
  dark: 0x2f353d,
  crate: 0x9a6a3f,
  crateAlt: 0x7a5430,
  accent: 0x2f8f83,
  metal: 0x6e7883,
} as const;

function box(
  boxes: MapBox[],
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  c: number,
): void {
  boxes.push({ x, y, z, sx, sy, sz, c });
}

function stairs(
  boxes: MapBox[],
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  steps: number,
  stepH: number,
  stepD: number,
  width: number,
  c: number,
): void {
  for (let i = 0; i < steps; i++) {
    const h = stepH * (steps - i);
    const off = i * stepD + stepD / 2;
    box(boxes, x + dirX * off, h / 2, z + dirZ * off, dirX !== 0 ? stepD : width, h, dirZ !== 0 ? stepD : width, c);
  }
}

function buildFoundry(): GameMap {
  const boxes: MapBox[] = [];

  box(boxes, 0, -0.5, 0, 96, 1, 96, C.floor);

  box(boxes, 0, 4, -48.5, 97, 8, 1.5, C.wall);
  box(boxes, 0, 4, 48.5, 97, 8, 1.5, C.wall);
  box(boxes, -48.5, 4, 0, 1.5, 8, 97, C.wall);
  box(boxes, 48.5, 4, 0, 1.5, 8, 97, C.wall);

  box(boxes, 0, 1.25, 0, 14, 2.5, 14, C.concrete);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(boxes, sx * 6, 5, sz * 6, 1.2, 5, 1.2, C.dark);
    }
  }
  box(boxes, 0, 7.75, 0, 16, 0.5, 16, C.dark);

  stairs(boxes, -7, 0, -1, 0, 5, 0.5, 0.7, 5, C.metal);
  stairs(boxes, 7, 0, 1, 0, 5, 0.5, 0.7, 5, C.metal);

  for (const sx of [-1, 1]) {
    const bx = sx * 30;
    box(boxes, bx, 1.25, -30, 12, 2.5, 0.8, C.concrete);
    box(boxes, bx - sx * 6, 1.25, -30 + 6, 0.8, 2.5, 12, C.concrete);
    box(boxes, bx, 1.25, -30 + 12, 12, 2.5, 0.8, C.concrete);
    box(boxes, bx, 2.75, -30 + 6, 12.8, 0.5, 12.8, C.dark);
    stairs(boxes, bx + sx * 6.4, -30 + 6, sx, 0, 5, 0.5, 0.7, 4, C.metal);
    box(boxes, bx, 0.1, -30 + 6, 1.6, 0.2, 1.6, C.accent);
  }

  const crates: [number, number, number, number, number][] = [
    [-16, 1, 14, 2, 0],
    [-16, 3, 14, 2, 1],
    [-13, 1, 14, 2, 2],
    [16, 1, -14, 2, 0],
    [16, 3, -14, 2, 1],
    [13, 1, -14, 2, 2],
    [-20, 1, -18, 2, 0],
    [20, 1, 18, 2, 0],
    [-8, 1, 30, 2, 0],
    [8, 1, -30, 2, 0],
    [30, 1, 24, 2, 0],
    [30, 3, 24, 2, 1],
    [-30, 1, -24 + 48, 2, 0],
    [-34, 1, -24 + 48, 2, 2],
  ];
  for (const [x, y, z, s, variant] of crates) {
    box(boxes, x, y, z, s, s, s, variant === 0 ? C.crate : variant === 1 ? C.crateAlt : C.metal);
  }

  const covers: [number, number, number, number, number][] = [
    [0, 1.25, 22, 10, 0],
    [0, 1.25, -22, 10, 0],
    [-24, 1.25, 0, 0, 10],
    [24, 1.25, 0, 0, 10],
    [-38, 1.25, 12, 0, 8],
    [38, 1.25, -12, 0, 8],
    [12, 1.25, 38, 8, 0],
    [-12, 1.25, -38, 8, 0],
  ];
  for (const [x, y, z, sx, sz] of covers) {
    box(boxes, x, y, z, sx !== 0 ? sx : 0.8, 2.5, sz !== 0 ? sz : 0.8, C.concrete);
  }

  box(boxes, 0, 3.5, -44, 6, 7, 6, C.accent);
  box(boxes, 0, 3.5, 44, 6, 7, 6, C.accent);
  box(boxes, -44, 3.5, 0, 6, 7, 6, C.accent);
  box(boxes, 44, 3.5, 0, 6, 7, 6, C.accent);

  const spawns: SpawnPoint[] = [
    { x: -38, y: 0.1, z: -38, yaw: yawTo(-38, -38, 0, 0) },
    { x: 38, y: 0.1, z: 38, yaw: yawTo(38, 38, 0, 0) },
    { x: 38, y: 0.1, z: -38, yaw: yawTo(38, -38, 0, 0) },
    { x: -38, y: 0.1, z: 38, yaw: yawTo(-38, 38, 0, 0) },
    { x: 0, y: 0.1, z: -38, yaw: yawTo(0, -38, 0, 0) },
    { x: 0, y: 0.1, z: 38, yaw: yawTo(0, 38, 0, 0) },
    { x: 38, y: 0.1, z: 0, yaw: yawTo(38, 0, 0, 0) },
    { x: -38, y: 0.1, z: 0, yaw: yawTo(-38, 0, 0, 0) },
  ];

  const nav = [
    { x: 0, y: 2.6, z: 0 },
    { x: -18, y: 0.1, z: 10 },
    { x: 18, y: 0.1, z: -10 },
    { x: -18, y: 0.1, z: -26 },
    { x: 18, y: 0.1, z: 26 },
    { x: 30, y: 0.1, z: -30 },
    { x: -30, y: 0.1, z: -30 },
    { x: 30, y: 0.1, z: 30 },
    { x: -30, y: 0.1, z: 30 },
    { x: 0, y: 0.1, z: -30 },
    { x: 0, y: 0.1, z: 30 },
    { x: -38, y: 0.1, z: 20 },
    { x: 38, y: 0.1, z: -20 },
    { x: -40, y: 0.1, z: -10 },
    { x: 40, y: 0.1, z: 10 },
    { x: 12, y: 0.1, z: 38 },
    { x: -12, y: 0.1, z: -38 },
    { x: -24, y: 0.1, z: 0 },
    { x: 24, y: 0.1, z: 0 },
  ];

  return { name: 'Foundry', boxes, spawns, nav };
}

function yawTo(fx: number, fz: number, tx: number, tz: number): number {
  return Math.atan2(-(tx - fx), -(tz - fz));
}

export const FOUNDRY: GameMap = buildFoundry();
