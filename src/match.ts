import RAPIER from '@dimforge/rapier3d-compat';
import { angleDiff, BALL, BALL_DAMPING, BODY, clamp, pitchCrossing, damp, dir, distance, FIELD, FULLTIME_BREAK, GOAL_BREAK, GRAVITY, halfAt, HALFTIME_BREAK, HALF_TICKS, KICK_CONTACT, KICKOFF_TICKS, length, matchNumberAt, MATCH_TICKS, mix, other, Random, ROSTER, STEP } from './football';
import type { Action, Crossing, RestartKind, EventKind, KickFlight, KickStyle, MatchEvent, MatchState, MatchSummary, Point, Point3, Role, Score, Stats, Team } from './football';
import { bootContact, descendingTarget, leadReceiver, loftVelocity, LONG_PASS_RANGE, RECEIVE_HEIGHT, spinAcceleration, strikeSpin, type FootStrike } from './kicks';
import { ballAtPlane, gloveContact, keeperGlove, keeperMotion, parryVelocity, planSave, readGoalThreat, type KeeperAttempt } from './goalkeeping';
import { HEROES } from './heroes';
import { matchIdentity } from './settings';
import type { Checkpoint, Settings } from './settings';

const group = (member: number, mask: number) => (member << 16) | mask;
const playerCollision = group(4, 1);
const emptyCollision = group(4, 0);
const ballHome = { x: 0, y: BALL + 0.01, z: 0 };
const zero = { x: 0, y: 0, z: 0 };
const restartTicks = { setup: 15, kickoff: KICKOFF_TICKS, retrieval: 60, fault: 86, goal: GOAL_BREAK, halftime: HALFTIME_BREAK, fulltime: FULLTIME_BREAK };
const statePeaks = (): Record<MatchState, number> => ({ setup: 0, live: 0, goal: 0, 'throw-in': 0, kickoff: 0, retrieval: 0, fault: 0, halftime: 0, fulltime: 0 });
const EVENT_CAP = 96;
const feetDistance = 1.22;
type KickPlan = { to: Point; speed: number; lift: number; kind: 'pass' | 'shot' | 'distribution'; target?: number; style?: KickStyle; seconds?: number; arrivalHeight?: number };
type Kick = KickPlan & { player: Player; at: number; deadline: number; strike: FootStrike; side: number; dropAt?: number; dropped?: boolean };
type Pose = { kind: Action; age: number; duration: number; side: number; strike?: FootStrike };
type Intent = 'shape' | 'press' | 'receive' | 'carry' | 'cover' | 'keeper' | 'restart';
export type BallReturn = {
  reason: Crossing['kind']; kind: RestartKind; side: number; team: Team; thrower: number; receiver: number;
  from: Point3; pickup: Point; spot: Point; stage: 'collect' | 'carry' | 'windup'; since: number; settle: number; vy: number; route: Point[];
};
export type NetImpact = { side: number; point: Point3; tick: number; surface: 'back' | 'side' | 'roof'; strength: number };
type BallAction = { from: number; team: Team; tick: number; kind: Kick['kind'] | 'throw'; target?: number; flight?: KickFlight };

export type Player = {
  id: number; team: Team; role: Role; number: number; home: Point;
  x: number; z: number; oldX: number; oldZ: number; vx: number; vz: number; yaw: number; oldYaw: number; stride: number;
  target: Point; intent: Intent; pose?: Pose; cooldown: number; collider: RAPIER.Collider; body: RAPIER.RigidBody;
  keeperReady?: boolean; keeperAttempt?: KeeperAttempt;
};

export function initializePhysics() { return RAPIER.init(); }

export class Match {
  readonly world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  readonly contact = new RAPIER.EventQueue(true);
  readonly random: Random;
  readonly players: Player[] = [];
  readonly ball: RAPIER.RigidBody;
  readonly ballCollider: RAPIER.Collider;
  readonly events: MatchEvent[] = [];
  readonly history: MatchEvent[] = [];
  readonly stats: Stats = { outs: 0, throws: 0, passes: 0, shots: 0, saves: 0, interceptions: 0, tackles: 0, distributions: 0, possessionChanges: 0, rebounds: 0, recoveries: 0, faults: 0, maxTemporaryTicks: 0, peaks: statePeaks(), goals: [0, 0], byTeam: [{ passes: 0, shots: 0, saves: 0 }, { passes: 0, shots: 0, saves: 0 }] };
  readonly bumpers = new Map<number, 'board' | 'post' | 'bounce'>();
  private readonly netSurfaces = new Map<number, NetImpact['surface']>();
  netImpact?: NetImpact;
  ballReturn?: BallReturn;
  readonly scores: Score;
  readonly seriesGoals: Score;
  readonly wins: Score;
  readonly firstKickoff: Team;
  draws: number;
  tick: number;
  goalId: number;
  state: MatchState = 'setup';
  stateTick: number;
  restartTeam: Team;
  owner: Player | undefined;
  lastTouch: number | undefined;
  previousBall: Point3 = { ...ballHome };
  currentBall: Point3 = { ...ballHome };
  previousRotation = { x: 0, y: 0, z: 0, w: 1 };
  currentRotation = { ...this.previousRotation };
  ballVisible = true;
  physicsMs = 0;
  measure = false;
  persistentFault = false;
  private recentFaults: number[] = [];
  private readonly press: [number, number] = [-1, -1];
  private lastAction?: BallAction;
  private deflectedShot?: { player: number; team: Team; tick: number };
  private pending?: Kick;
  private excluded?: { player: Player; until: number };
  private keeperUntil = 0;
  private gather?: { point: Point3; tick: number };
  private ownerSince = 0;
  private lastTeam?: Team;
  private nextChoice = 0;
  private restartSpot: Point = { x: 0, z: 0 };
  private stationary = 0;
  private edgeTicks = 0;
  private nextTactics = 0;
  private nextBounce = 0;
  private readonly returnRun: [number, number] = [-1, 0];
  private recoverySerial = 0;
  private pitchSign: number;
  private periodKickoff: 'match-start' | 'half-start' | undefined;
  private shots: Score;
  private saves: Score;
  private scorers: number[];

