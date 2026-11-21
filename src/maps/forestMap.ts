import { Material, MeshBuilder, Vector3 } from '@babylonjs/core';
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
  fogDensity: 0.0076,
  sunDirection: new Vector3(-0.5, -0.76, -0.4),
  sunPosition: new Vector3(28, 36, 22),
  sunColorHex: '#f5f0c8',
  sunIntensity: 1.78,
  ambientIntensity: 0.58,
  ambientGroundHex: '#233321',
  accentHex: '#10b981',
  exposure: 1.1,
  contrast: 1.18,
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
  const groundMat = ctx.createProceduralMaterial('forestGroundMat', 'meadow', {
    size: 256,
    baseHex: '#374a30',
    accentHex: '#23301d',
    uScale: 12,
    vScale: 12,
    bumpLevel: 0.95,
  });
  const barkMat = ctx.createProceduralMaterial('forestBark', 'bark', {
    size: 128,
    baseHex: '#563c28',
    accentHex: '#2d1e13',
    uScale: 2,
    vScale: 4,
    bumpLevel: 1.05,
  });
  const pineMat = ctx.createProceduralMaterial('forestPine', 'meadow', {
    size: 128,
    baseHex: '#264d34',
    accentHex: '#152e1e',
    uScale: 3,
    vScale: 3,
    bumpLevel: 0.85,
  });
  const rockMat = ctx.createProceduralMaterial('forestRock', 'rock', {
    size: 128,
    baseHex: '#62696d',
    accentHex: '#3d4347',
    uScale: 2,
    vScale: 2,
    bumpLevel: 1.0,
  });
  const cabinWoodMat = ctx.createProceduralMaterial('forestCabinWood', 'timber', {
    size: 128,
    baseHex: '#775537',
    accentHex: '#4a321e',
    uScale: 3,
    vScale: 2,
    bumpLevel: 0.9,
  });
  const roofMat = ctx.createProceduralMaterial('forestRoof', 'anodizedMetal', {
    size: 128,
    baseHex: '#2d3731',
    accentHex: '#1b221e',
    metallicOverride: 0.48,
    uScale: 3,
    vScale: 3,
  });
  const perimeterMat = ctx.createProceduralMaterial('forestFence', 'timber', {
    size: 128,
    baseHex: '#483a2c',
    accentHex: '#2a2017',
    uScale: 4,
    vScale: 2,
  });
  const crateSupplyMat = ctx.createProceduralMaterial('forestCrate', 'crate', {
    size: 128,
    baseHex: '#634f35',
    accentHex: '#3c2e1c',
    uScale: 2,
    vScale: 2,
  });
  const lanternGlow = ctx.createEmissiveMaterial('forestLanternGlow', '#ffbb55', 2.2);

  // Woodland Ground + Timber Stockade Perimeter
  ctx.createBox('forest_ground', new Vector3(0, -0.2, 0), new Vector3(60, 0.4, 60), groundMat, {
    castShadow: false,
  });
  ctx.createPerimeterWalls(29, 4.5, perimeterMat);

  // Two Tactical Wooden Cabins with pitched gable roofs, stone chimneys, porch steps & entrance lanterns
  buildWoodenCabin(ctx, 'cabin_w', new Vector3(-13.5, 0, 0), cabinWoodMat, roofMat, rockMat, lanternGlow);
  buildWoodenCabin(ctx, 'cabin_e', new Vector3(13.5, 0, 0), cabinWoodMat, roofMat, rockMat, lanternGlow);

  // Supply barrels & crates beside cabins (purely visual non-colliding barrels / standard crate clusters)
  ctx.buildBarrelCluster('forest_drums_w', new Vector3(-16.8, 0, 4.2), roofMat, cabinWoodMat);
  ctx.buildBarrelCluster('forest_drums_e', new Vector3(16.8, 0, -4.2), roofMat, cabinWoodMat);
  ctx.createBox('forest_woodpile_w', new Vector3(-16.6, 0.25, -4.1), new Vector3(1.1, 0.5, 0.9), crateSupplyMat, {
    collisions: false,
    pickable: false,
  });
  ctx.createBox('forest_woodpile_e', new Vector3(16.6, 0.25, 4.1), new Vector3(1.1, 0.5, 0.9), crateSupplyMat, {
    collisions: false,
    pickable: false,
  });

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
    cone.isPickable = false;
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
    { rot: new Vector3(0.14, -0.2, 0.12), collisions: false, pickable: false }
  );
}

