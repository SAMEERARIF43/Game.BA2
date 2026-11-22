import { BaseTexture, Light, Material, TransformNode, Vector3 } from '@babylonjs/core';

export type MapId = 'urban' | 'desert' | 'industrial' | 'forest';

export type TeamId = 'blue' | 'red';

export interface BombSiteDef {
  id: 'A' | 'B';
  label: string;
  position: Vector3;
  radius: number;
}

export interface MapDefinition {
  id: MapId;
  name: string;
  tagline: string;
  environmentLabel: string;
  engagementRange: string;
  skyHex: string;
  skyZenithHex: string;
  skyHorizonHex: string;
  fogHex: string;
  fogDensity: number;
  sunDirection: Vector3;
  sunPosition: Vector3;
  sunColorHex: string;
  sunIntensity: number;
  ambientIntensity: number;
  ambientGroundHex: string;
  accentHex: string;
  exposure?: number;
  contrast?: number;
  blueSpawns: Vector3[];
  redSpawns: Vector3[];
  waypoints: Vector3[];
  bombSites: BombSiteDef[];
  previewCameraTarget: Vector3;
}

export interface BuiltMapResources {
  nodes: TransformNode[];
  materials: Material[];
  textures: BaseTexture[];
  lights: Light[];
}
