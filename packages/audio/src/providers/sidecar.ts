import type { SttProvider, SttResult } from '../stt';

/**
 * Talks to a local STT sidecar (see ../../sidecar/) over a tiny HTTP contract:
 *   POST /transcribe  (body: raw WAV bytes)  ->  { text, lang? }
 * Used for Qwen3-ASR / MiMo / FunASR running on the Mac.
 */
export class SidecarProvider implements SttProvider {
  readonly name = 'sidecar';
  constructor(private readonly url: string) {}
  async transcribe(wav: Buffer): Promise<SttResult> {
    const res = await fetch(this.url.replace(/\/$/, '') + '/transcribe', {
      method: 'POST',
      headers: { 'content-type': 'audio/wav' },
      body: wav,
    });
    if (!res.ok) throw new Error(`STT sidecar returned ${res.status}`);
    const data = (await res.json()) as { text?: string; lang?: string };
    return { text: data.text ?? '', lang: data.lang };
  }
}
