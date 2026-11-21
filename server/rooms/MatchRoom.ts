import { type Client, Room, ServerError } from '@colyseus/core';
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

export interface CreateRoomOptions {
  playerName?: string;
  roomName?: string;
  mapId?: string;
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
  phase: string;
  playerCount: number;
  maxPlayers: number;
  hasPassword: boolean;
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
  private equippedGunByPlayer = new Map<string, string>();
  private queuedGunByPlayer = new Map<string, string>();
  private botBrains = new Map<string, BotBrain>();
  private killFeedSeq = 0;

  public onCreate(options: CreateRoomOptions = {}): void {
    const code = generateUniqueRoomCode();
    this.roomId = code;
    ACTIVE_ROOMS.set(code, this);

    const state = new MatchState();
    state.roomCode = code;
    state.roomName = sanitizeName(options.roomName, `${code} Tactical Room`);
    state.mapId = isValidMapId(String(options.mapId)) ? String(options.mapId) : 'urban';
    state.phase = 'lobby';
    state.killLimit = clamp(Number(options.killLimit) || 30, 5, 100);
    state.timeLimit = clamp(Number(options.timeLimit) || 300, 60, 1200);
    state.timeRemaining = state.timeLimit;
    state.respawnDelay = clamp(Number(options.respawnDelay) || 3, 1, 10);
    state.friendlyFire = Boolean(options.friendlyFire);
    state.botCount = clamp(Number(options.botCount ?? 4), 0, 10);

    const pwd = typeof options.password === 'string' ? options.password.trim() : '';
    this.roomPassword = pwd;
    state.hasPassword = pwd.length > 0;
    state.hostId = '';
    state.blueScore = 0;
    state.redScore = 0;
    state.winner = '';

    this.setState(state);
    this.syncBotSlots();
    this.registerMessageHandlers();

    // 20Hz authoritative simulation loop
    this.setSimulationInterval((deltaMs) => {
      this.simulateTick(deltaMs / 1000);
    }, 50);
  }

  public getPublicSummary(): PublicRoomSummary {
    return {
      roomCode: this.state.roomCode,
      roomName: this.state.roomName,
      mapId: this.state.mapId,
      phase: this.state.phase,
      playerCount: this.clients.length,
      maxPlayers: this.maxClients,
      hasPassword: this.state.hasPassword,
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
  }

  public onLeave(client: Client): void {
    const leaving = this.state.players.get(client.sessionId);
    if (leaving) {
      this.state.players.delete(client.sessionId);
    }
    this.spawnProtectionUntil.delete(client.sessionId);
    this.lastShotAt.delete(client.sessionId);
    this.equippedGunByPlayer.delete(client.sessionId);
    this.queuedGunByPlayer.delete(client.sessionId);

    // Host migration if host disconnected
    if (this.state.hostId === client.sessionId) {
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
      } else {
        this.state.hostId = '';
      }
    }
  }

