/**
 * server/mapCollision.ts
 * Server-side AABB-based collision representation for occlusion / line-of-sight checks.
 *
 * Technical design:
 *  - Explicit map-collision registration with fail-closed semantics (RES-1).
 *  - Every playable map (urban, desert, industrial, forest) has registered collision data.
 *  - Unknown or undefined map IDs fail closed (return false / MAP_COLLISION_DATA_UNAVAILABLE).
 *  - Enterable buildings and cabins are modeled as shell walls with explicit doorway openings,
 *    preserving genuine interior open space (RES-2).
 *  - All AABBs represent truly solid geometry (concrete walls, rocks, vehicles, containers).
 *  - A ray originating inside any solid AABB is immediately blocked (RES-2).
 *  - Slab-method ray–AABB intersection with unit-direction normalization and numerical safety.
 *
 * Coordinate convention: +Z forward (north), +Y up, +X right (matching game world).
 */

export interface ServerAABB {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  label?: string; // debug label
}

export type PlayableMapId = 'urban' | 'desert' | 'industrial' | 'forest';

export const PLAYABLE_MAP_IDS: readonly PlayableMapId[] = [
  'urban',
  'desert',
  'industrial',
  'forest',
] as const;

export type LosStatus =
  | 'CLEAR'
  | 'BLOCKED'
  | 'UNKNOWN_MAP'
  | 'MISSING_COLLISION_DATA'
  | 'MALFORMED_COLLISION_DATA';

export interface LosCheckResult {
  clear: boolean;
  status: LosStatus;
  blocker?: string;
  distance?: number;
  message?: string;
}

/** Build an AABB from a centre position and half-extents (matching Babylon createBox sizing). */
export function box(
  cx: number, cy: number, cz: number,
  hx: number, hy: number, hz: number,
  label?: string
): ServerAABB {
  return {
    minX: cx - hx,
    minY: cy - hy,
    minZ: cz - hz,
    maxX: cx + hx,
    maxY: cy + hy,
    maxZ: cz + hz,
    label,
  };
}

/** Validates that an AABB has finite coordinates and non-inverted bounds. */
export function isValidAABB(b: ServerAABB): boolean {
  if (!b || typeof b !== 'object') return false;
  return (
    Number.isFinite(b.minX) &&
    Number.isFinite(b.minY) &&
    Number.isFinite(b.minZ) &&
    Number.isFinite(b.maxX) &&
    Number.isFinite(b.maxY) &&
    Number.isFinite(b.maxZ) &&
    b.minX <= b.maxX &&
    b.minY <= b.maxY &&
    b.minZ <= b.maxZ
  );
}

/**
 * Slab-method ray–AABB intersection.
 *
 * @param ox  Ray origin X
 * @param oy  Ray origin Y
 * @param oz  Ray origin Z
 * @param dx  Unit direction X
 * @param dy  Unit direction Y
 * @param dz  Unit direction Z
 * @param maxDist  Maximum ray length to test (metres)
 * @param aabb  Solid obstacle to test against
 * @returns `{ hit: boolean, t: number }`
 */
