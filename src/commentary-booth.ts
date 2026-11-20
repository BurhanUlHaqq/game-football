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

function jom(c: Brush, active: boolean, t: number, mouth: number) {
  c.save();
  c.translate(79, 85 + Math.sin(t * 2.1) * 1.1 - mouth * 1.5);
  c.scale(active ? 1.20 : 1.11, active ? 1.20 : 1.11);
  c.rotate(active ? -.025 : .085);
  oval(c, -4, 42, 26, 25, '#e7894b', true);
  stroke(c, 'M -19 51 Q -47 57 -47 32 Q -45 19 -52 23', ink, 10);
  stroke(c, 'M -19 51 Q -47 57 -47 32 Q -45 19 -52 23', '#b9b8de', 6);
  const fur = '#9599c2';
  shape(c, 'M -30 -11 L -34 -43 Q -35 -48 -29 -45 L -9 -32 Q 1 -35 11 -31 L 27 -45 Q 34 -49 32 -38 L 29 -12 Q 38 -2 33 5 L 37 8 L 27 11 Q 21 26 1 27 Q -17 28 -28 13 L -37 10 L -32 4 L -38 1 Z', fur);
  shape(c, 'M -29 -38 L -26 -21 L -15 -29 Z', '#edaaa9');
  shape(c, 'M 17 -28 L 27 -37 L 25 -20 Z', '#edaaa9');
  oval(c, 2, 8, 22, 15, '#f7e7cd');
  face(c, 2, -9, active ? 1 : 3, t % 4.4 > 4.25, mouth);
  oval(c, 3, 1, 5, 3.4, '#664654', true);
  stroke(c, 'M -13 5 L -37 0 M -14 9 L -38 12 M 18 5 L 39 1 M 18 10 L 39 14', '#53445a', 1.8);
  stroke(c, 'M -33 -4 Q -40 -39 -8 -43 Q 9 -47 20 -38', ink, 5);
  oval(c, -31, -3, 6, 10, '#f4bd69', true);
  shape(c, 'M -9 29 L -3 34 L 2 29 L 11 34 L 2 40 L -2 36 L -9 41 Z', '#39797f');
  c.restore();
}

function jerry(c: Brush, active: boolean, t: number, mouth: number) {
  c.save();
  c.translate(221, 90 + Math.sin(t * 2.4 + 1) * 1.2 - mouth * 1.7);
  c.scale(active ? 1.22 : 1.12, active ? 1.22 : 1.12);
  c.rotate(active ? .015 : -.085);
  oval(c, 0, 35, 22, 22, '#479f91', true);
  const fur = '#cc9065';
  for (const side of [-1, 1]) {
    oval(c, side * 24, -24, 16, 16.5, fur, true);
    oval(c, side * 24, -24, 10.7, 11.5, '#f5afa1');
  }
  shape(c, 'M -26 -13 Q -22 -34 -3 -33 Q 20 -36 28 -14 Q 34 11 17 20 Q 4 29 -10 22 Q -25 19 -32 8 Q -34 2 -27 -1 Z', fur);
  oval(c, -3, 7, 21, 14, '#ffe5bf');
  face(c, -2, -10, active ? -1 : -3, (t + .7) % 4.7 > 4.55, mouth);
  oval(c, -5, 0, 4.3, 3.2, '#553e4b', true);
  stroke(c, 'M -17 4 L -35 0 M -18 8 L -34 10 M 13 6 L 30 2 M 14 10 L 31 12', '#775964', 1.6);
  stroke(c, 'M 27 -5 Q 31 -32 6 -36 Q -4 -38 -11 -33', ink, 4.5);
  oval(c, 26, -3, 6, 8, '#5cc5bd', true);
  stroke(c, 'M 26 3 Q 25 15 12 15', ink, 2.8);
  oval(c, 11, 15, 3.5, 2.6, ink);
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
    jom(c, host === 'JOM', t, host === 'JOM' ? mouth : 0);
    jerry(c, host === 'JERRY', t, host === 'JERRY' ? mouth : 0);
    shape(c, 'M -3 139 L 24 128 H 276 L 303 139 V 158 H -3 Z', '#b77756');
    c.fillStyle = '#dba273'; c.fillRect(0, 136, 300, 4);
    c.fillStyle = '#354158'; c.fillRect(0, 141, 300, 15);
    microphone(c, 112, true); microphone(c, 185, false);
    for (const [i, on] of [host === 'JOM', host === 'JERRY'].entries()) {
      const x = i ? 205 : 60;
      const light = on ? (i ? '#a3ffdf' : '#ffdf95') : '#c1ccd9';
      if (introduction) {
        c.font = 'bold 13px system-ui, sans-serif'; c.textAlign = 'center'; c.fillStyle = light;
        c.fillText(i ? 'JERRY' : 'JOM', x + 15, 153);
      } else stroke(c, `M ${x} 148 h 29`, on ? light : '#617080', 4);
    }
    c.fillStyle = '#253145'; c.fillRect(126, 130, 48, 8);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = i / 6 < mouth ? '#ffe291' : '#616779';
      c.fillRect(132 + i * 6, 132, 4, 3);
    }
  }
}
