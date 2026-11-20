import { Color3, DynamicTexture, Material, PBRMaterial, Vector3 } from '@babylonjs/core';
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
  const sandTex = ctx.trackTexture(
    new DynamicTexture('desertSandTex', { width: 512, height: 512 }, ctx.scene, true)
  );
  const dctx = sandTex.getContext();
  dctx.fillStyle = '#b4956b';
  dctx.fillRect(0, 0, 512, 512);
  // Subtle wind-swept sand ripple bands
  for (let y = 0; y < 512; y += 16) {
    dctx.fillStyle = 'rgba(255, 236, 200, 0.08)';
    dctx.fillRect(0, y, 512, 6);
    dctx.fillStyle = 'rgba(90, 62, 34, 0.06)';
    dctx.fillRect(0, y + 7, 512, 5);
  }
  for (let i = 0; i < 6500; i++) {
    dctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,244,218,0.08)' : 'rgba(72,48,26,0.08)';
    dctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 2);
  }
  sandTex.update();
  sandTex.uScale = 12;
  sandTex.vScale = 12;

  const sandBump = ctx.createNormalTexture(
    'desertSandNrm',
    128,
    (u, v) => Math.sin(v * Math.PI * 2 * 6 + Math.sin(u * Math.PI * 2) * 0.8) * 0.45,
    2.4,
    12,
    12
  );

  const sandMat = ctx.trackMaterial(new PBRMaterial('desertSandMat', ctx.scene));
  sandMat.albedoColor = Color3.White();
  sandMat.albedoTexture = sandTex;
  sandMat.bumpTexture = sandBump;
  sandMat.metallic = 0.02;
  sandMat.roughness = 0.9;

  const bunkerMat = ctx.createGridTextureMaterial('desertBunker', '#8f816d', '#64594a', 3, 2, true, {
    metallic: 0.04,
    roughness: 0.85,
  });
  const sandbagMat = ctx.createGridTextureMaterial('desertSandbag', '#9b8665', '#746248', 2, 2, true, {
    metallic: 0.02,
    roughness: 0.92,
  });
  const woodMat = ctx.createGridTextureMaterial('desertWood', '#70553a', '#493522', 2, 2, true, {
    metallic: 0.04,
    roughness: 0.82,
  });
  const trimSteel = ctx.createFlatMaterial('desertSteelTrim', '#343a40', 0.72, 0.42);
  const contTan = ctx.createCorrugatedMaterial('desertContTan', '#8a795d', '#695b45', 'FOB-01');
  const contOlive = ctx.createCorrugatedMaterial('desertContOlive', '#49543d', '#343d2b', 'OPS-04');
  const contRust = ctx.createCorrugatedMaterial('desertContRust', '#7a4033', '#562a20', 'AMMO-9');
  const beaconGlow = ctx.createEmissiveMaterial('desertBeacon', '#f59e0b', 2.0);

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
  });
  ctx.createBox('bunker_mast', new Vector3(2.4, 4.1, 2.4), new Vector3(0.14, 2.4, 0.14), trimSteel, {
    collisions: false,
  });
  ctx.createBox('bunker_dish', new Vector3(2.4, 4.75, 2.25), new Vector3(0.95, 0.72, 0.16), trimSteel, {
    collisions: false,
    rot: new Vector3(-0.38, 0.4, 0),
  });
  ctx.createBox('bunker_beacon', new Vector3(2.4, 5.35, 2.4), new Vector3(0.24, 0.22, 0.24), beaconGlow, {
    collisions: false,
    castShadow: false,
  });

  // Detailed Corrugated Shipping Containers with structural frame rails & locking bars
  ctx.buildShippingContainer('d_cont_1', new Vector3(-13.5, 1.5, -9.5), new Vector3(3.2, 3.0, 7.6), contOlive, trimSteel, true);
  ctx.buildShippingContainer('d_cont_2', new Vector3(13.5, 1.5, 9.5), new Vector3(3.2, 3.0, 7.6), contTan, trimSteel, true);
  ctx.buildShippingContainer('d_cont_3', new Vector3(-13.5, 1.5, 10.5), new Vector3(7.2, 3.0, 3.2), contRust, trimSteel, false);
  ctx.buildShippingContainer('d_cont_4', new Vector3(13.5, 1.5, -10.5), new Vector3(7.2, 3.0, 3.2), contOlive, trimSteel, false);

  // Guard Towers (West-South & East-North) with walkable ramps
  buildGuardTower(ctx, 'tower_sw', new Vector3(-20, 0, -10), 0, woodMat, bunkerMat);
  buildGuardTower(ctx, 'tower_ne', new Vector3(20, 0, 10), Math.PI, woodMat, bunkerMat);

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
  concreteMat: Material
): void {
  const h = 2.8;
  ctx.createBox(`${prefix}_p1`, new Vector3(origin.x - 1.6, h / 2, origin.z - 1.6), new Vector3(0.32, h, 0.32), woodMat);
  ctx.createBox(`${prefix}_p2`, new Vector3(origin.x + 1.6, h / 2, origin.z - 1.6), new Vector3(0.32, h, 0.32), woodMat);
  ctx.createBox(`${prefix}_p3`, new Vector3(origin.x - 1.6, h / 2, origin.z + 1.6), new Vector3(0.32, h, 0.32), woodMat);
  ctx.createBox(`${prefix}_p4`, new Vector3(origin.x + 1.6, h / 2, origin.z + 1.6), new Vector3(0.32, h, 0.32), woodMat);

  ctx.createBox(`${prefix}_deck`, new Vector3(origin.x, h, origin.z), new Vector3(3.8, 0.25, 3.8), concreteMat);
  ctx.createBox(`${prefix}_wall_e`, new Vector3(origin.x + 1.75, h + 0.55, origin.z), new Vector3(0.25, 0.9, 3.6), woodMat);
  ctx.createBox(`${prefix}_wall_w`, new Vector3(origin.x - 1.75, h + 0.55, origin.z), new Vector3(0.25, 0.9, 3.6), woodMat);

  // Canopy roof over guard tower
  ctx.createBox(`${prefix}_c_p1`, new Vector3(origin.x - 1.6, h + 1.4, origin.z - 1.6), new Vector3(0.18, 2.4, 0.18), woodMat, {
    collisions: false,
  });
  ctx.createBox(`${prefix}_c_p2`, new Vector3(origin.x + 1.6, h + 1.4, origin.z - 1.6), new Vector3(0.18, 2.4, 0.18), woodMat, {
    collisions: false,
  });
  ctx.createBox(`${prefix}_c_p3`, new Vector3(origin.x - 1.6, h + 1.4, origin.z + 1.6), new Vector3(0.18, 2.4, 0.18), woodMat, {
    collisions: false,
  });
  ctx.createBox(`${prefix}_c_p4`, new Vector3(origin.x + 1.6, h + 1.4, origin.z + 1.6), new Vector3(0.18, 2.4, 0.18), woodMat, {
    collisions: false,
  });
  ctx.createBox(`${prefix}_canopy`, new Vector3(origin.x, h + 2.6, origin.z), new Vector3(4.1, 0.16, 4.1), woodMat, {
    collisions: false,
  });

  const dirZ = Math.cos(rampYaw);
  const rampStart = new Vector3(origin.x, 0, origin.z - dirZ * 6.8);
  ctx.createRamp(`${prefix}_ramp`, rampStart, 2.2, h, 5.0, rampYaw, woodMat);
}
