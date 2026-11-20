import * as T from 'three';
import { angleDiff, clamp, damp, length, mix, STEP } from './football';
import type { Point, Point3 } from './football';
import { keeperGlove, keeperMotion } from './goalkeeping';
import { swingingAnkle } from './kicks';
import type { Player } from './match';
import type { GoalMove, PlayerGesture } from './show';
import { ArticulatedInstances, box, cone, cylinder, material, plane, sphere, textTexture } from './art';
import { addHeroFace } from './hero-face';
import { addHeroGear } from './hero-gear';
import { HEROES } from './heroes';

const dark = material('#221d33');
const eye = material('#fff7e4', 0.45);
const fur = HEROES.map(hero => material(hero.fur));
const scruff = material('#50405d');
const accentPaint = material('#ffffff');
const patchCloth = material('#bd5372');
const patchThread = material('#ffe1a0');
const captainAmber = material(HEROES[4].accent);
const captainTeal = material(HEROES[9].accent);
const keeperAccent = [material(HEROES[0].accent), material(HEROES[5].accent)];
const upAxis = new T.Vector3(0, 1, 0), limbDirection = new T.Vector3();
const grip = new T.Vector3(), jointAt = new T.Vector3(), bendAt = new T.Vector3(), pawAt = new T.Vector3();
function stretchLimb(part: T.Object3D, a: T.Vector3, b: T.Vector3, radius: number) {
  limbDirection.subVectors(b, a);
  part.position.copy(a).lerp(b, .5);
  part.scale.set(radius, limbDirection.length() * .5 + .065, radius);
  part.quaternion.setFromUnitVectors(upAxis, limbDirection.normalize());
}
const normalKits = [
  { shirt: material('#ffba42'), trim: material('#ffe29b'), shorts: material('#443653'), sock: material('#fff1be'), boot: material('#59334e') },
  { shirt: material('#1e9c9d'), trim: material('#86ffda'), shorts: material('#223459'), sock: material('#b7f8eb'), boot: material('#3a2d63') },
];
const keeperKits = [
  { shirt: material('#fe6375'), trim: material('#ffd893'), shorts: material('#753960'), sock: material('#fff2c0'), boot: material('#522b4d') },
  { shirt: material('#b9e33f'), trim: material('#fff39a'), shorts: material('#30445e'), sock: material('#eaf9af'), boot: material('#333557') },
];

