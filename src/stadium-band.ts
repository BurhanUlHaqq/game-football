import { BandReactions, MusicProgram, scoreLibrary } from './music-program';
import type { CueRequest, MusicCue, Phrase } from './music-program';
import type { MatchEvent } from './football';

type Asset = { buffer?: AudioBuffer; loading: boolean; failures: number; retry: number };
type Playing = { phrase: Phrase; start: number; end: number };
type Accent = { source: AudioBufferSourceNode; gain: GainNode; priority: number };
const movementFile = (p: Phrase) => p.tune.id + '-' + p.movement;
const cueFile = (p: Phrase) => p.tune.id + '-cues';

// Decode only the current material and the next musical entrance, at the rate of the recordings.
export class StadiumBand {
  private readonly program: MusicProgram;
  private readonly reactions = new BandReactions();
  private readonly files = new Map<string, Asset>();
  private readonly controller = new AbortController();
  private readonly decoder = new OfflineAudioContext(2, 1, scoreLibrary.rate);
  private readonly sources = new Set<AudioBufferSourceNode>();
  private readonly backing: GainNode;
  private readonly lift: GainNode;
  private readonly timer: number;
  private next: Phrase;
  private active?: Playing;
  private scheduled?: Playing;
  private accent?: Accent;
  private started = false;
  private enabled = false;
  private heated = false;
  private closeFinish = false;
  private skipAfter = 0;
  private phrases = 0;
  private cues = 0;
  private lastCue?: MusicCue;
  private lastPost = -Infinity;

  constructor(private ctx: AudioContext, private output: GainNode, private base: string, seed: string) {
    this.program = new MusicProgram(seed);
    this.next = this.program.next();
    this.backing = ctx.createGain();
    this.lift = ctx.createGain();
    this.lift.gain.value = .10;
    this.lift.connect(this.backing);
    this.backing.connect(output);
    this.timer = window.setInterval(() => this.pump(), 120);
  }

