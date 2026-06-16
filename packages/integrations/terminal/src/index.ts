import { copyToClipboard, execRunner, type Runner } from '@vibestick/integration-clipboard';

export interface InjectOptions {
  /** When true, paste into the frontmost app (needs macOS Accessibility). */
  autoPaste: boolean;
  run?: Runner;
}

export interface InjectResult {
  ok: boolean;
  method: 'clipboard' | 'paste';
  message: string;
}

/**
 * AppleScript to paste via Cmd+V into the frontmost app. It deliberately sends
 * ONLY Cmd+V — never a Return — so a misheard instruction can't auto-run. The
 * user presses Enter themselves.
 */
const PASTE_OSA = 'tell application "System Events" to keystroke "v" using command down';

export async function injectToFrontmost(text: string, opts: InjectOptions): Promise<InjectResult> {
  const run = opts.run ?? execRunner;
  await copyToClipboard(text, run);
  if (!opts.autoPaste) {
    return {
      ok: true,
      method: 'clipboard',
      message: 'copied — press Cmd+V to paste (Enter is yours)',
    };
  }
  if (process.platform !== 'darwin') throw new Error('auto-paste supports macOS only');
  const r = await run('osascript', ['-e', PASTE_OSA]);
  if (r.code !== 0) throw new Error(`osascript paste failed: ${r.stderr}`);
  return {
    ok: true,
    method: 'paste',
    message: 'pasted into the focused app — press Enter yourself',
  };
}

export { PASTE_OSA };
