export const STEP = 1 / 60;
export const HALF_TICKS = 10 * 60 * 60;
export const MATCH_TICKS = HALF_TICKS * 2;
export const HALFTIME_BREAK = 325;
export const FULLTIME_BREAK = 10 * 60;
export const GOAL_BREAK = 4 * 60;
export const KICKOFF_TICKS = 37;
export const FIELD = { x: 22, z: 13, goal: 3.35, bar: 2.86, net: 2.65, board: 0.86, post: 0.105 };
export const BALL = 0.27;
export const BALL_DAMPING = 0.11;
export const GRAVITY = 9.81;
export const BODY = 0.47;
export const KICK_CONTACT = 0.16;
export type Team = 0 | 1;
export type Score = [number, number];
export type Half = 1 | 2;
export const matchNumberAt = (tick: number) => Math.floor(tick / MATCH_TICKS) + 1;
export const halfAt = (tick: number): Half => tick % MATCH_TICKS < HALF_TICKS ? 1 : 2;
export const other = (team: Team): Team => team === 0 ? 1 : 0;
export const dir = (team: Team) => team === 0 ? 1 : -1;
export const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
export const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export const length = (x: number, z: number) => Math.hypot(x, z);
export type Point = { x: number; z: number };
export type Point3 = Point & { y: number };
export type KickStyle = 'ground' | 'drive' | 'loft' | 'switch' | 'long-shot';
export type KickFlight = { style: KickStyle; to: Point; range: number; seconds: number; receiver?: number };
export const distance = (a: Point, b: Point) => length(a.x - b.x, a.z - b.z);
export type Role = 'keeper' | 'back' | 'wing' | 'captain';
export type SaveMove = 'smother' | 'dive' | 'tip' | 'block';
export type Action = 'pass' | 'shot' | 'receive' | 'intercept' | 'tackle' | 'stumble' | SaveMove | 'catch' | 'distribute' | 'celebrate' | 'concede';
export type MatchState = 'setup' | 'live' | 'goal' | 'kickoff' | 'retrieval' | 'fault' | 'halftime' | 'fulltime';
export type EventKind = 'pass' | 'shot' | 'interception' | 'tackle' | 'save' | 'distribution' | 'goal' | 'post' | 'board' | 'bounce' | 'footstep' | 'recovery' | 'kickoff' | 'halftime' | 'fulltime' | 'match-start' | 'half-start';
export type MatchSummary = { number: number; scores: Score; shots: Score; saves: Score; standout?: number };
export type MatchEvent = { kind: EventKind; tick: number; team?: Team; player?: number; opponent?: number; point?: Point3; goalId?: number; side?: number; detail?: string; summary?: MatchSummary; flight?: KickFlight; save?: { move: SaveMove; held: boolean } };
export type Stats = { passes: number; shots: number; saves: number; interceptions: number; tackles: number; distributions: number; possessionChanges: number; rebounds: number; recoveries: number; faults: number; maxTemporaryTicks: number; peaks: Record<MatchState, number>; goals: [number, number]; byTeam: [{ passes: number; shots: number; saves: number }, { passes: number; shots: number; saves: number }] };

export const ROSTER: ReadonlyArray<{ role: Role; number: number; x: number; z: number }> = [
  { role: 'keeper', number: 1, x: -20.1, z: 0 },
  { role: 'back', number: 4, x: -12.2, z: 0 },
  { role: 'wing', number: 7, x: -7.3, z: -8.0 },
  { role: 'wing', number: 11, x: -7.3, z: 8.0 },
  { role: 'captain', number: 10, x: -3.8, z: 0 },
];

export class Random {
  state: number;

  constructor(seed: string, state?: number) {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
    this.state = state ?? (hash >>> 0);
  }

  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let n = this.state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number) { return mix(min, max, this.next()); }
}

export function crossedGoal(before: Point3, after: Point3): Team | null {
  for (const team of [0, 1] as const) {
    const attack = dir(team);
    const from = before.x * attack;
    const to = after.x * attack;
    const plane = FIELD.x + BALL;
    if (from >= plane || to < plane) continue;
    const entry = clamp((FIELD.x - BALL - from) / (to - from), 0, 1);
    const exit = (plane - from) / (to - from);
    const fits = (t: number) => {
      const y = mix(before.y, after.y, t);
      const z = mix(before.z, after.z, t);
      return Math.abs(z) + BALL < FIELD.goal - FIELD.post && y + BALL < FIELD.bar - FIELD.post && y >= BALL - 0.06;
    };
    if (fits(entry) && fits(exit)) return team;
  }
  return null;
}

export function formatTime(ticks: number): string {
  const seconds = Math.floor(ticks / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  const mmss = `${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
  const hours = Math.floor(seconds / 3600);
  return hours ? `${pad(hours)}:${mmss}` : mmss;
}