export function rayIntersectsAABB(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDist: number,
  aabb: ServerAABB
): { hit: boolean; t: number } {
  if (!Number.isFinite(maxDist) || maxDist <= 0) {
    return { hit: false, t: Infinity };
  }

  // RES-2: Every AABB represents a solid obstacle.
  // If the ray origin is inside a solid AABB, the shooter is inside solid matter.
  // Such shots are immediately blocked.
  if (
    ox >= aabb.minX && ox <= aabb.maxX &&
    oy >= aabb.minY && oy <= aabb.maxY &&
    oz >= aabb.minZ && oz <= aabb.maxZ
  ) {
    return { hit: true, t: 0 };
  }

  // Small epsilon along unit direction for numerical stability
  const EPSILON = 0.04;
  const ox2 = ox + dx * EPSILON;
  const oy2 = oy + dy * EPSILON;
  const oz2 = oz + dz * EPSILON;

  let tMin = -Infinity;
  let tMax = Infinity;

  // X slab
  if (dx === 0) {
    if (ox2 < aabb.minX || ox2 > aabb.maxX) {
      return { hit: false, t: Infinity };
    }
  } else {
    const invDx = 1 / dx;
    const tx1 = (aabb.minX - ox2) * invDx;
    const tx2 = (aabb.maxX - ox2) * invDx;
    tMin = Math.max(tMin, Math.min(tx1, tx2));
    tMax = Math.min(tMax, Math.max(tx1, tx2));
  }

  // Y slab
  if (dy === 0) {
    if (oy2 < aabb.minY || oy2 > aabb.maxY) {
      return { hit: false, t: Infinity };
    }
  } else {
    const invDy = 1 / dy;
    const ty1 = (aabb.minY - oy2) * invDy;
    const ty2 = (aabb.maxY - oy2) * invDy;
    tMin = Math.max(tMin, Math.min(ty1, ty2));
    tMax = Math.min(tMax, Math.max(ty1, ty2));
  }

  // Z slab
  if (dz === 0) {
    if (oz2 < aabb.minZ || oz2 > aabb.maxZ) {
      return { hit: false, t: Infinity };
    }
  } else {
    const invDz = 1 / dz;
    const tz1 = (aabb.minZ - oz2) * invDz;
    const tz2 = (aabb.maxZ - oz2) * invDz;
    tMin = Math.max(tMin, Math.min(tz1, tz2));
    tMax = Math.min(tMax, Math.max(tz1, tz2));
  }

  // Ray misses the box or box is entirely behind origin
  if (tMax < 0 || tMin > tMax) {
    return { hit: false, t: Infinity };
  }

  // Intersection must be within ray travel distance
  if (tMin < maxDist - EPSILON) {
    return { hit: true, t: Math.max(0, tMin) };
  }

  return { hit: false, t: Infinity };
}

// ---------------------------------------------------------------------------
// Map Geometry Definitions
// ---------------------------------------------------------------------------

function perimeterWalls(halfExtent: number, wallHeight: number): ServerAABB[] {
  const t = 2.0; // wall thickness
  const hh = wallHeight / 2;
  const cy = hh;
  const he = halfExtent + t / 2;
  return [
    box(0, cy, -(halfExtent + t / 2), he, hh, t / 2, 'wall_south'),
    box(0, cy, (halfExtent + t / 2),  he, hh, t / 2, 'wall_north'),
    box(-(halfExtent + t / 2), cy, 0, t / 2, hh, he, 'wall_west'),
    box((halfExtent + t / 2), cy, 0,  t / 2, hh, he, 'wall_east'),
  ];
}

/**
 * Enterable urban storefront (RES-2).
 * Mirrors buildEnterableBuilding() in src/maps/urbanMap.ts:
 * Preserves the open interior and doorway openings at north, south, and west/east.
 */
function buildEnterableStorefrontBoxes(prefix: string, originX: number, originZ: number): ServerAABB[] {
  const h = 3.2;
  const hy = h / 2;
  return [
    // Flat roof slab
    box(originX, h + 0.15, originZ, 3.1, 0.15, 4.5, `${prefix}_roof`),
    // West wall segments with central opening
    box(originX - 2.92, hy, originZ + 2.8, 0.175, hy, 1.7, `${prefix}_w_n`),
    box(originX - 2.92, hy, originZ - 2.8, 0.175, hy, 1.7, `${prefix}_w_s`),
    // East wall segments with central opening
    box(originX + 2.92, hy, originZ + 2.8, 0.175, hy, 1.7, `${prefix}_e_n`),
    box(originX + 2.92, hy, originZ - 2.8, 0.175, hy, 1.7, `${prefix}_e_s`),
    // North wall left and right segments leaving central doorway
    box(originX - 2.0, hy, originZ + 4.32, 1.1, hy, 0.175, `${prefix}_n_l`),
    box(originX + 2.0, hy, originZ + 4.32, 1.1, hy, 0.175, `${prefix}_n_r`),
    // South wall left and right segments leaving central doorway
    box(originX - 2.0, hy, originZ - 4.32, 1.1, hy, 0.175, `${prefix}_s_l`),
    box(originX + 2.0, hy, originZ - 4.32, 1.1, hy, 0.175, `${prefix}_s_r`),
    // Low service counter in shop interior
    box(originX, 0.55, originZ, 0.8, 0.55, 0.4, `${prefix}_counter`),
  ];
}

