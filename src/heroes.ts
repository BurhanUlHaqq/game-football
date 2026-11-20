import type { EventKind } from './football';

type Gear = 'helmet' | 'goggles' | 'flower' | 'beret' | 'headband' | 'patch' | 'earpads' | 'quiff' | 'bow' | 'scarf';
type FaceDetail = readonly [x: number, y: number, width: number, height: number, tilt: number];
export type HeroFace = {
  shape: 'round' | 'boxy' | 'tapered';
  head: readonly [width: number, height: number, depth: number];
  muzzle: readonly [width: number, height: number];
  smile: readonly [width: number, openness: number];
  eyes: readonly [gap: number, width: number, height: number, tilt: number, offset: number];
  ears: readonly [width: number, leftHeight: number, rightHeight: number, splay: number];
  ruff: number;
  teeth: 'pair' | 'single' | 'fang' | 'none';
  muzzleColor: string; iris: string; mark: string;
  markings: readonly FaceDetail[];
  fringe: readonly FaceDetail[];
};
type Hero = {
  name: string; title: string; look: string; line: string; gear: Gear;
  fur: string; accent: string; body: number;
  torso: readonly [height: number, depth: number, neck: number];
  face: HeroFace;
  events: readonly EventKind[]; stat: readonly [string, string];
};

