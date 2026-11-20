import { Color3, DynamicTexture, Material, MeshBuilder, PBRMaterial, Vector3 } from '@babylonjs/core';
import { MapBuildContext } from './mapHelpers';
import { MapDefinition } from './types';

export const URBAN_MAP_DEF: MapDefinition = {
  id: 'urban',
  name: 'Urban Strike',
  tagline: 'Contested city avenue with enterable storefronts, rooftop ramps, and armored vehicle cover.',
  environmentLabel: 'Metropolitan District',
  engagementRange: 'Close – Medium',
  skyHex: '#4b5c70',
  skyZenithHex: '#253447',
  skyHorizonHex: '#6e8196',
  fogHex: '#506275',
  fogDensity: 0.0056,
  sunDirection: new Vector3(-0.45, -0.82, -0.35),
  sunPosition: new Vector3(26, 40, 20),
  sunColorHex: '#edf2fa',
  sunIntensity: 1.72,
  ambientIntensity: 0.56,
  ambientGroundHex: '#282d35',
  accentHex: '#3b82f6',
  blueSpawns: [
    new Vector3(-22, 1.0, -20),
    new Vector3(-14, 1.0, -23),
    new Vector3(0, 1.0, -23),
    new Vector3(14, 1.0, -22),
    new Vector3(22, 1.0, -19),
  ],
  redSpawns: [
    new Vector3(-22, 1.0, 20),
    new Vector3(-14, 1.0, 23),
    new Vector3(0, 1.0, 23),
    new Vector3(14, 1.0, 22),
    new Vector3(22, 1.0, 19),
  ],
  waypoints: [
    new Vector3(-18, 0.2, -16),
    new Vector3(0, 0.2, -17),
    new Vector3(18, 0.2, -16),
    new Vector3(-21, 0.2, -6),
    new Vector3(-8, 0.2, -8),
    new Vector3(7, 0.2, -8),
    new Vector3(21, 0.2, -6),
    new Vector3(-14, 0.2, 0),
    new Vector3(0, 0.2, -1),
    new Vector3(14, 0.2, 0),
    new Vector3(-21, 0.2, 6),
    new Vector3(-8, 0.2, 8),
    new Vector3(7, 0.2, 8),
    new Vector3(21, 0.2, 6),
    new Vector3(-18, 0.2, 16),
    new Vector3(0, 0.2, 17),
    new Vector3(18, 0.2, 16),
    new Vector3(-13, 3.3, 0),
  ],
  previewCameraTarget: new Vector3(0, 2.2, 0),
};

