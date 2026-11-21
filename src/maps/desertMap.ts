import { Material, Vector3 } from '@babylonjs/core';
import { MapBuildContext } from './mapHelpers';
import { MapDefinition } from './types';

export const DESERT_MAP_DEF: MapDefinition = {
  id: 'desert',
  name: 'Desert Base',
  tagline: 'Arid forward operating base with concrete bunkers, shipping containers, and guard towers.',
  environmentLabel: 'Arid Outpost',
  engagementRange: 'Medium – Long',
  skyHex: '#c88c56',
  skyZenithHex: '#355c87',
  skyHorizonHex: '#e6aa6c',
  fogHex: '#b98657',
  fogDensity: 0.005,
  sunDirection: new Vector3(-0.62, -0.58, -0.52),
  sunPosition: new Vector3(34, 30, 28),
  sunColorHex: '#ffd194',
  sunIntensity: 2.05,
  ambientIntensity: 0.6,
  ambientGroundHex: '#5e4832',
  accentHex: '#f59e0b',
  exposure: 1.08,
  contrast: 1.22,
  blueSpawns: [
    new Vector3(-22, 1.0, -21),
    new Vector3(-12, 1.0, -23),
    new Vector3(0, 1.0, -23),
    new Vector3(12, 1.0, -23),
    new Vector3(22, 1.0, -20),
  ],
  redSpawns: [
    new Vector3(-22, 1.0, 21),
    new Vector3(-12, 1.0, 23),
    new Vector3(0, 1.0, 23),
    new Vector3(12, 1.0, 23),
    new Vector3(22, 1.0, 20),
  ],
  waypoints: [
    new Vector3(-18, 0.2, -16),
    new Vector3(0, 0.2, -17),
    new Vector3(18, 0.2, -16),
    new Vector3(-20, 0.2, -4),
    new Vector3(-8, 0.2, -7),
    new Vector3(8, 0.2, -7),
    new Vector3(20, 0.2, -4),
    new Vector3(-11, 0.2, 0),
    new Vector3(0, 0.2, 0),
    new Vector3(11, 0.2, 0),
    new Vector3(-20, 0.2, 5),
    new Vector3(-8, 0.2, 7),
    new Vector3(8, 0.2, 7),
    new Vector3(20, 0.2, 5),
    new Vector3(-18, 0.2, 16),
    new Vector3(0, 0.2, 17),
    new Vector3(18, 0.2, 16),
    new Vector3(-20, 3.0, -10),
    new Vector3(20, 3.0, 10),
  ],
  previewCameraTarget: new Vector3(0, 2.0, 0),
};

