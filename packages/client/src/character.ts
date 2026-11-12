import * as THREE from 'three';
import { lerpAngle } from '@open-venge/shared';
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
  sprint: THREE.AnimationAction | null;
  shoot: THREE.AnimationAction | null;
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
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }),
  );
  sprite.scale.set(2.2, 0.55, 1);
  return sprite;
}

function tint(root: THREE.Object3D, color: number): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshLambertMaterial) {
          m.color = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35);
        }
      }
      o.castShadow = true;
    }
  });
}

function attachGun(model: THREE.Object3D, assets: Assets, weapon: WeaponId): void {
  const gun = assets.guns.get(weapon) ?? assets.guns.get('rifle');
  const arm = model.getObjectByName('arm-right');
  if (!gun || !arm) return;
  const held = gun.clone(true);
  held.scale.setScalar(0.85);
  held.position.set(0.05, -0.5, 0.15);
  held.rotation.set(0, 0, 0);
  arm.add(held);
}

export function createCharacter(id: number, name: string, assets: Assets): CharacterRig {
  const color = colorForId(id);
  const group = new THREE.Group();
  const tag = makeNameTag(name);
  tag.position.y = 2.25;

  const model = assets.chars.length > 0 ? assets.chars[id % assets.chars.length].clone(true) : null;
  if (model) {
    model.rotation.y = Math.PI;
    tint(model, color);
    attachGun(model, assets, 'rifle');
    group.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const mk = (n: string): THREE.AnimationAction | null =>
      assets.clips[n] ? mixer.clipAction(assets.clips[n]) : null;
    const actions: RigActions = { idle: mk('idle'), walk: mk('walk'), sprint: mk('sprint'), shoot: mk('holding-right-shoot') };
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

  return { group, torso, legL, legR, tag, mixer: null, actions: { idle: null, walk: null, sprint: null, shoot: null }, current: 'idle', walkPhase: 0, lastYaw: 0 };
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
    const move = speed > 5.5 ? 'sprint' : speed > 0.5 ? 'walk' : 'idle';
    crossfade(rig, ads && rig.actions.shoot ? 'shoot' : move);
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
}
