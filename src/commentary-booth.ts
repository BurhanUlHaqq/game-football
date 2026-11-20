import type { BoothHost } from './commentary';

type Brush = CanvasRenderingContext2D;
const ink = '#21223b';

function oval(c: Brush, x: number, y: number, rx: number, ry: number, color: string, border = false, tilt = 0) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, tilt, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
  if (border) { c.strokeStyle = ink; c.lineWidth = 3.5; c.stroke(); }
}

function stroke(c: Brush, path: string, color: string, width: number) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.stroke(new Path2D(path));
}

function shape(c: Brush, path: string, color: string) {
  const p = new Path2D(path);
  c.fillStyle = color;
  c.fill(p);
  c.strokeStyle = ink;
  c.lineWidth = 3.5;
  c.stroke(p);
}

function face(c: Brush, x: number, y: number, gaze: number, blink: boolean, mouth: number) {
  for (const eye of [-10, 10]) {
    if (blink) { stroke(c, `M ${x + eye - 5} ${y} q 5 4 10 -1`, ink, 3.5); continue; }
    oval(c, x + eye, y, 7.4, 9.2, '#fff7d8', true);
    oval(c, x + eye + gaze, y + 1, 3.1, 5, ink);
    oval(c, x + eye + gaze + 1, y - 1, 1.1, 1.3, 'white');
  }
  const open = 2.5 + mouth * 11;
  shape(c, `M ${x-10} ${y+15} q 10 4 20 -1 q -8 ${open*2} -20 1 Z`, '#41213b');
  if (mouth > .35) oval(c, x + 1, y + 17 + open * .32, 5.3, open * .22, '#fb91a0');
}

function mick(c: Brush, active: boolean, t: number, mouth: number) {
  c.save();
  c.translate(77, 95);
  c.scale(active ? 1.27 : 1.12, active ? 1.27 : 1.12);
  const bounce = active ? -mouth * 4 : Math.sin(t * 2.3) * 1.2;
  // A clockwork spring carries the orange squeeze bulb and its brass horn.
  stroke(c, 'M 0 42 C -25 38 18 35 6 32 C -17 29 -13 27 8 25 C 24 23 8 20 -5 19', '#47314b', 9);
  stroke(c, 'M 0 41 C -25 37 18 34 6 31 C -17 28 -13 26 8 24 C 24 22 8 19 -5 18', '#ffcd83', 3.5);
  c.translate(0, bounce);
  c.rotate((active ? -.035 : .055) + Math.sin(t * 2.8) * .018);
  shape(c, 'M -28 -21 Q -39 -18 -45 -31 L -49 -14 Q -40 -7 -29 -8 Z', '#ffd367');
  oval(c, -46, -23, 6, 13, '#ffb741', true, -.34);
  oval(c, -47, -23, 2, 8, '#a95243', false, -.34);
  shape(c, 'M -30 -16 Q -36 -42 -10 -45 Q 17 -51 29 -28 Q 45 1 18 20 Q -4 32 -23 14 Q -35 4 -30 -16 Z', '#fa8551');
  oval(c, -16, -32, 9, 3.8, '#ffba79', false, -.3);
  stroke(c, 'M -30 -12 Q -40 -39 -17 -48 Q 17 -64 32 -27', ink, 7);
  stroke(c, 'M -29 -15 Q -39 -38 -16 -46 Q 15 -60 31 -27', '#ffcd7a', 2.6);
  oval(c, -29, -11, 7.4, 12, '#773f56', true, -.14);
  oval(c, -29, -11, 2.2, 7, '#ffc65b');
  oval(c, 24, 1, 5, 3.2, '#d46051');
  face(c, 3, -13, active ? 0 : 2, t % 4.3 > 4.15, mouth);
  c.restore();
}

