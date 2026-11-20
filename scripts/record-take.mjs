import { access, mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { subtitles } from '../src/production.ts';

const [seed = 'midnight-cup', limit = '185', format = 'horizontal', output = `artifacts/${seed}-take`] = process.argv.slice(2);
const seconds = Number(limit);
if (!/^[\w.-]{1,48}$/.test(seed) || !Number.isFinite(seconds) || seconds < 3 || seconds > 1260 || !['horizontal', 'vertical'].includes(format)) {
  throw new Error('Usage: npm run record:take -- SEED SECONDS horizontal|vertical OUTPUT_PREFIX');
}
const prefix = resolve(output);
const origin = `http://127.0.0.1:${process.env.PORT ?? 41730}`;
const title = `Rush Arena Capture ${process.pid}`;
const burnedCaptions = process.env.RUSH_CAPTIONS !== 'off';
const viewport = format === 'vertical' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
let executablePath = process.env.CHROMIUM_PATH;
if (!executablePath && process.env.ProgramFiles) {
  const candidate = `${process.env.ProgramFiles}/Google/Chrome/Application/chrome.exe`;
  try { await access(candidate); executablePath = candidate; } catch { /* Use Playwright's bundled Chromium. */ }
}
await mkdir(dirname(prefix), { recursive: true });
const partial = `${prefix}.recording`;
const file = await open(partial, 'wx');
let browser;
let saved = false;
try {
  browser = await chromium.launch({ executablePath, args: ['--enable-gpu', `--auto-select-tab-capture-source-by-title=${title}`,
    '--enable-usermedia-screen-capturing', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeBinding('writeTakeChunk', async (_source, encoded) => {
    await file.writeFile(Buffer.from(encoded, 'base64'));
  });
  await page.goto(`${origin}/?mode=capture&session=new&fps=30&audio=auto&seed=${encodeURIComponent(seed)}&captions=${burnedCaptions ? 'on' : 'off'}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.rushCapture?.status().audioReady && window.rushCapture.status().audio === 'on');
  const start = await page.evaluate(async ({ title, viewport }) => {
    document.title = title;
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser', frameRate: { ideal: 30, max: 30 },
      width: { ideal: viewport.width }, height: { ideal: viewport.height } }, audio: false, preferCurrentTab: true, monitorTypeSurfaces: 'exclude' });
    const captured = stream.getVideoTracks()[0]?.getSettings();
    const stopTracks = () => stream.getTracks().forEach(track => track.stop());
    if (captured?.displaySurface !== 'browser' || captured.width !== viewport.width || captured.height !== viewport.height) {
      stopTracks();
      throw new Error(`Expected the game tab at ${viewport.width}x${viewport.height}. Received ${JSON.stringify(captured)}.`);
    }
    const audio = window.rushCapture.audioTrack();
    if (!audio) { stopTracks(); throw new Error('Expected an active game audio track.'); }
    stream.addTrack(audio);
    const mimeType = ['video/mp4;codecs=avc1.420033,mp4a.40.2', 'video/webm;codecs=vp8,opus'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { stopTracks(); throw new Error('The browser has no supported audio/video recorder.'); }
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 7_000_000, audioBitsPerSecond: 160_000 });
    let writes = Promise.resolve();
    recorder.ondataavailable = ({ data }) => {
      if (!data.size) return;
      writes = writes.then(async () => {
        const encoded = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.slice(reader.result.lastIndexOf(',') + 1));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(data);
        });
        await window.writeTakeChunk(encoded);
      });
    };
    window.finishTake = () => new Promise((resolve, reject) => {
      const log = window.rushCapture.finish();
      recorder.onstop = () => { stopTracks(); writes.then(() => resolve(log), reject); };
      recorder.stop();
    });
    recorder.start(1000);
    window.rushCapture.begin();
    return { tick: window.rushCapture.status().tick, extension: mimeType.startsWith('video/mp4') ? 'mp4' : 'webm' };
  }, { title, viewport });
  console.log(`Recording ${seed} at ${viewport.width}×${viewport.height}.`);
  await page.waitForFunction(tick => window.rushCapture.status().tick >= tick, start.tick + Math.ceil(seconds * 60),
    { timeout: (seconds * 1.8 + 25) * 1000, polling: 150 });
  const take = await page.evaluate(() => window.finishTake());
  const { size } = await file.stat();
  await file.close();
  if (errors.length) throw new Error(errors.join('\n'));
  if (size < 10000 || !take?.markers.length || (seconds >= 12 && !take.captions.some(cue => cue.audible))) throw new Error('The recording did not produce the expected video, events and speech.');
  const video = `${prefix}.${start.extension}`;
  await rename(partial, video);
  saved = true;
  await writeFile(`${prefix}.json`, JSON.stringify({ ...take, video: video.slice(dirname(video).length + 1), burnedCaptions, ...viewport }, null, 2));
  await writeFile(`${prefix}.srt`, subtitles(take.captions), 'utf8');
  console.log(`Saved ${video} with ${take.markers.length} markers and ${take.captions.length} captions.`);
} finally {
  await browser?.close();
  await file.close();
  if (!saved) await rm(partial, { force: true });
}
