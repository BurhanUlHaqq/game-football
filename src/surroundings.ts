import * as T from 'three';
import { box, cylinder, instances, material, mesh, plane, sphere, textTexture } from './art';
import type { StaticShape } from './art';
import { mix, Random } from './football';

const groundLevel = -.43;
const foliage = new T.SphereGeometry(1, 9, 6);
const stone = material('#c4b3a1');
const warmStone = material('#ad8d79');
const lawn = material('#7da480');
const road = material('#73718b');
const colors = material('#ffffff');

function surface(scene: T.Scene, mat: T.Material, x: number, y: number, z: number, width: number, depth: number) {
  return mesh(scene, plane, mat, x, y, z, width, depth, 1).rotateX(-Math.PI / 2);
}

function roundedSquare(x: number, z: number, radius: number) {
  const shape = new T.Shape();
  shape.moveTo(-x + radius, -z);
  shape.lineTo(x - radius, -z);
  shape.quadraticCurveTo(x, -z, x, -z + radius);
  shape.lineTo(x, z - radius);
  shape.quadraticCurveTo(x, z, x - radius, z);
  shape.lineTo(-x + radius, z);
  shape.quadraticCurveTo(-x, z, -x, z - radius);
  shape.lineTo(-x, -z + radius);
  shape.quadraticCurveTo(-x, -z, -x + radius, -z);
  return shape;
}

function promenade(scene: T.Scene, mat: T.Material, outer: [number, number], inner: [number, number], y: number) {
  const shape = roundedSquare(...outer, 3.5);
  shape.holes.push(roundedSquare(...inner, 1));
  const geometry = new T.ShapeGeometry(shape, 5);
  mesh(scene, geometry, mat, 0, y, 0, 1, 1, 1).rotateX(-Math.PI / 2);
}

function parkGround(scene: T.Scene, rng: Random) {
  const map = textTexture(256, 256, g => {
    g.fillStyle = '#e1edd4';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3600; i++) {
      g.fillStyle = i % 2 ? '#93b88920' : '#ffffff61';
      g.fillRect(rng.range(0, 256), rng.range(0, 256), rng.range(1, 4), rng.range(1, 3));
    }
  });
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.repeat.set(22, 22);
  map.anisotropy = 4;
  surface(scene, new T.MeshStandardMaterial({ color: '#7eaa80', map, roughness: 1 }), 0, groundLevel, 0, 360, 360);
  promenade(scene, warmStone, [42, 31], [35.2, 24.4], -.395);
  promenade(scene, stone, [41.15, 30.15], [35.5, 24.6], -.384);
  surface(scene, stone, 0, -.052, 22.2, 9.2, 5.4);
  for (let step = 0; step < 3; step++) {
    const rise = .29 - step * .088;
    mesh(scene, box, warmStone, 0, groundLevel + rise / 2, 25.19 + step * .37, 9.2, rise, .38);
  }
  for (const side of [-1, 1]) {
    surface(scene, stone, side * 47, -.385, 0, 16, 8.2);
    surface(scene, stone, 0, -.383, side * 37, 9.2, 17);
    surface(scene, warmStone, 0, -.391, side * 42.7, 12.2, 7.6);
    surface(scene, road, 0, -.399, side * 48.5, 115, 5.5);
    surface(scene, road, side * 55, -.398, 0, 5.5, 103);
  }
  // Small plaza pavers and road markings use a single shared batch.
  const lines: StaticShape[] = [];
  for (const side of [-1, 1]) {
    for (let n = -12; n <= 12; n++) {
      if (Math.abs(n) < 2) continue;
      lines.push({ x: n * 4.1, y: -.391, z: side * 48.5, sx: 1.72, sy: .014, sz: .12, color: '#e4d4c5' });
    }
    for (let n = -4; n <= 4; n++) {
      lines.push({ x: n * .78, y: -.391, z: side * 48.5, sx: .37, sy: .014, sz: 4.15, color: '#f9ebd7' });
      lines.push({ x: side * 55, y: -.39, z: n * .78, sx: 4.13, sy: .014, sz: .37, color: '#f9ebd7' });
    }
  }
  for (let x = -2; x <= 2; x++) for (let z = 0; z < 3; z++) {
    lines.push({ x: x * 1.78, y: -.375, z: 26.55 + z * 1.6, sx: 1.59, sy: .018, sz: 1.43, color: (x + z) % 2 ? '#dfc7b9' : '#f1d8c0' });
    lines.push({ x: x * 1.78, y: -.045, z: 20.52 + z * 1.6, sx: 1.59, sy: .014, sz: 1.43, color: (x + z) % 2 ? '#d4c0b4' : '#ead1bd' });
  }
  instances(scene, box, colors, lines);
}

