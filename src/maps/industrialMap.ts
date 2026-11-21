import { Color3, MeshBuilder, Vector3 } from '@babylonjs/core';
import { MapBuildContext } from './mapHelpers';
import { MapDefinition } from './types';

export const INDUSTRIAL_MAP_DEF: MapDefinition = {
  id: 'industrial',
  name: 'Industrial Zone',
  tagline: 'Heavy manufacturing plant with elevated steel catwalks, turbine machinery, and CQB warehouse lanes.',
  environmentLabel: 'Refinery Sector',
  engagementRange: 'Close Quarters',
  skyHex: '#232c38',
  skyZenithHex: '#121821',
  skyHorizonHex: '#354354',
  fogHex: '#222a34',
  fogDensity: 0.007,
  sunDirection: new Vector3(-0.35, -0.88, 0.32),
  sunPosition: new Vector3(18, 38, -16),
  sunColorHex: '#d5e5f7',
  sunIntensity: 1.58,
  ambientIntensity: 0.5,
  ambientGroundHex: '#282320',
  accentHex: '#06b6d4',
  exposure: 1.15,
  contrast: 1.24,
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
    new Vector3(0, 0.2, -16),
    new Vector3(18, 0.2, -16),
    new Vector3(-19, 0.2, -6),
    new Vector3(-7, 0.2, -7),
    new Vector3(7, 0.2, -7),
    new Vector3(19, 0.2, -6),
    new Vector3(-12, 0.2, 0),
    new Vector3(0, 0.2, 0),
    new Vector3(12, 0.2, 0),
    new Vector3(-19, 0.2, 6),
    new Vector3(-7, 0.2, 7),
    new Vector3(7, 0.2, 7),
    new Vector3(19, 0.2, 6),
    new Vector3(-18, 0.2, 16),
    new Vector3(0, 0.2, 16),
    new Vector3(18, 0.2, 16),
  ],
  previewCameraTarget: new Vector3(0, 2.5, 0),
};

