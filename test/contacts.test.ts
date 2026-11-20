import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { BALL, GRAVITY, STEP } from '../src/football';
import { gloveContact, keeperGlove, keeperMotion, planSave } from '../src/goalkeeping';
import { bootContact, spinAcceleration, strikeSpin, swingingAnkle, type FootStrike } from '../src/kicks';
import { initializePhysics, Match } from '../src/match';

before(initializePhysics);

test('a strike reaches the football on the contact frame with either foot and rejects unreachable balls', () => {
  for (const side of [-1, 1]) {
    const player = { x: 4, z: -2, yaw: Math.PI/2 };
    const ball = { x: 4.72, y: BALL, z: -2-side*.25 };
    const strike: FootStrike = { technique: 'drive', hip: .25, scale: 1, contact: .27, plant: player, ankle: ball };
    const contact = bootContact(player, ball, strike, side);
    assert.equal(contact.touching, true);
    strike.ankle = contact.ankle;
    assert.deepEqual(swingingAnkle(strike, side, strike.contact, .6), contact.ankle);
    assert.ok(swingingAnkle(strike, side, .12, .6).z < 0);
    assert.ok(swingingAnkle(strike, side, .37, .6).z > contact.ankle.z);
    for (const outside of [{ ...ball, x: 5.7 }, { ...ball, x: 3.6 }, { ...ball, y: 1.4 }]) {
      assert.equal(bootContact(player, outside, strike, side).touching, false);
    }
  }
});

test('ground passes roll forward and lofted kicks have backspin and bounded lift', () => {
  for (const x of [-1, 1]) {
    const push = strikeSpin({ x, z: 0 }, 14, 'push', 1);
    const loft = strikeSpin({ x, z: 0 }, 16, 'loft', 1);
    const punt = strikeSpin({ x, z: 0 }, 19, 'punt', -1);
    assert.ok(push.z*x < 0 && loft.z*x > 0 && punt.z*x > loft.z*x);
    const velocity = { x: x*19, y: 4, z: 0 };
    const lift = spinAcceleration(velocity, punt);
    assert.ok(lift.y > 0 && Math.hypot(lift.x, lift.y, lift.z) < 2.51);
    assert.ok(Math.abs(lift.x*velocity.x + lift.y*velocity.y) < 1e-6);
  }
});

test('keeper takeoff, descent and landing conserve lateral travel at either end', () => {
  for (const attack of [-1, 1]) {
    const keeper = { x: -20*attack, z: 0 };
    const save = planSave(keeper, { seconds: .30, y: 2.24, z: 1.55 }, attack, true, 27)!;
    const apex = save.up/GRAVITY;
    assert.equal(keeperMotion(save, save.load/2).y, 0);
    assert.ok(keeperMotion(save, save.load/2).crouch > .95);
    assert.ok(keeperMotion(save, save.load+apex).y > .55);
    assert.ok(Math.abs(keeperMotion(save, save.load+apex/2).y - keeperMotion(save, save.load+1.5*apex).y) < 1e-6);
    const landed = keeperMotion(save, save.load+save.air);
    const recovered = keeperMotion(save, save.duration);
    assert.ok(landed.y < .00001 && recovered.y < .00001 && recovered.z >= landed.z && landed.z > 1);
    assert.ok(Math.abs(recovered.lean) < .001);
    const atContact = keeperMotion(save, save.contact);
    const mitt = keeperGlove(save, { x: keeper.x, z: atContact.z }, save.contact, -attack);
    assert.ok(Math.abs(mitt.z-save.targetZ) < .25 && Math.abs(mitt.y-save.targetY) < .12);
  }
});

test('swept mitt contact detects a ball passing between frames and rejects a near miss', () => {
  const hand = { x: 0, y: 1.5, z: 0 };
  const shot = { x: 1.2, y: 1.5, z: 0 };
  const contact = gloveContact(shot, { ...shot, x: -1.2 }, hand, hand);
  assert.ok(contact !== undefined && contact > 0 && contact < .5);
  assert.equal(gloveContact({ ...shot, z: .49 }, { ...shot, z: .49, x: -1.2 }, hand, hand), undefined);
});

