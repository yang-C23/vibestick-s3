import { describe, it, expect } from 'vitest';
import { mascotFor, mascotStateFor, type MascotAgent, type MascotState } from '../src/index';

const AGENTS: MascotAgent[] = ['codex', 'claude', 'terminal', 'unknown'];
const STATES: MascotState[] = [
  'idle',
  'recording',
  'transcribing',
  'review',
  'sending',
  'working',
  'done',
  'failed',
  'waiting',
];

describe('mascotFor', () => {
  it('returns a non-empty face + label for every agent/state', () => {
    for (const a of AGENTS)
      for (const s of STATES) {
        const [face, label] = mascotFor(a, s);
        expect(face.length).toBeGreaterThan(0);
        expect(label.length).toBeGreaterThan(0);
      }
  });
  it('distinguishes agents (claude fox vs codex owl-bot)', () => {
    expect(mascotFor('claude', 'idle')[0]).not.toBe(mascotFor('codex', 'idle')[0]);
  });
});

describe('mascotStateFor', () => {
  it('maps device + task state', () => {
    expect(mascotStateFor('draft_preview')).toBe('review');
    expect(mascotStateFor('agent_running', 'running')).toBe('working');
    expect(mascotStateFor('agent_running', 'needs_approval')).toBe('waiting');
    expect(mascotStateFor('done')).toBe('done');
    expect(mascotStateFor('error')).toBe('failed');
    expect(mascotStateFor('idle')).toBe('idle');
  });
});