export function buildIndustrialMap(ctx: MapBuildContext): void {
  const floorMat = ctx.createProceduralMaterial('indFloorMat', 'concrete', {
    size: 256,
    baseHex: '#333a44',
    accentHex: '#1f242b',
    uScale: 10,
    vScale: 10,
    bumpLevel: 0.9,
  });
  const wallMat = ctx.createCorrugatedMaterial('indWallMat', '#3f4752', '#2b323b');
  const steelMat = ctx.createProceduralMaterial('indSteelMat', 'brushedMetal', {
    size: 128,
    baseHex: '#4f5d6e',
    accentHex: '#2f3844',
    metallicOverride: 0.82,
    uScale: 2,
    vScale: 2,
  });
  const catwalkMat = ctx.createProceduralMaterial('indCatwalkMat', 'diamondPlate', {
    size: 128,
    baseHex: '#3a424d',
    accentHex: '#1e242c',
    metallicOverride: 0.78,
    uScale: 6,
    vScale: 2,
    bumpLevel: 1.0,
  });
  const machineMat = ctx.createProceduralMaterial('indMachineMat', 'anodizedMetal', {
    size: 128,
    baseHex: '#38584c',
    accentHex: '#21352d',
    metallicOverride: 0.58,
    clearCoat: 0.25,
  });
  const tankMat = ctx.createProceduralMaterial('indTankMat', 'brushedMetal', {
    size: 128,
    baseHex: '#768799',
    accentHex: '#4f5c6b',
    metallicOverride: 0.88,
  });
  const hazardMat = ctx.createProceduralMaterial('indHazardMat', 'hazard', {
    size: 128,
    baseHex: '#d97706',
    accentHex: '#181a1f',
    uScale: 4,
    vScale: 1,
  });
  const crateMat = ctx.createProceduralMaterial('indCrateMat', 'crate', {
    size: 128,
    baseHex: '#6c5840',
    accentHex: '#413323',
    uScale: 2,
    vScale: 2,
  });
  const pipeRustMat = ctx.createProceduralMaterial('indPipeMat', 'anodizedMetal', {
    size: 64,
    baseHex: '#6e4c36',
    accentHex: '#3d2a1d',
    metallicOverride: 0.65,
  });
  const amberBayGlow = ctx.createEmissiveMaterial('indAmberBayGlow', '#ff9d3b', 2.4);
  const cyanPanelGlow = ctx.createEmissiveMaterial('indCyanPanelGlow', '#22d3ee', 2.0);

  // Factory floor + enclosing corrugated perimeter walls
  ctx.createBox('ind_ground', new Vector3(0, -0.2, 0), new Vector3(60, 0.4, 60), floorMat, {
    castShadow: false,
  });
  ctx.createPerimeterWalls(29, 8.5, wallMat);

  // Overhead factory steel trusses + glowing high-bay amber fixtures
  for (const zPos of [-16, 0, 16]) {
    ctx.createBox(`truss_l_${zPos}`, new Vector3(-24, 4.2, zPos), new Vector3(0.8, 8.4, 0.8), steelMat);
    ctx.createBox(`truss_r_${zPos}`, new Vector3(24, 4.2, zPos), new Vector3(0.8, 8.4, 0.8), steelMat);
    ctx.createBox(`truss_top_${zPos}`, new Vector3(0, 8.2, zPos), new Vector3(49, 0.7, 0.9), steelMat);

    for (const lx of [-12, 0, 12]) {
      ctx.createBox(`bay_lamp_${zPos}_${lx}`, new Vector3(lx, 7.75, zPos), new Vector3(1.6, 0.16, 0.55), amberBayGlow, {
        collisions: false,
        castShadow: false,
        pickable: false,
      });
      ctx.addAreaPointLight(
        `bay_pt_${zPos}_${lx}`,
        new Vector3(lx, 6.6, zPos),
        Color3.FromHexString('#ffb45a'),
        0.55,
        11
      );
    }
  }

  // Overhead refinery pipes & center gantry crane trolley (purely visual, non-colliding)
  ctx.buildPipeRun('ind_pipe_overhead_w', new Vector3(-22, 6.2, -14), new Vector3(-22, 6.2, 14), 0.34, pipeRustMat, steelMat);
  ctx.buildPipeRun('ind_pipe_overhead_e', new Vector3(22, 6.2, -14), new Vector3(22, 6.2, 14), 0.34, pipeRustMat, steelMat);
  ctx.buildPipeRun('ind_pipe_cross_n', new Vector3(-22, 6.2, 14), new Vector3(22, 6.2, 14), 0.26, steelMat, hazardMat);
  ctx.createBox('ind_gantry_trolley', new Vector3(3.5, 7.65, 0), new Vector3(2.2, 0.55, 1.3), hazardMat, {
    collisions: false,
    pickable: false,
  });
  ctx.createBox('ind_gantry_beacon', new Vector3(3.5, 7.35, 0), new Vector3(0.32, 0.12, 0.32), cyanPanelGlow, {
    collisions: false,
    castShadow: false,
    pickable: false,
  });

  // Elevated Central Cross Catwalk with East/West Ramps
  ctx.createBox('catwalk_bridge', new Vector3(0, 3.0, 0), new Vector3(18, 0.25, 3.2), catwalkMat);
  ctx.createBox('catwalk_rail_n', new Vector3(0, 3.55, 1.5), new Vector3(18, 0.85, 0.15), hazardMat);
  ctx.createBox('catwalk_rail_s', new Vector3(0, 3.55, -1.5), new Vector3(18, 0.85, 0.15), hazardMat);
  ctx.createBox('catwalk_sup_w', new Vector3(-8, 1.5, 0), new Vector3(0.6, 3.0, 2.8), steelMat);
  ctx.createBox('catwalk_sup_e', new Vector3(8, 1.5, 0), new Vector3(0.6, 3.0, 2.8), steelMat);
  ctx.createRamp('catwalk_ramp_w', new Vector3(-15.5, 0, 0), 2.6, 3.0, 6.5, Math.PI * 0.5, catwalkMat);
  ctx.createRamp('catwalk_ramp_e', new Vector3(15.5, 0, 0), 2.6, 3.0, 6.5, -Math.PI * 0.5, catwalkMat);

  // Catwalk beacon stanchion caps (non-colliding visual polish)
  for (const bx of [-8.8, 0, 8.8]) {
    ctx.createBox(`catwalk_cap_${bx}`, new Vector3(bx, 4.02, 1.5), new Vector3(0.18, 0.1, 0.18), cyanPanelGlow, {
      collisions: false,
      castShadow: false,
      pickable: false,
    });
    ctx.createBox(`catwalk_cap_s_${bx}`, new Vector3(bx, 4.02, -1.5), new Vector3(0.18, 0.1, 0.18), cyanPanelGlow, {
      collisions: false,
      castShadow: false,
      pickable: false,
    });
  }

  // Close-quarters Warehouse Partition Bays
  ctx.createBox('bay_nw_1', new Vector3(-11, 1.8, 10), new Vector3(7.5, 3.6, 0.8), wallMat);
  ctx.createBox('bay_nw_2', new Vector3(-14.3, 1.8, 14), new Vector3(0.8, 3.6, 7.2), wallMat);
  ctx.createBox('bay_se_1', new Vector3(11, 1.8, -10), new Vector3(7.5, 3.6, 0.8), wallMat);
  ctx.createBox('bay_se_2', new Vector3(14.3, 1.8, -14), new Vector3(0.8, 3.6, 7.2), wallMat);

  // Heavy Turbine Machinery with exhaust manifolds & telemetry console panels
  const generators: Array<[string, Vector3, Vector3]> = [
    ['gen_sw', new Vector3(-12, 1.15, -11), new Vector3(4.2, 2.3, 2.6)],
    ['gen_ne', new Vector3(12, 1.15, 11), new Vector3(4.2, 2.3, 2.6)],
    ['gen_mid_n', new Vector3(0, 0.9, 10.5), new Vector3(4.6, 1.8, 1.8)],
    ['gen_mid_s', new Vector3(0, 0.9, -10.5), new Vector3(4.6, 1.8, 1.8)],
  ];
  generators.forEach(([name, pos, size]) => {
    ctx.createBox(name, pos, size, machineMat);
    ctx.createBox(`${name}_manifold`, new Vector3(pos.x, pos.y + size.y * 0.5 + 0.25, pos.z), new Vector3(size.x * 0.7, 0.45, size.z * 0.5), steelMat, {
      collisions: false,
      pickable: false,
    });
    ctx.createBox(`${name}_screen`, new Vector3(pos.x, pos.y + 0.2, pos.z + size.z * 0.5 + 0.04), new Vector3(0.8, 0.45, 0.05), cyanPanelGlow, {
      collisions: false,
      castShadow: false,
      pickable: false,
    });
    ctx.createBox(`${name}_floor_pad`, new Vector3(pos.x, 0.008, pos.z), new Vector3(size.x + 0.7, 0.015, size.z + 0.7), hazardMat, {
      collisions: false,
      castShadow: false,
      pickable: false,
    });
  });

  // Cylindrical Pressurized Silo Tanks with steel pressure rings & top manifold pipes
  for (const [idx, pos] of [
    [1, new Vector3(-21, 2.2, 11)],
    [2, new Vector3(-21, 2.2, 15.5)],
    [3, new Vector3(21, 2.2, -11)],
    [4, new Vector3(21, 2.2, -15.5)],
  ] as const) {
    const tank = MeshBuilder.CreateCylinder(
      `ind_tank_${idx}`,
      { height: 4.4, diameter: 2.8, tessellation: 18 },
      ctx.scene
    );
    tank.position.copyFrom(pos);
    tank.material = tankMat;
    tank.checkCollisions = true;
    tank.receiveShadows = true;
    if (ctx.shadowGenerator) ctx.shadowGenerator.addShadowCaster(tank);
    ctx.trackNode(tank);

    for (const ry of [-1.2, 0.4, 1.8]) {
      const band = MeshBuilder.CreateCylinder(
        `ind_tank_${idx}_band_${ry}`,
        { height: 0.14, diameter: 2.94, tessellation: 18 },
        ctx.scene
      );
      band.position.set(pos.x, pos.y + ry, pos.z);
      band.material = hazardMat;
      band.checkCollisions = false;
      band.isPickable = false;
      ctx.trackNode(band);
    }

    ctx.buildPipeRun(
      `ind_tank_${idx}_pipe`,
      new Vector3(pos.x, 4.5, pos.z),
      new Vector3(pos.x < 0 ? -22 : 22, 6.2, pos.z),
      0.22,
      steelMat,
      hazardMat
    );
  }

  // Barrel clusters beside silo bays (purely visual)
  ctx.buildBarrelCluster('ind_drums_nw', new Vector3(-18.2, 0, 13.2), pipeRustMat, hazardMat);
  ctx.buildBarrelCluster('ind_drums_se', new Vector3(18.2, 0, -13.2), machineMat, hazardMat);

  // Shipping Crates & Forklift Pallets
  ctx.buildCrateCluster('ind_crate_1', new Vector3(-4.5, 0, -4.5), 0.2, crateMat, steelMat);
  ctx.buildCrateCluster('ind_crate_2', new Vector3(4.5, 0, 4.5), -0.35, crateMat, steelMat);
}
