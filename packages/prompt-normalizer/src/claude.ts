import { normalizerResultSchema, type NormalizerResult } from '@vibestick/protocol';
import type { NormalizeContext, NormalizerConfig } from './types';
import { coerceResult } from './validate';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';

// Structured-outputs schema: our JSON Schema minus keywords structured outputs
// doesn't support (string length, $schema/$id metadata).
/* eslint-disable @typescript-eslint/no-explicit-any */
const structuredSchema = (() => {
  const s: any = JSON.parse(JSON.stringify(normalizerResultSchema));
  delete s.$schema;
  delete s.$id;
  delete s.title;
  delete s.description;
  if (s.properties?.short_preview) delete s.properties.short_preview.maxLength;
  return s;
})();

/**
 * Opt-in cloud backend (off by default). Requires `npm i @anthropic-ai/sdk` and
 * ANTHROPIC_API_KEY. The string-typed dynamic specifier keeps the SDK out of the
 * default install and typecheck; failure here falls back to deterministic.
 */
export async function claudeNormalize(
  transcript: string,
  ctx: NormalizeContext,
  cfg: NormalizerConfig,
): Promise<NormalizerResult> {
  const specifier: string = '@anthropic-ai/sdk';
  const mod: any = await import(specifier);
  const Anthropic = mod.default;
  const client = new Anthropic();
  const params: any = {
    model: cfg.claudeModel,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(transcript, ctx) }],
    output_config: { format: { type: 'json_schema', schema: structuredSchema } },
  };
  const msg: any = await client.messages.create(params);
  const text: string = (msg.content ?? [])
    .map((b: any) => (b?.type === 'text' ? (b.text ?? '') : ''))
    .join('');
  const obj: unknown = JSON.parse(text || '{}');
  const coerced = coerceResult(obj);
  if (!coerced) throw new Error('normalizer returned no usable prompt');
  return coerced;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
