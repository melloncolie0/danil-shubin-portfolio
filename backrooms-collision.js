import * as THREE from 'three';
import { WalkSpace } from './backrooms-walk.js';

export function buildWalkSpace(room, figure, floorY = -.1176) {
  const segments = [], floors = [], unique = new Set();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3();
  room.updateMatrixWorld(true);
  room.traverse(mesh => {
    if (!mesh.isMesh) return;
    const position = mesh.geometry.attributes.position, index = mesh.geometry.index;
    const total = index ? index.count : position.count;
    for (let i = 0; i < total; i += 3) {
      a.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).applyMatrix4(mesh.matrixWorld);
      normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize();
      if (Math.abs(normal.y) > .95 && [a, b, c].every(p => Math.abs(p.y - floorY) < .06)) {
        floors.push([a.x, a.z, b.x, b.z, c.x, c.z]);
      }
      // Intersect actual static geometry at knee, torso and eye height.
      for (const height of [floorY + .40, floorY + .95, floorY + 1.58]) {
        if (Math.min(a.y, b.y, c.y) >= height || Math.max(a.y, b.y, c.y) <= height) continue;
        const hits = [], vertices = [a, b, c];
        for (let edge = 0; edge < 3; edge++) {
          const p = vertices[edge], q = vertices[(edge + 1) % 3];
          if ((p.y <= height && q.y > height) || (q.y <= height && p.y > height)) {
            const t = (height - p.y) / (q.y - p.y);
            hits.push([p.x + (q.x - p.x) * t, p.z + (q.z - p.z) * t]);
          }
        }
        if (hits.length !== 2 || Math.hypot(hits[0][0] - hits[1][0], hits[0][1] - hits[1][1]) < .0001) continue;
        const key = hits.map(p => p.map(v => v.toFixed(3)).join(',')).sort().join(';');
        if (!unique.has(key)) { unique.add(key); segments.push([...hits[0], ...hits[1]]); }
      }
    }
  });
  // The original cardboard standee is also a solid obstacle.
  const bounds = new THREE.Box3().setFromObject(figure), corners = [
    [bounds.min.x, bounds.min.z], [bounds.max.x, bounds.min.z], [bounds.max.x, bounds.max.z], [bounds.min.x, bounds.max.z]
  ];
  for (let i = 0; i < 4; i++) segments.push([...corners[i], ...corners[(i + 1) % 4]]);
  return new WalkSpace(segments, floors);
}
