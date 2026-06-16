import type { NormalizerResult } from '@vibestick/protocol';
import type { NormalizeContext } from './types';

type Target = NormalizerResult['target'];
type Action = NormalizerResult['action'];
type Intent = NormalizerResult['detected_intent'];
type Risk = NormalizerResult['risk_level'];

const EN_FILLERS = /\b(um+|uh+|er+|erm|you know|i mean|sort of|kinda)\b/gi;
const ZH_INTERJECTIONS = /[嗯呃额]+/g;
const ZH_DEMO_FILLER = /(那个|这个)(?=[\s，,、。.!！?？]|$)/g;

function stripFillers(input: string): string {
  let t = input.replace(EN_FILLERS, ' ').replace(ZH_INTERJECTIONS, '').replace(ZH_DEMO_FILLER, '');
  t = t.replace(/[，,]\s*(?=[，,])/g, ''); // collapse comma runs left by removals
  t = t.replace(/\s{2,}/g, ' ').replace(/\s+([，,。.！!？?；;])/g, '$1');
  t = t.replace(/^[\s，,、。.！!？?]+/, '').trimEnd();
  if (/^[a-z]/.test(t)) t = t.charAt(0).toUpperCase() + t.slice(1);
  return t.trim();
}

function detectTarget(text: string): { target: Target; commands: string[] } {
  if (/只复制|复制到剪贴板|copy(\s+only)?|剪贴板|clipboard/i.test(text))
    return { target: 'clipboard', commands: ['clipboard'] };
  // include common STT mishears: codex~codecs/cortex, claude~cloud/clode
  if (/发给\s*(codex|codecs|cortex)|给\s*(codex|codecs)|用\s*codex|\bcodex\b/i.test(text))
    return { target: 'codex', commands: ['codex'] };
  if (/发给\s*(claude|cloud|clode)|给\s*(claude|cloud)|用\s*claude|\bclaude\b/i.test(text))
    return { target: 'claude', commands: ['claude'] };
  if (/终端|命令行|terminal/i.test(text)) return { target: 'terminal', commands: ['terminal'] };
  return { target: 'auto', commands: [] };
}

function detectAction(text: string, target: Target): { action: Action; commands: string[] } {
  if (/查看状态|看一下状态|状态|进度|\bstatus\b/i.test(text))
    return { action: 'status_query', commands: ['status'] };
  if (/继续上次|恢复上次|用上次|上次那个|resume( last)?|continue last/i.test(text))
    return { action: 'resume_last', commands: ['resume'] };
  if (target === 'clipboard') return { action: 'copy_only', commands: ['copy'] };
  if (/不要发送|别发送|存草稿|保存草稿|save( as)? draft|don'?t send/i.test(text))
    return { action: 'save_draft', commands: ['save_draft'] };
  if (/^(取消|算了)|\b(cancel|nevermind|never mind)\b/i.test(text))
    return { action: 'cancel', commands: ['cancel'] };
  return { action: 'send', commands: [] };
}

function detectRisk(text: string): Risk {
  if (
    /git\s+push|force[- ]?push|强制推送|rm\s+-rf|sudo\s+rm|drop\s+table|truncate|delete\s+from|部署|上线|deploy|\bformat\b/i.test(
      text,
    )
  )
    return 'high';
  if (/删除|移除|remove\b|reset\s+--hard|revert|覆盖|overwrite|迁移|migrate/i.test(text))
    return 'medium';
  return 'low';
}

function detectIntent(text: string, action: Action): Intent {
  if (action === 'status_query') return 'status';
  const rules: Array<[RegExp, Intent]> = [
    [/修复|修一下|报错|debug|崩溃|crash|失败|failing|\bbug\b|\berror\b/i, 'debug'],
    [/单元测试|跑(一下)?测试|加(个)?测试|\btest(s|ing)?\b|测试一下/i, 'test'],
    [/重构|refactor|整理(一下)?代码/i, 'refactor'],
    [/审查|review|检查(一下)?|code\s*review/i, 'review'],
    [/解释|说明|为什么|怎么回事|explain|how does|what does/i, 'explain'],
    [/运行|执行|跑一下命令|\brun\b|命令行执行/i, 'shell'],
    [
      /加(个|一个)?|增加|实现|创建|新建|写(个|一个)|\badd\b|\bcreate\b|\bimplement\b|\bbuild\b/i,
      'implement',
    ],
  ];
  for (const [re, intent] of rules) if (re.test(text)) return intent;
  return 'other';
}

/** Offline, deterministic normalization. Also the ultimate fallback for LLM backends. */
export function deterministicNormalize(
  transcript: string,
  _ctx: NormalizeContext = {},
): NormalizerResult {
  const raw = (transcript ?? '').trim();
  const { target, commands: tcmd } = detectTarget(raw);
  const { action, commands: acmd } = detectAction(raw, target);
  const clean = stripFillers(raw);
  const compact = clean.replace(/\s+/g, '');
  const needs = compact.length < 3;
  const preview = clean.length > 80 ? clean.slice(0, 79) + '…' : clean;
  return {
    target,
    action,
    clean_prompt: clean,
    short_preview: preview || '(unclear)',
    detected_intent: detectIntent(raw, action),
    risk_level: detectRisk(raw),
    needs_clarification: needs,
    clarification_question: needs
      ? '能再具体说一下你想让我做什么吗？(Could you say what you want done?)'
      : null,
    should_auto_send: false,
    spoken_commands: [...new Set([...tcmd, ...acmd])],
  };
}
