export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;
export const SNAPSHOT_EVERY = 3;
export const SNAPSHOT_RATE = TICK_RATE / SNAPSHOT_EVERY;
export const INTERP_DELAY_MS = 100;
export const MAX_PLAYERS = 16;
export const HISTORY_TICKS = 180;

export const PHYS = {
  gravity: 24,
  moveSpeed: 8.5,
  jumpSpeed: 8.2,
  friction: 9,
  groundAccel: 70,
  airAccel: 26,
  playerRadius: 0.4,
  playerHeight: 1.8,
  eyeHeight: 1.62,
  stepHeight: 0.55,
  maxHealth: 100,
  terminalVelocity: 60,
} as const;

export const GAME = {
  respawnMs: 3000,
  scoreLimit: 30,
  matchTimeMs: 10 * 60_000,
  endPauseMs: 10_000,
  maxNameLen: 16,
  maxInputRatePerSec: 150,
  maxMsgBytes: 4096,
  spawnProtectionMs: 1500,
} as const;

export const BTN = {
  FWD: 1,
  BACK: 2,
  LEFT: 4,
  RIGHT: 8,
  JUMP: 16,
  SHOOT: 32,
  ADS: 64,
} as const;

export interface WeaponConfig {
  id: string;
  name: string;
  damage: number;
  headshotMult: number;
  rpm: number;
  magSize: number;
  reloadMs: number;
  spread: number;
  adsSpreadMult: number;
  moveSpreadMult: number;
  pellets: number;
  auto: boolean;
  recoilPitch: number;
  recoilYaw: number;
  range: number;
  falloffStart: number;
  falloffEnd: number;
  minMult: number;
  adsFov: number;
  switchMs: number;
}

const W = (w: WeaponConfig): WeaponConfig => w;

export const WEAPONS = {
  rifle: W({
    id: 'rifle',
    name: 'VX-9 Rifle',
    damage: 24,
    headshotMult: 2,
    rpm: 600,
    magSize: 30,
    reloadMs: 2000,
    spread: 0.012,
    adsSpreadMult: 0.35,
    moveSpreadMult: 2.2,
    pellets: 1,
    auto: true,
    recoilPitch: 0.011,
    recoilYaw: 0.004,
    range: 120,
    falloffStart: 30,
    falloffEnd: 70,
    minMult: 0.6,
    adsFov: 55,
    switchMs: 400,
  }),
  shotgun: W({
    id: 'shotgun',
    name: 'BR-12 Shotgun',
    damage: 9,
    headshotMult: 1.5,
    rpm: 75,
    magSize: 6,
    reloadMs: 2600,
    spread: 0.05,
    adsSpreadMult: 0.7,
    moveSpreadMult: 1.3,
    pellets: 8,
    auto: false,
    recoilPitch: 0.032,
    recoilYaw: 0.008,
    range: 40,
    falloffStart: 8,
    falloffEnd: 22,
    minMult: 0.25,
    adsFov: 65,
    switchMs: 400,
  }),
  sniper: W({
    id: 'sniper',
    name: 'LR-50 Marksman',
    damage: 95,
    headshotMult: 2,
    rpm: 38,
    magSize: 5,
    reloadMs: 2900,
    spread: 0.09,
    adsSpreadMult: 0.01,
    moveSpreadMult: 1.8,
    pellets: 1,
    auto: false,
    recoilPitch: 0.038,
    recoilYaw: 0.006,
    range: 250,
    falloffStart: 250,
    falloffEnd: 250,
    minMult: 1,
    adsFov: 22,
    switchMs: 550,
  }),
  pistol: W({
    id: 'pistol',
    name: 'P9 Sidearm',
    damage: 26,
    headshotMult: 2,
    rpm: 320,
    magSize: 12,
    reloadMs: 1500,
    spread: 0.014,
    adsSpreadMult: 0.5,
    moveSpreadMult: 1.8,
    pellets: 1,
    auto: false,
    recoilPitch: 0.014,
    recoilYaw: 0.005,
    range: 80,
    falloffStart: 20,
    falloffEnd: 45,
    minMult: 0.7,
    adsFov: 65,
    switchMs: 300,
  }),
} satisfies Record<string, WeaponConfig>;

export type WeaponId = keyof typeof WEAPONS;

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export function isWeaponId(v: unknown): v is WeaponId {
  return typeof v === 'string' && v in WEAPONS;
}
