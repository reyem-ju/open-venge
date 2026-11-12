import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { Room } from './room';
import { serveStatic } from './static';

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';
const bots = Math.max(0, Math.min(12, Math.floor(Number(process.env.BOTS ?? 2)) || 0));

const room = new Room(bots);

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, players: room.players.size, tick: room.tick }));
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => room.addConnection(ws));

room.start();
server.listen(port, host, () => {
  console.log(`open-venge server listening on http://${host}:${port} (bots: ${bots})`);
});

function shutdown(): void {
  room.stop();
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
