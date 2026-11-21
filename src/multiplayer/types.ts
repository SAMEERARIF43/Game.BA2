import { CharacterId, GunId, Stance, WeaponId } from '../game/types';
import { MapId, TeamId } from '../maps/types';
export type { ChatChannel, ChatMessage, ChatPayload } from './chat';

export interface CreatePrivateMatchOptions {
  playerName: string;
  roomName: string;
  mapId: MapId;
  killLimit: number;
  timeLimit: number;
  respawnDelay: number;
  friendlyFire: boolean;
  botCount: number;
  password?: string;
  characterId?: CharacterId;
  weaponId?: GunId;
}

export interface RoomLookupSummary {
  roomCode: string;
  roomName: string;
  mapId: MapId;
  phase: string;
  playerCount: number;
  maxPlayers: number;
  hasPassword: boolean;
}

export interface LobbyPlayerInfo {
  id: string;
  name: string;
  team: TeamId;
  isBot: boolean;
  isHost: boolean;
  ready: boolean;
  isAlive: boolean;
  respawnTimer: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
  pitch: number;
  characterId: CharacterId;
  weaponId: WeaponId;
  stance?: Stance;
  health: number;
  kills: number;
  deaths: number;
}

export interface LobbyRoomSnapshot {
  roomCode: string;
  roomName: string;
  mapId: MapId;
  phase: 'lobby' | 'playing' | 'ended';
  killLimit: number;
  timeLimit: number;
  timeRemaining: number;
  respawnDelay: number;
  friendlyFire: boolean;
  botCount: number;
  hasPassword: boolean;
  hostId: string;
  blueScore: number;
  redScore: number;
  winner: TeamId | 'draw' | '';
  players: LobbyPlayerInfo[];
  localPlayerId: string;
  isLocalSolo?: boolean;
}

export interface RemoteFireEvent {
  shooterId: string;
  weaponId: WeaponId;
  muzzleX: number;
  muzzleY: number;
  muzzleZ: number;
  endX: number;
  endY: number;
  endZ: number;
}

export interface NetworkKillFeedEvent {
  id: number;
  killerName: string;
  killerTeam: TeamId;
  victimName: string;
  victimTeam: TeamId;
  weaponName: string;
  headshot: boolean;
  distanceMeters: number;
}

export interface NetworkDamagedEvent {
  damage: number;
  attackerName: string;
  weaponName: string;
  headshot: boolean;
  killed: boolean;
  attackerX?: number;
  attackerY?: number;
  attackerZ?: number;
}

export interface NetworkHitConfirmEvent {
  zone: 'head' | 'body';
  killed: boolean;
  damage: number;
}

export interface NetworkPingEvent {
  id: string;
  senderId: string;
  senderName: string;
  team: TeamId;
  kind: 'location' | 'enemy';
  x: number;
  y: number;
  z: number;
  targetId?: string;
  durationMs: number;
}
