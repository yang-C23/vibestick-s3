import { describe, it, expect } from 'vitest';
import { AudioAccumulator, MockSttProvider, createSttProvider, pcm16ToWav } from '../src/index';

describe('pcm16ToWav', () => {
  it('writes a valid 44-byte RIFF/WAVE header', () => {
    const pcm = Buffer.alloc(320); // 10ms @16k mono
    const wav = pcm16ToWav(pcm, 16000, 1);
    expect(wav.length).toBe(44 + pcm.length);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    expect(wav.readUInt32LE(4)).toBe(36 + pcm.length);
    expect(wav.readUInt16LE(20)).toBe(1); // PCM
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(16000);
    expect(wav.readUInt16LE(34)).toBe(16); // bits
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
  });
});

describe('AudioAccumulator', () => {
  it('concatenates frames', () => {
    const acc = new AudioAccumulator();
    acc.append(Buffer.from([1, 2]));
    acc.append(Buffer.from([3, 4]));
    expect(acc.byteLength).toBe(4);
    expect([...acc.pcm()]).toEqual([1, 2, 3, 4]);
    acc.reset();
    expect(acc.byteLength).toBe(0);
  });
});

describe('createSttProvider', () => {
  it('defaults to mock', () => {
    expect(createSttProvider().name).toBe('mock');
  });
  it('selects sidecar for qwen3-asr', () => {
    expect(createSttProvider({ provider: 'qwen3-asr' }).name).toBe('sidecar');
  });
  it('mock provider returns its text', async () => {
    const r = await new MockSttProvider('hello world').transcribe(Buffer.alloc(0));
    expect(r.text).toBe('hello world');
  });
});
