import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface BridgeConfig {
  host: string;
  /** Device WebSocket port. */
  wsPort: number;
  /** Control HTTP port (CLI + agent events). */
  httpPort: number;
  /** Require a paired token in `hello` (default false for local dev). */
  requireToken: boolean;
  /** Advertise via mDNS `_vibestick._tcp.local`. */
  mdns: boolean;
  /** Where pairing/token state is persisted (gitignored). */
  stateDir: string;
  /** USB serial device path ('' disables). Auto-detected from /dev/cu.usbmodem*. */
  serialPort: string;
}

function detectSerialPort(): string {
  const env = process.env.VIBESTICK_SERIAL_PORT;
  if (env !== undefined) return env; // explicit (including '' to disable)
  try {
    const matches = readdirSync('/dev')
      .filter((f) => f.startsWith('cu.usbmodem'))
      .sort();
    const first = matches[0];
    return first ? `/dev/${first}` : '';
  } catch {
    return '';
  }
}

export function loadConfig(overrides: Partial<BridgeConfig> = {}): BridgeConfig {
  const wsPort = Number(process.env.VIBESTICK_WS_PORT ?? 47600);
  return {
    host: process.env.VIBESTICK_BIND ?? '127.0.0.1',
    wsPort,
    httpPort: Number(process.env.VIBESTICK_HTTP_PORT ?? wsPort + 1),
    requireToken: process.env.VIBESTICK_REQUIRE_TOKEN === 'true',
    mdns: process.env.VIBESTICK_MDNS !== 'false',
    stateDir: process.env.VIBESTICK_STATE_DIR ?? join(homedir(), '.vibestick'),
    serialPort: detectSerialPort(),
    ...overrides,
  };
}