  public onDispose(): void {
    ACTIVE_ROOMS.delete(this.state?.roomCode || this.roomId);
    this.botBrains.clear();
    this.spawnProtectionUntil.clear();
    this.lastShotAt.clear();
    this.equippedGunByPlayer.clear();
    this.queuedGunByPlayer.clear();
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
    this.onMessage('switch_team', (client) => {
      if (this.state.phase !== 'lobby') return;
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.team = p.team === 'blue' ? 'red' : 'blue';
      if (!p.isHost) {
        p.ready = false;
      }
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
      if (payload.killLimit !== undefined) {
        this.state.killLimit = clamp(Number(payload.killLimit) || 30, 5, 100);
      }
      if (payload.timeLimit !== undefined) {
        this.state.timeLimit = clamp(Number(payload.timeLimit) || 300, 60, 1200);
        this.state.timeRemaining = this.state.timeLimit;
      }
      if (payload.respawnDelay !== undefined) {
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
        const now = Date.now();
        const prevShot = this.lastShotAt.get(shooter.id) ?? 0;
        if (now - prevShot < weapon.minFireIntervalMs * 0.72) {
          return;
        }
        this.lastShotAt.set(shooter.id, now);

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
  }

  private startMatch(): void {
    this.state.blueScore = 0;
    this.state.redScore = 0;
    this.state.winner = '';
    this.state.timeRemaining = this.state.timeLimit;
    this.state.phase = 'playing';

    this.spawnProtectionUntil.clear();
    this.lastShotAt.clear();

    const now = Date.now();
    this.state.players.forEach((p) => {
      p.kills = 0;
      p.deaths = 0;
      p.health = 100;
      p.isAlive = true;
      p.respawnTimer = 0;

      if (!p.isBot) {
        const queued = this.queuedGunByPlayer.get(p.id);
        if (queued && VALID_GUN_IDS.has(queued)) {
          this.equippedGunByPlayer.set(p.id, queued);
          this.queuedGunByPlayer.delete(p.id);
        }
        p.weaponId = this.resolvePlayerEquippedGun(p);
      }

      const spawn = this.pickTeamSpawn(p.team as 'blue' | 'red');
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
  }

  private resetToLobby(): void {
    this.state.phase = 'lobby';
    this.state.blueScore = 0;
    this.state.redScore = 0;
    this.state.winner = '';
    this.state.timeRemaining = this.state.timeLimit;
    this.state.players.forEach((p) => {
      p.kills = 0;
      p.deaths = 0;
      p.health = 100;
      p.isAlive = true;
      p.respawnTimer = 0;
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
        spawnProtectionUntil: protUntil,
        currentTime: now,
        // Wire server-held orientation for VULN-2 / VULN-5 checks
        shooterRotY:  shooter.rotY,
        shooterPitch: shooter.pitch,
        // Wire mapId for VULN-1 occlusion check
        mapId,
        // Bot shooters use server-computed coordinates — skip client-coord checks
        isBotShooter,
      }
    );

    if (!validation.accepted) return;

    const { verifiedZone, damage, isHeadshot, weapon } = validation;
    const sameTeam = target.team === shooter.team;
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
      target.respawnTimer = this.state.respawnDelay;
      target.deaths += 1;

      if (!sameTeam) {
        shooter.kills += 1;
        if (shooter.team === 'blue') {
          this.state.blueScore += 1;
        } else {
          this.state.redScore += 1;
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

      if (this.state.blueScore >= this.state.killLimit) {
        this.state.winner = 'blue';
        this.state.phase = 'ended';
      } else if (this.state.redScore >= this.state.killLimit) {
        this.state.winner = 'red';
        this.state.phase = 'ended';
      }
    }
  }

  private simulateTick(dt: number): void {
    if (this.state.phase !== 'playing') return;

    this.state.timeRemaining = Math.max(0, this.state.timeRemaining - dt);
    if (this.state.timeRemaining <= 0) {
      if (this.state.blueScore > this.state.redScore) {
        this.state.winner = 'blue';
      } else if (this.state.redScore > this.state.blueScore) {
        this.state.winner = 'red';
      } else {
        this.state.winner = 'draw';
      }
      this.state.phase = 'ended';
      return;
    }

    const now = Date.now();
    this.state.players.forEach((p) => {
      if (!p.isAlive) {
        p.respawnTimer = Math.max(0, p.respawnTimer - dt);
        if (p.respawnTimer <= 0) {
          this.respawnPlayer(p, now);
        }
      } else if (p.isBot) {
        this.simulateBot(p, dt);
      }
    });
  }

  private respawnPlayer(p: PlayerSchemaType, now: number): void {
    const spawn = this.pickTeamSpawn(p.team as 'blue' | 'red');
    p.x = spawn.x;
    p.y = spawn.y;
    p.z = spawn.z;
    p.rotY = p.team === 'blue' ? 0 : Math.PI;
    p.pitch = 0;
    p.health = 100;
    p.isAlive = true;
    p.respawnTimer = 0;
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
    let brain = this.botBrains.get(bot.id);
    if (!brain) {
      brain = {
        waypointIndex: Math.floor(Math.random() * layout.waypoints.length),
        fireCooldownMs: 600,
        yaw: bot.rotY,
      };
      this.botBrains.set(bot.id, brain);
    }

    // Look for nearest opposing living target within 26m
    let closestTarget: PlayerSchemaType | null = null;
    let closestDist = 26;
    this.state.players.forEach((other) => {
      if (!other.isAlive || other.team === bot.team || other.id === bot.id) return;
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
          // VULN-4: Bot hits previously passed no end-coordinates, causing coordinate
          // validation to reject every bot shot. The server now supplies authoritative
          // target coordinates (body-centre or head-centre based on zone probability).
          // isBotShooter=true skips client-coord checks that do not apply to server bots.
          const isHeadZone = zone === 'head';
          const botEndX = target.x;
          const botEndY = target.y + (isHeadZone ? 1.70 : 1.25);
          const botEndZ = target.z;
          const botMuzzleX = bot.x;
          const botMuzzleY = bot.y + 1.35; // bot eye height (server constant)
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
      bot.health = 100;
      bot.kills = 0;
      bot.deaths = 0;

      const spawn = this.pickTeamSpawn(team);
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

  private pickTeamSpawn(team: 'blue' | 'red'): Vec3Tuple {
    const mapId: ServerMapId = isValidMapId(this.state.mapId) ? this.state.mapId : 'urban';
    const layout = SERVER_MAP_LAYOUTS[mapId];
    const spawns = team === 'blue' ? layout.blueSpawns : layout.redSpawns;
    return spawns[Math.floor(Math.random() * spawns.length)];
  }
}
