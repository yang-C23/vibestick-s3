import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import type { BridgeToDevice, DeviceToBridge } from '@vibestick/protocol';

export interface SerialConn {
  id: string;
  send(m: BridgeToDevice): void;
}
export interface SerialHandle {
  close(): void;
}
export interface SerialHooks {
  onConn(conn: SerialConn): void;
  onMessage(conn: SerialConn, msg: DeviceToBridge): void;
  onClose(conn: SerialConn): void;
}

/**
 * USB-serial transport. Speaks the same JSON protocol newline-delimited over the
 * device's USB CDC. Auto-reconnects when the device resets/re-enumerates.
 */
export function startSerialTransport(path: string, hooks: SerialHooks): SerialHandle {
  let closed = false;
  let current: SerialPort | null = null;

  const open = (): void => {
    if (closed) return;
    const port = new SerialPort({ path, baudRate: 115200 }, (err) => {
      if (err && !closed) setTimeout(open, 2000); // device not present yet — retry
    });
    current = port;
    const conn: SerialConn = {
      id: 'serial',
      send: (m) => {
        try {
          port.write(JSON.stringify(m) + '\n');
        } catch {
          /* port closing */
        }
      },
    };
    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
    port.on('open', () => hooks.onConn(conn));
    parser.on('data', (line: string) => {
      const t = line.trim();
      if (!t) return;
      try {
        hooks.onMessage(conn, JSON.parse(t) as DeviceToBridge);
      } catch {
        /* ignore non-JSON noise */
      }
    });
    port.on('close', () => {
      hooks.onClose(conn);
      if (!closed) setTimeout(open, 2000);
    });
    port.on('error', () => {
      /* 'close' handles reconnect */
    });
  };

  open();
  return {
    close: () => {
      closed = true;
      try {
        current?.close();
      } catch {
        /* noop */
      }
    },
  };
}
