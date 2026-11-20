import { Random } from './football';
import { StadiumBand } from './stadium-band';
import type { EventKind, MatchEvent } from './football';
import type { Preferences } from './settings';
import type { LineId } from './commentary';
import cues from './commentary-cues.json';
import type { ShowMoment } from './show';
import type { ArenaCue } from './arena-show';

const MAX_VOICES = 10;
type Sound = { seconds: number; filter: number; type: BiquadFilterType; volume: number; gap: number; tone?: number };
const sounds: Partial<Record<EventKind, Sound>> = {
  throw: { seconds: .20, filter: 780, type: 'bandpass', volume: .10, gap: .25 },
  out: { seconds: .13, filter: 1100, type: 'bandpass', volume: .075, gap: .45, tone: 790 },
  pass: { seconds: .12, filter: 360, type: 'lowpass', volume: .15, gap: .09, tone: 130 },
  distribution: { seconds: .18, filter: 390, type: 'lowpass', volume: .16, gap: .13, tone: 108 },
  shot: { seconds: .21, filter: 550, type: 'lowpass', volume: .39, gap: .12, tone: 98 },
  bounce: { seconds: .09, filter: 260, type: 'lowpass', volume: .12, gap: .12, tone: 124 },
  board: { seconds: .16, filter: 445, type: 'lowpass', volume: .17, gap: .15, tone: 87 },
  post: { seconds: .33, filter: 1620, type: 'bandpass', volume: .24, gap: .13, tone: 570 },
  footstep: { seconds: .09, filter: 680, type: 'lowpass', volume: .067, gap: .14 },
  save: { seconds: .31, filter: 950, type: 'bandpass', volume: .35, gap: .65, tone: 112 },
  goal: { seconds: 1.38, filter: 1180, type: 'bandpass', volume: .48, gap: 1.2 },
  tackle: { seconds: .14, filter: 660, type: 'lowpass', volume: .12, gap: .23 },
  interception: { seconds: .17, filter: 760, type: 'bandpass', volume: .14, gap: .23 },
  halftime: { seconds: .64, filter: 1940, type: 'bandpass', volume: .16, gap: 1.2, tone: 1410 },
  fulltime: { seconds: .73, filter: 2080, type: 'bandpass', volume: .18, gap: 1.2, tone: 1530 },
  'match-start': { seconds: .36, filter: 1760, type: 'bandpass', volume: .13, gap: .50, tone: 1210 },
  'half-start': { seconds: .36, filter: 1760, type: 'bandpass', volume: .13, gap: .50, tone: 1210 },
};
const loftSound: Sound = { seconds: .24, filter: 820, type: 'lowpass', volume: .23, gap: .15, tone: 164 };
const powerShotSound: Sound = { seconds: .29, filter: 660, type: 'lowpass', volume: .42, gap: .15, tone: 115 };
const gloveCatch: Sound = { seconds: .23, filter: 510, type: 'lowpass', volume: .36, gap: .65, tone: 106 };
const gloveTip: Sound = { seconds: .24, filter: 1570, type: 'bandpass', volume: .32, gap: .65, tone: 228 };

type Accent = { notes: readonly number[]; wave: OscillatorType; beat: number; volume: number; tail: number };
const accents = {
  goal: { notes: [330, 440, 587, 660], wave: 'triangle', beat: .095, volume: .13, tail: .20 },
  scruffGoal: { notes: [440, 554, 523, 740], wave: 'triangle', beat: .095, volume: .13, tail: .20 },
  finale: { notes: [330, 392, 494, 587, 659], wave: 'triangle', beat: .14, volume: .13, tail: .32 },
  post: { notes: [1020, 757], wave: 'sine', beat: .12, volume: .10, tail: .13 },
  save: { notes: [250, 340], wave: 'sine', beat: .09, volume: .077, tail: .11 },
  steal: { notes: [360, 495, 580], wave: 'sine', beat: .07, volume: .08, tail: .10 },
  stretch: { notes: [370, 493, 233], wave: 'triangle', beat: .12, volume: .082, tail: .14 },
  shrug: { notes: [405, 283], wave: 'triangle', beat: .11, volume: .078, tail: .14 },
  wave: { notes: [395, 542, 469], wave: 'sine', beat: .085, volume: .084, tail: .11 },
} satisfies Record<string, Accent>;

