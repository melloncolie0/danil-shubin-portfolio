export class LensMotion {
  constructor(width, height) { this.resize(width, height); }
  resize(width, height) {
    this.width = width; this.height = height; this.homeX = width * .56; this.homeY = height * (width < 760 ? .40 : .34);
    this.x = this.targetX = this.homeX; this.y = this.targetY = this.homeY;
    this.vx = this.vy = 0; this.active = false;
  }
  point(x, y) { this.targetX = x; this.targetY = y; this.active = true; }
  home() { this.active = false; this.targetX = this.homeX; this.targetY = this.homeY; }
  snap() { this.x = this.targetX; this.y = this.targetY; this.vx = this.vy = 0; }
  step(seconds) {
    const dt = Math.min(seconds, .05), steps = Math.ceil(dt * 120), sub = dt / steps;
    const spring = this.active ? 120 : 40, damping = this.active ? 20 : 11;
    for (let i = 0; i < steps; i++) {
      this.vx += ((this.targetX - this.x) * spring - this.vx * damping) * sub;
      this.vy += ((this.targetY - this.y) * spring - this.vy * damping) * sub;
      const speed = Math.hypot(this.vx, this.vy);
      if (speed > 2400) { this.vx *= 2400 / speed; this.vy *= 2400 / speed; }
      this.x += this.vx * sub; this.y += this.vy * sub;
    }
    if (!this.moving()) this.snap();
  }
  moving() { return Math.hypot(this.targetX - this.x, this.targetY - this.y) > .08 || Math.hypot(this.vx, this.vy) > .15; }
}
