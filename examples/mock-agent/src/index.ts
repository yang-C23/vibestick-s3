/**
 * Mock agent — posts a scripted Codex/Claude lifecycle to the (mock) bridge's
 * HTTP /event endpoint, so you can see the device monitor flow without running
 * a real agent. This previews how the real bridge ingests hook/wrapper events.
 *
 *   pnpm --filter @vibestick/mock-agent dev
 */
import type { VibeTask } from '@vibestick/protocol';

const PORT = Number(process.env.VIBESTICK_WS_PORT ?? 47600) + 1;
const ENDPOINT = `http://127.0.0.1:${PORT}/event`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const sequence: Array<Partial<VibeTask>> = [
  {
    id: 'task_demo',
    agent: 'codex',
    status: 'running',
    phase: 'planning',
    title: 'Refactor auth module',
  },
  { phase: 'reading' },
  { phase: 'editing' },
  { phase: 'running_tests' },
  {
    status: 'needs_approval',
    phase: 'waiting',
    riskLevel: 'high',
    summary: 'wants to run: git push',
  },
  { status: 'completed', phase: 'summarizing' },
];

async function post(body: Partial<VibeTask>): Promise<void> {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    console.log(`POST /event ${res.status}`, body);
  } catch (e) {
    console.error(
      `could not reach bridge at ${ENDPOINT} — is mock-bridge running?`,
      (e as Error).message,
    );
    process.exit(1);
  }
}

for (const step of sequence) {
  await post(step);
  await sleep(1000);
}
console.log('mock-agent: lifecycle complete');
