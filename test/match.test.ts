import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, test } from 'node:test';
import { Vector3 } from 'three';
import { BALL, crossedGoal, dir, FIELD, formatTime, FULLTIME_BREAK, GOAL_BREAK, HALFTIME_BREAK, HALF_TICKS, KICKOFF_TICKS, MATCH_TICKS, other, STEP } from '../src/football';
import type { Point3 } from '../src/football';
import { fanAppearance } from '../src/arena-crowd';
import { Commentary } from '../src/commentary';
import { BroadcastCamera } from '../src/camera';
import { HEROES, HERO_SPOTLIGHT_ORDER } from '../src/heroes';
import { readGoalThreat, saveMove } from '../src/goalkeeping';
import { CAPTAINS, CAST, MatchShow, MIN_SETUP_TICKS } from '../src/show';
import { placePanel } from '../src/broadcast-layout';
import { ProductionLog, subtitles } from '../src/production';
import { ArenaShow, fanReaction } from '../src/arena-show';
import cues from '../src/commentary-cues.json';
import lines from '../src/commentary-lines.json';
import { initializePhysics, Match } from '../src/match';
import { loadCheckpoint, saveCheckpoint, savePreferences, settingsFrom } from '../src/settings';
import type { StorageAccess } from '../src/settings';

before(initializePhysics);

test('the arena board credits real saves, preserves goals, and shows the old fixture score at full time', () => {
  const arena = new ArenaShow();
  arena.react({ kind: 'match-start', tick: 52 });
  assert.equal(arena.get(54)?.title, 'KICKOFF');
  const save = arena.react({ kind: 'save', tick: 90, team: 1, player: 5, save: { move: 'tip', held: false } });
  assert.equal(save?.title, 'FINGERTIP SAVE');
  assert.equal(save.detail, 'Patch');
  assert.equal(arena.react({ kind: 'post', tick: 100 }), undefined);
  const goal = arena.react({ kind: 'goal', tick: 130, team: 0, player: 5, detail: 'Own goal' });
  assert.equal(goal?.title, 'OWN GOAL');
  assert.equal(goal.detail, undefined);
  assert.equal(arena.get(130 + GOAL_BREAK), undefined);
  const finish = arena.react({ kind: 'fulltime', tick: MATCH_TICKS, summary: { number: 1, scores: [2, 2], shots: [7, 7], saves: [4, 4] } });
  assert.equal(finish?.title, 'MATCH DRAWN');
  assert.deepEqual(finish.score, [2, 2]);
});

test('kickoff waves travel across the stands and a goal excites the scoring fans before the rivals', () => {
  const arena = new ArenaShow();
  const kickoff = arena.react({ kind: 'match-start', tick: 60 });
  assert.ok(fanReaction(kickoff, 86, 0, -20) > 0.4);
  assert.equal(fanReaction(kickoff, 86, 1, 20), 0);
  const goal = arena.react({ kind: 'goal', tick: 200, team: 1, player: 9, point: { x: 22, y: 0.27, z: 0 } });
  assert.ok(fanReaction(goal, 227, 1, 20) > 0.3);
  assert.ok(fanReaction(goal, 227, 0, -20) < 0);
  assert.ok(fanReaction(arena.react({ kind: 'post', tick: 450 }), 470, 0, 0) < 0);
});

function run(match: Match, ticks: number) { for (let i = 0; i < ticks; i++) match.step(); }
function untilLive(match: Match) {
  for (let i = 0; i <= 130 && match.state !== 'live'; i++) match.step();
  assert.equal(match.state, 'live');
}
function memory(): StorageAccess {
  const state = new Map<string, string>();
  return { getItem: key => state.get(key) ?? null, setItem: (key, value) => { state.set(key, value); }, removeItem: key => { state.delete(key); } };
}
function drive(match: Match, position: Point3, velocity: Point3) {
  match.ball.setTranslation(position, true);
  match.ball.setLinvel(velocity, true);
  match.currentBall = { ...position };
}

test('startup forms two directionally mirrored five-player rosters and continues automatically', () => {
  const match = new Match('formation');
  try {
    assert.equal(match.state, 'setup');
    assert.equal(match.players.length, 10);
    for (const team of [0, 1] as const) {
      const roster = match.players.filter(p => p.team === team);
      assert.equal(roster.filter(p => p.role === 'keeper').length, 1);
      assert.equal(roster.filter(p => p.role === 'captain').length, 1);
      assert.equal(new Set(roster.map(p => p.number)).size, 5);
      assert.ok(roster.every(p => p.home.x * dir(team) < 0));
    }
    run(match, 300);
    assert.equal(match.tick, 300);
    assert.ok(match.history.some(e => e.kind === 'kickoff'));
    assert.ok(match.resources().bodies === 11);
    assert.ok(match.players.filter(p => p.intent === 'press').length <= 2);
  } finally { match.dispose(); }
});

test('a complete swept crossing is required inside the opening in either direction', () => {
  const a = { x: 19, y: 0.65, z: 0 };
  const b = { x: 25, y: 0.65, z: 0 };
  assert.equal(crossedGoal(a, b), 0);
  assert.equal(crossedGoal({ ...a, x: -19 }, { ...b, x: -25 }), 1);
  assert.equal(crossedGoal(a, { ...b, x: FIELD.x + BALL - 0.02 }), null);
  assert.equal(crossedGoal({ ...a, z: 3.23 }, { ...b, z: 3.23 }), null);
  assert.equal(crossedGoal({ ...a, z: 4.1 }, { ...b, z: 4.1 }), null);
  assert.equal(crossedGoal({ ...a, y: 3.40 }, { ...b, y: 3.40 }), null);
  assert.equal(crossedGoal({ ...a, x: 23, z: 4.2 }, { ...b, x: 23 }), null);
  assert.equal(crossedGoal(b, { ...b, x: 24 }), null);
});

