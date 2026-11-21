import {
  BaseTexture,
  Color3,
  Material,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import {
  CharacterId,
  HitZone,
  KNIFE_CHARMS,
  KnifeCharmId,
  WEAPON_IDS,
  WeaponId,
} from './types';
import { normalizeCharacterId } from './loadoutRules';
import { TeamId } from '../maps/types';
import { applyProceduralSurfaceToMaterial } from './proceduralTextures';

export interface OperatorPalette {
  gearMat: PBRMaterial;
  plateMat: PBRMaterial;
  gunMat: PBRMaterial;
  gunLightMat: PBRMaterial;
  woodMat: PBRMaterial;
  odMat: PBRMaterial;
  bladeMat: PBRMaterial;
  skinLightMat: PBRMaterial;
  skinTanMat: PBRMaterial;
  hairDarkMat: PBRMaterial;
  hairAuburnMat: PBRMaterial;
  hoodClothMat: PBRMaterial;
  heavyArmorMat: PBRMaterial;
  shellAccentMat: PBRMaterial;
  visorMat: StandardMaterial;
  beaconMat: StandardMaterial;
  flashMat: StandardMaterial;
  redDotMat: StandardMaterial;
  scopeLensMat: PBRMaterial;
  dispose: () => void;
}

export interface OperatorRig {
  characterId: CharacterId;
  root: TransformNode;
  pivot: TransformNode;
  upperBodyPivot: TransformNode;
  legLPivot: TransformNode;
  legRPivot: TransformNode;
  headMesh: Mesh;
  bodyMesh: Mesh;
  bodyMat: PBRMaterial;
  headMat: PBRMaterial;
  weaponAssembly: TransformNode;
  weaponGroups: Partial<Record<WeaponId, TransformNode>>;
  muzzlePoint: TransformNode;
  muzzleFlash: Mesh;
  charmRoots: Partial<Record<KnifeCharmId, TransformNode>>;
  setWeapon: (weaponId: WeaponId) => void;
  setCharm: (charmId: KnifeCharmId) => void;
}

const WEAPON_MUZZLE_OFFSETS: Record<WeaponId, Vector3> = {
  ak47: new Vector3(0, 0.02, 0.58),
  shotgun: new Vector3(0, 0.02, 0.62),
  smg: new Vector3(0, 0.015, 0.36),
  sniper: new Vector3(0, 0.02, 0.84),
  pistol: new Vector3(0, 0.02, 0.24),
  knife: new Vector3(0, 0.02, 0.24),
};

const WEAPON_POSE_OFFSETS: Record<WeaponId, { pos: Vector3; rotY: number }> = {
  ak47: { pos: new Vector3(0.24, 0.48, 0.38), rotY: 0 },
  smg: { pos: new Vector3(0.21, 0.5, 0.34), rotY: -0.05 },
  shotgun: { pos: new Vector3(0.25, 0.45, 0.4), rotY: -0.04 },
  sniper: { pos: new Vector3(0.23, 0.49, 0.41), rotY: 0.03 },
  pistol: { pos: new Vector3(0.24, 0.5, 0.35), rotY: 0 },
  knife: { pos: new Vector3(0.26, 0.46, 0.34), rotY: 0.14 },
};

export function createOperatorPalette(
  scene: Scene,
  team: TeamId,
  prefix: string
): OperatorPalette {
  const isBlue = team === 'blue';
  const materials: Material[] = [];
  const textures: BaseTexture[] = [];

  const track = <T extends Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const trackTex = (list: BaseTexture[]): void => {
    textures.push(...list);
  };

  const gearMat = track(new PBRMaterial(`${prefix}_gear`, scene));
  trackTex(
    applyProceduralSurfaceToMaterial(scene, gearMat, `${prefix}_gearTex`, 'tacticalFabric', {
      size: 64,
      baseHex: '#202631',
      accentHex: '#13171e',
      uScale: 2,
      vScale: 2,
      bumpLevel: 0.72,
    })
  );

  const plateMat = track(new PBRMaterial(`${prefix}_plate`, scene));
  trackTex(
    applyProceduralSurfaceToMaterial(scene, plateMat, `${prefix}_plateTex`, 'kevlarPlate', {
      size: 64,
      baseHex: '#2d3544',
      accentHex: '#1a2029',
      uScale: 2,
      vScale: 2,
      bumpLevel: 0.8,
    })
  );

  const gunMat = track(new PBRMaterial(`${prefix}_gun`, scene));
  trackTex(
    applyProceduralSurfaceToMaterial(scene, gunMat, `${prefix}_gunTex`, 'anodizedMetal', {
      size: 64,
      baseHex: '#20252f',
      accentHex: '#13161c',
      uScale: 2,
      vScale: 2,
      bumpLevel: 0.5,
      metallicOverride: 0.86,
      roughnessScale: 0.9,
    })
  );

  const gunLightMat = track(new PBRMaterial(`${prefix}_gunLight`, scene));
  trackTex(
    applyProceduralSurfaceToMaterial(scene, gunLightMat, `${prefix}_gunLightTex`, 'brushedMetal', {
      size: 64,
      baseHex: '#84909f',
      accentHex: '#535d6a',
      uScale: 2,
      vScale: 2,
      bumpLevel: 0.45,
      metallicOverride: 0.94,
    })
  );

  const woodMat = track(new PBRMaterial(`${prefix}_wood`, scene));
  trackTex(
    applyProceduralSurfaceToMaterial(scene, woodMat, `${prefix}_woodTex`, 'walnutWood', {
      size: 64,
      baseHex: '#704123',
      accentHex: '#3f210e',
      uScale: 2,
      vScale: 2,
      bumpLevel: 0.65,
    })
  );

  const odMat = track(new PBRMaterial(`${prefix}_od`, scene));
  trackTex(
    applyProceduralSurfaceToMaterial(scene, odMat, `${prefix}_odTex`, 'tacticalFabric', {
      size: 64,
      baseHex: '#374a38',
      accentHex: '#222f23',
      uScale: 2,
      vScale: 2,
      bumpLevel: 0.72,
    })
  );

  const bladeMat = track(new PBRMaterial(`${prefix}_blade`, scene));
  trackTex(
    applyProceduralSurfaceToMaterial(scene, bladeMat, `${prefix}_bladeTex`, 'brushedMetal', {
      size: 64,
      baseHex: '#d2deea',
      accentHex: '#9ba8b8',
      uScale: 2,
      vScale: 2,
      bumpLevel: 0.35,
      metallicOverride: 0.98,
      roughnessScale: 0.65,
      clearCoat: 0.45,
    })
  );

  const skinLightMat = track(new PBRMaterial(`${prefix}_skinLight`, scene));
  skinLightMat.albedoColor = Color3.FromHexString('#d6a88a');
  skinLightMat.metallic = 0.02;
  skinLightMat.roughness = 0.68;

  const skinTanMat = track(new PBRMaterial(`${prefix}_skinTan`, scene));
  skinTanMat.albedoColor = Color3.FromHexString('#b98362');
  skinTanMat.metallic = 0.02;
  skinTanMat.roughness = 0.7;

  const hairDarkMat = track(new PBRMaterial(`${prefix}_hairDark`, scene));
  hairDarkMat.albedoColor = Color3.FromHexString('#17191e');
  hairDarkMat.metallic = 0.08;
  hairDarkMat.roughness = 0.66;

  const hairAuburnMat = track(new PBRMaterial(`${prefix}_hairAuburn`, scene));
  hairAuburnMat.albedoColor = Color3.FromHexString('#42261c');
  hairAuburnMat.metallic = 0.1;
  hairAuburnMat.roughness = 0.54;

  const hoodClothMat = track(new PBRMaterial(`${prefix}_hoodCloth`, scene));
  trackTex(
    applyProceduralSurfaceToMaterial(scene, hoodClothMat, `${prefix}_hoodTex`, 'tacticalFabric', {
      size: 64,
      baseHex: '#2b3930',
      accentHex: '#19221c',
      uScale: 2,
      vScale: 2,
      bumpLevel: 0.8,
    })
  );

  const heavyArmorMat = track(new PBRMaterial(`${prefix}_heavyArmor`, scene));
  trackTex(
    applyProceduralSurfaceToMaterial(scene, heavyArmorMat, `${prefix}_heavyTex`, 'kevlarPlate', {
      size: 64,
      baseHex: '#333b48',
      accentHex: '#1d222b',
      uScale: 2,
      vScale: 2,
      bumpLevel: 0.9,
      metallicOverride: 0.46,
    })
  );

  const shellAccentMat = track(new PBRMaterial(`${prefix}_shellAccent`, scene));
  trackTex(
    applyProceduralSurfaceToMaterial(scene, shellAccentMat, `${prefix}_shellTex`, 'anodizedMetal', {
      size: 64,
      baseHex: '#cf4812',
      accentHex: '#8a2b07',
      metallicOverride: 0.5,
      clearCoat: 0.35,
    })
  );

  const visorMat = track(new StandardMaterial(`${prefix}_visor`, scene));
  visorMat.disableLighting = true;
  visorMat.emissiveColor = isBlue
    ? new Color3(0.32, 1.05, 1.85)
    : new Color3(1.75, 0.42, 0.22);

  const beaconMat = track(new StandardMaterial(`${prefix}_beacon`, scene));
  beaconMat.disableLighting = true;
  beaconMat.emissiveColor = isBlue
    ? new Color3(0.22, 0.85, 1.8)
    : new Color3(1.85, 0.24, 0.28);

  const flashMat = track(new StandardMaterial(`${prefix}_flash`, scene));
  flashMat.disableLighting = true;
  flashMat.emissiveColor = new Color3(1.6, 1.15, 0.45);

  const redDotMat = track(new StandardMaterial(`${prefix}_redDot`, scene));
  redDotMat.disableLighting = true;
  redDotMat.emissiveColor = new Color3(1.9, 0.18, 0.15);

  const scopeLensMat = track(new PBRMaterial(`${prefix}_lens`, scene));
  scopeLensMat.albedoColor = new Color3(0.08, 0.26, 0.34);
  scopeLensMat.metallic = 0.18;
  scopeLensMat.roughness = 0.05;
  scopeLensMat.environmentIntensity = 1.55;
  scopeLensMat.clearCoat.isEnabled = true;
  scopeLensMat.clearCoat.intensity = 1.0;
  scopeLensMat.clearCoat.roughness = 0.04;

  return {
    gearMat,
    plateMat,
    gunMat,
    gunLightMat,
    woodMat,
    odMat,
    bladeMat,
    skinLightMat,
    skinTanMat,
    hairDarkMat,
    hairAuburnMat,
    hoodClothMat,
    heavyArmorMat,
    shellAccentMat,
    visorMat,
    beaconMat,
    flashMat,
    redDotMat,
    scopeLensMat,
    dispose: () => {
      for (const m of materials) {
        m.dispose();
      }
      materials.length = 0;
      for (const t of textures) {
        t.dispose();
      }
      textures.length = 0;
    },
  };
}

export interface CreateOperatorRigOptions {
  id: string;
  team: TeamId;
  palette: OperatorPalette;
  characterId?: CharacterId;
  initialWeaponId: WeaponId;
  buildAllWeapons?: boolean;
  initialCharmId?: KnifeCharmId;
  isPickableHitboxes?: boolean;
  hitboxMetadata?: {
    isBot?: boolean;
    botId?: string;
    isRemotePlayer?: boolean;
    playerId?: string;
    team: TeamId;
  };
  renderingGroupId?: number;
}

export function buildOperatorRig(
  scene: Scene,
  opts: CreateOperatorRigOptions
): OperatorRig {
  const { id, team, palette } = opts;
  const characterId = normalizeCharacterId(opts.characterId, 'assault');
  const isBlue = team === 'blue';
  const pickableHitboxes = opts.isPickableHitboxes ?? true;
  const group = opts.renderingGroupId ?? 0;

  const root = new TransformNode(`op_root_${id}`, scene);
  const pivot = new TransformNode(`op_pivot_${id}`, scene);
  pivot.parent = root;

  const bodyMat = new PBRMaterial(`op_bodyMat_${id}`, scene);
  const bodyTex = applyProceduralSurfaceToMaterial(scene, bodyMat, `op_bodyTex_${id}`, 'tacticalFabric', {
    size: 64,
    baseHex: isBlue ? '#224ab5' : '#aa2222',
    accentHex: isBlue ? '#132a6b' : '#631212',
    uScale: 2,
    vScale: 2,
    bumpLevel: 0.65,
  });
  bodyMat.emissiveColor = isBlue
    ? new Color3(0.02, 0.06, 0.14)
    : new Color3(0.14, 0.03, 0.03);
  bodyMat.onDisposeObservable.add(() => {
    for (const t of bodyTex) t.dispose();
  });

  const headMat = new PBRMaterial(`op_headMat_${id}`, scene);
  const headTex = applyProceduralSurfaceToMaterial(scene, headMat, `op_headTex_${id}`, 'kevlarPlate', {
    size: 64,
    baseHex: isBlue ? '#2e6de4' : '#d63333',
    accentHex: isBlue ? '#1c4494' : '#8a1b1b',
    bumpLevel: 0.45,
  });
  headMat.emissiveColor = isBlue
    ? new Color3(0.04, 0.1, 0.24)
    : new Color3(0.22, 0.05, 0.04);
  headMat.onDisposeObservable.add(() => {
    for (const t of headTex) t.dispose();
  });

  const addDecorBox = (
    parent: TransformNode,
    name: string,
    dims: { width: number; height: number; depth: number },
    pos: Vector3,
    mat: Material,
    rot?: Vector3
  ): Mesh => {
    const m = MeshBuilder.CreateBox(name, dims, scene);
    m.parent = parent;
    m.position.copyFrom(pos);
    if (rot) m.rotation.copyFrom(rot);
    m.material = mat;
    m.isPickable = false;
    m.checkCollisions = false;
    m.renderingGroupId = group;
    return m;
  };

  const addDecorCyl = (
    parent: TransformNode,
    name: string,
    height: number,
    diameter: number,
    pos: Vector3,
    mat: Material,
    rot?: Vector3,
    tessellation = 10
  ): Mesh => {
    const m = MeshBuilder.CreateCylinder(
      name,
      { height, diameter, tessellation },
      scene
    );
    m.parent = parent;
    m.position.copyFrom(pos);
    if (rot) m.rotation.copyFrom(rot);
    m.material = mat;
    m.isPickable = false;
    m.checkCollisions = false;
    m.renderingGroupId = group;
    return m;
  };

  // Character proportion modifiers (decorative only; authoritative hitboxes remain fixed)
  const legHipX =
    characterId === 'vanguard' ? 0.125 : characterId === 'breacher' ? 0.15 : 0.14;
  const thighWidth =
    characterId === 'vanguard' ? 0.155 : characterId === 'breacher' ? 0.215 : 0.185;
  const shinWidth =
    characterId === 'vanguard' ? 0.145 : characterId === 'breacher' ? 0.195 : 0.172;
  const legMatPrimary =
    characterId === 'marksman'
      ? palette.hoodClothMat
      : characterId === 'breacher'
        ? palette.heavyArmorMat
        : palette.gearMat;

  // --- Articulated Legs (Thigh, Thigh Holster, Knee Pad, Shin Gaiter, Boot) ---
  const buildLeg = (side: -1 | 1): TransformNode => {
    const sideLabel = side < 0 ? 'L' : 'R';
    const legPivot = new TransformNode(`op_leg${sideLabel}_${id}`, scene);
    legPivot.parent = pivot;
    legPivot.position.set(side * legHipX, 0.78, 0);

    addDecorBox(
      legPivot,
      `op_thigh_${sideLabel}_${id}`,
      { width: thighWidth, height: 0.34, depth: thighWidth + 0.02 },
      new Vector3(0, -0.17, 0),
      legMatPrimary
    );
    addDecorBox(
      legPivot,
      `op_thighPouch_${sideLabel}_${id}`,
      {
        width: characterId === 'breacher' ? 0.055 : 0.04,
        height: characterId === 'vanguard' ? 0.13 : 0.16,
        depth: 0.12,
      },
      new Vector3(side * (thighWidth * 0.5 + 0.02), -0.2, 0.01),
      characterId === 'breacher' ? palette.plateMat : palette.plateMat
    );
    addDecorBox(
      legPivot,
      `op_knee_${sideLabel}_${id}`,
      {
        width: shinWidth * 0.94,
        height: characterId === 'breacher' ? 0.13 : 0.105,
        depth: characterId === 'breacher' ? 0.08 : 0.06,
      },
      new Vector3(0, -0.35, shinWidth * 0.5 + 0.008),
      characterId === 'breacher' ? palette.heavyArmorMat : palette.plateMat
    );
    addDecorBox(
      legPivot,
      `op_shin_${sideLabel}_${id}`,
      { width: shinWidth, height: 0.29, depth: shinWidth + 0.02 },
      new Vector3(0, -0.51, 0),
      legMatPrimary
    );
    if (characterId === 'breacher') {
      addDecorBox(
        legPivot,
        `op_greave_${sideLabel}_${id}`,
        { width: shinWidth + 0.02, height: 0.22, depth: 0.045 },
        new Vector3(0, -0.52, shinWidth * 0.52),
        palette.heavyArmorMat
      );
    }
    addDecorBox(
      legPivot,
      `op_boot_${sideLabel}_${id}`,
      { width: shinWidth + 0.02, height: 0.125, depth: characterId === 'vanguard' ? 0.25 : 0.28 },
      new Vector3(0, -0.71, 0.035),
      palette.plateMat
    );
    addDecorBox(
      legPivot,
      `op_sole_${sideLabel}_${id}`,
      { width: shinWidth + 0.028, height: 0.035, depth: characterId === 'vanguard' ? 0.26 : 0.29 },
      new Vector3(0, -0.768, 0.038),
      palette.gunMat
    );
    return legPivot;
  };

  const legLPivot = buildLeg(-1);
  const legRPivot = buildLeg(1);

  // --- Upper Body Pivot (exact y = 0.80 to match server hit-validation & existing locomotion) ---
  const upperBodyPivot = new TransformNode(`op_upper_${id}`, scene);
  upperBodyPivot.parent = pivot;
  upperBodyPivot.position.set(0, 0.8, 0);

  // Exact Torso Hitbox (remains pickable with exact metadata)
  const bodyMesh = MeshBuilder.CreateBox(
    `op_body_${id}`,
    { width: 0.54, height: 0.72, depth: 0.3 },
    scene
  );
  bodyMesh.position.set(0, 0.36, 0);
  bodyMesh.parent = upperBodyPivot;
  bodyMesh.material = bodyMat;
  bodyMesh.isPickable = pickableHitboxes;
  bodyMesh.checkCollisions = false;
  bodyMesh.renderingGroupId = group;
  if (opts.hitboxMetadata) {
    bodyMesh.metadata = {
      ...opts.hitboxMetadata,
      zone: 'body' as HitZone,
    };
  }

  // Archetype-Tuned Belt & Waist Rig
  const beltWidth =
    characterId === 'vanguard' ? 0.46 : characterId === 'breacher' ? 0.58 : 0.54;
  addDecorBox(
    upperBodyPivot,
    `op_belt_${id}`,
    { width: beltWidth, height: 0.082, depth: characterId === 'vanguard' ? 0.3 : 0.33 },
    new Vector3(0, 0.04, 0),
    palette.plateMat
  );
  addDecorBox(
    upperBodyPivot,
    `op_buckle_${id}`,
    { width: 0.1, height: 0.06, depth: 0.03 },
    new Vector3(0, 0.04, characterId === 'vanguard' ? 0.16 : 0.175),
    palette.gunLightMat
  );

  // Archetype-Specific Torso Carrier, Pouches, Shoulder Armor & IFF Beacons
  const vestWidth =
    characterId === 'vanguard' ? 0.41 : characterId === 'breacher' ? 0.55 : 0.48;
  const vestDepth =
    characterId === 'vanguard' ? 0.31 : characterId === 'breacher' ? 0.38 : 0.34;
  const vestMat =
    characterId === 'breacher'
      ? palette.heavyArmorMat
      : characterId === 'marksman'
        ? palette.odMat
        : palette.plateMat;

  addDecorBox(
    upperBodyPivot,
    `op_vest_${id}`,
    { width: vestWidth, height: characterId === 'vanguard' ? 0.39 : 0.45, depth: vestDepth },
    new Vector3(0, characterId === 'vanguard' ? 0.43 : 0.41, 0),
    vestMat
  );
  addDecorBox(
    upperBodyPivot,
    `op_plateF_${id}`,
    {
      width: vestWidth * 0.78,
      height: characterId === 'breacher' ? 0.36 : 0.31,
      depth: characterId === 'breacher' ? 0.065 : 0.045,
    },
    new Vector3(0, 0.45, vestDepth * 0.5 + 0.015),
    characterId === 'breacher' ? palette.plateMat : palette.gearMat
  );
  addDecorBox(
    upperBodyPivot,
    `op_iffChest_${id}`,
    { width: vestWidth * 0.62, height: 0.04, depth: 0.02 },
    new Vector3(0, 0.56, vestDepth * 0.5 + 0.042),
    palette.beaconMat
  );

  // Chest Mag Pouches / Shell Bandolier + Brass/Flap Detailing
  if (characterId === 'breacher') {
    for (let sx = -0.14; sx <= 0.141; sx += 0.056) {
      addDecorCyl(
        upperBodyPivot,
        `op_shellLoop_${id}_${sx.toFixed(2)}`,
        0.078,
        0.028,
        new Vector3(sx, 0.31, vestDepth * 0.5 + 0.045),
        palette.shellAccentMat
      );
      addDecorCyl(
        upperBodyPivot,
        `op_shellBrass_${id}_${sx.toFixed(2)}`,
        0.02,
        0.03,
        new Vector3(sx, 0.275, vestDepth * 0.5 + 0.045),
        palette.gunLightMat
      );
    }
    addDecorBox(
      upperBodyPivot,
      `op_pelvisPlate_${id}`,
      { width: 0.34, height: 0.16, depth: 0.055 },
      new Vector3(0, 0.09, vestDepth * 0.5 + 0.025),
      palette.heavyArmorMat,
      new Vector3(-0.08, 0, 0)
    );
  } else if (characterId === 'vanguard') {
    for (const mx of [-0.09, 0.09]) {
      addDecorBox(
        upperBodyPivot,
        `op_smgPouch_${id}_${mx}`,
        { width: 0.06, height: 0.145, depth: 0.042 },
        new Vector3(mx, 0.29, vestDepth * 0.5 + 0.025),
        palette.plateMat,
        new Vector3(0, 0, mx < 0 ? 0.14 : -0.14)
      );
      addDecorBox(
        upperBodyPivot,
        `op_harness_${id}_${mx}`,
        { width: 0.042, height: 0.28, depth: 0.022 },
        new Vector3(mx * 1.15, 0.52, vestDepth * 0.5 + 0.022),
        palette.gearMat,
        new Vector3(0, 0, mx < 0 ? -0.22 : 0.22)
      );
    }
  } else {
    for (const mx of [-0.11, 0, 0.11]) {
      addDecorBox(
        upperBodyPivot,
        `op_magPouch_${id}_${mx}`,
        { width: 0.082, height: 0.135, depth: 0.05 },
        new Vector3(mx, 0.28, vestDepth * 0.5 + 0.025),
        palette.plateMat
      );
      addDecorBox(
        upperBodyPivot,
        `op_pouchFlap_${id}_${mx}`,
        { width: 0.078, height: 0.036, depth: 0.056 },
        new Vector3(mx, 0.335, vestDepth * 0.5 + 0.028),
        palette.gearMat
      );
    }
  }

  // Rear Pack + Team IFF Bar
  addDecorBox(
    upperBodyPivot,
    `op_backPack_${id}`,
    {
      width: characterId === 'vanguard' ? 0.28 : characterId === 'breacher' ? 0.4 : 0.35,
      height: characterId === 'vanguard' ? 0.3 : 0.36,
      depth: characterId === 'breacher' ? 0.14 : 0.11,
    },
    new Vector3(0, 0.43, -(vestDepth * 0.5 + 0.045)),
    characterId === 'marksman' ? palette.hoodClothMat : palette.gearMat
  );
  addDecorBox(
    upperBodyPivot,
    `op_iffBack_${id}`,
    { width: 0.26, height: 0.042, depth: 0.02 },
    new Vector3(0, 0.55, -(vestDepth * 0.5 + 0.105)),
    palette.beaconMat
  );

  // Archetype-specific upper body & silhouette additions
  if (characterId === 'assault') {
    // Tactical scarf collar + comms whip antenna + shoulder mic clip
    addDecorBox(
      upperBodyPivot,
      `op_scarf_${id}`,
      { width: 0.33, height: 0.095, depth: 0.29 },
      new Vector3(0, 0.72, 0.01),
      palette.hoodClothMat
    );
    addDecorCyl(
      upperBodyPivot,
      `op_antenna_${id}`,
      0.28,
      0.014,
      new Vector3(-0.14, 0.73, -0.19),
      palette.gunMat
    );
    addDecorBox(
      upperBodyPivot,
      `op_micClip_${id}`,
      { width: 0.05, height: 0.07, depth: 0.035 },
      new Vector3(-0.15, 0.57, vestDepth * 0.5 + 0.038),
      palette.gunLightMat
    );
  } else if (characterId === 'vanguard') {
    // Light agility collar strap + sleek forearm tac-pad
    addDecorBox(
      upperBodyPivot,
      `op_vCollar_${id}`,
      { width: 0.27, height: 0.06, depth: 0.25 },
      new Vector3(0, 0.7, 0),
      palette.gearMat
    );
    addDecorBox(
      upperBodyPivot,
      `op_wristPad_${id}`,
      { width: 0.075, height: 0.038, depth: 0.11 },
      new Vector3(-0.04, 0.52, 0.34),
      palette.visorMat,
      new Vector3(0.06, 0.78, 0)
    );
  } else if (characterId === 'breacher') {
    // High heavy ballistic blast collar + breaching battering cylinder on back + armor rivets
    addDecorBox(
      upperBodyPivot,
      `op_gorget_${id}`,
      { width: 0.41, height: 0.11, depth: 0.34 },
      new Vector3(0, 0.715, 0),
      palette.heavyArmorMat
    );
    addDecorCyl(
      upperBodyPivot,
      `op_ram_${id}`,
      0.46,
      0.085,
      new Vector3(0.14, 0.46, -0.28),
      palette.gunMat,
      new Vector3(0, 0, -0.22)
    );
    addDecorCyl(
      upperBodyPivot,
      `op_ramHead_${id}`,
      0.1,
      0.11,
      new Vector3(0.09, 0.68, -0.28),
      palette.gunLightMat,
      new Vector3(0, 0, -0.22)
    );
  } else if (characterId === 'marksman') {
    // Draped shoulder cowl + ghillie shoulder strips + articulated recon coat-tail panels + spotter optic pack
    addDecorBox(
      upperBodyPivot,
      `op_cowlMantle_${id}`,
      { width: 0.52, height: 0.11, depth: 0.36 },
      new Vector3(0, 0.695, -0.02),
      palette.hoodClothMat
    );
    for (const gx of [-0.18, 0.18]) {
      addDecorBox(
        upperBodyPivot,
        `op_ghillieStrip_${id}_${gx}`,
        { width: 0.14, height: 0.035, depth: 0.38 },
        new Vector3(gx, 0.72, -0.04),
        palette.odMat,
        new Vector3(0.08, 0, gx < 0 ? 0.18 : -0.18)
      );
    }
    for (const side of [-1, 1] as const) {
      addDecorBox(
        upperBodyPivot,
        `op_coatTail_${id}_${side}`,
        { width: 0.22, height: 0.52, depth: 0.045 },
        new Vector3(side * 0.13, -0.19, -0.165),
        palette.hoodClothMat,
        new Vector3(0.14, 0, side * 0.06)
      );
    }
    addDecorCyl(
      upperBodyPivot,
      `op_spotterMast_${id}`,
      0.24,
      0.022,
      new Vector3(0.14, 0.74, -0.2),
      palette.odMat
    );
  }

  // Sculpted Shoulder Pauldrons & Illuminated Team IFF Beacons
  const padOffsetX =
    characterId === 'vanguard' ? 0.29 : characterId === 'breacher' ? 0.39 : 0.34;
  const padWidth =
    characterId === 'vanguard' ? 0.115 : characterId === 'breacher' ? 0.205 : 0.155;
  const padHeight =
    characterId === 'vanguard' ? 0.145 : characterId === 'breacher' ? 0.225 : 0.19;

  for (const side of [-1, 1] as const) {
    addDecorBox(
      upperBodyPivot,
      `op_pad_${id}_${side}`,
      { width: padWidth, height: padHeight, depth: characterId === 'breacher' ? 0.29 : 0.23 },
      new Vector3(side * padOffsetX, 0.6, 0),
      bodyMat,
      new Vector3(0, 0, side * -0.14)
    );
    addDecorBox(
      upperBodyPivot,
      `op_padTrim_${id}_${side}`,
      { width: padWidth * 0.88, height: 0.042, depth: characterId === 'breacher' ? 0.3 : 0.235 },
      new Vector3(side * padOffsetX, 0.68, 0),
      characterId === 'breacher' ? palette.heavyArmorMat : palette.plateMat,
      new Vector3(0, 0, side * -0.14)
    );
    addDecorBox(
      upperBodyPivot,
      `op_beacon_${id}_${side}`,
      { width: 0.04, height: 0.072, depth: 0.16 },
      new Vector3(side * (padOffsetX + padWidth * 0.52), 0.61, 0),
      palette.beaconMat
    );
  }

  // Exact Head Hitbox (at y = 0.90 on upperBodyPivot -> world 1.70m standing)
  const headMesh = MeshBuilder.CreateBox(
    `op_head_${id}`,
    { width: 0.3, height: 0.3, depth: 0.3 },
    scene
  );
  headMesh.position.set(0, 0.9, 0);
  headMesh.parent = upperBodyPivot;
  headMesh.material = headMat;
  headMesh.isPickable = pickableHitboxes;
  headMesh.checkCollisions = false;
  headMesh.renderingGroupId = group;
  if (opts.hitboxMetadata) {
    headMesh.metadata = {
      ...opts.hitboxMetadata,
      zone: 'head' as HitZone,
    };
  }

  // --- Distinct Archetype Head / Hair / Ponytail / Heavy Helmet / Hood ---
  if (characterId === 'assault') {
    // Character 1 (Assault — Guy #1): Rugged cropped dark hair, exposed face brow, boom headset & half-mask
    addDecorBox(
      upperBodyPivot,
      `op_face_${id}`,
      { width: 0.24, height: 0.125, depth: 0.04 },
      new Vector3(0, 0.925, 0.145),
      palette.skinTanMat
    );
    addDecorBox(
      upperBodyPivot,
      `op_hairTop_${id}`,
      { width: 0.315, height: 0.09, depth: 0.32 },
      new Vector3(0, 1.03, -0.01),
      palette.hairDarkMat
    );
    addDecorBox(
      upperBodyPivot,
      `op_hairCrest_${id}`,
      { width: 0.23, height: 0.05, depth: 0.24 },
      new Vector3(0, 1.08, 0.03),
      palette.hairDarkMat,
      new Vector3(-0.12, 0, 0)
    );
    addDecorBox(
      upperBodyPivot,
      `op_hairBack_${id}`,
      { width: 0.29, height: 0.13, depth: 0.06 },
      new Vector3(0, 0.94, -0.15),
      palette.hairDarkMat
    );
    addDecorBox(
      upperBodyPivot,
      `op_gogglesBrow_${id}`,
      { width: 0.26, height: 0.062, depth: 0.055 },
      new Vector3(0, 0.955, 0.155),
      palette.visorMat
    );
    addDecorBox(
      upperBodyPivot,
      `op_mask_${id}`,
      { width: 0.255, height: 0.115, depth: 0.055 },
      new Vector3(0, 0.81, 0.145),
      palette.gearMat
    );
    // Tactical comms headset band + boom mic
    addDecorBox(
      upperBodyPivot,
      `op_headband_${id}`,
      { width: 0.34, height: 0.032, depth: 0.05 },
      new Vector3(0, 1.055, 0),
      palette.gunMat
    );
    for (const side of [-1, 1] as const) {
      addDecorBox(
        upperBodyPivot,
        `op_earpro_${id}_${side}`,
        { width: 0.05, height: 0.11, depth: 0.105 },
        new Vector3(side * 0.175, 0.9, 0),
        palette.gunMat
      );
    }
    addDecorBox(
      upperBodyPivot,
      `op_boomMic_${id}`,
      { width: 0.02, height: 0.02, depth: 0.16 },
      new Vector3(-0.16, 0.84, 0.09),
      palette.gunLightMat,
      new Vector3(0.2, 0.35, 0)
    );
  } else if (characterId === 'vanguard') {
    // Character 2 (Vanguard — Girl): Sculpted face, swept bangs, wrap-around visor glasses, tactical cap + articulated high ponytail
    addDecorBox(
      upperBodyPivot,
      `op_face_${id}`,
      { width: 0.22, height: 0.15, depth: 0.04 },
      new Vector3(0, 0.905, 0.145),
      palette.skinLightMat
    );
    addDecorBox(
      upperBodyPivot,
      `op_visor_${id}`,
      { width: 0.245, height: 0.056, depth: 0.048 },
      new Vector3(0, 0.935, 0.162),
      palette.visorMat
    );
    addDecorBox(
      upperBodyPivot,
      `op_capCrown_${id}`,
      { width: 0.305, height: 0.1, depth: 0.315 },
      new Vector3(0, 1.025, -0.01),
      palette.plateMat
    );
    addDecorBox(
      upperBodyPivot,
      `op_capBrim_${id}`,
      { width: 0.26, height: 0.024, depth: 0.12 },
      new Vector3(0, 0.99, 0.18),
      palette.gearMat,
      new Vector3(0.14, 0, 0)
    );
    // Sculpted side hair & fringe + high articulated ponytail
    for (const side of [-1, 1] as const) {
      addDecorBox(
        upperBodyPivot,
        `op_hairSide_${id}_${side}`,
        { width: 0.045, height: 0.16, depth: 0.12 },
        new Vector3(side * 0.155, 0.905, 0.03),
        palette.hairAuburnMat
      );
      addDecorBox(
        upperBodyPivot,
        `op_earpro_${id}_${side}`,
        { width: 0.042, height: 0.095, depth: 0.09 },
        new Vector3(side * 0.172, 0.9, -0.01),
        palette.gunLightMat
      );
    }
    addDecorBox(
      upperBodyPivot,
      `op_ponytailBase_${id}`,
      { width: 0.11, height: 0.11, depth: 0.11 },
      new Vector3(0, 0.96, -0.185),
      palette.hairAuburnMat
    );
    addDecorBox(
      upperBodyPivot,
      `op_ponytailMid_${id}`,
      { width: 0.105, height: 0.21, depth: 0.095 },
      new Vector3(0, 0.85, -0.255),
      palette.hairAuburnMat,
      new Vector3(0.36, 0, 0)
    );
    addDecorBox(
      upperBodyPivot,
      `op_ponytailTip_${id}`,
      { width: 0.075, height: 0.16, depth: 0.07 },
      new Vector3(0, 0.71, -0.305),
      palette.hairAuburnMat,
      new Vector3(0.22, 0, 0)
    );
    addDecorBox(
      upperBodyPivot,
      `op_mask_${id}`,
      { width: 0.215, height: 0.085, depth: 0.05 },
      new Vector3(0, 0.815, 0.145),
      palette.gearMat
    );
  } else if (characterId === 'breacher') {
    // Character 3 (Breacher — Guy #2): Full heavy enclosed ballistic helmet, chin mandible shield & wide glowing visor
    addDecorBox(
      upperBodyPivot,
      `op_helmet_${id}`,
      { width: 0.37, height: 0.19, depth: 0.38 },
      new Vector3(0, 1.0, -0.01),
      palette.heavyArmorMat
    );
    addDecorBox(
      upperBodyPivot,
      `op_helmetBrow_${id}`,
      { width: 0.34, height: 0.06, depth: 0.12 },
      new Vector3(0, 0.985, 0.155),
      palette.plateMat
    );
    addDecorBox(
      upperBodyPivot,
      `op_helmetCrown_${id}`,
      { width: 0.26, height: 0.05, depth: 0.32 },
      new Vector3(0, 1.09, -0.01),
      palette.gearMat
    );
    addDecorBox(
      upperBodyPivot,
      `op_helmetNape_${id}`,
      { width: 0.35, height: 0.13, depth: 0.09 },
      new Vector3(0, 0.88, -0.165),
      palette.heavyArmorMat
    );
    addDecorBox(
      upperBodyPivot,
      `op_visor_${id}`,
      { width: 0.29, height: 0.068, depth: 0.06 },
      new Vector3(0, 0.925, 0.165),
      palette.visorMat
    );
    addDecorBox(
      upperBodyPivot,
      `op_mandible_${id}`,
      { width: 0.32, height: 0.145, depth: 0.14 },
      new Vector3(0, 0.82, 0.13),
      palette.heavyArmorMat
    );
    for (const side of [-1, 1] as const) {
      addDecorBox(
        upperBodyPivot,
        `op_pod_${id}_${side}`,
        { width: 0.055, height: 0.13, depth: 0.13 },
        new Vector3(side * 0.19, 0.91, -0.01),
        palette.gunMat
      );
    }
  } else {
    // Character 4 (Marksman): Draped tactical stealth hood/cowl, half respirator & glowing single-eye recon optic
    addDecorBox(
      upperBodyPivot,
      `op_hoodTop_${id}`,
      { width: 0.365, height: 0.155, depth: 0.395 },
      new Vector3(0, 1.005, 0.005),
      palette.hoodClothMat
    );
    addDecorBox(
      upperBodyPivot,
      `op_hoodPeak_${id}`,
      { width: 0.25, height: 0.045, depth: 0.11 },
      new Vector3(0, 1.035, 0.185),
      palette.hoodClothMat,
      new Vector3(0.24, 0, 0)
    );
    addDecorBox(
      upperBodyPivot,
      `op_hoodBack_${id}`,
      { width: 0.355, height: 0.25, depth: 0.095 },
      new Vector3(0, 0.89, -0.16),
      palette.hoodClothMat
    );
    for (const side of [-1, 1] as const) {
      addDecorBox(
        upperBodyPivot,
        `op_hoodSide_${id}_${side}`,
        { width: 0.052, height: 0.24, depth: 0.32 },
        new Vector3(side * 0.175, 0.89, 0.01),
        palette.hoodClothMat
      );
    }
    addDecorBox(
      upperBodyPivot,
      `op_faceShadow_${id}`,
      { width: 0.24, height: 0.13, depth: 0.035 },
      new Vector3(0, 0.92, 0.145),
      palette.gearMat
    );
    // Asymmetric single-eye glowing rangefinder optic on left/viewer-right eye
    addDecorCyl(
      upperBodyPivot,
      `op_opticHousing_${id}`,
      0.065,
      0.075,
      new Vector3(0.065, 0.935, 0.175),
      palette.gunLightMat,
      new Vector3(Math.PI * 0.5, 0, 0)
    );
    addDecorCyl(
      upperBodyPivot,
      `op_opticGlow_${id}`,
      0.015,
      0.052,
      new Vector3(0.065, 0.935, 0.205),
      palette.visorMat,
      new Vector3(Math.PI * 0.5, 0, 0)
    );
    addDecorBox(
      upperBodyPivot,
      `op_respirator_${id}`,
      { width: 0.24, height: 0.12, depth: 0.075 },
      new Vector3(0, 0.815, 0.148),
      palette.plateMat
    );
  }

  // --- Articulated Arms + Elbow Pads + Gloves ---
  const armWidth =
    characterId === 'vanguard' ? 0.112 : characterId === 'breacher' ? 0.155 : 0.135;
  const sleeveMat =
    characterId === 'marksman'
      ? palette.hoodClothMat
      : characterId === 'breacher'
        ? palette.heavyArmorMat
        : palette.gearMat;

  addDecorBox(
    upperBodyPivot,
    `op_armR_up_${id}`,
    { width: armWidth, height: armWidth, depth: 0.24 },
    new Vector3(characterId === 'vanguard' ? 0.3 : 0.34, 0.51, 0.09),
    sleeveMat,
    new Vector3(0.32, -0.14, 0)
  );
  addDecorBox(
    upperBodyPivot,
    `op_elbowR_${id}`,
    { width: armWidth * 0.85, height: 0.09, depth: 0.1 },
    new Vector3(characterId === 'vanguard' ? 0.3 : 0.34, 0.43, 0.19),
    palette.plateMat
  );
  addDecorBox(
    upperBodyPivot,
    `op_armR_fore_${id}`,
    { width: armWidth * 0.88, height: armWidth * 0.88, depth: 0.27 },
    new Vector3(0.28, 0.46, 0.29),
    characterId === 'breacher' ? palette.plateMat : sleeveMat,
    new Vector3(-0.08, -0.22, 0)
  );

  addDecorBox(
    upperBodyPivot,
    `op_armL_up_${id}`,
    { width: armWidth, height: armWidth, depth: 0.25 },
    new Vector3(characterId === 'vanguard' ? -0.28 : -0.32, 0.49, 0.1),
    sleeveMat,
    new Vector3(0.28, 0.35, 0)
  );
  addDecorBox(
    upperBodyPivot,
    `op_elbowL_${id}`,
    { width: armWidth * 0.85, height: 0.09, depth: 0.1 },
    new Vector3(-0.26, 0.43, 0.21),
    palette.plateMat
  );
  addDecorBox(
    upperBodyPivot,
    `op_armL_fore_${id}`,
    { width: armWidth * 0.88, height: armWidth * 0.88, depth: 0.36 },
    new Vector3(-0.04, 0.45, 0.34),
    characterId === 'breacher' ? palette.plateMat : sleeveMat,
    new Vector3(0.06, 0.78, 0)
  );

  // --- Weapon Assembly + Distinct Third-Person Weapon Silhouettes ---
  const weaponAssembly = new TransformNode(`op_weapon_${id}`, scene);
  weaponAssembly.parent = upperBodyPivot;
  weaponAssembly.position.set(0.24, 0.48, 0.38);

  const charmRoots: Partial<Record<KnifeCharmId, TransformNode>> = {};
  const weaponGroups: Partial<Record<WeaponId, TransformNode>> = {};

  const buildWeaponGroup = (wId: WeaponId): TransformNode => {
    const wg = new TransformNode(`op_wg_${id}_${wId}`, scene);
    wg.parent = weaponAssembly;

    if (wId === 'ak47') {
      addDecorBox(wg, `w_${id}_ak_recv`, { width: 0.065, height: 0.09, depth: 0.32 }, new Vector3(0, 0, 0), palette.gunMat);
      addDecorBox(wg, `w_${id}_ak_cover`, { width: 0.056, height: 0.032, depth: 0.26 }, new Vector3(0, 0.052, -0.02), palette.gunLightMat);
      addDecorBox(wg, `w_${id}_ak_hg`, { width: 0.058, height: 0.065, depth: 0.22 }, new Vector3(0, -0.005, 0.26), palette.woodMat);
      addDecorBox(wg, `w_${id}_ak_stk`, { width: 0.055, height: 0.11, depth: 0.26 }, new Vector3(0, -0.025, -0.26), palette.woodMat, new Vector3(0.08, 0, 0));
      addDecorBox(wg, `w_${id}_ak_mag`, { width: 0.04, height: 0.18, depth: 0.08 }, new Vector3(0, -0.12, 0.08), palette.plateMat, new Vector3(0.28, 0, 0));
      addDecorCyl(wg, `w_${id}_ak_brl`, 0.32, 0.028, new Vector3(0, 0.016, 0.44), palette.gunLightMat, new Vector3(Math.PI * 0.5, 0, 0));
      addDecorCyl(wg, `w_${id}_ak_brk`, 0.055, 0.036, new Vector3(0, 0.016, 0.6), palette.gunMat, new Vector3(Math.PI * 0.5, 0, 0));
      // Top Red Dot Sight
      addDecorBox(wg, `w_${id}_ak_rdsBase`, { width: 0.044, height: 0.024, depth: 0.09 }, new Vector3(0, 0.075, 0.01), palette.gunMat);
      addDecorBox(wg, `w_${id}_ak_rdsHood`, { width: 0.048, height: 0.04, depth: 0.06 }, new Vector3(0, 0.098, 0.01), palette.plateMat);
      addDecorBox(wg, `w_${id}_ak_rdsDot`, { width: 0.014, height: 0.014, depth: 0.014 }, new Vector3(0, 0.098, 0.01), palette.redDotMat);
    } else if (wId === 'smg') {
      addDecorBox(wg, `w_${id}_smg_up`, { width: 0.062, height: 0.082, depth: 0.32 }, new Vector3(0, 0.01, 0.02), palette.gunMat);
      addDecorBox(wg, `w_${id}_smg_shroud`, { width: 0.058, height: 0.08, depth: 0.15 }, new Vector3(0, -0.03, 0.1), palette.plateMat);
      addDecorBox(wg, `w_${id}_smg_fgrip`, { width: 0.034, height: 0.085, depth: 0.038 }, new Vector3(0, -0.09, 0.19), palette.gearMat);
      addDecorBox(wg, `w_${id}_smg_mag`, { width: 0.036, height: 0.19, depth: 0.048 }, new Vector3(0, -0.12, 0.09), palette.gunMat, new Vector3(0.18, 0, 0));
      addDecorBox(wg, `w_${id}_smg_brace`, { width: 0.034, height: 0.04, depth: 0.2 }, new Vector3(0, 0.005, -0.2), palette.plateMat);
      addDecorCyl(wg, `w_${id}_smg_comp`, 0.15, 0.038, new Vector3(0, 0.01, 0.26), palette.gunLightMat, new Vector3(Math.PI * 0.5, 0, 0));
      addDecorBox(wg, `w_${id}_smg_opt`, { width: 0.042, height: 0.038, depth: 0.055 }, new Vector3(0, 0.068, 0.02), palette.plateMat);
    } else if (wId === 'shotgun') {
      addDecorBox(wg, `w_${id}_sg_recv`, { width: 0.066, height: 0.092, depth: 0.3 }, new Vector3(0, 0, 0), palette.gunMat);
      addDecorCyl(wg, `w_${id}_sg_brl`, 0.56, 0.036, new Vector3(0, 0.026, 0.36), palette.gunLightMat, new Vector3(Math.PI * 0.5, 0, 0));
      addDecorCyl(wg, `w_${id}_sg_tube`, 0.48, 0.03, new Vector3(0, -0.01, 0.32), palette.gunMat, new Vector3(Math.PI * 0.5, 0, 0));
      addDecorBox(wg, `w_${id}_sg_pump`, { width: 0.064, height: 0.055, depth: 0.2 }, new Vector3(0, -0.014, 0.26), palette.plateMat);
      addDecorBox(wg, `w_${id}_sg_caddy`, { width: 0.014, height: 0.048, depth: 0.16 }, new Vector3(-0.038, 0.008, 0), palette.shellAccentMat);
      addDecorBox(wg, `w_${id}_sg_stk`, { width: 0.056, height: 0.11, depth: 0.26 }, new Vector3(0, -0.02, -0.24), palette.gearMat, new Vector3(0.08, 0, 0));
    } else if (wId === 'sniper') {
      addDecorBox(wg, `w_${id}_snp_ch`, { width: 0.07, height: 0.088, depth: 0.48 }, new Vector3(0, -0.005, 0.02), palette.odMat);
      addDecorCyl(wg, `w_${id}_snp_brl`, 0.62, 0.038, new Vector3(0, 0.02, 0.48), palette.gunLightMat, new Vector3(Math.PI * 0.5, 0, 0));
      addDecorCyl(wg, `w_${id}_snp_brk`, 0.11, 0.056, new Vector3(0, 0.02, 0.8), palette.gunMat, new Vector3(Math.PI * 0.5, 0, 0));
      addDecorBox(wg, `w_${id}_snp_stk`, { width: 0.06, height: 0.13, depth: 0.3 }, new Vector3(0, -0.02, -0.32), palette.odMat);
      addDecorBox(wg, `w_${id}_snp_mag`, { width: 0.044, height: 0.12, depth: 0.11 }, new Vector3(0, -0.09, 0.1), palette.gunMat);
      addDecorCyl(wg, `w_${id}_snp_scp`, 0.26, 0.046, new Vector3(0, 0.095, 0.04), palette.gunMat, new Vector3(Math.PI * 0.5, 0, 0));
      addDecorCyl(wg, `w_${id}_snp_tur`, 0.028, 0.028, new Vector3(0, 0.122, 0.04), palette.gunLightMat);
      addDecorCyl(wg, `w_${id}_snp_obj`, 0.045, 0.066, new Vector3(0, 0.095, 0.17), palette.gunLightMat, new Vector3(Math.PI * 0.5, 0, 0));
      addDecorCyl(wg, `w_${id}_snp_lens`, 0.01, 0.056, new Vector3(0, 0.095, 0.194), palette.scopeLensMat, new Vector3(Math.PI * 0.5, 0, 0));
    } else if (wId === 'pistol') {
      addDecorBox(wg, `w_${id}_p_frm`, { width: 0.046, height: 0.04, depth: 0.23 }, new Vector3(0, -0.01, 0.04), palette.plateMat);
      addDecorBox(wg, `w_${id}_p_sld`, { width: 0.048, height: 0.044, depth: 0.25 }, new Vector3(0, 0.028, 0.03), palette.gunLightMat);
      addDecorBox(wg, `w_${id}_p_lgt`, { width: 0.036, height: 0.034, depth: 0.078 }, new Vector3(0, -0.036, 0.12), palette.gunMat);
      addDecorBox(wg, `w_${id}_p_grp`, { width: 0.044, height: 0.12, depth: 0.062 }, new Vector3(0, -0.075, -0.04), palette.gunMat, new Vector3(-0.24, 0, 0));
    } else {
      // K-Bar Combat Knife + 3D Charm Mount
      const grip = new TransformNode(`w_${id}_kn_grip`, scene);
      grip.parent = wg;
      grip.position.set(0, 0.02, 0.04);
      grip.rotation.set(0.75, -0.15, 0.15);

      addDecorCyl(grip, `w_${id}_kn_hdl`, 0.14, 0.034, new Vector3(0, -0.04, 0), palette.gearMat);
      addDecorBox(grip, `w_${id}_kn_grd`, { width: 0.026, height: 0.014, depth: 0.074 }, new Vector3(0, 0.035, 0), palette.gunMat);
      addDecorBox(grip, `w_${id}_kn_spn`, { width: 0.01, height: 0.2, depth: 0.03 }, new Vector3(0, 0.14, -0.002), palette.gunMat);
      addDecorBox(grip, `w_${id}_kn_edg`, { width: 0.006, height: 0.195, depth: 0.016 }, new Vector3(0, 0.138, 0.018), palette.bladeMat);
      addDecorCyl(grip, `w_${id}_kn_pom`, 0.022, 0.04, new Vector3(0, -0.116, 0), palette.gunLightMat);

      const cp = new TransformNode(`w_${id}_kn_cp`, scene);
      cp.parent = grip;
      cp.position.set(0.026, -0.118, -0.008);

      for (const charmKey of Object.keys(KNIFE_CHARMS) as KnifeCharmId[]) {
        const cfg = KNIFE_CHARMS[charmKey];
        const chRoot = new TransformNode(`w_${id}_ch_${charmKey}`, scene);
        chRoot.parent = cp;
        const cMat = new PBRMaterial(`w_${id}_chMat_${charmKey}`, scene);
        cMat.albedoColor = Color3.FromHexString(cfg.accentHex);
        cMat.metallic = cfg.metallic;
        cMat.roughness = cfg.roughness;
        if (cfg.emissiveHex) {
          cMat.emissiveColor = Color3.FromHexString(cfg.emissiveHex);
        }
        chRoot.onDisposeObservable.add(() => cMat.dispose());
        addDecorCyl(chRoot, `w_${id}_chRing_${charmKey}`, 0.018, 0.004, new Vector3(0, -0.01, 0), palette.gunLightMat);
        addDecorBox(
          chRoot,
          `w_${id}_chBody_${charmKey}`,
          { width: 0.024, height: 0.038, depth: 0.012 },
          new Vector3(0, -0.038, 0),
          cMat
        );
        charmRoots[charmKey] = chRoot;
      }
    }

    return wg;
  };

  const idsToBuild: readonly WeaponId[] = opts.buildAllWeapons
    ? WEAPON_IDS
    : [opts.initialWeaponId];

  for (const wId of idsToBuild) {
    weaponGroups[wId] = buildWeaponGroup(wId);
  }

  const muzzlePoint = new TransformNode(`op_muzzle_${id}`, scene);
  muzzlePoint.parent = weaponAssembly;

  const muzzleFlash = MeshBuilder.CreatePolyhedron(
    `op_flash_${id}`,
    { type: 1, size: 0.085 },
    scene
  );
  muzzleFlash.parent = muzzlePoint;
  muzzleFlash.material = palette.flashMat;
  muzzleFlash.isPickable = false;
  muzzleFlash.isVisible = false;
  muzzleFlash.renderingGroupId = group;

  const setWeapon = (weaponId: WeaponId) => {
    for (const [k, node] of Object.entries(weaponGroups)) {
      if (node) {
        node.setEnabled(k === weaponId);
      }
    }
    const pose = WEAPON_POSE_OFFSETS[weaponId] ?? WEAPON_POSE_OFFSETS.ak47;
    weaponAssembly.position.copyFrom(pose.pos);
    weaponAssembly.rotation.y = pose.rotY;

    const muzzleOffset = WEAPON_MUZZLE_OFFSETS[weaponId] ?? WEAPON_MUZZLE_OFFSETS.ak47;
    muzzlePoint.position.copyFrom(muzzleOffset);
    if (weaponId === 'knife') {
      muzzleFlash.isVisible = false;
    }
  };

  const setCharm = (charmId: KnifeCharmId) => {
    for (const [k, node] of Object.entries(charmRoots)) {
      if (node) {
        node.setEnabled(k === charmId);
      }
    }
  };

  setWeapon(opts.initialWeaponId);
  setCharm(opts.initialCharmId ?? 'tactical_tag');

  return {
    characterId,
    root,
    pivot,
    upperBodyPivot,
    legLPivot,
    legRPivot,
    headMesh,
    bodyMesh,
    bodyMat,
    headMat,
    weaponAssembly,
    weaponGroups,
    muzzlePoint,
    muzzleFlash,
    charmRoots,
    setWeapon,
    setCharm,
  };
}
