import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { WeaponId } from '@open-venge/shared';

const GUN_FILES: Record<WeaponId, string> = {
  rifle: 'assets/guns/rifle.glb',
  shotgun: 'assets/guns/shotgun.glb',
  sniper: 'assets/guns/sniper.glb',
  pistol: 'assets/guns/pistol.glb',
};

const GUN_LENGTH: Record<WeaponId, number> = {
  rifle: 0.95,
  shotgun: 0.85,
  sniper: 1.25,
  pistol: 0.42,
};

const CHAR_FILES = ['a', 'b', 'c', 'd'];
const CHAR_HEIGHT = 1.8;

const TEX_FILES: Record<string, string> = {
  floor: 'assets/tex/floor.png',
  wall: 'assets/tex/wall.png',
  green: 'assets/tex/green.png',
  orange: 'assets/tex/orange.png',
  red: 'assets/tex/red.png',
  purple: 'assets/tex/purple.png',
};

export interface Assets {
  ready: boolean;
  guns: Map<WeaponId, THREE.Group>;
  chars: THREE.Group[];
  clips: Record<string, THREE.AnimationClip>;
  tex: Record<string, THREE.Texture>;
}

function fitToSize(root: THREE.Object3D, size: number, axis: 'y' | 'z'): THREE.Group {
  const box = new THREE.Box3().setFromObject(root);
  const dims = new THREE.Vector3();
  box.getSize(dims);
  const scale = size / Math.max(1e-6, axis === 'y' ? dims.y : dims.z);
  const holder = new THREE.Group();
  root.scale.setScalar(scale);
  const scaled = new THREE.Box3().setFromObject(root);
  const center = scaled.getCenter(new THREE.Vector3());
  root.position.sub(center);
  if (axis === 'y') root.position.y += (scaled.max.y - scaled.min.y) / 2;
  holder.add(root);
  return holder;
}

export async function loadAssets(): Promise<Assets> {
  const out: Assets = { ready: false, guns: new Map(), chars: [], clips: {}, tex: {} };
  const gltf = new GLTFLoader();
  const texLoader = new THREE.TextureLoader();
  const jobs: Promise<void>[] = [];

  for (const w of Object.keys(GUN_FILES) as WeaponId[]) {
    jobs.push(
      gltf
        .loadAsync(GUN_FILES[w])
        .then((g) => {
          const gun = fitToSize(g.scene, GUN_LENGTH[w], 'z');
          gun.traverse((o) => {
            if (o instanceof THREE.Mesh) o.castShadow = true;
          });
          out.guns.set(w, gun);
        })
        .catch(() => {}),
    );
  }

  for (let i = 0; i < CHAR_FILES.length; i++) {
    jobs.push(
      gltf
        .loadAsync(`assets/chars/character-${CHAR_FILES[i]}.glb`)
        .then((g) => {
          const root = fitToSize(g.scene, CHAR_HEIGHT, 'y');
          out.chars.push(root);
          if (i === 0) {
            for (const clip of g.animations) out.clips[clip.name] = clip;
          }
        })
        .catch(() => {}),
    );
  }

  for (const [name, url] of Object.entries(TEX_FILES)) {
    jobs.push(
      texLoader
        .loadAsync(url)
        .then((t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.wrapS = THREE.RepeatWrapping;
          t.wrapT = THREE.RepeatWrapping;
          out.tex[name] = t;
        })
        .catch(() => {}),
    );
  }

  await Promise.all(jobs);
  out.ready = out.chars.length > 0 || out.guns.size > 0;
  return out;
}