test('a physical high-speed own goal scores once, retires the ball, then kicks off for the conceding side', () => {
  const match = new Match('own-goal');
  try {
    untilLive(match);
    match.lastTouch = 9;
    drive(match, { x: FIELD.x - 0.26, y: 0.72, z: 2.49 }, { x: 43, y: 0, z: 0 });
    run(match, 2);
    assert.equal(match.state, 'goal');
    assert.deepEqual(match.scores, [1, 0]);
    const goal = match.history.find(e => e.kind === 'goal');
    assert.equal(goal?.detail, 'Own goal');
    assert.equal(goal.goalId, 1);
    assert.equal(match.ballVisible, false);
    assert.equal(match.ball.isEnabled(), false);
    assert.equal(match.restartTeam, 1);
    run(match, goal.tick + GOAL_BREAK - match.tick - 1);
    assert.equal(match.state, 'goal');
    assert.equal(match.ball.isEnabled(), false);
    match.step();
    assert.equal(match.state, 'kickoff');
    run(match, KICKOFF_TICKS);
    assert.equal(match.state, 'live');
    assert.equal(match.tick - goal.tick, GOAL_BREAK + KICKOFF_TICKS);
    assert.match(JSON.stringify(match.history.at(-1)), /"kind":"kickoff"/);
    assert.deepEqual(match.scores, [1, 0]);
    assert.equal(match.ball.isEnabled(), true);
  } finally { match.dispose(); }
});

test('Rapier CCD rebounds fast shots from posts, crossbars, boards and the back net', () => {
  const shots: Array<{ kind: 'post' | 'board'; position: Point3; velocity: Point3; axis: 'x' | 'z'; sign: number }> = [
    { kind: 'post', position: { x: 21.38, y: 1.0, z: FIELD.goal }, velocity: { x: 45, y: 0, z: 0 }, axis: 'x', sign: -1 },
    { kind: 'post', position: { x: 21.38, y: FIELD.bar, z: 0 }, velocity: { x: 45, y: 0, z: 0 }, axis: 'x', sign: -1 },
    { kind: 'board', position: { x: 2, y: 0.41, z: FIELD.z - 0.38 }, velocity: { x: 0, y: 0, z: 44 }, axis: 'z', sign: -1 },
    { kind: 'board', position: { x: FIELD.x + FIELD.net - 0.5, y: 1.25, z: 0 }, velocity: { x: 45, y: 0, z: 0 }, axis: 'x', sign: -1 },
    { kind: 'board', position: { x: FIELD.x + 1.4, y: 1.25, z: FIELD.goal - 0.49 }, velocity: { x: 0, y: 0, z: 42 }, axis: 'z', sign: -1 },
  ];
  for (const { kind, position, velocity, axis, sign } of shots) {
    const match = new Match(kind);
    try {
      untilLive(match);
      drive(match, position, velocity);
      run(match, 4);
      assert.deepEqual(match.scores, [0, 0]);
      assert.ok(match.ball.linvel()[axis] * sign > 0, `${JSON.stringify(position)} rebounded`);
      assert.ok(match.history.some(e => e.kind === kind));
    } finally { match.dispose(); }
  }
});

test('a fast low shot cannot tunnel through an outfield body', () => {
  const match = new Match('body');
  try {
    untilLive(match);
    const p = match.players[1];
    drive(match, { x: p.x - 1.18, y: 0.53, z: p.z }, { x: 67, y: 0, z: 0 });
    run(match, 3);
    assert.ok(match.ball.linvel().x < 3);
    assert.equal(match.lastTouch, p.id);
  } finally { match.dispose(); }
});

test('the keeper can gather a nearby loose ball and distributes it on a bounded timer', () => {
  const match = new Match('keeper-distribution');
  try {
    untilLive(match);
    const keeper = match.players[0];
    drive(match, { x: keeper.x + 0.91, y: BALL + 0.01, z: keeper.z }, { x: -2.1, y: 0, z: 0 });
    run(match, 2);
    assert.equal(match.owner?.id, keeper.id);
    for (let i = 0; i < 96 && match.stats.distributions === 0; i++) match.step();
    assert.equal(match.stats.distributions, 1);
    const { x, z } = match.ball.linvel();
    assert.ok(Math.hypot(x, z) > 6, `Distribution velocity ${x}, ${z}`);
    assert.ok(Math.abs(match.currentBall.x) < FIELD.x);
    assert.equal(match.owner, undefined);
    assert.equal(match.history.find(e => e.kind === 'distribution')?.player, keeper.id);
    assert.equal(match.state, 'live');
  } finally { match.dispose(); }
});

test('keepers read danger at either end and choose a save that fits the shot', () => {
  for (const attack of [1, -1]) {
    const onTarget = readGoalThreat({ x: -16 * attack, y: 1.2, z: 0.4 }, { x: -17 * attack, y: 1.5, z: 1.7 }, attack);
    assert.ok(onTarget && onTarget.seconds < 0.40 && onTarget.z > 0.4);
    assert.equal(readGoalThreat({ x: -16 * attack, y: 1.2, z: 4.4 }, { x: -17 * attack, y: 0.4, z: 1.7 }, attack), undefined);
    assert.equal(readGoalThreat({ x: -21 * attack, y: 3.4, z: 0 }, { x: -17 * attack, y: 0, z: 0 }, attack), undefined);
    assert.equal(readGoalThreat({ x: -16 * attack, y: 1.2, z: 0 }, { x: 17 * attack, y: 0, z: 0 }, attack), undefined);
  }
  assert.equal(saveMove(0.5, 0.35), 'smother');
  assert.equal(saveMove(1.25, 0.95), 'dive');
  assert.equal(saveMove(1.9, 0.53), 'tip');
  assert.equal(saveMove(1.23, 0.37), 'block');
});

