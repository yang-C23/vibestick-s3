import { describe, it, expect } from 'vitest';
import {
  CLAUDE_HOOK_EVENTS,
  claudeHookScript,
  withVibestickHooks,
  withoutVibestickHooks,
  type ClaudeSettings,
} from '../src/hooks';

const SCRIPT = '/Users/me/.vibestick/hooks/claude-hook.sh';

describe('claudeHookScript', () => {
  it('is bash that posts to the bridge and never leaks code', () => {
    const s = claudeHookScript();
    expect(s.startsWith('#!/usr/bin/env bash')).toBe(true);
    expect(s).toContain('/event');
    expect(s).toContain('"source":"hook"'.replace(/"/g, '\\"'));
  });
});

describe('settings merge', () => {
  it('adds an entry for every event and preserves existing hooks', () => {
    const existing: ClaudeSettings = {
      model: 'opus',
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'my-other-hook' }] }] },
    };
    const merged = withVibestickHooks(existing, SCRIPT);
    expect(merged.model).toBe('opus');
    for (const ev of CLAUDE_HOOK_EVENTS) {
      expect(merged.hooks?.[ev]?.some((e) => e.hooks.some((h) => h.command.includes(SCRIPT)))).toBe(
        true,
      );
    }
    // unrelated Stop hook survived
    expect(
      merged.hooks?.Stop?.some((e) => e.hooks.some((h) => h.command === 'my-other-hook')),
    ).toBe(true);
  });

  it('is idempotent (no duplicate vibestick entries)', () => {
    const once = withVibestickHooks({}, SCRIPT);
    const twice = withVibestickHooks(once, SCRIPT);
    const count = (twice.hooks?.PreToolUse ?? []).filter((e) =>
      e.hooks.some((h) => h.command.includes('vibestick')),
    ).length;
    expect(count).toBe(1);
  });

  it('uninstall removes vibestick entries but keeps others', () => {
    const merged = withVibestickHooks(
      { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'keep-me' }] }] } },
      SCRIPT,
    );
    const cleaned = withoutVibestickHooks(merged);
    expect(JSON.stringify(cleaned)).not.toContain('vibestick');
    expect(cleaned.hooks?.Stop?.some((e) => e.hooks.some((h) => h.command === 'keep-me'))).toBe(
      true,
    );
  });
});
