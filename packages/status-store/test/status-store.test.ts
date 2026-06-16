import { describe, it, expect } from 'vitest';
import { RingBuffer, StatusStore, deviceStateForTask } from '../src/index';

describe('RingBuffer', () => {
  it('keeps the last N and recalls by recency', () => {
    const rb = new RingBuffer<number>(3);
    [1, 2, 3, 4].forEach((n) => rb.push(n));
    expect(rb.size).toBe(3);
    expect(rb.at(1)).toBe(4);
    expect(rb.at(3)).toBe(2);
    expect(rb.recent(2)).toEqual([3, 4]);
  });
});

describe('deviceStateForTask', () => {
  it('maps task status to device state', () => {
    expect(deviceStateForTask(null)).toBe('idle');
    expect(deviceStateForTask({ status: 'running' } as never)).toBe('agent_running');
    expect(deviceStateForTask({ status: 'needs_approval' } as never)).toBe('agent_running');
    expect(deviceStateForTask({ status: 'completed' } as never)).toBe('done');
    expect(deviceStateForTask({ status: 'failed' } as never)).toBe('error');
  });
});

describe('StatusStore.applyEvent', () => {
  it('creates, merges, and completes a task; emits change', () => {
    const store = new StatusStore();
    const seen: string[] = [];
    store.on('change', (t) => seen.push(t.status));

    const t1 = store.applyEvent({
      id: 'task_1',
      agent: 'codex',
      status: 'running',
      phase: 'planning',
      title: 'Fix CI',
    });
    expect(t1.requiresMacAttention).toBe(false);
    expect(store.currentTask?.id).toBe('task_1');

    const t2 = store.applyEvent({ id: 'task_1', phase: 'editing' });
    expect(t2.title).toBe('Fix CI'); // merged from base
    expect(t2.agent).toBe('codex');

    const t3 = store.applyEvent({ id: 'task_1', status: 'needs_approval' });
    expect(t3.requiresMacAttention).toBe(true);

    const t4 = store.applyEvent({ id: 'task_1', status: 'completed' });
    expect(t4.completedAt).toBeTruthy();
    expect(deviceStateForTask(t4)).toBe('done');

    // t2 only changed phase, so status stays 'running' (merged from base).
    expect(seen).toEqual(['running', 'running', 'needs_approval', 'completed']);
    expect(store.list()).toHaveLength(1);
  });
});

describe('StatusStore drafts', () => {
  it('recalls recent drafts', () => {
    const store = new StatusStore();
    for (let i = 1; i <= 3; i++) {
      store.addDraft({
        draftId: `d${i}`,
        target: 'claude',
        cleanPrompt: `p${i}`,
        shortPreview: `p${i}`,
        riskLevel: 'low',
        needsClarification: false,
        clarificationQuestion: null,
        createdAt: new Date().toISOString(),
      });
    }
    expect(store.recallDraft(1)?.draftId).toBe('d3');
    expect(store.recallDraft(2)?.draftId).toBe('d2');
  });
});
