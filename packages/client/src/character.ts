import * as THREE from 'three';
import { lerpAngle } from '@open-venge/shared';

const PALETTE = [
  0xe05b4b, 0x4ba3e0, 0x59c96a, 0xc96ab4, 0xe0a54b, 0x6a7fe0,
  0x4bc9b4, 0xd4d44b,
];

export function colorForId(id: number): number {
  return PALETTE[id % PALETTE.length];
}

export interface CharacterRig {
  group: THREE.Group;
  torso: THREE.Group;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  tag: THREE.Sprite;
  walkPhase: number;
  lastYaw: number;
}

function boxMesh(w: number, h: number, d: number, color: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
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

export function createCharacter(id: number, name: string): CharacterRig {
  const color = colorForId(id);
  const group = new THREE.Group();
  const torso = new THREE.Group();
  group.add(torso);

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

  const tag = makeNameTag(name);
  tag.position.y = 2.25;
  group.add(tag);

  return { group, torso, legL, legR, tag, walkPhase: 0, lastYaw: 0 };
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
  dt: number,
): void {
  rig.group.visible = !dead;
  if (dead) return;
  rig.group.position.set(x, y, z);
  rig.group.rotation.y = lerpAngle(rig.lastYaw, yaw, Math.min(1, dt * 18));
  rig.lastYaw = rig.group.rotation.y;
  rig.torso.rotation.x = -pitch * 0.45;

  if (speed > 0.5) {
    rig.walkPhase += dt * speed * 2.2;
    const swing = Math.sin(rig.walkPhase) * 0.55;
    rig.legL.rotation.x = swing;
    rig.legR.rotation.x = -swing;
  } else {
    rig.legL.rotation.x *= 0.8;
    rig.legR.rotation.x *= 0.8;
  }
}
