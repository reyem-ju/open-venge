import * as THREE from 'three';
import type { GameMap } from '@open-venge/shared';
import type { Assets } from './assets';

const ACCENTS: Array<{ color: number; tex: string }> = [
  { color: 0x4ba3e0, tex: 'green' },
  { color: 0x59c96a, tex: 'green' },
  { color: 0xe05b4b, tex: 'red' },
  { color: 0xc96ab4, tex: 'purple' },
  { color: 0xe0a54b, tex: 'orange' },
];

function accentTexFor(color: number): string | null {
  let best: { tex: string; dist: number } | null = null;
  for (const a of ACCENTS) {
    const dr = ((color >> 16) & 0xff) - ((a.color >> 16) & 0xff);
    const dg = ((color >> 8) & 0xff) - ((a.color >> 8) & 0xff);
    const db = (color & 0xff) - (a.color & 0xff);
    const dist = dr * dr + dg * dg + db * db;
    if (!best || dist < best.dist) best = { tex: a.tex, dist };
  }
  return best && best.dist < 140 * 140 ? best.tex : null;
}

export function buildWorld(scene: THREE.Scene, map: GameMap, assets: Assets): void {
  const sky = makeSky();
  scene.add(sky);
  scene.background = new THREE.Color(0x9db8d6);
  scene.fog = new THREE.Fog(0x9db8d6, 80, 260);

  const hemi = new THREE.HemisphereLight(0xcfe0f2, 0x51565e, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(45, 90, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.camera.far = 260;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  const floorTex = assets.tex.floor ?? null;
  const wallTex = assets.tex.wall ?? null;
  const texCache = new Map<string, THREE.Texture>();
  const repeated = (base: THREE.Texture | null, rx: number, ry: number): THREE.Texture | null => {
    if (!base) return null;
    const key = `${base.uuid}_${rx}_${ry}`;
    let tex = texCache.get(key);
    if (!tex) {
      tex = base.clone();
      tex.repeat.set(rx, ry);
      texCache.set(key, tex);
    }
    return tex;
  };

  for (const b of map.boxes) {
    const isFloor = b.sy === 1 && b.y === -0.5;
    let tex: THREE.Texture | null;
    if (isFloor) {
      tex = repeated(floorTex, b.sx / 2, b.sz / 2);
    } else {
      const accent = accentTexFor(b.c);
      const base = accent ? assets.tex[accent] : wallTex;
      tex = repeated(base, Math.max(1, Math.round(Math.max(b.sx, b.sz) / 2)), Math.max(1, Math.round(b.sy / 2)));
    }
    const geo = new THREE.BoxGeometry(b.sx, b.sy, b.sz);
    const mat = new THREE.MeshLambertMaterial({
      color: isFloor ? 0x8f979f : b.c,
      map: tex,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(b.x, b.y, b.z);
    mesh.castShadow = !isFloor;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

function makeSky(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2e5c9e');
  grad.addColorStop(0.55, '#7fa8d9');
  grad.addColorStop(0.82, '#c8d9ea');
  grad.addColorStop(1, '#e6ecf2');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(350, 24, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  return mesh;
}
