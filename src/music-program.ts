import library from './stadium-score.json';
import { Random } from './football';
import type { MatchEvent } from './football';

export const scoreLibrary = library;
export type BandTune = typeof library.tunes[number];
export type MusicCue = keyof BandTune['cues'];
export type Phrase = { tune: BandTune; movement: string };
export type CueRequest = { name: MusicCue; priority: number };

// A visit lasts four movements. The return visit uses the other four recordings.
const sets = [[0, 1, 4, 7], [2, 3, 5, 6]] as const;
export class MusicProgram {
  private readonly random: Random;
  private readonly visits = new Map<string, number>();
  private bag: BandTune[] = [];
  private recent: BandTune[] = [];
  private route: number[] = [];
  private tune?: BandTune;
  constructor(seed: string) { this.random = new Random(seed + '/stadium-band'); }

  next(): Phrase {
    if (!this.route.length) {
      if (!this.bag.length) this.bag = [...library.tunes];
      const rested = this.bag.filter(tune => !this.recent.includes(tune));
      this.tune = rested[Math.floor(this.random.next() * rested.length)];
      this.bag.splice(this.bag.indexOf(this.tune), 1);
      this.recent.push(this.tune);
      if (this.recent.length > 4) this.recent.shift();
      const visit = this.visits.get(this.tune.id) ?? Math.floor(this.random.next() * 2);
      this.visits.set(this.tune.id, visit + 1);
      this.route = [...sets[visit % 2]];
      if (this.random.next() < .5) [this.route[1], this.route[2]] = [this.route[2], this.route[1]];
    }
    return { tune: this.tune!, movement: library.movements[this.route.shift()!] };
  }
}

export class BandReactions {
  until = 0;
  private lastPass = -Infinity;
  private team?: number;
  private passes = 0;
  private lastSave = -Infinity;
  private goalCounts = [0,0];

  react(event: MatchEvent, now: number): CueRequest | undefined {
    const kind = event.kind;
    if (kind === 'match-start') this.goalCounts = [0,0];
    if (kind === 'pass') {
      this.passes = event.team === this.team && now - this.lastPass < 5 ? this.passes + 1 : 1;
      this.team = event.team;
      this.lastPass = now;
      if (this.passes >= 3 || event.flight?.style === 'switch') this.until = Math.max(this.until, now + 5);
    } else if (kind === 'shot' || kind === 'post') {
      this.until = Math.max(this.until, now + 5.5);
    } else if (kind === 'save') {
      this.until = Math.max(this.until, now + 3);
      if (now - this.lastSave >= 18) {
        this.lastSave = now;
        return { name:'save', priority:1 };
      }
    } else if (kind === 'goal' || kind === 'halftime' || kind === 'fulltime') {
      this.passes = 0;
      this.until = 0;
      if (kind === 'goal') {
        const team = event.team ?? 0;
        const encore = this.goalCounts[team]++ % 2 === 1;
        const name = team === 0 ? (encore ? 'roundhouseEncore' : 'roundhouse') : (encore ? 'scruffEncore' : 'scruff');
        return { name, priority:3 };
      }
      return { name:kind === 'halftime' ? 'interval' : 'curtain', priority:4 };
    } else if (kind === 'out' || kind === 'interception' || kind === 'tackle' || kind === 'kickoff') {
      this.passes = 0;
    }
  }
}
