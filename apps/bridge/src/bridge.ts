import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import {
  PROTOCOL_VERSION,
  negotiateVersion,
  TARGETS,
  type AgentKind,
  type BridgeToDevice,
  type DeviceConfig,
  type DeviceToBridge,
  type Target,
  type VibeTask,
} from '@vibestick/protocol';
import { StatusStore, deviceStateForTask, type Draft } from '@vibestick/status-store';
import { AudioAccumulator } from '@vibestick/audio';
import { loadConfig, type BridgeConfig } from './config';
import { PairingStore } from './pairing';
import { advertise, type MdnsHandle } from './mdns';
import { createPipeline, PipelineError } from './pipeline';
import { copyToClipboard } from '@vibestick/integration-clipboard';
import { injectToFrontmost, type InjectResult } from '@vibestick/integration-terminal';

export interface Bridge {
  config: BridgeConfig;
  store: StatusStore;
  close(): Promise<void>;
}

const DEVICE_CONFIG: DeviceConfig = { recordMaxMs: 60000, autoPaste: false, mascotPack: 'default' };

function targetToAgent(t: Target): AgentKind {
  if (t === 'codex') return 'codex';
  if (t === 'claude') return 'claude';
  if (t === 'terminal') return 'terminal';
  return 'unknown';
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data as ArrayBuffer);
}

