import * as T from 'three';
import { ArticulatedInstances, box, textTexture, material } from './art';
import { fanColors } from './arena-decor';
import { fanReaction } from './arena-show';
import type { ArenaCue } from './arena-show';
import type { Team } from './football';

export type FanSeat = { x: number; y: number; z: number; height: number; phase: number; row: number; team: Team };

const shirts = [
  ['#efad49', '#f9cc78', '#ee7d74', '#f5e4bc', '#bc7ca4', '#df9d70', '#f3cd84', '#ea965a'],
  ['#63baa6', '#adebce', '#6dbed6', '#8a9dc8', '#a889bb', '#57969e', '#dbf0de', '#54bbbf'],
];
const outfits = [
  ['#ffdf8c', '#ee715e', '#bf90e1', '#78bdc9', '#faf1c9', '#a96463', '#85b887', '#eaa6ba'],
  ['#81ebce', '#5377b1', '#e4b6ed', '#ffd978', '#ddf4ff', '#57817a', '#ea9bc1', '#aabce8'],
];
const coats = ['#fed5ac', '#c88467', '#905f55', '#edb47d', '#d6a3bf', '#705167', '#b9a8ce', '#f8ebcc'];

export function fanAppearance(index: number, team: Team) {
  // A permutation of the style slots keeps consecutive seats varied and gives each fan a distinct combination.
  const style = (Math.imul(index, 3187) + 2479) & 16383;
  return { hat: style & 7, accent: outfits[team][style >>> 3 & 7], shirt: shirts[team][style >>> 6 & 7],
    coat: coats[style >>> 9 & 7], face: style >>> 12 };
}

const round = new T.SphereGeometry(1, 7, 5);
const brim = new T.CylinderGeometry(1, 1, 1, 8);
const pointed = new T.ConeGeometry(1, 1, 5);
type HatPiece = readonly [geometry: T.BufferGeometry, x: number, y: number, z: number,
  sx: number, sy: number, sz: number, tilt: number, fur?: boolean];

const headwear: readonly (readonly HatPiece[])[] = [
  [[round, 0, .112, -.014, .162, .107, .146, .0], [round, -.030, .226, -.023, .067, .068, .063, .0]],
  [[round, .004, .097, -.010, .172, .100, .158, -.09], [round, .0, .081, .119, .155, .028, .133, -.08]],
  [[round, -.119, .128, -.015, .081, .095, .069, .31, true], [round, .119, .128, -.015, .078, .083, .068, -.29, true]],
  [[round, -.082, .174, -.008, .056, .140, .059, .32, true], [round, .091, .157, -.012, .057, .108, .055, -.42, true]],
  [[round, .062, .139, -.027, .122, .082, .115, -.32], [round, .117, .201, -.040, .089, .073, .076, -.42]],
  [[brim, .0, .146, .006, .132, .116, .133, .14], [brim, .0, .098, .006, .177, .026, .165, .14]],
  [[pointed, -.091, .152, .0, .096, .193, .077, .41, true], [pointed, .095, .140, .0, .092, .168, .075, -.31, true]],
  [[round, -.119, .111, -.023, .095, .081, .092, .30], [round, .119, .122, -.03, .098, .096, .091, -.30]],
];
const headSizes = [[.153, .180], [.173, .155], [.136, .187], [.164, .167]];

function fanFace(expression: number) {
  const map = textTexture(64, 48, ctx => {
    ctx.fillStyle = '#483045';
    for (const x of [19, 45]) {
      ctx.beginPath();
      ctx.ellipse(x, 17, expression === 2 ? 6 : 5, expression === 1 ? 4 : 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(32, 33, expression === 3 ? 6 : 9, expression === 3 ? 7 : 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  return new T.MeshBasicMaterial({ map, alphaTest: .35 });
}

type Fan = FanSeat & { root: T.Object3D; head: T.Object3D; pennant?: T.Object3D };

export class ArenaCrowd {
  private readonly batch = new ArticulatedInstances();
  private readonly cast: Fan[];

  constructor(scene: T.Scene, seats: readonly FanSeat[]) {
    const paint = material('#ffffff');
    const faces = headSizes.map((_, i) => fanFace(i));
    const facePlane = new T.PlaneGeometry(1, 1);
    this.cast = seats.map((seat, index) => {
      const { x, y, z, team, height } = seat;
      const look = fanAppearance(index, team);
      const root = new T.Object3D();
      root.position.set(x, y, z);
      root.rotation.y = Math.atan2(-x, -z);
      const torsoWidth = .18 + (look.face % 2) * .036;
      this.batch.part(root, round, paint, 0, 0, 0, torsoWidth, height, .189, look.shirt);
      this.batch.part(root, round, paint, .0, height * .63, .052, torsoWidth * .78, .061, .149, look.accent);

      const head = new T.Object3D();
      head.position.y = height + .13;
      root.add(head);
      const [headWidth, headHeight] = headSizes[look.face];
      this.batch.part(head, round, paint, 0, 0, 0, headWidth, headHeight, .151, look.coat);
      this.batch.part(head, facePlane, faces[look.face], 0, -.013, .153, headWidth * 1.34, headHeight * 1.01, 1);
      for (const [geometry, px, py, pz, sx, sy, sz, tilt, fur] of headwear[look.hat]) {
        const piece = this.batch.part(head, geometry, paint, px, py, pz, sx, sy, sz, fur ? look.coat : look.accent);
        piece.rotation.z = tilt;
      }

      const pennant = seat.row > 0 && index % 7 === 0 ?
        this.batch.part(root, box, paint, .265, height + .075, .24, .39, .24, .035, fanColors[team].accent) : undefined;
      root.updateMatrixWorld(true);
      return { ...seat, root, head, pennant };
    });
    this.batch.build(scene);
    this.batch.update();
  }

  update(time: number, tick: number, cue?: ArenaCue) {
    for (const { root, head, pennant, height, team, phase, x, y } of this.cast) {
      const response = fanReaction(cue, tick, team, x);
      const rise = Math.sin(time * 3 + phase) * .035 + response * (response > 0 ? .64 : .31);
      root.position.x = x + Math.sin(time * 1.6 + phase) * .039;
      root.position.y = y + rise * .65;
      root.rotation.z = -response * .12;
      head.position.y = height + .13 + rise * .35;
      if (pennant) {
        const lift = Math.max(response, 0);
        pennant.position.y = height + .08 + lift * .49;
        pennant.rotation.z = Math.sin(time * 3.5 + phase) * (.12 + lift * .40);
      }
      root.updateMatrixWorld(true);
    }
    this.batch.update();
  }
}