test('a keeper can hold a low shot and tip a high shot back into play', () => {
  for (const [seed, through, expectedMove, held] of [['zeerush', 700, 'smother', true], ['cup-21', 190, 'tip', false]] as const) {
    const match = new Match(seed);
    try {
      let seen = false;
      for (let tick = 0; tick < through; tick++) {
        match.step();
        const save = match.events.find(event => event.kind === 'save' && event.save?.move === expectedMove);
        if (!save) continue;
        assert.equal(save.save?.held, held);
        assert.equal(match.players[save.player!].pose?.kind, expectedMove);
        assert.equal(match.owner?.id === save.player, held);
        assert.ok(match.ballVisible && match.ball.isEnabled());
        seen = true;
        break;
      }
      assert.ok(seen, `Expected ${expectedMove} in ${seed}`);
    } finally { match.dispose(); }
  }
});

test('escape, invalid state, and a stalled ball resolve in the world and preserve score', () => {
  const match = new Match('recovery');
  try {
    untilLive(match);
    drive(match, { x: 2, y: 4.6, z: FIELD.z + 1.02 }, { x: 12, y: 0, z: 4 });
    match.step();
    assert.equal(match.state, 'retrieval');
    untilLive(match);
    match.players[2].x = Number.NaN;
    match.step();
    assert.equal(match.state, 'fault');
    assert.ok(Number.isFinite(match.players[2].x));
    untilLive(match);
    drive(match, { x: Number.NaN, y: BALL, z: 0 }, { x: 0, y: 0, z: 0 });
    match.step();
    assert.equal(match.state, 'fault');
    untilLive(match);
    drive(match, { x: FIELD.x + 0.9, y: BALL + 0.01, z: 0 }, { x: 0, y: 0, z: 0 });
    run(match, 205);
    assert.equal(match.state, 'retrieval');
    untilLive(match);
    assert.equal(match.stats.recoveries, 4);
    assert.equal(match.stats.faults, 2);
    assert.ok(match.stats.peaks.fault <= 86);
    assert.deepEqual(match.scores, [0, 0]);
  } finally { match.dispose(); }
});

test('versioned goal checkpoint retains scores, time, random state and identity without replaying the goal', () => {
  const storage = memory();
  const matchURL = '?seed=save&teamA=Amber+FC';
  const settings = settingsFrom(`${matchURL}&session=resume`, storage);
  const match = new Match(settings.seed);
  try {
    untilLive(match);
    drive(match, { x: FIELD.x - 0.25, y: 0.92, z: -2.46 }, { x: 43, y: 0, z: 0 });
    run(match, 2);
    assert.equal(match.goalId, 1);
    saveCheckpoint(storage, match.checkpoint(settings));
    const saved = loadCheckpoint(storage, settings);
    assert.ok(saved);
    assert.equal(saved.random, match.random.state);
    const restored = new Match(settings.seed, saved);
    try {
      assert.equal(restored.tick, match.tick);
      assert.equal(restored.goalId, 1);
      untilLive(restored);
      assert.equal(restored.restartTeam, 1);
      assert.deepEqual(restored.scores, [1, 0]);
      assert.ok(!restored.history.some(e => e.kind === 'goal'));
    } finally { restored.dispose(); }
    assert.equal(loadCheckpoint(storage, { ...settings, session: 'new' }), undefined);
    assert.equal(loadCheckpoint(storage, settingsFrom(matchURL, storage)), undefined);
    assert.equal(loadCheckpoint(storage, settingsFrom('?seed=other&session=resume')), undefined);
    storage.setItem('zeerush.match.v2', JSON.stringify({ ...saved, goalId: 100 }));
    assert.equal(loadCheckpoint(storage, settings), undefined);
    storage.setItem('zeerush.match.v2', '/ broken json');
    assert.equal(loadCheckpoint(storage, settings), undefined);
  } finally { match.dispose(); }
});

test('settings validate runtime options and storage errors are survivable', () => {
  const store = memory();
  const saved = settingsFrom('?quality=low&audio=muted&fps=30', store);
  savePreferences(store, saved);
  const full = settingsFrom('?quality=high&hud=off&fps=60&seed=sunday-5&mode=debug&teamA=Amber+Runners', store);
  assert.deepEqual([full.quality, full.hud, full.fps, full.audio, full.mode, full.names[0]], ['high', 'off', 60, 'muted', 'debug', 'Amber Runners']);
  const bad = settingsFrom('?quality=broken&audio=-&fps=999&seed=%26&mode=wat&hud=skip&teamA=%3Cb%3E');
  assert.deepEqual([bad.quality, bad.fps, bad.seed, bad.audio, bad.mode, bad.hud, bad.names[0]], ['auto', 60, 'zeerush', 'auto', 'stream', 'minimal', 'ROUNDHOUSE FC']);
  assert.equal(settingsFrom('?commentary=off', store).commentary, 0);
  const noAccess = () => { throw new Error('access denied'); };
  const denied = { getItem: noAccess, setItem: noAccess, removeItem: noAccess };
  assert.equal(settingsFrom('', denied).quality, 'auto');
  assert.equal(loadCheckpoint(denied, { ...full, session: 'resume' }), undefined);
  assert.doesNotThrow(() => savePreferences(denied, full));
  assert.equal(formatTime(60 * (60 * 60 * 123 + 67)), '123:01:07');
});

test('seeded play generates football events for both sides with bounded match resources', () => {
  const a = new Match('zeerush');
  const b = new Match('zeerush');
  try {
    for (const match of [a, b]) run(match, 60 * 240);
    assert.deepEqual(a.stats, b.stats);
    assert.deepEqual(a.scores, b.scores);
    const s = a.stats;
    assert.ok(s.byTeam.every(t => t.passes > 10 && t.shots > 1 && t.saves > 0), JSON.stringify(s));
    assert.ok(s.distributions > 0 && s.interceptions > 5 && s.tackles > 3 && s.rebounds > 3 && s.possessionChanges > 12);
    assert.ok(a.scores[0] + a.scores[1] > 0);
    assert.equal(s.faults, 0);
    assert.ok(a.resources().history <= a.resources().eventLimit);
  } finally { a.dispose(); b.dispose(); }
});