function emma(c: Brush, active: boolean, t: number, mouth: number) {
  c.save();
  c.translate(221, 89 + (active ? -mouth * 2.5 : Math.sin(t * 2 + 1) * 1.1));
  c.scale(active ? 1.25 : 1.12, active ? 1.25 : 1.12);
  c.rotate((active ? .01 : -.055) + Math.sin(t * 2.5) * .015);
  // The two bells and winding key move with the turquoise clock case.
  const tip = active ? mouth * 3 : 0;
  stroke(c, 'M 29 4 L 44 0', '#f3be62', 6);
  oval(c, 45, -5 - tip, 5, 6, '#f6cd76', true, -.6);
  oval(c, 47, 4 + tip, 5, 6, '#f6cd76', true, .5);
  stroke(c, 'M -17 -30 L -22 -42 M 16 -31 L 22 -43', ink, 5);
  oval(c, -19, -39 - tip, 15, 8, '#fcce62', true, -.48);
  oval(c, 20, -40 + tip, 15, 8, '#fcce62', true, .48);
  stroke(c, 'M -1 -33 L 0 -48', ink, 3);
  oval(c, 0, -49, 4, 4, '#ffe198', true);
  shape(c, 'M -27 -19 Q -21 -35 -2 -35 Q 26 -37 31 -14 L 28 12 Q 23 32 2 34 Q -22 31 -29 15 Z', '#46c8b9');
  oval(c, -1, -1, 23.7, 25, '#adf0c8', true);
  oval(c, -21, 5, 4, 2.7, '#6ac9b4');
  face(c, 0, -10, active ? 0 : -2, (t + .9) % 5.1 > 4.96, mouth);
  stroke(c, 'M -23 -13 Q -29 -32 -13 -38', ink, 4);
  oval(c, -26, -8, 6, 9, '#4a6381', true);
  stroke(c, 'M -26 0 Q -26 13 -12 14', ink, 2.5);
  oval(c, -11, 14, 3.5, 2.6, ink);
  c.restore();
}

function microphone(c: Brush, x: number, mirror: boolean) {
  c.save(); c.translate(x, 0); c.scale(mirror ? -1 : 1, 1);
  stroke(c, 'M 0 133 L 1 121 L 9 111', ink, 5);
  c.translate(10, 107); c.rotate(.44);
  oval(c, 0, 0, 5.6, 9, '#9ab0b5', true);
  for (const y of [-3, 0, 3]) stroke(c, `M -3 ${y} L 3 ${y}`, '#46536b', 1.5);
  c.restore();
}

export class CommentaryBooth {
  private readonly context: Brush | null;
  private lastFrame = -1;
  private lastHost?: BoothHost;

  constructor(canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d');
  }

  draw(host: BoothHost, tick: number, mouth: number, introduction: boolean) {
    const c = this.context;
    const frame = Math.floor(tick / 3);
    if (!c || (frame === this.lastFrame && host === this.lastHost)) return;
    this.lastHost = host; this.lastFrame = frame;
    const t = tick / 60;
    c.setTransform(c.canvas.width / 300, 0, 0, c.canvas.height / 156, 0, 0);
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.fillStyle = '#354664'; c.fillRect(0, 0, 300, 156);
    // A glazed window above the sound desk looks over the stadium floodlights.
    c.fillStyle = '#819bb6'; c.fillRect(21, 8, 258, 66);
    c.fillStyle = '#466c83'; c.fillRect(21, 47, 258, 27);
    shape(c, 'M 22 57 Q 73 38 124 55 Q 202 35 278 52 L 278 72 L 22 72 Z', '#42756f');
    stroke(c, 'M 21 74 H 279 M 150 9 V 73', '#2b3650', 4);
    for (let i = 0; i < 6; i++) {
      const y = 15 + i * 10;
      stroke(c, `M 3 ${y+4} l 12 -5 M 285 ${y+4} l 12 -5`, '#62748f', 3);
    }
    c.fillStyle = '#26324a'; c.fillRect(0, 76, 300, 58);
    oval(c, 76, 132, 32, 24, '#9f5661', true);
    oval(c, 222, 130, 32, 24, '#38777d', true);
    mick(c, host === 'MICK', t, host === 'MICK' ? mouth : 0);
    emma(c, host === 'EMMA', t, host === 'EMMA' ? mouth : 0);
    shape(c, 'M -3 139 L 24 128 H 276 L 303 139 V 158 H -3 Z', '#b77756');
    c.fillStyle = '#dba273'; c.fillRect(0, 136, 300, 4);
    c.fillStyle = '#354158'; c.fillRect(0, 141, 300, 15);
    microphone(c, 112, true); microphone(c, 185, false);
    for (const [i, on] of [host === 'MICK', host === 'EMMA'].entries()) {
      const x = i ? 205 : 60;
      const light = on ? (i ? '#a3ffdf' : '#ffdf95') : '#c1ccd9';
      if (introduction) {
        c.font = 'bold 13px system-ui, sans-serif'; c.textAlign = 'center'; c.fillStyle = light;
        c.fillText(i ? 'EMMA' : 'MICK', x + 15, 153);
      } else stroke(c, `M ${x} 148 h 29`, on ? light : '#617080', 4);
    }
    c.fillStyle = '#253145'; c.fillRect(126, 130, 48, 8);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = i / 6 < mouth ? '#ffe291' : '#616779';
      c.fillRect(132 + i * 6, 132, 4, 3);
    }
  }
}
