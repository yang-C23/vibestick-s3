import type { NormalizeContext } from './types';

/** Shared system prompt for the LLM backends (Ollama / Claude). */
export const SYSTEM_PROMPT = `You convert a raw, spoken coding instruction (Chinese, English, or mixed) into a single strict JSON object for a coding agent (Codex or Claude Code).

Rules:
- Remove filler words and disfluencies (嗯, 那个, 然后呢, um, uh, like, you know).
- PRESERVE exactly: filenames, paths, commands, package names, identifiers, error messages, numbers, and constraints.
- Do NOT invent requirements that were not spoken. Keep the user's intent.
- Turn vague speech into a clear, imperative engineering instruction.
- Detect routing phrases: 发给 Claude/Codex -> target; 只复制/复制 -> action copy_only + target clipboard; 不要发送/存草稿 -> save_draft; 继续/恢复上次 -> resume_last; 查看状态/进度 -> status_query; 取消 -> cancel.
- If the request is too vague to act on, set needs_clarification=true and put ONE concise question in clarification_question (in the user's language).
- should_auto_send must always be false.

Output ONLY the JSON object with these keys:
target ("auto"|"claude"|"codex"|"clipboard"|"terminal"), action ("send"|"copy_only"|"save_draft"|"status_query"|"resume_last"|"cancel"), clean_prompt (string), short_preview (string <=80 chars), detected_intent ("implement"|"debug"|"refactor"|"review"|"explain"|"test"|"shell"|"status"|"other"), risk_level ("low"|"medium"|"high"), needs_clarification (boolean), clarification_question (string|null), should_auto_send (false), spoken_commands (string array).`;

export function buildUserPrompt(transcript: string, ctx: NormalizeContext = {}): string {
  const lines = [`Transcript: ${transcript}`];
  if (ctx.target) lines.push(`Currently selected target: ${ctx.target}`);
  if (ctx.projectName) lines.push(`Project: ${ctx.projectName}`);
  if (ctx.cwd) lines.push(`Working directory: ${ctx.cwd}`);
  return lines.join('\n');
}