test('halftime keeps the score and swaps physical ends before the other captain kicks off', () => {
  const match = new Match('swapping-ends');
  try {
    untilLive(match);
    match.tick = HALF_TICKS - 4;
    const start = match.firstKickoff;
    drive(match, { x: FIELD.x - 0.23, y: 0.73, z: 2.41 }, { x: 43, y: 0, z: 0 });
    run(match, 2);
    assert.deepEqual(match.scores, [1, 0]);
    run(match, 2);
    assert.equal(match.tick, HALF_TICKS);
    assert.equal(match.state, 'halftime');
    assert.equal(match.half, 2);
    assert.equal(match.restartTeam, other(start));
    assert.equal(match.attack(0), -1);
    assert.equal(match.players[0].home.x, 20.1);
    assert.deepEqual(match.history.at(-1)?.summary?.scores, [1, 0]);
    run(match, HALFTIME_BREAK + 37);
    assert.equal(match.state, 'live');
    assert.equal(match.history.at(-1)?.kind, 'half-start');
    assert.ok(match.players[0].x > 18 && match.players[5].x < -18);
    drive(match, { x: -FIELD.x + 0.23, y: 0.73, z: 2.41 }, { x: -43, y: 0, z: 0 });
    run(match, 2);
    assert.deepEqual(match.scores, [2, 0]);
    assert.equal(match.history.at(-1)?.side, -1);
  } finally { match.dispose(); }
});

test('the 20-minute whistle records one final result and starts a new scoreboard without replaying a result on resume', () => {
  const settings = settingsFrom('?seed=new-fixture&session=resume');
  const match = new Match(settings.seed);
  const storage = memory();
  try {
    untilLive(match);
    match.tick = HALF_TICKS - 1;
    run(match, HALFTIME_BREAK + 38);
    drive(match, { x: -FIELD.x + 0.23, y: 0.74, z: 2.23 }, { x: -43, y: 0, z: 0 });
    run(match, 2);
    assert.deepEqual(match.scores, [1, 0]);
    match.tick = MATCH_TICKS - 1;
    match.step();
    assert.equal(match.state, 'fulltime');
    assert.equal(match.number, 2);
    assert.equal(match.matchTicks, 0);
    assert.equal(match.half, 1);
    assert.deepEqual(match.scores, [0, 0]);
    assert.deepEqual(match.seriesGoals, [1, 0]);
    assert.deepEqual(match.wins, [1, 0]);
    assert.deepEqual(match.history.at(-1)?.summary?.scores, [1, 0]);
    saveCheckpoint(storage, match.checkpoint(settings));
    const saved = loadCheckpoint(storage, settings);
    assert.ok(saved);
    const restored = new Match(settings.seed, saved);
    try {
      untilLive(restored);
      assert.deepEqual(restored.wins, [1, 0]);
      assert.deepEqual(restored.scores, [0, 0]);
      assert.equal(restored.number, 2);
      assert.ok(!restored.history.some(e => e.kind === 'fulltime'));
    } finally { restored.dispose(); }
    run(match, FULLTIME_BREAK - 1);
    assert.equal(match.state, 'fulltime');
    assert.equal(match.ball.isEnabled(), false);
    match.step();
    assert.equal(match.state, 'kickoff');
    run(match, KICKOFF_TICKS);
    assert.equal(match.tick, MATCH_TICKS + FULLTIME_BREAK + KICKOFF_TICKS);
    assert.equal(match.state, 'live');
    assert.equal(match.history.at(-1)?.kind, 'match-start');
    assert.equal(match.history.filter(e => e.kind === 'fulltime').length, 1);
    assert.equal(match.restartTeam, other(match.firstKickoff));
  } finally { match.dispose(); }
});

test('commentary reacts to goals and periods while suppressing continuous play-by-play chatter', () => {
  const radio = new Commentary();
  assert.equal(radio.react({ kind: 'match-start', tick: 52 }, [0, 0])?.id, 'boothHello');
  assert.equal(radio.react({ kind: 'pass', tick: 82 }, [0, 0]), undefined);
  assert.equal(radio.react({ kind: 'goal', tick: 240, goalId: 1 }, [1, 0])?.id, 'goalTwo');
  assert.equal(radio.react({ kind: 'goal', tick: 270, goalId: 2 }, [1, 1])?.id, 'equalizer');
  assert.equal(radio.react({ kind: 'halftime', tick: HALF_TICKS }, [1, 1])?.id, 'halfTime');
  assert.equal(radio.react({ kind: 'fulltime', tick: MATCH_TICKS }, [0, 0])?.id, 'finalDraw');
  assert.equal(radio.countdown(MATCH_TICKS * 2 - 3600)?.id, 'lastMinute');
});

test('each booth setup gets its own recorded answer from the other host after the clip ends', () => {
  for (const [id, line] of Object.entries(lines)) {
    if (!('answer' in line)) continue;
    const answer = lines[line.answer as keyof typeof lines];
    assert.ok(answer && line.voice !== answer.voice, id);
  }
  const radio = new Commentary();
  const play = { kind: 'post', player: 7, tick: 620 } as const;
  const opening = radio.react(play, [0, 0]);
  assert.equal(opening?.id, 'postBooth');
  assert.equal(opening.host, 'MICK');
  const due = play.tick + opening.ticks;
  assert.equal(radio.advanceBooth(due - 1, true), undefined);
  assert.equal(radio.react({ kind: 'pass', tick: due }, [0, 0]), undefined);
  const reply = radio.advanceBooth(due, true);
  assert.equal(reply?.id, lines.postBooth.answer);
  assert.equal(reply.host, 'EMMA');
  assert.deepEqual(reply.exchange, { opening: opening.id, reply: true, player: 7, opponent: undefined });
  assert.equal(radio.advanceBooth(due + 1, true), undefined);
});

