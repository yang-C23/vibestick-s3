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
import type { ClaudeSettings } from '@vibestick/integration-claude';

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

program
  .command('send')
  .description('inject text into the focused app via the bridge (clipboard; paste needs opt-in)')
  .argument('<text>', 'text to inject')
  .option('--target <t>', 'clipboard|terminal|claude|codex', 'clipboard')
  .action(async (text: string, opts: { target: string }) => {
    const r = await call<{ ok: boolean; method: string; message: string }>('POST', '/inject', {
      text,
      target: opts.target,
    });
    console.log(r.message ?? JSON.stringify(r));
  });

program
  .command('watch')
  .description('run an agent command and stream its status to the device')
  .option('--agent <agent>', 'codex|claude (auto-detected from the command if omitted)')
  .option('--title <title>', 'task title')
  .argument('<command...>', 'the agent command, e.g. -- codex exec "fix the bug"')
  .action(async (command: string[], opts: { agent?: string; title?: string }) => {
    const { spawn } = await import('node:child_process');
    const { createInterface } = await import('node:readline');
    const { basename } = await import('node:path');
    const { detectCodexPhase } = await import('@vibestick/integration-codex');
    const { detectClaudePhase } = await import('@vibestick/integration-claude');

    const cmd = command[0] ?? '';
    const args = command.slice(1);
    const agent =
      opts.agent ?? (/claude/.test(cmd) ? 'claude' : /codex/.test(cmd) ? 'codex' : 'unknown');
    const detect = agent === 'claude' ? detectClaudePhase : detectCodexPhase;
    const id = `task_${Date.now()}`;
    const title = opts.title ?? `${agent}: ${args.join(' ').slice(0, 40)}`;

    const post = async (body: Record<string, unknown>): Promise<void> => {
      try {
        await fetch(httpBase() + '/event', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch {
        /* keep running the command even if the daemon is down */
      }
    };

    await post({
      id,
      agent,
      status: 'running',
      phase: 'planning',
      title,
      source: 'wrapper',
      cwd: process.cwd(),
      projectName: basename(process.cwd()),
    });

    const child = spawn(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'] });
    createInterface({ input: child.stdout }).on('line', (line) => {
      process.stdout.write(line + '\n');
      const phase = detect(line);
      if (phase)
        void post({ id, phase, ...(phase === 'waiting' ? { status: 'needs_approval' } : {}) });
    });
    child.stderr.on('data', (d: Buffer) => process.stderr.write(d));
    child.on('close', (code) => {
      void post({ id, status: code === 0 ? 'completed' : 'failed', phase: 'summarizing' }).then(
        () => process.exit(code ?? 0),
      );
    });
  });

program
  .command('install-hooks')
  .description('install Claude Code / Codex hooks that report status to the bridge')
  .option('--claude', 'install Claude Code hooks')
  .option('--codex', 'install Codex hooks')
  .option('--dry-run', 'print what would change without writing')
  .action(async (opts: { claude?: boolean; codex?: boolean; dryRun?: boolean }) => {
    const fs = await import('node:fs');
    const { homedir } = await import('node:os');
    const { join, dirname } = await import('node:path');
    const claudeMod = await import('@vibestick/integration-claude');
    const codexMod = await import('@vibestick/integration-codex');

    const both = !opts.claude && !opts.codex;
    const hooksDir = process.env.VIBESTICK_HOOKS_DIR ?? join(homedir(), '.vibestick', 'hooks');
    const writeExec = (p: string, content: string) => {
      fs.mkdirSync(dirname(p), { recursive: true });
      fs.writeFileSync(p, content);
      fs.chmodSync(p, 0o755);
    };

    if (opts.claude || both) {
      const script = join(hooksDir, 'claude-hook.sh');
      const settingsPath =
        process.env.VIBESTICK_CLAUDE_SETTINGS ?? join(homedir(), '.claude', 'settings.json');
      const existing = fs.existsSync(settingsPath)
        ? (JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as ClaudeSettings)
        : {};
      const merged = claudeMod.withVibestickHooks(existing, script);
      if (opts.dryRun) {
        console.log(`[dry-run] would write ${script}`);
        console.log(`[dry-run] ${settingsPath} hooks ->\n${JSON.stringify(merged.hooks, null, 2)}`);
      } else {
        writeExec(script, claudeMod.claudeHookScript());
        fs.mkdirSync(dirname(settingsPath), { recursive: true });
        if (fs.existsSync(settingsPath)) fs.copyFileSync(settingsPath, settingsPath + '.bak');
        fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n');
        console.log(`✓ Claude Code hooks installed -> ${settingsPath} (backup at .bak)`);
      }
    }

    if (opts.codex || both) {
      const hookScript = join(hooksDir, 'codex-hook.sh');
      const notify = join(hooksDir, 'codex-notify.sh');
      const codexDir = process.env.VIBESTICK_CODEX_DIR ?? join(homedir(), '.codex');
      const hooksJsonPath = join(codexDir, 'hooks.json');
      const tomlLine = codexMod.codexConfigNotifyLine(notify);
      if (opts.dryRun) {
        console.log(`[dry-run] would write ${hookScript}, ${notify}, ${hooksJsonPath}`);
        console.log(`[dry-run] add to ~/.codex/config.toml:\n  ${tomlLine}`);
      } else {
        writeExec(hookScript, codexMod.codexHookScript());
        writeExec(notify, codexMod.codexNotifyScript());
        fs.mkdirSync(codexDir, { recursive: true });
        if (fs.existsSync(hooksJsonPath)) fs.copyFileSync(hooksJsonPath, hooksJsonPath + '.bak');
        fs.writeFileSync(
          hooksJsonPath,
          JSON.stringify(codexMod.codexHooksJson(hookScript), null, 2) + '\n',
        );
        console.log(`✓ Codex hooks installed -> ${hooksJsonPath}`);
        console.log(`  Add this line to ~/.codex/config.toml:\n    ${tomlLine}`);
      }
    }
  });

program
  .command('uninstall-hooks')
  .description('remove vibestick hooks from Claude Code / Codex')
  .action(async () => {
    const fs = await import('node:fs');
    const { homedir } = await import('node:os');
    const { join } = await import('node:path');
    const claudeMod = await import('@vibestick/integration-claude');

    const settingsPath =
      process.env.VIBESTICK_CLAUDE_SETTINGS ?? join(homedir(), '.claude', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const cleaned = claudeMod.withoutVibestickHooks(
        JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as ClaudeSettings,
      );
      fs.copyFileSync(settingsPath, settingsPath + '.bak');
      fs.writeFileSync(settingsPath, JSON.stringify(cleaned, null, 2) + '\n');
      console.log(`✓ removed vibestick Claude hooks from ${settingsPath}`);
    }
    const codexDir = process.env.VIBESTICK_CODEX_DIR ?? join(homedir(), '.codex');
    const hooksJsonPath = join(codexDir, 'hooks.json');
    if (fs.existsSync(hooksJsonPath)) {
      fs.rmSync(hooksJsonPath);
      console.log(`✓ removed ${hooksJsonPath} (also remove the notify line from config.toml)`);
    }
  });

program.parseAsync().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
