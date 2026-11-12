import * as THREE from 'three';
import type { WeaponId } from '@open-venge/shared';
import type { Assets } from './assets';

function part(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

export function buildPrimitiveViewmodel(weapon: WeaponId): THREE.Group {
  const g = new THREE.Group();
  const dark = 0x24282e;
  const metal = 0x3c434c;
  const accent = 0x2f8f83;

  switch (weapon) {
    case 'rifle':
      part(g, 0.09, 0.11, 0.85, 0, 0, -0.35, dark);
      part(g, 0.07, 0.2, 0.12, 0, -0.14, -0.18, dark);
      part(g, 0.08, 0.1, 0.25, 0, 0.02, 0.12, metal);
      part(g, 0.05, 0.05, 0.3, 0, 0.08, -0.5, accent);
      break;
    case 'shotgun':
      part(g, 0.12, 0.13, 0.7, 0, 0, -0.3, dark);
      part(g, 0.1, 0.1, 0.5, 0, -0.09, -0.35, metal);
      part(g, 0.09, 0.16, 0.3, 0, -0.03, 0.15, 0x6b4a2a);
      break;
    case 'sniper':
      part(g, 0.08, 0.1, 1.15, 0, 0, -0.5, dark);
      part(g, 0.06, 0.16, 0.14, 0, -0.12, -0.2, dark);
      part(g, 0.07, 0.07, 0.35, 0, 0.1, -0.45, metal);
      part(g, 0.05, 0.05, 0.05, 0, 0.1, -0.63, 0x7de8ff);
      part(g, 0.08, 0.12, 0.3, 0, -0.02, 0.18, 0x6b4a2a);
      break;
    case 'pistol':
      part(g, 0.07, 0.09, 0.35, 0, 0, -0.15, dark);
      part(g, 0.06, 0.16, 0.1, 0, -0.11, 0.02, dark);
      break;
  }
  return g;
}

export function buildViewmodel(weapon: WeaponId, assets: Assets): THREE.Group {
  const model = assets.guns.get(weapon);
  if (!model) return buildPrimitiveViewmodel(weapon);
  const holder = new THREE.Group();
  const gun = model.clone(true);
  gun.position.set(0, -0.08, 0);
  holder.add(gun);
  holder.position.set(0.3, -0.3, -0.55);
  holder.rotation.set(0.03, 0.05, 0);
  return holder;
}

export function muzzleOffset(weapon: WeaponId): THREE.Vector3 {
  switch (weapon) {
    case 'rifle':
      return new THREE.Vector3(0.35, -0.26, -1.1);
    case 'shotgun':
      return new THREE.Vector3(0.35, -0.26, -1.0);
    case 'sniper':
      return new THREE.Vector3(0.35, -0.24, -1.4);
    case 'pistol':
      return new THREE.Vector3(0.35, -0.28, -0.7);
  }
}