test('announcer variants rotate and name the actual player, save or delivery', () => {
  const score: [number, number] = [1, 0];
  const radio = new Commentary();
  const pass = { kind: 'pass', player: 7, tick: 1200, flight: { style: 'ground', to: { x: 1, z: 0 }, range: 6, seconds: .5, receiver: 8 } } as const;
  assert.equal(radio.react(pass, score)?.id, 'dashPass');
  assert.equal(radio.react({ ...pass, tick: 2200 }, score)?.id, 'dashPassAlt1');
  const tip = new Commentary().react({ kind: 'save', tick: 880, player: 5, save: { move: 'tip', held: false } }, score);
  assert.equal(tip?.id, 'tipSave');
  assert.equal(new Commentary().react({ ...pass, flight: { ...pass.flight, style: 'switch' } }, score)?.id, 'switchBooth');
  assert.equal(new Commentary().react({ kind: 'goal', tick: 600, player: 7, goalId: 1 }, score)?.id, 'dashGoal');
});

test('goals, dead balls and missed reply windows cancel an unfinished booth joke', () => {
  const radio = new Commentary();
  const score: [number, number] = [0, 0];
  assert.equal(radio.react({ kind: 'post', tick: 620 }, score)?.id, 'postBooth');
  assert.equal(radio.react({ kind: 'goal', tick: 664, goalId: 1, team: 0 }, [1, 0])?.id, 'goalTwo');
  assert.equal(radio.advanceBooth(950, true), undefined);
  assert.equal(radio.react({ kind: 'post', tick: 2200 }, score)?.id, 'post');
  assert.equal(radio.react({ kind: 'post', tick: 4050 }, score)?.id, 'postBoothAlt1');
  assert.equal(radio.advanceBooth(4051, false), undefined);
  assert.equal(radio.advanceBooth(4240, true), undefined);
  const next = radio.react({ kind: 'post', tick: 8050 }, score);
  assert.ok(next?.exchange);
  assert.equal(radio.advanceBooth(8050 + next.ticks + 31, true), undefined);
});

test('capture markers preserve recording time, credits and full-time score at the fixture reset', () => {
  const capture = new ProductionLog('midnight-cup', ['Roundhouse FC', 'Scruff FC']);
  const current = { now: 1700, tick: 440, match: 1, matchTicks: 440, score: [1, 0] as [number, number] };
  capture.begin(400, 1000);
  capture.event({ kind: 'goal', tick: 440, team: 0, player: 3 }, current);
  capture.event({ kind: 'fulltime', tick: MATCH_TICKS, team: 0, summary: {
    number: 1, scores: [3, 2], shots: [14, 10], saves: [4, 5],
  } }, { ...current, now: 6000, tick: MATCH_TICKS, match: 2, matchTicks: 0, score: [0, 0] });
  const result = capture.snapshot(6200, true);
  assert.ok(result);
  assert.equal(result.startTick, 400);
  assert.deepEqual(result.markers.map(mark => [mark.recordingSeconds, mark.kind, mark.match, mark.matchSeconds, mark.score]), [
    [0.7, 'goal', 1, 7.333, [1, 0]], [5, 'fulltime', 1, 1200, [3, 2]],
  ]);
  assert.equal(result.markers[0].player?.name, 'Doodle');
  assert.equal(capture.snapshot(10000)?.durationSeconds, 5.2);
});

test('subtitles credit booth hosts and a finished exchange retains the players involved in the play', () => {
  const capture = new ProductionLog('zeerush', ['Roundhouse FC', 'Scruff FC']);
  const radio = new Commentary();
  const stamp = (tick: number) => ({ now: 1000 + tick * 1000 / 60, tick, match: 1, matchTicks: tick, score: [0, 0] as [number, number] });
  capture.begin(0, 1000);
  const call = radio.react({ kind: 'tackle', tick: 60, player: 7, opponent: 4 }, [0, 0]);
  assert.ok(call?.exchange);
  const due = 60 + call.ticks;
  capture.call(call, stamp(60), due, false);
  capture.markAudible(call.id);
  const reply = radio.advanceBooth(due, true);
  assert.ok(reply?.exchange?.reply);
  capture.call(reply, stamp(due), due + reply.ticks, true);
  capture.advance(due + 1, stamp(due + 1).now);
  assert.equal(capture.snapshot(stamp(due + 1).now)?.markers.length, 0);
  const end = due + reply.ticks;
  capture.advance(end, stamp(end).now);
  const result = capture.snapshot(stamp(end).now, true);
  assert.ok(result);
  assert.deepEqual(result.markers[0].hosts, [call.host, reply.host]);
  assert.deepEqual([result.markers[0].player?.name, result.markers[0].opponent?.name], ['Dash', 'Boulder']);
  assert.equal(result.captions[0].listener, reply.host);
  assert.equal(result.captions[0].audible, true);
  assert.ok(subtitles(result.captions).includes(call.host + ': ' + call.text));
});

