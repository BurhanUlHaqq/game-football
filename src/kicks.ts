import { BALL_DAMPING, clamp, FIELD, GRAVITY, length } from './football';
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
