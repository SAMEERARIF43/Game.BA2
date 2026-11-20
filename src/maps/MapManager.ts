import {
  Color3,
  Color4,
  DirectionalLight,
  HemisphericLight,
  Scene,
  ShadowGenerator,
} from '@babylonjs/core';
import { buildDesertMap, DESERT_MAP_DEF } from './desertMap';
import { buildForestMap, FOREST_MAP_DEF } from './forestMap';
import { buildIndustrialMap, INDUSTRIAL_MAP_DEF } from './industrialMap';
import { MapBuildContext } from './mapHelpers';
import { BuiltMapResources, MapDefinition, MapId } from './types';
import { buildUrbanMap, URBAN_MAP_DEF } from './urbanMap';

export const MAP_REGISTRY: Record<MapId, MapDefinition> = {
  urban: URBAN_MAP_DEF,
  desert: DESERT_MAP_DEF,
  industrial: INDUSTRIAL_MAP_DEF,
  forest: FOREST_MAP_DEF,
};

export const MAP_LIST: MapDefinition[] = [
  URBAN_MAP_DEF,
  DESERT_MAP_DEF,
  INDUSTRIAL_MAP_DEF,
  FOREST_MAP_DEF,
];

export class MapManager {
  private scene: Scene;
  private sunLight: DirectionalLight;
  private hemiLight: HemisphericLight;
  private shadowGenerator: ShadowGenerator | null;

  private activeMapId: MapId | null = null;
  private activeResources: BuiltMapResources | null = null;

  constructor(
    scene: Scene,
    sunLight: DirectionalLight,
    hemiLight: HemisphericLight,
    shadowGenerator: ShadowGenerator | null
  ) {
    this.scene = scene;
    this.sunLight = sunLight;
    this.hemiLight = hemiLight;
    this.shadowGenerator = shadowGenerator;
  }

  public getCurrentDefinition(): MapDefinition {
    return MAP_REGISTRY[this.activeMapId ?? 'urban'];
  }

  public getCurrentMapId(): MapId | null {
    return this.activeMapId;
  }

  public loadMap(mapId: MapId): MapDefinition {
    this.disposeCurrentMap();

    const def = MAP_REGISTRY[mapId] ?? MAP_REGISTRY.urban;
    this.activeMapId = def.id;

    // Apply map atmosphere, sky, fog, and sun lighting
    const skyColor = Color3.FromHexString(def.skyHex);
    this.scene.clearColor = new Color4(skyColor.r, skyColor.g, skyColor.b, 1.0);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogColor = Color3.FromHexString(def.fogHex);
    this.scene.fogDensity = def.fogDensity;

    this.sunLight.direction.copyFrom(def.sunDirection);
    this.sunLight.position.copyFrom(def.sunPosition);
    this.sunLight.diffuse = Color3.FromHexString(def.sunColorHex);
    this.sunLight.intensity = def.sunIntensity;

    this.hemiLight.intensity = def.ambientIntensity;
    this.hemiLight.diffuse = Color3.FromHexString(def.skyHorizonHex);
    this.hemiLight.groundColor = Color3.FromHexString(def.ambientGroundHex);

    const ctx = new MapBuildContext(this.scene, this.shadowGenerator);
    ctx.createSkyDomeAndEnvironment(def);

    switch (def.id) {
      case 'urban':
        buildUrbanMap(ctx);
        break;
      case 'desert':
        buildDesertMap(ctx);
        break;
      case 'industrial':
        buildIndustrialMap(ctx);
        break;
      case 'forest':
        buildForestMap(ctx);
        break;
    }

    this.activeResources = ctx.resources;
    return def;
  }

  public disposeCurrentMap(): void {
    if (!this.activeResources) return;

    this.scene.environmentTexture = null;

    const shadowList = this.shadowGenerator?.getShadowMap()?.renderList;
    if (shadowList) {
      shadowList.length = 0;
    }

    for (const node of this.activeResources.nodes) {
      node.dispose();
    }
    for (const mat of this.activeResources.materials) {
      mat.dispose();
    }
    for (const tex of this.activeResources.textures) {
      tex.dispose();
    }
    for (const light of this.activeResources.lights) {
      light.dispose();
    }

    this.activeResources = null;
    this.activeMapId = null;
  }

  public dispose(): void {
    this.disposeCurrentMap();
  }
}