test('each commentary line has a non-silent cue within the bundled PCM track', () => {
  const track = readFileSync(new URL('../public/voice/rush-radio.wav', import.meta.url));
  assert.equal(track.toString('ascii', 0, 4), 'RIFF');
  assert.equal(track.toString('ascii', 8, 12), 'WAVE');
  assert.equal(track.readUInt16LE(22), 1);
  assert.equal(track.readUInt16LE(34), 16);
  const rate = track.readUInt32LE(24);
  const bytes = track.readUInt32LE(40);
  assert.equal(track.length, 44 + bytes);
  assert.deepEqual(Object.keys(cues), Object.keys(lines));
  const captions = Object.values(lines).map(line => line.text);
  assert.ok(captions.length > 400);
  assert.deepEqual([...new Set(Object.values(lines).map(line => line.voice))].sort(), ['am_michael', 'bf_emma']);
  assert.equal(new Set(captions).size, captions.length);
  let cursor = 0;
  for (const [offset, duration] of Object.values(cues)) {
    const start = Math.round(offset * rate);
    const end = start + Math.round(duration * rate);
    assert.equal(start, cursor);
    assert.ok(duration > 0.3 && duration < 6 && end * 2 <= bytes);
    let peak = 0;
    for (let frame = start; frame < end; frame++) peak = Math.max(peak, Math.abs(track.readInt16LE(44 + frame * 2)));
    assert.ok(peak > 5000);
    cursor = end;
  }
  assert.equal(cursor * 2, bytes);
});

test('real play events trigger distinctive captain gestures and retain one actual highlight per half', () => {
  const show = new MatchShow();
  assert.deepEqual(CAPTAINS.map(id => CAST[id]), ['Boulder', 'Zip']);
  show.react({ kind: 'match-start', tick: 52 }, [0, 0]);
  assert.equal(show.getGesture(CAPTAINS[0], 62)?.kind, 'greet');
  show.react({ kind: 'shot', tick: 210, player: CAPTAINS[0] }, [0, 0]);
  assert.equal(show.getGesture(CAPTAINS[0], 220)?.kind, 'expect');
  const save = show.react({ kind: 'save', tick: 299, player: 5, opponent: CAPTAINS[0], team: 1 }, [0, 0]);
  assert.equal(save?.joke, 'stretch');
  assert.equal(show.getGesture(CAPTAINS[0], 323)?.kind, 'stretch');
  assert.equal(show.getGesture(5, 326)?.kind, 'glove-twirl');
  assert.equal(show.react({ kind: 'save', tick: 450, player: 5, opponent: CAPTAINS[0], team: 1 }, [0, 0])?.callback, true);
  const post = show.react({ kind: 'post', tick: 2800, player: CAPTAINS[1], team: 1 }, [0, 0]);
  assert.equal(post?.joke, 'double-take');
  assert.equal(show.getGesture(CAPTAINS[1], 2840)?.kind, 'double-take');
  const steal = show.react({ kind: 'tackle', tick: 5800, player: CAPTAINS[1], opponent: CAPTAINS[0], team: 1 }, [0, 0]);
  assert.equal(steal?.kind, 'steal');
  assert.equal(show.getGesture(CAPTAINS[0], 5830)?.kind, 'look-around');
  assert.equal(show.takeHighlight(false, HALF_TICKS), post);
  assert.equal(show.highlight, undefined);
  assert.equal(show.getGesture(CAPTAINS[0], 5830), undefined);
});

test('only the scoring side gets the goal routine and it finishes before kickoff', () => {
  const show = new MatchShow();
  const tick = 450;
  show.react({ kind: 'goal', tick, team: 0, player: 2 }, [1, 0]);
  assert.deepEqual(show.getCelebration(tick), { kind: 'goal', tick, until: tick + GOAL_BREAK, team: 0, lead: 2 });
  assert.equal(show.getGesture(2, tick + 10)?.kind, 'double-hop');
  assert.equal(show.getGesture(4, tick + 20)?.kind, 'fist-pump');
  assert.equal(show.getGesture(9, tick + 20), undefined);
  assert.equal(show.getGesture(2, tick + 105)?.kind, 'two-hand-wave');
  assert.equal(show.getGesture(2, tick + 190)?.kind, 'double-hop');
  assert.equal(show.getCelebration(tick + GOAL_BREAK), undefined);
  assert.equal(show.getGesture(2, tick + GOAL_BREAK), undefined);

  const equalizer = tick + 300;
  const ownGoal = show.react({ kind: 'goal', tick: equalizer, team: 1, player: 4, detail: 'Own goal' }, [1, 1]);
  assert.equal(ownGoal?.player, undefined);
  assert.deepEqual(show.getCelebration(equalizer), { kind: 'goal', tick: equalizer, until: equalizer + GOAL_BREAK, team: 1, lead: CAPTAINS[1] });
  assert.equal(show.getGesture(CAPTAINS[1], equalizer + 20)?.kind, 'victory-twirl');
  assert.equal(show.getGesture(6, equalizer + 20)?.kind, 'two-hand-wave');
  assert.equal(show.getGesture(4, equalizer + 20), undefined);
  show.takeHighlight(false, equalizer + 40);
  assert.equal(show.getCelebration(equalizer + 40), undefined);
});

test('full time celebrates the winner or waves from both teams on a draw before kickoff', () => {
  const show = new MatchShow();
  const tick = MATCH_TICKS;
  show.react({ kind: 'fulltime', tick, team: 1, summary: { number: 1, scores: [1, 2], shots: [4, 4], saves: [0, 0], standout: 4 } }, [0, 0]);
  assert.equal(show.getCelebration(tick)?.lead, CAPTAINS[1]);
  assert.equal(show.getGesture(9, tick + 20)?.kind, 'victory-twirl');
  assert.equal(show.getGesture(4, tick + 20), undefined);
  assert.equal(show.getGesture(9, tick + FULLTIME_BREAK - 20)?.kind, 'two-hand-wave');
  assert.equal(show.getGesture(4, tick + FULLTIME_BREAK - 20)?.kind, 'two-hand-wave');
  assert.equal(show.getCelebration(tick + FULLTIME_BREAK), undefined);

  show.react({ kind: 'fulltime', tick: tick * 2 }, [0, 0]);
  assert.equal(show.getCelebration(tick * 2)?.lead, undefined);
  assert.equal(show.getGesture(4, tick * 2 + 20)?.kind, 'two-hand-wave');
  assert.equal(show.getGesture(9, tick * 2 + 20)?.kind, 'two-hand-wave');
});

