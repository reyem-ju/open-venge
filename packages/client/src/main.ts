import { WEAPONS, type ServerMsg, type WeaponId } from '@open-venge/shared';
import { loadAssets } from './assets';
import { Sfx } from './audio';
import { Game } from './game';
import { HUD } from './hud';
import { NetClient } from './net';
import { loadSettings, saveSettings } from './settings';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const menu = document.getElementById('menu')!;
const hudEl = document.getElementById('hud')!;
const nameInput = document.getElementById('name-input') as HTMLInputElement;
const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
const menuError = document.getElementById('menu-error')!;

const settings = loadSettings();
const sfx = new Sfx();
const assetsPromise = loadAssets();
nameInput.value = settings.name;

let game: Game | null = null;
let net: NetClient | null = null;

function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

function showError(msg: string): void {
  menuError.textContent = msg;
  playBtn.disabled = false;
  playBtn.textContent = 'PLAY';
}

function selectLoadout(w: WeaponId): void {
  settings.loadout = w;
  saveSettings(settings);
  for (const card of document.querySelectorAll<HTMLDivElement>('.loadout-card')) {
    card.classList.toggle('selected', card.dataset.weapon === w);
  }
}

for (const card of document.querySelectorAll<HTMLDivElement>('.loadout-card')) {
  card.addEventListener('click', () => {
    sfx.resume();
    selectLoadout(card.dataset.weapon as WeaponId);
  });
}
selectLoadout(settings.loadout);

function bindSlider(id: string, apply: (v: number) => void): void {
  const slider = document.getElementById(id) as HTMLInputElement;
  const label = document.getElementById(`${id}-val`)!;
  const update = () => {
    const v = Number(slider.value);
    apply(v);
    label.textContent = slider.dataset.fmt === 'pct' ? `${Math.round(v * 100)}%` : String(v);
    saveSettings(settings);
  };
  slider.addEventListener('input', update);
  update();
}

bindSlider('sens', (v) => (settings.sensitivity = v));
bindSlider('fov', (v) => (settings.fov = v));
bindSlider('vol', (v) => {
  settings.volume = v;
  sfx.setVolume(v);
});

playBtn.addEventListener('click', () => {
  void startPlay();
});

async function startPlay(): Promise<void> {
  sfx.resume();
  settings.name = (nameInput.value.trim() || 'Player').slice(0, 16);
  saveSettings(settings);
  playBtn.disabled = true;
  playBtn.textContent = 'CONNECTING...';
  menuError.textContent = '';

  const assets = await assetsPromise;

  net = new NetClient();
  let started = false;
  let buffer: ServerMsg[] = [];
  let hud: HUD | null = null;

  net.onClose = () => {
    if (game) {
      game.dispose();
      game = null;
    }
    hudEl.classList.add('hidden');
    menu.classList.remove('hidden');
    playBtn.disabled = false;
    playBtn.textContent = 'PLAY';
    showError('Disconnected from server');
    net = null;
  };

  net.onMessage = (msg) => {
    if (!started) {
      if (msg.t === 'welcome') {
        started = true;
        try {
          hud = new HUD();
          game = new Game(canvas, net!, sfx, hud, settings, msg.map, msg.id, assets);
        } catch (err) {
          showError(`Failed to start game: ${(err as Error).message}`);
          net?.disconnect();
          return;
        }
        hudEl.classList.remove('hidden');
        menu.classList.add('hidden');
        playBtn.disabled = false;
        playBtn.textContent = 'PLAY';
        for (const buffered of buffer) game.handleMessage(buffered);
        buffer = [];
      } else if (msg.t === 'reject') {
        showError(msg.reason);
        net?.disconnect();
        return;
      } else {
        buffer.push(msg);
      }
      return;
    }
    game?.handleMessage(msg);
  };

  try {
    await net.connect(wsUrl());
    net.send({ t: 'join', name: settings.name, loadout: settings.loadout });
  } catch {
    showError('Could not connect to server');
    net = null;
    playBtn.disabled = false;
    playBtn.textContent = 'PLAY';
  }
}
