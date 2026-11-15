import { Color3, DynamicTexture, Material, MeshBuilder, PBRMaterial, Vector3 } from '@babylonjs/core';
import { MapBuildContext } from './mapHelpers';
import { MapDefinition } from './types';

export const FOREST_MAP_DEF: MapDefinition = {
  id: 'forest',
  name: 'Forest Outpost',
  tagline: 'Misty woodland perimeter featuring pine timberlines, granite rock cover, and tactical log cabins.',
  environmentLabel: 'Timberland Recon',
  engagementRange: 'Medium – Dynamic',
  skyHex: '#638079',
  skyZenithHex: '#355c73',
  skyHorizonHex: '#8ba89d',
  fogHex: '#506b63',
  fogDensity: 0.011,
  sunDirection: new Vector3(-0.5, -0.76, -0.4),
  sunPosition: new Vector3(28, 36, 22),
  sunColorHex: '#f5f0c8',
  sunIntensity: 1.65,
  ambientIntensity: 0.75,
  ambientGroundHex: '#233321',
  accentHex: '#10b981',
  blueSpawns: [
    new Vector3(-21, 1.0, -21),
    new Vector3(-11, 1.0, -23),
    new Vector3(0, 1.0, -23),
    new Vector3(11, 1.0, -23),
    new Vector3(21, 1.0, -21),
  ],
  redSpawns: [
    new Vector3(-21, 1.0, 21),
    new Vector3(-11, 1.0, 23),
    new Vector3(0, 1.0, 23),
    new Vector3(11, 1.0, 23),
    new Vector3(21, 1.0, 21),
  ],
  waypoints: [
    new Vector3(-18, 0.2, -16),
    new Vector3(0, 0.2, -17),
    new Vector3(18, 0.2, -16),
    new Vector3(-21, 0.2, -5),
    new Vector3(-8, 0.2, -8),
    new Vector3(8, 0.2, -8),
    new Vector3(21, 0.2, -5),
    new Vector3(-13, 0.2, 0),
    new Vector3(0, 0.2, 0),
    new Vector3(13, 0.2, 0),
    new Vector3(-21, 0.2, 5),
    new Vector3(-8, 0.2, 8),
    new Vector3(8, 0.2, 8),
    new Vector3(21, 0.2, 5),
    new Vector3(-18, 0.2, 16),
    new Vector3(0, 0.2, 17),
    new Vector3(18, 0.2, 16),
  ],
  previewCameraTarget: new Vector3(0, 2.0, 0),
};

