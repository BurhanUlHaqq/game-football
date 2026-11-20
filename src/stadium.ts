import * as T from 'three';
import { box, cylinder, flat, instances, material, mesh, plane, sphere, textTexture } from './art';
import type { StaticShape } from './art';
import { ArenaCrowd } from './arena-crowd';
import type { FanSeat } from './arena-crowd';
import { ArenaDisplays, ArenaMascots, fanColors, supporterSigns } from './arena-decor';
import { fanReaction } from './arena-show';
import type { ArenaCue } from './arena-show';
import { BALL, FIELD, mix, Random } from './football';
import type { Team } from './football';
import { ArenaSurroundings } from './surroundings';

const turfLine = flat('#f0ffd8');
const steel = material('#433959');
const beam = material('#71618d');
const cream = material('#fff2d4');
const lamp = flat('#fff2cb');
const navy = material('#292a48');
const coral = material('#f87878');
const mint = material('#75d9c5');
const amber = material('#ffbf66');
const paper = material('#ffead6');
const netColor = new T.LineBasicMaterial({ color: '#fff2db', transparent: true, opacity: 0.62 });
const lightFloor = material('#b27889');
const track = material('#89596f');

function grass() {
  const map = textTexture(512, 512, ctx => {
    const rng = new Random('rush-arena-turf');
    ctx.fillStyle = '#9ac683';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 31500; i++) {
      ctx.fillStyle = i % 2 ? `rgba(21,77,43,${rng.range(0.08, 0.24)})` : `rgba(231,255,192,${rng.range(0.06, 0.34)})`;
      ctx.fillRect(rng.range(0, 512), rng.range(0, 512), rng.range(0.35, 2.4), rng.range(0.45, 3.8));
    }
  });
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.repeat.set(1.5, 8);
  map.anisotropy = 8;
  return [new T.MeshStandardMaterial({ color: '#8be36f', map, roughness: 1 }), new T.MeshStandardMaterial({ color: '#66c96a', map, roughness: 1 })];
}

function turf(scene: T.Scene) {
  mesh(scene, box, track, 0, -0.56, 0, 72, 1, 50);
  mesh(scene, box, lightFloor, 0, -0.091, 0, 52.5, 0.16, 29.5);
  const concourse = material('#946578');
  const tiles: StaticShape[] = [];
  for (let row = 0; row < 3; row++) for (let i = -9; i <= 9; i++) {
    const x = i * 3.35 + (row % 2) * 1.4;
    tiles.push({ x, y: -0.047, z: 15.59 + row * 1.27, sx: 3.305, sy: 0.04, sz: 1.22, color: (row + i) % 4 ? '#f4d9d6' : '#fff3df' });
  }
  instances(scene, box, concourse, tiles);
  mesh(scene, box, beam, 0, -0.027, 14.91, 67, 0.05, 0.115);
  mesh(scene, box, cream, 0, -0.021, 15.04, 67, 0.057, 0.061);
  const [stripeA, stripeB] = grass();
  const width = (FIELD.x + 2.8) * 2 / 12;
  for (let i = 0; i < 12; i++) {
    const patch = mesh(scene, plane, i % 2 === 0 ? stripeA : stripeB, width * (i - 5.5), 0, 0, width + 0.003, 2 * (FIELD.z + 0.28), 1);
    patch.rotation.x = -Math.PI / 2;
  }
  const line = (x: number, z: number, width: number, depth: number) => mesh(scene, box, turfLine, x, 0.015, z, width, 0.012, depth);
  const w = 0.095;
  for (const s of [-1, 1]) {
    line(0, s * (FIELD.z - 0.12), FIELD.x * 2, w);
    line(s * FIELD.x, 0, w, (FIELD.z - 0.12) * 2);
    for (const q of [-1, 1]) {
      line(s * (FIELD.x - 2.9), q * 6.75, 5.8, w);
      line(s * (FIELD.x - 1.22), q * 4.20, 2.44, w);
    }
    line(s * (FIELD.x - 5.8), 0, w, 13.5);
    line(s * (FIELD.x - 2.44), 0, w, 8.4);
    mesh(scene, cylinder, turfLine, s * (FIELD.x - 4.4), 0.021, 0, 0.10, 0.013, 0.10);
    const arc = new T.RingGeometry(2.9, 2.995, 32, 1, s > 0 ? Math.PI * 0.67 : -Math.PI * 0.33, Math.PI * 0.66);
    mesh(scene, arc, turfLine, s * (FIELD.x - 4.4), 0.022, 0, 1, 1, 1).rotation.x = -Math.PI / 2;
  }
  line(0, 0, w, (FIELD.z - 0.12) * 2);
  mesh(scene, new T.RingGeometry(3.67, 3.77, 72), turfLine, 0, 0.020, 0, 1, 1, 1).rotation.x = -Math.PI / 2;
  mesh(scene, cylinder, turfLine, 0, 0.02, 0, 0.14, 0.018, 0.14);
}

