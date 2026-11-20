import * as T from 'three';

export const sphere = new T.SphereGeometry(1, 14, 10);
export const box = new T.BoxGeometry(1, 1, 1);
export const cone = new T.ConeGeometry(1, 1, 5);
export const cylinder = new T.CylinderGeometry(1, 1, 1, 16);
export const plane = new T.PlaneGeometry(1, 1);
export const material = (color: T.ColorRepresentation, roughness = 0.76) => new T.MeshStandardMaterial({ color, roughness });
export const flat = (color: T.ColorRepresentation) => new T.MeshBasicMaterial({ color });

export function textTexture(width: number, height: number, paint: (context: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) paint(ctx);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

export function mesh(parent: T.Object3D, geo: T.BufferGeometry, mat: T.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const item = new T.Mesh(geo, mat);
  item.position.set(x, y, z);
  item.scale.set(sx, sy, sz);
  parent.add(item);
  return item;
}

export type StaticShape = { x: number; y: number; z: number; sx: number; sy: number; sz: number; r?: number; color?: T.ColorRepresentation };

export function instances(parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material, shapes: readonly StaticShape[]) {
  const batch = new T.InstancedMesh(geometry, material, shapes.length);
  const transform = new T.Object3D();
  const color = new T.Color();
  for (const [i, s] of shapes.entries()) {
    transform.position.set(s.x, s.y, s.z);
    transform.rotation.y = s.r ?? 0;
    transform.scale.set(s.sx, s.sy, s.sz);
    transform.updateMatrix();
    batch.setMatrixAt(i, transform.matrix);
    if (s.color !== undefined) batch.setColorAt(i, color.set(s.color));
  }
  parent.add(batch);
  return batch;
}

type PieceBatch = { geo: T.BufferGeometry; mat: T.Material; parts: T.Object3D[]; colors: (T.ColorRepresentation | undefined)[]; mesh?: T.InstancedMesh };
export class ArticulatedInstances {
  private readonly batches = new Map<string, PieceBatch>();

  part(parent: T.Object3D, geo: T.BufferGeometry, mat: T.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, color?: T.ColorRepresentation) {
    const part = new T.Object3D();
    part.position.set(x, y, z);
    part.scale.set(sx, sy, sz);
    parent.add(part);
    const key = `${geo.id}:${mat.id}`;
    let batch = this.batches.get(key);
    if (!batch) {
      batch = { geo, mat, parts: [], colors: [] };
      this.batches.set(key, batch);
    }
    batch.parts.push(part);
    batch.colors.push(color);
    return part;
  }

  build(scene: T.Scene) {
    const tint = new T.Color();
    for (const batch of this.batches.values()) {
      batch.mesh = new T.InstancedMesh(batch.geo, batch.mat, batch.parts.length);
      batch.mesh.frustumCulled = false;
      batch.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      for (const [index, color] of batch.colors.entries()) {
        if (color !== undefined) batch.mesh.setColorAt(index, tint.set(color));
      }
      scene.add(batch.mesh);
    }
  }

  update() {
    for (const batch of this.batches.values()) {
      const instanced = batch.mesh;
      if (!instanced) continue;
      for (let i = 0; i < batch.parts.length; i++) instanced.setMatrixAt(i, batch.parts[i].matrixWorld);
      instanced.instanceMatrix.needsUpdate = true;
    }
  }
}

export function softShadowMaterial() {
  const tex = textTexture(64, 64, ctx => {
    const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
    g.addColorStop(0, 'rgba(14,19,42,0.54)');
    g.addColorStop(0.42, 'rgba(14,19,42,0.37)');
    g.addColorStop(1, 'rgba(14,19,42,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  return new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
}
