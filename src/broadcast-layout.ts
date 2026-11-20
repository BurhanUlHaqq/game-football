export type ScreenPoint = { x: number; y: number };
export type ScreenBox = ScreenPoint & { width: number; height: number };

type Edge = 'left' | 'center' | 'right';
type Slot = { edge: Edge; height: 'bottom' | 'lower' | 'middle' | 'upper' };
const choices: Slot[] = [
  { edge: 'center', height: 'bottom' }, { edge: 'right', height: 'lower' }, { edge: 'left', height: 'lower' },
  { edge: 'right', height: 'bottom' }, { edge: 'left', height: 'bottom' }, { edge: 'left', height: 'upper' },
  { edge: 'right', height: 'upper' }, { edge: 'center', height: 'lower' }, { edge: 'center', height: 'upper' },
  { edge: 'left', height: 'middle' }, { edge: 'right', height: 'middle' },
];
const overlaps = (a: ScreenBox, b: ScreenBox) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

export function placePanel(surface: ScreenBox, size: Pick<ScreenBox, 'width' | 'height'>, obstacles: readonly ScreenBox[], prefer: number, previous?: number) {
  const margin = Math.max(8, Math.round(surface.width * 0.025));
  const ordered = [...new Set([previous, prefer, ...choices.keys()])];
  for (const index of ordered) {
    if (index === undefined) continue;
    const slot = choices[index];
    const x = slot.edge === 'left' ? margin : slot.edge === 'right' ? surface.width - margin - size.width : (surface.width - size.width) / 2;
    const bottom = slot.height === 'bottom' ? margin : slot.height === 'lower' ? Math.max(margin + 40, surface.height * 0.113) : surface.height * 0.76;
    const y = slot.height === 'middle' ? surface.height * 0.40 : slot.height === 'upper' ? Math.max(margin, surface.height - bottom) : surface.height - size.height - bottom;
    const box = { ...size, x: surface.x + Math.round(x), y: surface.y + Math.round(y) };
    if (x < 0 || y < 0 || x + size.width > surface.width || y + size.height > surface.height) continue;
    if (!obstacles.some(obstacle => overlaps(box, obstacle))) return { index, box };
  }
  return undefined;
}

export class BroadcastLayout {
  private readonly slots = new WeakMap<HTMLElement, number>();
  private readonly fixed: HTMLElement[];

  constructor(private readonly root: HTMLElement, private readonly floating: HTMLElement[]) {
    this.fixed = Array.from(root.querySelectorAll<HTMLElement>('.scoreboard, .brand, .live, .arena-label, .match-report, .hero-toggle'));
  }

  update(points: readonly ScreenPoint[]) {
    if (this.root.hidden) return;
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    const surface = { x: 0, y: 0, width, height };
    const ballMargin = Math.max(11, width * 0.009);
    const guards: ScreenBox[] = points.map(({ x, y }, index) => {
      const radius = index === 0 ? ballMargin : ballMargin * 1.25;
      return { x: x * width - radius, y: y * height - radius, width: radius * 2, height: radius * 2 };
    });
    for (const item of this.fixed) {
      if (item.hidden || !item.offsetWidth) continue;
      const box = item.getBoundingClientRect();
      guards.push({ x: box.left - 4, y: box.top - 4, width: box.width + 8, height: box.height + 8 });
    }
    for (const [index, item] of this.floating.entries()) {
      if (item.hidden) { this.slots.delete(item); continue; }
      const size = { width: item.offsetWidth, height: item.offsetHeight };
      const result = placePanel(surface, size, guards, index === 0 ? 0 : index === 1 ? 1 : 7, this.slots.get(item));
      item.style.visibility = result ? '' : 'hidden';
      if (!result) continue;
      this.slots.set(item, result.index);
      const { box } = result;
      item.style.left = `${box.x}px`;
      item.style.top = `${box.y}px`;
      guards.push({ x: box.x - 5, y: box.y - 5, width: box.width + 10, height: box.height + 10 });
    }
  }
}
