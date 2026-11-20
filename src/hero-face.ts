import * as T from 'three';
import { box, cone, flat, material, sphere } from './art';
import type { ArticulatedInstances } from './art';
import { HEROES } from './heroes';

const tint = material('#ffffff');
const white = material('#fff8e5', .48);
const ink = material('#272138', .55);
const glint = flat('#ffffff');
const innerEar = [material('#b46a59'), material('#f3a2b6')];
const nose = [material('#51302d', .49), material('#42304f', .48)];

const boxy = sphere.clone();
const tapered = sphere.clone();
const roundness = .67;
const squared = (value: number) => Math.sign(value) * Math.abs(value) ** roundness;
const taper = (height: number) => .93 + height * .18;
for (let i = 0; i < sphere.attributes.position.count; i++) {
  const position = sphere.attributes.position;
  const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
  boxy.attributes.position.setXYZ(i, squared(x), squared(y), squared(z));
  tapered.attributes.position.setXYZ(i, x * taper(y), y, z);
}
boxy.computeVertexNormals();
tapered.computeVertexNormals();
const outlines = { round: sphere, boxy, tapered };

function group(parent: T.Object3D, x: number, y: number, z: number) {
  const item = new T.Group();
  item.position.set(x, y, z);
  parent.add(item);
  return item;
}

