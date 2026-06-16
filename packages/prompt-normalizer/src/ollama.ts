import type { NormalizerResult } from '@vibestick/protocol';
import type { NormalizeContext, NormalizerConfig } from './types';
import { coerceResult } from './validate';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';

/** Local LLM via Ollama (e.g. qwen2.5). JSON mode + schema validation. */
export async function ollamaNormalize(
  transcript: string,
  ctx: NormalizeContext,
  cfg: NormalizerConfig,
): Promise<NormalizerResult> {
  const res = await fetch(cfg.ollamaUrl.replace(/\/$/, '') + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: cfg.ollamaModel,
      stream: false,
      format: 'json',
      think: false, // Qwen3 etc.: skip chain-of-thought, emit JSON directly
      options: { temperature: 0 },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(transcript, ctx) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  const obj: unknown = JSON.parse(data.message?.content ?? '{}');
  const coerced = coerceResult(obj);
  if (!coerced) throw new Error('normalizer returned no usable prompt');
  return coerced;
}
