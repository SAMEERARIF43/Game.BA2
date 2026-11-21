import { Material, MeshBuilder, Vector3 } from '@babylonjs/core';
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
  exposure: 1.12,
  contrast: 1.2,
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
  const streetMat = ctx.createProceduralMaterial('urbanStreetMat', 'asphalt', {
    size: 256,
    baseHex: '#272c34',
    accentHex: '#15181d',
    uScale: 10,
    vScale: 10,
    bumpLevel: 0.9,
  });
  const laneYellowMat = ctx.createFlatMaterial('urbanLaneYellow', '#c7971a', 0.08, 0.72);
  const crosswalkMat = ctx.createFlatMaterial('urbanCrosswalk', '#cbd5e1', 0.04, 0.76);

  const concreteWall = ctx.createProceduralMaterial('urbanConcrete', 'concrete', {
    size: 128,
    baseHex: '#565e69',
    accentHex: '#353b44',
    uScale: 3,
    vScale: 2,
    bumpLevel: 0.85,
  });
  const brickMat = ctx.createProceduralMaterial('urbanBrick', 'brick', {
    size: 128,
    baseHex: '#7a493c',
    accentHex: '#4b2c23',
    uScale: 4,
    vScale: 3,
    bumpLevel: 1.0,
  });
  const sidewalkMat = ctx.createProceduralMaterial('urbanSidewalk', 'concrete', {
    size: 128,
    baseHex: '#6a717a',
    accentHex: '#454b53',
    uScale: 6,
    vScale: 6,
    bumpLevel: 0.75,
  });
  const barrierMat = ctx.createProceduralMaterial('urbanBarrier', 'concrete', {
    size: 128,
    baseHex: '#787e87',
    accentHex: '#4e535b',
    uScale: 2,
    vScale: 1,
  });
  const truckBodyMat = ctx.createProceduralMaterial('urbanTruckBody', 'anodizedMetal', {
    size: 64,
    baseHex: '#43553e',
    accentHex: '#293526',
    metallicOverride: 0.54,
    clearCoat: 0.3,
  });
  const truckCabMat = ctx.createProceduralMaterial('urbanCabMat', 'anodizedMetal', {
    size: 64,
    baseHex: '#4b5c72',
    accentHex: '#2d3948',
    metallicOverride: 0.62,
    clearCoat: 0.38,
  });
  const darkTrimMat = ctx.createProceduralMaterial('urbanTrimMat', 'brushedMetal', {
    size: 64,
    baseHex: '#222730',
    accentHex: '#13161b',
    metallicOverride: 0.78,
  });
  const glassMat = ctx.createFlatMaterial('urbanGlassMat', '#1c2d3e', 0.22, 0.06);
  glassMat.clearCoat.isEnabled = true;
  glassMat.clearCoat.intensity = 1.0;
  glassMat.clearCoat.roughness = 0.04;
  const sodiumGlowMat = ctx.createEmissiveMaterial('urbanSodiumGlow', '#ffbe66', 2.4);
  const tailGlowMat = ctx.createEmissiveMaterial('urbanTailGlow', '#ef4444', 1.8);
  const headGlowMat = ctx.createEmissiveMaterial('urbanHeadGlow', '#e2f1ff', 2.1);

  // Main street ground (60m x 60m)
  ctx.createBox('urban_ground', new Vector3(0, -0.2, 0), new Vector3(60, 0.4, 60), streetMat, {
    castShadow: false,
  });
  ctx.createPerimeterWalls(29, 7.5, concreteWall);

  // Road lane centerlines & crosswalk markings (purely visual)
  for (let z = -24; z <= 24; z += 6) {
    ctx.createBox(`urban_dash_${z}`, new Vector3(0, 0.008, z), new Vector3(0.22, 0.014, 2.8), laneYellowMat, {
      collisions: false,
      castShadow: false,
      pickable: false,
    });
  }
  for (const cz of [-15.5, 15.5]) {
    for (let cx = -11; cx <= 11; cx += 2.2) {
      ctx.createBox(`urban_xwalk_${cz}_${cx}`, new Vector3(cx, 0.008, cz), new Vector3(1.1, 0.014, 2.4), crosswalkMat, {
        collisions: false,
        castShadow: false,
        pickable: false,
      });
    }
  }

  // Elevated Sidewalk strips + curb trim along East & West avenues
  ctx.createBox('sidewalk_w', new Vector3(-20, 0.1, 0), new Vector3(12, 0.2, 54), sidewalkMat, {
    castShadow: false,
  });
  ctx.createBox('sidewalk_e', new Vector3(20, 0.1, 0), new Vector3(12, 0.2, 54), sidewalkMat, {
    castShadow: false,
  });
  ctx.createBox('curb_w_edge', new Vector3(-13.9, 0.12, 0), new Vector3(0.22, 0.24, 54), barrierMat, {
    collisions: false,
    castShadow: false,
    pickable: false,
  });
  ctx.createBox('curb_e_edge', new Vector3(13.9, 0.12, 0), new Vector3(0.22, 0.24, 54), barrierMat, {
    collisions: false,
    castShadow: false,
    pickable: false,
  });

  // West & East Enterable Storefronts with accessible rooftops via ramps
  buildEnterableBuilding(ctx, 'bldg_w', new Vector3(-13.5, 0, 0), brickMat, concreteWall, darkTrimMat, sodiumGlowMat);
  ctx.createRamp('ramp_w_rooftop', new Vector3(-13.5, 0, -10.5), 2.8, 3.2, 6.0, 0, concreteWall);

  buildEnterableBuilding(ctx, 'bldg_e', new Vector3(13.5, 0, 0), concreteWall, brickMat, darkTrimMat, sodiumGlowMat);
  ctx.createRamp('ramp_e_rooftop', new Vector3(13.5, 0, 10.5), 2.8, 3.2, 6.0, Math.PI, concreteWall);

  // Corner urban buildings for flank framing + rooftop cornices + multi-story window bays
  ctx.createBox('corner_nw', new Vector3(-22, 3.0, 14), new Vector3(6, 6.0, 6), brickMat);
  ctx.createBox('corner_nw_cap', new Vector3(-22, 6.15, 14), new Vector3(6.3, 0.3, 6.3), darkTrimMat, {
    collisions: false,
    pickable: false,
  });
  ctx.buildVentUnit('corner_nw_hvac', new Vector3(-22, 6.3, 14), concreteWall, darkTrimMat);
  ctx.createBox('corner_se', new Vector3(22, 3.0, -14), new Vector3(6, 6.0, 6), brickMat);
  ctx.createBox('corner_se_cap', new Vector3(22, 6.15, -14), new Vector3(6.3, 0.3, 6.3), darkTrimMat, {
    collisions: false,
    pickable: false,
  });
  ctx.buildVentUnit('corner_se_hvac', new Vector3(22, 6.3, -14), concreteWall, darkTrimMat);

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
          pickable: false,
        });
        ctx.createBox(`win_sill_${cx}_${wy}_${wz}`, new Vector3(cx + faceSign * 3.1, wy - 0.62, cz + wz), new Vector3(0.22, 0.14, 1.55), concreteWall, {
          collisions: false,
          pickable: false,
        });
      }
    }
  }

  // Detailed Tactical Trucks & SUVs along central street
  buildVehicleCover(ctx, 'truck_mid_s', new Vector3(-2.5, 0, -11.5), 0.18, truckBodyMat, darkTrimMat, glassMat, headGlowMat, tailGlowMat);
  buildVehicleCover(ctx, 'truck_mid_n', new Vector3(2.8, 0, 11.5), Math.PI - 0.15, truckCabMat, darkTrimMat, glassMat, headGlowMat, tailGlowMat);
  buildVehicleCover(ctx, 'van_center', new Vector3(0.2, 0, 0.2), Math.PI * 0.48, truckCabMat, darkTrimMat, glassMat, headGlowMat, tailGlowMat);

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
    pickable: false,
  });
}