export function buildDesertMap(ctx: MapBuildContext): void {
  const sandMat = ctx.createProceduralMaterial('desertSandMat', 'sandstone', {
    size: 256,
    baseHex: '#ba986c',
    accentHex: '#8d6c45',
    uScale: 12,
    vScale: 12,
    bumpLevel: 0.95,
  });
  const bunkerMat = ctx.createProceduralMaterial('desertBunker', 'concrete', {
    size: 128,
    baseHex: '#938470',
    accentHex: '#635647',
    uScale: 3,
    vScale: 2,
    bumpLevel: 0.9,
  });
  const sandbagMat = ctx.createProceduralMaterial('desertSandbag', 'tacticalFabric', {
    size: 128,
    baseHex: '#9e8968',
    accentHex: '#736045',
    uScale: 2,
    vScale: 2,
    bumpLevel: 0.85,
  });
  const woodMat = ctx.createProceduralMaterial('desertWood', 'crate', {
    size: 128,
    baseHex: '#785a3d',
    accentHex: '#4b3622',
    uScale: 2,
    vScale: 2,
  });
  const trimSteel = ctx.createProceduralMaterial('desertSteelTrim', 'brushedMetal', {
    size: 64,
    baseHex: '#353c44',
    accentHex: '#1f242a',
    metallicOverride: 0.8,
  });
  const solarPanelMat = ctx.createFlatMaterial('desertSolarMat', '#162844', 0.35, 0.14);
  solarPanelMat.clearCoat.isEnabled = true;
  solarPanelMat.clearCoat.intensity = 0.9;
  solarPanelMat.clearCoat.roughness = 0.06;

  const contTan = ctx.createCorrugatedMaterial('desertContTan', '#8a795d', '#695b45', 'FOB-01');
  const contOlive = ctx.createCorrugatedMaterial('desertContOlive', '#49543d', '#343d2b', 'OPS-04');
  const contRust = ctx.createCorrugatedMaterial('desertContRust', '#7a4033', '#562a20', 'AMMO-9');
  const drumFuelMat = ctx.createProceduralMaterial('desertFuelDrum', 'anodizedMetal', {
    size: 64,
    baseHex: '#7c4e29',
    accentHex: '#4c2e16',
    metallicOverride: 0.62,
  });
  const beaconGlow = ctx.createEmissiveMaterial('desertBeacon', '#f59e0b', 2.2);
  const bunkerSconceGlow = ctx.createEmissiveMaterial('desertBunkerSconce', '#ffd089', 1.7);

  // Ground + Compound Perimeter Walls
  ctx.createBox('desert_ground', new Vector3(0, -0.2, 0), new Vector3(60, 0.4, 60), sandMat, {
    castShadow: false,
  });
  ctx.createPerimeterWalls(29, 5.5, bunkerMat);

  // Central Concrete Command Bunker (walk-through with sandbagged firing ports & roof antenna)
  ctx.createBox('bunker_roof', new Vector3(0, 2.8, 0), new Vector3(7.2, 0.35, 7.2), bunkerMat);
  ctx.createBox('bunker_nw', new Vector3(-2.6, 1.3, 2.6), new Vector3(2.0, 2.6, 2.0), bunkerMat);
  ctx.createBox('bunker_ne', new Vector3(2.6, 1.3, 2.6), new Vector3(2.0, 2.6, 2.0), bunkerMat);
  ctx.createBox('bunker_sw', new Vector3(-2.6, 1.3, -2.6), new Vector3(2.0, 2.6, 2.0), bunkerMat);
  ctx.createBox('bunker_se', new Vector3(2.6, 1.3, -2.6), new Vector3(2.0, 2.6, 2.0), bunkerMat);
  ctx.createBox('bunker_lip_e', new Vector3(3.3, 0.55, 0), new Vector3(0.45, 1.1, 3.2), sandbagMat);
  ctx.createBox('bunker_lip_w', new Vector3(-3.3, 0.55, 0), new Vector3(0.45, 1.1, 3.2), sandbagMat);
  ctx.createBox('bunker_trim_top', new Vector3(0, 3.02, 0), new Vector3(7.45, 0.14, 7.45), trimSteel, {
    collisions: false,
    pickable: false,
  });
  ctx.createBox('bunker_mast', new Vector3(2.4, 4.1, 2.4), new Vector3(0.14, 2.4, 0.14), trimSteel, {
    collisions: false,
    pickable: false,
  });
  ctx.createBox('bunker_dish', new Vector3(2.4, 4.75, 2.25), new Vector3(0.95, 0.72, 0.16), trimSteel, {
    collisions: false,
    pickable: false,
    rot: new Vector3(-0.38, 0.4, 0),
  });
  ctx.createBox('bunker_beacon', new Vector3(2.4, 5.35, 2.4), new Vector3(0.24, 0.22, 0.24), beaconGlow, {
    collisions: false,
    castShadow: false,
    pickable: false,
  });

  // Rooftop tactical solar array, conduit run & interior warm bunker sconce accents
  for (const sx of [-2.1, -0.4]) {
    ctx.createBox(`bunker_solar_${sx}`, new Vector3(sx, 3.24, -1.6), new Vector3(1.4, 0.08, 1.9), solarPanelMat, {
      collisions: false,
      pickable: false,
      rot: new Vector3(0.26, 0, 0),
    });
    ctx.createBox(`bunker_solar_mount_${sx}`, new Vector3(sx, 3.12, -1.6), new Vector3(0.32, 0.22, 0.45), trimSteel, {
      collisions: false,
      pickable: false,
    });
  }
  ctx.buildPipeRun('bunker_conduit', new Vector3(-2.1, 3.08, -0.6), new Vector3(2.4, 3.08, 2.3), 0.1, trimSteel, beaconGlow);
  ctx.createBox('bunker_sconce_n', new Vector3(0, 2.52, 1.65), new Vector3(1.1, 0.08, 0.14), bunkerSconceGlow, {
    collisions: false,
    castShadow: false,
    pickable: false,
  });
  ctx.createBox('bunker_sconce_s', new Vector3(0, 2.52, -1.65), new Vector3(1.1, 0.08, 0.14), bunkerSconceGlow, {
    collisions: false,
    castShadow: false,
    pickable: false,
  });

  // Detailed Corrugated Shipping Containers with structural frame rails & locking bars
  ctx.buildShippingContainer('d_cont_1', new Vector3(-13.5, 1.5, -9.5), new Vector3(3.2, 3.0, 7.6), contOlive, trimSteel, true);
  ctx.buildShippingContainer('d_cont_2', new Vector3(13.5, 1.5, 9.5), new Vector3(3.2, 3.0, 7.6), contTan, trimSteel, true);
  ctx.buildShippingContainer('d_cont_3', new Vector3(-13.5, 1.5, 10.5), new Vector3(7.2, 3.0, 3.2), contRust, trimSteel, false);
  ctx.buildShippingContainer('d_cont_4', new Vector3(13.5, 1.5, -10.5), new Vector3(7.2, 3.0, 3.2), contOlive, trimSteel, false);

  // Fuel drum clusters beside FOB containers (purely visual, non-colliding, non-pickable)
  ctx.buildBarrelCluster('d_drums_sw', new Vector3(-11.2, 0, -5.0), drumFuelMat, trimSteel);
  ctx.buildBarrelCluster('d_drums_ne', new Vector3(11.2, 0, 5.0), drumFuelMat, trimSteel);

  // Guard Towers (West-South & East-North) with walkable ramps
  buildGuardTower(ctx, 'tower_sw', new Vector3(-20, 0, -10), 0, woodMat, bunkerMat, trimSteel);
  buildGuardTower(ctx, 'tower_ne', new Vector3(20, 0, 10), Math.PI, woodMat, bunkerMat, trimSteel);

  // Realistic Stacked Sandbag Defensive Positions & Supply Crate Clusters
  ctx.buildSandbagWall('sb_s1', new Vector3(-5.5, 0, -15.5), 4.2, 0, sandbagMat);
  ctx.buildSandbagWall('sb_s2', new Vector3(6.5, 0, -15.5), 4.2, 0, sandbagMat);
  ctx.buildSandbagWall('sb_n1', new Vector3(-6.5, 0, 15.5), 4.2, 0, sandbagMat);
  ctx.buildSandbagWall('sb_n2', new Vector3(5.5, 0, 15.5), 4.2, 0, sandbagMat);

  ctx.buildCrateCluster('crate_d1', new Vector3(-6.8, 0, 0), 0.15, woodMat, trimSteel);
  ctx.buildCrateCluster('crate_d2', new Vector3(6.8, 0, 0), -0.25, woodMat, trimSteel);
}

