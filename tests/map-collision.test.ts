import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkLineOfSight,
  hasLineOfSight,
  rayIntersectsAABB,
  registerMapCollision,
  unregisterMapCollision,
  isMapRegistered,
  getMapCollisionBoxes,
  getRegisteredMapIds,
  ServerAABB,
} from '../server/mapCollision.ts';

test('MAP-COLLISION: Comprehensive Multi-Map Line of Sight & Geometry Tests', async (t) => {
  // -------------------------------------------------------------------------
  // 1. Urban Map Prop & Lane Tests
  // -------------------------------------------------------------------------
  await t.test('Urban: Storefront shell walls block shots, doorway opening allows shots', () => {
    // West storefront center is (-13.5, 0). Entrance is at (x = -10.25, z in [-1.5, 1.5]).
    // Shooter inside building at (-13.5, 1.5, 0).
    // Target outside in street at (-5.0, 1.5, 0).
    // Shot directly through open doorway:
    const doorwayLos = checkLineOfSight(-13.5, 1.5, 0, -5.0, 1.5, 0, 'urban');
    assert.strictEqual(doorwayLos.status, 'CLEAR', 'Shot passing through open doorway must be CLEAR');
    assert.strictEqual(doorwayLos.clear, true);

    // Shooter inside at (-13.5, 1.5, 4.0), target outside at (-5.0, 1.5, 4.0).
    // Shot passes through east wall segment (bldg_w_wall_e_n at x = -10.25, z in [1.5, 5.0]):
    const wallLos = checkLineOfSight(-13.5, 1.5, 4.0, -5.0, 1.5, 4.0, 'urban');
    assert.strictEqual(wallLos.status, 'BLOCKED', 'Shot through solid storefront east wall must be BLOCKED');
    assert.strictEqual(wallLos.clear, false);

    // Shot from street through solid west wall segment at z = 2.8:
    const backWallLos = checkLineOfSight(-18.0, 1.5, 2.8, -13.5, 1.5, 2.8, 'urban');
    assert.strictEqual(backWallLos.status, 'BLOCKED', 'Shot through solid west wall segment must be BLOCKED');
    assert.strictEqual(backWallLos.clear, false);
  });

  await t.test('Urban: Parked tactical van at center blocks cross-street shots', () => {
    // Van is at (0.2, 1.0, 0.2) with half-extents (2.2, 1.0, 1.05)
    // Ray crossing along X axis from (-5, 1.2, 0.2) to (5, 1.2, 0.2)
    const vanCross = checkLineOfSight(-5, 1.2, 0.2, 5, 1.2, 0.2, 'urban');
    assert.strictEqual(vanCross.status, 'BLOCKED', 'Shot through tactical van chassis must be BLOCKED');
    assert.strictEqual(vanCross.clear, false);
    assert.strictEqual(vanCross.blocker, 'van_center');

    // Parallel ray outside van footprint (z = 4.0) must be clear
    const vanClearLane = checkLineOfSight(-5, 1.2, 4.0, 5, 1.2, 4.0, 'urban');
    assert.strictEqual(vanClearLane.status, 'CLEAR', 'Shot parallel to van in open lane must be CLEAR');
    assert.strictEqual(vanClearLane.clear, true);
  });

  await t.test('Urban: Jersey barrier blocks low shots and allows shots over top', () => {
    // Jersey barrier barrier_c1 at (-4.5, 0.45, 4.5), height 0.9m (y: 0 to 0.9)
    // Low shot across barrier at y = 0.4:
    const lowShot = checkLineOfSight(-4.5, 0.4, 1.0, -4.5, 0.4, 8.0, 'urban');
    assert.strictEqual(lowShot.status, 'BLOCKED', 'Low shot across Jersey barrier must be BLOCKED');
    assert.strictEqual(lowShot.clear, false);

    // Standing shot over barrier at y = 1.6:
    const highShot = checkLineOfSight(-4.5, 1.6, 1.0, -4.5, 1.6, 8.0, 'urban');
    assert.strictEqual(highShot.status, 'CLEAR', 'High shot passing over Jersey barrier must be CLEAR');
    assert.strictEqual(highShot.clear, true);
  });

  // -------------------------------------------------------------------------
  // 2. Desert Map Prop & Lane Tests
  // -------------------------------------------------------------------------
  await t.test('Desert: Central bunker walk-through corridor and corner pillars', () => {
    // Bunker center at (0, 0, 0). Roof at y=2.8. Entrance passage along Z axis at x=0.
    // Straight shot through central corridor from (0, 1.5, -6) to (0, 1.5, 6):
    const corridorShot = checkLineOfSight(0, 1.5, -6, 0, 1.5, 6, 'desert');
    assert.strictEqual(corridorShot.status, 'CLEAR', 'Shot through open central bunker corridor must be CLEAR');
    assert.strictEqual(corridorShot.clear, true);

    // Shot through bunker NW pillar at (-2.6, 1.3, 2.6):
    const pillarShot = checkLineOfSight(-5, 1.5, 2.6, 0, 1.5, 2.6, 'desert');
    assert.strictEqual(pillarShot.status, 'BLOCKED', 'Shot through bunker concrete pillar must be BLOCKED');
    assert.strictEqual(pillarShot.clear, false);

    // High shot through bunker roof slab:
    const roofShot = checkLineOfSight(0, 4.0, -6, 0, 1.0, 6, 'desert');
    assert.strictEqual(roofShot.status, 'BLOCKED', 'Shot angling through bunker roof must be BLOCKED');
    assert.strictEqual(roofShot.clear, false);
  });

  await t.test('Desert: Shipping container cover and flank fire lanes', () => {
    // Container cont_1 at (-13.5, 1.5, -9.5) size: hx=1.6, hy=1.5, hz=3.8
    // Direct shot through container:
    const throughCont = checkLineOfSight(-18, 1.5, -9.5, -9, 1.5, -9.5, 'desert');
    assert.strictEqual(throughCont.status, 'BLOCKED', 'Shot through shipping container must be BLOCKED');
    assert.strictEqual(throughCont.clear, false);

    // Flank shot just outside container width:
    const flankCont = checkLineOfSight(-18, 1.5, -5.0, -9, 1.5, -5.0, 'desert');
    assert.strictEqual(flankCont.status, 'CLEAR', 'Shot flanking container must be CLEAR');
    assert.strictEqual(flankCont.clear, true);
  });

  await t.test('Desert: Sandbags block prone/crouched shots, clear standing shots', () => {
    // Sandbag sb_s1 at (-5.5, 0.375, -15.5), y in [0, 0.75]
    const proneShot = checkLineOfSight(-5.5, 0.35, -12, -5.5, 0.35, -19, 'desert');
    assert.strictEqual(proneShot.status, 'BLOCKED', 'Prone shot through sandbag wall must be BLOCKED');
    assert.strictEqual(proneShot.clear, false);

    const standingShot = checkLineOfSight(-5.5, 1.5, -12, -5.5, 1.5, -19, 'desert');
    assert.strictEqual(standingShot.status, 'CLEAR', 'Standing shot over sandbag wall must be CLEAR');
    assert.strictEqual(standingShot.clear, true);
  });

  await t.test('Desert: Open dune fire lane permits full-distance sniper visibility', () => {
    // Open lane along x = 8 from z = -25 to z = 25
    const duneLane = checkLineOfSight(8, 1.5, -25, 8, 1.5, 25, 'desert');
    assert.strictEqual(duneLane.status, 'CLEAR', 'Long-range open dune lane must be CLEAR');
    assert.strictEqual(duneLane.clear, true);
  });

  // -------------------------------------------------------------------------
  // 3. Industrial Map Prop & Lane Tests
  // -------------------------------------------------------------------------
  await t.test('Industrial: Catwalk bridge, deck obstruction, and clearance underneath', () => {
    // Catwalk bridge at (0, 3.0, 0) with thickness y in [2.875, 3.125]
    // Shot passing directly underneath catwalk at y = 1.5:
    const underCatwalk = checkLineOfSight(0, 1.5, -5, 0, 1.5, 5, 'industrial');
    assert.strictEqual(underCatwalk.status, 'CLEAR', 'Shot beneath elevated catwalk must be CLEAR');
    assert.strictEqual(underCatwalk.clear, true);

    // Angled shot intersecting catwalk deck:
    const hitCatwalkDeck = checkLineOfSight(0, 4.0, -5, 0, 2.0, 5, 'industrial');
    assert.strictEqual(hitCatwalkDeck.status, 'BLOCKED', 'Angled shot through catwalk deck must be BLOCKED');
    assert.strictEqual(hitCatwalkDeck.clear, false);

    // Shot through catwalk support pillar at (-8, 1.5, 0):
    const hitSupport = checkLineOfSight(-10, 1.5, 0, -5, 1.5, 0, 'industrial');
    assert.strictEqual(hitSupport.status, 'BLOCKED', 'Shot through catwalk support pillar must be BLOCKED');
    assert.strictEqual(hitSupport.clear, false);
  });

  await t.test('Industrial: Warehouse partition bay walls block through-wall shots', () => {
    // Warehouse bay bay_nw_1 at (-11, 1.8, 10), hx=3.75, hy=1.8, hz=0.4
    const throughBayWall = checkLineOfSight(-11, 1.5, 7, -11, 1.5, 13, 'industrial');
    assert.strictEqual(throughBayWall.status, 'BLOCKED', 'Shot through warehouse partition wall must be BLOCKED');
    assert.strictEqual(throughBayWall.clear, false);

    const clearAisle = checkLineOfSight(-5, 1.5, 7, -5, 1.5, 13, 'industrial');
    assert.strictEqual(clearAisle.status, 'CLEAR', 'Shot through warehouse aisle must be CLEAR');
    assert.strictEqual(clearAisle.clear, true);
  });

  await t.test('Industrial: Heavy electrical generator and fuel silo tanks', () => {
    // Generator gen_sw at (-12, 1.15, -11), half-extents (2.1, 1.15, 1.3)
    const throughGen = checkLineOfSight(-12, 1.0, -7, -12, 1.0, -15, 'industrial');
    assert.strictEqual(throughGen.status, 'BLOCKED', 'Shot through heavy generator must be BLOCKED');
    assert.strictEqual(throughGen.clear, false);

    // Silo tank tank_1 at (-21, 2.2, 11), hx=1.4, hy=2.2, hz=1.4
    const throughTank = checkLineOfSight(-25, 1.5, 11, -17, 1.5, 11, 'industrial');
    assert.strictEqual(throughTank.status, 'BLOCKED', 'Shot through silo tank must be BLOCKED');
    assert.strictEqual(throughTank.clear, false);
  });

  // -------------------------------------------------------------------------
  // 4. Forest Map Prop & Lane Tests
  // -------------------------------------------------------------------------
  await t.test('Forest: Wooden cabin shell walls block, central doorway allows entry/exit fire', () => {
    // West cabin centered at (-13.5, 0). North entrance at z = +3.25, South entrance at z = -3.25.
    // Inside cabin at (-13.5, 1.4, 0).
    // Shot through north doorway opening (x = -13.5, z in [-0.7, 0.7]):
    const cabinNorthDoor = checkLineOfSight(-13.5, 1.4, 0, -13.5, 1.4, 6.0, 'forest');
    assert.strictEqual(cabinNorthDoor.status, 'CLEAR', 'Shot through cabin north doorway must be CLEAR');
    assert.strictEqual(cabinNorthDoor.clear, true);

    // Shot through solid east flank wall (cabin_w_wall_e at x = -10.95):
    const cabinEastWall = checkLineOfSight(-13.5, 1.4, 0, -7.0, 1.4, 0, 'forest');
    assert.strictEqual(cabinEastWall.status, 'BLOCKED', 'Shot through cabin solid flank wall must be BLOCKED');
    assert.strictEqual(cabinEastWall.clear, false);
  });

  await t.test('Forest: Center granite rock outcrop blocks direct line of sight', () => {
    // Rock outcrop rock_center at (0, 0.9, 0), half-extents (2.5, 0.9, 2.5)
    const throughRock = checkLineOfSight(-5, 0.8, 0, 5, 0.8, 0, 'forest');
    assert.strictEqual(throughRock.status, 'BLOCKED', 'Shot through granite rock outcrop must be BLOCKED');
    assert.strictEqual(throughRock.clear, false);

    // High shot over rock outcrop:
    const overRock = checkLineOfSight(-5, 2.5, 0, 5, 2.5, 0, 'forest');
    assert.strictEqual(overRock.status, 'CLEAR', 'Shot over rock outcrop must be CLEAR');
    assert.strictEqual(overRock.clear, true);
  });

  await t.test('Forest: Fallen logs and pine tree trunks', () => {
    // Fallen log log_s1 at (-4.5, 0.45, -13.5), y in [0, 0.91]
    const proneLog = checkLineOfSight(-4.5, 0.3, -11, -4.5, 0.3, -16, 'forest');
    assert.strictEqual(proneLog.status, 'BLOCKED', 'Low shot across fallen log must be BLOCKED');
    assert.strictEqual(proneLog.clear, false);

    const standLog = checkLineOfSight(-4.5, 1.5, -11, -4.5, 1.5, -16, 'forest');
    assert.strictEqual(standLog.status, 'CLEAR', 'Standing shot over fallen log must be CLEAR');
    assert.strictEqual(standLog.clear, true);

    // Pine tree pine_0 at (-24, 1.75, -12), half-extents (0.5, 1.75, 0.5)
    const throughTree = checkLineOfSight(-24, 1.5, -8, -24, 1.5, -16, 'forest');
    assert.strictEqual(throughTree.status, 'BLOCKED', 'Direct shot through tree trunk must be BLOCKED');
    assert.strictEqual(throughTree.clear, false);

    const besideTree = checkLineOfSight(-22.5, 1.5, -8, -22.5, 1.5, -16, 'forest');
    assert.strictEqual(besideTree.status, 'CLEAR', 'Shot adjacent to tree trunk must be CLEAR');
    assert.strictEqual(besideTree.clear, true);
  });

  // -------------------------------------------------------------------------
  // 5. RES-2: Origin-Inside-AABB Solid Cover Tests
  // -------------------------------------------------------------------------
  await t.test('RES-2: Ray origin strictly inside any solid obstacle AABB is immediately blocked', () => {
    const testBox: ServerAABB = {
      minX: 10, maxX: 14,
      minY: 0,  maxY: 3,
      minZ: 10, maxZ: 14,
      id: 'solid_bunker_pillar',
    };

    // Point strictly inside the solid AABB
    const insideOrigin = { ox: 12, oy: 1.5, oz: 12 };
    // Firing in any direction
    const resultOutward = rayIntersectsAABB(insideOrigin.ox, insideOrigin.oy, insideOrigin.oz, 0, 0, 1, 20, testBox);
    assert.strictEqual(resultOutward.hit, true, 'Ray starting inside solid AABB must be hit: true');
    assert.strictEqual(resultOutward.t, 0, 'Ray starting inside solid AABB must have t = 0 (immediate collision)');

    // Real map test: ray starting inside center van on urban map
    // Van is at x in [-2.0, 2.4], y in [0, 2.0], z in [-0.85, 1.25]
    const vanOriginLos = checkLineOfSight(0.2, 1.0, 0.2, 8.0, 1.0, 0.2, 'urban');
    assert.strictEqual(vanOriginLos.status, 'BLOCKED', 'Shot originating inside solid vehicle chassis must be BLOCKED');
    assert.strictEqual(vanOriginLos.clear, false);
    assert.strictEqual(vanOriginLos.distance, 0);

    // Real map test: ray starting inside rock_center on forest map
    const rockOriginLos = checkLineOfSight(0, 0.5, 0, 10, 0.5, 0, 'forest');
    assert.strictEqual(rockOriginLos.status, 'BLOCKED', 'Shot originating inside solid rock outcrop must be BLOCKED');
    assert.strictEqual(rockOriginLos.clear, false);
    assert.strictEqual(rockOriginLos.distance, 0);

    // Real map test: ray starting inside shipping container on desert map
    const contOriginLos = checkLineOfSight(-13.5, 1.0, -9.5, -5.0, 1.0, -9.5, 'desert');
    assert.strictEqual(contOriginLos.status, 'BLOCKED', 'Shot originating inside shipping container must be BLOCKED');
    assert.strictEqual(contOriginLos.clear, false);
    assert.strictEqual(contOriginLos.distance, 0);
  });

  // -------------------------------------------------------------------------
  // 6. RES-1: Explicit Fail-Closed Map Collision Registry Tests
  // -------------------------------------------------------------------------
  await t.test('RES-1: Unregistered or unknown map IDs strictly fail closed', () => {
    const unknownId = 'custom_unregistered_deathmatch_v1';
    assert.strictEqual(isMapRegistered(unknownId), false);

    const checkRes = checkLineOfSight(0, 1.5, 0, 10, 1.5, 0, unknownId);
    assert.strictEqual(checkRes.status, 'UNKNOWN_MAP', 'checkLineOfSight must return UNKNOWN_MAP for unknown map ID');
    assert.strictEqual(checkRes.clear, false);

    const hasRes = hasLineOfSight(0, 1.5, 0, 10, 1.5, 0, unknownId);
    assert.strictEqual(hasRes, false, 'hasLineOfSight must return false for unknown map ID');

    // Undefined / empty string map IDs
    assert.strictEqual(hasLineOfSight(0, 1.5, 0, 10, 1.5, 0, ''), false);
    assert.strictEqual(hasLineOfSight(0, 1.5, 0, 10, 1.5, 0, undefined as any), false);
  });

  await t.test('RES-1: Empty or corrupted map collision data fails closed', () => {
    const emptyMapId = 'test_empty_map';
    // registerMapCollision strictly rejects empty arrays
    assert.throws(
      () => registerMapCollision(emptyMapId, []),
      /must be a non-empty array/
    );

    // registerMapCollision strictly rejects invalid / inverted AABBs
    const corruptMapId = 'test_corrupt_map';
    assert.throws(
      () => registerMapCollision(corruptMapId, [
        { minX: 10, maxX: 5, minY: 0, maxY: 2, minZ: 0, maxZ: 2, id: 'inverted_box' },
      ]),
      /invalid AABB/
    );

    // If corrupted box data were directly injected, checkLineOfSight safely catches it
    (getRegisteredMapIds() as any); // verify registry is accessible
    assert.strictEqual(isMapRegistered(corruptMapId), false);
    assert.strictEqual(hasLineOfSight(0, 1.5, 0, 10, 1.5, 0, corruptMapId), false);
  });
});