test('both goalkeepers catch low, parry high, and concede an unreachable shot inside the post', () => {
  const cases = [
    { height: .29, lift: .1, speed: 13, z: .12, keeperZ: 0, result: 'smother' },
    { height: 2.12, lift: 1.5, speed: 18, z: 1.10, keeperZ: 0, result: 'tip' },
    { height: .62, lift: .9, speed: 22, z: 2.48, keeperZ: -2.15, result: 'goal' },
    { height: BALL+.01, lift: .5, speed: 19, z: 4.3, keeperZ: 0, result: 'wide' },
  ] as const;
  for (const team of [0, 1] as const) for (const shot of cases) {
    const match = new Match('mirror');
    try {
      while (match.state !== 'live') match.step();
      const keeper = match.players[team*5], attack = match.attack(team);
      keeper.z = keeper.oldZ = shot.keeperZ;
      keeper.vz = 0;
      keeper.body.setTranslation({ x: keeper.x, y: 0, z: keeper.z }, true);
      const ball = { x: keeper.x + attack*(shot.result === 'wide' ? 6 : 5), y: shot.height, z: shot.z };
      match.currentBall = ball;
      match.ball.setTranslation(ball, true);
      match.ball.setLinvel({ x: -attack*shot.speed, y: shot.lift, z: 0 }, true);
      let highest = 0;
      for (let i = 0; i < 67; i++) {
        match.step();
        highest = Math.max(highest, keeper.body.translation().y);
      }
      const saves = match.history.filter(e => e.kind === 'save');
      if (shot.result === 'smother' || shot.result === 'tip') {
        assert.equal(saves.length, 1);
        assert.equal(saves[0].player, keeper.id);
        assert.deepEqual(saves[0].save, { move: shot.result, held: shot.result === 'smother' });
        if (shot.result === 'tip') assert.ok(highest > .45 && keeper.body.translation().y < .02);
      } else {
        assert.equal(saves.length, 0);
        if (shot.result === 'goal') assert.equal(match.scores[1-team], 1);
        else assert.ok(match.history.some(e => e.kind === 'out' && e.detail === 'wide'));
      }
    } finally { match.dispose(); }
  }
});

test('a match punt falls freely from the keeper’s hands and accelerates only when the boot meets it', () => {
  const match = new Match('grandstand-34');
  try {
    let droppedAt: number | undefined, previousHeight = 0, falling = 0, checked = false;
    for (let i = 0; i < 1900 && !checked; i++) {
      const held = match.heldKeeper;
      match.step();
      const keeper = match.owner;
      if (held && !match.heldKeeper && keeper?.pose?.strike?.technique === 'punt') {
        droppedAt = match.tick;
        assert.ok(match.currentBall.y > 1.15);
      }
      const e = match.events.find(e => e.kind === 'distribution' && e.flight?.style === 'loft');
      if (e) {
        const player = match.players[e.player!], pose = player.pose!;
        assert.ok(droppedAt !== undefined && (match.tick-droppedAt)*STEP >= .30 && falling >= 18);
        assert.ok(e.point!.y > BALL+.09 && e.point!.y < .85);
        assert.ok(bootContact(player, e.point!, pose.strike!, pose.side).touching);
        assert.ok(match.ball.linvel().y > 3 && Math.hypot(match.ball.linvel().x, match.ball.linvel().z) > 8);
        checked = true;
      } else if (droppedAt !== undefined && keeper && !match.heldKeeper) {
        if (previousHeight && match.currentBall.y < previousHeight && match.ball.linvel().y < 0) falling++;
      }
      previousHeight = match.currentBall.y;
    }
    assert.ok(checked);
  } finally { match.dispose(); }
});
