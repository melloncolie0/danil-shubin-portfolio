const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export class PortalMotion {
  constructor(width, height) { this.resize(width, height); }
  resize(width, height, bleed = 0) {
    this.width = width; this.height = height; this.bleed = Math.max(0, bleed);
    this.cx = width * .5; this.cy = height * .47;
    this.base = Math.min(width * .375, height * .29, 215);
    this.full = Math.hypot(Math.max(this.cx, width - this.cx), Math.max(this.cy, height - this.cy) + this.bleed) + 24;
    this.radius = this.targetRadius = this.base;
    this.yaw = this.targetYaw = this.pitch = this.targetPitch = 0;
    this.vr = this.vy = this.vp = 0; this.opened = false; this.dragging = false;
  }
  aim(x, y) {
    this.targetYaw = clamp((x - this.cx) / (this.base * 2), -1, 1) * .42;
    this.targetPitch = clamp((y - this.cy) / (this.base * 2), -1, 1) * .22;
  }
  turn(x, y) {
    this.targetYaw = clamp(this.targetYaw + x, -.7, .7);
    this.targetPitch = clamp(this.targetPitch + y, -.35, .35);
  }
  homeView() { this.targetYaw = this.targetPitch = 0; }
  beginResize(distance) {
    this.dragging = true; this.startRadius = this.radius; this.startDistance = distance;
    this.wasOpened = this.opened; this.targetRadius = this.radius;
  }
  dragResize(distance) {
    if (this.dragging) this.targetRadius = clamp(this.startRadius + distance - this.startDistance, this.base * .55, this.full);
  }
  endResize(cancel = false) {
    if (!this.dragging) return;
    this.dragging = false;
    this.setOpen(cancel ? this.wasOpened : this.targetRadius > this.base * 1.4);
  }
  setOpen(opened) { this.opened = opened; this.targetRadius = opened ? this.full : this.base; }
  toggle() { this.setOpen(!this.opened); }
  close() { this.dragging = false; this.setOpen(false); this.homeView(); }
  snap() {
    this.radius = this.targetRadius; this.yaw = this.targetYaw; this.pitch = this.targetPitch;
    this.vr = this.vy = this.vp = 0;
  }
  step(seconds) {
    const dt = clamp(seconds, 0, .05), steps = Math.max(1, Math.ceil(dt * 120)), sub = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.vr += ((this.targetRadius - this.radius) * (this.dragging ? 110 : 55) - this.vr * (this.dragging ? 20 : 15)) * sub;
      this.vy += ((this.targetYaw - this.yaw) * 65 - this.vy * 15) * sub;
      this.vp += ((this.targetPitch - this.pitch) * 65 - this.vp * 15) * sub;
      this.vr = clamp(this.vr, -2400, 2400);
      this.radius = clamp(this.radius + this.vr * sub, this.base * .5, this.full * 1.02);
      this.yaw += this.vy * sub; this.pitch += this.vp * sub;
    }
    if (!this.moving()) this.snap();
  }
  moving() {
    return Math.abs(this.radius - this.targetRadius) > .06 || Math.abs(this.vr) > .1 ||
      Math.abs(this.yaw - this.targetYaw) + Math.abs(this.pitch - this.targetPitch) > .0002 || Math.abs(this.vy) + Math.abs(this.vp) > .0005;
  }
  reveal() { return clamp((this.radius - this.base) / (this.full - this.base), 0, 1); }
  viewportProjection(fov) {
    const renderHeight = this.height + this.bleed * 2;
    const tangent = Math.tan(fov * Math.PI / 360) * renderHeight / this.height;
    return { fov: 2 * Math.atan(tangent) * 180 / Math.PI, aspect: this.width / renderHeight };
  }
  projection() {
    // Frame the world once for the closed aperture. Opening only exposes more of that same view.
    const tangent = Math.tan(44 * Math.PI / 360) * this.height / (this.base * 2);
    return { fov: 2 * Math.atan(tangent) * 180 / Math.PI, aspect: this.width / this.height, offsetY: this.height * .5 - this.cy };
  }
}
