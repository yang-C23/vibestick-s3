/**
 * Unified task-state model. Every integration (Codex, Claude Code, terminal
 * wrapper, hook, manual) normalizes into a `VibeTask`. The device renders only
 * this — never raw logs or diffs.
 */

export const AGENT_KINDS = ['codex', 'claude', 'terminal', 'unknown'] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

export const TASK_STATUSES = [
  'idle',
  'queued',
  'running',
  'needs_user_input',
  'needs_approval',
  'completed',
  'failed',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const AGENT_PHASES = [
  'planning',
  'reading',
  'editing',
  'running_command',
  'running_tests',
  'reviewing_diff',
  'waiting',
  'summarizing',
  'unknown',
] as const;
export type AgentPhase = (typeof AGENT_PHASES)[number];

export const RISK_LEVELS = ['low', 'medium', 'high'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const TASK_SOURCES = ['wrapper', 'hook', 'sdk', 'manual'] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

export interface VibeTask {
  id: string;
  agent: AgentKind;
  projectName?: string;
  cwd?: string;
  status: TaskStatus;
  phase: AgentPhase;
  title: string;
  summary?: string;
  /** ISO-8601 timestamps. */
  lastEventAt: string;
  startedAt: string;
  completedAt?: string;
  riskLevel?: RiskLevel;
  requiresMacAttention?: boolean;
  lastOutputPreview?: string;
  source: TaskSource;
}
