const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const cross = (ax, az, bx, bz) => ax * bz - az * bx;

// A small spatial grid keeps collision work independent of the GLB triangle count.
export class WalkSpace {
  constructor(segments = [], floors = [], cellSize = 2) {
    this.cellSize = cellSize; this.walls = new Map(); this.floors = new Map();
    this.segments = segments; this.triangles = floors;
    const insert = (grid, item, points) => {
      const xs = points.map(p => p[0]), zs = points.map(p => p[1]);
      for (let x = Math.floor(Math.min(...xs) / cellSize); x <= Math.floor(Math.max(...xs) / cellSize); x++) {
        for (let z = Math.floor(Math.min(...zs) / cellSize); z <= Math.floor(Math.max(...zs) / cellSize); z++) {
          const key = `${x},${z}`;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(item);
        }
      }
    };
    segments.forEach(s => insert(this.walls, s, [[s[0], s[1]], [s[2], s[3]]]));
    floors.forEach(t => insert(this.floors, t, [[t[0], t[1]], [t[2], t[3]], [t[4], t[5]]]));
  }
  nearby(x, z, radius) {
    const found = new Set(), cell = this.cellSize;
    for (let gx = Math.floor((x - radius) / cell); gx <= Math.floor((x + radius) / cell); gx++) {
      for (let gz = Math.floor((z - radius) / cell); gz <= Math.floor((z + radius) / cell); gz++) {
        for (const segment of this.walls.get(`${gx},${gz}`) || []) found.add(segment);
      }
    }
    return found;
  }
  hasFloor(x, z) {
    for (const t of this.floors.get(`${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`) || []) {
      const a = cross(t[2] - t[0], t[3] - t[1], x - t[0], z - t[1]);
      const b = cross(t[4] - t[2], t[5] - t[3], x - t[2], z - t[3]);
      const c = cross(t[0] - t[4], t[1] - t[5], x - t[4], z - t[5]);
      if (Math.min(a, b, c) >= -.00001 || Math.max(a, b, c) <= .00001) return true;
    }
    return false;
  }
  supported(x, z, radius) {
    const r = radius * .75;
    return this.hasFloor(x, z) && this.hasFloor(x - r, z) && this.hasFloor(x + r, z) && this.hasFloor(x, z - r) && this.hasFloor(x, z + r);
  }
  slide(fromX, fromZ, dx, dz, radius) {
    let x = fromX + dx, z = fromZ + dz;
    // Project the body's circle out of nearby walls, preserving tangential motion.
    for (let pass = 0; pass < 4; pass++) {
      let collided = false;
      for (const s of this.nearby(x, z, radius)) {
        const sx = s[2] - s[0], sz = s[3] - s[1], length2 = sx * sx + sz * sz;
        const t = clamp(((x - s[0]) * sx + (z - s[1]) * sz) / length2, 0, 1);
        const px = s[0] + t * sx, pz = s[1] + t * sz;
        let nx = x - px, nz = z - pz, distance = Math.hypot(nx, nz);
        if (distance >= radius) continue;
        if (distance < .000001) {
          nx = fromX - px; nz = fromZ - pz; distance = Math.hypot(nx, nz);
          if (distance < .000001) { nx = -sz; nz = sx; distance = Math.hypot(nx, nz); }
        }
        const push = radius - Math.hypot(x - px, z - pz) + .00001;
        x += nx / distance * push; z += nz / distance * push; collided = true;
      }
      if (!collided) break;
    }
    // No floor means a boundary or hole, rather than an invisible surface to walk over.
    if (!this.supported(x, z, radius)) return [fromX, fromZ];
    return [x, z];
  }
}

export class BackroomsWalk {
  constructor(space, start = [-2, 1.5, 5.2]) { this.space = space; this.start = start; this.radius = .24; this.speed = 2.3; this.reset(); }
  reset() { [this.x, this.y, this.z] = this.start; this.vx = this.vz = 0; this.right = this.forward = 0; this.distance = 0; }
  input(right, forward) {
    const length = Math.max(1, Math.hypot(right, forward));
    this.right = right / length; this.forward = forward / length;
  }
  stop() { this.input(0, 0); this.vx = this.vz = 0; }
  moving() { return Math.hypot(this.right, this.forward) > .001 || Math.hypot(this.vx, this.vz) > .002; }
  step(seconds, yaw) {
    const dt = clamp(seconds, 0, .05), count = Math.max(1, Math.ceil(dt * 120)), sub = dt / count;
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const tx = (this.right * cos - this.forward * sin) * this.speed;
    const tz = (-this.right * sin - this.forward * cos) * this.speed;
    const rate = this.right || this.forward ? 11 : 17;
    for (let i = 0; i < count; i++) {
      const blend = 1 - Math.exp(-rate * sub);
      this.vx += (tx - this.vx) * blend; this.vz += (tz - this.vz) * blend;
      const [x, z] = this.space.slide(this.x, this.z, this.vx * sub, this.vz * sub, this.radius);
      this.distance += Math.hypot(x - this.x, z - this.z); this.x = x; this.z = z;
    }
    if (!this.moving()) this.stop();
  }
}
