import { fork } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { availableParallelism, freemem } from 'node:os';
import { fileURLToPath } from 'node:url';

const tooling = new URL('../.tooling/commentary/package.json', import.meta.url);
const require = createRequire(tooling);
const wav = new URL('../public/voice/rush-radio.wav', import.meta.url);
const cueFile = new URL('../src/commentary-cues.json', import.meta.url);
const rate = 24000;
const padding = Math.round(rate * .12);

async function synthesize(entries) {
  const { KokoroTTS } = await import(new URL('./node_modules/kokoro-js/dist/kokoro.js', tooling).href);
  const { AutoTokenizer, StyleTextToSpeech2Model } = await import(new URL('./node_modules/@huggingface/transformers/dist/transformers.node.mjs', tooling).href);
  const model = 'onnx-community/Kokoro-82M-v1.0-ONNX';
  const [engine, tokenizer] = await Promise.all([
    StyleTextToSpeech2Model.from_pretrained(model, { dtype: 'q8', device: 'cpu', session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 } }),
    AutoTokenizer.from_pretrained(model),
  ]);
  const tts = new KokoroTTS(engine, tokenizer);
  const clips = [];
  for (const [id, line] of entries) {
    const { audio, sampling_rate: sampleRate } = await tts.generate(line.text, { voice: line.voice, speed: 1.08 });
    if (sampleRate !== rate || audio.length < rate * 0.3) throw new Error(`Unexpected audio for ${id}`);
    let peak = 0;
    let start = 0;
    let end = audio.length;
    for (const sample of audio) peak = Math.max(peak, Math.abs(sample));
    while (start < end && Math.abs(audio[start]) < 0.008) start++;
    while (end > start && Math.abs(audio[end - 1]) < 0.008) end--;
    if (peak < 0.025 || end - start < rate * 0.25) throw new Error(`Speech is too quiet for ${id}`);
    start = Math.max(0, start - 240);
    end = Math.min(audio.length, end + 720);
    const frames = end - start + padding;
    const pcm = Buffer.alloc(frames * 2);
    for (let i = start; i < end; i++) {
      const fade = Math.min(1, (i - start) / 130, (end - i) / 260);
      pcm.writeInt16LE(Math.round(audio[i] * (0.73 / peak) * fade * 32767), (i - start) * 2);
    }
    clips.push([id, pcm]);
    console.log(`${id} ${line.voice} ${(frames / rate).toFixed(2)}s`);
  }
  return clips;
}

function generate(entries) {
  const workers = Math.max(1, Math.min(entries.length, 6, Math.floor(availableParallelism() / 2), Math.floor(freemem() / 900_000_000)));
  console.log(`Generating ${entries.length} lines across ${workers} workers.`);
  const groups = Array.from({ length: workers }, () => []);
  for (const [i, entry] of entries.entries()) groups[i % workers].push(entry);
  return Promise.all(groups.map(group => new Promise((resolve, reject) => {
    const worker = fork(fileURLToPath(import.meta.url), ['--worker'], {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'], serialization: 'advanced', windowsHide: true,
    });
    let result;
    worker.once('message', clips => { result = clips; });
    worker.once('error', reject);
    worker.once('exit', code => {
      if (code !== 0 || !result) reject(new Error(`Speech worker exited before generating its clips (code ${code})`));
      else resolve(result);
    });
    worker.send(group);
  })));
}

async function prependExisting(entries) {
  if (!process.argv.includes('--append')) return { cues: {}, chunks: [], total: 0 };
  const [track, cueJSON] = await Promise.all([readFile(wav), readFile(cueFile, 'utf8')]);
  const cues = JSON.parse(cueJSON);
  const ids = Object.keys(cues);
  if (track.toString('ascii', 0, 4) !== 'RIFF' || track.readUInt32LE(24) !== rate || track.readUInt16LE(22) !== 1 ||
    track.readUInt16LE(34) !== 16 || track.length !== 44 + track.readUInt32LE(40) ||
    ids.some((id, i) => entries[i]?.[0] !== id)) throw new Error('Existing bank must match the unchanged opening lines to append');
  return { cues, chunks: [track.subarray(44)], total: (track.length - 44) / 2 };
}

if (process.argv.includes('--worker') && process.send) {
  const entries = await new Promise(resolve => process.once('message', resolve));
  const clips = await synthesize(entries);
  process.send(clips, error => {
    process.disconnect();
    if (error) throw error;
  });
} else {
  const entries = Object.entries(JSON.parse(await readFile(new URL('../src/commentary-lines.json', import.meta.url), 'utf8')));
  const { cues, chunks, total: firstFrame } = await prependExisting(entries);
  let total = firstFrame;
  const additions = entries.slice(Object.keys(cues).length);
  const clips = new Map(additions.length ? (await generate(additions)).flat() : []);
  for (const [id] of additions) {
    const pcm = Buffer.from(clips.get(id));
    const frames = pcm.length / 2;
    cues[id] = [total / rate, frames / rate];
    chunks.push(pcm);
    total += frames;
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(total * 2 + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(total * 2, 40);
  await mkdir(new URL('../public/voice/', import.meta.url), { recursive: true });
  await writeFile(wav, Buffer.concat([header, ...chunks]));
  await writeFile(cueFile, `${JSON.stringify(cues, null, 2)}\n`);
  console.log(`Packed ${Object.keys(cues).length} clips with Kokoro ${require('./node_modules/kokoro-js/package.json').version}.`);
}
