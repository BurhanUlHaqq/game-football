import { BALL, BALL_DAMPING, clamp, FIELD, GRAVITY, mix } from './football';
import type { Point, Point3, SaveMove } from './football';
import { spinAcceleration } from './kicks';

type Intercept = { z: number; y: number; seconds: number };
export type KeeperAttempt = {
  move: SaveMove; start: number; duration: number; load: number; air: number; up: number; lateral: number;
  contact: number; side: number; attack: number; targetZ: number; targetY: number; resolved: boolean;
};

export function ballAtPlane(ball: Point3, v: Point3, x: number, spin?: Point3): Intercept | undefined {
  if (Math.abs(v.x) < .1) return;
  const travel = (x - ball.x) / v.x;
  if (travel <= 0 || travel > 1.12) return;
  const seconds = -Math.log1p(-BALL_DAMPING * travel) / BALL_DAMPING;
  const turn = spin && ball.y > BALL + .05 ? spinAcceleration(v, spin) : undefined;
  const gravity = GRAVITY - (turn?.y ?? 0);
  let y = ball.y + v.y * travel - gravity / BALL_DAMPING * (seconds - travel);
  if (y < BALL) {
    const landing = (v.y + Math.sqrt(v.y*v.y + 2*gravity*Math.max(0,ball.y-BALL))) / gravity;
    const after = Math.max(0, seconds - landing), rebound = Math.max(0, gravity*landing-v.y)*.47;
    y = BALL + Math.max(0, rebound*after - .5*gravity*after*after);
  }
  return { seconds, y, z: ball.z + v.z*travel + .5*(turn?.z ?? 0)*seconds*seconds };
}

export function readGoalThreat(ball: Point3, velocity: Point3, attack: number, spin?: Point3) {
  if (-velocity.x * attack < 4) return;
  const projected = ballAtPlane(ball, velocity, -attack * FIELD.x, spin);
  if (projected && Math.abs(projected.z) < FIELD.goal + BALL*.25 && projected.y < FIELD.bar+.10) return projected;
}

export function saveMove(height: number, lateral: number): SaveMove {
  if (height < .76 && lateral < .82) return 'smother';
  if (height > 1.48) return 'tip';
  return lateral > .61 ? 'dive' : 'block';
}

export function planSave(keeper: Point, target: Intercept, attack: number, ready: boolean, tick: number): KeeperAttempt | undefined {
  const gap = target.z - keeper.z;
  const move = saveMove(target.y, Math.abs(gap));
  const aerial = move === 'tip' || move === 'dive';
  if (target.seconds > (aerial ? .32 : .245)) return;
  const load = ready ? .072 : .115;
  const up = move === 'tip' ? clamp(2.75 + (target.y-1.5)*.96, 2.75, 3.95) : move === 'dive' ? clamp(1.4+target.y*.67,1.55,2.45) : 0;
  const air = 2*up/GRAVITY;
  const contact = clamp(target.seconds, load + .075, .40);
  const side = Math.sign(gap || attack);
  const gloveReach = aerial ? .72 : .27;
  const lateral = side * clamp((Math.abs(gap) - gloveReach) / Math.max(.10, contact-load), 0, aerial ? 3.9 : 1.5);
  return { move, start: tick, duration: load + (aerial ? air + .24 : .46), load, air, up, lateral,
    contact, side, attack, targetZ: target.z, targetY: target.y, resolved: false };
}

export function keeperMotion(a: KeeperAttempt, age: number) {
  const t = Math.max(0, age-a.load), airborne = Math.min(t,a.air);
  const landing = Math.max(0,t-a.air);
  const recover = clamp(1 - landing/.24, 0, 1);
  const extend = clamp(t / Math.max(.07,a.contact-a.load),0,1);
  const reach = extend * (a.air ? recover : clamp((a.duration-age)/.16,0,1));
  const y = Math.max(0, a.up*airborne - .5*GRAVITY*airborne*airborne);
  // Lateral momentum carries through touchdown; the planted foot then brakes the slide.
  const skid = a.air ? .105*(1-Math.exp(-landing/.105)) : .16*(1-Math.exp(-t/.16));
  const z = a.lateral*(airborne+skid);
  const lean = a.side * a.attack * reach * (a.move === 'dive' ? .99 : a.move === 'tip' ? Math.min(.47,.13+Math.abs(a.lateral)*.08) : .08);
  const crouch = age < a.load ? Math.sin(Math.PI*clamp(age/a.load,0,1)) : a.air ? Math.sin(Math.PI*clamp(landing/.22,0,1)) : reach;
  return { y, z, reach, lean, crouch };
}

// Both the articulated mitts and the swept contact test use these world-space positions.
export function keeperGlove(a: KeeperAttempt, at: Point, age: number, localSide: number): Point3 {
  const motion = keeperMotion(a, age);
  const handSide = -a.attack * localSide;
  const leading = handSide === a.side;
  const span = a.move === 'dive' || a.move === 'tip' ? leading ? .98 : .53 : .67;
  const lateral = clamp(a.targetZ - at.z + handSide*.15, -span, span);
  const low = a.move === 'smother' || a.move === 'dive' ? .29 : .55;
  const height = clamp(a.targetY-motion.y, low, a.move === 'tip' ? 2.09 : 1.63);
  return { x: at.x + a.attack*mix(.41,leading ? .72 : .64,motion.reach),
    y: motion.y + mix(1.16-.12*motion.crouch,height,motion.reach),
    z: at.z + mix(handSide*.39,lateral,motion.reach) };
}

export const GLOVE_RADIUS = .17;
export function gloveContact(ball0: Point3, ball1: Point3, hand0: Point3, hand1: Point3) {
  const x=ball0.x-hand0.x, y=ball0.y-hand0.y, z=ball0.z-hand0.z;
  const dx=ball1.x-hand1.x-x, dy=ball1.y-hand1.y-y, dz=ball1.z-hand1.z-z;
  const c=x*x+y*y+z*z-(BALL+GLOVE_RADIUS)**2;
  if (c<=0) return 0;
  const speed=dx*dx+dy*dy+dz*dz, dot=x*dx+y*dy+z*dz, disc=dot*dot-speed*c;
  if (speed<1e-9 || dot>=0 || disc<0) return;
  const time=(-dot-Math.sqrt(disc))/speed;
  if (time<=1) return time;
}

export function parryVelocity(v: Point3, a: KeeperAttempt, palm: Point3): Point3 {
  const high = a.move === 'tip';
  const nx = a.attack*(high ? .48 : .84), ny = high ? .60 : .18, nz = a.side*(high ? .63 : .51);
  const impulse = -1.44 * Math.min(0,v.x*nx + v.y*ny + v.z*nz);
  return { x: (v.x+impulse*nx)*.57 + .24*palm.x, y: clamp((v.y+impulse*ny)*.65 + .24*palm.y,.35,8.4),
    z: (v.z+impulse*nz)*.70 + .30*palm.z };
}
