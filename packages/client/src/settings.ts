export interface Settings {
  sensitivity: number;
  fov: number;
  volume: number;
  name: string;
  loadout: WeaponId;
}

import type { WeaponId } from '@open-venge/shared';

const KEY = 'open-venge-settings';

const DEFAULTS: Settings = {
  sensitivity: 1,
  fov: 90,
  volume: 0.7,
  name: '',
  loadout: 'rifle',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}