test('named calls use true event context and limit ordinary shot commentary', () => {
  const show = new MatchShow();
  const commentary = new Commentary();
  const score: [number, number] = [0, 0];
  const save = { kind: 'save', tick: 600, player: 5, opponent: 4, team: 1 } as const;
  show.react({ kind: 'shot', tick: 510, player: 4, team: 0 }, score);
  const reaction = show.react(save, score);
  assert.equal(commentary.react(save, score, reaction)?.id, 'boulderStretch');
  const secondSave = { ...save, tick: 1340 };
  const repeat = commentary.react(secondSave, score, show.react(secondSave, score));
  assert.equal(repeat?.id, 'patchAgain');
  assert.ok(repeat.host === 'MICK' || repeat.host === 'EMMA');
  const shot = { kind: 'shot', tick: 2800, player: 9, team: 1 } as const;
  assert.equal(commentary.react(shot, score)?.id, 'zipShot');
  assert.equal(commentary.react({ ...shot, tick: 3410 }, score), undefined);
  const goal = { kind: 'goal', tick: 4950, player: 4, team: 0 } as const;
  assert.equal(commentary.react(goal, [1, 0], show.react(goal, [1, 0]))?.id, 'boulderPayback');
});

test('a fast save gets a gesture and a booth call and a standout save can outrank a routine goal', () => {
  const score: [number, number] = [1, 0];
  const show = new MatchShow();
  const commentary = new Commentary();
  show.react({ kind: 'goal', tick: 220, player: 4, team: 0 }, score);
  show.react({ kind: 'shot', tick: 600, player: 9, team: 1 }, score);
  const save = { kind: 'save', tick: 600 + MIN_SETUP_TICKS, player: 0, opponent: 9, team: 0 } as const;
  const reaction = show.react(save, score);
  assert.equal(reaction?.joke, 'wave');
  assert.equal(show.getGesture(9, save.tick + 4)?.kind, 'wave');
  assert.equal(show.getGesture(0, save.tick + 20)?.kind, 'glove-pat');
  assert.equal(commentary.react(save, score, reaction)?.id, 'zipWave');
  assert.equal(show.takeHighlight(false, HALF_TICKS)?.kind, 'save');
  assert.equal(commentary.react({ kind: 'halftime', tick: HALF_TICKS }, score, undefined, reaction)?.id, 'saveReplay');
});

test('recaps wait for a restart and count only verified stops by the opposing keeper', () => {
  const show = new MatchShow();
  const commentary = new Commentary();
  const score: [number, number] = [0, 0];
  show.react({ kind: 'save', tick: 260, player: 5, opponent: 4, team: 1 }, score);
  show.react({ kind: 'save', tick: 450, player: 0, opponent: 8, team: 0 }, score);
  show.react({ kind: 'pass', tick: 3579, player: 4, team: 0 }, score);
  assert.equal(show.recap, undefined);
  const restart = { kind: 'distribution', tick: 3580, player: 5, team: 1 } as const;
  show.react(restart, score);
  assert.deepEqual(show.recap, { tick: 3580, until: 3810, player: 4, keeper: 5, saves: 1 });
  assert.equal(commentary.react(restart, score, undefined, undefined, show.recap)?.id, 'boulderPatchRecap');
  show.react({ kind: 'kickoff', tick: 7900, team: 0 }, score);
  assert.deepEqual(show.recap, { tick: 7900, until: 8130, player: 9, keeper: undefined, saves: undefined });
});

test('each player has a distinct profile and the live spotlight cycles through the whole roster', () => {
  assert.equal(HEROES.length, 10);
  assert.equal(new Set(HEROES.map(hero => hero.name)).size, 10);
  assert.equal(new Set(HEROES.map(hero => hero.gear)).size, 10);
  assert.equal(new Set(HEROES.map(hero => JSON.stringify(hero.face.head))).size, 10);
  assert.equal(new Set(HEROES.map(hero => hero.fur)).size, 10);
  const show = new MatchShow();
  const score: [number, number] = [0, 0];
  show.react({ kind: 'save', tick: 198, player: 0, opponent: 6, team: 0 }, score);
  show.react({ kind: 'save', tick: 766, player: 0, opponent: 8, team: 0 }, score);
  show.react({ kind: 'pass', tick: 1790, player: 8, team: 1 }, score);
  const featured = [];
  for (let i = 0; i < HEROES.length; i++) {
    show.react({ kind: 'kickoff', tick: (59 + 65 * i) * 60 }, score);
    featured.push(show.recap?.player);
    if (show.recap?.player === 0) assert.equal(show.recap.activity, 2);
    if (show.recap?.player === 8) assert.equal(show.recap.activity, 1);
  }
  assert.deepEqual(featured, HERO_SPOTLIGHT_ORDER);
  assert.equal(new Set(featured).size, HEROES.length);
});

test('spectator seats get stable and distinct combinations of clothes, faces and headwear', () => {
  const cast = Array.from({ length: 1024 }, (_, index) => fanAppearance(index, index % 2 === 0 ? 0 : 1));
  assert.deepEqual(cast[83], fanAppearance(83, 1));
  assert.equal(new Set(cast.map(style => JSON.stringify(style))).size, cast.length);
  assert.equal(new Set(cast.map(style => style.hat)).size, 8);
});

