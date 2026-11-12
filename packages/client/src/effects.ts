import * as THREE from 'three';

interface Tracer {
  line: THREE.Line;
  mat: THREE.LineBasicMaterial;
  life: number;
}

interface Impact {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  life: number;
}

export class Effects {
  private scene: THREE.Scene;
  private tracers: Tracer[] = [];
  private impacts: Impact[] = [];
  private flashLight: THREE.PointLight;
  private flashLife = 0;
  private flashSprite: THREE.Sprite;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.flashLight = new THREE.PointLight(0xffd9a0, 0, 12);
    scene.add(this.flashLight);

    const flashTex = makeGlowTexture();
    this.flashSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: flashTex,
        color: 0xffd9a0,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.flashSprite.scale.set(0.5, 0.5, 1);
    scene.add(this.flashSprite);
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffe9a0,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, mat, life: 0.09 });
  }

  impact(pos: THREE.Vector3): void {
    let pool = this.impacts.find((i) => i.life <= 0);
    if (!pool) {
      if (this.impacts.length > 40) return;
      const mat = new THREE.SpriteMaterial({
        map: makeGlowTexture(),
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
    pool.sprite.scale.set(0.25, 0.25, 1);
    pool.mat.opacity = 0.9;
    pool.life = 0.18;
  }

  muzzle(pos: THREE.Vector3): void {
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 25;
    this.flashLife = 0.05;
    this.flashSprite.position.copy(pos);
    (this.flashSprite.material as THREE.SpriteMaterial).opacity = 0.9;
    this.flashSprite.scale.set(0.45, 0.45, 1);
  }

  update(dt: number): void {
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.mat.opacity = Math.max(0, (t.life / 0.09) * 0.85);
        if (t.life <= 0) {
          this.scene.remove(t.line);
          t.line.geometry.dispose();
          t.mat.dispose();
        }
      }
    }
    this.tracers = this.tracers.filter((t) => t.life > 0);

    for (const i of this.impacts) {
      if (i.life > 0) {
        i.life -= dt;
        const k = Math.max(0, i.life / 0.18);
        i.mat.opacity = k;
        const s = 0.25 + (1 - k) * 0.35;
        i.sprite.scale.set(s, s, 1);
      }
    }

    if (this.flashLife > 0) {
      this.flashLife -= dt;
      this.flashLight.intensity = Math.max(0, (this.flashLife / 0.05) * 25);
      const mat = this.flashSprite.material as THREE.SpriteMaterial;
      mat.opacity = Math.max(0, (this.flashLife / 0.05) * 0.9);
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