export function buildForestMap(ctx: MapBuildContext): void {
  const groundTex = ctx.trackTexture(
    new DynamicTexture('forestGroundTex', { width: 512, height: 512 }, ctx.scene, true)
  );
  const gctx = groundTex.getContext();
  gctx.fillStyle = '#33442e';
  gctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 7000; i++) {
    const roll = Math.random();
    gctx.fillStyle =
      roll > 0.65
        ? 'rgba(84, 114, 64, 0.38)'
        : roll > 0.3
          ? 'rgba(62, 49, 34, 0.32)'
          : 'rgba(20, 32, 22, 0.32)';
    gctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
  }
  groundTex.update();
  groundTex.uScale = 12;
  groundTex.vScale = 12;

  const groundBump = ctx.createNormalTexture(
    'forestGroundNrm',
    128,
    (u, v) => Math.sin(u * 26) * Math.cos(v * 26) * 0.22 + Math.sin((u + v) * 52) * 0.12,
    2.2,
    12,
    12
  );

  const groundMat = ctx.trackMaterial(new PBRMaterial('forestGroundMat', ctx.scene));
  groundMat.albedoColor = Color3.White();
  groundMat.albedoTexture = groundTex;
  groundMat.bumpTexture = groundBump;
  groundMat.metallic = 0.0;
  groundMat.roughness = 0.92;

  const barkMat = ctx.createGridTextureMaterial('forestBark', '#533b29', '#322216', 2, 4, true, {
    metallic: 0.0,
    roughness: 0.92,
    bumpStrength: 3.0,
  });
  const pineMat = ctx.createGridTextureMaterial('forestPine', '#254a32', '#173120', 3, 3, true, {
    metallic: 0.0,
    roughness: 0.86,
  });
  const rockMat = ctx.createGridTextureMaterial('forestRock', '#60676b', '#3e4448', 2, 2, true, {
    metallic: 0.04,
    roughness: 0.84,
    bumpStrength: 2.8,
  });
  const cabinWoodMat = ctx.createGridTextureMaterial('forestCabinWood', '#755336', '#4a321e', 3, 2, true, {
    metallic: 0.02,
    roughness: 0.8,
  });
  const roofMat = ctx.createFlatMaterial('forestRoof', '#2a322d', 0.14, 0.74);
  const perimeterMat = ctx.createGridTextureMaterial('forestFence', '#46392b', '#2b2219', 4, 2, true, {
    metallic: 0.02,
    roughness: 0.88,
  });
  const lanternGlow = ctx.createEmissiveMaterial('forestLanternGlow', '#ffbb55', 2.2);

  // Woodland Ground + Timber Stockade Perimeter
  ctx.createBox('forest_ground', new Vector3(0, -0.2, 0), new Vector3(60, 0.4, 60), groundMat, {
    castShadow: false,
  });
  ctx.createPerimeterWalls(29, 4.5, perimeterMat);

  // Two Tactical Wooden Cabins with pitched gable roofs & warm entrance lanterns
  buildWoodenCabin(ctx, 'cabin_w', new Vector3(-13.5, 0, 0), cabinWoodMat, roofMat, lanternGlow);
  buildWoodenCabin(ctx, 'cabin_e', new Vector3(13.5, 0, 0), cabinWoodMat, roofMat, lanternGlow);

  // Center Granite Rock Outcrop & Sniper Cover Boulders
  buildRockCluster(ctx, 'rock_center', new Vector3(0, 0, 0), rockMat, 1.25);
  buildRockCluster(ctx, 'rock_nw', new Vector3(-7.5, 0, 12.5), rockMat, 1.0);
  buildRockCluster(ctx, 'rock_se', new Vector3(7.5, 0, -12.5), rockMat, 1.0);
  buildRockCluster(ctx, 'rock_ne', new Vector3(16.5, 0, 12.0), rockMat, 0.9);
  buildRockCluster(ctx, 'rock_sw', new Vector3(-16.5, 0, -12.0), rockMat, 0.9);

  // Fallen Timber & Cylindrical Log Cover along mid lanes
  buildFallenLog(ctx, 'log_s1', new Vector3(-4.5, 0.45, -13.5), 3.8, Math.PI * 0.5, barkMat);
  buildFallenLog(ctx, 'log_n1', new Vector3(4.5, 0.45, 13.5), 3.8, Math.PI * 0.5, barkMat);
  buildFallenLog(ctx, 'log_c1', new Vector3(-5.5, 0.45, 5.2), 3.6, 0, barkMat);
  buildFallenLog(ctx, 'log_c2', new Vector3(5.5, 0.45, -5.2), 3.6, 0, barkMat);

  // Pine Tree Clusters positioned away from spawn points and main waypoints
  const treeCoords: Array<[number, number, number]> = [
    [-24, -12, 1.15],
    [-23, 12, 1.0],
    [-16, -19, 1.2],
    [-16, 19, 1.1],
    [-5, -18.5, 0.95],
    [5, 18.5, 1.05],
    [16, -19, 1.1],
    [16, 19, 1.2],
    [24, -12, 1.05],
    [23, 12, 1.15],
    [-25, 0, 1.25],
    [25, 0, 1.25],
    [-6.5, -5.0, 0.9],
    [6.5, 5.0, 0.9],
  ];

  treeCoords.forEach(([x, z, scale], idx) => {
    buildPineTree(ctx, `pine_${idx}`, new Vector3(x, 0, z), scale, barkMat, pineMat);
  });
}

function buildFallenLog(
  ctx: MapBuildContext,
  name: string,
  pos: Vector3,
  length: number,
  yawRad: number,
  barkMat: Material
): void {
  const log = MeshBuilder.CreateCylinder(
    name,
    { height: length, diameter: 0.92, tessellation: 12 },
    ctx.scene
  );
  log.position.copyFrom(pos);
  log.rotation.set(Math.PI * 0.5, yawRad, 0);
  log.material = barkMat;
  log.checkCollisions = true;
  log.receiveShadows = true;
  if (ctx.shadowGenerator) ctx.shadowGenerator.addShadowCaster(log);
  ctx.trackNode(log);
}

