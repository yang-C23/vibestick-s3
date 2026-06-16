import type { SttProvider, SttResult } from '../stt';

/** Realistic mixed zh/en sample so the normalizer has something to chew on. */
export const DEFAULT_MOCK_TEXT =
  '嗯，帮我给 auth.ts 加个 README，然后修复那个 callback 的 bug，发给 Claude';

export class MockSttProvider implements SttProvider {
  readonly name = 'mock';
  constructor(private readonly text: string = DEFAULT_MOCK_TEXT) {}
  async transcribe(_wav: Buffer): Promise<SttResult> {
    return { text: this.text, lang: 'zh' };
  }
}
