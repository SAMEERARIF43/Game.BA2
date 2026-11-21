import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPON_IDS, WEAPONS, WeaponId } from '../src/game/types.ts';
import { SERVER_WEAPONS } from '../server/mapSpawns.ts';

test('Arsenal: Client-Server Weapon Spec Synchronization', async (t) => {
  const weaponIds: readonly WeaponId[] = WEAPON_IDS;

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

      // Pellet parity for shotgun
      assert.strictEqual(
        serverWeapon.pellets ?? 1,
        clientWeapon.pellets ?? 1,
        `Pellet count for ${id} must match between server and client`
      );

      // Melee flag parity
      assert.strictEqual(
        Boolean(serverWeapon.isMelee),
        Boolean(clientWeapon.isMelee),
        `Melee flag for ${id} must match between server and client`
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
  await t.test('Shotgun 8-pellet close-range burst eliminates 100 HP target', () => {
    const shotgun = WEAPONS.shotgun;
    assert.strictEqual(shotgun.damage, 16);
    assert.strictEqual(shotgun.pellets, 8);

    const sixPellets = shotgun.damage * 6;
    assert.ok(sixPellets < 100, `6 pellets (${sixPellets}) should not eliminate a 100 HP target`);

    const fullBurst = shotgun.damage * (shotgun.pellets ?? 1);
    assert.strictEqual(fullBurst, 128);
    assert.ok(fullBurst >= 100, `Full 8-pellet burst (${fullBurst}) must eliminate a 100 HP target`);
  });

  await t.test('AK-47 Heavy Rifle 3-shot body kill against 100 HP', () => {
    const rifle = WEAPONS.ak47;
    assert.strictEqual(rifle.damage, 34);

    const twoShots = rifle.damage * 2;
    assert.ok(twoShots < 100, `2 shots (${twoShots}) must not eliminate a 100 HP target`);

    const threeShots = rifle.damage * 3;
    assert.ok(threeShots >= 100, `3 shots (${threeShots}) must eliminate a 100 HP target`);
  });

  await t.test('Vector-9 SMG 5-shot body kill against 100 HP', () => {
    const smg = WEAPONS.smg;
    assert.strictEqual(smg.damage, 21);

    const fourShots = smg.damage * 4;
    assert.ok(fourShots < 100, `4 shots (${fourShots}) should not eliminate a 100 HP target`);

    const fiveShots = smg.damage * 5;
    assert.ok(fiveShots >= 100, `5 shots (${fiveShots}) must eliminate a 100 HP target`);

    // 1 Headshot + 3 Bodyshots
    const headshotDmg = smg.damage * smg.headshotMultiplier;
    const mixedShots = headshotDmg + smg.damage * 3;
    assert.ok(
      mixedShots >= 100,
      `1 headshot + 3 body shots (${mixedShots}) must eliminate a 100 HP target`
    );
  });

  await t.test('AWP-50 Sniper 1-shot kill against 100 HP', () => {
    const sniper = WEAPONS.sniper;
    assert.strictEqual(sniper.damage, 115);
    assert.ok(sniper.damage >= 100, 'Sniper must eliminate 100 HP target in 1 body shot');
  });

  await t.test('USP-45 Pistol 3-shot kill against 100 HP', () => {
    const pistol = WEAPONS.pistol;
    assert.strictEqual(pistol.damage, 38);

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

  await t.test('K-Bar Knife 2-slash body kill or 1-stab headshot kill', () => {
    const knife = WEAPONS.knife;
    assert.strictEqual(knife.damage, 75);
    assert.strictEqual(knife.isMelee, true);

    assert.ok(knife.damage < 100, 'Single body slash should not 1-shot 100 HP target');
    assert.ok(knife.damage * 2 >= 100, 'Two body slashes must eliminate 100 HP target');

    const hsDmg = knife.damage * knife.headshotMultiplier;
    assert.strictEqual(hsDmg, 120);
    assert.ok(hsDmg >= 100, 'Headshot knife slash must eliminate 100 HP target');
  });
});
