import { RingGeometry } from 'three';
import type { Object3D } from 'three';
import { box, cone, material, sphere } from './art';
import type { ArticulatedInstances } from './art';
import { HEROES } from './heroes';

const accents = HEROES.map(hero => material(hero.accent));
const seam = material('#fff1c5');
const edge = material('#393148');
const goggles = new RingGeometry(0.72, 1, 18);

export function addHeroGear(batch: ArticulatedInstances, head: Object3D, id: number) {
  const mat = accents[id];
  switch (HEROES[id].gear) {
    case 'helmet':
      batch.part(head, sphere, mat, 0, .56, -.09, .53, .31, .46);
      batch.part(head, sphere, seam, 0, .848, -.10, .086, .037, .205);
      for (const side of [-1, 1]) {
        batch.part(head, sphere, edge, side * .447, .35, -.03, .14, .27, .239);
        batch.part(head, sphere, mat, side * .493, .35, -.023, .119, .224, .221);
      }
      break;
    case 'goggles': {
      const [spacing, width, height] = HEROES[id].face.eyes;
      for (const side of [-1, 1]) {
        batch.part(head, goggles, mat, side * .188 * spacing, .248, .491, .159 * width, .185 * height, 1).rotation.y = side * .22;
        batch.part(head, sphere, mat, side * .364, .247, .284, .061, .039, .181);
      }
      batch.part(head, box, mat, 0, .278, .465, .11, .038, .047);
      break;
    }
    case 'flower':
      for (let petal = 0; petal < 5; petal++) {
        const angle = petal * 2 * Math.PI / 5;
        batch.part(head, sphere, mat, -.404 + Math.cos(angle) * .136, .655 + Math.sin(angle) * .136, .151, .106, .076, .076).rotation.z = angle;
      }
      batch.part(head, sphere, seam, -.404, .655, .214, .083, .083, .061);
      break;
    case 'beret':
      batch.part(head, sphere, edge, .063, .605, -.022, .428, .099, .374).rotation.z = -.21;
      batch.part(head, sphere, mat, .12, .67, -.030, .488, .161, .426).rotation.z = -.24;
      batch.part(head, sphere, seam, .18, .807, .016, .073, .062, .073);
      break;
    case 'patch':
      batch.part(head, box, mat, .338, .045, .505, .255, .148, .057).rotation.set(.06, .53, -.32);
      for (const offset of [-.056, 0, .056]) {
        batch.part(head, box, seam, .339 + offset, .046 - offset * .32, .541 - offset * .56, .023, .086, .016).rotation.set(.06, .53, -.32);
      }
      break;
    case 'earpads':
      for (const side of [-1, 1]) {
        batch.part(head, sphere, edge, side * .439, .395, -.009, .179, .244, .203);
        batch.part(head, sphere, mat, side * .540, .395, .021, .127, .189, .169);
      }
      break;
    case 'quiff':
      for (let tuft = 0; tuft < 3; tuft++) batch.part(head, cone, mat, -0.06 + tuft * 0.11, 0.72 - tuft * 0.06, 0.24 - tuft * 0.09, 0.142, 0.48 - tuft * 0.065, 0.169).rotation.set(-0.30, 0.12, -0.50);
      break;
    case 'bow':
      batch.part(head, sphere, mat, 0.27, 0.71, 0.16, 0.17, 0.079, 0.061).rotation.z = -0.33;
      batch.part(head, sphere, mat, 0.50, 0.76, 0.13, 0.16, 0.087, 0.071).rotation.z = 0.62;
      batch.part(head, sphere, seam, 0.39, 0.73, 0.196, 0.078, 0.072, 0.065);
      break;
  }
}