export async function startBridge(overrides: Partial<BridgeConfig> = {}): Promise<Bridge> {
  const config = loadConfig(overrides);
  const store = new StatusStore();
  const pairing = new PairingStore(config.stateDir);
  const pipeline = createPipeline();

  const clients = new Set<WebSocket>();
  const sessionTarget = new Map<WebSocket, number>();
  const sessionAudio = new Map<WebSocket, AudioAccumulator>();

  const send = (ws: WebSocket, m: BridgeToDevice): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  };
  const broadcast = (m: BridgeToDevice): void => {
    const s = JSON.stringify(m);
    for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(s);
  };
  const currentTarget = (ws: WebSocket): Target => TARGETS[sessionTarget.get(ws) ?? 0] ?? 'auto';
  const sendDraft = (ws: WebSocket, d: Draft): void => {
    send(ws, {
      type: 'draft.preview',
      draftId: d.draftId,
      target: d.target,
      shortPreview: d.shortPreview,
      riskLevel: d.riskLevel,
      needsClarification: d.needsClarification,
      clarificationQuestion: d.clarificationQuestion,
    });
    send(ws, { type: 'state.update', state: 'draft_preview' });
  };
  const runPipeline = async (ws: WebSocket, pcm: Buffer | null): Promise<void> => {
    send(ws, { type: 'state.update', state: 'transcribing' });
    try {
      const draft = await pipeline.process(pcm, currentTarget(ws));
      store.addDraft(draft);
      sendDraft(ws, draft);
    } catch (e) {
      const code = e instanceof PipelineError ? e.code : 'PIPELINE_ERROR';
      send(ws, { type: 'error', code, message: (e as Error).message });
      send(ws, {
        type: 'state.update',
        state: deviceStateForTask(store.currentTask),
        task: store.currentTask,
      });
    }
  };

  const autoPaste = process.env.VIBESTICK_INJECT_AUTOPASTE === 'true';
  const injectForTarget = async (target: Target, text: string): Promise<InjectResult> => {
    if (!text) return { ok: false, method: 'clipboard', message: 'nothing to inject' };
    if (target === 'clipboard') {
      await copyToClipboard(text);
      return { ok: true, method: 'clipboard', message: 'copied to clipboard' };
    }
    // claude / codex / terminal / auto -> paste into the focused terminal (never Enter)
    return injectToFrontmost(text, { autoPaste });
  };

  // Push every task change to all connected devices.
  store.on('change', (task: VibeTask) => {
    broadcast({ type: 'task.update', task });
    broadcast({ type: 'state.update', state: deviceStateForTask(task), task });
  });

  async function handle(ws: WebSocket, msg: DeviceToBridge): Promise<void> {
    switch (msg.type) {
      case 'hello': {
        const neg = negotiateVersion(msg.protocolVersion);
        if (!neg.ok) {
          send(ws, {
            type: 'error',
            code: 'PROTOCOL_VERSION',
            message: neg.reason ?? 'unsupported',
          });
          ws.close();
          return;
        }
        if (config.requireToken && !pairing.verify(msg.deviceId, msg.token)) {
          send(ws, { type: 'error', code: 'PAIRING', message: 'unpaired — run `vibestick pair`' });
          ws.close();
          return;
        }
        pairing.markPaired(msg.deviceId);
        send(ws, {
          type: 'welcome',
          protocolVersion: PROTOCOL_VERSION,
          deviceId: msg.deviceId,
          config: DEVICE_CONFIG,
        });
        send(ws, {
          type: 'state.update',
          state: deviceStateForTask(store.currentTask),
          task: store.currentTask,
        });
        break;
      }
      case 'heartbeat':
        send(ws, { type: 'pong', ts: msg.ts });
        break;
      case 'button.event':
        if (msg.button === 'primary' && msg.gesture === 'long_press_start') {
          send(ws, { type: 'state.update', state: 'recording' });
        } else if (msg.button === 'secondary' && msg.gesture === 'click') {
          sessionTarget.set(ws, ((sessionTarget.get(ws) ?? 0) + 1) % TARGETS.length);
          send(ws, { type: 'state.update', state: 'idle' });
        }
        break;
      case 'audio.start':
        sessionAudio.set(ws, new AudioAccumulator());
        send(ws, { type: 'state.update', state: 'streaming' });
        break;
      case 'audio.stop': {
        const pcm = sessionAudio.get(ws)?.pcm() ?? null;
        sessionAudio.delete(ws);
        await runPipeline(ws, pcm);
        break;
      }
      case 'draft.action': {
        if (msg.action === 'send') {
          send(ws, { type: 'state.update', state: 'sending' });
          const draft = store.recallDraft(1);
          const target = draft?.target ?? currentTarget(ws);
          try {
            await injectForTarget(target, draft?.cleanPrompt ?? '');
          } catch (e) {
            send(ws, { type: 'error', code: 'INJECT_FAILED', message: (e as Error).message });
          }
          store.applyEvent({
            agent: targetToAgent(target),
            status: 'running',
            phase: 'planning',
            title: draft?.shortPreview ?? 'Voice task',
            source: 'manual',
          });
        } else if (msg.action === 'retry') {
          await runPipeline(ws, null);
        } else if (msg.action === 'restore_last') {
          const d = store.recallDraft(1);
          if (d) sendDraft(ws, d);
        } else if (msg.action === 'cancel') {
          send(ws, {
            type: 'state.update',
            state: deviceStateForTask(store.currentTask),
            task: store.currentTask,
          });
        }
        break;
      }
      case 'imu.event':
        break;
    }
  }

  const wss = new WebSocketServer({ host: config.host, port: config.wsPort });
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('message', (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        sessionAudio.get(ws)?.append(toBuffer(data));
        return;
      }
      try {
        void handle(ws, JSON.parse(data.toString()) as DeviceToBridge);
      } catch {
        /* ignore malformed frames */
      }
    });
    ws.on('close', () => {
      clients.delete(ws);
      sessionTarget.delete(ws);
      sessionAudio.delete(ws);
    });
  });

  const json = (res: ServerResponse, code: number, body: unknown): void => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '';
    if (req.method === 'GET' && url === '/health') {
      return json(res, 200, { ok: true, protocolVersion: PROTOCOL_VERSION, clients: clients.size });
    }
    if (req.method === 'GET' && url === '/status') {
      return json(res, 200, {
        currentTask: store.currentTask,
        tasks: store.list(),
        devices: pairing.pairedDeviceIds,
        clients: clients.size,
      });
    }
    if (req.method === 'POST' && url === '/event') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          json(res, 200, store.applyEvent(JSON.parse(body) as Partial<VibeTask>));
        } catch {
          json(res, 400, { error: 'bad json' });
        }
      });
      return;
    }
    if (req.method === 'POST' && url === '/inject') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        void (async () => {
          try {
            const { text, target } = JSON.parse(body) as { text: string; target?: Target };
            const r = await injectForTarget(target ?? 'clipboard', text);
            json(res, r.ok ? 200 : 400, r);
          } catch (e) {
            json(res, 400, { error: (e as Error).message });
          }
        })();
      });
      return;
    }
    if (req.method === 'POST' && url === '/pair')
      return json(res, 200, { code: pairing.regenerate() });
    if (req.method === 'GET' && url === '/pair') return json(res, 200, { code: pairing.code });
    return json(res, 404, { error: 'not found' });
  });
  await new Promise<void>((resolve) => http.listen(config.httpPort, config.host, resolve));

  let mdns: MdnsHandle | null = null;
  if (config.mdns) mdns = advertise(process.env.VIBESTICK_MDNS_NAME ?? 'vibestick', config.wsPort);

  console.log(`vibestickd: device WS   ws://${config.host}:${config.wsPort}`);
  console.log(
    `vibestickd: control HTTP http://${config.host}:${config.httpPort} (/health /status /event /pair)`,
  );
  console.log(
    `vibestickd: pairing code ${pairing.code}${config.requireToken ? ' (required)' : ' (token not required in dev)'}`,
  );

  return {
    config,
    store,
    async close() {
      mdns?.stop();
      for (const c of clients) c.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      await new Promise<void>((r) => http.close(() => r()));
    },
  };
}
