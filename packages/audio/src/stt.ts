import { MockSttProvider } from './providers/mock';
import { SidecarProvider } from './providers/sidecar';
import { WhisperCppProvider } from './providers/whispercpp';

export interface SttResult {
  text: string;
  lang?: string;
}

export interface SttProvider {
  readonly name: string;
  /** `wav` is a complete RIFF/WAVE buffer. */
  transcribe(wav: Buffer): Promise<SttResult>;
}

export interface SttConfig {
  provider: string;
  sidecarUrl: string;
  whisperBin: string;
  whisperModel: string;
  mockText?: string;
}

/**
 * Pick an STT provider. Chinese-first defaults:
 *   - `mock` (default until configured): canned text, zero deps, offline.
 *   - `qwen3-asr` / `mimo` / `funasr` / `sidecar`: a local HTTP sidecar (see sidecar/).
 *   - `whispercpp`: the `whisper-cli` binary.
 */
export function createSttProvider(cfg: Partial<SttConfig> = {}): SttProvider {
  const provider = cfg.provider ?? process.env.VIBESTICK_STT_PROVIDER ?? 'mock';
  switch (provider) {
    case 'whispercpp':
      return new WhisperCppProvider(
        cfg.whisperBin ?? process.env.VIBESTICK_WHISPER_BIN ?? 'whisper-cli',
        cfg.whisperModel ?? process.env.VIBESTICK_WHISPER_MODEL ?? 'models/ggml-base.bin',
      );
    case 'qwen3-asr':
    case 'mimo':
    case 'funasr':
    case 'sidecar':
      return new SidecarProvider(
        cfg.sidecarUrl ?? process.env.VIBESTICK_STT_SIDECAR_URL ?? 'http://127.0.0.1:47610',
      );
    case 'mock':
    default:
      return new MockSttProvider(cfg.mockText ?? process.env.VIBESTICK_STT_MOCK_TEXT);
  }
}
