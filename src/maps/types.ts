import { BaseTexture, Material, TransformNode, Vector3 } from '@babylonjs/core';

export type MapId = 'urban' | 'desert' | 'industrial' | 'forest';

export type TeamId = 'blue' | 'red';

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
  blueSpawns: Vector3[];
  redSpawns: Vector3[];
  waypoints: Vector3[];
  previewCameraTarget: Vector3;
}

export interface BuiltMapResources {
  nodes: TransformNode[];
  materials: Material[];
  textures: BaseTexture[];
}
