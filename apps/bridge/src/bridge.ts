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
import { copyToClipboard } from '@vibestick/integration-clipboard';
import { injectToFrontmost, type InjectResult } from '@vibestick/integration-terminal';
import { loadConfig, type BridgeConfig } from './config';
import { PairingStore } from './pairing';
import { advertise, type MdnsHandle } from './mdns';
import { createPipeline, PipelineError } from './pipeline';
import { startSerialTransport, type SerialHandle } from './serial';

export interface Bridge {
  config: BridgeConfig;
  store: StatusStore;
  close(): Promise<void>;
}

/** Transport-agnostic device connection (WebSocket or USB serial). */
export interface Conn {
  id: string;
  send(m: BridgeToDevice): void;
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

  const conns = new Set<Conn>();
  const sockets = new Set<WebSocket>();
  const sessionTarget = new Map<string, number>();
  const sessionAudio = new Map<string, AudioAccumulator>();

  const broadcast = (m: BridgeToDevice): void => {
    for (const c of conns) c.send(m);
  };
  const currentTarget = (conn: Conn): Target => TARGETS[sessionTarget.get(conn.id) ?? 0] ?? 'auto';
  const sendDraft = (conn: Conn, d: Draft): void => {
    conn.send({
      type: 'draft.preview',
      draftId: d.draftId,
      target: d.target,
      shortPreview: d.shortPreview,
      riskLevel: d.riskLevel,
      needsClarification: d.needsClarification,
      clarificationQuestion: d.clarificationQuestion,
    });
    conn.send({ type: 'state.update', state: 'draft_preview' });
  };

  const autoPaste = process.env.VIBESTICK_INJECT_AUTOPASTE === 'true';
  const injectForTarget = async (target: Target, text: string): Promise<InjectResult> => {
    if (!text) return { ok: false, method: 'clipboard', message: 'nothing to inject' };
    if (target === 'clipboard') {
      await copyToClipboard(text);
      return { ok: true, method: 'clipboard', message: 'copied to clipboard' };
    }
    return injectToFrontmost(text, { autoPaste });
  };

  const runPipeline = async (conn: Conn, pcm: Buffer | null): Promise<void> => {
    conn.send({ type: 'state.update', state: 'transcribing' });
    try {
      const draft = await pipeline.process(pcm, currentTarget(conn));
      store.addDraft(draft);
      sendDraft(conn, draft);
    } catch (e) {
      const code = e instanceof PipelineError ? e.code : 'PIPELINE_ERROR';
      conn.send({ type: 'error', code, message: (e as Error).message });
      conn.send({
        type: 'state.update',
        state: deviceStateForTask(store.currentTask),
        task: store.currentTask,
      });
    }
  };

  store.on('change', (task: VibeTask) => {
    broadcast({ type: 'task.update', task });
    broadcast({ type: 'state.update', state: deviceStateForTask(task), task });
  });

