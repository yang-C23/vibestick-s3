/**
 * Original mascot characters (NO official logos). One face per agent + state.
 * claude = fox, codex = owl-bot, terminal = cursor. Firmware reuses this table
 * for sprite selection; the device-simulator renders the ASCII faces directly.
 */
export type MascotAgent = 'codex' | 'claude' | 'terminal' | 'unknown';
export type MascotState =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'review'
  | 'sending'
  | 'working'
  | 'done'
  | 'failed'
  | 'waiting';

const FACES: Record<MascotAgent, Record<MascotState, string>> = {
  claude: {
    idle: '(˘ᴥ˘)',
    recording: '(◎ᴥ◎)',
    transcribing: '(・ᴥ・)',
    review: '(^ᴥ^)',
    sending: '(>ᴥ>)',
    working: '(✦ᴥ✦)',
    done: '(❛ᴥ❛)✧',
    failed: '(✗ᴥ✗)',
    waiting: '(?ᴥ?)',
  },
  codex: {
    idle: '[-.-]',
    recording: '[O.O]',
    transcribing: '[o.o]',
    review: '[^.^]',
    sending: '[>.>]',
    working: '[•.•]',
    done: '[^o^]',
    failed: '[x.x]',
    waiting: '[?.?]',
  },
  terminal: {
    idle: '$ _',
    recording: '$ ●',
    transcribing: '$ …',
    review: '$ ?',
    sending: '$ »',
    working: '$ ▮',
    done: '$ ✓',
    failed: '$ ✗',
    waiting: '$ ?',
  },
  unknown: {
    idle: '(·_·)',
    recording: '(O_O)',
    transcribing: '(o_o)',
    review: '(^_^)',
    sending: '(>_>)',
    working: '(•_•)',
    done: '(^o^)',
    failed: '(x_x)',
    waiting: '(?_?)',
  },
};

const LABELS: Record<MascotState, string> = {
  idle: 'standby',
  recording: 'listening )))',
  transcribing: 'typing…',
  review: 'review',
  sending: 'sending »',
  working: 'working',
  done: 'done!',
  failed: 'error',
  waiting: 'needs you',
};

/** Returns `[face, label]` for an agent + mascot state. */
export function mascotFor(agent: MascotAgent, state: MascotState): [string, string] {
  const byAgent = FACES[agent] ?? FACES.unknown;
  return [byAgent[state], LABELS[state]];
}

/** Map a device UI state (+ optional task status) to a mascot state. */
export function mascotStateFor(deviceState: string, taskStatus?: string): MascotState {
  switch (deviceState) {
    case 'recording':
    case 'streaming':
      return 'recording';
    case 'transcribing':
      return 'transcribing';
    case 'draft_preview':
      return 'review';
    case 'sending':
      return 'sending';
    case 'agent_running':
      return taskStatus === 'needs_approval' || taskStatus === 'needs_user_input'
        ? 'waiting'
        : 'working';
    case 'done':
      return 'done';
    case 'error':
      return 'failed';
    default:
      return 'idle';
  }
}
