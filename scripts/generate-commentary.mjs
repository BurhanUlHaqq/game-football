import { fork } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { availableParallelism, freemem } from 'node:os';
import { fileURLToPath } from 'node:url';
import { cartoonVoice } from './cartoon-voice.mjs';

const tooling = new URL('../.tooling/commentary/package.json', import.meta.url);
const require = createRequire(tooling);
const wav = new URL('../public/voice/rush-radio.wav', import.meta.url);
const cueFile = new URL('../src/commentary-cues.json', import.meta.url);
const cache = new URL('../.tooling/', import.meta.url);
const guideBank = new URL('rush-radio-dry.wav', cache);
const guideCues = new URL('rush-radio-dry-cues.json', cache);
const guideLines = new URL('rush-radio-dry-lines.json', cache);
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

async function cachedGuides(entries) {
  const clips = new Map();
  if (!process.argv.includes('--append')) return clips;
  let files;
  try {
    files = await Promise.all([readFile(guideBank), readFile(guideCues, 'utf8'), readFile(guideLines, 'utf8')]);
  } catch (error) {
    if (error.code === 'ENOENT') return clips;
    throw error;
  }
  const [track, map, manifest] = files;
  const cues = JSON.parse(map), lines = JSON.parse(manifest);
  if (track.toString('ascii', 0, 4) !== 'RIFF' || track.readUInt32LE(24) !== rate || track.readUInt16LE(22) !== 1 ||
      track.readUInt16LE(34) !== 16 || track.length !== 44 + track.readUInt32LE(40)) return clips;
  for (const [id, line] of entries) {
    if (lines[id]?.text !== line.text || lines[id]?.voice !== line.voice || !cues[id]) continue;
    const [offset, seconds] = cues[id];
    const start = 44 + Math.round(rate * offset) * 2, end = start + Math.round(rate * seconds) * 2;
    if (start >= 44 && end > start && end <= track.length) clips.set(id, track.subarray(start, end));
  }
  return clips;
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
  const clips = await cachedGuides(entries);
  const missing = entries.filter(([id]) => !clips.has(id));
  if (missing.length) {
    for (const [id, bytes] of (await generate(missing)).flat()) clips.set(id, Buffer.from(bytes));
  }
  const cues = {}, chunks = [], guides = [];
  let total = 0;
  for (const [id, line] of entries) {
    const guide = clips.get(id);
    const pcm = cartoonVoice(guide, line, id, rate);
    const frames = pcm.length / 2;
    cues[id] = [total / rate, frames / rate];
    chunks.push(pcm);
    guides.push(guide);
    total += frames;
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(total * 2 + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(total * 2, 40);
  const cueText = `${JSON.stringify(cues, null, 2)}\n`;
  await mkdir(new URL('../public/voice/', import.meta.url), { recursive: true });
  await mkdir(cache, { recursive: true });
  await Promise.all([writeFile(wav, Buffer.concat([header, ...chunks])), writeFile(cueFile, cueText),
    writeFile(guideBank, Buffer.concat([header, ...guides])), writeFile(guideCues, cueText),
    writeFile(guideLines, JSON.stringify(Object.fromEntries(entries)))]);
  console.log(`Rendered ${entries.length} cartoon voiceovers with phonetic guides from Kokoro ${require('./node_modules/kokoro-js/package.json').version}.`);
}
