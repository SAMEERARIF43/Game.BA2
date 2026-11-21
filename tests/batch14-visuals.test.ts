import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, NullEngine, PBRMaterial, Scene, Vector3 } from '@babylonjs/core';
import {
  applyProceduralSurfaceToMaterial,
  SurfacePresetId,
  synthesizeSurfaceBuffers,
} from '../src/game/proceduralTextures.ts';
import {
  buildOperatorRig,
  createOperatorPalette,
} from '../src/game/OperatorMeshBuilder.ts';
import { CHARACTER_IDS, CHARACTERS } from '../src/game/types.ts';
import { MapBuildContext } from '../src/maps/mapHelpers.ts';
import { MAP_REGISTRY } from '../src/maps/MapManager.ts';

const ALL_SURFACE_PRESETS: SurfacePresetId[] = [
  'concrete',
  'asphalt',
  'brick',
  'sandstone',
  'plaster',
  'timber',
  'bark',
  'rock',
  'meadow',
  'hazard',
  'diamondPlate',
  'brushedMetal',
  'anodizedMetal',
  'carbonFiber',
  'knurledPolymer',
  'walnutWood',
  'tacticalFabric',
  'kevlarPlate',
  'crate',
];

test('Batch 14: Procedural PBR Textures, Character Shaders & Map Visual Systems', async (t) => {
  await t.test('All 19 SurfacePresetId generators synthesize valid deterministic albedo, unit normals, and metallic/roughness maps', () => {
    for (const preset of ALL_SURFACE_PRESETS) {
      const size = 32;
      const runA = synthesizeSurfaceBuffers(preset, size, { seed: 7 });
      const runB = synthesizeSurfaceBuffers(preset, size, { seed: 7 });

      assert.strictEqual(runA.size, size);
      assert.strictEqual(runA.albedo.length, size * size * 4);
      assert.strictEqual(runA.normal.length, size * size * 4);
      assert.strictEqual(runA.metallicRoughness.length, size * size * 4);
      assert.deepStrictEqual(runA.albedo, runB.albedo, `Preset ${preset} albedo must be deterministic`);

      let nonZeroNormal = false;
      for (let i = 0; i < size * size; i++) {
        const idx = i * 4;
        const nx = (runA.normal[idx] / 255) * 2 - 1;
        const ny = (runA.normal[idx + 1] / 255) * 2 - 1;
        const nz = (runA.normal[idx + 2] / 255) * 2 - 1;
        const len = Math.hypot(nx, ny, nz);
        assert.ok(len > 0.9 && len < 1.1, `Normal vector at pixel ${i} for ${preset} must stay normalized (len=${len})`);
        if (Math.abs(nx) > 0.01 || Math.abs(ny) > 0.01) {
          nonZeroNormal = true;
        }
        assert.strictEqual(runA.albedo[idx + 3], 255);
        assert.strictEqual(runA.normal[idx + 3], 255);
        assert.strictEqual(runA.metallicRoughness[idx + 3], 255);
      }
      assert.ok(nonZeroNormal, `Preset ${preset} should generate non-flat bump detail`);
    }
  });

  await t.test('applyProceduralSurfaceToMaterial binds PBR albedo/bump/metallicRoughness textures cleanly on NullEngine', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);

    try {
      const mat = new PBRMaterial('b14_test_mat', scene);
      const textures = applyProceduralSurfaceToMaterial(scene, mat, 'b14_test_mat', 'carbonFiber', {
        size: 32,
        clearCoat: 0.45,
        bumpLevel: 0.9,
      });

      assert.strictEqual(textures.length, 3);
      assert.ok(mat.albedoTexture);
      assert.ok(mat.bumpTexture);
      assert.ok(mat.metallicTexture);
      assert.strictEqual(mat.bumpTexture.level, 0.9);
      assert.strictEqual(mat.useRoughnessFromMetallicTextureAlpha, false);
      assert.strictEqual(mat.useRoughnessFromMetallicTextureGreen, true);
      assert.strictEqual(mat.useMetallnessFromMetallicTextureBlue, true);
      assert.strictEqual(mat.clearCoat.isEnabled, true);

      for (const tex of textures) tex.dispose();
      mat.dispose();
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  await t.test('All 4 character rigs use procedural PBR gear/fabric/armor textures without altering hitbox geometry', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);

    try {
      const palette = createOperatorPalette(scene, 'blue', 'b14_op');
      assert.ok(palette.gearMat.albedoTexture);
      assert.ok(palette.plateMat.bumpTexture);
      assert.ok(palette.gunMat.metallicTexture);
      assert.ok(palette.heavyArmorMat.bumpTexture);
      assert.ok(palette.bladeMat.clearCoat.isEnabled);

      for (const charId of CHARACTER_IDS) {
        const rig = buildOperatorRig(scene, {
          id: `b14_${charId}`,
          team: 'blue',
          palette,
          characterId: charId,
          initialWeaponId: CHARACTERS[charId].signatureGunId,
          buildAllWeapons: false,
          isPickableHitboxes: true,
        });

        assert.ok(rig.bodyMat.albedoTexture, `${charId} bodyMat should use procedural PBR texture`);
        assert.ok(rig.bodyMat.bumpTexture, `${charId} bodyMat should use procedural bump texture`);
        assert.ok(rig.headMat.albedoTexture, `${charId} headMat should use procedural texture`);
        assert.strictEqual(rig.upperBodyPivot.position.y, 0.8);
        assert.strictEqual(rig.bodyMesh.position.y, 0.36);
        assert.strictEqual(rig.headMesh.position.y, 0.9);
        assert.strictEqual(rig.bodyMesh.isPickable, true);
        assert.strictEqual(rig.headMesh.isPickable, true);

        rig.root.dispose();
        rig.bodyMat.dispose();
        rig.headMat.dispose();
      }

      palette.dispose();
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  await t.test('MapBuildContext procedural materials & storytelling props (pipe runs, barrel clusters, vent units) remain non-colliding and non-pickable', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);

    try {
      const ctx = new MapBuildContext(scene, null);
      const steel = ctx.createProceduralMaterial('test_steel', 'brushedMetal', { size: 32 });
      const drum = ctx.createProceduralMaterial('test_drum', 'anodizedMetal', { size: 32 });
      const hazard = ctx.createProceduralMaterial('test_hazard', 'hazard', { size: 32 });

      ctx.buildPipeRun('p_test', new Vector3(0, 3, 0), new Vector3(4, 3, 0), 0.25, steel, hazard);
      ctx.buildBarrelCluster('b_test', new Vector3(2, 0, 2), drum, hazard);
      ctx.buildVentUnit('v_test', new Vector3(-2, 3, -2), drum, steel);

      const propMeshes = ctx.resources.nodes.filter((n): n is Mesh => n instanceof Mesh);
      assert.ok(propMeshes.length >= 10, 'Expected storytelling prop sub-meshes');
      for (const m of propMeshes) {
        assert.strictEqual(m.checkCollisions, false, `Prop mesh ${m.name} must not block player movement`);
        assert.strictEqual(m.isPickable, false, `Prop mesh ${m.name} must not interfere with hitscan raycasts`);
      }

      assert.ok(ctx.resources.materials.length === 3);
      assert.ok(ctx.resources.textures.length === 9);

      for (const n of ctx.resources.nodes) n.dispose();
      for (const mat of ctx.resources.materials) mat.dispose();
      for (const tex of ctx.resources.textures) tex.dispose();
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  await t.test('All 4 map definitions declare valid per-map exposure and contrast color grading presets', () => {
    for (const id of ['urban', 'desert', 'industrial', 'forest'] as const) {
      const def = MAP_REGISTRY[id];
      assert.ok(typeof def.exposure === 'number' && def.exposure >= 0.8 && def.exposure <= 1.5, `${id} exposure out of range`);
      assert.ok(typeof def.contrast === 'number' && def.contrast >= 1.0 && def.contrast <= 1.6, `${id} contrast out of range`);
    }
  });
});
