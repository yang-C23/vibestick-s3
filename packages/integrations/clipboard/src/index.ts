import { spawn } from 'node:child_process';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Injectable process runner (so adapters are unit-testable without shelling out). */
export type Runner = (cmd: string, args: string[], input?: string) => Promise<RunResult>;

export const execRunner: Runner = (cmd, args, input) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    p.on('error', reject);
    p.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
    if (input !== undefined) {
      p.stdin.write(input);
      p.stdin.end();
    }
  });

/** Put text on the system clipboard (macOS `pbcopy`). */
export async function copyToClipboard(text: string, run: Runner = execRunner): Promise<void> {
  if (process.platform !== 'darwin') {
    throw new Error('clipboard injection currently supports macOS only');
  }
  const r = await run('pbcopy', [], text);
  if (r.code !== 0) throw new Error(`pbcopy exited ${r.code}: ${r.stderr}`);
}