  constructor(seed: string, checkpoint?: Checkpoint) {
    this.random = new Random(seed, checkpoint?.random);
    this.tick = checkpoint?.ticks ?? 0;
    this.stateTick = this.tick;
    this.goalId = checkpoint?.goalId ?? 0;
    this.scores = checkpoint ? [...checkpoint.scores] : [0, 0];
    this.seriesGoals = checkpoint ? [...checkpoint.seriesGoals] : [0, 0];
    this.wins = checkpoint ? [...checkpoint.wins] : [0, 0];
    this.draws = checkpoint?.draws ?? 0;
    this.shots = checkpoint ? [...checkpoint.shots] : [0, 0];
    this.saves = checkpoint ? [...checkpoint.saves] : [0, 0];
    this.scorers = checkpoint ? [...checkpoint.scorers] : Array<number>(10).fill(0);
    this.firstKickoff = checkpoint?.firstKickoff ?? (this.random.next() < 0.5 ? 0 : 1);
    this.restartTeam = checkpoint?.restartTeam ?? this.firstKickoff;
    this.pitchSign = this.periodDirection();
    this.periodKickoff = this.tick === 0 ? 'match-start' : undefined;
    this.world.timestep = STEP;
    this.world.integrationParameters.maxCcdSubsteps = 3;
    this.buildPitch();
    this.ball = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, ballHome.y, 0).setCcdEnabled(true).setCanSleep(false).setLinearDamping(BALL_DAMPING).setAngularDamping(0.85));
    this.ballCollider = this.world.createCollider(RAPIER.ColliderDesc.ball(BALL).setMass(0.43).setFriction(0.46).setRestitution(0.64).setCollisionGroups(group(1, 2 | 4)).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), this.ball);
    for (const team of [0, 1] as const) {
      for (const player of ROSTER) {
        const home = { x: player.x * this.attack(team), z: player.z * this.attack(team) };
        const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(home.x, 0, home.z));
        const collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(0.49, BODY).setTranslation(0, 0.98, 0).setCollisionGroups(playerCollision).setRestitution(0.28), body);
        const yaw = this.attack(team) * Math.PI / 2;
        this.players.push({ ...player, ...home, team, id: this.players.length, home, oldX: home.x, oldZ: home.z, yaw, oldYaw: yaw, vx: 0, vz: 0, stride: 0, target: { ...home }, intent: 'restart', cooldown: 0, body, collider });
      }
    }
    this.arrangeRestart(true);
  }

  get heldKeeper() { return this.owner?.role === 'keeper' && !this.pending?.dropped ? this.owner : undefined; }
  get number() { return matchNumberAt(this.tick); }
  get half() { return halfAt(this.tick); }
  get matchTicks() { return this.tick % MATCH_TICKS; }
  get flight() {
    const action = this.lastAction;
    if (!this.owner && action?.flight && this.tick - action.tick <= action.flight.seconds * 60 + 9) return action.flight;
    return undefined;
  }
  attack(team: Team) { return dir(team) * this.pitchSign; }

  private periodDirection() { return (this.number + this.half) % 2 === 0 ? 1 : -1; }

  private summary(number: number): MatchSummary {
    let standout: number | undefined;
    let highest = 0;
    for (const player of this.players) {
      const impact = player.role === 'keeper' ? this.saves[player.team] : this.scorers[player.id] * 3;
      if (impact > highest) { highest = impact; standout = player.id; }
    }
    return { number, scores: [...this.scores], shots: [...this.shots], saves: [...this.saves], standout };
  }

  private startPeriod(fulltime: boolean) {
    const report = this.summary(fulltime ? this.number - 1 : this.number);
    const winner = report.scores[0] === report.scores[1] ? undefined : report.scores[0] > report.scores[1] ? 0 : 1;
    const opens = this.number % 2 === 1 ? this.firstKickoff : other(this.firstKickoff);
    this.restartTeam = fulltime ? opens : other(opens);
    this.restartSpot = { x: 0, z: 0 };
    this.periodKickoff = fulltime ? 'match-start' : 'half-start';
    this.lastTeam = undefined;
    this.retireBall();
    if (fulltime) {
      if (winner === undefined) this.draws++;
      else this.wins[winner]++;
      this.scores.fill(0);
      this.shots.fill(0);
      this.saves.fill(0);
      this.scorers.fill(0);
    }
    if (this.pitchSign !== this.periodDirection()) {
      this.pitchSign *= -1;
      for (const player of this.players) {
        player.home.x *= -1;
        player.home.z *= -1;
      }
    }
    this.change(fulltime ? 'fulltime' : 'halftime');
    this.arrangeRestart();
    for (const player of this.players) {
      player.pose = undefined;
      if (fulltime && winner !== undefined && player.team !== winner) this.pose(player, 'concede', 1.56);
    }
    this.emit(fulltime ? 'fulltime' : 'halftime', { team: winner, summary: report });
  }

  private buildPitch() {
    const block = (tag: 'post' | 'board' | 'bounce', x: number, y: number, z: number, hx: number, hy: number, hz: number, restitution: number) => {
      const c = this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setCollisionGroups(group(2, 1)).setFriction(tag === 'bounce' ? 0.60 : 0.2).setRestitution(restitution).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min));
      this.bumpers.set(c.handle, tag);
      return c;
    };
    const { x, z, goal, bar, board, net, post } = FIELD;
    block('bounce', 0, -0.25, 0, x + net + 3, 0.25, z + FIELD.runoff + 1, 0.47);
    for (const sign of [-1, 1]) {
      block('board', 0, board / 2, sign * (z + FIELD.runoff + 0.11), x + FIELD.net + 1, board / 2, 0.11, 0.65);
      const half = (z + FIELD.runoff - goal) / 2;
      for (const lane of [-1, 1]) {
        block('board', sign * (x + net + 1.1), board / 2, lane * (goal + half), 0.11, board / 2, half, 0.65);
        block('post', sign * x, bar / 2, lane * goal, post, bar / 2, post, 0.64);
        const panel = block('board', sign * (x + net / 2), FIELD.backHeight / 2, lane * goal, net / 2, FIELD.backHeight / 2, .045, .16);
        this.netSurfaces.set(panel.handle, 'side');
        // Triangular infill meets the sloping roof above each rectangular side panel.
        const verts = new Float32Array([sign*x,FIELD.backHeight,lane*goal,sign*x,bar,lane*goal,sign*(x+net),FIELD.backHeight,lane*goal]);
        const wing = this.world.createCollider(RAPIER.ColliderDesc.trimesh(verts, new Uint32Array([0,1,2,2,1,0])).setCollisionGroups(group(2,1)).setRestitution(.12));
        this.bumpers.set(wing.handle, 'board');
        this.netSurfaces.set(wing.handle, 'side');
      }
      block('post', sign * x, bar, 0, post, post, goal + post, 0.64);
      const back = block('board', sign * (x + net), FIELD.backHeight / 2, 0, .055, FIELD.backHeight / 2, goal, .12);
      this.netSurfaces.set(back.handle, 'back');
      const roof = block('board', sign * (x + net / 2), (bar + FIELD.backHeight) / 2, 0, Math.hypot(net, bar - FIELD.backHeight) / 2, .036, goal, .12);
      const tilt = -sign * Math.atan2(bar - FIELD.backHeight, net) / 2;
      roof.setRotation({ x: 0, y: 0, z: Math.sin(tilt), w: Math.cos(tilt) });
      this.netSurfaces.set(roof.handle, 'roof');
    }
  }

  checkpoint(settings: Settings): Checkpoint {
    const { seed, names, quality, audio, hud, fps, master, music, effects, commentary } = settings;
    return { version: 2, identity: matchIdentity(seed, names), seed, teams: [...names], random: this.random.state, ticks: this.tick, scores: [...this.scores], goalId: this.goalId,
      firstKickoff: this.firstKickoff, wins: [...this.wins], draws: this.draws, seriesGoals: [...this.seriesGoals], shots: [...this.shots], saves: [...this.saves], scorers: [...this.scorers],
      restartTeam: this.state === 'live' ? this.owner?.team ?? this.lastTeam ?? this.restartTeam : this.restartTeam,
      config: { quality, audio, hud, fps, master, music, effects, commentary } };
  }

  resources() { return { players: this.players.length, bodies: this.world.bodies.len(), colliders: this.world.colliders.len(), history: this.history.length, eventLimit: EVENT_CAP, faultWindow: this.recentFaults.length }; }

  dispose() { this.contact.free(); this.world.free(); }

  private emit(kind: EventKind, data: Omit<MatchEvent, 'kind' | 'tick'> = {}) {
    const event: MatchEvent = { kind, tick: this.tick, ...data };
    this.events.push(event);
    if (kind === 'footstep' || kind === 'bounce') return;
    if (this.history.length === EVENT_CAP) this.history.shift();
    this.history.push(event);
  }

  private pose(player: Player, kind: Action, duration: number, side = 1) { player.pose = { kind, age: 0, duration, side }; }

  private change(next: MatchState) {
    const elapsed = this.tick - this.stateTick;
    this.stats.peaks[this.state] = Math.max(elapsed, this.stats.peaks[this.state]);
    if (this.state !== 'live') this.stats.maxTemporaryTicks = Math.max(elapsed, this.stats.maxTemporaryTicks);
    this.state = next;
    this.stateTick = this.tick;
  }

  private placeBall(spot: Point) {
    const point = { x: spot.x, y: ballHome.y, z: spot.z };
    this.ballReturn = undefined;
    this.netImpact = undefined;
    this.ballCollider.setCollisionGroups(group(1, 2 | 4));
    this.ball.setLinearDamping(BALL_DAMPING);
    this.ball.setEnabled(true);
    this.ball.setTranslation(point, true);
    this.ball.setLinvel(zero, true);
    this.ball.setAngvel(zero, true);
    this.ball.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.previousRotation = this.currentRotation = { x: 0, y: 0, z: 0, w: 1 };
    this.previousBall = this.currentBall = point;
    this.ballVisible = true;
  }

  private retireBall() {
    this.ball.setEnabled(false);
    this.ballVisible = false;
    this.ballReturn = undefined;
    this.netImpact = undefined;
    this.clearPossession();
  }

  private clearPossession(finishJump = false) {
    this.gather = undefined;
    this.deflectedShot = undefined;
    for (const player of this.players) {
      const save = player.keeperAttempt;
      const age = save ? (this.tick - save.start) * STEP : 0;
      const landing = save && finishJump && age > save.load && age < save.load + save.air;
      if (save && !landing) {
        player.keeperAttempt = undefined;
        player.body.setNextKinematicRotation({ x: 0, y: 0, z: 0, w: 1 });
      }
      if (player.pose?.strike) player.pose = undefined;
    }
    this.ballCollider.setCollisionGroups(group(1, 2 | 4));
    this.owner = undefined;
    this.pending = undefined;
    this.lastAction = undefined;
    this.lastTouch = undefined;
    this.stationary = this.edgeTicks = 0;
    this.press[0] = this.press[1] = -1;
    this.returnRun[0] = -1;
    this.restoreCollision();
  }

  private arrangeRestart(initial = false) {
    for (const player of this.players) {
      const isTaker = player.role === 'captain' && player.team === this.restartTeam;
      player.target.x = isTaker ? this.restartSpot.x - this.attack(player.team) * 0.94 : player.home.x;
      player.target.z = isTaker ? this.restartSpot.z : player.home.z;
      player.intent = 'restart';
      player.keeperReady = false;
      if (initial) {
        player.x = player.oldX = player.target.x;
        player.z = player.oldZ = player.target.z;
        player.body.setTranslation({ x: player.x, y: 0, z: player.z }, false);
      }
    }
  }

  private restoreCollision() {
    if (!this.excluded) return;
    this.excluded.player.collider.setCollisionGroups(playerCollision);
    this.excluded = undefined;
  }

  private assign(player: Player) {
    if (this.pending) this.pending.player.pose = undefined;
    this.deflectedShot = undefined;
    this.gather = undefined;
    if (this.lastTeam !== undefined && this.lastTeam !== player.team) {
      this.stats.possessionChanges++;
      this.returnRun[0] = -1;
    }
    this.lastTeam = player.team;
    this.owner = player;
    this.lastAction = undefined;
    this.ownerSince = this.tick;
    this.lastTouch = player.id;
    this.nextChoice = this.tick + Math.round(this.random.range(10, 26));
    this.pending = undefined;
  }

  private restart(reason: string, fault = false) {
    const spot = this.currentBall;
    const chosen = this.lastTouch !== undefined ? other(this.players[this.lastTouch].team) : (this.recoverySerial++ % 2) as Team;
    this.restartTeam = chosen;
    this.restartSpot = fault ? { x: 0, z: 0 } : { x: clamp(Number.isFinite(spot.x) ? spot.x : 0, -9, 9), z: clamp(Number.isFinite(spot.z) ? spot.z : 0, -5.5, 5.5) };
    this.stats.recoveries++;
    if (fault) {
      this.stats.faults++;
      this.recentFaults = this.recentFaults.filter(t => this.tick - t < 3600).slice(-7);
      this.recentFaults.push(this.tick);
      this.persistentFault ||= this.recentFaults.length >= 3;
      this.previousBall = this.currentBall = { ...ballHome };
      this.previousRotation = this.currentRotation = { x: 0, y: 0, z: 0, w: 1 };
      for (const player of this.players) {
        if (Number.isFinite(player.x + player.z + player.vx + player.vz + player.yaw)) continue;
        player.x = player.oldX = player.home.x;
        player.z = player.oldZ = player.home.z;
        player.vx = player.vz = 0;
        player.yaw = player.oldYaw = this.attack(player.team) * Math.PI / 2;
        player.body.setTranslation({ ...player.home, y: 0 }, false);
      }
    }
    this.retireBall();
    this.arrangeRestart();
    this.change(fault ? 'fault' : 'retrieval');
    this.emit('recovery', { team: chosen, detail: reason });
  }

  private goal(team: Team) {
    if (this.state !== 'live') return;
    const credit = this.deflectedShot;
    const touch = credit?.team === team && this.tick - credit.tick < 120 ? credit.player : this.lastTouch;
    this.scores[team]++;
    this.seriesGoals[team]++;
    this.stats.goals[team]++;
    this.restartTeam = other(team);
    this.restartSpot = { x: 0, z: 0 };
    const own = touch !== undefined && this.players[touch].team !== team;
    if (touch !== undefined && !own) this.scorers[touch]++;
    this.emit('goal', { team, player: touch, point: this.currentBall, side: this.attack(team), goalId: ++this.goalId, detail: own ? 'Own goal' : undefined });
    this.clearPossession(true);
    this.netImpact = undefined;
    this.ballCollider.setCollisionGroups(group(1, 2));
    this.change('goal');
    this.arrangeRestart();
    for (const player of this.players) {
      if (!player.keeperAttempt) this.pose(player, player.team === team ? 'celebrate' : 'concede', 1.12, player.id % 2 ? 1 : -1);
    }
  }

  step() {
    this.events.length = 0;
    this.tick++;
    const periodTick = this.matchTicks;
    if (periodTick === 0 || periodTick === HALF_TICKS) this.startPeriod(periodTick === 0);
    if (this.excluded && this.excluded.until <= this.tick) this.restoreCollision();
    for (const player of this.players) {
      if (!player.pose) continue;
      player.pose.age += STEP;
      if (player.pose.age >= player.pose.duration) player.pose = undefined;
    }
    if (!Number.isFinite(this.currentBall.x + this.currentBall.y + this.currentBall.z) || this.players.some(p => !Number.isFinite(p.x + p.z + p.vx + p.vz + p.yaw))) this.restart('Invalid coordinates', true);
    if (this.state !== 'live' && this.state !== 'throw-in') this.advanceRestart();
    if (this.state === 'live') {
      if (this.tick >= this.nextTactics) {
        this.nextTactics = this.tick + 7;
        this.tactics();
      }
      this.playBall();
    }
    if (this.ballReturn) this.routeThrower(this.ballReturn);
    this.movePlayers();
    if (this.state === 'throw-in') { this.advanceThrow(); return; }
    if (this.state === 'live' && this.pending && this.tick >= this.pending.at) this.release(this.pending);
    if (this.state !== 'live' && this.state !== 'goal') return;
    this.previousBall = this.currentBall;
    this.previousRotation = this.currentRotation;
    const incoming = this.ball.linvel();
    if (this.state === 'live' && !this.owner && this.currentBall.y > BALL + .045) {
      const lift = spinAcceleration(incoming, this.ball.angvel());
      const impulse = this.ball.mass() * STEP;
      this.ball.applyImpulse({ x: lift.x * impulse, y: lift.y * impulse, z: lift.z * impulse }, true);
    }
    const started = this.measure ? performance.now() : 0;
    this.world.step(this.contact);
    if (this.measure) this.physicsMs = mix(this.physicsMs, performance.now() - started, 0.08);
    this.currentBall = this.ball.translation();
    this.currentRotation = this.ball.rotation();
    if (!Number.isFinite(this.currentBall.x + this.currentBall.y + this.currentBall.z)) { this.restart('Invalid ball body', true); return; }
    const bodyHit = this.readContacts(this.ball.linvel());
    if (this.state === 'goal') return;
    if (!this.owner) this.resolveKeeperContact(incoming, bodyHit);
    const velocity = this.ball.linvel();
    const exit = pitchCrossing(this.previousBall, this.currentBall);
    if (exit) {
      if (exit.kind === 'goal') this.goal(this.attack(0) === exit.side ? 0 : 1);
      else this.startThrow(exit, velocity);
      return;
    }
    this.monitorBall(velocity);
  }

  private startThrow(exit: Crossing, velocity: Point3) {
    const { side, point } = exit;
    const last = this.lastTouch === undefined ? this.lastAction?.team ?? this.restartTeam : this.players[this.lastTouch].team;
    const team = other(last);
    const endLine = exit.kind !== 'touchline';
    const keeper = endLine && this.attack(team) === -side;
    const kind: RestartKind = !endLine ? 'Throw-in' : keeper ? 'Keeper throw' : 'Corner throw';
    const from = { ...this.currentBall };
    const flank = Math.sign(point.z || velocity.z || 1);
    const behindNet = endLine && Math.abs(point.z) < FIELD.goal + BALL;
    const pickup = {
      x: endLine ? side * (FIELD.x + (behindNet ? FIELD.net + .76 : 1.38)) : clamp(point.x + velocity.x * .17, -FIELD.x + .25, FIELD.x - .25),
      z: endLine ? clamp(point.z + velocity.z * .19, -FIELD.z + .25, FIELD.z - .25) : side * (FIELD.z + 1.28),
    };
    if (endLine && !behindNet && Math.abs(pickup.z) < FIELD.goal + .61) pickup.z = flank * (FIELD.goal + .61);
    const spot = !endLine ? { x: clamp(point.x, -FIELD.x + 1, FIELD.x - 1), z: side * (FIELD.z + .42) } :
      keeper ? { x: side * (FIELD.x - 2), z: clamp(pickup.z, -5, 5) } : { x: side * (FIELD.x - .45), z: flank * (FIELD.z + .40) };
    const fielders = this.players.filter(p => p.team === team && p.role !== 'keeper');
    const nearest = (a: Player, b: Player) => distance(a, pickup) - distance(b, pickup);
    const taker = keeper ? this.players[team * 5] : fielders.sort(nearest)[0];
    const inside = { x: clamp(spot.x * .65, -FIELD.x + 4, FIELD.x - 4), z: spot.z * .54 };
    const receiver = fielders.filter(p => p !== taker).sort((a, b) => distance(a, inside) - distance(b, inside))[0];
    this.clearPossession(true);
    this.restartTeam = team;
    this.ballCollider.setCollisionGroups(group(1, 0));
    this.ball.setLinvel(zero, true);
    for (const p of this.players) {
      if (!p.keeperAttempt) p.pose = undefined;
      p.intent = 'restart';
      p.keeperReady = false;
      p.target = { x: mix(p.x, p.home.x, .32), z: mix(p.z, p.home.z, .32) };
    }
    receiver.target = inside;
    // Leave the collector a clear approach, particularly when two players chased the same loose ball.
    const vy = clamp(velocity.y, -5, 6);
    const settle = Math.max(.53, (vy + Math.sqrt(vy * vy + 2 * GRAVITY * Math.max(0, from.y - BALL))) / GRAVITY);
    this.ballReturn = { reason: exit.kind, kind, side, team, thrower: taker.id, receiver: receiver.id, from, pickup, spot,
      stage: 'collect', since: this.tick, settle, vy, route: this.throwRoute(taker, pickup, flank) };
    this.change('throw-in');
    this.stats.outs++;
    this.emit('out', { team, player: taker.id, side, point, detail: exit.kind, restart: kind });
  }

  private throwRoute(from: Point, to: Point, flank: number): Point[] {
    const sign = Math.sign(from.x + to.x);
    const front = FIELD.x - .83, back = FIELD.x + FIELD.net + .63;
    const a = sign * from.x, b = sign * to.x;
    if (Math.max(a, b) < front || Math.min(a, b) > back ||
        (from.z * flank > FIELD.goal + .52 && to.z * flank > FIELD.goal + .52)) return [to];
    const z = flank * (FIELD.goal + 1.15);
    const path: Point[] = [];
    if (from.z * flank < FIELD.goal + .52) path.push({ x: sign * (a > FIELD.x + FIELD.net / 2 ? back : Math.min(front, a)), z });
    if (to.z * flank < FIELD.goal + .52) path.push({ x: sign * (b > FIELD.x + FIELD.net / 2 ? back : Math.min(front, b)), z });
    return [...path, to];
  }

  private routeThrower(r: BallReturn) {
    const p = this.players[r.thrower];
    while (r.route.length > 1 && distance(p, r.route[0]) < .50) r.route.shift();
    p.target = r.route[0];
  }

  private advanceThrow() {
    const r = this.ballReturn!;
    const p = this.players[r.thrower];
    const elapsed = (this.tick - r.since) * STEP;
    const place = (point: Point3) => {
      this.previousBall = this.currentBall;
      this.currentBall = point;
      this.ball.setTranslation(point, true);
    };
    if (r.stage === 'collect') {
      const t = Math.min(1, elapsed / r.settle), ease = 1 - (1 - t) ** 2;
      const point = { x: mix(r.from.x, r.pickup.x, ease), z: mix(r.from.z, r.pickup.z, ease),
        y: Math.max(BALL, r.from.y + r.vy * elapsed - GRAVITY * elapsed * elapsed / 2) };
      if (Math.abs(point.x) > FIELD.x && Math.abs(point.x) < FIELD.x + FIELD.net + BALL && Math.abs(point.z) < FIELD.goal) {
        point.y = Math.max(point.y, mix(FIELD.bar, FIELD.backHeight, clamp((Math.abs(point.x) - FIELD.x) / FIELD.net, 0, 1)) + BALL);
      }
      place(point);
      if (t < 1 || point.y > BALL + .1 || distance(p, point) > .64) return;
      r.stage = 'carry';
      r.since = this.tick;
      r.route = this.throwRoute(p, r.spot, Math.sign(r.pickup.z || r.spot.z || 1));
      return;
    }
    const wind = r.stage === 'windup' ? clamp(elapsed / .66, 0, 1) : 0;
    const lift = clamp(elapsed / .29, 0, 1);
    const hand = { x: p.x + Math.sin(p.yaw) * (.79 - wind * .38), y: 1.48 + wind * 1.76, z: p.z + Math.cos(p.yaw) * (.79 - wind * .38) };
    place(r.stage === 'carry' && lift < 1 ? { x: mix(r.pickup.x, hand.x, lift), y: mix(BALL, hand.y, lift), z: mix(r.pickup.z, hand.z, lift) } : hand);
    if (r.stage === 'carry') {
      if (distance(p, r.spot) < .38 && lift === 1) { r.stage = 'windup'; r.since = this.tick; }
      return;
    }
    if (wind < 1) return;
    const receiver = this.players[r.receiver], to = { x: receiver.x, z: receiver.z };
    const range = Math.max(.01, distance(hand, to)), seconds = clamp(.74 + range * .034, .84, 1.48);
    const { lift: up, speed } = loftVelocity(range, hand.y, RECEIVE_HEIGHT, seconds);
    const flight: KickFlight = { style: 'loft', to, receiver: receiver.id, range, seconds };
    this.ballCollider.setCollisionGroups(group(1, 2 | 4));
    this.ball.setLinvel({ x: (to.x - hand.x) * speed / range, y: up, z: (to.z - hand.z) * speed / range }, true);
    this.ball.setAngvel({ x: 2.4, y: .7, z: -1.2 }, true);
    this.exclude(p, 28);
    p.cooldown = this.tick + 30;
    this.pose(p, 'throw', .39);
    this.lastTouch = p.id;
    this.lastTeam = p.team;
    this.lastAction = { team: p.team, from: p.id, kind: 'throw', tick: this.tick, target: receiver.id, flight };
    this.nextTactics = this.tick;
    // Commit the kinematic players' current positions before the first live contact.
    for (const actor of this.players) actor.body.setTranslation({ x: actor.x, y: 0, z: actor.z }, false);
    this.ballReturn = undefined;
    this.change('live');
    this.stats.throws++;
    this.emit('throw', { team: p.team, player: p.id, point: hand, flight, restart: r.kind });
  }

  private advanceRestart() {
    const state = this.state;
    if (state === 'throw-in' || state === 'live' || this.tick - this.stateTick < restartTicks[state]) return;
    if (state === 'kickoff') {
      this.change('live');
      this.nextTactics = this.tick;
      const taker = this.players[this.restartTeam * 5 + 4];
      if (distance(taker, this.currentBall) <= feetDistance) this.assign(taker);
      this.emit('kickoff', { team: this.restartTeam, player: taker.id });
      if (this.periodKickoff) this.emit(this.periodKickoff, { team: this.restartTeam });
      this.periodKickoff = undefined;
      return;
    }
    this.placeBall(this.restartSpot);
    this.arrangeRestart();
    this.change('kickoff');
  }

  private monitorBall(velocity: Point3) {
    const ball = this.currentBall;
    const speed = length(velocity.x, velocity.z);
    const beyondGoal = Math.abs(ball.x) > FIELD.x + BALL && Math.abs(ball.z) < FIELD.goal + BALL && ball.y < FIELD.bar + BALL;
    if (ball.y < -.25 || ball.y > 12 || Math.abs(ball.x) > FIELD.x + FIELD.net + 5 || Math.abs(ball.z) > FIELD.z + 5) {
      this.restart('Ball beyond safety area');
      return;
    }
    const inbound = this.lastAction?.kind === 'throw' && this.tick - this.lastAction.tick < 22;
    if (!inbound && (Math.abs(ball.z) > FIELD.z + BALL || Math.abs(ball.x) > FIELD.x + BALL)) {
      const touchline = Math.abs(ball.z) > FIELD.z + BALL;
      this.startThrow({ kind: touchline ? 'touchline' : Math.abs(ball.z) < FIELD.goal && ball.y > FIELD.bar ? 'over' : 'wide',
        side: Math.sign(touchline ? ball.z : ball.x), point: ball }, velocity);
      return;
    }
    this.stationary = !this.owner && speed < 0.31 ? this.stationary + 1 : 0;
    this.edgeTicks = beyondGoal || (Math.abs(ball.z) > FIELD.z - 0.58 && speed < 1.5) ? this.edgeTicks + 1 : Math.max(0, this.edgeTicks - 2);
    if (this.stationary > 270 || this.edgeTicks > 200) { this.restart(beyondGoal ? 'Ball behind the goal line' : 'Dead ball'); return; }
    if (speed > 25 || Math.abs(velocity.y) > 9) {
      const scale = Math.min(1, 25 / Math.max(0.1, speed));
      this.ball.setLinvel({ x: velocity.x * scale, y: clamp(velocity.y, -9, 9), z: velocity.z * scale }, true);
    }
    if (!this.owner && ball.y <= BALL + 0.035 && speed > 0.04) {
      const roll = Math.max(0, speed - 0.85 * STEP) / speed;
      this.ball.setLinvel({ x: velocity.x * roll, y: velocity.y, z: velocity.z * roll }, true);
    }
  }

  private readContacts(velocity: Point3) {
    let bodyHit: Player | undefined;
    this.contact.drainCollisionEvents((a, b, started) => {
      if (!started) return;
      if (a !== this.ballCollider.handle && b !== this.ballCollider.handle) return;
      const handle = a === this.ballCollider.handle ? b : a;
      if (this.state === 'goal') {
        const surface = this.netSurfaces.get(handle);
        if (surface && !this.netImpact) {
          this.netImpact = { surface, side: Math.sign(this.currentBall.x), point: { ...this.currentBall }, tick: this.tick,
            strength: clamp(distance(this.previousBall, this.currentBall) / STEP / 12, .44, 1) };
          this.ball.setLinearDamping(4.1);
          this.ball.setLinvel({ x: velocity.x * .29, y: velocity.y * .47, z: velocity.z * .4 }, true);
        }
        return;
      }
      const obstacle = this.bumpers.get(handle);
      if (obstacle === 'bounce') {
        if (this.tick >= this.nextBounce && velocity.y > 0.9) {
          this.nextBounce = this.tick + 10;
          this.emit('bounce');
        }
      } else if (obstacle && length(velocity.x, velocity.z) > 1.4) {
        this.stats.rebounds++;
        const shot = this.lastAction?.kind === 'shot' && this.tick - this.lastAction.tick < 150 ? this.lastAction : undefined;
        this.emit(obstacle, obstacle === 'post' ? { player: shot?.from, team: shot?.team, point: this.currentBall } : {});
      } else if (!obstacle) {
        const player = this.players.find(p => p.collider.handle === handle);
        if (player) {
          this.lastTouch = player.id;
          if (player.role === 'keeper') bodyHit = player;
        }
      }
    });
    return bodyHit;
  }

  private tactics() {
    const b = this.currentBall;
    const v = this.ball.linvel();
    const flight = this.flight;
    const activePass = !this.owner && this.lastAction?.target !== undefined && this.tick - this.lastAction.tick < 138 ? this.lastAction : undefined;
    const dropping = flight?.style === 'loft' || flight?.style === 'switch' ? descendingTarget(b, v) : undefined;
    for (const team of [0, 1] as const) {
      const attack = this.attack(team);
      const ownStart = team * 5;
      const attacking = this.owner?.team === team || activePass?.team === team || (!this.owner && this.lastAction?.team === team && this.tick - this.lastAction.tick < 95);
      let challenger = -1;
      let cost = Infinity;
      for (let i = ownStart + 1; i < ownStart + 5; i++) {
        const p = this.players[i];
        const effort = distance(p, b) - (this.press[team] === i ? 1.55 : 0) + (p.role === 'back' && b.x * attack > 4 ? 3.5 : 0);
        if (effort < cost) { cost = effort; challenger = i; }
      }
      this.press[team] = attacking ? -1 : challenger;
      for (let i = ownStart; i < ownStart + 5; i++) {
        const p = this.players[i];
        if (p.role === 'keeper') { this.keeperTarget(p, b, v); continue; }
        const isRecipient = activePass?.target === i;
        const assigned = i === this.press[team] || (!this.owner && attacking && !activePass && i === challenger);
        const giveGo = attacking && this.returnRun[0] === i && this.returnRun[1] > this.tick;
        if (p === this.owner) {
          const pressure = this.closestRival(p);
          const bypass = pressure.dist < 3.5 ? Math.sign(p.z - pressure.player.z || p.home.z || (p.id % 2 ? 1 : -1)) : 0;
          p.target.x = clamp(p.x + attack * 7.5, -FIELD.x + 2.5, FIELD.x - 2.5);
          p.target.z = clamp(p.z * 0.61 + bypass * 4.8, -FIELD.z + 2.5, FIELD.z - 2.5);
          p.intent = 'carry';
        } else if (this.owner?.role === 'keeper' && this.owner.team !== team) {
          const keeper = this.owner;
          const outlet = this.players[keeper.team*5 + i%5];
          const upfield = this.attack(keeper.team);
          const line = keeper.x + upfield * (p.role === 'captain' ? 4.8 : p.role === 'back' ? 13 : 8);
          p.target.x = mix(line, outlet.x, .25);
          p.target.z = mix(keeper.z, outlet.z, .75);
          p.intent = 'cover';
        } else if (assigned || isRecipient) {
          const lead = this.owner ? 0.10 : clamp(distance(p, b) / 22, 0, 0.5);
          const meet = isRecipient && dropping ? dropping : { x: b.x + v.x * lead, z: b.z + v.z * lead };
          p.target.x = clamp(meet.x, -FIELD.x + 0.25, FIELD.x - 0.25);
          p.target.z = clamp(meet.z, -FIELD.z + 0.20, FIELD.z - 0.20);
          p.intent = isRecipient ? 'receive' : 'press';
        } else if (this.heldKeeper?.team === team) {
          // One defender shows short while the front three keep their width and offer a punt.
          p.target.x = attack * (p.role === 'back' ? -13.2 : p.role === 'wing' ? -2.5 : 2.3);
          p.target.z = p.role === 'wing' ? p.home.z : p.role === 'back' ? -Math.sign(b.z || attack)*4.5 : p.home.z*.7;
          p.intent = 'receive';
        } else if (attacking) {
          const wing = p.role === 'wing';
          const advance = p.role === 'back' ? -8.8 : wing ? 2.5 : 5.7;
          p.target.x = attack * clamp(b.x * attack + (giveGo ? 7.4 : advance), -FIELD.x + 3, FIELD.x - 3.1);
          p.target.z = wing ? clamp(p.home.z + b.z * 0.15, -10.9, 10.9) : b.z * (giveGo ? 0.64 : -0.25) + (giveGo ? (p.id % 2 ? 3 : -3) : 0);
          p.intent = 'shape';
        } else {
          p.target.x = attack * clamp((p.home.x + b.x * 0.52) * attack - 1.9, -FIELD.x + 3.55, FIELD.x - 6);
          p.target.z = p.home.z * 0.72 + b.z * 0.31;
          p.intent = 'cover';
        }
      }
    }
  }

  private keeperTarget(p: Player, b: Point3, v: Point3) {
    const attack = this.attack(p.team);
    const home = -attack * (FIELD.x - 1.18);
    const depth = (b.x - home) * attack;
    const threat = !this.owner ? readGoalThreat(b, v, attack, this.ball.angvel()) : undefined;
    const inArea = depth > -0.8 && depth < 5.3 && Math.abs(b.z) < 5.4;
    const loose = inArea && !this.owner && b.y < 1.15 && length(v.x, v.z) < 5.5;
    const nearPost = b.z * mix(0.34, 0.56, clamp((11 - depth) / 9, 0, 1));
    p.target.x = loose ? clamp(b.x, -FIELD.x + 0.65, FIELD.x - 0.65) : home + attack * clamp(depth * 0.061, 0, 2.4);
    const travelToKeeper = threat ? (p.target.x - b.x) / v.x : 0;
    const cover = threat && travelToKeeper > 0 ? mix(nearPost, b.z + v.z * travelToKeeper, .68) : nearPost;
    p.target.z = loose ? clamp(b.z, -4.55, 4.55) : clamp(cover, -FIELD.goal + 0.48, FIELD.goal - 0.48);
    p.keeperReady = p !== this.owner && !loose && (!!threat || (depth < 13 && Math.abs(b.z) < 10 && this.owner?.team === other(p.team)));
    if (p === this.owner) { p.target.x = home + attack * 2; p.target.z *= 0.35; }
    p.intent = 'keeper';
  }

  private closestRival(player: Player, at: Point = player) {
    let target = this.players[other(player.team) * 5];
    let dist = Infinity;
    for (let i = target.team * 5; i < target.team * 5 + 5; i++) {
      const rival = this.players[i];
      const d = distance(at, rival);
      if (d < dist) { dist = d; target = rival; }
    }
    return { player: target, dist };
  }

  private chooseKick(player: Player) {
    const attack = this.attack(player.team);
    const toGoal = FIELD.x - player.x * attack;
    const pressure = this.closestRival(player).dist;
    const keeper = this.players[other(player.team) * 5];
    const aim = (keeper.z > 0 ? -1 : 1) * this.random.range(1.65, 2.79);
    const shotLane = this.lane(player, { x: attack * FIELD.x, z: aim }, keeper.id);
    const longShot = toGoal >= 15.8;
    const shooting = longShot ? toGoal <= 23.4 && Math.abs(player.z) < 7.1 && pressure > 1.8 && shotLane > 1.45
      : (toGoal > 1 || Math.abs(player.z) < 2.4) && Math.abs(player.z) < 10.4;
    const shot = shooting ? 3.5 - toGoal * (longShot ? 0.119 : 0.145) - Math.abs(player.z) * 0.101 + Math.min(shotLane, 3) * 0.29 + this.random.range(-0.7, 1) : -5;
    const timeHeld = (this.tick - this.ownerSince) * STEP;
    let pass: KickPlan | undefined;
    let value = -Infinity;
    for (const p of this.players) {
      if (p.team !== player.team || p === player || p.role === 'keeper') continue;
      const d = distance(player, p);
      if (d < 2.4 || d > 30) continue;
      const groundTime = d / clamp(6.5 + d * 0.60, 7, 20.8);
      const direct = leadReceiver(p, d < LONG_PASS_RANGE ? clamp(d / 19, 0.14, 0.67) : groundTime + KICK_CONTACT);
      const room = this.lane(player, direct);
      const switching = d >= 15 && Math.abs(p.z - player.z) >= 11.5 && (p.x - player.x) * attack > -3;
      const liftTime = clamp(d / 17.3, 1.24, 1.53);
      const wantsLoft = d >= LONG_PASS_RANGE && (switching || d > 20 || room < 1.60);
      const airTarget = wantsLoft ? leadReceiver(p, liftTime + KICK_CONTACT) : undefined;
      const edgeRoom = airTarget ? Math.min(this.lane(player, airTarget, -1, 0.08, 0.31), this.lane(player, airTarget, -1, 0.72, 1)) : 0;
      const loft = airTarget && edgeRoom > 1.14 && this.closestRival(p, airTarget).dist > 1.9 && distance(this.currentBall, airTarget) < 32.5;
      const to = loft ? airTarget : direct;
      const space = Math.min(this.closestRival(p, to).dist, 6);
      const progress = (to.x - player.x) * attack;
      const lane = loft ? Math.min(edgeRoom, room + 1.65) : room;
      const giveGo = p.id === this.returnRun[0] && this.returnRun[1] > this.tick && progress > 0;
      const rating = Math.min(progress, 17) * 0.104 + Math.min(lane, 3.8) * 0.33 + space * 0.20 - d * 0.041
        + (giveGo ? 0.75 : 0) + (loft && switching ? 0.46 : 0) + this.random.range(-0.61, 0.61);
      if (rating <= value) continue;
      const style = loft ? (switching ? 'switch' : 'loft') : d >= LONG_PASS_RANGE ? 'drive' : 'ground';
      const range = distance(this.currentBall, to);
      const speed = clamp(6.5 + range * 0.60, 7, 20.8);
      value = rating;
      pass = { to, speed, lift: style === 'drive' ? 0.72 : 0.22, kind: 'pass', target: p.id, style,
        seconds: loft ? liftTime : range / speed, arrivalHeight: loft ? RECEIVE_HEIGHT : undefined };
    }
    const carry = 1.1 + clamp(pressure - 2.25, -1.7, 3) * 0.35 - Math.max(0, timeHeld - 1.4) * 0.83 - (Math.abs(player.z) > 10 ? 0.6 : 0);
    if (shot > carry && shot >= value - 0.14) {
      const yaw = Math.atan2(attack * FIELD.x - player.x, aim - player.z);
      const underPressure = clamp((3.4 - pressure) / 3.4, 0, 1);
      const rushed = underPressure + Math.abs(angleDiff(player.yaw, yaw)) / Math.PI;
      const spread = .64 + toGoal * .055 + rushed * .85;
      const error = (this.random.next() + this.random.next() - 1) * spread;
      const to = { x: attack * (FIELD.x + BALL), z: aim + error };
      const speed = this.random.range(16.6, 22.9) - underPressure * 1.1;
      const range = distance(this.currentBall, to);
      const arrivalHeight = .32 + this.random.next() ** 2.6 * (2.38 + .50*rushed + .018*toGoal);
      const loft = longShot || arrivalHeight > 1.65;
      const seconds = clamp(range / speed, .21, 1.16);
      this.scheduleKick(player, { to, speed, lift: 0, kind: 'shot', style: longShot ? 'long-shot' : loft ? 'loft' : 'drive',
        seconds, arrivalHeight });
    } else if (pass && (value > carry || timeHeld > 3.9)) {
      this.scheduleKick(player, pass);
    } else if (timeHeld > 4.85) {
      this.scheduleKick(player, { to: { x: attack * (FIELD.x - 1), z: this.random.range(-8.5, 8.5) }, speed: 12, lift: 2.5, kind: 'pass' });
    }
    this.nextChoice = this.tick + Math.round(this.random.range(18, 38));
  }

  private lane(from: Player, to: Point, ignore = -1, start = 0.11, end = 0.98) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const size = dx * dx + dz * dz;
    let clearance = 6;
    for (const p of this.players) {
      if (p.team === from.team || p.id === ignore) continue;
      const t = ((p.x - from.x) * dx + (p.z - from.z) * dz) / Math.max(0.01, size);
      if (t > start && t < end) clearance = Math.min(clearance, length(p.x - from.x - dx * t, p.z - from.z - dz * t));
    }
    return clearance;
  }

  private scheduleKick(player: Player, plan: KickPlan) {
    const keeper = player.role === 'keeper';
    const lifted = plan.style === 'loft' || plan.style === 'switch' || plan.style === 'long-shot';
    const technique = keeper && lifted ? 'punt' : lifted ? 'loft' : plan.kind === 'shot' || plan.style === 'drive' ? 'drive' : 'push';
    const yaw = Math.atan2(plan.to.x - player.x, plan.to.z - player.z);
    const ball = this.currentBall;
    const across = (ball.x - player.x) * Math.cos(yaw) - (ball.z - player.z) * Math.sin(yaw);
    const side = Math.abs(across) < .14 ? (player.id % 2 ? -1 : 1) : Math.sign(across);
    const hip = .255 * HEROES[player.id].body;
    const scale = player.role === 'captain' ? 1.05 : 1;
    const turn = Math.abs(angleDiff(player.yaw, yaw));
    const approach = distance(player, this.strikeStance(ball, yaw, side * hip * scale));
    const setup = keeper ? .58 : clamp(.15 + approach / 4.6, technique === 'push' ? .20 : .27, .52);
    const ticks = Math.ceil(Math.max(setup, turn / 8.3 + .10) / STEP);
    const strike: FootStrike = { technique, contact: ticks * STEP, hip, scale, ankle: { x: side*hip, y: .15, z: .1 },
      plant: { x: player.x - side*hip*scale*Math.cos(player.yaw), z: player.z + side*hip*scale*Math.sin(player.yaw) } };
    const at = this.tick + ticks;
    this.pending = { ...plan, player, strike, side, at, deadline: at + 12,
      dropAt: keeper ? at - (lifted ? 25 : 14) : undefined };
    player.pose = { kind: plan.kind === 'distribution' ? 'distribute' : plan.kind, age: 0,
      duration: strike.contact + (technique === 'push' ? .24 : .34), side, strike };
  }

  private strikeStance(ball: Point, yaw: number, offset: number) {
    return { x: ball.x - .72 * Math.sin(yaw) - offset * Math.cos(yaw), z: ball.z - .72 * Math.cos(yaw) + offset * Math.sin(yaw) };
  }

  private release(kick: Kick) {
    const { player, kind } = kick;
    const from = this.ball.translation();
    const boot = bootContact(player, from, kick.strike, kick.side);
    kick.strike.ankle = boot.ankle;
    const yaw = Math.atan2(kick.to.x - player.x, kick.to.z - player.z);
    if (!boot.touching || Math.abs(angleDiff(player.yaw, yaw)) > .57 || this.heldKeeper) {
      if (this.tick < kick.deadline && player.pose?.strike) {
        kick.at++;
        kick.strike.contact += STEP;
        player.pose.duration += STEP;
      } else {
        this.pending = undefined;
        player.pose = undefined;
        this.nextChoice = this.tick + 9;
        if (kick.dropped) this.owner = undefined;
      }
      return;
    }
    this.pending = undefined;
    this.gather = undefined;
    this.deflectedShot = undefined;
    const range = distance(from, kick.to);
    const seconds = kick.seconds && kick.arrivalHeight !== undefined ? Math.max(kick.seconds, range / 22.5) : kick.seconds;
    const velocity = seconds && kick.arrivalHeight !== undefined ? loftVelocity(range, from.y, kick.arrivalHeight, seconds) : kick;
    const direction = { x: (kick.to.x - from.x) / Math.max(.01, range), z: (kick.to.z - from.z) / Math.max(.01, range) };
    const run = player.vx * direction.x + player.vz * direction.z;
    const speed = Math.min(24.8, velocity.speed + (kick.arrivalHeight === undefined ? .16 * run : 0));
    const x = direction.x * speed, z = direction.z * speed;
    const spin = strikeSpin(direction, speed, kick.strike.technique, kick.side);
    // Long passes already have a chosen landing point. Account for the initial backspin lift.
    const lift = velocity.lift - (kick.arrivalHeight !== undefined && seconds ? spinAcceleration({ x, y: velocity.lift, z }, spin).y * seconds * .34 : 0);
    const flight = kick.style && seconds ? { style: kick.style, to: kick.to, seconds, range, receiver: kick.target } : undefined;
    this.restoreCollision();
    player.collider.setCollisionGroups(emptyCollision);
    this.excluded = { player, until: this.tick + 11 };
    player.cooldown = this.tick + 23;
    this.owner = undefined;
    this.lastTouch = player.id;
    if (kind === 'shot') { this.stats.shots++; this.stats.byTeam[player.team].shots++; this.shots[player.team]++; }
    else if (kind === 'pass') { this.stats.passes++; this.stats.byTeam[player.team].passes++; }
    else this.stats.distributions++;
    this.lastAction = { from: player.id, team: player.team, tick: this.tick, kind, target: kick.target, flight };
    if (kind === 'pass' && kick.target !== undefined) { this.returnRun[0] = player.id; this.returnRun[1] = this.tick + 160; }
    const v = this.ball.linvel();
    const mass = this.ball.mass();
    this.ball.applyImpulse({ x: (x - v.x) * mass, y: (lift - v.y) * mass, z: (z - v.z) * mass }, true);
    this.ball.setAngvel(spin, true);
    this.emit(kind, { team: player.team, player: player.id, point: from, flight, ...(kind === 'shot' ? { side: this.attack(player.team) } : {}) });
  }

  private playBall() {
    const b = this.currentBall;
    const v = this.ball.linvel();
    const speed = length(v.x, v.z);
    if (!this.owner) this.findTouch(b, v, speed);
    const p = this.owner;
    if (!p) return;
    if (p.role === 'keeper') {
      if (this.heldKeeper) this.handleKeeperBall(p);
      if (!this.pending && !p.keeperAttempt && this.tick >= this.keeperUntil) {
        const viable = this.players.slice(p.team * 5 + 1, p.team * 5 + 5);
        const pressed = this.closestRival(p).dist < 6 || this.lane(p, viable[0]) < 1.4;
        let target = viable[0];
        let best = -Infinity;
        for (const q of viable) {
          const range = distance(p, q), space = Math.min(6, this.closestRival(q).dist);
          const short = Math.min(4, this.lane(p, q)) + space * .49 - range * .045;
          const long = range >= 12 ? 1.35 + space * .60 + Math.min(22,(q.x-p.x)*this.attack(p.team))*.055 + (pressed ? 1.75 : -.70) : -Infinity;
          const rating = Math.max(short, long) + this.random.range(-.75, .75);
          if (rating > best) { best = rating; target = q; }
        }
        const d = distance(p, target);
        const speed = clamp(7 + d * 0.46, 8, 17);
        const loft = d >= 12 && (pressed || this.closestRival(target).dist > 2);
        const seconds = loft ? clamp(d / 16.5, 1.13, 1.48) : d / speed;
        const to = leadReceiver(target, seconds + KICK_CONTACT);
        this.scheduleKick(p, { to, speed, lift: loft ? 2.1 : .28, kind: 'distribution', target: target.id, style: loft ? 'loft' : 'ground',
          seconds, arrivalHeight: loft ? RECEIVE_HEIGHT : undefined });
      }
    } else {
      const d = distance(p, b);
      if (d > 1.62 || b.y > 0.84) { this.owner = undefined; this.pending = undefined; return; }
      this.challenge(p, b);
      if (this.owner !== p) return;
      if (!this.pending && this.tick >= this.nextChoice) this.chooseKick(p);
      if (!this.pending) this.dribble(p, b, v, d);
    }
  }

  private handleKeeperBall(p: Player) {
    const kick = this.pending;
    const high = kick?.strike.technique === 'punt';
    const countdown = kick?.dropAt === undefined ? 1 : (kick.dropAt - this.tick) * STEP;
    const lower = kick && !high ? clamp(1 - countdown / .25, 0, 1) : 0;
    const offset = kick ? kick.side * .19 * clamp(1 - countdown / .25, 0, 1) : 0;
    const forward = .68 + lower * .06;
    const leap = p.keeperAttempt ? keeperMotion(p.keeperAttempt, (this.tick-p.keeperAttempt.start)*STEP).y : 0;
    const point = { x: p.x + Math.sin(p.yaw)*forward + Math.cos(p.yaw)*offset,
      y: 1.40 + leap - lower * .88, z: p.z + Math.cos(p.yaw)*forward - Math.sin(p.yaw)*offset };
    if (this.gather) {
      const t = clamp((this.tick-this.gather.tick)*STEP/.25, 0, 1);
      const ease = t*t*(3-2*t);
      for (const axis of ['x','y','z'] as const) point[axis] = mix(this.gather.point[axis],point[axis],ease);
      if (t >= 1) this.gather = undefined;
    }
    this.ball.setTranslation(point, true);
    this.ball.setLinvel(zero, true);
    if (kick && countdown <= 0) {
      kick.dropped = true;
      this.ballCollider.setCollisionGroups(group(1, 2 | 4));
      this.exclude(p, Math.max(30, kick.deadline - this.tick + 3));
      this.ball.setLinvel({ x: p.vx*.45, y: -.10, z: p.vz*.45 }, true);
    }
  }

  private dribble(p: Player, b: Point3, v: Point3, d: number) {
    if (d > 1.45 || b.y > BALL + 0.27) return;
    const yaw = p.yaw;
    const offset = .88;
    const leadX = p.x + Math.sin(yaw) * offset;
    const leadZ = p.z + Math.cos(yaw) * offset;
    const dx = (leadX - b.x) * 7.8 + p.vx * 0.92 - v.x;
    const dz = (leadZ - b.z) * 7.8 + p.vz * 0.92 - v.z;
    const factor = Math.min(0.24, 0.62 / Math.max(0.02, length(dx, dz)));
    this.ball.applyImpulse({ x: dx * factor * 0.43, y: 0, z: dz * factor * 0.43 }, true);
  }

  private challenge(p: Player, b: Point3) {
    const rival = this.players[this.press[other(p.team)]];
    if (!rival || rival.cooldown > this.tick || this.tick - this.ownerSince < 15 || distance(rival, b) > 1.13 || b.y > 0.55) return;
    rival.cooldown = this.tick + 40;
    this.pose(rival, 'tackle', 0.46, rival.id % 2 ? 1 : -1);
    const exposed = distance(p, b) > 0.95 || this.pending;
    if (this.random.next() > (exposed ? 0.76 : 0.51)) return;
    this.assign(rival);
    p.cooldown = this.tick + 28;
    this.pose(p, 'stumble', 0.53);
    this.stats.tackles++;
    this.emit('tackle', { team: rival.team, player: rival.id, opponent: p.id, point: b });
  }

  private findTouch(b: Point3, v: Point3, speed: number) {
    for (const team of [0, 1] as const) {
      const p = this.players[team * 5];
      const attack = this.attack(team);
      if (p.keeperAttempt || p.cooldown > this.tick || b.x * attack > -FIELD.x + 12 || Math.abs(b.z) >= 8) continue;
      const spin = this.ball.angvel();
      const threat = readGoalThreat(b, v, attack, spin);
      if (threat) {
        const intercept = ballAtPlane(b, v, p.x + attack * .68, spin);
        const attempt = intercept && planSave(p, intercept, attack, !!p.keeperReady, this.tick);
        if (attempt) {
          p.keeperAttempt = attempt;
          this.pose(p, attempt.move, attempt.duration, -attempt.side * attack);
          p.cooldown = this.tick + Math.ceil(attempt.duration / STEP) + 9;
        }
      } else if (distance(p, b) < .94 && b.y < 1.12 && speed < 6.4) { this.catchBall(p, false); return; }
    }
    if (b.y > 0.84 || (this.lastAction?.kind === 'shot' && speed > 12.8)) return;
    const receiving = this.lastAction?.target !== undefined && this.tick - this.lastAction.tick < 138 ? this.lastAction.target : undefined;
    let touch: Player | undefined;
    let best = Infinity;
    for (const p of this.players) {
      if (p.role === 'keeper' || p.cooldown > this.tick) continue;
      const expected = p.id === receiving;
      if (b.y > (expected ? 0.84 : 0.69)) continue;
      const d = distance(p, b);
      const reach = expected ? feetDistance + 0.10 - Math.max(0, speed - 12) * 0.040 : feetDistance - Math.max(0, speed - 10) * 0.055;
      if (d < reach && d < best) { best = d; touch = p; }
    }
    if (!touch) return;
    const intercepted = this.lastAction && this.lastAction.team !== touch.team && this.tick - this.lastAction.tick < 154;
    if (intercepted) { this.stats.interceptions++; this.emit('interception', { team: touch.team, player: touch.id, opponent: this.lastAction?.from, point: b }); }
    this.assign(touch);
    this.pose(touch, intercepted ? 'intercept' : 'receive', 0.34, touch.id % 2 ? 1 : -1);
    const carry = touch.id === receiving ? 0.08 : 0.18;
    this.ball.setLinvel({ x: mix(touch.vx, v.x, carry), y: Math.min(v.y, 0.1), z: mix(touch.vz, v.z, carry) }, true);
  }

  private resolveKeeperContact(incoming: Point3, bodyHit?: Player) {
    for (const p of [this.players[0], this.players[5]]) {
      const a = p.keeperAttempt;
      const attack = this.attack(p.team);
      const shot = this.lastAction?.kind === 'shot' && this.lastAction.team !== p.team ? this.lastAction : undefined;
      if (a?.resolved || -incoming.x * attack < 2.2) continue;
      if (!a && (p !== bodyHit || !readGoalThreat(this.previousBall, incoming, attack))) continue;
      const age = a ? (this.tick - a.start) * STEP : 0;
      let first = Infinity;
      let palm = zero;
      let otherHandDistance = Infinity;
      const before = this.previousBall, after = this.currentBall;
      if (a) {
        for (const side of [-1, 1]) {
          const h0 = keeperGlove(a, { x: p.oldX, z: p.oldZ }, Math.max(0,age-STEP), side);
          const h1 = keeperGlove(a, p, age, side);
          const hit = gloveContact(before, after, h0, h1);
          if (hit === undefined || hit >= first) continue;
          first = hit;
          palm = { x: (h1.x-h0.x)/STEP, y: (h1.y-h0.y)/STEP, z: (h1.z-h0.z)/STEP };
          const other = keeperGlove(a, p, age, -side);
          otherHandDistance = Math.hypot(mix(before.x,after.x,hit)-other.x, mix(before.y,after.y,hit)-other.y, mix(before.z,after.z,hit)-other.z);
        }
      }
      const glove = a && Number.isFinite(first);
      if (!glove && (p !== bodyHit || !shot && !readGoalThreat(before, incoming, attack))) continue;
      const t = glove ? first : 1;
      const point = { x: mix(before.x,after.x,t), y: mix(before.y,after.y,t), z: mix(before.z,after.z,t) };
      if (pitchCrossing(before, point)) continue;
      const held = !!glove && a.move !== 'tip' && otherHandDistance < .64 &&
        Math.hypot(incoming.x, incoming.y, incoming.z) < (a.move === 'smother' ? 18.5 : 16.5);
      if (a) a.resolved = true;
      else {
        this.pose(p, 'block', .42, -attack * Math.sign(point.z - p.z || 1));
        p.cooldown = this.tick + 32;
      }
      this.lastTouch = p.id;
      if (shot) this.deflectedShot = { player: shot.from, team: shot.team, tick: this.tick };
      if (held) {
        this.currentBall = point;
        this.ball.setTranslation(point, true);
        this.catchBall(p, true);
      } else if (glove) {
        const rebound = parryVelocity(incoming, a, palm);
        const remaining = (1-t)*STEP;
        this.currentBall = { x: point.x+rebound.x*remaining, y: Math.max(BALL,point.y+rebound.y*remaining), z: point.z+rebound.z*remaining };
        this.ball.setTranslation(this.currentBall, true);
        this.ball.setLinvel(rebound, true);
        this.exclude(p, 7);
      }
      const stillOnTarget = !held && readGoalThreat(this.currentBall, this.ball.linvel(), attack, this.ball.angvel());
      if (!stillOnTarget) {
        this.stats.saves++; this.stats.byTeam[p.team].saves++; this.saves[p.team]++;
        this.emit('save', { team: p.team, player: p.id, opponent: shot?.from, point, save: { move: glove ? a.move : 'block', held } });
      }
      this.lastAction = undefined;
      return;
    }
  }

  private exclude(player: Player, ticks: number) {
    this.restoreCollision();
    player.collider.setCollisionGroups(emptyCollision);
    this.excluded = { player, until: this.tick + ticks };
  }

  private catchBall(p: Player, fromSave: boolean) {
    this.assign(p);
    p.keeperReady = false;
    this.keeperUntil = this.tick + Math.round(this.random.range(49, 76));
    this.gather = { point: { ...this.currentBall }, tick: this.tick };
    this.ballCollider.setCollisionGroups(group(1, 2));
    this.ball.setLinvel(zero, true);
    this.ball.setAngvel(zero, true);
    if (!fromSave) this.pose(p, 'catch', 0.54);
    this.exclude(p, 95);
  }

  private movePlayers() {
    const active = this.state === 'live';
    for (const p of this.players) {
      p.oldX = p.x; p.oldZ = p.z; p.oldYaw = p.yaw;
      if (p.keeperAttempt) {
        const save = p.keeperAttempt;
        const age = (this.tick-save.start)*STEP;
        const pose = keeperMotion(save, age), previous = keeperMotion(save, age-STEP);
        p.z = clamp(p.z + pose.z - previous.z, -FIELD.z+BODY, FIELD.z-BODY);
        p.vx = 0; p.vz = (p.z - p.oldZ) / STEP;
        p.yaw += clamp(angleDiff(p.yaw, save.attack*Math.PI/2), -9*STEP, 9*STEP);
        const tilt = pose.lean * save.attack * .5;
        const position = { x: p.x, y: pose.y, z: p.z };
        const rotation = { x: Math.sin(tilt), y: 0, z: 0, w: Math.cos(tilt) };
        if (this.state === 'throw-in') {
          // The restart moves its own ball and does not step Rapier. Finish the keeper's landing on the same clock.
          p.body.setTranslation(position, true);
          p.body.setRotation(rotation, true);
        }
        p.body.setNextKinematicTranslation(position);
        p.body.setNextKinematicRotation(rotation);
        if (age >= save.duration) p.keeperAttempt = undefined;
        continue;
      }
      const kick = this.pending?.player === p ? this.pending : undefined;
      const yaw = kick ? Math.atan2(kick.to.x - p.x, kick.to.z - p.z) : p.yaw;
      const stance = kick && (p.role !== 'keeper' || kick.dropped) ?
        this.strikeStance(this.currentBall, yaw, kick.side * kick.strike.hip * kick.strike.scale) : undefined;
      let dx = p.target.x - p.x;
      let dz = p.target.z - p.z;
      const d = length(dx, dz);
      const returning = this.ballReturn?.thrower === p.id;
      const slow = !returning && (p.pose?.kind === 'stumble' || p.pose?.kind === 'dive' || p.pose?.kind === 'smother' || p.pose?.kind === 'tip');
      const limit = returning ? 9.2 : slow ? 1.7 : !active ? (this.state === 'goal' ? 4.5 : this.state === 'halftime' ? 9.3 : 7.6) : p.intent === 'press' || p.intent === 'receive' ? 6.15 : p.intent === 'carry' ? 4.7 : p.role === 'keeper' ? 5.25 : 5.0;
      const speed = Math.min(limit, d * 3.0) / Math.max(0.01, d);
      dx *= speed;
      dz *= speed;
      for (const q of this.players) {
        if (q === p) continue;
        const x = p.oldX - q.x;
        const z = p.oldZ - q.z;
        const separation = length(x, z);
        const carryingKeeper = q === this.owner && q.role === 'keeper';
        const clearance = carryingKeeper ? (q.team === p.team ? 2.05 : 3.15) : 1.55;
        if (separation > clearance) continue;
        const repulsion = (clearance - separation) * (carryingKeeper ? 5.2 : 3.1) / Math.max(.06, separation);
        dx += x * repulsion + (separation < 0.08 ? (p.id < q.id ? -1 : 1) * 2.4 : 0);
        dz += z * repulsion;
      }
      if (kick) {
        const ball = this.ball.linvel();
        dx = stance ? (stance.x - p.x)*11 + ball.x*.88 : 0;
        dz = stance ? (stance.z - p.z)*11 + ball.z*.88 : 0;
      }
      const limitScale = Math.min(1, (kick ? 6.4 : limit) / Math.max(0.01, length(dx, dz)));
      const smoothing = damp(kick ? 18 : 8.4, STEP);
      p.vx = mix(p.vx, dx * limitScale, smoothing);
      p.vz = mix(p.vz, dz * limitScale, smoothing);
      const speedNow = length(p.vx, p.vz);
      const end = returning ? FIELD.x + FIELD.net + 1.25 : Math.max(FIELD.x - BODY, Math.abs(p.x) - .13);
      const side = returning ? FIELD.z + FIELD.runoff - .19 : Math.max(FIELD.z - BODY, Math.abs(p.z) - .13);
      p.x = clamp(p.x + p.vx * STEP, -end, end);
      p.z = clamp(p.z + p.vz * STEP, -side, side);
      const orient = this.state === 'goal' || this.state === 'fulltime' ? { x: p.x + this.attack(p.team) * 0.4, z: p.z + 2 } : this.currentBall;
      const lookAtBall = (p.role === 'keeper' && this.state !== 'halftime') || (speedNow < 0.8 && p !== this.owner);
      const receiver = returning && this.ballReturn?.stage === 'windup' ? this.players[this.ballReturn.receiver] : undefined;
      const desired = receiver ? Math.atan2(receiver.x - p.x, receiver.z - p.z) : kick ? Math.atan2(kick.to.x - p.x, kick.to.z - p.z) : lookAtBall ? Math.atan2(orient.x - p.x, orient.z - p.z) : Math.atan2(p.vx, p.vz);
      p.yaw += clamp(angleDiff(p.yaw, desired), -11 * STEP, 11 * STEP) * 0.76;
      if (Math.abs(p.yaw) > Math.PI * 3) p.yaw -= Math.sign(p.yaw) * Math.PI * 2;
      if (kick) {
        kick.strike.ankle = bootContact(p, this.currentBall, kick.strike, kick.side).ankle;
        // Set the supporting boot on the last approach step, then keep its turf position through impact.
        if (kick.at - this.tick >= 7) {
          const hip = kick.side * kick.strike.hip * kick.strike.scale;
          kick.strike.plant = { x: p.x - hip*Math.cos(p.yaw), z: p.z + hip*Math.sin(p.yaw) };
        }
      }
      p.body.setNextKinematicTranslation({ x: p.x, y: 0, z: p.z });
      const before = Math.floor(p.stride / Math.PI);
      p.stride = (p.stride + speedNow * STEP * 3.92) % (2 * Math.PI);
      if (active && speedNow > 2.3 && before !== Math.floor(p.stride / Math.PI) && (p === this.owner || p.id === this.press[p.team])) this.emit('footstep', { team: p.team, player: p.id });
    }
  }
}
