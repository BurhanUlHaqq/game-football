import { formatTime, FULLTIME_BREAK, GOAL_BREAK, halfAt, MATCH_TICKS, other, ROSTER } from './football';
import type { MatchEvent, Point3, Score, Team } from './football';
import { HEROES, HERO_SPOTLIGHT_ORDER } from './heroes';

export const CAST = HEROES.map(hero => hero.name);
export const CAPTAINS = [4, 9] as const;
export const isCaptain = (id: number | undefined) => id === CAPTAINS[0] || id === CAPTAINS[1];

type Gag = 'stretch' | 'shrug' | 'wave' | 'double-take' | 'cup-ear' | 'look-around' | 'palms-up';
export type GoalMove = 'double-hop' | 'victory-twirl' | 'fist-pump' | 'two-hand-wave';
type Gesture = Gag | GoalMove | 'greet' | 'expect' | 'wink' | 'glove-pat' | 'glove-twirl' | 'beret-tip';
type GagGroup = 'save' | 'post' | 'steal';
const gagSpacing: Record<GagGroup, number> = { save: 44 * 60, post: 52 * 60, steal: 90 * 60 };
export const MIN_SETUP_TICKS = 21;
export type PlayerGesture = { kind: Gesture; tick: number; duration: number };
export type Celebration = { kind: 'goal' | 'fulltime'; tick: number; until: number; team?: Team; lead?: number };
export type CastRecap = { tick: number; until: number; player: number; keeper?: number; saves?: number; activity?: number };
export type ShowMoment = {
  kind: 'goal' | 'save' | 'post' | 'steal';
  tick: number; player?: number; opponent?: number; team?: Team; point?: Point3;
  label: string; name: string; story: string; rank: number;
  joke?: Gag;
  callback?: boolean; payback?: boolean; late?: boolean; equal?: boolean; turnaround?: boolean; chase?: boolean;
  beat?: 'setup' | 'rematch' | 'payoff';
};

export class MatchShow {
  constructor(private readonly production = false) {}

  readonly gestures: Array<PlayerGesture | undefined> = Array(10);
  highlight?: ShowMoment;
  moment?: ShowMoment;
  recap?: CastRecap;
  introUntil = 0;
  private readonly savedAt: number[] = Array(10).fill(-10000);
  private readonly shotAt: number[] = Array(10).fill(-10000);
  private readonly deniedBy: number[] = Array(10).fill(-1);
  private readonly trailed: [boolean, boolean] = [false, false];
  private lastGag = -10000;
  private readonly lastByGag: Record<GagGroup, number> = { save: -10000, post: -10000, steal: -10000 };
  private readonly variants: Record<GagGroup, number> = { save: 0, post: 0, steal: 0 };
  private readonly attemptsDenied = [0, 0];
  private readonly contributions = HEROES.map(() => 0);
  private celebration?: Celebration;
  private firstHalfFeature?: ShowMoment['kind'];
  private nextRecap = 58 * 60;
  private recapCount = 0;
  private lastSteal?: { tick: number; player: number; opponent: number };
  private lastGoal = 0;

  private act(player: number | undefined, kind: Gesture, tick: number, duration: number) {
    if (player !== undefined) this.gestures[player] = { kind, tick, duration };
  }

  private feature(moment: ShowMoment) {
    this.moment = moment;
    if (!this.highlight || this.highlightRank(moment) > this.highlightRank(this.highlight)) this.highlight = moment;
    return moment;
  }

  private highlightRank(moment: ShowMoment) {
    const notable = moment.kind !== 'goal' && moment.rank >= 75;
    const repeat = halfAt(moment.tick) === 2 && this.firstHalfFeature === moment.kind && moment.rank < 95;
    return moment.rank + (notable ? 15 : 0) - (repeat ? 12 : 0);
  }

  private gag(kind: GagGroup, tick: number) {
    if (tick - this.lastGag < 240 || tick - this.lastByGag[kind] < gagSpacing[kind]) return undefined;
    this.lastGag = tick;
    this.lastByGag[kind] = tick;
    return this.variants[kind]++;
  }

  getGesture(player: number, tick: number) {
    const celebration = this.getCelebration(tick);
    if (celebration) return this.celebrationGesture(celebration, player, tick);
    const gesture = this.gestures[player];
    return gesture && tick >= gesture.tick && tick < gesture.tick + gesture.duration ? gesture : undefined;
  }

  getCelebration(tick: number) {
    const active = this.celebration;
    return active && tick >= active.tick && tick < active.until ? active : undefined;
  }