export function buildUrbanMap(ctx: MapBuildContext): void {
  const streetTex = ctx.trackTexture(
    new DynamicTexture('urbanStreetTex', { width: 512, height: 512 }, ctx.scene, true)
  );
  const sctx = streetTex.getContext();
  sctx.fillStyle = '#252a31';
  sctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6500; i++) {
    sctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.09)';
    sctx.fillRect(Math.random() * 512, Math.random() * 512, 2.5, 2.5);
  }
  // Weathered double-yellow road divider & faded lane dashes
  sctx.fillStyle = 'rgba(234, 179, 8, 0.62)';
  sctx.fillRect(241, 18, 10, 190);
  sctx.fillRect(261, 18, 10, 190);
  sctx.fillRect(241, 286, 10, 190);
  sctx.fillRect(261, 286, 10, 190);
  sctx.fillStyle = 'rgba(226, 232, 240, 0.16)';
  sctx.fillRect(88, 40, 8, 140);
  sctx.fillRect(416, 300, 8, 140);
  streetTex.update();
  streetTex.uScale = 8;
  streetTex.vScale = 8;

  const streetBump = ctx.createNormalTexture(
    'urbanStreetNrm',
    128,
    (u, v) => Math.sin(u * 48) * Math.cos(v * 48) * 0.12 + (Math.sin(u * 90 + v * 70) * 0.08),
    1.8,
    8,
    8
  );

  const streetMat = ctx.trackMaterial(new PBRMaterial('urbanStreetMat', ctx.scene));
  streetMat.albedoColor = Color3.White();
  streetMat.albedoTexture = streetTex;
  streetMat.bumpTexture = streetBump;
  streetMat.metallic = 0.06;
  streetMat.roughness = 0.76;

  const concreteWall = ctx.createGridTextureMaterial('urbanConcrete', '#505762', '#353a42', 3, 2, true, {
    metallic: 0.04,
    roughness: 0.85,
  });
  const brickMat = ctx.createGridTextureMaterial('urbanBrick', '#73473b', '#4d2d25', 4, 3, true, {
    metallic: 0.02,
    roughness: 0.88,
    bumpStrength: 2.8,
  });
  const sidewalkMat = ctx.createGridTextureMaterial('urbanSidewalk', '#646a73', '#434850', 6, 6, true, {
    metallic: 0.03,
    roughness: 0.84,
  });
  const barrierMat = ctx.createGridTextureMaterial('urbanBarrier', '#747a82', '#52575e', 2, 1, true, {
    metallic: 0.05,
    roughness: 0.82,
  });
  const truckBodyMat = ctx.createFlatMaterial('urbanTruckBody', '#41513c', 0.48, 0.42);
  const truckCabMat = ctx.createFlatMaterial('urbanCabMat', '#4b5b70', 0.55, 0.36);
  const darkTrimMat = ctx.createFlatMaterial('urbanTrimMat', '#1d2128', 0.65, 0.44);
  const glassMat = ctx.createFlatMaterial('urbanGlassMat', '#1c2b3a', 0.15, 0.08);
  const sodiumGlowMat = ctx.createEmissiveMaterial('urbanSodiumGlow', '#ffbe66', 2.4);

  // Main street ground (60m x 60m)
  ctx.createBox('urban_ground', new Vector3(0, -0.2, 0), new Vector3(60, 0.4, 60), streetMat, {
    castShadow: false,
  });
  ctx.createPerimeterWalls(29, 7.5, concreteWall);

  // Elevated Sidewalk strips + curb trim along East & West avenues
  ctx.createBox('sidewalk_w', new Vector3(-20, 0.1, 0), new Vector3(12, 0.2, 54), sidewalkMat, {
    castShadow: false,
  });
  ctx.createBox('sidewalk_e', new Vector3(20, 0.1, 0), new Vector3(12, 0.2, 54), sidewalkMat, {
    castShadow: false,
  });

  // West & East Enterable Storefronts with accessible rooftops via ramps
  buildEnterableBuilding(ctx, 'bldg_w', new Vector3(-13.5, 0, 0), brickMat, concreteWall, darkTrimMat);
  ctx.createRamp('ramp_w_rooftop', new Vector3(-13.5, 0, -10.5), 2.8, 3.2, 6.0, 0, concreteWall);

  buildEnterableBuilding(ctx, 'bldg_e', new Vector3(13.5, 0, 0), concreteWall, brickMat, darkTrimMat);
  ctx.createRamp('ramp_e_rooftop', new Vector3(13.5, 0, 10.5), 2.8, 3.2, 6.0, Math.PI, concreteWall);

  // Corner urban buildings for flank framing + rooftop cornices + multi-story window bays
  ctx.createBox('corner_nw', new Vector3(-22, 3.0, 14), new Vector3(6, 6.0, 6), brickMat);
  ctx.createBox('corner_nw_cap', new Vector3(-22, 6.15, 14), new Vector3(6.3, 0.3, 6.3), darkTrimMat, {
    collisions: false,
  });
  ctx.createBox('corner_se', new Vector3(22, 3.0, -14), new Vector3(6, 6.0, 6), brickMat);
  ctx.createBox('corner_se_cap', new Vector3(22, 6.15, -14), new Vector3(6.3, 0.3, 6.3), darkTrimMat, {
    collisions: false,
  });

  // Recessed multi-story window bays & concrete sills on corner buildings
  for (const [cx, cz, faceSign] of [
    [-22, 14, 1],
    [22, -14, -1],
  ] as const) {
    for (const wy of [2.1, 4.3]) {
      for (const wz of [-1.4, 1.4]) {
        ctx.createBox(`win_glass_${cx}_${wy}_${wz}`, new Vector3(cx + faceSign * 3.02, wy, cz + wz), new Vector3(0.08, 1.15, 1.35), glassMat, {
          collisions: false,
          castShadow: false,
        });
        ctx.createBox(`win_sill_${cx}_${wy}_${wz}`, new Vector3(cx + faceSign * 3.1, wy - 0.62, cz + wz), new Vector3(0.22, 0.14, 1.55), concreteWall, {
          collisions: false,
        });
      }
    }
  }

  // Detailed Tactical Trucks & SUVs along central street
  buildVehicleCover(ctx, 'truck_mid_s', new Vector3(-2.5, 0, -11.5), 0.18, truckBodyMat, darkTrimMat, glassMat);
  buildVehicleCover(ctx, 'truck_mid_n', new Vector3(2.8, 0, 11.5), Math.PI - 0.15, truckCabMat, darkTrimMat, glassMat);
  buildVehicleCover(ctx, 'van_center', new Vector3(0.2, 0, 0.2), Math.PI * 0.48, truckCabMat, darkTrimMat, glassMat);

  // Sloped Concrete Jersey Barriers
  ctx.buildJerseyBarrier('barrier_c1', new Vector3(-4.5, 0, 4.5), 3.6, 0, barrierMat);
  ctx.buildJerseyBarrier('barrier_c2', new Vector3(4.5, 0, -4.5), 3.6, 0, barrierMat);
  ctx.buildJerseyBarrier('barrier_s1', new Vector3(-10, 0, -16), 3.4, 0, barrierMat);
  ctx.buildJerseyBarrier('barrier_n1', new Vector3(10, 0, 16), 3.4, 0, barrierMat);

  // Street Lamps lining sidewalk edges (clear of spawns & lanes)
  ctx.buildStreetLamp('lamp_sw', new Vector3(-15.5, 0, -14), Math.PI * 0.5, darkTrimMat, sodiumGlowMat);
  ctx.buildStreetLamp('lamp_nw', new Vector3(-15.5, 0, 14), Math.PI * 0.5, darkTrimMat, sodiumGlowMat);
  ctx.buildStreetLamp('lamp_se', new Vector3(15.5, 0, -14), -Math.PI * 0.5, darkTrimMat, sodiumGlowMat);
  ctx.buildStreetLamp('lamp_ne', new Vector3(15.5, 0, 14), -Math.PI * 0.5, darkTrimMat, sodiumGlowMat);

  // Overhead Street Arch Sign with subtle illuminated signal strip
  ctx.createBox('arch_post_l', new Vector3(-7.5, 3.2, -17.5), new Vector3(0.45, 6.4, 0.45), darkTrimMat);
  ctx.createBox('arch_post_r', new Vector3(7.5, 3.2, -17.5), new Vector3(0.45, 6.4, 0.45), darkTrimMat);
  ctx.createBox('arch_beam', new Vector3(0, 6.2, -17.5), new Vector3(15.5, 0.9, 0.5), darkTrimMat);
  ctx.createBox('arch_sign_strip', new Vector3(0, 6.2, -17.2), new Vector3(9.5, 0.28, 0.08), sodiumGlowMat, {
    collisions: false,
    castShadow: false,
  });
}

