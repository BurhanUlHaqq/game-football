import { clamp, FULLTIME_BREAK, GOAL_BREAK, HALFTIME_BREAK } from './football';
import type { MatchEvent, Score, Team } from './football';
import { HEROES } from './heroes';

export type ArenaCue = {
  kind: 'kickoff' | 'save' | 'post' | 'goal' | 'halftime' | 'fulltime';
  tick: number; until: number; priority: number;
  title: string; detail?: string; team?: Team; x?: number; score?: Score;
};

export class ArenaShow {
  private cue?: ArenaCue;

  get(tick: number) {
    const cue = this.cue;
    return cue && tick >= cue.tick && tick < cue.until ? cue : undefined;
  }

  react(event: MatchEvent) {
    const { kind, tick, team, player, point } = event;
    const name = player === undefined ? undefined : HEROES[player]?.name;
    let cue: ArenaCue | undefined;
    switch (kind) {
      case 'match-start':
      case 'half-start':
        cue = { kind: 'kickoff', tick, until: tick + 153, priority: 1, title: 'KICKOFF', detail: kind === 'half-start' ? 'SECOND HALF' : 'HERE WE GO!' };
        break;
      case 'post':
        cue = { kind, tick, until: tick + 95, priority: 2, title: 'OFF THE POST', detail: 'SO CLOSE!', x: point?.x };
        break;
      case 'save':
        cue = { kind, tick, until: tick + 132, priority: 3, team, title: event.save?.move === 'tip' ? 'FINGERTIP SAVE'
          : event.save?.move === 'dive' ? 'DIVING SAVE' : 'WHAT A SAVE!', detail: name, x: point?.x };
        break;
      case 'goal': {
        const ownGoal = event.detail === 'Own goal';
        cue = { kind, tick, until: tick + GOAL_BREAK, priority: 4, team, title: ownGoal ? 'OWN GOAL' : 'GOAL!',
          detail: ownGoal ? undefined : name, x: point?.x };
        break;
      }
      case 'halftime':
        cue = { kind, tick, until: tick + HALFTIME_BREAK, priority: 5, title: 'HALFTIME', score: event.summary?.scores };
        break;
      case 'fulltime':
        cue = { kind, tick, until: tick + FULLTIME_BREAK, priority: 6, team, title: team === undefined ? 'MATCH DRAWN' : 'FULL TIME', score: event.summary?.scores };
        break;
      case 'recovery':
        this.cue = undefined;
        return;
      default: return;
    }
    const current = this.get(tick);
    if (current && current.priority >= cue.priority) return;
    this.cue = cue;
    return cue;
  }
}

export function fanReaction(cue: ArenaCue | undefined, tick: number, team: Team, x: number) {
  if (!cue) return 0;
  const age = (tick - cue.tick) / 60;
  if (cue.kind === 'post') return -Math.sin(Math.PI * clamp(age / 0.79, 0, 1)) * 0.47;
  if ((cue.kind === 'goal' || cue.kind === 'save') && cue.team !== undefined && cue.team !== team) {
    return -Math.sin(Math.PI * clamp(age / 0.96, 0, 1)) * (cue.kind === 'goal' ? 0.66 : 0.36);
  }
  const delay = Math.abs(x - (cue.x ?? -20)) * (cue.kind === 'kickoff' ? 0.030 : 0.013);
  const time = age - delay;
  if (time <= 0) return 0;
  if (cue.kind === 'kickoff' || cue.kind === 'save' || cue.kind === 'halftime') {
    const wave = Math.sin(Math.PI * clamp(time / (cue.kind === 'kickoff' ? 0.88 : 1.24), 0, 1));
    return wave * (cue.kind === 'save' ? 0.82 : 0.52);
  }
  const progress = clamp(time / ((cue.until - cue.tick) / 60), 0, 1);
  const support = cue.team !== undefined && cue.team !== team ? 0.36 : 1;
  return Math.min(1, time * 5) * (0.46 + 0.54 * Math.max(0, Math.sin(time * 7.8))) * (1 - progress * 0.65) * support;
}