function buildEnterableBuilding(
  ctx: MapBuildContext,
  prefix: string,
  origin: Vector3,
  wallMat: Material,
  trimMat: Material,
  frameMat: Material,
  sconceMat: Material
): void {
  const w = 6.2;
  const d = 9.0;
  const h = 3.2;

  ctx.createBox(`${prefix}_roof`, new Vector3(origin.x, h + 0.15, origin.z), new Vector3(w, 0.3, d), trimMat);
  ctx.createBox(`${prefix}_parapet_n`, new Vector3(origin.x, h + 0.65, origin.z + d / 2 - 0.15), new Vector3(w, 0.7, 0.25), wallMat);
  ctx.createBox(`${prefix}_parapet_s`, new Vector3(origin.x, h + 0.65, origin.z - d / 2 + 0.15), new Vector3(w, 0.7, 0.25), wallMat);
  ctx.buildVentUnit(`${prefix}_hvac`, new Vector3(origin.x + 1.4, h + 0.3, origin.z - 1.2), frameMat, trimMat);

  ctx.createBox(`${prefix}_w_n`, new Vector3(origin.x - w / 2 + 0.18, h / 2, origin.z + 2.8), new Vector3(0.35, h, 3.4), wallMat);
  ctx.createBox(`${prefix}_w_s`, new Vector3(origin.x - w / 2 + 0.18, h / 2, origin.z - 2.8), new Vector3(0.35, h, 3.4), wallMat);
  ctx.createBox(`${prefix}_e_n`, new Vector3(origin.x + w / 2 - 0.18, h / 2, origin.z + 2.8), new Vector3(0.35, h, 3.4), wallMat);
  ctx.createBox(`${prefix}_e_s`, new Vector3(origin.x + w / 2 - 0.18, h / 2, origin.z - 2.8), new Vector3(0.35, h, 3.4), wallMat);

  ctx.createBox(`${prefix}_n_l`, new Vector3(origin.x - 2.0, h / 2, origin.z + d / 2 - 0.18), new Vector3(2.2, h, 0.35), wallMat);
  ctx.createBox(`${prefix}_n_r`, new Vector3(origin.x + 2.0, h / 2, origin.z + d / 2 - 0.18), new Vector3(2.2, h, 0.35), wallMat);
  ctx.createBox(`${prefix}_s_l`, new Vector3(origin.x - 2.0, h / 2, origin.z - d / 2 + 0.18), new Vector3(2.2, h, 0.35), wallMat);
  ctx.createBox(`${prefix}_s_r`, new Vector3(origin.x + 2.0, h / 2, origin.z - d / 2 + 0.18), new Vector3(2.2, h, 0.35), wallMat);

  // Decorative cornice trim & doorway sconces (non-colliding, non-pickable)
  const streetDir = origin.x < 0 ? 1 : -1;
  ctx.createBox(
    `${prefix}_awning`,
    new Vector3(origin.x + streetDir * (w / 2 + 0.25), 2.55, origin.z),
    new Vector3(0.55, 0.12, 3.2),
    frameMat,
    { collisions: false, pickable: false }
  );
  ctx.createBox(
    `${prefix}_sconce_n`,
    new Vector3(origin.x + streetDir * (w / 2 + 0.06), 2.2, origin.z + 1.4),
    new Vector3(0.08, 0.22, 0.14),
    sconceMat,
    { collisions: false, castShadow: false, pickable: false }
  );
  ctx.createBox(
    `${prefix}_sconce_s`,
    new Vector3(origin.x + streetDir * (w / 2 + 0.06), 2.2, origin.z - 1.4),
    new Vector3(0.08, 0.22, 0.14),
    sconceMat,
    { collisions: false, castShadow: false, pickable: false }
  );

  ctx.createBox(`${prefix}_counter`, new Vector3(origin.x, 0.55, origin.z), new Vector3(1.6, 1.1, 0.8), frameMat);
}

