import { describe, it, expect, vi } from 'vitest';
import { copyToClipboard, type RunResult } from '../src/index';

describe('copyToClipboard', () => {
  it('pipes text into pbcopy', async () => {
    if (process.platform !== 'darwin') return; // adapter is macOS-only
    const run = vi.fn(
      async (_cmd: string, _args: string[], _input?: string): Promise<RunResult> => ({
        code: 0,
        stdout: '',
        stderr: '',
      }),
    );
    await copyToClipboard('hello', run);
    expect(run).toHaveBeenCalledWith('pbcopy', [], 'hello');
  });
});
