import { Bonjour } from 'bonjour-service';

export interface MdnsHandle {
  stop(): void;
}

/** Advertise the bridge as `_vibestick._tcp.local` so the device can discover it. */
export function advertise(name: string, port: number): MdnsHandle {
  try {
    const bonjour = new Bonjour();
    bonjour.publish({ name, type: 'vibestick', protocol: 'tcp', port });
    return {
      stop() {
        try {
          bonjour.unpublishAll(() => bonjour.destroy());
        } catch {
          /* noop */
        }
      },
    };
  } catch (e) {
    console.warn('mDNS advertise failed (continuing without it):', (e as Error).message);
    return { stop() {} };
  }
}
