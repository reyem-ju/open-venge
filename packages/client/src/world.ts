import * as THREE from 'three';
import type { GameMap } from '@open-venge/shared';

export function buildWorld(scene: THREE.Scene, map: GameMap): void {
  scene.background = new THREE.Color(0x1c2128);
  scene.fog = new THREE.Fog(0x1c2128, 60, 220);

  const hemi = new THREE.HemisphereLight(0xcfd8e3, 0x2b2f36, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d9, 1.6);
  sun.position.set(40, 80, 25);
  scene.add(sun);

  const gridTex = makeGridTexture();
  gridTex.wrapS = THREE.RepeatWrapping;
  gridTex.wrapT = THREE.RepeatWrapping;
  gridTex.repeat.set(48, 48);

  for (const b of map.boxes) {
    const isFloor = b.sy === 1 && b.y === -0.5;
    const geo = new THREE.BoxGeometry(b.sx, b.sy, b.sz);
    const mat = new THREE.MeshLambertMaterial({
      color: b.c,
      map: isFloor ? gridTex : null,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(b.x, b.y, b.z);
    scene.add(mesh);
  }
}

function makeGridTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#4a515c';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#3a4048';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, size, size);
  ctx.fillStyle = '#3f454e';
  ctx.fillRect(8, 8, size - 16, size - 16);
  ctx.strokeStyle = '#565e6a';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, size - 16, size - 16);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
