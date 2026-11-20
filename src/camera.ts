import * as T from 'three';
import { clamp, damp, distance, mix } from './football';
import type { MatchEvent, Point } from './football';
import type { PitchTurn } from './commentary';
import type { Match } from './match';
import { CAPTAINS } from './show';
import type { MatchShow } from './show';

export class BroadcastCamera {
  readonly camera = new T.PerspectiveCamera(39, 16 / 9, 0.15, 238);
  private readonly target = new T.Vector3(0, 0.18, -1.1);
  private readonly projectedBall = new T.Vector3();
  private positionX = 0;
  private positionZ = -1.48;
  private ballX = 0;
  private ballZ = 0;
  private zoom = 0;
  private width = 16 / 9;
  private shot?: MatchEvent;
  private kickoff = -1000;
  mode: 'wide' | 'attack' | 'reaction' | 'rivals' | 'close-up' | 'celebration' | 'long-ball' | 'conversation' | 'stadium' = 'wide';
  scale = 1;
  focus: number | null = null;
  production = false;

  resize(aspect: number) {
    this.width = aspect;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  react(event: MatchEvent) {
    if (event.kind === 'shot') this.shot = event;
    if (event.kind === 'match-start' || event.kind === 'half-start') this.kickoff = event.tick;
    if (event.kind === 'halftime' || event.kind === 'fulltime') this.shot = undefined;
  }

  update(match: Match, dt: number, show: MatchShow, pitch?: PitchTurn) {
    const { currentBall: ball, state } = match;
    const celebration = show.getCelebration(match.tick);
    if (celebration?.lead !== undefined && this.focus === null) {
      this.followCelebration(match.players[celebration.lead], dt, celebration.kind === 'fulltime');
      return;
    }
    if (this.mode === 'celebration') {
      this.positionX = this.ballX = 0;
      this.positionZ = -1.48;
      this.ballZ = this.zoom = 0;
    }
    if (match.ballVisible && Number.isFinite(ball.x + ball.z)) {
      this.ballX = mix(this.ballX, ball.x, damp(2.7, dt));
      this.ballZ = mix(this.ballZ, ball.z, damp(2.5, dt));
    }
    const playing = state === 'live' || state === 'goal';
    const flight = match.flight;
    const longBall = state === 'live' && flight && flight.style !== 'ground' ? flight : undefined;
    const moment = show.moment;
    const reaction = moment && match.tick - moment.tick <= 115 && (state === 'goal' || (state === 'live' && Math.hypot(ball.x - (moment.point?.x ?? ball.x), ball.z - (moment.point?.z ?? ball.z)) < 8)) ? moment : undefined;
    const duel = reaction?.kind === 'steal';
    const shot = this.shot && match.tick - this.shot.tick < 115 && Math.sign(ball.x) === this.shot.side ? this.shot : undefined;
    const goalmouth = clamp((Math.abs(this.ballX) - 8.5) / 7.5, 0, 1);
    const attack = playing && (goalmouth > 0.04 || (!!reaction && !duel)) && Math.abs(reaction?.point?.x ?? this.ballX) > 8;
    const intro = state === 'live' && match.tick < show.introUntil && !attack && !longBall;
    const far = attack ? Math.sign(reaction?.point?.x ?? this.ballX) : 0;
    const keeper = attack ? [match.players[0], match.players[5]].find(p => Math.sign(p.home.x) === far) : undefined;
    const shooter = attack ? match.players[reaction?.kind === 'save' ? reaction.opponent ?? -1 : reaction?.player ?? shot?.player ?? -1] : undefined;
    const inFlight = shot && !match.owner && (!reaction || reaction.kind !== 'save' || reaction.tick < shot.tick);
    const speaker = pitch && match.players[pitch.speaker];
    const listener = pitch && match.players[pitch.listener];
    const portrait = this.width < 1.42;
    const conversation = this.production && state === 'live' && !inFlight && !longBall && speaker && listener &&
      distance(speaker, listener) < (portrait ? 8 : 13) && Math.min(distance(ball, speaker), distance(ball, listener)) < 9;
    const points = [{ x: this.ballX, z: this.ballZ }];
    if (match.ballVisible) points.push(ball);
    if (conversation && speaker && listener) points.push(speaker, listener);
    else if (!longBall || longBall.style === 'long-shot') {
      if (keeper) points.push(keeper);
      if (shooter && Math.abs(shooter.x - this.ballX) < 22) points.push(shooter);
    }
    if (longBall) {
      points.push(longBall.to);
      if (longBall.receiver !== undefined) points.push(match.players[longBall.receiver]);
    }
    if (!longBall && duel) {
      const { player, opponent } = reaction;
      if (player !== undefined) points.push(match.players[player]);
      if (opponent !== undefined) points.push(match.players[opponent]);
    }
    if (intro) points.push(...CAPTAINS.map(id => match.players[id]));
    const minX = Math.min(...points.map(p => p.x));
    const maxX = Math.max(...points.map(p => p.x));
    const minZ = Math.min(...points.map(p => p.z));
    const maxZ = Math.max(...points.map(p => p.z));
    const framing = longBall ? 0.86 : conversation ? 0.96 : attack ? Math.max(goalmouth * 0.86, reaction ? 0.97 : 0.38) : duel ? 0.70 : intro ? 0.63 : 0;
    const focusX = (minX + maxX) / 2;
    const focusZ = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxZ - minZ);
    const detail = longBall ? clamp(0.68 + span * 0.011, 0.74, 1.04) : conversation ? clamp(0.43 + span * 0.018, 0.57, 0.84)
      : clamp(0.54 + span * 0.0085, 0.56, 0.74);
    const desiredX = playing ? mix(clamp(this.ballX * 0.35, -7.4, 7.4), focusX, framing) : 0;
    const desiredZ = mix(-1.48 + this.ballZ * 0.08, focusZ, framing * 0.80);
    this.positionX = mix(this.positionX, desiredX, damp(longBall || conversation ? 5.0 : attack ? 3.1 : 2.25, dt));
    this.positionZ = mix(this.positionZ, desiredZ, damp(longBall || conversation ? 4.3 : 2.7, dt));
    this.zoom = mix(this.zoom, framing * (1 - detail), damp(longBall || conversation ? 6 : attack ? 3.1 : 2.0, dt));
    const player = this.focus === null ? undefined : match.players[this.focus];
    const portraitFit = this.production ? clamp(1.45 + (maxX - minX) * 0.033 + (maxZ - minZ) * 0.02, 1.45, 2.15)
      : clamp(1.42 / this.width, 1, 2.15);
    const fit = portrait ? portraitFit : 1;
    this.scale = (1 - this.zoom) * fit;
    this.mode = player ? 'close-up' : longBall ? 'long-ball' : conversation ? 'conversation'
      : reaction && (attack || duel) ? 'reaction' : attack ? 'attack' : intro ? 'rivals' : 'wide';
    const z = 39.0 * this.scale;
    const y = 30.3 * this.scale;
    if (player) {
      const yaw = player.yaw + 0.25;
      this.camera.position.set(player.x + Math.sin(yaw) * 4.15, 2.95, player.z + Math.cos(yaw) * 4.15);
      this.target.set(player.x, 1.38, player.z);
    } else {
      this.camera.position.set(1.9 + this.positionX * 0.88, y, z + this.positionZ + 1.48);
      this.target.set(this.positionX, 0.28, this.positionZ);
      if (state === 'live' && !inFlight && !longBall) {
        const age = (match.tick - this.kickoff) / 60;
        const ease = clamp((age - 1.12) / 1.28, 0, 1);
        const reveal = (1 - ease * ease * (3 - 2 * ease)) * clamp((12 - Math.abs(ball.x)) / 5, 0, 1);
        if (reveal > 0) {
          this.mode = 'stadium';
          this.camera.position.set(mix(this.camera.position.x, 1.9, reveal), mix(y, portrait ? 20 : 16.3, reveal),
            mix(this.camera.position.z, portrait ? 75 : 64, reveal));
          this.target.set(this.positionX * (1 - reveal), mix(.28, portrait ? 3.2 : 3.9, reveal), mix(this.positionZ, portrait ? -5 : -7, reveal));
        }
      }
    }
    this.camera.lookAt(this.target);
    if (this.production && portrait && !player && match.ballVisible) this.keepVerticalBallInFrame(ball);
  }