function buildVehicleCover(
  ctx: MapBuildContext,
  name: string,
  origin: Vector3,
  rotY: number,
  bodyMat: Material,
  trimMat: Material,
  glassMat: Material,
  headMat: Material,
  tailMat: Material
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

  // Heavy steel bumpers + headlights / taillights
  for (const bz of [-2.22, 2.22]) {
    const bumper = MeshBuilder.CreateBox(`${name}_bump_${bz}`, { width: 2.16, height: 0.24, depth: 0.18 }, ctx.scene);
    bumper.parent = chassis;
    bumper.position.set(0, -0.32, bz);
    bumper.material = trimMat;
    bumper.isPickable = false;
  }

  for (const lx of [-0.74, 0.74]) {
    const headL = MeshBuilder.CreateBox(`${name}_hl_${lx}`, { width: 0.28, height: 0.14, depth: 0.06 }, ctx.scene);
    headL.parent = chassis;
    headL.position.set(lx, 0.08, 2.21);
    headL.material = headMat;
    headL.isPickable = false;

    const tailL = MeshBuilder.CreateBox(`${name}_tl_${lx}`, { width: 0.28, height: 0.14, depth: 0.06 }, ctx.scene);
    tailL.parent = chassis;
    tailL.position.set(lx, 0.08, -2.21);
    tailL.material = tailMat;
    tailL.isPickable = false;
  }

  // 4 tires
  for (const wx of [-1.02, 1.02]) {
    for (const wz of [-1.35, 1.35]) {
      const wheel = MeshBuilder.CreateCylinder(
        `${name}_wheel_${wx}_${wz}`,
        { height: 0.28, diameter: 0.76, tessellation: 14 },
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