  async function handle(conn: Conn, msg: DeviceToBridge): Promise<void> {
    switch (msg.type) {
      case 'hello': {
        const neg = negotiateVersion(msg.protocolVersion);
        if (!neg.ok) {
          conn.send({
            type: 'error',
            code: 'PROTOCOL_VERSION',
            message: neg.reason ?? 'unsupported',
          });
          return;
        }
        if (config.requireToken && !pairing.verify(msg.deviceId, msg.token)) {
          conn.send({ type: 'error', code: 'PAIRING', message: 'unpaired — run `vibestick pair`' });
          return;
        }
        pairing.markPaired(msg.deviceId);
        conn.send({
          type: 'welcome',
          protocolVersion: PROTOCOL_VERSION,
          deviceId: msg.deviceId,
          config: DEVICE_CONFIG,
        });
        conn.send({
          type: 'state.update',
          state: deviceStateForTask(store.currentTask),
          task: store.currentTask,
        });
        break;
      }
      case 'heartbeat':
        conn.send({ type: 'pong', ts: msg.ts });
        break;
      case 'button.event':
        if (msg.button === 'primary' && msg.gesture === 'long_press_start') {
          conn.send({ type: 'state.update', state: 'recording' });
        } else if (msg.button === 'secondary' && msg.gesture === 'click') {
          sessionTarget.set(conn.id, ((sessionTarget.get(conn.id) ?? 0) + 1) % TARGETS.length);
          conn.send({ type: 'state.update', state: 'idle' });
        }
        break;
      case 'audio.start':
        sessionAudio.set(conn.id, new AudioAccumulator());
        conn.send({ type: 'state.update', state: 'streaming' });
        break;
      case 'audio.chunk': {
        // serial transport delivers PCM as base64 (WiFi uses binary frames)
        sessionAudio.get(conn.id)?.append(Buffer.from(msg.data, 'base64'));
        break;
      }
      case 'audio.stop': {
        const pcm = sessionAudio.get(conn.id)?.pcm() ?? null;
        sessionAudio.delete(conn.id);
        await runPipeline(conn, pcm);
        break;
      }
      case 'draft.action': {
        if (msg.action === 'send') {
          conn.send({ type: 'state.update', state: 'sending' });
          const draft = store.recallDraft(1);
          const target = draft?.target ?? currentTarget(conn);
          try {
            await injectForTarget(target, draft?.cleanPrompt ?? '');
          } catch (e) {
            conn.send({ type: 'error', code: 'INJECT_FAILED', message: (e as Error).message });
          }
          store.applyEvent({
            agent: targetToAgent(target),
            status: 'running',
            phase: 'planning',
            title: draft?.shortPreview ?? 'Voice task',
            source: 'manual',
          });
        } else if (msg.action === 'retry') {
          await runPipeline(conn, null);
        } else if (msg.action === 'restore_last') {
          const d = store.recallDraft(1);
          if (d) sendDraft(conn, d);
        } else if (msg.action === 'cancel') {
          conn.send({
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

  // --- WebSocket transport ---
  let wsSeq = 0;
  const wss = new WebSocketServer({ host: config.host, port: config.wsPort });
  wss.on('connection', (ws) => {
    const conn: Conn = {
      id: `ws_${++wsSeq}`,
      send: (m) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
      },
    };
    conns.add(conn);
    sockets.add(ws);
    ws.on('message', (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        sessionAudio.get(conn.id)?.append(toBuffer(data));
        return;
      }
      try {
        void handle(conn, JSON.parse(data.toString()) as DeviceToBridge);
      } catch {
        /* ignore malformed frames */
      }
    });
    ws.on('close', () => {
      conns.delete(conn);
      sockets.delete(ws);
      sessionTarget.delete(conn.id);
      sessionAudio.delete(conn.id);
    });
  });

  // --- USB serial transport ---
  let serial: SerialHandle | null = null;
  if (config.serialPort) {
    serial = startSerialTransport(config.serialPort, {
      onConn: (conn) => conns.add(conn),
      onMessage: (conn, msg) => void handle(conn, msg),
      onClose: (conn) => {
        conns.delete(conn);
        sessionTarget.delete(conn.id);
        sessionAudio.delete(conn.id);
      },
    });
  }

  // --- HTTP control ---
  const json = (res: ServerResponse, code: number, body: unknown): void => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '';
    if (req.method === 'GET' && url === '/health') {
      return json(res, 200, { ok: true, protocolVersion: PROTOCOL_VERSION, clients: conns.size });
    }
    if (req.method === 'GET' && url === '/status') {
      return json(res, 200, {
        currentTask: store.currentTask,
        tasks: store.list(),
        devices: pairing.pairedDeviceIds,
        clients: conns.size,
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
    `vibestickd: control HTTP http://${config.host}:${config.httpPort} (/health /status /event /pair /inject)`,
  );
  if (config.serialPort) console.log(`vibestickd: serial      ${config.serialPort}`);
  console.log(
    `vibestickd: pairing code ${pairing.code}${config.requireToken ? ' (required)' : ' (token not required in dev)'}`,
  );

  return {
    config,
    store,
    async close() {
      mdns?.stop();
      serial?.close();
      for (const s of sockets) s.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      await new Promise<void>((r) => http.close(() => r()));
    },
  };
}
