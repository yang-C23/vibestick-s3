import type { DeviceState, Target, VibeTask } from '@vibestick/protocol';

export interface ViewModel {
  state: DeviceState;
  target: Target;
  task: VibeTask | null;
  draft: {
    shortPreview: string;
    riskLevel: string;
    target: Target;
    needsClarification: boolean;
  } | null;
  error: string | null;
  wifi: number;
  battery: number;
}

/**
 * Two-line "mascot" placeholders (original ASCII art — no official logos).
 * Real firmware swaps these for sprite frames per agent + state.
 */
const PETS: Record<DeviceState, [string, string]> = {
  idle: ['(-.-) zzZ', 'standby'],
  pairing: ['(o.o)?', 'pairing'],
  connected: ['(^.^)', 'ready'],
  recording: ['(O.O)', 'listening )))'],
  streaming: ['(O.O)', 'sending )))'],
  transcribing: ['(o_o)', 'typing...'],
  draft_preview: ['(^_^)', 'review'],
  sending: ['(>_>)', 'sending >>'],
  agent_running: ['(=_=)b', 'working'],
  done: ['\\(^o^)/', 'done!'],
  error: ['(x_x)', 'error'],
};

const WIDTH = 30;
const pad = (s: string) => (s.length > WIDTH ? s.slice(0, WIDTH - 1) + '…' : s.padEnd(WIDTH));
const line = (s = '') => `│ ${pad(s)} │`;
const rule = () => `├${'─'.repeat(WIDTH + 2)}┤`;

function bottomHint(vm: ViewModel): string {
  switch (vm.state) {
    case 'idle':
    case 'connected':
      return '[r] record  [c] target  [q]';
    case 'recording':
    case 'streaming':
      return '[r] stop';
    case 'transcribing':
      return '...working...';
    case 'draft_preview':
      return '[s] send  [x] redo  [q]';
    case 'agent_running':
      return vm.task?.requiresMacAttention ? '!! check Mac to approve' : 'running on Mac...';
    case 'done':
      return '[r] new dictation';
    case 'error':
      return vm.error ?? 'error — [r] retry';
    default:
      return '';
  }
}

export function renderScreen(vm: ViewModel): string {
  const [pet, mood] = PETS[vm.state];
  const wifi = '▮'.repeat(vm.wifi) + '▯'.repeat(Math.max(0, 4 - vm.wifi));
  const out: string[] = [];
  out.push(`┌${'─'.repeat(WIDTH + 2)}┐`);
  out.push(line(`wifi ${wifi}  bat ${vm.battery}%  →${vm.target}`));
  out.push(rule());
  out.push(line(''));
  out.push(line('        ' + pet));
  out.push(line('        ' + mood));
  if (vm.state === 'agent_running' && vm.task) {
    out.push(line(`${vm.task.agent}: ${vm.task.phase}`));
    out.push(line(vm.task.title));
  } else if (vm.state === 'done' && vm.task) {
    out.push(line(`${vm.task.agent}: completed`));
    out.push(line(vm.task.title));
  } else if (vm.state === 'draft_preview' && vm.draft) {
    out.push(line(`→ ${vm.draft.target}  risk:${vm.draft.riskLevel}`));
    out.push(line(vm.draft.shortPreview));
    out.push(line(vm.draft.needsClarification ? '? needs clarification' : ''));
  } else {
    out.push(line(''));
    out.push(line(''));
  }
  out.push(line(''));
  out.push(rule());
  out.push(line(bottomHint(vm)));
  out.push(`└${'─'.repeat(WIDTH + 2)}┘`);
  return out.join('\n');
}
