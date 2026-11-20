import * as T from 'three';
import { BALL, clamp, damp, distance, mix } from './football';
import type { MatchEvent, MatchState, Point, Point3 } from './football';
import type { PitchTurn } from './commentary';
import type { Match, Player } from './match';
import { CAPTAINS } from './show';
import type { Celebration, MatchShow } from './show';

type Shot = 'wide' | 'play' | 'attack' | 'reaction' | 'rivals' | 'close-up' | 'celebration' | 'long-ball' | 'conversation' | 'stadium';
type SafeFrame = { left: number; right: number; top: number; bottom: number };
type FramingPoint = Point3 & { radius: number; required: boolean };
type RenderPositions = { ball: Point3; players: readonly Point3[] };

const headHeight = 3.04;
const wideDistance = 49;
const defaultFrame = { left: 0.86, right: 0.86, top: 0.69, bottom: 0.68 };
const captureFrame = { left: 0.86, right: 0.86, top: 0.58, bottom: 0.52 };
const verticalFrame = { left: 0.81, right: 0.81, top: 0.56, bottom: 0.36 };
const reportFrame = { left: 0.86, right: 0.14, top: 0.72, bottom: 0.56 };
const verticalReportFrame = { left: 0.81, right: 0.81, top: 0.66, bottom: 0.16 };
const keepers = [0, 5] as const;
const easeInOut = (t: number) => t * t * (3 - 2 * t);

function nearest(players: readonly Player[], point: Point, range = Infinity, excludedTeam?: Player['team']) {
  let nearestPlayer: Player | undefined;
  for (const player of players) {
    if (player.team === excludedTeam) continue;
    const gap = distance(player, point);
    if (gap >= range) continue;
    nearestPlayer = player;
    range = gap;
  }
  return nearestPlayer;
}

export class BroadcastCamera {
  readonly camera = new T.PerspectiveCamera(39, 16 / 9, 0.15, 238);
  private readonly target = new T.Vector3();
  private readonly aim = new T.Vector3();
  private readonly outward = new T.Vector3();
  private readonly right = new T.Vector3();
  private readonly up = new T.Vector3();
  private readonly eye = new T.Vector3();
  private readonly stageEye = new T.Vector3();
  private readonly stageTarget = new T.Vector3();
  private readonly points: FramingPoint[] = [];
  private readonly actors: number[] = [];
  private dolly = 0;
  private yaw = 0.11;
  private elevation = 0.40;
  private previousState?: MatchState;
  private shot?: MatchEvent;
  private kickoff = -1000;
  mode: Shot = 'wide';
  scale = 1;
  focus: number | null = null;
  production = false;

  get subjects(): readonly number[] { return this.actors; }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  react(event: MatchEvent) {
    if (event.kind === 'shot') this.shot = event;
    if (event.kind === 'pass' || event.kind === 'distribution' || event.kind === 'kickoff' || event.kind === 'fulltime') this.shot = undefined;
    if (event.kind === 'match-start' || event.kind === 'half-start') this.kickoff = event.tick;
  }

