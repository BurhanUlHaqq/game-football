import * as T from 'three';
import { ArticulatedInstances, box, mesh, plane, softShadowMaterial } from './art';
import { ArenaShow } from './arena-show';
import { Character } from './characters';
import { BroadcastCamera } from './camera';
import { clamp, damp, mix, Random } from './football';
import type { MatchEvent, Point } from './football';
import type { Match } from './match';
import type { Preferences } from './settings';
import { makeFootball, Stadium } from './stadium';
import type { Celebration, MatchShow } from './show';

const qualityLevels = [{ scale: 0.65, maxHeight: 820, sparkCount: 14 }, { scale: 0.86, maxHeight: 1120, sparkCount: 24 }, { scale: 1, maxHeight: 2160, sparkCount: 42 }];
const MAX_SPARKS = 42;
const particle = new T.Object3D();
const ballRotation = new T.Quaternion();
const goalColors = [
  ['#ffce57', '#ff8259', '#fff3bd', '#ffb788'].map(color => new T.Color(color)),
  ['#72f5ce', '#f9a6fa', '#b9afff', '#e5fff6'].map(color => new T.Color(color)),
];
const SPARK_TTL = 1.17;

export class BroadcastRenderer {
  readonly scene = new T.Scene();
  readonly renderer: T.WebGLRenderer;
  readonly camera = new BroadcastCamera();
  readonly arena = new ArenaShow();
  readonly stadium: Stadium;
  readonly chars: Character[];
  readonly articulated = new ArticulatedInstances();
  readonly ball: T.Mesh;
  private readonly positions: { ball: T.Vector3; players: readonly T.Vector3[] };
  private readonly heroRing: T.Mesh<T.RingGeometry, T.MeshBasicMaterial>;
  readonly actualSize = new T.Vector2();
  readonly sparkMesh: T.InstancedMesh;
  private readonly shadows: T.Mesh[];
  private readonly sparkSeeds = Array.from({ length: MAX_SPARKS }, (_, i) => { const rng = new Random(`spark-${i}`); return { x: rng.range(-1.6, 1.6), y: rng.range(1.8, 5.5), z: rng.range(-3.6, 3.6), r: rng.range(0.03, 0.15) }; });
  private baseWidth = 0;
  private baseHeight = 0;
  private adjustedAt = -13;
  private slowFor = 0;
  private fastFor = 0;
  private resizeWatch: ResizeObserver;
  private level = 2;
  private quality: Preferences['quality'] = 'auto';
  renderMs = 0;
  frameMs = 16.7;
  frames = 0;
  renderScale = 1;
  lost = false;
  favorite?: number;

