import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import wire from '../schema/wire-messages.schema.json';
import normSchema from '../schema/normalizer-result.schema.json';
import { PROTOCOL_VERSION, negotiateVersion } from '../src/version';
import type { DeviceToBridge, BridgeToDevice } from '../src/messages';
import type { NormalizerResult } from '../src/normalizer';

const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addSchema(wire);
ajv.addSchema(normSchema);

const WIRE = 'https://vibestick.dev/schema/wire-messages.json';
const validateDevice = ajv.getSchema(`${WIRE}#/definitions/DeviceToBridge`)!;
const validateBridge = ajv.getSchema(`${WIRE}#/definitions/BridgeToDevice`)!;
const validateNorm = ajv.getSchema('https://vibestick.dev/schema/normalizer-result.json')!;

describe('version negotiation', () => {
  it('accepts the current protocol version', () => {
    expect(negotiateVersion(PROTOCOL_VERSION)).toMatchObject({ ok: true });
  });
  it('rejects an older version', () => {
    expect(negotiateVersion(0).ok).toBe(false);
  });
});

describe('device -> bridge messages match the schema', () => {
  const samples: DeviceToBridge[] = [
    {
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      deviceId: 'sticks3-abc',
      firmware: '0.1.0',
    },
    { type: 'heartbeat', ts: 1 },
    { type: 'button.event', button: 'primary', gesture: 'long_press_start', ts: 2 },
    { type: 'imu.event', gesture: 'shake', ts: 3 },
    { type: 'audio.start', sessionId: 'aud_1', sampleRate: 16000, channels: 1, format: 'pcm16' },
    { type: 'audio.chunk', data: 'AAAA' },
    { type: 'audio.stop', sessionId: 'aud_1', durationMs: 4200 },
    { type: 'draft.action', draftId: 'draft_1', action: 'send' },
  ];
  for (const msg of samples) {
    it(msg.type, () => {
      expect(validateDevice(msg), JSON.stringify(validateDevice.errors)).toBe(true);
    });
  }
});

describe('bridge -> device messages match the schema', () => {
  const samples: BridgeToDevice[] = [
    {
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
      deviceId: 'sticks3-abc',
      config: { recordMaxMs: 60000, autoPaste: false, mascotPack: 'default' },
    },
    { type: 'state.update', state: 'recording', task: null },
    {
      type: 'draft.preview',
      draftId: 'draft_1',
      target: 'claude',
      shortPreview: 'Add a README.',
      riskLevel: 'low',
      needsClarification: false,
    },
    {
      type: 'task.update',
      task: {
        id: 'task_1',
        agent: 'codex',
        status: 'running',
        phase: 'running_tests',
        title: 'Fix CI failure',
        lastEventAt: '2026-06-16T00:00:00Z',
        startedAt: '2026-06-16T00:00:00Z',
        source: 'wrapper',
      },
    },
    { type: 'error', code: 'STT_FAILED', message: 'Speech-to-text failed.' },
    { type: 'pong', ts: 9 },
  ];
  for (const msg of samples) {
    it(msg.type, () => {
      expect(validateBridge(msg), JSON.stringify(validateBridge.errors)).toBe(true);
    });
  }
});

describe('normalizer result schema', () => {
  it('accepts a well-formed result', () => {
    const result: NormalizerResult = {
      target: 'claude',
      action: 'send',
      clean_prompt: 'Add a README to the repo root.',
      short_preview: 'Add a README.',
      detected_intent: 'implement',
      risk_level: 'low',
      needs_clarification: false,
      clarification_question: null,
      should_auto_send: false,
      spoken_commands: [],
    };
    expect(validateNorm(result), JSON.stringify(validateNorm.errors)).toBe(true);
  });
  it('rejects an unknown target and extra keys', () => {
    expect(validateNorm({ target: 'slack' })).toBe(false);
    expect(
      validateNorm({
        target: 'claude',
        action: 'send',
        clean_prompt: 'x',
        short_preview: 'x',
        detected_intent: 'implement',
        risk_level: 'low',
        needs_clarification: false,
        clarification_question: null,
        should_auto_send: false,
        spoken_commands: [],
        sneaky_extra: true,
      }),
    ).toBe(false);
  });
});
