/** Claude Code hooks integration: a status-reporting hook script + settings merge. */

export const HOOK_MARKER = 'vibestick';

export const CLAUDE_HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
  'SessionStart',
  'UserPromptSubmit',
] as const;

export interface HookCommand {
  type: string;
  command: string;
}
export interface HookEntry {
  matcher?: string;
  hooks: HookCommand[];
}
export interface ClaudeSettings {
  hooks?: Record<string, HookEntry[]>;
  [k: string]: unknown;
}

/** A bash hook that POSTs metadata (never code/diffs) to the local bridge. */
export function claudeHookScript(): string {
  return [
    '#!/usr/bin/env bash',
    '# vibestick Claude Code hook -> posts metadata (not code) to the local bridge.',
    'EVENT="$1"',
    'PORT="${VIBESTICK_HTTP_PORT:-47601}"',
    'URL="http://127.0.0.1:${PORT}/event"',
    'payload="$(cat)"',
    'tool=""',
    'if command -v jq >/dev/null 2>&1; then tool="$(printf %s "$payload" | jq -r ".tool_name // empty" 2>/dev/null)"; fi',
    'status=running; phase=planning',
    'case "$EVENT" in',
    '  Notification) status=needs_approval; phase=waiting;;',
    '  Stop) status=completed; phase=summarizing;;',
    'esac',
    'case "$tool" in',
    '  Bash) phase=running_command;;',
    '  Edit|Write|MultiEdit) phase=editing;;',
    '  Read|Grep|Glob) phase=reading;;',
    'esac',
    'title="${VIBESTICK_TASK_TITLE:-Claude Code}"',
    'curl -s -m 2 -X POST "$URL" -H "content-type: application/json" \\',
    '  -d "{\\"agent\\":\\"claude\\",\\"status\\":\\"$status\\",\\"phase\\":\\"$phase\\",\\"title\\":\\"$title\\",\\"source\\":\\"hook\\",\\"cwd\\":\\"$PWD\\"}" >/dev/null 2>&1 || true',
    '',
  ].join('\n');
}

function hasMarker(entry: HookEntry): boolean {
  return (entry.hooks ?? []).some((h) => h.command.includes(HOOK_MARKER));
}

/** Add vibestick hook entries (idempotent — replaces any prior vibestick entries). */
export function withVibestickHooks(settings: ClaudeSettings, scriptPath: string): ClaudeSettings {
  const hooks: Record<string, HookEntry[]> = { ...(settings.hooks ?? {}) };
  for (const ev of CLAUDE_HOOK_EVENTS) {
    const kept = (hooks[ev] ?? []).filter((e) => !hasMarker(e));
    // Trailing comment is a path-independent marker so uninstall always finds us
    // (it's a no-op shell comment when the hook command is executed).
    kept.push({
      hooks: [{ type: 'command', command: `${scriptPath} ${ev} # ${HOOK_MARKER}-hook` }],
    });
    hooks[ev] = kept;
  }
  return { ...settings, hooks };
}

/** Remove all vibestick hook entries, preserving anything else. */
export function withoutVibestickHooks(settings: ClaudeSettings): ClaudeSettings {
  if (!settings.hooks) return settings;
  const hooks: Record<string, HookEntry[]> = {};
  for (const [ev, entries] of Object.entries(settings.hooks)) {
    const kept = entries.filter((e) => !hasMarker(e));
    if (kept.length) hooks[ev] = kept;
  }
  const next: ClaudeSettings = { ...settings, hooks };
  if (Object.keys(hooks).length === 0) delete next.hooks;
  return next;
}
