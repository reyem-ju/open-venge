import type { ClientMsg, ServerMsg } from '@open-venge/shared';

export class NetClient {
  private ws: WebSocket | null = null;
  private pingTimer: number | null = null;
  rtt = 0;
  onMessage: (msg: ServerMsg) => void = () => {};
  onClose: () => void = () => {};

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => {
        settled = true;
        resolve();
        this.pingTimer = window.setInterval(() => {
          this.send({ t: 'ping', time: performance.now() });
        }, 2000);
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error('Connection failed'));
        }
      };
      ws.onclose = () => {
        if (this.pingTimer !== null) clearInterval(this.pingTimer);
        this.pingTimer = null;
        this.onClose();
        if (!settled) {
          settled = true;
          reject(new Error('Connection closed'));
        }
      };
      ws.onmessage = (ev) => {
        try {
          this.onMessage(JSON.parse(ev.data as string) as ServerMsg);
        } catch {
          /* malformed */
        }
      };
    });
  }

  send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.ws?.close();
    this.ws = null;
  }
}
