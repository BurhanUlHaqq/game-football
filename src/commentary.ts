import { MATCH_TICKS, Random, ROSTER } from './football';
import type { MatchEvent, SaveMove, Score } from './football';
import cues from './commentary-cues.json';
import lines from './commentary-lines.json';
import { CAPTAINS, CAST } from './show';
import type { CastRecap, ShowMoment } from './show';

export type LineId = keyof typeof lines;
type PitchPair = { speaker: number; listener: number; kind: 'Team' | 'Rival' };
export type PitchTurn = PitchPair & { tick: number; duration: number; reply: boolean };
export type CommentaryCall = { id: LineId; text: string; host: string; priority: number; ticks: number; pitch?: PitchTurn };
const goals = ['goalOne', 'goalTwo', 'goalThree'] as const;
const castGoals = ['mittsGoal', 'pipGoal', 'sunnyGoal', 'doodleGoal', 'boulderGoal', 'patchGoal', 'crankGoal', 'dashGoal', 'tangleGoal', 'zipGoal'] as const;
const saveMoves: Record<SaveMove, LineId> = { dive: 'diveSave', tip: 'tipSave', smother: 'scoopSave', block: 'blockSave' };
const variants = new Map<LineId, LineId[]>();
for (const id of Object.keys(lines) as LineId[]) {
  const base = id.replace(/Alt\d+$/, '') as LineId;
  const pool = variants.get(base) ?? [];
  pool.push(id);
  variants.set(base, pool);
}
const shotSpacing = 35 * 60;
const repeatSpacing = 67 * 60;
const defaultScore: Score = [0, 3];
const pitchIntro = 6 * 60;
const pitchSpacing = 15 * 60;
const newSpeakerHeadStart = 6 * 60;
const firstSaveHeadStart = 11 * 60;
const playerSpacing = 27 * 60;

function pitchLine(player: number, kind: PitchPair['kind'], reply: boolean): LineId | undefined {
  const id = `${CAST[player].toLowerCase()}${kind}${reply ? 'Reply' : 'Call'}`;
  return Object.hasOwn(lines, id) ? id as LineId : undefined;
}

export class Commentary {
  private readonly variantOffset: number;
  private lastTick = -10000;
  private busyUntil = 0;
  private lastPriority = 0;
  private lastShot = -10000;
  private shotCalls = 0;
  private lastGoal = 0;
  private saveCalls = 0;
  private heardCast = false;
  private readonly played = new Map<LineId, number>();
  private readonly lastPitch = CAST.map(() => -10000);
  private readonly pitchLinesSpoken = CAST.map(() => 0);
  private nextPitch = pitchIntro;
  private lastPitchKind?: PitchPair['kind'];
  private exchange?: PitchPair & { at: number; expires: number; opening: LineId; answer: LineId; replyAt?: number };
  private speaking?: PitchTurn;

  constructor(seed?: string) {
    this.variantOffset = seed === undefined ? 0 : new Random(`rush-voices:${seed}`).state;
  }

  private pick(base: LineId, tick: number) {
    const pool = variants.get(base) ?? [base];
    const start = this.variantOffset % pool.length;
    let choice: LineId | undefined;
    let oldest = Infinity;
    for (let i = 0; i < pool.length; i++) {
      const id = pool[(i + start) % pool.length];
      const previous = this.played.get(id) ?? -Infinity;
      if (previous >= oldest || tick - previous < repeatSpacing) continue;
      choice = id;
      oldest = previous;
    }
    return choice;
  }

  private call(options: LineId | readonly LineId[], tick: number, priority: number, gap: number, pitch?: PitchPair & { reply: boolean }): CommentaryCall | undefined {
    if (this.exchange?.replyAt !== undefined && priority < 4 && !pitch) return;
    if (priority < 4 && (tick - this.lastTick < gap || tick < this.busyUntil)) return;
    if (tick < this.busyUntil && priority <= this.lastPriority) return;
    const choices = typeof options === 'string' ? [options] : options;
    let available: LineId | undefined;
    for (const base of choices) {
      available = this.pick(base, tick);
      if (available) break;
    }
    if (!available && priority < 4) return;
    const id = available ?? choices[0];
    const line = lines[id];
    const duration = Math.ceil(cues[id][1] * 60);
    this.lastTick = tick;
    this.busyUntil = tick + duration + 13;
    this.lastPriority = priority;
    this.played.set(id, tick);
    if (priority >= 4) this.exchange = undefined;
    this.speaking = pitch ? { ...pitch, tick, duration } : undefined;
    const host = 'speaker' in line ? line.speaker : line.voice === 'bf_emma' ? 'EMMA' : 'MICK';
    if ('speaker' in line || pitch) this.heardCast = true;
    return { id, text: line.text, host: pitch ? CAST[pitch.speaker] : host, priority,
      ticks: pitch ? duration + 13 : Math.max(160, duration + 23), pitch: this.speaking };
  }

