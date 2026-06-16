import type { Target } from '@vibestick/protocol';
import type { Draft } from '@vibestick/status-store';

/** Voice pipeline: audio -> STT -> normalizer -> Draft. M3/M4 add the real stages. */
export interface VoicePipeline {
  process(audio: Buffer | null, target: Target): Promise<Draft>;
}

/** M1 stand-in: returns a canned draft so the device flow works end-to-end. */
export class MockPipeline implements VoicePipeline {
  async process(_audio: Buffer | null, target: Target): Promise<Draft> {
    return {
      draftId: `draft_${Date.now()}`,
      target,
      cleanPrompt: 'Add a README and fix the auth callback bug in auth.ts.',
      shortPreview: 'Add a README and fix the auth callback bug.',
      riskLevel: 'low',
      needsClarification: false,
      clarificationQuestion: null,
      createdAt: new Date().toISOString(),
    };
  }
}