/**
 * Enterable tactical wooden cabin (RES-2).
 * Mirrors buildWoodenCabin() in src/maps/forestMap.ts:
 * Preserves the open cabin interior with north/south entrance doorways.
 */
function buildWoodenCabinBoxes(prefix: string, originX: number, originZ: number): ServerAABB[] {
  const h = 2.9;
  const hy = h / 2;
  return [
    // Pitched gable roof slab
    box(originX, h + 0.15, originZ, 3.05, 0.14, 3.75, `${prefix}_roof`),
    // Solid west and east flank walls
    box(originX - 2.55, hy, originZ, 0.15, hy, 3.4, `${prefix}_wall_w`),
    box(originX + 2.55, hy, originZ, 0.15, hy, 3.4, `${prefix}_wall_e`),
    // North wall left and right segments leaving central entrance
    box(originX - 1.7, hy, originZ + 3.25, 1.0, hy, 0.15, `${prefix}_n_l`),
    box(originX + 1.7, hy, originZ + 3.25, 1.0, hy, 0.15, `${prefix}_n_r`),
    // South wall left and right segments leaving central entrance
    box(originX - 1.7, hy, originZ - 3.25, 1.0, hy, 0.15, `${prefix}_s_l`),
    box(originX + 1.7, hy, originZ - 3.25, 1.0, hy, 0.15, `${prefix}_s_r`),
  ];
}

// ---------------------------------------------------------------------------
// Static Map Collision Data
// ---------------------------------------------------------------------------

const URBAN_BOXES: ServerAABB[] = [
  ...perimeterWalls(29, 7.5),
  // West enterable storefront shell
  ...buildEnterableStorefrontBoxes('bldg_w', -13.5, 0),
  // East enterable storefront shell
  ...buildEnterableStorefrontBoxes('bldg_e', 13.5, 0),
  // Corner NW building at (-22, 3, 14) size 6x6x6
  box(-22, 3.0, 14, 3.0, 3.0, 3.0, 'corner_nw'),
  // Corner SE building at (22, 3, -14) size 6x6x6
  box(22, 3.0, -14, 3.0, 3.0, 3.0, 'corner_se'),
  // Tactical trucks and van
  box(-2.5, 1.0, -11.5, 1.1, 1.0, 2.2, 'truck_mid_s'),
  box(2.8, 1.0, 11.5, 1.1, 1.0, 2.2, 'truck_mid_n'),
  box(0.2, 1.0, 0.2, 2.2, 1.0, 1.05, 'van_center'),
  // Jersey barriers
  box(-4.5, 0.45, 4.5, 1.8, 0.45, 0.4, 'barrier_c1'),
  box(4.5, 0.45, -4.5, 1.8, 0.45, 0.4, 'barrier_c2'),
  box(-10, 0.45, -16, 1.7, 0.45, 0.4, 'barrier_s1'),
  box(10, 0.45, 16, 1.7, 0.45, 0.4, 'barrier_n1'),
  // Street arch sign posts
  box(-7.5, 3.2, -17.5, 0.23, 3.2, 0.23, 'arch_post_l'),
  box(7.5, 3.2, -17.5, 0.23, 3.2, 0.23, 'arch_post_r'),
  box(0, 6.2, -17.5, 7.75, 0.45, 0.25, 'arch_beam'),
];

