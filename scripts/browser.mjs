import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { arch, cpus, platform, release } from 'node:os';
import { chromium } from 'playwright';
import { verifyStadiumBand } from './check-stadium-band.mjs';
import { FULLTIME_BREAK, GOAL_BREAK, HALFTIME_BREAK, KICKOFF_TICKS } from '../src/football.ts';

const soak = process.argv.includes('--soak');
const smoke = process.argv.includes('--smoke');
const musicOnly = process.argv.includes('--music');
// This fixture includes a diving save, a goal, and a captain recap in its opening minute.
const actionSeed = soak || smoke ? 'zeerush' : 'grandstand-27';
const minutes = Number(process.env.SOAK_MINUTES ?? 20);
assert.ok(Number.isFinite(minutes) && minutes > 0 && minutes <= 1440);
const origin = `http://127.0.0.1:${process.env.PORT ?? 41730}`;
const soakName = minutes === 20 ? 'soak' : `soak-${String(minutes).replace('.', 'p')}min`;
const reportPath = soak ? `artifacts/${soakName}.json` : musicOnly ? 'artifacts/stadium-band-check.json' : 'artifacts/browser.json';
await mkdir('artifacts', { recursive: true });
const delay = ms => new Promise(res => setTimeout(res, ms));
const healthy = () => fetch(origin).then(async r => r.ok && (await r.text()).includes('id="broadcast"')).catch(() => false);
const server = await healthy() ? undefined : spawn(process.execPath, ['scripts/serve.mjs'], { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });
let browser;
const errors = [];
const warnings = [];
const requests = new Set();
const milestones = {};