function letterMat(fill: string, label: string, line: string, ink: string) {
  const tex = textTexture(512, 128, ctx => {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 512, 128);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink;
    ctx.font = '900 40px Arial, sans-serif';
    ctx.fillText(label, 256, line ? 53 : 62);
    if (line) {
      ctx.font = '700 15px Arial, sans-serif';
      ctx.fillText(line, 256, 93);
    }
    ctx.fillRect(22, 62, 39, 4);
    ctx.fillRect(450, 62, 39, 4);
  });
  return new T.MeshBasicMaterial({ color: '#ffffff', map: tex });
}

function boards(scene: T.Scene, display: ArenaDisplays) {
  const signs = [letterMat('#342e52', 'ZEERUSH', 'GAMING', '#fff0d8'), letterMat('#a74464', 'RUSH ARENA', '', '#ffe2a3'), letterMat('#235664', 'FIVE A SIDE', '', '#d3ffdf')];
  const { x, z, goal, board } = FIELD;
  for (const side of [-1, 1]) {
    const height = side === 1 ? 0.77 : board;
    mesh(scene, box, steel, 0, height / 2, side * (z + 0.11), x * 2 + 0.40, height, 0.22);
    mesh(scene, box, side === 1 ? coral : mint, 0, height + 0.013, side * (z + 0.11), x * 2 + 0.43, 0.065, 0.265);
    for (let i = -3; i <= 3; i++) {
      const label = side === -1 && Math.abs(i) === 3 ? display.ribbonMaterial : signs[(i + 3) % 3];
      const plaque = mesh(scene, plane, label, i * 6.12, height * 0.54, side * (side === 1 ? z + 0.229 : z - 0.006), 6.08, height * 0.71, 1);
      plaque.rotation.y = 0;
    }
    const span = z - goal;
    for (const end of [-1, 1]) {
      mesh(scene, box, steel, side * (x + 0.11), board / 2, end * (goal + span / 2), 0.22, board, span);
      mesh(scene, box, side > 0 ? mint : coral, side * (x + 0.11), board + 0.013, end * (goal + span / 2), 0.265, 0.065, span);
      for (const offset of [2.36, 7.08]) mesh(scene, plane, signs[offset < 3 ? 2 : 0], side * (x - 0.006), 0.455, end * (goal + offset), 4.65, 0.65, 1).rotation.y = -side * Math.PI / 2;
    }
  }
}

type GoalNet = { side: number; geometry: T.BufferGeometry; base: Float32Array };
function goals(scene: T.Scene) {
  const results: GoalNet[] = [];
  const { x, goal, bar, net, post } = FIELD;
  for (const side of [-1, 1]) {
    for (const z of [-goal, goal]) {
      mesh(scene, box, cream, side * x, bar / 2, z, post * 2, bar, post * 2);
      mesh(scene, box, side > 0 ? mint : coral, side * x, 0.14, z, post * 2.17, 0.28, post * 2.17);
      mesh(scene, box, cream, side * (x + net), 1.12, z, 0.093, 2.24, 0.093);
      mesh(scene, box, cream, side * (x + net / 2), 0.055, z, net + 0.09, 0.095, 0.095);
      const brace = mesh(scene, box, cream, side * (x + net / 2), (bar + 2.22) / 2, z, Math.hypot(net, bar - 2.22), 0.085, 0.085);
      brace.rotation.z = -side * Math.atan2(bar - 2.22, net);
    }
    mesh(scene, box, cream, side * x, bar, 0, post * 2, post * 2, goal * 2 + post * 2);
    mesh(scene, box, cream, side * (x + net), 2.22, 0, 0.093, 0.093, goal * 2);
    const points: number[] = [];
    const pack = (...values: number[]) => points.push(...values);
    for (let i = 0; i <= 22; i++) {
      const z = mix(-goal, goal, i / 22);
      pack(side * x, bar, z, side * (x + net), 2.22, z, side * (x + net), 2.22, z, side * (x + net), 0.04, z);
    }
    for (let i = 0; i <= 9; i++) {
      const depth = net * i / 9;
      const h = mix(bar, 2.22, i / 9);
      const xx = side * (x + depth);
      pack(xx, h, -goal, xx, h, goal);
      for (const z of [-goal, goal]) pack(xx, h, z, xx, 0.04, z);
    }
    for (let i = 0; i <= 8; i++) {
      const frac = i / 8;
      pack(side * (x + net), 2.22 * frac, -goal, side * (x + net), 2.22 * frac, goal);
      for (const z of [-goal, goal]) pack(side * x, bar * frac, z, side * (x + net), 2.22 * frac, z);
    }
    const geometry = new T.BufferGeometry();
    const base = Float32Array.from(points);
    geometry.setAttribute('position', new T.BufferAttribute(base.slice(), 3).setUsage(T.DynamicDrawUsage));
    scene.add(new T.LineSegments(geometry, netColor));
    results.push({ side, geometry, base });
  }
  return results;
}

