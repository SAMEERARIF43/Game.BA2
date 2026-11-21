import { schema, t } from '@colyseus/schema';

export const PlayerSchema = schema({
  id: t.string(),
  name: t.string(),
  team: t.string(),
  isBot: t.boolean(),
  isHost: t.boolean(),
  ready: t.boolean(),
  isAlive: t.boolean(),
  respawnTimer: t.number(),
  x: t.number(),
  y: t.number(),
  z: t.number(),
  rotY: t.number(),
  pitch: t.number(),
  characterId: t.string(),
  weaponId: t.string(),
  stance: t.string(),
  health: t.number(),
  kills: t.number(),
  deaths: t.number(),
});

export type PlayerSchemaType = InstanceType<typeof PlayerSchema>;

export const MatchState = schema({
  roomCode: t.string(),
  roomName: t.string(),
  mapId: t.string(),
  phase: t.string(), // 'lobby' | 'playing' | 'ended'
  killLimit: t.number(),
  timeLimit: t.number(),
  timeRemaining: t.number(),
  respawnDelay: t.number(),
  friendlyFire: t.boolean(),
  botCount: t.number(),
  hasPassword: t.boolean(),
  hostId: t.string(),
  blueScore: t.number(),
  redScore: t.number(),
  winner: t.string(), // '' | 'blue' | 'red' | 'draw'
  players: t.map(PlayerSchema),
});

export type MatchStateType = InstanceType<typeof MatchState>;
