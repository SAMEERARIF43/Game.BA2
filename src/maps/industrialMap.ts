import { Color3, DynamicTexture, MeshBuilder, PBRMaterial, Vector3 } from '@babylonjs/core';
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
  const floorTex = ctx.trackTexture(
    new DynamicTexture('indFloorTex', { width: 512, height: 512 }, ctx.scene, true)
  );
  const fctx = floorTex.getContext();
  fctx.fillStyle = '#2d333b';
  fctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4500; i++) {
    fctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.09)';
    fctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
  }
  fctx.strokeStyle = 'rgba(234, 179, 8, 0.42)';
  fctx.lineWidth = 8;
  fctx.strokeRect(8, 8, 496, 496);
  floorTex.update();
  floorTex.uScale = 10;
  floorTex.vScale = 10;

  const floorBump = ctx.createNormalTexture(
    'indFloorNrm',
    128,
    (u, v) => (u < 0.03 || u > 0.97 || v < 0.03 || v > 0.97 ? -0.45 : Math.sin(u * 40) * Math.cos(v * 40) * 0.08),
    2.0,
    10,
    10
  );

  const floorMat = ctx.trackMaterial(new PBRMaterial('indFloorMat', ctx.scene));
  floorMat.albedoColor = Color3.White();
  floorMat.albedoTexture = floorTex;
  floorMat.bumpTexture = floorBump;
  floorMat.metallic = 0.18;
  floorMat.roughness = 0.58;

  const wallMat = ctx.createCorrugatedMaterial('indWallMat', '#3f4752', '#2b323b');
  const steelMat = ctx.createFlatMaterial('indSteelMat', '#4c5a6b', 0.78, 0.36);
  const catwalkMat = ctx.createGridTextureMaterial('indCatwalkMat', '#38404b', '#1c2128', 6, 2, false, {
    metallic: 0.72,
    roughness: 0.4,
    bumpStrength: 2.6,
  });
  const machineMat = ctx.createFlatMaterial('indMachineMat', '#3b564b', 0.55, 0.44);
  const tankMat = ctx.createFlatMaterial('indTankMat', '#718193', 0.85, 0.32);
  const hazardMat = ctx.createFlatMaterial('indHazardMat', '#c25e0a', 0.35, 0.55);
  const amberBayGlow = ctx.createEmissiveMaterial('indAmberBayGlow', '#ff9d3b', 2.4);
  const cyanPanelGlow = ctx.createEmissiveMaterial('indCyanPanelGlow', '#22d3ee', 1.8);

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

  // Elevated Central Cross Catwalk with East/West Ramps
  ctx.createBox('catwalk_bridge', new Vector3(0, 3.0, 0), new Vector3(18, 0.25, 3.2), catwalkMat);
  ctx.createBox('catwalk_rail_n', new Vector3(0, 3.55, 1.5), new Vector3(18, 0.85, 0.15), hazardMat);
  ctx.createBox('catwalk_rail_s', new Vector3(0, 3.55, -1.5), new Vector3(18, 0.85, 0.15), hazardMat);
  ctx.createBox('catwalk_sup_w', new Vector3(-8, 1.5, 0), new Vector3(0.6, 3.0, 2.8), steelMat);
  ctx.createBox('catwalk_sup_e', new Vector3(8, 1.5, 0), new Vector3(0.6, 3.0, 2.8), steelMat);
  ctx.createRamp('catwalk_ramp_w', new Vector3(-15.5, 0, 0), 2.6, 3.0, 6.5, Math.PI * 0.5, catwalkMat);
  ctx.createRamp('catwalk_ramp_e', new Vector3(15.5, 0, 0), 2.6, 3.0, 6.5, -Math.PI * 0.5, catwalkMat);

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
    });
    ctx.createBox(`${name}_screen`, new Vector3(pos.x, pos.y + 0.2, pos.z + size.z * 0.5 + 0.04), new Vector3(0.8, 0.45, 0.05), cyanPanelGlow, {
      collisions: false,
      castShadow: false,
    });
  });

  // Cylindrical Pressurized Silo Tanks with steel pressure rings & domes
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
      band.isPickable = false;
      ctx.trackNode(band);
    }
  }

  // Shipping Crates & Forklift Pallets
  ctx.buildCrateCluster('ind_crate_1', new Vector3(-4.5, 0, -4.5), 0.2, hazardMat, steelMat);
  ctx.buildCrateCluster('ind_crate_2', new Vector3(4.5, 0, 4.5), -0.35, hazardMat, steelMat);
}