  private offerPitch(event: MatchEvent) {
    const { tick, player: speaker } = event;
    if (tick < pitchIntro || tick + 108 < this.busyUntil ||
      this.exchange?.replyAt !== undefined || speaker === undefined || !CAST[speaker]) return;
    const teamPlay = event.kind === 'pass' || event.kind === 'distribution';
    if (!teamPlay && event.kind !== 'save' && event.kind !== 'tackle' && event.kind !== 'interception') return;
    const listener = teamPlay ? event.flight?.receiver : event.opponent;
    if (listener === undefined || speaker === listener || !CAST[listener]) return;
    const teammates = Math.floor(speaker / ROSTER.length) === Math.floor(listener / ROSTER.length);
    if (teamPlay !== teammates || tick - Math.max(this.lastPitch[speaker], this.lastPitch[listener]) < playerSpacing) return;
    const firstSaveCall = event.kind === 'save' && this.pitchLinesSpoken[speaker] === 0;
    const newSpeaker = this.pitchLinesSpoken[speaker] === 0 || this.pitchLinesSpoken[listener] === 0;
    const headStart = firstSaveCall ? firstSaveHeadStart : newSpeaker ? newSpeakerHeadStart : 0;
    if (tick < this.nextPitch - headStart) return;
    const kind = teamPlay ? 'Team' : 'Rival';
    const call = pitchLine(speaker, kind, false);
    const reply = pitchLine(listener, kind, true);
    if (!call || !reply) return;
    const opening = this.pick(call, tick);
    const answer = this.pick(reply, tick);
    if (!opening || !answer) return;
    const previous = this.exchange;
    if (previous && tick <= previous.expires) {
      const weight = (a: number, b: number, style: PitchPair['kind']) => (this.pitchLinesSpoken[a] + this.pitchLinesSpoken[b]) * 2 + Number(style === this.lastPitchKind);
      if (weight(speaker, listener, kind) >= weight(previous.speaker, previous.listener, previous.kind)) return;
    }
    this.exchange = { speaker, listener, kind, opening, answer, at: tick + 23, expires: tick + 108 };
    return true;
  }

  advancePitch(tick: number, live: boolean): CommentaryCall | undefined {
    if (!live) {
      this.exchange = this.speaking = undefined;
      return;
    }
    const exchange = this.exchange;
    if (!exchange) return;
    const { speaker, listener, kind, opening, answer, at, expires, replyAt } = exchange;
    if (replyAt === undefined && tick > expires) {
      this.exchange = undefined;
      return;
    }
    if (tick < (replyAt ?? at) || tick < this.busyUntil) return;
    const reply = replyAt !== undefined;
    const call = this.call(reply ? answer : opening, tick, 2, 0,
      { speaker: reply ? listener : speaker, listener: reply ? speaker : listener, kind, reply });
    if (!call) { this.exchange = undefined; return; }
    const talking = reply ? listener : speaker;
    this.lastPitch[talking] = tick;
    this.pitchLinesSpoken[talking]++;
    if (reply) this.exchange = undefined;
    else {
      exchange.replyAt = this.busyUntil;
      this.nextPitch = tick + pitchSpacing;
      this.lastPitchKind = kind;
    }
    return call;
  }

  pitchTurn(tick: number) {
    const turn = this.speaking;
    return turn && tick < turn.tick + turn.duration ? turn : undefined;
  }

