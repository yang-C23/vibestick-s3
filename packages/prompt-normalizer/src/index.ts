import { deterministicNormalize } from './deterministic';
import { ollamaNormalize } from './ollama';
import { claudeNormalize } from './claude';
import type { Normalizer, NormalizeContext, NormalizerConfig, NormalizerResult } from './types';

/** Hybrid: if the LLM left the target ambiguous, fill it from rule-based routing. */
function enrichTarget(r: NormalizerResult, transcript: string): NormalizerResult {
  if (r.target !== 'auto') return r;
  const d = deterministicNormalize(transcript);
  return d.target !== 'auto' ? { ...r, target: d.target } : r;
}

export * from './types';
export { deterministicNormalize } from './deterministic';
export { isValidResult, validationErrors } from './validate';
export { SYSTEM_PROMPT, buildUserPrompt } from './prompt';

export function loadNormalizerConfig(cfg: Partial<NormalizerConfig> = {}): NormalizerConfig {
  return {
    backend: cfg.backend ?? process.env.VIBESTICK_NORMALIZER_BACKEND ?? 'deterministic',
    ollamaUrl: cfg.ollamaUrl ?? process.env.VIBESTICK_OLLAMA_URL ?? 'http://127.0.0.1:11434',
    ollamaModel:
      cfg.ollamaModel ??
      process.env.VIBESTICK_NORMALIZER_MODEL ??
      process.env.VIBESTICK_OLLAMA_MODEL ??
      'qwen3:4b',
    claudeModel: cfg.claudeModel ?? process.env.VIBESTICK_CLAUDE_MODEL ?? 'claude-haiku-4-5',
  };
}

/**
 * Build a normalizer. The configured backend is tried first; ANY failure (engine
 * down, bad JSON, schema mismatch) falls back to the offline deterministic backend,
 * so the device always gets a valid result.
 */
export function createNormalizer(partial: Partial<NormalizerConfig> = {}): Normalizer {
  const cfg = loadNormalizerConfig(partial);
  return {
    name: cfg.backend,
    async normalize(transcript: string, ctx: NormalizeContext = {}) {
      try {
        if (cfg.backend === 'ollama')
          return enrichTarget(await ollamaNormalize(transcript, ctx, cfg), transcript);
        if (cfg.backend === 'claude')
          return enrichTarget(await claudeNormalize(transcript, ctx, cfg), transcript);
      } catch (e) {
        console.warn(
          `normalizer "${cfg.backend}" failed; deterministic fallback:`,
          (e as Error).message,
        );
      }
      return deterministicNormalize(transcript, ctx);
    },
  };
}
