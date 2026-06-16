import Ajv, { type ValidateFunction } from 'ajv';
import {
  normalizerResultSchema,
  NORMALIZER_TARGETS,
  NORMALIZER_ACTIONS,
  DETECTED_INTENTS,
  RISK_LEVELS,
  type NormalizerResult,
} from '@vibestick/protocol';

const ajv = new Ajv({ allErrors: true, strict: false });
const validateFn: ValidateFunction = ajv.compile(normalizerResultSchema);

export function isValidResult(obj: unknown): obj is NormalizerResult {
  return validateFn(obj) === true;
}

export function validationErrors(): string {
  return ajv.errorsText(validateFn.errors);
}

function clampOf<T extends string>(allowed: readonly T[], v: unknown, def: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : def;
}

/**
 * Best-effort coercion of an LLM's JSON into a valid result: clamps out-of-enum
 * values (e.g. a mis-mapped target) to safe defaults and fills missing fields,
 * so we keep the model's cleanup instead of discarding it. Returns null only when
 * there is no usable `clean_prompt`.
 */
export function coerceResult(raw: unknown): NormalizerResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const clean = typeof r.clean_prompt === 'string' ? r.clean_prompt : '';
  if (!clean.trim()) return null;
  const preview = typeof r.short_preview === 'string' && r.short_preview ? r.short_preview : clean;
  return {
    target: clampOf(NORMALIZER_TARGETS, r.target, 'auto'),
    action: clampOf(NORMALIZER_ACTIONS, r.action, 'send'),
    clean_prompt: clean,
    short_preview: preview.slice(0, 80),
    detected_intent: clampOf(DETECTED_INTENTS, r.detected_intent, 'other'),
    risk_level: clampOf(RISK_LEVELS, r.risk_level, 'low'),
    needs_clarification: Boolean(r.needs_clarification),
    clarification_question:
      typeof r.clarification_question === 'string' ? r.clarification_question : null,
    should_auto_send: false,
    spoken_commands: Array.isArray(r.spoken_commands)
      ? r.spoken_commands.filter((x): x is string => typeof x === 'string')
      : [],
  };
}