  update(match: Match, dt: number, show: MatchShow, pitch?: PitchTurn, rendered?: RenderPositions) {
    const { state, tick } = match;
    const ball = rendered?.ball ?? match.currentBall;
    const portrait = this.camera.aspect < 1;
    const restartCut = state === 'kickoff' && this.previousState !== state;
    this.previousState = state;
    this.points.length = this.actors.length = 0;
    if (this.focus !== null) {
      const player = match.players[this.focus];
      const at = rendered?.players[player.id] ?? { x: player.x, y: 0, z: player.z };
      const yaw = player.yaw + 0.25;
      this.camera.position.set(at.x + Math.sin(yaw) * 4.15, at.y + 2.95, at.z + Math.cos(yaw) * 4.15);
      this.camera.lookAt(at.x, at.y + 1.38, at.z);
      this.camera.updateMatrixWorld();
      this.mode = 'close-up';
      return;
    }

    const celebration = show.getCelebration(tick);
    const finale = celebration?.kind === 'fulltime';
    let frame = this.production ? portrait ? verticalFrame : captureFrame : defaultFrame;
    if (finale) frame = portrait ? verticalReportFrame : reportFrame;
    let depth = portrait ? 15.7 : 18.9;
    let angle = 0.40;
    let yaw = 0.11;
    let motion = 5;
    if (celebration) {
      this.mode = 'celebration';
      this.frameCelebration(match, celebration, rendered);
      depth = finale ? 13.4 : 7.7;
      angle = finale ? 0.28 : 0.19;
      motion = 7.6;
    } else if (match.ballVisible) {
      this.addPoint(ball, BALL, true);
      this.mode = this.frameLive(match, ball, show, pitch, portrait, rendered);
      if (this.mode === 'conversation') {
        depth = portrait ? 13.6 : 14.4;
        angle = 0.26;
        const speaker = match.players[this.actors[0]], listener = match.players[this.actors[1]];
        yaw = 0.11 + (Math.sin(speaker.yaw) * 0.76 + Math.sin(listener.yaw) * 0.24) * 0.46;
      } else if (this.mode === 'reaction') {
        depth = portrait ? 14.1 : 15.3;
        angle = 0.29;
      } else if (this.mode === 'attack') {
        depth = portrait ? 15.9 : 17.5;
        angle = 0.34;
      } else if (this.mode === 'long-ball') {
        depth = 20.4;
        angle = 0.45;
        motion = 6.4;
      } else if (this.mode === 'rivals') {
        depth = portrait ? 15.6 : 17.2;
        angle = 0.30;
      }
    } else {
      this.mode = 'wide';
      this.addPoint({ x: 0, y: 0.8, z: -1 });
      depth = portrait ? 46 : 33;
    }
    const cut = this.dolly === 0 || restartCut;
    this.place(frame, depth, angle, yaw, dt, motion, cut, match.ballVisible && !celebration);
    if (match.ballVisible && (state === 'live' || state === 'setup' || state === 'kickoff')) {
      this.establish(tick, ball, portrait);
    }
    this.camera.updateMatrixWorld();
  }

  private frameLive(match: Match, ball: Point3, show: MatchShow, pitch: PitchTurn | undefined, portrait: boolean, rendered?: RenderPositions): Shot {
    const live = match.state === 'live';
    const flight = live ? match.flight : undefined;
    const long = flight && (flight.style !== 'ground' && (flight.style !== 'drive' || flight.range > 11));
    const shot = live && this.shot && !match.owner && match.tick - this.shot.tick < 95 ? this.shot : undefined;
    const moment = show.moment;
    const reaction = live && moment?.point && moment.kind !== 'goal' && match.tick - moment.tick <= 96 &&
      distance(ball, moment.point) < 7.4 ? moment : undefined;
    const carrier = match.owner ?? nearest(match.players, ball);
    const add = (id?: number) => {
      if (id === undefined) return;
      const close = !this.actors.length && distance(match.players[id], ball) < (portrait ? 4.2 : 5.6);
      this.addActor(match, id, rendered, close);
    };

    if (long && flight) {
      const horizon = portrait ? 7.4 : 21;
      const span = distance(ball, flight.to);
      const ahead = clamp(horizon / Math.max(0.01, span), 0, 1);
      this.addPoint({ x: mix(ball.x, flight.to.x, ahead), y: BALL, z: mix(ball.z, flight.to.z, ahead) }, BALL);
      if (flight.style === 'long-shot') {
        if (!portrait || span < horizon) {
          if (shot?.player !== undefined && distance(match.players[shot.player], ball) < horizon) add(shot.player);
          add(keepers.find(id => Math.sign(match.players[id].home.x) === Math.sign(flight.to.x)));
        }
      } else if (flight.receiver !== undefined && span < horizon + 0.8) {
        if (distance(match.players[flight.receiver], flight.to) < 6) add(flight.receiver);
      }
      return 'long-ball';
    }
    if (reaction) {
      add(reaction.player);
      const partner = reaction.opponent ?? (reaction.kind === 'post' ? keepers.find(id => Math.sign(match.players[id].home.x) === Math.sign(ball.x)) : undefined);
      if (partner !== undefined && distance(match.players[partner], ball) < (portrait ? 12 : 17)) add(partner);
      if (!this.actors.length) add(carrier?.id);
      return 'reaction';
    }
    if (shot) {
      add(shot.player);
      add(keepers.find(id => Math.sign(match.players[id].home.x) === shot.side));
      return 'attack';
    }
    if (live && pitch && this.fitsConversation(match, pitch, ball, portrait)) {
      add(pitch.speaker);
      add(pitch.listener);
      return 'conversation';
    }
    if (!live || match.tick - this.kickoff < 170) {
      for (const id of CAPTAINS) if (distance(match.players[id], ball) < 7.4) add(id);
      if (this.actors.length < 2 && carrier && distance(carrier, ball) < 5) add(carrier.id);
      if (this.actors.length > 1) return 'rivals';
    }

    if (carrier && distance(carrier, ball) < 7.8) add(carrier.id);
    if (Math.abs(ball.x) > 12.2) {
      add(keepers.find(id => Math.sign(match.players[id].home.x) === Math.sign(ball.x)));
      return 'attack';
    }
    add(nearest(match.players, ball, portrait ? 3.7 : 5.3, carrier?.team)?.id);
    return 'play';
  }