const DESERT_BOXES: ServerAABB[] = [
  ...perimeterWalls(29, 5.5),
  // Central walk-through bunker
  box(0, 2.8, 0, 3.6, 0.175, 3.6, 'bunker_roof'),
  box(-2.6, 1.3, 2.6, 1.0, 1.3, 1.0, 'bunker_nw'),
  box(2.6, 1.3, 2.6, 1.0, 1.3, 1.0, 'bunker_ne'),
  box(-2.6, 1.3, -2.6, 1.0, 1.3, 1.0, 'bunker_sw'),
  box(2.6, 1.3, -2.6, 1.0, 1.3, 1.0, 'bunker_se'),
  box(3.3, 0.55, 0, 0.225, 0.55, 1.6, 'bunker_lip_e'),
  box(-3.3, 0.55, 0, 0.225, 0.55, 1.6, 'bunker_lip_w'),
  // Shipping containers
  box(-13.5, 1.5, -9.5, 1.6, 1.5, 3.8, 'cont_1'),
  box(13.5, 1.5, 9.5, 1.6, 1.5, 3.8, 'cont_2'),
  box(-13.5, 1.5, 10.5, 3.6, 1.5, 1.6, 'cont_3'),
  box(13.5, 1.5, -10.5, 3.6, 1.5, 1.6, 'cont_4'),
  // Guard towers
  box(-20, 2.8, -10, 1.9, 0.125, 1.9, 'tower_sw_deck'),
  box(-20, 3.4, -10, 1.9, 0.45, 1.9, 'tower_sw_wall_approx'),
  box(20, 2.8, 10, 1.9, 0.125, 1.9, 'tower_ne_deck'),
  box(20, 3.4, 10, 1.9, 0.45, 1.9, 'tower_ne_wall_approx'),
  // Sandbag defensive positions
  box(-5.5, 0.375, -15.5, 2.1, 0.375, 0.4, 'sb_s1'),
  box(6.5, 0.375, -15.5, 2.1, 0.375, 0.4, 'sb_s2'),
  box(-6.5, 0.375, 15.5, 2.1, 0.375, 0.4, 'sb_n1'),
  box(5.5, 0.375, 15.5, 2.1, 0.375, 0.4, 'sb_n2'),
];

const INDUSTRIAL_BOXES: ServerAABB[] = [
  ...perimeterWalls(29, 8.5),
  // Catwalk bridge
  box(0, 3.0, 0, 9.0, 0.125, 1.6, 'catwalk_bridge'),
  box(0, 3.55, 1.5, 9.0, 0.425, 0.075, 'catwalk_rail_n'),
  box(0, 3.55, -1.5, 9.0, 0.425, 0.075, 'catwalk_rail_s'),
  box(-8, 1.5, 0, 0.3, 1.5, 1.4, 'catwalk_sup_w'),
  box(8, 1.5, 0, 0.3, 1.5, 1.4, 'catwalk_sup_e'),
  // Warehouse partition bays
  box(-11, 1.8, 10, 3.75, 1.8, 0.4, 'bay_nw_1'),
  box(-14.3, 1.8, 14, 0.4, 1.8, 3.6, 'bay_nw_2'),
  box(11, 1.8, -10, 3.75, 1.8, 0.4, 'bay_se_1'),
  box(14.3, 1.8, -14, 0.4, 1.8, 3.6, 'bay_se_2'),
  // Generators
  box(-12, 1.15, -11, 2.1, 1.15, 1.3, 'gen_sw'),
  box(12, 1.15, 11, 2.1, 1.15, 1.3, 'gen_ne'),
  box(0, 0.9, 10.5, 2.3, 0.9, 0.9, 'gen_mid_n'),
  box(0, 0.9, -10.5, 2.3, 0.9, 0.9, 'gen_mid_s'),
  // Silo tanks
  box(-21, 2.2, 11, 1.4, 2.2, 1.4, 'tank_1'),
  box(-21, 2.2, 15.5, 1.4, 2.2, 1.4, 'tank_2'),
  box(21, 2.2, -11, 1.4, 2.2, 1.4, 'tank_3'),
  box(21, 2.2, -15.5, 1.4, 2.2, 1.4, 'tank_4'),
  // Crate clusters
  box(-4.5, 0.75, -4.5, 1.2, 0.75, 1.2, 'crate_1'),
  box(4.5, 0.75, 4.5, 1.2, 0.75, 1.2, 'crate_2'),
];