  get title() { return this.active?.phrase.tune.title; }
  get ready() { return !!(this.active || this.scheduled || this.files.get(movementFile(this.next))?.buffer); }
  get status() {
    return { title:this.active?.phrase.tune.title, movement:this.active?.phrase.movement, phrases:this.phrases,
      lifted:this.heated, cues:this.cues, lastCue:this.lastCue, cached:this.files.size, sources:this.sources.size };
  }

  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (enabled) this.pump();
  }

  start() { this.started = true; this.pump(); }
  setCloseFinish(value: boolean) { this.closeFinish = value; }

  private load(name: string) {
    let asset = this.files.get(name);
    if (!asset) {
      asset = { loading:false, failures:0, retry:0 };
      this.files.set(name,asset);
    }
    if (asset.buffer || asset.loading || performance.now()<asset.retry) return asset;
    asset.loading = true;
    const entry = asset;
    void fetch(this.base + 'music/stadium-band/' + name + '.ogg', { signal:this.controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Unavailable music movement');
        return response.arrayBuffer();
      })
      .then(bytes => this.decoder.decodeAudioData(bytes))
      .then(buffer => { if (!this.controller.signal.aborted) entry.buffer = buffer; })
      .catch(() => { entry.failures++; entry.retry = performance.now()+1500; })
      .finally(() => { entry.loading = false; });
    return asset;
  }

  private source(buffer: AudioBuffer, target: AudioNode, at: number, offset: number, length: number, ended?: () => void) {
    const node = this.ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(target);
    this.sources.add(node);
    node.onended = () => { this.sources.delete(node); node.disconnect(); ended?.(); };
    node.start(at, offset, Math.min(length, buffer.duration-offset));
    return node;
  }

  private pump() {
    if (this.controller.signal.aborted) return;
    const now = this.ctx.currentTime;
    if (this.scheduled && now >= this.scheduled.start) {
      this.active = this.scheduled;
      this.scheduled = undefined;
      this.phrases++;
    }
    if (!this.enabled) return;
    const asset = this.load(movementFile(this.next));
    this.load(cueFile(this.next));
    const keep = new Set([movementFile(this.next), cueFile(this.next)]);
    if (this.active) keep.add(cueFile(this.active.phrase));
    if (this.scheduled) keep.add(cueFile(this.scheduled.phrase));
    for (const [file, entry] of this.files) if (!keep.has(file) && !entry.loading) this.files.delete(file);
    if (!asset.buffer && asset.failures >= 2 && performance.now() >= this.skipAfter) {
      this.next = this.program.next();
      this.skipAfter = performance.now() + 1500;
      return;
    }
    if (!this.started || this.ctx.state !== 'running') return;
    const heated = this.closeFinish || this.reactions.until > now;
    if (heated !== this.heated) {
      this.heated = heated;
      this.lift.gain.setTargetAtTime(heated ? .90 : .10, now, heated ? .22 : .76);
    }
    if (!asset.buffer || this.scheduled || (this.active && this.active.end-now > 1.5)) return;
    const phrase = this.next;
    const at = Math.max(now + .045, this.active?.end ?? 0);
    const take = phrase.tune.takeFrames/scoreLibrary.rate;
    this.source(asset.buffer, this.backing, at, 0, take);
    this.source(asset.buffer, this.lift, at, take, take);
    this.scheduled = { phrase, start:at, end:at + phrase.tune.frames/scoreLibrary.rate };
    this.next = this.program.next();
  }

  react(event: MatchEvent) {
    if (!this.active || !this.enabled || !this.started || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (event.kind === 'post' && !this.accent && now-this.lastPost > 10) {
      // Stop-time: leave space for the woodwork, then bring everyone in together on the beat.
      const beat = 60/this.active.phrase.tune.bpm;
      const downbeat = this.active.start + Math.ceil((now+.22-this.active.start)/beat)*beat;
      this.backing.gain.cancelAndHoldAtTime(now);
      this.backing.gain.setTargetAtTime(.08, now, .030);
      this.backing.gain.setTargetAtTime(1, downbeat, .10);
      this.lastPost = now;
    }
    const request = this.reactions.react(event, now);
    return request && this.playCue(request, this.active);
  }

  private playCue(request: CueRequest, song: Playing) {
    const buffer = this.files.get(cueFile(song.phrase))?.buffer;
    if (!buffer || this.accent && request.priority < this.accent.priority) return;
    const now = this.ctx.currentTime, { tune } = song.phrase;
    const pulse = 30 / tune.bpm;
    const at = song.start + Math.ceil((now+.012-song.start)/pulse)*pulse;
    const [offset, frames] = tune.cues[request.name];
    const length = frames/scoreLibrary.rate;
    if (this.accent) {
      this.accent.gain.gain.cancelAndHoldAtTime(now);
      this.accent.gain.gain.setTargetAtTime(0,now,.021);
      this.accent.source.stop(now+.09);
    }
    const level = this.ctx.createGain();
    level.gain.value = request.name === 'save' ? .86 : 1;
    level.connect(this.output);
    const source = this.source(buffer,level,at,offset/scoreLibrary.rate,length,() => {
      level.disconnect();
      if (this.accent?.source === source) this.accent = undefined;
    });
    this.accent = { source, gain:level, priority:request.priority };
    this.backing.gain.cancelAndHoldAtTime(now);
    this.backing.gain.setTargetAtTime(request.name === 'save' ? .32 : .16, at, .055);
    this.backing.gain.setTargetAtTime(1, at+length-.52, .35);
    this.cues++;
    this.lastCue = request.name;
    return true;
  }

  dispose() {
    window.clearInterval(this.timer);
    this.controller.abort();
    for (const source of this.sources) { source.stop(); source.disconnect(); }
    this.sources.clear();
    this.files.clear();
    this.backing.disconnect();
    this.lift.disconnect();
    this.accent?.gain.disconnect();
    this.active = this.scheduled = undefined;
  }
}