  private fitsConversation(match: Match, pitch: PitchTurn, ball: Point3, portrait: boolean) {
    const speaker = match.players[pitch.speaker];
    const listener = match.players[pitch.listener];
    return distance(speaker, listener) < (portrait ? 7.4 : 10.8) &&
      Math.min(distance(ball, speaker), distance(ball, listener)) < (portrait ? 4.8 : 6.5) &&
      Math.max(distance(ball, speaker), distance(ball, listener)) < (portrait ? 8.5 : 11.8);
  }

  private frameCelebration(match: Match, celebration: Celebration, rendered?: RenderPositions) {
    const { lead, team, tick } = celebration;
    if (lead === undefined) {
      for (const id of CAPTAINS) this.addActor(match, id, rendered, id === CAPTAINS[0]);
      return;
    }
    this.addActor(match, lead, rendered, true);
    if (celebration.kind !== 'fulltime' && match.tick - tick < 164) return;
    const player = match.players[lead];
    const peers = match.players.filter(p => p.id !== lead && p.team === team && distance(player, p) < 7);
    peers.sort((a, b) => distance(a, player) - distance(b, player));
    this.addActor(match, peers[0]?.id, rendered);
  }

  private addPoint(p: Point3, radius = 0, required = false) {
    if (Number.isFinite(p.x + p.y + p.z)) this.points.push({ x: p.x, y: p.y, z: p.z, radius, required });
  }

  private addActor(match: Match, id: number | undefined, rendered?: RenderPositions, required = false) {
    if (id === undefined || this.actors.includes(id)) return;
    const p = rendered?.players[id] ?? { x: match.players[id].x, y: 0, z: match.players[id].z };
    this.actors.push(id);
    this.points.push({ ...p, y: p.y + 0.30, radius: 0.48, required }, { ...p, y: p.y + 1.42, radius: 0.65, required },
      { ...p, y: p.y + headHeight, radius: 0.26, required });
  }

  private place(frame: SafeFrame, depth: number, angle: number, yaw: number, dt: number, motion: number, cut: boolean, ballVisible: boolean) {
    const ease = cut ? 1 : damp(motion, dt);
    this.yaw = mix(this.yaw, yaw, cut ? 1 : damp(2.7, dt));
    this.elevation = mix(this.elevation, angle, ease);
    const side = Math.sin(this.yaw);
    const front = Math.cos(this.yaw);
    const rise = Math.sin(this.elevation);
    const ground = Math.cos(this.elevation);
    this.right.set(front, 0, -side);
    this.outward.set(side * ground, rise, front * ground);
    this.up.crossVectors(this.outward, this.right);
    let left = Infinity, right = -Infinity, low = Infinity, high = -Infinity, near = -Infinity, far = Infinity;
    for (const p of this.points) {
      const u = p.x * this.right.x + p.z * this.right.z;
      const v = this.up.dot(p);
      const d = this.outward.dot(p);
      left = Math.min(left, u - p.radius);
      right = Math.max(right, u + p.radius);
      low = Math.min(low, v - p.radius);
      high = Math.max(high, v + p.radius);
      far = Math.min(far, d);
      near = Math.max(near, d);
    }
    this.aim.copy(this.right).multiplyScalar((left * frame.right + right * frame.left) / (frame.left + frame.right))
      .addScaledVector(this.up, (low * frame.top + high * frame.bottom) / (frame.top + frame.bottom))
      .addScaledVector(this.outward, (near + far) * 0.5);
    this.target.lerp(this.aim, ease);
    const fitted = Math.max(depth, Math.min(this.fitDistance(this.aim, frame), this.camera.aspect < 1 ? 39 : 42));
    const eased = mix(this.dolly, fitted, damp(fitted > this.dolly ? 6.4 : this.mode === 'celebration' ? 5.6 : 2.7, dt));
    this.dolly = cut ? fitted : Math.min(eased, this.dolly * Math.exp(3 * dt));
    this.contain(frame, ballVisible);
    this.scale = this.dolly / wideDistance;
    this.eye.copy(this.target).addScaledVector(this.outward, this.dolly);
    this.camera.position.copy(this.eye);
    this.camera.lookAt(this.target);
  }

