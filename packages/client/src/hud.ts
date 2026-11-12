import type { SnapshotPlayer } from '@open-venge/shared';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class HUD {
  private crosshair = $<HTMLDivElement>('crosshair');
  private hitmarkerEl = $<HTMLDivElement>('hitmarker');
  private healthBar = $<HTMLDivElement>('health-bar');
  private healthNum = $<HTMLDivElement>('health-num');
  private ammoNum = $<HTMLDivElement>('ammo-num');
  private ammoMag = $<HTMLDivElement>('ammo-mag');
  private weaponName = $<HTMLDivElement>('weapon-name');
  private timerEl = $<HTMLDivElement>('timer');
  private scoreEl = $<HTMLDivElement>('top-score');
  private killfeedEl = $<HTMLDivElement>('killfeed');
  private scoreboardEl = $<HTMLDivElement>('scoreboard');
  private scoreboardBody = $<HTMLDivElement>('scoreboard-body');
  private respawnEl = $<HTMLDivElement>('respawn-overlay');
  private respawnCount = $<HTMLDivElement>('respawn-count');
  private respawnKiller = $<HTMLDivElement>('respawn-killer');
  private endEl = $<HTMLDivElement>('end-screen');
  private endBody = $<HTMLDivElement>('end-body');
  private vignetteEl = $<HTMLDivElement>('damage-vignette');
  private dirWrap = $<HTMLDivElement>('dir-indicators');
  private fpsEl = $<HTMLDivElement>('fps-ping');
  private scopeEl = $<HTMLDivElement>('scope-overlay');
  private hintEl = $<HTMLDivElement>('resume-hint');

  private hitmarkerTimer = 0;
  private vignetteTimer = 0;
  private dirPool: HTMLDivElement[] = [];

  constructor() {
    for (let i = 0; i < 5; i++) {
      const d = document.createElement('div');
      d.className = 'dir-indicator';
      d.style.opacity = '0';
      this.dirWrap.appendChild(d);
      this.dirPool.push(d);
    }
  }

  setCrosshairSpread(px: number): void {
    const gap = Math.round(6 + px);
    this.crosshair.style.setProperty('--gap', `${gap}px`);
  }

  hitmarker(headshot: boolean): void {
    this.hitmarkerEl.style.color = headshot ? '#ffd24a' : '#ffffff';
    this.hitmarkerEl.style.opacity = '1';
    this.hitmarkerTimer = 0.18;
  }

  vignette(): void {
    this.vignetteTimer = 0.5;
    this.vignetteEl.style.opacity = '0.85';
  }

  damageFrom(dirX: number, dirZ: number, yaw: number): void {
    const angle = Math.atan2(dirX, -dirZ) - yaw;
    const el = this.dirPool.find((d) => d.style.opacity === '0') ?? this.dirPool[0];
    el.style.transform = `translate(-50%, -50%) rotate(${angle}rad) translateY(-90px)`;
    el.style.opacity = '1';
    el.dataset.fade = String(performance.now() + 900);
  }

  setHealth(hp: number): void {
    const pct = Math.max(0, Math.min(100, hp));
    this.healthBar.style.width = `${pct}%`;
    this.healthNum.textContent = String(Math.round(hp));
    this.healthNum.style.color = pct < 35 ? '#ff5b4b' : '#e8edf4';
  }

  setAmmo(ammo: number, mag: number, weapon: string, reloading: boolean): void {
    this.ammoNum.textContent = reloading ? '--' : String(ammo);
    this.ammoMag.textContent = `/ ${mag}`;
    this.weaponName.textContent = weapon;
  }

  setTimer(ms: number): void {
    this.timerEl.textContent = fmtTime(ms);
  }

  setTopScore(kills: number, leader: number, limit: number): void {
    this.scoreEl.textContent = `You ${kills} — Leader ${leader} / ${limit}`;
  }

  setFpsPing(fps: number, ping: number): void {
    this.fpsEl.textContent = `${fps} fps · ${ping} ms`;
  }

  killfeed(killer: string | null, victim: string, weapon: string, hs: boolean, mine: boolean): void {
    const row = document.createElement('div');
    row.className = 'killfeed-row' + (mine ? ' mine' : '');
    if (killer) {
      const k = document.createElement('span');
      k.textContent = killer;
      row.appendChild(k);
      const w = document.createElement('span');
      w.className = 'kf-weapon';
      w.textContent = hs ? `${weapon} ✷` : weapon;
      row.appendChild(w);
    } else {
      const w = document.createElement('span');
      w.className = 'kf-weapon';
      w.textContent = weapon;
      row.appendChild(w);
    }
    const v = document.createElement('span');
    v.textContent = victim;
    row.appendChild(v);
    this.killfeedEl.prepend(row);
    while (this.killfeedEl.children.length > 5) {
      this.killfeedEl.lastChild?.remove();
    }
    setTimeout(() => row.remove(), 6000);
  }

  scoreboard(players: SnapshotPlayer[], myId: number, limit: number): void {
    const sorted = [...players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    let html = '';
    for (const p of sorted) {
      html +=
        `<div class="sb-row${p.id === myId ? ' me' : ''}">` +
        `<span class="sb-name">${escapeHtml(p.name)}</span>` +
        `<span>${p.kills}</span><span>${p.deaths}</span><span>${p.ping} ms</span></div>`;
    }
    this.scoreboardBody.innerHTML =
      `<div class="sb-row sb-head"><span>Player</span><span>K</span><span>D</span><span>Ping</span></div>` + html;
    this.scoreboardEl.classList.add('visible');
  }

  hideScoreboard(): void {
    this.scoreboardEl.classList.remove('visible');
  }

  respawnOverlay(show: boolean, remainingMs: number, killerName: string): void {
    this.respawnEl.classList.toggle('visible', show);
    if (show) {
      this.respawnCount.textContent = `${Math.max(0, Math.ceil(remainingMs / 1000))}`;
      this.respawnKiller.textContent = killerName ? `Killed by ${killerName}` : '';
    }
  }

  endScreen(scores: { id: number; name: string; kills: number; deaths: number }[] | null): void {
    this.endEl.classList.toggle('visible', scores !== null);
    if (!scores) return;
    let html = '<div class="sb-row sb-head"><span>Player</span><span>K</span><span>D</span></div>';
    for (const s of scores) {
      html += `<div class="sb-row"><span class="sb-name">${escapeHtml(s.name)}</span><span>${s.kills}</span><span>${s.deaths}</span></div>`;
    }
    this.endBody.innerHTML = html;
  }

  scope(show: boolean): void {
    this.scopeEl.classList.toggle('visible', show);
  }

  resumeHint(show: boolean): void {
    this.hintEl.classList.toggle('visible', show);
  }

  update(dt: number): void {
    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer -= dt;
      if (this.hitmarkerTimer <= 0) this.hitmarkerEl.style.opacity = '0';
    }
    if (this.vignetteTimer > 0) {
      this.vignetteTimer -= dt;
      const k = Math.max(0, this.vignetteTimer / 0.5);
      this.vignetteEl.style.opacity = String(k * 0.85);
    }
    const now = performance.now();
    for (const d of this.dirPool) {
      const fade = Number(d.dataset.fade ?? 0);
      if (fade && now > fade) {
        d.style.opacity = '0';
        d.dataset.fade = '0';
      }
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