function oval(angle: number, expansion = 0) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: (29.4 + expansion) * Math.sign(cos) * Math.abs(cos) ** 0.57, z: (16.2 + expansion) * Math.sign(sin) * Math.abs(sin) ** 0.57 };
}

function ovalSegment(angle: number, radius: number, arc: number) {
  const at = oval(angle, radius);
  const from = oval(angle - arc / 2, radius);
  const to = oval(angle + arc / 2, radius);
  return { ...at, r: Math.atan2(from.z - to.z, to.x - from.x), width: Math.hypot(to.x - from.x, to.z - from.z) };
}

function grandstand(scene: T.Scene, rng: Random) {
  const stands: StaticShape[] = [];
  const seats: StaticShape[] = [];
  const fascia: StaticShape[] = [];
  const rails: StaticShape[] = [];
  const crowd: FanSeat[] = [];
  const count = 132;
  const step = Math.PI * 2 / count;
  for (let i = 0; i < count; i++) {
    const a = (i + 0.5) * step;
    if (a > 0.28 && a < Math.PI - 0.28) continue;
    const opening = i % 11 === 0;
    const local = Math.sin(a) < -0.28 ? 5 : 4;
    for (let row = 0; row < local; row++) {
      const span = ovalSegment(a, row * 1.19, step);
      const floor = 0.22 + row * 0.71;
      const v = { ...span, y: floor - 0.19, sx: span.width + 0.15, sy: 0.42, sz: 1.57, color: row % 2 ? '#584765' : '#675170' };
      stands.push(v);
      if (row === 0 || row === local - 1) fascia.push({ ...span, y: floor + (row === 0 ? 0.17 : 0.55), sx: span.width + 0.17, sy: row === 0 ? 0.20 : 0.23, sz: 0.16, color: i < 66 ? '#df888e' : i % 22 < 11 ? '#f7b982' : '#8bcfc0' });
      if (opening) {
        rails.push({ ...span, y: floor + 0.37, sx: 0.09, sy: 0.76, sz: 0.10, color: '#f3c5ab' });
        continue;
      }
      for (let seat = 0, seatsInSpan = Math.max(1, Math.floor(span.width / 0.72)); seat < seatsInSpan; seat++) {
        const shift = (seat + 0.5 - seatsInSpan / 2) * 0.74;
        const x = span.x + Math.cos(span.r) * shift;
        const z = span.z - Math.sin(span.r) * shift;
        const section = i % 33 < 16;
        seats.push({ x, z, y: floor + 0.095, r: span.r, sx: 0.58, sy: 0.23, sz: 0.48, color: section ? '#ad7891' : '#7b7099' });
        if (rng.next() > (row === 0 ? 0.82 : 0.93)) continue;
        crowd.push({ x, z, y: floor + .36, height: rng.range(.27, .41), phase: rng.range(0, 6.4), row, team: x < 0 ? 0 : 1 });
      }
    }
  }
  const colorMat = material('#ffffff');
  instances(scene, box, colorMat, stands);
  instances(scene, box, colorMat, seats);
  instances(scene, box, colorMat, fascia);
  instances(scene, box, colorMat, rails);
  return new ArenaCrowd(scene, crowd);
}

