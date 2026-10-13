const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export class BackroomsView {
  constructor() { this.reset(); }
  reset() {
    this.baseYaw = Math.PI / 2; this.basePitch = -.11;
    this.yaw = this.targetYaw = this.baseYaw; this.pitch = this.targetPitch = this.basePitch;
    this.vy = this.vp = 0;
  }
  aim(x, y) {
    this.targetYaw = this.baseYaw - clamp(x, -1, 1) * .14;
    this.targetPitch = clamp(this.basePitch - clamp(y, -1, 1) * .08, -.70, .65);
  }
  turn(dx, dy) {
    this.baseYaw -= dx; this.basePitch = clamp(this.basePitch - dy, -.70, .65);
    this.targetYaw = this.baseYaw; this.targetPitch = this.basePitch;
  }
  home() { this.targetYaw = this.baseYaw; this.targetPitch = this.basePitch; }
  snap() { this.yaw = this.targetYaw; this.pitch = this.targetPitch; this.vy = this.vp = 0; }
  step(seconds) {
    const dt = clamp(seconds, 0, .05), count = Math.max(1, Math.ceil(dt * 120)), sub = dt / count;
    for (let i = 0; i < count; i++) {
      this.vy += ((this.targetYaw - this.yaw) * 70 - this.vy * 16) * sub;
      this.vp += ((this.targetPitch - this.pitch) * 70 - this.vp * 16) * sub;
      this.yaw += this.vy * sub; this.pitch += this.vp * sub;
    }
    if (!this.moving()) this.snap();
  }
  moving() { return Math.abs(this.yaw - this.targetYaw) + Math.abs(this.pitch - this.targetPitch) > .00015 || Math.abs(this.vy) + Math.abs(this.vp) > .0003; }
}
