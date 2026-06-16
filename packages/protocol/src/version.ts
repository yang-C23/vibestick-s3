/**
 * Wire-protocol version. Bump on any breaking change to message shapes.
 * The device sends its `protocolVersion` in `hello`; the bridge negotiates.
 */
export const PROTOCOL_VERSION = 1 as const;

/** Lowest device protocol version this bridge still understands. */
export const MIN_SUPPORTED_PROTOCOL_VERSION = 1 as const;

export interface VersionNegotiation {
  ok: boolean;
  /** Version both sides will speak (the bridge's version when ok). */
  version: number;
  reason?: string;
}

export function negotiateVersion(deviceVersion: number): VersionNegotiation {
  if (!Number.isInteger(deviceVersion) || deviceVersion < MIN_SUPPORTED_PROTOCOL_VERSION) {
    return {
      ok: false,
      version: PROTOCOL_VERSION,
      reason: `device protocol v${deviceVersion} is older than minimum v${MIN_SUPPORTED_PROTOCOL_VERSION}; please update firmware`,
    };
  }
  // Forward-compatible: a newer device speaks down to our version.
  return { ok: true, version: PROTOCOL_VERSION };
}
