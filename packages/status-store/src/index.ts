import { EventEmitter } from 'node:events';
import type { DeviceState, RiskLevel, Target, VibeTask } from '@vibestick/protocol';

/** A normalized voice draft awaiting the user's confirmation on the device. */
export interface Draft {
  draftId: string;
  target: Target;
  cleanPrompt: string;
  shortPreview: string;
  riskLevel: RiskLevel;
  needsClarification: boolean;
  clarificationQuestion: string | null;
  createdAt: string;
}

/** Fixed-size ring buffer (most-recent-last). */
export class RingBuffer<T> {
  private items: T[] = [];
  constructor(private readonly capacity: number) {}
  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.capacity) this.items.shift();
  }
  /** `back = 1` is the most recent item. */
  at(back: number): T | undefined {
    return this.items[this.items.length - back];
  }
  recent(n: number): T[] {
    return this.items.slice(-n);
  }
  get size(): number {
    return this.items.length;
  }
}

/** Map a task's status to the device UI state. */
export function deviceStateForTask(task: VibeTask | null): DeviceState {
  if (!task) return 'idle';
  switch (task.status) {
    case 'completed':
      return 'done';
    case 'failed':
    case 'cancelled':
      return 'error';
    case 'idle':
      return 'idle';
    default:
      // running / queued / needs_approval / needs_user_input
      return 'agent_running';
  }
}

const nowIso = () => new Date().toISOString();

/**
 * Holds the unified task state plus recent drafts/transcripts. Every integration
 * funnels `Partial<VibeTask>` events through {@link applyEvent}; the bridge listens
 * for `change` and pushes to the device. Pure, in-memory, unit-testable.
 */
export class StatusStore extends EventEmitter {
  private _current: VibeTask | null = null;
  private readonly tasks = new Map<string, VibeTask>();
  private readonly drafts = new RingBuffer<Draft>(20);
  private readonly transcripts = new RingBuffer<string>(20);

  get currentTask(): VibeTask | null {
    return this._current;
  }

  list(): VibeTask[] {
    return [...this.tasks.values()];
  }

  get(id: string): VibeTask | undefined {
    return this.tasks.get(id);
  }

  /** Merge an event into the current/keyed task and emit `change`. */
  applyEvent(p: Partial<VibeTask>): VibeTask {
    const base = (p.id && this.tasks.get(p.id)) || this._current;
    const task: VibeTask = {
      id: p.id ?? base?.id ?? `task_${Date.now()}`,
      agent: p.agent ?? base?.agent ?? 'unknown',
      status: p.status ?? base?.status ?? 'running',
      phase: p.phase ?? base?.phase ?? 'unknown',
      title: p.title ?? base?.title ?? 'Task',
      summary: p.summary ?? base?.summary,
      projectName: p.projectName ?? base?.projectName,
      cwd: p.cwd ?? base?.cwd,
      startedAt: base?.startedAt ?? nowIso(),
      lastEventAt: nowIso(),
      completedAt:
        p.status === 'completed' || p.status === 'failed' || p.status === 'cancelled'
          ? nowIso()
          : base?.completedAt,
      riskLevel: p.riskLevel ?? base?.riskLevel,
      requiresMacAttention:
        p.requiresMacAttention ??
        (p.status === 'needs_approval' || p.status === 'needs_user_input'),
      lastOutputPreview: p.lastOutputPreview ?? base?.lastOutputPreview,
      source: p.source ?? base?.source ?? 'manual',
    };
    this.tasks.set(task.id, task);
    this._current = task;
    this.emit('change', task);
    return task;
  }

  addTranscript(text: string): void {
    this.transcripts.push(text);
  }
  lastTranscript(): string | undefined {
    return this.transcripts.at(1);
  }

  addDraft(d: Draft): void {
    this.drafts.push(d);
  }
  /** `back = 1` is the most recent draft. */
  recallDraft(back = 1): Draft | undefined {
    return this.drafts.at(back);
  }
}