  private fitDistance(center: T.Vector3, frame: SafeFrame) {
    const vertical = Math.tan(T.MathUtils.degToRad(this.camera.fov * 0.5));
    const horizontal = vertical * this.camera.aspect;
    const centerX = this.right.dot(center), centerY = this.up.dot(center), centerZ = this.outward.dot(center);
    let required = 0;
    for (const p of this.points) {
      const u = this.right.dot(p) - centerX;
      const v = this.up.dot(p) - centerY;
      const d = this.outward.dot(p) - centerZ + p.radius;
      required = Math.max(required, d + (u + p.radius) / (horizontal * frame.right),
        d + (-u + p.radius) / (horizontal * frame.left), d + (v + p.radius) / (vertical * frame.top),
        d + (-v + p.radius) / (vertical * frame.bottom));
    }
    return required;
  }

  // Keep the ball inside the graphics-safe area with a small pan before changing the lens.
  private contain(frame: SafeFrame, ballVisible: boolean) {
    const vertical = Math.tan(T.MathUtils.degToRad(this.camera.fov * 0.5));
    const horizontal = vertical * this.camera.aspect;
    const leftSlope = horizontal * frame.left, rightSlope = horizontal * frame.right;
    const bottomSlope = vertical * frame.bottom, topSlope = vertical * frame.top;
    const z = this.outward.dot(this.target);
    const envelope = (ballOnly: boolean) => {
      let xMin = -Infinity, xMax = Infinity, yMin = -Infinity, yMax = Infinity, depth = 0;
      for (const [index, p] of this.points.entries()) {
        if (!p.required || (ballOnly && index !== 0)) continue;
        const u = this.right.dot(p), v = this.up.dot(p);
        const d = this.outward.dot(p) + p.radius - z;
        xMin = Math.max(xMin, u + p.radius + d * rightSlope);
        xMax = Math.min(xMax, u - p.radius - d * leftSlope);
        yMin = Math.max(yMin, v + p.radius + d * topSlope);
        yMax = Math.min(yMax, v - p.radius - d * bottomSlope);
        depth = Math.max(depth, d + 1.2);
      }
      depth = Math.max(depth, (xMin - xMax) / (leftSlope + rightSlope), (yMin - yMax) / (topSlope + bottomSlope));
      return { xMin, xMax, yMin, yMax, depth };
    };
    let box = envelope(false);
    if (ballVisible && box.depth > this.dolly + 0.6) box = envelope(true);
    this.dolly = Math.max(this.dolly, box.depth);
    const x = this.right.dot(this.target), y = this.up.dot(this.target);
    const u = clamp(x, box.xMin - this.dolly * rightSlope, box.xMax + this.dolly * leftSlope);
    const v = clamp(y, box.yMin - this.dolly * topSlope, box.yMax + this.dolly * bottomSlope);
    this.target.addScaledVector(this.right, u - x).addScaledVector(this.up, v - y);
  }

  private establish(tick: number, ball: Point, portrait: boolean) {
    if (this.mode === 'long-ball' || this.mode === 'attack' || this.mode === 'reaction') return;
    const age = tick < 52 ? 0 : (tick - this.kickoff) / 60;
    if (age >= 1.45) return;
    const reveal = (1 - easeInOut(clamp((age - 0.47) / 0.98, 0, 1))) * clamp((9 - Math.abs(ball.x)) / 5, 0, 1);
    if (reveal <= 0) return;
    this.mode = 'stadium';
    this.stageEye.set(1.9, portrait ? 20 : 16.3, portrait ? 75 : 64);
    this.stageTarget.set(0, portrait ? 3.2 : 3.9, portrait ? -5 : -7);
    this.camera.position.copy(this.eye).lerp(this.stageEye, reveal);
    this.aim.copy(this.target).lerp(this.stageTarget, reveal);
    this.camera.lookAt(this.aim);
    this.scale = this.camera.position.distanceTo(this.aim) / wideDistance;
  }
}
