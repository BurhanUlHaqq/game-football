import RAPIER from '@dimforge/rapier3d-compat';
import { angleDiff, BALL, BALL_DAMPING, BODY, clamp, crossedGoal, damp, dir, distance, FIELD, FULLTIME_BREAK, GOAL_BREAK, GRAVITY, halfAt, HALFTIME_BREAK, HALF_TICKS, KICK_CONTACT, KICKOFF_TICKS, length, matchNumberAt, MATCH_TICKS, mix, other, Random, ROSTER, STEP } from './football';
import type { Action, EventKind, KickFlight, KickStyle, MatchEvent, MatchState, MatchSummary, Point, Point3, Role, Score, Stats, Team } from './football';
import { descendingTarget, leadReceiver, loftVelocity, LONG_PASS_RANGE, RECEIVE_HEIGHT } from './kicks';
import { diveReach, readGoalThreat, saveMove } from './goalkeeping';
import { matchIdentity } from './settings';
import type { Checkpoint, Settings } from './settings';

const group = (member: number, mask: number) => (member << 16) | mask;
const playerCollision = group(4, 1);
const emptyCollision = group(4, 0);
const ballHome = { x: 0, y: BALL + 0.01, z: 0 };
const zero = { x: 0, y: 0, z: 0 };
const restartTicks = { setup: 15, kickoff: KICKOFF_TICKS, retrieval: 60, fault: 86, goal: GOAL_BREAK, halftime: HALFTIME_BREAK, fulltime: FULLTIME_BREAK };
const statePeaks = (): Record<MatchState, number> => ({ setup: 0, live: 0, goal: 0, kickoff: 0, retrieval: 0, fault: 0, halftime: 0, fulltime: 0 });
const EVENT_CAP = 96;
const feetDistance = 1.22;
type KickPlan = { to: Point; speed: number; lift: number; kind: 'pass' | 'shot' | 'distribution'; target?: number; style?: KickStyle; seconds?: number; arrivalHeight?: number };
type Kick = KickPlan & { player: Player; at: number };
type Pose = { kind: Action; age: number; duration: number; side: number };
type Intent = 'shape' | 'press' | 'receive' | 'carry' | 'cover' | 'keeper' | 'restart';
type BallAction = { from: number; team: Team; tick: number; kind: Kick['kind']; target?: number; flight?: KickFlight };

