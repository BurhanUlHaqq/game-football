import { BALL, BALL_DAMPING, clamp, FIELD, GRAVITY } from './football';
import type { Point3, SaveMove } from './football';

export function readGoalThreat(ball: Point3, velocity: Point3, attack: number) {
  const closing = -velocity.x * attack;
  const distance = FIELD.x + ball.x * attack;
  if (closing < 4 || distance <= 0) return undefined;
  const travel = distance / closing;
  if (travel > 1.12) return undefined;
  const seconds = -Math.log1p(-BALL_DAMPING * travel) / BALL_DAMPING;
  const z = ball.z + velocity.z * travel;
  const height = Math.max(BALL, ball.y + velocity.y * travel - GRAVITY / BALL_DAMPING * (seconds - travel));
  if (Math.abs(z) > FIELD.goal + BALL * 0.25 || height > FIELD.bar + 0.1) return undefined;
  return { z, seconds };
}

export function saveMove(height: number, lateral: number): SaveMove {
  if (height < 0.76 && lateral < 0.82) return 'smother';
  if (height > 1.48) return 'tip';
  return lateral > 0.61 ? 'dive' : 'block';
}

export function diveReach(progress: number) {
  return Math.sin(Math.PI * clamp(progress, 0, 1));
}
