import * as T from 'three';
import { ArticulatedInstances, box, plane, textTexture, material } from './art';
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
    coat: coats[style >>> 9 & 7], face: style >>> 12, species: (index * 5 + (index >>> 3)) % 8 };
}

const round = new T.SphereGeometry(1, 9, 7);
const species = ['rabbit', 'red panda', 'frog', 'fox', 'owl', 'bear', 'duck', 'cat'] as const;
const fur = ['#fff0dc', '#c66a43', '#8cc56b', '#eb8a50', '#a67b9f', '#bb885e', '#ffd767', '#9297bd'];
const ink = '#403247';

function fanPortrait(index: number) {
  const who = species[index], coat = fur[index];
  const map = textTexture(192, 192, c => {
    c.lineJoin = c.lineCap = 'round';
    const ellipse = (x: number, y: number, w: number, h: number, color: string, outline = false, rotation = 0) => {
      c.beginPath(); c.ellipse(x, y, w, h, rotation, 0, Math.PI * 2);
      c.fillStyle = color; c.fill();
      if (outline) { c.lineWidth = 4.5; c.strokeStyle = ink; c.stroke(); }
    };
    const path = (d: string, color: string, outline = false) => {
      const p = new Path2D(d); c.fillStyle = color; c.fill(p);
      if (outline) { c.lineWidth = 4.5; c.strokeStyle = ink; c.stroke(p); }
    };
    const line = (d: string, color: string, w: number) => {
      c.lineWidth = w; c.strokeStyle = color; c.stroke(new Path2D(d));
    };
    // Ears, eye stalks, cheek tufts and beaks remain legible in the wide broadcast shot.
    for (const sign of [-1, 1]) {
      c.save(); c.translate(96, 0); c.scale(sign, 1);
      if (who === 'rabbit') {
        ellipse(25, 51, 16, 45, coat, true, .20); ellipse(25, 49, 8, 32, '#f3afab', false, .20);
      } else if (who === 'bear' || who === 'red panda') {
        ellipse(46, 70, 21, 21, who === 'red panda' ? '#ffe3be' : coat, true);
        ellipse(46, 71, 12.5, 12.5, who === 'red panda' ? '#663e3d' : '#eab7a1');
      } else if (who === 'fox' || who === 'cat' || who === 'owl') {
        path('M 20 75 Q 34 50 55 36 Q 63 61 56 91 Z', coat, true);
        path('M 35 69 L 52 47 L 51 72 Z', who === 'owl' ? '#e9bdcf' : '#e6a096');
      } else if (who === 'frog') ellipse(30, 73, 24, 25, coat, true);
      c.restore();
    }
    if (who === 'duck') path('M 72 81 Q 60 55 79 57 L 85 64 Q 82 44 94 47 Q 106 51 108 68 Q 116 53 126 59 L 117 82 Z', coat, true);
    const outline = who === 'fox' || who === 'red panda' || who === 'cat' ?
      'M 34 111 Q 38 66 93 65 Q 148 61 158 109 L 170 121 L 157 123 L 165 131 Q 150 145 135 151 Q 99 177 66 155 Q 47 151 26 133 L 36 127 L 23 123 Z' :
      who === 'frog' ? 'M 28 114 Q 39 81 63 75 Q 97 82 127 75 Q 154 82 165 114 Q 177 153 99 165 Q 18 160 28 114 Z' :
      'M 33 116 Q 33 66 92 64 Q 156 60 160 112 Q 167 159 101 169 Q 36 165 33 116 Z';
    path(outline, coat, true);
    if (who === 'red panda' || who === 'fox') {
      path('M 30 119 Q 54 124 74 138 Q 95 143 118 136 Q 142 120 161 119 Q 147 151 99 164 Q 50 155 30 119 Z', '#fff0da');
    } else if (who !== 'frog' && who !== 'duck') ellipse(96, 141, 30, 17, '#ffe3c4');
    for (const side of [-1, 1]) {
      const x = 96 + side * (who === 'frog' ? 30 : 25), y = who === 'frog' ? 84 : 106;
      if (who === 'owl') ellipse(x, 107, 24, 28, '#f8ddbf');
      if (who === 'red panda') { ellipse(x, 108, 19, 15, '#70443d', false, side * -.30); ellipse(x, 86, 13, 5, '#ffeacc', false, side * .24); }
      if (who === 'rabbit' || who === 'bear' || (who === 'fox' && side < 0)) {
        line(`M ${x-10} ${y+3} Q ${x} ${y-10} ${x+10} ${y+2}`, ink, 5.8);
      } else {
        ellipse(x, y, who === 'owl' ? 15 : 12, who === 'frog' ? 12 : 14, '#fff4d9');
        ellipse(x + side*.8, y + 1, 9.2, 11.3, ink);
        ellipse(x - 2.8, y - 3.4, 3.1, 3.1, '#ffffff');
        if (who === 'cat' || who === 'duck') line(`M ${x-7} ${y-17} q 7 -5 14 0`, '#705661', 3);
      }
      ellipse(96 + side * 42, 130, 9, 4.8, who === 'frog' ? '#e5a583' : '#e9a399');
    }
    if (who === 'duck') {
      path('M 65 133 Q 92 116 125 130 Q 133 136 121 142 Q 91 163 71 145 Q 56 139 65 133 Z', '#f39848', true);
      line('M 69 136 Q 94 145 122 133', '#935339', 3.5);
    } else if (who === 'frog') {
      path('M 56 130 Q 94 146 137 128 Q 125 155 99 156 Q 70 156 56 130 Z', '#68474e', true);
      ellipse(99, 150, 13, 3.7, '#ed9693');
      ellipse(90, 117, 2.5, 2, ink); ellipse(102, 117, 2.5, 2, ink);
    } else {
      path('M 74 139 Q 94 145 116 138 Q 112 158 97 159 Q 82 158 74 139 Z', '#633749', true);
      ellipse(97, 153, 7, 2.7, '#ee9693');
      if (who === 'rabbit') path('M 92 144 L 102 144 L 100 151 L 94 151 Z', '#fffbee');
      if (who === 'owl') path('M 89 126 Q 96 122 104 126 L 96 137 Z', '#edb44f', true);
      else path('M 88 131 Q 96 126 104 131 Q 100 139 96 139 Q 91 137 88 131 Z', who === 'rabbit' ? '#cc8085' : ink);
      if (who === 'cat') line('M 64 135 L 39 131 M 64 140 L 41 144 M 129 135 L 153 130 M 129 140 L 151 144', '#635975', 2.7);
    }
  });
  return new T.MeshBasicMaterial({ map, alphaTest: .39, side: T.DoubleSide });
}

