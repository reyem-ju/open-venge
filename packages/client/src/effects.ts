import * as THREE from 'three';

interface Tracer {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

interface Impact {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  life: number;
}

const TRACER_LIFE = 0.11;

export class Effects {
  private scene: THREE.Scene;
  private tracers: Tracer[] = [];
  private impacts: Impact[] = [];
  private flashLight: THREE.PointLight;
  private flashLife = 0;
  private flashSprite: THREE.Sprite;
  private tracerGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 5, 1, true);
  private glowTex = makeGlowTexture();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.flashLight = new THREE.PointLight(0xffd9a0, 0, 14, 1.6);
    scene.add(this.flashLight);

    this.flashSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xffe0a8,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.flashSprite.scale.set(0.6, 0.6, 1);
    scene.add(this.flashSprite);
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.01) return;
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffdf8a,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(this.tracerGeo, mat);
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    );
    this.scene.add(mesh);
    this.tracers.push({ mesh, mat, life: TRACER_LIFE, maxLife: TRACER_LIFE });
  }

  impact(pos: THREE.Vector3): void {
    let pool = this.impacts.find((i) => i.life <= 0);
    if (!pool) {
      if (this.impacts.length > 40) return;
      const mat = new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xffcf8a,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      this.scene.add(sprite);
      pool = { sprite, mat, life: 0 };
      this.impacts.push(pool);
    }
    pool.sprite.position.copy(pos);
    pool.sprite.scale.set(0.3, 0.3, 1);
    pool.mat.opacity = 1;
    pool.life = 0.2;
  }

  muzzle(pos: THREE.Vector3): void {
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 60;
    this.flashLife = 0.055;
    this.flashSprite.position.copy(pos);
    (this.flashSprite.material as THREE.SpriteMaterial).opacity = 1;
    this.flashSprite.scale.set(0.7, 0.7, 1);
  }

  update(dt: number): void {
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        const k = Math.max(0, t.life / t.maxLife);
        t.mat.opacity = k * 0.95;
        t.mesh.scale.x = t.mesh.scale.z = 0.4 + k * 0.6;
        if (t.life <= 0) {
          this.scene.remove(t.mesh);
          t.mat.dispose();
        }
      }
    }
    this.tracers = this.tracers.filter((t) => t.life > 0);

    for (const i of this.impacts) {
      if (i.life > 0) {
        i.life -= dt;
        const k = Math.max(0, i.life / 0.2);
        i.mat.opacity = k;
        const s = 0.3 + (1 - k) * 0.4;
        i.sprite.scale.set(s, s, 1);
      }
    }

    if (this.flashLife > 0) {
      this.flashLife -= dt;
      this.flashLight.intensity = Math.max(0, (this.flashLife / 0.055) * 60);
      const mat = this.flashSprite.material as THREE.SpriteMaterial;
      mat.opacity = Math.max(0, (this.flashLife / 0.055) * 1);
    }
  }
}

function makeGlowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