function buildGuardTower(
  ctx: MapBuildContext,
  prefix: string,
  origin: Vector3,
  rampYaw: number,
  woodMat: Material,
  concreteMat: Material,
  steelMat: Material
): void {
  const h = 2.8;
  ctx.createBox(`${prefix}_p1`, new Vector3(origin.x - 1.6, h / 2, origin.z - 1.6), new Vector3(0.32, h, 0.32), woodMat);
  ctx.createBox(`${prefix}_p2`, new Vector3(origin.x + 1.6, h / 2, origin.z - 1.6), new Vector3(0.32, h, 0.32), woodMat);
  ctx.createBox(`${prefix}_p3`, new Vector3(origin.x - 1.6, h / 2, origin.z + 1.6), new Vector3(0.32, h, 0.32), woodMat);
  ctx.createBox(`${prefix}_p4`, new Vector3(origin.x + 1.6, h / 2, origin.z + 1.6), new Vector3(0.32, h, 0.32), woodMat);

  ctx.createBox(`${prefix}_deck`, new Vector3(origin.x, h, origin.z), new Vector3(3.8, 0.25, 3.8), concreteMat);
  ctx.createBox(`${prefix}_wall_e`, new Vector3(origin.x + 1.75, h + 0.55, origin.z), new Vector3(0.25, 0.9, 3.6), woodMat);
  ctx.createBox(`${prefix}_wall_w`, new Vector3(origin.x - 1.75, h + 0.55, origin.z), new Vector3(0.25, 0.9, 3.6), woodMat);

  // Canopy roof & steel fascia trim over guard tower
  ctx.createBox(`${prefix}_c_p1`, new Vector3(origin.x - 1.6, h + 1.4, origin.z - 1.6), new Vector3(0.18, 2.4, 0.18), woodMat, {
    collisions: false,
    pickable: false,
  });
  ctx.createBox(`${prefix}_c_p2`, new Vector3(origin.x + 1.6, h + 1.4, origin.z - 1.6), new Vector3(0.18, 2.4, 0.18), woodMat, {
    collisions: false,
    pickable: false,
  });
  ctx.createBox(`${prefix}_c_p3`, new Vector3(origin.x - 1.6, h + 1.4, origin.z + 1.6), new Vector3(0.18, 2.4, 0.18), woodMat, {
    collisions: false,
    pickable: false,
  });
  ctx.createBox(`${prefix}_c_p4`, new Vector3(origin.x + 1.6, h + 1.4, origin.z + 1.6), new Vector3(0.18, 2.4, 0.18), woodMat, {
    collisions: false,
    pickable: false,
  });
  ctx.createBox(`${prefix}_canopy`, new Vector3(origin.x, h + 2.6, origin.z), new Vector3(4.1, 0.16, 4.1), woodMat, {
    collisions: false,
    pickable: false,
  });
  ctx.createBox(`${prefix}_canopy_trim`, new Vector3(origin.x, h + 2.68, origin.z), new Vector3(4.22, 0.06, 4.22), steelMat, {
    collisions: false,
    castShadow: false,
    pickable: false,
  });

  const dirZ = Math.cos(rampYaw);
  const rampStart = new Vector3(origin.x, 0, origin.z - dirZ * 6.8);
  ctx.createRamp(`${prefix}_ramp`, rampStart, 2.2, h, 5.0, rampYaw, woodMat);
}