function buildEnterableBuilding(
  ctx: MapBuildContext,
  prefix: string,
  origin: Vector3,
  wallMat: Material,
  trimMat: Material,
  frameMat: Material
): void {
  const w = 6.2;
  const d = 9.0;
  const h = 3.2;

  ctx.createBox(`${prefix}_roof`, new Vector3(origin.x, h + 0.15, origin.z), new Vector3(w, 0.3, d), trimMat);
  ctx.createBox(`${prefix}_parapet_n`, new Vector3(origin.x, h + 0.65, origin.z + d / 2 - 0.15), new Vector3(w, 0.7, 0.25), wallMat);
  ctx.createBox(`${prefix}_parapet_s`, new Vector3(origin.x, h + 0.65, origin.z - d / 2 + 0.15), new Vector3(w, 0.7, 0.25), wallMat);
  ctx.createBox(`${prefix}_hvac`, new Vector3(origin.x + 1.4, h + 0.65, origin.z - 1.2), new Vector3(1.1, 0.7, 1.3), frameMat);

  ctx.createBox(`${prefix}_w_n`, new Vector3(origin.x - w / 2 + 0.18, h / 2, origin.z + 2.8), new Vector3(0.35, h, 3.4), wallMat);
  ctx.createBox(`${prefix}_w_s`, new Vector3(origin.x - w / 2 + 0.18, h / 2, origin.z - 2.8), new Vector3(0.35, h, 3.4), wallMat);
  ctx.createBox(`${prefix}_e_n`, new Vector3(origin.x + w / 2 - 0.18, h / 2, origin.z + 2.8), new Vector3(0.35, h, 3.4), wallMat);
  ctx.createBox(`${prefix}_e_s`, new Vector3(origin.x + w / 2 - 0.18, h / 2, origin.z - 2.8), new Vector3(0.35, h, 3.4), wallMat);

  ctx.createBox(`${prefix}_n_l`, new Vector3(origin.x - 2.0, h / 2, origin.z + d / 2 - 0.18), new Vector3(2.2, h, 0.35), wallMat);
  ctx.createBox(`${prefix}_n_r`, new Vector3(origin.x + 2.0, h / 2, origin.z + d / 2 - 0.18), new Vector3(2.2, h, 0.35), wallMat);
  ctx.createBox(`${prefix}_s_l`, new Vector3(origin.x - 2.0, h / 2, origin.z - d / 2 + 0.18), new Vector3(2.2, h, 0.35), wallMat);
  ctx.createBox(`${prefix}_s_r`, new Vector3(origin.x + 2.0, h / 2, origin.z - d / 2 + 0.18), new Vector3(2.2, h, 0.35), wallMat);

  ctx.createBox(`${prefix}_counter`, new Vector3(origin.x, 0.55, origin.z), new Vector3(1.6, 1.1, 0.8), frameMat);
}