export type Player = {
  id: number; team: Team; role: Role; number: number; home: Point;
  x: number; z: number; oldX: number; oldZ: number; vx: number; vz: number; yaw: number; oldYaw: number; stride: number;
  target: Point; intent: Intent; pose?: Pose; cooldown: number; collider: RAPIER.Collider; body: RAPIER.RigidBody;
  keeperReady?: boolean;
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
  readonly stats: Stats = { passes: 0, shots: 0, saves: 0, interceptions: 0, tackles: 0, distributions: 0, possessionChanges: 0, rebounds: 0, recoveries: 0, faults: 0, maxTemporaryTicks: 0, peaks: statePeaks(), goals: [0, 0], byTeam: [{ passes: 0, shots: 0, saves: 0 }, { passes: 0, shots: 0, saves: 0 }] };
  readonly bumpers = new Map<number, 'board' | 'post' | 'bounce'>();
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
  private pending?: Kick;
  private excluded?: { player: Player; until: number };
  private keeperUntil = 0;
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
    };
    const { x, z, goal, bar, board, net, post } = FIELD;
    block('bounce', 0, -0.25, 0, x + net + 1, 0.25, z + 2, 0.47);
    for (const sign of [-1, 1]) {
      block('board', 0, board / 2, sign * (z + 0.11), x + 0.2, board / 2, 0.11, 0.65);
      const half = (z - goal) / 2;
      for (const lane of [-1, 1]) {
        block('board', sign * (x + 0.11), board / 2, lane * (goal + half), 0.11, board / 2, half, 0.65);
        block('post', sign * x, bar / 2, lane * goal, post, bar / 2, post, 0.64);
        block('board', sign * (x + net / 2), bar / 2, lane * goal, net / 2, bar / 2, 0.055, 0.24);
      }
      block('post', sign * x, bar, 0, post, post, goal + post, 0.64);
      block('board', sign * (x + net), bar / 2, 0, 0.08, bar / 2, goal, 0.23);
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
    const touch = this.lastTouch;
    this.scores[team]++;
    this.seriesGoals[team]++;
    this.stats.goals[team]++;
    this.restartTeam = other(team);
    this.restartSpot = { x: 0, z: 0 };
    const own = touch !== undefined && this.players[touch].team !== team;
    if (touch !== undefined && !own) this.scorers[touch]++;
    this.emit('goal', { team, player: touch, point: this.currentBall, side: this.attack(team), goalId: ++this.goalId, detail: own ? 'Own goal' : undefined });
    this.retireBall();
    this.change('goal');
    this.arrangeRestart();
    for (const player of this.players) this.pose(player, player.team === team ? 'celebrate' : 'concede', 1.12, player.id % 2 ? 1 : -1);
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
    if (this.state !== 'live') this.advanceRestart();
    if (this.state === 'live') {
      if (this.tick >= this.nextTactics) {
        this.nextTactics = this.tick + 7;
        this.tactics();
      }
      this.playBall();
    }
    this.movePlayers();
    if (this.state !== 'live') return;
    this.previousBall = this.currentBall;
    this.previousRotation = this.currentRotation;
    const started = this.measure ? performance.now() : 0;
    this.world.step(this.contact);
    if (this.measure) this.physicsMs = mix(this.physicsMs, performance.now() - started, 0.08);
    this.currentBall = this.ball.translation();
    this.currentRotation = this.ball.rotation();
    if (!Number.isFinite(this.currentBall.x + this.currentBall.y + this.currentBall.z)) { this.restart('Invalid ball body', true); return; }
    const velocity = this.ball.linvel();
    this.readContacts(velocity);
    const end = crossedGoal(this.previousBall, this.currentBall);
    if (end !== null) { this.goal(this.pitchSign === 1 ? end : other(end)); return; }
    this.monitorBall(velocity);
  }

  private advanceRestart() {
    const state = this.state;
    if (state === 'live' || this.tick - this.stateTick < restartTicks[state]) return;
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
    if (ball.y < -0.25 || ball.y > 8 || Math.abs(ball.z) > FIELD.z + 0.8 || (Math.abs(ball.x) > FIELD.x + 0.7 && !beyondGoal)) {
      this.restart('Ball out of the arena');
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
    this.contact.drainCollisionEvents((a, b, started) => {
      if (!started) return;
      const handle = a === this.ballCollider.handle ? b : a;
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
        if (player) this.lastTouch = player.id;
      }
    });
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
        } else if (assigned || isRecipient) {
          const lead = this.owner ? 0.10 : clamp(distance(p, b) / 22, 0, 0.5);
          const meet = isRecipient && dropping ? dropping : { x: b.x + v.x * lead, z: b.z + v.z * lead };
          p.target.x = clamp(meet.x, -FIELD.x + 0.25, FIELD.x - 0.25);
          p.target.z = clamp(meet.z, -FIELD.z + 0.20, FIELD.z - 0.20);
          p.intent = isRecipient ? 'receive' : 'press';
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
    const threat = !this.owner && this.lastAction?.kind === 'shot' && this.lastAction.team !== p.team ? readGoalThreat(b, v, attack) : undefined;
    const inArea = depth > -0.8 && depth < 5.3 && Math.abs(b.z) < 5.4;
    const loose = inArea && !this.owner && b.y < 1.15 && length(v.x, v.z) < 5.5;
    const nearPost = b.z * mix(0.34, 0.56, clamp((11 - depth) / 9, 0, 1));
    p.target.x = loose ? clamp(b.x, -FIELD.x + 0.65, FIELD.x - 0.65) : home + attack * clamp(depth * 0.061, 0, 2.4);
    const travelToKeeper = threat ? (p.target.x - b.x) / v.x : 0;
    const cover = threat && travelToKeeper > 0 ? mix(b.z + v.z * travelToKeeper, threat.z, 0.18) : nearPost;
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
    const aim = (keeper.z > 0 ? -1 : 1) * this.random.range(1.35, 2.68);
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
      const spread = 0.42 + toGoal * 0.023 + Math.max(0, 2.2 - pressure) * 0.23;
      const z = aim + this.random.range(-spread, spread);
      const to = { x: attack * (FIELD.x + 0.85), z: longShot ? clamp(z, -2.83, 2.83) : z };
      const speed = this.random.range(15.7, 21.2);
      const lift = this.random.range(1.3, 5.5);
      this.scheduleKick(player, longShot ? { to, speed, lift, kind: 'shot', style: 'long-shot',
        seconds: clamp(distance(this.currentBall, to) / 22.8, 0.71, 1.12), arrivalHeight: clamp(lift * 0.36, 0.65, 1.60) }
        : { to, speed, lift, kind: 'shot' });
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
    this.pending = { ...plan, player, at: this.tick + Math.round(KICK_CONTACT / STEP) };
    const action = plan.kind === 'distribution' ? 'distribute' : plan.kind;
    this.pose(player, action, action === 'shot' ? 0.58 : plan.style === 'loft' || plan.style === 'switch' ? 0.55 : 0.43, player.id % 2 ? -1 : 1);
  }

  private release(kick: Kick) {
    const { player, kind } = kick;
    this.pending = undefined;
    if (this.owner !== player || (player.role !== 'keeper' && (distance(player, this.currentBall) > 1.38 || this.currentBall.y > 0.82))) return;
    const from = this.ball.translation();
    const range = distance(from, kick.to);
    const seconds = kick.seconds && kick.arrivalHeight !== undefined ? Math.max(kick.seconds, range / 22.5) : kick.seconds;
    const velocity = seconds && kick.arrivalHeight !== undefined ? loftVelocity(range, from.y, kick.arrivalHeight, seconds) : kick;
    const speed = Math.min(24.8, velocity.speed) / Math.max(0.01, range);
    const x = (kick.to.x - from.x) * speed;
    const z = (kick.to.z - from.z) * speed;
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
    this.ball.applyImpulse({ x: (x - v.x) * 0.43, y: (velocity.lift - v.y) * 0.43, z: (z - v.z) * 0.43 }, true);
    this.ball.applyTorqueImpulse({ x: z * 0.007, y: 0, z: -x * 0.007 }, true);
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
      const forward = this.attack(p.team);
      const point = { x: p.x + forward * 0.72, y: 1.05, z: p.z };
      this.ball.setTranslation(point, true);
      this.ball.setLinvel(zero, true);
      if (!this.pending && this.tick >= this.keeperUntil) {
        const viable = this.players.slice(p.team * 5 + 1, p.team * 5 + 5);
        let target = viable[0];
        let best = -Infinity;
        for (const q of viable) {
          const rating = this.lane(p, q) + this.closestRival(q).dist * 0.48 - distance(p, q) * 0.048 + this.random.range(-1.3, 1.3);
          if (rating > best) { best = rating; target = q; }
        }
        const d = distance(p, target);
        const speed = clamp(7 + d * 0.46, 8, 17);
        const loft = d >= 14 && this.closestRival(target).dist > 2;
        const seconds = loft ? clamp(d / 16.5, 1.13, 1.48) : d / speed;
        const to = leadReceiver(target, seconds + KICK_CONTACT);
        this.scheduleKick(p, { to, speed, lift: 2.1, kind: 'distribution', target: target.id, style: loft ? 'loft' : 'ground',
          seconds, arrivalHeight: loft ? RECEIVE_HEIGHT : undefined });
      }
    } else {
      const d = distance(p, b);
      if (d > 1.62 || b.y > 0.84) { this.owner = undefined; this.pending = undefined; return; }
      this.challenge(p, b);
      if (this.owner !== p) return;
      if (!this.pending && this.tick >= this.nextChoice) this.chooseKick(p);
      this.dribble(p, b, v, d);
    }
    if (this.pending && this.tick >= this.pending.at) this.release(this.pending);
  }

  private dribble(p: Player, b: Point3, v: Point3, d: number) {
    if (d > 1.45 || b.y > BALL + 0.27) return;
    let yaw = p.yaw;
    if (this.pending) yaw = Math.atan2(this.pending.to.x - b.x, this.pending.to.z - b.z);
    const offset = this.pending ? 0.95 : 1.01;
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
      if (p.cooldown > this.tick || b.x * attack > -FIELD.x + 6 || Math.abs(b.z) >= 6) continue;
      const incoming = v.x * attack < -4;
      const d = distance(p, b);
      const shot = incoming && this.lastAction?.kind === 'shot' && this.lastAction.team !== team;
      const near = (b.x - p.x) * attack > -0.36 && (b.x - p.x) * attack < 1.1;
      if (shot && near && d < 1.68 && b.y < 2.32 && readGoalThreat(b, v, attack)) {
        const side = Math.sign(b.z - p.z || 1) * attack;
        const move = saveMove(b.y, Math.abs(b.z - p.z));
        this.pose(p, move, move === 'dive' ? 0.79 : move === 'smother' ? 0.62 : 0.61, side);
        p.cooldown = this.tick + 36;
        const reach = clamp(0.91 - (d - 0.38) * 0.46 - Math.max(0, b.y - 1.36) * 0.35 - (speed - 13) * 0.014 + (p.keeperReady ? 0.025 : 0), 0.13, 0.88);
        if (this.random.next() > reach) continue;
        const held = move !== 'tip' && d < (move === 'smother' ? 1.17 : 1.05) && b.y < 1.56 && this.random.next() < (move === 'smother' ? 0.69 : 0.56);
        this.stats.saves++;
        this.stats.byTeam[team].saves++;
        this.saves[team]++;
        this.emit('save', { team, player: p.id, opponent: this.lastAction?.from, point: b, save: { move, held } });
        this.lastTouch = p.id;
        if (held) this.catchBall(p, true);
        else {
          this.lastAction = undefined;
          const wide = Math.sign(b.z || v.z || attack);
          this.ball.setLinvel({ x: attack * this.random.range(5.5, 9.5), y: this.random.range(1, move === 'tip' ? 3.6 : 2.7), z: wide * this.random.range(4.0, 7) }, true);
          this.exclude(p, 8);
        }
        return;
      }
      if (d < 1.13 && b.y < 1.2 && speed < 7.1) { this.catchBall(p, false); return; }
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

  private exclude(player: Player, ticks: number) {
    this.restoreCollision();
    player.collider.setCollisionGroups(emptyCollision);
    this.excluded = { player, until: this.tick + ticks };
  }

  private catchBall(p: Player, fromSave: boolean) {
    this.assign(p);
    p.keeperReady = false;
    this.keeperUntil = this.tick + Math.round(this.random.range(47, 82));
    if (!fromSave) this.pose(p, 'catch', 0.54);
    this.exclude(p, 95);
  }

  private movePlayers() {
    const active = this.state === 'live';
    for (const p of this.players) {
      p.oldX = p.x; p.oldZ = p.z; p.oldYaw = p.yaw;
      let dx = p.target.x - p.x;
      let dz = p.target.z - p.z;
      const d = length(dx, dz);
      const slow = p.pose?.kind === 'stumble' || p.pose?.kind === 'dive' || p.pose?.kind === 'smother' || p.pose?.kind === 'tip';
      const limit = slow ? 1.7 : !active ? (this.state === 'goal' ? 4.5 : this.state === 'halftime' ? 9.3 : 7.6) : p.intent === 'press' || p.intent === 'receive' ? 6.15 : p.intent === 'carry' ? 4.7 : p.role === 'keeper' ? 5.25 : 5.0;
      const speed = Math.min(limit, d * 3.0) / Math.max(0.01, d);
      dx *= speed;
      dz *= speed;
      for (const q of this.players) {
        if (q === p) continue;
        const x = p.oldX - q.x;
        const z = p.oldZ - q.z;
        const separation = length(x, z);
        if (separation > 1.55) continue;
        const repulsion = (1.55 - separation) * 3.1 / Math.max(0.06, separation);
        dx += x * repulsion + (separation < 0.08 ? (p.id < q.id ? -1 : 1) * 2.4 : 0);
        dz += z * repulsion;
      }
      const limitScale = Math.min(1, limit / Math.max(0.01, length(dx, dz)));
      const smoothing = damp(8.4, STEP);
      p.vx = mix(p.vx, dx * limitScale, smoothing);
      p.vz = mix(p.vz, dz * limitScale, smoothing);
      const speedNow = length(p.vx, p.vz);
      p.x = clamp(p.x + p.vx * STEP, -FIELD.x + BODY, FIELD.x - BODY);
      p.z = clamp(p.z + p.vz * STEP, -FIELD.z + BODY, FIELD.z - BODY);
      const orient = this.state === 'goal' || this.state === 'fulltime' ? { x: p.x + this.attack(p.team) * 0.4, z: p.z + 2 } : this.currentBall;
      const kick = this.pending?.player === p ? this.pending : undefined;
      const lookAtBall = (p.role === 'keeper' && this.state !== 'halftime') || (speedNow < 0.8 && p !== this.owner);
      const desired = kick ? Math.atan2(kick.to.x - p.x, kick.to.z - p.z) : lookAtBall ? Math.atan2(orient.x - p.x, orient.z - p.z) : Math.atan2(p.vx, p.vz);
      p.yaw += clamp(angleDiff(p.yaw, desired), -11 * STEP, 11 * STEP) * 0.76;
      if (Math.abs(p.yaw) > Math.PI * 3) p.yaw -= Math.sign(p.yaw) * Math.PI * 2;
      if (p.pose?.kind === 'dive' || p.pose?.kind === 'tip') {
        const amount = diveReach(p.pose.age / p.pose.duration);
        const high = p.pose.kind === 'tip';
        p.body.setNextKinematicTranslation({ x: p.x, y: amount * (high ? 0.34 : 0.10), z: p.z + p.pose.side * this.attack(p.team) * amount * (high ? 0.20 : 0.54) });
      } else p.body.setNextKinematicTranslation({ x: p.x, y: 0, z: p.z });
      const before = Math.floor(p.stride / Math.PI);
      p.stride = (p.stride + speedNow * STEP * 3.92) % (2 * Math.PI);
      if (active && speedNow > 2.3 && before !== Math.floor(p.stride / Math.PI) && (p === this.owner || p.id === this.press[p.team])) this.emit('footstep', { team: p.team, player: p.id });
    }
  }
}
