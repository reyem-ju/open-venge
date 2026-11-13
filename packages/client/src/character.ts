import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { lerpAngle, clamp } from '@open-venge/shared';
import type { Assets } from './assets';
import type { WeaponId } from '@open-venge/shared';

const PALETTE = [
  0xe05b4b, 0x4ba3e0, 0x59c96a, 0xc96ab4, 0xe0a54b, 0x6a7fe0,
  0x4bc9b4, 0xd4d44b,
];

export function colorForId(id: number): number {
  return PALETTE[id % PALETTE.length];
}

interface RigActions {
  idle: THREE.AnimationAction | null;
  walk: THREE.AnimationAction | null;
  run: THREE.AnimationAction | null;
}

export interface CharacterRig {
  group: THREE.Group;
  torso: THREE.Object3D | null;
  legL: THREE.Object3D | null;
  legR: THREE.Object3D | null;
  tag: THREE.Sprite;
  mixer: THREE.AnimationMixer | null;
  actions: RigActions;
  current: string;
  walkPhase: number;
  lastYaw: number;
}

const WALK_REF_SPEED = 1.9;
const RUN_REF_SPEED = 5.6;

function makeNameTag(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(10,12,16,0.55)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#e8edf4';
  ctx.fillText(name, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: true, depthWrite: false, transparent: true }),
  );
  sprite.scale.set(2.2, 0.55, 1);
  return sprite;
}

function tintAndShadow(root: THREE.Object3D, color: number): void {
  const tint = (m: THREE.Material): THREE.Material => {
    const c = m.clone();
    if (c instanceof THREE.MeshStandardMaterial || c instanceof THREE.MeshLambertMaterial) {
      c.color = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45);
    }
    return c;
  };
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.material = Array.isArray(o.material) ? o.material.map(tint) : tint(o.material);
      o.castShadow = true;
      o.receiveShadow = false;
    }
    if (o instanceof THREE.SkinnedMesh) {
      o.frustumCulled = false;
    }
  });
}

function attachGun(model: THREE.Object3D, assets: Assets): void {
  const gun = assets.guns.get('rifle');
  const hand = model.getObjectByName('mixamorigRightHand');
  if (!gun || !hand) return;
  model.updateMatrixWorld(true);
  const qh = new THREE.Quaternion();
  const ws = new THREE.Vector3();
  hand.matrixWorld.decompose(new THREE.Vector3(), qh, ws);
  const held = gun.clone(true);
  held.scale.setScalar(0.55);
  held.quaternion.copy(qh.invert());
  const wrapper = new THREE.Group();
  wrapper.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z);
  wrapper.add(held);
  hand.add(wrapper);
}

export function createCharacter(id: number, name: string, assets: Assets): CharacterRig {
  const color = colorForId(id);
  const group = new THREE.Group();
  const tag = makeNameTag(name);
  tag.position.y = 2.25;

  const base = assets.chars.length > 0 ? assets.chars[id % assets.chars.length] : null;
  if (base) {
    const model = skeletonClone(base.scene) as THREE.Group;
    model.rotation.y = Math.PI;
    tintAndShadow(model, color);
    attachGun(model, assets);
    group.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const mk = (n: string): THREE.AnimationAction | null =>
      base.clips[n] ? mixer.clipAction(base.clips[n]) : null;
    const actions: RigActions = { idle: mk('idle'), walk: mk('walk'), run: mk('run') };
    actions.idle?.play();
    group.add(tag);
    return { group, torso: null, legL: null, legR: null, tag, mixer, actions, current: 'idle', walkPhase: 0, lastYaw: 0 };
  }

  const torso = new THREE.Group();
  group.add(torso);
  const boxMesh = (w: number, h: number, d: number, c: number): THREE.Mesh =>
    new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c }));

  const body = boxMesh(0.72, 0.78, 0.44, color);
  body.position.y = 1.06;
  torso.add(body);
  const head = boxMesh(0.42, 0.42, 0.42, 0x2b2f36);
  head.position.y = 1.64;
  torso.add(head);
  const visor = boxMesh(0.3, 0.1, 0.05, 0x7de8ff);
  visor.position.set(0, 1.66, -0.22);
  torso.add(visor);
  const armL = boxMesh(0.2, 0.6, 0.24, color);
  armL.position.set(-0.48, 1.1, -0.1);
  torso.add(armL);
  const armR = boxMesh(0.2, 0.6, 0.24, color);
  armR.position.set(0.48, 1.1, -0.1);
  torso.add(armR);
  const gun = boxMesh(0.12, 0.16, 0.95, 0x22262c);
  gun.position.set(0.3, 1.28, -0.5);
  torso.add(gun);
  const legL = boxMesh(0.26, 0.68, 0.3, 0x2b2f36);
  legL.position.set(-0.19, 0.34, 0);
  group.add(legL);
  const legR = boxMesh(0.26, 0.68, 0.3, 0x2b2f36);
  legR.position.set(0.19, 0.34, 0);
  group.add(legR);
  group.add(tag);

  return { group, torso, legL, legR, tag, mixer: null, actions: { idle: null, walk: null, run: null }, current: 'idle', walkPhase: 0, lastYaw: 0 };
}

function crossfade(rig: CharacterRig, next: string): void {
  if (!rig.mixer || rig.current === next) return;
  const target = rig.actions[next as keyof RigActions];
  if (!target) return;
  const prev = rig.actions[rig.current as keyof RigActions];
  target.reset().fadeIn(0.18).play();
  prev?.fadeOut(0.18);
  rig.current = next;
}

export function updateCharacter(
  rig: CharacterRig,
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
  speed: number,
  dead: boolean,
  ads: boolean,
  dt: number,
): void {
  rig.group.visible = !dead;
  if (dead) return;
  rig.group.position.set(x, y, z);
  rig.group.rotation.y = lerpAngle(rig.lastYaw, yaw, Math.min(1, dt * 18));
  rig.lastYaw = rig.group.rotation.y;

  if (rig.mixer) {
    const next = speed > 4.5 ? 'run' : speed > 0.4 ? 'walk' : 'idle';
    crossfade(rig, next);
    const active = rig.actions[next as keyof RigActions];
    if (active) {
      const ref = next === 'run' ? RUN_REF_SPEED : next === 'walk' ? WALK_REF_SPEED : 1;
      active.timeScale = clamp(speed / ref, 0.7, 1.7);
    }
    rig.mixer.update(dt);
    return;
  }

  rig.torso!.rotation.x = -pitch * 0.45;
  if (speed > 0.5) {
    rig.walkPhase += dt * speed * 2.2;
    const swing = Math.sin(rig.walkPhase) * 0.55;
    rig.legL!.rotation.x = swing;
    rig.legR!.rotation.x = -swing;
  } else {
    rig.legL!.rotation.x *= 0.8;
    rig.legR!.rotation.x *= 0.8;
  }
  void ads;
}
