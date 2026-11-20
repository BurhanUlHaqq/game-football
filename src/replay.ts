import type { ShowMoment } from './show';

const before = 87;
const after = 30;
const interval = 8;
const capacity = 18;
const length = 120;

export class MatchReplay {
  private readonly buffer: Array<{ canvas: HTMLCanvasElement; tick: number }> = [];
  private readonly target: CanvasRenderingContext2D | null;
  private readonly archive: HTMLCanvasElement;
  private next = 0;
  private last = -interval;
  private sequence: Array<{ index: number; offset: number }> = [];
  private saved?: ShowMoment;
  private starts?: number;
  private lastIndex = -1;

  constructor(private readonly inset: HTMLCanvasElement) {
    this.target = inset.getContext('2d');
    this.archive = document.createElement('canvas');
    this.archive.width = inset.width * 6;
    this.archive.height = inset.height * 3;
  }

  get captured() { return this.saved?.label; }
  get frameCount() { return this.sequence.length; }
  get frameIndex() { return this.lastIndex; }

  capture(tick: number, feature: ShowMoment | undefined, copy: (target: CanvasRenderingContext2D) => boolean) {
    if (!this.target || tick - this.last < interval || this.starts !== undefined) return;
    this.last = tick;
    let current = this.buffer[this.next];
    if (!current) {
      const canvas = document.createElement('canvas');
      canvas.width = this.inset.width;
      canvas.height = this.inset.height;
      current = { canvas, tick: -1 };
      this.buffer[this.next] = current;
    }
    const context = current.canvas.getContext('2d');
    if (!context || !copy(context)) return;
    current.tick = tick;
    this.next = (this.next + 1) % capacity;
    if (!feature || this.saved === feature || tick < feature.tick + after) return;
    const frames = this.buffer.filter(frame => frame.tick >= feature.tick - before && frame.tick <= feature.tick + after + interval)
      .sort((a, b) => a.tick - b.tick);
    this.store(feature, frames);
  }

  private store(feature: ShowMoment, frames: typeof this.buffer) {
    const context = this.archive.getContext('2d');
    if (!context || frames.length < 3) return;
    const { width, height } = this.inset;
    frames.forEach(({ canvas }, i) => context.drawImage(canvas, (i % 6) * width, Math.floor(i / 6) * height));
    this.sequence = frames.map(({ tick }, i) => ({ index: i, offset: (tick - frames[0].tick) * length / (frames[frames.length - 1].tick - frames[0].tick) }));
    this.saved = feature;
  }

  start(feature: ShowMoment | undefined, tick: number) {
    this.lastIndex = -1;
    if (feature && this.saved !== feature) {
      const frames = this.buffer.filter(frame => frame.tick >= feature.tick - before && frame.tick <= feature.tick + after && frame.tick >= 0)
        .sort((a, b) => a.tick - b.tick);
      if (frames.some(frame => frame.tick >= feature.tick)) this.store(feature, frames);
    }
    if (!feature || this.saved !== feature) return false;
    this.starts = tick;
    this.update(tick);
    return true;
  }

  update(tick: number) {
    const starts = this.starts;
    if (starts === undefined || !this.target) return;
    const frame = this.sequence.findLast(item => item.offset <= tick - starts);
    if (!frame || frame.index === this.lastIndex) return;
    const { width, height } = this.inset;
    this.target.drawImage(this.archive, (frame.index % 6) * width, Math.floor(frame.index / 6) * height, width, height, 0, 0, width, height);
    this.lastIndex = frame.index;
  }

  reset() {
    this.starts = this.saved = undefined;
    this.sequence = [];
    this.lastIndex = -1;
    for (const frame of this.buffer) frame.tick = -1;
  }
}
