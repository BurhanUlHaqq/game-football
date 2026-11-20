import { MATCH_TICKS, Random } from './football';
import type { MatchEvent, SaveMove, Score } from './football';
import cues from './commentary-cues.json';
import lines from './commentary-lines.json';
import { CAPTAINS } from './show';
import type { CastRecap, ShowMoment } from './show';

export type LineId = keyof typeof lines;
export type BoothHost = 'MICK' | 'EMMA';
type Exchange = { opening: LineId; reply: boolean; player?: number; opponent?: number };
export type CommentaryCall = { id: LineId; text: string; host: BoothHost; priority: number; ticks: number; exchange?: Exchange };
const goals = ['goalOne', 'goalTwo', 'goalThree'] as const;
const castGoals = ['mittsGoal', 'pipGoal', 'sunnyGoal', 'doodleGoal', 'boulderGoal', 'patchGoal', 'crankGoal', 'dashGoal', 'tangleGoal', 'zipGoal'] as const;
const castPasses = ['mittsRelease', 'pipPass', 'sunnyPass', 'doodlePass', 'boulderPass', 'patchRelease', 'crankPass', 'dashPass', 'tanglePass', 'zipPass'] as const;
const saveMoves: Record<SaveMove, LineId> = { dive: 'diveSave', tip: 'tipSave', smother: 'scoopSave', block: 'blockSave' };
const variants = new Map<LineId, LineId[]>();
for (const id of Object.keys(lines) as LineId[]) {
  const base = id.replace(/Alt\d+$/, '') as LineId;
  const pool = variants.get(base) ?? [];
  pool.push(id);
  variants.set(base, pool);
}
const boothSpacing = 23 * 60;
const repeatSpacing = 67 * 60;

export class Commentary {
  private readonly variantOffset: number;
  private lastTick = -10000;
  private lastPriority = 0;
  private busyUntil = 0;
  private lastShot = -10000;
  private lastPass = -10000;
  private lastSteal = -10000;
  private shotCalls = 0;
  private saveCalls = 0;
  private passCalls = 0;
  private starts = 0;
  private lastGoal = 0;
  private nextBooth = 0;
  private lastBoothTopic = '';
  private readonly played = new Map<LineId, number>();
  private pending?: { answer: LineId; at: number; exchange: Exchange };

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

  private call(options: LineId | readonly LineId[], tick: number, priority: number, gap: number, event?: MatchEvent): CommentaryCall | undefined {
    if (tick === this.lastTick && priority <= this.lastPriority) return;
    if (priority < 4 && (this.pending || tick < this.busyUntil || tick - this.lastTick < gap)) return;
    const choices = typeof options === 'string' ? [options] : options;
    for (const base of choices) {
      const id = this.pick(base, tick);
      if (id) return this.deliver(id, tick, priority, event);
    }
    if (priority >= 4) return this.deliver(choices[0], tick, priority, event);
  }

  private deliver(id: LineId, tick: number, priority: number, event?: MatchEvent, reply?: Exchange): CommentaryCall {
    const line = lines[id];
    const duration = Math.ceil(cues[id][1] * 60);
    this.lastTick = tick;
    this.lastPriority = priority;
    this.busyUntil = tick + duration + 13;
    this.played.set(id, tick);
    let exchange = reply;
    this.pending = undefined;
    if ('answer' in line) {
      exchange = { opening: id, reply: false, player: event?.player, opponent: event?.opponent ?? event?.flight?.receiver };
      this.pending = { answer: line.answer as LineId, at: this.busyUntil, exchange };
      this.lastBoothTopic = id.replace(/Alt\d+$/, '');
      this.nextBooth = tick + boothSpacing;
    }
    return { id, text: line.text, host: line.voice === 'bf_emma' ? 'EMMA' : 'MICK', priority,
      ticks: exchange && !exchange.reply ? duration + 13 : Math.max(150, duration + 20), exchange };
  }

  advanceBooth(tick: number, live: boolean) {
    const reply = this.pending;
    if (!reply) return;
    if (!live || tick > reply.at + 30) { this.pending = undefined; return; }
    if (tick >= reply.at) return this.deliver(reply.answer, tick, 2, undefined, { ...reply.exchange, reply: true });
  }

