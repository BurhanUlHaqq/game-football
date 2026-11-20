import { BALL, BALL_DAMPING, clamp, FIELD, GRAVITY, length, mix } from './football';
import type { Point, Point3 } from './football';

export const LONG_PASS_RANGE = 13;
export const RECEIVE_HEIGHT = 0.56;

// Horizontal travel under linear damping and no contact with the pitch.
function airTravel(seconds: number) {
  return -Math.expm1(-BALL_DAMPING * seconds) / BALL_DAMPING;
}

export function loftVelocity(range: number, fromHeight: number, landingHeight: number, seconds: number) {
  const travel = airTravel(seconds);
  const drop = GRAVITY / BALL_DAMPING * (seconds - travel);
  return { speed: range / travel, lift: (landingHeight - fromHeight + drop) / travel };
}

function insidePitch(x: number, z: number): Point {
  return { x: clamp(x, -FIELD.x + 1.35, FIELD.x - 1.35), z: clamp(z, -FIELD.z + 1.25, FIELD.z - 1.25) };
}

export function leadReceiver(receiver: Point & { vx: number; vz: number }, seconds: number) {
  const lead = Math.min(seconds, 4.15 / Math.max(0.1, length(receiver.vx, receiver.vz)));
  return insidePitch(receiver.x + receiver.vx * lead, receiver.z + receiver.vz * lead);
}

export function descendingTarget(ball: Point3, velocity: Point3) {
  const height = ball.y - RECEIVE_HEIGHT;
  const time = (velocity.y + Math.sqrt(Math.max(0, velocity.y ** 2 + 2 * GRAVITY * height))) / GRAVITY;
  if (time < 0.22) return undefined;
  const travel = airTravel(Math.min(1.65, time));
  return insidePitch(ball.x + velocity.x * travel, ball.z + velocity.z * travel);
}

export type StrikeTechnique = 'push' | 'drive' | 'loft' | 'punt';
export type FootStrike = {
  technique: StrikeTechnique; contact: number; ankle: Point3; plant: Point; hip: number; scale: number;
};
const hipHeight = .87;
const legReach = .74;
const toe = .31;

export function bootContact(player: Point & { yaw: number }, ball: Point3, strike: FootStrike, side: number) {
  const dx = (ball.x - player.x) / strike.scale, dz = (ball.z - player.z) / strike.scale;
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  const bx = dx * cos - dz * sin, bz = dx * sin + dz * cos, by = ball.y / strike.scale;
  // Lofted balls are struck below centre. The instep cap and the sphere meet at this separation.
  const low = strike.technique === 'loft' || strike.technique === 'punt' ? .145 : .073;
  const byFoot = clamp(by - low - .033, .128, strike.technique === 'punt' ? .86 : .59);
  const dy = by - byFoot - .033;
  const gap = Math.sqrt(Math.max(0, (BALL / strike.scale) ** 2 - dy * dy));
  const hx = side * strike.hip, targetZ = bz - gap - toe;
  const reach = Math.min(1, legReach / Math.max(.001, Math.hypot(bx - hx, byFoot - hipHeight, targetZ)));
  const ankle = { x: hx + (bx - hx) * reach, y: hipHeight + (byFoot - hipHeight) * reach, z: targetZ * reach };
  const separation = Math.hypot(bx - ankle.x, by - ankle.y - .033, bz - ankle.z - toe) * strike.scale;
  return { ankle, touching: separation <= BALL + .065 && bz > .13 };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
export function swingingAnkle(strike: FootStrike, side: number, age: number, duration: number): Point3 {
  const { contact, ankle, technique } = strike;
  const hip = side * strike.hip, big = technique !== 'push';
  const back = { x: hip + side * .055, y: big ? .335 : .23, z: big ? -.38 : -.22 };
  const rest = { x: hip, y: .142, z: .015 };
  const through = { x: ankle.x + side * .04, y: big ? .49 : .26, z: ankle.z + (big ? .26 : .15) };
  const swing = big ? .135 : .105;
  let a = rest, b = back, t = age / Math.max(.01, contact - swing);
  if (age >= contact - swing && age < contact) { a = back; b = ankle; t = (age - contact + swing) / swing; }
  if (age >= contact) {
    const follow = (age - contact) / Math.max(.01, duration - contact);
    a = follow < .35 ? ankle : through; b = follow < .35 ? through : rest;
    t = follow < .35 ? follow / .35 : (follow - .35) / .65;
  }
  t = smooth(clamp(t, 0, 1));
  return { x: mix(a.x,b.x,t), y: mix(a.y,b.y,t), z: mix(a.z,b.z,t) };
}

export function strikeSpin(direction: Point, speed: number, technique: StrikeTechnique, side: number): Point3 {
  const rolling = technique === 'push' ? .80 : technique === 'drive' ? .18 : technique === 'loft' ? -.30 : -.43;
  const spin = speed / BALL * rolling;
  return { x: direction.z * spin, y: side * (technique === 'push' ? .55 : Math.min(5.5, speed * .19)), z: -direction.x * spin };
}

// The Magnus acceleration is perpendicular to the flight and fades as the ball loses spin.
export function spinAcceleration(v: Point3, w: Point3): Point3 {
  const x = w.y*v.z - w.z*v.y, y = w.z*v.x - w.x*v.z, z = w.x*v.y - w.y*v.x;
  const gain = Math.min(.0031, 2.5 / Math.max(.001, Math.hypot(x,y,z)));
  return { x: x*gain, y: y*gain, z: z*gain };
}
