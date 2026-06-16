/** Codex hooks + notify integration: status-reporting scripts and config snippets. */

export const HOOK_MARKER = 'vibestick';

export const CODEX_HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
  'Stop',
  'SessionStart',
  'UserPromptSubmit',
] as const;

/** Hook script: receives the event name as $1 and the JSON payload on stdin. */
export function codexHookScript(): string {
  return [
    '#!/usr/bin/env bash',
    '# vibestick Codex hook -> posts metadata to the local bridge.',
    'EVENT="$1"',
    'PORT="${VIBESTICK_HTTP_PORT:-47601}"',
    'URL="http://127.0.0.1:${PORT}/event"',
    'status=running; phase=planning',
    'case "$EVENT" in',
    '  PermissionRequest) status=needs_approval; phase=waiting;;',
    '  Stop) status=completed; phase=summarizing;;',
    '  PreToolUse) phase=running_command;;',
    'esac',
    'curl -s -m 2 -X POST "$URL" -H "content-type: application/json" \\',
    '  -d "{\\"agent\\":\\"codex\\",\\"status\\":\\"$status\\",\\"phase\\":\\"$phase\\",\\"title\\":\\"Codex\\",\\"source\\":\\"hook\\",\\"cwd\\":\\"$PWD\\"}" >/dev/null 2>&1 || true',
    '',
  ].join('\n');
}

/** Notify program: Codex passes the event JSON as the final argument ($1). */
export function codexNotifyScript(): string {
  return [
    '#!/usr/bin/env bash',
    '# vibestick Codex notify -> marks the turn complete on the bridge.',
    'PORT="${VIBESTICK_HTTP_PORT:-47601}"',
    'URL="http://127.0.0.1:${PORT}/event"',
    'curl -s -m 2 -X POST "$URL" -H "content-type: application/json" \\',
    '  -d "{\\"agent\\":\\"codex\\",\\"status\\":\\"completed\\",\\"phase\\":\\"summarizing\\",\\"title\\":\\"Codex\\",\\"source\\":\\"hook\\",\\"cwd\\":\\"$PWD\\"}" >/dev/null 2>&1 || true',
    '',
  ].join('\n');
}

export interface CodexHooksJson {
  hooks: Record<
    string,
    Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }>
  >;
}

export function codexHooksJson(scriptPath: string): CodexHooksJson {
  const hooks: CodexHooksJson['hooks'] = {};
  for (const ev of CODEX_HOOK_EVENTS) {
    hooks[ev] = [
      { hooks: [{ type: 'command', command: `${scriptPath} ${ev} # ${HOOK_MARKER}-hook` }] },
    ];
  }
  return { hooks };
}

/** The line to add under `~/.codex/config.toml` so turn-completion pings the bridge. */
export function codexConfigNotifyLine(notifyPath: string): string {
  return `notify = ["bash", "${notifyPath}"]`;
}
