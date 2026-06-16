import type { AgentPhase } from '@vibestick/protocol';

export const AGENT_KIND = 'codex' as const;

/**
 * Best-effort phase detection from a line of `codex exec` output (plain text or
 * `--json`). Used by `vibestick watch` to light up the device monitor. Returns
 * null when a line carries no phase signal. Refined further by hooks in M6.
 */
export function detectCodexPhase(line: string): AgentPhase | null {
  const fromJson = phaseFromJson(line);
  if (fromJson) return fromJson;
  const l = line.toLowerCase();
  if (/approval|permission|allow this|y\/n/.test(l)) return 'waiting';
  if (/running (the )?tests?|npm (run )?test|pytest|cargo test|vitest|jest/.test(l))
    return 'running_tests';
  if (/apply[_ ]?patch|editing|writing (to )?file|updated? file|creating file/.test(l))
    return 'editing';
  if (/reading|read file|opening|cat |grep |glob/.test(l)) return 'reading';
  if (/running( command)?|\bexec\b|\$ |shell/.test(l)) return 'running_command';
  if (/plan(ning)?\b/.test(l)) return 'planning';
  if (/done|completed|finished|summary|✅/.test(l)) return 'summarizing';
  return null;
}

function phaseFromJson(line: string): AgentPhase | null {
  const t = line.trim();
  if (!t.startsWith('{')) return null;
  try {
    const obj = JSON.parse(t) as { type?: string; name?: string; tool?: string };
    const type = (obj.type ?? '').toLowerCase();
    const tool = (obj.name ?? obj.tool ?? '').toLowerCase();
    if (type.includes('approval') || type.includes('permission')) return 'waiting';
    if (type.includes('command') || tool.includes('bash') || tool.includes('shell'))
      return 'running_command';
    if (tool.includes('patch') || tool.includes('edit') || tool.includes('write')) return 'editing';
    if (tool.includes('read') || tool.includes('grep') || tool.includes('glob')) return 'reading';
    if (type.includes('turn.completed') || type.includes('result')) return 'summarizing';
  } catch {
    /* not JSON */
  }
  return null;
}