function infrastructure(scene: T.Scene, display: ArenaDisplays) {
  mesh(scene, box, steel, 0, 4.95, -20.7, 14.5, 3.36, 0.70);
  mesh(scene, box, coral, 0, 6.64, -20.34, 14.61, 0.11, 0.18);
  mesh(scene, box, mint, 0, 3.27, -20.34, 14.61, 0.10, 0.18);
  mesh(scene, plane, display.mainMaterial, 0, 4.95, -20.338, 14.07, 3.17, 1);
  for (const side of [-1, 1]) {
    const x = side * 22.9;
    const z = -19.2;
    mesh(scene, box, steel, x, 4.72, z, 0.43, 9.4, 0.43);
    mesh(scene, box, beam, x, 8.97, z, 4.45, 1.52, 0.65).rotation.z = side * 0.09;
    for (let j = 0; j < 5; j++) for (let k = 0; k < 2; k++) {
      mesh(scene, box, navy, x - 1.63 + j * 0.82, 8.67 + k * 0.59, z + 0.37, 0.70, 0.54, 0.14);
      mesh(scene, box, lamp, x - 1.63 + j * 0.82, 8.67 + k * 0.59, z + 0.458, 0.53, 0.37, 0.055);
    }
    const bench = new T.Group();
    bench.position.set(side * 10.1, 0, -14.3);
    scene.add(bench);
    mesh(bench, box, steel, 0, 0.45, 0, 4.35, 0.18, 0.70);
    mesh(bench, box, side < 0 ? coral : mint, 0, 0.86, -0.30, 4.35, 0.49, 0.16);
    mesh(bench, box, navy, 0, 1.36, -0.05, 4.53, 0.11, 0.76);
    for (const post of [-1.95, 1.95]) mesh(bench, box, beam, post, 0.64, -0.35, 0.10, 1.35, 0.10);
  }
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    mesh(scene, cylinder, paper, x * 21.91, 0.91, z * 12.9, 0.035, 1.83, 0.035);
    mesh(scene, sphere, amber, x * 21.91, 1.85, z * 12.9, 0.07, 0.07, 0.07);
  }
}

