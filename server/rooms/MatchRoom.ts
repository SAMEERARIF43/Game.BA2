import { type Client, CloseCode, Room, ServerError } from '@colyseus/core';
import {
  isValidMapId,
  SERVER_MAP_LAYOUTS,
  SERVER_WEAPONS,
  type ServerMapId,
  type Vec3Tuple,
} from '../mapSpawns.ts';
import {
  MatchState,
  type MatchStateType,
  PlayerSchema,
  type PlayerSchemaType,
} from '../schema/MatchState.ts';
import { validateAuthoritativeHit } from '../hitValidation.ts';
import {
  validatePlayerShot,
  validatePlayerMovement,
  type PlayerValidationState,
} from '../validation/ammoValidation.ts';
import {
  CHAT_RATE_LIMIT_MS,
  type ChatMessage,
  validateChatPayload,
} from '../../src/multiplayer/chat.ts';
import {
  BOMB_DEFUSE_DURATION_SEC,
  BOMB_DETONATE_DURATION_SEC,
  BOMB_PLANT_DURATION_SEC,
  BOMB_ROUND_DURATION_SEC,
  BOMB_ROUND_END_DELAY_SEC,
  BOMB_ROUNDS_TO_WIN,
  BOMB_SITE_RADIUS,
  type GameMode,
  isHostile,
  normalizeGameMode,
  sortFfaParticipants,
} from '../../src/game/gameModeRules.ts';

export interface CreateRoomOptions {
  playerName?: string;
  roomName?: string;
  mapId?: string;
  mode?: GameMode;
  killLimit?: number;
  timeLimit?: number;
  respawnDelay?: number;
  friendlyFire?: boolean;
  botCount?: number;
  password?: string;
  characterId?: string;
  weaponId?: string;
}

export interface JoinRoomOptions {
  playerName?: string;
  password?: string;
  characterId?: string;
  weaponId?: string;
}

export interface PublicRoomSummary {
  roomCode: string;
  roomName: string;
  mapId: string;
  mode: GameMode;
  phase: string;
  playerCount: number;
  maxPlayers: number;
  hasPassword: boolean;
  botCount: number;
  region: string;
}

interface BotBrain {
  waypointIndex: number;
  fireCooldownMs: number;
  yaw: number;
}

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ACTIVE_ROOMS = new Map<string, MatchRoom>();

export function getPublicRoomSummary(code: string): PublicRoomSummary | null {
  const normalized = code.trim().toUpperCase();
  const room = ACTIVE_ROOMS.get(normalized);
  if (!room) return null;
  return room.getPublicSummary();
}

export function getAllPublicRooms(): PublicRoomSummary[] {
  const list: PublicRoomSummary[] = [];
  ACTIVE_ROOMS.forEach((room) => {
    if (room.state.phase === 'lobby' && !room.state.hasPassword) {
      list.push(room.getPublicSummary());
    }
  });
  return list;
}

