import * as T from 'three';
import { ArticulatedInstances, box, cylinder, flat, material, mesh, plane, sphere, textTexture } from './art';
import { clamp } from './football';
import type { Team } from './football';
import { fanReaction } from './arena-show';
import type { ArenaCue } from './arena-show';

export const fanColors = [
  { light: '#ffe1a5', accent: '#ffb94f', deep: '#593848', dark: '#342038' },
  { light: '#bcffea', accent: '#63d7c5', deep: '#25555d', dark: '#1f3348' },
] as const;

type ScreenType = 'main' | 'ribbon';

function displayTexture(kind: ScreenType) {
  const map = textTexture(768, kind === 'main' ? 192 : 96, () => {});
  const material = new T.MeshBasicMaterial({ map });
  return { map, context: (map.image as HTMLCanvasElement).getContext('2d'), material };
}

export class ArenaDisplays {
  private readonly main = displayTexture('main');
  private readonly ribbon = displayTexture('ribbon');
  private previous?: ArenaCue;
  readonly mainMaterial = this.main.material;
  readonly ribbonMaterial = this.ribbon.material;

  constructor(private readonly teamNames: readonly [string, string]) {
    this.paint();
  }

  update(cue?: ArenaCue) {
    if (cue === this.previous) return;
    this.previous = cue;
    this.paint(cue);
  }