export const HEROES: readonly Hero[] = [
  { name: 'Mitts', title: 'Safe Hands', look: 'Sky-blue helmet', line: 'The calm keeper who loves a big save.',
    gear: 'helmet', fur: '#a96343', accent: '#63c7ff', body: 1.20, torso: [1.0, 1.04, -.035], events: ['save'], stat: ['save', 'saves'],
    face: { shape: 'boxy', head: [1.04, .87, 1.04], muzzle: [1.11, .92], smile: [.91, .52], eyes: [1.03, .86, .88, .10, .00], ears: [.90, .73, .76, .31],
      ruff: 0, teeth: 'none', muzzleColor: '#ffce93', iris: '#46699b', mark: '#e5a66a', markings: [[-.357, .19, .085, .095, -.24], [.357, .19, .085, .095, .24]], fringe: [] } },
  { name: 'Pip', title: 'The Puzzle Solver', look: 'Round blue goggles', line: 'Looks for the tiny gaps in a crowded pitch.',
    gear: 'goggles', fur: '#d69456', accent: '#505ee3', body: .99, torso: [.84, .84, -.11], events: ['interception'], stat: ['interception', 'interceptions'],
    face: { shape: 'round', head: [.94, .99, .94], muzzle: [.84, .86], smile: [.86, .81], eyes: [1.03, 1.09, 1.10, .0, .0], ears: [1.10, 1.30, 1.23, .27],
      ruff: 0, teeth: 'single', muzzleColor: '#ffedb5', iris: '#786339', mark: '#98513c', markings: [[.023, .481, .062, .12, -.42]],
      fringe: [[-.10, .60, .129, .101, .53], [.047, .57, .107, .072, -.46]] } },
  { name: 'Sunny', title: 'The Bright Spark', look: 'Pink flower', line: 'Always looking for a run up the wing.',
    gear: 'flower', fur: '#a95845', accent: '#ff82b6', body: 1.11, torso: [1.03, .89, .06], events: ['shot'], stat: ['shot', 'shots'],
    face: { shape: 'tapered', head: [.98, 1.10, .94], muzzle: [.90, 1.08], smile: [1.12, .84], eyes: [1.06, .96, 1.04, .14, -.045], ears: [.84, .77, 1.18, .38],
      ruff: 0, teeth: 'pair', muzzleColor: '#ffc8aa', iris: '#74384e', mark: '#ffc07e', markings: [[-.35, .13, .105, .056, .30], [.35, .12, .095, .053, -.35], [.031, .515, .113, .091, -.28]],
      fringe: [[.11, .618, .131, .071, -.36], [.22, .567, .10, .064, -.48]] } },
  { name: 'Doodle', title: 'The Improviser', look: 'Lilac beret', line: 'Likes a pass that makes everyone turn their heads.',
    gear: 'beret', fur: '#e6ae79', accent: '#bd91ff', body: 1.26, torso: [.88, 1.13, -.11], events: ['pass'], stat: ['pass', 'passes'],
    face: { shape: 'round', head: [1.10, .84, 1.03], muzzle: [1.06, .96], smile: [1.04, .65], eyes: [1.04, .92, .93, -.16, .065], ears: [1.20, .77, .66, .75],
      ruff: 0, teeth: 'single', muzzleColor: '#ffebc8', iris: '#62518d', mark: '#9c6355', markings: [[-.365, .062, .091, .066, -.56]],
      fringe: [[-.205, .565, .123, .11, .31], [-.25, .49, .107, .067, .61]] } },
  { name: 'Boulder', title: 'The Show-Off', look: 'Orange headband', line: 'Plays for the big finish and the biggest bow.',
    gear: 'headband', fur: '#c77d49', accent: '#ff734c', body: 1.34, torso: [1.11, 1.17, .05], events: ['goal'], stat: ['goal', 'goals'],
    face: { shape: 'boxy', head: [1.10, .99, 1.02], muzzle: [1.16, 1.03], smile: [1.22, .80], eyes: [1.18, .94, .83, -.18, -.015], ears: [1.09, .91, .96, .41],
      ruff: 0, teeth: 'pair', muzzleColor: '#ffdda0', iris: '#67412e', mark: '#8c493a', markings: [[-.395, .12, .069, .094, .14], [.395, .12, .069, .094, -.14]],
      fringe: [[-.15, .62, .151, .075, .32], [.013, .64, .132, .078, .15], [.15, .61, .10, .066, -.29]] } },
  { name: 'Patch', title: 'The Comeback Keeper', look: 'Stitched pink patch', line: 'Dives for the ball, then bounces right back up.',
    gear: 'patch', fur: '#74598f', accent: '#ff8abd', body: .95, torso: [.99, .93, .00], events: ['save'], stat: ['save', 'saves'],
    face: { shape: 'tapered', head: [1.02, 1.06, 1.05], muzzle: [.90, 1.05], smile: [1.01, .99], eyes: [.99, 1.01, 1.06, .16, -.11], ears: [.87, 1.32, .59, .35],
      ruff: 1.04, teeth: 'fang', muzzleColor: '#edc8ea', iris: '#5b8870', mark: '#b59bcf', markings: [[.11, .49, .104, .155, .19]],
      fringe: [[-.085, .588, .113, .105, -.42]] } },
  { name: 'Crank', title: 'The Wall', look: 'Orange ear pads', line: 'Stays ready when the other side comes charging.',
    gear: 'earpads', fur: '#4d576f', accent: '#ffae59', body: 1.08, torso: [1.00, 1.12, -.08], events: ['tackle', 'interception'], stat: ['steal', 'steals'],
    face: { shape: 'boxy', head: [1.13, .84, 1.06], muzzle: [1.14, .82], smile: [.89, .48], eyes: [1.15, .93, .68, -.14, .01], ears: [1.19, .70, .80, .42],
      ruff: .80, teeth: 'none', muzzleColor: '#c6d8e1', iris: '#7e653e', mark: '#899bb0', markings: [[-.325, .39, .099, .082, -.42], [.325, .39, .099, .082, .42]],
      fringe: [[-.123, .603, .101, .087, -.40], [.027, .61, .097, .11, -.20], [.164, .59, .093, .089, -.24]] } },
  { name: 'Dash', title: 'The Speedster', look: 'Sky-blue quiff', line: 'Loves chasing a long ball down the wing.',
    gear: 'quiff', fur: '#458099', accent: '#6de3ff', body: .81, torso: [1.15, .77, .12], events: ['shot'], stat: ['shot', 'shots'],
    face: { shape: 'tapered', head: [.94, 1.09, .88], muzzle: [.82, .89], smile: [.91, .86], eyes: [1.07, .99, .81, -.24, .045], ears: [.73, 1.12, .88, .55],
      ruff: .72, teeth: 'single', muzzleColor: '#bce9ed', iris: '#3d537f', mark: '#9ce6df', markings: [[-.339, .14, .113, .032, .40], [-.365, .215, .084, .025, .40], [.345, .132, .11, .029, -.37], [.362, .207, .084, .024, -.38]],
      fringe: [] } },
  { name: 'Tangle', title: 'The Tinkerer', look: 'Yellow ear bow', line: 'Looks for a way to pass out of a scramble.',
    gear: 'bow', fur: '#9a587e', accent: '#ffe171', body: .88, torso: [.85, 1.00, -.075], events: ['pass'], stat: ['pass', 'passes'],
    face: { shape: 'round', head: [1.02, .93, .97], muzzle: [1.03, .99], smile: [1.10, .83], eyes: [1.00, 1.08, .98, .08, .092], ears: [1.11, .67, 1.15, .42],
      ruff: 1.36, teeth: 'pair', muzzleColor: '#f6d0e9', iris: '#6e7046', mark: '#653653', markings: [[.085, .47, .071, .118, .52], [-.375, .22, .079, .086, -.23]],
      fringe: [[-.146, .623, .116, .125, .46], [-.016, .60, .103, .102, .08]] } },
  { name: 'Zip', title: 'The Trickster', look: 'Mint scarf', line: 'Likes a sneaky finish and a victory twirl.',
    gear: 'scarf', fur: '#aa8bbb', accent: '#9cf0c4', body: .87, torso: [1.07, .93, .065], events: ['goal'], stat: ['goal', 'goals'],
    face: { shape: 'tapered', head: [.99, 1.04, 1.01], muzzle: [.93, .86], smile: [1.18, .64], eyes: [1.16, .96, 1.04, -.10, -.10], ears: [.82, 1.41, 1.22, .26],
      ruff: .88, teeth: 'fang', muzzleColor: '#ecd7ed', iris: '#487b72', mark: '#695680', markings: [[.367, .25, .097, .129, -.44], [-.06, .48, .087, .083, .19]],
      fringe: [[-.176, .573, .135, .13, -.54], [.03, .585, .101, .095, -.60]] } },
];

export const HERO_SPOTLIGHT_ORDER = [4, 9, 0, 5, 1, 6, 2, 7, 3, 8] as const;
