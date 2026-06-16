/**
 * Mock bridge — lets you develop the device/simulator and exercise the whole
 * protocol WITHOUT real hardware, STT, or AI. It fakes:
 *   - the voice flow (button/audio -> transcribing -> draft.preview -> send -> task)
 *   - the agent monitor flow via an HTTP POST /event endpoint (preview of how the
 *     real bridge ingests Codex/Claude hook + wrapper events).
 */
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import {
  PROTOCOL_VERSION,
  negotiateVersion,
  TARGETS,
  type BridgeToDevice,
  type DeviceConfig,
  type DeviceToBridge,
  type Target,
  type VibeTask,
} from '@vibestick/protocol';

const HOST = process.env.VIBESTICK_BIND ?? '127.0.0.1';
const WS_PORT = Number(process.env.VIBESTICK_WS_PORT ?? 47600);
const HTTP_PORT = WS_PORT + 1;
const CONFIG: DeviceConfig = { recordMaxMs: 60000, autoPaste: false, mascotPack: 'default' };
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const clients = new Set<WebSocket>();
let targetIdx = 0;
let currentTask: VibeTask | null = null;

function send(ws: WebSocket, msg: BridgeToDevice): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
function broadcast(msg: BridgeToDevice): void {
  const s = JSON.stringify(msg);
  for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(s);
}
const nowIso = () => new Date().toISOString();
const currentTarget = (): Target => TARGETS[targetIdx] ?? 'auto';

async function simulateVoiceFlow(ws: WebSocket): Promise<void> {
  send(ws, { type: 'state.update', state: 'transcribing' });
  await delay(700);
  send(ws, {
    type: 'draft.preview',
    draftId: `draft_${Date.now()}`,
    target: currentTarget(),
    shortPreview: 'Add a README and fix the auth callback bug in auth.ts.',
    riskLevel: 'low',
    needsClarification: false,
  });
  send(ws, { type: 'state.update', state: 'draft_preview' });
}

async function simulateSend(ws: WebSocket): Promise<void> {
  send(ws, { type: 'state.update', state: 'sending' });
  const agent = currentTarget() === 'codex' ? 'codex' : 'claude';
  currentTask = {
    id: `task_${Date.now()}`,
    agent,
    status: 'running',
    phase: 'planning',
    title: 'Add README and fix auth callback',
    startedAt: nowIso(),
    lastEventAt: nowIso(),
    source: 'manual',
  };
  broadcast({ type: 'task.update', task: currentTask });
  broadcast({ type: 'state.update', state: 'agent_running', task: currentTask });
  for (const phase of ['reading', 'editing', 'running_tests'] as const) {
    await delay(800);
    currentTask = { ...currentTask, phase, lastEventAt: nowIso() };
    broadcast({ type: 'task.update', task: currentTask });
  }
  await delay(800);
  currentTask = {
    ...currentTask,
    status: 'completed',
    phase: 'summarizing',
    completedAt: nowIso(),
    lastEventAt: nowIso(),
  };
  broadcast({ type: 'task.update', task: currentTask });
  broadcast({ type: 'state.update', state: 'done', task: currentTask });
}

function handle(ws: WebSocket, msg: DeviceToBridge): void {
  switch (msg.type) {
    case 'hello': {
      const neg = negotiateVersion(msg.protocolVersion);
      if (!neg.ok) {
        send(ws, { type: 'error', code: 'PROTOCOL_VERSION', message: neg.reason ?? 'unsupported' });
        return;
      }
      send(ws, {
        type: 'welcome',
        protocolVersion: PROTOCOL_VERSION,
        deviceId: msg.deviceId,
        config: CONFIG,
      });
      send(ws, { type: 'state.update', state: 'idle', task: currentTask });
      break;
    }
    case 'heartbeat':
      send(ws, { type: 'pong', ts: msg.ts });
      break;
    case 'button.event':
      if (msg.button === 'primary' && msg.gesture === 'long_press_start') {
        send(ws, { type: 'state.update', state: 'recording' });
      } else if (msg.button === 'secondary' && msg.gesture === 'click') {
        targetIdx = (targetIdx + 1) % TARGETS.length;
        send(ws, { type: 'state.update', state: 'idle' });
        console.log('target ->', currentTarget());
      }
      break;
    case 'audio.start':
      send(ws, { type: 'state.update', state: 'streaming' });
      break;
    case 'audio.stop':
      void simulateVoiceFlow(ws);
      break;
    case 'draft.action':
      if (msg.action === 'send') void simulateSend(ws);
      else if (msg.action === 'retry') void simulateVoiceFlow(ws);
      else if (msg.action === 'cancel') send(ws, { type: 'state.update', state: 'idle' });
      break;
    case 'imu.event':
      break;
  }
}

function applyAgentEvent(p: Partial<VibeTask>): void {
  currentTask = {
    id: p.id ?? currentTask?.id ?? `task_${Date.now()}`,
    agent: p.agent ?? currentTask?.agent ?? 'unknown',
    status: p.status ?? currentTask?.status ?? 'running',
    phase: p.phase ?? currentTask?.phase ?? 'unknown',
    title: p.title ?? currentTask?.title ?? 'Task',
    summary: p.summary ?? currentTask?.summary,
    startedAt: currentTask?.startedAt ?? nowIso(),
    lastEventAt: nowIso(),
    completedAt: p.status === 'completed' ? nowIso() : currentTask?.completedAt,
    riskLevel: p.riskLevel ?? currentTask?.riskLevel,
    requiresMacAttention: p.status === 'needs_approval',
    source: p.source ?? 'hook',
  };
  broadcast({ type: 'task.update', task: currentTask });
  const state =
    currentTask.status === 'completed'
      ? 'done'
      : currentTask.status === 'failed'
        ? 'error'
        : 'agent_running';
  broadcast({ type: 'state.update', state, task: currentTask });
}

const wss = new WebSocketServer({ host: HOST, port: WS_PORT });
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('message', (data: RawData) => {
    try {
      handle(ws, JSON.parse(data.toString()) as DeviceToBridge);
    } catch {
      /* ignore malformed frames (e.g. binary audio) */
    }
  });
  ws.on('close', () => clients.delete(ws));
});

createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/event') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        applyAgentEvent(JSON.parse(body) as Partial<VibeTask>);
        res.writeHead(200).end('ok');
      } catch {
        res.writeHead(400).end('bad json');
      }
    });
  } else {
    res.writeHead(404).end();
  }
}).listen(HTTP_PORT, HOST, () =>
  console.log(`mock-bridge: HTTP  POST /event on http://${HOST}:${HTTP_PORT}`),
);

console.log(`mock-bridge: WS device link on ws://${HOST}:${WS_PORT}`);
