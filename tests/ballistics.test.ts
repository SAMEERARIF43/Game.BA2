import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, WeaponId } from '../src/game/types.ts';
import { SERVER_WEAPONS } from '../server/mapSpawns.ts';

test('Arsenal: Client-Server Weapon Spec Synchronization', async (t) => {
  const weaponIds: WeaponId[] = ['m4a1', 'mp5', 'intervention', 'm1911'];

  for (const id of weaponIds) {
    await t.test(`Weapon ${id} parity check`, () => {
      const clientWeapon = WEAPONS[id];
      const serverWeapon = SERVER_WEAPONS[id];

      assert.ok(clientWeapon, `Client weapon config for ${id} should exist`);
      assert.ok(serverWeapon, `Server weapon spec for ${id} should exist`);

      // Damage parity
      assert.strictEqual(
        serverWeapon.damage,
        clientWeapon.damage,
        `Damage for ${id} must match between server and client`
      );

      // Headshot multiplier parity
      assert.strictEqual(
        serverWeapon.headshotMultiplier,
        clientWeapon.headshotMultiplier,
        `Headshot multiplier for ${id} must match between server and client`
      );

      // Range parity
      assert.strictEqual(
        serverWeapon.range,
        clientWeapon.range,
        `Range for ${id} must match between server and client`
      );

      // Fire interval consistency (server minFireIntervalMs vs client RPM)
      const expectedIntervalMs = (60 / clientWeapon.rpm) * 1000;
      assert.ok(
        serverWeapon.minFireIntervalMs <= expectedIntervalMs + 1,
        `Server minFireIntervalMs (${serverWeapon.minFireIntervalMs}) must not exceed nominal interval (${expectedIntervalMs}) for ${id}`
      );
    });
  }
});

test('Ballistics: Damage and TTK Calculations', async (t) => {
  await t.test('MP5 5-shot body kill against 100 HP', () => {
    const mp5 = WEAPONS.mp5;
    assert.strictEqual(mp5.damage, 24);

    const fourShots = mp5.damage * 4;
    assert.ok(fourShots < 100, `4 shots (${fourShots}) should not eliminate a 100 HP target`);

    const fiveShots = mp5.damage * 5;
    assert.ok(fiveShots >= 100, `5 shots (${fiveShots}) must eliminate a 100 HP target`);

    // 1 Headshot + 3 Bodyshots
    const headshotDmg = mp5.damage * mp5.headshotMultiplier;
    const mixedShots = headshotDmg + mp5.damage * 3;
    assert.ok(
      mixedShots >= 100,
      `1 headshot + 3 body shots (${mixedShots}) must eliminate a 100 HP target`
    );
  });

  await t.test('Intervention 1-shot kill against 100 HP', () => {
    const sniper = WEAPONS.intervention;
    assert.strictEqual(sniper.damage, 110);
    assert.ok(sniper.damage >= 100, 'Intervention must eliminate 100 HP target in 1 body shot');
  });

  await t.test('M1911 3-shot kill against 100 HP', () => {
    const pistol = WEAPONS.m1911;
    assert.strictEqual(pistol.damage, 36);

    const twoShots = pistol.damage * 2;
    assert.ok(twoShots < 100, `2 shots (${twoShots}) must not eliminate a 100 HP target`);

    const threeShots = pistol.damage * 3;
    assert.ok(threeShots >= 100, `3 shots (${threeShots}) must eliminate a 100 HP target`);

    // 1 Headshot + 1 Bodyshot
    const headshotDmg = pistol.damage * pistol.headshotMultiplier;
    const mixed = headshotDmg + pistol.damage;
    assert.ok(
      mixed >= 100,
      `1 headshot + 1 bodyshot (${mixed}) must eliminate a 100 HP target`
    );
  });

  await t.test('M4A1 4-shot kill against 100 HP', () => {
    const rifle = WEAPONS.m4a1;
    assert.strictEqual(rifle.damage, 28);

    const threeShots = rifle.damage * 3;
    assert.ok(threeShots < 100, `3 shots (${threeShots}) must not eliminate a 100 HP target`);

    const fourShots = rifle.damage * 4;
    assert.ok(fourShots >= 100, `4 shots (${fourShots}) must eliminate a 100 HP target`);
  });
});