function collect(page) {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('CONTEXT_LOST_WEBGL')) errors.push(msg.text());
    if (msg.type() === 'warning' && warnings.length < 28 && !warnings.includes(msg.text())) warnings.push(msg.text());
  });
  page.on('request', r => requests.add(r.url().split('?')[0]));
  page.on('requestfailed', r => errors.push(`Failed request ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
}

const snapshot = page => page.evaluate(() => window.rush.snapshot());
const waitUntil = (page, fn, timeout = 15000) => page.waitForFunction(fn, undefined, { timeout, polling: 90 });
const record = (name, value) => { milestones[name] = value; console.log(`${name} ${JSON.stringify(value)}`); };

async function monitorSmallScreen(page) {
  return page.evaluate(() => new Promise(resolve => {
    const selector = ['#rivals', '#commentary', '#callout', '#recap', '#hero-toggle', '#line-ruling'];
    const elements = selector.map(id => document.querySelector(id));
    const seen = Object.fromEntries(selector.map(id => [id, 0]));
    let samples = 0;
    let overlaps = 0;
    let clipped = 0;
    let duplicate = 0;
    let boothCaptions = 0;
    const started = performance.now();
    const timer = setInterval(() => {
      const { framing } = window.rush.snapshot().show;
      if (performance.now() - started > 42000) {
        clearInterval(timer);
        resolve({ samples, overlaps, clipped, duplicate, boothCaptions, seen });
        return;
      }
      if (!framing.ballVisible || framing.mode === 'celebration' || framing.mode === 'supporters') return;
      const x = (framing.ballX + 1) * innerWidth / 2;
      const y = (1 - framing.ballY) * innerHeight / 2;
      samples++;
      if (x < 0 || x > innerWidth || y < 0 || y > innerHeight) clipped++;
      const visible = elements.map(node => !node.hidden && getComputedStyle(node).visibility !== 'hidden');
      elements.forEach((node, i) => {
        if (!visible[i]) return;
        seen[selector[i]]++;
        const box = node.getBoundingClientRect();
        if (x > box.left && x < box.right && y > box.top && y < box.bottom) overlaps++;
      });
      const heading = document.querySelector('#commentary-event');
      if (visible[1] && elements[1].dataset.channel === 'booth') boothCaptions++;
      if (visible[1] && visible[2] && !heading.hidden && heading.textContent.startsWith(`${document.querySelector('#event-label').textContent} · ${document.querySelector('#event-text').textContent}`)) duplicate++;
    }, 140);
  }));
}

try {
  let available = false;
  for (let i = 0; i < 45; i++) {
    if (await healthy()) { available = true; break; }
    await delay(200);
  }
  assert.ok(available, 'Production server unavailable. Run npm run build.');
  let executablePath = process.env.CHROMIUM_PATH;
  if (!executablePath && platform() === 'win32' && process.env.ProgramFiles) {
    const candidate = `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`;
    try { await access(candidate); executablePath = candidate; } catch { /* Use Playwright's installed Chromium. */ }
  }
  const software = process.env.RUSH_SWIFTSHADER === '1';
  browser = await chromium.launch({ executablePath, headless: process.env.RUSH_HEADED !== '1', args: ['--autoplay-policy=document-user-activation-required', ...(software ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--enable-gpu'])] });
  const environment = { browser: browser.version(), rendererMode: software ? 'SwiftShader requested' : 'browser default', node: process.version, os: `${platform()} ${release()} ${arch()}`, cpu: cpus()[0]?.model, logicalCores: cpus().length };
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  collect(page);
  if (!soak && !smoke && !musicOnly) {
    await page.addInitScript(() => {
      const NativeAudio = window.AudioContext;
      let unlocked = false;
      window.addEventListener('pointerdown', event => { if (event.isTrusted) unlocked = true; }, { capture: true });
      window.AudioContext = class extends NativeAudio {
        get state() { return unlocked ? super.state : 'suspended'; }
        resume() {
          return unlocked ? super.resume() : Promise.resolve();
        }
        createDynamicsCompressor() {
          const node = super.createDynamicsCompressor();
          const probe = this.createAnalyser();
          const data = new Float32Array(probe.fftSize);
          node.connect(probe);
          window.outputLevel = () => {
            probe.getFloatTimeDomainData(data);
            return Math.sqrt(data.reduce((power, sample) => power + sample ** 2, 0) / data.length);
          };
          return node;
        }
      };
    });
  }
  const quality = process.env.RUSH_QUALITY ?? (soak ? 'auto' : 'high');
  if (!soak && !musicOnly) {
    await page.goto(`${origin}/?quality=${quality}&audio=muted`, { waitUntil: 'domcontentloaded' });
    await page.locator('#loading').waitFor({ state: 'hidden', timeout: 30000 });
    assert.ok(await page.locator('#operator').isHidden());
    assert.ok(await page.locator('#diagnostics').isHidden());
    await waitUntil(page, () => document.getElementById('clock').textContent !== '00:00');
    assert.ok(await page.locator('#rivals').isVisible());
    await page.screenshot({ path: 'artifacts/broadcast-1080.png' });
    await page.getByRole('button', { name: 'Heroes' }).click();
    const picker = page.getByRole('dialog', { name: 'Pick your hero' });
    assert.ok(await picker.isVisible());
    const portraits = await picker.locator('.hero-card canvas').evaluateAll(items => items.map(item => item.toDataURL()));
    assert.equal(portraits.length, 10);
    assert.equal(new Set(portraits).size, 10);
    await picker.getByRole('button', { name: /Doodle/ }).click();
    assert.ok(await page.getByRole('button', { name: 'Heroes, following Doodle' }).isVisible());
    await page.reload({ waitUntil: 'domcontentloaded' });
    const followed = page.getByRole('button', { name: 'Heroes, following Doodle' });
    await followed.waitFor({ state: 'visible' });
    await followed.click();
    assert.equal(await picker.getByRole('button', { name: /Doodle/ }).getAttribute('aria-pressed'), 'true');
    await picker.getByRole('button', { name: 'Clear favorite' }).click();
    assert.ok(await page.getByRole('button', { name: 'Heroes' }).isVisible());
    record('heroes', { portraits: portraits.length, restored: 'Doodle', cleared: true });
    if (smoke) { record('default', { clock: await page.locator('#clock').textContent() }); }
  }
  await page.goto(`${origin}/?mode=debug&seed=${actionSeed}&quality=${quality}&audio=${soak ? 'muted' : 'auto'}&session=new`, { waitUntil: 'domcontentloaded' });
  await waitUntil(page, () => window.rush?.snapshot().state === 'live', 35000);
  const initial = await snapshot(page);
  const gpu = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  });
  record('startup', { state: initial.state, players: initial.players.length, tick: initial.tick, render: initial.render, gpu, audio: initial.audio });
  assert.equal(initial.players.length, 10);
  assert.equal(initial.render.viewportWidth, 1920);
  assert.equal(initial.render.viewportHeight, 1080);
  if (quality === 'high') assert.deepEqual([initial.render.pixelWidth, initial.render.pixelHeight], [1920, 1080]);

  if (musicOnly) {
    await page.close();
    record('stadiumBand', await verifyStadiumBand(browser,origin,collect));
  } else if (soak) {
    const samples = [];
    const began = performance.now();
    await page.keyboard.press('d');
    const samplePeriod = Math.min(60000, Math.max(5000, minutes * 60000 / 6));
    let latest = initial;
    while (performance.now() - began < minutes * 60000) {
      await delay(Math.min(samplePeriod, Math.max(0, minutes * 60000 - (performance.now() - began))));
      latest = await snapshot(page);
      samples.push({ wallSeconds: (performance.now() - began) / 1000, tick: latest.tick, score: latest.scores, resources: latest.resources, render: latest.render, stats: latest.stats });
      console.log(`Soak ${samples.at(-1).wallSeconds.toFixed(1)}s tick=${latest.tick} score=${latest.scores.join('-')} fps=${latest.render.fps.toFixed(1)} calls=${latest.render.calls}`);
      assert.equal(latest.resources.bodies, initial.resources.bodies);
      assert.equal(latest.resources.colliders, initial.resources.colliders);
      assert.ok(latest.render.geometries === initial.render.geometries, 'The match reuses its uploaded geometry');
      assert.equal(latest.render.textures, initial.render.textures);
      assert.ok(latest.resources.history <= latest.resources.eventLimit && latest.render.particles <= 42 && latest.voices <= latest.maxVoices);
      assert.equal(latest.stats.faults, 0);
      assert.equal(errors.length, 0, errors.join('\n'));
    }
    await page.screenshot({ path: `artifacts/${soakName}-end.png` });
    const seconds = samples.at(-1).wallSeconds;
    assert.ok(latest.tick > initial.tick + 60 * seconds * .40, 'match clock stopped progressing');
    const summary = { wallSeconds: seconds, simulatedSeconds: (latest.tick - initial.tick) / 60, averageRenderedFps: (latest.render.frames - initial.render.frames) / seconds, quality, seed: latest.seed, samples, end: latest };
    await writeFile(reportPath, JSON.stringify({ environment: { ...environment, gpu }, requests: [...requests], errors, warnings, ...summary }, null, 2));
  } else if (!smoke) {
    assert.equal(initial.audio, 'blocked');
    await waitUntil(page, () => window.rush.snapshot().commentaryReady);
    assert.ok(await page.locator('#commentary').isVisible());
    const beforeRender = initial.render.frames;
    await waitUntil(page, () => window.rush.snapshot().tick > 180);
    assert.ok((await snapshot(page)).render.frames > beforeRender);

    await page.keyboard.press('d');
    await page.getByRole('button', { name: 'Turn sound on' }).click();
    await waitUntil(page, () => window.rush.snapshot().audio === 'on');
    await waitUntil(page, () => {
      const audio = window.rush.snapshot();
      return audio.music?.phrases > 0 && audio.commentaryPlayed > 0 && audio.effectsPlayed > 0 && audio.accentsPlayed > 0 && window.outputLevel() > 0.005;
    }, 40000);
    const audible = await snapshot(page);
    await page.keyboard.press('o');
    await page.getByRole('button', { name: 'Mute' }).click();
    await waitUntil(page, () => window.rush.snapshot().audio === 'muted');
    await waitUntil(page, () => window.outputLevel() < 0.0005);
    await page.getByRole('button', { name: 'Close' }).click();
    record('audio', { blockedCaptions: true, speech: audible.commentaryPlayed, lastSpoken: audible.lastSpoken, effects: audible.effectsPlayed, accents: audible.accentsPlayed, mutedOutput: await page.evaluate(() => window.outputLevel()) });

    for (const [id, name] of [[4, 'roundhouse'], [9, 'scruff']]) {
      await page.evaluate(id => window.rush.focus(id), id);
      await delay(330);
      await page.screenshot({ path: `artifacts/${name}-close.png` });
    }
    await page.evaluate(() => window.rush.focus(null));
    await page.setViewportSize({ width: 3840, height: 2160 });
    await waitUntil(page, () => window.rush.snapshot().render.viewportWidth === 3840);
    const fourK = await snapshot(page);
    if (quality === 'high') assert.deepEqual([fourK.render.pixelWidth, fourK.render.pixelHeight], [3840, 2160]);
    await page.screenshot({ path: 'artifacts/broadcast-4k.png', timeout: 45000 });
    const performanceStart = await snapshot(page);
    const performanceClock = performance.now();
    await delay(8000);
    const performanceEnd = await snapshot(page);
    record('4k', { ...performanceEnd.render, sampledSeconds: (performance.now() - performanceClock) / 1000,
      sampledFps: 1000 * (performanceEnd.render.frames - performanceStart.render.frames) / (performance.now() - performanceClock) });
    await page.setViewportSize({ width: 1280, height: 720 });
    await waitUntil(page, () => window.rush.snapshot().render.viewportWidth === 1280);

    const contextLoss = await page.evaluate(() => {
      const extension = document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context');
      if (!extension) return false;
      extension.loseContext();
      setTimeout(() => extension.restoreContext(), 800);
      return true;
    });
    if (contextLoss) {
      await waitUntil(page, () => window.rush.snapshot().render.contextLost);
      const lost = await snapshot(page);
      await waitUntil(page, () => !window.rush.snapshot().render.contextLost);
      const recovered = await snapshot(page);
      assert.ok(recovered.tick > lost.tick);
      record('webgl', { restored: true, simulatedTicksDuringLoss: recovered.tick - lost.tick });
    }

    await page.setViewportSize({ width: 1920, height: 1080 });
    await waitUntil(page, () => window.rush.snapshot().render.viewportWidth === 1920);
    await page.keyboard.press('o');
    await page.getByLabel('Quality').selectOption('medium');
    await waitUntil(page, () => window.rush.snapshot().render.level === 1);
    await page.getByLabel('Quality').selectOption(quality);
    await page.getByRole('button', { name: 'Close' }).click();
    const actionStart = performance.now();
    let capturedGoal = false;
    let capturedSave = false;
    let capturedKick = false;
    let goalTick;
    while (performance.now() - actionStart < 155000 && !(capturedGoal && capturedSave && capturedKick)) {
      const current = await snapshot(page);
      if (!capturedGoal && current.state === 'goal' && current.stateAge > 25 && current.stateAge < 55) {
        capturedGoal = true;
        const goal = current.history.findLast(e => e.kind === 'goal');
        goalTick = goal.tick;
        const celebration = current.show.celebration;
        assert.equal(celebration.team, goal.team);
        assert.equal(current.show.gestures[celebration.lead], goal.team === 0 ? 'double-hop' : 'victory-twirl');
        assert.equal(current.show.framing.mode, 'goal-line');
        assert.ok(current.show.framing.ballVisible);
        assert.equal(current.render.particles, 0);
        await page.screenshot({ path: 'artifacts/goal.png' });
      }
      const save = current.history.findLast(event => event.kind === 'save');
      if (!capturedSave && save?.save && current.tick - save.tick < 40 && current.players.some(p => p.id === save.player && p.pose === save.save.move && p.poseAge > 0.24 && p.poseAge < 0.52)) {
        capturedSave = true;
        await page.screenshot({ path: 'artifacts/keeper-save.png' });
      }
      if (!capturedKick && current.players.some(p => (p.pose === 'shot' || p.pose === 'pass') && p.poseAge > 0.18 && p.poseAge < 0.32)) {
        capturedKick = true;
        await page.screenshot({ path: 'artifacts/kick.png' });
      }
      await delay(100);
    }
    const current = await snapshot(page);
    assert.ok(capturedGoal && capturedSave && capturedKick, `Observed action screenshots: goal=${capturedGoal}, save=${capturedSave}, kick=${capturedKick}`);
    await waitUntil(page, () => window.rush.snapshot().state === 'live');
    const history = (await snapshot(page)).history;
    const after = history.find(e => e.kind === 'kickoff' && e.tick > goalTick);
    assert.ok(after && after.tick - goalTick === GOAL_BREAK + KICKOFF_TICKS);
    await page.screenshot({ path: 'artifacts/play-resumed.png' });
    record('actions', { score: current.scores, stats: current.stats, goalToKickoffSeconds: (after.tick - goalTick) / 60 });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('zeerush.match.v2')));
    await page.goto(`${origin}/?mode=debug&seed=${actionSeed}&hud=off&audio=muted&session=resume`, { waitUntil: 'domcontentloaded' });
    await waitUntil(page, () => window.rush?.snapshot().state === 'live');
    const restored = await snapshot(page);
    assert.ok(restored.restarted);
    assert.ok(restored.goalId >= stored.goalId);
    assert.equal(restored.goalId, restored.seriesGoals[0] + restored.seriesGoals[1]);
    assert.ok(await page.locator('#hud').isHidden());
    record('checkpoint', { saved: stored.scores, restored: restored.scores, ticks: restored.tick });

    await page.evaluate(() => {
      const url = new URL(location.href);
      url.searchParams.delete('session');
      history.replaceState(null, '', url);
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitUntil(page, () => window.rush?.snapshot().state === 'live');
    const fresh = await snapshot(page);
    assert.equal(fresh.restarted, false);
    assert.equal(fresh.matchNumber, 1);
    assert.equal(fresh.half, 1);
    assert.ok(fresh.tick < 300 && restored.tick > fresh.tick);
    assert.deepEqual(fresh.scores, [0, 0]);
    assert.deepEqual(fresh.seriesGoals, [0, 0]);
    record('refresh', { previousTick: restored.tick, kickoffTick: fresh.tick, match: fresh.matchNumber, scores: fresh.scores });

    async function checkPeriod(end) {
      const verification = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
      try {
        const edge = await verification.newPage();
        collect(edge);
        const period = end === 36000 ? 'halftime' : 'fulltime';
        await edge.addInitScript(cp => localStorage.setItem('zeerush.match.v2', JSON.stringify(cp)), {
          ...stored, ticks: end - (period === 'halftime' ? 1560 : 65), scores: [2, 1], seriesGoals: [2, 1], goalId: 3, wins: [0, 0], draws: 0, shots: [11, 9], saves: [3, 4],
        });
        await edge.goto(`${origin}/?mode=debug&seed=${actionSeed}&quality=high&audio=muted&session=resume`, { waitUntil: 'domcontentloaded' });
        await waitUntil(edge, () => !!window.rush);
        await edge.keyboard.press('d');
        await edge.waitForFunction(kind => window.rush.snapshot().state === kind, period);
        const result = await snapshot(edge);
        const summary = result.history.findLast(event => event.kind === period).summary;
        assert.equal(result.half, period === 'halftime' ? 2 : 1);
        assert.equal(result.matchNumber, period === 'halftime' ? 1 : 2);
        assert.deepEqual(result.scores, period === 'halftime' ? summary.scores : [0, 0]);
        assert.deepEqual(result.attack, [-1, 1]);
        assert.equal(await edge.locator('#report-score').textContent(), summary.scores.join(' – '));
        assert.equal(await edge.locator('#clock').textContent(), period === 'halftime' ? '10:00' : '00:00');
        if (period === 'halftime') {
          assert.ok(await edge.locator('#report-highlight').isVisible());
          assert.ok(await edge.locator('#highlight-image').isVisible());
          const palette = await edge.locator('#highlight-image').evaluate(canvas => {
            const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
            const colors = new Set();
            for (let i = 0; i < data.length; i += 388) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
            return colors.size;
          });
          assert.ok(palette > 20, 'Highlight is a captured scene frame');
          const first = await edge.locator('#highlight-image').evaluate(canvas => canvas.toDataURL());
          const initialFrame = result.show.replayFrame;
          await edge.waitForFunction(index => window.rush.snapshot().show.replayFrame >= index + 3, initialFrame);
          const replay = await snapshot(edge);
          assert.notEqual(await edge.locator('#highlight-image').evaluate(canvas => canvas.toDataURL()), first, 'Replay pictures advance');
          assert.ok(replay.show.replayFrames >= 3);
          record('highlight', { caption: await edge.locator('#highlight-name').textContent(), standout: await edge.locator('#report-star').textContent(), palette, replayFrames: replay.show.replayFrames, firstIndex: initialFrame, movedTo: replay.show.replayFrame });
        } else {
          await waitUntil(edge, () => window.rush.snapshot().stateAge >= 480 && window.rush.snapshot().show.celebration?.kind === 'fulltime');
          const closing = await snapshot(edge);
          assert.equal(closing.show.celebration.until, end + FULLTIME_BREAK);
          assert.ok(closing.show.gestures.every(gesture => gesture === 'two-hand-wave'));
          assert.match(await edge.locator('#report-kickoff').textContent(), /Next kickoff in [123]s/);
        }
        await edge.screenshot({ path: `artifacts/${period}.png` });
        await waitUntil(edge, () => {
          const state = window.rush.snapshot();
          return state.state === 'live' && state.history.some(event => event.kind === 'half-start' || event.kind === 'match-start');
        });
        const live = await snapshot(edge);
        assert.equal(live.history.find(event => event.kind === (period === 'halftime' ? 'half-start' : 'match-start')).tick,
          end + (period === 'halftime' ? HALFTIME_BREAK : FULLTIME_BREAK) + KICKOFF_TICKS);
        record(period, { boundaryTick: end, reportScore: summary.scores, nextScore: live.scores, attack: live.attack, match: live.matchNumber, half: live.half, liveTick: live.history.at(-1).tick });
      } finally { await verification.close(); }
    }
    await checkPeriod(36000);
    await checkPeriod(72000);

    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 220 }, deviceScaleFactor: 1, hasTouch: true });
    try {
      const phone = await phoneContext.newPage();
      collect(phone);
      await phone.goto(`${origin}/?mode=debug&quality=high&audio=muted&seed=${actionSeed}&session=new`, { waitUntil: 'domcontentloaded' });
      await waitUntil(phone, () => window.rush?.snapshot().state === 'live');
      await phone.keyboard.press('d');
      assert.ok(await phone.locator('#rivals').isVisible());
      await phone.screenshot({ path: 'artifacts/phone-rivals.png' });
      const phoneMonitoring = monitorSmallScreen(phone);
      await waitUntil(phone, () => {
        const { framing, moment } = window.rush.snapshot().show;
        return (framing.mode === 'attack' || framing.mode === 'reaction') && framing.scale < 0.85 && moment?.kind === 'save' && framing.ballVisible;
      }, 25000);
      const action = await snapshot(phone);
      assert.ok(Math.abs(action.show.framing.ballX) < 1 && Math.abs(action.show.framing.ballY) < 1);
      assert.equal(action.audio, 'muted');
      await phone.screenshot({ path: 'artifacts/phone-goalmouth.png' });
      const sightlines = await phoneMonitoring;
      assert.ok(sightlines.samples >= 180 && sightlines.seen['#rivals'] > 0 && sightlines.seen['#commentary'] > 0 && (sightlines.seen['#callout'] > 0 || sightlines.seen['#line-ruling'] > 0));
      assert.ok(sightlines.boothCaptions > 0, 'Booth captions appear in muted play');
      assert.equal(sightlines.clipped + sightlines.overlaps + sightlines.duplicate, 0);
      await phone.keyboard.press('o');
      await phone.getByRole('button', { name: 'Enable audio' }).click();
      await phone.getByRole('button', { name: 'Close' }).click();
      await waitUntil(phone, () => {
        const state = window.rush.snapshot();
        return state.audio === 'on' && state.effectsPlayed > 0;
      });
      await waitUntil(phone, () => {
        const box = document.querySelector('#recap');
        return !box.hidden && getComputedStyle(box).visibility !== 'hidden';
      }, 70000);
      await phone.screenshot({ path: 'artifacts/phone-recap.png' });
      const recap = await snapshot(phone);
      const recapText = await phone.locator('#recap-detail').textContent();
      assert.ok(recap.show.recap?.player === 4 || recap.show.recap?.player === 9);
      await waitUntil(phone, () => {
        const state = window.rush.snapshot();
        const caption = document.querySelector('#commentary');
        const turn = state.show.booth;
        return turn?.reply && turn.audible && turn.id === state.lastSpoken && caption.dataset.host === turn.host &&
          !caption.hidden && getComputedStyle(caption).visibility !== 'hidden';
      }, 65000);
      const characterAudio = await snapshot(phone);
      await phone.screenshot({ path: 'artifacts/commentary-booth-phone.png' });
      await phone.setViewportSize({ width: 390, height: 844 });
      await waitUntil(phone, () => window.rush.snapshot().render.viewportHeight === 844);
      assert.ok(await phone.locator('#clock').isVisible());
      await phone.screenshot({ path: 'artifacts/phone-portrait.png' });
      record('phone', { landscape: [390, 220], portrait: [390, 844], camera: action.show.framing, event: action.show.moment.kind, sightlines, recap: recapText, sound: [action.audio, characterAudio.audio], host: characterAudio.show.booth.host, line: characterAudio.lastSpoken });
    } finally { await phoneContext.close(); }
    await page.close();
    record('stadiumBand', await verifyStadiumBand(browser,origin,collect));
  }
  assert.ok([...requests].every(r => r.startsWith(origin) || r.startsWith('data:')));
  assert.deepEqual(errors, []);
  if (!soak) await writeFile(reportPath, JSON.stringify({ environment: { ...environment, gpu }, milestones, requests: [...requests], errors, warnings }, null, 2));
} finally {
  await browser?.close();
  server?.kill();
}
