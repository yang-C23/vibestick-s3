import { describe, it, expect, vi } from 'vitest';
import { injectToFrontmost, type RunResultLike } from './helpers';

describe('injectToFrontmost', () => {
  const ok = async (): Promise<RunResultLike> => ({ code: 0, stdout: '', stderr: '' });

  it('clipboard-only when autoPaste is off (no osascript, no Return)', async () => {
    if (process.platform !== 'darwin') return;
    const run = vi.fn(ok);
    const res = await injectToFrontmost('do the thing', { autoPaste: false, run });
    expect(res.method).toBe('clipboard');
    expect(run).toHaveBeenCalledTimes(1); // pbcopy only
    expect(run).toHaveBeenCalledWith('pbcopy', [], 'do the thing');
  });

  it('pastes via Cmd+V and NEVER sends Return', async () => {
    if (process.platform !== 'darwin') return;
    const calls: string[] = [];
    const run = vi.fn(async (cmd: string, args: string[]): Promise<RunResultLike> => {
      calls.push([cmd, ...args].join(' '));
      return { code: 0, stdout: '', stderr: '' };
    });
    const res = await injectToFrontmost('do the thing', { autoPaste: true, run });
    expect(res.method).toBe('paste');
    const osa = calls.find((c) => c.startsWith('osascript')) ?? '';
    expect(osa).toContain('keystroke "v" using command down');
    expect(osa.toLowerCase()).not.toContain('return');
    expect(osa.toLowerCase()).not.toContain('keystroke return');
  });
});