  private keepVerticalBallInFrame(ball: { x: number; y: number; z: number }) {
    this.camera.updateMatrixWorld();
    this.projectedBall.set(ball.x, ball.y, ball.z).project(this.camera);
    const edge = Math.max(Math.abs(this.projectedBall.x) / 0.80, Math.abs(this.projectedBall.y) / 0.62);
    if (edge <= 1) return;
    const shift = clamp(1 - 0.74 / edge, 0, 0.85);
    const x = (ball.x - this.target.x) * shift;
    const z = (ball.z - this.target.z) * shift;
    this.camera.position.x += x;
    this.camera.position.z += z;
    this.target.x += x;
    this.target.z += z;
    this.camera.lookAt(this.target);
  }

  private followCelebration(lead: Point, dt: number, finale: boolean) {
    const ease = damp(9.4, dt);
    this.mode = 'celebration';
    this.positionX = mix(this.positionX, lead.x, ease);
    this.positionZ = mix(this.positionZ, lead.z, ease);
    this.zoom = mix(this.zoom, finale ? 0.53 : 0.73, ease);
    this.scale = (1 - this.zoom) * clamp(1.15 / this.width, 1, 1.8);
    this.camera.position.set(this.positionX + 1.8, 1.8 + 18.5 * this.scale, this.positionZ + 38 * this.scale);
    this.target.set(this.positionX, finale ? 1.46 : 1.78, this.positionZ);
    this.camera.lookAt(this.target);
  }
}
