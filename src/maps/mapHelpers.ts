import {
  BaseTexture,
  Color3,
  DynamicTexture,
  Engine,
  Material,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  RawCubeTexture,
  RawTexture,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { BuiltMapResources, MapDefinition } from './types';

function hash2D(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number, period: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const wrap = (val: number) => ((val % period) + period) % period;
  const x0 = wrap(xi);
  const x1 = wrap(xi + 1);
  const y0 = wrap(yi);
  const y1 = wrap(yi + 1);

  const a = hash2D(x0, y0);
  const b = hash2D(x1, y0);
  const c = hash2D(x0, y1);
  const d = hash2D(x1, y1);

  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbmTileable(u: number, v: number, baseFreq: number): number {
  let sum = 0;
  let amp = 0.55;
  let freq = baseFreq;
  for (let i = 0; i < 3; i++) {
    sum += amp * smoothNoise(u * freq, v * freq, freq);
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
}

export class MapBuildContext {
  public readonly scene: Scene;
  public readonly shadowGenerator: ShadowGenerator | null;
  public readonly resources: BuiltMapResources = {
    nodes: [],
    materials: [],
    textures: [],
  };

  constructor(scene: Scene, shadowGenerator: ShadowGenerator | null) {
    this.scene = scene;
    this.shadowGenerator = shadowGenerator;
  }

  public trackNode<T extends TransformNode>(node: T): T {
    this.resources.nodes.push(node);
    return node;
  }

  public trackMaterial<T extends Material>(mat: T): T {
    this.resources.materials.push(mat);
    return mat;
  }

  public trackTexture<T extends BaseTexture>(tex: T): T {
    this.resources.textures.push(tex);
    return tex;
  }

  public createBox(
    name: string,
    pos: Vector3,
    size: Vector3,
    mat: Material,
    options?: {
      rot?: Vector3;
      collisions?: boolean;
      castShadow?: boolean;
      receiveShadows?: boolean;
      pickable?: boolean;
    }
  ): Mesh {
    const mesh = MeshBuilder.CreateBox(
      name,
      { width: size.x, height: size.y, depth: size.z },
      this.scene
    );
    mesh.position.copyFrom(pos);
    if (options?.rot) {
      mesh.rotation.copyFrom(options.rot);
    }
    mesh.material = mat;
    mesh.checkCollisions = options?.collisions ?? true;
    mesh.receiveShadows = options?.receiveShadows ?? true;
    mesh.isPickable = options?.pickable ?? true;
    if ((options?.castShadow ?? true) && this.shadowGenerator) {
      this.shadowGenerator.addShadowCaster(mesh);
    }
    return this.trackNode(mesh);
  }

  public createRamp(
    name: string,
    bottomCenter: Vector3,
    width: number,
    height: number,
    runLength: number,
    yawRad: number,
    mat: Material
  ): Mesh {
    const slopeLen = Math.hypot(runLength, height);
    const angle = Math.atan2(height, runLength);
    const mesh = MeshBuilder.CreateBox(
      name,
      { width, height: 0.24, depth: slopeLen },
      this.scene
    );

    const forwardX = Math.sin(yawRad);
    const forwardZ = Math.cos(yawRad);
    mesh.position.set(
      bottomCenter.x + forwardX * (runLength * 0.5),
      bottomCenter.y + height * 0.5 - 0.1,
      bottomCenter.z + forwardZ * (runLength * 0.5)
    );
    mesh.rotation.set(-angle, yawRad, 0);
    mesh.material = mat;
    mesh.checkCollisions = true;
    mesh.receiveShadows = true;
    if (this.shadowGenerator) {
      this.shadowGenerator.addShadowCaster(mesh);
    }
    return this.trackNode(mesh);
  }

  public createPerimeterWalls(
    halfExtent: number,
    height: number,
    mat: Material
  ): void {
    const span = halfExtent * 2 + 1;
    this.createBox('wall_n', new Vector3(0, height * 0.5, halfExtent + 0.5), new Vector3(span, height, 1), mat);
    this.createBox('wall_s', new Vector3(0, height * 0.5, -halfExtent - 0.5), new Vector3(span, height, 1), mat);
    this.createBox('wall_e', new Vector3(halfExtent + 0.5, height * 0.5, 0), new Vector3(1, height, span - 2), mat);
    this.createBox('wall_w', new Vector3(-halfExtent - 0.5, height * 0.5, 0), new Vector3(1, height, span - 2), mat);
  }

  public createSkyDomeAndEnvironment(def: MapDefinition): void {
    const zenith = Color3.FromHexString(def.skyZenithHex);
    const horizon = Color3.FromHexString(def.skyHorizonHex);
    const ground = Color3.FromHexString(def.ambientGroundHex);
    const sunCol = Color3.FromHexString(def.sunColorHex);
    const sunTo = def.sunDirection.clone().scale(-1).normalize();

    // 1. Procedural Sky Dome with gradient + subtle sun corona
    const skyTex = this.trackTexture(
      new DynamicTexture('skyDomeTex', { width: 512, height: 256 }, this.scene, false)
    );
    const sctx = skyTex.getContext() as unknown as CanvasRenderingContext2D;
    const grad = sctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, def.skyZenithHex);
    grad.addColorStop(0.42, def.skyHorizonHex);
    grad.addColorStop(0.54, def.fogHex);
    grad.addColorStop(1.0, def.ambientGroundHex);
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 512, 256);

    // Subtle atmospheric cloud wisps
    for (let i = 0; i < 42; i++) {
      const cx = hash2D(i * 3.1, 7.2) * 512;
      const cy = 24 + hash2D(i * 1.9, 13.7) * 78;
      const rw = 28 + hash2D(i, 2.3) * 65;
      const rh = 6 + hash2D(i, 9.1) * 12;
      sctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
      sctx.beginPath();
      sctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
      sctx.fill();
    }

    // Directional sun glow aligned roughly with azimuth
    const sunAzimuth = Math.atan2(sunTo.x, sunTo.z);
    const sunU = (((sunAzimuth / (Math.PI * 2)) % 1) + 1) % 1;
    const sunY = Math.max(20, Math.min(115, 118 - sunTo.y * 85));
    const sx = sunU * 512;
    const sunGrad = sctx.createRadialGradient(sx, sunY, 2, sx, sunY, 64);
    sunGrad.addColorStop(
      0,
      `rgba(${Math.round(sunCol.r * 255)}, ${Math.round(sunCol.g * 255)}, ${Math.round(sunCol.b * 255)}, 0.85)`
    );
    sunGrad.addColorStop(
      0.3,
      `rgba(${Math.round(sunCol.r * 255)}, ${Math.round(sunCol.g * 255)}, ${Math.round(sunCol.b * 255)}, 0.25)`
    );
    sunGrad.addColorStop(1, 'rgba(255,255,255,0)');
    sctx.fillStyle = sunGrad;
    sctx.fillRect(0, 0, 512, 256);

    skyTex.update();

    const skyMat = this.trackMaterial(new StandardMaterial('skyDomeMat', this.scene));
    skyMat.disableLighting = true;
    skyMat.backFaceCulling = false;
    skyMat.emissiveTexture = skyTex;
    skyMat.fogEnabled = false;

    const skyDome = MeshBuilder.CreateSphere(
      'skyDome',
      { diameter: 240, segments: 18, sideOrientation: Mesh.BACKSIDE },
      this.scene
    );
    skyDome.material = skyMat;
    skyDome.isPickable = false;
    skyDome.checkCollisions = false;
    skyDome.infiniteDistance = true;
    skyDome.applyFog = false;
    this.trackNode(skyDome);

    // 2. Procedural IBL Environment Cube Texture (6 RGBA faces for PBR reflections)
    const size = 32;
    const faces: Uint8Array[] = [];
    const faceDirs = [
      (u: number, v: number) => new Vector3(1, -v, -u), // +X
      (u: number, v: number) => new Vector3(-1, -v, u), // -X
      (u: number, v: number) => new Vector3(u, 1, v), // +Y
      (u: number, v: number) => new Vector3(u, -1, -v), // -Y
      (u: number, v: number) => new Vector3(u, -v, 1), // +Z
      (u: number, v: number) => new Vector3(-u, -v, -1), // -Z
    ];

    for (let f = 0; f < 6; f++) {
      const buf = new Uint8Array(size * size * 4);
      const dirFn = faceDirs[f];
      for (let y = 0; y < size; y++) {
        const v = ((y + 0.5) / size) * 2 - 1;
        for (let x = 0; x < size; x++) {
          const u = ((x + 0.5) / size) * 2 - 1;
          const d = dirFn(u, v).normalize();

          let r: number;
          let g: number;
          let b: number;
          if (d.y >= 0) {
            const t = Math.pow(d.y, 0.55);
            r = horizon.r + (zenith.r - horizon.r) * t;
            g = horizon.g + (zenith.g - horizon.g) * t;
            b = horizon.b + (zenith.b - horizon.b) * t;
          } else {
            const t = Math.min(1, Math.pow(-d.y, 0.5));
            r = horizon.r * 0.8 + (ground.r - horizon.r * 0.8) * t;
            g = horizon.g * 0.8 + (ground.g - horizon.g * 0.8) * t;
            b = horizon.b * 0.8 + (ground.b - horizon.b * 0.8) * t;
          }

          // Directional sun specular highlight lobe in IBL
          const sunDot = Math.max(0, Vector3.Dot(d, sunTo));
          const sunLobe = Math.pow(sunDot, 14) * 1.15;
          r = Math.min(1, r + sunCol.r * sunLobe);
          g = Math.min(1, g + sunCol.g * sunLobe);
          b = Math.min(1, b + sunCol.b * sunLobe);

          const idx = (y * size + x) * 4;
          buf[idx] = Math.round(r * 255);
          buf[idx + 1] = Math.round(g * 255);
          buf[idx + 2] = Math.round(b * 255);
          buf[idx + 3] = 255;
        }
      }
      faces.push(buf);
    }

    const envCube = this.trackTexture(
      new RawCubeTexture(
        this.scene,
        faces,
        size,
        Engine.TEXTUREFORMAT_RGBA,
        Engine.TEXTURETYPE_UNSIGNED_BYTE,
        true,
        false,
        Texture.BILINEAR_SAMPLINGMODE
      )
    );
    this.scene.environmentTexture = envCube;
    this.scene.environmentIntensity = 0.85;
  }

  public createNormalTexture(
    name: string,
    size: number,
    heightFn: (u: number, v: number) => number,
    strength: number,
    uScale = 1,
    vScale = 1
  ): RawTexture {
    const heights = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        heights[y * size + x] = heightFn(u, v);
      }
    }

    const rgba = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      const ym = (y - 1 + size) % size;
      const yp = (y + 1) % size;
      for (let x = 0; x < size; x++) {
        const xm = (x - 1 + size) % size;
        const xp = (x + 1) % size;

        const hL = heights[y * size + xm];
        const hR = heights[y * size + xp];
        const hU = heights[ym * size + x];
        const hD = heights[yp * size + x];

        const dx = (hL - hR) * strength;
        const dy = (hU - hD) * strength;
        const dz = 1.0;
        const invLen = 1 / Math.hypot(dx, dy, dz);

        const idx = (y * size + x) * 4;
        rgba[idx] = Math.round((dx * invLen * 0.5 + 0.5) * 255);
        rgba[idx + 1] = Math.round((dy * invLen * 0.5 + 0.5) * 255);
        rgba[idx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
        rgba[idx + 3] = 255;
      }
    }

    const tex = this.trackTexture(
      new RawTexture(
        rgba,
        size,
        size,
        Engine.TEXTUREFORMAT_RGBA,
        this.scene,
        true,
        false,
        Texture.TRILINEAR_SAMPLINGMODE,
        Engine.TEXTURETYPE_UNSIGNED_BYTE
      )
    );
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    tex.uScale = uScale;
    tex.vScale = vScale;
    return tex;
  }

  public createFlatMaterial(
    name: string,
    hex: string,
    metallic = 0.08,
    roughness = 0.72
  ): PBRMaterial {
    const mat = new PBRMaterial(name, this.scene);
    mat.albedoColor = Color3.FromHexString(hex);
    mat.metallic = metallic;
    mat.roughness = roughness;
    return this.trackMaterial(mat);
  }

  public createEmissiveMaterial(name: string, hex: string, intensity = 1.8): PBRMaterial {
    const mat = new PBRMaterial(name, this.scene);
    const col = Color3.FromHexString(hex);
    mat.albedoColor = col;
    mat.emissiveColor = col.scale(intensity);
    mat.metallic = 0.1;
    mat.roughness = 0.25;
    return this.trackMaterial(mat);
  }

  public createGridTextureMaterial(
    name: string,
    baseHex: string,
    lineHex: string,
    uScale: number,
    vScale: number,
    speckle = true,
    options?: { metallic?: number; roughness?: number; bumpStrength?: number }
  ): PBRMaterial {
    const tex = this.trackTexture(
      new DynamicTexture(`${name}_tex`, { width: 512, height: 512 }, this.scene, true)
    );
    const ctx = tex.getContext();
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 512, 512);

    if (speckle) {
      for (let i = 0; i < 4200; i++) {
        const shade = Math.random() > 0.5 ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.085)';
        ctx.fillStyle = shade;
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 2.5, 2.5);
      }
    }

    // Subtle mortar / panel joints + weathering streaks
    ctx.strokeStyle = lineHex;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 508, 508);
    ctx.strokeStyle = 'rgba(0,0,0,0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 256);
    ctx.lineTo(512, 256);
    ctx.moveTo(256, 0);
    ctx.lineTo(256, 512);
    ctx.stroke();

    tex.update();
    tex.uScale = uScale;
    tex.vScale = vScale;

    const bump = this.createNormalTexture(
      `${name}_nrm`,
      128,
      (u, v) => {
        const border =
          u < 0.025 || u > 0.975 || v < 0.025 || v > 0.975 || Math.abs(u - 0.5) < 0.014 || Math.abs(v - 0.5) < 0.014
            ? -0.45
            : 0;
        const grain = speckle ? fbmTileable(u, v, 8) * 0.45 : fbmTileable(u, v, 4) * 0.2;
        return border + grain;
      },
      options?.bumpStrength ?? 2.2,
      uScale,
      vScale
    );

    const mat = new PBRMaterial(name, this.scene);
    mat.albedoColor = Color3.White();
    mat.albedoTexture = tex;
    mat.bumpTexture = bump;
    mat.metallic = options?.metallic ?? 0.05;
    mat.roughness = options?.roughness ?? 0.82;
    return this.trackMaterial(mat);
  }

  public createCorrugatedMaterial(
    name: string,
    baseHex: string,
    ribHex: string,
    stencil?: string
  ): PBRMaterial {
    const tex = this.trackTexture(
      new DynamicTexture(`${name}_tex`, { width: 512, height: 256 }, this.scene, true)
    );
    const ctx = tex.getContext();
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 512, 256);

    for (let x = 0; x < 512; x += 24) {
      ctx.fillStyle = ribHex;
      ctx.fillRect(x, 0, 9, 256);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + 9, 0, 4, 256);
    }

    // Top/bottom container rails + weathered rust streaks
    ctx.fillStyle = 'rgba(12,15,20,0.45)';
    ctx.fillRect(0, 0, 512, 16);
    ctx.fillRect(0, 240, 512, 16);

    for (let i = 0; i < 32; i++) {
      const rx = hash2D(i, 4.1) * 500;
      const rw = 4 + hash2D(i, 8.7) * 14;
      const rh = 18 + hash2D(i, 2.9) * 55;
      ctx.fillStyle = 'rgba(92, 42, 22, 0.22)';
      ctx.fillRect(rx, 16, rw, rh);
    }

    if (stencil) {
      ctx.fillStyle = 'rgba(241,245,249,0.52)';
      ctx.font = 'bold 26px monospace';
      ctx.fillText(stencil, 26, 58);
    }

    tex.update();

    const bump = this.createNormalTexture(
      `${name}_nrm`,
      128,
      (u, v) => Math.sin(u * Math.PI * 2 * 21.3) * 0.5 + fbmTileable(u, v, 8) * 0.14,
      3.4,
      1,
      1
    );

    // Metallic-roughness map: painted corrugated steel with slightly shinier edges
    const mrData = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++) {
      const v = y / 64;
      for (let x = 0; x < 64; x++) {
        const u = x / 64;
        const rust = fbmTileable(u, v, 6) > 0.62 ? 1 : 0;
        const rough = rust ? 228 : 118;
        const metal = rust ? 40 : 155;
        const idx = (y * 64 + x) * 4;
        mrData[idx] = 255;
        mrData[idx + 1] = rough;
        mrData[idx + 2] = metal;
        mrData[idx + 3] = 255;
      }
    }
    const mrTex = this.trackTexture(
      new RawTexture(
        mrData,
        64,
        64,
        Engine.TEXTUREFORMAT_RGBA,
        this.scene,
        true,
        false,
        Texture.BILINEAR_SAMPLINGMODE,
        Engine.TEXTURETYPE_UNSIGNED_BYTE
      )
    );

    const mat = new PBRMaterial(name, this.scene);
    mat.albedoColor = Color3.White();
    mat.albedoTexture = tex;
    mat.bumpTexture = bump;
    mat.metallicTexture = mrTex;
    mat.useRoughnessFromMetallicTextureAlpha = false;
    mat.useRoughnessFromMetallicTextureGreen = true;
    mat.useMetallnessFromMetallicTextureBlue = true;
    mat.metallic = 1.0;
    mat.roughness = 1.0;
    return this.trackMaterial(mat);
  }

  public buildShippingContainer(
    name: string,
    pos: Vector3,
    size: Vector3,
    bodyMat: Material,
    trimMat: Material,
    doorsAlongZ = true
  ): void {
    this.createBox(name, pos, size, bodyMat);

    // Structural corner & roof frame beams for crisp 3D silhouette
    const beamT = 0.16;
    const halfX = size.x * 0.5;
    const halfY = size.y * 0.5;
    const halfZ = size.z * 0.5;

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        this.createBox(
          `${name}_post_${sx}_${sz}`,
          new Vector3(pos.x + sx * (halfX - beamT * 0.3), pos.y, pos.z + sz * (halfZ - beamT * 0.3)),
          new Vector3(beamT, size.y + 0.04, beamT),
          trimMat,
          { collisions: false, castShadow: false }
        );
      }
    }

    // End cargo door locking bars
    if (doorsAlongZ) {
      for (const sx of [-0.45, 0.45]) {
        this.createBox(
          `${name}_lockbar_${sx}`,
          new Vector3(pos.x + sx, pos.y, pos.z + halfZ + 0.04),
          new Vector3(0.08, size.y - 0.3, 0.08),
          trimMat,
          { collisions: false, castShadow: false }
        );
      }
    } else {
      for (const sz of [-0.45, 0.45]) {
        this.createBox(
          `${name}_lockbar_${sz}`,
          new Vector3(pos.x + halfX + 0.04, pos.y, pos.z + sz),
          new Vector3(0.08, size.y - 0.3, 0.08),
          trimMat,
          { collisions: false, castShadow: false }
        );
      }
    }
  }

  public buildJerseyBarrier(
    name: string,
    pos: Vector3,
    length: number,
    yawRad: number,
    mat: Material
  ): void {
    const cos = Math.cos(yawRad);
    const sin = Math.sin(yawRad);
    const rot = new Vector3(0, yawRad, 0);

    // Lower wide curb foot
    this.createBox(
      `${name}_foot`,
      new Vector3(pos.x, 0.16, pos.z),
      new Vector3(length, 0.32, 0.72),
      mat,
      { rot }
    );
    // Mid sloped core
    this.createBox(
      `${name}_mid`,
      new Vector3(pos.x, 0.55, pos.z),
      new Vector3(length, 0.48, 0.48),
      mat,
      { rot }
    );
    // Top narrow spine
    this.createBox(
      `${name}_top`,
      new Vector3(pos.x, 0.94, pos.z),
      new Vector3(length, 0.32, 0.26),
      mat,
      { rot }
    );
    // End lift lugs
    for (const dir of [-1, 1]) {
      const ox = (length * 0.44) * dir;
      this.createBox(
        `${name}_lug_${dir}`,
        new Vector3(pos.x + cos * ox, 1.12, pos.z - sin * ox),
        new Vector3(0.22, 0.08, 0.22),
        mat,
        { rot, collisions: false, castShadow: false }
      );
    }
  }

  public buildSandbagWall(
    name: string,
    pos: Vector3,
    length: number,
    yawRad: number,
    mat: Material
  ): void {
    const rot = new Vector3(0, yawRad, 0);
    // Clean solid collision core so projectiles & movement behave consistently
    this.createBox(
      `${name}_core`,
      new Vector3(pos.x, 0.52, pos.z),
      new Vector3(length, 1.04, 0.62),
      mat,
      { rot }
    );

    // Individual stacked rounded sandbag silhouettes along the wall
    const cos = Math.cos(yawRad);
    const sin = Math.sin(yawRad);
    const bagWidth = 0.78;
    const cols = Math.max(2, Math.floor(length / bagWidth));
    const step = length / cols;

    for (let row = 0; row < 3; row++) {
      const y = 0.2 + row * 0.32;
      const offset = row % 2 === 1 ? step * 0.35 : 0;
      const count = row % 2 === 1 ? cols - 1 : cols;
      for (let c = 0; c < count; c++) {
        const localX = -length * 0.5 + step * (c + 0.5) + offset;
        const bag = MeshBuilder.CreateBox(
          `${name}_bag_${row}_${c}`,
          { width: step * 0.92, height: 0.28, depth: 0.72 - row * 0.05 },
          this.scene
        );
        bag.position.set(pos.x + cos * localX, y, pos.z - sin * localX);
        bag.rotation.set((hash2D(row, c) - 0.5) * 0.05, yawRad, (hash2D(c, row) - 0.5) * 0.04);
        bag.material = mat;
        bag.checkCollisions = false;
        bag.isPickable = false;
        bag.receiveShadows = true;
        if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(bag);
        this.trackNode(bag);
      }
    }
  }

  public buildStreetLamp(
    name: string,
    pos: Vector3,
    armYawRad: number,
    poleMat: Material,
    glowMat: Material
  ): void {
    const sin = Math.sin(armYawRad);
    const cos = Math.cos(armYawRad);

    // Base plinth
    this.createBox(`${name}_base`, new Vector3(pos.x, 0.35, pos.z), new Vector3(0.45, 0.7, 0.45), poleMat);

    // Tapered column
    const pole = MeshBuilder.CreateCylinder(
      `${name}_pole`,
      { height: 5.8, diameterTop: 0.14, diameterBottom: 0.24, tessellation: 10 },
      this.scene
    );
    pole.position.set(pos.x, 3.2, pos.z);
    pole.material = poleMat;
    pole.checkCollisions = true;
    pole.receiveShadows = true;
    if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(pole);
    this.trackNode(pole);

    // Cantilever arm
    this.createBox(
      `${name}_arm`,
      new Vector3(pos.x + sin * 0.9, 6.05, pos.z + cos * 0.9),
      new Vector3(0.14, 0.14, 2.0),
      poleMat,
      { rot: new Vector3(-0.12, armYawRad, 0), collisions: false }
    );

    // Housing + glowing sodium lamp lens (caught by HDR Bloom)
    this.createBox(
      `${name}_head`,
      new Vector3(pos.x + sin * 1.75, 6.12, pos.z + cos * 1.75),
      new Vector3(0.42, 0.14, 0.62),
      poleMat,
      { rot: new Vector3(0, armYawRad, 0), collisions: false }
    );
    this.createBox(
      `${name}_bulb`,
      new Vector3(pos.x + sin * 1.75, 6.04, pos.z + cos * 1.75),
      new Vector3(0.3, 0.05, 0.44),
      glowMat,
      { rot: new Vector3(0, armYawRad, 0), collisions: false, castShadow: false }
    );
  }

  public buildCrateCluster(
    name: string,
    pos: Vector3,
    yawRad: number,
    crateMat: Material,
    trimMat: Material
  ): void {
    const rot = new Vector3(0, yawRad, 0);
    this.createBox(`${name}_c1`, new Vector3(pos.x, 0.65, pos.z), new Vector3(1.5, 1.3, 1.5), crateMat, { rot });
    this.createBox(`${name}_c1_rim`, new Vector3(pos.x, 1.31, pos.z), new Vector3(1.56, 0.08, 1.56), trimMat, {
      rot,
      collisions: false,
      castShadow: false,
    });
    this.createBox(
      `${name}_c2`,
      new Vector3(pos.x + 1.15, 0.48, pos.z + 0.45),
      new Vector3(0.95, 0.96, 0.95),
      crateMat,
      { rot: new Vector3(0, yawRad + 0.35, 0) }
    );
    this.createBox(
      `${name}_c3`,
      new Vector3(pos.x - 0.15, 1.65, pos.z + 0.1),
      new Vector3(0.75, 0.7, 0.75),
      trimMat,
      { rot: new Vector3(0, yawRad - 0.25, 0) }
    );
  }
}