const FOREST_BOXES: ServerAABB[] = [
  ...perimeterWalls(29, 4.5),
  // West & East enterable wooden cabins
  ...buildWoodenCabinBoxes('cabin_w', -13.5, 0),
  ...buildWoodenCabinBoxes('cabin_e', 13.5, 0),
  // Granite rock outcrops
  box(0, 0.9, 0, 2.5, 0.9, 2.5, 'rock_center'),
  box(-7.5, 0.7, 12.5, 2.0, 0.7, 2.0, 'rock_nw'),
  box(7.5, 0.7, -12.5, 2.0, 0.7, 2.0, 'rock_se'),
  box(16.5, 0.65, 12.0, 1.8, 0.65, 1.8, 'rock_ne'),
  box(-16.5, 0.65, -12.0, 1.8, 0.65, 1.8, 'rock_sw'),
  // Fallen logs
  box(-4.5, 0.45, -13.5, 1.9, 0.46, 0.46, 'log_s1'),
  box(4.5, 0.45, 13.5, 1.9, 0.46, 0.46, 'log_n1'),
  box(-5.5, 0.45, 5.2, 0.46, 0.46, 1.8, 'log_c1'),
  box(5.5, 0.45, -5.2, 0.46, 0.46, 1.8, 'log_c2'),
  // Pine tree trunks
  box(-24, 1.75, -12, 0.5, 1.75, 0.5, 'pine_0'),
  box(-23, 1.5, 12, 0.5, 1.5, 0.5, 'pine_1'),
  box(-5, 1.5, -18.5, 0.5, 1.5, 0.5, 'pine_4'),
  box(5, 1.5, 18.5, 0.5, 1.5, 0.5, 'pine_5'),
  box(24, 1.5, -12, 0.5, 1.5, 0.5, 'pine_8'),
  box(23, 1.5, 12, 0.5, 1.5, 0.5, 'pine_9'),
];

// ---------------------------------------------------------------------------
// Map Collision Registry (RES-1: Fail-Closed Registration)
// ---------------------------------------------------------------------------

const COLLISION_REGISTRY = new Map<string, readonly ServerAABB[]>();

/** Register map collision data. Rejects empty or malformed box definitions. */
export function registerMapCollision(mapId: string, boxes: readonly ServerAABB[]): void {
  if (!mapId || typeof mapId !== 'string') {
    throw new Error('registerMapCollision: mapId must be a non-empty string');
  }
  if (!Array.isArray(boxes) || boxes.length === 0) {
    throw new Error(`registerMapCollision: boxes for map '${mapId}' must be a non-empty array`);
  }
  for (let i = 0; i < boxes.length; i++) {
    if (!isValidAABB(boxes[i])) {
      throw new Error(`registerMapCollision: invalid AABB at index ${i} for map '${mapId}'`);
    }
  }
  COLLISION_REGISTRY.set(mapId.toLowerCase().trim(), Object.freeze([...boxes]));
}

/** Unregisters map collision data (for testing purposes). */
export function unregisterMapCollision(mapId: string): boolean {
  return COLLISION_REGISTRY.delete(mapId.toLowerCase().trim());
}

/** Returns all currently registered map IDs. */
export function getRegisteredMapIds(): string[] {
  return Array.from(COLLISION_REGISTRY.keys());
}

/** Returns whether a map ID is registered and has collision data. */
export function isMapRegistered(mapId: string): boolean {
  if (!mapId || typeof mapId !== 'string') return false;
  const boxes = COLLISION_REGISTRY.get(mapId.toLowerCase().trim());
  return Array.isArray(boxes) && boxes.length > 0;
}

/** Gets the collision boxes for a registered map. */
export function getMapCollisionBoxes(mapId: string): readonly ServerAABB[] | undefined {
  if (!mapId || typeof mapId !== 'string') return undefined;
  return COLLISION_REGISTRY.get(mapId.toLowerCase().trim());
}

// Initialize all supported playable maps on module load
registerMapCollision('urban', URBAN_BOXES);
registerMapCollision('desert', DESERT_BOXES);
registerMapCollision('industrial', INDUSTRIAL_BOXES);
registerMapCollision('forest', FOREST_BOXES);

/** Backwards-compatibility read-only dictionary view. */
export const MAP_COLLISION_DATA: Readonly<Record<string, readonly ServerAABB[]>> = {
  get urban() { return COLLISION_REGISTRY.get('urban') ?? []; },
  get desert() { return COLLISION_REGISTRY.get('desert') ?? []; },
  get industrial() { return COLLISION_REGISTRY.get('industrial') ?? []; },
  get forest() { return COLLISION_REGISTRY.get('forest') ?? []; },
};

