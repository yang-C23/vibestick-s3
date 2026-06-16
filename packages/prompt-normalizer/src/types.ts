import type { NormalizerResult } from '@vibestick/protocol';

export type { NormalizerResult };

export interface NormalizeContext {
  /** The currently selected target on the device (used when speech doesn't name one). */
  target?: string;
  cwd?: string;
  projectName?: string;
}

export interface NormalizerConfig {
  /** `deterministic` (offline default) | `ollama` | `claude`. */
  backend: string;
  ollamaUrl: string;
  ollamaModel: string;
  claudeModel: string;
}

export interface Normalizer {
  readonly name: string;
  normalize(transcript: string, ctx?: NormalizeContext): Promise<NormalizerResult>;
}