function plantPark(scene: T.Scene, rng: Random) {
  const trunks: StaticShape[] = [];
  const leaves: StaticShape[] = [];
  const furniture: StaticShape[] = [];
  const flowers: StaticShape[] = [];
  const lightbulbs: StaticShape[] = [];
  const greens = ['#6d9f70', '#478d78', '#9db16d', '#5fa07d', '#84aa6c'];
  const flowersColors = ['#f2b572', '#dc889f', '#eabe65', '#e7e8be', '#bc9bda'];
  const tree = (x: number, z: number, height: number) => {
    const color = greens[Math.floor(rng.range(0, greens.length))];
    const crown = height * rng.range(.24, .34);
    trunks.push({ x, y: groundLevel + height * .27, z, sx: .16 + height * .034, sy: height * .54, sz: .16 + height * .034, color: '#795d58' });
    leaves.push({ x, y: groundLevel + height * .75, z, sx: crown, sy: height * .36, sz: crown, color });
    leaves.push({ x: x + crown * .68, y: groundLevel + height * .63, z: z - .18, sx: crown * .63, sy: height * .24, sz: crown * .69, color });
  };
  for (const side of [-1, 1]) {
    for (const x of [12, 20, 28, 36, 45]) tree(side * (x + rng.range(-1.2, 1.2)), -36 + rng.range(-2, 2), rng.range(2.8, 5.2));
    for (const z of [-35, -23, -13, 13, 21, 33]) tree(side * (46 + rng.range(-1.1, 1.3)), z, rng.range(3.0, 6.0));
    for (const x of [22, 30, 38]) tree(side * x, 33 + rng.range(-.7, 2), rng.range(2.5, 4.3));
    for (const x of [8.8, 16, 25.4, 33.7]) {
      const z = x > 20 ? 30.85 : 28.95;
      mesh(scene, cylinder, warmStone, side * x, -.345, z, 1.46, .16, .88);
      mesh(scene, cylinder, lawn, side * x, -.258, z, 1.29, .09, .74);
      for (let i = 0; i < 12; i++) {
        const a = rng.range(0, Math.PI * 2);
        const spread = Math.sqrt(rng.next());
        const dx = Math.cos(a) * spread;
        const dz = Math.sin(a) * spread * .54;
        leaves.push({ x: side * x + dx, y: -.10, z: z + dz, sx: .24, sy: .18, sz: .19, color: '#5d976f' });
        flowers.push({ x: side * x + dx, y: .09 + rng.range(-.04, .1), z: z + dz, sx: .122, sy: .092, sz: .12,
          color: flowersColors[(i + Math.round(x)) % flowersColors.length] });
      }
    }
    for (const x of [7.45, 14.1, 22.4]) {
      furniture.push({ x: side * x, y: .02, z: 22.22, sx: 3.55, sy: .19, sz: 1.32, color: '#bb8e81' });
      furniture.push({ x: side * x, y: .121, z: 22.22, sx: 3.36, sy: .06, sz: 1.15, color: '#779a78' });
      for (let i = 0; i < 8; i++) {
        const dx = (i - 3.5) * .40 + rng.range(-.08, .08);
        const z = 22.22 + rng.range(-.31, .31);
        leaves.push({ x: side * x + dx, y: .22, z, sx: .26, sy: .21, sz: .25, color: '#689a71' });
        flowers.push({ x: side * x + dx, y: .40, z, sx: .13, sy: .095, sz: .12,
          color: flowersColors[(i + Math.round(x)) % flowersColors.length] });
      }
    }
    for (const z of [-31, 27.5, 36]) {
      const x = side * (z === 27.5 ? 20 : z === 36 ? 12.5 : 37.6);
      trunks.push({ x, y: .76, z, sx: .077, sy: 2.35, sz: .077, color: '#615671' });
      furniture.push({ x, y: 2.03, z, sx: .37, sy: .09, sz: .37, color: '#615671' });
      lightbulbs.push({ x, y: 1.88, z, sx: .137, sy: .19, sz: .137 });
    }
    const x = side * 11.8;
    for (const z of [30.8, 34.2]) {
      furniture.push({ x, y: -.063, z, sx: 2.22, sy: .14, sz: .49, color: '#ab786d' });
      furniture.push({ x, y: .22, z: z + .21, sx: 2.19, sy: .40, sz: .092, color: '#b68673' });
      for (const shift of [-.83, .83]) furniture.push({ x: x + shift, y: -.245, z, sx: .115, sy: .38, sz: .40, color: '#66586c' });
    }
  }
  instances(scene, cylinder, colors, trunks);
  instances(scene, foliage, colors, leaves);
  instances(scene, foliage, colors, flowers);
  instances(scene, box, colors, furniture);
  const bulbMaterial = new T.MeshBasicMaterial({ color: '#e8d9ba' });
  instances(scene, foliage, bulbMaterial, lightbulbs);
  return bulbMaterial;
}

