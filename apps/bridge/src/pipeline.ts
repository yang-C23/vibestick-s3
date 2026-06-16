import type { Target } from '@vibestick/protocol';
import { createSttProvider, pcm16ToWav, type SttProvider } from '@vibestick/audio';
import { createNormalizer, type Normalizer } from '@vibestick/prompt-normalizer';
import type { Draft } from '@vibestick/status-store';

export class PipelineError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PipelineError';
  }
}

export interface VoicePipeline {
  /** Turn captured PCM16 (or null) into a confirmed-ready draft for `target`. */
  process(pcm: Buffer | null, target: Target): Promise<Draft>;
}

/** STT -> normalizer -> Draft. Engines/backends are selected from env. */
export class Pipeline implements VoicePipeline {
  constructor(
    private readonly stt: SttProvider,
    private readonly normalizer: Normalizer,
  ) {}

  async process(pcm: Buffer | null, target: Target): Promise<Draft> {
    let text: string;
    if (this.stt.name === 'mock') {
      text = (await this.stt.transcribe(pcm ?? Buffer.alloc(0))).text;
    } else {
      if (!pcm || pcm.length === 0) throw new PipelineError('EMPTY_AUDIO', 'no audio captured');
      try {
        text = (await this.stt.transcribe(pcm16ToWav(pcm, 16000, 1))).text;
      } catch (e) {
        throw new PipelineError('STT_FAILED', (e as Error).message);
      }
    }
    if (!text.trim()) throw new PipelineError('EMPTY_TRANSCRIPT', 'nothing was transcribed');

    const r = await this.normalizer.normalize(text, {
      target: target === 'auto' ? undefined : target,
    });
    // A spoken "发给 Codex" overrides the dial; otherwise keep the selected target.
    const resolved: Target = r.target !== 'auto' ? r.target : target;
    return {
      draftId: `draft_${Date.now()}`,
      target: resolved,
      cleanPrompt: r.clean_prompt,
      shortPreview: r.short_preview,
      riskLevel: r.risk_level,
      needsClarification: r.needs_clarification,
      clarificationQuestion: r.clarification_question,
      createdAt: new Date().toISOString(),
    };
  }
}

export function createPipeline(): VoicePipeline {
  return new Pipeline(createSttProvider(), createNormalizer());
}