export class MatchAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private effects?: GainNode;
  private music?: GainNode;
  private commentary?: GainNode;
  private applause?: AudioBuffer;
  private output?: DynamicsCompressorNode;
  private recording?: MediaStreamAudioDestinationNode;
  private noise?: AudioBuffer;
  private clips?: AudioBuffer;
  private speech?: { source: AudioBufferSourceNode; level: GainNode; priority: number; id: LineId; start: number };
  private accentVoice?: OscillatorNode;
  private accentPriority = 0;
  private readonly streaming = new AbortController();
  private readonly voices = new Set<AudioBufferSourceNode>();
  private readonly last = new Map<EventKind, number>();
  private band?: StadiumBand;
  private bandCueTick = -1;
  get musicReady() { return this.band?.ready ?? false; }
  get musicStatus() { return this.band?.status; }
  get musicTitle() { return this.band?.title; }
  startMusic() { this.musicStarted = true; this.band?.start(); }
  closeFinish(value: boolean) { this.band?.setCloseFinish(value); }
  private recovery = false;
  commentaryPlayed = 0;
  lastSpoken?: LineId;
  effectsPlayed = 0;
  accentsPlayed = 0;
  crowdReactions = 0;

  constructor(private settings: Preferences, private musicSeed: string, private musicStarted: boolean) {}

  get status() { return this.settings.audio === 'muted' ? 'muted' : this.context?.state === 'running' ? 'on' : this.recovery ? 'unavailable' : 'blocked'; }
  get activeVoices() { return this.voices.size + Number(!!this.accentVoice); }
  get commentaryReady() { return this.clips !== undefined; }

  private prepare() {
    const ctx = new AudioContext();
    this.context = ctx;
    this.master = ctx.createGain();
    this.effects = ctx.createGain();
    this.music = ctx.createGain();
    this.commentary = ctx.createGain();
    const compressor = this.output = ctx.createDynamicsCompressor();
    compressor.threshold.value = -17;
    compressor.knee.value = 12;
    compressor.ratio.value = 9;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.22;
    this.effects.connect(this.master);
    this.music.connect(this.master);
    this.commentary.connect(this.master);
    this.master.connect(compressor).connect(ctx.destination);
    this.update(this.settings);
    void fetch(`${import.meta.env.BASE_URL}voice/rush-radio.wav`, { signal: this.streaming.signal }).then(response => {
      if (!response.ok) throw new Error(`Commentary audio HTTP ${response.status}`);
      return response.arrayBuffer();
    }).then(data => new OfflineAudioContext(1, 1, 24000).decodeAudioData(data)).then(decoded => {
      if (!this.streaming.signal.aborted) this.clips = decoded;
    }).catch(() => {
      // Match audio and captions continue if the optional speech track is unavailable.
    });
    const create = (seconds: number) => ctx.createBuffer(1, Math.round(seconds * ctx.sampleRate), ctx.sampleRate);
    const random = new Random('rush-sound-original');
    this.noise = create(2);
    const white = this.noise.getChannelData(0);
    for (let i = 0; i < white.length; i++) white[i] = random.range(-1, 1);
    // A few pairs of hands on a big play. Each clap has three small, closely spaced attacks.
    this.applause = create(.96);
    const claps = this.applause.getChannelData(0);
    for (const start of [.02, .09, .17, .28, .36, .47, .54, .68, .78]) {
      let low = 0, mid = 0;
      const amp = random.range(.075, .14);
      for (let j = 0; j < ctx.sampleRate * .10; j++) {
        const t = j / ctx.sampleRate;
        low += .44 * (random.range(-1, 1) - low);
        mid += .12 * (low - mid);
        const envelope = Math.min(1, t * 550) * Math.exp(-t * 48) * (1 + .45 * Math.cos(t * 980));
        claps[Math.floor(start * ctx.sampleRate) + j] += (low - mid) * envelope * amp;
      }
    }
    this.band = new StadiumBand(ctx, this.music, import.meta.env.BASE_URL, this.musicSeed);
    this.band.setEnabled(this.settings.audio !== 'muted' && this.settings.music > 0);
    if (this.musicStarted) this.band.start();
  }

  arena(cue?: ArenaCue) {
    const ctx = this.context;
    if (!cue || !ctx || this.status !== 'on' || !this.applause || !this.effects || !this.settings.effects ||
        cue.kind === 'post' || cue.kind === 'out' || this.activeVoices >= MAX_VOICES) return;
    const source = ctx.createBufferSource(), level = ctx.createGain();
    source.buffer = this.applause;
    level.gain.value = cue.kind === 'goal' || cue.kind === 'fulltime' ? .65 : .34;
    source.connect(level).connect(this.effects);
    this.voices.add(source);
    source.onended = () => { this.voices.delete(source); source.disconnect(); level.disconnect(); };
    source.start();
    this.crowdReactions++;
  }

  captureTrack() {
    if (!this.context || !this.output || this.status !== 'on') return undefined;
    if (!this.recording) {
      this.recording = this.context.createMediaStreamDestination();
      this.output.connect(this.recording);
    }
    return this.recording.stream.getAudioTracks()[0].clone();
  }

  enable(manual = false) {
    if (!manual && this.settings.audio === 'muted') return;
    try {
      if (!this.context) this.prepare();
      void this.context?.resume().catch(() => { this.recovery = true; });
    } catch { this.recovery = true; }
  }

  update(settings: Preferences) {
    this.settings = settings;
    this.band?.setEnabled(settings.audio !== 'muted' && settings.music > 0);
    if (!this.context || !this.master || !this.effects || !this.music || !this.commentary) return;
    const t = this.context.currentTime;
    if ((settings.audio === 'muted' || settings.commentary === 0) && this.speech) {
      this.fadeSpeech(t);
    }
    this.master.gain.setTargetAtTime(settings.audio === 'muted' ? 0 : settings.master, t, 0.060);
    const duck = this.speech && settings.commentary > 0 && settings.audio !== 'muted';
    this.effects.gain.setTargetAtTime(settings.effects * (duck ? 0.46 : 1), t, 0.060);
    this.music.gain.setTargetAtTime(settings.music * (duck ? .33 : .96), t, settings.music === 0 ? .045 : duck ? .065 : .50);
    this.commentary.gain.setTargetAtTime(settings.commentary, t, 0.045);
  }

  private fadeSpeech(now: number) {
    if (!this.speech) return;
    const { source, level } = this.speech;
    this.speech = undefined;
    level.gain.cancelAndHoldAtTime(now);
    level.gain.linearRampToValueAtTime(0, now + .024);
    source.stop(now + .026);
  }

  mouthLevel(id: LineId, elapsed: number) {
    const [offset, duration] = cues[id];
    if (this.speech?.id === id && this.context?.state === 'running') elapsed = this.context.currentTime - this.speech.start;
    if (elapsed < 0 || elapsed >= duration - .075) return 0;
    if (!this.clips) return .2 + .55 * Math.abs(Math.sin(elapsed * 14));
    const samples = this.clips.getChannelData(0);
    const start = Math.floor((offset + elapsed) * this.clips.sampleRate);
    const end = Math.min(samples.length, start + 360);
    let power = 0;
    for (let i = start; i < end; i += 4) power += samples[i] ** 2;
    return Math.min(1, 5 * Math.sqrt(power / Math.max(1, (end - start) / 4)));
  }

  speak(id: LineId, priority: number, elapsed = 0) {
    const ctx = this.context;
    if (this.status !== 'on' || !ctx || !this.commentary || !this.clips || this.settings.commentary === 0) return false;
    if (this.speech && priority < 4 && priority <= this.speech.priority) return false;
    const [offset, duration] = cues[id];
    if (duration - elapsed < .42) return false;
    const source = ctx.createBufferSource();
    source.buffer = this.clips;
    const level = ctx.createGain();
    const onset = ctx.currentTime + .015;
    level.gain.setValueAtTime(0, onset);
    level.gain.linearRampToValueAtTime(1, onset + .012);
    source.connect(level).connect(this.commentary);
    source.onended = () => {
      source.disconnect();
      level.disconnect();
      if (this.speech?.source !== source) return;
      this.speech = undefined;
      if (!this.streaming.signal.aborted) this.update(this.settings);
    };
    this.fadeSpeech(ctx.currentTime);
    this.speech = { source, level, priority, id, start: onset - elapsed };
    this.update(this.settings);
    source.start(onset, offset + elapsed, duration - elapsed);
    this.commentaryPlayed++;
    this.lastSpoken = id;
    return true;
  }

  react(event: MatchEvent) {
    const playedCue = this.band?.react(event);
    if (playedCue) this.bandCueTick = event.tick;
    const style = event.flight?.style;
    const spec = event.kind === 'throw' ? sounds.throw : event.save?.held ? gloveCatch : event.save?.move === 'tip' ? gloveTip
      : style === 'long-shot' ? powerShotSound : style === 'loft' || style === 'switch' ? loftSound : sounds[event.kind];
    const ctx = this.context;
    if (!spec || this.status !== 'on' || !ctx || !this.effects || !this.noise || this.settings.effects === 0 || this.activeVoices >= MAX_VOICES) return;
    const now = ctx.currentTime;
    if (now - (this.last.get(event.kind) ?? -4) < spec.gap) return;
    this.last.set(event.kind, now);
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const v = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = spec.type;
    filter.frequency.value = spec.filter;
    filter.Q.value = spec.type === 'bandpass' ? 0.8 : 0.2;
    source.connect(filter).connect(v).connect(this.effects);
    const end = now + spec.seconds;
    v.gain.setValueAtTime(0, now);
    v.gain.linearRampToValueAtTime(spec.volume, now + (event.kind === 'goal' ? 0.13 : 0.012));
    v.gain.exponentialRampToValueAtTime(0.0001, end);
    const oscillator = spec.tone ? ctx.createOscillator() : undefined;
    const toneGain = oscillator && ctx.createGain();
    if (oscillator && toneGain && spec.tone) {
      oscillator.frequency.setValueAtTime(spec.tone, now);
      oscillator.frequency.exponentialRampToValueAtTime(spec.tone * 0.55, end);
      toneGain.gain.value = 0.38;
      oscillator.connect(toneGain).connect(v); oscillator.start(now); oscillator.stop(end);
    }
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect(); filter.disconnect(); v.disconnect(); oscillator?.disconnect(); toneGain?.disconnect();
    };
    source.start(now, (event.tick % 19) * .027, spec.seconds);
    this.effectsPlayed++;
    if (event.kind === 'fulltime' && !playedCue) this.playAccent(accents.finale, 4, 0.7);
  }

  accent(moment: ShowMoment) {
    if (moment.kind === 'goal' && moment.tick === this.bandCueTick) return;
    const priority = moment.kind === 'goal' ? 3 : moment.kind === 'post' || moment.joke ? 2 : 1;
    const gag = moment.joke;
    const key = gag === 'stretch' || gag === 'shrug' || gag === 'wave' ? gag : moment.kind === 'goal' && moment.team === 1 ? 'scruffGoal' : moment.kind;
    this.playAccent(accents[key], priority, moment.kind === 'save' && gag ? .19 : .04);
  }

  private playAccent(spec: Accent, priority: number, delay: number) {
    const ctx = this.context;
    if (this.status !== 'on' || !ctx || !this.effects || this.settings.effects === 0 || this.activeVoices >= MAX_VOICES) return;
    if (this.accentVoice && priority <= this.accentPriority) return;
    const t = ctx.currentTime + delay;
    const note = ctx.createOscillator();
    const volume = ctx.createGain();
    note.type = spec.wave;
    spec.notes.forEach((frequency, i) => {
      const onset = t + i * spec.beat;
      const duration = i === spec.notes.length - 1 ? spec.tail : spec.beat * .90;
      note.frequency.setValueAtTime(frequency, onset);
      note.frequency.exponentialRampToValueAtTime(frequency * .94, onset + duration);
      volume.gain.setValueAtTime(.001, onset);
      volume.gain.linearRampToValueAtTime(spec.volume, onset + .016);
      volume.gain.exponentialRampToValueAtTime(.001, onset + duration);
    });
    note.connect(volume).connect(this.effects);
    this.accentVoice?.stop(ctx.currentTime + .015);
    this.accentVoice = note;
    this.accentPriority = priority;
    note.onended = () => {
      note.disconnect(); volume.disconnect();
      if (this.accentVoice === note) this.accentVoice = undefined;
    };
    note.start(t);
    note.stop(t + (spec.notes.length - 1) * spec.beat + spec.tail + .01);
    this.accentsPlayed++;
  }

  dispose() {
    this.streaming.abort();
    this.speech?.source.stop();
    this.accentVoice?.stop();
    this.band?.dispose();
    for (const source of this.voices) { source.stop(); source.disconnect(); }
    this.voices.clear();
    void this.context?.close().catch(() => undefined);
  }
}
