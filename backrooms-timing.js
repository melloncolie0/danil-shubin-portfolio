export class RenderCadence {
  constructor(rate = 60) { this.period = 1000 / rate; this.reset(); }
  reset() { this.last = null; this.deadline = 0; }
  take(now) {
    if (this.last !== null && now + .7 < this.deadline) return null;
    const gap = this.last === null ? 0 : now - this.last;
    if (this.last === null || now - this.deadline > 150) this.deadline = now;
    this.deadline += this.period; this.last = now;
    return { dt: gap ? Math.min(gap / 1000, .05) : 1 / 60, gap };
  }
}
