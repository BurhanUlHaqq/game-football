import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { initializePhysics, Match } from '../src/match';
import { FULLTIME_BREAK, GOAL_BREAK, HALFTIME_BREAK, HALF_TICKS, MATCH_TICKS } from '../src/football';

const seeds = ['zeerush', 'after-school', 'midnight-cup'];
const hours = Number(process.argv[2] ?? 2);
assert.ok(Number.isFinite(hours) && hours > 0 && hours <= 24, 'Pass simulated hours per seed between 0 and 24.');
await initializePhysics();
const results = [];
for (const seed of seeds) {
  const start = performance.now();
  const match = new Match(seed);
  const base = match.resources();
  const totals: Record<string, number> = {};
  const recoveries: Record<string, number> = {};
  const takes = Math.floor(hours * 3600 * 60);
  let longestBetweenGoals = 0;
  let lastGoal = 0;
  let halftimes = 0;
  let fulltimes = 0;
  for (let i = 0; i < takes; i++) {
    match.step();
    totals[match.state] = (totals[match.state] ?? 0) + 1;
    for (const event of match.events) {
      if (event.kind === 'goal') { longestBetweenGoals = Math.max(longestBetweenGoals, i - lastGoal); lastGoal = i; }
      if (event.kind === 'recovery' && event.detail) recoveries[event.detail] = (recoveries[event.detail] ?? 0) + 1;
      if (event.kind === 'halftime') { assert.equal(event.tick % MATCH_TICKS, HALF_TICKS); halftimes++; }
      if (event.kind === 'fulltime') { assert.equal(event.tick % MATCH_TICKS, 0); fulltimes++; }
    }
    assert.ok(i - lastGoal < 15 * 60 * 60, `${seed} exceeded 15 minutes without a goal`);
  }
  const resources = match.resources();
  const stateSeconds = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v / 60]));
  const row = { seed, ticks: match.tick, simulatedSeconds: match.tick / 60, wallSeconds: (performance.now() - start) / 1000,
    score: [...match.seriesGoals], wins: [...match.wins], draws: match.draws, halftimes, fulltimes, ...match.stats,
    longestGoalGapSeconds: Math.max(longestBetweenGoals, takes - lastGoal) / 60, stateSeconds, recoveryReasons: recoveries, resources };
  results.push(row);
  console.log(JSON.stringify(row));
  assert.equal(resources.bodies, base.bodies);
  assert.equal(resources.colliders, base.colliders);
  assert.ok(resources.history <= resources.eventLimit);
  assert.equal(match.stats.faults, 0);
  assert.ok(match.stats.maxTemporaryTicks <= Math.max(FULLTIME_BREAK, GOAL_BREAK, HALFTIME_BREAK));
  assert.ok(match.stats.peaks.goal <= GOAL_BREAK && match.stats.peaks.fulltime <= FULLTIME_BREAK && match.stats.peaks.halftime <= HALFTIME_BREAK);
  assert.equal(match.goalId, match.seriesGoals[0] + match.seriesGoals[1]);
  assert.equal(fulltimes, Math.floor(takes / MATCH_TICKS));
  assert.equal(fulltimes, match.wins[0] + match.wins[1] + match.draws);
  assert.equal(halftimes, Math.floor((takes + HALF_TICKS) / MATCH_TICKS));
  const ratio = (a: number, b: number) => Math.min(a, b) / Math.max(1, a, b);
  if (hours >= 0.2) {
    assert.ok(ratio(row.score[0], row.score[1]) > .35, `${seed} scoring was one-sided`);
    assert.ok(ratio(row.byTeam[0].shots, row.byTeam[1].shots) > .54, `${seed} shooting was one-sided`);
    assert.ok(row.interceptions > 10 && row.saves > 10 && row.distributions > 10 && row.passes > 20);
  }
  match.dispose();
}
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/stress.json', JSON.stringify({ node: process.version, platform: `${process.platform} ${process.arch}`, seeds, totalSimulatedHours: hours * seeds.length, results }, null, 2));
