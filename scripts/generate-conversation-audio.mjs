// Original UI earcons; no third-party recordings. Keep timings aligned with the H5 synth.
import { mkdirSync, writeFileSync } from 'node:fs';
const target = new URL('../src/static/audio/', import.meta.url);
mkdirSync(target, { recursive: true });
for (const kind of ['send', 'receive']) {
  const notes = kind === 'send' ? [[0, 660, .07], [.045, 990, .09]] : [[0, 784, .09], [.07, 622, .12]];
  const rate = 22050, duration = kind === 'send' ? .15 : .205, count = Math.ceil(rate * duration);
  const wav = Buffer.alloc(44 + count * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) {
    const time = i / rate;
    const sample = notes.reduce((value, [offset, frequency, length]) => {
      const t = time - offset;
      if (t < 0 || t > length) return value;
      const envelope = t < .008 ? t / .008 : Math.exp(Math.log(.0001 / .07) * (t - .008) / (length - .008));
      return value + .07 * envelope * Math.sin(2 * Math.PI * frequency * t);
    }, 0);
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + i * 2);
  }
  writeFileSync(new URL(`chat-${kind}.wav`, target), wav);
}
