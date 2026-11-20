import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { subtitles } from '../src/production.ts';

const [filename, destination = 'artifacts/rush-arena-pilot'] = process.argv.slice(2);
if (!filename) throw new Error('Usage: npm run edit:episode -- TAKE.json OUTPUT_PREFIX');
const take = JSON.parse(await readFile(filename, 'utf8'));
if (take.version !== 1 || !take.video || !Array.isArray(take.markers) || !Array.isArray(take.captions)) throw new Error('Expected a take from npm run record:take.');
const source = resolve(dirname(filename), take.video);
const output = resolve(destination);
const tools = resolve('.tooling/episode-tools/imageio_ffmpeg/binaries');
const portable = (await readdir(tools).catch(() => [])).find(name => /^ffmpeg-win64-[\w.-]+\.exe$/.test(name));
const ffmpeg = process.env.RUSH_FFMPEG ? resolve(process.env.RUSH_FFMPEG) : portable ? join(tools, portable) : 'ffmpeg';
const font = process.env.RUSH_FONT ?? (process.platform === 'win32' ? `${process.env.WINDIR}/Fonts/segoeuib.ttf` :
  process.platform === 'darwin' ? '/System/Library/Fonts/Supplemental/Arial Bold.ttf' : '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf');
await access(source);
const usable = take.markers.filter(marker => marker.recordingSeconds > 2 && marker.recordingSeconds + 4 < take.durationSeconds);
const goals = usable.filter(marker => marker.kind === 'goal');
const saves = usable.filter(marker => marker.kind === 'save' && marker.player && marker.opponent);
const rivalries = [];
for (const goal of goals) {
  if (!goal.player || goal.detail === 'Own goal') continue;
  const denials = saves.filter(save => save.match === goal.match && save.team !== goal.team && save.opponent.id === goal.player.id &&
    save.tick < goal.tick && goal.tick - save.tick < 150 * 60);
  const last = denials.at(-1);
  if (!last) continue;
  const matching = denials.filter(save => save.player.id === last.player.id);
  rivalries.push({ goal, saves: matching, value: matching.length * 20 + (goal.rank ?? 79) + (matching.some(save => save.technique === 'tip' || save.technique === 'dive') ? 12 : 0) });
}
rivalries.sort((a, b) => b.value - a.value);
const arc = rivalries[0];
const payoff = arc?.goal ?? goals.at(-1) ?? saves.at(-1);
if (!payoff) throw new Error('Record a take long enough to contain a goal or a save and its reaction.');
const fulltime = usable.find(mark => mark.kind === 'fulltime' && mark.match === payoff.match && mark.tick > payoff.tick);
const result = fulltime ?? payoff;
const setup = arc?.saves[0] ?? payoff;
const shooter = arc?.goal.player.name;
const keeper = arc?.saves[0].player.name;
const title = arc ? `Can ${shooter} beat ${keeper}?` : payoff.kind === 'goal' ? 'A big finish at Rush Arena' : 'Safe hands at Rush Arena';
const prelude = { from: Math.max(0, setup.recordingSeconds - 2.2), to: setup.recordingSeconds + 2.1, heading: 'RUSH ARENA', title, part: 'opening' };
const moments = new Map();
function nominate(marker, before, after, name, title, priority) {
  const { recordingSeconds } = marker;
  const previous = moments.get(recordingSeconds);
  if (previous && previous.priority >= priority) return;
  moments.set(recordingSeconds, { from: Math.max(0, recordingSeconds - before), to: Math.min(take.durationSeconds, recordingSeconds + after),
    at: recordingSeconds, name, title, priority });
}
for (const mark of goals) {
  if (mark.match === payoff.match && mark.tick <= result.tick) nominate(mark, 6.5, 4.15, 'goal', undefined, 1);
}
if (arc) {
  nominate(setup, 6.5, 4.2, 'setup', `${keeper} makes the first stop`, 2);
  const remaining = arc.saves.slice(1);
  for (const mark of [...new Set([remaining.find(save => save.technique === 'tip' || save.technique === 'dive'), remaining.at(-1)].filter(Boolean))]) {
    nominate(mark, 5.2, 4.2, 'rematch', `${shooter} tries again`, 2);
  }
  const exchange = usable.find(mark => mark.kind === 'exchange' && mark.match === setup.match && mark.tick > setup.tick && mark.tick < payoff.tick &&
    [mark.player?.name, mark.opponent?.name].includes(keeper) && [mark.player?.name, mark.opponent?.name].includes(shooter));
  if (exchange) nominate(exchange, 2, Math.min(7, (exchange.exchangeEndSeconds ?? exchange.recordingSeconds + 4) - exchange.recordingSeconds + 0.8), 'exchange', undefined, 0);
}
nominate(payoff, 8.5, payoff.kind === 'goal' ? 4.25 : 3.2, 'payoff', arc ? `${shooter} gets another chance` : undefined, 3);
if (fulltime) nominate(fulltime, 1.2, 7.5, 'fulltime', undefined, 3);