test('phone cards move away from a shielded ball or player and keep a safe placement', () => {
  const phone = { x: 0, y: 0, width: 390, height: 220 };
  const panel = { width: 160, height: 37 };
  const bottom = placePanel(phone, panel, [], 0);
  assert.equal(bottom?.index, 0);
  const blockers = [{ x: 185, y: 180, width: 22, height: 22 }, { x: 307, y: 142, width: 24, height: 30 }];
  const moved = placePanel(phone, panel, blockers, 0, bottom?.index);
  assert.equal(moved?.index, 2);
  assert.equal(placePanel(phone, panel, [], 0, moved?.index)?.index, moved?.index);
  assert.equal(placePanel(phone, panel, [phone], 0), undefined);
});

test('the action camera keeps the ball, shot taker, and keeper in frame at either end', () => {
  const match = new Match('camera');
  try {
    untilLive(match);
    const camera = new BroadcastCamera();
    const show = new MatchShow();
    match.owner = undefined;
    for (const [direction, shooter, keeper] of [[1, 4, 5], [-1, 9, 0]] as const) {
      match.currentBall = { x: direction * 16.3, y: BALL, z: 2.5 };
      match.players[shooter].x = direction * 11.1;
      match.players[shooter].z = 3.9;
      camera.react({ kind: 'shot', team: match.players[shooter].team, tick: match.tick, player: shooter, side: direction });
      for (const aspect of [16 / 9, 390 / 844]) {
        camera.resize(aspect);
        for (let i = 0; i < 90; i++) camera.update(match, STEP, show);
        assert.equal(camera.mode, 'attack');
        if (aspect > 1) assert.ok(camera.scale < 0.76);
        camera.camera.updateMatrixWorld();
        for (const { x, z } of [match.currentBall, match.players[shooter], match.players[keeper]]) {
          const p = new Vector3(x, 1, z).project(camera.camera);
          assert.ok(Math.abs(p.x) < 0.95 && Math.abs(p.y) < 0.95, `Actor or ball clipped at aspect ${aspect}`);
        }
      }
    }
  } finally { match.dispose(); }
});

test('nearby participants get a tighter two-player frame in the live stream and vertical recording', () => {
  const match = new Match('camera-conversation');
  try {
    untilLive(match);
    const speaker = match.players[2], listener = match.players[7];
    Object.assign(speaker, { x: -2.1, z: 0.8 });
    Object.assign(listener, { x: 2.0, z: -0.7 });
    match.owner = speaker;
    match.currentBall = { x: -1.6, y: BALL, z: 0.1 };
    const show = new MatchShow();
    for (const aspect of [16 / 9, 9 / 16]) {
      const camera = new BroadcastCamera();
      camera.production = aspect < 1;
      camera.resize(aspect);
      camera.react({ kind: 'tackle', tick: match.tick, player: speaker.id, opponent: listener.id });
      camera.update(match, STEP, show);
      assert.equal(camera.mode, 'two-player');
      assert.deepEqual(camera.subjects, [speaker.id, listener.id]);
      for (const player of [speaker, listener]) {
        const feet = new Vector3(player.x, 0, player.z).project(camera.camera);
        const head = new Vector3(player.x, 2.85, player.z).project(camera.camera);
        assert.ok(head.y - feet.y > 0.39, 'Both players read at more than 19.5% of frame height');
        assert.ok(Math.abs(head.x) < 0.88 && head.y < 0.7);
      }
      const ball = new Vector3(match.currentBall.x, BALL, match.currentBall.z).project(camera.camera);
      assert.ok(Math.abs(ball.x) < 0.9 && ball.y > -0.47 && ball.y < 0.7, 'The ball stays visible through the conversation');
    }
  } finally { match.dispose(); }
});

test('a lofted switch reaches the running recipient and both endpoints fit the phone camera', () => {
  const match = new Match('cup-13');
  const camera = new BroadcastCamera();
  const vertical = new BroadcastCamera();
  const show = new MatchShow();
  camera.resize(390 / 220);
  vertical.resize(9 / 16);
  vertical.production = true;
  try {
    let highest = 0;
    let received = false;
    // This fixture creates a switch from one wing to the other in its opening minute.
    let receiving: { id: number; tick: number } | undefined;
    for (let i = 0; i < 2400 && !received; i++) {
      match.step();
      for (const event of match.events) {
        camera.react(event);
        vertical.react(event);
        if (event.kind !== 'pass' || event.flight?.style !== 'switch' || event.flight.receiver === undefined || !event.point) continue;
        assert.ok(Math.abs(event.point.z - event.flight.to.z) > 10);
        assert.ok(event.flight.range > 13);
        receiving = { id: event.flight.receiver, tick: event.tick };
        highest = 0;
      }
      camera.update(match, STEP, show);
      const previousScale = vertical.scale;
      const previousMode = vertical.mode;
      vertical.update(match, STEP, show);
      if (receiving === undefined) continue;
      highest = Math.max(highest, match.currentBall.y);
      if (match.flight?.style === 'switch' && highest > 1.55) {
        assert.equal(camera.mode, 'long-ball');
        assert.equal(vertical.mode, 'long-ball');
        if (previousMode !== 'stadium') assert.ok(vertical.scale / previousScale < 1.14, 'The vertical camera eases out into the flight');
        const tallBall = new Vector3(match.currentBall.x, match.currentBall.y, match.currentBall.z).project(vertical.camera);
        assert.ok(Math.abs(tallBall.x) < 0.9 && tallBall.y > -0.45 && tallBall.y < 0.7);
        camera.camera.updateMatrixWorld();
        for (const { x, y, z } of [match.currentBall, { ...match.flight.to, y: BALL }]) {
          const pixel = new Vector3(x, y, z).project(camera.camera);
          assert.ok(Math.abs(pixel.x) < 1 && Math.abs(pixel.y) < 1);
        }
      }
      if (match.owner) {
        received = match.owner.id === receiving.id && match.tick - receiving.tick < 110 && highest > 1.85;
        receiving = undefined;
      }
    }
    assert.ok(received);
  } finally { match.dispose(); }
});
