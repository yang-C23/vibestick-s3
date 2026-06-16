import type { AgentPhase } from '@vibestick/protocol';

export * from './hooks';

export const AGENT_KIND = 'claude' as const;

/**
 * Best-effort phase detection from `claude -p` output. Handles the
 * `--output-format stream-json` event shape and falls back to text heuristics.
 * Returns null when there's no phase signal. Refined by hooks in M6.
 */
export function detectClaudePhase(line: string): AgentPhase | null {
  const fromJson = phaseFromStreamJson(line);
  if (fromJson) return fromJson;
  const l = line.toLowerCase();
  if (/permission|approve|allow this|needs your/.test(l)) return 'waiting';
  if (/running (the )?tests?|npm (run )?test|pytest|vitest|jest/.test(l)) return 'running_tests';
  if (/editing|writing (to )?file|updated? file/.test(l)) return 'editing';
  if (/reading|read file|searching|grep|glob/.test(l)) return 'reading';
  if (/result|summary|done|completed/.test(l)) return 'summarizing';
  return null;
}

function phaseFromStreamJson(line: string): AgentPhase | null {
  const t = line.trim();
  if (!t.startsWith('{')) return null;
  try {
    const obj = JSON.parse(t) as {
      type?: string;
      message?: { content?: Array<{ type?: string; name?: string }> };
    };
    const type = (obj.type ?? '').toLowerCase();
    if (type === 'result') return 'summarizing';
    const block = obj.message?.content?.find((b) => b.type === 'tool_use');
    if (block) {
      const name = (block.name ?? '').toLowerCase();
      if (name.includes('bash')) return 'running_command';
      if (name.includes('edit') || name.includes('write')) return 'editing';
      if (name.includes('read') || name.includes('grep') || name.includes('glob')) return 'reading';
      return 'running_command';
    }
  } catch {
    /* not JSON */
  }
  return null;
}
