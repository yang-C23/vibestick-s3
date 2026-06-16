import { describe, it, expect } from 'vitest';
import { detectClaudePhase } from '../src/index';

describe('detectClaudePhase', () => {
  it('detects from stream-json tool_use', () => {
    expect(
      detectClaudePhase(
        '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash"}]}}',
      ),
    ).toBe('running_command');
    expect(
      detectClaudePhase(
        '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit"}]}}',
      ),
    ).toBe('editing');
    expect(detectClaudePhase('{"type":"result"}')).toBe('summarizing');
  });
  it('falls back to text heuristics', () => {
    expect(detectClaudePhase('Running tests now')).toBe('running_tests');
    expect(detectClaudePhase('waiting for permission to continue')).toBe('waiting');
  });
  it('returns null for noise', () => {
    expect(detectClaudePhase('just some prose')).toBeNull();
  });
});