  react(event: MatchEvent, scores: Score, moment?: ShowMoment, featured?: ShowMoment, recap?: CastRecap): CommentaryCall | undefined {
    const { tick, kind, player } = event;
    if (kind === 'footstep' || kind === 'board' || kind === 'bounce') return;
    const boulder = player === CAPTAINS[0], zip = player === CAPTAINS[1];
    const drought = tick - this.lastGoal >= 50 * 60;
    const canChat = (topic: LineId) => tick >= this.nextBooth && (topic !== this.lastBoothTopic || tick >= this.nextBooth + 30 * 60);
    const say = (options: LineId | readonly LineId[], priority: number, gap: number) => this.call(options, tick, priority, gap, event);
    if (recap?.tick === tick && (recap.player === CAPTAINS[0] || recap.player === CAPTAINS[1]) && (kind === 'kickoff' || kind === 'distribution')) {
      const gold = recap.player === CAPTAINS[0];
      const intro = gold ? 'roundhouseRecap' : 'scruffRecap';
      const called = say(recap.saves ? [gold ? 'boulderPatchRecap' : 'zipMittsRecap', intro] : intro, 3, 170);
      if (called) return called;
    }
    switch (kind) {
      case 'halftime':
        return say(featured?.kind === 'save' ? 'saveReplay' : featured?.kind === 'post' ? 'postReplay' :
          featured?.kind === 'steal' ? 'stealReplay' : featured ? 'halfFeature' : 'halfTime', 6, 0);
      case 'fulltime':
        this.lastGoal = tick;
        return say(event.team === undefined ? 'finalDraw' : 'finalWin', 6, 0);
      case 'match-start': {
        const rotation = ['openingBooth', 'opening', 'next', 'openingDuel'] as const;
        const opening = this.starts++ === 0 ? 'boothHello' : rotation[(this.starts - 2) % rotation.length];
        return say(opening, 4, 0);
      }
      case 'half-start': return say('secondHalf', 4, 0);
      case 'goal': {
        this.lastGoal = tick;
        if (event.detail === 'Own goal') return say('ownGoal', 5, 0);
        if (moment?.late && moment.equal) return say(['lateEqualizer', 'equalizer'], 5, 0);
        if (moment?.turnaround) return say(['leadChange', moment.late ? 'lateGoal' : 'goalThree'], 5, 0);
        if (moment?.late) return say(['lateGoal', boulder ? 'boulderGoal' : zip ? 'zipGoal' : 'goalThree'], 5, 0);
        if (scores[0] === scores[1]) return say('equalizer', 5, 0);
        if (moment?.chase) return say(['backInIt', 'goalThree'], 5, 0);
        const goalId = event.goalId ?? 0;
        const accent = moment?.payback && (boulder || zip) ? boulder ? 'boulderPayback' : 'zipPayback' :
          player === undefined || goalId % 4 === 0 ? undefined : castGoals[player];
        const general = goals[goalId % goals.length];
        return say(accent ? [accent, general] : general, 5, 0);
      }
      case 'post': {
        if (moment?.joke && (boulder || zip)) return say([boulder ? 'boulderPost' : 'zipPost', 'postSecond'], 3, 240);
        return say(canChat('postBooth') ? ['postBooth', drought ? 'woodworkBreak' : 'post', 'postSecond'] : [drought ? 'woodworkBreak' : 'post', 'postSecond'], 3, 270);
      }
      case 'save': {
        const keeper = player === 0 ? 'mittsSave' : player === 5 ? 'patchSave' : 'saveOne';
        const choices: LineId[] = [];
        if (moment?.callback && (player === 0 || player === 5)) choices.push(player === 0 ? 'mittsAgain' : 'patchAgain');
        if (moment?.joke === 'stretch') choices.push(moment.opponent === CAPTAINS[0] ? 'boulderStretch' : 'zipHeadsUp');
        if (moment?.joke === 'wave') choices.push('zipWave');
        if (moment?.joke === 'shrug') choices.push('boulderShrug');
        if (canChat('saveBooth') && event.save && this.saveCalls % 3 === 1) choices.push('saveBooth');
        const specific = event.save ? saveMoves[event.save.move] : keeper;
        const variety = [specific, keeper, event.save?.held ? 'heldSave' : 'saveTwo', drought ? 'saveBreak' : 'saveOne'] as const;
        choices.push(variety[this.saveCalls % variety.length], specific, keeper, 'saveOne');
        const called = say(choices, 3, 300);
        if (called) this.saveCalls++;
        return called;
      }
      case 'shot': {
        if (tick - this.lastShot < 18 * 60) return;
        const plain = this.shotCalls % 2 === 0 ? 'shotOne' : 'shotTwo';
        const long = event.flight?.style === 'long-shot';
        const called = say([...(long && canChat('longShotBooth') ? ['longShotBooth' as const] : []), long ? 'longShot' : boulder ? 'boulderShot' : zip ? 'zipShot' : plain, plain], 2, 420);
        if (called) { this.lastShot = tick; this.shotCalls++; }
        return called;
      }
      case 'interception':
      case 'tackle': {
        if (!moment && tick - this.lastSteal < 22 * 60) return;
        const plain = kind === 'interception' ? 'intercept' : 'tackle';
        const named = boulder ? 'boulderSteals' : zip ? 'zipSteals' : moment?.opponent === CAPTAINS[0] ? 'boulderFooled' : moment?.opponent === CAPTAINS[1] ? 'zipFooled' : plain;
        const called = moment ? say([moment.callback ? 'tradeSteals' : named, plain], 3, 420) :
          say(canChat('stealBooth') && event.opponent !== undefined ? ['stealBooth', plain] : plain, 2, 570);
        if (called) this.lastSteal = tick;
        return called;
      }
      case 'pass':
      case 'distribution': {
        const style = event.flight?.style;
        const aerial = style === 'switch' || style === 'loft';
        if (!aerial && tick - this.lastPass < 14 * 60) return;
        const named = player === undefined ? undefined : castPasses[player];
        const choices: LineId[] = [];
        if (aerial) {
          const topic = style === 'switch' ? 'switchBooth' : 'loftBooth';
          if (canChat(topic)) choices.push(topic);
          choices.push(style === 'switch' ? 'switchPass' : 'loftPass');
        }
        if (named && this.passCalls % 3 !== 2) choices.push(named);
        choices.push(kind === 'distribution' ? 'distribution' : style === 'drive' ? 'drivePass' : drought && this.passCalls % 2 === 0 ? 'quietBuild' : 'pass');
        const called = say(choices, 1, aerial ? 425 : 570);
        if (called) { this.passCalls++; this.lastPass = tick; }
        return called;
      }
      case 'recovery': this.pending = undefined; return;
      default: return;
    }
  }

  countdown(tick: number, scores: Score = [0, 3]) {
    if (tick % MATCH_TICKS !== MATCH_TICKS - 60 * 60) return;
    const gap = Math.abs(scores[0] - scores[1]);
    return this.call(gap === 0 ? 'lastMinuteLevel' : gap === 1 ? 'oneGoalLeft' : 'lastMinute', tick, 4, 0);
  }
}
