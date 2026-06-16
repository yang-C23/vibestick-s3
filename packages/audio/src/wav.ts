/** Accumulates binary PCM frames streamed from the device for one recording. */
export class AudioAccumulator {
  private chunks: Buffer[] = [];

  append(frame: Buffer): void {
    this.chunks.push(frame);
  }
  get byteLength(): number {
    return this.chunks.reduce((n, c) => n + c.length, 0);
  }
  pcm(): Buffer {
    return Buffer.concat(this.chunks);
  }
  reset(): void {
    this.chunks = [];
  }
}

/** Wrap raw little-endian PCM16 in a minimal RIFF/WAVE container. */
export function pcm16ToWav(pcm: Buffer, sampleRate = 16000, channels = 1): Buffer {
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // audio format = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
