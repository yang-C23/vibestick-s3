import type { DeviceState, Target, VibeTask } from '@vibestick/protocol';
import { mascotFor, mascotStateFor, type MascotAgent } from '@vibestick/mascots';

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
  const agent: MascotAgent = (vm.task?.agent as MascotAgent | undefined) ?? 'unknown';
  const [face, mood] = mascotFor(agent, mascotStateFor(vm.state, vm.task?.status));
  const wifi = '▮'.repeat(vm.wifi) + '▯'.repeat(Math.max(0, 4 - vm.wifi));
  const out: string[] = [];
  out.push(`┌${'─'.repeat(WIDTH + 2)}┐`);
  out.push(line(`wifi ${wifi}  bat ${vm.battery}%  →${vm.target}`));
  out.push(rule());
  out.push(line(''));
  out.push(line('       ' + face));
  out.push(line('       ' + mood));
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
