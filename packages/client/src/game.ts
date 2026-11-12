import * as THREE from 'three';
import {
  INTERP_DELAY_MS,
  PHYS,
  TICK_DT,
  WEAPONS,
  fireIntervalMs,
  lerp,
  lerpAngle,
  raycastWorld,
  stepMove,
  toCollisionBoxes,
  viewAnglesToDir,
  type CollisionWorld,
  type GameEvent,
  type GameMap,
  type MoveInput,
  type MoveState,
  type ServerMsg,
  type SnapshotMsg,
  type WeaponId,
} from '@open-venge/shared';
import { Sfx } from './audio';
import type { Assets } from './assets';
import { colorForId, createCharacter, updateCharacter, type CharacterRig } from './character';
import { Controller } from './controller';
import { Effects } from './effects';
import { HUD } from './hud';
import { NetClient } from './net';
import type { Settings } from './settings';
import { buildViewmodel, muzzleOffset } from './viewmodel';
import { buildWorld } from './world';

interface PendingInput {
  seq: number;
  mi: MoveInput;
}

interface RigEntry {
  rig: CharacterRig;
  prev?: { x: number; y: number; z: number; yaw: number; t: number };
  speed: number;
}

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world: CollisionWorld;
  private effects: Effects;
  private controller: Controller;
  private rigs = new Map<number, RigEntry>();
  private vmHolder = new THREE.Group();
  private viewmodel: THREE.Group | null = null;

  private pred: MoveState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: true };
  private pending: PendingInput[] = [];
  private tickAcc = 0;

  private snapA: SnapshotMsg | null = null;
  private snapB: SnapshotMsg | null = null;
  private snapTimeA = 0;
  private snapTimeB = 0;

  private myId = 0;
  private dead = false;
  private phase: 'live' | 'end' = 'live';
  private respawnDeadline = 0;
  private killerId = 0;

  private slot: 'primary' | 'secondary' = 'primary';
  private localAmmo: [number, number] = [30, 12];
  private nextFireMs = 0;
  private reloading = false;
  private reloadEndMs = 0;
  private prevShootHeld = false;

  private ads = false;
  private fovCurrent = 90;
  private bobTime = 0;
  private lastFrame = performance.now();
  private fpsAcc = 0;
  private fpsCount = 0;
  private fps = 60;
  private scoreLimit = 30;
  private names = new Map<number, string>();
  private lastHp = 100;
  private running = true;
  private raf = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private net: NetClient,
    private sfx: Sfx,
    private hud: HUD,
    private settings: Settings,
    map: GameMap,
    myId: number,
    private assets: Assets,
  ) {
    this.myId = myId;
    this.dead = true;
    this.world = { boxes: toCollisionBoxes(map) };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.05, 500);
    this.camera.rotation.order = 'YXZ';
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    buildWorld(this.scene, map, this.assets);
    this.effects = new Effects(this.scene);
    this.camera.add(this.vmHolder);
    this.scene.add(this.camera);
    this.controller = new Controller(canvas, settings);
    this.fovCurrent = settings.fov;

    this.pred = { x: 0, y: 6, z: 0, vx: 0, vy: 0, vz: 0, onGround: false };
    this.setSlot('primary', true);

    this.controller.onLockChange = (locked) => this.hud.resumeHint(!locked && !this.dead);
    this.controller.onWeaponSwitch = (slot) => this.setSlot(slot, false);
    this.controller.onReload = () => this.startReload();

    window.addEventListener('resize', this.onResize);
    this.raf = requestAnimationFrame(this.frame);
  }

  handleMessage(msg: ServerMsg): void {
    switch (msg.t) {
      case 'snapshot':
        this.onSnapshot(msg);
        break;
      case 'events':
        for (const ev of msg.list) this.onEvent(ev);
        break;
      case 'spawn': {
          this.dead = false;
          this.pred = { x: msg.x, y: msg.y, z: msg.z, vx: 0, vy: 0, vz: 0, onGround: true };
          this.pending = [];
          this.controller.yaw = msg.yaw;
          this.controller.pitch = 0;
          this.slot = 'primary';
          this.setSlot('primary', true);
          this.localAmmo = [WEAPONS[this.settings.loadout].magSize, WEAPONS.pistol.magSize];
          this.reloading = false;
          this.hud.respawnOverlay(false, 0, '');
          this.hud.resumeHint(!this.controller.locked);
          this.sfx.spawn();
        break;
      }
      case 'died': {
        this.dead = true;
        this.killerId = msg.by;
        this.respawnDeadline = performance.now() + msg.respawnMs;
        this.hud.respawnOverlay(true, msg.respawnMs, this.names.get(msg.by) ?? '');
        this.sfx.death();
        break;
      }
      case 'match':
        if (msg.phase === 'end') {
          this.phase = 'end';
          this.hud.endScreen(msg.scores ?? null);
        } else {
          this.phase = 'live';
          this.hud.endScreen(null);
        }
        break;
      case 'reject':
        console.error('rejected:', msg.reason);
        break;
    }
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.controller.dispose();
    this.renderer.dispose();
    this.hud.endScreen(null);
    this.hud.respawnOverlay(false, 0, '');
    this.hud.scope(false);
    this.hud.resumeHint(false);
    this.hud.hideScoreboard();
  }

  private onResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  };

  private onSnapshot(snap: SnapshotMsg): void {
    this.snapA = this.snapB;
    this.snapTimeA = this.snapTimeB;
    this.snapB = snap;
    this.snapTimeB = performance.now();
    this.scoreLimit = snap.scoreLimit;

    for (const p of snap.players) this.names.set(p.id, p.name);

    const me = snap.players.find((p) => p.id === this.myId);
    if (me) {
      const ack = snap.acks[String(this.myId)] ?? 0;
      this.pending = this.pending.filter((pi) => pi.seq > ack);
      this.pred = {
        x: me.x,
        y: me.y,
        z: me.z,
        vx: 0,
        vy: 0,
        vz: 0,
        onGround: true,
      };
      for (const pi of this.pending) {
        stepMove(this.pred, pi.mi, TICK_DT, this.world);
      }
      this.dead = (me.flags & 1) !== 0;
      const idx = me.slot === 'primary' ? 0 : 1;
      if (performance.now() - this.lastFireMs > 250) {
        this.localAmmo[idx] = me.ammo;
      }
    }
  }

  private lastFireMs = 0;

  private onEvent(ev: GameEvent): void {
    switch (ev.e) {
      case 'shot': {
        if (ev.by === this.myId) break;
        const o = new THREE.Vector3(ev.o[0], ev.o[1], ev.o[2]);
        const d = new THREE.Vector3(ev.d[0], ev.d[1], ev.d[2]);
        const end = o.clone().addScaledVector(d, ev.len);
        this.effects.tracer(o, end);
        this.effects.muzzle(o.clone().addScaledVector(d, 0.4));
        const dist = this.camera.position.distanceTo(o);
        const gain = Math.max(0.05, 1 - dist / 70);
        this.effects.impact(end);
        this.sfx.shot(ev.w, gain, this.panFor(o));
        break;
      }
      case 'impact': {
        this.effects.impact(new THREE.Vector3(ev.x, ev.y, ev.z));
        break;
      }
      case 'hit': {
        this.hud.hitmarker(ev.hs);
        this.sfx.hit(ev.hs);
        break;
      }
      case 'damaged': {
        this.hud.vignette();
        this.hud.damageFrom(ev.dirX, ev.dirZ, this.controller.yaw);
        this.sfx.damaged();
        break;
      }
      case 'kill': {
        const mine = ev.killer === this.myId;
        const wname = WEAPONS[ev.w].name;
        this.hud.killfeed(
          ev.killer > 0 ? this.names.get(ev.killer) ?? '?' : null,
          this.names.get(ev.victim) ?? '?',
          wname,
          ev.hs,
          mine,
        );
        if (mine) this.sfx.kill();
        break;
      }
      case 'spawn':
      case 'leave':
        if (ev.e === 'leave') {
          const entry = this.rigs.get(ev.id);
          if (entry) {
            this.scene.remove(entry.rig.group);
            this.rigs.delete(ev.id);
          }
          this.names.delete(ev.id);
        }
        break;
    }
  }

  private panFor(pos: THREE.Vector3): number {
    const dir = pos.clone().sub(this.camera.position).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    return Math.max(-1, Math.min(1, dir.dot(right)));
  }

  private setSlot(slot: 'primary' | 'secondary', silent: boolean): void {
    this.slot = slot;
    if (this.viewmodel) this.vmHolder.remove(this.viewmodel);
    const weapon: WeaponId = slot === 'primary' ? this.settings.loadout : 'pistol';
    this.viewmodel = buildViewmodel(weapon, this.assets);
    this.vmHolder.add(this.viewmodel);
    this.reloading = false;
    const w = WEAPONS[weapon];
    if (!silent) {
      this.nextFireMs = performance.now() + w.switchMs;
      this.net.send({ t: 'weapon', slot });
    }
  }

  private weaponId(): WeaponId {
    return this.slot === 'primary' ? this.settings.loadout : 'pistol';
  }

  private startReload(): void {
    const w = WEAPONS[this.weaponId()];
    const idx = this.slot === 'primary' ? 0 : 1;
    if (this.reloading || this.localAmmo[idx] >= w.magSize || this.dead) return;
    this.reloading = true;
    this.reloadEndMs = performance.now() + w.reloadMs;
    this.sfx.reload(w.reloadMs);
    this.net.send({ t: 'reload' });
  }

  private currentSpread(w = WEAPONS[this.weaponId()]): number {
    const speed = Math.hypot(this.pred.vx, this.pred.vz);
    const moving = speed > 1.5 || !this.pred.onGround;
    return (
      w.spread *
      (this.ads ? w.adsSpreadMult : 1) *
      (moving ? w.moveSpreadMult : 1)
    );
  }

  private tryFire(now: number): void {
    const w = WEAPONS[this.weaponId()];
    const idx = this.slot === 'primary' ? 0 : 1;
    if (!w.auto && this.prevShootHeld) return;
    if (now < this.nextFireMs || this.reloading || this.dead) return;
    if (this.localAmmo[idx] <= 0) {
      this.startReload();
      return;
    }
    this.localAmmo[idx]--;
    this.nextFireMs = now + fireIntervalMs(w);
    this.lastFireMs = now;
    this.controller.addRecoil(w.recoilPitch, w.recoilYaw);

    const dir = viewAnglesToDir(this.controller.yaw + this.controller.recoilYaw, Math.max(-1.55, Math.min(1.55, this.controller.pitch + this.controller.recoilPitch)));
    const origin = new THREE.Vector3(this.pred.x, this.pred.y + PHYS.eyeHeight, this.pred.z);
    const hit = raycastWorld(this.world, origin.x, origin.y, origin.z, dir[0], dir[1], dir[2], w.range);
    const end = hit
      ? new THREE.Vector3(origin.x + dir[0] * hit.t, origin.y + dir[1] * hit.t, origin.z + dir[2] * hit.t)
      : origin.clone().addScaledVector(new THREE.Vector3(dir[0], dir[1], dir[2]), w.range);
    const muzzle = origin.clone().add(muzzleOffset(this.weaponId()).applyQuaternion(this.camera.quaternion));
    this.effects.tracer(muzzle, end);
    if (hit) this.effects.impact(end);
    this.effects.muzzle(muzzle);
    this.sfx.shot(this.weaponId(), 1, 0);
  }

  private frame = (): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const now = performance.now();
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (dt > 0.1) dt = 0.1;

    this.fpsAcc += dt;
    this.fpsCount++;
    if (this.fpsAcc >= 0.5) {
      this.fps = Math.round(this.fpsCount / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsCount = 0;
    }

    const active = this.controller.locked && !this.dead && this.phase === 'live';
    if (active) {
      this.tickAcc += dt;
      let steps = 0;
      while (this.tickAcc >= TICK_DT && steps < 8) {
        const input = this.controller.buildInput();
        const mi: MoveInput = {
          fwd: (input.btn & 1 ? 1 : 0) - (input.btn & 2 ? 1 : 0),
          right: (input.btn & 8 ? 1 : 0) - (input.btn & 4 ? 1 : 0),
          jump: (input.btn & 16) !== 0,
          yaw: input.yaw,
        };
        this.pending.push({ seq: input.seq, mi });
        stepMove(this.pred, mi, TICK_DT, this.world);
        this.net.send(input);
        this.tickAcc -= TICK_DT;
        steps++;
      }
      if (this.pending.length > 240) this.pending.length = 0;
    }
    this.controller.updateRecoil(dt);

    this.ads = this.controller.adsHeld && !this.dead;
    const w = WEAPONS[this.weaponId()];
    if (this.reloading && now >= this.reloadEndMs) {
      this.reloading = false;
      const idx = this.slot === 'primary' ? 0 : 1;
      this.localAmmo[idx] = w.magSize;
    }
    if (active && this.controller.shootHeld) this.tryFire(now);
    this.prevShootHeld = this.controller.shootHeld;

    const targetFov = this.ads ? w.adsFov : this.settings.fov;
    this.fovCurrent = lerp(this.fovCurrent, targetFov, Math.min(1, dt * 14));
    if (Math.abs(this.camera.fov - this.fovCurrent) > 0.01) {
      this.camera.fov = this.fovCurrent;
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.set(this.pred.x, this.pred.y + PHYS.eyeHeight, this.pred.z);
    this.camera.rotation.set(this.controller.pitch + this.controller.recoilPitch, this.controller.yaw + this.controller.recoilYaw, 0);

    this.updateRemotes(dt);
    this.updateViewmodel(dt, now);
    this.effects.update(dt);
    this.hud.update(dt);

    const snap = this.snapB;
    if (snap) {
      const me = snap.players.find((p) => p.id === this.myId);
      let leader = 0;
      for (const p of snap.players) leader = Math.max(leader, p.kills);
      this.hud.setTopScore(me?.kills ?? 0, leader, snap.scoreLimit);
      this.hud.setTimer(snap.matchTime);
      if (me) this.hud.setHealth(me.hp);
      const idx = this.slot === 'primary' ? 0 : 1;
      this.hud.setAmmo(this.localAmmo[idx], w.magSize, w.name, this.reloading);
      const spreadPx = this.currentSpread(w) * 900;
      this.hud.setCrosshairSpread(spreadPx);
      this.hud.scope(this.ads && this.weaponId() === 'sniper' && Math.abs(this.fovCurrent - w.adsFov) < 8);
    }
    this.hud.setFpsPing(this.fps, Math.round(this.net.rtt));

    if (this.dead) {
      const remaining = this.respawnDeadline - now;
      this.hud.respawnOverlay(true, remaining, this.names.get(this.killerId) ?? '');
    }

    this.renderer.render(this.scene, this.camera);
  };

  private updateRemotes(dt: number): void {
    if (!this.snapB) return;
    const renderTime = performance.now() - INTERP_DELAY_MS;
    const a = this.snapA;
    const b = this.snapB;
    const span = b && a ? Math.max(1, this.snapTimeB - this.snapTimeA) : 1;
    const t = a && b ? Math.max(0, Math.min(1, (renderTime - this.snapTimeA) / span)) : 1;

    const bById = new Map(b.players.map((p) => [p.id, p]));
    const seen = new Set<number>();
    for (const pb of b.players) {
      if (pb.id === this.myId) continue;
      seen.add(pb.id);
      let entry = this.rigs.get(pb.id);
      if (!entry) {
        entry = { rig: createCharacter(pb.id, pb.name, this.assets), speed: 0 };
        this.scene.add(entry.rig.group);
        this.rigs.set(pb.id, entry);
      }
      const pa = a?.players.find((p) => p.id === pb.id) ?? pb;
      const x = lerp(pa.x, pb.x, t);
      const y = lerp(pa.y, pb.y, t);
      const z = lerp(pa.z, pb.z, t);
      const yaw = lerpAngle(pa.yaw, pb.yaw, t);
      const pitch = lerp(pa.pitch, pb.pitch, t);
      const moved = Math.hypot(pb.x - pa.x, pb.z - pa.z) / (span / 1000);
      entry.speed = lerp(entry.speed, Math.min(moved, 12), 0.3);
      updateCharacter(entry.rig, x, y, z, yaw, pitch, entry.speed, (pb.flags & 1) !== 0, (pb.flags & 2) !== 0, dt);
    }
    for (const [id, entry] of this.rigs) {
      if (!seen.has(id)) {
        this.scene.remove(entry.rig.group);
        this.rigs.delete(id);
      }
    }
  }

  private updateViewmodel(dt: number, now: number): void {
    if (!this.viewmodel) return;
    this.viewmodel.visible = !this.dead;
    const speed = Math.hypot(this.pred.vx, this.pred.vz);
    if (speed > 0.5 && this.pred.onGround) this.bobTime += dt * speed * 1.6;
    const bobX = Math.sin(this.bobTime) * 0.012;
    const bobY = Math.abs(Math.cos(this.bobTime)) * 0.014;
    const adsK = this.ads ? 1 : 0;
    const baseX = lerp(0.35, 0.0, adsK);
    const baseY = lerp(-0.32, -0.22, adsK);
    const baseZ = lerp(-0.6, -0.5, adsK);
    const reloadDip = this.reloading ? -0.15 : 0;
    this.vmHolder.position.set(
      lerp(this.vmHolder.position.x, baseX + bobX, Math.min(1, dt * 14)),
      lerp(this.vmHolder.position.y, baseY + bobY + reloadDip, Math.min(1, dt * 14)),
      lerp(this.vmHolder.position.z, baseZ, Math.min(1, dt * 14)),
    );
    this.vmHolder.rotation.x = lerp(this.vmHolder.rotation.x, this.reloading ? -0.5 : 0, Math.min(1, dt * 10));
    this.vmHolder.rotation.z = lerp(this.vmHolder.rotation.z, this.reloading ? 0.3 : 0, Math.min(1, dt * 10));
    void now;
  }
}