function buildVehicleCover(
  ctx: MapBuildContext,
  name: string,
  origin: Vector3,
  rotY: number,
  bodyMat: Material,
  trimMat: Material,
  glassMat: Material
): void {
  const chassis = MeshBuilder.CreateBox(`${name}_chassis`, { width: 2.1, height: 0.98, depth: 4.4 }, ctx.scene);
  chassis.position.set(origin.x, 0.78, origin.z);
  chassis.rotation.y = rotY;
  chassis.material = bodyMat;
  chassis.checkCollisions = true;
  chassis.receiveShadows = true;
  if (ctx.shadowGenerator) ctx.shadowGenerator.addShadowCaster(chassis);
  ctx.trackNode(chassis);

  const cabin = MeshBuilder.CreateBox(`${name}_cabin`, { width: 1.92, height: 0.78, depth: 2.1 }, ctx.scene);
  cabin.parent = chassis;
  cabin.position.set(0, 0.86, -0.35);
  cabin.material = bodyMat;
  cabin.checkCollisions = true;
  cabin.receiveShadows = true;
  if (ctx.shadowGenerator) ctx.shadowGenerator.addShadowCaster(cabin);

  // Windshield + rear glass inset
  const glass = MeshBuilder.CreateBox(`${name}_glass`, { width: 1.78, height: 0.52, depth: 2.14 }, ctx.scene);
  glass.parent = cabin;
  glass.position.set(0, 0.04, 0);
  glass.material = glassMat;
  glass.isPickable = false;

  // Heavy steel bumpers
  for (const bz of [-2.22, 2.22]) {
    const bumper = MeshBuilder.CreateBox(`${name}_bump_${bz}`, { width: 2.16, height: 0.24, depth: 0.18 }, ctx.scene);
    bumper.parent = chassis;
    bumper.position.set(0, -0.32, bz);
    bumper.material = trimMat;
    bumper.isPickable = false;
  }

  // 4 tires
  for (const wx of [-1.02, 1.02]) {
    for (const wz of [-1.35, 1.35]) {
      const wheel = MeshBuilder.CreateCylinder(
        `${name}_wheel_${wx}_${wz}`,
        { height: 0.28, diameter: 0.76, tessellation: 12 },
        ctx.scene
      );
      wheel.parent = chassis;
      wheel.position.set(wx, -0.4, wz);
      wheel.rotation.z = Math.PI * 0.5;
      wheel.material = trimMat;
      wheel.isPickable = false;
    }
  }
}
