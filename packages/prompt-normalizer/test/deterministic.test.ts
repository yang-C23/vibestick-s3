import { describe, it, expect } from 'vitest';
import cases from '../fixtures/cases.json';
import { createNormalizer, deterministicNormalize, isValidResult } from '../src/index';

interface Case {
  name: string;
  transcript: string;
  target?: string;
  action?: string;
  risk?: string;
  intent?: string;
  mustContain?: string[];
  mustNotContain?: string[];
  needsClarification?: boolean;
}

describe('deterministic normalizer fixtures', () => {
  for (const c of cases as Case[]) {
    it(c.name, () => {
      const r = deterministicNormalize(c.transcript);
      expect(isValidResult(r), JSON.stringify(r)).toBe(true);
      if (c.target) expect(r.target).toBe(c.target);
      if (c.action) expect(r.action).toBe(c.action);
      if (c.risk) expect(r.risk_level).toBe(c.risk);
      if (c.intent) expect(r.detected_intent).toBe(c.intent);
      if (c.needsClarification !== undefined)
        expect(r.needs_clarification).toBe(c.needsClarification);
      for (const m of c.mustContain ?? []) expect(r.clean_prompt).toContain(m);
      for (const m of c.mustNotContain ?? []) expect(r.clean_prompt).not.toContain(m);
    });
  }
});

describe('createNormalizer', () => {
  it('always returns a schema-valid result and never auto-sends', async () => {
    const r = await createNormalizer().normalize('帮我修复 auth.ts 的 bug');
    expect(isValidResult(r)).toBe(true);
    expect(r.should_auto_send).toBe(false);
  });

  it('falls back to deterministic when the ollama backend is unreachable', async () => {
    const n = createNormalizer({ backend: 'ollama', ollamaUrl: 'http://127.0.0.1:1' });
    const r = await n.normalize('帮我给 auth.ts 加个 README');
    expect(isValidResult(r)).toBe(true);
    expect(r.clean_prompt).toContain('auth.ts');
  });
});