const patchTextures = new Map<string, T.Material>();
function numberPatch(number: number, color: string, back: boolean) {
  const key = `${number}-${color}-${back}`;
  let mat = patchTextures.get(key);
  if (!mat) {
    const texture = textTexture(96, 96, ctx => {
      ctx.font = `900 ${back ? 75 : 52}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(String(number), 48, 51);
    });
    mat = new T.MeshBasicMaterial({ map: texture, alphaTest: 0.50 });
    patchTextures.set(key, mat);
  }
  return mat;
}

type Leg = { hip: T.Group; knee: T.Group; foot: T.Group; side: number };
type Arm = { shoulder: T.Group; elbow: T.Group; side: number; sleeve: T.Object3D; forearm: T.Object3D; paw: T.Object3D };
type Glance = { partner: Point; elapsed: number };

export class Character {
  readonly root = new T.Group();
  private readonly hips: Leg[] = [];
  private readonly arms: Arm[] = [];
  private readonly throwingArms = new T.Group();
  private readonly upper = new T.Group();
  private readonly head = new T.Group();
  private readonly eyeLids: T.Group[];
  private readonly eyebrows: T.Object3D[];
  private readonly mouth: T.Object3D;
  private readonly tongue: T.Object3D;
  private readonly tail = new T.Group();
  private speed = 0;
  private poseWeight = 0;
  private poseLift = 0;
  private turn = 0;
  private guard = 0;

  constructor(readonly player: Player, batch: ArticulatedInstances) {
    const { team, role, id, number } = player;
    const lynx = team === 1;
    const keep = role === 'keeper';
    const captain = role === 'captain';
    const hero = HEROES[id];
    const skin = fur[id];
    const kit = (keep ? keeperKits : normalKits)[team];
    const silhouette = hero.body;
    const [torsoHeight, torsoDepth, neck] = hero.torso;
    const [headWidth, headHeight, headDepth] = hero.face.head;
    const shirtDepth = (lynx ? 0.38 : 0.53) * torsoDepth;
    const ell = (p: T.Object3D, m: T.Material, x: number, y: number, z: number, a: number, b: number, c: number, color?: string) =>
      batch.part(p, sphere, m, x, y, z, a, b, c, color);
    const joint = (p: T.Object3D, x: number, y: number, z: number) => {
      const j = new T.Group();
      j.position.set(x, y, z);
      p.add(j);
      return j;
    };
    const tuft = (p: T.Object3D, m: T.Material, x: number, y: number, z: number, a: number, b: number, c: number, tilt: number) => {
      const t = batch.part(p, cone, m, x, y, z, a, b, c);
      t.rotation.z = tilt;
      return t;
    };

    this.root.add(this.upper, this.throwingArms);
    this.throwingArms.scale.setScalar(0);
    this.upper.add(this.head);
    this.upper.scale.x = silhouette;
    this.head.position.set(0, (lynx ? 1.88 : 1.81) + neck, lynx ? 0.01 : 0.085);
    this.head.scale.set(headWidth / Math.sqrt(silhouette), headHeight, headDepth * (lynx ? 1 : 1.13));
    ell(this.upper, kit.shorts, 0, 0.85, -0.015, lynx ? 0.44 : 0.53, 0.27, lynx ? 0.36 : 0.46);
    ell(this.upper, kit.shirt, 0, (lynx ? 1.22 : 1.19) + neck * .30, 0, lynx ? 0.55 : 0.63, (lynx ? 0.46 : 0.54) * torsoHeight, shirtDepth);
    ell(this.upper, kit.trim, 0, 1.59 + neck * .56, 0, 0.28, 0.13, 0.294);
    ell(this.upper, skin, 0, 1.67 + neck * .65, 0, 0.23, 0.19, 0.23);
    const diagonal = ell(this.upper, kit.trim, lynx ? 0.18 : 0.24, 1.25, shirtDepth * 0.936, 0.055, 0.26, 0.039);
    diagonal.rotation.z = -0.46;
    const smallNumber = batch.part(this.upper, plane, numberPatch(number, lynx && !keep ? '#f8fff1' : '#432b4a', false), -0.13, 1.30, shirtDepth + 0.005, 0.40, 0.43, 1);
    smallNumber.rotation.y = -0.12;
    const bigNumber = batch.part(this.upper, plane, numberPatch(number, lynx && !keep ? '#faffef' : '#4d3451', true), 0, 1.24, -shirtDepth - 0.006, 0.56, 0.59, 1);
    bigNumber.rotation.y = Math.PI;
    if (lynx) {
      const repair = joint(this.upper, 0.30, 1.12, shirtDepth * .88);
      repair.rotation.set(-0.26, 0.48, -0.26);
      batch.part(repair, box, patchCloth, 0, 0, 0, 0.18, 0.16, 0.033);
      for (const s of [-1, 1]) batch.part(repair, box, patchThread, s * 0.057, 0.052, 0.021, 0.018, 0.064, 0.011).rotation.z = -0.35;
    } else {
      const waist = ell(this.upper, kit.trim, 0.02, 1.04, shirtDepth * 0.944, 0.33, 0.048, 0.034);
      waist.rotation.z = 0.11;
    }

    for (const side of [-1, 1]) {
      const hip = joint(this.root, side * 0.255 * silhouette, 0.87, 0);
      ell(hip, kit.shorts, 0, -0.125, 0, 0.207, 0.242, 0.215);
      const knee = joint(hip, 0, -0.37, 0.015);
      ell(knee, skin, 0, -0.032, 0, 0.137, 0.12, 0.141);
      ell(knee, kit.sock, 0, -0.183, 0, 0.144, 0.192, 0.147);
      ell(knee, kit.trim, 0, -0.108, 0.003, 0.15, 0.049, 0.151);
      const foot = joint(knee, 0, -0.37, 0);
      ell(foot, kit.boot, 0, -0.015, 0.10, 0.187, 0.113, 0.268);
      ell(foot, dark, 0, -0.072, 0.096, 0.184, 0.060, 0.262);
      ell(foot, accentPaint, 0, 0.061, 0.185, 0.14, 0.046, 0.103, hero.accent);
      this.hips.push({ hip, knee, foot, side });

      const shoulder = joint(this.upper, side * (lynx ? 0.477 : 0.523), 1.44 + (keep ? 0 : neck * .36), 0);
      ell(shoulder, kit.shirt, side * 0.071, -0.09, 0, 0.201, 0.224, 0.192);
      ell(shoulder, captain && side < 0 ? eye : kit.trim, side * 0.083, -0.177, 0, 0.188, 0.050, 0.182);
      ell(shoulder, accentPaint, side * .088, -.190, 0, .186, .034, .182, hero.accent);
      const elbow = joint(shoulder, side * 0.082, -0.253, 0);
      ell(elbow, skin, 0, -0.096, 0, lynx ? 0.126 : 0.153, 0.169, lynx ? 0.126 : 0.15);
      if (keep || (id % 5 === 2 && side > 0)) ell(elbow, keep ? keeperAccent[team] : kit.trim, 0, -0.18, 0, keep ? 0.156 : 0.133, 0.063, keep ? 0.151 : 0.136);
      ell(elbow, keep ? kit.trim : skin, 0.005, -0.252, 0.02, keep ? 0.196 : lynx ? 0.144 : 0.167, keep ? 0.184 : 0.139, keep ? 0.162 : 0.141);
      if (keep) {
        ell(elbow, kit.boot, side * -0.115, -0.242, 0.095, 0.075, 0.108, 0.079);
        ell(elbow, keeperAccent[team], side * 0.036, -0.27, 0.147, 0.102, 0.103, 0.042);
      }
      const sleeve = ell(this.throwingArms, kit.shirt, 0, 0, 0, 1, 1, 1);
      const forearm = ell(this.throwingArms, skin, 0, 0, 0, 1, 1, 1);
      const paw = ell(this.throwingArms, keep ? kit.trim : skin, 0, 0, 0, .15, .145, .145);
      if (keep) ell(paw, keeperAccent[team], side * .43, 0, .72, .55, .57, .35);
      this.arms.push({ shoulder, elbow, side, sleeve, forearm, paw });
    }

    const face = addHeroFace(batch, this.head, id, lynx);
    this.eyeLids = face.eyes;
    this.eyebrows = face.brows;
    this.mouth = face.mouth;
    this.tongue = face.tongue;
    if (lynx) {
      this.tail.position.set(0, 0.84, -0.32);
      this.upper.add(this.tail);
      const length = .27 + (1 - torsoDepth) * .42;
      const tail = ell(this.tail, skin, 0, 0.105, -length * .85, .136 + hero.face.ruff * .026, 0.16, length * 1.27);
      tail.rotation.x = .36 + neck;
      tuft(this.tail, scruff, 0.02, .197, -length * 1.94, .142, .25, .157, -.71).rotation.x = -.55;
    }
    if (hero.gear === 'headband') {
      const band = batch.part(this.head, cylinder, captainAmber, 0, .486, -.012, .494, .117, .423);
      band.rotation.z = .104;
      ell(this.head, captainAmber, -.385, .437, -.323, .155, .095, .104);
      tuft(this.head, captainAmber, -.469, .361, -.391, .104, .31, .097, 2.12);
    }
    if (hero.gear === 'scarf') {
      ell(this.upper, captainTeal, .0, 1.64, .02, .337, .121, .313).rotation.z = .19;
      ell(this.upper, captainTeal, .265, 1.59, .204, .150, .10, .147);
      ell(this.upper, captainTeal, .329, 1.40, .249, .084, .239, .069).rotation.z = .35;
      ell(this.upper, captainTeal, -.14, 1.47, -.365, .097, .258, .067).rotation.set(.43, .0, -.29);
    }
    addHeroGear(batch, this.head, id);
    this.root.scale.setScalar(captain ? 1.05 : 1);
  }

  animate(alpha: number, time: number, dt: number, gesture?: PlayerGesture, showcase = false, hasBall = false, glance?: Glance, throwLift?: number, pickup = 0, ballInHands?: Point3) {
    const p = this.player;
    this.root.position.set(mix(p.oldX, p.x, alpha), 0, mix(p.oldZ, p.z, alpha));
    this.root.rotation.y = p.oldYaw + angleDiff(p.oldYaw, p.yaw) * alpha;
    const smooth = damp(18, dt);
    this.speed = mix(this.speed, length(p.vx, p.vz), smooth);
    this.turn = mix(this.turn, clamp(angleDiff(p.oldYaw, p.yaw) * 2.7, -0.25, 0.25), smooth);
    const attempt = p.keeperAttempt;
    const saveAge = attempt ? Math.max(0, time - (attempt.start+1)*STEP) : 0;
    const dive = attempt && keeperMotion(attempt, saveAge);
    const move = attempt ? 0 : clamp(this.speed / 5.0, 0, 1.22);
    const gait = p.stride - (1 - alpha) * this.speed * 3.92 / 60;
    const breath = Math.sin(time * 3.5 + p.id * 0.61);
    const pose = p.pose;
    const progress = pose ? clamp(pose.age / pose.duration, 0, 1) : 0;
    const action = pose?.kind;
    const pulse = pose ? Math.sin(Math.PI * progress) : 0;
    this.poseWeight = mix(this.poseWeight, pulse, smooth);
    const keeper = p.role === 'keeper';
    const diving = action === 'dive' ? this.poseWeight : 0;
    const tipping = action === 'tip' ? this.poseWeight : 0;
    const smothering = action === 'smother' ? this.poseWeight : 0;
    const blocking = action === 'block' ? this.poseWeight : 0;
    this.guard = mix(this.guard, p.keeperReady ? 1 : 0, smooth);
    const set = this.guard * (1 - Math.max(diving, tipping, smothering, blocking));
    const shuffle = set * clamp(Math.abs(p.vz) / (Math.abs(p.vx) + 2), 0, 1);
    const cheering = action === 'celebrate' ? this.poseWeight : 0;
    const losing = action === 'concede' ? this.poseWeight : 0;
    const stumbling = action === 'stumble' ? this.poseWeight : 0;
    const holding = keeper && hasBall && action !== 'distribute' ? 0.68 : 0;
    const catching = Math.max(holding, action === 'catch' ? this.poseWeight : action === 'distribute' ? this.poseWeight * 0.7 : blocking * 0.85);
    const cradle = holding * (1 - diving);
    const kicking = action === 'shot' || action === 'pass' || action === 'distribute';
    const strike = pose?.strike;
    const kickTime = Math.max(0, (pose?.age ?? 0) - (1-alpha)*STEP);
    this.poseLift = mix(this.poseLift, cheering * (.16 + .12 * Math.abs(Math.sin(time * 14))), smooth);
    this.root.position.y = dive?.y ?? this.poseLift;
    this.root.rotation.z = dive?.lean ?? ((strike ? 0 : this.turn) + stumbling * Math.sin(time * 12) * .21);
    this.upper.position.y = -(dive?.crouch ?? 0) * .16 + breath * 0.019 + Math.abs(Math.sin(gait)) * move * 0.042 - (keeper ? 0.075 : 0) - losing * 0.08 - set * 0.18 - smothering * 0.28;
    this.upper.rotation.x = move * 0.13 + stumbling * 0.32 - cheering * 0.13 + losing * 0.19 + set * 0.22 + smothering * 0.44 - tipping * 0.15;
    if (strike && pose) {
      const weight = Math.sin(Math.PI * clamp(kickTime/pose.duration, 0, 1));
      this.upper.rotation.z = pose.side * weight * (strike.technique === 'push' ? .075 : .14);
      this.upper.rotation.y = pose.side * Math.sin(Math.PI*(kickTime-strike.contact)/pose.duration) * weight * .29;
      this.upper.rotation.x += weight * (strike.technique === 'punt' || strike.technique === 'loft' ? -.10 : .12);
    } else {
      this.upper.rotation.y = 0;
      this.upper.rotation.z = 0;
    }
    this.head.rotation.x = breath * 0.035 + losing * 0.25 - cheering * 0.17 - move * 0.075 - set * 0.10 + smothering * 0.14 - tipping * 0.32;
    this.head.rotation.y = Math.sin(time * 2.0 + p.id) * (move < 0.1 || showcase ? 0.19 : 0.063) + this.turn * 0.4;
    this.tail.rotation.y = Math.sin(time * (3.2 + move * 1.4) + p.id * 0.43) * (0.22 + 0.24 * move);
    this.tail.rotation.x = Math.sin(time * 2.5 + p.id) * 0.23 - cheering * 0.5;
    const blink = (time + p.id * 1.139) % (4.3 + p.id % 3 * 0.36);
    for (const sight of this.eyeLids) sight.scale.y = blink < 0.135 ? Math.max(0.12, Math.abs(blink - 0.068) / 0.068) : 1 + cheering * 0.10;
    for (let i = 0; i < this.eyebrows.length; i++) this.eyebrows[i].rotation.z = (i ? 1 : -1) * (0.13 - move * 0.21 + losing * 0.26 + cheering * 0.24);
    for (const { hip, knee, foot, side } of this.hips) {
      const cycle = Math.sin(gait) * side;
      const actingLeg = (pose?.side ?? 1) === side;
      const tap = actingLeg && (action === 'intercept' || action === 'receive' || action === 'tackle') ? this.poseWeight * 0.63 : 0;
      hip.rotation.order = 'ZXY';
      if (strike && pose) {
        let ankle: Point3;
        if (actingLeg) ankle = swingingAnkle(strike, side, kickTime, pose.duration);
        else {
          const dx = (strike.plant.x - this.root.position.x) / strike.scale, dz = (strike.plant.z - this.root.position.z) / strike.scale;
          const yaw = this.root.rotation.y;
          const hold = clamp((pose.duration-kickTime)/.19, 0, 1);
          ankle = { x: mix(side*strike.hip, dx*Math.cos(yaw)-dz*Math.sin(yaw), hold), y: .146,
            z: (dx*Math.sin(yaw)+dz*Math.cos(yaw))*hold };
        }
        const dx = ankle.x - hip.position.x, dy = hip.position.y - ankle.y;
        const reach = Math.hypot(dx, dy, ankle.z);
        const bend = Math.acos(clamp(reach/.74, .05, 1));
        const forward = Math.atan2(ankle.z, Math.hypot(dx,dy));
        hip.rotation.set(-forward-bend, 0, Math.atan2(dx,dy), 'ZXY');
        knee.rotation.x = bend*2;
        foot.rotation.x = -hip.rotation.x-knee.rotation.x;
        continue;
      }
      hip.rotation.x = -cycle * 0.61 * move * (1 - shuffle * 0.5) - (dive?.crouch ?? 0)*.47 - tap - diving * 0.37 - set * 0.17 - smothering * 0.34;
      hip.rotation.z = side * (0.07 + (keeper ? 0.14 : 0) + diving * 0.18 + tap * 0.23 + set * 0.13 + smothering * 0.18) + cycle * shuffle * 0.29;
      knee.rotation.x = Math.max(0, cycle) * move * 0.73 + (dive?.crouch ?? 0)*.88 + (dive?.y ?? 0)*.56 + diving * 0.44 + set * 0.28 + smothering * 0.63;
      foot.rotation.x = -(hip.rotation.x + knee.rotation.x) * 0.73;
    }
    for (const { shoulder, elbow, side } of this.arms) {
      const cycle = Math.sin(gait) * side;
      const reaching = side === pose?.side;
      shoulder.rotation.z = side * (0.29 + (keeper ? 0.25 : 0) + diving * (reaching ? 1.46 : 0.74) + tipping * (reaching ? 2.45 : 0.52) + cheering * 2.0 + catching * 0.22 - cradle * 1.85 + stumbling * 0.56 + set * 0.55);
      shoulder.rotation.x = cycle * move * 0.57 - catching * 0.65 - cradle * 0.35 - kickingPulse(kicking, this.poseWeight) * side * 0.45 - losing * 0.25 - set * 0.36 - smothering * 0.88;
      elbow.rotation.x = -0.28 - move * 0.52 - catching * 0.84 - cheering * 0.55 - set * 0.55 - smothering * 0.47 + (reaching ? tipping * 0.16 : 0);
    }
    this.mouth.scale.set(0.148, 0.071 + cheering * 0.026, 0.042);
    this.tongue.position.y = -0.111;
    this.perform(gesture, time, 1 - Math.max(diving, tipping, smothering) * 0.78);
    if (glance) {
      const { partner, elapsed } = glance;
      const weight = clamp(Math.min(elapsed / 0.16, (1.8 - elapsed) / 0.19), 0, 1);
      const look = Math.atan2(partner.x - p.x, partner.z - p.z);
      this.head.rotation.y += clamp(angleDiff(this.root.rotation.y, look), -0.43, 0.43) * weight * (1 - Math.min(move, 1) * 0.56);
    }
    const releasing = action === 'throw' ? 1 - progress : 0;
    const usingHands = throwLift !== undefined || releasing > 0 || !!ballInHands || !!attempt;
    this.throwingArms.scale.setScalar(usingHands ? 1 : 0);
    if (usingHands) {
      if (ballInHands) this.root.worldToLocal(grip.set(ballInHands.x, ballInHands.y, ballInHands.z));
      else grip.set(0, 1.68 + releasing * 1.56, .41 + Math.sin(progress * Math.PI) * .66);
    }
    for (const { shoulder, sleeve, forearm, paw, side } of this.arms) {
      shoulder.scale.setScalar(usingHands ? 0 : 1);
      if (!usingHands) continue;
      jointAt.set(shoulder.position.x * this.upper.scale.x, shoulder.position.y + this.upper.position.y, .015);
      if (attempt && !ballInHands) {
        const hand = keeperGlove(attempt, this.root.position, saveAge, side);
        this.root.worldToLocal(pawAt.set(hand.x, hand.y, hand.z));
      } else {
        pawAt.copy(grip);
        pawAt.x += side * .23;
      }
      bendAt.copy(jointAt).lerp(pawAt, .5);
      bendAt.x += side * (attempt && !ballInHands ? .105 : .22);
      bendAt.z += .10;
      stretchLimb(sleeve, jointAt, bendAt, .16);
      stretchLimb(forearm, bendAt, pawAt, .118);
      paw.position.copy(pawAt);
    }
    if (pickup > 0) {
      this.upper.rotation.x += pickup * .72;
      this.root.position.y -= pickup * .30;
    }
    this.root.updateMatrixWorld(true);
  }

  private perform(gesture: PlayerGesture | undefined, time: number, influence: number) {
    this.head.rotation.z = 0;
    if (!gesture) return;
    const progress = clamp((time * 60 - gesture.tick) / gesture.duration, 0, 1);
    const weight = Math.sin(Math.PI * progress) ** 0.7 * influence;
    const { kind } = gesture;
    if (kind === 'double-hop' || kind === 'victory-twirl' || kind === 'fist-pump' || kind === 'two-hand-wave') {
      this.performGoal(kind, progress, weight);
      return;
    }
    const surprise = kind === 'double-take' || kind === 'look-around' || kind === 'cup-ear';
    const stretch = kind === 'stretch';
    const wait = kind === 'expect';
    const shrug = kind === 'shrug' || kind === 'palms-up';
    const greeting = kind === 'greet' || kind === 'wave';
    const gloves = kind === 'glove-pat' || kind === 'glove-twirl';
    if (surprise) {
      this.head.rotation.y += Math.sin(progress * Math.PI * 4.5) * weight * 0.78;
      this.head.rotation.x -= weight * 0.22;
      this.mouth.scale.set(0.148 - 0.059 * weight, 0.071 + 0.081 * weight, 0.042 + 0.024 * weight);
      this.tongue.position.y -= weight * 0.031;
    }
    if (stretch) this.head.rotation.z = -0.49 * weight;
    if (shrug) {
      this.upper.position.y += weight * 0.10;
      this.head.rotation.z = weight * 0.32;
      this.head.rotation.x += weight * 0.21;
      this.mouth.scale.y += weight * 0.041;
    }
    if (kind === 'cup-ear') this.head.rotation.z = -0.29 * weight;
    if (kind === 'beret-tip') this.head.rotation.z = -0.28 * weight;
    if (kind === 'wink' || kind === 'glove-twirl') this.eyeLids[0].scale.y *= 1 - weight * 0.87;
    for (const { shoulder, elbow, side } of this.arms) {
      if (greeting && side === 1) {
        shoulder.rotation.z += weight * ((kind === 'wave' ? 1.25 : 1.58) + Math.sin(progress * Math.PI * 9) * 0.31);
        elbow.rotation.x -= weight * 0.48;
      }
      if (stretch || wait) {
        const lift = stretch ? 1.86 : 0.73;
        shoulder.rotation.z += side * weight * lift;
        shoulder.rotation.x += weight * (stretch ? -0.26 : -0.47);
        elbow.rotation.x -= weight * 0.44;
      }
      if (surprise) shoulder.rotation.z += side * weight * 0.62;
      if (shrug) {
        shoulder.rotation.z += side * weight * 0.93;
        elbow.rotation.x -= weight * 0.81;
      }
      if (kind === 'cup-ear' && side === 1) {
        shoulder.rotation.z += weight * 1.55;
        elbow.rotation.x -= weight * 1.05;
      }
      if (kind === 'beret-tip' && side === 1) {
        shoulder.rotation.z += weight * 1.42;
        shoulder.rotation.x -= weight * 0.56;
        elbow.rotation.x -= weight * 1.24;
      }
      if (gloves) {
        const wave = kind === 'glove-twirl' && side === 1 ? Math.sin(progress * Math.PI * 5) * 0.65 : 0;
        shoulder.rotation.z += weight * side * (kind === 'glove-pat' ? -0.44 : 0.43 + wave);
        shoulder.rotation.x -= weight * (0.56 + (kind === 'glove-pat' ? 0.32 * Math.sin(progress * Math.PI * 8) : 0));
        elbow.rotation.x -= weight * 0.82;
      }
    }
  }

  private performGoal(kind: GoalMove, progress: number, weight: number) {
    const hop = kind === 'double-hop';
    const twirl = kind === 'victory-twirl';
    const pump = kind === 'fist-pump';
    const beat = Math.sin(progress * Math.PI * 4);
    const facing = Math.min(1, progress * 7, (1 - progress) * 7);
    this.root.rotation.y += angleDiff(this.root.rotation.y, 0.18) * facing;
    if (hop) {
      this.root.position.y += Math.abs(Math.sin(progress * Math.PI * 2)) ** 0.8 * 0.82;
      const bow = Math.sin(Math.PI * clamp((progress - 0.79) / 0.21, 0, 1));
      this.upper.rotation.x += bow * 0.85;
      this.upper.position.y -= bow * 0.15;
      this.head.rotation.x += bow * 0.33;
    }
    if (twirl) {
      const turn = clamp((progress - 0.13) / 0.64, 0, 1);
      this.root.rotation.y += Math.PI * 2 * turn * turn * (3 - 2 * turn);
      this.root.position.y += Math.sin(Math.PI * turn) * 0.68;
      this.tail.rotation.y += weight * 0.58;
    }
    this.head.rotation.z = (twirl ? 0.28 : beat * 0.10) * weight;
    this.mouth.scale.y += 0.055 * weight;
    for (const { shoulder, elbow, side } of this.arms) {
      const lift = hop ? 1.63 + Math.abs(beat) * 0.53 : twirl ? 1.40 + side * 0.40 : pump ? 1.19 + side * beat * 0.78 : 1.65 + side * beat * 0.37;
      shoulder.rotation.z = mix(shoulder.rotation.z, side * lift, weight);
      shoulder.rotation.x -= weight * (pump ? 0.83 : 0.28);
      elbow.rotation.x -= weight * (pump ? 0.72 : 0.30);
    }
  }
}

function kickingPulse(kicking: boolean, weight: number) { return kicking ? weight : 0; }

