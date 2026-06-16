#!/usr/bin/env -S npx tsx
import { Command } from 'commander';
import {
  AGENT_KINDS,
  TASK_STATUSES,
  AGENT_PHASES,
  type AgentKind,
  type AgentPhase,
  type TaskStatus,
  type VibeTask,
} from '@vibestick/protocol';

function httpBase(): string {
  const ws = Number(process.env.VIBESTICK_WS_PORT ?? 47600);
  const port = Number(process.env.VIBESTICK_HTTP_PORT ?? ws + 1);
  const host = process.env.VIBESTICK_BIND ?? '127.0.0.1';
  return `http://${host}:${port}`;
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  try {
    const res = await fetch(httpBase() + path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return (await res.json()) as T;
  } catch {
    console.error(
      `Could not reach vibestickd at ${httpBase()} — is it running? (\`vibestick start\`)`,
    );
    process.exit(1);
  }
}

const program = new Command();
program.name('vibestick').description('vibestick-s3 control CLI').version('0.0.0');

program
  .command('start')
  .description('run the vibestickd bridge daemon (foreground)')
  .action(async () => {
    const { startBridge } = await import('vibestickd');
    const bridge = await startBridge();
    const shutdown = () => {
      console.log('\nvibestickd: shutting down…');
      void bridge.close().then(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.stdin.resume();
  });

program
  .command('ping')
  .description('check the daemon is up')
  .action(async () => {
    const r = await call<{ ok: boolean; protocolVersion: number; clients: number }>(
      'GET',
      '/health',
    );
    console.log(`ok — protocol v${r.protocolVersion}, ${r.clients} device(s) connected`);
  });

program
  .command('pair')
  .description('show / regenerate the 6-digit pairing code')
  .option('--new', 'regenerate the code')
  .action(async (opts: { new?: boolean }) => {
    const r = await call<{ code: string }>(opts.new ? 'POST' : 'GET', '/pair');
    console.log(`Pairing code: ${r.code}`);
    console.log('Enter this on the device (or set VIBESTICK_TOKEN for the simulator).');
  });

program
  .command('status')
  .description('show the current task and connection summary')
  .action(async () => {
    const r = await call<{
      currentTask: VibeTask | null;
      tasks: VibeTask[];
      devices: string[];
      clients: number;
    }>('GET', '/status');
    const t = r.currentTask;
    console.log(
      `devices paired: ${r.devices.length}   connected: ${r.clients}   tasks: ${r.tasks.length}`,
    );
    if (!t) {
      console.log('current task: (none)');
    } else {
      console.log(`current task: [${t.agent}] ${t.status}/${t.phase} — ${t.title}`);
      if (t.requiresMacAttention) console.log('  ⚠ requires attention on the Mac');
    }
  });

program
  .command('send-test')
  .description('post a fake agent event to drive the device monitor')
  .option('--agent <agent>', `one of: ${AGENT_KINDS.join('|')}`, 'codex')
  .option('--status <status>', `one of: ${TASK_STATUSES.join('|')}`, 'running')
  .option('--phase <phase>', `one of: ${AGENT_PHASES.join('|')}`, 'editing')
  .option('--title <title>', 'task title', 'Test task')
  .action(async (opts: { agent: string; status: string; phase: string; title: string }) => {
    const event: Partial<VibeTask> = {
      agent: opts.agent as AgentKind,
      status: opts.status as TaskStatus,
      phase: opts.phase as AgentPhase,
      title: opts.title,
      source: 'manual',
    };
    const t = await call<VibeTask>('POST', '/event', event);
    console.log(`posted: [${t.agent}] ${t.status}/${t.phase} — ${t.title}`);
  });

program
  .command('doctor')
  .description('basic environment checks')
  .action(async () => {
    const r = await call<{ ok: boolean; protocolVersion: number }>('GET', '/health');
    console.log(`daemon:   ${r.ok ? 'up' : 'down'} (protocol v${r.protocolVersion})`);
    console.log(
      `stt:      ${process.env.VIBESTICK_STT_PROVIDER ?? 'mock'} (M3 wires real engines)`,
    );
    console.log(`normalize:${process.env.VIBESTICK_NORMALIZER_BACKEND ?? 'deterministic'} (M4)`);
  });

program.parseAsync().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