function buildPineTree(
  ctx: MapBuildContext,
  name: string,
  origin: Vector3,
  scale: number,
  barkMat: Material,
  pineMat: Material
): void {
  const trunkH = 3.5 * scale;
  const trunk = MeshBuilder.CreateCylinder(
    `${name}_trunk`,
    { height: trunkH, diameterTop: 0.42 * scale, diameterBottom: 0.68 * scale, tessellation: 10 },
    ctx.scene
  );
  trunk.position.set(origin.x, trunkH * 0.5, origin.z);
  trunk.material = barkMat;
  trunk.checkCollisions = true;
  trunk.receiveShadows = true;
  if (ctx.shadowGenerator) ctx.shadowGenerator.addShadowCaster(trunk);
  ctx.trackNode(trunk);

  // 4 staggered rotated foliage cones for denser evergreen silhouettes
  const tiers = [
    { y: 2.6 * scale, d: 3.3 * scale, h: 2.2 * scale, rot: 0.2 },
    { y: 3.7 * scale, d: 2.7 * scale, h: 2.0 * scale, rot: 0.85 },
    { y: 4.7 * scale, d: 2.1 * scale, h: 1.8 * scale, rot: 1.45 },
    { y: 5.6 * scale, d: 1.3 * scale, h: 1.5 * scale, rot: 2.1 },
  ];

  tiers.forEach((t, i) => {
    const cone = MeshBuilder.CreateCylinder(
      `${name}_foliage_${i}`,
      { height: t.h, diameterTop: 0.08, diameterBottom: t.d, tessellation: 8 },
      ctx.scene
    );
    cone.position.set(origin.x, t.y, origin.z);
    cone.rotation.y = t.rot;
    cone.material = pineMat;
    cone.checkCollisions = false;
    cone.receiveShadows = true;
    if (ctx.shadowGenerator) ctx.shadowGenerator.addShadowCaster(cone);
    ctx.trackNode(cone);
  });
}

function buildRockCluster(
  ctx: MapBuildContext,
  name: string,
  origin: Vector3,
  mat: Material,
  scale: number
): void {
  ctx.createBox(
    `${name}_main`,
    new Vector3(origin.x, 0.9 * scale, origin.z),
    new Vector3(2.8 * scale, 1.8 * scale, 2.4 * scale),
    mat,
    { rot: new Vector3(0.08, 0.35, -0.05) }
  );
  ctx.createBox(
    `${name}_side`,
    new Vector3(origin.x + 1.4 * scale, 0.6 * scale, origin.z - 0.8 * scale),
    new Vector3(1.8 * scale, 1.2 * scale, 1.7 * scale),
    mat,
    { rot: new Vector3(-0.06, -0.4, 0.08) }
  );
  ctx.createBox(
    `${name}_cap`,
    new Vector3(origin.x - 0.6 * scale, 1.35 * scale, origin.z + 0.5 * scale),
    new Vector3(1.4 * scale, 0.9 * scale, 1.3 * scale),
    mat,
    { rot: new Vector3(0.14, -0.2, 0.12), collisions: false }
  );
}

function buildWoodenCabin(
  ctx: MapBuildContext,
  prefix: string,
  origin: Vector3,
  woodMat: Material,
  roofMat: Material,
  lanternMat: Material
): void {
  const w = 5.4;
  const d = 6.8;
  const h = 2.9;

  ctx.createBox(`${prefix}_roof`, new Vector3(origin.x, h + 0.15, origin.z), new Vector3(w + 0.7, 0.28, d + 0.7), roofMat);
  ctx.createBox(`${prefix}_ridge`, new Vector3(origin.x, h + 0.55, origin.z), new Vector3(w * 0.55, 0.52, d + 0.5), roofMat, {
    collisions: false,
  });
  ctx.createBox(`${prefix}_wall_w`, new Vector3(origin.x - w / 2 + 0.15, h / 2, origin.z), new Vector3(0.3, h, d), woodMat);
  ctx.createBox(`${prefix}_wall_e`, new Vector3(origin.x + w / 2 - 0.15, h / 2, origin.z), new Vector3(0.3, h, d), woodMat);

  ctx.createBox(`${prefix}_n_l`, new Vector3(origin.x - 1.7, h / 2, origin.z + d / 2 - 0.15), new Vector3(2.0, h, 0.3), woodMat);
  ctx.createBox(`${prefix}_n_r`, new Vector3(origin.x + 1.7, h / 2, origin.z + d / 2 - 0.15), new Vector3(2.0, h, 0.3), woodMat);
  ctx.createBox(`${prefix}_s_l`, new Vector3(origin.x - 1.7, h / 2, origin.z - d / 2 + 0.15), new Vector3(2.0, h, 0.3), woodMat);
  ctx.createBox(`${prefix}_s_r`, new Vector3(origin.x + 1.7, h / 2, origin.z - d / 2 + 0.15), new Vector3(2.0, h, 0.3), woodMat);

  // Warm entrance lanterns beside doorways
  ctx.createBox(`${prefix}_lan_n`, new Vector3(origin.x + 1.0, 2.25, origin.z + d / 2 + 0.08), new Vector3(0.18, 0.24, 0.18), lanternMat, {
    collisions: false,
    castShadow: false,
  });
  ctx.createBox(`${prefix}_lan_s`, new Vector3(origin.x - 1.0, 2.25, origin.z - d / 2 - 0.08), new Vector3(0.18, 0.24, 0.18), lanternMat, {
    collisions: false,
    castShadow: false,
  });
}