function fountain(scene: T.Scene) {
  const x = 0;
  const z = 36.4;
  mesh(scene, cylinder, warmStone, x, -.326, z, 3.1, .21, 2.55);
  mesh(scene, cylinder, stone, x, -.204, z, 2.74, .12, 2.26);
  const water = new T.MeshStandardMaterial({ color: '#6fb8bd', roughness: .46, metalness: .13 });
  mesh(scene, cylinder, water, x, -.133, z, 2.49, .058, 2.1);
  mesh(scene, cylinder, stone, x, .04, z, .46, .38, .46);
  const shimmer = material('#abdddc');
  const jet = mesh(scene, sphere, shimmer, x, .365, z, .115, .26, .115);
  const rim = new T.RingGeometry(.44, .485, 32);
  const rings = [0, 1].map(index => {
    const ripple = mesh(scene, rim, new T.MeshBasicMaterial({ color: '#dbf4ed', transparent: true, depthWrite: false }), x, -.098 + index * .002, z, 1, 1, 1);
    ripple.rotateX(-Math.PI / 2);
    return ripple;
  });
  return { jet, rings };
}

function neighborhood(scene: T.Scene, rng: Random) {
  const walls: StaticShape[] = [];
  const roofs: StaticShape[] = [];
  const windows: StaticShape[] = [];
  const wallColors = ['#edc49e', '#c4bdde', '#dfb1ab', '#e2cead', '#a5bfb8', '#cf9d8e'];
  const roofColors = ['#b77373', '#797197', '#9c707d', '#6c8a9d', '#ba886d'];
  const roofProfile = new T.Shape();
  roofProfile.moveTo(-.53, 0);
  roofProfile.lineTo(.53, 0);
  roofProfile.lineTo(0, 1);
  roofProfile.closePath();
  const roof = new T.ExtrudeGeometry(roofProfile, { depth: 1, bevelEnabled: false }).translate(0, 0, -.5);
  const directions = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  for (const yaw of directions) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    for (let row = 0; row < 2; row++) for (let i = -5; i <= 5; i++) {
      const x = i * 10.0 + rng.range(-1.6, 1.6) + row * 3;
      const z = (yaw === 0 ? -57 : -64) - row * 12 + rng.range(-1.3, 1.5);
      const w = rng.range(4.8, 7.7);
      const h = rng.range(2.8, 5.0) + row * .9;
      const d = rng.range(4.5, 6.6);
      const wall = wallColors[Math.floor(rng.range(0, wallColors.length))];
      const cover = roofColors[Math.floor(rng.range(0, roofColors.length))];
      const part = (dx: number, y: number, dz: number, sx: number, sy: number, sz: number, color: string): StaticShape => ({
        x: (x + dx) * cos + (z + dz) * sin, y: groundLevel + y, z: (z + dz) * cos - (x + dx) * sin, sx, sy, sz, r: yaw, color,
      });
      walls.push(part(0, h / 2, 0, w, h, d, wall));
      roofs.push(part(0, h - .04, 0, w + .47, rng.range(1.6, 2.7), d + .63, cover));
      walls.push(part(.23 * w, h + .97, -.18 * d, .51, 1.64, .61, cover));
      for (const dx of [-.29 * w, 0, .29 * w]) {
        walls.push(part(dx, h * .69, d / 2 + .02, .88, .92, .074, '#f2dfc4'));
        windows.push(part(dx, h * .69, d / 2 + .074, .64, .68, .043, '#80969c'));
      }
      walls.push(part(0, .73, d / 2 + .02, .89, 1.46, .085, cover));
    }
  }
  instances(scene, box, colors, walls);
  instances(scene, roof, colors, roofs);
  const glazing = new T.MeshStandardMaterial({ color: '#ffffff', emissive: '#f8bd82', emissiveIntensity: .10, roughness: .78 });
  instances(scene, box, glazing, windows);
  return glazing;
}