  private celebrationGesture(celebration: Celebration, player: number, tick: number): PlayerGesture | undefined {
    const team = Math.floor(player / ROSTER.length);
    const finale = celebration.kind === 'fulltime';
    const featured = player === celebration.lead;
    const closingWave = finale && tick >= celebration.until - 160;
    if (celebration.team !== undefined && team !== celebration.team && !closingWave) return undefined;
    const begins = (closingWave ? celebration.until - 160 : celebration.tick) + (featured ? 4 : 7 + player % ROSTER.length * 2);
    if (tick < begins) return undefined;
    const available = (finale && !closingWave ? celebration.until - 160 : celebration.until) - begins;
    const beat = Math.ceil(available / Math.max(1, Math.round(available / 75)));
    const phase = Math.floor((tick - begins) / beat);
    const start = begins + phase * beat;
    const wave = closingWave || celebration.team === undefined || phase % 3 === 1;
    const kind = wave ? 'two-hand-wave' : team === 0 ? (featured ? 'double-hop' : 'fist-pump') : (featured ? 'victory-twirl' : 'two-hand-wave');
    return { kind, tick: start, duration: Math.min(beat, begins + available - start) };
  }

  react(event: MatchEvent, scores: Score): ShowMoment | undefined {
    const { kind, player, opponent, team, tick, point } = event;
    const name = player === undefined ? undefined : CAST[player];
    const otherName = opponent === undefined ? undefined : CAST[opponent];
    const time = tick % MATCH_TICKS;
    const drought = tick - this.lastGoal >= 60 * 42;
    if (player !== undefined && HEROES[player]?.events.includes(kind) && event.detail !== 'Own goal') this.contributions[player]++;
    if (kind === 'fulltime') {
      const standout = event.summary?.standout;
      const lead = team === undefined ? undefined : standout !== undefined && Math.floor(standout / ROSTER.length) === team ? standout : CAPTAINS[team];
      this.celebration = { kind, tick, until: tick + FULLTIME_BREAK, team, lead };
    }
    if (kind === 'recovery') this.celebration = undefined;
    if (kind === 'match-start') {
      this.introUntil = tick + 355;
      for (const captain of CAPTAINS) this.act(captain, 'greet', tick, 98);
    }
    if ((kind === 'kickoff' || kind === 'distribution') && tick >= this.nextRecap) {
      const featured = HERO_SPOTLIGHT_ORDER[this.recapCount++ % HERO_SPOTLIGHT_ORDER.length];
      const slot = CAPTAINS.findIndex(captain => captain === featured);
      const saves = this.attemptsDenied[slot];
      this.recap = slot >= 0
        ? { tick, until: tick + 230, player: featured, keeper: saves ? (slot === 0 ? 5 : 0) : undefined, saves: saves || undefined }
        : { tick, until: tick + 230, player: featured, activity: this.contributions[featured] || undefined };
      this.nextRecap = tick + 63 * 60;
    }
    if (kind === 'shot' && player !== undefined && isCaptain(player)) {
      this.shotAt[player] = tick;
      if (tick - this.lastGag >= 135 && tick - this.lastByGag.save >= gagSpacing.save) this.act(player, 'expect', tick + 1, 134);
    }
    if (kind === 'goal' && team !== undefined) {
      this.lastGoal = tick;
      const credited = event.detail !== 'Own goal' && name;
      const equal = scores[0] === scores[1];
      const late = time >= MATCH_TICKS - 60 * 100;
      const chase = scores[other(team)] - scores[team] === 1;
      const turnaround = scores[team] - scores[other(team)] === 1 && this.trailed[team];
      if (turnaround) this.trailed[team] = false;
      if (!equal) this.trailed[scores[0] > scores[1] ? 1 : 0] = true;
      const payback = !!credited && player !== undefined && tick - this.savedAt[player] <= 60 * 115;
      const keeper = this.production && payback && player !== undefined ? CAST[this.deniedBy[player]] : undefined;
      this.gestures.fill(undefined);
      this.celebration = { kind, tick, until: tick + GOAL_BREAK, team, lead: credited && player !== undefined ? player : CAPTAINS[team] };
      return this.feature({ kind, tick, player: credited ? player : undefined, team, point,
        label: event.detail === 'Own goal' ? 'OWN GOAL' : equal ? 'EQUALIZER' : turnaround ? 'LEAD CHANGE' : 'GOAL',
        name: credited || 'Ball in the net', story: keeper ? `${name} scores after ${keeper} stopped the earlier shot.`
          : payback ? 'The shot found a way through this time.' : equal ? 'Level again.' : 'The ball found the net.', beat: keeper ? 'payoff' : undefined,
        rank: late && equal ? 104 : turnaround ? 95 : equal ? 91 : payback ? 88 : 79, payback, late, equal, turnaround, chase });
    }
    if (kind === 'save' && player !== undefined && name) {
      const callback = opponent !== undefined && this.deniedBy[opponent] === player && tick - this.savedAt[opponent] <= 60 * 95;
      if (opponent !== undefined) {
        if (opponent === CAPTAINS[0] && player === 5) this.attemptsDenied[0]++;
        if (opponent === CAPTAINS[1] && player === 0) this.attemptsDenied[1]++;
        this.deniedBy[opponent] = player;
        this.savedAt[opponent] = tick;
      }
      const variation = isCaptain(opponent) ? this.gag('save', tick) : undefined;
      const setup = opponent === undefined ? undefined : this.getGesture(opponent, tick);
      const earned = opponent !== undefined && setup?.kind === 'expect' && setup.tick === this.shotAt[opponent] + 1 && tick - setup.tick >= MIN_SETUP_TICKS;
      const joke = variation === undefined ? undefined : earned && variation % 3 !== 2 ? 'stretch' : opponent === CAPTAINS[1] ? 'wave' : 'shrug';
      const beat = this.production && opponent !== undefined ? callback ? 'rematch' : 'setup' : undefined;
      if (joke) this.act(opponent, joke, tick + 4, joke === 'stretch' ? 94 : 79);
      else if (beat && opponent === 3) this.act(opponent, 'beret-tip', tick + 24, 77);
      if (joke || callback || beat) this.act(player, player === 0 ? 'glove-pat' : 'glove-twirl', tick + 20, 72);
      const reaction = joke === 'stretch' ? `${otherName} turns an early celebration into a stretch.`
        : joke === 'wave' ? `${otherName} turns the surprise into a wave.` : `${otherName} gives the keeper a sheepish shrug.`;
      const label = event.save?.move === 'tip' ? 'FINGERTIP SAVE' : event.save?.move === 'dive' ? 'DIVING SAVE'
        : event.save?.move === 'smother' ? 'LOW SAVE' : 'BIG SAVE';
      const result = event.save?.held ? `${name} holds on to it.` : event.save ? `${name} pushes it wide.` : `${name} keeps it out.`;
      return this.feature({ kind, tick, player, opponent, team, point, label, name, beat,
        story: beat === 'rematch' ? `${name} stops ${otherName} again.` : joke ? reaction : callback ? `${name} reads ${otherName} again.` : result,
        rank: callback ? 84 : joke ? 83 : drought ? 81 : 72, callback, joke });
    }
    if (kind === 'post') {
      const variation = player === undefined ? undefined : this.gag('post', tick);
      const joke = variation === undefined ? undefined : variation % 2 === 0 ? 'double-take' : 'cup-ear';
      if (joke) this.act(player, joke, tick + 5, 90);
      const rank = (joke ? 77 : drought ? 75 : 67) + (drought && Math.abs(scores[0] - scores[1]) <= 1 ? 8 : 0);
      return this.feature({ kind, tick, player, team, point, label: 'OFF THE POST', name: name ?? 'Woodwork',
        story: joke === 'cup-ear' ? `${name} listens for an answer from the post.` : joke ? `${name} gives the post a second look.` : 'The ball comes back off the frame.', rank, joke });
    }
    if ((kind === 'tackle' || kind === 'interception') && player !== undefined && opponent !== undefined && name && (isCaptain(player) || isCaptain(opponent))) {
      const callback = this.lastSteal?.player === opponent && this.lastSteal?.opponent === player && tick - this.lastSteal.tick <= 60 * 88;
      this.lastSteal = { tick, player, opponent };
      const variation = this.gag('steal', tick);
      if (variation === undefined) return undefined;
      const joke = variation % 2 === 0 ? 'look-around' : 'palms-up';
      this.act(opponent, joke, tick + 3, 76);
      this.act(player, 'wink', tick + 5, 52);
      return this.feature({ kind: 'steal', tick, player, opponent, team, point,
        label: 'QUICK STEAL', name, story: callback ? `${name} wins the ball right back.` : joke === 'palms-up' ? `${otherName} can only shrug as ${name} takes off.` : `${otherName} looks around as ${name} slips away.`,
        rank: callback ? 77 : drought ? 73 : 57, callback, joke });
    }
    return undefined;
  }

  takeHighlight(fulltime: boolean, tick: number) {
    const highlight = this.highlight;
    this.firstHalfFeature = fulltime ? undefined : highlight?.kind;
    this.highlight = this.moment = undefined;
    this.recap = undefined;
    this.celebration = undefined;
    this.gestures.fill(undefined);
    this.shotAt.fill(-10000);
    if (fulltime) {
      this.trailed.fill(false);
      this.deniedBy.fill(-1);
      this.savedAt.fill(-10000);
      this.lastSteal = undefined;
      this.lastGoal = tick;
      this.attemptsDenied.fill(0);
      this.contributions.fill(0);
      this.nextRecap = tick + 58 * 60;
    }
    return highlight;
  }
}

export const momentTime = (moment: ShowMoment) => formatTime(moment.tick % MATCH_TICKS);
