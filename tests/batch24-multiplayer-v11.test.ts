import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlayerShot, reloadPlayerWeapon, validatePlayerMovement, type PlayerValidationState } from '../server/validation/ammoValidation.ts';
import { getAllPublicRooms } from '../server/rooms/MatchRoom.ts';

test('Batch 24 v1.1: Server-Side Ammo & Fire-Rate Validation', async (t) => {
  await t.test('Initializes magazine ammo correctly per weapon', () => {
    const vState: PlayerValidationState = {
      ammo: {},
      lastShotAt: {},
      lastMoveTime: 0,
      lastX: 0,
      lastY: 0,
      lastZ: 0,
      suspiciousCount: 0,
    };

    const akRes = validatePlayerShot(vState, 'ak47', 1000);
    assert.strictEqual(akRes.valid, true);
    assert.strictEqual(akRes.currentAmmo, 29); // 30 - 1

    const shotgunRes = validatePlayerShot(vState, 'shotgun', 1000);
    assert.strictEqual(shotgunRes.valid, true);
    assert.strictEqual(shotgunRes.currentAmmo, 7); // 8 - 1
  });

  await t.test('Rejects rapid-fire bursts exceeding weapon RPM (rate of fire violation)', () => {
    const vState: PlayerValidationState = {
      ammo: {},
      lastShotAt: {},
      lastMoveTime: 0,
      lastX: 0,
      lastY: 0,
      lastZ: 0,
      suspiciousCount: 0,
    };

    const first = validatePlayerShot(vState, 'ak47', 1000);
    assert.strictEqual(first.valid, true);

    // AK47 min fire interval is 65ms. Trying to shoot 10ms later should fail.
    const rapid = validatePlayerShot(vState, 'ak47', 1010);
    assert.strictEqual(rapid.valid, false);
    assert.ok(rapid.reason?.includes('Fire rate exceeded'));
    assert.strictEqual(vState.suspiciousCount > 0, true);

    // After interval passes (> 65ms * 0.75 = ~48ms), next shot is valid
    const paced = validatePlayerShot(vState, 'ak47', 1100);
    assert.strictEqual(paced.valid, true);
  });

  await t.test('Rejects empty magazine shots and supports reload', () => {
    const vState: PlayerValidationState = {
      ammo: { pistol: 1 },
      lastShotAt: { pistol: 0 },
      lastMoveTime: 0,
      lastX: 0,
      lastY: 0,
      lastZ: 0,
      suspiciousCount: 0,
    };

    // Shot 1 with 1 ammo left -> valid, ammo becomes 0
    const shot1 = validatePlayerShot(vState, 'pistol', 1000);
    assert.strictEqual(shot1.valid, true);
    assert.strictEqual(shot1.currentAmmo, 0);

    // Shot 2 with 0 ammo -> rejected (empty mag)
    const shot2 = validatePlayerShot(vState, 'pistol', 1200);
    assert.strictEqual(shot2.valid, false);
    assert.ok(shot2.reason?.includes('Empty magazine'));

    // Reload weapon -> ammo restored to 12
    const reloadedAmmo = reloadPlayerWeapon(vState, 'pistol');
    assert.strictEqual(reloadedAmmo, 12);
    assert.strictEqual(vState.ammo['pistol'], 12);

    // Shot 3 after reload -> valid
    const shot3 = validatePlayerShot(vState, 'pistol', 1400);
    assert.strictEqual(shot3.valid, true);
  });

  await t.test('Validates movement speed bounds and detects teleportation', () => {
    const vState: PlayerValidationState = {
      ammo: {},
      lastShotAt: {},
      lastMoveTime: 1000,
      lastX: 0,
      lastY: 0,
      lastZ: 0,
      suspiciousCount: 0,
    };

    // Normal movement (5 units in 500ms = 10 units/sec < 18 max speed)
    const normalMove = validatePlayerMovement(vState, 5, 0, 0, 1500);
    assert.strictEqual(normalMove.valid, true);

    // Teleport / speed hack (50 units in 100ms = 500 units/sec >> max allowed)
    const teleport = validatePlayerMovement(vState, 100, 0, 0, 1600);
    assert.strictEqual(teleport.valid, false);
    assert.ok(teleport.reason?.includes('Excessive movement delta'));
  });
});

test('Batch 24 v1.1: Quick Match & Public Room Discovery Logic', async (t) => {
  await t.test('Public room listing returns empty or active public rooms', () => {
    const rooms = getAllPublicRooms();
    assert.ok(Array.isArray(rooms));
  });
});
