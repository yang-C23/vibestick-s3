/**
 * Device simulator — a terminal stand-in for the StickS3 screen + buttons, so
 * you can develop the bridge and protocol without hardware.
 *
 *   pnpm --filter @vibestick/device-simulator dev            # interactive (TTY)
 *   pnpm --filter @vibestick/device-simulator dev -- --script  # automated smoke run
 *
 * Keys (interactive): r=record/stop  s=send  x=redo/cancel  c=cycle target
 *                     g=shake(refresh)  q=quit
 */
import readline from 'node:readline';
import { WebSocket } from 'ws';
import { PROTOCOL_VERSION, type BridgeToDevice, type DeviceToBridge } from '@vibestick/protocol';
import { renderScreen, type ViewModel } from './render';

const URL =
  process.env.VIBESTICK_BRIDGE_URL ??
  `ws://127.0.0.1:${Number(process.env.VIBESTICK_WS_PORT ?? 47600)}`;
const SCRIPT = process.argv.includes('--script');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const vm: ViewModel = {
  state: 'idle',
  target: 'auto',
  task: null,
  draft: null,
  error: null,
  wifi: 3,
  battery: 88,
};
let recording = false;
let lastDraftId = '';

const ws = new WebSocket(URL);
const send = (msg: DeviceToBridge) => ws.send(JSON.stringify(msg));

function paint(): void {
  if (!SCRIPT) console.clear();
  console.log(renderScreen(vm));
}

function apply(msg: BridgeToDevice): void {
  switch (msg.type) {
    case 'welcome':
      vm.state = 'idle';
      break;
    case 'state.update':
      vm.state = msg.state;
      if (msg.task !== undefined) vm.task = msg.task ?? null;
      break;
    case 'draft.preview':
      lastDraftId = msg.draftId;
      vm.target = msg.target;
      vm.draft = {
        shortPreview: msg.shortPreview,
        riskLevel: msg.riskLevel,
        target: msg.target,
        needsClarification: msg.needsClarification,
      };
      break;
    case 'task.update':
      vm.task = msg.task;
      break;
    case 'error':
      vm.error = `${msg.code}: ${msg.message}`;
      vm.state = 'error';
      break;
    case 'config':
    case 'pong':
      break;
  }
}

function toggleRecord(): void {
  if (!recording) {
    recording = true;
    send({ type: 'button.event', button: 'primary', gesture: 'long_press_start', ts: Date.now() });
    send({
      type: 'audio.start',
      sessionId: 'aud',
      sampleRate: 16000,
      channels: 1,
      format: 'pcm16',
    });
  } else {
    recording = false;
    send({ type: 'audio.stop', sessionId: 'aud', durationMs: 1500 });
  }
}

function cleanup(code = 0): never {
  if (!SCRIPT && process.stdin.isTTY) process.stdin.setRawMode(false);
  try {
    ws.close();
  } catch {
    /* noop */
  }
  process.exit(code);
}

ws.on('open', () => {
  send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, deviceId: 'sim-001', firmware: 'sim' });
  if (SCRIPT) void runScript();
});
ws.on('message', (d) => {
  apply(JSON.parse(d.toString()) as BridgeToDevice);
  paint();
});
ws.on('error', (e) => {
  console.error('connection error:', (e as Error).message, `(is the bridge running at ${URL}?)`);
  process.exit(1);
});

if (!SCRIPT && process.stdin.isTTY) {
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.on('keypress', (_s, key: { name?: string; ctrl?: boolean }) => {
    if (key.ctrl && key.name === 'c') cleanup();
    switch (key.name) {
      case 'r':
        toggleRecord();
        break;
      case 's':
        if (vm.draft) send({ type: 'draft.action', draftId: lastDraftId, action: 'send' });
        break;
      case 'x':
        send({ type: 'draft.action', draftId: lastDraftId, action: vm.draft ? 'retry' : 'cancel' });
        break;
      case 'c':
        send({ type: 'button.event', button: 'secondary', gesture: 'click', ts: Date.now() });
        break;
      case 'g':
        send({ type: 'imu.event', gesture: 'shake', ts: Date.now() });
        break;
      case 'q':
        cleanup();
        break;
    }
  });
}

async function runScript(): Promise<void> {
  await sleep(300);
  console.log('▶ hold-to-talk (record)');
  toggleRecord();
  await sleep(500);
  console.log('▶ release (transcribe)');
  toggleRecord();
  await sleep(1500);
  if (vm.draft) {
    console.log('▶ confirm send');
    send({ type: 'draft.action', draftId: lastDraftId, action: 'send' });
  }
  await sleep(5000);
  const ok = vm.state === 'done';
  console.log(ok ? '✓ SCRIPT OK: reached DONE' : `✗ SCRIPT FAIL: state=${vm.state}`);
  cleanup(ok ? 0 : 1);
}