const flagShape = new T.Shape();
flagShape.moveTo(0, 0); flagShape.lineTo(.38, -.09); flagShape.lineTo(0, -.22); flagShape.closePath();
const pennant = new T.ShapeGeometry(flagShape);
type Fan = FanSeat & { root: T.Object3D; head: T.Object3D; arms: T.Object3D[]; prop?: T.Object3D; gesture: number };

export class ArenaCrowd {
  private readonly batch = new ArticulatedInstances();
  private readonly cast: Fan[];

  constructor(scene: T.Scene, seats: readonly FanSeat[]) {
    const paint = material('#ffffff');
    const faces = species.map((_, i) => fanPortrait(i));
    this.cast = seats.map((seat, index) => {
      const { x, y, z, team, height } = seat;
      const look = fanAppearance(index, team), coat = fur[look.species];
      const root = new T.Object3D();
      root.position.set(x,y,z); root.rotation.y = Math.atan2(-x, -z);
      const width = .22 + look.face * .014, kit = fanColors[team];
      const part = (node: T.Object3D, geo: T.BufferGeometry, px: number, py: number, pz: number, sx: number, sy: number, sz: number, col: string) =>
        this.batch.part(node, geo, paint, px,py,pz, sx,sy,sz,col);
      for (const side of [-1,1]) {
        part(root, round, side*.12, -.19, .09, .10,.16,.115, '#4d526c');
        part(root, round, side*.12, -.275, .18, .115,.075,.15, look.accent);
      }
      part(root, round, 0,.10,0, width,height,.19,look.shirt);
      part(root, round, 0,.13,.035, width*1.01,.066,.178, kit.accent);
      part(root, round, 0,height+.025,0, width*.88,.075,.196,look.accent);
      const head = new T.Object3D(); root.add(head);
      head.position.set(0,height+.255,0);
      head.rotation.y = -root.rotation.y * .47;
      const size = .88 + look.face * .022;
      this.batch.part(head, plane, faces[look.species], 0,0,.08, size,size,1);
      const sash = part(root, box, -.105, height-.078, .197, .079,.22,.036,look.accent);
      sash.rotation.z = -.13;
      const arms = [-1,1].map(side => {
        const pivot = new T.Object3D(); root.add(pivot);
        pivot.position.set(side*width*.88, height*.77,.105);
        part(pivot, round, 0,.093,.02, .081,.15,.077,look.shirt);
        part(pivot, round, 0,.255,.034, .090,.099,.087,coat);
        return pivot;
      });
      const gesture = (index * 3 + (index >>> 2) + (look.hat >>> 1)) % 4;
      let prop: T.Object3D | undefined;
      if (gesture === 1) {
        const hand = arms[1];
        part(hand, box, .01,.43,.035, .027,.50,.027,'#684954');
        part(hand, pennant, .025,.66,.035, 1,1,1,kit.accent);
        part(hand, pennant, .025,.615,.045, .56,.55,1,look.shirt);
      } else if (gesture === 2) {
        prop = new T.Object3D(); root.add(prop);
        part(prop, box, 0,0,.16, .88,.135,.048,kit.accent);
        for (const x of [-.34,-.25,.25,.34]) part(prop, box,x,0,.166,.047,.137,.052,look.shirt);
        for (const side of [-1,1]) part(prop, box, side*.421,-.057,.16,.056,.18,.051,kit.accent);
      }
      root.updateMatrixWorld(true);
      return { ...seat, root, head, arms, prop, gesture };
    });
    this.batch.build(scene);
    this.batch.update();
  }