// ---------------------------------------------------------------------------
// Server Authoritative Line-of-Sight Query (RES-1 & RES-2)
// ---------------------------------------------------------------------------

/**
 * checkLineOfSight
 *
 * Full diagnostic LOS query with fail-closed semantics.
 * Returns clear: false when:
 *  - mapId is undefined, null, or empty string (UNKNOWN_MAP)
 *  - mapId is not registered in COLLISION_REGISTRY (UNKNOWN_MAP)
 *  - map collision data is empty or corrupted (MISSING_COLLISION_DATA / MALFORMED_COLLISION_DATA)
 *  - ray hits an AABB (BLOCKED)
 *  - ray origin is inside an AABB (BLOCKED)
 *
 * Returns clear: true only when the path is verified unobstructed on a registered map.
 */
export function checkLineOfSight(
  fromX: number, fromY: number, fromZ: number,
  toX:   number, toY:   number, toZ:   number,
  mapId: string | undefined
): LosCheckResult {
  // RES-1: Fail closed if mapId is missing
  if (!mapId || typeof mapId !== 'string') {
    return {
      clear: false,
      status: 'UNKNOWN_MAP',
      message: 'Map ID is undefined or missing',
    };
  }

  const normalizedMapId = mapId.toLowerCase().trim();
  const boxes = COLLISION_REGISTRY.get(normalizedMapId);

  // RES-1: Fail closed if map is not registered
  if (!boxes) {
    return {
      clear: false,
      status: 'UNKNOWN_MAP',
      message: `Map '${mapId}' is not registered in the authoritative collision registry`,
    };
  }

  // RES-1: Fail closed if collision data is empty
  if (boxes.length === 0) {
    return {
      clear: false,
      status: 'MISSING_COLLISION_DATA',
      message: `Collision data for map '${mapId}' is empty`,
    };
  }

  // Numerical safety: coordinates must be finite
  if (
    !Number.isFinite(fromX) || !Number.isFinite(fromY) || !Number.isFinite(fromZ) ||
    !Number.isFinite(toX)   || !Number.isFinite(toY)   || !Number.isFinite(toZ)
  ) {
    return {
      clear: false,
      status: 'MALFORMED_COLLISION_DATA',
      message: 'Ray coordinates contain non-finite numbers (NaN/Infinity)',
    };
  }

  const dx = toX - fromX;
  const dy = toY - fromY;
  const dz = toZ - fromZ;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Coincident or zero-length rays: check if origin is inside any obstacle
  if (dist < 0.001) {
    for (const aabb of boxes) {
      if (
        fromX >= aabb.minX && fromX <= aabb.maxX &&
        fromY >= aabb.minY && fromY <= aabb.maxY &&
        fromZ >= aabb.minZ && fromZ <= aabb.maxZ
      ) {
        return {
          clear: false,
          status: 'BLOCKED',
          blocker: aabb.label,
          distance: 0,
          message: `Ray origin is inside solid geometry: ${aabb.label}`,
        };
      }
    }
    return { clear: true, status: 'CLEAR' };
  }

  // Normalise unit direction vector
  const ndx = dx / dist;
  const ndy = dy / dist;
  const ndz = dz / dist;

  // Test against all registered AABBs for the map
  for (const aabb of boxes) {
    const res = rayIntersectsAABB(fromX, fromY, fromZ, ndx, ndy, ndz, dist, aabb);
    if (res.hit) {
      return {
        clear: false,
        status: 'BLOCKED',
        blocker: aabb.label,
        distance: res.t,
        message: `Line of sight blocked by ${aabb.label ?? 'obstacle'} at distance ${res.t.toFixed(2)}m`,
      };
    }
  }

  return { clear: true, status: 'CLEAR' };
}

/**
 * hasLineOfSight
 *
 * Boolean convenience wrapper for checkLineOfSight.
 * Strictly fail-closed: returns false if mapId is undefined or unknown.
 */
export function hasLineOfSight(
  fromX: number, fromY: number, fromZ: number,
  toX:   number, toY:   number, toZ:   number,
  mapId: string | undefined
): boolean {
  return checkLineOfSight(fromX, fromY, fromZ, toX, toY, toZ, mapId).clear;
}
