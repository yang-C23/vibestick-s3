import { describe, it, expect } from 'vitest';
import { detectCodexPhase } from '../src/index';

describe('detectCodexPhase', () => {
  it('detects phases from plain text', () => {
    expect(detectCodexPhase('Planning the change')).toBe('planning');
    expect(detectCodexPhase('apply_patch to src/app.ts')).toBe('editing');
    expect(detectCodexPhase('Running tests with vitest')).toBe('running_tests');
    expect(detectCodexPhase('Permission required to run rm')).toBe('waiting');
    expect(detectCodexPhase('All done ✅')).toBe('summarizing');
  });
  it('detects phases from JSON lines', () => {
    expect(detectCodexPhase('{"type":"tool_use","name":"bash"}')).toBe('running_command');
    expect(detectCodexPhase('{"type":"turn.completed"}')).toBe('summarizing');
  });
  it('returns null for noise', () => {
    expect(detectCodexPhase('hello world')).toBeNull();
  });
});