const parts = [];
for (const part of [...moments.values()].sort((a, b) => a.from - b.from)) {
  const prior = parts.at(-1);
  if (prior && part.from <= prior.to + 1.25) {
    prior.to = Math.max(part.to, prior.to);
    if (part.title && (!prior.title || part.priority > prior.priority)) Object.assign(prior, { title: part.title, priority: part.priority, at: part.at });
    prior.events.push(part.name);
  } else parts.push({ ...part, events: [part.name] });
}
const last = parts.at(-1);
const score = take.teams.map((team, i) => `${team.replace(/ FC$/i, '')} ${result.score[i]}`).join('  -  ');
const closing = fulltime ? `Full time  •  ${score}` : score;
const clips = [prelude, ...parts];

await mkdir(dirname(output), { recursive: true });
const stage = await mkdtemp(join(dirname(output), 'rush-edit-'));
const run = (args) => new Promise((done, fail) => {
  const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], { cwd: stage, stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true });
  child.once('error', fail);
  child.once('exit', code => code === 0 ? done() : fail(new Error(`FFmpeg exited with code ${code}.`)));
});
try {
  await copyFile(resolve(font), join(stage, 'type.ttf'));
  const size = take.width;
  const portrait = take.height > take.width;
  const encode = ['-c:v', 'libx264', '-preset', 'veryfast', '-threads', '4', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2'];
  const retimed = [];
  let offset = 0;
  for (const [i, clip] of clips.entries()) {
    const duration = clip.to - clip.from;
    const filters = ['fps=30', 'setsar=1'];
    const caption = async (text, y, fontRatio, timing, tag) => {
      const textFile = `${tag}-${i}.txt`;
      await writeFile(join(stage, textFile), text);
      filters.push(`drawtext=fontfile=type.ttf:textfile=${textFile}:expansion=none:fontsize=${Math.round(size * fontRatio)}:fontcolor=white:box=1:boxcolor=0x251a36@0.94:boxborderw=${Math.round(size * .0075)}:x=(w-tw)/2:y=h*${y}:enable='${timing}'`);
    };
    if (i === 0) {
      filters.push(`drawbox=x=0:y=0:w=iw:h=ih*${portrait ? 0.19 : 0.23}:color=0x251a36:t=fill`);
      await caption(prelude.heading, portrait ? 0.056 : 0.049, portrait ? 0.04 : 0.026, '1', 'channel');
      await caption(prelude.title, portrait ? 0.098 : 0.115, portrait ? 0.061 : 0.045, '1', 'title');
    } else if (clip.title) {
      const stop = Math.max(0.4, Math.min(3.8, clip.at - clip.from - 0.7));
      await caption(clip.title, portrait ? 0.24 : 0.238, portrait ? 0.052 : 0.037, `lt(t,${stop.toFixed(3)})`, 'beat');
    }
    if (clip === last && !fulltime) {
      const ending = `gte(t,${Math.max(0, duration - 2.4).toFixed(3)})`;
      filters.push(`drawbox=x=0:y=0:w=iw:h=ih*${portrait ? 0.19 : 0.23}:color=0x251a36:t=fill:enable='${ending}'`);
      await caption(closing, portrait ? .082 : .081, portrait ? .054 : .038, ending, 'score');
    }
    const audioFade = Math.max(0, duration - .16).toFixed(3);
    const graph = `[0:v]${filters.join(',')}[picture];[0:a]afade=t=in:st=0:d=0.10,afade=t=out:st=${audioFade}:d=0.16[sound]`;
    await run(['-ss', clip.from.toFixed(3), '-i', source, '-t', duration.toFixed(3), '-filter_complex', graph,
      '-map', '[picture]', '-map', '[sound]', ...encode, `part-${i}.mp4`]);
    for (const cue of take.captions) {
      const start = Math.max(cue.recordingSeconds, clip.from);
      const end = Math.min(cue.endSeconds, clip.to);
      if (end - start < .18) continue;
      retimed.push({ ...cue, recordingSeconds: offset + start - clip.from, endSeconds: offset + end - clip.from });
    }
    offset += duration;
  }
  await writeFile(join(stage, 'parts.txt'), clips.map((_, i) => `file 'part-${i}.mp4'`).join('\n'));
  await run(['-f', 'concat', '-safe', '1', '-i', 'parts.txt', '-c', 'copy', '-movflags', '+faststart', join(stage, 'episode.mp4')]);
  await copyFile(join(stage, 'episode.mp4'), `${output}.mp4`);
  await writeFile(`${output}.srt`, subtitles(retimed), 'utf8');
  await writeFile(`${output}.json`, JSON.stringify({ title, seed: take.seed, match: result.match, score: result.score,
    scoreAtMatchSeconds: result.matchSeconds, fixtureComplete: Boolean(fulltime), estimatedSeconds: offset, clips }, null, 2));
  console.log(`${title} · ${offset.toFixed(1)} seconds · ${output}.mp4`);
} finally {
  for (const entry of await readdir(stage)) await unlink(join(stage, entry));
  await rmdir(stage);
}
