export class ClothPhysics {
  constructor({ columns = 42, rows = 30, width = 6.6, height = 4.2, iterations = 7 } = {}) {
    this.columns = columns; this.rows = rows; this.width = width; this.height = height; this.iterations = iterations;
    this.count = (columns + 1) * (rows + 1);
    this.positions = new Float32Array(this.count * 3);
    this.previous = new Float32Array(this.count * 3);
    this.initial = new Float32Array(this.count * 3);
    this.pinned = new Uint8Array(this.count);
    this.constraints = []; this.grab = null; this.lastStep = 1 / 120;
    const index = (x, y) => y * (columns + 1) + x;
    for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
      const i = index(x, y), u = x / columns, v = y / rows;
      this.positions[i * 3] = (u - .5) * width * .82;
      this.positions[i * 3 + 1] = (.5 - v) * height - Math.sin(u * Math.PI) * v * .13;
      this.positions[i * 3 + 2] = Math.sin(u * Math.PI * 6) * (.15 + v * .34) + Math.sin(v * Math.PI * 2) * .10;
      if (y === 0 && (x === 0 || x === Math.floor(columns / 2) || x === columns)) this.pinned[i] = 1;
      if (x < columns) this.link(i, index(x + 1, y), width / columns, .94);
      if (y < rows) this.link(i, index(x, y + 1), height / rows, .94);
      if (x < columns && y < rows) {
        const diagonal = Math.hypot(width / columns, height / rows);
        this.link(i, index(x + 1, y + 1), diagonal, .68);
        this.link(index(x + 1, y), index(x, y + 1), diagonal, .68);
      }
      if (x < columns - 1) this.link(i, index(x + 2, y), width / columns * 2, .16);
      if (y < rows - 1) this.link(i, index(x, y + 2), height / rows * 2, .16);
    }
    this.initial.set(this.positions); this.previous.set(this.positions);
    for (let i = 0; i < 100; i++) this.step(1 / 120, 0, false);
    this.rest = this.positions.slice(); this.previous.set(this.positions);
  }
  link(a, b, length, stiffness) { this.constraints.push({ a, b, length, stiffness }); }
  reset() { this.grab = null; this.positions.set(this.rest); this.previous.set(this.rest); }
  beginGrab(index) {
    if (this.pinned[index]) return false;
    const column = index % (this.columns + 1), row = Math.floor(index / (this.columns + 1));
    const p = this.positions, patch = [], cx = p[index * 3], cy = p[index * 3 + 1], cz = p[index * 3 + 2];
    for (let y = Math.max(0, row - 3); y <= Math.min(this.rows, row + 3); y++) {
      for (let x = Math.max(0, column - 3); x <= Math.min(this.columns, column + 3); x++) {
        const i = y * (this.columns + 1) + x, distance = Math.hypot(x - column, y - row);
        if (distance > 3.1 || this.pinned[i]) continue;
        patch.push({ index: i, weight: .65 * (1 - distance / 3.4), x: p[i * 3] - cx, y: p[i * 3 + 1] - cy, z: p[i * 3 + 2] - cz });
      }
    }
    this.grab = { index, patch, x: cx, y: cy, z: cz }; return true;
  }
  moveGrab(x, y, z) { if (this.grab) Object.assign(this.grab, { x, y, z }); }
  release() { this.grab = null; }
  impulse(x, y, strength = .4, directionX = 0, directionY = 0) {
    const p = this.positions, old = this.previous, radius = this.width * .20;
    for (let i = 0; i < this.count; i++) {
      if (this.pinned[i]) continue;
      const o = i * 3, distance = Math.hypot(p[o] - x, p[o + 1] - y);
      if (distance >= radius) continue;
      const falloff = (1 - distance / radius) ** 2 * this.lastStep;
      old[o] -= directionX * falloff; old[o + 1] -= directionY * falloff; old[o + 2] -= strength * falloff;
    }
  }
  step(dt, time, wind = true) {
    this.lastStep = dt;
    const p = this.positions, old = this.previous, initial = this.initial, damping = Math.exp(-dt * 2.3);
    for (let i = 0; i < this.count; i++) {
      const o = i * 3;
      if (this.pinned[i]) {
        p[o] = old[o] = initial[o]; p[o + 1] = old[o + 1] = initial[o + 1]; p[o + 2] = old[o + 2] = initial[o + 2]; continue;
      }
      const vx = (p[o] - old[o]) * damping, vy = (p[o + 1] - old[o + 1]) * damping, vz = (p[o + 2] - old[o + 2]) * damping;
      const speed = Math.hypot(vx, vy, vz), cap = 9 * dt, factor = speed > cap ? cap / speed : 1;
      old[o] = p[o]; old[o + 1] = p[o + 1]; old[o + 2] = p[o + 2];
      const breeze = wind ? Math.sin(time * .85 + initial[o] * .75) * .32 + Math.sin(time * 1.3 + initial[o + 1] * 1.1) * .17 : 0;
      p[o] += vx * factor + (initial[o] - p[o]) * .15 * dt * dt;
      p[o + 1] += vy * factor + (-5.4 + (initial[o + 1] - p[o + 1]) * .15) * dt * dt;
      p[o + 2] += vz * factor + (breeze + (initial[o + 2] - p[o + 2]) * .15) * dt * dt;
    }
    for (let iteration = 0; iteration < this.iterations; iteration++) {
      for (const { a, b, length, stiffness } of this.constraints) {
        const wa = this.pinned[a] ? 0 : 1, wb = this.pinned[b] ? 0 : 1;
        if (!wa && !wb) continue;
        const ao = a * 3, bo = b * 3, dx = p[bo] - p[ao], dy = p[bo + 1] - p[ao + 1], dz = p[bo + 2] - p[ao + 2];
        const distance = Math.hypot(dx, dy, dz);
        if (distance < .00001) continue;
        const correction = (distance - length) / distance * stiffness / (wa + wb);
        if (wa) { p[ao] += dx * correction; p[ao + 1] += dy * correction; p[ao + 2] += dz * correction; }
        if (wb) { p[bo] -= dx * correction; p[bo + 1] -= dy * correction; p[bo + 2] -= dz * correction; }
      }
      if (this.grab) {
        for (const point of this.grab.patch) {
          const o = point.index * 3, weight = point.weight;
          p[o] += (this.grab.x + point.x - p[o]) * weight;
          p[o + 1] += (this.grab.y + point.y - p[o + 1]) * weight;
          p[o + 2] += (this.grab.z + point.z - p[o + 2]) * weight;
        }
      }
    }
  }
  energy() {
    let sum = 0;
    for (let i = 0; i < this.positions.length; i++) sum += ((this.positions[i] - this.previous[i]) / this.lastStep) ** 2;
    return sum / this.count;
  }
}