function generateUniqueRoomCode(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    }
    if (!ACTIVE_ROOMS.has(code)) {
      return code;
    }
  }
  return `SF${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

const VALID_CHARACTER_IDS = new Set(['assault', 'vanguard', 'breacher', 'marksman']);
const VALID_GUN_IDS = new Set(['shotgun', 'ak47', 'smg', 'sniper', 'pistol']);
const VALID_STANCES = new Set(['stand', 'crouch', 'sprint', 'slide']);

function normalizeCharacterId(raw: unknown): string {
  return typeof raw === 'string' && VALID_CHARACTER_IDS.has(raw) ? raw : 'assault';
}

function getBotCharacterForWeapon(weaponId: string): string {
  switch (weaponId) {
    case 'smg':
      return 'vanguard';
    case 'shotgun':
      return 'breacher';
    case 'sniper':
      return 'marksman';
    default:
      return 'assault';
  }
}

function sanitizeName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim().slice(0, 20);
  return trimmed.length > 0 ? trimmed : fallback;
}

export class MatchRoom extends Room<{ state: MatchStateType }> {
  public maxClients = 12;

  private roomPassword = '';
  private spawnProtectionUntil = new Map<string, number>();
  private lastShotAt = new Map<string, number>();
  private lastPingAt = new Map<string, number>();
  private lastChatAt = new Map<string, number>();
  private equippedGunByPlayer = new Map<string, string>();
  private queuedGunByPlayer = new Map<string, string>();
  private bombHoldingByPlayer = new Map<string, boolean>();
  private playerValidationStates = new Map<string, PlayerValidationState>();
  private botBrains = new Map<string, BotBrain>();
  private killFeedSeq = 0;
  private pingSeq = 0;
  private chatSeq = 0;

  public onCreate(options: CreateRoomOptions = {}): void {
    const code = generateUniqueRoomCode();
    this.roomId = code;
    ACTIVE_ROOMS.set(code, this);

    const mode = normalizeGameMode(options.mode, 'tdm');
    const state = new MatchState();
    state.roomCode = code;
    state.roomName = sanitizeName(options.roomName, `${code} Tactical Room`);
    state.mapId = isValidMapId(String(options.mapId)) ? String(options.mapId) : 'urban';
    state.mode = mode;
    state.phase = 'lobby';
    if (mode === 'bomb') {
      const rounds = clamp(Number(options.killLimit) || BOMB_ROUNDS_TO_WIN, 1, 13);
      state.roundsToWin = rounds;
      state.killLimit = rounds;
      state.timeLimit = clamp(Number(options.timeLimit) || BOMB_ROUND_DURATION_SEC, 30, 300);
      state.respawnDelay = 0;
    } else if (mode === 'ffa') {
      state.roundsToWin = 1;
      state.killLimit = clamp(Number(options.killLimit) || 20, 5, 100);
      state.timeLimit = clamp(Number(options.timeLimit) || 300, 60, 1200);
      state.respawnDelay = clamp(Number(options.respawnDelay) || 2.5, 1, 10);
    } else {
      state.roundsToWin = 1;
      state.killLimit = clamp(Number(options.killLimit) || 30, 5, 100);
      state.timeLimit = clamp(Number(options.timeLimit) || 300, 60, 1200);
      state.respawnDelay = clamp(Number(options.respawnDelay) || 3, 1, 10);
    }
    state.timeRemaining = state.timeLimit;
    state.friendlyFire = Boolean(options.friendlyFire);
    state.botCount = clamp(Number(options.botCount ?? 4), 0, 10);

    const pwd = typeof options.password === 'string' ? options.password.trim() : '';
    this.roomPassword = pwd;
    state.hasPassword = pwd.length > 0;
    state.hostId = '';
    state.blueScore = 0;
    state.redScore = 0;
    state.roundNumber = 1;
    state.winner = '';
    state.winnerId = '';
    state.winnerName = '';
    this.resetServerBombStateFields(state, '');

    this.setState(state);
    this.syncBotSlots();
    this.registerMessageHandlers();

    // 20Hz authoritative simulation loop
    this.setSimulationInterval((deltaMs) => {
      this.simulateTick(deltaMs / 1000);
    }, 50);
  }

  private resetServerBombStateFields(state: MatchStateType, carrierId: string): void {
    state.bombPhase = 'unplanted';
    state.bombSite = '';
    state.bombCarrierId = carrierId;
    state.bombX = 0;
    state.bombY = 0;
    state.bombZ = 0;
    state.bombDetonateTimer = BOMB_DETONATE_DURATION_SEC;
    state.bombActionPlayerId = '';
    state.bombActionType = '';
    state.bombActionProgress = 0;
    state.roundWinner = '';
    state.roundEndReason = '';
    state.roundTransitionTimer = 0;
  }

  public getPublicSummary(): PublicRoomSummary {
    return {
      roomCode: this.state.roomCode,
      roomName: this.state.roomName,
      mapId: this.state.mapId,
      mode: normalizeGameMode(this.state.mode, 'tdm'),
      phase: this.state.phase,
      playerCount: this.clients.length,
      maxPlayers: this.maxClients,
      hasPassword: this.state.hasPassword,
      botCount: this.state.botCount,
      region: 'US-East',
    };
  }

  public onAuth(_client: Client, options: JoinRoomOptions = {}): boolean {
    if (this.clients.length >= this.maxClients) {
      throw new ServerError(403, 'Room is full');
    }
    if (this.roomPassword.length > 0) {
      const provided = typeof options.password === 'string' ? options.password.trim() : '';
      if (provided !== this.roomPassword) {
        throw new ServerError(401, 'Invalid room password');
      }
    }
    return true;
  }

  public onJoin(client: Client, options: JoinRoomOptions = {}): void {
    const isFirstHuman = this.state.hostId === '' || !this.state.players.has(this.state.hostId);

    const player = new PlayerSchema();
    player.id = client.sessionId;
    player.name = sanitizeName(options.playerName, `Operator-${client.sessionId.slice(0, 4)}`);
    player.team = this.pickBalancedTeam();
    player.isBot = false;
    player.isHost = isFirstHuman;
    player.ready = isFirstHuman;
    player.isAlive = true;
    player.respawnTimer = 0;
    player.characterId = normalizeCharacterId(options.characterId);
    const hasExplicitGun = typeof options.weaponId === 'string' && VALID_GUN_IDS.has(options.weaponId);
    const initialGun = hasExplicitGun ? String(options.weaponId) : 'ak47';
    player.weaponId = initialGun;
    if (hasExplicitGun) {
      this.equippedGunByPlayer.set(client.sessionId, initialGun);
    } else {
      this.equippedGunByPlayer.delete(client.sessionId);
    }
    this.queuedGunByPlayer.delete(client.sessionId);
    player.stance = 'stand';
    player.health = 100;
    player.kills = 0;
    player.deaths = 0;

    if (isFirstHuman) {
      this.state.hostId = client.sessionId;
    }

    const spawn = this.pickTeamSpawn(player.team as 'blue' | 'red');
    player.x = spawn.x;
    player.y = spawn.y;
    player.z = spawn.z;
    player.rotY = player.team === 'blue' ? 0 : Math.PI;
    player.pitch = 0;

    if (this.state.phase === 'playing') {
      this.spawnProtectionUntil.set(player.id, Date.now() + 1500);
    }

    this.state.players.set(client.sessionId, player);
    this.emitSystemChat(`${player.name} joined the room (${player.team.toUpperCase()}).`);
  }

  public async onLeave(client: Client, code?: number | boolean): Promise<void> {
    const leaving = this.state.players.get(client.sessionId);
    if (!leaving) return;

    const consented =
      typeof code === 'boolean'
        ? code
        : code === undefined || code === CloseCode.CONSENTED;

    if (consented) {
      this.handlePlayerDeparture(client.sessionId);
    } else {
      try {
        await this.allowReconnection(client, 30);
        return;
      } catch {
        this.handlePlayerDeparture(client.sessionId);
      }
    }
  }

  private handlePlayerDeparture(sessionId: string): void {
    const leaving = this.state.players.get(sessionId);
    if (leaving) {
      this.state.players.delete(sessionId);
      this.emitSystemChat(`${leaving.name} left the room.`);
    }
    this.spawnProtectionUntil.delete(sessionId);
    this.lastShotAt.delete(sessionId);
    this.lastPingAt.delete(sessionId);
    this.lastChatAt.delete(sessionId);
    this.equippedGunByPlayer.delete(sessionId);
    this.queuedGunByPlayer.delete(sessionId);
    this.bombHoldingByPlayer.delete(sessionId);
    if (this.state.bombCarrierId === sessionId && this.state.bombPhase === 'unplanted') {
      this.reassignBombCarrier();
    }

    // Host migration if host disconnected
    if (this.state.hostId === sessionId) {
      let nextHost: PlayerSchemaType | null = null;
      this.state.players.forEach((p) => {
        if (!nextHost && !p.isBot) {
          nextHost = p;
        }
      });

      if (nextHost) {
        const promoted = nextHost as PlayerSchemaType;
        promoted.isHost = true;
        promoted.ready = true;
        this.state.hostId = promoted.id;
        this.broadcast('system_notice', {
          message: `${promoted.name} is now the room host.`,
        });
        this.emitSystemChat(`${promoted.name} is now the room host.`);
      } else {
        this.state.hostId = '';
      }
    }

    if (this.clients.length === 0) {
      ACTIVE_ROOMS.delete(this.roomId);
    }
  }

  public onDispose(): void {
    ACTIVE_ROOMS.delete(this.state?.roomCode || this.roomId);
    this.botBrains.clear();
    this.spawnProtectionUntil.clear();
    this.lastShotAt.clear();
    this.lastPingAt.clear();
    this.lastChatAt.clear();
    this.equippedGunByPlayer.clear();
    this.queuedGunByPlayer.clear();
    this.bombHoldingByPlayer.clear();
  }

  private emitSystemChat(text: string): void {
    const clean = text.trim();
    if (!clean) return;
    const msg: ChatMessage = {
      id: `sys_${++this.chatSeq}`,
      senderId: 'system',
      senderName: 'SYSTEM',
      senderTeam: 'system',
      channel: 'all',
      text: clean,
      timestamp: Date.now(),
      isSystem: true,
    };
    for (const c of this.clients) {
      c.send('chat', msg);
    }
  }

  private resolvePlayerEquippedGun(p: PlayerSchemaType): string {
    const tracked = this.equippedGunByPlayer.get(p.id);
    if (tracked && VALID_GUN_IDS.has(tracked)) {
      return tracked;
    }
    const inferred = VALID_GUN_IDS.has(p.weaponId) ? p.weaponId : 'ak47';
    this.equippedGunByPlayer.set(p.id, inferred);
    return inferred;
  }

  private registerMessageHandlers(): void {
    this.onMessage('ping', (client) => {
      client.send('pong');
    });

    this.onMessage('switch_team', (client) => {
      if (this.state.phase !== 'lobby') return;
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.team = p.team === 'blue' ? 'red' : 'blue';
      if (!p.isHost) {
        p.ready = false;
      }
      this.emitSystemChat(`${p.name} switched to ${p.team.toUpperCase()} team.`);
    });

    this.onMessage('toggle_ready', (client) => {
      if (this.state.phase !== 'lobby') return;
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.ready = !p.ready;
    });

    this.onMessage('update_config', (client, payload: Partial<CreateRoomOptions>) => {
      if (client.sessionId !== this.state.hostId) return;
      if (this.state.phase !== 'lobby') return;

      if (payload.roomName !== undefined) {
        this.state.roomName = sanitizeName(payload.roomName, this.state.roomName);
      }
      if (payload.mapId && isValidMapId(payload.mapId)) {
        this.state.mapId = payload.mapId;
      }
      if (payload.mode !== undefined) {
        const nextMode = normalizeGameMode(payload.mode, normalizeGameMode(this.state.mode, 'tdm'));
        if (nextMode !== this.state.mode) {
          this.state.mode = nextMode;
          if (nextMode === 'bomb') {
            this.state.roundsToWin = BOMB_ROUNDS_TO_WIN;
            this.state.killLimit = BOMB_ROUNDS_TO_WIN;
            this.state.timeLimit = BOMB_ROUND_DURATION_SEC;
            this.state.timeRemaining = BOMB_ROUND_DURATION_SEC;
            this.state.respawnDelay = 0;
          } else if (nextMode === 'ffa') {
            this.state.roundsToWin = 1;
            this.state.killLimit = 20;
            this.state.timeLimit = 300;
            this.state.timeRemaining = 300;
            this.state.respawnDelay = 2.5;
          } else {
            this.state.roundsToWin = 1;
            this.state.killLimit = 30;
            this.state.timeLimit = 300;
            this.state.timeRemaining = 300;
            this.state.respawnDelay = 3;
          }
        }
      }
      if (payload.killLimit !== undefined) {
        if (this.state.mode === 'bomb') {
          const rounds = clamp(Number(payload.killLimit) || BOMB_ROUNDS_TO_WIN, 1, 13);
          this.state.roundsToWin = rounds;
          this.state.killLimit = rounds;
        } else {
          this.state.killLimit = clamp(Number(payload.killLimit) || 30, 5, 100);
        }
      }
      if (payload.timeLimit !== undefined) {
        this.state.timeLimit = clamp(Number(payload.timeLimit) || 300, 30, 1200);
        this.state.timeRemaining = this.state.timeLimit;
      }
      if (payload.respawnDelay !== undefined && this.state.mode !== 'bomb') {
        this.state.respawnDelay = clamp(Number(payload.respawnDelay) || 3, 1, 10);
      }
      if (payload.friendlyFire !== undefined) {
        this.state.friendlyFire = Boolean(payload.friendlyFire);
      }
      if (payload.botCount !== undefined) {
        this.state.botCount = clamp(Math.round(Number(payload.botCount) || 0), 0, 10);
        this.syncBotSlots();
      }
    });

    this.onMessage('balance_teams', (client) => {
      if (client.sessionId !== this.state.hostId) return;
      if (this.state.phase !== 'lobby') return;

      const humans: PlayerSchemaType[] = [];
      const bots: PlayerSchemaType[] = [];
      this.state.players.forEach((p) => {
        if (p.isBot) bots.push(p);
        else humans.push(p);
      });

      humans.forEach((p, idx) => {
        p.team = idx % 2 === 0 ? 'blue' : 'red';
      });
      bots.forEach((b, idx) => {
        b.team = idx % 2 === 0 ? 'red' : 'blue';
      });
    });

    this.onMessage('kick_player', (client, payload: { targetId?: string }) => {
      if (client.sessionId !== this.state.hostId) return;
      const targetId = payload?.targetId;
      if (!targetId || targetId === client.sessionId) return;

      const targetPlayer = this.state.players.get(targetId);
      if (!targetPlayer || targetPlayer.isBot) return;

      const targetClient = this.clients.find((c) => c.sessionId === targetId);
      if (targetClient) {
        this.emitSystemChat(`${targetPlayer.name} was removed from the room.`);
        targetClient.send('kicked', { reason: 'Removed from room by host.' });
        setTimeout(() => {
          targetClient.leave(4001);
        }, 60);
      }
    });

    this.onMessage('start_match', (client) => {
      if (client.sessionId !== this.state.hostId) return;
      if (this.state.phase === 'playing') return;
      this.startMatch();
    });

    this.onMessage('return_to_lobby', (client) => {
      if (client.sessionId !== this.state.hostId) return;
      this.resetToLobby();
    });

    this.onMessage('select_character', (client, payload: { characterId?: string }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.characterId = normalizeCharacterId(payload?.characterId);
    });

    this.onMessage('select_loadout', (client, payload: { weaponId?: string; characterId?: string }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      if (typeof payload?.characterId === 'string' && VALID_CHARACTER_IDS.has(payload.characterId)) {
        p.characterId = payload.characterId;
      }
      if (typeof payload?.weaponId === 'string' && VALID_GUN_IDS.has(payload.weaponId)) {
        const nextGun = payload.weaponId;
        if (this.state.phase !== 'playing' || !p.isAlive) {
          this.equippedGunByPlayer.set(client.sessionId, nextGun);
          this.queuedGunByPlayer.delete(client.sessionId);
          p.weaponId = nextGun;
        } else {
          this.queuedGunByPlayer.set(client.sessionId, nextGun);
        }
      }
    });

    this.onMessage('request_respawn', (client, payload?: { weaponId?: string }) => {
      if (this.state.phase !== 'playing') return;
      if (normalizeGameMode(this.state.mode, 'tdm') === 'bomb') return;
      const p = this.state.players.get(client.sessionId);
      if (!p || p.isBot || p.isAlive || p.respawnTimer > 0.05) return;

      if (typeof payload?.weaponId === 'string' && VALID_GUN_IDS.has(payload.weaponId)) {
        this.queuedGunByPlayer.set(client.sessionId, payload.weaponId);
      }
      this.respawnPlayer(p, Date.now());
    });

    this.onMessage(
      'player_move',
      (
        client,
        payload: {
          x: number;
          y: number;
          z: number;
          rotY: number;
          pitch: number;
          weaponId: string;
          characterId?: string;
          stance?: string;
        }
      ) => {
        if (this.state.phase !== 'playing') return;
        const p = this.state.players.get(client.sessionId);
        if (!p || !p.isAlive) return;

        if (typeof payload.x === 'number' && Number.isFinite(payload.x)) {
          p.x = clamp(payload.x, -29.5, 29.5);
        }
        if (typeof payload.y === 'number' && Number.isFinite(payload.y)) {
          p.y = clamp(payload.y, -1.0, 20.0);
        }
        if (typeof payload.z === 'number' && Number.isFinite(payload.z)) {
          p.z = clamp(payload.z, -29.5, 29.5);
        }
        if (typeof payload.rotY === 'number' && Number.isFinite(payload.rotY)) {
          // VULN-5: normalise yaw to (-π, +π] to prevent extreme-value exploits
          const twoPi = 2 * Math.PI;
          p.rotY = ((((payload.rotY % twoPi) + twoPi) % twoPi) + Math.PI) % twoPi - Math.PI;
        }
        if (typeof payload.pitch === 'number' && Number.isFinite(payload.pitch)) {
          // VULN-5: clamp pitch to match client camera limits [-1.46, +1.46] + small margin
          p.pitch = clamp(payload.pitch, -1.48, 1.48);
        }
        if (typeof payload.weaponId === 'string') {
          if (!this.equippedGunByPlayer.has(p.id) && VALID_GUN_IDS.has(payload.weaponId)) {
            this.equippedGunByPlayer.set(p.id, payload.weaponId);
            p.weaponId = payload.weaponId;
          } else {
            const allowedGun = this.resolvePlayerEquippedGun(p);
            if (payload.weaponId === allowedGun || payload.weaponId === 'knife') {
              p.weaponId = payload.weaponId;
            }
          }
        }
        if (typeof payload.characterId === 'string' && VALID_CHARACTER_IDS.has(payload.characterId)) {
          p.characterId = payload.characterId;
        }
        if (typeof payload.stance === 'string' && VALID_STANCES.has(payload.stance)) {
          p.stance = payload.stance;
        }
      }
    );

    this.onMessage(
      'player_fire',
      (
        client,
        payload: {
          muzzleX: number;
          muzzleY: number;
          muzzleZ: number;
          endX: number;
          endY: number;
          endZ: number;
          weaponId: string;
          targetId?: string;
          zone?: 'head' | 'body';
          pellets?: Array<{
            endX: number;
            endY: number;
            endZ: number;
            targetId?: string;
            zone?: 'head' | 'body';
          }>;
        }
      ) => {
        if (this.state.phase !== 'playing') return;
        const shooter = this.state.players.get(client.sessionId);
        if (!shooter || !shooter.isAlive) return;

        const allowedGun = this.resolvePlayerEquippedGun(shooter);
        const requestedWeaponId = typeof payload.weaponId === 'string' ? payload.weaponId : '';
        if (requestedWeaponId !== allowedGun && requestedWeaponId !== 'knife') {
          return;
        }

        const weapon = SERVER_WEAPONS[requestedWeaponId];
        if (!weapon) return;

        if (!isValidMapId(this.state.mapId)) {
          return;
        }

        let vState = this.playerValidationStates.get(client.sessionId);
        if (!vState) {
          vState = {
            ammo: {},
            lastShotAt: {},
            lastMoveTime: Date.now(),
            lastX: shooter.x,
            lastY: shooter.y,
            lastZ: shooter.z,
            suspiciousCount: 0,
          };
          this.playerValidationStates.set(client.sessionId, vState);
        }

        const shotRes = validatePlayerShot(vState, weapon.id);
        if (!shotRes.valid) {
          return;
        }
        this.lastShotAt.set(shooter.id, Date.now());

        // Broadcast visual muzzle/tracer to all other clients
        this.broadcast(
          'remote_fire',
          {
            shooterId: shooter.id,
            weaponId: weapon.id,
            muzzleX: Number(payload.muzzleX) || shooter.x,
            muzzleY: Number(payload.muzzleY) || shooter.y + 1.4,
            muzzleZ: Number(payload.muzzleZ) || shooter.z,
            endX: Number(payload.endX) || shooter.x,
            endY: Number(payload.endY) || shooter.y + 1.4,
            endZ: Number(payload.endZ) || shooter.z,
          },
          { except: client }
        );

        // Server-side hit validation & damage calculation
        if (Array.isArray(payload.pellets) && payload.pellets.length > 0 && (weapon.pellets ?? 1) > 1) {
          const maxPellets = Math.min(payload.pellets.length, weapon.pellets ?? 8);
          for (let i = 0; i < maxPellets; i++) {
            const pellet = payload.pellets[i];
            if (!pellet?.targetId) continue;
            const target = this.state.players.get(pellet.targetId);
            if (!target || !target.isAlive) continue;
            this.applyAuthoritativeHit(
              shooter,
              pellet.targetId,
              weapon.id,
              pellet.zone,
              pellet.endX,
              pellet.endY,
              pellet.endZ,
              payload.muzzleX,
              payload.muzzleY,
              payload.muzzleZ
            );
          }
        } else if (payload.targetId) {
          this.applyAuthoritativeHit(
            shooter,
            payload.targetId,
            weapon.id,
            payload.zone,
            payload.endX,
            payload.endY,
            payload.endZ,
            payload.muzzleX,
            payload.muzzleY,
            payload.muzzleZ
          );
        }
      }
    );

    this.onMessage(
      'place_ping',
      (
        client,
        payload: {
          id?: string;
          kind?: string;
          x?: number;
          y?: number;
          z?: number;
          targetId?: string;
        }
      ) => {
        if (this.state.phase !== 'playing') return;
        const sender = this.state.players.get(client.sessionId);
        if (!sender || !sender.isAlive) return;

        const now = Date.now();
        const prevPing = this.lastPingAt.get(sender.id) ?? 0;
        if (now - prevPing < 300) {
          return;
        }

        const rawX = Number(payload?.x);
        const rawY = Number(payload?.y);
        const rawZ = Number(payload?.z);
        if (!Number.isFinite(rawX) || !Number.isFinite(rawY) || !Number.isFinite(rawZ)) {
          return;
        }
        this.lastPingAt.set(sender.id, now);

        const clampedX = clamp(rawX, -45, 45);
        const clampedY = clamp(rawY, -2, 30);
        const clampedZ = clamp(rawZ, -45, 45);

        let kind: 'location' | 'enemy' = 'location';
        let resolvedTargetId: string | undefined;
        let outX = clampedX;
        let outY = clampedY;
        let outZ = clampedZ;

        const mode = normalizeGameMode(this.state.mode, 'tdm');
        if (payload?.kind === 'enemy' && typeof payload?.targetId === 'string') {
          const target = this.state.players.get(payload.targetId);
          if (target && target.isAlive && isHostile(mode, sender, target, this.state.friendlyFire)) {
            kind = 'enemy';
            resolvedTargetId = target.id;
            outX = target.x;
            outY = target.y;
            outZ = target.z;
          }
        }

        const rawId = typeof payload?.id === 'string' ? payload.id.trim() : '';
        const safeClientId = /^[A-Za-z0-9_-]{1,64}$/.test(rawId)
          ? rawId.startsWith(`${sender.id}_`)
            ? rawId
            : `${sender.id}_${rawId}`
          : `${sender.id}_ping_${++this.pingSeq}`;

        const durationMs = kind === 'enemy' ? 6000 : 8000;
        const pingEvent = {
          id: safeClientId,
          senderId: sender.id,
          senderName: sender.name,
          team: sender.team === 'red' ? 'red' : 'blue',
          kind,
          x: outX,
          y: outY,
          z: outZ,
          targetId: resolvedTargetId,
          durationMs,
        };

        // In FFA only the sender receives pings; otherwise broadcast strictly to teammates
        for (const c of this.clients) {
          const recipient = this.state.players.get(c.sessionId);
          if (
            recipient &&
            (mode === 'ffa' ? recipient.id === sender.id : recipient.team === sender.team)
          ) {
            c.send('team_ping', pingEvent);
          }
        }
      }
    );

    this.onMessage('bomb_interact', (client, payload: { holding?: boolean }) => {
      if (this.state.phase !== 'playing' || this.state.mode !== 'bomb') return;
      const actor = this.state.players.get(client.sessionId);
      if (!actor || actor.isBot || !actor.isAlive) {
        this.bombHoldingByPlayer.delete(client.sessionId);
        return;
      }
      this.bombHoldingByPlayer.set(client.sessionId, Boolean(payload?.holding));
    });

    this.onMessage('chat', (client, payload: unknown) => {
      const sender = this.state.players.get(client.sessionId);
      if (!sender || sender.isBot) return;

      const validated = validateChatPayload(payload);
      if (!validated) return;

      const now = Date.now();
      const prevChat = this.lastChatAt.get(sender.id) ?? 0;
      if (now - prevChat < CHAT_RATE_LIMIT_MS) {
        return;
      }
      this.lastChatAt.set(sender.id, now);

      const mode = normalizeGameMode(this.state.mode, 'tdm');
      const effectiveChannel = mode === 'ffa' && validated.channel === 'team' ? 'all' : validated.channel;

      const chatMsg: ChatMessage = {
        id: `chat_${sender.id}_${++this.chatSeq}`,
        senderId: sender.id,
        senderName: sender.name,
        senderTeam: sender.team === 'red' ? 'red' : 'blue',
        channel: effectiveChannel,
        text: validated.text,
        timestamp: now,
      };

      if (effectiveChannel === 'team') {
        for (const c of this.clients) {
          const recipient = this.state.players.get(c.sessionId);
          if (recipient && recipient.team === sender.team) {
            c.send('chat', chatMsg);
          }
        }
        return;
      }

      for (const c of this.clients) {
        c.send('chat', chatMsg);
      }
    });
  }

  private reassignBombCarrier(): void {
    let nextCarrier = '';
    this.state.players.forEach((p) => {
      if (!nextCarrier && !p.isBot && p.team === 'blue' && p.isAlive) {
        nextCarrier = p.id;
      }
    });
    if (!nextCarrier) {
      this.state.players.forEach((p) => {
        if (!nextCarrier && p.team === 'blue' && p.isAlive) {
          nextCarrier = p.id;
        }
      });
    }
    this.state.bombCarrierId = nextCarrier;
  }

  private startMatch(): void {
    const mode = normalizeGameMode(this.state.mode, 'tdm');
    this.state.mode = mode;
    this.state.blueScore = 0;
    this.state.redScore = 0;
    this.state.roundNumber = 1;
    this.state.winner = '';
    this.state.winnerId = '';
    this.state.winnerName = '';
    if (mode === 'bomb') {
      this.state.timeLimit = clamp(this.state.timeLimit || BOMB_ROUND_DURATION_SEC, 30, 300);
      this.state.roundsToWin = clamp(this.state.roundsToWin || BOMB_ROUNDS_TO_WIN, 1, 13);
      this.state.killLimit = this.state.roundsToWin;
    }
    this.state.timeRemaining = this.state.timeLimit;
    this.state.phase = 'playing';

    this.spawnProtectionUntil.clear();
    this.lastShotAt.clear();
    this.lastPingAt.clear();
    this.bombHoldingByPlayer.clear();

    const now = Date.now();
    this.state.players.forEach((p) => {
      p.kills = 0;
      p.deaths = 0;
      p.health = 100;
      p.isAlive = true;
      p.respawnTimer = 0;
      p.stance = 'stand';

      if (!p.isBot) {
        const queued = this.queuedGunByPlayer.get(p.id);
        if (queued && VALID_GUN_IDS.has(queued)) {
          this.equippedGunByPlayer.set(p.id, queued);
          this.queuedGunByPlayer.delete(p.id);
        }
        p.weaponId = this.resolvePlayerEquippedGun(p);
      }

      const spawn = this.pickTeamSpawn(p.team as 'blue' | 'red', p.id);
      p.x = spawn.x;
      p.y = spawn.y;
      p.z = spawn.z;
      p.rotY = p.team === 'blue' ? 0 : Math.PI;
      p.pitch = 0;
      this.spawnProtectionUntil.set(p.id, now + 1500);

      if (!p.isBot) {
        const c = this.clients.find((cl) => cl.sessionId === p.id);
        c?.send('player_respawn', { x: p.x, y: p.y, z: p.z, rotY: p.rotY });
      }
    });

    if (mode === 'bomb') {
      this.resetServerBombStateFields(this.state, '');
      this.reassignBombCarrier();
    } else {
      this.resetServerBombStateFields(this.state, '');
    }
  }

  private resetToLobby(): void {
    this.state.phase = 'lobby';
    this.state.blueScore = 0;
    this.state.redScore = 0;
    this.state.roundNumber = 1;
    this.state.winner = '';
    this.state.winnerId = '';
    this.state.winnerName = '';
    this.state.timeRemaining = this.state.timeLimit;
    this.bombHoldingByPlayer.clear();
    this.resetServerBombStateFields(this.state, '');
    this.state.players.forEach((p) => {
      p.kills = 0;
      p.deaths = 0;
      p.health = 100;
      p.isAlive = true;
      p.respawnTimer = 0;
      p.stance = 'stand';
      if (!p.isBot) {
        const queued = this.queuedGunByPlayer.get(p.id);
        if (queued && VALID_GUN_IDS.has(queued)) {
          this.equippedGunByPlayer.set(p.id, queued);
          this.queuedGunByPlayer.delete(p.id);
        }
        p.weaponId = this.resolvePlayerEquippedGun(p);
      }
      if (!p.isHost && !p.isBot) {
        p.ready = false;
      }
    });
  }

  private applyAuthoritativeHit(
    shooter: PlayerSchemaType,
    targetId: string,
    weaponId: string,
    claimedZone?: 'head' | 'body',
    endX?: number,
    endY?: number,
    endZ?: number,
    muzzleX?: number,
    muzzleY?: number,
    muzzleZ?: number,
    isBotShooter = false
  ): void {
    const target = this.state.players.get(targetId);
    if (!target) return;

    const now = Date.now();
    const protUntil = this.spawnProtectionUntil.get(target.id) ?? 0;
    const mapId = this.state.mapId;

    const mode = normalizeGameMode(this.state.mode, 'tdm');
    const validation = validateAuthoritativeHit(
      shooter,
      target,
      {
        // Client-supplied muzzle coordinates are accepted in the payload but the
        // server validation module (hitValidation.ts) derives its own authoritative
        // muzzle from shooter position + fixed height offset (VULN-3).
        muzzleX,
        muzzleY,
        muzzleZ,
        endX,
        endY,
        endZ,
        weaponId,
        targetId,
        claimedZone,
      },
      {
        friendlyFire: this.state.friendlyFire,
        mode,
        spawnProtectionUntil: protUntil,
        currentTime: now,
        // Wire server-held orientation for VULN-2 / VULN-5 checks
        shooterRotY: shooter.rotY,
        shooterPitch: shooter.pitch,
        // Wire mapId for VULN-1 occlusion check
        mapId,
        // Bot shooters use server-computed coordinates — skip client-coord checks
        isBotShooter,
      }
    );

    if (!validation.accepted) return;

    const { verifiedZone, damage, isHeadshot, weapon } = validation;
    const hostileHit = isHostile(mode, shooter, target, true);
    const distance = Math.hypot(target.x - shooter.x, target.y - shooter.y, target.z - shooter.z);

    target.health = Math.max(0, target.health - damage);
    const killed = target.health <= 0;

    if (!shooter.isBot) {
      const shooterClient = this.clients.find((c) => c.sessionId === shooter.id);
      shooterClient?.send('hit_confirm', {
        zone: verifiedZone,
        killed,
        damage,
      });
    }

    if (!target.isBot) {
      const targetClient = this.clients.find((c) => c.sessionId === target.id);
      targetClient?.send('player_damaged', {
        damage,
        attackerName: shooter.name,
        weaponName: weapon.name,
        headshot: isHeadshot,
        killed,
        attackerX: shooter.x,
        attackerY: shooter.y,
        attackerZ: shooter.z,
      });
    }

    if (killed) {
      target.isAlive = false;
      target.respawnTimer = mode === 'bomb' ? 0 : this.state.respawnDelay;
      target.deaths += 1;
      this.bombHoldingByPlayer.delete(target.id);

      if (hostileHit) {
        shooter.kills += 1;
        if (mode === 'tdm') {
          if (shooter.team === 'blue') {
            this.state.blueScore += 1;
          } else {
            this.state.redScore += 1;
          }
        }
      }

      this.broadcast('kill_feed', {
        id: ++this.killFeedSeq,
        killerName: shooter.name,
        killerTeam: shooter.team,
        victimName: target.name,
        victimTeam: target.team,
        weaponName: weapon.name,
        headshot: isHeadshot,
        distanceMeters: Math.round(distance * 10) / 10,
      });

      if (mode === 'ffa') {
        if (shooter.kills >= this.state.killLimit) {
          this.state.winnerId = shooter.id;
          this.state.winnerName = shooter.name;
          this.state.winner = shooter.team === 'red' ? 'red' : 'blue';
          this.state.phase = 'ended';
        }
        return;
      }

      if (mode === 'bomb') {
        if (this.state.bombActionPlayerId === target.id) {
          this.state.bombActionPlayerId = '';
          this.state.bombActionType = '';
          this.state.bombActionProgress = 0;
        }
        if (this.state.bombPhase === 'unplanted' && this.state.bombCarrierId === target.id) {
          this.reassignBombCarrier();
        }
        if (this.state.bombPhase !== 'round_end' && this.state.bombPhase !== 'defused' && this.state.bombPhase !== 'detonated') {
          let aliveBlue = 0;
          let aliveRed = 0;
          this.state.players.forEach((p) => {
            if (!p.isAlive) return;
            if (p.team === 'blue') aliveBlue += 1;
            else aliveRed += 1;
          });
          if (aliveRed === 0) {
            this.endServerBombRound('blue', 'Defenders Eliminated');
          } else if (aliveBlue === 0 && this.state.bombPhase === 'unplanted') {
            this.endServerBombRound('red', 'Attackers Eliminated');
          }
        }
        return;
      }

      if (this.state.blueScore >= this.state.killLimit) {
        this.state.winner = 'blue';
        this.state.phase = 'ended';
      } else if (this.state.redScore >= this.state.killLimit) {
        this.state.winner = 'red';
        this.state.phase = 'ended';
      }
    }
  }

  private endServerBombRound(winnerTeam: 'blue' | 'red', reason: string): void {
    if (this.state.phase !== 'playing' || this.state.bombPhase === 'round_end') return;
    if (winnerTeam === 'blue') {
      this.state.blueScore += 1;
    } else {
      this.state.redScore += 1;
    }
    this.state.roundWinner = winnerTeam;
    this.state.roundEndReason = reason;
    this.state.bombActionPlayerId = '';
    this.state.bombActionType = '';
    this.state.bombActionProgress = 0;
    this.bombHoldingByPlayer.clear();

    const roundsTarget = Math.max(1, this.state.roundsToWin || BOMB_ROUNDS_TO_WIN);
    if (this.state.blueScore >= roundsTarget || this.state.redScore >= roundsTarget) {
      this.state.winner = this.state.blueScore >= roundsTarget ? 'blue' : 'red';
      this.state.phase = 'ended';
      this.state.bombPhase = 'round_end';
      this.state.roundTransitionTimer = 0;
      return;
    }

    this.state.bombPhase = 'round_end';
    this.state.roundTransitionTimer = BOMB_ROUND_END_DELAY_SEC;
  }

  private startNextServerBombRound(now: number): void {
    this.state.roundNumber += 1;
    this.state.timeRemaining = clamp(this.state.timeLimit || BOMB_ROUND_DURATION_SEC, 30, 300);
    this.bombHoldingByPlayer.clear();
    this.resetServerBombStateFields(this.state, '');

    this.state.players.forEach((p) => {
      this.respawnPlayer(p, now);
    });
    this.reassignBombCarrier();
  }

  private stepServerBombInteraction(dt: number): void {
    if (this.state.mode !== 'bomb' || this.state.phase !== 'playing') return;
    if (this.state.bombPhase === 'round_end' || this.state.bombPhase === 'defused' || this.state.bombPhase === 'detonated') {
      return;
    }

    const mapId: ServerMapId = isValidMapId(this.state.mapId) ? this.state.mapId : 'urban';
    const layout = SERVER_MAP_LAYOUTS[mapId];

    // Evaluate human holdings + bot auto-interactions
    let activeActor: PlayerSchemaType | null = null;
    let activeAction: 'plant' | 'defuse' | null = null;
    let activeSiteId: 'A' | 'B' | null = null;
    let activeSiteY = 0;

    // Prioritize existing action player if still holding & valid
    const currentId = this.state.bombActionPlayerId;
    if (currentId) {
      const cur = this.state.players.get(currentId);
      if (cur && cur.isAlive && (cur.isBot || this.bombHoldingByPlayer.get(cur.id))) {
        if (this.state.bombPhase === 'unplanted' && cur.team === 'blue') {
          const site = layout.bombSites.find((s) => Math.hypot(cur.x - s.x, cur.z - s.z) <= s.radius);
          if (site) {
            activeActor = cur;
            activeAction = 'plant';
            activeSiteId = site.id;
            activeSiteY = site.y;
          }
        } else if (this.state.bombPhase === 'planted' && cur.team === 'red') {
          if (Math.hypot(cur.x - this.state.bombX, cur.z - this.state.bombZ) <= BOMB_SITE_RADIUS) {
            activeActor = cur;
            activeAction = 'defuse';
          }
        }
      }
    }

    if (!activeActor) {
      this.state.players.forEach((p) => {
        if (activeActor || !p.isAlive) return;
        const holding = !p.isBot && Boolean(this.bombHoldingByPlayer.get(p.id));
        if (!holding) return;

        if (this.state.bombPhase === 'unplanted' && p.team === 'blue') {
          const carrier = this.state.players.get(this.state.bombCarrierId);
          const canCarry = this.state.bombCarrierId === p.id || !carrier || !carrier.isAlive;
          const site = layout.bombSites.find((s) => Math.hypot(p.x - s.x, p.z - s.z) <= s.radius);
          if (canCarry && site) {
            activeActor = p;
            activeAction = 'plant';
            activeSiteId = site.id;
            activeSiteY = site.y;
          }
        } else if (this.state.bombPhase === 'planted' && p.team === 'red') {
          if (Math.hypot(p.x - this.state.bombX, p.z - this.state.bombZ) <= BOMB_SITE_RADIUS) {
            activeActor = p;
            activeAction = 'defuse';
          }
        }
      });
    }

    if (!activeActor || !activeAction) {
      this.state.bombActionPlayerId = '';
      this.state.bombActionType = '';
      this.state.bombActionProgress = 0;
      return;
    }

    const duration = activeAction === 'plant' ? BOMB_PLANT_DURATION_SEC : BOMB_DEFUSE_DURATION_SEC;
    const prevProgress =
      this.state.bombActionPlayerId === activeActor.id && this.state.bombActionType === activeAction
        ? this.state.bombActionProgress
        : 0;
    const nextProgress = Math.min(1, prevProgress + dt / duration);

    this.state.bombActionPlayerId = activeActor.id;
    this.state.bombActionType = activeAction;
    this.state.bombActionProgress = nextProgress;

    if (nextProgress >= 1) {
      if (activeAction === 'plant' && activeSiteId) {
        this.state.bombPhase = 'planted';
        this.state.bombSite = activeSiteId;
        this.state.bombCarrierId = '';
        this.state.bombX = activeActor.x;
        this.state.bombY = activeSiteY;
        this.state.bombZ = activeActor.z;
        this.state.bombDetonateTimer = BOMB_DETONATE_DURATION_SEC;
        this.state.bombActionPlayerId = '';
        this.state.bombActionType = '';
        this.state.bombActionProgress = 0;
        this.emitSystemChat(`${activeActor.name} planted the bomb at Site ${activeSiteId}!`);
      } else if (activeAction === 'defuse') {
        this.state.bombPhase = 'defused';
        this.state.bombActionPlayerId = '';
        this.state.bombActionType = '';
        this.state.bombActionProgress = 0;
        this.emitSystemChat(`${activeActor.name} defused the bomb!`);
        this.endServerBombRound('red', 'Bomb Defused');
      }
    }
  }

  private simulateTick(dt: number): void {
    if (this.state.phase !== 'playing') return;

    const mode = normalizeGameMode(this.state.mode, 'tdm');
    const now = Date.now();

    if (mode === 'bomb') {
      if (this.state.bombPhase === 'round_end') {
        this.state.roundTransitionTimer = Math.max(0, this.state.roundTransitionTimer - dt);
        if (this.state.roundTransitionTimer <= 0) {
          this.startNextServerBombRound(now);
        }
        return;
      }

      if (this.state.bombPhase === 'planted') {
        this.state.bombDetonateTimer = Math.max(0, this.state.bombDetonateTimer - dt);
        if (this.state.bombDetonateTimer <= 0) {
          this.state.bombPhase = 'detonated';
          this.endServerBombRound('blue', 'Bomb Detonated');
          return;
        }
      } else {
        this.state.timeRemaining = Math.max(0, this.state.timeRemaining - dt);
        if (this.state.timeRemaining <= 0) {
          this.endServerBombRound('red', 'Round Time Expired');
          return;
        }
      }

      this.stepServerBombInteraction(dt);
    } else {
      this.state.timeRemaining = Math.max(0, this.state.timeRemaining - dt);
      if (this.state.timeRemaining <= 0) {
        if (mode === 'ffa') {
          const all: PlayerSchemaType[] = [];
          this.state.players.forEach((p) => all.push(p));
          const sorted = sortFfaParticipants(all);
          const first = sorted[0];
          const second = sorted[1];
          if (!first || (second && first.kills === second.kills)) {
            this.state.winner = 'draw';
            this.state.winnerId = '';
            this.state.winnerName = '';
          } else {
            this.state.winnerId = first.id;
            this.state.winnerName = first.name;
            this.state.winner = first.team === 'red' ? 'red' : 'blue';
          }
        } else if (this.state.blueScore > this.state.redScore) {
          this.state.winner = 'blue';
        } else if (this.state.redScore > this.state.blueScore) {
          this.state.winner = 'red';
        } else {
          this.state.winner = 'draw';
        }
        this.state.phase = 'ended';
        return;
      }
    }

    this.state.players.forEach((p) => {
      if (!p.isAlive) {
        if (mode === 'bomb') return;
        p.respawnTimer = Math.max(0, p.respawnTimer - dt);
        if (p.respawnTimer <= 0 && p.isBot) {
          this.respawnPlayer(p, now);
        }
      } else if (p.isBot) {
        this.simulateBot(p, dt);
      }
    });
  }

  private respawnPlayer(p: PlayerSchemaType, now: number): void {
    const spawn = this.pickTeamSpawn(p.team as 'blue' | 'red', p.id);
    p.x = spawn.x;
    p.y = spawn.y;
    p.z = spawn.z;
    p.rotY = p.team === 'blue' ? 0 : Math.PI;
    p.pitch = 0;
    p.health = 100;
    p.isAlive = true;
    p.respawnTimer = 0;
    p.stance = 'stand';
    this.spawnProtectionUntil.set(p.id, now + 1500);

    if (!p.isBot) {
      const queued = this.queuedGunByPlayer.get(p.id);
      if (queued && VALID_GUN_IDS.has(queued)) {
        this.equippedGunByPlayer.set(p.id, queued);
        this.queuedGunByPlayer.delete(p.id);
      }
      p.weaponId = this.resolvePlayerEquippedGun(p);
      const c = this.clients.find((cl) => cl.sessionId === p.id);
      c?.send('player_respawn', { x: p.x, y: p.y, z: p.z, rotY: p.rotY });
    }
  }

  private simulateBot(bot: PlayerSchemaType, dt: number): void {
    const mapId: ServerMapId = isValidMapId(this.state.mapId) ? this.state.mapId : 'urban';
    const layout = SERVER_MAP_LAYOUTS[mapId];
    const mode = normalizeGameMode(this.state.mode, 'tdm');
    let brain = this.botBrains.get(bot.id);
    if (!brain) {
      brain = {
        waypointIndex: Math.floor(Math.random() * layout.waypoints.length),
        fireCooldownMs: 600,
        yaw: bot.rotY,
      };
      this.botBrains.set(bot.id, brain);
    }

    // Look for nearest hostile living target within 26m
    let closestTarget: PlayerSchemaType | null = null;
    let closestDist = 26;
    this.state.players.forEach((other) => {
      if (!other.isAlive || !isHostile(mode, bot, other)) return;
      const d = Math.hypot(other.x - bot.x, other.z - bot.z);
      if (d < closestDist) {
        closestDist = d;
        closestTarget = other;
      }
    });

    if (closestTarget) {
      const target = closestTarget as PlayerSchemaType;
      const dx = target.x - bot.x;
      const dz = target.z - bot.z;
      bot.rotY = Math.atan2(dx, dz);

      // Gentle tactical strafe
      const rightX = Math.cos(bot.rotY);
      const rightZ = -Math.sin(bot.rotY);
      const strafeSpeed = Math.sin(Date.now() * 0.002 + bot.x) * 2.2;
      bot.x = clamp(bot.x + rightX * strafeSpeed * dt, -27, 27);
      bot.z = clamp(bot.z + rightZ * strafeSpeed * dt, -27, 27);

      brain.fireCooldownMs -= dt * 1000;
      if (brain.fireCooldownMs <= 0) {
        brain.fireCooldownMs = 420 + Math.random() * 320;
        const hitRoll = Math.random();
        const hit = hitRoll < 0.36;
        const zone = hitRoll < 0.06 ? 'head' : 'body';

        this.broadcast('remote_fire', {
          shooterId: bot.id,
          weaponId: bot.weaponId,
          muzzleX: bot.x,
          muzzleY: bot.y + 1.35,
          muzzleZ: bot.z,
          endX: target.x + (hit ? 0 : (Math.random() - 0.5) * 1.4),
          endY: target.y + 1.25 + (hit ? 0 : (Math.random() - 0.5) * 0.8),
          endZ: target.z + (hit ? 0 : (Math.random() - 0.5) * 1.4),
        });

        if (hit) {
          const isHeadZone = zone === 'head';
          const botEndX = target.x;
          const botEndY = target.y + (isHeadZone ? 1.70 : 1.25);
          const botEndZ = target.z;
          const botMuzzleX = bot.x;
          const botMuzzleY = bot.y + 1.35;
          const botMuzzleZ = bot.z;
          this.applyAuthoritativeHit(
            bot, target.id, bot.weaponId, zone,
            botEndX, botEndY, botEndZ,
            botMuzzleX, botMuzzleY, botMuzzleZ,
            true // isBotShooter
          );
        }
      }
      return;
    }

    // Bomb objective navigation when no enemy is engaged
    if (mode === 'bomb') {
      if (bot.team === 'blue' && this.state.bombPhase === 'unplanted' && this.state.bombCarrierId === bot.id) {
        const site = layout.bombSites[bot.id.charCodeAt(bot.id.length - 1) % layout.bombSites.length];
        const sdx = site.x - bot.x;
        const sdz = site.z - bot.z;
        const sdist = Math.hypot(sdx, sdz);
        if (sdist <= site.radius * 0.75) {
          if (!this.state.bombActionPlayerId || this.state.bombActionPlayerId === bot.id) {
            this.state.bombActionPlayerId = bot.id;
            this.state.bombActionType = 'plant';
            this.state.bombActionProgress = Math.min(1, this.state.bombActionProgress + dt / BOMB_PLANT_DURATION_SEC);
            if (this.state.bombActionProgress >= 1) {
              this.state.bombPhase = 'planted';
              this.state.bombSite = site.id;
              this.state.bombCarrierId = '';
              this.state.bombX = bot.x;
              this.state.bombY = site.y;
              this.state.bombZ = bot.z;
              this.state.bombDetonateTimer = BOMB_DETONATE_DURATION_SEC;
              this.state.bombActionPlayerId = '';
              this.state.bombActionType = '';
              this.state.bombActionProgress = 0;
              this.emitSystemChat(`${bot.name} planted the bomb at Site ${site.id}!`);
            }
          }
          return;
        }
        bot.rotY = Math.atan2(sdx, sdz);
        bot.x = clamp(bot.x + (sdx / sdist) * 4.4 * dt, -27.5, 27.5);
        bot.z = clamp(bot.z + (sdz / sdist) * 4.4 * dt, -27.5, 27.5);
        return;
      }

      if (bot.team === 'red' && this.state.bombPhase === 'planted') {
        const bdx = this.state.bombX - bot.x;
        const bdz = this.state.bombZ - bot.z;
        const bdist = Math.hypot(bdx, bdz);
        if (bdist <= BOMB_SITE_RADIUS * 0.75) {
          if (!this.state.bombActionPlayerId || this.state.bombActionPlayerId === bot.id) {
            this.state.bombActionPlayerId = bot.id;
            this.state.bombActionType = 'defuse';
            this.state.bombActionProgress = Math.min(1, this.state.bombActionProgress + dt / BOMB_DEFUSE_DURATION_SEC);
            if (this.state.bombActionProgress >= 1) {
              this.state.bombPhase = 'defused';
              this.state.bombActionPlayerId = '';
              this.state.bombActionType = '';
              this.state.bombActionProgress = 0;
              this.emitSystemChat(`${bot.name} defused the bomb!`);
              this.endServerBombRound('red', 'Bomb Defused');
            }
          }
          return;
        }
        bot.rotY = Math.atan2(bdx, bdz);
        bot.x = clamp(bot.x + (bdx / bdist) * 4.4 * dt, -27.5, 27.5);
        bot.z = clamp(bot.z + (bdz / bdist) * 4.4 * dt, -27.5, 27.5);
        return;
      }
    }

    // Patrol waypoints
    const wp = layout.waypoints[brain.waypointIndex % layout.waypoints.length];
    const dx = wp.x - bot.x;
    const dz = wp.z - bot.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.2) {
      brain.waypointIndex = Math.floor(Math.random() * layout.waypoints.length);
      return;
    }

    const speed = 4.4;
    bot.rotY = Math.atan2(dx, dz);
    bot.x = clamp(bot.x + (dx / dist) * speed * dt, -27.5, 27.5);
    bot.z = clamp(bot.z + (dz / dist) * speed * dt, -27.5, 27.5);
  }

  private syncBotSlots(): void {
    // Remove existing bots
    const toRemove: string[] = [];
    this.state.players.forEach((p, key) => {
      if (p.isBot) toRemove.push(key);
    });
    for (const id of toRemove) {
      this.state.players.delete(id);
      this.botBrains.delete(id);
    }

    const blueBotNames = ['Vanguard-1', 'Ghost-2', 'Echo-3', 'Specter-4', 'Nomad-5'];
    const redBotNames = ['Viper-1', 'Reaper-2', 'Kodiak-3', 'Shadow-4', 'Talon-5'];
    let blueIdx = 0;
    let redIdx = 0;

    for (let i = 0; i < this.state.botCount; i++) {
      const team: 'blue' | 'red' = i % 2 === 0 ? 'red' : 'blue';
      const id = `bot_${team}_${i + 1}`;
      const bot = new PlayerSchema();
      bot.id = id;
      bot.name =
        team === 'blue'
          ? blueBotNames[blueIdx++ % blueBotNames.length]
          : redBotNames[redIdx++ % redBotNames.length];
      bot.team = team;
      bot.isBot = true;
      bot.isHost = false;
      bot.ready = true;
      bot.isAlive = true;
      bot.respawnTimer = 0;
      const botWeapons = ['ak47', 'smg', 'shotgun', 'sniper'];
      bot.weaponId = botWeapons[i % botWeapons.length];
      bot.characterId = getBotCharacterForWeapon(bot.weaponId);
      bot.stance = 'stand';
      bot.health = 100;
      bot.kills = 0;
      bot.deaths = 0;

      const spawn = this.pickTeamSpawn(team, id);
      bot.x = spawn.x;
      bot.y = spawn.y;
      bot.z = spawn.z;
      bot.rotY = team === 'blue' ? 0 : Math.PI;
      bot.pitch = 0;

      this.state.players.set(id, bot);
    }
  }

  private pickBalancedTeam(): 'blue' | 'red' {
    let blueHumans = 0;
    let redHumans = 0;
    this.state.players.forEach((p) => {
      if (!p.isBot) {
        if (p.team === 'blue') blueHumans++;
        else redHumans++;
      }
    });
    return blueHumans <= redHumans ? 'blue' : 'red';
  }

  private pickTeamSpawn(team: 'blue' | 'red', forPlayerId?: string): Vec3Tuple {
    const mapId: ServerMapId = isValidMapId(this.state.mapId) ? this.state.mapId : 'urban';
    const layout = SERVER_MAP_LAYOUTS[mapId];
    const mode = normalizeGameMode(this.state.mode, 'tdm');
    const spawns =
      mode === 'ffa'
        ? [...layout.blueSpawns, ...layout.redSpawns]
        : team === 'blue'
          ? layout.blueSpawns
          : layout.redSpawns;

    if (mode === 'ffa') {
      const activeEnemies: PlayerSchemaType[] = [];
      this.state.players.forEach((p) => {
        if (p.isAlive && p.id !== forPlayerId) {
          activeEnemies.push(p);
        }
      });
      if (activeEnemies.length > 0) {
        let bestSpawn = spawns[0];
        let bestMinDist = -1;
        for (const s of spawns) {
          let minDist = Infinity;
          for (const e of activeEnemies) {
            const d = (s.x - e.x) ** 2 + (s.z - e.z) ** 2;
            if (d < minDist) minDist = d;
          }
          if (minDist > bestMinDist) {
            bestMinDist = minDist;
            bestSpawn = s;
          }
        }
        return bestSpawn;
      }
    }

    return spawns[Math.floor(Math.random() * spawns.length)];
  }
}