function buildSky(scene: T.Scene, rng: Random) {
  const sky = new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, toneMapped: false,
    uniforms: { evening: { value: 0 }, day: { value: new T.Color('#82badb') }, dawn: { value: new T.Color('#f4d6b5') },
      dusk: { value: new T.Color('#967aaa') }, sunset: { value: new T.Color('#ffb094') }, glow: { value: new T.Color('#ffdb96') },
      sunColor: { value: new T.Color('#fff4c8') } },
    vertexShader: `varying vec3 world;
      void main() {
        world = (modelMatrix * vec4(position, 1.0)).xyz;
        vec4 clip = projectionMatrix * viewMatrix * vec4(world, 1.0);
        gl_Position = clip.xyww;
      }`,
    fragmentShader: `varying vec3 world;
      uniform vec3 day, dawn, dusk, sunset, glow, sunColor;
      uniform float evening;
      void main() {
        vec3 ray = normalize(world - cameraPosition);
        float height = smoothstep(-0.072, 0.14, ray.y);
        vec3 color = mix(mix(dawn, sunset, evening), mix(day, dusk, evening), height);
        vec3 direction = normalize(vec3(-0.26, mix(0.045, 0.020, evening), -0.97));
        float angle = dot(ray, direction);
        color = mix(color, glow, smoothstep(0.93, 0.9988, angle) * 0.37);
        color = mix(color, sunColor, smoothstep(0.99865, 0.99925, angle) * 0.94);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = mesh(scene, new T.SphereGeometry(167, 32, 16), sky, 0, 0, 0, 1, 1, 1);
  dome.renderOrder = -100;
  dome.frustumCulled = false;
  const hills: StaticShape[] = [];
  const hillColors = ['#b4adc5', '#929fbb', '#b5b4c7', '#9baebb'];
  for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 24; i++) {
    const a = (i + ring * .48) * Math.PI / 12;
    const radius = 102 + ring * 25 + rng.range(-4, 6);
    hills.push({ x: Math.sin(a) * radius, z: -Math.cos(a) * radius, y: -7 - ring * 4, sx: rng.range(14, 24),
      sy: rng.range(12, 19) + ring * 5, sz: rng.range(9, 16), r: -a, color: hillColors[i % hillColors.length] });
  }
  instances(scene, foliage, new T.MeshBasicMaterial({ color: '#ffffff' }), hills);

  const cloudMaterial = new T.MeshBasicMaterial({ color: '#ffffff', fog: false, toneMapped: false });
  const bands = [0, 1].map(band => {
    const shapes: StaticShape[] = [];
    for (let i = 0; i < 13; i++) {
      const a = (i + .27 + band * .39) * Math.PI * 2 / 13 + rng.range(-.15, .15);
      const radius = (band ? 120 : 85) + rng.range(-8, 8);
      const height = rng.range(12.3, 17.4) + band * 7.4;
      for (let k = -2; k <= 2; k++) {
        const shift = k * rng.range(3.2, 4.7);
        shapes.push({ x: Math.sin(a) * radius + Math.cos(a) * shift, z: -Math.cos(a) * radius + Math.sin(a) * shift,
          y: height + (2 - Math.abs(k)) * rng.range(.57, 1.10), sx: rng.range(3.8, 6.0),
          sy: rng.range(1.12, 2.05), sz: rng.range(2.3, 3.8), r: -a, color: k % 2 ? '#f3e8ed' : '#fff0e0' });
      }
    }
    return instances(scene, foliage, cloudMaterial, shapes);
  });
  return { sky, bands, cloudMaterial };
}

export class ArenaSurroundings {
  private readonly backdrop: ReturnType<typeof buildSky>;
  private readonly fountain: ReturnType<typeof fountain>;
  private readonly glazing: T.MeshStandardMaterial;
  private readonly bulbs: T.MeshBasicMaterial;
  private readonly fog = new T.FogExp2('#d3c5d3', .0083);
  private readonly dayFog = new T.Color('#d3c5d3');
  private readonly duskFog = new T.Color('#c0a0bc');
  private readonly white = new T.Color('#ffffff');
  private readonly blush = new T.Color('#f1cfdb');
  private readonly bulbDay = new T.Color('#e8d9ba');
  private readonly bulbDusk = new T.Color('#ffe29b');

  constructor(scene: T.Scene) {
    const rng = new Random('rush-arena-park');
    scene.fog = this.fog;
    this.backdrop = buildSky(scene, rng);
    parkGround(scene, rng);
    this.bulbs = plantPark(scene, rng);
    this.fountain = fountain(scene);
    this.glazing = neighborhood(scene, rng);
  }

  update(time: number, evening: number) {
    const { sky, cloudMaterial, bands } = this.backdrop;
    sky.uniforms.evening.value = evening;
    this.fog.color.copy(this.dayFog).lerp(this.duskFog, evening);
    cloudMaterial.color.copy(this.white).lerp(this.blush, evening * .7);
    bands[0].rotation.y = time * .0042;
    bands[1].rotation.y = time * .0029;
    this.glazing.emissiveIntensity = mix(.10, .66, evening);
    this.bulbs.color.copy(this.bulbDay).lerp(this.bulbDusk, evening);
    this.fountain.jet.scale.y = .24 + Math.sin(time * 4) * .09;
    for (const [i, ring] of this.fountain.rings.entries()) {
      const phase = (time * .48 + i * .5) % 1;
      ring.scale.setScalar(1 + phase * 3.5);
      ring.material.opacity = Math.sin(phase * Math.PI) * .29;
    }
  }
}