export function addHeroFace(batch: ArticulatedInstances, head: T.Group, id: number, lynx: boolean) {
  const hero = HEROES[id];
  const face = hero.face;
  const species = Number(lynx);
  const ell = (parent: T.Object3D, mat: T.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, color?: string) =>
    batch.part(parent, sphere, mat, x, y, z, sx, sy, sz, color);
  const tuft = (parent: T.Object3D, mat: T.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, tilt: number, color?: string) => {
    const part = batch.part(parent, cone, mat, x, y, z, sx, sy, sz, color);
    part.rotation.z = tilt;
    return part;
  };
  const rx = lynx ? .47 : .49;
  const ry = lynx ? .46 : .44;
  const center = .19;
  batch.part(head, outlines[face.shape], tint, 0, center, 0, rx, ry, .42, hero.fur);
  const front = (x: number, y: number) => {
    const height = (y - center) / ry;
    const width = rx * (face.shape === 'tapered' ? taper(height) : 1);
    const power = face.shape === 'boxy' ? 2 / roundness : 2;
    return .42 * Math.max(0, 1 - Math.abs(x / width) ** power - Math.abs(height) ** power) ** (1 / power);
  };
  for (const [x, y, width, height, tilt] of face.markings) {
    const mark = ell(head, tint, x, y, front(x, y) + .009, width, height, .041, face.mark);
    mark.rotation.set(-(y - center) * 1.3, x * 1.75, tilt);
  }
  for (const [x, y, width, height, tilt] of face.fringe) {
    if (lynx) tuft(head, tint, x, y, .24, width, height * 2.65, .138, tilt, face.mark);
    else ell(head, tint, x, y, .21, width, height, .14, face.mark).rotation.z = tilt;
  }

  const eyes: T.Group[] = [];
  const brows: T.Object3D[] = [];
  const [gap, eyeWidth, eyeHeight, eyeTilt, eyeOffset] = face.eyes;
  const [earWidth, leftHeight, rightHeight, splay] = face.ears;
  const mouthRoot = group(head, 0, lynx ? .009 : -.023, .35);
  mouthRoot.scale.set(face.muzzle[0], face.muzzle[1], 1);
  ell(mouthRoot, tint, 0, .033, -.002, lynx ? .327 : .351, .214, .235, face.muzzleColor);
  const [smileWidth, openness] = face.smile;
  const smile = group(mouthRoot, 0, -.087 * (1 - openness), 0);
  smile.scale.set(smileWidth, openness, 1);
  const mouth = ell(smile, ink, -.013, -.087, .232, .148, .071, .042);
  const tongue = ell(smile, innerEar[1], -.013, -.111, .263, .070, .029, .021);

  for (const side of [-1, 1]) {
    ell(mouthRoot, tint, side * .153, .012, .128, .174, .118, .117, face.muzzleColor).rotation.z = side * -.22;
    if (!lynx) for (let dot = 0; dot < (id === 2 ? 3 : id === 0 ? 1 : 2); dot++) {
      ell(mouthRoot, nose[species], side * (.169 + dot * .045), .051 - (dot % 2) * .042, .239 - dot * .021, .015, .014, .011);
    }
    if (face.teeth === 'pair') batch.part(smile, box, white, side * .040, -.077, .267, .066, .080, .036);
    const x = side * .188 * gap;
    const y = .248 + side * eyeOffset * .41;
    const eyeSocket = group(head, x, y, front(x, y) - .030);
    eyeSocket.rotation.set(0, side * .21, side * eyeTilt);
    eyeSocket.scale.set(eyeWidth * (1 + side * eyeOffset * .53), eyeHeight * (1 + side * eyeOffset * .71), 1);
    const lid = group(eyeSocket, 0, 0, 0);
    ell(lid, ink, 0, 0, 0, .140, .169, .075);
    ell(lid, white, 0, 0, .027, .124, .149, .068);
    ell(lid, tint, -side * .018, -.008, .083, .070, .092, .033, face.iris);
    ell(lid, ink, -side * .018, -.008, .110, .044, .060, .016);
    ell(lid, glint, -side * .018 - .019, .025, .125, .022, .025, .009);
    eyes.push(lid);
    const browHeight = y + .175 * eyeHeight;
    const brow = group(head, x, browHeight, front(x, browHeight) + .020);
    brow.rotation.set(-.17, side * .21, side * eyeTilt);
    brows.push(ell(brow, nose[species], 0, 0, 0, .109, .034, .039));

    const height = side < 0 ? leftHeight : rightHeight;
    const earX = side * (.348 + Math.max(0, 1 - height) * .10);
    const earY = .483 + height * .061;
    const tilt = -side * (splay + Math.max(0, 1 - height) * .38);
    if (lynx) {
      tuft(head, tint, earX, earY, .01, .210 * earWidth, .58 * height, .169, tilt, hero.fur);
      tuft(head, innerEar[species], earX + side * .006, earY + .005, .103, .120 * earWidth, .32 * height, .076, tilt);
      if (height > .99) {
        const tipX = earX - Math.sin(tilt) * .29 * height;
        const tipY = earY + Math.cos(tilt) * .29 * height;
        tuft(head, ink, tipX, tipY, .020, .050 * earWidth, .212 * height, .064, tilt - side * .14);
      }
      tuft(head, tint, side * .393, .092, .151, .141, .42 * face.ruff, .146, side * -1.87, face.mark);
      tuft(head, tint, side * .385, .001, .109, .147, .49 * face.ruff, .155, side * -2.21, hero.fur);
      tuft(head, tint, side * .337, -.071, .088, .133, .34 * face.ruff, .130, side * -2.61, hero.fur);
    } else {
      ell(head, tint, earX, earY, -.024, .145 * earWidth, .177 * height, .111, hero.fur).rotation.z = tilt;
      ell(head, innerEar[species], earX + side * .012, earY + .012, .061, .083 * earWidth, .118 * height, .039).rotation.z = tilt;
    }
  }
  if (face.teeth === 'single') batch.part(smile, box, white, -.022, -.078, .269, .086, .080, .036).rotation.z = .13;
  if (face.teeth === 'fang') tuft(smile, white, -.102, -.092, .254, .056, .154, .050, Math.PI + .19);
  if (lynx) tuft(mouthRoot, nose[species], 0, .155, .214, .120, .145, .092, Math.PI);
  else batch.part(mouthRoot, boxy, nose[species], 0, .171, .207, .169, .074, .086);

  return { eyes, brows, mouth, tongue };
}