function buildWoodenCabin(
  ctx: MapBuildContext,
  prefix: string,
  origin: Vector3,
  woodMat: Material,
  roofMat: Material,
  rockMat: Material,
  lanternMat: Material
): void {
  const w = 5.4;
  const d = 6.8;
  const h = 2.9;

  ctx.createBox(`${prefix}_roof`, new Vector3(origin.x, h + 0.15, origin.z), new Vector3(w + 0.7, 0.28, d + 0.7), roofMat);
  ctx.createBox(`${prefix}_ridge`, new Vector3(origin.x, h + 0.55, origin.z), new Vector3(w * 0.55, 0.52, d + 0.5), roofMat, {
    collisions: false,
    pickable: false,
  });
  ctx.createBox(`${prefix}_wall_w`, new Vector3(origin.x - w / 2 + 0.15, h / 2, origin.z), new Vector3(0.3, h, d), woodMat);
  ctx.createBox(`${prefix}_wall_e`, new Vector3(origin.x + w / 2 - 0.15, h / 2, origin.z), new Vector3(0.3, h, d), woodMat);

  ctx.createBox(`${prefix}_n_l`, new Vector3(origin.x - 1.7, h / 2, origin.z + d / 2 - 0.15), new Vector3(2.0, h, 0.3), woodMat);
  ctx.createBox(`${prefix}_n_r`, new Vector3(origin.x + 1.7, h / 2, origin.z + d / 2 - 0.15), new Vector3(2.0, h, 0.3), woodMat);
  ctx.createBox(`${prefix}_s_l`, new Vector3(origin.x - 1.7, h / 2, origin.z - d / 2 + 0.15), new Vector3(2.0, h, 0.3), woodMat);
  ctx.createBox(`${prefix}_s_r`, new Vector3(origin.x + 1.7, h / 2, origin.z - d / 2 + 0.15), new Vector3(2.0, h, 0.3), woodMat);

  // Stone chimney, window shutters & timber porch lintels (non-colliding, non-pickable)
  ctx.createBox(`${prefix}_chimney`, new Vector3(origin.x + 1.65, h + 1.05, origin.z - 1.4), new Vector3(0.68, 1.5, 0.68), rockMat, {
    collisions: false,
    pickable: false,
  });
  ctx.createBox(`${prefix}_chimney_cap`, new Vector3(origin.x + 1.65, h + 1.84, origin.z - 1.4), new Vector3(0.82, 0.12, 0.82), roofMat, {
    collisions: false,
    pickable: false,
  });
  for (const dz of [-1.4, 1.4]) {
    ctx.createBox(`${prefix}_shutter_w_${dz}`, new Vector3(origin.x - w / 2 - 0.04, 1.65, origin.z + dz), new Vector3(0.1, 0.9, 1.1), roofMat, {
      collisions: false,
      pickable: false,
    });
    ctx.createBox(`${prefix}_shutter_e_${dz}`, new Vector3(origin.x + w / 2 + 0.04, 1.65, origin.z + dz), new Vector3(0.1, 0.9, 1.1), roofMat, {
      collisions: false,
      pickable: false,
    });
  }

  // Warm entrance lanterns beside doorways
  ctx.createBox(`${prefix}_lan_n`, new Vector3(origin.x + 1.0, 2.25, origin.z + d / 2 + 0.08), new Vector3(0.18, 0.24, 0.18), lanternMat, {
    collisions: false,
    castShadow: false,
    pickable: false,
  });
  ctx.createBox(`${prefix}_lan_s`, new Vector3(origin.x - 1.0, 2.25, origin.z - d / 2 - 0.08), new Vector3(0.18, 0.24, 0.18), lanternMat, {
    collisions: false,
    castShadow: false,
    pickable: false,
  });
}
