import { execFile } from 'node:child_process';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { SttProvider, SttResult } from '../stt';

const execFileAsync = promisify(execFile);

/** No-Python fallback: shells out to the `whisper-cli` binary. */
export class WhisperCppProvider implements SttProvider {
  readonly name = 'whispercpp';
  constructor(
    private readonly bin: string,
    private readonly model: string,
  ) {}

  async transcribe(wav: Buffer): Promise<SttResult> {
    const base = join(tmpdir(), `vibestick_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    const wavPath = `${base}.wav`;
    await writeFile(wavPath, wav);
    try {
      await execFileAsync(this.bin, [
        '-m',
        this.model,
        '-f',
        wavPath,
        '-l',
        'auto',
        '-nt',
        '-otxt',
        '-of',
        base,
      ]);
      const text = await readFile(`${base}.txt`, 'utf8');
      return { text: text.trim() };
    } finally {
      await unlink(wavPath).catch(() => {});
      await unlink(`${base}.txt`).catch(() => {});
    }
  }
}
