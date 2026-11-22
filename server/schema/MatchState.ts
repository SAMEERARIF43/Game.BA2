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
  mode: t.string(), // 'tdm' | 'ffa' | 'bomb'
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
  roundNumber: t.number(),
  roundsToWin: t.number(),
  winner: t.string(), // '' | 'blue' | 'red' | 'draw'
  winnerId: t.string(),
  winnerName: t.string(),
  bombPhase: t.string(), // 'unplanted' | 'planted' | 'defused' | 'detonated' | 'round_end'
  bombSite: t.string(), // '' | 'A' | 'B'
  bombCarrierId: t.string(),
  bombX: t.number(),
  bombY: t.number(),
  bombZ: t.number(),
  bombDetonateTimer: t.number(),
  bombActionPlayerId: t.string(),
  bombActionType: t.string(), // '' | 'plant' | 'defuse'
  bombActionProgress: t.number(),
  roundWinner: t.string(), // '' | 'blue' | 'red'
  roundEndReason: t.string(),
  roundTransitionTimer: t.number(),
  players: t.map(PlayerSchema),
});

export type MatchStateType = InstanceType<typeof MatchState>;
