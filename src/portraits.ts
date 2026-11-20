import { ROSTER } from './football';
import { HEROES } from './heroes';

export function drawPortrait(canvas: HTMLCanvasElement, player: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const hero = HEROES[player];
  const { face, accent } = hero;
  const lynx = player >= ROSTER.length;
  const keeper = player % ROSTER.length === 0;
  const kit = keeper ? (lynx ? '#b9e33f' : '#fe6375') : lynx ? '#2ab5b0' : '#ffbf56';
  const cream = '#fff2de';
  const ink = '#29213a';
  const earColor = lynx ? '#f3a2b6' : '#b46a59';
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = lynx ? '#274953' : '#633c48';
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createLinearGradient(0, 0, width, height);
  glow.addColorStop(0, `${accent}78`);
  glow.addColorStop(1, `${accent}08`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  const scale = Math.min(width / 100, height / 74);
  ctx.translate((width - 100 * scale) / 2, (height - 74 * scale) / 2);
  ctx.scale(scale, scale);

  const oval = (x: number, y: number, rx: number, ry: number, color: string, angle = 0) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2); ctx.fill();
  };
  const polygon = (color: string, ...points: [number, number][]) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath(); ctx.fill();
  };

  oval(50, 40, 36, 33, '#fff8db29');
  oval(50, 77, (lynx ? 29 : 25) * hero.body, 19 * hero.torso[0], kit);
  oval(50, 64, 12, 5, ink);
  for (const side of [-1, 1]) oval(50 + side * 21 * hero.body, 73, 7, 2.5, accent, side * .22);

  const [headWidth, headHeight] = face.head;
  const [earWidth, leftEar, rightEar, splay] = face.ears;
  const xAt = (x: number) => 50 + x * 49 * headWidth;
  const yAt = (y: number) => 52 - y * 48 * headHeight;
  for (const side of [-1, 1]) {
    const ear = side < 0 ? leftEar : rightEar;
    const x = xAt(side * (.348 + Math.max(0, 1 - ear) * .10));
    const y = yAt(.483 + ear * .061);
    const tilt = splay + Math.max(0, 1 - ear) * .38;
    if (lynx) {
      const w = 9.7 * earWidth;
      const length = 15.7 * ear * headHeight;
      const tipX = x + side * Math.sin(tilt) * length;
      const tipY = y - Math.cos(tilt) * length;
      polygon(hero.fur, [x - w, y + 9], [tipX, tipY], [x + w, y + 9]);
      polygon(earColor, [x - w * .56, y + 4], [tipX * .73 + x * .27, tipY + 4], [x + w * .56, y + 4]);
      if (ear > .99) polygon(ink, [tipX - 2.2, tipY + 4], [tipX + side * 3, tipY - 4.5], [tipX + 2.4, tipY + 2.3]);
      const outer = 50 + side * (21 + face.ruff * 8) * headWidth;
      polygon(hero.fur, [50 + side * 18, 34], [outer, 43], [outer - side * 5, 48], [outer - side * 3, 52], [50 + side * 16, 57]);
      polygon(face.mark, [50 + side * 19, 40], [outer, 43], [outer - side * 5, 46], [50 + side * 18, 46]);
    } else {
      oval(x, y, earWidth * 7.4, ear * 8.7, hero.fur, side * tilt);
      oval(x + side * .8, y - .4, earWidth * 4.5, ear * 5.0, earColor, side * tilt);
    }
  }
  if (hero.gear === 'earpads') for (const x of [23, 77]) {
    oval(x, 33, 9, 12, ink);
    oval(x, 33, 7.5, 9.5, accent);
    oval(x, 30, 4.3, 3.1, '#ffe2a9');
  }
  const headY = yAt(.19);
  const w = (lynx ? 24 : 25) * headWidth;
  const h = (lynx ? 22 : 21) * headHeight;
  ctx.fillStyle = hero.fur;
  ctx.beginPath();
  if (face.shape === 'boxy') ctx.roundRect(50 - w, headY - h, w * 2, h * 2, 13);
  else if (face.shape === 'tapered') {
    ctx.moveTo(50, headY - h);
    ctx.bezierCurveTo(50 + w * 1.34, headY - h, 50 + w * 1.22, headY + h * .80, 50, headY + h);
    ctx.bezierCurveTo(50 - w * 1.22, headY + h * .80, 50 - w * 1.34, headY - h, 50, headY - h);
  } else ctx.ellipse(50, headY, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [x, y, rx, ry, tilt] of face.markings) oval(xAt(x), yAt(y), rx * 49 * headWidth, ry * 48 * headHeight, face.mark, -tilt);
  for (const [x, y, rx, ry, tilt] of face.fringe) {
    if (lynx) polygon(face.mark, [xAt(x - rx), yAt(y - ry * .62)], [xAt(x - tilt * .2), yAt(y + ry * 1.12)], [xAt(x + rx), yAt(y - ry * .62)]);
    else oval(xAt(x), yAt(y), rx * 49 * headWidth, ry * 48 * headHeight, face.mark, -tilt);
  }

  if (hero.gear === 'helmet') {
    oval(50, 22, 26, 13, accent);
    oval(50, 12, 4.3, 4.4, cream);
    for (const x of [26, 74]) { oval(x, 34, 6.6, 10, ink); oval(x, 34, 5, 8.4, accent); }
  }
  if (hero.gear === 'headband') polygon(accent, [21, 30], [78, 22], [79, 28], [21, 37], [15, 42], [17, 34]);
  if (hero.gear === 'beret') {
    oval(53, 24, 24, 6.5, ink, .13);
    oval(56, 19, 25, 8.6, accent, .22);
    oval(58, 12, 3.8, 3.4, cream);
  }
  if (hero.gear === 'quiff') polygon(accent, [35, 28], [38, 15], [53, 5], [50, 17], [67, 12], [56, 27]);

  const [gap, eyeWidth, eyeHeight, eyeTilt, eyeOffset] = face.eyes;
  for (const side of [-1, 1]) {
    const x = xAt(side * .188 * gap);
    const y = yAt(.248 + side * eyeOffset * .41);
    const rx = 6.45 * headWidth * eyeWidth * (1 + side * eyeOffset * .53);
    const ry = 7.95 * headHeight * eyeHeight * (1 + side * eyeOffset * .71);
    const tilt = -side * eyeTilt;
    oval(x, y - ry - 2, rx * .82, 1.55, ink, tilt);
    oval(x, y, rx + 1, ry + 1, ink, tilt);
    oval(x, y, rx, ry, cream, tilt);
    oval(x - side * .72, y + .5, rx * .58, ry * .66, face.iris, tilt);
    oval(x - side * .72, y + .5, rx * .32, ry * .46, ink, tilt);
    oval(x - .9 - side * .72, y - 1.3, rx * .155, ry * .18, '#ffffff');
    if (hero.gear === 'goggles') {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(x, y, rx + 1.9, ry + 1.9, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = accent; ctx.fillRect(48, y - 1, 4, 2.8);
    }
  }
  const [muzzleWidth, muzzleHeight] = face.muzzle;
  const muzzleY = yAt(lynx ? .028 : -.011);
  oval(50, muzzleY, 16.5 * muzzleWidth * headWidth, 9.5 * muzzleHeight * headHeight, face.muzzleColor);
  for (const side of [-1, 1]) oval(50 + side * 6.8 * muzzleWidth, muzzleY + .6, 8.2 * muzzleWidth, 5.8 * muzzleHeight, face.muzzleColor, side * .18);
  ctx.save();
  ctx.translate(50, muzzleY + 3);
  ctx.scale(...face.smile);
  ctx.translate(-50, -muzzleY - 3);
  oval(50, muzzleY + 3, 6.7 * muzzleWidth, 3.8 * muzzleHeight, ink);
  oval(50, muzzleY + 4.3, 3.7 * muzzleWidth, 1.45, '#ef8eab');
  if (face.teeth === 'pair' || face.teeth === 'single') {
    ctx.fillStyle = cream;
    if (face.teeth === 'pair') for (const x of [47, 50.5]) ctx.fillRect(x, muzzleY - .5, 2.65, 3.26);
    else ctx.fillRect(48, muzzleY - .25, 3.7, 3.2);
  }
  if (face.teeth === 'fang') polygon(cream, [44.9, muzzleY + 1.5], [48.7, muzzleY + 1.8], [46.0, muzzleY + 6.5]);
  ctx.restore();
  if (lynx) polygon('#47344e', [44.2, muzzleY - 7.2], [55.8, muzzleY - 7.2], [50, muzzleY - 2.0]);
  else {
    oval(50, muzzleY - 6.2, 7.7 * muzzleWidth, 3.9, '#57332d');
    const dots = player === 2 ? 3 : player === 0 ? 1 : 2;
    for (const side of [-1, 1]) for (let dot = 0; dot < dots; dot++) {
      oval(50 + side * (8.4 + dot * 2.4) * muzzleWidth, muzzleY + (dot % 2 ? .9 : -1.15), .72, .71, '#835142');
    }
  }
  if (hero.gear === 'scarf') {
    oval(50, 64, 18, 5.1, accent, -.12);
    oval(64, 62, 5.2, 4.2, accent);
    polygon(accent, [63, 61], [70, 63], [69, 73], [62, 73], [61, 65]);
  }
  if (hero.gear === 'flower') {
    for (let petal = 0; petal < 5; petal++) {
      const angle = petal * 2 * Math.PI / 5;
      oval(27.5 + Math.cos(angle) * 6.5, 20 + Math.sin(angle) * 6.5, 5.2, 3.8, accent, angle);
    }
    oval(27.5, 20, 4.4, 4.3, cream);
  }
  if (hero.gear === 'patch') {
    polygon(accent, [60, 49], [73, 43], [77, 51], [63, 57]);
    for (const x of [64, 68, 72]) oval(x, 50.2 - (x - 68) * .43, .85, 2.45, cream, -.34);
  }
  if (hero.gear === 'bow') {
    oval(64, 21, 7.8, 4.6, accent, .45);
    oval(76, 18, 8.4, 4.5, accent, -.79);
    oval(70, 21, 3.5, 3.7, cream);
  }
  ctx.restore();
}