  update(time: number, tick: number, cue?: ArenaCue) {
    for (const fan of this.cast) {
      const { root, head, arms, prop, gesture, height, team, phase, x, y } = fan;
      const response = fanReaction(cue, tick, team, x), cheer = Math.max(0,response);
      const beat = Math.sin(time * (5.5 + phase*.26) + phase);
      root.position.y = y + .022*Math.sin(time*2+phase) + cheer*(.10+.11*Math.max(0,beat)) + Math.min(0,response)*.13;
      head.position.y = height+.255 + cheer*.045;
      head.rotation.z = .045*Math.sin(time*2.5+phase) + response*.065;
      for (let i=0; i<2; i++) {
        const side = i ? 1 : -1;
        const waving = gesture === 1 && i === 1 || gesture === 3 && (i === 0 || cheer > .22);
        let tilt = 2.68 + .10*beat;
        if (gesture === 0) tilt = -.68 - (.23 + .32*cheer)*beat;
        if (waving) tilt = .74 + .32*beat - .20*cheer;
        if (prop) tilt = .87 - .41*cheer;
        arms[i].rotation.z = -side * tilt;
        arms[i].rotation.x = gesture === 0 ? .98 + cheer*.14 : .15;
        if (gesture === 0) arms[i].rotation.y = side * -.28;
      }
      if (prop) { prop.position.y = height*.77 + Math.cos(.87 - .41*cheer)*.26; prop.position.z = .045; }
      root.updateMatrixWorld(true);
    }
    this.batch.update();
  }
}