function flags(scene: T.Scene) {
  type Flag = { geometry: T.PlaneGeometry; phase: number; w: number; x: number; team?: Team };
  const result: Flag[] = [];
  const palette = [coral, mint, amber, cream];
  const teamFlags = fanColors.map((colors, team) => {
    const map = textTexture(192, 128, g => {
      g.fillStyle = colors.deep;
      g.fillRect(0, 0, 192, 128);
      g.fillStyle = colors.accent;
      g.fillRect(0, 0, 192, 16);
      g.fillRect(0, 112, 192, 16);
      g.fillStyle = colors.light;
      g.beginPath();
      if (team === 0) g.arc(96, 64, 34, 0, Math.PI * 2);
      else for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const r = i % 2 === 0 ? 42 : 24;
        g.lineTo(96 + Math.cos(a) * r, 64 + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    });
    return new T.MeshStandardMaterial({ map, side: T.DoubleSide, roughness: 0.88 });
  });
  for (const [i, x] of [-16, -12, 11, 15, -21.91, 21.91, -21.91, 21.91].entries()) {
    const corner = i > 3;
    const z = corner ? (i < 6 ? -12.9 : 12.9) : -20.2;
    const y = corner ? 1.83 : 6.1;
    const h = corner ? 0.36 : 1.09;
    const w = corner ? 0.56 : 1.70;
    if (!corner) mesh(scene, cylinder, beam, x, y - 0.96, z, 0.055, 2.0, 0.055);
    const geometry = new T.PlaneGeometry(w, h, 9, 3);
    const team = corner ? undefined : x < 0 ? 0 : 1;
    const flagMaterial = team === undefined ? palette[i % 4].clone() : teamFlags[team];
    flagMaterial.side = T.DoubleSide;
    mesh(scene, geometry, flagMaterial, x + w / 2, y - h / 2, z, 1, 1, 1);
    result.push({ geometry, phase: i * 0.9, w, x, team });
  }
  return result;
}

export function makeFootball(scene: T.Scene) {
  const map = textTexture(1024, 512, ctx => {
    ctx.fillStyle = '#fffae3';
    ctx.fillRect(0, 0, 1024, 512);
    for (let row = 0; row < 4; row++) {
      for (let i = -1; i <= 8; i++) {
        const x = i * 128 + ((row % 2) * 64);
        const y = 60 + row * 130;
        ctx.beginPath();
        for (let k = 0; k <= 5; k++) {
          const a = k * Math.PI * 2 / 5 - Math.PI / 2;
          ctx.lineTo(x + Math.cos(a) * 37, y + Math.sin(a) * 30);
        }
        ctx.closePath();
        ctx.fillStyle = (i + row) % 4 ? '#322c49' : '#ec844d';
        ctx.fill();
        ctx.strokeStyle = '#bcadb4';
        ctx.lineWidth = 1.7;
        ctx.stroke();
        for (const [dx, dy] of [[-62, 27], [67, 27], [0, -68]]) {
          ctx.beginPath();
          ctx.moveTo(x + dx * 0.49, y + dy * 0.46);
          ctx.lineTo(x + dx, y + dy);
          ctx.stroke();
        }
      }
    }
  });
  const mat = new T.MeshStandardMaterial({ color: '#fff8df', map, roughness: 0.53 });
  return mesh(scene, sphere, mat, 0, BALL, 0, BALL, BALL, BALL);
}

function batchStaticMeshes(scene: T.Scene) {
  const groups = new Map<string, T.Mesh[]>();
  scene.updateMatrixWorld(true);
  scene.traverse(item => {
    if (!(item instanceof T.Mesh) || item instanceof T.InstancedMesh || Array.isArray(item.material)) return;
    const key = `${item.geometry.id}:${item.material.id}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  });
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const batch = new T.InstancedMesh(group[0].geometry, group[0].material, group.length);
    for (const [i, item] of group.entries()) {
      batch.setMatrixAt(i, item.matrixWorld);
      item.removeFromParent();
    }
    scene.add(batch);
  }
}

export class Stadium {
  readonly hemi = new T.HemisphereLight('#f6ebff', '#927287', 2.0);
  readonly sun = new T.DirectionalLight('#fff1d2', 2.5);
  private readonly crowd: ArenaCrowd;
  private readonly nets: GoalNet[];
  private readonly flags: ReturnType<typeof flags>;
  private readonly display: ArenaDisplays;
  private readonly mascots: ArenaMascots;
  private readonly surroundings: ArenaSurroundings;
  private readonly day = new T.Color('#fff0cd');
  private readonly dusk = new T.Color('#fec4bc');
  private lastCrowd = -1;
  private lastNet = -1;

  constructor(scene: T.Scene, teamNames: readonly [string, string]) {
    const rng = new Random('zeerush-stands');
    this.surroundings = new ArenaSurroundings(scene);
    turf(scene);
    this.crowd = grandstand(scene, rng);
    this.display = new ArenaDisplays(teamNames);
    boards(scene, this.display);
    this.nets = goals(scene);
    infrastructure(scene, this.display);
    supporterSigns(scene, teamNames);
    this.flags = flags(scene);
    this.mascots = new ArenaMascots(scene);
    batchStaticMeshes(scene);
    this.sun.position.set(-12, 27, 16);
    scene.add(this.hemi, this.sun);
  }

  update(time: number, tick: number, level: number, ballX: number, cue: ArenaCue | undefined, goalSide: number, wave: number) {
    const evening = (1 - Math.cos(time * Math.PI / 540)) * 0.5;
    this.surroundings.update(time, evening);
    this.sun.color.copy(this.day).lerp(this.dusk, evening);
    this.sun.intensity = mix(2.38, 1.66, evening);
    this.hemi.intensity = mix(2.00, 1.75, evening);
    this.display.update(cue);
    this.mascots.update(time, tick, ballX, cue);
    if (time - this.lastCrowd >= (level === 0 ? 1 / 10 : level === 1 ? 1 / 17 : 1 / 25)) {
      this.lastCrowd = time;
      this.crowd.update(time, tick, cue);
      for (const { geometry, phase, team, x, w } of this.flags) {
        const attr = geometry.attributes.position;
        const flutter = team === undefined ? 0 : Math.max(0, fanReaction(cue, tick, team, x)) * .15;
        for (let j = 0; j < attr.count; j++) {
          const fraction = (attr.getX(j) + w / 2) / w;
          attr.setZ(j, Math.sin(time * 3.7 + phase - fraction * 5.2) * fraction * w * (0.22 + flutter));
        }
        attr.needsUpdate = true;
        geometry.computeVertexNormals();
      }
    }
    if (this.lastNet !== wave) {
      this.lastNet = wave;
      for (const net of this.nets) {
        const coords = net.geometry.attributes.position;
        for (let i = 0; i < coords.count; i++) {
          const x = net.base[i * 3];
          const z = net.base[i * 3 + 2];
          const amplitude = net.side === goalSide ? wave * Math.max(0, Math.abs(x) - FIELD.x) * 0.13 : 0;
          coords.setX(i, x + net.side * amplitude * Math.cos(z * 0.94 - time * 7));
        }
        coords.needsUpdate = true;
      }
    }
  }
}
