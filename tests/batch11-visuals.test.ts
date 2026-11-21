import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, TransformNode } from '@babylonjs/core';
import {
  buildOperatorRig,
  createOperatorPalette,
} from '../src/game/OperatorMeshBuilder.ts';
import {
  GUN_IDS,
  GraphicsQuality,
  KNIFE_CHARM_IDS,
  WEAPON_IDS,
  WEAPONS,
} from '../src/game/types.ts';
import { validateSettings } from '../src/settings/settingsStorage.ts';

test('Batch 11: Operator Rig, Weapon Optics & Visual Quality Parity', async (t) => {
  await t.test('Shared OperatorMeshBuilder constructs articulated hitboxes, team accents, and all 6 weapon groups + charms', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);

    try {
      const bluePalette = createOperatorPalette(scene, 'blue', 'test_blue');
      const rig = buildOperatorRig(scene, {
        id: 'unit_test_op',
        team: 'blue',
        palette: bluePalette,
        buildAllWeapons: true,
        initialWeaponId: 'ak47',
        initialCharmId: 'cyber_core',
        isPickableHitboxes: true,
        hitboxMetadata: { isBot: true, botId: 'bot_1', team: 'blue' },
      });

      // Exact preserved hitbox coordinates & pickability
      assert.strictEqual(rig.upperBodyPivot.position.y, 0.8);
      assert.strictEqual(rig.bodyMesh.position.y, 0.36);
      assert.strictEqual(rig.headMesh.position.y, 0.9);
      assert.strictEqual(rig.bodyMesh.isPickable, true);
      assert.strictEqual(rig.headMesh.isPickable, true);
      assert.deepStrictEqual(rig.bodyMesh.metadata, {
        isBot: true,
        botId: 'bot_1',
        team: 'blue',
        zone: 'body',
      });
      assert.deepStrictEqual(rig.headMesh.metadata, {
        isBot: true,
        botId: 'bot_1',
        team: 'blue',
        zone: 'head',
      });

      // Decorative operator meshes stay non-pickable so raycasts only hit authoritative zones
      const decorMeshes = rig.root
        .getChildMeshes(false)
        .filter((m) => m !== rig.bodyMesh && m !== rig.headMesh && m !== rig.muzzleFlash);
      assert.ok(decorMeshes.length >= 25, 'Operator model should compose multi-part tactical armor & limbs');
      for (const m of decorMeshes) {
        assert.strictEqual(m.isPickable, false, `Decorative mesh ${m.name} must not block hitboxes`);
      }

      // Every weapon group exists & toggles cleanly
      for (const wid of WEAPON_IDS) {
        const group = rig.weaponGroups[wid];
        assert.ok(group, `Missing 3rd-person weapon mesh group for ${wid}`);
        rig.setWeapon(wid);
        for (const other of WEAPON_IDS) {
          assert.strictEqual(
            rig.weaponGroups[other]?.isEnabled(),
            other === wid,
            `Only ${wid} should be enabled after setWeapon('${wid}')`
          );
        }
      }

      // Knife charms toggle cleanly
      for (const charmId of KNIFE_CHARM_IDS) {
        assert.ok(rig.charmRoots[charmId], `Missing 3rd-person knife charm ${charmId}`);
        rig.setCharm(charmId);
        for (const otherCharm of KNIFE_CHARM_IDS) {
          assert.strictEqual(
            rig.charmRoots[otherCharm]?.isEnabled(),
            otherCharm === charmId
          );
        }
      }

      // AK-47 3rd-person rig includes Red Dot sight components
      const akGroup = rig.weaponGroups.ak47 as TransformNode;
      const akChildNames = akGroup.getChildMeshes(false).map((m) => m.name);
      assert.ok(akChildNames.some((n) => n.includes('ak_rdsDot')), 'AK-47 rig must include red dot sight');

      rig.root.dispose();
      rig.bodyMat.dispose();
      rig.headMat.dispose();
      bluePalette.dispose();
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  await t.test('AK-47 ADS and Sniper scope magnification configs remain distinct and accurate', () => {
    assert.strictEqual(GUN_IDS.includes('ak47'), true);
    assert.strictEqual(WEAPONS.ak47.adsFovRatio, 0.74);
    assert.strictEqual(WEAPONS.sniper.adsFovRatio, 0.25);
    assert.ok(WEAPONS.ak47.adsSpread < WEAPONS.ak47.hipSpread);
  });

  await t.test('Graphics quality presets LOW / MEDIUM / HIGH validate safely without mutating loadouts', () => {
    const qualities: GraphicsQuality[] = ['LOW', 'MEDIUM', 'HIGH'];
    for (const q of qualities) {
      const validated = validateSettings({
        graphicsQuality: q,
        selectedGunId: 'ak47',
        knifeCharmId: 'crimson_fang',
      });
      assert.strictEqual(validated.graphicsQuality, q);
      assert.strictEqual(validated.selectedGunId, 'ak47');
      assert.strictEqual(validated.knifeCharmId, 'crimson_fang');
    }
  });
});
