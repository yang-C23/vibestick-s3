import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface PairingState {
  /** 6-digit pairing code; doubles as the shared token in M1. */
  code: string;
  pairedDeviceIds: string[];
}

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * M1 pairing: a persisted 6-digit code that the device presents in `hello.token`.
 * Trust-on-first-use binds a deviceId. (M2 upgrades to a minted per-device token
 * delivered over the captive-portal pairing call.)
 */
export class PairingStore {
  private state: PairingState;
  private readonly file: string;

  constructor(private readonly stateDir: string) {
    this.file = join(stateDir, 'pairing.json');
    this.state = this.load();
  }

  private load(): PairingState {
    try {
      if (existsSync(this.file)) return JSON.parse(readFileSync(this.file, 'utf8')) as PairingState;
    } catch {
      /* fall through to fresh state */
    }
    const fresh: PairingState = { code: genCode(), pairedDeviceIds: [] };
    this.persist(fresh);
    return fresh;
  }

  private persist(s: PairingState = this.state): void {
    try {
      mkdirSync(this.stateDir, { recursive: true });
      writeFileSync(this.file, JSON.stringify(s, null, 2));
    } catch {
      /* best-effort persistence */
    }
  }

  get code(): string {
    return this.state.code;
  }

  get pairedDeviceIds(): string[] {
    return [...this.state.pairedDeviceIds];
  }

  regenerate(): string {
    this.state.code = genCode();
    this.persist();
    return this.state.code;
  }

  markPaired(deviceId: string): void {
    if (!this.state.pairedDeviceIds.includes(deviceId)) {
      this.state.pairedDeviceIds.push(deviceId);
      this.persist();
    }
  }

  verify(deviceId: string, token?: string): boolean {
    if (token && token === this.state.code) {
      this.markPaired(deviceId);
      return true;
    }
    return this.state.pairedDeviceIds.includes(deviceId);
  }
}