  react(event: MatchEvent, scores: Score, moment?: ShowMoment, featured?: ShowMoment, recap?: CastRecap): CommentaryCall | undefined {
    const offeredPitch = this.offerPitch(event);
    const { tick, kind, player } = event;
    const boulder = player === CAPTAINS[0];
    const zip = player === CAPTAINS[1];
    const drought = tick - this.lastGoal >= 60 * 50;
    if (recap?.tick === tick && (recap.player === CAPTAINS[0] || recap.player === CAPTAINS[1]) && (kind === 'kickoff' || kind === 'distribution')) {
      const captain = recap.player === CAPTAINS[0];
      const castCall = captain ? 'boulderWelcomeBack' : 'zipWelcomeBack';
      const intro = captain ? 'roundhouseRecap' : 'scruffRecap';
      const duel = captain ? 'boulderPatchRecap' : 'zipMittsRecap';
      const called = this.call(recap.saves ? [duel, castCall, intro] : [intro, castCall], tick, 3, 170);
      if (called) return called;
    }
    const replayLine = featured?.kind === 'save' ? 'saveReplay' : featured?.kind === 'post' ? 'postReplay' : featured?.kind === 'steal' ? 'stealReplay' : undefined;
    switch (kind) {
      case 'halftime': return this.call(replayLine ?? (featured ? 'halfFeature' : 'halfTime'), tick, 6, 0);
      case 'fulltime': {
        this.lastGoal = tick;
        return this.call(event.team === undefined ? 'finalDraw' : 'finalWin', tick, 6, 0);
      }
      case 'match-start':
        this.heardCast = false;
        return this.call(tick < MATCH_TICKS ? 'opening' : ['next', 'openingDuel'], tick, 3, 210);
      case 'half-start': return this.call('secondHalf', tick, 3, 245);
      case 'goal': {
        this.lastGoal = tick;
        if (event.detail === 'Own goal') return this.call('ownGoal', tick, 4, 0);
        if (moment?.late && moment.equal) return this.call(['lateEqualizer', 'equalizer'], tick, 5, 0);
        if (moment?.turnaround) return this.call(['leadChange', moment.late ? 'lateGoal' : 'goalThree'], tick, 5, 0);
        if (moment?.late) return this.call(['lateGoal', boulder ? 'boulderGoal' : zip ? 'zipGoal' : 'goalThree'], tick, 4, 0);
        if (scores[0] === scores[1]) return this.call('equalizer', tick, 5, 0);
        if (moment?.chase) return this.call(['backInIt', 'goalThree', 'goalOne'], tick, 4, 0);
        const goalId = event.goalId ?? 0;
        const accent = moment?.payback && (boulder || zip) ? boulder ? 'boulderPayback' : 'zipPayback' :
          player === undefined || goalId % 4 === 0 ? undefined : castGoals[player];
        const order = goalId % goals.length;
        const general = [...goals.slice(order), ...goals.slice(0, order)];
        return this.call(accent ? [accent, ...general] : general, tick, 4, 0);
      }
      case 'post': return this.call(moment?.joke && (boulder || zip) ? [boulder ? 'boulderPost' : moment.joke === 'cup-ear' ? 'zipPostAside' : 'zipPost', 'postSecond'] : [drought ? 'woodworkBreak' : 'post', 'postSecond', 'post'], tick, 3, 470);
      case 'save': {
        if (offeredPitch && !moment?.joke && !moment?.callback) return undefined;
        const line = player === 0 ? 'mittsSave' : 'patchSave';
        const keeper = player === 0 ? 'mittsAside' : 'patchAside';
        const stretch: LineId[] = moment?.opponent === CAPTAINS[0] ? ['boulderStretchAside', 'boulderStretch'] : ['zipQuickAside', 'zipHeadsUp'];
        if (this.heardCast) stretch.reverse();
        const cast = moment?.joke === 'stretch' ? stretch : moment?.joke === 'wave' ? ['zipWaveAside', 'zipQuickAside'] as const : moment?.joke === 'shrug' ? ['boulderAside'] as const : [];
        const detail = moment?.callback ? [player === 0 ? 'mittsAgain' : 'patchAgain', keeper] as const : drought && !moment?.joke ? ['saveBreak'] as const : [];
        const picks: LineId[] = moment?.callback && (Math.floor(tick / 60) % 2 === 0) ? [keeper, ...cast, ...detail] : [...cast, ...detail];
        const specific = event.save ? saveMoves[event.save.move] : line;
        const result = event.save?.held ? 'heldSave' : this.saveCalls % 2 ? 'saveOne' : 'saveTwo';
        const variety = [specific, line, result] as const;
        const called = this.call([...picks, variety[this.saveCalls % variety.length], specific, line, result, 'saveOne'], tick, 3, drought || moment?.joke ? 385 : 540);
        if (called) this.saveCalls++;
        return called;
      }
      case 'shot': {
        if (tick - this.lastShot < shotSpacing) return undefined;
        const plain = this.shotCalls % 2 === 0 ? 'shotOne' : 'shotTwo';
        const line = event.flight?.style === 'long-shot' ? 'longShot' : boulder ? 'boulderShot' : zip ? 'zipShot' : plain;
        const called = this.call(line === plain ? plain : [line, plain], tick, 2, 1320);
        if (called) {
          this.lastShot = tick;
          this.shotCalls++;
        }
        return called;
      }
      case 'interception':
      case 'tackle': {
        const line = boulder ? 'boulderSteals' : zip ? 'zipSteals' : moment?.opponent === CAPTAINS[0] ? 'boulderFooled' : 'zipFooled';
        const plain = kind === 'interception' ? 'intercept' : 'tackle';
        return moment ? this.call([moment.callback ? 'tradeSteals' : line, plain], tick, 3, 650) :
          offeredPitch ? undefined : this.call(plain, tick, 2, 1550);
      }
      case 'pass': {
        if (offeredPitch) return undefined;
        const style = event.flight?.style;
        if (style === 'switch' || style === 'loft') {
          return this.call(style === 'switch' ? 'switchPass' : 'loftPass', tick, 2, 1260);
        }
        if (drought) return this.call(style === 'drive' ? 'drivePass' : ['quietBuild', 'pass'], tick, 1, 2050);
        return undefined;
      }
      case 'distribution': return offeredPitch ? undefined : this.call('distribution', tick, 1, 1750);
      default: return undefined;
    }
  }

  countdown(tick: number, scores: Score = defaultScore) {
    if (tick % MATCH_TICKS !== MATCH_TICKS - 60 * 60) return undefined;
    const gap = Math.abs(scores[0] - scores[1]);
    return this.call(gap === 0 ? 'lastMinuteLevel' : gap === 1 ? 'oneGoalLeft' : 'lastMinute', tick, 4, 0);
  }
}
