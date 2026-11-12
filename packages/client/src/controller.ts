import { BTN, clamp, type InputMsg } from '@open-venge/shared';
import type { Settings } from './settings';

export class Controller {
  yaw = 0;
  pitch = 0;
  recoilPitch = 0;
  recoilYaw = 0;
  seq = 0;
  locked = false;
  shootHeld = false;
  adsHeld = false;
  onLockChange: (locked: boolean) => void = () => {};
  onWeaponSwitch: (slot: 'primary' | 'secondary') => void = () => {};
  onReload: () => void = () => {};
  onScoreboard: (show: boolean) => void = () => {};

  private keys = new Set<string>();

  constructor(
    private canvas: HTMLCanvasElement,
    private settings: Settings,
  ) {
    const add = (target: EventTarget, type: string, fn: EventListener) => {
      target.addEventListener(type, fn);
      this.register(target, type, fn);
    };
    add(document, 'keydown', (e) => this.onKeyDown(e as KeyboardEvent));
    add(document, 'keyup', (e) => this.onKeyUp(e as KeyboardEvent));
    add(document, 'mousemove', (e) => this.onMouseMove(e as MouseEvent));
    add(document, 'mouseup', (e) => this.onMouseUp(e as MouseEvent));
    add(canvas, 'mousedown', (e) => this.onMouseDown(e as MouseEvent));
    add(document, 'wheel', (e) => this.onWheel(e as WheelEvent));
    add(canvas, 'contextmenu', (e) => e.preventDefault());
    add(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.keys.clear();
        this.shootHeld = false;
        this.adsHeld = false;
      }
      this.onLockChange(this.locked);
    });
  }

  private registered: [EventTarget, string, EventListener][] = [];
  private register(target: EventTarget, type: string, fn: EventListener): void {
    this.registered.push([target, type, fn]);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Tab') {
      e.preventDefault();
      this.onScoreboard(true);
      return;
    }
    if (e.code === 'Space') e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === 'Digit1') this.onWeaponSwitch('primary');
    if (e.code === 'Digit2') this.onWeaponSwitch('secondary');
    if (e.code === 'KeyR') this.onReload();
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Tab') {
      this.onScoreboard(false);
      return;
    }
    this.keys.delete(e.code);
  }

  private onWheel(e: WheelEvent): void {
    if (!this.locked || e.deltaY === 0) return;
    this.onWeaponSwitch(e.deltaY > 0 ? 'secondary' : 'primary');
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.locked) {
      void this.canvas.requestPointerLock();
      return;
    }
    if (e.button === 0) this.shootHeld = true;
    if (e.button === 2) this.adsHeld = true;
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button === 0) this.shootHeld = false;
    if (e.button === 2) this.adsHeld = false;
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.locked) return;
    const s = this.settings.sensitivity * 0.0022;
    this.yaw -= e.movementX * s;
    this.pitch = clamp(this.pitch - e.movementY * s, -1.55, 1.55);
  }

  addRecoil(pitchKick: number, yawKick: number): void {
    this.recoilPitch += pitchKick;
    this.recoilYaw += (Math.random() * 2 - 1) * yawKick;
  }

  updateRecoil(dt: number): void {
    const decay = Math.min(1, dt * 9);
    this.recoilPitch *= 1 - decay;
    this.recoilYaw *= 1 - decay;
  }

  buildInput(): InputMsg {
    let btn = 0;
    if (this.keys.has('KeyW')) btn |= BTN.FWD;
    if (this.keys.has('KeyS')) btn |= BTN.BACK;
    if (this.keys.has('KeyA')) btn |= BTN.LEFT;
    if (this.keys.has('KeyD')) btn |= BTN.RIGHT;
    if (this.keys.has('Space')) btn |= BTN.JUMP;
    if (this.shootHeld) btn |= BTN.SHOOT;
    if (this.adsHeld) btn |= BTN.ADS;
    return {
      t: 'input',
      seq: ++this.seq,
      btn,
      yaw: this.yaw + this.recoilYaw,
      pitch: clamp(this.pitch + this.recoilPitch, -1.55, 1.55),
    };
  }

  dispose(): void {
    for (const [target, type, fn] of this.registered) {
      target.removeEventListener(type, fn);
    }
    this.registered = [];
  }
}
