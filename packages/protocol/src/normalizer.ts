import schema from '../schema/normalizer-result.schema.json';

/**
 * Strict output contract for the prompt normalizer. The normalizer turns a raw
 * voice transcript into this structured object; the bridge validates every
 * result against {@link normalizerResultSchema} before acting on it.
 */
export const normalizerResultSchema = schema;

export const NORMALIZER_TARGETS = ['auto', 'claude', 'codex', 'clipboard', 'terminal'] as const;
export type NormalizerTarget = (typeof NORMALIZER_TARGETS)[number];

export const NORMALIZER_ACTIONS = [
  'send',
  'copy_only',
  'save_draft',
  'status_query',
  'resume_last',
  'cancel',
] as const;
export type NormalizerAction = (typeof NORMALIZER_ACTIONS)[number];

export const DETECTED_INTENTS = [
  'implement',
  'debug',
  'refactor',
  'review',
  'explain',
  'test',
  'shell',
  'status',
  'other',
] as const;
export type DetectedIntent = (typeof DETECTED_INTENTS)[number];

export interface NormalizerResult {
  target: NormalizerTarget;
  action: NormalizerAction;
  clean_prompt: string;
  short_preview: string;
  detected_intent: DetectedIntent;
  risk_level: 'low' | 'medium' | 'high';
  needs_clarification: boolean;
  clarification_question: string | null;
  /**
   * Policy: never used to auto-submit into a terminal. The user always presses
   * Enter. May only pre-confirm clipboard / save-draft actions.
   */
  should_auto_send: boolean;
  spoken_commands: string[];
}