  private paint(cue?: ArenaCue) {
    const colors = cue?.team === undefined ? undefined : fanColors[cue.team];
    const teamLabel = cue?.team === undefined ? undefined : this.teamNames[cue.team].replace(/ FC$/i, '');
    const subtitle = cue?.score ? cue.score.join('  –  ') : cue?.detail ?? (cue ? teamLabel : 'ZEERUSH GAMING');
    const title = cue?.title ?? 'RUSH ARENA';

    for (const screen of [this.main, this.ribbon]) {
      const g = screen.context;
      if (!g) continue;
      const tall = screen === this.main;
      const { width, height } = g.canvas;
      g.fillStyle = colors?.dark ?? '#28213d';
      g.fillRect(0, 0, width, height);
      g.fillStyle = colors?.deep ?? '#423351';
      for (let y = 15; y < height; y += 12) for (let x = 15; x < width; x += 12) g.fillRect(x, y, 2, 2);
      g.fillStyle = colors?.accent ?? fanColors[0].accent;
      g.fillRect(0, 0, width, tall ? 7 : 6);
      g.fillStyle = colors?.light ?? fanColors[1].accent;
      g.fillRect(0, height - 7, width, 7);
      g.fillStyle = colors?.light ?? '#fff1d2';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${tall && subtitle ? 80 : 64}px Arial, sans-serif`;
      g.fillText(title, width / 2, tall && subtitle ? 70 : height / 2 + 1, width - 90);
      if (tall && subtitle) {
        g.font = '800 38px Arial, sans-serif';
        g.fillText(subtitle.toUpperCase(), width / 2, 145, width - 112);
      }
      screen.map.needsUpdate = true;
    }
  }
}

export function supporterSigns(scene: T.Scene, names: readonly [string, string]) {
  for (const [team, color] of fanColors.entries()) {
    const map = textTexture(512, 120, g => {
      g.fillStyle = color.deep;
      g.fillRect(0, 0, 512, 120);
      g.fillStyle = color.accent;
      g.fillRect(0, 0, 10, 120);
      g.fillRect(502, 0, 10, 120);
      g.fillStyle = color.light;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '900 58px Arial, sans-serif';
      g.fillText(names[team].replace(/ FC$/i, '').toUpperCase(), 256, 62, 438);
    });
    const label = new T.MeshBasicMaterial({ map });
    const backing = material(color.dark);
    const x = (team === 0 ? -1 : 1) * 13.4;
    mesh(scene, box, backing, x, 3.1, -17.82, 7.25, 1.34, 0.22);
    mesh(scene, plane, label, x, 3.1, -17.702, 6.94, 1.16, 1);
  }
}

type Mascot = { root: T.Object3D; top: T.Object3D; arms: T.Object3D[]; mouth: T.Object3D; team: Team };

function star() {
  const points = new T.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 5;
    const radius = i % 2 === 0 ? 0.73 : 0.48;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) points.moveTo(x, y);
    else points.lineTo(x, y);
  }
  points.closePath();
  return new T.ExtrudeGeometry(points, { depth: 0.20, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.085, bevelSegments: 2 });
}

/** Two foam mascots on the concourse, fully outside the match physics. */
export class ArenaMascots {
  private readonly batch = new ArticulatedInstances();
  private readonly cast: Mascot[];

  constructor(scene: T.Scene) {
    const white = material('#fff1cd');
    const ink = material('#30253c');
    const sparkle = flat('#fffaf0');
    const starShape = star();
    this.cast = ([0, 1] as const).map(team => {
      const colors = fanColors[team];
      const outfit = material(colors.accent);
      const cheek = material(team === 0 ? '#ee8963' : '#79c2db');
      const root = new T.Object3D();
      const x = (team === 0 ? -1 : 1) * 18.3;
      root.position.set(x, .28, -14.9);
      scene.add(root);
      mesh(scene, cylinder, material(colors.deep), x, 0.13, -14.9, .82, .26, .73);
      mesh(scene, cylinder, outfit, x, 0.28, -14.9, .78, .045, .69);
      const top = new T.Object3D();
      top.position.y = 1.25;
      root.add(top);
      const part = this.batch.part.bind(this.batch);
      for (const side of [-1, 1]) part(root, sphere, ink, side * .24, .12, .11, .23, .15, .30);
      part(root, sphere, outfit, 0, .51, 0, .49, .44, .33);
      if (team === 0) {
        for (let i = 0; i < 11; i++) {
          const a = i * Math.PI * 2 / 11;
          part(top, sphere, cheek, Math.sin(a) * .59, Math.cos(a) * .59, -.045, .18, .21, .17).rotation.z = -a;
        }
        part(top, sphere, outfit, 0, 0, 0, .60, .61, .39);
      } else part(top, starShape, outfit, 0, 0, -.07, 1, 1, 1);
      part(top, sphere, white, 0, -.08, .28, .40, .33, .13);
      for (const side of [-1, 1]) {
        part(top, sphere, ink, side * .16, .068, .40, .081, .106, .044);
        part(top, sphere, sparkle, side * .16 - .021, .103, .434, .026, .030, .016);
        part(top, sphere, cheek, side * .26, -.105, .379, .075, .048, .028);
      }
      const mouth = part(top, sphere, ink, 0, -.166, .406, .100, .057, .035);
      const arms = [-1, 1].map(side => {
        const arm = new T.Object3D();
        arm.position.set(side * .41, .63, 0);
        root.add(arm);
        part(arm, sphere, outfit, 0, -.229, .005, .125, .258, .116);
        part(arm, sphere, white, 0, -.44, .038, .145, .151, .13);
        return arm;
      });
      return { team, root, top, arms, mouth };
    });
    this.batch.build(scene);
  }

  update(time: number, tick: number, ballX: number, cue?: ArenaCue) {
    for (const mascot of this.cast) {
      const { root, team, top, arms, mouth } = mascot;
      const response = fanReaction(cue, tick, team, root.position.x);
      const rise = Math.max(0, response);
      const gasp = Math.max(0, -response);
      root.position.y = .29 + rise * .56;
      root.rotation.y = clamp((ballX - root.position.x) * .014, -.35, .35);
      top.rotation.z = Math.sin(time * 2.1 + team) * .045 + gasp * (team === 0 ? -.26 : .26);
      top.position.y = 1.25 - gasp * .32;
      mouth.scale.y = .057 + gasp * .13 + rise * .025;
      for (const [i, arm] of arms.entries()) {
        const side = i === 0 ? -1 : 1;
        arm.rotation.z = side * (.37 + rise * (1.66 + .30 * Math.sin(time * 8 + i)) + gasp * 1.12);
        arm.rotation.x = -.16 - gasp * .83;
      }
      root.updateMatrixWorld(true);
    }
    this.batch.update();
  }
}