  constructor(readonly host: HTMLElement, match: Match, quality: Preferences['quality'], teamNames: readonly [string, string]) {
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.14;
    this.renderer.setClearColor('#44395e');
    this.renderer.domElement.setAttribute('aria-label', 'Live 3D football match at Rush Arena');
    this.host.append(this.renderer.domElement);
    this.stadium = new Stadium(this.scene, teamNames);
    this.chars = match.players.map(p => new Character(p, this.articulated));
    this.articulated.build(this.scene);
    this.ball = makeFootball(this.scene);
    this.positions = { ball: this.ball.position, players: this.chars.map(character => character.root.position) };
    this.heroRing = new T.Mesh(new T.RingGeometry(0.43, 0.57, 36), new T.MeshBasicMaterial({ color: '#fff196', transparent: true, opacity: 0.92, depthWrite: false }));
    this.heroRing.rotation.x = -Math.PI / 2;
    this.heroRing.scale.set(2.1, 2.1, 1);
    this.heroRing.renderOrder = 2;
    this.heroRing.visible = false;
    this.scene.add(this.heroRing);
    const shadow = softShadowMaterial();
    const footballShadow = shadow.clone();
    this.shadows = Array.from({ length: this.chars.length + 1 }, (_, i) => {
      const s = mesh(this.scene, plane, i === this.chars.length ? footballShadow : shadow, 0, 0.026, 0, 2.10, 1.71, 1);
      s.rotation.x = -Math.PI / 2;
      return s;
    });
    this.sparkMesh = new T.InstancedMesh(box, new T.MeshBasicMaterial({ color: '#ffffff' }), MAX_SPARKS);
    this.sparkMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.sparkMesh.frustumCulled = false;
    this.sparkMesh.visible = false;
    this.scene.add(this.sparkMesh);
    this.setQuality(quality);
    this.resizeWatch = new ResizeObserver(() => this.resize());
    this.resizeWatch.observe(host);
    this.renderer.domElement.addEventListener('webglcontextlost', this.lose);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.restore);
  }

  private lose = (event: Event) => { event.preventDefault(); this.lost = true; };
  private restore = () => { this.lost = false; this.resize(true); };

  setQuality(quality: Preferences['quality']) {
    if (quality === this.quality && this.baseWidth > 0) return;
    this.quality = quality;
    this.level = quality === 'low' ? 0 : quality === 'medium' ? 1 : 2;
    this.slowFor = this.fastFor = 0;
    this.resize(true);
  }

  private resize(force = false) {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    if (!force && width === this.baseWidth && height === this.baseHeight) return;
    this.baseWidth = width;
    this.baseHeight = height;
    const desired = Math.min(2, window.devicePixelRatio || 1);
    const spec = qualityLevels[this.level];
    this.renderScale = Math.min(spec.scale * desired, spec.maxHeight / height, spec.maxHeight * 16 / 9 / width, this.renderer.capabilities.maxTextureSize / Math.max(width, height));
    this.renderer.setSize(Math.max(1, Math.round(width * this.renderScale)), Math.max(1, Math.round(height * this.renderScale)), false);
    this.camera.resize(width / height);
  }

  react(event: MatchEvent) {
    this.camera.react(event);
    return this.arena.react(event);
  }

  private effects(time: number, match: Match, celebration?: Celebration, lead?: Point) {
    const { tick } = match;
    const elapsed = celebration ? time - celebration.tick / 60 : -1;
    const age = elapsed % (celebration?.kind === 'fulltime' ? 2.2 : 1.43);
    const amount = clamp(1 - age / SPARK_TTL, 0, 1);
    this.stadium.update(time, tick, this.level, match.currentBall.x, this.arena.get(tick), match.netImpact);
    this.sparkMesh.visible = age >= 0 && age < SPARK_TTL && (celebration?.kind !== 'goal' || elapsed > 1.45);
    if (!this.sparkMesh.visible) return;
    const limit = qualityLevels[this.level].sparkCount;
    this.sparkMesh.count = limit;
    for (let i = 0; i < limit; i++) {
      const s = this.sparkSeeds[i];
      if (lead) {
        particle.position.set(lead.x + s.x * (0.55 + age * 2.8), 2.0 + s.y * age - age * age * 3.1, lead.z - 0.9 + s.z * (0.18 + age * 0.65));
        const size = (0.10 + s.r) * Math.sqrt(amount);
        particle.scale.set(size * 1.35, size * 0.65, size * 0.28);
      } else {
        particle.position.set(s.x * (2 + age * 2.8), 2.4 + s.y * age - age * age * 2.3, s.z * (0.45 + age * 0.63));
        particle.scale.setScalar((0.055 + s.r) * Math.sqrt(amount));
      }
      particle.rotation.set(i + 7 * age, i * 0.125 + age * 4.2, i * 0.4 - age * 2);
      particle.updateMatrix();
      this.sparkMesh.setMatrixAt(i, particle.matrix);
      const colors = goalColors[celebration?.team ?? i % 2];
      this.sparkMesh.setColorAt(i, colors[i % colors.length]);
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;
  }

  draw(match: Match, alpha: number, dt: number, observedInterval: number, target: number, show: MatchShow) {
    if (this.lost) return;
    const started = performance.now();
    const time = (match.tick + alpha) / 60;
    const celebration = show.getCelebration(match.tick);
    const pair = match.state === 'live' ? this.camera.actionPair(match.tick) : undefined;
    for (let i = 0; i < this.chars.length; i++) {
      const ch = this.chars[i];
      const glance = pair && (i === pair.player || i === pair.partner) ? {
        partner: match.players[i === pair.player ? pair.partner : pair.player], elapsed: time - pair.tick / 60,
      } : undefined;
      const restart = match.ballReturn?.thrower === i ? match.ballReturn : undefined;
      const lift = restart && restart.stage !== 'collect' ? restart.stage === 'carry' ? 0 : clamp((match.tick - restart.since) / 39.6, 0, 1) : undefined;
      const pickup = restart?.stage === 'collect' ? clamp(1 - Math.hypot(match.players[i].x - match.currentBall.x, match.players[i].z - match.currentBall.z) / 1.6, 0, 1) :
        restart?.stage === 'carry' ? clamp(1 - (match.tick - restart.since) / 17, 0, 1) : 0;
      const heldPosition = lift === undefined && match.heldKeeper?.id !== i ? undefined : {
        x: mix(match.previousBall.x, match.currentBall.x, alpha), y: mix(match.previousBall.y, match.currentBall.y, alpha), z: mix(match.previousBall.z, match.currentBall.z, alpha),
      };
      ch.animate(alpha, time, dt, show.getGesture(i, match.tick), this.camera.focus === i, match.owner?.id === i, glance, lift, pickup, heldPosition);
      this.shadows[i].position.x = ch.root.position.x + 0.10;
      this.shadows[i].position.z = ch.root.position.z - 0.085;
    }
    this.effects(time, match, celebration, celebration?.lead === undefined ? undefined : this.chars[celebration.lead].root.position);
    this.articulated.update();
    const favorite = this.favorite === undefined ? undefined : this.chars[this.favorite];
    this.heroRing.visible = !!favorite && match.state !== 'halftime' && match.state !== 'fulltime';
    if (favorite) this.heroRing.position.set(favorite.root.position.x, 0.046, favorite.root.position.z);
    this.ball.visible = match.ballVisible;
    const ballShadow = this.shadows[this.shadows.length - 1];
    ballShadow.visible = this.ball.visible;
    if (match.ballVisible) {
      const a = match.previousBall, b = match.currentBall;
      this.ball.position.set(mix(a.x, b.x, alpha), mix(a.y, b.y, alpha), mix(a.z, b.z, alpha));
      this.ball.quaternion.set(match.previousRotation.x, match.previousRotation.y, match.previousRotation.z, match.previousRotation.w);
      ballRotation.set(match.currentRotation.x, match.currentRotation.y, match.currentRotation.z, match.currentRotation.w);
      this.ball.quaternion.slerp(ballRotation, alpha);
      ballShadow.position.x = this.ball.position.x + this.ball.position.y * 0.19;
      ballShadow.position.z = this.ball.position.z - this.ball.position.y * 0.11;
      const shadowSize = 0.67 + this.ball.position.y * 0.15;
      (ballShadow.material as T.MeshBasicMaterial).opacity = 1 / (1 + this.ball.position.y * .36);
      ballShadow.scale.set(shadowSize, shadowSize, 1);
    }
    this.camera.update(match, dt, show, this.positions);
    this.renderer.render(this.scene, this.camera.camera);
    this.frames++;
    const smooth = damp(2.1, dt);
    this.renderMs = mix(this.renderMs, performance.now() - started, smooth);
    this.frameMs = mix(this.frameMs, observedInterval, smooth);
    if (this.quality === 'auto') this.adjust(time, dt, target);
  }

  copyFrame(target: CanvasRenderingContext2D) {
    if (this.lost) return false;
    const source = this.renderer.domElement;
    const { width, height } = target.canvas;
    const scale = Math.min(width / source.width, height / source.height);
    const w = source.width * scale;
    const h = source.height * scale;
    target.fillStyle = '#252238';
    target.fillRect(0, 0, width, height);
    target.drawImage(source, (width - w) / 2, (height - h) / 2, w, h);
    return true;
  }

  framing() {
    const pixel = this.ball.position.clone().project(this.camera.camera);
    const subject = this.camera.subjects[0];
    const feet = subject === undefined ? undefined : this.positions.players[subject];
    const height = feet ? (feet.clone().add(new T.Vector3(0, 2.85, 0)).project(this.camera.camera).y - feet.clone().project(this.camera.camera).y) * 0.5 : 0;
    return { mode: this.camera.mode, scale: this.camera.scale, ballX: pixel.x, ballY: pixel.y, ballVisible: this.ball.visible,
      subjects: this.camera.subjects.slice(), subjectHeight: height };
  }

  namePoint(id: number) {
    const point = this.chars[id].root.position.clone();
    point.y += 3.14;
    point.project(this.camera.camera);
    return { x: (point.x + 1) / 2, y: (1 - point.y) / 2 };
  }

  screenPoints(ids: readonly (number | undefined)[]) {
    const map = (position: T.Vector3) => {
      const p = position.project(this.camera.camera);
      return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
    };
    const points = this.ball.visible ? [map(this.ball.position.clone())] : [];
    for (const id of new Set(ids)) {
      if (id === undefined) continue;
      const position = this.chars[id]?.root.position;
      if (!position) continue;
      points.push(map(position.clone().add(new T.Vector3(0, 2.43, 0))));
      if (this.camera.mode === 'celebration') {
        points.push(map(position.clone().add(new T.Vector3(0, 1.20, 0))));
      }
    }
    return points;
  }

  private adjust(t: number, dt: number, target: number) {
    const budget = 1000 / target;
    const tooSlow = this.frameMs > budget * 1.23 || this.renderMs > budget * 0.90;
    const fast = this.frameMs < budget * 1.085 && this.renderMs < budget * 0.48;
    this.slowFor = tooSlow ? this.slowFor + dt : 0;
    this.fastFor = fast ? this.fastFor + dt : 0;
    if (t - this.adjustedAt < 12) return;
    const next = clamp(this.level + (this.slowFor >= 4.5 ? -1 : this.fastFor >= 36 ? 1 : 0), 0, 2);
    if (this.level === next) return;
    this.level = next;
    this.adjustedAt = t;
    this.slowFor = this.fastFor = 0;
    this.resize(true);
  }

  info() {
    const { memory, render } = this.renderer.info;
    this.renderer.getDrawingBufferSize(this.actualSize);
    return { frameMs: this.frameMs, fps: 1000 / this.frameMs, renderMs: this.renderMs, frames: this.frames, level: this.level, scale: this.renderScale, pixelWidth: this.actualSize.x, pixelHeight: this.actualSize.y, viewportWidth: this.baseWidth, viewportHeight: this.baseHeight, calls: render.calls, triangles: render.triangles, geometries: memory.geometries, textures: memory.textures, particles: this.sparkMesh.visible ? this.sparkMesh.count : 0, markedHero: this.heroRing.visible ? this.favorite : undefined, contextLost: this.lost };
  }

  dispose() {
    this.resizeWatch.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.lose);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.restore);
    const geometries = new Set<T.BufferGeometry>();
    const materials = new Set<T.Material>();
    this.scene.traverse(item => {
      if (!(item instanceof T.Mesh) && !(item instanceof T.LineSegments)) return;
      geometries.add(item.geometry);
      for (const material of [item.material].flat() as T.Material[]) materials.add(material);
      if (item instanceof T.InstancedMesh) item.dispose();
    });
    for (const geo of geometries) geo.dispose();
    for (const mat of materials) {
      for (const value of Object.values(mat)) if (value instanceof T.Texture) value.dispose();
      mat.dispose();
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
